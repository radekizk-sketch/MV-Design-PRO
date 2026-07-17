# KARTA ZADANIA W5b-2 — WYGASZENIE STUBU „ANALIZA WRAŻLIWOŚCI" W AnalysisSurface (D2=A, Opcja 1)

**Faza:** U5 · **Plan:** `PLAN_WYGASZANIA_MOSTU_WYNIKI.md` (§3a Bramka Parytetu,
§3b D2=A, §3c Opcja 1) · **Wykonawca:** Opus · **Warstwa:** frontend ·
**Wiążące:** CLAUDE.md; granica SLD; kanon V12.xx ZAMROŻONY.

## 0. Rozstrzygnięcia zarządcy (recon)
1. AnalysisSurface = E-35 (`types.ts:69`). SLD NIE wchodzi do E-35 (akcja
   `show-results` → 'E-24'). ALE kanon przejść trzyma E-35 jako RODZICA
   E-26/E-27/E-30/E-31/E-34 (`types.ts:799-808`) → trasa
   `case ANALYSIS_SURFACE_SCREEN_CODE` (`WorkspaceSurfaceRouter.tsx:3093`)
   MUSI ZOSTAĆ (nawigacja „w górę" z dzieci). NIE usuwać trasy ani hubu.
2. FixActions „Otwórz wyniki"/„Pokaż wyniki" (`:1326`, `:1413`) to DZIAŁAJĄCE
   akcje — usunięcie łamałoby pkt 4 Bramki Parytetu (utrata akcji). ZOSTAJĄ.
3. Rdzeń wynikowy E-35 pokryty przez ui2 (audyt W5a, tabela w rejestrze planu).
   JEDYNY element do wygaszenia w tej karcie = STUB „Analiza wrażliwości"
   (decyzja właściciela D2: funkcja NIEDOSTARCZONA — `entries=[]`, `onCompute`
   nic nie liczy).

## 1. Zakres
1. Usuń z AnalysisSurface: przycisk nawigacyjny „Analiza wrażliwości"
   (`WorkspaceSurfaceRouter.tsx:1033-1041`), widok `case 'sensitivity'`
   (`:1061-1062`) i komponent `AnalysisSurfaceSensitivityTab`
   (`routerExtensionSurfaces.tsx:105+`) wraz z martwymi importami/testami
   stubu (testy stubu usuń/zamień z intencją — komentarz „stub niedostarczony,
   decyzja właściciela D2 2026-07-17").
2. **STOP-GUARD kanonu:** jeżeli `'sensitivity'` figuruje w kanonicznej liście
   tabów (`ANALYSIS_ROUTE_TAB_IDS` w `types.ts` albo asercjach testów kanonu
   screen-canon/coverage) i jego usunięcie wymusza zmianę kanonu lub jego
   testów → NIE usuwaj z listy kanonu; usuń wtedy TYLKO przycisk + zawartość
   widoku (tab przestaje być osiągalny nawigacyjnie), zostaw wpis listy
   i ZGŁOŚ w raporcie. Kanon i jego testy NIETYKALNE.
3. Wpis W5b-2 do rejestru planu (§4): co usunięto, wynik STOP-guarda,
   adnotacja że trasa E-35 zostaje (rodzic kanoniczny dzieci E-2x).

## 2. Bramki
KROK 0: `git fetch origin claude/power-network-design-ui-ir91mv && git reset
--hard FETCH_HEAD`. Baza vitest: 8690 (po scaleniu #42), ZERO failed.
Środowisko: symlink node_modules (NIE commituj); PRZED pełnym vitest pętla
`until ! ps aux | grep -E "vitest|pytest" | grep -v grep > /dev/null; do sleep
30; done` (w tle konfirmacja zarządcy #42 — poczekaj); pełny vitest do pliku
(usuń przed commitem); NIE edytuj src w trakcie; po biegu NATYCHMIAST commit.
Bramki (pipefail, z frontend/): type-check, lint --max-warnings 0, PEŁNY
npm test ZERO failed (WSZYSTKIE testy kanonu zielone), guard:codenames;
z mv-design-pro: `python scripts/v12xx_canon_guard.py` (exit 0 — po #42
zielony, MA POZOSTAĆ zielony), forbidden_ui_terms, ui_terminology,
utf8_mojibake, dead_click_guard. NIE dotykaj SLD. Commit:
`feat(ui2): wygaszenie stubu analizy wrażliwości w AnalysisSurface (W5b-2)`
BEZ push. Raport: co usunięto (plik:linia), wynik STOP-guarda kanonu,
liczby testów, guardy, odstępstwa.
