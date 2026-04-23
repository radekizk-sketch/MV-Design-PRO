# Verification V12.5.1

- Generated at: `2026-04-23 21:14:44Z`
- Package manager: `npm`
- Total steps: `15`
- Passed: `15`
- Failed: `0`

| Step | Status | Exit code | Duration [s] |
|---|---|---:|---:|
| UI terminology guard | PASS | 0 | 1.37 |
| UTF-8 mojibake guard | PASS | 0 | 1.30 |
| Docs archive guard | PASS | 0 | 0.30 |
| Import graph guard | PASS | 0 | 0.07 |
| Grep-zero guard | PASS | 0 | 0.07 |
| Backend V12.5 lint (ruff) | PASS | 0 | 1.43 |
| Backend V12.5 format check (black) | PASS | 0 | 2.62 |
| Backend targeted V12.5 tests | PASS | 0 | 10.04 |
| Vulture guard | PASS | 0 | 3.89 |
| Frontend lint | PASS | 0 | 13.37 |
| Frontend type-check | PASS | 0 | 16.12 |
| Frontend tests | PASS | 0 | 525.84 |
| Frontend V12.5 performance harness (full) | PASS | 0 | 7.52 |
| Golden tests | PASS | 0 | 13.50 |
| E2E tests | PASS | 0 | 61.38 |

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

## UTF-8 mojibake guard

- CWD: `C:\Users\radek\Documents\GitHub\MV-Design-PRO\mv-design-pro`
- Command: `C:\Users\radek\AppData\Local\Programs\Python\Python311\python.exe C:\Users\radek\Documents\GitHub\MV-Design-PRO\mv-design-pro\scripts\utf8_mojibake_guard.py`
- Status: `PASS`

### stdout tail

