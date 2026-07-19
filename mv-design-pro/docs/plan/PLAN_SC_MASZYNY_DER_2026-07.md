# AUDYT + PLAN: Wkład zwarciowy maszyn wirujących i źródeł DER w kanonicznym biegu (G-SCM)

**Status:** BINDING (audyt ekspercki + architektura fazowa; dyrektywa właściciela
2026-07-19: „kontynuuj zgodnie bez zatrzymywania" + Zero-Debt: każdy wykryty defekt
naprawiasz end-to-end; phantom rule w obie strony: realna zdolność backendu bez punktu
wejścia to defekt).
**Rejestr:** V12K-054.
**Zakres:** most `enm/mapping.py` → graf zwarciowy; wkład zwarciowy `enm.generators`
(gensety §6.3, OZE falownikowe §6.7, w przyszłości silniki/DFIG) w **kanonicznym**
biegu zwarciowym (`enm/canonical_analysis.py::_execute_short_circuit`). Bez zmiany
FROZEN Result API (zmiana dotyczy WEJŚCIA solvera, nie kontraktu wyniku).

---

## 0. Streszczenie znaleziska (forward-phantom, bezpieczeństwo)

**Defekt:** kanoniczny bieg zwarciowy dla sieci budowanej przez inżyniera **nie
uwzględnia żadnego wkładu prądu zwarciowego** od źródeł zapisanych w `enm.generators`
(agregaty prądotwórcze, PV, BESS, farmy wiatrowe, UPS). Prąd zwarciowy jest zaniżony
o cały udział maszynowy/DER — to błąd **istotny dla bezpieczeństwa** (dobór aparatury
na zaniżony I″k / ip / Ith).

**Przyczyna (jednozdaniowo):** `map_enm_to_network_graph` (ścieżka KAŻDEJ sieci
użytkownika) **nie buduje** źródeł zwarciowych z `enm.generators` — generatory trafiają
wyłącznie jako wstrzyknięcie P/Q do rozpływu mocy, nigdy jako źródła zwarciowe grafu.

**Kluczowa obserwacja:** cały łańcuch zwarciowy maszyn/DER **już istnieje i jest
przetestowany** — brakuje wyłącznie jednego ogniwa (mostu mapowania). To klasyczny
forward-phantom: zdolność backendu bez wpięcia w kanoniczny przepływ.

---

## 1. Dowód (grounded, plik:linia)

| # | Fakt | Dowód |
|---|------|-------|
| 1 | Konwertery (PV/BESS/FW), gensety, UPS materializują się do `enm.generators` | `enm/domain_operations_v2.py:2511` (converter), `:2604` (genset), `:2641` (ups) |
| 2 | `gen_type`: PV=`pv_inverter`, BESS=`bess`, FW=`wind_inverter`, agregat=`GENSET`, UPS=`UPS` | `domain_operations_v2.py:2091/2127/2152` + `:2604/:2641` |
| 3 | Mapowanie ENM→graf wpina `enm.generators` **tylko** w P/Q szyny (rozpływ) | `enm/mapping.py:241-243` |
| 4 | Mapowanie ENM→graf buduje źródła zwarciowe **tylko** z `enm.sources` (sieć zewn.) | `enm/mapping.py:379-439` |
| 5 | Mapowanie ENM→graf **nie ma ani jednego** odwołania do maszyn/falowników | `grep machine\|inverter src/enm/mapping.py` → 0 trafień |
| 6 | Kanoniczny SC liczy tylko `ShortCircuitIEC60909Solver` na tym grafie | `enm/canonical_analysis.py:878-908` |
| 7 | Solver **już** czyta wkład falownikowy z grafu: `ik_total = ikss_thevenin + ik_inverters` | `solvers/short_circuit_iec60909.py:221`, `_compute_inverter_contribution` `:462-475` |
| 8 | Y-bus **już** dodaje bocznik maszyny wirującej Y″=1/Z″ (SC-only) | `core/ybus.py:132-136`, `_add_machine_shunts:157-168` |
| 9 | Bocznik maszyny czytany z `graph.get_synchronous/asynchronous_machine_sources()` | `core/ybus.py:163-167` |
| 10 | Źródła maszynowe do grafu dodaje **wyłącznie** substrat sieci referencyjnych (nie ENM) | `grep add_*_machine_source src/` → tylko `core/graph.py` (definicje) + `reference_networks/station_archetype_substrate.py` |
| 11 | Modele źródeł istnieją: `SynchronousMachineSource` (§6.3), `AsynchronousMachineSource` (§6.7, DFIG), `InverterSource` (§6.7 prąd ograniczony) | `core/machine.py`, `core/inverter.py` |
| 12 | Warstwa analizy interpretuje wkład maszynowy (μ/q §6.6) — gotowa, READ-ONLY | `analysis/machine_short_circuit/contribution.py` |

