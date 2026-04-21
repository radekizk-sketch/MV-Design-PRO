# Verification V12.5

- Generated at: `2026-04-20 09:50:19Z`
- Package manager: `npm`
- Total steps: `13`
- Passed: `13`
- Failed: `0`

| Step | Status | Exit code | Duration [s] |
|---|---|---:|---:|
| Docs archive guard | PASS | 0 | 0.28 |
| Import graph guard | PASS | 0 | 0.09 |
| Grep-zero guard | PASS | 0 | 0.09 |
| Backend V12.5 lint (ruff) | PASS | 0 | 1.56 |
| Backend V12.5 format check (black) | PASS | 0 | 3.34 |
| Backend targeted V12.5 tests | PASS | 0 | 8.84 |
| Vulture guard | PASS | 0 | 3.40 |
| Frontend lint | PASS | 0 | 15.57 |
| Frontend type-check | PASS | 0 | 20.67 |
| Frontend tests | PASS | 0 | 638.93 |
| Frontend V12.5 performance harness (full) | PASS | 0 | 9.41 |
| Golden tests | PASS | 0 | 16.56 |
| E2E tests | PASS | 0 | 48.34 |

## Outcome

- Verification passed without failing steps.

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
============================= 57 passed in 6.23s ==============================
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
 [32m✓[39m src/ui/topology/__tests__/useNetworkTreeElements.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 17[2mms[22m[39m
 [32m✓[39m src/ui/property-grid/__tests__/EngineeringInspector.test.tsx [2m ([22m[2m3 tests[22m[2m)[22m[90m 68[2mms[22m[39m
 [32m✓[39m src/ui/network-build/__tests__/networkBuildStore.routeSurfaces.test.ts [2m ([22m[2m3 tests[22m[2m)[22m[90m 5[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/SegmentInspectorPanel.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 49[2mms[22m[39m
 [32m✓[39m src/ui/app-state/__tests__/useCanCalculateReadiness.test.ts [2m ([22m[2m2 tests[22m[2m)[22m[90m 16[2mms[22m[39m
 [32m✓[39m src/ui/study-cases/__tests__/ProtectionCaseConfigPanel.test.ts [2m ([22m[2m3 tests[22m[2m)[22m[90m 3[2mms[22m[39m
 [32m✓[39m src/ui/catalog/__tests__/catalogSnapshot.test.ts [2m ([22m[2m4 tests[22m[2m)[22m[90m 4[2mms[22m[39m
 [32m✓[39m src/ui/proof/__tests__/TraceMetadataPanel.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 38[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/SldEmptyOverlay.test.tsx [2m ([22m[2m2 tests[22m[2m)[22m[90m 36[2mms[22m[39m
 [32m✓[39m src/ui/protection-diagnostics/__tests__/ProtectionDiagnosticsPanelContainer.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 35[2mms[22m[39m
 [32m✓[39m src/ui/network-build/__tests__/converterSourceFlow.test.ts [2m ([22m[2m2 tests[22m[2m)[22m[90m 3[2mms[22m[39m
 [32m✓[39m src/ui/shared/__tests__/enmVisibility.test.ts [2m ([22m[2m4 tests[22m[2m)[22m[90m 3[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/sldCanonicalHygiene.test.ts [2m ([22m[2m4 tests[22m[2m)[22m[90m 4[2mms[22m[39m
 [32m✓[39m src/ui/engineering-readiness/__tests__/EngineeringReadinessPanel.blocking.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 30[2mms[22m[39m
 [32m✓[39m src/ui/protection-coordination/__tests__/ProtectionSettingsEditor.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 50[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/powerFlowOverlayGeometryInvariant.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 22[2mms[22m[39m
 [32m✓[39m src/ui/notifications/__tests__/NotificationToast.test.tsx [2m ([22m[2m2 tests[22m[2m)[22m[90m 89[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/DiagnosticsLegend.test.tsx [2m ([22m[2m2 tests[22m[2m)[22m[90m 35[2mms[22m[39m
 [32m✓[39m src/ui/navigation/urlState.test.ts [2m ([22m[2m1 test[22m[2m)[22m[90m 12[2mms[22m[39m
 [32m✓[39m src/ui/common/connectionNode.test.ts [2m ([22m[2m2 tests[22m[2m)[22m[90m 3[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/readinessSyncPolicy.test.ts [2m ([22m[2m3 tests[22m[2m)[22m[90m 4[2mms[22m[39m
 [32m✓[39m src/ui/protection-coordination/__tests__/TracePanel.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 36[2mms[22m[39m
 [32m✓[39m src/ui/wizard/__tests__/wizardTerminology.test.ts [2m ([22m[2m1 test[22m[2m)[22m[90m 2[2mms[22m[39m
 [32m✓[39m src/ui/layout/__tests__/index.test.ts [2m ([22m[2m1 test[22m[2m)[22m[90m 3[2mms[22m[39m
[2m Test Files [22m [1m[32m298 passed[39m[22m[90m (298)[39m
[2m      Tests [22m [1m[32m4691 passed[39m[22m[2m | [22m[33m1 skipped[39m[90m (4692)[39m
[2m   Start at [22m 10:38:27
[2m   Duration [22m 637.49s[2m (transform 9.05s, setup 64.03s, collect 57.99s, tests 23.55s, environment 381.21s, prepare 60.37s)[22m
```

### stderr tail

```text
  /* fire events that update state */
});
/* assert on the output */
This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at EmbeddedSldWorkspace (C:\Users\radek\Documents\GitHub\MV-Design-PRO\mv-design-pro\frontend\src\ui\results-inspector\EmbeddedSldWorkspace.tsx:36:33)
Warning: An update to EmbeddedSldWorkspace inside a test was not wrapped in act(...).
When testing, code that causes React state updates should be wrapped into act(...):
act(() => {
  /* fire events that update state */
});
/* assert on the output */
This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at EmbeddedSldWorkspace (C:\Users\radek\Documents\GitHub\MV-Design-PRO\mv-design-pro\frontend\src\ui\results-inspector\EmbeddedSldWorkspace.tsx:36:33)
Warning: An update to EmbeddedSldWorkspace inside a test was not wrapped in act(...).
When testing, code that causes React state updates should be wrapped into act(...):
act(() => {
  /* fire events that update state */
});
/* assert on the output */
This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at EmbeddedSldWorkspace (C:\Users\radek\Documents\GitHub\MV-Design-PRO\mv-design-pro\frontend\src\ui\results-inspector\EmbeddedSldWorkspace.tsx:36:33)
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
[v125-perf] mini-sld mean=6.59ms median=5.55ms p95=13.27ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures full SLD pipeline and canvas mount[22m[39m
[v125-perf] full-sld mean=97.85ms median=92.04ms p95=124.02ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-24 analysis surface mount[22m[39m
[v125-perf] E-24 mean=3.20ms median=2.98ms p95=3.95ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-25 report surface mount[22m[39m
[v125-perf] E-25 mean=7.40ms median=5.77ms p95=18.89ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-28 protection coordination surface mount[22m[39m
[v125-perf] E-28 mean=8.27ms median=8.20ms p95=9.16ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-29 symmetrical components surface mount[22m[39m
[v125-perf] E-29 mean=7.91ms median=7.33ms p95=10.24ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-30 compliance surface mount[22m[39m
[v125-perf] E-30 mean=7.97ms median=7.97ms p95=9.47ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-33 thermal dynamic surface mount[22m[39m
[v125-perf] E-33 mean=6.99ms median=6.76ms p95=7.94ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-34 convergence surface mount[22m[39m
[v125-perf] E-34 mean=6.32ms median=6.35ms p95=6.51ms
 [32m✓[39m src/ui/workspace/__tests__/v125.performance.test.tsx [2m ([22m[2m9 tests[22m[2m)[22m[33m 2049[2mms[22m[39m
[2m Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[32m9 passed[39m[22m[90m (9)[39m
[2m   Start at [22m 10:49:06
[2m   Duration [22m 7.96s[2m (transform 1.90s, setup 256ms, collect 3.04s, tests 2.05s, environment 1.30s, prepare 201ms)[22m
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
 [32m✓[39m src/ui/sld/core/__tests__/goldenNetworkE2E.test.ts [2m ([22m[2m52 tests[22m[2m)[22m[33m 745[2mms[22m[39m
 [32m✓[39m src/ui/sld-editor/utils/topological-layout/__tests__/goldenNetworkSn.test.ts [2m ([22m[2m17 tests[22m[2m)[22m[33m 1469[2mms[22m[39m
 [32m✓[39m src/ui/__tests__/ux-golden-scenario.test.ts [2m ([22m[2m45 tests[22m[2m)[22m[90m 41[2mms[22m[39m
 [32m✓[39m src/ui/sld-editor/utils/topological-layout/__tests__/goldenFixtures.test.ts [2m ([22m[2m27 tests[22m[2m)[22m[90m 101[2mms[22m[39m
 [32m✓[39m src/ui/sld/core/__tests__/switchgearConfigGolden.test.ts [2m ([22m[2m9 tests[22m[2m)[22m[90m 32[2mms[22m[39m
 [32m✓[39m src/ui/sld/core/__tests__/sldRenderManifestGolden.test.ts [2m ([22m[2m10 tests[22m[2m)[22m[90m 42[2mms[22m[39m
[2m Test Files [22m [1m[32m6 passed[39m[22m[90m (6)[39m
[2m      Tests [22m [1m[32m160 passed[39m[22m[90m (160)[39m
[2m   Start at [22m 10:49:15
[2m   Duration [22m 15.26s[2m (transform 642ms, setup 1.28s, collect 939ms, tests 2.43s, environment 7.64s, prepare 1.22s)[22m
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
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:51160 - "POST /api/cases/11527e78-3ec0-40e4-aea7-6600119eaae8/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:58194 - "GET /api/cases/11527e78-3ec0-40e4-aea7-6600119eaae8/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:58195 - "POST /api/cases/11527e78-3ec0-40e4-aea7-6600119eaae8/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:58196 - "POST /api/cases/11527e78-3ec0-40e4-aea7-6600119eaae8/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:58197 - "GET /api/cases/11527e78-3ec0-40e4-aea7-6600119eaae8/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:58198 - "GET /api/cases/11527e78-3ec0-40e4-aea7-6600119eaae8/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:58199 - "GET /api/cases/11527e78-3ec0-40e4-aea7-6600119eaae8/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[18/18] [chromium] › e2e\sld-editor-real-backend-flex.spec.ts:331:1 › real backend supports flexible operation order combinations
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:51160 - "POST /api/projects HTTP/1.1" 201 Created
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:51160 - "POST /api/study-cases HTTP/1.1" 201 Created
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:55935 - "GET /api/cases/7723fed8-5666-4aa4-ab6f-6d5b5a819c4f/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:55936 - "POST /api/cases/7723fed8-5666-4aa4-ab6f-6d5b5a819c4f/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:55938 - "GET /api/cases/7723fed8-5666-4aa4-ab6f-6d5b5a819c4f/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:55937 - "POST /api/cases/7723fed8-5666-4aa4-ab6f-6d5b5a819c4f/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:55939 - "GET /api/cases/7723fed8-5666-4aa4-ab6f-6d5b5a819c4f/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:55940 - "GET /api/cases/7723fed8-5666-4aa4-ab6f-6d5b5a819c4f/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:51160 - "POST /api/cases/7723fed8-5666-4aa4-ab6f-6d5b5a819c4f/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:51160 - "POST /api/cases/7723fed8-5666-4aa4-ab6f-6d5b5a819c4f/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:51160 - "POST /api/cases/7723fed8-5666-4aa4-ab6f-6d5b5a819c4f/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:51160 - "POST /api/cases/7723fed8-5666-4aa4-ab6f-6d5b5a819c4f/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:51160 - "POST /api/cases/7723fed8-5666-4aa4-ab6f-6d5b5a819c4f/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:51160 - "POST /api/cases/7723fed8-5666-4aa4-ab6f-6d5b5a819c4f/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:51160 - "POST /api/cases/7723fed8-5666-4aa4-ab6f-6d5b5a819c4f/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:58816 - "GET /api/cases/7723fed8-5666-4aa4-ab6f-6d5b5a819c4f/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:58817 - "POST /api/cases/7723fed8-5666-4aa4-ab6f-6d5b5a819c4f/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:58818 - "POST /api/cases/7723fed8-5666-4aa4-ab6f-6d5b5a819c4f/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:58819 - "GET /api/cases/7723fed8-5666-4aa4-ab6f-6d5b5a819c4f/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:58820 - "GET /api/cases/7723fed8-5666-4aa4-ab6f-6d5b5a819c4f/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:58821 - "GET /api/cases/7723fed8-5666-4aa4-ab6f-6d5b5a819c4f/engineering-readiness HTTP/1.1" 200 OK
[1A[2K  18 passed (45.2s)
```

### stderr tail

```text
[1A[2K[2m[WebServer] [22m2026-04-20T10:50:14 INFO mv_design_pro HTTP POST /api/cases/11527e78-3ec0-40e4-aea7-6600119eaae8/enm/domain-ops -> 200 (0.0ms) rid=b451c9a4-745e-4cb1-a0da-c06414690504
[1A[2K[2m[WebServer] [22m2026-04-20T10:50:14 INFO mv_design_pro HTTP POST /api/cases/11527e78-3ec0-40e4-aea7-6600119eaae8/enm/domain-ops -> 200 (0.0ms) rid=c13cb336-fbd1-418a-9d96-6e55ed1a8498
[1A[2K[2m[WebServer] [22m2026-04-20T10:50:14 INFO mv_design_pro HTTP POST /api/cases/11527e78-3ec0-40e4-aea7-6600119eaae8/enm/domain-ops -> 200 (15.0ms) rid=9356f85b-e589-473d-9d61-7bddc12c3769
[1A[2K[2m[WebServer] [22m2026-04-20T10:50:15 INFO mv_design_pro HTTP GET /api/cases/11527e78-3ec0-40e4-aea7-6600119eaae8/engineering-readiness -> 200 (0.0ms) rid=a7cec8e4-2956-4db8-ad2a-af5b62de9109
[1A[2K[2m[WebServer] [22m2026-04-20T10:50:15 INFO mv_design_pro HTTP POST /api/cases/11527e78-3ec0-40e4-aea7-6600119eaae8/enm/domain-ops -> 200 (31.0ms) rid=d27d03b9-6d4a-4601-b4cb-389417e8f5fc
[1A[2K[2m[WebServer] [22m2026-04-20T10:50:15 INFO mv_design_pro HTTP POST /api/cases/11527e78-3ec0-40e4-aea7-6600119eaae8/enm/domain-ops -> 200 (31.0ms) rid=29572ddc-6700-4c51-8767-10da92e4384c
[1A[2K[2m[WebServer] [22m2026-04-20T10:50:15 INFO mv_design_pro HTTP GET /api/cases/11527e78-3ec0-40e4-aea7-6600119eaae8/engineering-readiness -> 200 (16.0ms) rid=117743b9-f599-4e7c-80ef-231fbc19b809
[1A[2K[2m[WebServer] [22m2026-04-20T10:50:15 INFO mv_design_pro HTTP GET /api/cases/11527e78-3ec0-40e4-aea7-6600119eaae8/engineering-readiness -> 200 (0.0ms) rid=863d2932-8f00-4065-83d7-c1e660a7387d
[1A[2K[2m[WebServer] [22m2026-04-20T10:50:15 INFO mv_design_pro HTTP GET /api/cases/11527e78-3ec0-40e4-aea7-6600119eaae8/engineering-readiness -> 200 (15.0ms) rid=817d32cf-fc86-4a36-9dca-5d8e11852c05
[1A[2K[2m[WebServer] [22m2026-04-20T10:50:15 INFO mv_design_pro HTTP POST /api/projects -> 201 (16.0ms) rid=c3e733e4-6afc-4bd7-9045-6f51da7946fe
[1A[2K[2m[WebServer] [22m2026-04-20T10:50:15 INFO mv_design_pro HTTP POST /api/study-cases -> 201 (0.0ms) rid=8e353054-065d-45d3-8b7e-4a8e9ad09065
[1A[2K[2m[WebServer] [22m2026-04-20T10:50:16 INFO mv_design_pro HTTP GET /api/cases/7723fed8-5666-4aa4-ab6f-6d5b5a819c4f/engineering-readiness -> 200 (0.0ms) rid=63ebf4de-fdc0-493c-81eb-95ddc10e35d0
[1A[2K[2m[WebServer] [22m2026-04-20T10:50:16 INFO mv_design_pro HTTP POST /api/cases/7723fed8-5666-4aa4-ab6f-6d5b5a819c4f/enm/domain-ops -> 200 (16.0ms) rid=2a8e06bb-3986-4c93-98e0-5ffdb884dbbb
[1A[2K[2m[WebServer] [22m2026-04-20T10:50:16 INFO mv_design_pro HTTP GET /api/cases/7723fed8-5666-4aa4-ab6f-6d5b5a819c4f/engineering-readiness -> 200 (16.0ms) rid=eed6daef-bfcb-43a8-a9ce-f34a07fad663
[1A[2K[2m[WebServer] [22m2026-04-20T10:50:16 INFO mv_design_pro HTTP POST /api/cases/7723fed8-5666-4aa4-ab6f-6d5b5a819c4f/enm/domain-ops -> 200 (16.0ms) rid=83885b76-7992-4f32-a783-bbfca4aee6cf
[1A[2K[2m[WebServer] [22m2026-04-20T10:50:16 INFO mv_design_pro HTTP GET /api/cases/7723fed8-5666-4aa4-ab6f-6d5b5a819c4f/engineering-readiness -> 200 (0.0ms) rid=0d768cb2-4b16-41af-a60e-efce5156883c
[1A[2K[2m[WebServer] [22m2026-04-20T10:50:16 INFO mv_design_pro HTTP GET /api/cases/7723fed8-5666-4aa4-ab6f-6d5b5a819c4f/engineering-readiness -> 200 (0.0ms) rid=acedac7b-15b0-490d-85df-c74062380f93
[1A[2K[2m[WebServer] [22m2026-04-20T10:50:17 INFO mv_design_pro HTTP POST /api/cases/7723fed8-5666-4aa4-ab6f-6d5b5a819c4f/enm/domain-ops -> 200 (16.0ms) rid=5b0176ce-e467-4b0b-b714-e59da9397ce7
[1A[2K[2m[WebServer] [22m2026-04-20T10:50:17 INFO mv_design_pro HTTP POST /api/cases/7723fed8-5666-4aa4-ab6f-6d5b5a819c4f/enm/domain-ops -> 200 (16.0ms) rid=ccec861a-705e-4d7c-a4d7-63ac95eeac25
[1A[2K[2m[WebServer] [22m2026-04-20T10:50:17 INFO mv_design_pro HTTP POST /api/cases/7723fed8-5666-4aa4-ab6f-6d5b5a819c4f/enm/domain-ops -> 200 (0.0ms) rid=726f83bc-086c-415f-a8c6-9ff504ae3718
[1A[2K[2m[WebServer] [22m2026-04-20T10:50:17 INFO mv_design_pro HTTP POST /api/cases/7723fed8-5666-4aa4-ab6f-6d5b5a819c4f/enm/domain-ops -> 200 (0.0ms) rid=1b59fc20-f8c1-4a32-9711-ed32d8e420f0
[1A[2K[2m[WebServer] [22m2026-04-20T10:50:17 INFO mv_design_pro HTTP POST /api/cases/7723fed8-5666-4aa4-ab6f-6d5b5a819c4f/enm/domain-ops -> 200 (15.0ms) rid=6a60c6df-2389-47e8-a8ce-c33d0b383348
[1A[2K[2m[WebServer] [22m2026-04-20T10:50:17 INFO mv_design_pro HTTP POST /api/cases/7723fed8-5666-4aa4-ab6f-6d5b5a819c4f/enm/domain-ops -> 200 (16.0ms) rid=7893ebc0-eae3-4a54-a372-6b8dc8b60099
[1A[2K[2m[WebServer] [22m2026-04-20T10:50:17 INFO mv_design_pro HTTP POST /api/cases/7723fed8-5666-4aa4-ab6f-6d5b5a819c4f/enm/domain-ops -> 200 (15.0ms) rid=1b8ed69f-de48-4507-882e-5cad7cf3c5a2
[1A[2K[2m[WebServer] [22m2026-04-20T10:50:18 INFO mv_design_pro HTTP GET /api/cases/7723fed8-5666-4aa4-ab6f-6d5b5a819c4f/engineering-readiness -> 200 (0.0ms) rid=73ff6698-065b-4f3e-962f-aeba94f0ca71
[1A[2K[2m[WebServer] [22m2026-04-20T10:50:18 INFO mv_design_pro HTTP POST /api/cases/7723fed8-5666-4aa4-ab6f-6d5b5a819c4f/enm/domain-ops -> 200 (31.0ms) rid=872add8e-7aaa-4faa-bec2-ea89038b9d5a
[1A[2K[2m[WebServer] [22m2026-04-20T10:50:18 INFO mv_design_pro HTTP POST /api/cases/7723fed8-5666-4aa4-ab6f-6d5b5a819c4f/enm/domain-ops -> 200 (31.0ms) rid=8f0e05f0-e8ad-4720-9e3d-f194483a14b6
[1A[2K[2m[WebServer] [22m2026-04-20T10:50:18 INFO mv_design_pro HTTP GET /api/cases/7723fed8-5666-4aa4-ab6f-6d5b5a819c4f/engineering-readiness -> 200 (0.0ms) rid=0dd7cfe0-ee1f-43dd-9305-1ce096882142
[1A[2K[2m[WebServer] [22m2026-04-20T10:50:18 INFO mv_design_pro HTTP GET /api/cases/7723fed8-5666-4aa4-ab6f-6d5b5a819c4f/engineering-readiness -> 200 (15.0ms) rid=d147f2ae-ff13-4432-b76f-0969b8762b62
[1A[2K[2m[WebServer] [22m2026-04-20T10:50:18 INFO mv_design_pro HTTP GET /api/cases/7723fed8-5666-4aa4-ab6f-6d5b5a819c4f/engineering-readiness -> 200 (0.0ms) rid=0507b342-01e4-4ccf-a047-25413ed4fe81
```

## Performance Report

- Profile: `full`
- Measured at: `2026-04-20T09:49:14.156Z`
- Harness: `frontend/src/ui/workspace/__tests__/v125.performance.test.tsx`
- Methodology: `2` warm-up run(s) + `7` measured run(s) per target.

| Target | Kind | Mean [ms] | Median [ms] | P95 [ms] | Max [ms] | Samples [ms] |
|---|---|---:|---:|---:|---:|---|
| Mini-SLD helper surface | mount | 6.59 | 5.55 | 13.27 | 13.27 | 13.27, 5.55, 5.68, 5.47, 4.61, 6.97, 4.58 |
| Full SLD terrain pipeline + canvas | pipeline+mount | 97.85 | 92.04 | 124.02 | 124.02 | 124.02, 83.71, 90.43, 114.26, 95.67, 84.80, 92.04 |
| Poziom analityczny | mount | 3.20 | 2.98 | 3.95 | 3.95 | 3.07, 2.76, 3.93, 2.98, 2.78, 2.96, 3.95 |
| Generator raportu | mount | 7.40 | 5.77 | 18.89 | 18.89 | 5.89, 6.55, 18.89, 5.38, 5.77, 4.63, 4.68 |
| Koordynacja zabezpieczeń | mount | 8.27 | 8.20 | 9.16 | 9.16 | 9.16, 8.20, 8.07, 8.27, 7.40, 8.91, 7.86 |
| Składowe symetryczne i Z0 | mount | 7.91 | 7.33 | 10.24 | 10.24 | 7.72, 7.02, 7.33, 6.39, 9.56, 10.24, 7.10 |
| Zgodność NC RfG / IRiESD | mount | 7.97 | 7.97 | 9.47 | 9.47 | 7.97, 9.47, 9.30, 8.13, 7.01, 7.54, 6.41 |
| Weryfikacja cieplna i dynamiczna toru | mount | 6.99 | 6.76 | 7.94 | 7.94 | 7.67, 6.42, 7.50, 7.94, 6.76, 6.23, 6.42 |
| Zbieżność rozpływu i OLTC | mount | 6.32 | 6.35 | 6.51 | 6.51 | 6.00, 6.46, 6.42, 6.16, 6.32, 6.35, 6.51 |
