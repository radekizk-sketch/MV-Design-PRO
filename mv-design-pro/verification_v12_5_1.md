# Verification V12.5.1

- Generated at: `2026-04-21 08:49:34Z`
- Package manager: `npm`
- Total steps: `14`
- Passed: `14`
- Failed: `0`

| Step | Status | Exit code | Duration [s] |
|---|---|---:|---:|
| UI terminology guard | PASS | 0 | 0.76 |
| Docs archive guard | PASS | 0 | 0.38 |
| Import graph guard | PASS | 0 | 0.09 |
| Grep-zero guard | PASS | 0 | 0.10 |
| Backend V12.5 lint (ruff) | PASS | 0 | 2.27 |
| Backend V12.5 format check (black) | PASS | 0 | 3.64 |
| Backend targeted V12.5 tests | PASS | 0 | 10.66 |
| Vulture guard | PASS | 0 | 4.14 |
| Frontend lint | PASS | 0 | 21.19 |
| Frontend type-check | PASS | 0 | 24.50 |
| Frontend tests | PASS | 0 | 689.90 |
| Frontend V12.5 performance harness (full) | PASS | 0 | 10.01 |
| Golden tests | PASS | 0 | 18.16 |
| E2E tests | PASS | 0 | 48.88 |

## Outcome

- Verification passed without failing steps.

## UI terminology guard

- CWD: `C:\Users\radek\Documents\GitHub\MV-Design-PRO\mv-design-pro`
- Command: `C:\Users\radek\AppData\Local\Programs\Python\Python311\python.exe C:\Users\radek\Documents\GitHub\MV-Design-PRO\mv-design-pro\scripts\ui_terminology_guard.py`
- Status: `PASS`

### stdout tail

```text
ui-terminology-guard: OK (brak naruszen)
```

### stderr tail

```text
<empty>
```

## Docs archive guard

- CWD: `C:\Users\radek\Documents\GitHub\MV-Design-PRO\mv-design-pro`
- Command: `C:\Users\radek\AppData\Local\Programs\Python\Python311\python.exe C:\Users\radek\Documents\GitHub\MV-Design-PRO\mv-design-pro\scripts\docs_archive_guard.py`
- Status: `PASS`

### stdout tail

```text
V12.5 docs archive guard passed.
```

### stderr tail

```text
<empty>
```

## Import graph guard

- CWD: `C:\Users\radek\Documents\GitHub\MV-Design-PRO\mv-design-pro`
- Command: `C:\Users\radek\AppData\Local\Programs\Python\Python311\python.exe C:\Users\radek\Documents\GitHub\MV-Design-PRO\mv-design-pro\scripts\import_graph_guard.py`
- Status: `PASS`

### stdout tail

```text
V12.5 import graph guard passed.
```

### stderr tail

```text
<empty>
```

## Grep-zero guard

- CWD: `C:\Users\radek\Documents\GitHub\MV-Design-PRO\mv-design-pro`
- Command: `C:\Users\radek\AppData\Local\Programs\Python\Python311\python.exe C:\Users\radek\Documents\GitHub\MV-Design-PRO\mv-design-pro\scripts\grep_zero_guard.py`
- Status: `PASS`

### stdout tail

```text
V12.5 grep-zero guard passed.
```

### stderr tail

```text
<empty>
```

## Backend V12.5 lint (ruff)

- CWD: `C:\Users\radek\Documents\GitHub\MV-Design-PRO\mv-design-pro\backend`
- Command: `poetry run ruff check src\api\analysis_case_context.py src\api\analysis_run_exports.py src\api\canonical_run_views.py src\api\power_flow_runs.py src\api\v125_contracts.py src\application\field_read_model.py src\enm\canonical_analysis.py src\infrastructure\persistence\repositories\canonical_run_repository.py tests\api\test_analysis_run_report_exports.py tests\application\analysis_run\test_analysis_run_service.py tests\enm\test_enm_field_view_api.py tests\test_canonical_analysis_api.py tests\test_execution_api.py tests\test_production_canonical_only_api.py`
- Status: `PASS`

### stdout tail

```text
<empty>
```

### stderr tail

```text
<empty>
```

## Backend V12.5 format check (black)

