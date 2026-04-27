# Verification V12.5

- Generated at: `2026-04-25 22:21:35Z`
- Package manager: `npm`
- Total steps: `18`
- Passed: `18`
- Failed: `0`

| Step | Status | Exit code | Duration [s] |
|---|---|---:|---:|
| UI terminology guard | PASS | 0 | 1.17 |
| Docs archive guard | PASS | 0 | 0.54 |
| V12.xx canon guard | PASS | 0 | 0.66 |
| API lifecycle guard | PASS | 0 | 0.26 |
| Legacy public path guard | PASS | 0 | 0.19 |
| Severity contract guard | PASS | 0 | 0.12 |
| Import graph guard | PASS | 0 | 0.09 |
| Grep-zero guard | PASS | 0 | 0.09 |
| Backend V12.5 lint (ruff) | PASS | 0 | 1.70 |
| Backend V12.5 format check (black) | PASS | 0 | 4.24 |
| Backend targeted V12.5 tests | PASS | 0 | 11.46 |
| Vulture guard | PASS | 0 | 4.90 |
| Frontend lint | PASS | 0 | 20.50 |
| Frontend type-check | PASS | 0 | 27.93 |
| Frontend tests | PASS | 0 | 751.20 |
| Frontend V12.5 performance harness (full) | PASS | 0 | 12.16 |
| Golden tests | PASS | 0 | 21.51 |
| E2E tests | PASS | 0 | 79.52 |

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

## V12.xx canon guard

- CWD: `C:\Users\radek\Documents\GitHub\MV-Design-PRO\mv-design-pro`
- Command: `C:\Users\radek\AppData\Local\Programs\Python\Python311\python.exe C:\Users\radek\Documents\GitHub\MV-Design-PRO\mv-design-pro\scripts\v12xx_canon_guard.py`
- Status: `PASS`

### stdout tail

```text
v12xx-canon-guard: OK
```

### stderr tail

```text
<empty>
```

## API lifecycle guard

- CWD: `C:\Users\radek\Documents\GitHub\MV-Design-PRO\mv-design-pro`
- Command: `C:\Users\radek\AppData\Local\Programs\Python\Python311\python.exe C:\Users\radek\Documents\GitHub\MV-Design-PRO\mv-design-pro\scripts\api_lifecycle_guard.py`
- Status: `PASS`

### stdout tail

```text
api-lifecycle-guard: OK
```

### stderr tail

```text
<empty>
```

## Legacy public path guard

- CWD: `C:\Users\radek\Documents\GitHub\MV-Design-PRO\mv-design-pro`
- Command: `C:\Users\radek\AppData\Local\Programs\Python\Python311\python.exe C:\Users\radek\Documents\GitHub\MV-Design-PRO\mv-design-pro\scripts\legacy_public_path_guard.py`
- Status: `PASS`

### stdout tail

```text
legacy-public-path-guard: OK
```

### stderr tail

```text
<empty>
```

## Severity contract guard

- CWD: `C:\Users\radek\Documents\GitHub\MV-Design-PRO\mv-design-pro`
- Command: `C:\Users\radek\AppData\Local\Programs\Python\Python311\python.exe C:\Users\radek\Documents\GitHub\MV-Design-PRO\mv-design-pro\scripts\severity_contract_guard.py`
- Status: `PASS`

### stdout tail