**Wniosek:** ogniwa 7–12 (solver, ybus, akcesory grafu, modele, analiza) są kompletne.
Zerwane jest **jedno** ogniwo: mapa ENM→graf (fakt 3–5). Ścieżka
`application/analysis_run/service.py:360` liczy wkład maszynowy jako osobny artefakt,
ale to **inna, nie-kanoniczna** ścieżka i również korzysta z grafu bez maszyn dla
sieci ENM.

---

## 2. Model warstw łańcucha (co jest, czego brakuje)

| Warstwa | Artefakt | Stan |
|---------|----------|------|
| Kontrakt danych | `enm.generators[*]` (gen_type, p_mw, materialized_params, bus_ref) | ✅ jest |
| Katalog | konwertery: `sn_mva`/`un_kv` w `materialized_params`; genset/UPS: **brak wiązania katalogowego** (tylko `rated_power_kw`) | ⚠️ częściowo |
| Operacja domenowa | `add_converter_source`, `add_genset_nn`, `add_ups_nn` | ✅ jest |
| **Most ENM→graf** | `map_enm_to_network_graph` buduje `Synchronous/Asynchronous/InverterSource` | ❌ **BRAK — sedno G-SCM** |
| Y-bus / solver | bocznik maszyny + superpozycja prądu falownika | ✅ jest |
| Analiza | `interpret_machine_contributions` (§6.6 μ/q, small-motor) | ✅ jest (nie wpięta w kanoniczny wynik) |
| Proof/raport | proof maszynowy | ✅ istnieje (`proof_engine`) |

---

## 3. Podstawa normatywna i model danych (IEC 60909-0:2016)

| Źródło | gen_type | Model SC | Wymagane dane | Dostępność |
|--------|----------|----------|---------------|------------|
| Agregat prądotwórczy | `GENSET` | `SynchronousMachineSource` §6.3 (źródło za Z″_G = K_G·(R_G+jX″d)) | sr_mva, ur_kv, x″d, cosφ_r | p_mw jest; **sr_mva=P/cosφ**, ur_kv=napięcie szyny, x″d/cosφ = domyślne IEC modelu (0.15 / 0.8) — docelowo katalog |
| PV / BESS / FW (Typ 4) | `pv_inverter` / `bess` / `wind_inverter` | `InverterSource` §6.7 (ograniczone źródło prądowe I_k=k_sc·I_n) | in_rated_a, k_sc | sn_mva+un_kv w materialized_params → **I_n policzalne**; k_sc = domyślne 1.1 (IEC-typowe pełnego przekształtnika) |
| Farma wiatrowa Typ 3 (DFIG) | (dziś `wind_inverter`) | `AsynchronousMachineSource(wind_type_3=True)` §6.7 (crowbar → maszyna asynchr.) | pr_mw, ur_kv, i_lr_ratio, pole_pairs | rozróżnienie Typ 3/4 nie jest dziś utrwalane — patrz F-follow |
| UPS | `UPS` | `InverterSource` (konserwatywnie) albo pominięcie (double-conversion) | in_rated_a, k_sc | p_mw jest; decyzja modelowa — patrz F-follow |
| Silniki asynchr. (odbiory) | — (są `loads`) | `AsynchronousMachineSource` §6.7 | pr_mw, i_lr_ratio | brak typu „silnik" w modelu odbioru — poza zakresem F1 |

