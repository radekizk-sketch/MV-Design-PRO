# KARTA ZADANIA F-E3/F-E4 — „NASTĘPNY KROK" W BRAMCE GOTOWOŚCI I PO OBLICZENIU

**Epika:** FLOW PROJEKTANTA (`docs/uiux/FLOW_PROJEKTANTA_2026-07.md` §1 E3/E4,
§2 poz. 5 — szybkie zwycięstwa) · **Wykonawca:** Opus (worktree) · **Warstwa:**
frontend ui2 · **Wiążące:** CLAUDE.md; FLOW §0.3 (kontrakt ekranu prowadzącego
— pkt „jawny następny krok"); wzorzec akcji: `EkranAnalizTechnicznych`
(`ui2/wyniki/analizy/` — przyciski akcji naprawczych + `useShellStore.setActiveSpace`).

## 0. Rozstrzygnięcia zarządcy (WIĄŻĄCE)
1. **F-E3 (Gotowość → Obliczenia):** w panelu gotowości (`ui2/spaces/gotowosc/
   PanelGotowosci.tsx` — RECON dokładnego miejsca werdyktu bramki), gdy bramka
   jest ZIELONA (readiness.ready === true / brak blokerów), pokaż sekcję
   „Następny krok" z przyciskiem „Przejdź do obliczeń"
   (`useShellStore.setActiveSpace('obliczenia')`) i jednym zdaniem PL
   („Model przeszedł bramkę gotowości — skonfiguruj wariant i uruchom
   obliczenie."). Gdy bramka CZERWONA — sekcji nie ma (akcje naprawcze już
   istnieją). Styl: tokeny --mvd-*, wzorzec przycisku akcji z
   `analizy.css` (`mvd-analizy-akcja`) — NIE dubluj CSS, wyciągnij wspólną
   klasę do modułu gotowości albo użyj lokalnej klasy w konwencji.
2. **F-E4 (Obliczenia → Wyniki):** w panelu przebiegów (`ui2/spaces/
   obliczenia/przebiegi/` — RECON: miejsce, gdzie widać status DONE wybranego
   przebiegu, prawdopodobnie `SzczegolyPrzebiegu.tsx`), gdy wybrany przebieg
   ma status DONE, pokaż „Następny krok": przycisk „Zobacz wyniki"
   (`setActiveSpace('wyniki')`) + zdanie PL zależne od rodzaju przebiegu
   (rozpływ → „zakładka Rozpływ mocy", zwarcie → „zakładka Zwarcia" —
   etykiety zakładek, NIE nawigacja do zakładki, bo warsztat sam wybiera
   zakładkę po rodzaju aktywnego przebiegu — RECON `useWpiecieWynikow`).
   FAILED → sekcji nie ma (diagnostyka błędu to inna karta).
3. ZERO nowych store'ów, ZERO fizyki, wyłącznie PL; obie zmiany addytywne
   (nie przebudowuj paneli).
4. Testy Vitest ≥ 6 (kliki natywne userEvent): zielona bramka → przycisk
   widoczny i przełącza przestrzeń; czerwona → brak sekcji; DONE → przycisk
   + właściwe zdanie per rodzaj; RUNNING/FAILED → brak; regresje paneli zero.

## 1. Bramki
KROK 0: `git fetch origin claude/power-network-design-ui-ir91mv && git reset
--hard FETCH_HEAD` (HEAD zawiera tę kartę). node_modules symlink; pełny vitest
do pliku po pętli `until`; kody bezpośrednio; po biegu NATYCHMIAST commit.
Bramki: type-check; lint --max-warnings 0; PEŁNY vitest ZERO failed
(baza 8901 + twoje ≥6); guard:codenames; forbidden_ui_terms, ui_terminology,
utf8_mojibake, dead_click, ui_no_physics = 0. ZERO zmian: backend, `ui/**`
(tylko ui2), kanon, `ui/sld/**`. Commit BEZ push:
`feat(ui2): jawny następny krok w bramce gotowości i po zakończonym
obliczeniu (F-E3/F-E4)`. Raport: plik:linia, zrzut logiki warunków,
komplet bramek.
