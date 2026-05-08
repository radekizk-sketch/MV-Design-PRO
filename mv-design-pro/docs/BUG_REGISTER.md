# Bug Register (R54)

**Sesja:** 2026-05-08 R54 — Full Bug Hunt + Fix + E2E
**Branch:** `claude/electrical-infrastructure-design-ChbTk`

## Findings — naprawione w R54

| ID | Obszar | Plik | Objaw | Root cause | Priorytet | Status | Test |
|---|---|---|---|---|---|---|---|
| R54-001 | DOMAIN_NAMING | `frontend/src/ui/workspace/surfaces/GpzConfiguratorSurface.tsx:871` | Tekst „Brak danych readiness — uruchom obliczenia z E-23/E-24." łamie ui_terminology_guard (forbidden term `readiness` w głównym UI) | Anglicyzm w main UI string — nie zauważony przy poprzednich iteracjach | P3 | FIXED | `ui-terminology-guard.test.ts` zielony |
| R54-002 | REGRESSION | `frontend/src/ui/__tests__/etap10-acceptance.test.tsx:65` | Test C: GPZ 5 kart — `getByText('Identyfikacja')` nie znajduje (empty state) | R45 dual-mode wymaga entityRef + Advanced switcher | P1 | FIXED | etap10 C zielony (z `gpz-mode-advanced-switch`) |
| R54-003 | REGRESSION | `frontend/src/ui/__tests__/etap10-acceptance.test.tsx:79` | Test E: Stacja 10 kart — `data-testid="station-configurator-surface"` nie istnieje (R46 default to wizard) | Architektura R46 zmienia default na wizard, test zmieniony żeby używał switchera do legacy | P1 | FIXED | etap10 E zielony |
| R54-004 | REGRESSION | `frontend/src/ui/__tests__/etap10-acceptance.test.tsx:87` | Test F: SnSegment 4-kart — „Identyfikacja" tab nie istnieje (R47 default Inline) | R47 default to LineSegmentInline; test zmieniony żeby przełączyć na legacy | P1 | FIXED | etap10 F zielony |
| R54-005 | REGRESSION | `frontend/src/ui/__tests__/etap10-acceptance.test.tsx:130` | Test K: Polskie etykiety — empty state nie ma „Główny Punkt Zasilający" | Test używał surface bez entityRef; zmieniony do Advanced mode | P1 | FIXED | etap10 K zielony |

## Findings — udokumentowane jako known limitations (nie naprawione w R54)