**Zero fabrykacji:** wartości domyślne (x″d=0.15, cosφ=0.8, k_sc=1.1) są **domyślnymi
IEC-typowymi zaszytymi w modelach domenowych** (`core/machine.py:51/52`,
`core/inverter.py:26`), WHITE BOX i audytowalne — ten sam wzorzec, co domyślne
`rx_ratio=0.1` istniejące już w mapie źródeł (`mapping.py:406`). To NIE jest fizyka w
UI ani zmyślona liczba: wynik pochodzi z solvera/modelu domenowego z jawną podstawą
normatywną. Docelowo (opcja-max, katalog-first) parametry x″d/k_sc dostarcza katalog
producenta — ujęte w F-follow, nie blokuje F1.

---

## 4. Determinizm i granice FROZEN

1. **Sieci bez generatorów:** Y-bus bez zmian (bocznik maszyn to no-op —
   `ybus.py:161`, potwierdzone). Wkład falownikowy = 0 gdy `graph.get_inverter_sources()`
   puste. → wynik **bajt-w-bajt** jak dotąd.
2. **Sieci z generatorami (przez kanoniczny SC):** wynik **zmieni się** (I″k rośnie —
   poprawnie). To zmiana KANONU liczbowego u źródła defektu, nie regresja: golden/testy
   przepisujemy do nowej prawdy z zachowaniem intencji (Zero-Debt §2), z pomiarem.
3. **FROZEN Result API nietknięty:** zmieniamy WEJŚCIE solvera (graf), nie schemat
   `ShortCircuitResult`. Pola wyniku (`ik_inverters_a` itd.) już istnieją.
4. **PF nietknięty:** bocznik maszyn wpinany wyłącznie w kontekście SC
   (`ground_slack_buses=True`, `ybus.py:130-136`) — rozpływ mocy bez zmian.

**Pomiar churnu (do wykonania w F1):** kandydaci — `tests/test_canonical_analysis_api.py`,
`tests/enm/test_canonical_analysis_draft_isolation.py`, `tests/test_fault_scenarios_run_integration.py`,
`tests/test_canonical_operations_registry.py` + golden ENM z generatorami.

---

## 5. Plan fazowy + DoD

### F1 — Most mapowania (sedno, autonomiczne, bez decyzji produktowej)
- `map_enm_to_network_graph`: dla `enm.generators` (in_service) rozgałęź po `gen_type`:
  - `pv_inverter`/`bess`/`wind_inverter` → `InverterSource(in_rated_a z sn_mva/un_kv, k_sc domyślne)` + `graph.add_inverter_source`.
  - `GENSET` → `SynchronousMachineSource(sr_mva=P/cosφ, ur_kv=napięcie szyny, x″d domyślne)` + `graph.add_synchronous_machine_source`.
  - `UPS` → F-follow (pominięcie z jawnym komentarzem w F1, żeby nie zmyślać modelu).
- Deterministyczna kolejność (sort po ref_id), guard „brak danych → pomiń z logiem".
- Testy: jednostkowe mapy (genset→sync source z Z″; PV/BESS/FW→inverter z I_k=k_sc·I_n;
  brak generatorów→graf bez źródeł maszynowych = determinizm), integracyjny kanoniczny
  SC (I″k z generatorem > I″k bez).
- Pomiar + aktualizacja golden/testów kanonicznych z intencją.
- Bramki: pełna regresja backendu, ruff/black/mypy, guardy solver/determinizm.

