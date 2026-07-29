# KARTA ZADANIA TM1 — JEDEN STEROWNIK MOTYWU + PRZEŁĄCZNIK (audyt wizualny właściciela)

**Priorytet:** NATYCHMIASTOWY (dyrektywa właściciela 2026-07-18: „niedopuszczalny
bałagan kolorystyczny — dwa motywy na tych samych ekranach") · **Wykonawca:** Opus
(worktree) · **Warstwa:** frontend (App.tsx, index.css, ui2/theme, ui2/shell) ·
**Wiążące:** CLAUDE.md; kanon V12.xx (`v12xx_canon_guard` — patrz §0.3); karta
koordynacyjna SLD-01 (nazwy trybów ZAMROŻONE: `dark_scada`/`light_technical`;
domyślny motyw EKSPORTU SLD pozostaje `light_technical` — NIE dotykać).

## 0. Diagnoza i rozstrzygnięcia zarządcy (WIĄŻĄCE)
1. **Przyczyna mieszania:** DWA niezależne sterowniki. (a) ui2: `data-theme` na
   `<html>` (`ui2/theme/themeMode.ts` — store + `applyThemeMode`; tokeny
   `ui2/theme/tokens.css:30/53/77`; przełącznik `ui2/shell/TitleBar.tsx:62-65`,
   `data-testid="mvd-theme-toggle"`). (b) legacy: `App.tsx` BEZWARUNKOWO
   opakowuje wszystko w `.mv-dark-scada` (remap jasnych klas Tailwind na ciemne,
   `index.css:60-125`). Gdy (a) jest jasny, a (b) zawsze ciemny → mieszanka.
2. **Docelowo JEDEN sterownik = `useThemeModeStore`** (istniejący). `App.tsx`
   subskrybuje `mode` i renderuje wrapper WARUNKOWO:
   - `dark_scada` → DOKŁADNIE dzisiejszy wrapper:
     `<div className="mv-dark-scada min-h-screen" data-ui-theme="dark-scada">`
     (literały zachowane 1:1 — wymóg guarda, §0.3),
   - `light_technical` → `<div className="mv-light-technical min-h-screen"
     data-ui-theme="light-technical">` (BEZ remapu — legacy Tailwind jest
     natywnie jasny; klasa `mv-light-technical` w `index.css` ustawia tylko
     `background`/`color-scheme: light` dla spójnego tła całej powłoki).
   Wrapper i `data-theme` na `<html>` muszą przełączać się RAZEM (obie gałęzie
   czytają ten sam store; `applyThemeMode` — sprawdź, kto woła; jeżeli
   `AppShell`, upewnij się że działa też przy starcie i po toggle).
3. **Kanon/guard (`scripts/v12xx_canon_guard.py:539-556`):** wymaga literałów
   `className="mv-dark-scada` i `data-ui-theme="dark-scada"` w App.tsx oraz
   `.mv-dark-scada` w index.css; domyślny motyw eksportu SLD = light_technical.
   Rozwiązanie z §0.2 (dwie gałęzie return z pełnymi literałami) spełnia guard
   BEZ zmian guarda. ZERO zmian w screenCanonRegistry/coverageMatrix/types.
4. **Domyślny tryb = `dark_scada` ZAWSZE** (tryb dyspozytorski — podstawowy tryb
   ekranowy stacji przemysłowej; kanon: „the application shell owns the screen
   theme"). Preferencja systemowa NIE steruje startem (usuń/omijaj
   `resolveSystemTheme` jako źródło stanu początkowego — zostaw funkcję, jeśli
   ma innych konsumentów, z komentarzem intencji). Wybór użytkownika persystowany
   (store już ma `persist`).
5. **Dedup:** `index.css` zawiera ZDUPLIKOWANY blok „V12.xx Dark SCADA Screen
   Theme" (2× identyczny `@layer utilities` — grep `V12.xx Dark SCADA Screen
   Theme` = 2 trafienia; artefakt konsolidacji). Zostaw JEDEN blok.
6. **Przełącznik w TitleBar:** istnieje (`mvd-theme-toggle`) — ma cyklicznie
   przełączać `dark_scada ⇄ light_technical`, etykieta PL
   `Motyw: ciemny (dyspozytorski)` / `Motyw: jasny (techniczny)` (istniejące
   `themeLabel`), dodaj `aria-pressed` LUB `title` z opisem akcji PL. Żadnych
   nowych nazw trybów.
7. **SLD v3:** kanwa konsumuje `data-theme` (kontrakt SLD-01) — NIE zmieniaj jej
   stylów; po przełączeniu całość (powłoka + legacy + kanwa) ma być spójna
   w OBU trybach. Eksport SLD (`data-sld-export-theme`) bez zmian.

## 1. Zakres plików
- `frontend/src/App.tsx` — warunkowy wrapper od `useThemeModeStore` (§0.2).
- `frontend/src/index.css` — dedup bloku remapu (§0.5) + nowa klasa
  `mv-light-technical` (tylko tło/color-scheme; NIE remapuj kolorów).
- `frontend/src/ui2/theme/themeMode.ts` — domyślny stan = `dark_scada` (§0.4).
- Testy: `frontend/src/__tests__/App.test.tsx` (markery obu gałęzi + przełączanie
  store→wrapper), test toggle w `ui2/shell/__tests__` (rozszerz istniejący),
  asercja że `<html data-theme>` i wrapper zmieniają się RAZEM.

## 2. Bramki
KROK 0: `git fetch origin claude/power-network-design-ui-ir91mv && git reset
--hard FETCH_HEAD` (HEAD = commit tej karty lub nowszy). node_modules symlink;
pełny vitest do pliku; pętla `until`; kody wyjścia bezpośrednio; po pełnym biegu
NATYCHMIAST commit. Bramki: type-check; lint --max-warnings 0; PEŁNY vitest ZERO
failed (baza 8900); guard:codenames; z mv-design-pro (venv D2vgvUMQ):
`v12xx_canon_guard` (KRYTYCZNY — exit 0), forbidden_ui_terms, ui_terminology,
utf8_mojibake, dead_click, ui_no_physics — exit 0. ZERO zmian: `ui/sld/**`
style eksportu, kanon, `enm/**`, backend. Commit BEZ push:
`fix(ui): jeden sterownik motywu + przełącznik dark_scada/light_technical (TM1)`.
Raport: plik:linia, dowód spójności (opis obu gałęzi), komplet bramek.