```text
severity-contract-guard: OK
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
- Command: `poetry run ruff check src\api\analysis_case_context.py src\api\analysis_run_exports.py src\api\canonical_run_views.py src\api\power_flow_runs.py src\api\v125_contracts.py src\application\field_read_model.py src\application\compliance\source_compliance.py src\domain\generator_validation.py src\enm\canonical_analysis.py src\enm\v2_projection.py src\infrastructure\persistence\repositories\canonical_run_repository.py tests\api\test_analysis_run_report_exports.py tests\application\analysis_run\test_analysis_run_service.py tests\enm\test_enm_field_view_api.py tests\enm\test_v2_projection.py tests\application\test_source_compliance.py tests\test_generator_validation.py tests\test_canonical_analysis_api.py tests\test_execution_api.py tests\test_production_canonical_only_api.py`
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
- Command: `poetry run python -m black --check --diff src\api\analysis_case_context.py src\api\analysis_run_exports.py src\api\canonical_run_views.py src\api\power_flow_runs.py src\api\v125_contracts.py src\application\field_read_model.py src\application\compliance\source_compliance.py src\domain\generator_validation.py src\enm\canonical_analysis.py src\enm\v2_projection.py src\infrastructure\persistence\repositories\canonical_run_repository.py tests\api\test_analysis_run_report_exports.py tests\application\analysis_run\test_analysis_run_service.py tests\enm\test_enm_field_view_api.py tests\enm\test_v2_projection.py tests\application\test_source_compliance.py tests\test_generator_validation.py tests\test_canonical_analysis_api.py tests\test_execution_api.py tests\test_production_canonical_only_api.py`
- Status: `PASS`

### stdout tail

```text
<empty>
```

### stderr tail

```text
All done! \u2728 \U0001f370 \u2728
20 files would be left unchanged.
```

## Backend targeted V12.5 tests

- CWD: `C:\Users\radek\Documents\GitHub\MV-Design-PRO\mv-design-pro\backend`
- Command: `poetry run pytest tests\application\analysis_run\test_analysis_run_service.py tests\test_canonical_analysis_api.py tests\test_execution_api.py tests\test_production_canonical_only_api.py tests\enm\test_enm_field_view_api.py tests\enm\test_v2_projection.py tests\application\test_source_compliance.py tests\test_generator_validation.py tests\api\test_analysis_run_report_exports.py`
- Status: `PASS`

### stdout tail

```text
============================= test session starts =============================
platform win32 -- Python 3.11.9, pytest-7.4.4, pluggy-1.6.0
rootdir: C:\Users\radek\Documents\GitHub\MV-Design-PRO\mv-design-pro\backend
configfile: pyproject.toml
plugins: anyio-4.12.1, asyncio-0.23.8, cov-4.1.0
asyncio: mode=Mode.AUTO
collected 102 items
tests\application\analysis_run\test_analysis_run_service.py ............ [ 11%]
.....                                                                    [ 16%]
tests\test_canonical_analysis_api.py ........                            [ 24%]
tests\test_execution_api.py ..................                           [ 42%]
tests\test_production_canonical_only_api.py .....                        [ 47%]
tests\enm\test_enm_field_view_api.py .....                               [ 51%]
tests\enm\test_v2_projection.py ........                                 [ 59%]
tests\application\test_source_compliance.py .........                    [ 68%]
tests\test_generator_validation.py ....................                  [ 88%]
tests\api\test_analysis_run_report_exports.py ............               [100%]
============================= 102 passed in 8.11s =============================
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
 [32m✓[39m src/ui/network-build/__tests__/networkBuildStore.routeSurfaces.test.ts [2m ([22m[2m3 tests[22m[2m)[22m[90m 3[2mms[22m[39m
 [32m✓[39m src/ui/property-grid/__tests__/EngineeringInspector.test.tsx [2m ([22m[2m3 tests[22m[2m)[22m[90m 80[2mms[22m[39m
 [32m✓[39m src/ui/catalog/__tests__/TypePicker.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 214[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/SegmentInspectorPanel.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 59[2mms[22m[39m
 [32m✓[39m src/ui/__tests__/legacyPublicApiCut.test.ts [2m ([22m[2m4 tests[22m[2m)[22m[90m 7[2mms[22m[39m
 [32m✓[39m src/ui/app-state/__tests__/useCanCalculateReadiness.test.ts [2m ([22m[2m2 tests[22m[2m)[22m[90m 22[2mms[22m[39m
 [32m✓[39m src/ui/study-cases/__tests__/ProtectionCaseConfigPanel.test.ts [2m ([22m[2m3 tests[22m[2m)[22m[90m 6[2mms[22m[39m
 [32m✓[39m src/ui/proof/__tests__/TraceMetadataPanel.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 62[2mms[22m[39m
 [32m✓[39m src/ui/study-cases/__tests__/api.draft-isolation.test.ts [2m ([22m[2m1 test[22m[2m)[22m[90m 6[2mms[22m[39m
 [32m✓[39m src/ui/catalog/__tests__/catalogSnapshot.test.ts [2m ([22m[2m4 tests[22m[2m)[22m[90m 4[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/SldEmptyOverlay.test.tsx [2m ([22m[2m2 tests[22m[2m)[22m[90m 48[2mms[22m[39m
 [32m✓[39m src/ui/protection-diagnostics/__tests__/ProtectionDiagnosticsPanelContainer.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 48[2mms[22m[39m
 [32m✓[39m src/ui/network-build/__tests__/converterSourceFlow.test.ts [2m ([22m[2m2 tests[22m[2m)[22m[90m 3[2mms[22m[39m
 [32m✓[39m src/ui/shared/__tests__/enmVisibility.test.ts [2m ([22m[2m4 tests[22m[2m)[22m[90m 3[2mms[22m[39m
 [32m✓[39m src/ui/engineering-readiness/__tests__/EngineeringReadinessPanel.blocking.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 43[2mms[22m[39m
 [32m✓[39m src/ui/protection-coordination/__tests__/ProtectionSettingsEditor.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 62[2mms[22m[39m
 [32m✓[39m src/ui/notifications/__tests__/NotificationToast.test.tsx [2m ([22m[2m2 tests[22m[2m)[22m[90m 115[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/powerFlowOverlayGeometryInvariant.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 32[2mms[22m[39m
 [32m✓[39m src/ui/__tests__/activeShellTerminology.test.ts [2m ([22m[2m1 test[22m[2m)[22m[90m 6[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/DiagnosticsLegend.test.tsx [2m ([22m[2m2 tests[22m[2m)[22m[90m 45[2mms[22m[39m
 [32m✓[39m src/ui/navigation/urlState.test.ts [2m ([22m[2m1 test[22m[2m)[22m[90m 12[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/readinessSyncPolicy.test.ts [2m ([22m[2m3 tests[22m[2m)[22m[90m 6[2mms[22m[39m
 [32m✓[39m src/ui/common/connectionNode.test.ts [2m ([22m[2m2 tests[22m[2m)[22m[90m 3[2mms[22m[39m
 [32m✓[39m src/ui/protection-coordination/__tests__/TracePanel.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 53[2mms[22m[39m
 [32m✓[39m src/ui/shared/__tests__/generatorTypeLabels.test.ts [2m ([22m[2m1 test[22m[2m)[22m[90m 3[2mms[22m[39m
 [32m✓[39m src/ui/layout/__tests__/index.test.ts [2m ([22m[2m1 test[22m[2m)[22m[90m 5[2mms[22m[39m
[2m Test Files [22m [1m[32m300 passed[39m[22m[90m (300)[39m
[2m      Tests [22m [1m[32m4610 passed[39m[22m[2m | [22m[33m1 skipped[39m[90m (4611)[39m
[2m   Start at [22m 23:07:12
[2m   Duration [22m 749.53s[2m (transform 9.40s, setup 75.27s, collect 67.97s, tests 27.60s, environment 447.26s, prepare 72.00s)[22m
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
[v125-perf] mini-sld mean=9.45ms median=7.45ms p95=19.68ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures full SLD pipeline and canvas mount[22m[39m
[v125-perf] full-sld mean=152.07ms median=150.04ms p95=172.03ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-06 analysis surface mount[22m[39m
[v125-perf] E-06 mean=4.69ms median=4.99ms p95=6.01ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-27 report surface mount[22m[39m
[v125-perf] E-27 mean=10.61ms median=8.98ms p95=24.07ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-28 protection coordination surface mount[22m[39m
[v125-perf] E-28 mean=10.58ms median=11.29ms p95=14.55ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-29 symmetrical components surface mount[22m[39m
[v125-perf] E-29 mean=7.13ms median=6.85ms p95=10.20ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-30 compliance surface mount[22m[39m
[v125-perf] E-30 mean=14.42ms median=13.54ms p95=19.40ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-33 thermal dynamic surface mount[22m[39m
[v125-perf] E-33 mean=13.91ms median=13.80ms p95=18.83ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-34 convergence surface mount[22m[39m
[v125-perf] E-34 mean=6.35ms median=6.54ms p95=6.99ms
 [32m✓[39m src/ui/workspace/__tests__/v125.performance.test.tsx [2m ([22m[2m9 tests[22m[2m)[22m[33m 2904[2mms[22m[39m
[2m Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[32m9 passed[39m[22m[90m (9)[39m
[2m   Start at [22m 23:19:43
[2m   Duration [22m 10.53s[2m (transform 2.45s, setup 236ms, collect 3.89s, tests 2.90s, environment 1.85s, prepare 287ms)[22m
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
 [32m✓[39m src/ui/sld/core/__tests__/goldenNetworkE2E.test.ts [2m ([22m[2m52 tests[22m[2m)[22m[33m 910[2mms[22m[39m
 [32m✓[39m src/ui/sld-editor/utils/topological-layout/__tests__/goldenNetworkSn.test.ts [2m ([22m[2m17 tests[22m[2m)[22m[33m 1828[2mms[22m[39m
 [32m✓[39m src/ui/__tests__/ux-golden-scenario.test.ts [2m ([22m[2m45 tests[22m[2m)[22m[90m 54[2mms[22m[39m
 [32m✓[39m src/ui/sld-editor/utils/topological-layout/__tests__/goldenFixtures.test.ts [2m ([22m[2m27 tests[22m[2m)[22m[90m 127[2mms[22m[39m
 [32m✓[39m src/ui/sld/core/__tests__/switchgearConfigGolden.test.ts [2m ([22m[2m9 tests[22m[2m)[22m[90m 81[2mms[22m[39m
 [32m✓[39m src/ui/sld/core/__tests__/sldRenderManifestGolden.test.ts [2m ([22m[2m10 tests[22m[2m)[22m[90m 42[2mms[22m[39m
[2m Test Files [22m [1m[32m6 passed[39m[22m[90m (6)[39m
[2m      Tests [22m [1m[32m160 passed[39m[22m[90m (160)[39m
[2m   Start at [22m 23:19:56
[2m   Duration [22m 19.90s[2m (transform 723ms, setup 1.72s, collect 1.06s, tests 3.04s, environment 10.07s, prepare 1.53s)[22m
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
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:59499 - "GET /api/cases/4a563a3b-fe38-4601-ad41-aa78209454cf/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:59498 - "POST /api/cases/4a563a3b-fe38-4601-ad41-aa78209454cf/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:59500 - "POST /api/cases/4a563a3b-fe38-4601-ad41-aa78209454cf/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:59501 - "GET /api/cases/4a563a3b-fe38-4601-ad41-aa78209454cf/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:60658 - "POST /api/cases/4a563a3b-fe38-4601-ad41-aa78209454cf/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:60658 - "POST /api/cases/4a563a3b-fe38-4601-ad41-aa78209454cf/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:60658 - "POST /api/cases/4a563a3b-fe38-4601-ad41-aa78209454cf/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:63889 - "GET /api/cases/4a563a3b-fe38-4601-ad41-aa78209454cf/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:63888 - "POST /api/cases/4a563a3b-fe38-4601-ad41-aa78209454cf/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:63890 - "POST /api/cases/4a563a3b-fe38-4601-ad41-aa78209454cf/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:63891 - "GET /api/cases/4a563a3b-fe38-4601-ad41-aa78209454cf/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[18/18] [chromium] › e2e\sld-editor-real-backend-flex.spec.ts:331:1 › real backend supports flexible operation order combinations
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:60658 - "POST /api/projects HTTP/1.1" 201 Created
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:60658 - "POST /api/study-cases HTTP/1.1" 201 Created
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:58567 - "POST /api/cases/3abe8007-1627-4c49-b63b-8c8ec9acfccf/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:58568 - "GET /api/cases/3abe8007-1627-4c49-b63b-8c8ec9acfccf/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:58569 - "POST /api/cases/3abe8007-1627-4c49-b63b-8c8ec9acfccf/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:58570 - "GET /api/cases/3abe8007-1627-4c49-b63b-8c8ec9acfccf/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:60658 - "POST /api/cases/3abe8007-1627-4c49-b63b-8c8ec9acfccf/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:60658 - "POST /api/cases/3abe8007-1627-4c49-b63b-8c8ec9acfccf/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:60658 - "POST /api/cases/3abe8007-1627-4c49-b63b-8c8ec9acfccf/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:60658 - "POST /api/cases/3abe8007-1627-4c49-b63b-8c8ec9acfccf/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:60658 - "POST /api/cases/3abe8007-1627-4c49-b63b-8c8ec9acfccf/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:60658 - "POST /api/cases/3abe8007-1627-4c49-b63b-8c8ec9acfccf/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:60658 - "POST /api/cases/3abe8007-1627-4c49-b63b-8c8ec9acfccf/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:57817 - "GET /api/cases/3abe8007-1627-4c49-b63b-8c8ec9acfccf/engineering-readiness HTTP/1.1" 200 OK
[2m[WebServer] [22mINFO:     127.0.0.1:57816 - "POST /api/cases/3abe8007-1627-4c49-b63b-8c8ec9acfccf/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:57818 - "POST /api/cases/3abe8007-1627-4c49-b63b-8c8ec9acfccf/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:57819 - "GET /api/cases/3abe8007-1627-4c49-b63b-8c8ec9acfccf/engineering-readiness HTTP/1.1" 200 OK
[1A[2K  18 passed (1.2m)
```

### stderr tail

```text
[1A[2K[2m[WebServer] [22m2026-04-25T23:21:24 INFO mv_design_pro HTTP POST /api/cases/4a563a3b-fe38-4601-ad41-aa78209454cf/enm/domain-ops -> 200 (31.0ms) rid=3ce87bca-780f-4677-92f2-f0f5e99a4081
[1A[2K[2m[WebServer] [22m2026-04-25T23:21:24 INFO mv_design_pro HTTP POST /api/cases/4a563a3b-fe38-4601-ad41-aa78209454cf/enm/domain-ops -> 200 (31.0ms) rid=408c486f-5836-47fa-9801-d020a9d1224b
[1A[2K[2m[WebServer] [22m2026-04-25T23:21:25 INFO mv_design_pro HTTP GET /api/cases/4a563a3b-fe38-4601-ad41-aa78209454cf/engineering-readiness -> 200 (15.0ms) rid=e96d2263-cc40-4939-ac44-213a68a36de2
[1A[2K[2m[WebServer] [22m2026-04-25T23:21:25 INFO mv_design_pro HTTP POST /api/cases/4a563a3b-fe38-4601-ad41-aa78209454cf/enm/domain-ops -> 200 (31.0ms) rid=a39d87ca-c88a-401e-9b85-f86be70080bf
[1A[2K[2m[WebServer] [22m2026-04-25T23:21:25 INFO mv_design_pro HTTP POST /api/cases/4a563a3b-fe38-4601-ad41-aa78209454cf/enm/domain-ops -> 200 (16.0ms) rid=d7c36862-306c-4adc-bf3b-e05dee02b764
[1A[2K[2m[WebServer] [22m2026-04-25T23:21:25 INFO mv_design_pro HTTP GET /api/cases/4a563a3b-fe38-4601-ad41-aa78209454cf/engineering-readiness -> 200 (0.0ms) rid=f40986e7-d8a2-446f-92d5-6856783e7840
[1A[2K[2m[WebServer] [22m2026-04-25T23:21:25 INFO mv_design_pro HTTP POST /api/cases/4a563a3b-fe38-4601-ad41-aa78209454cf/enm/domain-ops -> 200 (15.0ms) rid=4328ac80-c388-4a5f-9a4e-843e8533a68c
[1A[2K[2m[WebServer] [22m2026-04-25T23:21:25 INFO mv_design_pro HTTP POST /api/cases/4a563a3b-fe38-4601-ad41-aa78209454cf/enm/domain-ops -> 200 (16.0ms) rid=5aa1d76b-8c39-402f-a35a-90d9f3782f9d
[1A[2K[2m[WebServer] [22m2026-04-25T23:21:25 INFO mv_design_pro HTTP POST /api/cases/4a563a3b-fe38-4601-ad41-aa78209454cf/enm/domain-ops -> 200 (31.0ms) rid=9d30c3ff-4fbf-4a5f-a3dc-d5a2658bb1bc
[1A[2K[2m[WebServer] [22m2026-04-25T23:21:26 INFO mv_design_pro HTTP GET /api/cases/4a563a3b-fe38-4601-ad41-aa78209454cf/engineering-readiness -> 200 (31.0ms) rid=0a05f769-97ea-4818-beb0-345520780b37
[1A[2K[2m[WebServer] [22m2026-04-25T23:21:26 INFO mv_design_pro HTTP POST /api/cases/4a563a3b-fe38-4601-ad41-aa78209454cf/enm/domain-ops -> 200 (31.0ms) rid=017b507c-b0be-4a5b-8104-ceaa4ff9e73d
[1A[2K[2m[WebServer] [22m2026-04-25T23:21:26 INFO mv_design_pro HTTP POST /api/cases/4a563a3b-fe38-4601-ad41-aa78209454cf/enm/domain-ops -> 200 (47.0ms) rid=299ef083-7729-4348-9b2b-296690a8a848
[1A[2K[2m[WebServer] [22m2026-04-25T23:21:26 INFO mv_design_pro HTTP GET /api/cases/4a563a3b-fe38-4601-ad41-aa78209454cf/engineering-readiness -> 200 (0.0ms) rid=7dbf8169-6f13-41a5-a5ff-87ad0802984c
[1A[2K[2m[WebServer] [22m2026-04-25T23:21:27 INFO mv_design_pro HTTP POST /api/projects -> 201 (31.0ms) rid=dbeef00a-b7b0-4ec5-8e3b-e5892e85cbca
[1A[2K[2m[WebServer] [22m2026-04-25T23:21:27 INFO mv_design_pro HTTP POST /api/study-cases -> 201 (16.0ms) rid=f516ec12-834a-4081-b8e3-bc2519282af5
[1A[2K[2m[WebServer] [22m2026-04-25T23:21:29 INFO mv_design_pro HTTP POST /api/cases/3abe8007-1627-4c49-b63b-8c8ec9acfccf/enm/domain-ops -> 200 (16.0ms) rid=417a07da-1a49-4662-9e96-f5fe3b7f775a
[1A[2K[2m[WebServer] [22m2026-04-25T23:21:29 INFO mv_design_pro HTTP GET /api/cases/3abe8007-1627-4c49-b63b-8c8ec9acfccf/engineering-readiness -> 200 (15.0ms) rid=b278eba3-f791-41b6-ab3d-b045aad9cb60
[1A[2K[2m[WebServer] [22m2026-04-25T23:21:29 INFO mv_design_pro HTTP POST /api/cases/3abe8007-1627-4c49-b63b-8c8ec9acfccf/enm/domain-ops -> 200 (16.0ms) rid=8672b149-0cfc-4ea3-a0c5-5c93834265ff
[1A[2K[2m[WebServer] [22m2026-04-25T23:21:29 INFO mv_design_pro HTTP GET /api/cases/3abe8007-1627-4c49-b63b-8c8ec9acfccf/engineering-readiness -> 200 (16.0ms) rid=a4637c1d-2c98-478f-a9db-786934f31666
[1A[2K[2m[WebServer] [22m2026-04-25T23:21:29 INFO mv_design_pro HTTP POST /api/cases/3abe8007-1627-4c49-b63b-8c8ec9acfccf/enm/domain-ops -> 200 (78.0ms) rid=3092a843-a0b1-481b-abfc-aa09e1427f4c
[1A[2K[2m[WebServer] [22m2026-04-25T23:21:29 INFO mv_design_pro HTTP POST /api/cases/3abe8007-1627-4c49-b63b-8c8ec9acfccf/enm/domain-ops -> 200 (47.0ms) rid=1f896760-478b-4fd1-91fb-7c652f93eb8a
[1A[2K[2m[WebServer] [22m2026-04-25T23:21:29 INFO mv_design_pro HTTP POST /api/cases/3abe8007-1627-4c49-b63b-8c8ec9acfccf/enm/domain-ops -> 200 (16.0ms) rid=47971a94-250b-41a9-aef3-c88360527acd
[1A[2K[2m[WebServer] [22m2026-04-25T23:21:29 INFO mv_design_pro HTTP POST /api/cases/3abe8007-1627-4c49-b63b-8c8ec9acfccf/enm/domain-ops -> 200 (0.0ms) rid=facbf988-2c7d-4c70-b415-2270fefe0f08
[1A[2K[2m[WebServer] [22m2026-04-25T23:21:30 INFO mv_design_pro HTTP POST /api/cases/3abe8007-1627-4c49-b63b-8c8ec9acfccf/enm/domain-ops -> 200 (31.0ms) rid=79c96018-a171-415e-909a-27e7f442f8d6
[1A[2K[2m[WebServer] [22m2026-04-25T23:21:30 INFO mv_design_pro HTTP POST /api/cases/3abe8007-1627-4c49-b63b-8c8ec9acfccf/enm/domain-ops -> 200 (31.0ms) rid=96a92086-4ffa-469c-8628-7a3b27cc980c
[1A[2K[2m[WebServer] [22m2026-04-25T23:21:30 INFO mv_design_pro HTTP POST /api/cases/3abe8007-1627-4c49-b63b-8c8ec9acfccf/enm/domain-ops -> 200 (78.0ms) rid=dd701612-18b8-4ea0-8dbc-f3aa14f1b2ef
[1A[2K[2m[WebServer] [22m2026-04-25T23:21:32 INFO mv_design_pro HTTP GET /api/cases/3abe8007-1627-4c49-b63b-8c8ec9acfccf/engineering-readiness -> 200 (15.0ms) rid=fceb6b09-2880-43d1-857b-25374042baf0
[1A[2K[2m[WebServer] [22m2026-04-25T23:21:32 INFO mv_design_pro HTTP POST /api/cases/3abe8007-1627-4c49-b63b-8c8ec9acfccf/enm/domain-ops -> 200 (15.0ms) rid=f2abe025-c84f-4874-961b-fca9944030dd
[1A[2K[2m[WebServer] [22m2026-04-25T23:21:32 INFO mv_design_pro HTTP POST /api/cases/3abe8007-1627-4c49-b63b-8c8ec9acfccf/enm/domain-ops -> 200 (32.0ms) rid=0b4ba5f5-db8b-4185-a5d8-5da677f56e36
[1A[2K[2m[WebServer] [22m2026-04-25T23:21:32 INFO mv_design_pro HTTP GET /api/cases/3abe8007-1627-4c49-b63b-8c8ec9acfccf/engineering-readiness -> 200 (0.0ms) rid=54dce9bc-e801-4fc3-a046-6f1532fc260e
```

## Performance Report

- Profile: `full`
- Measured at: `2026-04-25T22:19:54.506Z`
- Harness: `frontend/src/ui/workspace/__tests__/v125.performance.test.tsx`
- Methodology: `2` warm-up run(s) + `7` measured run(s) per target.

| Target | Kind | Mean [ms] | Median [ms] | P95 [ms] | Max [ms] | Samples [ms] |
|---|---|---:|---:|---:|---:|---|
| Mini-SLD helper surface | mount | 9.45 | 7.45 | 19.68 | 19.68 | 19.68, 6.97, 10.51, 6.02, 5.94, 9.60, 7.45 |
| Full SLD terrain pipeline + canvas | pipeline+mount | 152.07 | 150.04 | 172.03 | 172.03 | 172.03, 132.04, 156.50, 150.04, 148.77, 133.17, 171.95 |
| Nakladka wynikowa na schemacie | mount | 4.69 | 4.99 | 6.01 | 6.01 | 3.49, 3.38, 4.99, 5.32, 4.04, 6.01, 5.60 |
| Raporty i eksporty | mount | 10.61 | 8.98 | 24.07 | 24.07 | 9.72, 24.07, 8.16, 9.06, 8.98, 8.09, 6.16 |
| Koordynacja zabezpieczen | mount | 10.58 | 11.29 | 14.55 | 14.55 | 14.55, 11.88, 11.29, 13.36, 6.70, 10.26, 6.02 |
| Skladowe symetryczne i siec zerowa | mount | 7.13 | 6.85 | 10.20 | 10.20 | 6.26, 5.06, 5.30, 7.65, 10.20, 8.58, 6.85 |
| Wymagania przylaczeniowe i kodeks sieciowy | mount | 14.42 | 13.54 | 19.40 | 19.40 | 13.54, 17.91, 16.90, 19.40, 12.38, 12.08, 8.74 |
| Weryfikacja cieplna i dynamiczna toru pradowego | mount | 13.91 | 13.80 | 18.83 | 18.83 | 12.07, 13.80, 16.19, 18.83, 14.38, 12.85, 9.25 |
| Zbieznosc rozplywu mocy i regulacja zaczepow | mount | 6.35 | 6.54 | 6.99 | 6.99 | 6.54, 5.61, 6.76, 5.48, 6.16, 6.99, 6.92 |
