# KARTA ZADANIA — PRZYWRÓCENIE KORZENIA MOTYWU DARK-SCADA (dług kanonu, regresja migracji)

**Faza:** U4 · **Wykonawca:** Opus · **Warstwa:** frontend · **Wiążące:**
CLAUDE.md; kanon V12.xx (motyw dark-SCADA to WYMÓG kanoniczny — guard
`v12xx_canon_guard.check_dark_scada_screen_theme`); dyrektywa właściciela
„usuwaj dług, nic nie wstrzymuj". NIE dotykać SLD.

## 0. Diagnoza (recon zarządcy)
Motyw dark-SCADA jest zdefiniowany niemal w całości: `index.css` (`.mv-dark-scada`,
`color-scheme: dark`, `[data-sld-export-theme="light_technical"]`),
`ui/sld/export/exportTheme.ts` (`DEFAULT_EXPORT_THEME='light_technical'`),
`ui/power-distribution/BaySvgRenderer.tsx` (`theme = 'canonical-dark'`) — WSZYSTKO
obecne. BRAKUJE tylko KORZENIA: migracja ui2 skasowała `App.tsx` (`main.tsx`
renderuje `AppRoot` bezpośrednio), a markery motywu (`className="mv-dark-scada"`,
`data-ui-theme="dark-scada"`) nie są aplikowane NIGDZIE — więc kanoniczny motyw
jest zdefiniowany, lecz NIEAKTYWNY. Guard żąda `frontend/src/App.tsx` z tymi
markerami (`v12xx_canon_guard.py:498-535`).

## 1. Cel
Przywrócić kanoniczny korzeń motywu dark-SCADA tak, by guard był ZIELONY i motyw
był realnie aktywny — bez zmiany logiki AppRoot.

## 2. Zakres
1. NOWY `frontend/src/App.tsx` — cienki korzeń motywu: element opakowujący
   z `className="mv-dark-scada …"` i atrybutem `data-ui-theme="dark-scada"`,
   renderujący `<AppRoot />` jako dziecko. ZERO logiki poza motywem
   (AppRoot bez zmian).
2. `main.tsx` — renderować `<App />` zamiast bezpośrednio `<AppRoot />`
   (App opakowuje AppRoot). Zachować istniejące prowidery/StrictMode.
3. Zweryfikować, że po utworzeniu App.tsx `v12xx_canon_guard` przechodzi
   DALEJ i NIE zgłasza kolejnych braków (`[dark-scada-css]`,
   `[dark-scada-export-theme]`, `[dark-scada-...renderer]`); jeżeli guard
   ujawni brakujące fragmenty w index.css/exportTheme/rendererach — UZUPEŁNIĆ
   je zgodnie z listą guarda (fragmenty są już w większości obecne wg reconu;
   dołóż tylko realnie brakujące, bez zmiany zachowania wizualnego poza
   aktywacją motywu). Jeżeli aktywacja motywu wywoła REGRESJĘ testów
   (snapshoty/wizualne) — zgłoś WPROST w raporcie (nie tłum na siłę).
4. Test: `App.test.tsx` — App renderuje AppRoot wewnątrz korzenia z markerami
   `mv-dark-scada` + `data-ui-theme="dark-scada"` (asercja obecności),
   AppRoot montuje się bez regresji.

## 3. Bramki
KROK 0: `git fetch origin claude/power-network-design-ui-ir91mv && git reset
--hard FETCH_HEAD`. Baza vitest: 8689, ZERO failed. Środowisko: symlink
node_modules (NIE commituj); pętla `until` przed pełnym vitest; pełny vitest
do pliku (usuń przed commitem); NIE edytuj src w trakcie; po biegu NATYCHMIAST
commit. Bramki (pipefail): type-check, lint --max-warnings 0, PEŁNY npm test
ZERO failed, guard:codenames; z mv-design-pro: `python scripts/
v12xx_canon_guard.py` (MUSI być ZIELONY — exit 0), forbidden_ui_terms,
ui_terminology, utf8_mojibake, dead_click_guard. NIE dotykać SLD. Commit:
`fix(ui2): przywrócenie korzenia motywu dark-SCADA (dług kanonu)` BEZ push.
Raport: hash, worktree, potwierdzenie `v12xx_canon_guard` exit 0, ewentualne
uzupełnione fragmenty, wynik regresji wizualnej (lub „brak — jsdom"), testy.