- CWD: `C:\Users\radek\Documents\GitHub\MV-Design-PRO\mv-design-pro\backend`
- Command: `poetry run python -m black --check --diff src\api\analysis_case_context.py src\api\analysis_run_exports.py src\api\canonical_run_views.py src\api\power_flow_runs.py src\api\v125_contracts.py src\application\field_read_model.py src\enm\canonical_analysis.py src\infrastructure\persistence\repositories\canonical_run_repository.py tests\api\test_analysis_run_report_exports.py tests\application\analysis_run\test_analysis_run_service.py tests\enm\test_enm_field_view_api.py tests\test_canonical_analysis_api.py tests\test_execution_api.py tests\test_production_canonical_only_api.py`
- Status: `PASS`

### stdout tail

```text
<empty>
```

### stderr tail

```text
All done! \u2728 \U0001f370 \u2728
14 files would be left unchanged.
```

## Backend targeted V12.5 tests

- CWD: `C:\Users\radek\Documents\GitHub\MV-Design-PRO\mv-design-pro\backend`
- Command: `poetry run pytest tests\application\analysis_run\test_analysis_run_service.py tests\test_canonical_analysis_api.py tests\test_execution_api.py tests\test_production_canonical_only_api.py tests\enm\test_enm_field_view_api.py tests\api\test_analysis_run_report_exports.py`
- Status: `PASS`

### stdout tail

```text
============================= test session starts =============================
platform win32 -- Python 3.11.9, pytest-7.4.4, pluggy-1.6.0
rootdir: C:\Users\radek\Documents\GitHub\MV-Design-PRO\mv-design-pro\backend
configfile: pyproject.toml
plugins: anyio-4.12.1, asyncio-0.23.8, cov-4.1.0
asyncio: mode=Mode.AUTO
collected 57 items
tests\application\analysis_run\test_analysis_run_service.py ............ [ 21%]
.....                                                                    [ 29%]
tests\test_canonical_analysis_api.py .....                               [ 38%]
tests\test_execution_api.py ..................                           [ 70%]
tests\test_production_canonical_only_api.py .....                        [ 78%]
tests\enm\test_enm_field_view_api.py .....                               [ 87%]
tests\api\test_analysis_run_report_exports.py .......                    [100%]
============================= 57 passed in 7.77s ==============================
```

### stderr tail

```text
<empty>
```

## Vulture guard

- CWD: `C:\Users\radek\Documents\GitHub\MV-Design-PRO\mv-design-pro`
- Command: `C:\Users\radek\AppData\Local\Programs\Python\Python311\python.exe C:\Users\radek\Documents\GitHub\MV-Design-PRO\mv-design-pro\scripts\vulture_guard.py`
- Status: `PASS`

### stdout tail

```text
vulture-guard: OK (backend/src clean)
```

### stderr tail

```text
<empty>
```

## Frontend lint

- CWD: `C:\Users\radek\Documents\GitHub\MV-Design-PRO\mv-design-pro\frontend`
- Command: `npm run lint`
- Status: `PASS`

### stdout tail

```text
> mv-design-pro-frontend@0.1.0 lint
> eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0
```

### stderr tail

```text
<empty>
```

## Frontend type-check

- CWD: `C:\Users\radek\Documents\GitHub\MV-Design-PRO\mv-design-pro\frontend`
- Command: `npm run type-check`
- Status: `PASS`

### stdout tail

```text
> mv-design-pro-frontend@0.1.0 type-check
> tsc --noEmit
```

### stderr tail

```text
<empty>
```

## Frontend tests

- CWD: `C:\Users\radek\Documents\GitHub\MV-Design-PRO\mv-design-pro\frontend`
- Command: `npm run test`
- Status: `PASS`

### stdout tail

