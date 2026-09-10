# KARTA AUDYTOWA — MAX DYNAMIC SIMULATION PROGRAM

**Typ dokumentu:** karta audytowa (AUDIT ONLY) — materiał decyzyjny, **nie** plan obowiązujący
**Status:** ZAMKNIĘTA (audyt kompletny)
**Data:** 2026-09-10
**Audytowany HEAD:** `7e84753adbc4b0e50de9a1fd4f1022f1cfd01903`
**Gałąź:** `claude/max-dynamic-audit-kzbivg`
**Autor audytu:** agent audytujący (rola: niezależny audytor, **nie** zarządca programu)
**Adresat:** Fable jako Lead Principal Engineer — właściciel decyzji architektonicznych

> **Granica tej karty.** Karta **nie zmienia** żadnego dokumentu kanonicznego, żadnego
> solvera, kontraktu, API ani UI. Nie tworzy i nie numeruje wycinków programu.
> Wszystkie propozycje wycinków w §34 są **NON-BINDING**. Znalezione defekty zostały
> **udokumentowane, nie naprawione** — świadomie, zgodnie z mandatem tej sesji.
> To jedyne odstępstwo od reguły ZERO DŁUGU w tym repo i wynika wprost ze zlecenia:
> decyzja o naprawie należy do Fable.

---

## 0. ERRATA — sprostowanie do własnego audytu (2026-09-10, po zamknięciu karty)

Karta jest zamknięta, więc jej treść **nie jest cicho przepisywana**: błędne
ustalenie zostaje widoczne wraz z korektą. Sprostowanie jest jedno i dotyczy
§27.2.

| Co karta twierdziła | Co jest prawdą (zmierzone) | Skutek dla wniosków karty |
|---|---|---|
| „Istnieje **działający wzorzec**: sieć referencyjna + oczekiwany wynik z narzędzia zewnętrznego + test porównawczy" (§27.2) | Porównanie **z żywym narzędziem zewnętrznym nie wykonuje się nigdy**. `pandapower` nie jest w `backend/pyproject.toml`, nie ma go w żadnym z 9 workflowów CI, a testy są bramkowane `importorskip` / `skipif`. Przy nieobecnym `pandapower` (czyli w CI) **10 funkcji testowych jest pomijanych**: 6 z `test_pandapower_cross_validation.py` (pominięcie modułowe) i 4 z `test_pandapower_bridge.py`. Pomiar: `157 passed, 5 skipped` bez `pandapower` vs `167 passed` po jego doinstalowaniu. | Ocena osi **VALIDATION = 1** i wniosek §27.1 („dla dynamiki BRAK wyroczni zewnętrznej") **pozostają w mocy**. Zmienia się natomiast ocena ZASOBU: program dynamiczny **nie dziedziczy** działającego mechanizmu porównania z narzędziem zewnętrznym, bo taki mechanizm w CI nie działa nawet dla stanu ustalonego. |

**Dlaczego to jest ta sama klasa błędu, którą karta zarzuca systemowi.**
Wnioskowałem z OBECNOŚCI plików testowych o ich WYKONYWANIU — dokładnie tak, jak
audytowany system wnioskował z obecności nazwy modelu w kontrakcie o istnieniu
jego równań. Karta w §28 pisze „test kształtu nie odróżnia fizyki od jej braku";
tu obecność pliku nie odróżniła dowodu od dowodu uśpionego. Ustalenie
„czy to się w ogóle wykonuje" musi być pomiarem (`pytest -rs`, przegląd
`pyproject.toml` i workflowów), nie odczytem nazw plików.

**Co w §27.2 było prawdą i nią zostaje** — po rozdzieleniu trzech rzeczy, które
karta zlepiła w jedno (szczegóły w poprawionym §27.2):
1. wyrocznia **literaturowa** dla stanu ustalonego (Stevenson 1982, Kersting 2001)
   — 13 testów, **wykonuje się w CI**;
2. wyrocznia **analityczna zapisana w fikstury** (m.in. `pandapower_iec60909_radial.json`,
   którego `source_note` sam mówi, że wartości pochodzą z postaci zamkniętej IEC 60909,
   a `pandapower` mógłby je *zregenerować*) — **wykonuje się w CI**, ale jest wzorcem
   własnym, nie zewnętrznym;
3. wyrocznia **z żywego narzędzia zewnętrznego** — **nie wykonuje się nigdy**.

Sprostowanie **nie zmienia** werdyktu końcowego (1/10), rekomendacji D-00 ani
klasyfikacji P0/P1/P2/P3.

---

## 1. Executive Summary

System **nie posiada symulacji dynamicznej sieci** w sensie inżynierskim. Posiada
trzy moduły nazwane jak solvery dynamiczne, z których:

- **`stability_rms`** całkuje N **niezależnych, skalarnych równań różniczkowych**
  przy napięciu **przybitym na stałe do 1,0 p.u.** Nie czyta modelu sieci
  (`enm_ref` nigdy nie jest odczytywany). Nie ma Ybus, nie ma równań algebraicznych,
  elementy nie oddziałują na siebie. Regulatory (AVR, governor, PSS) liczą własne
  stany, których **nikt nie konsumuje** — pętle regulacji są otwarte. Model nazwany
  `synchronous_machine_6th_order` ma **2 stany**. Moduł nie ma **ani jednego
  wywołania** poza własnym pakietem — to martwy kod.
- **`frt_hvrt`** nie symuluje urządzenia ani sieci. Zwracana „trajektoria napięcia"
  jest **przepisaniem parametru wejściowego**. `target_der_ref` jest ignorowany —
  falownik PV 0,5 MW i DFIG 60 MW dają **identyczny wynik co do bitu** (dowód
  wykonawczy w §15). Test HVRT **nie może wypaść negatywnie** dla żadnej wartości
  przepięcia, a jego „margines do krzywej" to stała 0,95.
- **`ncrfg_ptpiree`** jest — poprawnie — **ewaluatorem wymagań**, nie solverem.
  Problem w tym, że jego testy T14 (LVRT) i T15 (HVRT) są **tautologią strukturalną**:
  wartość „symulowana" jest przypisana z limitu profilu, margines wychodzi
  identycznie 0,0, werdykt jest zawsze `pass`. Ten werdykt zasila **certyfikat
  zgodności**, a ślad White Box zapisuje sfabrykowaną wielkość `U_sim` jako wynik
  symulacji.

**Konsekwencja regulacyjna (rdzeń tej karty):** system potrafi dziś wygenerować
dokument zgodności NC RfG z werdyktem „zgodny" i deterministycznym hashem dla
modułu, który **nie podał żadnych parametrów dynamicznych**, na podstawie testów,
które **nie mogą wypaść negatywnie**. To jest ryzyko P0 — nie dlatego, że wynik jest
niedokładny, lecz dlatego, że **nie jest wynikiem obliczenia**.

**Co jest zdrowe i warte zachowania:** fundament stanu ustalonego jest realny i
dobrej jakości — wystawiony builder Ybus, jawny Jacobian z hookami ZIP/falownik,
niezmienny `NetworkSnapshot` z odciskiem SHA-256 i strażnikiem mutacji, dojrzały
framework proweniencji (`SourceKind`/`FieldQuality`), `TraceArtifactV2` z
`run_hash`/`trace_signature` oraz **działająca infrastruktura wyroczni zewnętrznej**
dla stanu ustalonego (pandapower / IEEE 39-bus / CIGRE MV). Program dynamiczny nie
zaczyna od zera — zaczyna od dobrego fundamentu i **złej warstwy dynamicznej,
którą trzeba wymienić, a nie rozszerzyć**.

**Werdykt dojrzałości: 1/10** (szkielety). Szczegółowa rozpiska w §41.

---

## 2. Audytowany HEAD / zakres / metoda

| Pozycja | Wartość |
|---|---|
| HEAD | `7e84753adbc4b0e50de9a1fd4f1022f1cfd01903` |
| Data audytu | 2026-09-10 |
| Testy backend (zmierzone) | 8 672 funkcji `test_*` w 633 plikach |
| Testy frontend (zmierzone) | 978 plików `*.test.ts*` / `*.spec.ts*` |
| Metoda | czytanie kodu produkcyjnego → weryfikacja konsumentów → testy → API → UI → dokumentacja |

**Hierarchia dowodowa zastosowana w tej karcie:** kod produkcyjny > realni konsumenci >
testy > API > frontend > dokumentacja kanoniczna > audyty historyczne.

**Dowód wykonawczy.** Kluczowe wnioski §15 i §21 nie opierają się na czytaniu kodu —
zostały **uruchomione**. Silniki `ncrfg_ptpiree` i `frt_hvrt` załadowano w izolacji
(bez pakietu `network_model/__init__`) i odpytano zestawem wejść brzegowych. Wyniki
w §15 i §21. Środowisko sesji nie miało zainstalowanych zależności backendu —
doinstalowano `pydantic`, `pyyaml`, `numpy` **wyłącznie do venv sesji**; repo nietknięte.

**Czego audyt NIE objął (uczciwa granica):**
- Nie uruchomiono pełnej regresji pytest (brak kompletu zależności w kontenerze sesji).
- Nie wykonano oględzin wizualnych ekranów (to gate B-02 właściciela, nie agenta).
- Warstwę frontend zbadano przez kontrakty TS i konsumentów API, nie przez render.

---

## 3. Mapa obecnej architektury dynamicznej

```
                    ┌─────────────────────────────────────┐
   ENM / Snapshot   │  build_ybus_pu()  ·  NetworkSnapshot │   ← fundament ZDROWY,
   (SHA-256, frozen)│  Jacobian  ·  ZIP/inverter hooks     │     NIEUŻYWANY przez dynamikę
                    └─────────────────────────────────────┘
                                    ╳  BRAK POŁĄCZENIA
   ┌──────────────────────┬─────────────────────┬──────────────────────────┐
   │  stability_rms       │  frt_hvrt           │  ncrfg_ptpiree           │
   │  U = 1.0 na sztywno  │  U(t) = wejście     │  ewaluator wymagań       │
   │  N niezależnych ODE  │  urządzenie: brak   │  T14/T15 = tautologia    │
   │  BRAK KONSUMENTÓW    │  → API → UI (żywe)  │  → API → certyfikat      │
   └──────────────────────┴─────────────────────┴──────────────────────────┘
                                    ╳  BRAK POŁĄCZENIA
   ┌─────────────────────────────────────────────────────────────────────┐
   │  ResultSetV1 (nie unosi szeregu czasowego)  ·  Proof Engine         │
   │  8 pakietów dowodowych — ŻADEN nie konsumuje danych czasowych       │
   └─────────────────────────────────────────────────────────────────────┘

   RÓWNOLEGŁA, CZWARTA ŚCIEŻKA (ta, którą faktycznie widzi użytkownik):
   enm/canonical_analysis.py::_execute_dynamic_stability
       → kąty wirnika z run.options z domyślnymi stałymi (10°/75°/28°)
       → application/stability/dynamic_stability.py = porównanie z progami
       → API /analysis-runs/... → UI ui2/wyniki/stabilnosc
```

