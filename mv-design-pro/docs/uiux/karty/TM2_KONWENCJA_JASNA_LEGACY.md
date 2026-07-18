# KARTA ZADANIA TM2 — SPÓJNOŚĆ JASNEGO MOTYWU: KONWENCJA JASNA W LEGACY `ui/**`

**Priorytet:** NATYCHMIASTOWY (kontynuacja audytu wizualnego właściciela; TM1
naprawił sterownik — TM2 domyka jakość motywu jasnego) · **Wykonawca:** Opus
(worktree) · **Warstwa:** frontend `ui/**` (style, zero logiki) · **Wiążące:**
CLAUDE.md; kanon nietknięty; NIE dotykać `ui/sld/**` (własny kontrakt
`data-theme`, wątek skonsolidowany, ale style kanwy poza tą kartą).

## 0. Diagnoza i rozstrzygnięcia zarządcy (WIĄŻĄCE)
1. **Architektura motywów po TM1 (obowiązująca):** legacy `ui/**` pisze się
   W KONWENCJI JASNEJ (klasy Tailwind jasne); motyw ciemny powstaje przez remap
   `.mv-dark-scada` (`index.css` — mapuje bg-white/slate-50/100,
   text-slate-900…500, border-slate-100…300 na powierzchnie przemysłowe).
   ZASZYTE CIEMNE klasy łamią konwencję: w dark wyglądają poprawnie
   (przypadkiem), w light dają CIEMNE WYSPY i NIEWIDOCZNY TEKST.
2. **Zweryfikowane wizualnie (zrzuty zarządcy, motyw jasny):**
   - `ui/workspace/routerSurfaceHeader.tsx:27-33` — `MiniSldCard`:
     `bg-slate-950 text-slate-100` → ciemna wyspa „Podgląd schematu",
   - `ui/workspace/WorkspaceSurfaceRouter.tsx:883-891` — `AnalysisContextSummary`:
     `text-slate-100` wartości (niewidoczne na białym), `bg-slate-900/70`
     etykiety, `border-slate-700/80`, `divide-slate-800`,
   - `WorkspaceSurfaceRouter.tsx:829-851` — tabela z `bg-slate-900/80`,
     `text-slate-100/200/300`, `divide-slate-800`.
3. **Zakres = 17 plików** z zaszytymi ciemnymi klasami (grep
   `bg-slate-950|bg-slate-900|text-slate-100|text-slate-200` w `src/ui`
   --include=*.tsx; pełną listę wygeneruj na HEAD; obejmuje m.in.
   catalog/TypePicker, shared/HelpTooltip, shared/NotFoundPage,
   field/BayWindowSchematic, workspace/routerSurfaceHeader,
   workspace/WorkspaceSurfaceRouter, surfaces/NcRfgTestsTab,
   surfaces/V126AcademicSurface, surfaces/SnSegmentSurface,
   proof/ProofLatexPanel, results-inspector/ResultsExport,
   network-build/TopContextBar, network-build/station-templates/
   StationBatchPlanner + pozostałe z grepa). WYKLUCZ: `ui/sld/**`,
   `ui/sld-editor/**`, `ui/sld-overlay/**`, pliki `__tests__`.
4. **Reguła zamiany (mechaniczna, zero zmian logiki/JSX-struktury):**
   - `bg-slate-950`, `bg-slate-900(/NN)` (tła sekcji/kart/nagłówków tabel)
     → `bg-white` / `bg-slate-50` / `bg-slate-100` (dobierz wg roli: karta →
     white, wyróżnione tło → slate-50/100),
   - `text-slate-100` (tekst główny) → `text-slate-900`; `text-slate-200/300`
     (tekst wtórny) → `text-slate-700`/`text-slate-600`; `text-slate-400`
     na ciemnym tle (eyebrow) → `text-slate-500`,
   - `border-slate-700/800(/NN)` → `border-slate-200`; `divide-slate-800`
     → `divide-slate-200`,
   - `text-white` na ciemnych przyciskach akcji (`bg-slate-900` button):
     przycisk pierwszoplanowy może zostać ciemny CELOWO (przycisk to nie
     „powierzchnia") — zostaw `bg-slate-900 text-white hover:bg-slate-800`
     TYLKO dla przycisków akcji; wszystkie POWIERZCHNIE (karty, tabele,
     nagłówki, tooltips) muszą przejść na jasne.
   Wyjątków „zawsze ciemna wyspa" NIE MA (decyzja zarządcy — także MiniSldCard
   przechodzi na jasną kartę; podgląd realnej kanwy SLD i tak żyje w SLD).
5. **Remap dark — uzupełnienie:** remap nie obejmuje `divide-slate-200` ani
   `bg-slate-200`. Jeżeli po zamianie użyjesz tych klas, DOPISZ je do
   ISTNIEJĄCYCH selektorów remapu w `index.css` (odpowiednio do grupy
   border/bg; fragmenty `.mv-dark-scada` wymagane przez guard zachowane).
   Po TM2 motyw CIEMNY ma wyglądać JAK DZIŚ (remap przejmuje wszystko) —
   żadnej regresji dark.
6. **Weryfikacja obu motywów obowiązkowa:** poza testami — po zmianach uruchom
   oba grepy kontrolne: (a) zaszyte ciemne klasy w zakresie = 0 trafień
   (poza dozwolonymi przyciskami akcji z §0.4), (b) snapshot-review własny:
   wypisz w raporcie listę plik→zamiany. Zarządca zweryfikuje wizualnie
   zrzutami po scaleniu.

## 1. Bramki
KROK 0: `git fetch origin claude/power-network-design-ui-ir91mv && git reset
--hard FETCH_HEAD` (HEAD MUSI zawierać TM1 — commit `72de6382` lub nowszy;
jeśli nie zawiera, STOP i zgłoś). node_modules symlink; pełny vitest do pliku;
pętla `until`; kody bezpośrednio; po biegu NATYCHMIAST commit. Bramki:
type-check; lint --max-warnings 0; PEŁNY vitest ZERO failed (baza 8903);
guard:codenames; v12xx_canon_guard (exit 0 — fragmenty `.mv-dark-scada`
w index.css zachowane), forbidden_ui_terms, ui_terminology, utf8_mojibake,
dead_click, ui_no_physics — exit 0. ZERO zmian: logika/JSX-struktura, kanon,
`ui/sld/**`, backend. Commit BEZ push:
`fix(ui): konwencja jasna w legacy ui/** — spójność motywu jasnego (TM2)`.
Raport: lista plik→zamiany, potwierdzenie greps 0, komplet bramek.
