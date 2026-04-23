# Verification V12.5.1

- Generated at: `2026-04-23 20:01:54Z`
- Package manager: `npm`
- Total steps: `15`
- Passed: `15`
- Failed: `0`

| Step | Status | Exit code | Duration [s] |
|---|---|---:|---:|
| UI terminology guard | PASS | 0 | 1.38 |
| UTF-8 mojibake guard | PASS | 0 | 1.32 |
| Docs archive guard | PASS | 0 | 0.34 |
| Import graph guard | PASS | 0 | 0.06 |
| Grep-zero guard | PASS | 0 | 0.07 |
| Backend V12.5 lint (ruff) | PASS | 0 | 1.37 |
| Backend V12.5 format check (black) | PASS | 0 | 2.61 |
| Backend targeted V12.5 tests | PASS | 0 | 9.43 |
| Vulture guard | PASS | 0 | 3.79 |
| Frontend lint | PASS | 0 | 15.02 |
| Frontend type-check | PASS | 0 | 17.02 |
| Frontend tests | PASS | 0 | 541.35 |
| Frontend V12.5 performance harness (full) | PASS | 0 | 7.80 |
| Golden tests | PASS | 0 | 15.49 |
| E2E tests | PASS | 0 | 56.81 |

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
All done! ✨ 🍰 ✨
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
============================= 57 passed in 7.14s ==============================
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
 [32m✓[39m src/ui/topology/modals/__tests__/modalRegistryCompleteness.test.ts [2m ([22m[2m8 tests[22m[2m)[22m[90m 5[2mms[22m[39m
 [32m✓[39m src/ui/network-build/__tests__/networkBuildStore.routeSurfaces.test.ts [2m ([22m[2m3 tests[22m[2m)[22m[90m 3[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/sldCanonicalHygiene.test.ts [2m ([22m[2m5 tests[22m[2m)[22m[90m 5[2mms[22m[39m
 [32m✓[39m src/ui/property-grid/__tests__/EngineeringInspector.test.tsx [2m ([22m[2m3 tests[22m[2m)[22m[90m 65[2mms[22m[39m
 [32m✓[39m src/ui/catalog/__tests__/TypePicker.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 91[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/SegmentInspectorPanel.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 41[2mms[22m[39m
 [32m✓[39m src/ui/__tests__/legacyPublicApiCut.test.ts [2m ([22m[2m4 tests[22m[2m)[22m[90m 4[2mms[22m[39m
 [32m✓[39m src/ui/app-state/__tests__/useCanCalculateReadiness.test.ts [2m ([22m[2m2 tests[22m[2m)[22m[90m 16[2mms[22m[39m
 [32m✓[39m src/ui/study-cases/__tests__/ProtectionCaseConfigPanel.test.ts [2m ([22m[2m3 tests[22m[2m)[22m[90m 3[2mms[22m[39m
 [32m✓[39m src/ui/proof/__tests__/TraceMetadataPanel.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 39[2mms[22m[39m
 [32m✓[39m src/ui/catalog/__tests__/catalogSnapshot.test.ts [2m ([22m[2m4 tests[22m[2m)[22m[90m 3[2mms[22m[39m
 [32m✓[39m src/ui/protection-diagnostics/__tests__/ProtectionDiagnosticsPanelContainer.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 32[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/SldEmptyOverlay.test.tsx [2m ([22m[2m2 tests[22m[2m)[22m[90m 30[2mms[22m[39m
 [32m✓[39m src/ui/network-build/__tests__/converterSourceFlow.test.ts [2m ([22m[2m2 tests[22m[2m)[22m[90m 3[2mms[22m[39m
 [32m✓[39m src/ui/shared/__tests__/enmVisibility.test.ts [2m ([22m[2m4 tests[22m[2m)[22m[90m 3[2mms[22m[39m
 [32m✓[39m src/ui/engineering-readiness/__tests__/EngineeringReadinessPanel.blocking.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 25[2mms[22m[39m
 [32m✓[39m src/ui/protection-coordination/__tests__/ProtectionSettingsEditor.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 42[2mms[22m[39m
 [32m✓[39m src/ui/notifications/__tests__/NotificationToast.test.tsx [2m ([22m[2m2 tests[22m[2m)[22m[90m 71[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/powerFlowOverlayGeometryInvariant.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 19[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/DiagnosticsLegend.test.tsx [2m ([22m[2m2 tests[22m[2m)[22m[90m 39[2mms[22m[39m
 [32m✓[39m src/ui/__tests__/activeShellTerminology.test.ts [2m ([22m[2m1 test[22m[2m)[22m[90m 5[2mms[22m[39m
 [32m✓[39m src/ui/navigation/urlState.test.ts [2m ([22m[2m1 test[22m[2m)[22m[90m 10[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/readinessSyncPolicy.test.ts [2m ([22m[2m3 tests[22m[2m)[22m[90m 2[2mms[22m[39m
 [32m✓[39m src/ui/common/connectionNode.test.ts [2m ([22m[2m2 tests[22m[2m)[22m[90m 2[2mms[22m[39m
 [32m✓[39m src/ui/protection-coordination/__tests__/TracePanel.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 28[2mms[22m[39m
 [32m✓[39m src/ui/layout/__tests__/index.test.ts [2m ([22m[2m1 test[22m[2m)[22m[90m 2[2mms[22m[39m
[2m Test Files [22m [1m[32m293 passed[39m[22m[90m (293)[39m
[2m      Tests [22m [1m[32m4520 passed[39m[22m[2m | [22m[33m1 skipped[39m[90m (4521)[39m
[2m   Start at [22m 20:51:33
[2m   Duration [22m 540.16s[2m (transform 8.22s, setup 52.68s, collect 50.63s, tests 21.93s, environment 317.64s, prepare 52.40s)[22m
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
[v125-perf] mini-sld mean=5.34ms median=4.41ms p95=11.70ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures full SLD pipeline and canvas mount[22m[39m
[v125-perf] full-sld mean=79.68ms median=74.23ms p95=109.56ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-24 analysis surface mount[22m[39m
[v125-perf] E-24 mean=2.46ms median=2.34ms p95=3.10ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-27 report surface mount[22m[39m
[v125-perf] E-27 mean=4.90ms median=5.08ms p95=5.45ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-28 protection coordination surface mount[22m[39m
[v125-perf] E-28 mean=6.64ms median=5.71ms p95=12.96ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-29 symmetrical components surface mount[22m[39m
[v125-perf] E-29 mean=5.16ms median=4.94ms p95=6.73ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-30 compliance surface mount[22m[39m
[v125-perf] E-30 mean=4.84ms median=4.73ms p95=5.30ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-33 thermal dynamic surface mount[22m[39m
[v125-perf] E-33 mean=4.91ms median=4.65ms p95=7.22ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-34 convergence surface mount[22m[39m
[v125-perf] E-34 mean=4.79ms median=4.43ms p95=5.86ms
 [32m✓[39m src/ui/workspace/__tests__/v125.performance.test.tsx [2m ([22m[2m9 tests[22m[2m)[22m[33m 1564[2mms[22m[39m
[2m Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[32m9 passed[39m[22m[90m (9)[39m
[2m   Start at [22m 21:00:34
[2m   Duration [22m 6.65s[2m (transform 1.82s, setup 176ms, collect 2.84s, tests 1.56s, environment 1.02s, prepare 164ms)[22m
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
 [32m✓[39m src/ui/sld/core/__tests__/goldenNetworkE2E.test.ts [2m ([22m[2m52 tests[22m[2m)[22m[33m 721[2mms[22m[39m
 [32m✓[39m src/ui/sld-editor/utils/topological-layout/__tests__/goldenNetworkSn.test.ts [2m ([22m[2m17 tests[22m[2m)[22m[33m 1240[2mms[22m[39m
 [32m✓[39m src/ui/__tests__/ux-golden-scenario.test.ts [2m ([22m[2m45 tests[22m[2m)[22m[90m 37[2mms[22m[39m
 [32m✓[39m src/ui/sld-editor/utils/topological-layout/__tests__/goldenFixtures.test.ts [2m ([22m[2m27 tests[22m[2m)[22m[90m 100[2mms[22m[39m
 [32m✓[39m src/ui/sld/core/__tests__/switchgearConfigGolden.test.ts [2m ([22m[2m9 tests[22m[2m)[22m[90m 36[2mms[22m[39m
 [32m✓[39m src/ui/sld/core/__tests__/sldRenderManifestGolden.test.ts [2m ([22m[2m10 tests[22m[2m)[22m[90m 40[2mms[22m[39m
[2m Test Files [22m [1m[32m6 passed[39m[22m[90m (6)[39m
[2m      Tests [22m [1m[32m160 passed[39m[22m[90m (160)[39m
[2m   Start at [22m 21:00:42
[2m   Duration [22m 14.46s[2m (transform 647ms, setup 1.17s, collect 950ms, tests 2.17s, environment 7.09s, prepare 1.23s)[22m
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
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:60648 - "POST /api/cases/6f9a1837-b570-4e57-92d4-ea1d9007ce16/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:60649 - "GET /api/cases/6f9a1837-b570-4e57-92d4-ea1d9007ce16/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:60650 - "POST /api/cases/6f9a1837-b570-4e57-92d4-ea1d9007ce16/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:60651 - "GET /api/cases/6f9a1837-b570-4e57-92d4-ea1d9007ce16/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:58458 - "POST /api/cases/6f9a1837-b570-4e57-92d4-ea1d9007ce16/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:58458 - "POST /api/cases/6f9a1837-b570-4e57-92d4-ea1d9007ce16/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:58458 - "POST /api/cases/6f9a1837-b570-4e57-92d4-ea1d9007ce16/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:50168 - "POST /api/cases/6f9a1837-b570-4e57-92d4-ea1d9007ce16/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:50169 - "GET /api/cases/6f9a1837-b570-4e57-92d4-ea1d9007ce16/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:50170 - "POST /api/cases/6f9a1837-b570-4e57-92d4-ea1d9007ce16/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:50171 - "GET /api/cases/6f9a1837-b570-4e57-92d4-ea1d9007ce16/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[18/18] [chromium] › e2e\sld-editor-real-backend-flex.spec.ts:331:1 › real backend supports flexible operation order combinations
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:58458 - "POST /api/projects HTTP/1.1" 201 Created
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:58458 - "POST /api/study-cases HTTP/1.1" 201 Created
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:62176 - "GET /api/cases/fb982ff3-811e-4c47-94cf-cd0ea8f75d39/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:62175 - "POST /api/cases/fb982ff3-811e-4c47-94cf-cd0ea8f75d39/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:62177 - "POST /api/cases/fb982ff3-811e-4c47-94cf-cd0ea8f75d39/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:62178 - "GET /api/cases/fb982ff3-811e-4c47-94cf-cd0ea8f75d39/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:58458 - "POST /api/cases/fb982ff3-811e-4c47-94cf-cd0ea8f75d39/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:58458 - "POST /api/cases/fb982ff3-811e-4c47-94cf-cd0ea8f75d39/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:58458 - "POST /api/cases/fb982ff3-811e-4c47-94cf-cd0ea8f75d39/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:58458 - "POST /api/cases/fb982ff3-811e-4c47-94cf-cd0ea8f75d39/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:58458 - "POST /api/cases/fb982ff3-811e-4c47-94cf-cd0ea8f75d39/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:58458 - "POST /api/cases/fb982ff3-811e-4c47-94cf-cd0ea8f75d39/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:58458 - "POST /api/cases/fb982ff3-811e-4c47-94cf-cd0ea8f75d39/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:62888 - "POST /api/cases/fb982ff3-811e-4c47-94cf-cd0ea8f75d39/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:62889 - "GET /api/cases/fb982ff3-811e-4c47-94cf-cd0ea8f75d39/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:62890 - "POST /api/cases/fb982ff3-811e-4c47-94cf-cd0ea8f75d39/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:62891 - "GET /api/cases/fb982ff3-811e-4c47-94cf-cd0ea8f75d39/engineering-readiness HTTP/1.1" 200 OK
[1A[2K  18 passed (53.1s)
```

### stderr tail

```text
[1A[2K[2m[WebServer] [22m2026-04-23T21:01:48 INFO mv_design_pro HTTP POST /api/cases/6f9a1837-b570-4e57-92d4-ea1d9007ce16/enm/domain-ops -> 200 (15.0ms) rid=5ee16c58-a9c7-4f13-b380-ee0e6f74706e
[1A[2K[2m[WebServer] [22m2026-04-23T21:01:48 INFO mv_design_pro HTTP POST /api/cases/6f9a1837-b570-4e57-92d4-ea1d9007ce16/enm/domain-ops -> 200 (16.0ms) rid=32fbb005-4d7f-40f0-a80e-ce3c30008533
[1A[2K[2m[WebServer] [22m2026-04-23T21:01:49 INFO mv_design_pro HTTP POST /api/cases/6f9a1837-b570-4e57-92d4-ea1d9007ce16/enm/domain-ops -> 200 (0.0ms) rid=169b771d-1e24-482f-98cd-cd277c81ef92
[1A[2K[2m[WebServer] [22m2026-04-23T21:01:49 INFO mv_design_pro HTTP GET /api/cases/6f9a1837-b570-4e57-92d4-ea1d9007ce16/engineering-readiness -> 200 (16.0ms) rid=a8ac186b-cc2f-4ff1-961b-fd939647d2e5
[1A[2K[2m[WebServer] [22m2026-04-23T21:01:49 INFO mv_design_pro HTTP POST /api/cases/6f9a1837-b570-4e57-92d4-ea1d9007ce16/enm/domain-ops -> 200 (0.0ms) rid=7d632157-a95f-4a39-99cd-6a99c26374fb
[1A[2K[2m[WebServer] [22m2026-04-23T21:01:49 INFO mv_design_pro HTTP GET /api/cases/6f9a1837-b570-4e57-92d4-ea1d9007ce16/engineering-readiness -> 200 (0.0ms) rid=dc54a678-27e9-4178-a417-4ea0ef54b334
[1A[2K[2m[WebServer] [22m2026-04-23T21:01:49 INFO mv_design_pro HTTP POST /api/cases/6f9a1837-b570-4e57-92d4-ea1d9007ce16/enm/domain-ops -> 200 (16.0ms) rid=6643222e-aa08-4675-9df9-5b3c8364d08f
[1A[2K[2m[WebServer] [22m2026-04-23T21:01:49 INFO mv_design_pro HTTP POST /api/cases/6f9a1837-b570-4e57-92d4-ea1d9007ce16/enm/domain-ops -> 200 (0.0ms) rid=ea031d69-de89-46a1-9f2e-6cb2392f7200
[1A[2K[2m[WebServer] [22m2026-04-23T21:01:49 INFO mv_design_pro HTTP POST /api/cases/6f9a1837-b570-4e57-92d4-ea1d9007ce16/enm/domain-ops -> 200 (15.0ms) rid=765a72a0-6e1d-448c-bc77-bcd5b34191e1
[1A[2K[2m[WebServer] [22m2026-04-23T21:01:50 INFO mv_design_pro HTTP POST /api/cases/6f9a1837-b570-4e57-92d4-ea1d9007ce16/enm/domain-ops -> 200 (0.0ms) rid=9f1c336b-4b31-4555-bba3-828f15fedfa0
[1A[2K[2m[WebServer] [22m2026-04-23T21:01:50 INFO mv_design_pro HTTP GET /api/cases/6f9a1837-b570-4e57-92d4-ea1d9007ce16/engineering-readiness -> 200 (16.0ms) rid=b21ac7af-5050-47d9-a2a0-18b246fc90f1
[1A[2K[2m[WebServer] [22m2026-04-23T21:01:50 INFO mv_design_pro HTTP POST /api/cases/6f9a1837-b570-4e57-92d4-ea1d9007ce16/enm/domain-ops -> 200 (31.0ms) rid=10f140ce-0415-4fdc-b604-07be937f0d04
[1A[2K[2m[WebServer] [22m2026-04-23T21:01:50 INFO mv_design_pro HTTP GET /api/cases/6f9a1837-b570-4e57-92d4-ea1d9007ce16/engineering-readiness -> 200 (0.0ms) rid=175bc898-c4b3-414f-bacb-ad33f8125956
[1A[2K[2m[WebServer] [22m2026-04-23T21:01:51 INFO mv_design_pro HTTP POST /api/projects -> 201 (15.0ms) rid=7cf7d471-aac8-4732-bd73-ad3a2d201408
[1A[2K[2m[WebServer] [22m2026-04-23T21:01:51 INFO mv_design_pro HTTP POST /api/study-cases -> 201 (0.0ms) rid=c51c3157-bc59-41bb-8a79-715ebddc32b1
[1A[2K[2m[WebServer] [22m2026-04-23T21:01:51 INFO mv_design_pro HTTP GET /api/cases/fb982ff3-811e-4c47-94cf-cd0ea8f75d39/engineering-readiness -> 200 (0.0ms) rid=2f227b9d-59d6-469e-8ec9-e76d34395173
[1A[2K[2m[WebServer] [22m2026-04-23T21:01:51 INFO mv_design_pro HTTP POST /api/cases/fb982ff3-811e-4c47-94cf-cd0ea8f75d39/enm/domain-ops -> 200 (0.0ms) rid=ea9b4595-f194-45cf-a067-078154e8017a
[1A[2K[2m[WebServer] [22m2026-04-23T21:01:51 INFO mv_design_pro HTTP POST /api/cases/fb982ff3-811e-4c47-94cf-cd0ea8f75d39/enm/domain-ops -> 200 (16.0ms) rid=79bbdade-bbd2-4384-9a75-9e445eb0fc06
[1A[2K[2m[WebServer] [22m2026-04-23T21:01:51 INFO mv_design_pro HTTP GET /api/cases/fb982ff3-811e-4c47-94cf-cd0ea8f75d39/engineering-readiness -> 200 (0.0ms) rid=34ae04d9-3e1d-4fec-8209-28104d0527a3
[1A[2K[2m[WebServer] [22m2026-04-23T21:01:51 INFO mv_design_pro HTTP POST /api/cases/fb982ff3-811e-4c47-94cf-cd0ea8f75d39/enm/domain-ops -> 200 (15.0ms) rid=7da516b8-ad16-4bcf-aabc-accc4c9f0388
[1A[2K[2m[WebServer] [22m2026-04-23T21:01:52 INFO mv_design_pro HTTP POST /api/cases/fb982ff3-811e-4c47-94cf-cd0ea8f75d39/enm/domain-ops -> 200 (16.0ms) rid=1e0b55ec-e9df-4c51-aa5e-12ff11a6de10
[1A[2K[2m[WebServer] [22m2026-04-23T21:01:52 INFO mv_design_pro HTTP POST /api/cases/fb982ff3-811e-4c47-94cf-cd0ea8f75d39/enm/domain-ops -> 200 (0.0ms) rid=bbd1400d-7918-4b02-9a8f-2de5ee7792e9
[1A[2K[2m[WebServer] [22m2026-04-23T21:01:52 INFO mv_design_pro HTTP POST /api/cases/fb982ff3-811e-4c47-94cf-cd0ea8f75d39/enm/domain-ops -> 200 (0.0ms) rid=285b4c44-ad97-4cb3-afc4-982ceb456e63
[1A[2K[2m[WebServer] [22m2026-04-23T21:01:52 INFO mv_design_pro HTTP POST /api/cases/fb982ff3-811e-4c47-94cf-cd0ea8f75d39/enm/domain-ops -> 200 (16.0ms) rid=a06705fe-ee53-40e3-9d62-c64a853b358b
[1A[2K[2m[WebServer] [22m2026-04-23T21:01:52 INFO mv_design_pro HTTP POST /api/cases/fb982ff3-811e-4c47-94cf-cd0ea8f75d39/enm/domain-ops -> 200 (31.0ms) rid=0bc4a34d-a601-44d6-bc2a-bf14a0b8920d
[1A[2K[2m[WebServer] [22m2026-04-23T21:01:52 INFO mv_design_pro HTTP POST /api/cases/fb982ff3-811e-4c47-94cf-cd0ea8f75d39/enm/domain-ops -> 200 (32.0ms) rid=f302634d-8900-470a-82ea-fe959cf4bbee
[1A[2K[2m[WebServer] [22m2026-04-23T21:01:52 INFO mv_design_pro HTTP POST /api/cases/fb982ff3-811e-4c47-94cf-cd0ea8f75d39/enm/domain-ops -> 200 (0.0ms) rid=09e55fab-3da0-4c2b-846c-24de14c74994
[1A[2K[2m[WebServer] [22m2026-04-23T21:01:52 INFO mv_design_pro HTTP GET /api/cases/fb982ff3-811e-4c47-94cf-cd0ea8f75d39/engineering-readiness -> 200 (0.0ms) rid=5ed6447f-eab8-4ce4-9fad-1020fc1f77ef
[1A[2K[2m[WebServer] [22m2026-04-23T21:01:52 INFO mv_design_pro HTTP POST /api/cases/fb982ff3-811e-4c47-94cf-cd0ea8f75d39/enm/domain-ops -> 200 (16.0ms) rid=ce1a12c9-00da-4f4b-ba1f-c0663ca59453
[1A[2K[2m[WebServer] [22m2026-04-23T21:01:52 INFO mv_design_pro HTTP GET /api/cases/fb982ff3-811e-4c47-94cf-cd0ea8f75d39/engineering-readiness -> 200 (0.0ms) rid=cad379e9-f935-430a-80f2-45f6dd926b62
```

## Performance Report

- Profile: `full`
- Measured at: `2026-04-23T20:00:41.603Z`
- Harness: `frontend/src/ui/workspace/__tests__/v125.performance.test.tsx`
- Methodology: `2` warm-up run(s) + `7` measured run(s) per target.

| Target | Kind | Mean [ms] | Median [ms] | P95 [ms] | Max [ms] | Samples [ms] |
|---|---|---:|---:|---:|---:|---|
| Mini-SLD helper surface | mount | 5.34 | 4.41 | 11.70 | 11.70 | 11.70, 4.41, 4.95, 3.90, 4.12, 4.59, 3.74 |
| Full SLD terrain pipeline + canvas | pipeline+mount | 79.68 | 74.23 | 109.56 | 109.56 | 109.56, 74.79, 73.41, 78.30, 74.12, 74.23, 73.37 |
| Poziom analityczny i wyniki inżynierskie | mount | 2.46 | 2.34 | 3.10 | 3.10 | 1.89, 2.74, 2.30, 1.94, 2.89, 2.34, 3.10 |
| Raporty i eksporty | mount | 4.90 | 5.08 | 5.45 | 5.45 | 5.45, 5.16, 5.44, 5.08, 4.52, 4.62, 4.02 |
| Koordynacja zabezpieczeń | mount | 6.64 | 5.71 | 12.96 | 12.96 | 6.26, 5.04, 5.71, 6.40, 4.78, 12.96, 5.33 |
| Składowe symetryczne i sieć zerowa | mount | 5.16 | 4.94 | 6.73 | 6.73 | 4.94, 4.41, 5.63, 6.73, 4.62, 4.52, 5.26 |
| Wymagania przyłączeniowe i kodeks sieciowy | mount | 4.84 | 4.73 | 5.30 | 5.30 | 4.72, 4.53, 4.73, 5.30, 4.69, 5.11, 4.79 |
| Weryfikacja cieplna i dynamiczna toru prądowego | mount | 4.91 | 4.65 | 7.22 | 7.22 | 7.22, 4.36, 4.65, 4.73, 4.36, 4.90, 4.18 |
| Zbieżność rozpływu mocy i regulacja zaczepów | mount | 4.79 | 4.43 | 5.86 | 5.86 | 5.86, 4.37, 4.38, 4.11, 4.43, 5.64, 4.77 |