**Kluczowa obserwacja architektoniczna:** istnieją **dwie niezależne ścieżki tej
samej fizyki** („stabilność dynamiczna") i **dwie niezależne implementacje NC RfG**
z **niekompatybilną numeracją testów**. To jest dokładnie ten dług, który CLAUDE.md
nazywa wprost („dwie ścieżki tej samej fizyki") — i który reguła KLASA, NIE INSTANCJA
każe naprawiać na poziomie klasy, nie pojedynczego miejsca.

---

## 4. Wpływ na obecny plan W1–W12 — USTALENIE FAKTOGRAFICZNE

**Żaden z dokumentów wymienionych w zleceniu nie istnieje w tym repo na HEAD.**
Zweryfikowano wyszukiwaniem po całym repo (nazwa pliku i treść):

| Dokument ze zlecenia | Stan na HEAD |
|---|---|
| `MAPA_DOMKNIECIA_PRODUKTU_2026-09.md` | **NIE ISTNIEJE** (0 trafień) |
| `MISJA_DOMKNIECIA_PRODUKTU_2026-09.md` | **NIE ISTNIEJE** (0 trafień) |
| `CONVERGENCE_ROADMAP.md` | **NIE ISTNIEJE** (0 trafień) |
| `PRODUCT_CAPABILITY_CONSTITUTION.md` | **NIE ISTNIEJE** (0 trafień) |
| `CAPABILITY_ARCHITECTURE_MATRIX.md` | **NIE ISTNIEJE** (0 trafień) |
| `CANONICAL_TWIN_ARCHITECTURE.md` | **NIE ISTNIEJE** (0 trafień) |
| `DECISION_FREEZE_REGISTER.md` | **NIE ISTNIEJE** (0 trafień) |
| `CONVERGENCE_EVIDENCE.md` | **NIE ISTNIEJE** (0 trafień) |
| `MV_DESIGN_PRO_SIMULATION_ARCHITECTURE.md` | **NIE ISTNIEJE** (0 trafień) |
| `NC_RFG_PTPiREE_TESTY_KANON.md` | **ISTNIEJE** — `mv-design-pro/docs/analysis/` |
| Karty W1…W12, w tym W6 | **NIE ISTNIEJĄ** (0 trafień dla `W1–W12`, `W6` jako karty) |
| `TwinRevision`, `ResultSetV2`, `DynamicModelRegistry`, `ExternalDynamicSolverAdapter` | **0 trafień w całym repo** |

**Wniosek dla Fable:** nie ma czego rozszerzać ani przebudowywać w rozumieniu
zlecenia — **W6 nie istnieje**. §32 i §34 tej karty są napisane wobec **realnych**
artefaktów planistycznych repo, którymi są:

- `mv-design-pro/PLANS.md` (v5.1, LIVING, akt. 2026-08-05) — bieżący stan i kolejka prac
- `mv-design-pro/STAN_REPO.md` (LIVING REGISTRY) — rejestr stanu i długu (D-01…D-16)
- `mv-design-pro/docs/uiux/INWENTARZ_FUNKCJI_2026-07.md` — **wiążący inwentarz zdolności**
- `mv-design-pro/docs/v12xx/KANON_V12_XX.md` + rejestry — kanon nadrzędny

Jeżeli Fable chce mieć strukturę W1–W12, jest to **decyzja do podjęcia** (D-01 w §33),
a nie stan do zaktualizowania.

**Istotny precedens uczciwości w repo.** `INWENTARZ_FUNKCJI_2026-07.md` już
2026-08-06 zapisał prawdę o stabilności RMS:

> „SILNIK wskazany w §1 — `solvers/stability_rms/engine.py` — nie ma w backendzie
> ANI JEDNEGO wywołania poza własnym pakietem: nie istnieje ścieżka S13 → API → UI"

Ten wpis **potwierdziłem niezależnie** (§20). Jednocześnie `STAN_REPO.md` §2 deklaruje
„**Stabilność dynamiczna RMS — PODPIĘTE**". Dwa dokumenty LIVING tego samego repo
mówią rzeczy przeciwne — patrz §29.

---

## 5. Macierz pokrycia rodzin źródeł

Legenda: **FULL** = model fizyczny kompletny i sprzężony · **PARTIAL** = model istnieje,
niepełny · **SCAFFOLD** = nazwa/kontrakt/parametr istnieje, fizyki brak ·
**MISSING** = brak · **N/A** = nie dotyczy.

| Zdolność | SYNC | ASYNC | WIND T1 | WIND T2 | WIND T3 | WIND T4 | PV GFL | PV GFM | BESS GFL | BESS GFM | HYBRID | PLANT/PPC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Inicjalizacja ze stanu ustalonego | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING |
| Model maszyny/urządzenia | SCAFFOLD¹ | SCAFFOLD | SCAFFOLD | SCAFFOLD | SCAFFOLD | SCAFFOLD | SCAFFOLD | SCAFFOLD | SCAFFOLD | SCAFFOLD | MISSING | MISSING |
| Prime mover | MISSING | N/A | MISSING | MISSING | N/A | N/A | N/A | N/A | N/A | N/A | MISSING | N/A |
| AVR / wzbudzenie | SCAFFOLD² | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | MISSING | N/A |
| Governor | SCAFFOLD² | N/A | MISSING | MISSING | MISSING | MISSING | N/A | N/A | N/A | N/A | MISSING | N/A |
| PSS | SCAFFOLD² | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | MISSING | N/A |
| PLL | N/A | N/A | N/A | N/A | MISSING | MISSING | MISSING³ | MISSING³ | MISSING³ | MISSING³ | MISSING | N/A |
| Regulator prądu przekształtnika | N/A | N/A | N/A | N/A | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING | N/A |
| Regulacja P | SCAFFOLD² | MISSING | SCAFFOLD | SCAFFOLD | SCAFFOLD | SCAFFOLD | SCAFFOLD | SCAFFOLD | SCAFFOLD | SCAFFOLD | MISSING | MISSING |
| Regulacja Q | MISSING | MISSING | MISSING | MISSING | SCAFFOLD | SCAFFOLD | SCAFFOLD | SCAFFOLD | SCAFFOLD | SCAFFOLD | MISSING | MISSING |
| Regulacja U | SCAFFOLD² | N/A | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING |
| Ograniczenie prądu | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING | SCAFFOLD⁴ | SCAFFOLD⁴ | SCAFFOLD⁴ | SCAFFOLD⁴ | MISSING | N/A |
| FRT / ride-through | MISSING | MISSING | SCAFFOLD⁵ | SCAFFOLD⁵ | SCAFFOLD⁵ | SCAFFOLD⁵ | SCAFFOLD⁵ | SCAFFOLD⁵ | SCAFFOLD⁵ | SCAFFOLD⁵ | MISSING | MISSING |
| Odpowiedź częstotliwościowa (LFSM/FSM) | MISSING | N/A | MISSING | MISSING | MISSING | MISSING | SCAFFOLD⁶ | SCAFFOLD⁶ | SCAFFOLD⁶ | SCAFFOLD⁶ | MISSING | MISSING |
| Odbudowa P po zwarciu | MISSING | MISSING | SCAFFOLD⁷ | SCAFFOLD⁷ | SCAFFOLD⁷ | SCAFFOLD⁷ | SCAFFOLD⁷ | SCAFFOLD⁷ | SCAFFOLD⁷ | SCAFFOLD⁷ | MISSING | MISSING |
| Praca wyspowa | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING | SCAFFOLD⁸ | SCAFFOLD⁸ | SCAFFOLD⁸ | SCAFFOLD⁸ | MISSING | MISSING |
| Black start | MISSING | N/A | MISSING | MISSING | MISSING | MISSING | MISSING | SCAFFOLD⁸ | MISSING | SCAFFOLD⁸ | MISSING | MISSING |
| Stabilność małosygnałowa | SCAFFOLD⁹ | SCAFFOLD⁹ | SCAFFOLD⁹ | SCAFFOLD⁹ | SCAFFOLD⁹ | SCAFFOLD⁹ | SCAFFOLD⁹ | SCAFFOLD⁹ | SCAFFOLD⁹ | SCAFFOLD⁹ | MISSING | MISSING |
| Stabilność przejściowa | SCAFFOLD¹⁰ | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING |
| Sterownik elektrowni | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | MISSING | MISSING |
| Ewaluator WOS / NC RfG | MISSING¹¹ | MISSING¹¹ | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | MISSING | MISSING |
| Pakiet dowodowy | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING |
| Walidacja zewnętrzna | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING |

**Przypisy dowodowe:**
¹ `stability_rms/contracts.py:19` deklaruje `synchronous_machine_6th_order`;
  `engine.py:43` przydziela mu **2 stany**; `engine.py:87-98` implementuje uproszczone
  równanie wahań z `Pe = V·sin(δ)`. Brak Xd/Xq/X'd/X''d/Td0'/saturacji w całym repo.
² `engine.py:100-125` — AVR (4 nazwy) → **jedno** równanie 1. rzędu; governor (3 nazwy)
  → **jedno**; PSS (2 nazwy) → **jedno**. Stany nie są konsumowane przez maszynę (§6).
³ `pll_bandwidth_hz` istnieje jako pole karty katalogowej
  (`mv_converter_catalog.py:76`), ale **żaden solver go nie czyta**.
⁴ `i_max_pu` w `der_dynamic/models.py:61` — parametr istnieje, silnik nie egzekwuje limitu.
⁵ `frt_hvrt/engine.py` — trajektoria narzucona, urządzenie ignorowane (§15).
⁶ `power_flow_inverter.py` liczy **statyczne** przeskalowanie P(f); brak dynamiki (§16).
⁷ `p_recovery_time_s` — deklaracja wejściowa lub funkcja głębokości zapadu (§17).
⁸ Wyłącznie flagi deklaratywne `island_operation_capable`, `black_start_capable`
  w `ncrfg_ptpiree/contracts.py:42-45`. Brak modelu (§19).
⁹ `_compute_eigenvalues` (`engine.py:244-284`) liczy wartości własne **per element**,
  w punkcie x=0, bez macierzy stanu systemu (§20).
¹⁰ `application/stability/dynamic_stability.py` — porównanie progowe kątów podanych
  na wejściu, nie całkowanie (§20).
¹¹ Readiness zwraca `n_a` dla projektów wyłącznie z maszynami synchronicznymi (§24).

---

## 6. Audyt generacji synchronicznej

**Wynik: BRAK MODELU. Rodzina nie jest reprezentowana w warstwie dynamicznej.**

### 6.1 Deklaracja kontra implementacja

`network_model/solvers/stability_rms/contracts.py:19`:
```python
"synchronous_machine_6th_order",  # GENROU/GENSAL z saturacją
```

`network_model/solvers/stability_rms/engine.py:41-43`:
```python
state_sizes: dict[DynamicModelKind, int] = {
    # Simplified 2nd order swing: [delta, omega]
    "synchronous_machine_6th_order": 2,
```

Nazwa kontraktowa obiecuje model 6-rzędowy GENROU/GENSAL z saturacją.
Implementacja ma **2 stany**. To nie jest uproszczenie modelu 6-rzędowego —
to inny model, pod cudzą nazwą, w API oznaczonym jako FROZEN.

### 6.2 Fizyka rzeczywista

`engine.py:87-98`:
```python
if model_kind == "synchronous_machine_6th_order":
    m_inertia = parameters.get("H", 4.5)
    d_damping = parameters.get("D", 1.0)
    pm = parameters.get("Pm", 1.0)
    pe = voltage_pu * np.sin(state[0])  # Pe = V·sin(δ) — uproszczony air-gap
    omega = state[1]
    ddelta_dt = 2.0 * np.pi * 50.0 * omega
    domega_dt = (pm - pe - d_damping * omega) / (2.0 * m_inertia)
```

Postać równania wahań (`2H`, `ω_s·ω`) jest poprawna. **Moc elektryczna jest błędna.**
Kanonicznie `Pe = (E'·U/X'd)·sin(δ − θ)`. Tu nie ma:
- **E'** — napięcia wewnętrznego za reaktancją przejściową,
- **X'd** — reaktancji przejściowej (**reaktancja maszyny w ogóle nie występuje w modelu**),
- **θ** — kąta napięcia szyny.

Skutek fizyczny: moc elektryczna generatora **nie zależy od jego impedancji ani od
siły sieci**. Ta sama maszyna w sieci sztywnej i w sieci słabej odda identyczną
charakterystykę. Krytyczny czas wyłączenia — wielkość, dla której buduje się
symulację stabilności przejściowej — jest w tym modelu niewyznaczalny.

### 6.3 Dane

Przeszukanie całego repo (katalog, domena, ENM, solvery) pod kątem parametrów
maszyny synchronicznej: **Ra, Xd, Xq, X'd, X'q, X''d, X''q, T'd0, T'q0, T''d0,
T''q0, saturacja (S1.0/S1.2), X_leakage — WSZYSTKIE ABSENT.**

Jedyne parametry maszyny w systemie to te używane przez zwarcia:
`machine_sc_iec60909.py` konsumuje `z_internal_ohm`, `ir_a`, `p_per_pole_mw`,
`wind_type_3`. To dane podprzejściowe do IEC 60909 — nie wystarczają do żadnego
modelu dynamicznego.

### 6.4 Ścieżka użytkownika

- **ENM:** `enm/models.py:489-500` — `gen_type` zawiera `"synchronous"`. Rodzina
  jest reprezentowalna topologicznie.
- **Readiness:** `_DER_GEN_TYPES` (`calculation_readiness/service.py:266-273`)
  **nie zawiera** `"synchronous"`. Skutek w §24 — finding **P0-10**.
- **UI:** brak jakiegokolwiek pola do wprowadzenia parametrów dynamicznych maszyny.
- **ResultSet:** brak δ(t)/ω(t)/Efd(t)/Pm(t) w kontrakcie kanonicznym (§25).

**Wniosek:** agregaty gazowe/CHP (w tym referencyjny przypadek MWM), turbiny gazowe
i parowe, hydro oraz klasyczne generatory synchroniczne **nie są dziś obsługiwane
dynamicznie na żadnym poziomie łańcucha** — od danych, przez solver, po readiness i wynik.

---

## 7. Audyt generacji asynchronicznej

**Wynik: SCAFFOLD (jedno równanie zaniku poślizgu).**

`engine.py:127-132`:
```python
if model_kind == "induction_motor_5th_order":
    ts = parameters.get("Ts", 0.5)      # slip time constant
    s_steady = parameters.get("slip_steady", 0.02)
    slip = state[0]
    dslip_dt = (s_steady - slip) / ts
```

Nazwa deklaruje model 5-rzędowy; implementacja to **relaksacja pierwszego rzędu
do zadanego poślizgu ustalonego**. Brak strumieni wirnika, brak Rs/Rr/Xs/Xr/Xm,
brak momentu elektromagnetycznego, brak zależności od napięcia (poślizg dąży do
`slip_steady` niezależnie od tego, co dzieje się w sieci — również podczas zwarcia).

Generatory asynchroniczne jako **generatory** (nie silniki) nie mają osobnego modelu;
FW Type 1/2 korzystają z jeszcze innego równania (§8).

---

## 8. Audyt elektrowni wiatrowych Type 1–4

**Wynik: SCAFFOLD. Cztery typy IEC 61400-27 → dwa równania.**

`engine.py:134-147`:
```python
if model_kind in ("wind_type_1", "wind_type_2"):
    tw = parameters.get("Tw", 5.0)
    omega_ref = parameters.get("omega_ref_pu", 1.0)
    domega_dt = (omega_ref - omega_rotor) / tw

if model_kind in ("wind_type_3", "wind_type_4"):
    tp, tq = parameters.get("Tp", 0.1), parameters.get("Tq", 0.1)
    return np.array([(p_ref - p_filt) / tp, (q_ref - q_filt) / tq])
```

| Typ IEC | Wymagana fizyka | Stan |
|---|---|---|
| Type 1 (SCIG) | maszyna indukcyjna, poślizg, moment | relaksacja ω_rotor 1. rzędu |
| Type 2 (WRIG) | j.w. + rezystancja wirnika sterowana | **identyczne** równanie jak Type 1 |
| Type 3 (DFIG) | RSC/GSC, crowbar, sterowanie wirnikiem | filtr P/Q 2. rzędu |
| Type 4 (PMSG/FSC) | pełny przekształtnik, DC-link | **identyczne** równanie jak Type 3 |

Type 1 i Type 2 są nierozróżnialne. Type 3 i Type 4 są nierozróżnialne. **Crowbar
nie istnieje w repo** (0 trafień). Model mechaniczny (dwumasowy, sztywność wału)
istnieje w katalogu jako `drive_train_stiffness_pu` (`der_dynamic/models.py:161`),
ale **żadne równanie go nie czyta**. Pitch: `pitch_rate_deg_per_s`, `pitch_min_deg`,
`pitch_max_deg` — również **nieskonsumowane**.

Katalog turbin (`wind_turbines/catalog.py`) ma 20 realnych pozycji (Vestas, Siemens
Gamesa, GE, Nordex, Enercon, Goldwind, MingYang, Senvion) z mapowaniem
`converter_type` → typ IEC. To **wartościowy zasób danych** — problem leży wyłącznie
po stronie braku modelu, który by go zużył. Uwaga z pliku, `catalog.py:33`:
`# Parametry elektryczne (uproszczone — pełne w PR-16)` — czyli sam katalog deklaruje
się jako niepełny, a odsyłacz wskazuje etap, który został zamknięty silnikiem z §15.

---

## 9. Audyt PV GFL / GFM

**Wynik: SCAFFOLD, z krytycznym ustaleniem — GFM i GFL to ten sam kod.**

`engine.py:149-163`: cztery rodzaje modeli — `pv_inverter_grid_following`,
`pv_inverter_grid_forming`, `bess_pcs_grid_following`, `bess_pcs_grid_forming` —
trafiają do **jednej gałęzi `if`** i wykonują **identyczne** równanie:

```python
tp = parameters.get("Tp", 0.05); tq = parameters.get("Tq", 0.05)
p_ref = parameters.get("P_ref", 1.0)
q_ref = q_droop * (v_ref - voltage_pu)
return np.array([(p_ref - p_filt) / tp, (q_ref - q_filt) / tq])
```

To filtr pierwszego rzędu na P i Q. Brak: PLL, regulatora prądu, ograniczenia prądu,
priorytetu P/Q, impedancji wirtualnej, inercji wirtualnej, logiki prądu zwarciowego,
zachowania źródła napięciowego.

**`control_mode="grid_forming"` nie ma w tym systemie żadnej konsekwencji
obliczeniowej.** Grid-forming różni się od grid-following wyłącznie:
- inną nazwą `DynamicModelKind`,
- innymi wartościami domyślnymi w katalogu (`defaults.py`: `DEFAULT_PV_GFM` ma
  `virtual_inertia_h_s=4.0` i krótsze stałe czasowe),
- przy czym `virtual_inertia_h_s` **nie jest odczytywane przez żadne równanie**.

Fizycznie GFM jest źródłem napięciowym narzucającym kąt i amplitudę; GFL jest
źródłem prądowym śledzącym sieć przez PLL. W tym kodzie **oba są filtrem mocy przy
napięciu równym 1,0 p.u.** — czyli oba są, ściśle, źródłem mocy w sieci sztywnej.

---

## 10. Audyt BESS GFL / GFM

**Wynik: SCAFFOLD. BESS nie jest magazynem — jest źródłem P/Q.**

Poza ustaleniami §9 (identyczny kod), BESS nie ma **żadnego stanu energetycznego**:

| Wielkość | Stan |
|---|---|
| SOC jako stan dynamiczny | **ABSENT** — brak w `TrajectorySample`, brak w równaniach |
| Pojemność energetyczna | `e_kwh` w `mv_converter_catalog.py:63` — **istnieje w katalogu**, nieczytana przez solver |
| η ładowania / rozładowania | **ABSENT** |
| SOC_min / SOC_max | w kreatorze UI (`zrodloOzeModel.ts`), **nie w modelu dynamicznym** |
| Degradacja | **ABSENT** |
| Ograniczenie energią (a nie mocą) | **ABSENT** |

Skutek inżynierski: symulacja wsparcia częstotliwości z BESS jest niemożliwa
w sposób uczciwy — magazyn bez SOC dostarczy mocy przez dowolnie długi czas.
Każdy scenariusz FSM/LFSM, black start czy pracy wyspowej oparty na BESS
jest w tym modelu **niefalsyfikowalny**.

---

## 11. Audyt układów hybrydowych / PPC

**Wynik: MISSING — cała warstwa nie istnieje.**

Przeszukanie katalogu i domeny pod kątem `plant_controller`, `PPC`, `park_controller`,
`curtailment`, `allocation`, sterowania na poziomie elektrowni: **0 trafień w warstwie
katalogu/domeny DER**. Trafienia w innych miejscach dotyczą nastaw urządzeń
zabezpieczeniowych i setpointów falownika, nie sterowania elektrownią.

Konsekwencje:
- **PV+BESS, FW+BESS, PV+FW+BESS, sync+BESS** — nie ma bytu, który by je łączył;
  każdy DER jest niezależny.
- **Zgodność na PCC całej instalacji jest niewykonalna.** Ewaluator NC RfG
  (`ncrfg_ptpiree`) przyjmuje `modules: list[...]` i ocenia **każdy moduł osobno**
  (`engine.py:211` — `[self._run_module(m, ...) for m in request.modules]`), po czym
  raportuje status per moduł. Nie ma agregacji na punkt przyłączenia.
- Brak alokacji P/Q między jednostkami, brak ograniczeń elektrowni, brak rampy na
  poziomie elektrowni.

To jest luka **architektoniczna**, nie parametryczna — wymaga nowego bytu domenowego,
a nie nowego pola.

---

## 12. Audyt rdzenia numerycznego RMS / DAE

**To jest centralne ustalenie tej karty.**

### 12.1 Czy solver rozwiązuje układ DAE?

Wymagana postać:
```
dx/dt = f(x, V, u)      (równania różniczkowe urządzeń)
0     = g(x, V, I)      (równania algebraiczne sieci: I = Y·V)
```

Postać zaimplementowana (`engine.py:326-345`):
```python
initial_voltage_pu = 1.0                       # ← stała, na sztywno
for step in range(n_steps):
    for dm in solver_input.dynamic_models:
        voltage_pu = _apply_event_to_voltage(initial_voltage_pu, events, t)
        new_state, iters = _trapezoidal_step(states[dm.element_ref], voltage_pu, ...)
```

Czyli: **`dx/dt = f(x, U_zadane)`**, osobno dla każdego elementu.

### 12.2 Czego brakuje — pozycja po pozycji

| Element DAE | Stan | Dowód |
|---|---|---|
| Ybus w solverze dynamicznym | **BRAK** | brak importu, brak budowy macierzy |
| Wstrzykiwanie prądów I(x,V) | **BRAK** | żadne równanie nie zwraca prądu |
| Iteracja algebraiczno-różniczkowa | **BRAK** | pętla po elementach, nie po układzie |
| Jacobian układu | **BRAK** | Jacobian liczony per element, wymiar 1–2 (`engine.py:198-208`) |
| Solver rzadki | **BRAK** | `np.linalg.solve` na macierzy 1×1 lub 2×2 |
| Zmiana topologii | **BRAK** | zdarzenia nie dotykają modelu sieci |
| Sprzężenie element↔element | **BRAK** | stany trzymane w `dict` per `element_ref` |

### 12.3 Miejsca, gdzie U = const zastępuje rozwiązanie sieci

1. `engine.py:326` — `initial_voltage_pu = 1.0` (wartość bazowa całej symulacji)
2. `engine.py:233` — `return 0.05` dla zwarcia trójfazowego (wartość stała)
3. `frt_hvrt/engine.py:33` — `pre_fault_v = 1.0`
4. `frt_hvrt/engine.py:52-62` — cały przebieg napięcia jako funkcja parametru wejściowego

### 12.4 Co w rdzeniu jest realne i wartościowe

Uczciwie: **integrator jest napisany poprawnie**. `_trapezoidal_step`
(`engine.py:173-216`) to prawdziwa metoda trapezów niejawnych z iteracją
Newtona-Raphsona, numerycznym Jacobianem i kryterium residuum. Kod jest czysty
i deterministyczny. Problem nie leży w metodzie całkowania — leży w tym, **co jest
całkowane**: układ N niezależnych skalarnych równań zamiast sprzężonego układu DAE.

**Wniosek dla Fable:** to nie jest solver do poprawienia. To jest szkielet
integratora, wokół którego trzeba zbudować warstwę sieciową, której nie ma.
Kontrakt `StabilitySolverInput` (parametry jako `dict[str, float]` per element,
brak interfejsu do sieci) **zakodował** model rozprzężony — dlatego rozszerzenie
tego kontraktu jest trudniejsze niż napisanie właściwego.

---

## 13. Audyt inicjalizacji dynamicznej

**Wynik: BRAK INICJALIZACJI. Wszystkie stany startują od zera.**

`engine.py:315-317`:
```python
states: dict[str, NDArray[np.float64]] = {}
for dm in solver_input.dynamic_models:
    states[dm.element_ref] = np.zeros(_state_size(dm.model_kind))
```

Nie ma kroku PF → (P0, Q0, U0, θ0) → stany wewnętrzne → punkt równowagi.
Nie ma sprawdzenia `dx/dt ≈ 0` przed zakłóceniem. Nie ma **żadnego testu**, który
by to weryfikował (§28).

**Skutek liczbowy — sprawdzony na wartościach domyślnych silnika:**

| Model | Stan początkowy | dx/dt w t=0 | W równowadze? |
|---|---|---|---|
| Maszyna synchroniczna | δ=0, ω=0 | dω/dt = (1,0 − sin 0 − 0)/(2·4,5) = **+0,111** | **NIE** |
| Governor | Pm=0 | dPm/dt = (1,0 − 0 − 0)/0,5 = **+2,0** | **NIE** |
| Falownik PV/BESS | P=0, Q=0 | dP/dt = (1,0 − 0)/0,05 = **+20,0** | **NIE** |
| Wind Type 1/2 | ω=0 | dω/dt = (1,0 − 0)/5,0 = **+0,2** | **NIE** |
| AVR | Efd=0 | (100·(1−1) − 0)/0,05 = 0 | tak, przypadkiem¹ |

¹ Wyłącznie dlatego, że domyślne `V_ref = 1.0` pokrywa się z zaszytym `voltage_pu = 1.0`.

**Interpretacja fizyczna:** każda „symulacja" zaczyna się od maszyny stojącej
i regulatorów w zerze, po czym pokazuje ich **rozruch od zera do stanu ustalonego**.
Ten rozruch dominuje przebieg. Zakłócenie wprowadzone w t=0,5 s nakłada się na
niezakończony transjent startowy. **Żaden przebieg z tego solvera nie przedstawia
odpowiedzi układu na zakłócenie** — przedstawia sumę rozruchu i zakłócenia,
z czego rozruch jest artefaktem czysto numerycznym.

To jest samodzielny finding **P0-04**: nawet gdyby sprzężenie sieciowe istniało,
wyniki byłyby niefizyczne z powodu inicjalizacji.

---

## 14. Audyt silnika zdarzeń

**Wynik: 2 z 6 typów zdarzeń mają jakąkolwiek implementację; zwarcie jest stałą.**

`engine.py:224-236`:
```python
def _apply_event_to_voltage(voltage_pu, events, t):
    for event in events:
        if event.time_s <= t < event.time_s + event.duration_s:
            if event.event_type == "three_phase_fault":
                return 0.05                       # głęboka zapadnia napięcia
            if event.event_type == "voltage_step":
                return event.magnitude_pu or voltage_pu
    return voltage_pu
```

| Typ zdarzenia (kontrakt `contracts.py:54-61`) | Implementacja |
|---|---|
| `three_phase_fault` | **stała 0,05 p.u.** dla każdego elementu |
| `voltage_step` | wartość z wejścia |
| `single_phase_fault` | **NO-OP** (cicho ignorowane) |
| `line_trip` | **NO-OP** |
| `load_step` | **NO-OP** — mimo że docstring silnika (`engine.py:12`) deklaruje jego obsługę |
| `der_trip` | **NO-OP** |

**Zwarcie trójfazowe:**
- Nie zmienia Ybus ani topologii.
- Nie ma impedancji zwarcia `Zf`.
- **`target_ref` (`contracts.py:64`) nie jest odczytywany przez silnik** — lokalizacja
  zwarcia nie ma znaczenia.
- Każdy element w sieci widzi dokładnie 0,05 p.u., niezależnie od odległości
  elektrycznej od miejsca zwarcia. Generator w GPZ i falownik na końcu linii 20 km
  dostaną tę samą wartość.
- Brak topologii pozwarciowej (po wyłączeniu zwarcia sieć wraca do stanu sprzed —
  bo nigdy się nie zmieniła).

Cztery typy zdarzeń w kontrakcie FROZEN, które silnik ignoruje bez sygnału błędu,
to **phantomy** w rozumieniu dyrektywy właściciela nr 3 (zero fabrykacji).

---

## 15. Audyt FRT — z dowodem wykonawczym

**Wynik: P0. Trajektoria jest przepisaniem wejścia; urządzenie ignorowane; HVRT niefalsyfikowalny.**

### 15.1 Pełny tor

```
UI ui2/oze/frt/EkranFrt.tsx  (wybór modułu, operatora, lvrt|hvrt)
  → GET /api/oze-analysis/frt-trajectories          (api/oze_analysis_runs.py:221)
  → application/analyses/frt_trajektorie.py
  → application/ncrfg_compliance/frt_input.py::build_frt_hvrt_input
  → network_model/solvers/frt_hvrt/engine.py::run_frt_hvrt
  → WykresTrajektoriiChart.tsx  (U(t), P(t), Iq(t) + obwiednia operatora)
```

Tor **jest kompletny i żywy** — to nie jest martwy kod. Tym poważniejszy jest defekt.

### 15.2 Generator trajektorii — rozdzielenie od ewaluatora

`frt_hvrt/engine.py:51-62`:
```python
if t < fault_start:                  v = pre_fault_v            # 1.0, zaszyte
elif t < fault_end:                  v = scenario.voltage_dip_depth_pu   # ← WEJŚCIE
else:
    recovery_progress = min(1.0, (t - fault_end) / 0.1)          # 100 ms, zaszyte
    v = depth + (1.0 - depth) * recovery_progress
```

Napięcie jest **funkcją zadaną**, nie rozwiązaniem. Wstrzyknięcie prądu biernego
`iq` liczone linijkę niżej **nie ma żadnego wpływu na `v`**. To zamyka sprawę:
nie ma sprzężenia zwrotnego urządzenie→sieć, więc nie ma symulacji FRT.
Wykres „U(t) modułu vs obwiednia operatora" pokazuje **parametr wejściowy na tle wymagania**.

### 15.3 Parametry zaszyte, nie z katalogu

| Wielkość | Wartość | Miejsce | Powinno pochodzić z |
|---|---|---|---|
| `tp` (stała odbudowy P) | 0,1 s | `engine.py:39` | profilu DER (`p_recovery_rate_pu_per_s` istnieje w katalogu!) |
| `tiq` (odpowiedź Iq) | 0,02 s | `engine.py:40` | profilu DER (`frt_response_time_ms` istnieje!) |
| `K` (wzmocnienie prądu biernego) | 2,0 | `engine.py:67` | profilu operatora NC RfG |
| `fault_start` | 0,5 s | `engine.py:42` | scenariusza |
| rampa odbudowy U | 100 ms | `engine.py:58` | rozwiązania sieci |
| próg odpadnięcia | 0,05 p.u. / 150 ms | `engine.py:95` | krzywej LVRT profilu operatora |
| próg „margines do krzywej" | 0,05 p.u. | `engine.py:104` | krzywej LVRT profilu operatora |

Gorzka ironia: katalog `der_dynamic/models.py` **zawiera** `frt_response_time_ms`,
`iq_max_during_fault_pu`, `p_recovery_rate_pu_per_s`, `p_recovery_delay_ms`,
`i_max_pu`, `iq_priority_during_fault` — i eksponuje je metodą `to_frt_parameters()`
(`models.py:128`). **Silnik FRT nigdy tej metody nie woła.** Dane są, przygotowany
adapter jest, konsumpcji nie ma.

Dodatkowo `engine.py:76`:
```python
p_target = v * pre_fault_p * (1.0 - 0.5 * delta_v)
# Approximated as V * pre_fault_p (most converters limit P proportionally)
```
Współczynnik `(1 − 0,5·ΔU)` nie ma wyprowadzenia ani odniesienia normatywnego.
To heurystyka w solverze — naruszenie Core Rule #9 repo („No Heuristics in Solvers").

### 15.4 DOWÓD WYKONAWCZY

Silnik uruchomiony bezpośrednio na HEAD (wyniki surowe):

```
--- LVRT: NC RfG wymaga PRZETRWANIA 0.05 pu przez 150 ms ---
LVRT 0.05 pu / 0.15 s (dokładnie wymóg)   connected=True   p_recov=0.27     margin_pu=0.0
LVRT 0.06 pu / 60 s  (skrajnie długi)     connected=True   p_recov=None     margin_pu=0.00999...

--- ten sam zapad, RÓŻNE urządzenia ---
LVRT 0.30/0.5 s  DER=pv_1                 connected=True   p_recov=0.275    margin_pu=0.25
LVRT 0.30/0.5 s  DER=dfig_60MW            connected=True   p_recov=0.275    margin_pu=0.25

--- HVRT: czy może wypaść negatywnie? ---
HVRT 1.10 pu / 3 s                        connected=True   p_recov=0.001    margin_pu=0.95
HVRT 1.30 pu / 3 s                        connected=True   p_recov=0.001    margin_pu=0.95
HVRT 1.50 pu / 3 s                        connected=True   p_recov=0.001    margin_pu=0.95
```

Trzy wnioski, każdy samodzielnie kwalifikujący się jako P0:

1. **Niezależność od urządzenia.** Falownik PV i turbina DFIG 60 MW dają wynik
   identyczny co do ostatniej cyfry. `target_der_ref` jest polem-phantomem.
   Wynik FRT **nie jest własnością modułu wytwórczego** — jest własnością liczby
   wpisanej w pole „głębokość zapadu".
2. **HVRT nie może wypaść negatywnie.** Warunek odpadnięcia (`v < 0.05`) jest
   nieosiągalny dla przepięcia. `margin_to_curve_pu` wynosi **stałe 0,95** dla
   1,10 · 1,30 · 1,50 p.u. — margines nie zależy od badanej wielkości. Test HVRT
   jest strukturalnie niefalsyfikowalny.
3. **Zapad 0,06 p.u. trwający 60 sekund → „moduł pozostał w pracy".** Okno oceny
   to zaszyte 150 ms, więc dowolnie długi głęboki zapad po tym oknie nie jest
   w ogóle sprawdzany.

Ponadto `margin_to_curve_s` (`contracts.py:50`) jest **zawsze `None`**
(`engine.py:112`) — pole FROZEN, nigdy niewypełniane.

---

## 16. Audyt LFSM / FSM

**Wynik: nie jest symulacją. Jest sprawdzeniem nastaw plus algebraicznym ΔP.**

`ncrfg_ptpiree/engine.py:353-413` (`_frequency_test`, obsługuje T01 LFSM-O,
T02 LFSM-U, T03 FSM, T04 odbudowa częstotliwości):

```python
frequency_hz = 50.6 if definition.test_id in {"T01", "T03"} else 49.4
delta_hz = max(abs(frequency_hz - 50.0) - module.dead_band_hz, 0.0)
denominator = 50.0 * (module.droop_percent / 100.0)
delta_p_kw = module.p_max_kw * min(1.0, delta_hz / max(denominator, 1e-9))
droop_ok = abs(module.droop_percent - droop_ref) <= 1.0
dead_ok  = module.dead_band_hz <= dead_ref + 0.05
ok = droop_ok and dead_ok and recovery_ok and delta_p_kw >= 0
```

- Częstotliwość testowa **zaszyta**: 50,6 Hz albo 49,4 Hz. Nie ma skoku ani rampy
  częstotliwości, nie ma osi czasu.
- `ΔP` liczone algebraicznie z charakterystyki statycznej.
- Werdykt `ok` sprowadza się do: „czy zadeklarowany droop jest w ±1 p.p. profilu
  **i** czy martwa strefa mieści się w limicie". Człon `delta_p_kw >= 0` jest
  spełniony zawsze (licznik i mianownik nieujemne) — to warunek pusty.
- Podsumowanie prezentowane użytkownikowi brzmi „**Symulacja odpowiedzi
  częstotliwościowej: ΔP=… kW**" (`engine.py:407`) — słowo „symulacja" opisuje
  podstawienie do wzoru.

Brak: P(t), Pref(t), opóźnienia odpowiedzi, czasu ustalania, limitów rampy w czasie,
dynamiki governora/przekształtnika. **f(t) nie istnieje jako wielkość w żadnym
kontrakcie wynikowym w systemie** (§25) — więc LFSM/FSM nie da się dziś zasymulować
nawet gdyby model istniał, bo nie ma gdzie zapisać wyniku.

Osobno: `power_flow_inverter.py` implementuje **statyczne** przeskalowanie
P(f) = P·(1 + droop·Δf/f0) w rozpływie mocy — to poprawna funkcja stanu ustalonego
i nie należy jej mylić z LFSM w rozumieniu dynamicznym.

---

## 17. Audyt odbudowy mocy po zwarciu

**Wynik: `p_recovery_time_s` jest w jednej ścieżce daną wejściową, w drugiej —
funkcją wyłącznie głębokości zapadu. W żadnej nie jest wynikiem symulacji urządzenia.**

### Ścieżka A — ewaluator NC RfG (`ncrfg_ptpiree/engine.py:683-717`)

```python
if module.p_recovery_time_s is None:
    return self._missing(...)
required_time = profile.p_recovery_after_fault.p_recovery_time_s
ok = module.p_recovery_time_s <= required_time
```

Wartość **deklarowana przez użytkownika** (`contracts.py:56`) porównana z wymaganiem
profilu. To legalny *requirement check* — ale jest prezentowany w pakiecie
opisanym jako wynik solvera, ze śladem White Box i formułą
`t_recovery,module <= t_recovery,profile`.

### Ścieżka B — silnik FRT (`frt_hvrt/engine.py:98-100`)

```python
if t > fault_end and p_recovery_time is None and p_filt >= 0.95 * pre_fault_p:
    p_recovery_time = t - fault_end
```

Wygląda jak pomiar z przebiegu. W istocie `p_filt` relaksuje się ze **stałą
zaszytą `tp = 0,1 s`** do celu `pre_fault_p`, startując od wartości zależnej
wyłącznie od głębokości zapadu, po napięciu odbudowującym się po **zaszytej rampie
100 ms**. Zatem:

> `p_recovery_time = f(głębokość_zapadu)` — i **niczego więcej**.

Potwierdza to dowód z §15.4: dla `depth=0,30` wynik wynosi 0,275 s **zarówno dla
`pv_1`, jak i dla `dfig_60MW`**.

Wymagana fizyka docelowa (zwarcie → wyłączenie → dynamiczna odbudowa → P(t) →
t90/t95/t98 → ewaluator) nie jest zrealizowana w żadnym punkcie.

---

## 18. Audyt regulacji napięcia i mocy biernej

**Stan ustalony: DOBRY. Dynamika: BRAK.**

Stan ustalony jest realnie zaimplementowany i to jest mocna strona systemu —
`power_flow_inverter.py` obsługuje `Q_CONST`, `COSPHI_CONST`, `COSPHI_P`, `Q_U`
z martwą strefą, nachyleniem i limitami Q, wpiętymi w Jacobian Newtona
(`_apply_inverter_jacobian_v2`). To jest właściwe miejsce i właściwa jakość.

Dynamika regulacji napięcia:
- `stability_rms`: `q_ref = q_droop·(V_ref − U)` przy U ≡ 1,0 → **q_ref ≡ 0**
  przez całą symulację, poza oknem zdarzenia. Regulacja Q nie ma czego regulować.
- Brak regulatora napięcia elektrowni, brak koordynacji Q między jednostkami,
  brak dynamiki przełącznika zaczepów w powiązaniu z DER.

Test T17 NC RfG (prąd bierny podczas FRT), `ncrfg_ptpiree/engine.py:718-756`:
```python
voltage_drop_pu = 0.5                                   # zaszyte
iq_pu = min(1.0, module.reactive_current_gain * voltage_drop_pu)
ok = module.reactive_current_gain >= 2.0 and iq_pu >= 1.0 - 1e-9
```
Dla `K ≥ 2,0` mamy `K·0,5 ≥ 1,0`, więc `iq_pu = 1,0` i drugi człon jest zawsze
prawdziwy. Warunek redukuje się algebraicznie do **`K ≥ 2,0`** — czyli do
sprawdzenia jednej zadeklarowanej liczby. Próg 2,0 jest zaszyty w silniku,
a nie czytany z profilu operatora, mimo że test deklaruje ocenę wobec profilu.

---

## 19. Audyt pracy wyspowej i black startu

**Wynik: wyłącznie flagi deklaratywne. Modelu brak.**

`ncrfg_ptpiree/contracts.py:42-47`:
```python
island_operation_required: bool = False
island_operation_capable: bool = False
black_start_required: bool = False
black_start_capable: bool = False
power_oscillation_damping_required: bool = False
power_oscillation_damping_enabled: bool = False
```

Test T18 (`_extended_capability_test`) porównuje `*_required` z `*_capable`.
To sprawdzenie deklaracji wobec deklaracji — poprawne jako *checklist*, ale
nazywane „testem zdolności".

Brak: modelu wyspy (podział sieci, bilans w wyspie), warunku synchronizacji
(kąt/napięcie/częstotliwość), sekwencji black startu, przejścia GFL→GFM,
detekcji utraty zasilania jako procesu dynamicznego.

**Uczciwe zastrzeżenie:** system ma odrębny, realny moduł ochrony LOM
(`ochrona_lom.py`, `/api/oze-analysis/lom-protection`) oceniający zabezpieczenia
anty-wyspowe. To jest wartościowe i nie należy go mylić z brakiem opisanym wyżej —
LOM ocenia nastawy zabezpieczeń, nie symuluje pracy wyspowej.

---

## 20. Audyt stabilności

### 20.1 Małosygnałowa — `_compute_eigenvalues` (`engine.py:244-284`)

```python
for dm in dynamic_models:
    n = _state_size(dm.model_kind)
    x0 = np.zeros(n)                                   # ← punkt x = 0, nie punkt pracy
    ...
    eigvals = np.linalg.eigvals(jacobian)              # ← Jacobian 1×1 lub 2×2
```

Trzy defekty jednocześnie:
1. **Linearyzacja w x = 0**, a nie w punkcie równowagi (którego nie ma — §13).
2. **Jacobian per element**, wymiaru 1 lub 2. Nie ma macierzy stanu układu A.
3. **Brak sprzężenia** ⇒ modów międzymaszynowych (lokalnych, międzyobszarowych)
   nie da się wykryć z zasady — to wartości własne układu, nie elementu.

`small_signal_stability_margin` = minimum ζ po tych wartościach. Dla wartości
rzeczywistej ujemnej ζ = 1,0. Wielkość jest zwracana do API jako „margines
stabilności małosygnałowej".

Brak: współczynników uczestnictwa, postaci modalnych, identyfikacji modu.

### 20.2 Przejściowa — dwie ścieżki, obie bez całkowania

**Ścieżka 1 — `stability_rms`: martwy kod.**
Zweryfikowane niezależnie: `grep -rn "stability_rms" src/` poza własnym pakietem
zwraca **wyłącznie odwołania w docstringach** (`der_dynamic/__init__.py:11`,
`der_dynamic/models.py:5,9,108`). **Zero wywołań.** Brak endpointu, brak wpięcia
w readiness poza deklaracją, brak ścieżki do UI. Potwierdza to wpis
`INWENTARZ_FUNKCJI_2026-07.md` z 2026-08-06.

**Ścieżka 2 — `DYNAMIC_STABILITY`: to jest ścieżka, którą widzi użytkownik.**

`enm/canonical_analysis.py:910-918`:
```python
source_state=FaultClearSourceState(
    source_id=source_ref,
    pre_fault_angle_deg=float(run.options.get("pre_fault_angle_deg", 10.0)),
    during_fault_angle_deg=float(run.options.get("during_fault_angle_deg", 75.0)),
    post_fault_angle_deg=float(run.options.get("post_fault_angle_deg", 28.0)),
    post_fault_voltage_pu=float(run.options.get("post_fault_voltage_pu", 0.97)),
    post_fault_frequency_pu=float(run.options.get("post_fault_frequency_pu", 0.99)),
)
```

**Kąty wirnika przed zwarciem, w trakcie i po zwarciu są odczytywane z opcji biegu
ze stałymi domyślnymi.** Nie są liczone. Następnie
`application/stability/dynamic_stability.py:142-207`:

```python
angle_swing_deg = max(abs(during - pre), abs(post - pre))
checks = {
    "clearing_time":  clearing_time_ms <= 150.0,
    "angle_swing":    angle_swing_deg  <= 120.0,
    "voltage_recovery": post_fault_voltage_pu >= 0.95,
    "frequency_recovery": post_fault_frequency_pu >= 0.98,
}
stability_index = średnia znormalizowanych marginesów
```

Przy wartościach domyślnych: `angle_swing = |75 − 10| = 65°` ≤ 120°, `120 ms` ≤ 150 ms,
`0,97` ≥ 0,95, `0,99` ≥ 0,98 → **`stable = True` zawsze, dopóki nikt nie nadpisze
opcji**. Wynik trafia do `/api/analysis-runs/.../results/dynamic-stability`,
do eksportów (`api/analysis_run_exports.py`) i na ekran `ui2/wyniki/stabilnosc`.

Dodatkowo: ta arytmetyka mieszka w warstwie APPLICATION, a `stability_index` jako
średnia znormalizowanych marginesów jest **wielkością wymyśloną**, nie normatywną,
prezentowaną pod nazwą sugerującą miarę fizyczną. Zderzenie z Core Rule #1
(NOT-A-SOLVER) jest do rozstrzygnięcia przez Fable — patrz D-06 w §33.

**Brak w obu ścieżkach:** krytycznego czasu wyłączenia (CCT), kryterium równych pól,
całkowania równania wahań, wpływu topologii pozwarciowej na Pe.

---

## 21. Audyt modelu normatywnego WOS / NC RfG — z dowodem wykonawczym

### 21.1 P0: T14/T15 są tautologią strukturalną

`ncrfg_ptpiree/engine.py:643-652`:
```python
if is_lvrt:
    limiting = min(curve, key=lambda point: point.voltage_pu)
    simulated_voltage = limiting.voltage_pu          # ← przypisanie z limitu profilu
    margin = simulated_voltage - limiting.voltage_pu # ← x − x ≡ 0
    ok = margin >= -1e-9                             # ← zawsze True
    formula = "U_sim(t) >= U_LVRT,profile(t)"
else:
    limiting = max(curve, key=lambda point: point.voltage_pu)
    simulated_voltage = limiting.voltage_pu
    margin = limiting.voltage_pu - simulated_voltage # ← również ≡ 0
    ok = margin >= -1e-9
```

`simulated_voltage` jest przypisana z `limiting.voltage_pu`, po czym `margin`
jest różnicą tej wielkości z samą sobą. Wynik jest **identycznie 0,0 dla każdych
danych wejściowych**, a `ok` jest **zawsze `True`**. Nie ma tu żadnej symulacji —
mimo że nazwa zmiennej, formuła w śladzie i opis testu twierdzą inaczej.

**DOWÓD WYKONAWCZY** (silnik uruchomiony na HEAD):
```
moduł bez ŻADNYCH nastaw dynamicznych -> [('T14','pass',0.0), ('T15','pass',0.0)]
operator=pse                          -> [('T14','pass',0.0), ('T15','pass',0.0)]
operator=pge                          -> [('T14','pass',0.0), ('T15','pass',0.0)]
60 MW kat.C                           -> [('T14','pass',0.0), ('T15','pass',0.0)]
BESS                                  -> [('T14','pass',0.0), ('T15','pass',0.0)]
FW                                    -> [('T14','pass',0.0), ('T15','pass',0.0)]
certificate_status='expired'          -> [('T14','pass',0.0), ('T15','pass',0.0)]
```

**Ślad White Box, który trafia do dokumentu dowodowego:**
```
T14 | U_sim(t) >= U_LVRT,profile(t) | U_sim = 0.050 p.u., U_lim = 0.050 p.u. | {'margin_pu': 0.0, 'ok': True}
T15 | U_sim(t) <= U_HVRT,profile(t) | U_sim = 1.300 p.u., U_lim = 1.300 p.u. | {'margin_pu': 0.0, 'ok': True}
```

Ślad **prezentuje limit normatywny jako wielkość symulowaną**. To gorsze niż brak
śladu: brak śladu jest widoczny, sfabrykowany ślad wygląda na dowód.

### 21.2 Konsumenci — dlaczego to jest P0, a nie P1

```
api/ncrfg_ptpiree_tests.py:25       _solver = NcRfgPtpireeSolver()   → POST /api/ncrfg-tests/run
api/oze_analysis_runs.py:98         _ncrfg_solver = NcRfgPtpireeSolver()
application/analyses/certyfikat_zgodnosci.py  ← konsumuje NcRfgPtpireeRunResult
frontend/src/ui/ncrfg-tests/api.ts  ← runNcRfgPtpireeTests()
```

Wynik zasila **certyfikat zgodności**. Agregacja statusu (`engine.py:245-251`):
```python
if   fail_count    > 0: overall = "niezgodny"
elif no_data_count > 0: overall = "brak_danych"
else:                   overall = "zgodny"
```
Ponieważ T14/T15 nie mogą dać `fail`, a pozostałe testy to sprawdzenia deklaracji,
status **„zgodny" jest osiągalny wyłącznie na deklaracjach**, z deterministycznym
hashem i raportem PL.

### 21.3 P0: dwie niekompatybilne przestrzenie numeracji testów

Obie żywe, obie wystawione:

| Test | `catalog/profiles/nc_rfg/*.yaml` (używa `ncrfg_compliance/checker.py:206`) | `ncrfg_ptpiree/engine.py` (używa API `/api/ncrfg-tests`) |
|---|---|---|
| **T1 / T01** | Test LVRT | LFSM-O |
| **T2 / T02** | Test HVRT | LFSM-U |
| **T8 / T08** | stabilność małosygnałowa | regulacja Q |
| **T14** | **komunikacja SCADA** | **LVRT** |
| **T15** | rejestracja zakłóceń | **HVRT** |
| **T16** | FRT ze zwarciem 3F | odbudowa P po FRT |
| **T19 / —** | (brak, katalog kończy się na T18) | telemechanika SCADA |
| **T20 / —** | (brak) | jakość energii THD_U |

„T14 zaliczony" oznacza **komunikację SCADA** w jednym module i **LVRT** w drugim.
Oba moduły produkują dokumenty opisane jako zgodność NC RfG / PTPiREE.
W dokumentacji przekazywanej operatorowi jest to wada integralności, nie kosmetyka.

Dodatkowo tylko ścieżka `checker.py` (T1/T2) faktycznie woła solver FRT;
ścieżka `ncrfg_ptpiree` (T14/T15) **nie woła nikogo** — stąd tautologia.

### 21.4 Profile operatorów

Pięciu operatorów: `pse`, `energa`, `tauron`, `enea`, `pge`.

Wynik porównania plików: **treść liczbowa jest identyczna dla wszystkich pięciu**
(progi A/B/C/D, częstotliwość, zakres Q, krzywe LVRT/HVRT, odbudowa P).
`enea.yaml` i `tauron.yaml` różnią się **wyłącznie** komentarzem nagłówkowym,
`operator_id`, `operator_name_pl` i opisem `voltage_level_pl` — zero różnic
w danych. Jedyna różnica liczbowa w całym zbiorze: `pse.yaml` ma dodatkowy punkt
krzywej HVRT `{time_s: 0.50, voltage_pu: 1.20}`, którego pozostałe nie mają.

**Skutek:** wybór operatora w UI jest — dla wyniku liczbowego — **bez znaczenia**,
co potwierdza dowód wykonawczy w §21.1 (`pse` i `pge` dają identyczny wynik).
Profil OSD sugeruje różnicowanie wymagań, którego w danych nie ma. Progi
kategorii A/B/C/D (0,8 kW / 1 MW / 50 MW / 75 MW) są zgodne z NC RfG art. 5
i to jest poprawne — problem dotyczy braku zróżnicowania wymagań szczegółowych OSD.

### 21.5 Wersjonowanie normatywne

| Pole | Stan |
|---|---|
| `last_revision` | `"2024-Q4"` — **identyczne we wszystkich 5 profilach**, statyczny napis |
| data wejścia w życie | **BRAK POLA** |
| data warunków przyłączenia projektu | **BRAK POLA** |
| wersja dokumentu źródłowego (IRiESD/IRiESP) | **BRAK POLA** (tylko w komentarzu YAML) |
| odniesienie do klauzuli normy per wymaganie | **BRAK** (odniesienia ogólne w komentarzu) |
| mechanizm wykrycia dezaktualizacji | **BRAK** |

Na dzień audytu (2026-09-10) profile deklarują rewizję sprzed ~2 lat i **nie ma
mechanizmu, który by to zasygnalizował**. Dla dokumentacji przyłączeniowej data
obowiązywania wymagań jest elementem koniecznym — bez niej nie da się orzec,
wobec jakiego stanu prawnego wykonano ocenę.

---

## 22. Audyt: silnik wymagań kontra solver

**Ustalenie: `ncrfg_ptpiree` jest ewaluatorem wymagań i to jest właściwa rola.
Problemem jest jego LOKALIZACJA i to, że sam wytwarza wielkości „fizyczne".**

Moduł mieszka w `network_model/solvers/` — czyli w warstwie, w której wg
Core Rule #1 wolno liczyć fizykę i w której obowiązuje WHITE BOX. Faktycznie
nie liczy fizyki, tylko ocenia deklaracje wobec profilu. Ta niezgodność
umiejscowienia z naturą modułu jest źródłem defektów:

| Miejsce | Co robi moduł regulacyjny | Powinien |
|---|---|---|
| `_ride_through_test:643` | wytwarza `U_sim` (fabrykacja) | konsumować U(t) z ResultSet |
| `_frequency_test:368` | zaszywa f = 50,6 / 49,4 Hz | konsumować f(t) ze scenariusza |
| `_reactive_current_test:730` | zaszywa ΔU = 0,5 i próg K ≥ 2,0 | konsumować Iq(t) i próg z profilu |
| `_p_recovery_test:697` | porównuje deklarację | konsumować P(t) i wyznaczać t95 |
| `_active_power_control:432` | liczy czas ustalania z rampy | konsumować P(t) |

Kierunek architektoniczny do rozstrzygnięcia przez Fable: wydzielić
**silnik wymagań NC RfG/WOS** jako warstwę, która **wyłącznie ocenia ResultSet**
i nie wytwarza żadnej wielkości fizycznej. Wtedy tautologia z §21.1 przestaje być
możliwa konstrukcyjnie — bo ewaluator nie ma czym sfabrykować `U_sim`.
Decyzja D-05 w §33. **Karta nie wykonuje tej refaktoryzacji.**

---

## 23. Audyt trybu dowodu regulacyjnego

**Wynik: tryb nie istnieje, a mechanizm domyślnych wartości aktywnie mu przeczy.**

### 23.1 Kaskada wartości domyślnych

`der_dynamic/resolver.py:159` — docstring głównego wejścia:
```
ZAWSZE zwraca profil — żaden DER nie zostanie bez modelu.
```

`resolver.py:48-50` deklaruje źródła rozwiązania:
```python
ResolutionSource = Literal[
    "explicit_profile_id", "catalog_entry_dynamic_profile_id",
    "default_per_kind", "default_per_converter_type",
]
```

`calculation_readiness/service.py:312-313`:
```python
else:
    # Bezpieczny fallback dla nieznanych dynamicznych źródeł
    result = resolve_der_dynamic_profile(der_kind="PV")
```

Czyli: brak danych → profil domyślny → readiness `ready` → obliczenie → wynik.
**Stan „brak danych" nie może dziś dotrzeć do werdyktu.** Nieznane źródło
dostaje profil PV.

### 23.2 Inwentarz wartości domyślnych w torze dynamicznym

`stability_rms/engine.py` — 18 wywołań `parameters.get(klucz, literał)`:
`H=4.5`, `D=1.0`, `Pm=1.0`, `Ta=0.05`, `Ka=100.0`, `V_ref=1.0`, `Tg=0.5`, `R=0.05`,
`P_ref=1.0`, `Tw=10.0`, `Kpss=1.0`, `Ts=0.5`, `slip_steady=0.02`, `Tw=5.0`,
`omega_ref_pu=1.0`, `Tp=0.1/0.05`, `Tq=0.1/0.05`, `Q_droop=0.1`.

`frt_hvrt/engine.py` — 7 stałych zaszytych w kodzie (§15.3), bez możliwości podania.

`der_dynamic/defaults.py` — 8 profili domyślnych z komentarzami „typowy".

### 23.3 Ocena dopuszczalności

| Tryb | Wartości domyślne | Ocena |
|---|---|---|
| EXPLORATORY (studium wykonalności) | dopuszczalne, jeśli **oznaczone** | dziś oznaczenia brak w wyniku |
| ENGINEERING (projekt) | dopuszczalne tylko dla wielkości drugorzędnych | dziś dotyczą H, Xd, K_FRT — wielkości pierwszorzędnych |
| REGULATORY_EVIDENCE (dowód dla OSD) | **niedopuszczalne** — brak danej musi dać NOT_READY | **dziś niemożliwe do wyegzekwowania** |

Wymagana reguła: `MISSING → NOT_READY`.
Reguła obowiązująca: `MISSING → TYPICAL VALUE → PASS`.

### 23.4 Zasób, który już istnieje

**System ma gotowy mechanizm do zbudowania tego trybu** i to jest ważna
dobra wiadomość dla Fable. `solver_input/provenance.py`:

```python
class SourceKind(Enum):     CATALOG · OVERRIDE · DERIVED · DEFAULT_FORBIDDEN
class FieldQuality(StrEnum): DATASHEET · ESTIMATED · SYSTEM_DEFAULT
@dataclass class ProvenanceEntry: element_ref, field_path, source_kind,
                                  source_ref, value_hash, unit, note, quality
```

Istnieje nawet `DEFAULT_FORBIDDEN` — czyli intencja bramkowania wartości
domyślnych jest już w kodzie zapisana. Karty referencyjne falowników w
`mv_converter_catalog.py` rozróżniają `DATASHEET` od `ESTIMATED` z odsyłaczem
do karty katalogowej producenta i cytowaniem literatury dla pasm regulatorów.

**Luka:** proweniencja **nie obejmuje parametrów dynamicznych DER**
(`der_dynamic/*` nie ma pól proweniencji) i **nie jest sprawdzana przez readiness**.
Tryb REGULATORY_EVIDENCE to w dużej mierze **rozszerzenie istniejącego mechanizmu
na warstwę dynamiczną**, a nie budowa od zera.

---

## 24. Audyt readiness

`application/calculation_readiness/service.py`

### 24.1 P0: projekt z samymi maszynami synchronicznymi → „nie dotyczy"

```python
_DER_GEN_TYPES = ("pv_inverter", "bess", "wind_inverter", "fw_pmsg", "fw_dfig", "fw_scig")
```

`"synchronous"` **nie występuje na tej liście**, mimo że istnieje w enumeracji ENM
(`enm/models.py:489`). Skutek (`service.py:319-328`):

```python
der_generators = [g for g in enm.generators if g.gen_type in _DER_GEN_TYPES]
if not der_generators:
    return ReadinessTypeReport(
        calculation_type="stability", status="n_a",
        recommended_action_pl="Brak źródeł dynamicznych (PV/BESS/FW). "
                              "Stabilność RMS nie dotyczy projektu.")
```

Projekt z agregatem kogeneracyjnym, turbiną gazową czy elektrownią wodną —
czyli **klasyczny przypadek, w którym stabilność przejściowa jest najbardziej
potrzebna** — dostaje komunikat, że analiza go nie dotyczy. Analogicznie dla
`frt_hvrt` (`:350-356`) i `ncrfg_compliance` (`:373-383`).

To jest odwrócenie sensu inżynierskiego: maszyna wirująca ma inercję, kąt wirnika
i zdolność do utraty synchronizmu — to ona definiuje problem stabilności.
Komunikat „nie dotyczy" jest dla projektanta myląco stanowczy.

### 24.2 P0: „ready" bez sprawdzenia jakiejkolwiek danej

`service.py:329-344`:
```python
resolved = {ref: _resolve_der_dynamic_for_generator(g) for g in der_generators}
return ReadinessTypeReport(
    calculation_type="stability", status="ready",
    recommended_action_pl="Solver stabilności RMS dostępny … Można uruchomić obliczenia.")
```

Status `ready` zależy **wyłącznie od istnienia DER**. Ponieważ resolver zawsze
zwraca profil (§23.1), warunek jest zawsze spełniony. `NOT_READY` **nie jest
zwracane nigdy** dla żadnej z trzech analiz dynamicznych.

Podwójnie problematyczne: readiness deklaruje „**Można uruchomić obliczenia**"
dla stabilności RMS, która **nie ma żadnej ścieżki wykonania** (§20.2).
Użytkownik dostaje zielone światło do analizy, której nie da się uruchomić.

### 24.3 Brak kontraktu wejściowego

`solver_input/contracts.py:30-36` — `SolverAnalysisType` obejmuje wyłącznie
`SHORT_CIRCUIT_3F`, `SHORT_CIRCUIT_1F`, `LOAD_FLOW`, `PROTECTION`.
Analizy dynamiczne **nie przechodzą przez kanoniczny kontrakt wejścia solvera**
ani przez `check_eligibility()`. Mają własne, równoległe kontrakty.
Podobnie `AnalysisDispatchService` nie zna analiz dynamicznych.

---

## 25. Audyt modelu wyniku / trajektorii

### 25.1 ResultSetV1 nie unosi szeregu czasowego

`backend/schemas/resultset_v1_schema.json` — pola: `run_id`, `analysis_type`,
`solver_input_hash`, `contract_version`, `deterministic_signature`, `created_at`,
`run_finished_at`, `element_results[]` (`values` jako słownik), `global_results`,
`overlay_payload`. **Brak osi czasu, brak tablicy próbek, brak `dt`.**
Model jest z założenia migawkowy.

Skutek: trzy równoległe kontrakty wynikowe dla dynamiki, żaden nie jest kanoniczny.

### 25.2 Pokrycie wielkości czasowych

| Wielkość | `stability_rms` | `frt_hvrt` | `ncrfg_ptpiree` | Uwaga |
|---|---|---|---|---|
| U(t) | pole jest | pole jest | brak | w obu przypadkach = wielkość zadana |
| I(t) | **BRAK** | **BRAK** | brak | |
| P(t) | pole jest, **nigdy niewypełniane** | pole jest | brak | `active_power_mw` zawsze `None` (§25.3) |
| Q(t) | pole jest, **nigdy niewypełniane** | Iq tylko | brak | |
| **f(t)** | **BRAK** | **BRAK** | brak | uniemożliwia LFSM/FSM/RoCoF |
| δ(t) | pole jest | brak | brak | tylko dla maszyny synchronicznej |
| ω(t) | pole jest | brak | brak | |
| Efd(t) | **BRAK** | **BRAK** | brak | AVR liczy Efd, nie ma gdzie go zapisać |
| Pm(t) | **BRAK** | **BRAK** | brak | governor liczy Pm, nie ma gdzie zapisać |
| Id(t) | **BRAK** | **BRAK** | brak | |
| Iq(t) | **BRAK** | pole jest | brak | |
| SOC(t) | **BRAK** | **BRAK** | brak | |
| stan regulatora | **BRAK** | **BRAK** | brak | |
| stan zabezpieczeń / wyłącznika | **BRAK** | **BRAK** | brak | |
| `device_connected(t)` | **BRAK** | tylko wartość skalarna | brak | brak przebiegu |

### 25.3 Próbki, które nic nie niosą

`stability_rms/engine.py:347-366` — do próbki zapisywane są wyłącznie:
`time_s`, `voltage_pu` (wielkość zadana), oraz `rotor_angle_rad` i `speed_pu`
**tylko dla modelu maszyny synchronicznej**. Dla wszystkich modeli
przekształtnikowych (PV, BESS, wiatr Type 3/4) stany `P_filt`/`Q_filt`
**nie są zapisywane**. Trajektoria falownika zawiera więc `time_s` i narzucone
napięcie — **zero informacji o urządzeniu**.

### 25.4 Metadane i determinizm

| Metadana | `stability_rms` | `frt_hvrt` | `ncrfg_ptpiree` |
|---|---|---|---|
| hash / odcisk | **BRAK** | **BRAK** | `deterministic_hash` + `input_hash` |
| wersja solvera | **BRAK** | **BRAK** | `solver_version` |
| hash migawki sieci | **BRAK** | **BRAK** | **BRAK** |
| hash scenariusza | **BRAK** | **BRAK** | pośrednio w `input_hash` |
| wersja profilu normatywnego | **BRAK** | **BRAK** | **BRAK** |
| baza czasu / dt | **BRAK** | **BRAK** | n/d |

Dwa solvery deklarowane jako FROZEN nie mają **żadnego** odcisku wyniku,
co jest niezgodne z Core Rule #7 (Determinism) w części dowodowej.
Żaden nie wiąże wyniku z migawką sieci — bo żaden migawki nie czyta.

---

## 26. Audyt WHITE BOX / dowodu

### 26.1 Naruszenie własnej reguły repo

CLAUDE.md Core Rule #2: „All solvers **MUST** expose all calculation steps …
**Forbidden**: Black-box solvers".

| Solver | `white_box_trace_path` | Stan |
|---|---|---|
| `stability_rms` | pole w kontrakcie FROZEN (`contracts.py:129`) | **nigdy nieustawiane** → zawsze `None` |
| `frt_hvrt` | pole w kontrakcie FROZEN (`contracts.py:61`) | **nigdy nieustawiane** → zawsze `None` |
| `ncrfg_ptpiree` | `white_box_trace: list[NcRfgTraceStep]` | **wypełniany** |

Docstring `stability_rms/engine.py:15-16` nazywa rzecz po imieniu:
„WHITE BOX trace: … (**placeholder** dla osobnego pliku)". Deklaracja w kontrakcie
FROZEN bez implementacji to phantom — użytkownik i integrator widzą pole,
które nigdy nie ma wartości.

**Zastrzeżenie ważniejsze od powyższego:** ślad, który **istnieje**
(`ncrfg_ptpiree`), zapisuje wielkość sfabrykowaną (§21.1). W hierarchii ryzyka
sfabrykowany ślad stoi **wyżej** niż brak śladu — brak jest widoczny, fabrykacja
wygląda na dowód i wyłącza czujność odbiorcy.

### 26.2 Pakiety dowodowe

Zaimplementowane: SC3F, SC niesymetryczne (1F-Z/2F/2F-Z), rozpływ mocy, straty,
spadek napięcia, nastawy zabezpieczeń, regulacja Q(U), zwarcia doziemne SN,
weryfikacja obwodów nN i pakiety audytowe.

`application/proof_engine/pakiet_biegu.py:89-95` — mapowanie rodzajów:
```python
_RODZAJ_PAKIETU_PO_BIEGU = {"SC_3F": …, "SC_1F": …, "SC_2F": …, "SC_2F_G": …, "LOAD_FLOW": …}
```
`DYNAMIC_STABILITY` i FRT **nie występują**. Komunikat systemu jest przy tym
uczciwy: „Ten rodzaj obliczenia nie ma jeszcze dedykowanego pakietu dowodowego."

### 26.3 Co da się reużyć bez zmian

`domain/trace_v2/artifact.py` — `TraceArtifactV2` z `snapshot_hash`, `run_hash`
(= SHA-256(snapshot_hash + wejście + wersja specyfikacji)), `trace_signature`,
krokami równań i niezmiennością. **To jest dobra, gotowa podstawa** dla dowodów
dynamicznych. Wymaga rozszerzenia o pojęcie serii czasowej i kroków
„przebieg → wielkość wyprowadzona (t95, U_min, ζ)", ale konstrukcja jest właściwa.

Pakiety, które program dynamiczny będzie potrzebował (do rozstrzygnięcia przez
Fable, **nie implementowane w tej karcie**): DYNAMIC_MODEL, LFSM_O, LFSM_U, FSM,
FRT_LVRT, FRT_HVRT, POST_FAULT_POWER_RECOVERY, REACTIVE_CONTROL, ISLANDING,
BLACK_START, TRANSIENT_STABILITY, SMALL_SIGNAL_STABILITY, MODEL_VALIDATION,
WOS_COMPLIANCE.

---

## 27. Audyt solvera zewnętrznego / walidacji

### 27.1 Dla dynamiki: BRAK. Zero testów porównawczych.

Brak adaptera, brak eksportu modelu dynamicznego, brak importu trajektorii,
brak mapowania tożsamości, brak tolerancji, brak zbiorów odniesienia.
**Zero testów porównujących wynik dynamiczny z jakimkolwiek narzędziem.**

### 27.2 Dla stanu ustalonego: trzy różne rzeczy, dwie działają — SKORYGOWANE

> **Sprostowanie (§0).** Pierwotna wersja tej podsekcji brzmiała: „INFRASTRUKTURA
> ISTNIEJE — to jest zasób […] Istnieje więc **działający wzorzec**: sieć
> referencyjna + oczekiwany wynik z narzędzia zewnętrznego + test porównawczy
> z tolerancją. Program dynamiczny **nie musi wymyślać tego mechanizmu**".
> To było **błędne** w części dotyczącej narzędzia zewnętrznego. Poniżej wersja
> po pomiarze.

Pliki istnieją:

```
src/application/reference_networks/expected/
    pandapower_iec60909_radial.json
    ieee_39bus.json
    pp_simple_four_bus.json
    cigre_mv.json
    oze_pv_bess.json

tests/application/reference_networks/
    test_pandapower_bridge.py                    (6 testów, 4 pomijane bez pandapower)
    test_pandapower_cross_validation.py          (6 testów, WSZYSTKIE pomijane bez pandapower)
    test_ieee_cases_cross_validation.py          (5 testów, wykonują się)
    test_ieee_frozen_solver_cross_validation.py  (9 testów, wykonują się)
    test_ieee_benchmark_wiring.py                (11 testów, wykonują się)
    test_proof_of_correctness.py                 (13 testów, wykonują się)
```

Rozdzielenie, którego pierwotna wersja karty nie zrobiła:

| Rodzaj wyroczni | Przykład | Niezależna od nas? | Wykonuje się w CI? |
|---|---|---|---|
| **Literaturowa** | `test_proof_of_correctness.py`: IEEE 4-bus vs Stevenson 1982 Table 9.4, IEEE 13-bus vs Kersting 2001, rtol ≤ 1% | **TAK** — wartości opublikowane, nie nasze | **TAK** (13 testów) |
| **Analityczna w fiksturze** | `pandapower_iec60909_radial.json` — `source_note` mówi wprost: wartości odpowiadają postaci zamkniętej IEC 60909 (`Ik'' = c·U_n/(√3·|Z_k|) = 28,401877872 kA`), a `pandapower` „*mógłby je zregenerować*, gdy opcjonalna zależność jest zainstalowana" | **NIE** — to nasz własny rachunek, mimo nazwy pliku | **TAK** |
| **Z żywego narzędzia zewnętrznego** | `test_pandapower_cross_validation.py` (`pp = pytest.importorskip("pandapower")`), 4 testy w `test_pandapower_bridge.py` (`skipif(not is_pandapower_available())`) | **TAK** | **NIE — nigdy** |

**Dowód pomiarowy braku wykonania:**

```
$ grep -rn "pandapower" backend/pyproject.toml            -> BRAK
$ grep -rln "pandapower" .github/workflows/               -> BRAK (0 z 9 workflowów)
$ pytest tests/application/reference_networks/ -q -rs     # pandapower zablokowany
  157 passed, 5 skipped
  SKIPPED test_pandapower_cross_validation.py:17  (importorskip - cały moduł)
  SKIPPED test_pandapower_bridge.py:32,40,54,63   (skipif)
$ pip install pandapower==3.5.4 && pytest ... -q          # ten sam zestaw testów
  167 passed
```

Różnica **167 − 157 = 10** to liczba funkcji testowych, które w CI nie wykonują
się nigdy. Po doinstalowaniu `pandapower` 3.5.4 **wszystkie przechodzą** — więc
nie są zepsute, są uśpione. To gorszy stan niż brak testu: brak testu jest
widoczny, uśpiony test wygląda w spisie plików jak pokrycie.

**Wniosek dla programu dynamicznego (skorygowany).** Program **nie dziedziczy**
działającego porównania z narzędziem zewnętrznym — dziedziczy jego SZKIELET
(builder sieci → wynik oczekiwany → test z tolerancją) plus **realnie działającą**
wyrocznię literaturową dla stanu ustalonego. Uruchomienie porównania z żywym
narzędziem wymaga decyzji o zależności i o bramce CI; bez niej każdy nowy poziom
walidacji trafi w ten sam stan uśpienia.

### 27.2b Kandydat na wyrocznię dynamiczną — ANDES (ustalenie z 2026-09-10)

`pandapower` **nie nadaje się** na wyrocznię dynamiczną: nie ma symulacji RMS
(brak modeli maszyn, regulatorów i całkowania w czasie). Zbadano zamiennik.

| Cecha | Ustalenie |
|---|---|
| Narzędzie | ANDES 2.0.0 (CURENT), licencja **Apache-2.0**, czysty Python |
| Zakres | **27 modeli dynamicznych**: GENCLS/GENROU, wzbudnice, turbiny, PSS, modele przekształtnikowe |
| Co daje ponad trajektorię | **Wartości własne linearyzacji (`EIG`)** — odpowiedź niedzieląca z nami ŻADNEGO założenia o całkowaniu |
| Instalacja | `pip install andes` — bez zależności natywnych, działa w środowisku sesji |
| **Pułapka zmierzona** | ANDES domyślnie liczy na **60 Hz**. `ss.config.freq = 50.0` **nie działa** (także ustawione przed `setup()`). Skuteczny jest wyłącznie parametr `fn` **przy urządzeniu** (`GENCLS(..., fn=50)`, `Line(..., fn=50)`). Pominięcie daje błąd `√(60/50) = 1,0954`, czyli **9,5% w częstotliwości wahań** — wynik wyglądający wiarygodnie, a policzony dla innej sieci. |
| Koszt | ~150 s na 26 testów (ANDES buduje `System` od zera dla każdego przypadku) |
| Ograniczenie | Nie waliduje modeli falownikowych GFL/GFM w tej postaci ani regulatorów — GENCLS to maszyna klasyczna bez regulacji |

To jest **ustalenie faktograficzne, nie decyzja**. Czy ANDES ma zostać zależnością
deweloperską i bramką CI, należy do pozycji **D-11** (wyrocznia zewnętrzna dla
dynamiki) — ANDES jest wariantem, którego §33 nie rozważał, bo w chwili pisania
karty nie było wiadomo, że istnieje wykonywalna w tym środowisku wyrocznia RMS.
Rekomendacja §33 dla D-11 brzmiała „(a) PowerFactory + (c) IEC 61400-27
i literatura"; ANDES nie zastępuje żadnego z nich, ale jako jedyny daje wyrocznię
uruchamialną w CI **bez licencji komercyjnej** i **z wartościami własnymi**.
Materiał do rozstrzygnięcia: `docs/plan/PAKIET_DECYZYJNY_DYNAMIKA_D01_D13_2026-09.md`.

Dodatkowo moduł SSCI ma **realne wyroczenie literaturowe**: testy odwołują się
do Sun 2011 (kryterium bezwarunkowej stabilności `max|L| < 1`) oraz Wen 2016
(mechanizm SSCI w sieci słabej przez PLL) i sprawdzają liczbowo m.in.
`L(f) = Z_grid/Z_conv` z tolerancją 1e-4. To **najwyżej zwalidowany fragment
całej warstwy dynamiczno-pochodnej** w systemie i dowód, że zespół potrafi
robić walidację numeryczną, kiedy model jest prawdziwy.

Ograniczenie SSCI odnotowane uczciwie w `STAN_REPO.md` (D-03): skan impedancji
sieci `Z_grid(jω)` istnieje, **impedancja małosygnałowa falownika `Z_conv(jω)`
wymaga pasm regulatorów, których model nie ma**. To ten sam brak co w §9.

---

## 28. Referencyjne przypadki dynamiczne — PROPOZYCJA (NON-BINDING)

Rejestr do rozważenia przez Fable. **Nie budowany w tej sesji.**

| ID | Przypadek | Co waliduje | Proponowana wyrocznia | Poziom modelu | Scenariusze krytyczne |
|---|---|---|---|---|---|
| DYN-S01 | Generator synchroniczny, sieć sztywna | równanie wahań, CCT | analityczna (kryterium równych pól) + PowerFactory | 4./6. rząd + AVR + governor | zwarcie 3F, czas graniczny |
| DYN-S02 | Agregat gazowy CHP (przypadek MWM) | governor gazowy, dynamika paliwa | karta producenta + PowerFactory | 6. rząd + GAST | skok obciążenia, wyspa |
| DYN-S03 | Turbozespół | reheat, PSS | PSS/E lub PowerFactory | 6. rząd + IEEE-G1 + PSS2A | mod lokalny, tłumienie |
| DYN-A01 | Generator asynchroniczny | poślizg, moment, pobór Q | PowerFactory | 5. rząd | zwarcie, odbudowa U |
| DYN-W01 | Wiatr Type 1 (SCIG) | maszyna indukcyjna + wał | IEC 61400-27-1 przypadek walidacyjny | Type 1 | zapad 0,2 p.u. |
| DYN-W02 | Wiatr Type 2 (WRIG) | rezystancja wirnika | IEC 61400-27-1 | Type 2 | zapad + odbudowa |
| DYN-W03 | DFIG | crowbar, RSC/GSC | IEC 61400-27-1 | Type 3 | głęboki zapad, zadziałanie crowbar |
| DYN-W04 | Pełny przekształtnik | ograniczenie prądu, priorytet Q | IEC 61400-27-1 | Type 4 | zapad w sieci słabej |
| DYN-PV1 | PV GFL | PLL, pętla prądowa, FRT | karta producenta + PowerFactory | GFL | sieć słaba (SCR < 3) |
| DYN-PV2 | PV GFM | źródło napięciowe, inercja wirtualna | literatura + PowerFactory | GFM | praca wyspowa, skok obciążenia |
| DYN-B01 | BESS GFL | SOC, wsparcie f | karta PCS | GFL + SOC | LFSM-U z ograniczeniem energią |
| DYN-B02 | BESS GFM | black start, tworzenie napięcia | literatura | GFM + SOC | start od zera, załączanie odbioru |
| DYN-H01 | PV + BESS pod jednym PPC | alokacja P/Q, ograniczenie | brak wyroczni — projekt własny | hybryda + PPC | ograniczenie eksportu, FRT na PCC |
| DYN-H02 | Wiatr + BESS | wygładzanie, rampa | j.w. | hybryda + PPC | rampa, FSM |
| DYN-H03 | Hybryda mieszana | koordynacja technologii | j.w. | hybryda + PPC | zwarcie na PCC |
| DYN-P01 | Elektrownia wielojednostkowa | sterownik elektrowni, agregacja | PowerFactory | PPC + N jednostek | zgodność na PCC, nie per falownik |

Uwaga metodyczna wynikająca z reguły KLASA, NIE INSTANCJA: przypadki należy
dobierać jako **iloczyn cech** (np. „sieć słaba × ograniczenie prądu × głęboki zapad"),
a nie jako pojedyncze scenariusze z kart.

---

## 29. Rozjazdy dokumentacja ↔ kod

| # | Twierdzenie | Źródło twierdzenia | Kod na HEAD | Werdykt | Skutek |
|---|---|---|---|---|---|
| 1 | „synchronous_machine_6th_order (GENROU/GENSAL z saturacją)" | `stability_rms/contracts.py:19` | 2 stany, `Pe=V·sin(δ)`, brak saturacji | **Nazwa API zawyża fizykę** | integrator ufa nazwie w kontrakcie FROZEN |
| 2 | „Stabilność dynamiczna RMS — **PODPIĘTE**" | `STAN_REPO.md` §2 | zero wywołań poza pakietem | **Nieprawda** | zdolność raportowana jako gotowa |
| 3 | „SILNIK … nie ma ANI JEDNEGO wywołania" | `INWENTARZ_FUNKCJI_2026-07.md` (2026-08-06) | zgodne z kodem | **Prawda** | sprzeczność z poz. 2 — dwa dokumenty LIVING, przeciwne treści |
| 4 | „Solver FRT/HVRT RMS time-domain … realne trajektorie V/Iq/P" | `frt_hvrt/__init__.py:1-6` | trajektoria = przepisanie wejścia | **Zawyżenie** | użytkownik czyta wykres jako wynik symulacji |
| 5 | „Symulacja odpowiedzi częstotliwościowej" | `ncrfg_ptpiree/engine.py:407` | podstawienie algebraiczne przy f zaszytej | **Zawyżenie** | „symulacja" w tekście dla użytkownika |
| 6 | `U_sim(t) >= U_LVRT,profile(t)` | ślad White Box T14 | `U_sim` := limit profilu | **Fabrykacja** | dowód zawiera wielkość, która nie została policzona |
| 7 | „grid_forming" jako tryb pracy | `contracts.py:35,37`, katalog | identyczne równanie jak GFL | **Ciąg znaków bez fizyki** | GFM raportowany jako obsługiwany |
| 8 | „BESS PCS" jako model magazynu | `contracts.py:36-37` | brak SOC, brak energii | **Zawyżenie** | magazyn bez ograniczenia energią |
| 9 | „wind_type_1…4 (IEC 61400-27)" | `contracts.py:30-33` | 4 typy → 2 równania | **Zawyżenie** | typy nierozróżnialne |
| 10 | „induction_motor_5th_order" | `contracts.py:29` | 1 stan (zanik poślizgu) | **Nazwa zawyża** | |
| 11 | „AVR IEEE T1/T2/AC4A/ST5B", „TGOV1/GAST/IEEE-G1", „PSS2A/2B" | `contracts.py:20-28` | 9 nazw → 3 równania 1. rzędu | **Nazwy zawyżają** | wybór modelu bez konsekwencji |
| 12 | `white_box_trace_path` w API FROZEN | `contracts.py:129` i `:61` | zawsze `None` | **Phantom** | narusza Core Rule #2 |
| 13 | „Wynik pakietu T01-T20: … Status ogólny: **zgodny**" | `NCRFG_PTPiREE_TEST_REPORT_2026_01.md` | T14/T15 nie mogą dać `fail` | **Werdykt niefalsyfikowalny** | raport zgodności bez mocy dowodowej |
| 14 | `integrator: "trapezoidal_implicit" \| "rk4"` | `contracts.py:77` | pole nieodczytywane; zawsze trapezy | **Phantom** | |
| 15 | `enm_ref` (odcisk migawki) w obu solverach | `contracts.py:71` i `:24` | nieodczytywane | **Phantom** | wynik nie jest związany z siecią |
| 16 | `target_ref` / `target_der_ref` | `contracts.py:64` i `:17` | nieodczytywane | **Phantom** | lokalizacja i urządzenie bez znaczenia |
| 17 | 6 typów zdarzeń | `contracts.py:54-61` | 2 zaimplementowane, 4 no-op | **Phantom** | zdarzenie cicho ignorowane |
| 18 | „Ten moduł dostarcza … adapter z statusem `no_module`" | `stability_rms/__init__.py:9-16` | adapter woła silnik MVP | **Docstring nieaktualny** | sprzeczność wewnątrz jednego pakietu |
| 19 | Profile 5 operatorów OSD | `catalog/profiles/nc_rfg/*.yaml` | treść liczbowo identyczna | **Zróżnicowanie pozorne** | wybór operatora bez wpływu na wynik |
| 20 | `margin_to_curve_s` | `frt_hvrt/contracts.py:50` | zawsze `None` | **Phantom** | |

---

## 30. Findingi P0 / P1 / P2 / P3

### P0 — wynik może zostać użyty błędnie jako dowód regulacyjny

| ID | Klasa | Gdzie | Co | Dowód | Skutek |
|---|---|---|---|---|---|
| **P0-01** | NORMATIVE / PROOF | `ncrfg_ptpiree/engine.py:643-652` | T14/T15 to tautologia: `margin = x − x ≡ 0`, werdykt zawsze `pass` | uruchomienie: 7 różnych wejść → `pass, 0.0`; ślad: `U_sim = 0.050, U_lim = 0.050` | certyfikat zgodności oparty na teście, który nie może wypaść negatywnie |
| **P0-02** | PHYSICS / ARCHITECTURE | `stability_rms/engine.py:326` | brak sprzężenia z siecią; `U ≡ 1,0`; `enm_ref` nieczytany | brak Ybus/algebry w module; elementy niezależne | „symulacja stabilności" bez sieci — wynik niezwiązany z projektem |
| **P0-03** | PHYSICS / MODEL | `stability_rms/engine.py:43,94` | model „6-rzędowy" ma 2 stany; `Pe = V·sin(δ)` bez E' i X'd | kod | CCT i granica stabilności niewyznaczalne; brak wpływu siły sieci |
| **P0-04** | PHYSICS | `stability_rms/engine.py:317` | stany startują od zera, brak punktu równowagi | wyliczone dx/dt(0) ≠ 0 dla 4 z 5 modeli | każdy przebieg zdominowany przez artefakt rozruchu |
| **P0-05** | PHYSICS / ARCHITECTURE | `stability_rms/engine.py:93,115,124` | AVR/governor/PSS nie są sprzężone z maszyną (pętle otwarte) | governor czyta `omega` ze słownika stałych; maszyna czyta stałe `Pm` | regulatory nie mogą wpłynąć na nic — PSS nie tłumi, AVR nie wzbudza |
| **P0-06** | PHYSICS | `stability_rms/engine.py:224-236` | zwarcie = stała 0,05 p.u. wszędzie; `target_ref` ignorowany; 4/6 zdarzeń to no-op | kod | lokalizacja i impedancja zwarcia bez znaczenia |
| **P0-07** | PHYSICS / NORMATIVE | `frt_hvrt/engine.py:52-104` | trajektoria = wejście; urządzenie ignorowane; HVRT niefalsyfikowalny | uruchomienie: `pv_1` ≡ `dfig_60MW`; HVRT margines ≡ 0,95 dla 1,10/1,30/1,50 | ocena FRT nie jest własnością modułu wytwórczego |
| **P0-08** | NORMATIVE | `ncrfg_ptpiree/engine.py:683-717` + `frt_hvrt/engine.py:98` | `p_recovery_time_s` = deklaracja albo funkcja samej głębokości zapadu | uruchomienie: identyczny wynik dla 2 różnych DER | wymaganie NC RfG oceniane bez symulacji |
| **P0-09** | PHYSICS / DATA | `enm/canonical_analysis.py:910-918` | kąty wirnika z `run.options` ze stałymi 10°/75°/28° | kod; przy domyślnych `stable=True` zawsze | ścieżka widoczna w UI i eksportach opiera się na stałych |
| **P0-10** | READINESS | `calculation_readiness/service.py:266-273, 317-344` | „n_a" dla maszyn synchronicznych; „ready" bez sprawdzenia danych; „ready" dla solvera bez ścieżki wykonania | kod + `resolver.py:159` | brak danych nigdy nie blokuje; rodzina synchroniczna wykluczona |
| **P0-11** | NORMATIVE | `checker.py:206` vs `ncrfg_ptpiree/engine.py:128` | dwie niekompatybilne numeracje testów NC RfG, obie żywe | T14 = SCADA vs T14 = LVRT | „T14 zaliczony" ma dwa różne znaczenia w dokumentach |

### P1 — brak kluczowej zdolności inżynierskiej

| ID | Klasa | Rzecz |
|---|---|---|
| P1-01 | ARCHITECTURE | `stability_rms` bez konsumentów — martwy kod (`INWENTARZ` potwierdza) |
| P1-02 | PROOF | brak śladu White Box z `stability_rms` i `frt_hvrt` — naruszenie Core Rule #2 |
| P1-03 | RESULT | ResultSetV1 nie unosi szeregu czasowego; 3 równoległe kontrakty wyniku |
| P1-04 | PROOF | żaden pakiet dowodowy nie konsumuje danych czasowych |
| P1-05 | DATA | brak parametrów maszyny synchronicznej w całym repo (Xd, X'd, X''d, T'd0, H, saturacja) |
| P1-06 | MODEL | BESS bez SOC, sprawności, limitów energii |
| P1-07 | ARCHITECTURE | brak sterownika elektrowni / PPC; zgodność na PCC niemożliwa |
| P1-08 | MODEL | GFM ≡ GFL w kodzie; 19 nazw modeli → 8 równań |
| P1-09 | RESULT | f(t) nie istnieje jako wielkość — LFSM/FSM/RoCoF niemożliwe do zapisania |
| P1-10 | NORMATIVE | profile 5 operatorów liczbowo identyczne; `last_revision` statyczne „2024-Q4"; brak daty obowiązywania i daty warunków przyłączenia |
| P1-11 | VALIDATION | zero wyroczni zewnętrznej dla dynamiki (przy istniejącej infrastrukturze dla stanu ustalonego) |
| P1-12 | ARCHITECTURE | dwie ścieżki „stabilności dynamicznej"; dwie implementacje NC RfG |
| P1-13 | MODEL | brak crowbar (DFIG), brak modelu dwumasowego (parametr w katalogu nieczytany), pitch nieczytany |
| P1-14 | MODEL | brak PLL, regulatora prądu, ograniczenia prądu, priorytetu P/Q, impedancji i inercji wirtualnej w równaniach |
| P1-15 | READINESS | analizy dynamiczne poza `solver_input`, poza `check_eligibility()`, poza `AnalysisDispatchService` |
| P1-16 | MODEL | brak modelu wyspy, synchronizacji, black startu (tylko flagi) |
| P1-17 | RESULT | `stability_rms` i `frt_hvrt` bez odcisku wyniku i bez powiązania z migawką |

### P2 — ograniczenie funkcjonalne

P2-01 `integrator` nieodczytywany · P2-02 `margin_to_curve_s` zawsze `None` ·
P2-03 próbkowanie „co 10 kroków" zaszyte · P2-04 wartości własne bez współczynników
uczestnictwa · P2-05 `_state_size` cicho zwraca 1 dla nieznanego modelu ·
P2-06 brak modelu jednofazowego w zdarzeniach dynamicznych ·
P2-07 proweniencja nie obejmuje parametrów dynamicznych DER.

### P3 — dług techniczny / ergonomia

P3-01 `_ = np` jako „NumPy fast-path silencer" (`frt_hvrt/engine.py:143`) —
numpy importowany i nieużywany · P3-02 docstring `stability_rms/__init__.py`
sprzeczny z `contracts.py` w tym samym pakiecie · P3-03 `wind_turbines/catalog.py:33`
odsyła do etapu, który został zamknięty silnikiem z §15 ·
P3-04 komentarz `frt_hvrt/engine.py:94` „MVP simplification" jako jedyna
dokumentacja kryterium odpadnięcia.

---

## 31. Graf zależności

```
(A) Sprzężony rdzeń RMS/DAE  ──────────────────────────────┐
     wymaga: Ybus dynamiczny, interfejs I(x,V), iteracja    │
     ma do dyspozycji: build_ybus_pu(), NetworkSnapshot     │
        │                                                   │
        ├──► (B) Inicjalizacja z PF  (wymaga A)             │
        │        │                                          │
        │        └──► (C) Modele urządzeń  (wymaga A + B)   │
        │                 sync · async · wiatr 1-4          │
        │                 PV/BESS GFL+GFM                   │
        │                    │                              │
        │                    ├──► (D) Dane: parametry       │
        │                    │      maszyn + proweniencja   │
        │                    │      (może iść RÓWNOLEGLE)   │
        │                    │                              │
        │                    └──► (E) PPC / hybrydy         │
        │                           (wymaga C)              │
        │                                                   │
        └──► (F) Silnik zdarzeń  (wymaga A)                 │
                 zwarcie z Zf, zmiana topologii             │
                    │                                       │
                    └──► (G) Model wyniku z serią czasową ──┘
                             (wymaga A; blokuje H, I, J)
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
   (H) Ewaluator        (I) Pakiety         (J) Walidacja
       WOS/NC RfG           dowodowe             zewnętrzna
       (wymaga G)           (wymaga G)           (wymaga G)
                                                     │
                                        rozszerza istniejące
                                        reference_networks/

RÓWNOLEGŁE, NIEZALEŻNE OD (A):
   (K) Tryb REGULATORY_EVIDENCE — rozszerzenie provenance.py na dynamikę
   (L) Wersjonowanie profili WOS — data obowiązywania, data warunków, klauzule
   (M) Ujednolicenie numeracji testów NC RfG (P0-11)
   (N) Rozstrzygnięcie dwóch ścieżek stabilności (P1-12)
```

**Ścieżka krytyczna: A → B → C → G.** Wszystko po stronie normatywnej, dowodowej
i walidacyjnej czeka na (G), a (G) czeka na (A).

**Można zacząć natychmiast, bez (A):** K, L, M, N oraz D. To istotne dla
planowania — cztery pozycje o wysokiej wartości regulacyjnej nie są zablokowane
przez rdzeń numeryczny.

---

## 32. Wejście do delty roadmapy — dla Fable

Format wg zlecenia. Przypominam ustalenie §4: **W6 nie istnieje**, więc kolumna
„obecne umiejscowienie" odnosi się do realnych artefaktów repo.

| Obszar | Obecne umiejscowienie | Obecny zakres | Wykryta luka | Zależności | Proponowany przyszły wycinek (NON-BINDING) | Decyzja Fable? |
|---|---|---|---|---|---|---|
| Rdzeń RMS/DAE | `solvers/stability_rms/` | integrator + 8 równań rozprzężonych | brak warstwy sieciowej; kontrakt zakodował rozprzężenie | — | wymiana rdzenia, nie rozszerzenie | **TAK** (D-02, D-03) |
| Inicjalizacja | brak | brak | brak PF→stany, brak testu równowagi | rdzeń | inicjalizacja + niezbywalny test dx/dt≈0 | TAK |
| Model synchroniczny | brak | brak | cała rodzina poza systemem | rdzeń + dane | model 4./6. rzędu + AVR + governor + PSS | **TAK** (D-04) |
| Modele przekształtnikowe | `stability_rms` | 1 wspólne równanie | GFM≡GFL, brak PLL/limitu prądu | rdzeń | rozdzielenie GFM/GFL z realną fizyką | TAK |
| Wiatr Type 1–4 | `stability_rms` + katalog | 2 równania na 4 typy | typy nierozróżnialne, brak crowbar | rdzeń | modele IEC 61400-27 per typ | TAK |
| BESS | `stability_rms` + katalog | filtr P/Q | brak SOC i ograniczenia energią | rdzeń | model magazynu z SOC | TAK |
| Hybrydy / PPC | brak | brak | brak bytu domenowego | modele urządzeń | PPC + zgodność na PCC | **TAK** (D-07) |
| Silnik zdarzeń | `stability_rms` | 2 z 6 typów | brak Zf, lokalizacji, topologii pozwarciowej | rdzeń | silnik zdarzeń na modelu sieci | TAK |
| Model wyniku | 3 równoległe kontrakty | migawkowy + 2 ad hoc | brak f/Efd/Pm/SOC; brak wiązania z migawką | rdzeń | kanoniczny wynik z serią czasową | **TAK** (D-08) |
| Ewaluator WOS | `ncrfg_ptpiree` + `checker` | 2 implementacje, 2 numeracje | tautologia T14/T15; niekompatybilne ID | model wyniku | jeden ewaluator konsumujący wynik | **TAK** (D-05, D-06) |
| Tryb dowodu regulacyjnego | `solver_input/provenance.py` | proweniencja dla stanu ustalonego | nie obejmuje dynamiki; nie bramkuje | **brak** — można zacząć teraz | 3 tryby + `MISSING→NOT_READY` | **TAK** (D-09) |
| Profile WOS | `catalog/profiles/nc_rfg/` | 5 plików, treść identyczna | brak wersjonowania i dat; zróżnicowanie pozorne | **brak** | wersjonowanie + realne różnice OSD | TAK (D-10) |
| Readiness | `calculation_readiness/` | zawsze `ready`/`n_a` | wyklucza synchroniczne; nie bramkuje danych | tryb dowodu | readiness per rodzina + bramkowanie | TAK |
| Pakiety dowodowe | `proof_engine/` | 8 pakietów, zero dynamicznych | brak pakietów czasowych | model wyniku | pakiety dynamiczne | TAK |
| Walidacja zewnętrzna | `reference_networks/` (stan ustalony) | pandapower/IEEE/CIGRE — **działa** | brak wymiaru czasowego | model wyniku | rozszerzenie o trajektorie | **TAK** (D-11) |
| Dwie ścieżki stabilności | `stability_rms` + `application/stability` | równoległe | dług architektoniczny | — | rozstrzygnięcie i likwidacja jednej | **TAK** (D-06) |

---

## 33. Decyzje wymagane od Fable

| ID | Decyzja | Opcje | Rekomendacja audytu | Dowód | Zależności | Ryzyko odroczenia |
|---|---|---|---|---|---|---|
| **D-00** | **Natychmiastowe bramkowanie dowodu regulacyjnego** — czy do czasu naprawy blokować generowanie certyfikatu zgodności / oznaczać go jako niedowodowy | (a) zablokować · (b) oznaczyć ostrzeżeniem w dokumencie · (c) zostawić | **(a) albo (b), decyzja przed jakąkolwiek pracą programową** | §21.1, §21.2 — dowód wykonawczy | brak | **Najwyższe. Dokument zgodności może trafić do OSD już dziś.** |
| **D-01** | Czy powołać strukturę programu (W1–W12 lub inną) | (a) nowa struktura · (b) kontynuacja w `PLANS.md` | (b) rozszerzenie `PLANS.md` + jeden dokument programu dynamicznego | §4 — dokumenty nie istnieją | brak | niska, ale blokuje planowanie |
| **D-02** | Rdzeń RMS: rozszerzyć czy wymienić | (a) rozszerzyć `stability_rms` · (b) nowy rdzeń, stary usunąć | **(b)** — kontrakt zakodował rozprzężenie; rozszerzanie jest droższe | §12 | D-03 | wysokie: praca na złym fundamencie |
| **D-03** | Zgoda B-01 na zmianę/usunięcie kontraktów FROZEN `StabilitySolverInput`/`Result` i `FrtHvrt*` | (a) zgoda na wymianę · (b) wersjonowanie major · (c) zachowanie | **(a)** — kontrakty zawierają phantomy (`enm_ref`, `integrator`, `target_ref`, `white_box_trace_path`) | §29 poz. 12,14,15,16,20 | — | wysokie: blokuje D-02 |
| **D-04** | Kolejność rodzin źródeł | (a) synchroniczne najpierw · (b) przekształtnikowe najpierw · (c) równolegle | **(a)** — rodzina całkowicie nieobsłużona, definiuje problem stabilności, i to ona jest wykluczona przez readiness | §6, §24.1 | D-02 | średnie |
| **D-05** | Rozdzielenie ewaluatora wymagań od wytwarzania fizyki | (a) ewaluator tylko konsumuje ResultSet · (b) status quo | **(a)** — czyni tautologię z §21.1 konstrukcyjnie niemożliwą | §21, §22 | D-08 | **wysokie: to jest przyczyna P0-01** |
| **D-06** | Dwie ścieżki stabilności i dwie implementacje NC RfG | (a) jedna ścieżka, druga usunięta · (b) rozdzielenie ról · (c) status quo | **(a)** — CLAUDE.md zakazuje dwóch ścieżek tej samej fizyki | §3, §20.2, §21.3 | D-02 | wysokie: rozjazd rośnie |
| **D-07** | Zakres PPC / hybryd w programie | (a) w rdzeniu od początku · (b) po modelach urządzeń · (c) poza zakresem | (b) — wymaga modeli, ale przed ewaluatorem WOS, bo zgodność jest na PCC | §11 | D-02 | średnie: przeprojektowanie ewaluatora |
| **D-08** | Kanoniczny model wyniku dynamicznego | (a) rozszerzyć ResultSet o serię czasową · (b) osobny kontrakt czasowy w tym samym rejestrze · (c) status quo (3 równoległe) | (b) — ResultSetV1 jest z założenia migawkowy; osobny kontrakt, ale **jeden** | §25 | D-03 | wysokie: blokuje dowody i walidację |
| **D-09** | Tryby EXPLORATORY / ENGINEERING / REGULATORY_EVIDENCE | (a) trzy tryby · (b) dwa · (c) brak | **(a)**, z regułą `MISSING → NOT_READY`; mechanizm `provenance.py` już istnieje | §23 | **brak — można zacząć teraz** | **wysokie: to jest bezpiecznik dla całej klasy P0** |
| **D-10** | Wersjonowanie profili WOS | (a) wersja + data obowiązywania + data warunków przyłączenia + klauzule · (b) sama data | **(a)** | §21.4, §21.5 | brak | średnie: rosnąca dezaktualizacja |
| **D-11** | Wyrocznia zewnętrzna dla dynamiki | (a) PowerFactory · (b) PSS/E · (c) IEC 61400-27 + literatura · (d) bez wyroczni | **(a) + (c)** — wzorzec `reference_networks/` już działa dla stanu ustalonego | §27 | D-08 | wysokie: bez wyroczni brak dowodu poprawności |
| **D-12** | Zakres modeli OEM producentów | (a) rejestr modeli + wtyczki · (b) tylko modele generyczne · (c) później | (b) na start, (a) jako cel — rejestr wymaga stabilnego interfejsu urządzenia | §5, §8 | D-02 | niskie |
| **D-13** | Co zrobić z `stability_rms` **przed** nowym rdzeniem | (a) usunąć teraz (martwy kod) · (b) oznaczyć jako niedostępny · (c) zostawić | (a) albo (b) — dziś readiness deklaruje „można uruchomić obliczenia" dla ścieżki, której nie ma | §20.2, §24.2 | D-03 | średnie: mylący komunikat dla projektanta |

---

## 34. Rekomendowane wycinki wdrożeniowe — NON-BINDING

**To nie jest plan. To propozycja kolejności do rozważenia.** Numeracja celowo
neutralna (litery), żeby nie kolidowała z żadną przyszłą decyzją Fable o strukturze.

| Wycinek | Zakres | Zależy od | Dlaczego w tym miejscu |
|---|---|---|---|
| **α — Bezpiecznik dowodowy** | D-00: bramkowanie/oznaczenie certyfikatu; ujednolicenie numeracji testów (P0-11); wersjonowanie profili WOS | **nic** | zatrzymuje ryzyko regulacyjne **dziś**, bez czekania na rdzeń |
| **β — Tryb REGULATORY_EVIDENCE** | rozszerzenie `provenance.py` na dynamikę; readiness `MISSING → NOT_READY`; readiness dla rodziny synchronicznej | **nic** | bezpiecznik dla całej klasy P0-10; mechanizm już istnieje |
| **γ — Rdzeń DAE** | sprzężenie sieciowe na `build_ybus_pu()`; interfejs urządzenia I(x,V); iteracja; zdarzenia na modelu sieci z Zf | D-02, D-03 | ścieżka krytyczna |
| **δ — Inicjalizacja** | PF → stany → równowaga; **niezbywalny test dx/dt≈0** dla każdego modelu | γ | bez tego każdy wynik jest artefaktem |
| **ε — Model synchroniczny** | 4./6. rząd + AVR + governor + PSS, sprzężone; dane + proweniencja | γ, δ | rodzina całkowicie nieobsłużona (D-04) |
| **ζ — Modele przekształtnikowe** | realne rozdzielenie GFM/GFL, PLL, regulator prądu, limit prądu, priorytet P/Q | γ, δ | zamyka P1-08, P1-14 |
| **η — Wiatr i BESS** | Type 1–4 wg IEC 61400-27 (z crowbar, wałem, pitchem); BESS z SOC | ζ | katalog danych już istnieje |
| **θ — Model wyniku + ewaluator** | jeden kontrakt czasowy; ewaluator WOS **wyłącznie konsumujący** | γ, D-05, D-08 | likwiduje przyczynę P0-01 |
| **ι — Dowody i walidacja** | pakiety dowodowe czasowe; rozszerzenie `reference_networks/` o trajektorie | θ, D-11 | domyka łańcuch dowodowy |
| **κ — PPC i hybrydy** | sterownik elektrowni, zgodność na PCC | ζ, η | wymaga modeli jednostek |

Wycinki **α i β nie mają zależności** i adresują ryzyko o najwyższej wadze.
Rekomendacja audytu: zacząć od nich, niezależnie od decyzji o rdzeniu.

---

## 35. Rekomendowane bramki odbioru dla przyszłych prac

Propozycja kryteriów, przy których „gotowe" znaczy gotowe. **NON-BINDING.**

1. **Bramka równowagi.** Dla każdego modelu urządzenia test dowodzi `|dx/dt| < ε`
   w t=0 po inicjalizacji z rozpływu. Bez wyjątków, bez pominięć.
2. **Bramka sprzężenia.** Test dowodzi, że zmiana impedancji sieci zmienia
   trajektorię urządzenia. To jest bezpośredni test na regresję do defektu P0-02.
3. **Bramka falsyfikowalności.** Dla każdego testu normatywnego istnieje wejście,
   które daje `fail`. Test tego dowodzący jest przypięty na stałe. Bezpośrednia
   ochrona przed nawrotem P0-01 i P0-07.
4. **Bramka zależności od urządzenia.** Dwa różne moduły wytwórcze przy tym samym
   zakłóceniu dają **różne** wyniki. Ochrona przed nawrotem P0-07.
5. **Bramka wyroczni.** Każda rodzina źródeł ma co najmniej jeden przypadek
   porównany z narzędziem zewnętrznym lub rozwiązaniem analitycznym, z jawną tolerancją.
6. **Bramka proweniencji.** W trybie REGULATORY_EVIDENCE żadna wielkość
   pierwszorzędna nie pochodzi z `SYSTEM_DEFAULT`; brak danej daje `NOT_READY`.
7. **Bramka White Box.** Każdy solver dynamiczny emituje ślad; **żadna wielkość
   w śladzie nie jest przypisana z wymagania**, wobec którego jest oceniana.
   Bezpośrednia ochrona przed nawrotem fabrykacji `U_sim`.
8. **Bramka determinizmu.** Wynik dynamiczny ma odcisk wiążący migawkę sieci,
   scenariusz, wersję modelu i wersję profilu normatywnego.
9. **Bramka klasy (wg reguły KLASA, NIE INSTANCJA).** Każda karta naprawcza
   zawiera inwentarz **wszystkich** miejsc dzielących mechanizm, a testy pokrywają
   **iloczyn cech**, nie przykład z karty.
10. **Bramka B-02.** Werdykt wizualny ekranów dynamicznych wystawia właściciel.

---

## 36. Przekazanie do Fable

## FABLE HANDOFF — READY FOR DECISION

**AUDIT HEAD:** `7e84753adbc4b0e50de9a1fd4f1022f1cfd01903`

**AUDIT STATUS:** COMPLETE

**P0 FINDINGS:** 11
**P1 FINDINGS:** 17
**P2 / P3:** 7 / 4

**CURRENT DYNAMIC MATURITY:**
Poziom **1/10** — szkielety. System nie posiada symulacji dynamicznej sprzężonej
z siecią. Trzy moduły noszące nazwy solverów dynamicznych realizują odpowiednio:
całkowanie rozprzężonych równań skalarnych przy napięciu stałym (`stability_rms`,
przy tym bez konsumentów), przepisanie parametru wejściowego jako trajektorii
(`frt_hvrt`), oraz ocenę deklaracji z tautologicznym testem ride-through
(`ncrfg_ptpiree`). Fundament stanu ustalonego, proweniencji, migawki, śladu i
wyroczni zewnętrznej jest natomiast realny i dobrej jakości.

**CAN EXISTING ARCHITECTURE BE EXTENDED:** **PARTIALLY**
- **ROZSZERZYĆ (fundament zdrowy):** `build_ybus_pu()`, jawny Jacobian z hookami
  ZIP/falownik, `NetworkSnapshot` (frozen + SHA-256 + strażnik mutacji),
  `solver_input/provenance.py` (w tym istniejące `DEFAULT_FORBIDDEN`),
  `TraceArtifactV2` (`run_hash`/`trace_signature`), `reference_networks/`
  (pandapower/IEEE/CIGRE), katalog `der_dynamic` i katalog 20 turbin,
  ewaluator NC RfG jako **struktura** (test catalog, ślad, raport, hash).
- **WYMIENIĆ (nie rozszerzać):** `stability_rms` w całości wraz z kontraktem —
  kontrakt zakodował model rozprzężony i zawiera cztery pola-phantomy;
  `frt_hvrt` w całości; `application/stability/dynamic_stability.py` jako
  ścieżkę równoległą; `_ride_through_test`, `_frequency_test`,
  `_reactive_current_test`, `_p_recovery_test` w części wytwarzającej wielkości.

**RECOMMENDED FIRST DECISION:** **D-00** — rozstrzygnięcie, czy do czasu naprawy
blokować albo jawnie oznaczać certyfikat zgodności NC RfG jako niedowodowy.
Uzasadnienie: to jedyne ryzyko, które materializuje się **bez żadnej dalszej pracy**
— dokument z werdyktem „zgodny", deterministycznym hashem i śladem White Box
zawierającym sfabrykowaną wielkość `U_sim` można wygenerować na HEAD już dziś,
dla modułu bez jednego parametru dynamicznego.

**RECOMMENDED FIRST FUTURE SLICE:** wycinek **α (Bezpiecznik dowodowy)**,
równolegle **β (Tryb REGULATORY_EVIDENCE)**. Oba **bez zależności od rdzenia
numerycznego**, oba adresują P0 o najwyższej wadze, oba w dużej mierze rozszerzają
mechanizmy, które już istnieją.

**B-01 DECISIONS REQUIRED:**
- `StabilitySolverInput` / `StabilityResult` (`stability_rms/contracts.py`) — FROZEN
- `FrtHvrtSolverInput` / `FrtHvrtResult` (`frt_hvrt/contracts.py`) — FROZEN
- `NcRfgPtpireeRunResult` (`contract: "NcRfgPtpireeTestResultV1"`) — kontrakt wersjonowany
- `resultset_v1_schema.json` — jeśli D-08 pójdzie w wariant (a)

**EXTERNAL DATA REQUIRED:**
- Parametry maszyn synchronicznych z kart producentów / protokołów pomiarowych
  (Xd, Xq, X'd, X'q, X''d, X''q, T'd0, T'q0, T''d0, T''q0, H, D, saturacja) —
  **żadna z tych wielkości nie istnieje dziś w repo**
- Nastawy AVR / governor / PSS dla agregatów referencyjnych
- Realne, zróżnicowane wymagania OSD (IRiESD Enea / Tauron / PGE / Energa, IRiESP PSE)
  wraz z datami obowiązywania — obecne profile są liczbowo jednym profilem
- Parametry pasm regulatorów falowników (PLL, pętla prądowa/napięciowa) —
  ten sam brak blokuje `Z_conv(jω)` w SSCI (dług D-03 w `STAN_REPO.md`)
- Karty katalogowe BESS: sprawności, granice SOC, ograniczenia energetyczne

**EXTERNAL VALIDATION REQUIRED:**
- PowerFactory jako wyrocznia podstawowa (rekomendacja D-11)
- Przypadki walidacyjne IEC 61400-27-1 dla wiatru Type 1–4
- Wyrocznie analityczne tam, gdzie istnieją (kryterium równych pól, CCT dla
  maszyny wobec sieci sztywnej) — najtańsza i najmocniejsza forma dowodu

**DOCUMENTS FABLE MUST UPDATE AFTER DECISION:**
- `mv-design-pro/STAN_REPO.md` — §2 twierdzi „Stabilność dynamiczna RMS — PODPIĘTE"
  wbrew kodowi; dopisać D-17… dla findingów P0 z §30
- `mv-design-pro/PLANS.md` — kolejka prac po decyzjach D-00…D-13
- `mv-design-pro/docs/uiux/INWENTARZ_FUNKCJI_2026-07.md` — pozycje FRT/HVRT
  i NC RfG wymagają korekty statusu (dziś oznaczone mocniej niż stan kodu)
- `mv-design-pro/docs/v12xx/REJESTR_KONFLIKTOW.md` — konflikt numeracji testów
  NC RfG (P0-11) i konflikt dwóch dokumentów LIVING (§29 poz. 2 vs 3)
- `mv-design-pro/docs/v12xx/REJESTR_DLUGU.md` — findingi P1
- `mv-design-pro/docs/analysis/NC_RFG_PTPiREE_TESTY_KANON.md` — ustalenie
  jednej numeracji testów
- `mv-design-pro/docs/audits/NCRFG_PTPiREE_TEST_REPORT_2026_01.md` — raport
  „20/20 zgodny" wymaga adnotacji o niefalsyfikowalności T14/T15
- `CLAUDE.md` — jeśli D-01 powoła strukturę programu

**CARDS FABLE SHOULD CREATE:** wg §34 (α…κ), po rozstrzygnięciu D-00…D-13.
Każda karta wg reguły KLASA, NIE INSTANCJA: inwentarz klasy przed naprawą,
testy jako iloczyn cech, predykaty parami z jednego źródła prawdy,
każda mocna deklaracja z przypiętym testem.

**UNRESOLVED (uczciwe granice tego audytu):**
1. Nie uruchomiono pełnej regresji pytest — kontener sesji nie miał kompletu
   zależności backendu. Wnioski o zachowaniu silników pochodzą z **uruchomienia
   samych silników w izolacji** (§15.4, §21.1) oraz z czytania kodu.
2. Nie wykonano oględzin wizualnych ekranów — to gate B-02 właściciela.
   Ocena UI opiera się na kontraktach TS i konsumentach API.
3. Nie ustalono, czy sfabrykowany werdykt T14/T15 trafił już do jakiegokolwiek
   dokumentu przekazanego operatorowi. **To pytanie do właściciela i ma
   pierwszeństwo przed pracą techniczną.**
4. Nie zweryfikowano, czy `pse.yaml` (dodatkowy punkt HVRT) jest zamierzoną
   różnicą, czy pozostałością — wymaga rozstrzygnięcia merytorycznego.
5. Zakres audytu nie objął EMT — system deklaruje wyłącznie RMS i ta granica
   nie była kwestionowana.

---

## 37. Werdykt końcowy — dojrzałość programu

**MAX DYNAMIC PROGRAM READINESS: 1 / 10** (szkielety)

Uzasadnienie oceny łącznej: poziom 2 („częściowe niezależne solvery") wymagałby,
aby istniejące moduły rozwiązywały fizykę w swoim zakresie. Żaden z trzech tego
nie robi: pierwszy nie czyta sieci i nie zamyka pętli regulacji, drugi nie modeluje
urządzenia, trzeci nie wykonuje obliczenia w kluczowym teście. Istnieją natomiast
kontrakty, integrator, katalog danych i wpięte UI — to jest więcej niż poziom 0.

| Oś | Ocena | Uzasadnienie z dowodem |
|---|---|---|
| **ARCHITECTURE** | **3** | Fundament realny: Ybus wystawiony, migawka z odciskiem, proweniencja, `TraceArtifactV2`. Ale dynamika omija cały ten fundament, a w systemie żyją dwie ścieżki stabilności i dwie implementacje NC RfG. |
| **PHYSICS** | **1** | Brak sprzężenia sieciowego (§12), brak inicjalizacji (§13), otwarte pętle regulacji (§6), `Pe = V·sin(δ)` bez reaktancji. |
| **SOURCE MODEL COVERAGE** | **1** | 19 nazw modeli → 8 równań; GFM≡GFL; wiatr 4 typy → 2 równania; rodzina synchroniczna nieobecna; BESS bez SOC; hybrydy i PPC nie istnieją. |
| **NUMERICS** | **2** | Trapezy niejawne z Newtonem napisane **poprawnie** — to realna wartość. Ale całkowany jest układ rozprzężonych równań skalarnych, a Jacobian ma wymiar 1–2. |
| **WOS / NC RfG** | **1** | Struktura ewaluatora dobra (katalog testów, ślad, hash, raport). Kluczowy test ride-through jest tautologią; numeracja rozjechana; profile operatorów liczbowo identyczne i nieaktualizowalne. |
| **READINESS** | **1** | `NOT_READY` nie występuje; rodzina synchroniczna dostaje „nie dotyczy"; deklaruje gotowość dla ścieżki bez implementacji. |
| **RESULT MODEL** | **2** | Kontrakty trajektorii istnieją. Ale nie ma f(t)/Efd(t)/Pm(t)/SOC(t), P(t) i Q(t) nie są wypełniane, ResultSet nie unosi czasu, dwa wyniki bez odcisku. |
| **PROOF** | **1** | Zero pakietów dynamicznych; dwa solvery bez śladu wbrew Core Rule #2; jedyny istniejący ślad zawiera wielkość sfabrykowaną. |
| **VALIDATION** | **1** | Dominują testy kontraktu i kształtu; zero wyroczni zewnętrznej dla dynamiki; brak testu równowagi i bilansu mocy. **Wyjątek: SSCI ma realne wyrocznie literaturowe (Sun 2011, Wen 2016) i zasługuje na ~4 osobno.** |
| **UI** | **3** | Ekran FRT, wykresy U(t)/P(t)/Iq(t) z obwiednią operatora i kreator OZE są realne, wpięte i przemyślane. Prezentują jednak treść, która nie jest wynikiem obliczenia. |

**Zdanie zamykające.** Największym ryzykiem tego systemu nie jest to, czego mu
brakuje — braki są normalnym stanem rozwijanego produktu i da się je zaplanować.
Ryzykiem jest to, że **część brakujących zdolności jest dziś raportowana jako
obecne**: nazwą w kontrakcie FROZEN, werdyktem „zgodny", deterministycznym hashem
i śladem White Box, który wygląda jak dowód. Cztery mechanizmy stworzone po to,
by budować zaufanie do wyniku, działają tu w przeciwną stronę. Dlatego rekomendacja
audytu stawia bezpiecznik dowodowy (D-00, wycinek α) **przed** jakąkolwiek pracą
nad rdzeniem numerycznym.

---

*Karta audytowa — AUDIT ONLY. Nie zmienia planu, kanonu, solverów ani kontraktów.
Wszystkie propozycje wycinków są NON-BINDING. Decyzja należy do Fable.*
