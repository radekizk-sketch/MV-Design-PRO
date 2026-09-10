# MV-DESIGN-PRO — ARCHITEKTURA DOBORU I OPTYMALIZACJI PROJEKTOWEJ (FAZA D, część 2; mandat §158)

> **Status od 2026-09-04 (kontrakt MAX PLATFORM):** materiał wejściowy i dowodowy programu konwergencji. Źródło kanoniczne architektury: `../architecture/PRODUCT_CAPABILITY_CONSTITUTION.md`, `../architecture/CAPABILITY_ARCHITECTURE_MATRIX.md`, `../architecture/CANONICAL_TWIN_ARCHITECTURE.md`, `../architecture/CONVERGENCE_ROADMAP.md`, `../architecture/DECISION_FREEZE_REGISTER.md`, `../reference-networks/REFERENCE_NETWORK_REGISTRY.md`, `../evidence/CONVERGENCE_EVIDENCE.md`. Przy rozbieżności obowiązuje dokument kanoniczny; w szczególności: nie powstaje nowa klasa `TwinModel` (Canonical Project Twin = rozwinięty ENM), `network_model` jest pochodnym IR, program nie zatrzymuje się po M0, lecz prowadzi konwergencję wycinkami CV-0…CV-6 z bramkami B-01/B-02 i procedurą kasacji.


