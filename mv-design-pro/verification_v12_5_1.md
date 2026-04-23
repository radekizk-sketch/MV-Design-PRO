# Verification V12.5.1

- Generated at: `2026-04-23 21:38:58Z`
- Package manager: `npm`
- Total steps: `15`
- Passed: `15`
- Failed: `0`

| Step | Status | Exit code | Duration [s] |
|---|---|---:|---:|
| UI terminology guard | PASS | 0 | 1.33 |
| UTF-8 mojibake guard | PASS | 0 | 1.24 |
| Docs archive guard | PASS | 0 | 0.28 |
| Import graph guard | PASS | 0 | 0.06 |
| Grep-zero guard | PASS | 0 | 0.06 |
| Backend V12.5 lint (ruff) | PASS | 0 | 1.69 |
| Backend V12.5 format check (black) | PASS | 0 | 2.59 |
| Backend targeted V12.5 tests | PASS | 0 | 8.52 |
| Vulture guard | PASS | 0 | 3.06 |
| Frontend lint | PASS | 0 | 13.62 |
| Frontend type-check | PASS | 0 | 18.03 |
| Frontend tests | PASS | 0 | 520.99 |
| Frontend V12.5 performance harness (full) | PASS | 0 | 7.40 |
| Golden tests | PASS | 0 | 13.53 |
| E2E tests | PASS | 0 | 60.96 |

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
============================= 57 passed in 6.28s ==============================
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
 [32m✓[39m src/ui/network-build/__tests__/networkBuildStore.routeSurfaces.test.ts [2m ([22m[2m3 tests[22m[2m)[22m[90m 4[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/sldCanonicalHygiene.test.ts [2m ([22m[2m5 tests[22m[2m)[22m[90m 5[2mms[22m[39m
 [32m✓[39m src/ui/property-grid/__tests__/EngineeringInspector.test.tsx [2m ([22m[2m3 tests[22m[2m)[22m[90m 51[2mms[22m[39m
 [32m✓[39m src/ui/catalog/__tests__/TypePicker.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 120[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/SegmentInspectorPanel.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 34[2mms[22m[39m
 [32m✓[39m src/ui/__tests__/legacyPublicApiCut.test.ts [2m ([22m[2m4 tests[22m[2m)[22m[90m 3[2mms[22m[39m
 [32m✓[39m src/ui/app-state/__tests__/useCanCalculateReadiness.test.ts [2m ([22m[2m2 tests[22m[2m)[22m[90m 14[2mms[22m[39m
 [32m✓[39m src/ui/study-cases/__tests__/ProtectionCaseConfigPanel.test.ts [2m ([22m[2m3 tests[22m[2m)[22m[90m 2[2mms[22m[39m
 [32m✓[39m src/ui/proof/__tests__/TraceMetadataPanel.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 34[2mms[22m[39m
 [32m✓[39m src/ui/catalog/__tests__/catalogSnapshot.test.ts [2m ([22m[2m4 tests[22m[2m)[22m[90m 3[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/SldEmptyOverlay.test.tsx [2m ([22m[2m2 tests[22m[2m)[22m[90m 31[2mms[22m[39m
 [32m✓[39m src/ui/protection-diagnostics/__tests__/ProtectionDiagnosticsPanelContainer.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 31[2mms[22m[39m
 [32m✓[39m src/ui/network-build/__tests__/converterSourceFlow.test.ts [2m ([22m[2m2 tests[22m[2m)[22m[90m 4[2mms[22m[39m
 [32m✓[39m src/ui/shared/__tests__/enmVisibility.test.ts [2m ([22m[2m4 tests[22m[2m)[22m[90m 3[2mms[22m[39m
 [32m✓[39m src/ui/engineering-readiness/__tests__/EngineeringReadinessPanel.blocking.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 32[2mms[22m[39m
 [32m✓[39m src/ui/protection-coordination/__tests__/ProtectionSettingsEditor.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 44[2mms[22m[39m
 [32m✓[39m src/ui/notifications/__tests__/NotificationToast.test.tsx [2m ([22m[2m2 tests[22m[2m)[22m[90m 68[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/powerFlowOverlayGeometryInvariant.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 18[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/DiagnosticsLegend.test.tsx [2m ([22m[2m2 tests[22m[2m)[22m[90m 29[2mms[22m[39m
 [32m✓[39m src/ui/__tests__/activeShellTerminology.test.ts [2m ([22m[2m1 test[22m[2m)[22m[90m 4[2mms[22m[39m
 [32m✓[39m src/ui/navigation/urlState.test.ts [2m ([22m[2m1 test[22m[2m)[22m[90m 9[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/readinessSyncPolicy.test.ts [2m ([22m[2m3 tests[22m[2m)[22m[90m 3[2mms[22m[39m
 [32m✓[39m src/ui/common/connectionNode.test.ts [2m ([22m[2m2 tests[22m[2m)[22m[90m 3[2mms[22m[39m
 [32m✓[39m src/ui/protection-coordination/__tests__/TracePanel.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 30[2mms[22m[39m
 [32m✓[39m src/ui/layout/__tests__/index.test.ts [2m ([22m[2m1 test[22m[2m)[22m[90m 2[2mms[22m[39m
[2m Test Files [22m [1m[32m296 passed[39m[22m[90m (296)[39m
[2m      Tests [22m [1m[32m4577 passed[39m[22m[2m | [22m[33m1 skipped[39m[90m (4578)[39m
[2m   Start at [22m 22:28:56
[2m   Duration [22m 519.85s[2m (transform 7.99s, setup 51.19s, collect 49.09s, tests 20.79s, environment 306.05s, prepare 49.24s)[22m
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
[v125-perf] mini-sld mean=5.13ms median=4.29ms p95=11.31ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures full SLD pipeline and canvas mount[22m[39m
[v125-perf] full-sld mean=81.95ms median=79.01ms p95=108.38ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-24 analysis surface mount[22m[39m
[v125-perf] E-24 mean=3.53ms median=1.91ms p95=13.15ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-27 report surface mount[22m[39m
[v125-perf] E-27 mean=3.31ms median=3.24ms p95=4.05ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-28 protection coordination surface mount[22m[39m
[v125-perf] E-28 mean=4.54ms median=4.47ms p95=4.79ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-29 symmetrical components surface mount[22m[39m
[v125-perf] E-29 mean=4.04ms median=3.93ms p95=4.46ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-30 compliance surface mount[22m[39m
[v125-perf] E-30 mean=4.43ms median=4.29ms p95=5.38ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-33 thermal dynamic surface mount[22m[39m
[v125-perf] E-33 mean=6.17ms median=5.96ms p95=7.78ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-34 convergence surface mount[22m[39m
[v125-perf] E-34 mean=4.64ms median=4.45ms p95=5.63ms
 [32m✓[39m src/ui/workspace/__tests__/v125.performance.test.tsx [2m ([22m[2m9 tests[22m[2m)[22m[33m 1538[2mms[22m[39m
[2m Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[32m9 passed[39m[22m[90m (9)[39m
[2m   Start at [22m 22:37:37
[2m   Duration [22m 6.38s[2m (transform 1.66s, setup 175ms, collect 2.63s, tests 1.54s, environment 1.15s, prepare 158ms)[22m
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
 [32m✓[39m src/ui/sld/core/__tests__/goldenNetworkE2E.test.ts [2m ([22m[2m52 tests[22m[2m)[22m[33m 580[2mms[22m[39m
 [32m✓[39m src/ui/sld-editor/utils/topological-layout/__tests__/goldenNetworkSn.test.ts [2m ([22m[2m17 tests[22m[2m)[22m[33m 1298[2mms[22m[39m
 [32m✓[39m src/ui/__tests__/ux-golden-scenario.test.ts [2m ([22m[2m45 tests[22m[2m)[22m[90m 38[2mms[22m[39m
 [32m✓[39m src/ui/sld-editor/utils/topological-layout/__tests__/goldenFixtures.test.ts [2m ([22m[2m27 tests[22m[2m)[22m[90m 85[2mms[22m[39m
 [32m✓[39m src/ui/sld/core/__tests__/switchgearConfigGolden.test.ts [2m ([22m[2m9 tests[22m[2m)[22m[90m 27[2mms[22m[39m
 [32m✓[39m src/ui/sld/core/__tests__/sldRenderManifestGolden.test.ts [2m ([22m[2m10 tests[22m[2m)[22m[90m 41[2mms[22m[39m
[2m Test Files [22m [1m[32m6 passed[39m[22m[90m (6)[39m
[2m      Tests [22m [1m[32m160 passed[39m[22m[90m (160)[39m
[2m   Start at [22m 22:37:44
[2m   Duration [22m 12.48s[2m (transform 530ms, setup 986ms, collect 765ms, tests 2.07s, environment 6.21s, prepare 1.03s)[22m
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
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:49671 - "POST /api/cases/5c282dcf-36c3-4ca0-b78c-f30c4cc4755c/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:49672 - "GET /api/cases/5c282dcf-36c3-4ca0-b78c-f30c4cc4755c/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:49673 - "POST /api/cases/5c282dcf-36c3-4ca0-b78c-f30c4cc4755c/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:49674 - "GET /api/cases/5c282dcf-36c3-4ca0-b78c-f30c4cc4755c/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:50504 - "POST /api/cases/5c282dcf-36c3-4ca0-b78c-f30c4cc4755c/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:50504 - "POST /api/cases/5c282dcf-36c3-4ca0-b78c-f30c4cc4755c/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:50504 - "POST /api/cases/5c282dcf-36c3-4ca0-b78c-f30c4cc4755c/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:58489 - "POST /api/cases/5c282dcf-36c3-4ca0-b78c-f30c4cc4755c/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:58490 - "GET /api/cases/5c282dcf-36c3-4ca0-b78c-f30c4cc4755c/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:58491 - "POST /api/cases/5c282dcf-36c3-4ca0-b78c-f30c4cc4755c/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:58492 - "GET /api/cases/5c282dcf-36c3-4ca0-b78c-f30c4cc4755c/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[18/18] [chromium] › e2e\sld-editor-real-backend-flex.spec.ts:331:1 › real backend supports flexible operation order combinations
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:50504 - "POST /api/projects HTTP/1.1" 201 Created
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:50504 - "POST /api/study-cases HTTP/1.1" 201 Created
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:52386 - "POST /api/cases/32a9c4a3-4635-46ae-b77b-1c9cda0b23f1/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:52387 - "GET /api/cases/32a9c4a3-4635-46ae-b77b-1c9cda0b23f1/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:52388 - "POST /api/cases/32a9c4a3-4635-46ae-b77b-1c9cda0b23f1/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:52389 - "GET /api/cases/32a9c4a3-4635-46ae-b77b-1c9cda0b23f1/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:50504 - "POST /api/cases/32a9c4a3-4635-46ae-b77b-1c9cda0b23f1/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:50504 - "POST /api/cases/32a9c4a3-4635-46ae-b77b-1c9cda0b23f1/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:50504 - "POST /api/cases/32a9c4a3-4635-46ae-b77b-1c9cda0b23f1/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:50504 - "POST /api/cases/32a9c4a3-4635-46ae-b77b-1c9cda0b23f1/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:50504 - "POST /api/cases/32a9c4a3-4635-46ae-b77b-1c9cda0b23f1/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:50504 - "POST /api/cases/32a9c4a3-4635-46ae-b77b-1c9cda0b23f1/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:50504 - "POST /api/cases/32a9c4a3-4635-46ae-b77b-1c9cda0b23f1/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:51245 - "POST /api/cases/32a9c4a3-4635-46ae-b77b-1c9cda0b23f1/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:51246 - "GET /api/cases/32a9c4a3-4635-46ae-b77b-1c9cda0b23f1/engineering-readiness HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:51247 - "POST /api/cases/32a9c4a3-4635-46ae-b77b-1c9cda0b23f1/enm/domain-ops HTTP/1.1" 200 OK
[1A[2K[2m[WebServer] [22mINFO:     127.0.0.1:51248 - "GET /api/cases/32a9c4a3-4635-46ae-b77b-1c9cda0b23f1/engineering-readiness HTTP/1.1" 200 OK
[1A[2K  18 passed (57.8s)
```

### stderr tail

```text
[1A[2K[2m[WebServer] [22m2026-04-23T22:38:51 INFO mv_design_pro HTTP POST /api/cases/5c282dcf-36c3-4ca0-b78c-f30c4cc4755c/enm/domain-ops -> 200 (0.0ms) rid=3c4cd085-6a82-420d-bf1e-67f8f02fe6b5
[1A[2K[2m[WebServer] [22m2026-04-23T22:38:51 INFO mv_design_pro HTTP POST /api/cases/5c282dcf-36c3-4ca0-b78c-f30c4cc4755c/enm/domain-ops -> 200 (16.0ms) rid=9fd5e001-b874-4bc3-b69b-91b501458942
[1A[2K[2m[WebServer] [22m2026-04-23T22:38:52 INFO mv_design_pro HTTP POST /api/cases/5c282dcf-36c3-4ca0-b78c-f30c4cc4755c/enm/domain-ops -> 200 (0.0ms) rid=18d52806-1501-416e-845b-2eaad4d0b419
[1A[2K[2m[WebServer] [22m2026-04-23T22:38:52 INFO mv_design_pro HTTP GET /api/cases/5c282dcf-36c3-4ca0-b78c-f30c4cc4755c/engineering-readiness -> 200 (0.0ms) rid=d8833495-1eff-4348-8d95-5a6dbb7b00a4
[1A[2K[2m[WebServer] [22m2026-04-23T22:38:52 INFO mv_design_pro HTTP POST /api/cases/5c282dcf-36c3-4ca0-b78c-f30c4cc4755c/enm/domain-ops -> 200 (15.0ms) rid=f9bb3490-269e-4c5d-ab73-05fac1e23b0d
[1A[2K[2m[WebServer] [22m2026-04-23T22:38:52 INFO mv_design_pro HTTP GET /api/cases/5c282dcf-36c3-4ca0-b78c-f30c4cc4755c/engineering-readiness -> 200 (0.0ms) rid=17afa19e-2f31-4d6c-bb9a-5cb42bd5f52a
[1A[2K[2m[WebServer] [22m2026-04-23T22:38:53 INFO mv_design_pro HTTP POST /api/cases/5c282dcf-36c3-4ca0-b78c-f30c4cc4755c/enm/domain-ops -> 200 (31.0ms) rid=73c1fed4-253d-4391-8ad0-868c684fd0ca
[1A[2K[2m[WebServer] [22m2026-04-23T22:38:53 INFO mv_design_pro HTTP POST /api/cases/5c282dcf-36c3-4ca0-b78c-f30c4cc4755c/enm/domain-ops -> 200 (31.0ms) rid=9a0f0677-da7e-4eca-9ca6-1fe7d92a5c66
[1A[2K[2m[WebServer] [22m2026-04-23T22:38:53 INFO mv_design_pro HTTP POST /api/cases/5c282dcf-36c3-4ca0-b78c-f30c4cc4755c/enm/domain-ops -> 200 (62.0ms) rid=46ff6be5-e5fe-40be-b4f7-cba6dcdb4736
[1A[2K[2m[WebServer] [22m2026-04-23T22:38:54 INFO mv_design_pro HTTP POST /api/cases/5c282dcf-36c3-4ca0-b78c-f30c4cc4755c/enm/domain-ops -> 200 (16.0ms) rid=ba1a6241-3567-4005-ab62-5e2d3f36083a
[1A[2K[2m[WebServer] [22m2026-04-23T22:38:54 INFO mv_design_pro HTTP GET /api/cases/5c282dcf-36c3-4ca0-b78c-f30c4cc4755c/engineering-readiness -> 200 (0.0ms) rid=801d2c2c-e224-42df-b6fa-ee78690270d4
[1A[2K[2m[WebServer] [22m2026-04-23T22:38:54 INFO mv_design_pro HTTP POST /api/cases/5c282dcf-36c3-4ca0-b78c-f30c4cc4755c/enm/domain-ops -> 200 (15.0ms) rid=2e51e8eb-7d8a-413e-a99d-e76437a8c6df
[1A[2K[2m[WebServer] [22m2026-04-23T22:38:54 INFO mv_design_pro HTTP GET /api/cases/5c282dcf-36c3-4ca0-b78c-f30c4cc4755c/engineering-readiness -> 200 (0.0ms) rid=00ea66da-7b1e-4e56-9904-7c2b826e68c5
[1A[2K[2m[WebServer] [22m2026-04-23T22:38:55 INFO mv_design_pro HTTP POST /api/projects -> 201 (16.0ms) rid=4e43cc2b-f608-4ce7-9d42-4bf8323a2fae
[1A[2K[2m[WebServer] [22m2026-04-23T22:38:55 INFO mv_design_pro HTTP POST /api/study-cases -> 201 (15.0ms) rid=5012d6da-af00-473d-babd-e3da0f58f129
[1A[2K[2m[WebServer] [22m2026-04-23T22:38:55 INFO mv_design_pro HTTP POST /api/cases/32a9c4a3-4635-46ae-b77b-1c9cda0b23f1/enm/domain-ops -> 200 (16.0ms) rid=a7bb65ae-7de5-48ef-9e75-6e26e18263e2
[1A[2K[2m[WebServer] [22m2026-04-23T22:38:55 INFO mv_design_pro HTTP GET /api/cases/32a9c4a3-4635-46ae-b77b-1c9cda0b23f1/engineering-readiness -> 200 (0.0ms) rid=df2a37cc-2921-4198-b0aa-db95cdcfacb3
[1A[2K[2m[WebServer] [22m2026-04-23T22:38:55 INFO mv_design_pro HTTP POST /api/cases/32a9c4a3-4635-46ae-b77b-1c9cda0b23f1/enm/domain-ops -> 200 (15.0ms) rid=bb70117f-87db-47a7-aeec-04b848afcca9
[1A[2K[2m[WebServer] [22m2026-04-23T22:38:55 INFO mv_design_pro HTTP GET /api/cases/32a9c4a3-4635-46ae-b77b-1c9cda0b23f1/engineering-readiness -> 200 (0.0ms) rid=4df81075-a4d8-4e74-9a44-ffe23736af81
[1A[2K[2m[WebServer] [22m2026-04-23T22:38:56 INFO mv_design_pro HTTP POST /api/cases/32a9c4a3-4635-46ae-b77b-1c9cda0b23f1/enm/domain-ops -> 200 (16.0ms) rid=db689130-3a5e-4d30-a1f0-eaef92d3da7b
[1A[2K[2m[WebServer] [22m2026-04-23T22:38:56 INFO mv_design_pro HTTP POST /api/cases/32a9c4a3-4635-46ae-b77b-1c9cda0b23f1/enm/domain-ops -> 200 (16.0ms) rid=0ca02a72-2007-402d-8028-b58e8e270a8f
[1A[2K[2m[WebServer] [22m2026-04-23T22:38:56 INFO mv_design_pro HTTP POST /api/cases/32a9c4a3-4635-46ae-b77b-1c9cda0b23f1/enm/domain-ops -> 200 (0.0ms) rid=9f3d20fc-8b95-4126-82d8-9e2b78b79f58
[1A[2K[2m[WebServer] [22m2026-04-23T22:38:56 INFO mv_design_pro HTTP POST /api/cases/32a9c4a3-4635-46ae-b77b-1c9cda0b23f1/enm/domain-ops -> 200 (16.0ms) rid=1c041db0-6960-488c-acb2-2d4deb340f37
[1A[2K[2m[WebServer] [22m2026-04-23T22:38:56 INFO mv_design_pro HTTP POST /api/cases/32a9c4a3-4635-46ae-b77b-1c9cda0b23f1/enm/domain-ops -> 200 (15.0ms) rid=1bfdcc18-0aad-413d-a7fb-7a0b634bbee4
[1A[2K[2m[WebServer] [22m2026-04-23T22:38:56 INFO mv_design_pro HTTP POST /api/cases/32a9c4a3-4635-46ae-b77b-1c9cda0b23f1/enm/domain-ops -> 200 (16.0ms) rid=bb1777b6-a2d4-4f4e-af08-f86a36b0e859
[1A[2K[2m[WebServer] [22m2026-04-23T22:38:56 INFO mv_design_pro HTTP POST /api/cases/32a9c4a3-4635-46ae-b77b-1c9cda0b23f1/enm/domain-ops -> 200 (31.0ms) rid=9c30241e-5897-461f-a111-4d9de1fd9cd8
[1A[2K[2m[WebServer] [22m2026-04-23T22:38:56 INFO mv_design_pro HTTP POST /api/cases/32a9c4a3-4635-46ae-b77b-1c9cda0b23f1/enm/domain-ops -> 200 (15.0ms) rid=793498fb-b351-4b3f-bbed-6cda7e227877
[1A[2K[2m[WebServer] [22m2026-04-23T22:38:56 INFO mv_design_pro HTTP GET /api/cases/32a9c4a3-4635-46ae-b77b-1c9cda0b23f1/engineering-readiness -> 200 (15.0ms) rid=70cb1c75-2a0c-4f8f-bf9a-80c75dbe9638
[1A[2K[2m[WebServer] [22m2026-04-23T22:38:56 INFO mv_design_pro HTTP POST /api/cases/32a9c4a3-4635-46ae-b77b-1c9cda0b23f1/enm/domain-ops -> 200 (16.0ms) rid=7094fdbe-bd7c-43e6-9dbb-30d187167e7c
[1A[2K[2m[WebServer] [22m2026-04-23T22:38:56 INFO mv_design_pro HTTP GET /api/cases/32a9c4a3-4635-46ae-b77b-1c9cda0b23f1/engineering-readiness -> 200 (0.0ms) rid=32df308e-6eb0-4693-ba11-1445f442f142
```

## Performance Report

- Profile: `full`
- Measured at: `2026-04-23T21:37:43.627Z`
- Harness: `frontend/src/ui/workspace/__tests__/v125.performance.test.tsx`
- Methodology: `2` warm-up run(s) + `7` measured run(s) per target.

| Target | Kind | Mean [ms] | Median [ms] | P95 [ms] | Max [ms] | Samples [ms] |
|---|---|---:|---:|---:|---:|---|
| Mini-SLD helper surface | mount | 5.13 | 4.29 | 11.31 | 11.31 | 11.31, 4.33, 4.29, 3.75, 3.82, 4.91, 3.49 |
| Full SLD terrain pipeline + canvas | pipeline+mount | 81.95 | 79.01 | 108.38 | 108.38 | 108.38, 72.39, 82.08, 72.85, 78.20, 80.72, 79.01 |
| Poziom analityczny i wyniki inżynierskie | mount | 3.53 | 1.91 | 13.15 | 13.15 | 13.15, 1.91, 1.89, 1.95, 1.89, 1.90, 1.99 |
| Raporty i eksporty | mount | 3.31 | 3.24 | 4.05 | 4.05 | 3.62, 3.24, 4.05, 3.24, 3.31, 2.93, 2.78 |
| Koordynacja zabezpieczeń | mount | 4.54 | 4.47 | 4.79 | 4.79 | 4.76, 4.79, 4.56, 4.42, 4.47, 4.46, 4.29 |
| Składowe symetryczne i sieć zerowa | mount | 4.04 | 3.93 | 4.46 | 4.46 | 4.24, 4.07, 3.87, 3.93, 3.91, 3.83, 4.46 |
| Wymagania przyłączeniowe i kodeks sieciowy | mount | 4.43 | 4.29 | 5.38 | 5.38 | 4.20, 4.03, 4.54, 4.36, 4.29, 4.19, 5.38 |
| Weryfikacja cieplna i dynamiczna toru prądowego | mount | 6.17 | 5.96 | 7.78 | 7.78 | 7.28, 7.32, 5.96, 7.78, 5.47, 5.07, 4.27 |
| Zbieżność rozpływu mocy i regulacja zaczepów | mount | 4.64 | 4.45 | 5.63 | 5.63 | 4.45, 5.63, 4.41, 4.09, 5.01, 4.48, 4.45 |
