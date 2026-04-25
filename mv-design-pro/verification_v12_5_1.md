# Verification V12.5.1

- Generated at: `2026-04-25 19:11:13Z`
- Package manager: `npm`
- Total steps: `18`
- Passed: `18`
- Failed: `0`

| Step | Status | Exit code | Duration [s] |
|---|---|---:|---:|
| UI terminology guard | PASS | 0 | 0.98 |
| Docs archive guard | PASS | 0 | 0.51 |
| V12.xx canon guard | PASS | 0 | 0.50 |
| API lifecycle guard | PASS | 0 | 0.24 |
| Legacy public path guard | PASS | 0 | 0.19 |
| Severity contract guard | PASS | 0 | 0.12 |
| Import graph guard | PASS | 0 | 0.09 |
| Grep-zero guard | PASS | 0 | 0.08 |
| Backend V12.5 lint (ruff) | PASS | 0 | 2.28 |
| Backend V12.5 format check (black) | PASS | 0 | 3.80 |
| Backend targeted V12.5 tests | PASS | 0 | 12.48 |
| Vulture guard | PASS | 0 | 4.92 |
| Frontend lint | PASS | 0 | 20.34 |
| Frontend type-check | PASS | 0 | 28.01 |
| Frontend tests | PASS | 0 | 735.91 |
| Frontend V12.5 performance harness (full) | PASS | 0 | 9.76 |
| Golden tests | PASS | 0 | 18.47 |
| E2E tests | PASS | 0 | 129.02 |

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
All done! ✨ 🍰 ✨
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
collected 99 items
tests\application\analysis_run\test_analysis_run_service.py ............ [ 12%]
.....                                                                    [ 17%]
tests\test_canonical_analysis_api.py ........                            [ 25%]
tests\test_execution_api.py ..................                           [ 43%]
tests\test_production_canonical_only_api.py .....                        [ 48%]
tests\enm\test_enm_field_view_api.py .....                               [ 53%]
tests\enm\test_v2_projection.py ........                                 [ 61%]
tests\application\test_source_compliance.py .........                    [ 70%]
tests\test_generator_validation.py .................                     [ 87%]
tests\api\test_analysis_run_report_exports.py ............               [100%]
============================= 99 passed in 9.40s ==============================
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
 [32m✓[39m src/ui/property-grid/__tests__/EngineeringInspector.test.tsx [2m ([22m[2m3 tests[22m[2m)[22m[90m 64[2mms[22m[39m
 [32m✓[39m src/ui/catalog/__tests__/TypePicker.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 128[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/SegmentInspectorPanel.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 45[2mms[22m[39m
 [32m✓[39m src/ui/app-state/__tests__/useCanCalculateReadiness.test.ts [2m ([22m[2m2 tests[22m[2m)[22m[90m 18[2mms[22m[39m
 [32m✓[39m src/ui/study-cases/__tests__/ProtectionCaseConfigPanel.test.ts [2m ([22m[2m3 tests[22m[2m)[22m[90m 3[2mms[22m[39m
 [32m✓[39m src/ui/proof/__tests__/TraceMetadataPanel.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 42[2mms[22m[39m
 [32m✓[39m src/ui/catalog/__tests__/catalogSnapshot.test.ts [2m ([22m[2m4 tests[22m[2m)[22m[90m 4[2mms[22m[39m
 [32m✓[39m src/ui/study-cases/__tests__/api.draft-isolation.test.ts [2m ([22m[2m1 test[22m[2m)[22m[90m 5[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/SldEmptyOverlay.test.tsx [2m ([22m[2m2 tests[22m[2m)[22m[90m 39[2mms[22m[39m
 [32m✓[39m src/ui/protection-diagnostics/__tests__/ProtectionDiagnosticsPanelContainer.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 40[2mms[22m[39m
 [32m✓[39m src/ui/network-build/__tests__/converterSourceFlow.test.ts [2m ([22m[2m2 tests[22m[2m)[22m[90m 2[2mms[22m[39m
 [32m✓[39m src/ui/shared/__tests__/enmVisibility.test.ts [2m ([22m[2m4 tests[22m[2m)[22m[90m 3[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/sldCanonicalHygiene.test.ts [2m ([22m[2m4 tests[22m[2m)[22m[90m 5[2mms[22m[39m
 [32m✓[39m src/ui/engineering-readiness/__tests__/EngineeringReadinessPanel.blocking.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 31[2mms[22m[39m
 [32m✓[39m src/ui/protection-coordination/__tests__/ProtectionSettingsEditor.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 52[2mms[22m[39m
 [32m✓[39m src/ui/notifications/__tests__/NotificationToast.test.tsx [2m ([22m[2m2 tests[22m[2m)[22m[90m 97[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/powerFlowOverlayGeometryInvariant.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 21[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/DiagnosticsLegend.test.tsx [2m ([22m[2m2 tests[22m[2m)[22m[90m 39[2mms[22m[39m
 [32m✓[39m src/ui/navigation/urlState.test.ts [2m ([22m[2m1 test[22m[2m)[22m[90m 11[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/readinessSyncPolicy.test.ts [2m ([22m[2m3 tests[22m[2m)[22m[90m 4[2mms[22m[39m
 [32m✓[39m src/ui/common/connectionNode.test.ts [2m ([22m[2m2 tests[22m[2m)[22m[90m 3[2mms[22m[39m
 [32m✓[39m src/ui/wizard/__tests__/wizardTerminology.test.ts [2m ([22m[2m1 test[22m[2m)[22m[90m 3[2mms[22m[39m
 [32m✓[39m src/ui/protection-coordination/__tests__/TracePanel.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 33[2mms[22m[39m
 [32m✓[39m src/ui/shared/__tests__/generatorTypeLabels.test.ts [2m ([22m[2m1 test[22m[2m)[22m[90m 2[2mms[22m[39m
 [32m✓[39m src/ui/layout/__tests__/index.test.ts [2m ([22m[2m1 test[22m[2m)[22m[90m 4[2mms[22m[39m
[2m Test Files [22m [1m[32m306 passed[39m[22m[90m (306)[39m
[2m      Tests [22m [1m[32m4677 passed[39m[22m[2m | [22m[33m1 skipped[39m[90m (4678)[39m
[2m   Start at [22m 19:56:21
[2m   Duration [22m 734.19s[2m (transform 11.61s, setup 73.13s, collect 66.02s, tests 26.83s, environment 440.89s, prepare 70.46s)[22m
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
[v125-perf] mini-sld mean=9.16ms median=8.25ms p95=15.10ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures full SLD pipeline and canvas mount[22m[39m
[v125-perf] full-sld mean=101.45ms median=100.63ms p95=126.97ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-06 analysis surface mount[22m[39m
[v125-perf] E-06 mean=2.65ms median=2.59ms p95=3.07ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-27 report surface mount[22m[39m
[v125-perf] E-27 mean=7.47ms median=6.33ms p95=17.58ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-28 protection coordination surface mount[22m[39m
[v125-perf] E-28 mean=5.89ms median=5.41ms p95=7.08ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-29 symmetrical components surface mount[22m[39m
[v125-perf] E-29 mean=6.22ms median=5.38ms p95=10.72ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-30 compliance surface mount[22m[39m
[v125-perf] E-30 mean=5.37ms median=5.28ms p95=5.88ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-33 thermal dynamic surface mount[22m[39m
[v125-perf] E-33 mean=5.59ms median=5.48ms p95=6.52ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-34 convergence surface mount[22m[39m
[v125-perf] E-34 mean=6.98ms median=6.31ms p95=9.55ms
 [32m✓[39m src/ui/workspace/__tests__/v125.performance.test.tsx [2m ([22m[2m9 tests[22m[2m)[22m[33m 2127[2mms[22m[39m
[2m Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[32m9 passed[39m[22m[90m (9)[39m
[2m   Start at [22m 20:08:38
[2m   Duration [22m 7.96s[2m (transform 1.96s, setup 214ms, collect 2.97s, tests 2.13s, environment 1.22s, prepare 194ms)[22m
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
 [32m✓[39m src/ui/sld/core/__tests__/goldenNetworkE2E.test.ts [2m ([22m[2m52 tests[22m[2m)[22m[33m 766[2mms[22m[39m
 [32m✓[39m src/ui/sld-editor/utils/topological-layout/__tests__/goldenNetworkSn.test.ts [2m ([22m[2m17 tests[22m[2m)[22m[33m 1699[2mms[22m[39m
 [32m✓[39m src/ui/__tests__/ux-golden-scenario.test.ts [2m ([22m[2m45 tests[22m[2m)[22m[90m 48[2mms[22m[39m
 [32m✓[39m src/ui/sld-editor/utils/topological-layout/__tests__/goldenFixtures.test.ts [2m ([22m[2m27 tests[22m[2m)[22m[90m 124[2mms[22m[39m
 [32m✓[39m src/ui/sld/core/__tests__/switchgearConfigGolden.test.ts [2m ([22m[2m9 tests[22m[2m)[22m[90m 39[2mms[22m[39m
 [32m✓[39m src/ui/sld/core/__tests__/sldRenderManifestGolden.test.ts [2m ([22m[2m10 tests[22m[2m)[22m[90m 45[2mms[22m[39m
[2m Test Files [22m [1m[32m6 passed[39m[22m[90m (6)[39m
[2m      Tests [22m [1m[32m160 passed[39m[22m[90m (160)[39m
[2m   Start at [22m 20:08:47
[2m   Duration [22m 17.21s[2m (transform 679ms, setup 1.46s, collect 945ms, tests 2.72s, environment 8.80s, prepare 1.38s)[22m
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
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:60595 - "GET /api/cases/6bd736f9-09aa-469d-88d2-0c6dd7f5b0a4/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:60594 - "POST /api/cases/6bd736f9-09aa-469d-88d2-0c6dd7f5b0a4/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:60596 - "POST /api/cases/6bd736f9-09aa-469d-88d2-0c6dd7f5b0a4/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:60597 - "GET /api/cases/6bd736f9-09aa-469d-88d2-0c6dd7f5b0a4/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:56902 - "POST /api/cases/6bd736f9-09aa-469d-88d2-0c6dd7f5b0a4/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:56902 - "POST /api/cases/6bd736f9-09aa-469d-88d2-0c6dd7f5b0a4/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:56902 - "POST /api/cases/6bd736f9-09aa-469d-88d2-0c6dd7f5b0a4/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:55377 - "POST /api/cases/6bd736f9-09aa-469d-88d2-0c6dd7f5b0a4/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:55378 - "GET /api/cases/6bd736f9-09aa-469d-88d2-0c6dd7f5b0a4/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:55379 - "POST /api/cases/6bd736f9-09aa-469d-88d2-0c6dd7f5b0a4/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:55380 - "GET /api/cases/6bd736f9-09aa-469d-88d2-0c6dd7f5b0a4/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[18/18] [chromium] › e2e\sld-editor-real-backend-flex.spec.ts:331:1 › real backend supports flexible operation order combinations
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:60217 - "POST /api/projects HTTP/1.1" 201 Created
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:60217 - "POST /api/study-cases HTTP/1.1" 201 Created
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:49711 - "GET /api/cases/b3a9d9cd-3c73-4700-afb6-e9d02b518304/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:49710 - "POST /api/cases/b3a9d9cd-3c73-4700-afb6-e9d02b518304/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:49712 - "POST /api/cases/b3a9d9cd-3c73-4700-afb6-e9d02b518304/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:49713 - "GET /api/cases/b3a9d9cd-3c73-4700-afb6-e9d02b518304/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:60217 - "POST /api/cases/b3a9d9cd-3c73-4700-afb6-e9d02b518304/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:60217 - "POST /api/cases/b3a9d9cd-3c73-4700-afb6-e9d02b518304/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:60217 - "POST /api/cases/b3a9d9cd-3c73-4700-afb6-e9d02b518304/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:60217 - "POST /api/cases/b3a9d9cd-3c73-4700-afb6-e9d02b518304/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:60217 - "POST /api/cases/b3a9d9cd-3c73-4700-afb6-e9d02b518304/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:60217 - "POST /api/cases/b3a9d9cd-3c73-4700-afb6-e9d02b518304/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:60217 - "POST /api/cases/b3a9d9cd-3c73-4700-afb6-e9d02b518304/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:57096 - "GET /api/cases/b3a9d9cd-3c73-4700-afb6-e9d02b518304/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:57095 - "POST /api/cases/b3a9d9cd-3c73-4700-afb6-e9d02b518304/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:57097 - "POST /api/cases/b3a9d9cd-3c73-4700-afb6-e9d02b518304/enm/domain-ops HTTP/1.1" 200 OK
[2m[WebServer] [22mINFO:     127.0.0.1:57098 - "GET /api/cases/b3a9d9cd-3c73-4700-afb6-e9d02b518304/engineering-readiness HTTP/1.1" 200 OK
[1A[2K  18 passed (2.1m)
```

### stderr tail

```text
[1A[2K[2m[WebServer] [22m2026-04-25T20:10:52 INFO mv_design_pro HTTP POST /api/cases/6bd736f9-09aa-469d-88d2-0c6dd7f5b0a4/enm/domain-ops -> 200 (15.0ms) rid=e0287ae3-efe5-4981-ac47-2f07c267e04e
[1A[2K[2m[WebServer] [22m2026-04-25T20:10:52 INFO mv_design_pro HTTP POST /api/cases/6bd736f9-09aa-469d-88d2-0c6dd7f5b0a4/enm/domain-ops -> 200 (32.0ms) rid=18394396-2d5e-4d67-a6aa-815ec9d056ec
[1A[2K[2m[WebServer] [22m2026-04-25T20:10:54 INFO mv_design_pro HTTP GET /api/cases/6bd736f9-09aa-469d-88d2-0c6dd7f5b0a4/engineering-readiness -> 200 (32.0ms) rid=9c2f9fa0-b26b-48ec-82f2-7c7f41747a6f
[1A[2K[2m[WebServer] [22m2026-04-25T20:10:54 INFO mv_design_pro HTTP POST /api/cases/6bd736f9-09aa-469d-88d2-0c6dd7f5b0a4/enm/domain-ops -> 200 (32.0ms) rid=9c2b73be-059c-4c21-8997-0e2ffa0e7a46
[1A[2K[2m[WebServer] [22m2026-04-25T20:10:54 INFO mv_design_pro HTTP POST /api/cases/6bd736f9-09aa-469d-88d2-0c6dd7f5b0a4/enm/domain-ops -> 200 (31.0ms) rid=8b6c1e6c-fefb-4248-8823-c010fb465b45
[1A[2K[2m[WebServer] [22m2026-04-25T20:10:54 INFO mv_design_pro HTTP GET /api/cases/6bd736f9-09aa-469d-88d2-0c6dd7f5b0a4/engineering-readiness -> 200 (15.0ms) rid=df07a450-94d9-4045-b847-73c6d4d2df05
[1A[2K[2m[WebServer] [22m2026-04-25T20:10:55 INFO mv_design_pro HTTP POST /api/cases/6bd736f9-09aa-469d-88d2-0c6dd7f5b0a4/enm/domain-ops -> 200 (16.0ms) rid=10c1fb41-b8ae-406c-b799-6f8536a9a7af
[1A[2K[2m[WebServer] [22m2026-04-25T20:10:55 INFO mv_design_pro HTTP POST /api/cases/6bd736f9-09aa-469d-88d2-0c6dd7f5b0a4/enm/domain-ops -> 200 (47.0ms) rid=9da254a4-826d-4383-80d4-ad49cfa223d3
[1A[2K[2m[WebServer] [22m2026-04-25T20:10:55 INFO mv_design_pro HTTP POST /api/cases/6bd736f9-09aa-469d-88d2-0c6dd7f5b0a4/enm/domain-ops -> 200 (31.0ms) rid=eac31aa4-608c-4437-86f8-0b9cc8ac74c6
[1A[2K[2m[WebServer] [22m2026-04-25T20:10:57 INFO mv_design_pro HTTP POST /api/cases/6bd736f9-09aa-469d-88d2-0c6dd7f5b0a4/enm/domain-ops -> 200 (32.0ms) rid=cb4803bf-6621-47f9-9c01-67dce1ff0bb7
[1A[2K[2m[WebServer] [22m2026-04-25T20:10:57 INFO mv_design_pro HTTP GET /api/cases/6bd736f9-09aa-469d-88d2-0c6dd7f5b0a4/engineering-readiness -> 200 (32.0ms) rid=56fcaae8-f42a-4437-99ee-205daafb45ab
[1A[2K[2m[WebServer] [22m2026-04-25T20:10:57 INFO mv_design_pro HTTP POST /api/cases/6bd736f9-09aa-469d-88d2-0c6dd7f5b0a4/enm/domain-ops -> 200 (31.0ms) rid=64f5768d-9cff-4cfc-8e13-59db27eebfd9
[1A[2K[2m[WebServer] [22m2026-04-25T20:10:57 INFO mv_design_pro HTTP GET /api/cases/6bd736f9-09aa-469d-88d2-0c6dd7f5b0a4/engineering-readiness -> 200 (0.0ms) rid=a291d1ac-9c3c-45c3-bd56-134863154160
[1A[2K[2m[WebServer] [22m2026-04-25T20:11:01 INFO mv_design_pro HTTP POST /api/projects -> 201 (47.0ms) rid=b7b09fc9-457f-4d25-abf8-ac54f54f3e7f
[1A[2K[2m[WebServer] [22m2026-04-25T20:11:01 INFO mv_design_pro HTTP POST /api/study-cases -> 201 (31.0ms) rid=c7c46386-a12e-4958-9626-270fe556b7b8
[1A[2K[2m[WebServer] [22m2026-04-25T20:11:05 INFO mv_design_pro HTTP GET /api/cases/b3a9d9cd-3c73-4700-afb6-e9d02b518304/engineering-readiness -> 200 (15.0ms) rid=2f4d8674-6f12-4c93-b5f9-06e789b27e83
[1A[2K[2m[WebServer] [22m2026-04-25T20:11:05 INFO mv_design_pro HTTP POST /api/cases/b3a9d9cd-3c73-4700-afb6-e9d02b518304/enm/domain-ops -> 200 (31.0ms) rid=60f1f076-b687-4f6f-b8ba-5df593701218
[1A[2K[2m[WebServer] [22m2026-04-25T20:11:05 INFO mv_design_pro HTTP POST /api/cases/b3a9d9cd-3c73-4700-afb6-e9d02b518304/enm/domain-ops -> 200 (47.0ms) rid=751c5331-c362-4376-9054-372f35add999
[1A[2K[2m[WebServer] [22m2026-04-25T20:11:05 INFO mv_design_pro HTTP GET /api/cases/b3a9d9cd-3c73-4700-afb6-e9d02b518304/engineering-readiness -> 200 (15.0ms) rid=433c1300-ec10-47a8-9cba-572965c0d7fe
[1A[2K[2m[WebServer] [22m2026-04-25T20:11:06 INFO mv_design_pro HTTP POST /api/cases/b3a9d9cd-3c73-4700-afb6-e9d02b518304/enm/domain-ops -> 200 (63.0ms) rid=779b3892-43e8-40d0-b9ab-3d6e7152fc78
[1A[2K[2m[WebServer] [22m2026-04-25T20:11:06 INFO mv_design_pro HTTP POST /api/cases/b3a9d9cd-3c73-4700-afb6-e9d02b518304/enm/domain-ops -> 200 (31.0ms) rid=30944dda-705e-4a99-95aa-e169a6a54af0
[1A[2K[2m[WebServer] [22m2026-04-25T20:11:06 INFO mv_design_pro HTTP POST /api/cases/b3a9d9cd-3c73-4700-afb6-e9d02b518304/enm/domain-ops -> 200 (296.0ms) rid=a44d5c26-aa6e-4814-aa97-a574e9e20818
[1A[2K[2m[WebServer] [22m2026-04-25T20:11:06 INFO mv_design_pro HTTP POST /api/cases/b3a9d9cd-3c73-4700-afb6-e9d02b518304/enm/domain-ops -> 200 (109.0ms) rid=a418553e-aebc-46ec-839a-615f3de3c97c
[1A[2K[2m[WebServer] [22m2026-04-25T20:11:06 INFO mv_design_pro HTTP POST /api/cases/b3a9d9cd-3c73-4700-afb6-e9d02b518304/enm/domain-ops -> 200 (47.0ms) rid=5d42c837-7e65-495e-b771-983b5356c226
[1A[2K[2m[WebServer] [22m2026-04-25T20:11:06 INFO mv_design_pro HTTP POST /api/cases/b3a9d9cd-3c73-4700-afb6-e9d02b518304/enm/domain-ops -> 200 (46.0ms) rid=32e8dc59-cfa9-4200-8ddf-12f4cf0270a5
[1A[2K[2m[WebServer] [22m2026-04-25T20:11:06 INFO mv_design_pro HTTP POST /api/cases/b3a9d9cd-3c73-4700-afb6-e9d02b518304/enm/domain-ops -> 200 (79.0ms) rid=c3391efb-a443-4640-a398-7c1850a29041
[1A[2K[2m[WebServer] [22m2026-04-25T20:11:07 INFO mv_design_pro HTTP GET /api/cases/b3a9d9cd-3c73-4700-afb6-e9d02b518304/engineering-readiness -> 200 (16.0ms) rid=e182d20d-69ba-4757-8b42-053935fb8bc2
[1A[2K[2m[WebServer] [22m2026-04-25T20:11:07 INFO mv_design_pro HTTP POST /api/cases/b3a9d9cd-3c73-4700-afb6-e9d02b518304/enm/domain-ops -> 200 (31.0ms) rid=e3c24424-03f2-4771-a9e3-a4d429e5aa26
[1A[2K[2m[WebServer] [22m2026-04-25T20:11:07 INFO mv_design_pro HTTP POST /api/cases/b3a9d9cd-3c73-4700-afb6-e9d02b518304/enm/domain-ops -> 200 (16.0ms) rid=4b0f26db-6551-4860-99e5-914156888623
[1A[2K[2m[WebServer] [22m2026-04-25T20:11:07 INFO mv_design_pro HTTP GET /api/cases/b3a9d9cd-3c73-4700-afb6-e9d02b518304/engineering-readiness -> 200 (0.0ms) rid=3ac2792a-9cb5-444e-8db6-d3fabfc06328
```

## Performance Report

- Profile: `full`
- Measured at: `2026-04-25T19:08:46.152Z`
- Harness: `frontend/src/ui/workspace/__tests__/v125.performance.test.tsx`
- Methodology: `2` warm-up run(s) + `7` measured run(s) per target.

| Target | Kind | Mean [ms] | Median [ms] | P95 [ms] | Max [ms] | Samples [ms] |
|---|---|---:|---:|---:|---:|---|
| Mini-SLD helper surface | mount | 9.16 | 8.25 | 15.10 | 15.10 | 15.10, 8.42, 7.88, 8.25, 10.63, 8.09, 5.72 |
| Full SLD terrain pipeline + canvas | pipeline+mount | 101.45 | 100.63 | 126.97 | 126.97 | 126.97, 80.80, 96.20, 98.50, 100.63, 101.65, 105.41 |
| Nakladka wynikowa na schemacie | mount | 2.65 | 2.59 | 3.07 | 3.07 | 2.37, 3.00, 2.67, 2.42, 2.43, 3.07, 2.59 |
| Raporty i eksporty | mount | 7.47 | 6.33 | 17.58 | 17.58 | 8.11, 17.58, 7.74, 6.33, 4.78, 4.05, 3.72 |
| Koordynacja zabezpieczen | mount | 5.89 | 5.41 | 7.08 | 7.08 | 7.08, 6.42, 6.65, 5.41, 5.04, 5.34, 5.30 |
| Skladowe symetryczne i siec zerowa | mount | 6.22 | 5.38 | 10.72 | 10.72 | 6.48, 5.38, 5.04, 5.15, 10.72, 5.10, 5.68 |
| Wymagania przylaczeniowe i kodeks sieciowy | mount | 5.37 | 5.28 | 5.88 | 5.88 | 5.14, 5.07, 5.52, 5.88, 5.24, 5.28, 5.45 |
| Weryfikacja cieplna i dynamiczna toru pradowego | mount | 5.59 | 5.48 | 6.52 | 6.52 | 4.91, 5.47, 6.52, 5.74, 5.48, 6.27, 4.71 |
| Zbieznosc rozplywu mocy i regulacja zaczepow | mount | 6.98 | 6.31 | 9.55 | 9.55 | 5.99, 9.55, 6.29, 6.31, 8.00, 6.47, 6.25 |