```text
 [32m✓[39m src/ui/power-flow-results/__tests__/api.test.ts [2m ([22m[2m1 test[22m[2m)[22m[90m 8[2mms[22m[39m
 [32m✓[39m src/ui/topology/modals/__tests__/modalRegistryCompleteness.test.ts [2m ([22m[2m8 tests[22m[2m)[22m[90m 5[2mms[22m[39m
 [32m✓[39m src/ui/property-grid/__tests__/EngineeringInspector.test.tsx [2m ([22m[2m3 tests[22m[2m)[22m[90m 62[2mms[22m[39m
 [32m✓[39m src/ui/network-build/__tests__/networkBuildStore.routeSurfaces.test.ts [2m ([22m[2m3 tests[22m[2m)[22m[90m 4[2mms[22m[39m
 [32m✓[39m src/ui/catalog/__tests__/TypePicker.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 111[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/SegmentInspectorPanel.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 38[2mms[22m[39m
 [32m✓[39m src/ui/app-state/__tests__/useCanCalculateReadiness.test.ts [2m ([22m[2m2 tests[22m[2m)[22m[90m 17[2mms[22m[39m
 [32m✓[39m src/ui/study-cases/__tests__/ProtectionCaseConfigPanel.test.ts [2m ([22m[2m3 tests[22m[2m)[22m[90m 4[2mms[22m[39m
 [32m✓[39m src/ui/catalog/__tests__/catalogSnapshot.test.ts [2m ([22m[2m4 tests[22m[2m)[22m[90m 3[2mms[22m[39m
 [32m✓[39m src/ui/proof/__tests__/TraceMetadataPanel.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 38[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/SldEmptyOverlay.test.tsx [2m ([22m[2m2 tests[22m[2m)[22m[90m 41[2mms[22m[39m
 [32m✓[39m src/ui/protection-diagnostics/__tests__/ProtectionDiagnosticsPanelContainer.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 41[2mms[22m[39m
 [32m✓[39m src/ui/network-build/__tests__/converterSourceFlow.test.ts [2m ([22m[2m2 tests[22m[2m)[22m[90m 3[2mms[22m[39m
 [32m✓[39m src/ui/shared/__tests__/enmVisibility.test.ts [2m ([22m[2m4 tests[22m[2m)[22m[90m 3[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/sldCanonicalHygiene.test.ts [2m ([22m[2m4 tests[22m[2m)[22m[90m 5[2mms[22m[39m
 [32m✓[39m src/ui/engineering-readiness/__tests__/EngineeringReadinessPanel.blocking.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 33[2mms[22m[39m
 [32m✓[39m src/ui/protection-coordination/__tests__/ProtectionSettingsEditor.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 60[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/powerFlowOverlayGeometryInvariant.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 31[2mms[22m[39m
 [32m✓[39m src/ui/notifications/__tests__/NotificationToast.test.tsx [2m ([22m[2m2 tests[22m[2m)[22m[90m 87[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/DiagnosticsLegend.test.tsx [2m ([22m[2m2 tests[22m[2m)[22m[90m 33[2mms[22m[39m
 [32m✓[39m src/ui/navigation/urlState.test.ts [2m ([22m[2m1 test[22m[2m)[22m[90m 11[2mms[22m[39m
 [32m✓[39m src/ui/common/connectionNode.test.ts [2m ([22m[2m2 tests[22m[2m)[22m[90m 3[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/readinessSyncPolicy.test.ts [2m ([22m[2m3 tests[22m[2m)[22m[90m 4[2mms[22m[39m
 [32m✓[39m src/ui/protection-coordination/__tests__/TracePanel.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 36[2mms[22m[39m
 [32m✓[39m src/ui/wizard/__tests__/wizardTerminology.test.ts [2m ([22m[2m1 test[22m[2m)[22m[90m 2[2mms[22m[39m
 [32m✓[39m src/ui/layout/__tests__/index.test.ts [2m ([22m[2m1 test[22m[2m)[22m[90m 2[2mms[22m[39m
[2m Test Files [22m [1m[32m302 passed[39m[22m[90m (302)[39m
[2m      Tests [22m [1m[32m4663 passed[39m[22m[2m | [22m[33m1 skipped[39m[90m (4664)[39m
[2m   Start at [22m 09:36:49
[2m   Duration [22m 688.29s[2m (transform 8.95s, setup 69.41s, collect 64.03s, tests 23.19s, environment 409.52s, prepare 66.71s)[22m
```

### stderr tail

