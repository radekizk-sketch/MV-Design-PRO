# KARTA ZADANIA D9 — DELTA BACKENDOWA: SEKWENCJE ZAPADÓW FRT + KONTEKST SŁABEJ SIECI (P43)

**Faza:** U4 · **Epik:** E11 · **Wykonawca:** Opus · **Warstwa:** backend ·
**Wiążące:** CLAUDE.md (NOT-A-SOLVER: solver FRT/HVRT jest FROZEN — ZERO zmian w
`network_model/solvers/frt_hvrt/**`; orkiestracja jak D6; No-Heuristics; WHITE BOX),
wzorce: `application/analyses/frt_trajektorie.py` (D6),
`application/analyses/grid_strength.py` (D1), `api/oze_analysis_runs.py` (rodzina).

## 0. Rozstrzygnięcia zarządcy (WIĄŻĄCE — z rekonesansu)
1. Solver `FrtHvrtSolverAdapter` przyjmuje LISTĘ scenariuszy
   (`FrtHvrtSolverInput.scenarios`, `network_model/solvers/frt_hvrt/contracts.py:21-27`),
   każdy scenariusz = POJEDYNCZY zapad. Sekwencja wielokrotnych zapadów =
   N scenariuszy w JEDNYM wejściu solvera; solver liczy każdy zapad od stanu
   ustalonego. OGRANICZENIE (udokumentuj w docstringu serwisu i w polu odpowiedzi
   `zalozenia_pl`): stan modułu MIĘDZY zapadami (nagrzewanie, odzysk niepełny)
   NIE jest modelowany — każdy zapad oceniany niezależnie; werdykt sekwencji =
   koniunkcja werdyktów zapadów. To kompozycja wyników solvera (interpretacja),
   nie nowa fizyka.
2. Wsparcie ride-through z magazynu (część P43) — POZA ZAKRESEM: wymaga modelu
   magazynu w solverze FRT (FROZEN). NIE implementuj żadnej namiastki; zakres
   odnotowany w PLANS przez zarządcę.
3. Kontekst słabej sieci: reużyj `build_grid_strength_view`
   (`application/analyses/grid_strength.py:128`) — opcjonalne parametry
   `run_id` (przebieg zwarciowy) + `bus_ref` (punkt przyłączenia); jeżeli podane,
   dołącz wiersz SCR/WSCR tego węzła jako sekcję `kontekst_sily_sieci` (klasyfikacja
   słaba/silna sieć Z WIDOKU D1, zero własnej oceny). Bez parametrów — uczciwe
   `kontekst_sily_sieci: null` + powód PL.

## 1. Cel
Ocena zachowania modułu DER przy SEKWENCJI wielokrotnych zapadów napięcia
(profil operatora NC RfG jako obwiednia — jak D6) z kontekstem siły sieci (SCR)
w punkcie przyłączenia. Zapady definiowane parametrycznie przez wywołującego
(głębokość p.u. + czas trwania s), walidacja zakresów przez `validate_input`
solvera (LVRT 0..1); budowa wejścia: NOWA funkcja w
`application/ncrfg_compliance/frt_input.py` (np. `build_frt_sekwencja_input`)
komponująca `FrtScenario` z niestandardową głębokością/czasem — bez dotykania
istniejącej `build_frt_hvrt_input` (`frt_input.py:23`, używana przez checker).

## 2. Zakres
1. `application/analyses/frt_sekwencja.py` — serwis
   `build_frt_sekwencja_view(converter, profile, zapady, *, grid_strength_row=None)`:
   - `zapady`: lista par (głębokość_pu, czas_s), kolejność wywołującego zachowana
     (determinizm), ≥1 zapad, limit rozsądny (np. ≤10 → ValueError PL);
   - odpowiedź: `modul_der`, `operator`, obwiednia LVRT (jak D6), lista
     `zapady[]` (parametry + werdykt PL per zapad z pól solvera — reużyj konwencję
     `_verdict_pl` z D6), `werdykt_sekwencji_pl` (koniunkcja: „sekwencja w obwiedni"
     / „sekwencja niezaliczona — zapad N"), `zalozenia_pl` (ograniczenie z §0.1),
     `kontekst_sily_sieci` (§0.3 lub null + powód), `input_hash` (SHA-256),
     ślad WHITE BOX (parametry wejścia solvera per zapad).
2. Końcówka `GET /api/oze-analysis/frt-sequence?der_ref=&operator_id=&sekwencja=`
   (+ opcjonalne `run_id`, `bus_ref`); format `sekwencja`: pary
   `głębokość:czas` rozdzielone przecinkami, np. `0.05:0.15,0.30:0.20`
   (kropka dziesiętna w API; 422 PL przy błędzie parsowania/zakresu);
   404/422 PL wg konwencji rodziny (`api/oze_analysis_runs.py:165-190` jako wzór).
3. Testy ≥ 12 w `tests/application/analyses/test_frt_sekwencja.py` (+ testy API
   w konwencji rodziny): sekwencja 2–3 zapadów z werdyktami per zapad, koniunkcja
   (jeden zapad poza obwiednią → sekwencja niezaliczona z numerem zapadu),
   determinizm (ten sam input → identyczny wynik + hash), kontekst SCR dołączony
   przy przebiegu zwarciowym (golden network jak testy D1), uczciwy null bez
   run_id, 404 nieznany moduł/operator, 422 zły format `sekwencja`, 422 głębokość
   poza 0..1, ValueError przy pustej/za długiej sekwencji.

## 3. Bramki
KROK 0: `git fetch origin claude/power-network-design-ui-ir91mv && git reset --hard
FETCH_HEAD` — oczekiwany HEAD `7e8eebc`. Baza pełnego pytest: 5915 passed, ZERO
failed (zmierz przed zmianami przy wątpliwości). Celowane + PEŁNY pytest ZERO
failed; ruff/black/mypy na twoich plikach; guardy arch/solver_boundary/pcc/
load_flow_no_heuristics (pipefail; przy >600 s odczytaj wynik i NATYCHMIAST
commit+raport). ZERO zmian w `network_model/solvers/**`, `enm/**` poza odczytem.
Commit `feat(api): sekwencje zapadów FRT z kontekstem siły sieci (D9)` BEZ push.
Raport standardowy z rozstrzygnięciami recon (plik:linia).
