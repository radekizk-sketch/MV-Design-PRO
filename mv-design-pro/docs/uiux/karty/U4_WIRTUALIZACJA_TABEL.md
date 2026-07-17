# KARTA ZADANIA — WIRTUALIZACJA TABEL WYNIKÓW >500 WIERSZY (TODO wzorca)

**Faza:** U4 · **Wykonawca:** Opus · **Warstwa:** frontend ·
**Wiążące:** CLAUDE.md (ZERO nowych zależności npm — wirtualizacja ręczna;
zachowanie kontraktu wzorca 1:1; granica SLD; etykiety PL).

## 1. Cel
`ui2/wyniki/wzorzec/TabelaWynikow.tsx` (272 linie; kontrakt: kolumny, wiersze,
`onWybierzWiersz`/`wybranyWiersz`:33-35, komórki z dowodem) renderuje dziś
WSZYSTKIE wiersze — przy sieciach >500 szyn/gałęzi DOM puchnie. Dodać
wirtualizację okienkową BEZ nowej zależności.

## 2. Zakres
1. Wirtualizacja ręczna w `TabelaWynikow`: aktywna WYŁĄCZNIE powyżej progu
   (stała `PROG_WIRTUALIZACJI = 500` wierszy; poniżej — dzisiejsze
   zachowanie 1:1, zero zmian w drzewie DOM). Realizacja: kontener przewijany
   o stałej wysokości wiersza (zmierz z CSS wzorca; stała udokumentowana),
   widoczne okno + zapas (nadmiar np. 20 wierszy), przekładki (spacery)
   góra/dół o wyliczonej wysokości, `onScroll` przelicza okno. Bez zmiany
   PUBLICZNEGO kontraktu propsów.
2. Zachowania obowiązkowe pod wirtualizacją: wybór wiersza
   (`wybranyWiersz` spoza okna — po przewinięciu wiersz ma stan wybrany),
   2×klik dowodu działa dla wierszy w oknie, nagłówki bez zmian,
   determinizm renderu (ten sam scrollTop → ten sam DOM).
3. Testy Vitest ≥ 10 (nowy plik testów wzorca lub rozszerzenie istniejącego):
   poniżej progu — renderują się wszystkie wiersze (regresja), powyżej progu
   — renderuje się TYLKO okno + przekładki (asercja liczby wierszy DOM),
   scroll przesuwa okno (symulacja `scrollTop` + event), wybór wiersza
   w oknie działa, wiersz wybrany poza oknem po przewinięciu ma klasę
   wybraną, fixture 1000 wierszy, wysokości przekładek poprawne,
   istniejące testy wzorca i EKRANÓW używających tabeli bez regresji
   (pełny vitest to wykaże).

## 3. Bramki
KROK 0: `git fetch origin claude/power-network-design-ui-ir91mv && git reset
--hard FETCH_HEAD`. Baza vitest: 8610, ZERO failed. Środowisko: symlink
node_modules (NIE commituj); przed pełnym vitest pętla `until` na brak innych
pełnych suit; pełny vitest do pliku (usuń przed commitem); NIE edytuj src
w trakcie; po biegu NATYCHMIAST commit. Bramki (pipefail, z frontend/):
type-check, lint --max-warnings 0, PEŁNY npm test ZERO failed (twoje ≥10),
guard:codenames; z mv-design-pro: forbidden_ui_terms, ui_terminology,
utf8_mojibake. ZERO nowych pozycji w package.json. NIE dotykaj SLD. Commit:
`feat(ui2): wirtualizacja tabel wyników powyżej 500 wierszy` BEZ push.
Raport standardowy (plik:linia, zmierzona wysokość wiersza ze źródłem).