```text
============================================================
GUARD: utf8_mojibake_guard
============================================================
PASSED: No mojibake fragments found
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
============================= 57 passed in 7.70s ==============================
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
 [32m✓[39m src/ui/sld/__tests__/sldCanonicalHygiene.test.ts [2m ([22m[2m5 tests[22m[2m)[22m[90m 5[2mms[22m[39m
 [32m✓[39m src/ui/network-build/__tests__/networkBuildStore.routeSurfaces.test.ts [2m ([22m[2m3 tests[22m[2m)[22m[90m 3[2mms[22m[39m
 [32m✓[39m src/ui/property-grid/__tests__/EngineeringInspector.test.tsx [2m ([22m[2m3 tests[22m[2m)[22m[90m 52[2mms[22m[39m
 [32m✓[39m src/ui/catalog/__tests__/TypePicker.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 111[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/SegmentInspectorPanel.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 34[2mms[22m[39m
 [32m✓[39m src/ui/__tests__/legacyPublicApiCut.test.ts [2m ([22m[2m4 tests[22m[2m)[22m[90m 4[2mms[22m[39m
 [32m✓[39m src/ui/app-state/__tests__/useCanCalculateReadiness.test.ts [2m ([22m[2m2 tests[22m[2m)[22m[90m 15[2mms[22m[39m
 [32m✓[39m src/ui/study-cases/__tests__/ProtectionCaseConfigPanel.test.ts [2m ([22m[2m3 tests[22m[2m)[22m[90m 2[2mms[22m[39m
 [32m✓[39m src/ui/proof/__tests__/TraceMetadataPanel.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 34[2mms[22m[39m
 [32m✓[39m src/ui/catalog/__tests__/catalogSnapshot.test.ts [2m ([22m[2m4 tests[22m[2m)[22m[90m 3[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/SldEmptyOverlay.test.tsx [2m ([22m[2m2 tests[22m[2m)[22m[90m 34[2mms[22m[39m
 [32m✓[39m src/ui/protection-diagnostics/__tests__/ProtectionDiagnosticsPanelContainer.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 33[2mms[22m[39m
 [32m✓[39m src/ui/network-build/__tests__/converterSourceFlow.test.ts [2m ([22m[2m2 tests[22m[2m)[22m[90m 3[2mms[22m[39m
 [32m✓[39m src/ui/shared/__tests__/enmVisibility.test.ts [2m ([22m[2m4 tests[22m[2m)[22m[90m 3[2mms[22m[39m
 [32m✓[39m src/ui/engineering-readiness/__tests__/EngineeringReadinessPanel.blocking.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 29[2mms[22m[39m
 [32m✓[39m src/ui/protection-coordination/__tests__/ProtectionSettingsEditor.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 43[2mms[22m[39m
 [32m✓[39m src/ui/notifications/__tests__/NotificationToast.test.tsx [2m ([22m[2m2 tests[22m[2m)[22m[90m 75[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/powerFlowOverlayGeometryInvariant.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 18[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/DiagnosticsLegend.test.tsx [2m ([22m[2m2 tests[22m[2m)[22m[90m 29[2mms[22m[39m
 [32m✓[39m src/ui/__tests__/activeShellTerminology.test.ts [2m ([22m[2m1 test[22m[2m)[22m[90m 5[2mms[22m[39m
 [32m✓[39m src/ui/navigation/urlState.test.ts [2m ([22m[2m1 test[22m[2m)[22m[90m 9[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/readinessSyncPolicy.test.ts [2m ([22m[2m3 tests[22m[2m)[22m[90m 3[2mms[22m[39m
 [32m✓[39m src/ui/common/connectionNode.test.ts [2m ([22m[2m2 tests[22m[2m)[22m[90m 2[2mms[22m[39m
 [32m✓[39m src/ui/protection-coordination/__tests__/TracePanel.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 28[2mms[22m[39m
 [32m✓[39m src/ui/layout/__tests__/index.test.ts [2m ([22m[2m1 test[22m[2m)[22m[90m 2[2mms[22m[39m
[2m Test Files [22m [1m[32m293 passed[39m[22m[90m (293)[39m
[2m      Tests [22m [1m[32m4525 passed[39m[22m[2m | [22m[33m1 skipped[39m[90m (4526)[39m
[2m   Start at [22m 22:04:37
[2m   Duration [22m 524.73s[2m (transform 7.83s, setup 52.30s, collect 51.06s, tests 21.14s, environment 308.04s, prepare 49.28s)[22m
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
[v125-perf] mini-sld mean=5.95ms median=4.85ms p95=13.01ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures full SLD pipeline and canvas mount[22m[39m
[v125-perf] full-sld mean=92.94ms median=86.75ms p95=130.88ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-24 analysis surface mount[22m[39m
[v125-perf] E-24 mean=4.18ms median=2.20ms p95=15.14ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-27 report surface mount[22m[39m
[v125-perf] E-27 mean=4.00ms median=4.06ms p95=4.90ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-28 protection coordination surface mount[22m[39m
[v125-perf] E-28 mean=6.15ms median=5.15ms p95=11.86ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-29 symmetrical components surface mount[22m[39m
[v125-perf] E-29 mean=4.42ms median=4.20ms p95=5.55ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-30 compliance surface mount[22m[39m
[v125-perf] E-30 mean=4.56ms median=4.51ms p95=5.36ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-33 thermal dynamic surface mount[22m[39m
[v125-perf] E-33 mean=4.42ms median=4.22ms p95=5.56ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-34 convergence surface mount[22m[39m
[v125-perf] E-34 mean=4.25ms median=4.13ms p95=4.83ms
 [32m✓[39m src/ui/workspace/__tests__/v125.performance.test.tsx [2m ([22m[2m9 tests[22m[2m)[22m[33m 1674[2mms[22m[39m
[2m Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[32m9 passed[39m[22m[90m (9)[39m
[2m   Start at [22m 22:13:23
[2m   Duration [22m 6.44s[2m (transform 1.70s, setup 191ms, collect 2.63s, tests 1.67s, environment 1.03s, prepare 168ms)[22m
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
 [32m✓[39m src/ui/sld/core/__tests__/goldenNetworkE2E.test.ts [2m ([22m[2m52 tests[22m[2m)[22m[33m 632[2mms[22m[39m
 [32m✓[39m src/ui/sld-editor/utils/topological-layout/__tests__/goldenNetworkSn.test.ts [2m ([22m[2m17 tests[22m[2m)[22m[33m 1291[2mms[22m[39m
 [32m✓[39m src/ui/__tests__/ux-golden-scenario.test.ts [2m ([22m[2m45 tests[22m[2m)[22m[90m 42[2mms[22m[39m
 [32m✓[39m src/ui/sld-editor/utils/topological-layout/__tests__/goldenFixtures.test.ts [2m ([22m[2m27 tests[22m[2m)[22m[90m 98[2mms[22m[39m
 [32m✓[39m src/ui/sld/core/__tests__/switchgearConfigGolden.test.ts [2m ([22m[2m9 tests[22m[2m)[22m[90m 31[2mms[22m[39m
 [32m✓[39m src/ui/sld/core/__tests__/sldRenderManifestGolden.test.ts [2m ([22m[2m10 tests[22m[2m)[22m[90m 30[2mms[22m[39m
[2m Test Files [22m [1m[32m6 passed[39m[22m[90m (6)[39m
[2m      Tests [22m [1m[32m160 passed[39m[22m[90m (160)[39m
[2m   Start at [22m 22:13:30
[2m   Duration [22m 12.50s[2m (transform 539ms, setup 1.05s, collect 782ms, tests 2.12s, environment 6.14s, prepare 966ms)[22m
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
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:61049 - "POST /api/cases/f1b2b89b-6ed5-4603-99f4-8008a5105614/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:61050 - "GET /api/cases/f1b2b89b-6ed5-4603-99f4-8008a5105614/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:61051 - "POST /api/cases/f1b2b89b-6ed5-4603-99f4-8008a5105614/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:61052 - "GET /api/cases/f1b2b89b-6ed5-4603-99f4-8008a5105614/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:63838 - "POST /api/cases/f1b2b89b-6ed5-4603-99f4-8008a5105614/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:63838 - "POST /api/cases/f1b2b89b-6ed5-4603-99f4-8008a5105614/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:63838 - "POST /api/cases/f1b2b89b-6ed5-4603-99f4-8008a5105614/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:63607 - "GET /api/cases/f1b2b89b-6ed5-4603-99f4-8008a5105614/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:63606 - "POST /api/cases/f1b2b89b-6ed5-4603-99f4-8008a5105614/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:63608 - "POST /api/cases/f1b2b89b-6ed5-4603-99f4-8008a5105614/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:49706 - "GET /api/cases/f1b2b89b-6ed5-4603-99f4-8008a5105614/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[18/18] [chromium] › e2e\sld-editor-real-backend-flex.spec.ts:331:1 › real backend supports flexible operation order combinations
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:63838 - "POST /api/projects HTTP/1.1" 201 Created
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:63838 - "POST /api/study-cases HTTP/1.1" 201 Created
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:61784 - "GET /api/cases/a0e5e839-0706-412a-a472-93c25f90ce7d/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:61783 - "POST /api/cases/a0e5e839-0706-412a-a472-93c25f90ce7d/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:61785 - "POST /api/cases/a0e5e839-0706-412a-a472-93c25f90ce7d/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:61786 - "GET /api/cases/a0e5e839-0706-412a-a472-93c25f90ce7d/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:63838 - "POST /api/cases/a0e5e839-0706-412a-a472-93c25f90ce7d/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:63838 - "POST /api/cases/a0e5e839-0706-412a-a472-93c25f90ce7d/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:63838 - "POST /api/cases/a0e5e839-0706-412a-a472-93c25f90ce7d/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:63838 - "POST /api/cases/a0e5e839-0706-412a-a472-93c25f90ce7d/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:63838 - "POST /api/cases/a0e5e839-0706-412a-a472-93c25f90ce7d/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:63838 - "POST /api/cases/a0e5e839-0706-412a-a472-93c25f90ce7d/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:63838 - "POST /api/cases/a0e5e839-0706-412a-a472-93c25f90ce7d/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:61132 - "POST /api/cases/a0e5e839-0706-412a-a472-93c25f90ce7d/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:61133 - "GET /api/cases/a0e5e839-0706-412a-a472-93c25f90ce7d/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:61134 - "POST /api/cases/a0e5e839-0706-412a-a472-93c25f90ce7d/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:61135 - "GET /api/cases/a0e5e839-0706-412a-a472-93c25f90ce7d/engineering-readiness HTTP/1.1" 200 OK
[1A[2K  18 passed (58.5s)
```

