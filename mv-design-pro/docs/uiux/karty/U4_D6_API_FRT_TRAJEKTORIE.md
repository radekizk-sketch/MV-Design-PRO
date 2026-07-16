# KARTA ZADANIA D6 — DELTA BACKENDOWA: API TRAJEKTORII FRT/HVRT Z OBWIEDNIĄ (P38)

**Faza:** U4 · **Epik:** E11 · **Wykonawca:** Opus · **Warstwa:** backend ·
**Wiążące:** CLAUDE.md (FROZEN API solvera FRT — `network_model/solvers/frt_hvrt/
contracts.py` NIETYKALNE; NOT-A-SOLVER), wzorzec D1/D2 (`api/oze_analysis_runs.py`).

## 1. Cel (pod okno P38 — „model odzwierciedla urządzenie")
Wystawić przez API bieg solvera FRT/HVRT dla modułu z trajektoriami i obwiednią
profilu operatora:
1. **RECON WIĄŻĄCY**: ZBADAJ, jak `application/ncrfg_compliance/checker.py` buduje
   `FrtHvrtSolverInput` (skąd enm_ref, scenariusze, profil operatora z krzywą
   LVRT/HVRT — `catalog/profiles/nc_rfg`) i czy istnieje już jakakolwiek ekspozycja
   trajektorii. REUŻYJ tej ścieżki 1:1 w nowym serwisie
   `application/analyses/frt_trajektorie.py` (zero duplikacji budowy wejścia — jeżeli
   checker ma prywatną logikę budowy, wydziel ją do reużycia BEZ zmiany zachowania
   checkera; testy checkera muszą przejść bez zmiany intencji).
2. Końcówka `GET /api/oze-analysis/frt-trajectories?der_ref=&operator_id=&test_kind=`
   (lvrt|hvrt): odpowiedź = scenariusze z `FrtScenarioResult` (status, stayed_connected,
   trajectory, margin_to_curve_s/pu, p_recovery_time_s) + OBWIEDNIA profilu operatora
   (punkty krzywej czas→napięcie z profilu NC RfG — kształt ZBADAJ w loaderze) +
   werdykt PL per scenariusz („w obwiedni"/„poza obwiednią"/„moduł wypadł") wyłącznie
   z pól solvera (margin/stayed_connected — bez własnej oceny numerycznej).
3. Testy ≥ 12 (application+api; golden/reference z DER): trajektoria niepusta,
   obwiednia z profilu, werdykty PL z pól solvera, determinizm, 404/422
   (nieznany DER/operator, zły test_kind).

## 2. Bramki
Jak D1–D5: celowane + PEŁNY `poetry run pytest -q` ZERO failed (baza 5839);
ruff/black/mypy na twoich plikach; guardy arch/solver_boundary/pcc (pipefail;
przy >600 s odczytaj wynik po zakończeniu i NATYCHMIAST commit+raport).
Commit `feat(api): trajektorie FRT/HVRT z obwiednią profilu operatora (D6)` BEZ push.
Raport standardowy z mapowaniami plik:linia (w tym rozstrzygnięcie recon).
