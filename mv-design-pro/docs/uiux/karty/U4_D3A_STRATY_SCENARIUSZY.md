# KARTA ZADANIA D3a — DELTA ADDYTYWNA: STRATY I NAPIĘCIE W SCENARIUSZACH HOSTING CAPACITY

**Faza:** U4 · **Epik:** E11 · **Wykonawca:** Sonnet · **Warstwa:** backend ·
**Wiążące:** CLAUDE.md (NOT-A-SOLVER, determinizm), wzorzec D3
(`application/analyses/hosting_capacity.py`).

## 1. Cel (pod P19 — ranking punktów przyłączenia)
Rozszerzyć ODPOWIEDŹ hosting-capacity o dane potrzebne do rankingu kandydatów —
ADDYTYWNIE (bez zmiany istniejących pól; testy D3 muszą przejść bez zmiany intencji):
1. Per scenariusz: `total_losses_p_mw` (suma strat czynnych z wyniku rozpływu scenariusza
   — ZBADAJ skąd D2/energy_validation czyta straty; reużyj tej samej ścieżki) oraz
   `min_voltage_pu`/`max_voltage_pu` (skrajne napięcia sieci w scenariuszu).
2. Per węzeł: `losses_at_limit_p_mw` (straty przy mocy granicznej = ostatni dopuszczalny
   scenariusz) i `losses_baseline_p_mw` (scenariusz 0 MW) — do kolumny „przyrost strat".
Zaokrąglenia jawne (6 miejsc), determinizm bez zmian.

## 2. Zakres i bramki
Pliki: `application/analyses/hosting_capacity.py` (+ testy: rozszerz istniejące pliki
testów D3 o ≥ 6 nowych przypadków: obecność pól, wartości z golden network, addytywność
— stare pola bez zmian). Bramki jak D2/D3: celowane testy, PEŁNY `poetry run pytest -q`
ZERO failed (baza 5775), ruff/black/mypy na twoich plikach, guardy
arch/solver_boundary/pcc/load_flow_no_heuristics (pipefail; przy >600 s odczytaj wynik
po zakończeniu i DOKOŃCZ commit+raport). Commit
`feat(api): straty i skrajne napięcia w scenariuszach zdolności przyłączeniowej (D3a)`
BEZ push. Raport standardowy.