### stderr tail

```text
[1A[2K[2m[WebServer] [22m2026-04-23T22:14:37 INFO mv_design_pro HTTP POST /api/cases/f1b2b89b-6ed5-4603-99f4-8008a5105614/enm/domain-ops -> 200 (31.0ms) rid=c76a98b2-71fd-44c1-a03b-9922c1c888e9
[1A[2K[2m[WebServer] [22m2026-04-23T22:14:38 INFO mv_design_pro HTTP POST /api/cases/f1b2b89b-6ed5-4603-99f4-8008a5105614/enm/domain-ops -> 200 (32.0ms) rid=0a46ed2b-e05c-4a7b-b537-f588156e8134
[1A[2K[2m[WebServer] [22m2026-04-23T22:14:38 INFO mv_design_pro HTTP POST /api/cases/f1b2b89b-6ed5-4603-99f4-8008a5105614/enm/domain-ops -> 200 (16.0ms) rid=2fa11ce1-2a71-4a1f-b89b-91b32d8e9377
[1A[2K[2m[WebServer] [22m2026-04-23T22:14:38 INFO mv_design_pro HTTP GET /api/cases/f1b2b89b-6ed5-4603-99f4-8008a5105614/engineering-readiness -> 200 (0.0ms) rid=aa0ea85a-1e23-4967-8c7c-4382db30dbca
[1A[2K[2m[WebServer] [22m2026-04-23T22:14:38 INFO mv_design_pro HTTP POST /api/cases/f1b2b89b-6ed5-4603-99f4-8008a5105614/enm/domain-ops -> 200 (15.0ms) rid=2efd2a52-a04a-4f8b-8480-c7c86240ca5b
[1A[2K[2m[WebServer] [22m2026-04-23T22:14:38 INFO mv_design_pro HTTP GET /api/cases/f1b2b89b-6ed5-4603-99f4-8008a5105614/engineering-readiness -> 200 (0.0ms) rid=d0a162bd-3c0e-4a6e-a124-2d148e5c545c
[1A[2K[2m[WebServer] [22m2026-04-23T22:14:39 INFO mv_design_pro HTTP POST /api/cases/f1b2b89b-6ed5-4603-99f4-8008a5105614/enm/domain-ops -> 200 (47.0ms) rid=d694dcee-81de-49c3-941a-523778bcf65a
[1A[2K[2m[WebServer] [22m2026-04-23T22:14:39 INFO mv_design_pro HTTP POST /api/cases/f1b2b89b-6ed5-4603-99f4-8008a5105614/enm/domain-ops -> 200 (16.0ms) rid=24f277e5-1d1b-450e-8d65-29e4f6b74fb4
[1A[2K[2m[WebServer] [22m2026-04-23T22:14:39 INFO mv_design_pro HTTP POST /api/cases/f1b2b89b-6ed5-4603-99f4-8008a5105614/enm/domain-ops -> 200 (47.0ms) rid=95c5ab92-432d-42a8-9414-4694f06cfc75
[1A[2K[2m[WebServer] [22m2026-04-23T22:14:39 INFO mv_design_pro HTTP GET /api/cases/f1b2b89b-6ed5-4603-99f4-8008a5105614/engineering-readiness -> 200 (16.0ms) rid=28a2da3e-aa3e-4368-b648-0836dffd8898
[1A[2K[2m[WebServer] [22m2026-04-23T22:14:40 INFO mv_design_pro HTTP POST /api/cases/f1b2b89b-6ed5-4603-99f4-8008a5105614/enm/domain-ops -> 200 (31.0ms) rid=3b71269f-8caf-46fa-b899-7419b6c54520
[1A[2K[2m[WebServer] [22m2026-04-23T22:14:40 INFO mv_design_pro HTTP POST /api/cases/f1b2b89b-6ed5-4603-99f4-8008a5105614/enm/domain-ops -> 200 (31.0ms) rid=113bda0a-20f4-4f4e-83d4-52f47f9c3b4b
[1A[2K[2m[WebServer] [22m2026-04-23T22:14:40 INFO mv_design_pro HTTP GET /api/cases/f1b2b89b-6ed5-4603-99f4-8008a5105614/engineering-readiness -> 200 (16.0ms) rid=1764e982-cb23-4dc7-986e-5130ea4a6ce6
[1A[2K[2m[WebServer] [22m2026-04-23T22:14:41 INFO mv_design_pro HTTP POST /api/projects -> 201 (0.0ms) rid=2285c706-7187-4956-ac88-01a11de36e76
[1A[2K[2m[WebServer] [22m2026-04-23T22:14:41 INFO mv_design_pro HTTP POST /api/study-cases -> 201 (0.0ms) rid=7838c828-314e-4463-ad2c-a976eef2116f
[1A[2K[2m[WebServer] [22m2026-04-23T22:14:42 INFO mv_design_pro HTTP GET /api/cases/a0e5e839-0706-412a-a472-93c25f90ce7d/engineering-readiness -> 200 (0.0ms) rid=bf40c355-acac-420b-9828-06b564a61d15
[1A[2K[2m[WebServer] [22m2026-04-23T22:14:42 INFO mv_design_pro HTTP POST /api/cases/a0e5e839-0706-412a-a472-93c25f90ce7d/enm/domain-ops -> 200 (0.0ms) rid=59883c76-7e27-404d-9a96-7412fd5098ca
[1A[2K[2m[WebServer] [22m2026-04-23T22:14:42 INFO mv_design_pro HTTP POST /api/cases/a0e5e839-0706-412a-a472-93c25f90ce7d/enm/domain-ops -> 200 (16.0ms) rid=a74904b4-18a5-4c4d-8c89-4712d91c2f9e
[1A[2K[2m[WebServer] [22m2026-04-23T22:14:42 INFO mv_design_pro HTTP GET /api/cases/a0e5e839-0706-412a-a472-93c25f90ce7d/engineering-readiness -> 200 (0.0ms) rid=529208a0-4f9c-4aed-86d6-321c0e84ee96
[1A[2K[2m[WebServer] [22m2026-04-23T22:14:42 INFO mv_design_pro HTTP POST /api/cases/a0e5e839-0706-412a-a472-93c25f90ce7d/enm/domain-ops -> 200 (16.0ms) rid=c5e0cc8e-1a31-435e-9979-88ea3add76ad
[1A[2K[2m[WebServer] [22m2026-04-23T22:14:42 INFO mv_design_pro HTTP POST /api/cases/a0e5e839-0706-412a-a472-93c25f90ce7d/enm/domain-ops -> 200 (16.0ms) rid=a38d0060-9607-4c68-9c4c-a20a22930a0f
[1A[2K[2m[WebServer] [22m2026-04-23T22:14:42 INFO mv_design_pro HTTP POST /api/cases/a0e5e839-0706-412a-a472-93c25f90ce7d/enm/domain-ops -> 200 (15.0ms) rid=cc0677a4-0e65-4641-be4f-a938524abe92
[1A[2K[2m[WebServer] [22m2026-04-23T22:14:42 INFO mv_design_pro HTTP POST /api/cases/a0e5e839-0706-412a-a472-93c25f90ce7d/enm/domain-ops -> 200 (16.0ms) rid=c7050346-9ce5-4dc0-94a4-3c6932fff24d
[1A[2K[2m[WebServer] [22m2026-04-23T22:14:42 INFO mv_design_pro HTTP POST /api/cases/a0e5e839-0706-412a-a472-93c25f90ce7d/enm/domain-ops -> 200 (16.0ms) rid=79057945-e2df-4bad-9258-39764184fe2f
[1A[2K[2m[WebServer] [22m2026-04-23T22:14:42 INFO mv_design_pro HTTP POST /api/cases/a0e5e839-0706-412a-a472-93c25f90ce7d/enm/domain-ops -> 200 (31.0ms) rid=9e6896c9-cb4f-46c6-94ca-ddc081714d69
[1A[2K[2m[WebServer] [22m2026-04-23T22:14:42 INFO mv_design_pro HTTP POST /api/cases/a0e5e839-0706-412a-a472-93c25f90ce7d/enm/domain-ops -> 200 (31.0ms) rid=119d7716-04f0-4d03-958e-b9d7e14ca66f
[1A[2K[2m[WebServer] [22m2026-04-23T22:14:42 INFO mv_design_pro HTTP POST /api/cases/a0e5e839-0706-412a-a472-93c25f90ce7d/enm/domain-ops -> 200 (16.0ms) rid=25fca307-ffd4-4d5c-b643-368b4b28b3d2
[1A[2K[2m[WebServer] [22m2026-04-23T22:14:42 INFO mv_design_pro HTTP GET /api/cases/a0e5e839-0706-412a-a472-93c25f90ce7d/engineering-readiness -> 200 (16.0ms) rid=e4a84d06-c501-4b59-b6ee-6b516b1e51bf
[1A[2K[2m[WebServer] [22m2026-04-23T22:14:42 INFO mv_design_pro HTTP POST /api/cases/a0e5e839-0706-412a-a472-93c25f90ce7d/enm/domain-ops -> 200 (15.0ms) rid=2872e216-3fca-4afb-a8a9-3eddf22c6863
[1A[2K[2m[WebServer] [22m2026-04-23T22:14:42 INFO mv_design_pro HTTP GET /api/cases/a0e5e839-0706-412a-a472-93c25f90ce7d/engineering-readiness -> 200 (0.0ms) rid=78e54cc6-1f3d-48d8-a553-7c67f4c001c9
```

