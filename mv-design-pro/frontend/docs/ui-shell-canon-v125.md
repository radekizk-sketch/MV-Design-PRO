# UI Shell Canon V12.5

Aktywna warstwa frontendowa pracuje w jednym shellu opartym o `CanonicalLayout`.

## Aktywne surface'y

- `#sld`, `#analysis`, `#report`, `#variants`, `#case-config` i aliasy wynikowe renderuja ten sam shell.
- `#results`, `#proof`, `#protection-results`, `#power-flow-results`, `#compare` sa aliasami zakladek analitycznych.
- `#variants` jest helper surface'em `variants_runs`.
- `#case-config` jest helper surface'em `case_context`.
- `#catalog` pozostaje helperem katalogowym bez wlasnego stanu wynikow i raportu.

## Kanoniczny pakiet kontraktow

- `frontend/src/ui/contracts/shared.ts` jest wspolna warstwa FE/BE/skrypty dla `AnalysisCaseContext`, `ModuleResultEnvelope`, `CanonicalIssue`, migracji, eksportow i benchmarkow.
- `frontend/src/ui/contracts/frontend-shell.ts` zamraza tylko kontrakty shell-a: `ScreenCode`, `RouteAliasCode`, `HelperSurfaceCode`, sesje, lifecycle, drafty i mini-SLD.
- `frontend/src/ui/contracts/verification.ts` zamraza rejestry repo: `ACTIVE_DOC_ROOTS`, `ARCHIVE_DOC_ROOTS`, `ACTIVE_GENERATOR_REGISTRY`, `ISSUE_MATRIX`, `ANALYSIS_MODULE_MATRIX`, `BENCHMARK_REGISTRY` i budzety wydajnosciowe.
- `src/ui/shared/analysisCaseContext.ts` pozostaje tylko warstwa compat dla legacy snake_case DTO, a nie zrodlo nowego kanonu.

## Kanoniczne nazwy

- `E-07`: `Zakres i warunki obliczen`
- `E-09`: `Historia modelu i obliczen`
- helper `variants_runs`: `Zakresy obliczen i wyniki`
- helper `case_context`: `Warunki obliczen`
- aktywne wyniki sa opisywane jako `Wyniki`, a snapshot jako `Wersja modelu`

## Legacy cut

- Publiczny barrel `src/ui/wizard/index.ts` zostal usuniety.
- `src/ui/network-build/index.ts` nie eksportuje juz legacy routerow i typow panelowych.
- `WorkspaceSurfaceRouter` nie podejmuje juz decyzji przez `delegate === ...`; aktywny shell routuje po kanonicznym `screenCode`.
- `src/ui/sld/sldProjectModeStore.ts` nie ma juz runtime importu do `wizard/*`.
- `src/ui/case-manager` zostal wyciety fizycznie.
- `src/ui/wizard` zostal wyciety fizycznie razem z historycznymi testami i swiatem switchgear wizard.

## Dokumentacja aktywna

- `docs/spec` jest archiwum i nie moze byc czytane przez aktywne generatory, testy ani eksport.
- Aktywne zrodla prawdy dla repo i shell-a sa indeksowane przez `docs/INDEX.md`, `docs/INDEX_KANONICZNY.md` oraz guard `scripts/docs_archive_guard.py`.

## Test and guard anchors

- `src/ui/workspace/__tests__/workspaceShellV125.test.tsx`
- `src/ui/workspace/__tests__/workspaceContractsV125.test.ts`
- `src/ui/__tests__/activeShellTerminology.test.ts`
- `src/ui/__tests__/legacyPublicApiCut.test.ts`
