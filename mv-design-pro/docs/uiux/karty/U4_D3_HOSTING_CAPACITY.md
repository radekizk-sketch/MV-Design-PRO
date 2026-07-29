# KARTA ZADANIA D3 — DELTA BACKENDOWA: ZDOLNOŚĆ PRZYŁĄCZENIOWA SIECI (P2, hosting capacity)

**Faza:** U4 (strumień OZE) · **Epik:** E11 · **Wykonawca:** Opus · **Warstwa:** backend ·
**Wiążące:** CLAUDE.md (NOT-A-SOLVER: fizyka TYLKO w istniejących solverach — ta karta
NIE tworzy nowego solvera, tylko DETERMINISTYCZNĄ orkiestrację istniejącego rozpływu
w warstwie application; WHITE BOX; determinizm), Program §2.0.

## 0. Decyzja architekta (kontekst)
Istniejący `hosting_capacity` to bilans eksport/import per stacja
(`application/proof_engine/packs/audit2_validation.py:215-240`, NC RfG Art. 17) — NIE
odpowiada na pytanie P2 „ile jeszcze OZE zmieści się w tym węźle sieci". Realizacja P2:
przegląd scenariuszy — dla wskazanego węzła zwiększaj moc czynną wstrzykiwaną krokiem
deterministycznym i uruchamiaj ISTNIEJĄCY solver rozpływu; granica = ostatnia moc, przy
której (a) napięcia wszystkich węzłów w paśmie, (b) obciążenia gałęzi/transformatorów
≤ 100 % (kryteria REUŻYTE z `analysis/energy_validation` — te same progi co W-607).
Wynik per węzeł: maks. moc przyłączalna [MW] + kryterium wiążące (napięcie/obciążenie +
element) + ślad WHITE BOX (scenariusze: moc → wynik kontroli).

## 1. Zakres
1. **Application** (`application/analyses/hosting_capacity.py`): serwis przyjmuje
   snapshot/model (jak inne serwisy — ZBADAJ jak `energy_validation/service.py`
   rekonstruuje wejście PF i jak wykonywany jest bieg rozpływu w warstwie application/
   dispatch — użyj ISTNIEJĄCEJ ścieżki wykonania solvera, NIE wołaj solvera na skróty),
   listę węzłów-kandydatów (parametr; domyślnie węzły z istniejącymi źródłami OZE lub
   wskazany węzeł), krok mocy [MW] i limit iteracji (parametry z wartościami domyślnymi
   udokumentowanymi jako założenia — np. krok 0,5 MW, maks. 40 kroków; bisekcja
   dopuszczalna, jeśli deterministyczna). Kryteria dopuszczalności: REUŻYJ
   `EnergyValidationBuilder` (progi domyślne jak w D2). Zwraca widok z WHITE BOX
   (per scenariusz: moc, status kontroli, element wiążący).
2. **API**: `GET/POST /api/oze-analysis/hosting-capacity` (kształt żądania: snapshot
   aktywnego projektu jak w istniejących biegach + parametry; ZBADAJ jak inne końcówki
   pozyskują snapshot/model — wzorzec `oze_analysis_runs.py` czyta wynik przebiegu,
   tu potrzebny MODEL — znajdź istniejący wzorzec końcówki liczącej na modelu, np.
   grid_source_preview / canonical run, i użyj go; jeśli żaden wzorzec nie pozwala
   na deterministyczny wielobieg w application — STOP-RAPORT z opisem opcji).
3. **Testy pytest ≥ 16**: golden network — monotoniczność (większa moc → gorzej lub
   równie), granica wiążąca napięciowa vs obciążeniowa (dwa scenariusze), determinizm
   (dwa wywołania identyczne), węzeł bez możliwości (0 MW), parametry brzegowe, 404/422.

## 2. Zasady i kryteria
- ZERO nowej fizyki: rozpływ liczy wyłącznie istniejący solver przez istniejącą ścieżkę
  wykonania; oceny wyłącznie przez istniejący builder walidacji. Modyfikacje solverów
  i `analysis/**` ZAKAZANE (potrzeba → STOP-raport).
- Determinizm twardy: stała kolejność węzłów i kroków, zaokrąglenia jawne, hash wejścia.
- Bramki: pełny `poetry run pytest -q` ZERO failed; ruff/black/mypy czyste na TWOICH
  plikach; guardy arch/solver_boundary/pcc (pipefail; przy przekroczeniu 600 s przez
  pełny pytest — odczytaj wynik po zakończeniu i DOKOŃCZ commit+raport w tej samej sesji).
Commit `feat(api): zdolność przyłączeniowa sieci — przegląd scenariuszy rozpływu (D3)`
BEZ push. Raport standardowy z mapowaniami plik:linia i przykładem JSON.
