# KARTA ZADANIA D5 — DELTA BACKENDOWA: OBSZAR BEZPIECZNEJ PRACY P–Q WĘZŁA (P30)

**Faza:** U4 · **Epik:** E11 · **Wykonawca:** Opus · **Warstwa:** backend ·
**Wiążące:** CLAUDE.md (NOT-A-SOLVER: orkiestracja ISTNIEJĄCEGO rozpływu jak w D3;
WHITE BOX; determinizm twardy), wzorzec D3 (`application/analyses/hosting_capacity.py`
— ta sama ścieżka `_execute_power_flow` na przebiegu w pamięci + ocena
`EnergyValidationBuilder`).

## 1. Cel
Dla wskazanego węzła wyznacz OBSZAR dopuszczalnej pracy źródła w płaszczyźnie P–Q:
deterministyczna siatka scenariuszy — dla każdego kroku P (jak D3) skanuj Q w obu
kierunkach krokiem [Mvar] do pierwszego scenariusza niedopuszczalnego (kryteria
walidacji energetycznej: pasmo napięć, obciążalność — REUŻYJ konfiguracji jak D2/D3).
Generator próbny jak w D3, dodatkowo z zadanym q_mvar (ZBADAJ, jak mapowanie snapshotu
przenosi Q generatora — analogicznie do `bus_p += gen.p_mw` w D3; jeżeli mapowanie
NIE uwzględnia q_mvar generatora próbnego → STOP-RAPORT zamiast obejścia).
Wynik per węzeł: lista wierzchołków obszaru `(p_mw, q_min_dop_mvar, q_max_dop_mvar)`
+ per punkt granica wiążąca (element + rodzaj kontroli) + parametry siatki + hash
wejścia + ślad WHITE BOX zredukowany (liczba scenariuszy, granice per krok P — bez
zrzutu każdego biegu; pełne kroki tylko dla punktów granicznych).

## 2. Zakres
1. `application/analyses/pq_area.py` — serwis (parametry: bus_ref, krok P [MW],
   krok Q [Mvar], maks. kroków każdego wymiaru — jawne domyślne: 0,5 MW / 0,25 Mvar /
   20×16; limit łącznej liczby biegów udokumentowany).
2. Końcówka `GET /api/oze-analysis/pq-area?run_id=&bus_ref=&...` w
   `api/oze_analysis_runs.py` (konwencja D3; 404/422 PL).
3. Testy ≥ 14 (application+api; golden network): symetria/monotoniczność sensowna
   (Q_max_dop maleje przy dużym P), granice napięciowa vs obciążeniowa, determinizm,
   węzeł nieznany/parametry brzegowe, limit biegów.

## 3. Bramki
Jak D3: celowane + PEŁNY `poetry run pytest -q` ZERO failed (baza 5809);
ruff/black/mypy na twoich plikach; guardy arch/solver_boundary/pcc/
load_flow_no_heuristics (pipefail; przy >600 s odczytaj wynik po zakończeniu
i NATYCHMIAST commit+raport). Commit
`feat(api): obszar bezpiecznej pracy P–Q węzła — siatka scenariuszy rozpływu (D5)`
BEZ push. Raport standardowy.