```text
  /* fire events that update state */
});
/* assert on the output */
This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at EmbeddedSldWorkspace (C:\Users\radek\Documents\GitHub\MV-Design-PRO\mv-design-pro\frontend\src\ui\results-inspector\EmbeddedSldWorkspace.tsx:38:33)
Warning: An update to EmbeddedSldWorkspace inside a test was not wrapped in act(...).
When testing, code that causes React state updates should be wrapped into act(...):
act(() => {
  /* fire events that update state */
});
/* assert on the output */
This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at EmbeddedSldWorkspace (C:\Users\radek\Documents\GitHub\MV-Design-PRO\mv-design-pro\frontend\src\ui\results-inspector\EmbeddedSldWorkspace.tsx:38:33)
Warning: An update to EmbeddedSldWorkspace inside a test was not wrapped in act(...).
When testing, code that causes React state updates should be wrapped into act(...):
act(() => {
  /* fire events that update state */
});
/* assert on the output */
This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at EmbeddedSldWorkspace (C:\Users\radek\Documents\GitHub\MV-Design-PRO\mv-design-pro\frontend\src\ui\results-inspector\EmbeddedSldWorkspace.tsx:38:33)
[90mstderr[2m | src/ui/sld-editor/__tests__/useSldDragCad.test.tsx[2m > [22m[2museSldDrag (CAD)[2m > [22m[2mshould persist snapped node overrides after drag end[22m[39m
Warning: An update to TestComponent inside a test was not wrapped in act(...).
When testing, code that causes React state updates should be wrapped into act(...):
act(() => {
  /* fire events that update state */
});
/* assert on the output */
This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at TestComponent (C:\Users\radek\Documents\GitHub\MV-Design-PRO\mv-design-pro\frontend\node_modules\@testing-library\react\dist\pure.js:307:5)
```

## Frontend V12.5 performance harness (full)

- CWD: `C:\Users\radek\Documents\GitHub\MV-Design-PRO\mv-design-pro\frontend`
- Command: `npm run test -- --run src/ui/workspace/__tests__/v125.performance.test.tsx`
- Environment: `V125_PERF_PROFILE=full, V125_PERF_OUTPUT=C:\Users\radek\AppData\Local\Temp\mv_design_pro_v125_perf_full.json`
- Status: `PASS`

### stdout tail

```text
> mv-design-pro-frontend@0.1.0 test
> vitest run --no-file-parallelism --run src/ui/workspace/__tests__/v125.performance.test.tsx
[7m[1m[36m RUN [39m[22m[27m [36mv1.6.1[39m [90mC:/Users/radek/Documents/GitHub/MV-Design-PRO/mv-design-pro/frontend[39m
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures mini-SLD helper surface mount[22m[39m
[v125-perf] mini-sld mean=9.75ms median=8.02ms p95=21.04ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures full SLD pipeline and canvas mount[22m[39m
[v125-perf] full-sld mean=111.75ms median=108.87ms p95=134.57ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-06 analysis surface mount[22m[39m
[v125-perf] E-06 mean=3.37ms median=2.99ms p95=5.11ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-27 report surface mount[22m[39m
[v125-perf] E-27 mean=6.78ms median=5.24ms p95=18.32ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-28 protection coordination surface mount[22m[39m
[v125-perf] E-28 mean=5.95ms median=5.88ms p95=6.51ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-29 symmetrical components surface mount[22m[39m
[v125-perf] E-29 mean=7.04ms median=5.58ms p95=15.12ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-30 compliance surface mount[22m[39m
[v125-perf] E-30 mean=6.70ms median=6.50ms p95=7.85ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-33 thermal dynamic surface mount[22m[39m
[v125-perf] E-33 mean=7.24ms median=6.15ms p95=10.71ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-34 convergence surface mount[22m[39m
[v125-perf] E-34 mean=5.62ms median=5.49ms p95=6.25ms
 [32m✓[39m src/ui/workspace/__tests__/v125.performance.test.tsx [2m ([22m[2m9 tests[22m[2m)[22m[33m 2201[2mms[22m[39m
[2m Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[32m9 passed[39m[22m[90m (9)[39m
[2m   Start at [22m 09:48:19
[2m   Duration [22m 8.52s[2m (transform 2.17s, setup 241ms, collect 3.47s, tests 2.20s, environment 1.42s, prepare 245ms)[22m
```

### stderr tail

```text
<empty>
```

## Golden tests

- CWD: `C:\Users\radek\Documents\GitHub\MV-Design-PRO\mv-design-pro\frontend`
- Command: `npm run test:golden`
- Status: `PASS`

### stdout tail