### F2 — Wpięcie interpretacji maszynowej w kanoniczny wynik
- `_execute_short_circuit`: po policzeniu wiersza SC dołącz `interpret_machine_contributions`
  (osobny artefakt wyniku, jak w `analysis_run/service.py:360`), gdy `has_machines`.
- Testy: kanoniczny SC z genset/OZE → artefakt wkładu maszynowego obecny; sieć bez maszyn
  → brak artefaktu (determinizm).

### F3 — Warstwa downstream w kreatorach (do ostatniego klika)
- `KreatorZrodlaOze` (G-OZE-UI) i kreator agregatu: sekcja „Co to uruchamia" wymienia
  wpływ na zwarcie (I″k, dobór aparatury). Zero fizyki w UI — tekst kierunkowy.

### F-follow (dług jawny, wymaga danych/decyzji — nie blokuje F1/F2)
- **Katalog x″d/k_sc:** gensety bez wiązania katalogowego → rozbudowa katalogu agregatów
  (sr_mva, x″d, cosφ) i przekształtników (k_sc producenta) — opcja-max katalog-first.
- **DFIG Typ 3 vs Typ 4:** utrwalanie typu farmy w `add_converter_source` → wybór
  `AsynchronousMachineSource(wind_type_3)` vs `InverterSource`.
- **UPS:** decyzja modelowa (pominięcie vs InverterSource) — rozstrzygnięcie właściciela.
- **Silniki jako odbiory:** typ „silnik asynchroniczny" w modelu odbioru → wkład §6.7.

---

## 6. Audyt wielosoczewkowy — pytania i odpowiedzi (grounded)

| Soczewka | Pytanie | Odpowiedź |
|----------|---------|-----------|
| Zwarciowiec | Czy solver policzy wkład, jeśli źródła są w grafie? | TAK — `ik_total=ikss_thevenin+ik_inverters` (`short_circuit_iec60909.py:221`) + bocznik maszyn (`ybus.py:136`). Brak tylko wpięcia źródeł do grafu. |
| Projektant sieci | Czy dane wystarczą, by zbudować źródła bez zmyślania? | Konwertery: TAK (sn_mva+un_kv). Gensety: TAK z domyślnymi IEC modelu; docelowo katalog (F-follow). |
| Katalogi/Reference Engine | Czy trzeba rozbudować katalog na F1? | NIE — F1 działa na istniejących danych + domyślnych IEC. Katalog x″d/k_sc = F-follow (opcja-max). |
| Determinizm | Czy F1 zepsuje sieci bez OZE? | NIE — bocznik/superpozycja to no-op bez źródeł (`ybus.py:161`). Zmienią się tylko sieci z generatorami (poprawnie). |
| Normatywna | Czy model zgodny z IEC 60909-0:2016? | TAK — §6.3 (synchr. za Z″_GK), §6.7 (falownik = prąd ograniczony, DFIG crowbar), §6.6 (μ/q w analizie). |
| Bezpieczeństwo | Jaki skutek defektu? | Zaniżony I″k/ip/Ith → dobór aparatury na zbyt mały prąd zwarciowy. Priorytet wysoki. |
| UX/IA | Gdzie inżynier to zobaczy? | Wynik SC (I″k) + osobny artefakt wkładu maszynowego (F2) + sekcja downstream kreatora (F3). |

---

## 7. Powiązania

- Nadrzędny blueprint: `docs/uiux/BLUEPRINT_PROJEKTANT_SIECI_MAX_2026-07.md` (§2 macierz —
  łańcuch DER: „machine SC / inverter PF"); G-OZE-PF (V12K-052) domknął regulację PF OZE,
  G-SCM domyka wkład **zwarciowy** OZE/gensetów.
- Rejestr: `docs/v12xx/REJESTR_KONFLIKTOW.md` V12K-054.
- Precedens metody (audyt→plan→wdrożenie fazowe): OLTC F0, G-OZE (V12K-051).
