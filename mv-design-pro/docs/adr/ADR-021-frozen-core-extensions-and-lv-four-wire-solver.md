# ADR-021: Rozszerzenia zamrożonych rdzeni (bramka B-01) i nowy solver nN 4-przewodowy

**Status:** PROPOSED (program Digital Twin 2026-09; wymaga zgody właściciela B-01)
**Data:** 2026-09-02
**Dokument źródłowy:** `../twin/MV_DESIGN_PRO_SIMULATION_ARCHITECTURE.md` §3.3, §4, §5.1–§5.3, §11

## Kontekst
Rdzenie IEC 60909 i NR są FROZEN; audyt wykazał: Ith tylko dla n=1, kanoniczny PF nie buduje szyn PV, wiele źródeł = wiele węzłów SLACK z równaniem tylko dla pierwszego, algebra gęsta (76 % czasu PF w jakobianie, SC O(N·n³)), FDLF nie zbiega na kablach nN, rozpływ niesymetryczny nN odcięty (A3-03/04/05/10, A11-11).

## Decyzja
Rozszerzenia rdzeni wyłącznie przez ten ADR i bramkę B-01, każde jako **addytywna** ścieżka z testem tożsamości dla przypadku bazowego: (1) Ith z n ≠ 1 (IEC 60909-0 §4.8) jako parametr, (2) szyny PV i regulacja Q w NR, (3) slack rozproszony / wiele źródeł sieciowych z udziałami, (4) wspólne jądro admitancji i algebra rzadka (`scipy.sparse` + `splu`; kolumny selektywne w SC). Nowy solver nN 4-przewodowy (current-injection/BFS ABCN) jako **osobny** solver (nie modyfikacja NR), walidowany krzyżowo (pandapower/OpenDSS) na sieci wzorcowej nN.

## Konsekwencje
- `solver_diff_guard` i golden wyniki bazowe nietknięte (bit-identyczność dla dotychczasowych przypadków); nowe przypadki z własnymi goldenami.
- FDLF pozostaje dla SN; dla nN zastępowany nowym solverem; BFS-wyspa kasowana.

## Alternatywy odrzucone
- Rozszerzenie NR o model fazowy: ryzyko w rdzeniu FROZEN i gorsza zbieżność dla nN.