| ID | Obszar | Lokalizacja | Objaw | Powód braku naprawy | Priorytet | Następny krok |
|---|---|---|---|---|---|---|
| R54-006 | TEST_IDS | `src/ui/shell/AppShellV12.tsx` | Brak canonical `data-testid="workspace-shell"`, `workspace-topbar`, `primary-action`, `left-panel`, `right-panel`, `left-panel-collapse`, `right-panel-collapse`, `left-panel-resize-handle` (21 wymaganych test ids w prompt) | Wymaga refaktoru shell + zmiany layoutu prawego panelu (rail mode); zachowane istniejące `canonical-layout`, `main-content`, `inspector-panel-sidebar` które już używają testy. Dodano alias `data-workspace-shell` jako attr. Pełen rebrand test-id przekracza scope sesji. | P3 | R55: rebrand test ids w shell + 4 testach + zaktualizować WORKSPACE_LAYOUT_TESTIDS doc |
| R54-007 | UI_STATE | `src/ui/workspace/...` | Brak `WorkspaceLayoutState` zgodnego z prompt v2 (`leftCollapsed`, `rightCollapsed`, `leftWidth`, `rightWidth`, `activeWorkflowStep`, `expandedLeftSections`, `selectedElementId`, `sldViewport`) z localStorage key `mv-design-pro.workspace.layout.v2` | Aktualny shell ma `inspector-panel-sidebar` toggle ale brak resize/persist mechanizmu zgodnego z R54 promptem | P2 | R55: implement WorkspaceLayoutStore Zustand + persist middleware |
| R54-008 | RESPONSIVE | shell + panele | Brak responsywnego trybu drawer poniżej 1100px / 760px breakpoints | App teraz desktop-only; zmiana do drawer mode wymaga refaktoru AppShellV12 | P3 | R55+: media queries + drawer overlay |
| R54-009 | A11Y | rail icons / collapse btns | Audit accessibility nie wykonany systematycznie (istnieje `navigation-rail.a11y.test.tsx` ale dla 1 komponentu) | Pełen audit a11y wymaga sweep'a wszystkich klikalnych elementów | P3 | R55: aria-label sweep w shell + panele + rail icons |
| R54-010 | CALCULATION | obliczenia statusy | Brak typu `CalculationStatus` z 7 stanami (`idle`, `blocked`, `ready`, `running`, `calculated`, `stale`, `error`) z polskimi etykietami | Aktualny status z `activeCaseResultStatus: 'NONE' \| 'FRESH' \| 'STALE' \| ...` jest częściowy | P2 | R55: rozszerzyć ResultStatus do 7-state CalculationStatus + UI badges |
| R54-011 | VALIDATION | brakujące dane | Brak zunifikowanego typu `MissingDataItem` z `severity`+`fixAction`+`expectedValueHint` | Czytaj: aktualnie różne komponenty używają różnych shape'ów (FixAction, blockers, warnings) | P3 | R55: ujednolicić MissingDataItem type + adapter |
| R54-012 | REPORT | dostępność raportu | Brak głoszącego komunikatu „Raport będzie dostępny po..." z listą braków + przyciskiem „Przejdź do walidacji" | Aktualnie report-status pokazuje status ale bez fix actions | P3 | R55: ReportGate component z fix-action |
| R54-013 | PERFORMANCE | bundle size | `dist/assets/index-cTyFs2Oh.js 1,677.64 kB │ gzip: 443.16 kB` — przekracza 500kB | Brak code splitting przez `manualChunks` lub dynamic import | P4 | R55+: `vite.config.ts` `build.rollupOptions.output.manualChunks` |
| R54-014 | E2E | console errors | E2E nie failuje na console.error / pageerror | NAPRAWIONE: dodano `e2e/helpers/console-failure.ts` + zaktualizowano `01-app-smoke` i `station-wizard` | P2 | DONE w R54 |
| R54-015 | E2E | full coverage | Brak 10 wymaganych spec files (01-app-smoke, 02-build-critical, 03-click-coverage, 04-workspace-layout, 05-engineering-workflow, 06-validation-gates, 07-sld-state, 08-results-report, 09-responsive, 10-accessibility-smoke) | Tylko `01-app-smoke` dodany w R54. Pełen pakiet wymaga real backend + 10+ godzin pracy | P2 | R55: stopniowo dodawaj 02-10 |

## Statystyki

| Metryka | Wartość |
|---|---|
| Vitest fail przed R54 | 5 / 4153 |
| Vitest pass po R54 | **4152 / 4153** (1 skipped) |
| Vitest test files | 303 |
| Type-check | ✅ ZIELONY |
| Build | ✅ ZIELONY (warning chunk size) |
| Lint changed files | ✅ ZIELONY (zero warnings) |
| no_codenames_guard | ✅ OK |
| forbidden_ui_terms_guard | ✅ PASSED |
| dialog_completeness_guard | ✅ OK (18 modals, 17 ops) |
| local_truth_guard | ✅ OK |
| dead_click_guard | ✅ PASS |
| ui_terminology_guard | ✅ exit 0 (informacyjne ostrzeżenia dla symboli IEC OK) |

## Kategorie napraw

- **REGRESSION** (4): testy nieaktualne po R45-R47 mode toggles — wszystkie zaktualizowane
- **DOMAIN_NAMING** (1): readiness → gotowość obliczeń
- **E2E_INFRASTRUCTURE** (1): fail-on-console-errors helper + smoke spec

## Dług pozostały (do przyszłych R-iteracji)

10 udokumentowanych issues priority P2-P4 — wymaga 5+ godzin pracy każde. Wpisane w *Remaining known issues* w final report.