```text
> mv-design-pro-frontend@0.1.0 test:golden
> vitest run --no-file-parallelism src/ui/sld/core/__tests__/goldenNetworkE2E.test.ts src/ui/sld/core/__tests__/sldRenderManifestGolden.test.ts src/ui/sld/core/__tests__/switchgearConfigGolden.test.ts src/ui/sld-editor/utils/topological-layout/__tests__/goldenFixtures.test.ts src/ui/sld-editor/utils/topological-layout/__tests__/goldenNetworkSn.test.ts src/ui/__tests__/ux-golden-scenario.test.ts
[7m[1m[36m RUN [39m[22m[27m [36mv1.6.1[39m [90mC:/Users/radek/Documents/GitHub/MV-Design-PRO/mv-design-pro/frontend[39m
 [32m✓[39m src/ui/sld/core/__tests__/goldenNetworkE2E.test.ts [2m ([22m[2m52 tests[22m[2m)[22m[33m 804[2mms[22m[39m
 [32m✓[39m src/ui/sld-editor/utils/topological-layout/__tests__/goldenNetworkSn.test.ts [2m ([22m[2m17 tests[22m[2m)[22m[33m 1529[2mms[22m[39m
 [32m✓[39m src/ui/__tests__/ux-golden-scenario.test.ts [2m ([22m[2m45 tests[22m[2m)[22m[90m 47[2mms[22m[39m
 [32m✓[39m src/ui/sld-editor/utils/topological-layout/__tests__/goldenFixtures.test.ts [2m ([22m[2m27 tests[22m[2m)[22m[90m 110[2mms[22m[39m
 [32m✓[39m src/ui/sld/core/__tests__/switchgearConfigGolden.test.ts [2m ([22m[2m9 tests[22m[2m)[22m[90m 36[2mms[22m[39m
 [32m✓[39m src/ui/sld/core/__tests__/sldRenderManifestGolden.test.ts [2m ([22m[2m10 tests[22m[2m)[22m[90m 33[2mms[22m[39m
[2m Test Files [22m [1m[32m6 passed[39m[22m[90m (6)[39m
[2m      Tests [22m [1m[32m160 passed[39m[22m[90m (160)[39m
[2m   Start at [22m 09:48:29
[2m   Duration [22m 16.69s[2m (transform 657ms, setup 1.46s, collect 978ms, tests 2.56s, environment 8.49s, prepare 1.34s)[22m
```

### stderr tail

```text
<empty>
```

## E2E tests

- CWD: `C:\Users\radek\Documents\GitHub\MV-Design-PRO\mv-design-pro\frontend`
- Command: `npm run test:e2e`
- Status: `PASS`

### stdout tail

