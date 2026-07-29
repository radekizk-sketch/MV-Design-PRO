# KARTA ZADANIA F-E5c — HUB ZOSTAJE W ŚRODKU, GDY DZIECKO OTWIERA SIĘ W PANELU

**Epika:** FLOW (znalezisko z oględzin F-E5a, rejestr FLOW §3) · **Wykonawca:**
Opus (worktree) · **Wiążące:** CLAUDE.md; FLOW §0.3; wzorzec:
`ui2/wyniki/analizy/MostAnalizTechnicznych.tsx`.

## 0. Rozstrzygnięcia zarządcy (WIĄŻĄCE)
1. **Defekt (oględziny na żywo):** karta huba → powierzchnia klasy B
   (`openMode='replace_right_panel'`, np. E-31 kontrakt analizy) renderuje się
   w PRAWYM panelu (router region="panel"), a ŚRODEK zakładki zostaje pusty —
   tylko pasek powrotu. Wielka pusta przestrzeń = zły odbiór.
2. **Naprawa w `MostAnalizTechnicznych`:** gdy `activeSurface` istnieje i NIE
   jest dawnym hubem, rozgałęzienie po `activeSurface.openMode`:
   - `'expand_workspace'` (klasa C, np. E-28) → jak dziś: pasek powrotu +
     `<WorkspaceSurfaceRouter region="main" />`,
   - `'replace_right_panel'` (klasa B) → w środku RENDERUJ HUB
     (`EkranAnalizTechnicznych`) — powierzchnia i tak żyje w prawym panelu
     (renderowanym przez powłokę); NIE dubluj routera panelu w środku; pasek
     powrotu zostaje NAD hubem (czyści powierzchnię panelu — etykieta
     `Zamknij panel analizy` zamiast strzałki powrotu? NIE — zostaw istniejący
     string `powrot`, ale dodaj drugi wariant stringu `zamknijPanel`
     („Zamknij panel analizy") używany w tej gałęzi; oba PL w strings).
   RECON: upewnij się, gdzie powłoka renderuje `region="panel"` dla zakładki
   wyników (czy panel prawy w ogóle jest hostowany w tej zakładce — jeżeli
   panel renderuje się globalnie w AppShell/LegacySurface, wystarczy zmiana
   środka; jeżeli panel NIE jest nigdzie hostowany w ui2 dla tej zakładki —
   to jest WŁAŚCIWY defekt: wtedy renderuj powierzchnię klasy B w ŚRODKU
   przez `<WorkspaceSurfaceRouter region="panel" />` opakowaną w kontener
   o max szerokości czytelnej (jak dziś robi to prawy panel) i odnotuj
   w raporcie, którą gałąź wybrałeś na podstawie kodu).
3. Testy ≥ 4 (kliki natywne): klasa C → router w środku; klasa B → hub
   widoczny w środku + powierzchnia dostępna; przycisk zamknięcia czyści;
   regresje mostu zero.

## 1. Bramki
KROK 0: fetch+reset (HEAD zawiera tę kartę). Standard frontendowy: type-check;
lint --max-warnings 0; PEŁNY vitest ZERO failed (baza 8879 + ≥4, do pliku po
pętli `until`); guard:codenames; forbidden_ui_terms, ui_terminology,
utf8_mojibake, dead_click, ui_no_physics, v12xx_canon = 0. ZERO zmian poza
`ui2/wyniki/analizy/**` (+ ewentualnie strings/css modułu). Commit BEZ push:
`fix(ui2): hub analiz zostaje w środku przy powierzchniach panelowych (F-E5c)`.
Raport: wybrana gałąź §0.2 z dowodem kodowym, plik:linia, bramki.