## Performance Report

- Profile: `full`
- Measured at: `2026-04-23T21:13:29.511Z`
- Harness: `frontend/src/ui/workspace/__tests__/v125.performance.test.tsx`
- Methodology: `2` warm-up run(s) + `7` measured run(s) per target.

| Target | Kind | Mean [ms] | Median [ms] | P95 [ms] | Max [ms] | Samples [ms] |
|---|---|---:|---:|---:|---:|---|
| Mini-SLD helper surface | mount | 5.95 | 4.85 | 13.01 | 13.01 | 13.01, 5.05, 4.30, 4.85, 4.09, 5.61, 4.71 |
| Full SLD terrain pipeline + canvas | pipeline+mount | 92.94 | 86.75 | 130.88 | 130.88 | 130.88, 88.57, 93.86, 84.92, 86.75, 79.21, 86.39 |
| Poziom analityczny i wyniki inżynierskie | mount | 4.18 | 2.20 | 15.14 | 15.14 | 15.14, 2.20, 2.04, 2.59, 2.01, 2.01, 3.26 |
| Raporty i eksporty | mount | 4.00 | 4.06 | 4.90 | 4.90 | 4.90, 3.82, 4.06, 4.12, 3.51, 3.09, 4.47 |
| Koordynacja zabezpieczeń | mount | 6.15 | 5.15 | 11.86 | 11.86 | 5.66, 5.07, 5.38, 5.15, 11.86, 5.15, 4.77 |
| Składowe symetryczne i sieć zerowa | mount | 4.42 | 4.20 | 5.55 | 5.55 | 4.34, 4.20, 4.05, 4.70, 4.08, 4.01, 5.55 |
| Wymagania przyłączeniowe i kodeks sieciowy | mount | 4.56 | 4.51 | 5.36 | 5.36 | 4.24, 4.53, 4.38, 4.51, 5.36, 4.35, 4.58 |
| Weryfikacja cieplna i dynamiczna toru prądowego | mount | 4.42 | 4.22 | 5.56 | 5.56 | 4.17, 4.10, 4.61, 4.22, 5.56, 4.32, 3.99 |
| Zbieżność rozpływu mocy i regulacja zaczepów | mount | 4.25 | 4.13 | 4.83 | 4.83 | 4.13, 4.03, 4.83, 3.95, 4.33, 4.33, 4.13 |
