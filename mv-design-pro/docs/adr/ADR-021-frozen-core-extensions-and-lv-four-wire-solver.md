# ADR-021: Rozszerzenia zamrożonych rdzeni (bramka B-01) i nowy solver nN 4-przewodowy

**Status:** ACCEPTED (2026-09-30, decyzja doradcy z delegacją właściciela O-59 — rejestr O-63 w `docs/plan/PLAN_AB_DYNAMIKA_A_B_2026-09.md` §2.3; z korektą zakresu (klaster A, O-64/O-66/O-72): K1 ABCN bez zmian, P0; K2 bez domyślki `ith_n_assumed=1` — reguła strukturalna + blokada autorytetu SI-117+; K3 (szyny PV) SKREŚLONA — mechanizm istnieje w rdzeniu (`power_flow_newton_internal.py:813-828`), histereza PQ→PV = AB-3 (O-9); K4 udziały wyłącznie jawne z case config; K5 opt-in; zgody B-01 wydane w ramach O-59 z reduce-to-NR i wyrocznią per pozycja)
**Data:** 2026-09-02
**Dokument źródłowy:** `../twin/MV_DESIGN_PRO_SIMULATION_ARCHITECTURE.md` §3.3, §4, §5.1–§5.3, §11

## Kontekst
Rdzenie IEC 60909 i NR są FROZEN; audyt wykazał: Ith tylko dla n=1, kanoniczny PF nie buduje szyn PV, wiele źródeł = wiele węzłów SLACK z równaniem tylko dla pierwszego, algebra gęsta (76 % czasu PF w jakobianie, SC O(N·n³)), FDLF nie zbiega na kablach nN, rozpływ niesymetryczny nN odcięty (A3-03/04/05/10, A11-11).

## Decyzja
Rozszerzenia rdzeni wyłącznie przez ten ADR i bramkę B-01, każde jako **addytywna** ścieżka z testem tożsamości dla przypadku bazowego: (1) Ith z n ≠ 1 (IEC 60909-0 §4.8) jako parametr, (2) szyny PV i regulacja Q w NR, (3) slack rozproszony / wiele źródeł sieciowych z udziałami, (4) wspólne jądro admitancji i algebra rzadka (`scipy.sparse` + `splu`; kolumny selektywne w SC). Nowy solver nN 4-przewodowy (current-injection/BFS ABCN) jako **osobny** solver (nie modyfikacja NR), walidowany krzyżowo (pandapower/OpenDSS) na sieci wzorcowej nN.

## Konsekwencje
- `solver_diff_guard` i golden wyniki bazowe nietknięte (bit-identyczność dla dotychczasowych przypadków); nowe przypadki z własnymi goldenami.
- FDLF pozostaje dla SN; dla nN zastępowany nowym solverem; „BFS-wyspa kasowana” doprecyzowane (O-64): BFS = `power_flow_unbalanced.py:2` (Backward/Forward Sweep), dziś ścieżka PRODUKCYJNA (`canonical_analysis.py:536` `ANALYSIS_TYPE_ROZPLYW_NIESYMETRYCZNY`, W5-D wykonane) — K1 najpierw migruje konsumentów (`canonical_analysis`, `api/analysis_runs`, `api/canonical_run_views`, `api/analysis_run_exports`, `enm/rozplyw_niesymetryczny_wynik`) na ABCN z parytetem per faza, potem kasuje; „P10” z `../architecture/CANONICAL_TWIN_ARCHITECTURE.md` wskazuje `application/reference_networks/**`, nieobecne w `backend/src` — NIEZMIERZONE, karta K1 mierzy.

## Korekta zakresu przy przyjęciu (2026-09-30, O-59/O-63; klaster solverów B-01)
- **K1 (ABCN)** — bez zmian, P0: nowy plik `solvers/lv_four_wire_abcn.py`, WATCHED_PATHS, `ieee_13/34` PLANNED→BUILT (0,1 % |U|, 0,5 % |I| per faza), White Box Y_abcn, I_N, U_N-E; po PF-OD19.
- **K2 (I_th, n)** — BEZ domyślki `ith_n_assumed=1`: n = 1 jest regułą normy dla zwarć daleko od generatora (`short_circuit_core.py:142`) stosowaną z konstrukcji, gdy model nie ma maszyn synchronicznych (provenance `ith_n_podstawa`); model z maszyną synchroniczną → I_th ROBOCZY z kodem `sc.ith_n_blisko_generatora_brak_krzywych` i blokadą autorytetu SI-117+ w `network_model/core/zdolnosci_wkladu_zwarciowego.py` (O-66), bo krzywych n i kryterium bliskości nie ma w repo (dane właściciela P-A); po OD-14; test iloczynu {bez maszyn, z maszyną} × {3F, 2F, 1F, 2FE} × {konsument autorytetu}.
- **K3 (szyny PV) — SKREŚLONA**: przełączanie PV→PQ z granicami Q z `PVSpec` już jest w rdzeniu (`power_flow_newton_internal.py:813-828`, ślad `pv_to_pq_switches :791`); powrotu PQ→PV nie ma i wg O-9 jest zakresem AB-3 — nie dublować.
- **K4 (slack rozproszony)** — udziały wyłącznie jawne z case config, brak lub suma ≠ 1 → odmowa nazwana; działa WEWNĄTRZ wyspy zasilonej (partycja per wyspa istnieje: `assembler.py:441-446`); identyfikatory bez wzorców guarda NH-05 (`scripts/load_flow_no_heuristics_guard.py:43`); po PF-OD19; jeden slack bit w bit.
- **K5 (algebra rzadka)** — opt-in; parytet bitowy dotyczy ścieżki domyślnej, ścieżka rzadka ma własne goldeny z zadeklarowaną tolerancją (1e-9 względem gęstej; pomiar n ∈ {50, 500, 2000}).
- Kody blokady K2/OD-14: SI-117/SI-118 w tym samym pliku co SI-110…SI-116 (`zdolnosci_wkladu_zwarciowego.py:83-103`).

## Alternatywy odrzucone
- Rozszerzenie NR o model fazowy: ryzyko w rdzeniu FROZEN i gorsza zbieżność dla nN.
