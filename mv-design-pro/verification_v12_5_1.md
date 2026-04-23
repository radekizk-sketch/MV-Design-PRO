# Verification V12.5.1

- Generated at: `2026-04-23 00:05:50Z`
- Package manager: `npm`
- Total steps: `14`
- Passed: `14`
- Failed: `0`

| Step | Status | Exit code | Duration [s] |
|---|---|---:|---:|
| UI terminology guard | PASS | 0 | 0.72 |
| Docs archive guard | PASS | 0 | 0.38 |
| Import graph guard | PASS | 0 | 0.09 |
| Grep-zero guard | PASS | 0 | 0.09 |
| Backend V12.5 lint (ruff) | PASS | 0 | 1.45 |
| Backend V12.5 format check (black) | PASS | 0 | 3.50 |
| Backend targeted V12.5 tests | PASS | 0 | 9.34 |
| Vulture guard | PASS | 0 | 3.88 |
| Frontend lint | PASS | 0 | 16.88 |
| Frontend type-check | PASS | 0 | 22.55 |
| Frontend tests | PASS | 0 | 635.00 |
| Frontend V12.5 performance harness (full) | PASS | 0 | 9.53 |
| Golden tests | PASS | 0 | 16.69 |
| E2E tests | PASS | 0 | 67.35 |

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
============================= 57 passed in 6.62s ==============================
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
 [32m✓[39m src/ui/topology/modals/__tests__/modalRegistryCompleteness.test.ts [2m ([22m[2m8 tests[22m[2m)[22m[90m 4[2mms[22m[39m
 [32m✓[39m src/ui/network-build/__tests__/networkBuildStore.routeSurfaces.test.ts [2m ([22m[2m3 tests[22m[2m)[22m[90m 5[2mms[22m[39m
 [32m✓[39m src/ui/property-grid/__tests__/EngineeringInspector.test.tsx [2m ([22m[2m3 tests[22m[2m)[22m[90m 65[2mms[22m[39m
 [32m✓[39m src/ui/catalog/__tests__/TypePicker.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 118[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/SegmentInspectorPanel.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 41[2mms[22m[39m
 [32m✓[39m src/ui/__tests__/legacyPublicApiCut.test.ts [2m ([22m[2m4 tests[22m[2m)[22m[90m 3[2mms[22m[39m
 [32m✓[39m src/ui/app-state/__tests__/useCanCalculateReadiness.test.ts [2m ([22m[2m2 tests[22m[2m)[22m[90m 18[2mms[22m[39m
 [32m✓[39m src/ui/study-cases/__tests__/ProtectionCaseConfigPanel.test.ts [2m ([22m[2m3 tests[22m[2m)[22m[90m 4[2mms[22m[39m
 [32m✓[39m src/ui/proof/__tests__/TraceMetadataPanel.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 43[2mms[22m[39m
 [32m✓[39m src/ui/catalog/__tests__/catalogSnapshot.test.ts [2m ([22m[2m4 tests[22m[2m)[22m[90m 3[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/SldEmptyOverlay.test.tsx [2m ([22m[2m2 tests[22m[2m)[22m[90m 40[2mms[22m[39m
 [32m✓[39m src/ui/protection-diagnostics/__tests__/ProtectionDiagnosticsPanelContainer.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 37[2mms[22m[39m
 [32m✓[39m src/ui/network-build/__tests__/converterSourceFlow.test.ts [2m ([22m[2m2 tests[22m[2m)[22m[90m 6[2mms[22m[39m
 [32m✓[39m src/ui/shared/__tests__/enmVisibility.test.ts [2m ([22m[2m4 tests[22m[2m)[22m[90m 2[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/sldCanonicalHygiene.test.ts [2m ([22m[2m4 tests[22m[2m)[22m[90m 3[2mms[22m[39m
 [32m✓[39m src/ui/engineering-readiness/__tests__/EngineeringReadinessPanel.blocking.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 31[2mms[22m[39m
 [32m✓[39m src/ui/protection-coordination/__tests__/ProtectionSettingsEditor.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 56[2mms[22m[39m
 [32m✓[39m src/ui/notifications/__tests__/NotificationToast.test.tsx [2m ([22m[2m2 tests[22m[2m)[22m[90m 90[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/powerFlowOverlayGeometryInvariant.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 26[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/DiagnosticsLegend.test.tsx [2m ([22m[2m2 tests[22m[2m)[22m[90m 37[2mms[22m[39m
 [32m✓[39m src/ui/__tests__/activeShellTerminology.test.ts [2m ([22m[2m1 test[22m[2m)[22m[90m 5[2mms[22m[39m
 [32m✓[39m src/ui/navigation/urlState.test.ts [2m ([22m[2m1 test[22m[2m)[22m[90m 11[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/readinessSyncPolicy.test.ts [2m ([22m[2m3 tests[22m[2m)[22m[90m 5[2mms[22m[39m
 [32m✓[39m src/ui/common/connectionNode.test.ts [2m ([22m[2m2 tests[22m[2m)[22m[90m 2[2mms[22m[39m
 [32m✓[39m src/ui/protection-coordination/__tests__/TracePanel.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 33[2mms[22m[39m
 [32m✓[39m src/ui/layout/__tests__/index.test.ts [2m ([22m[2m1 test[22m[2m)[22m[90m 2[2mms[22m[39m
[2m Test Files [22m [1m[32m293 passed[39m[22m[90m (293)[39m
[2m      Tests [22m [1m[32m4519 passed[39m[22m[2m | [22m[33m1 skipped[39m[90m (4520)[39m
[2m   Start at [22m 00:53:43
[2m   Duration [22m 633.63s[2m (transform 8.74s, setup 63.71s, collect 59.04s, tests 23.96s, environment 373.40s, prepare 60.98s)[22m
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
[v125-perf] mini-sld mean=7.26ms median=5.69ms p95=18.64ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures full SLD pipeline and canvas mount[22m[39m
[v125-perf] full-sld mean=116.33ms median=115.53ms p95=137.52ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-24 analysis surface mount[22m[39m
[v125-perf] E-24 mean=6.46ms median=3.68ms p95=23.57ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-27 report surface mount[22m[39m
[v125-perf] E-27 mean=5.59ms median=5.05ms p95=7.25ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-28 protection coordination surface mount[22m[39m
[v125-perf] E-28 mean=8.47ms median=7.43ms p95=17.57ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-29 symmetrical components surface mount[22m[39m
[v125-perf] E-29 mean=7.05ms median=7.31ms p95=9.43ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-30 compliance surface mount[22m[39m
[v125-perf] E-30 mean=7.22ms median=7.12ms p95=10.39ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-33 thermal dynamic surface mount[22m[39m
[v125-perf] E-33 mean=7.01ms median=7.00ms p95=9.41ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-34 convergence surface mount[22m[39m
[v125-perf] E-34 mean=6.63ms median=6.72ms p95=8.95ms
 [32m✓[39m src/ui/workspace/__tests__/v125.performance.test.tsx [2m ([22m[2m9 tests[22m[2m)[22m[33m 2192[2mms[22m[39m
[2m Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[32m9 passed[39m[22m[90m (9)[39m
[2m   Start at [22m 01:04:18
[2m   Duration [22m 8.20s[2m (transform 2.15s, setup 231ms, collect 3.38s, tests 2.19s, environment 1.28s, prepare 208ms)[22m
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
 [32m✓[39m src/ui/sld/core/__tests__/goldenNetworkE2E.test.ts [2m ([22m[2m52 tests[22m[2m)[22m[33m 750[2mms[22m[39m
 [32m✓[39m src/ui/sld-editor/utils/topological-layout/__tests__/goldenNetworkSn.test.ts [2m ([22m[2m17 tests[22m[2m)[22m[33m 1334[2mms[22m[39m
 [32m✓[39m src/ui/__tests__/ux-golden-scenario.test.ts [2m ([22m[2m45 tests[22m[2m)[22m[90m 43[2mms[22m[39m
 [32m✓[39m src/ui/sld-editor/utils/topological-layout/__tests__/goldenFixtures.test.ts [2m ([22m[2m27 tests[22m[2m)[22m[90m 165[2mms[22m[39m
 [32m✓[39m src/ui/sld/core/__tests__/switchgearConfigGolden.test.ts [2m ([22m[2m9 tests[22m[2m)[22m[90m 33[2mms[22m[39m
 [32m✓[39m src/ui/sld/core/__tests__/sldRenderManifestGolden.test.ts [2m ([22m[2m10 tests[22m[2m)[22m[90m 37[2mms[22m[39m
[2m Test Files [22m [1m[32m6 passed[39m[22m[90m (6)[39m
[2m      Tests [22m [1m[32m160 passed[39m[22m[90m (160)[39m
[2m   Start at [22m 01:04:27
[2m   Duration [22m 15.43s[2m (transform 670ms, setup 1.34s, collect 989ms, tests 2.36s, environment 7.72s, prepare 1.23s)[22m
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
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:50200 - "POST /api/cases/8d700977-c6a7-4117-a20f-4ddf269035c1/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:50201 - "GET /api/cases/8d700977-c6a7-4117-a20f-4ddf269035c1/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:50202 - "POST /api/cases/8d700977-c6a7-4117-a20f-4ddf269035c1/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:50203 - "GET /api/cases/8d700977-c6a7-4117-a20f-4ddf269035c1/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:58070 - "POST /api/cases/8d700977-c6a7-4117-a20f-4ddf269035c1/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:58070 - "POST /api/cases/8d700977-c6a7-4117-a20f-4ddf269035c1/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:58070 - "POST /api/cases/8d700977-c6a7-4117-a20f-4ddf269035c1/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:61403 - "GET /api/cases/8d700977-c6a7-4117-a20f-4ddf269035c1/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:61402 - "POST /api/cases/8d700977-c6a7-4117-a20f-4ddf269035c1/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:61404 - "POST /api/cases/8d700977-c6a7-4117-a20f-4ddf269035c1/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:61405 - "GET /api/cases/8d700977-c6a7-4117-a20f-4ddf269035c1/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[18/18] [chromium] › e2e\sld-editor-real-backend-flex.spec.ts:331:1 › real backend supports flexible operation order combinations
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:58070 - "POST /api/projects HTTP/1.1" 201 Created
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:58070 - "POST /api/study-cases HTTP/1.1" 201 Created
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:60882 - "GET /api/cases/a160fade-6dc2-4054-bf0b-e6a243120ddd/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:60881 - "POST /api/cases/a160fade-6dc2-4054-bf0b-e6a243120ddd/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:60883 - "POST /api/cases/a160fade-6dc2-4054-bf0b-e6a243120ddd/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:60884 - "GET /api/cases/a160fade-6dc2-4054-bf0b-e6a243120ddd/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:58070 - "POST /api/cases/a160fade-6dc2-4054-bf0b-e6a243120ddd/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:58070 - "POST /api/cases/a160fade-6dc2-4054-bf0b-e6a243120ddd/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:58070 - "POST /api/cases/a160fade-6dc2-4054-bf0b-e6a243120ddd/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:58070 - "POST /api/cases/a160fade-6dc2-4054-bf0b-e6a243120ddd/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:58070 - "POST /api/cases/a160fade-6dc2-4054-bf0b-e6a243120ddd/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:58070 - "POST /api/cases/a160fade-6dc2-4054-bf0b-e6a243120ddd/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:58070 - "POST /api/cases/a160fade-6dc2-4054-bf0b-e6a243120ddd/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:50936 - "GET /api/cases/a160fade-6dc2-4054-bf0b-e6a243120ddd/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:50935 - "POST /api/cases/a160fade-6dc2-4054-bf0b-e6a243120ddd/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:50937 - "POST /api/cases/a160fade-6dc2-4054-bf0b-e6a243120ddd/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:50938 - "GET /api/cases/a160fade-6dc2-4054-bf0b-e6a243120ddd/engineering-readiness HTTP/1.1" 200 OK
[1A[2K  18 passed (1.1m)
```

### stderr tail

```text
[1A[2K[2m[WebServer] [22m2026-04-23T01:05:42 INFO mv_design_pro HTTP POST /api/cases/8d700977-c6a7-4117-a20f-4ddf269035c1/enm/domain-ops -> 200 (16.0ms) rid=76dc898b-0b61-49ec-b6e1-e265dd894bd6
[1A[2K[2m[WebServer] [22m2026-04-23T01:05:43 INFO mv_design_pro HTTP POST /api/cases/8d700977-c6a7-4117-a20f-4ddf269035c1/enm/domain-ops -> 200 (47.0ms) rid=8ef6d5b3-7f1f-4eb8-b92b-8a155034353d
[1A[2K[2m[WebServer] [22m2026-04-23T01:05:43 INFO mv_design_pro HTTP POST /api/cases/8d700977-c6a7-4117-a20f-4ddf269035c1/enm/domain-ops -> 200 (16.0ms) rid=b489ead0-807d-4b42-b30e-7a0fbc9dfa8b
[1A[2K[2m[WebServer] [22m2026-04-23T01:05:43 INFO mv_design_pro HTTP GET /api/cases/8d700977-c6a7-4117-a20f-4ddf269035c1/engineering-readiness -> 200 (16.0ms) rid=1f5ee4a5-17ff-4579-9bdc-2ae113543da6
[1A[2K[2m[WebServer] [22m2026-04-23T01:05:43 INFO mv_design_pro HTTP POST /api/cases/8d700977-c6a7-4117-a20f-4ddf269035c1/enm/domain-ops -> 200 (15.0ms) rid=59912baf-cc04-4c38-a762-8eb1ccc06637
[1A[2K[2m[WebServer] [22m2026-04-23T01:05:43 INFO mv_design_pro HTTP GET /api/cases/8d700977-c6a7-4117-a20f-4ddf269035c1/engineering-readiness -> 200 (16.0ms) rid=29958768-40fc-452d-a708-13e8755142f1
[1A[2K[2m[WebServer] [22m2026-04-23T01:05:44 INFO mv_design_pro HTTP POST /api/cases/8d700977-c6a7-4117-a20f-4ddf269035c1/enm/domain-ops -> 200 (0.0ms) rid=c6be05d6-76b1-4212-ab65-882d8a11395e
[1A[2K[2m[WebServer] [22m2026-04-23T01:05:44 INFO mv_design_pro HTTP POST /api/cases/8d700977-c6a7-4117-a20f-4ddf269035c1/enm/domain-ops -> 200 (0.0ms) rid=43220293-c9ae-4cd2-9452-d1743c51038a
[1A[2K[2m[WebServer] [22m2026-04-23T01:05:44 INFO mv_design_pro HTTP POST /api/cases/8d700977-c6a7-4117-a20f-4ddf269035c1/enm/domain-ops -> 200 (16.0ms) rid=ebe22ba6-9fa9-41b8-a94f-f89c7686c0c5
[1A[2K[2m[WebServer] [22m2026-04-23T01:05:45 INFO mv_design_pro HTTP GET /api/cases/8d700977-c6a7-4117-a20f-4ddf269035c1/engineering-readiness -> 200 (15.0ms) rid=44f9ad1a-d400-4310-aea3-9f765e551b40
[1A[2K[2m[WebServer] [22m2026-04-23T01:05:45 INFO mv_design_pro HTTP POST /api/cases/8d700977-c6a7-4117-a20f-4ddf269035c1/enm/domain-ops -> 200 (31.0ms) rid=164a553d-ca40-413f-ba22-08adc98d5f77
[1A[2K[2m[WebServer] [22m2026-04-23T01:05:45 INFO mv_design_pro HTTP POST /api/cases/8d700977-c6a7-4117-a20f-4ddf269035c1/enm/domain-ops -> 200 (16.0ms) rid=712853ef-d105-4d4f-82a9-a2a5dd38c499
[1A[2K[2m[WebServer] [22m2026-04-23T01:05:45 INFO mv_design_pro HTTP GET /api/cases/8d700977-c6a7-4117-a20f-4ddf269035c1/engineering-readiness -> 200 (0.0ms) rid=2db204ec-a381-415e-b778-99f51688f16c
[1A[2K[2m[WebServer] [22m2026-04-23T01:05:46 INFO mv_design_pro HTTP POST /api/projects -> 201 (16.0ms) rid=a623bd02-6d33-4df2-a2cd-1c927fef0455
[1A[2K[2m[WebServer] [22m2026-04-23T01:05:46 INFO mv_design_pro HTTP POST /api/study-cases -> 201 (15.0ms) rid=35c92d09-fb5e-402c-8abc-11da4e641078
[1A[2K[2m[WebServer] [22m2026-04-23T01:05:47 INFO mv_design_pro HTTP GET /api/cases/a160fade-6dc2-4054-bf0b-e6a243120ddd/engineering-readiness -> 200 (0.0ms) rid=7d0866e0-bc91-4e51-84ac-78b2fe155d20
[1A[2K[2m[WebServer] [22m2026-04-23T01:05:47 INFO mv_design_pro HTTP POST /api/cases/a160fade-6dc2-4054-bf0b-e6a243120ddd/enm/domain-ops -> 200 (31.0ms) rid=92790cda-ea32-4e23-9b14-c38aa498387e
[1A[2K[2m[WebServer] [22m2026-04-23T01:05:47 INFO mv_design_pro HTTP POST /api/cases/a160fade-6dc2-4054-bf0b-e6a243120ddd/enm/domain-ops -> 200 (0.0ms) rid=51783d08-af60-446d-b307-64c2c75f15d1
[1A[2K[2m[WebServer] [22m2026-04-23T01:05:47 INFO mv_design_pro HTTP GET /api/cases/a160fade-6dc2-4054-bf0b-e6a243120ddd/engineering-readiness -> 200 (15.0ms) rid=8f2c75b5-492e-48eb-a4b2-b24ad76d7a63
[1A[2K[2m[WebServer] [22m2026-04-23T01:05:48 INFO mv_design_pro HTTP POST /api/cases/a160fade-6dc2-4054-bf0b-e6a243120ddd/enm/domain-ops -> 200 (47.0ms) rid=08c6f138-b141-4f40-bc4c-e797404dac32
[1A[2K[2m[WebServer] [22m2026-04-23T01:05:48 INFO mv_design_pro HTTP POST /api/cases/a160fade-6dc2-4054-bf0b-e6a243120ddd/enm/domain-ops -> 200 (47.0ms) rid=616e0b35-ec56-4fb9-98c7-2c3b0845688e
[1A[2K[2m[WebServer] [22m2026-04-23T01:05:48 INFO mv_design_pro HTTP POST /api/cases/a160fade-6dc2-4054-bf0b-e6a243120ddd/enm/domain-ops -> 200 (31.0ms) rid=386d8e7a-c5ef-4807-ab3e-d98ac7c73fb6
[1A[2K[2m[WebServer] [22m2026-04-23T01:05:48 INFO mv_design_pro HTTP POST /api/cases/a160fade-6dc2-4054-bf0b-e6a243120ddd/enm/domain-ops -> 200 (16.0ms) rid=f9e99198-677d-4fa4-8e6a-adf86252759a
[1A[2K[2m[WebServer] [22m2026-04-23T01:05:48 INFO mv_design_pro HTTP POST /api/cases/a160fade-6dc2-4054-bf0b-e6a243120ddd/enm/domain-ops -> 200 (31.0ms) rid=f28f6312-7ffd-41b5-813a-6291b0a3536a
[1A[2K[2m[WebServer] [22m2026-04-23T01:05:48 INFO mv_design_pro HTTP POST /api/cases/a160fade-6dc2-4054-bf0b-e6a243120ddd/enm/domain-ops -> 200 (63.0ms) rid=8eeb3c90-454d-4426-9ae3-a6b01686ab86
[1A[2K[2m[WebServer] [22m2026-04-23T01:05:48 INFO mv_design_pro HTTP POST /api/cases/a160fade-6dc2-4054-bf0b-e6a243120ddd/enm/domain-ops -> 200 (46.0ms) rid=67f216d8-6e03-4bb7-8d71-5e77fc1d3d76
[1A[2K[2m[WebServer] [22m2026-04-23T01:05:49 INFO mv_design_pro HTTP GET /api/cases/a160fade-6dc2-4054-bf0b-e6a243120ddd/engineering-readiness -> 200 (16.0ms) rid=6676a769-6de4-4df3-b18c-8f7316895dd6
[1A[2K[2m[WebServer] [22m2026-04-23T01:05:49 INFO mv_design_pro HTTP POST /api/cases/a160fade-6dc2-4054-bf0b-e6a243120ddd/enm/domain-ops -> 200 (16.0ms) rid=827d2ad9-2f8b-417a-b605-5b5cb42f0f70
[1A[2K[2m[WebServer] [22m2026-04-23T01:05:49 INFO mv_design_pro HTTP POST /api/cases/a160fade-6dc2-4054-bf0b-e6a243120ddd/enm/domain-ops -> 200 (15.0ms) rid=a933f89a-38b0-490d-b04e-2d302ad1ea87
[1A[2K[2m[WebServer] [22m2026-04-23T01:05:49 INFO mv_design_pro HTTP GET /api/cases/a160fade-6dc2-4054-bf0b-e6a243120ddd/engineering-readiness -> 200 (16.0ms) rid=177a4a6d-5ed8-4531-a87f-6c7c808cdb81
```

## Performance Report

- Profile: `full`
- Measured at: `2026-04-23T00:04:26.588Z`
- Harness: `frontend/src/ui/workspace/__tests__/v125.performance.test.tsx`
- Methodology: `2` warm-up run(s) + `7` measured run(s) per target.

| Target | Kind | Mean [ms] | Median [ms] | P95 [ms] | Max [ms] | Samples [ms] |
|---|---|---:|---:|---:|---:|---|
| Mini-SLD helper surface | mount | 7.26 | 5.69 | 18.64 | 18.64 | 18.64, 5.69, 7.18, 3.92, 5.98, 4.39, 5.00 |
| Full SLD terrain pipeline + canvas | pipeline+mount | 116.33 | 115.53 | 137.52 | 137.52 | 113.04, 137.52, 88.78, 114.91, 125.46, 115.53, 119.05 |
| Poziom analityczny i wyniki inzynierskie | mount | 6.46 | 3.68 | 23.57 | 23.57 | 3.68, 23.57, 5.14, 2.46, 4.83, 3.26, 2.30 |
| Raporty i eksporty | mount | 5.59 | 5.05 | 7.25 | 7.25 | 6.81, 4.58, 7.25, 3.97, 6.83, 4.64, 5.05 |
| Koordynacja zabezpieczen | mount | 8.47 | 7.43 | 17.57 | 17.57 | 6.83, 7.69, 8.85, 5.83, 17.57, 5.09, 7.43 |
| Skladowe symetryczne i siec zerowa | mount | 7.05 | 7.31 | 9.43 | 9.43 | 8.28, 7.31, 4.67, 8.82, 4.51, 6.32, 9.43 |
| Wymagania przylaczeniowe i kodeks sieciowy | mount | 7.22 | 7.12 | 10.39 | 10.39 | 10.39, 5.04, 6.69, 8.32, 5.45, 7.56, 7.12 |
| Weryfikacja cieplna i dynamiczna toru pradowego | mount | 7.01 | 7.00 | 9.41 | 9.41 | 7.00, 7.64, 5.24, 7.93, 9.41, 5.00, 6.89 |
| Zbieznosc rozplywu mocy i regulacja zaczepow | mount | 6.63 | 6.72 | 8.95 | 8.95 | 6.16, 6.72, 6.95, 5.54, 8.95, 4.59, 7.52 |
