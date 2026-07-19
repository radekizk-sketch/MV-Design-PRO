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
5. **Rzeczywisty zakres oddziaływania (ustalenie z code review #1):** F1 zapełnia
   `graph.inverter_sources`/`*_machine_sources` w `map_enm_to_network_graph`
   bezwarunkowo, więc czytają je NIE tylko solver SC, ale też wtórni konsumenci
   grafu: `solver_input/builder.py`, `validation/validator.py`,
   `catalog/readiness_checker.py`, `network_model/sld_projection.py`,
   `core/snapshot.py` (serializacja+fingerprint), `diagnostics/rules.py`.
   Zweryfikowano, że ścieżka kanoniczna pozostaje bezpieczna: PF nie czyta tych
   kolekcji; kanoniczny `enm_hash` liczony z ENM snapshotu (nie z grafu);
   `sld_projection` nie jest wołany grafem z `map_enm` w biegu kanonicznym.
   Wszyscy konsumenci obsługują źródła poprawnie (pisani dla grafów substratu,
   które je mają) — zmiana jest pożądana (konwerter widoczny w walidacji/
   diagnostyce), a pełna regresja 6321/0 jest zielona. Test twardnienia:
   `test_converter_graph_snapshot_is_deterministic` (serializacja + determinizm
   fingerprintu dla sieci z konwerterem).

**Pomiar churnu (do wykonania w F1):** kandydaci — `tests/test_canonical_analysis_api.py`,
`tests/enm/test_canonical_analysis_draft_isolation.py`, `tests/test_fault_scenarios_run_integration.py`,
`tests/test_canonical_operations_registry.py` + golden ENM z generatorami.

---

## 5. Plan fazowy + DoD

### F1 — Most mapowania ✅ WDROŻONE (V12K-054, commit G-SCM F1)
Zrealizowane: `_add_generator_sc_sources` w `enm/mapping.py` buduje źródła SC z
`enm.generators` wg `gen_type`; solver/ybus/analiza już je konsumują (I″k całkowity
zawiera teraz wkład DER/maszyn). Testy `TestGeneratorShortCircuitSources` (6, realna
ścieżka ENM→graf→SC). Pełna regresja backendu **6321 passed / 0 failed** — determinizm
golden zachowany (brak sieci golden z generatorami zależnych od wyniku SC; sieci
maszynowo-wolne bajt-identyczne). Szczegóły recon poniżej.

Empiryczne ustalenie recon (weryfikacja przed implementacją): model `Generator.gen_type`
akceptuje `synchronous`, `pv_inverter`, `wind_inverter`, `fw_pmsg`, `fw_dfig`, `fw_scig`,
`bess` (`enm/models.py:388`). **`GENSET`/`UPS` (wielkie litery — tak zapisuje
`add_genset_nn`/`add_ups_nn`) są ODRZUCANE przez model** → gensety/UPS dziś w ogóle nie
przechodzą `EnergyNetworkModel.model_validate` w kanonicznym biegu (osobny, wcześniejszy
defekt normalizacji `gen_type` → F-follow). `Generator` nie ma pola `in_service`
(wszystkie generatory listy traktowane jako czynne — tak jak już robi mapa dla P/Q).

- `map_enm_to_network_graph`: dla `enm.generators` (sort po ref_id) rozgałęź po `gen_type`:
  - `pv_inverter` → `InverterSource(ConverterKind.PV)`; `bess` → `InverterSource(BESS)`;
    `wind_inverter`/`fw_pmsg` → `InverterSource(WIND)` (pełny przekształtnik §6.7,
    `in_rated_a = S_tot/(√3·U_n)`, `k_sc` domyślne 1.1) + `graph.add_inverter_source`.
  - `synchronous` → `SynchronousMachineSource(sr_mva, ur_kv, x″d domyślne)` (§6.3).
  - `fw_dfig` → `AsynchronousMachineSource(wind_type_3=True)`; `fw_scig` →
    `AsynchronousMachineSource` (§6.7).
- Zero fabrykacji: źródło powstaje TYLKO gdy jest realna tabliczka (moc znamionowa +
  napięcie); brak → pomiń (nie zmyślamy źródła). `S_tot = sn_mva·quantity` (materialized
  per-unit × liczba równoległych) albo |p_mw| jako proxy S. Deterministyczne id = ref_id.
- Testy: jednostkowe mapy (PV/BESS/FW→inverter z I_k=k_sc·I_n; synchronous→sync source z
  Z″; brak generatorów→graf bez źródeł SC = determinizm), integracyjny kanoniczny SC
  (I″k z OZE > I″k bez).
- Pomiar + aktualizacja golden/testów kanonicznych z intencją.
- Bramki: pełna regresja backendu, ruff/black/mypy, guardy solver/determinizm.

### F2 — Pakiet dowodowy SC3F + endpoint (WDROŻONE, decyzja właściciela: Opcja A)
**Status: WDROŻONE.** Zbudowano `packs/sc_symmetrical.py::SC3FProofPack` (+ endpoint
`POST /api/proof/sc3f/pack`) — pierwszy pakiet dowodowy zwarcia trójfazowego (domyka
lukę: 3F, najczęstsze, nie miało pakietu). Pakiet liczy fizykę SERWEROWO z kanonicznego
snapshotu ENM (`map_enm_to_network_graph` → `compute_3ph_short_circuit` →
`compute_machine_contributions`), wpina osierocone `generate_sc3f_proof` w produkcję.
Rozbicie per-maszyna (μ/q/i_b, §6.6) dołączane WYŁĄCZNIE dla maszyn wirujących
(synchronous/fw_dfig/fw_scig); konwertery (InverterSource) zasilają całkowite I″k (F1),
ale nie sekcję μ/q (nie są maszynami wirującymi — poprawne wg §6.6). Brak maszyn → dowód
bez sekcji maszynowej (determinizm). Testy: `test_sc3f_pack` (4) + `test_proof_pack_api`
(SC3F endpoint). ZERO fizyki w UI (snapshot→proof serwerowo).

Uwaga: rozbicie μ/q aktywuje się realnie dopiero gdy w ENM są maszyny wirujące — dziś
kreatory dają tylko konwertery (InverterSource); agregaty (synchronous) po F-follow
(normalizacja gen_type GENSET→synchronous). Pakiet SC3F jest jednak żywy i użyteczny dla
KAŻDEJ sieci (dowód Z_th/I″k/κ/i_p/I_dyn/I_th/S_k, z wkładem DER w I″k z F1).

#### Kontekst pierwotny (recon):
Recon konsumentów (weryfikacja przed budową): rozbicie per-maszyna **nie ma dziś
konsumenta prezentacji** — brak w `frontend/` i w przeglądarce wyników kanonicznych;
ścieżka `analysis_run/service.py:360` zapisuje `short_circuit_machine_contribution`, ale
NIC go nie wyświetla. **Jest za to realny konsument w proof:** `proof_generator.py:628-656`
generuje kroki SC3F μ/q/i_b z `ProofGeneratorData.machine_result` (`MachineShortCircuitResult`).
Wniosek: sam „artefakt w wyniku" byłby WYSPĄ (zakaz właściciela). F2 = doprowadzić
`machine_result` do **proof kanonicznego** (SC3F krok maszynowy) + ewentualnie sekcja
w przeglądarce wyników — dopiero z konsumentem.
- `_execute_short_circuit` / kanoniczna generacja proof: policz `compute_machine_contributions`
  (solver, orkiestracja) i przekaż `machine_result` do `ProofGeneratorData` SC3F; gdy brak
  maszyn → `None` (bez zmiany proof — determinizm).
- Testy: kanoniczny proof SC3F z OZE/agregatem → kroki i_b maszynowe obecne; sieć bez
  maszyn → proof bajt-identyczny.
- **Uwaga (F1 już wystarcza dla bezpieczeństwa):** całkowity I″k (z wkładem DER) jest już
  poprawny po F1 i konsumowany wszędzie (wynik, proof zwarciowy, dobór aparatury). F2 to
  pogłębienie (rozbicie per-maszyna), nie korekta liczby głównej.

### F3 — Warstwa downstream w kreatorach (do ostatniego klika)
- `KreatorZrodlaOze` (G-OZE-UI) i kreator agregatu: sekcja „Co to uruchamia" wymienia
  wpływ na zwarcie (I″k, dobór aparatury). Zero fizyki w UI — tekst kierunkowy.

### F-follow (dług jawny, wymaga danych/decyzji — nie blokuje F1/F2)
- **Normalizacja gen_type GENSET/UPS (defekt walidacji) — WDROŻONE (V12K-055, F-follow-1):**
  `add_genset_nn`/`add_ups_nn` zapisywały `gen_type="GENSET"`/`"UPS"`, które model
  `Generator` ODRZUCAŁ → agregat/UPS nie przechodziły walidacji ENM. Naprawa: agregat →
  `gen_type="synchronous"` + tabliczka `materialized_params` (sn_mva=P/cosφ, un_kv, cos_phi;
  x″d = domyślne IEC modelu); UPS → `gen_type="bess"` (falownik, InverterSource §6.7 —
  fizycznie poprawne dla double-conversion UPS), tożsamość w `name`+`meta.source_kind`.
  F1 automatycznie obejmuje teraz agregaty (SynchronousMachineSource) i UPS (InverterSource);
  F2 dołącza rozbicie μ/q/i_b dla agregatów. Test realnej ścieżki: `test_genset_ups_sc`
  (operacja → walidacja ENM → graf → źródło SC). Pozostaje: katalog x″d/k_sc (niżej),
  dedykowana klasyfikacja UPS w raportach (jeśli właściciel zechce inną semantykę).
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

## 6a. Ustalenia uboczne (Zero-Debt „nigdy cicho")

- **`solver_diff_guard` czerwony na HEAD (pre-existing, nie-CI, nie z G-SCM):**
  `network_model/solvers/power_flow_newton_internal.py` ma nieaktualny hash odniesienia
  w guardzie (legalna zmiana z wątku OLTC F2 — pętla LF OLTC, zadanie zamknięte —
  nie odświeżyła baseline). Guard NIE jest wpięty w żaden workflow CI (dormant),
  więc nie bramkuje. Odświeżenie baseline należy do właściciela zmiany solvera
  (wątek OLTC/10x), nie do G-SCM. Zweryfikowane: identyczny FAIL na czystym HEAD po
  odłożeniu zmian G-SCM. `trace_determinism_guard` w środowisku poetry = PASS.

## 7. Powiązania

- Nadrzędny blueprint: `docs/uiux/BLUEPRINT_PROJEKTANT_SIECI_MAX_2026-07.md` (§2 macierz —
  łańcuch DER: „machine SC / inverter PF"); G-OZE-PF (V12K-052) domknął regulację PF OZE,
  G-SCM domyka wkład **zwarciowy** OZE/gensetów.
- Rejestr: `docs/v12xx/REJESTR_KONFLIKTOW.md` V12K-054.
- Precedens metody (audyt→plan→wdrożenie fazowe): OLTC F0, G-OZE (V12K-051).