```text
> mv-design-pro-frontend@0.1.0 test:e2e
> node ./scripts/playwright-run.mjs
Running 18 tests using 1 worker
[1A[2K[1/18] [chromium] › e2e\branch-points-workflow.spec.ts:179:3 › Branch points workflow › opens branch pole form from canonical overhead-line surface
[1A[2K[2/18] [chromium] › e2e\branch-points-workflow.spec.ts:216:3 › Branch points workflow › opens ZKSN form from canonical cable surface
[1A[2K[3/18] [chromium] › e2e\catalog-enforcement.spec.ts:223:3 › Catalog-First Enforcement - realny backend › frontend nie wystawia bezposrednich przyciskow branch point i ZKSN bez kontekstu segmentu
[1A[2K[4/18] [chromium] › e2e\catalog-enforcement.spec.ts:232:3 › Catalog-First Enforcement - realny backend › formularz lacznika sekcyjnego blokuje wstawienie bez katalogu
[1A[2K[5/18] [chromium] › e2e\catalog-enforcement.spec.ts:248:3 › Catalog-First Enforcement - realny backend › przycisk domkniecia pierscienia jest nieaktywny bez kandydatow ringu
[1A[2K[6/18] [chromium] › e2e\catalog-enforcement.spec.ts:258:3 › Catalog-First Enforcement - realny backend › backend odrzuca insert_branch_pole_on_segment_sn bez katalogu
[1A[2K[7/18] [chromium] › e2e\catalog-enforcement.spec.ts:272:3 › Catalog-First Enforcement - realny backend › backend odrzuca insert_zksn_on_segment_sn bez katalogu
[1A[2K[8/18] [chromium] › e2e\catalog-enforcement.spec.ts:288:3 › Catalog-First Enforcement - realny backend › backend odrzuca insert_section_switch_sn bez katalogu
[1A[2K[9/18] [chromium] › e2e\catalog-enforcement.spec.ts:304:3 › Catalog-First Enforcement - realny backend › backend odrzuca connect_secondary_ring_sn bez katalogu
[1A[2K[10/18] [chromium] › e2e\create-first-case.spec.ts:132:1 › tworzenie pierwszego przypadku jest deterministyczne i bez freeze
[1A[2K[11/18] [chromium] › e2e\critical-run-flow.spec.ts:159:1 › krytyczny flow V1 na realnym backendzie: case -> GPZ -> trunk -> station -> branch -> katalogi -> readiness -> run -> wyniki -> SLD -> White Box -> geometria bez zmian
[1A[2K[12/18] [chromium] › e2e\happy-path.spec.ts:32:3 › UI Integration E2E Happy Path › renders canonical active case bar and mode indicator
[1A[2K[13/18] [chromium] › e2e\happy-path.spec.ts:39:3 › UI Integration E2E Happy Path › opens canonical variants helper surface z active case bar
[1A[2K[14/18] [chromium] › e2e\happy-path.spec.ts:47:3 › UI Integration E2E Happy Path › switches shell mode on canonical analytical routes
[1A[2K[15/18] [chromium] › e2e\happy-path.spec.ts:61:3 › UI Integration E2E Happy Path › persists seeded UI state in localStorage
[1A[2K[16/18] [chromium] › e2e\happy-path.spec.ts:83:3 › Context Bar Synchronization › keeps calculate action visible and mode consistent while navigating
[1A[2K[17/18] [chromium] › e2e\sld-editor-real-backend-flex.spec.ts:213:1 › real backend SLD editor flow: source -> trunk -> station -> branch -> update -> delete -> continue
[1A[2K[18/18] [chromium] › e2e\sld-editor-real-backend-flex.spec.ts:331:1 › real backend supports flexible operation order combinations
[1A[2K  18 passed (45.1s)
```

### stderr tail

```text
<empty>
```

## Performance Report

- Profile: `full`
- Measured at: `2026-04-21T08:48:27.760Z`
- Harness: `frontend/src/ui/workspace/__tests__/v125.performance.test.tsx`
- Methodology: `2` warm-up run(s) + `7` measured run(s) per target.

| Target | Kind | Mean [ms] | Median [ms] | P95 [ms] | Max [ms] | Samples [ms] |
|---|---|---:|---:|---:|---:|---|
| Mini-SLD helper surface | mount | 9.75 | 8.02 | 21.04 | 21.04 | 21.04, 11.28, 8.02, 7.31, 5.98, 8.22, 6.42 |
| Full SLD terrain pipeline + canvas | pipeline+mount | 111.75 | 108.87 | 134.57 | 134.57 | 134.57, 90.56, 107.75, 101.82, 108.87, 126.99, 111.69 |
| Nakladka wynikowa na schemacie | mount | 3.37 | 2.99 | 5.11 | 5.11 | 2.62, 2.99, 2.53, 5.11, 3.64, 2.64, 4.06 |
| Raporty i eksporty | mount | 6.78 | 5.24 | 18.32 | 18.32 | 5.24, 18.32, 5.24, 4.14, 5.76, 4.66, 4.13 |
| Koordynacja zabezpieczen | mount | 5.95 | 5.88 | 6.51 | 6.51 | 6.51, 6.10, 6.38, 5.80, 5.69, 5.32, 5.88 |
| Skladowe symetryczne i siec zerowa | mount | 7.04 | 5.58 | 15.12 | 15.12 | 5.58, 5.21, 5.41, 5.79, 15.12, 5.56, 6.59 |
| Wymagania przylaczeniowe i kodeks sieciowy | mount | 6.70 | 6.50 | 7.85 | 7.85 | 5.98, 6.50, 7.85, 7.46, 6.24, 7.21, 5.65 |
| Weryfikacja cieplna i dynamiczna toru pradowego | mount | 7.24 | 6.15 | 10.71 | 10.71 | 5.98, 6.15, 8.65, 5.95, 5.69, 10.71, 7.56 |
| Zbieznosc rozplywu mocy i regulacja zaczepow | mount | 5.62 | 5.49 | 6.25 | 6.25 | 6.25, 5.40, 5.38, 5.29, 5.52, 5.49, 6.04 |