**Status:** PROPOZYCJA (do przeglądu właściciela; nic nie jest wdrożone)
**Data:** 2026-09-02 · **Gałąź:** `claude/mv-design-pro-twin-audit-u4lhy0` · **HEAD audytu:** `a1ab2959`
**Źródła dowodowe:** A12 (W9 dobór, EF-011/014/016/019/022/037/041, kryterium „optymalny" nieokreślone), A5 (hosting capacity, threshold finder, dobór toru DER), A6 (katalog bez rewizji, ciche fallbacki), A3 (brak orkiestratora, wrażliwość jako perturbacje), A2 (what-if destrukcyjny, brak wariantów delta), A11 (dobór aparatu nN bez UI, I²t bez sprzężenia), A4 (koordynacja jako kalkulator).
**Relacja do mandatu:** §47–§56 (solvery ↔ decyzje projektowe; kandydaci/ograniczenia/ranking/uzasadnienie; impact preview), §57–§67 (optymalizacja, wrażliwość, hosting capacity, N-1, ekonomia, niezawodność), §137–§140 (walidacja vs ograniczenia), §158.
**Część 1 FAZY D** (snapshot, assembler, solvery, orkiestrator): `MV_DESIGN_PRO_SIMULATION_ARCHITECTURE.md`. Ten dokument opisuje warstwę **nad** solverami: ograniczenia, dobór, optymalizację, wyjaśnialność.

---

## 0. Diagnoza (skrót audytów)

| Fakt | Dowód |
|---|---|
| Dobór z kandydatami istnieje tylko w torze DER-SN (`der-selection-preview`: propozycja + `rejected[]` z `reason_code/reason_pl` + `formula_ref`) i w doborze kompensacji | `derSelectionApi.ts:71-137`; `ui2/oze/kompensacja` |
| Dobór aparatu nN (4 kryteria IEC 60364 + ranking) istnieje w backendzie bez konsumenta UI | `application/analyses/nn_device_selection.py`; grep w `ui/`, `ui2/` = 0 (EF-022) |
| Brak modułu doboru przekroju SN/nN (Ib/Iz′/ΔU/Ik/I²t); ΔU liczone z prądu wpisanego ręcznie; ocena „po fakcie" | `magistralaModel.ts:24-26`; `KreatorMagistralaSn.tsx:286-290` (EF-011/037) |
| TR dobierany po zgodności napięć i sortowaniu po mocy; brak modelu zapotrzebowania/jednoczesności | `stacjaModel.ts:415-429`; `simultaneity` tylko w DER (EF-014) |
| Hosting capacity: dwa silniki, threshold finder per szyna, bez Q(U), bez punktu przyłączenia jako obiektu | A5-09 |
| Wrażliwość = perturbacje proof-based, nie pochodne z Jacobianu | A3-16 |
| N-1 poza silnikiem scenariuszy, sekwencyjne, 2,64 s/kontyngencję, bez cache | A2-09, A3-10 |
| What-if = destrukcyjna edycja jedynego modelu; porównania tylko run-vs-run; brak wariantów delta | A2-14/15 (EF-043) |
| Wynik → urządzenie: 8 z 9 rodzajów przekroczeń prowadzi do akcji generycznej; brak wejścia w konfigurator | `akcjeNaprawcze.ts:125-135` (EF-036) |
| Kryterium „optymalny" (§181) nieokreślone: koszt? straty? minimalny spełniający? | A12 §8 pkt 3, pytanie 4 |
| `design_synth` (557 LOC) niewpięty; rekomendacje legacy (`analysis/recommendations`) na `study_scenario` bez trasy API | A9 §2.1; A4 §1.5 |
| Ciche fallbacki (`or 0.0`, `pk_kw: 0.0`, `k_sc 1.1`, `DEFAULT_LOAD_KW=30`) — każdy dobór na takich danych jest doborem na fabrykacji | A6-12 |

**Wniosek:** nie ma warstwy „decyzja projektowa"; istnieją wyspy. Docelowo: **jedna pętla decyzji** (kandydaci → ograniczenia → ranking → uzasadnienie → skutek → decyzja) dla każdej klasy doboru, zasilana wyłącznie wynikami solverów z orkiestratora i katalogiem z rewizją.

---

## 1. Inwarianty warstwy decyzji

| ID | Inwariant |
|---|---|
| O-01 | **Zero fizyki w warstwie decyzji.** Silnik doboru/optymalizacji nie liczy prądów, napięć ani impedancji — zamawia biegi przez `SolverOrchestrator` na scenariuszach-deltach i czyta `ResultSetV2`. Guard: `analysis/{constraints,sizing,optimization}` bez importów `numpy.linalg`/`scipy.sparse` i bez wzorów obwodowych (rozszerzenie `overlay_no_physics_guard`). |
| O-02 | **Zero heurystyk nienazwanych.** Każde kryterium rankingu ma identyfikator, źródło (norma/OSD/założenie projektu/decyzja właściciela) i jest widoczne w wyniku. Ranking bez źródła = błąd kontraktu. |
| O-03 | **Determinizm.** Ta sama migawka + ta sama rewizja katalogu + te same kryteria ⇒ identyczna lista kandydatów i kolejność (rozstrzyganie remisów po krotce celów, potem po stabilnym `catalog_item_id`). Hash wyniku doboru cytowany w dowodzie. |
| O-04 | **Brak danych = brak doboru, nigdy dobór na domyślnych.** Kandydaci obliczani na wartości podstawionej są oznaczeni `assumption_refs[]`; kryterium z brakującym wejściem daje `NIE_DO_USTALENIA`, nie PASS. |
| O-05 | **Ograniczenia mają klasę i źródło** (§137–§140): PHYSICS (niespełnialne — brak zbieżności, wyspa) ≠ NORMATIVE (IEC/PN-HD) ≠ POLICY (OSD/IRiESD) ≠ CONTRACT (warunki przyłączenia) ≠ PROJECT (założenia/rezerwy) ≠ DESIGN (decyzja inżyniera). Werdykt zawsze mówi, którą klasę narusza. |
| O-06 | **Wyjaśnialność** (§55): `Recommendation` niesie WHY THIS (spełnione ograniczenia z marginesem), WHY NOT OTHERS (`rejected[]` z kodem i wartością), WHAT CHANGES (`ImpactPreview`). |
| O-07 | **Nieniszczące what-if.** Każda ewaluacja kandydata to delta na rewizji (gałąź robocza), nigdy mutacja projektu bazowego; „Zastosuj" = komenda domenowa z rewizją i `DesignDecision`. |
| O-08 | **Kandydaci z rewizji katalogu** przypiętej do projektu (`CatalogRevision`), nigdy z „bieżącego" katalogu; dobór powtórzony po roku daje tę samą listę. |
| O-09 | **Wyniki decyzji są bytami** (`SizingResult`, `Recommendation`, `DesignDecision`) z provenance (migawka, biegi, katalog, kryteria) i podlegają świeżości jak wyniki. |
| O-10 | **Jedna pętla dla wszystkich klas doboru** — kabel SN, kabel nN, TR, aparat pola SN, aparat nN, CT, VT, kompensacja, tor DER, NOP/podział, zaczepy/Q. Nowa klasa doboru = nowy `SizingModule`, nie nowy ekran z własną logiką. |

---

## 2. Warstwa i miejsce w architekturze

```
analysis/
  constraints/     ConstraintEngine, ConstraintCatalog (NORMATIVE/POLICY/...), evaluators (czytają ResultSetV2)
  sizing/          SizingModule per klasa, CandidateGenerator, SizingService (pętla §3)
  optimization/    DesignOptimizationEngine, ThresholdFinder, SensitivityService, SwitchingOptimizer,
                   VoltVarOptimizer, ReinforcementPlanner, StandardizationService, EconomicModel, ReliabilityHooks
  recommendations/ Recommendation builder (WHY/WHY NOT/WHAT CHANGES), Remedy builder (dla werdyktu)
application/
  simulation/      SolverOrchestrator, ScenarioEngine (FAZA D cz. 1 / FAZA B) — jedyne wejście do solverów
```

Zależności: `analysis/*` → `application/simulation` (zamawia biegi) → `network_model/solvers`. Nigdy odwrotnie. Warstwa prezentacji (ui2) renderuje `SizingResult`/`Recommendation`; nie liczy.

---

## 3. `ConstraintEngine`

### 3.1 Obiekty

```
Constraint{ id, cls: PHYSICS|NORMATIVE|POLICY|CONTRACT|PROJECT|DESIGN,
            source_ref (norma+punkt / dokument OSD / założenie / decyzja),
            applies_to (selektor: klasa elementu, poziom napięcia, kontener, scenariusz),
            evaluator_id (funkcja czysta: ResultSetV2 + model → ConstraintVerdict),
            severity: BLOCKER|WARNING|INFO, remedy_kinds[] }
ConstraintVerdict{ constraint_id, element_ref, status: PASS|FAIL|NIE_DOTYCZY|NIE_DO_USTALENIA,
                   value, limit, margin, unit, why_pl, where (terminal/element/kontener),
                   inputs_provenance[] (jakie biegi, jakie założenia), assumption_refs[] }
ConstraintSet{ id, constraints[], derived_from: DefinitionOfDone|OSDProfile|ProjectAssumptions }
```

### 3.2 Katalog ograniczeń (wersja 1 — do zatwierdzenia z definicją gotowego, decyzja C-02)

| Klasa | Przykłady (źródło) |
|---|---|
| PHYSICS | rozpływ zbieżny; brak wyspy bez źródła; brak węzła bez ścieżki; Ybus osobliwa (z solvera — nie ocena, tylko fakt) |
| NORMATIVE | Iz′ (PN-HD 60364-5-52 + korekty), I2 ≤ 1,45·Iz′ (IEC 60364-4-43), SWZ czas wg IEC 60364-4-41 Tab. 41.1, I²t ≥ k²S² (IEC 60364-4-43/IEC 60949), Icu/Ics ≥ Ik″ (IEC 60947-2; IEC 62271-100), Idyn ≥ ip, Ith ≥ Ik·√(tk), c-factor (IEC 60909 Tab. 1), ΔU (PN-HD 60364-5-52 zał. G / warunki OSD), EN 50160 |
| POLICY | profile OSD: ΔU_max w sieci SN, Δt selektywności 0,3–0,5 s, I0> wg prądu pojemnościowego, nastawy 27/59/81/ROCOF per OSD (IRiESD), minimalne przekroje |
| CONTRACT | moc przyłączeniowa, cosφ, tryb pracy, Sk″ w punkcie przyłączenia, klasa modułu, wymagania zabezpieczeń (z `ConnectionConditions`) |
| PROJECT | rezerwy (TR 10 %, kabel 10 %, pole 10 %), k_j, temperatura/rezystywność, standard przekrojów (z `ProjectAssumptions`) |
| DESIGN | odstępstwo zaakceptowane przez inżyniera (`DesignDecision`) — zmienia status FAIL na ODSTĘPSTWO z uzasadnieniem, nigdy na PASS |

### 3.3 Reguły

- Ewaluator czyta **wyłącznie** `ResultSetV2` i model; nie przelicza fizyki (O-01). Ewaluator bez wymaganego biegu zwraca `NIE_DO_USTALENIA{missing_analysis}` i NBA dostaje akcję „policz".
- Ograniczenie ma dokładnie jedno źródło; te same wielkości z dwóch źródeł (np. ΔU normatywne 5 % i ΔU OSD 3 %) to **dwa** ograniczenia dwóch klas; werdykt pokazuje oba.
- `ConstraintSet` jest częścią definicji gotowego (workflow §2.2) i częścią provenance każdego werdyktu.
- Dzisiejsze `werdykt_projektowy.py` (10 kryteriów, 4 „poza automatem", 0 nN) staje się jednym z ewaluatorów, nie agregatorem.

---

## 4. Moduły doboru (`SizingModule`) — jedna pętla, dziesięć klas

### 4.1 Kontrakt

```
SizingRequest{ kind, element_ref|context (terminal, kontener), objective: MIN_FEASIBLE|MIN_COST|MIN_LOSSES|STANDARDIZE,
               scenario_refs[] (na jakich biegach), catalog_revision, assumptions_hash, filters (rodzina, producent) }
SizingResult{ request_hash, candidates[]: Candidate{ catalog_item_ref, constraints_checked[]: ConstraintVerdict,
              objective_values{...}, rank, why_pl[] }, rejected[]: Rejected{ catalog_item_ref, reason_code, reason_pl,
              failing_constraint_id, value, limit }, recommended: Candidate|None, assumption_refs[], provenance }
```

Ranking: filtr twardy (wszystkie NORMATIVE/CONTRACT/PHYSICS PASS) → sortowanie po krotce celów (`objective`) → remisy po `catalog_item_id`. Kandydat spełniający tylko z ODSTĘPSTWEM jest oznaczony, nie ukryty.

### 4.2 Klasy doboru

| Klasa | Wejścia (z modelu/biegów) | Ograniczenia | Istniejący kod do reużycia | Status |
|---|---|---|---|---|
| CABLE_SN | Ib (z LF lub zapotrzebowania), Ik″ i tk (SC + nastawy), długość, ułożenie, Un, cosφ | Iz′, ΔU, I²t, ekonomiczna gęstość (opcja, IEC 60287-3-2), minimalny przekrój OSD | `cable-voltage-drop-preview`, `lv_ampacity_iec60364_5_52` (nN), tablice SN w katalogu | NOWY moduł |
| CABLE_NN | jak wyżej + żyły (L/N/PE/PEN), układ sieci | Iz′, I2 ≤ 1,45·Iz′, ΔU per obwód, I²t, SWZ (pętla) | `fault_loop`, `swz`, `wspolczynniki_nn` | NOWY moduł (dziś ocena w kreatorze) |
| TRANSFORMER | zapotrzebowanie (Σ×k_j+rezerwa), Un/Un, wymagane uk (Ik nN), regulacja | obciążenie ≤ limit, uk zakres, Ik nN ≤ Icu aparatów nN, straty (opcja) | `transformer-rated-currents-preview`, filtr napięć w `stacjaModel.ts` (→ backend) | NOWY moduł |
| FIELD_APPARATUS_SN | Un, Ib, Ik″, ip, Ith, tk, rodzaj pola | Um, In ≥ Ib, Icu/Isc, Idyn, Ith, klasa E/M/C (po uzupełnieniu katalogu — A4-11) | `der_selection_preview.field_apparatus`, `equipment_proof`, `audit2_catalogs.ocen_wytrzymalosc_aparatu` | UOGÓLNIĆ (dziś tylko DER) |
| DEVICE_NN | Ib, Iz′, Ik″max/min, SWZ | 4 kryteria IEC 60364 + selektywność (tabele) | `nn_device_selection.py` (KEEP, wpiąć w UI) | UI + selektywność |
| CT | In pola, Ik″, obciążenie wtórne, funkcje odbiorników rdzeni | 8 kryteriów (`dobor_przekladnika`), nasycenie (ALF_eff) | `dobor_przekladnika.py`, `ct_burden_saturation` (KEEP) | UOGÓLNIĆ na każde pole (dziś tylko wytwórca) |
| VT | Un, obciążenie, 3U0 | 6 kryteriów + spadek w obwodzie | `dobor_przekladnika.py`, `vt_burden_voltage_drop` (KEEP) | UOGÓLNIĆ |
| COMPENSATION | bilans Q z LF, cosφ wymagany | cosφ ∈ zakres, rezonans (opcja), stopnie | `dobor_kompensacji` (KEEP) | dopiąć do pętli |
| DER_PATH | jak dziś (TR blokowy + kabel + aparat) | jak dziś | `der_selection_preview` (KEEP — wzorzec) | przenieść na wspólny kontrakt |
| NOP / SECTIONING | rozpływy per kandydat NOP | straty, prądy wyrównawcze, N-1, ΔU | `kontyngencje_n1`, LF | NOWY (optymalizacja §5.4) |

---

## 5. `DesignOptimizationEngine`

### 5.0 Polityka projektowa domyślna ≠ definicja optimum (korekta właściciela D-23)

Rekomendacja „optymalny = minimalny spełniający + rezerwa + standaryzacja" została **odrzucona jako definicja optimum**. Jest to `DEFAULT_DESIGN_POLICY` — polityka domyślna projektu, jawnie nazwana, edytowalna i wymienialna — a nie prawda o tym, co jest optymalne. Optimum jest **wielokryterialne** i zależy od celu inwestycyjnego, którego silnik nie zna i nie ma prawa zgadywać.

Osiem osi celu (`ObjectiveAxis`), każda z jawnym kierunkiem i źródłem wartości:

| Oś | Kierunek | Skąd wartość | Aktywna gdy |
|---|---|---|---|
| `TECHNICAL_FEASIBILITY` | twarde spełnienie | `ConstraintEngine` (PHYSICS + NORMATIVE) | zawsze — warunek dopuszczalności, nie cel do ważenia |
| `CAPEX` | min | `CostCatalog` z provenance | istnieją dane kosztowe |
| `LOSSES` | min | solver LF (energia strat wg profilu) | istnieje profil obciążenia |
| `RESERVE` | max lub cel | rezerwa obciążalności / mocy / zwarciowa z migawki | zawsze |
| `STANDARDIZATION` | max | liczba różnych typów w projekcie vs lista standardowa OSD | istnieje lista standardowa |
| `N_1` | twarde lub max margines | scenariusze N-1 | zdefiniowany zbiór N-1 |
| `RELIABILITY` | max (SAIDI/SAIFI/ENS min) | `ReliabilityHooks` | istnieją dane λ, r |
| `FUTURE_EXPANSION` | max | horyzont rozbudowy z `ProjectAssumptions` | zadeklarowany horyzont |

Reguły silnika: (1) `TECHNICAL_FEASIBILITY` nigdy nie wchodzi do funkcji celu — kandydat niedopuszczalny jest odrzucany, nie „gorzej oceniany"; (2) dla ≥ 2 aktywnych osi wynikiem jest **front Pareto**, nie jedna liczba — zakaz ukrytej sumy ważonej; (3) wagi, jeśli inżynier je poda, są jawnym wejściem projektu z provenance i są pokazywane w rekomendacji; (4) `DEFAULT_DESIGN_POLICY` jest tylko preselekcją punktu na froncie — inżynier widzi front i punkt domyślny, i może wybrać inny; (5) oś bez danych jest **nieaktywna i widoczna jako nieaktywna** (z powodem), nigdy wypełniona wartością domyślną; (6) `Recommendation` zawsze niesie oś, po której wybrano, oraz odrzuconych kandydatów z powodem.

### 5.1 Problem i strategie

```
OptimizationProblem{ decision_variables[]: (element_ref, domain: CATALOG_CHOICE|SWITCH_STATE|TAP_POSITION|Q_SETPOINT|PLACEMENT),
                     objectives[]: {id, direction, source_ref}, constraint_set, scenario_refs[] (np. max/min obciążenie, N-1),
                     strategy: ENUMERATE|GREEDY_STANDARDIZE|BISECTION|PARETO|COORDINATE_DESCENT, budget (liczba biegów, czas) }
OptimizationResult{ problem_hash, evaluated[]: {assignment, objective_values, verdicts}, pareto_front[]|best,
                    recommendation: Recommendation, provenance, budget_used }
```

Strategie są **jawne i deterministyczne**; nie ma metaheurystyk losowych (determinizm O-03). Dla dyskretnych, małych przestrzeni (typ kabla w ciągu, TR w stacji) — enumeracja z odcięciem po ograniczeniach twardych; dla wielu zmiennych — koordynatowe zejście z ustaloną kolejnością; dla progów — bisekcja; dla wielu celów — front Pareto z jawnymi celami (koszt, straty, margines ΔU) i decyzją inżyniera, nigdy ukryta suma ważona.

### 5.2 Ewaluacja kandydatów

Każde przypisanie zmiennych = `Scenario` (typowana delta: `CATALOG_REBIND`, `SWITCH_STATE`, `TAP_POSITION`, `Q_SETPOINT`) na gałęzi roboczej; `SolverOrchestrator` liczy plan (LF/SC/N-1 wg potrzeb ograniczeń) z cache po `(snapshot_hash, delta_hash, analysis, options)`; wynik → `ConstraintEngine` → wartości celów. Budżet biegów jest częścią problemu i wyniku (uczciwość: „przeszukano 24 z 24" albo „12 z 240, odcięcie po ograniczeniu X").

### 5.3 Threshold finder (uogólnienie hosting capacity — §61–§62)

`ThresholdFinder(parameter: P_DER@terminal | S_load@bus | length | ..., criterion_set, method: BISECTION, tolerance)` → maksymalna wartość parametru spełniająca kryteria + kryterium ograniczające + wartość graniczna. Dzisiejszy threshold finder per szyna (A5-09) staje się instancją tego mechanizmu na `GridConnectionPoint` (terminal), z Q(U)/cosφ(P) z katalogu falownika aktywnymi w rozpływie (A5-03) i z profilem 1-fazowych prosumentów (po wdrożeniu rozpływu 4-przewodowego nN).

### 5.4 Optymalizacja łączeniowa (NOP / podział sieci / rekonfiguracja)

Zmienne: stany łączników kandydujących (delta `SWITCH_STATE`), ograniczenie radialności (z `TopologyService`), cele: straty, prądy wyrównawcze, margines ΔU, N-1 (możliwość zasilenia rezerwowego z czasem przełączenia). Enumeracja po kandydatach NOP w pierścieniu (liczba łączników), N-1 z cache faktoryzacji. Wynik: ranking konfiguracji + SLD różnicowy.

### 5.5 Regulacja napięcia i mocy biernej (zaczepy, kompensacja, tryby Q DER)

Zmienne: pozycje zaczepów OLTC/DETC, stopnie baterii, tryby Q falowników (z katalogu); cele: profil napięcia w paśmie, straty, cosφ w punkcie przyłączenia; scenariusze: max/min obciążenie, max generacja. Koordynatowe zejście po zmiennych w ustalonej kolejności (TR → baterie → DER). Wynik: rekomendowane nastawy + tabela skutków per scenariusz.

### 5.6 Planer wzmocnień (reinforcement planner)

Wejście: naruszenia z werdyktu (N-1, ΔU, przeciążenia); zmienne: wymiana przekroju odcinka, dodanie odcinka (pierścień), wymiana TR, dodanie stacji; strategia: zachłanna po „naruszenie o największym marginesie ujemnym → najtańsze remedium usuwające je" z ponowną ewaluacją; wynik: uporządkowana lista wzmocnień z kosztem skumulowanym i skutkiem.

### 5.7 Wrażliwość (§63)

Pochodne ∂V/∂P, ∂V/∂Q, ∂I/∂P z Jacobianu ostatniej iteracji (solver eksportuje je w śladzie WHITE BOX — rozszerzenie kontraktu addytywne), nie perturbacje proof-based (A3-16). `SensitivityService` mapuje je na elementy (który odbiór/źródło najbardziej wpływa na naruszenie) i zasila ranking remediów.

### 5.8 Standaryzacja

`StandardizationService`: dla klasy elementów (kable ciągu, TR stacji w ciągu, aparaty rozdzielnicy) proponuje najmniejszy zbiór typów spełniający wszystkie ograniczenia z marginesem, z kosztem nadmiaru (przewymiarowanie) — cel jawny, decyzja inżyniera.

### 5.9 Model ekonomiczny (§64–§65) — gotowość, nie kompletność

`CostCatalog` (koszt jednostkowy pozycji katalogu, koszt ułożenia per m, koszt stacji) jako dane katalogu z provenance i rewizją; `LossValuation` (cena energii, czas strat maksymalnych τ); NPV opcjonalny. Bez danych kosztowych cel MIN_COST jest `NIE_DO_USTALENIA` (O-04). Dane kosztowe = decyzja właściciela (O-D2).

### 5.10 Niezawodność (§66) — „reliability-ready"

Zaczepy: `OutageData` (λ, r per typ elementu) jako opcjonalne dane katalogu; `ReliabilityHooks` liczą SAIDI/SAIFI/ENS na podstawie stref zasilania z `TopologyService` i czasów przełączeń (z automatyki/ręczne) — tylko gdy dane istnieją. Bez danych: brak wskaźników, nie wskaźniki z domyślnych.

---

## 6. Impact preview (§56) i remedia

`ImpactPreview(operation|scenario)`: delta na gałęzi roboczej + ograniczony plan (LF, SC 3F max, opcjonalnie SC min) + diff względem bazy: ΔU per szyna (max zmiana), ΔIk per szyna, obciążenia gałęzi, lista unieważnionych analiz i dokumentów (z grafu zależności), lista naruszeń nowych/usuniętych. Reużycie: `dry_run` stacji (topologia, `halves`, `invalidated_results`) — rozszerzony o skutki elektryczne. Każdy `Remedy` w werdykcie może zamówić `ImpactPreview` na żądanie (koszt jawny).

`Recommendation{ subject_ref, kind, chosen: Candidate, alternatives[]: Candidate, rejected[], why_pl[], why_not_pl[], impact: ImpactPreview|None, constraint_set_ref, provenance, hash }` — kontrakt czytany przez kreator, inspektor, werdykt i raport (rozdział „Dobór i decyzje").

---

## 7. Integracja z workflowem

| Wejście | Co się dzieje |
|---|---|
| Kreator (W3/W4/W5/W6/W7/W10) | pole doboru pokazuje `SizingResult` z kontekstu (Ib/Ik z ostatnich biegów lub z zapotrzebowania z oznaczeniem „wstępny"); wybór = wartość pola |
| Wynik/przekroczenie (W13) | `Remedy[]` per FAIL; „Zmień typ (kandydaci)" otwiera `SizingResult` dla elementu; „Co się zmieni" = `ImpactPreview` |
| Inspektor (akcja SIZE/REPLACE) | to samo `SizingResult` |
| Command Center „Porównaj" | warianty delta, front Pareto, ranking konfiguracji |
| Raport | rozdział „Dobór" z kandydatami/odrzuconymi (jak DER-SN dziś), rejestr decyzji |

---

## 8. Determinizm, testy, guardy

- Test klasy: dla każdej sieci rejestru × każdej klasy doboru: (a) wynik identyczny w dwóch przebiegach i między procesami; (b) kandydat rekomendowany spełnia wszystkie ograniczenia twarde; (c) każdy odrzucony ma `failing_constraint_id`; (d) brak danych wejściowych ⇒ `NIE_DO_USTALENIA`, nie PASS (iloczyn: klasa doboru × brakujące wejście).
- Test tożsamości z istniejącymi modułami (charakteryzacja): `der_selection_preview`, `nn_device_selection`, `dobor_kompensacji`, `dobor_przekladnika` dają po migracji identyczne rekomendacje na złotych sieciach.
- Guard: `analysis/{constraints,sizing,optimization,recommendations}` bez fizyki (wzorce jak `overlay_no_physics_guard`) i bez literałów liczbowych poza rejestrem stałych normatywnych (rozszerzenie `solver_input_substitute_guard` na tę warstwę).
- Guard: każda `Constraint` w katalogu ma `source_ref` niepusty i test.

---

## 9. Mapowanie stanu obecnego → docelowego

| Dziś | Los | Docelowo |
|---|---|---|
| `der_selection_preview.py` (+ `der_sn_validation.py`) | KEEP → adapter do `SizingModule.DER_PATH` | wspólny kontrakt `SizingResult` |
| `nn_device_selection.py` | KEEP → `SizingModule.DEVICE_NN` + UI | — |
| `dobor_kompensacji`, `dobor_przekladnika.py`, `ct_burden_saturation`, `vt_burden_voltage_drop` | KEEP → moduły | — |
| `hosting_capacity` (2 silniki) | REPLACE jednym `ThresholdFinder` na terminalu | A5-09 |
| `analysis/lf_sensitivity` (perturbacje) | REPLACE pochodnymi z Jacobianu | A3-16 |
| `kontyngencje_n1.py` | KEEP algorytm → `SolverOrchestrator` serie z cache; wynik do `ConstraintEngine` | A2-09 |
| `werdykt_projektowy.py` | REPLACE agregator → ewaluatory `ConstraintEngine` + `Remedy` | EF-047/048 |
| `analysis/recommendations` (legacy, `study_scenario`) | DELETE (bez trasy API; semantyka w `Recommendation`) | A4 §1.5 |
| `application/analyses/design_synth` (557 LOC, niewpięty) | DELETE lub wchłonąć do `ReinforcementPlanner` po przeglądzie | A9 §2.1 |
| filtr TR w `stacjaModel.ts:415-429`, `ocenaDoboru` w `KreatorMagistralaSn.tsx` | DELETE (logika doboru w UI) | `SizingResult` z backendu |
| `dry_run` stacji | KEEP → `ImpactPreview` | EF-015 |

---

## 10. Decyzje wymagające właściciela

| ID | Decyzja | Rekomendacja |
|---|---|---|
| O-D1 | Kryterium „optymalny" (patrz C-05 w workflow): domyślny cel doboru | **ROZSTRZYGNIĘTE przez właściciela (D-23): odrzucone w formie jednokryterialnej.** `DEFAULT_DESIGN_POLICY` = minimalny spełniający + rezerwa + standaryzacja, jako polityka domyślna i preselekcja punktu; definicja optimum jest wielokryterialna (osiem osi §5.0) z frontem Pareto dla ≥ 2 aktywnych osi |
| O-D2 | Dane kosztowe: skąd `CostCatalog` (cenniki producentów/OSD/własne) i kto je utrzymuje | katalog kosztów użytkownika z provenance; bez danych cel kosztowy nieaktywny |
| O-D3 | Dane niezawodnościowe (λ, r) — czy w ogóle w wersji 1 | zaczepy w wersji 1, wskaźniki dopiero z danymi |
| O-D4 | Ekonomiczna gęstość prądu (IEC 60287-3-2) jako kryterium doboru kabli SN | opcjonalne kryterium POLICY/PROJECT, domyślnie wyłączone |
| O-D5 | Budżet biegów dla optymalizacji łączeniowej i planera (np. ≤ 200 biegów LF / zadanie) | budżet jawny w problemie; przekroczenie = wynik częściowy oznaczony |
| O-D6 | Czy front Pareto ma być prezentowany inżynierowi, czy tylko zalecenie z jednym celem | Pareto dla ≥ 2 celów, zawsze z decyzją inżyniera |
