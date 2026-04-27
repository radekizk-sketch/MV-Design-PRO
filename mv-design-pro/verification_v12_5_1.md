# Verification V12.5.1

- Generated at: `2026-04-27 21:57:01Z`
- Package manager: `npm`
- Total steps: `18`
- Passed: `18`
- Failed: `0`

| Step | Status | Exit code | Duration [s] |
|---|---|---:|---:|
| UI terminology guard | PASS | 0 | 0.94 |
| Docs archive guard | PASS | 0 | 0.48 |
| V12.xx canon guard | PASS | 0 | 0.55 |
| API lifecycle guard | PASS | 0 | 0.23 |
| Legacy public path guard | PASS | 0 | 0.18 |
| Severity contract guard | PASS | 0 | 0.13 |
| Import graph guard | PASS | 0 | 0.09 |
| Grep-zero guard | PASS | 0 | 0.09 |
| Backend V12.5 lint (ruff) | PASS | 0 | 2.35 |
| Backend V12.5 format check (black) | PASS | 0 | 4.28 |
| Backend targeted V12.5 tests | PASS | 0 | 12.13 |
| Vulture guard | PASS | 0 | 4.86 |
| Frontend lint | PASS | 0 | 20.65 |
| Frontend type-check | PASS | 0 | 30.08 |
| Frontend tests | PASS | 0 | 865.99 |
| Frontend V12.5 performance harness (full) | PASS | 0 | 10.41 |
| Golden tests | PASS | 0 | 18.89 |
| E2E tests | PASS | 0 | 51.32 |

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
============================= 102 passed in 8.88s =============================
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
 [32m✓[39m src/ui/protection-diagnostics/__tests__/ProtectionDiagnosticsPanelContainer.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 49[2mms[22m[39m
 [32m✓[39m src/ui/workspace/__tests__/screen-registry-coverage.test.ts [2m ([22m[2m3 tests[22m[2m)[22m[90m 7[2mms[22m[39m
 [32m✓[39m src/ui/network-build/__tests__/converterSourceFlow.test.ts [2m ([22m[2m2 tests[22m[2m)[22m[90m 3[2mms[22m[39m
 [32m✓[39m src/ui/shared/__tests__/enmVisibility.test.ts [2m ([22m[2m4 tests[22m[2m)[22m[90m 4[2mms[22m[39m
 [32m✓[39m src/ui/workspace/__tests__/workspace-screen-router.test.ts [2m ([22m[2m3 tests[22m[2m)[22m[90m 5[2mms[22m[39m
 [32m✓[39m src/ui/navigation/__tests__/area-registry.test.ts [2m ([22m[2m2 tests[22m[2m)[22m[90m 7[2mms[22m[39m
 [32m✓[39m src/ui/workspace/__tests__/screen-canon-registry.test.ts [2m ([22m[2m2 tests[22m[2m)[22m[90m 11[2mms[22m[39m
 [32m✓[39m src/ui/engineering-readiness/__tests__/EngineeringReadinessPanel.blocking.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 36[2mms[22m[39m
 [32m✓[39m src/ui/protection-coordination/__tests__/ProtectionSettingsEditor.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 65[2mms[22m[39m
 [32m✓[39m src/ui/workspace/__tests__/screen-labels-polish.test.ts [2m ([22m[2m2 tests[22m[2m)[22m[90m 29[2mms[22m[39m
 [32m✓[39m src/ui/workspace/__tests__/screen-legacy-aliases.test.ts [2m ([22m[2m2 tests[22m[2m)[22m[90m 4[2mms[22m[39m
 [32m✓[39m src/ui/notifications/__tests__/NotificationToast.test.tsx [2m ([22m[2m2 tests[22m[2m)[22m[90m 106[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/powerFlowOverlayGeometryInvariant.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 24[2mms[22m[39m
 [32m✓[39m src/ui/__tests__/activeShellTerminology.test.ts [2m ([22m[2m1 test[22m[2m)[22m[90m 6[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/DiagnosticsLegend.test.tsx [2m ([22m[2m2 tests[22m[2m)[22m[90m 44[2mms[22m[39m
 [32m✓[39m src/ui/navigation/__tests__/area-migration.test.ts [2m ([22m[2m2 tests[22m[2m)[22m[90m 3[2mms[22m[39m
 [32m✓[39m src/ui/navigation/urlState.test.ts [2m ([22m[2m1 test[22m[2m)[22m[90m 12[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/result-overlay-navigation.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 46[2mms[22m[39m
 [32m✓[39m src/ui/icons/__tests__/visual-technical-icons.spec.tsx [2m ([22m[2m1 test[22m[2m)[22m[33m 513[2mms[22m[39m
 [32m✓[39m src/ui/sld/__tests__/readinessSyncPolicy.test.ts [2m ([22m[2m3 tests[22m[2m)[22m[90m 4[2mms[22m[39m
 [32m✓[39m src/ui/common/connectionNode.test.ts [2m ([22m[2m2 tests[22m[2m)[22m[90m 3[2mms[22m[39m
 [32m✓[39m src/ui/wizard/__tests__/wizardTerminology.test.ts [2m ([22m[2m1 test[22m[2m)[22m[90m 4[2mms[22m[39m
 [32m✓[39m src/ui/protection-coordination/__tests__/TracePanel.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 42[2mms[22m[39m
 [32m✓[39m src/ui/shared/__tests__/generatorTypeLabels.test.ts [2m ([22m[2m1 test[22m[2m)[22m[90m 3[2mms[22m[39m
 [32m✓[39m src/ui/shell/__tests__/navigation-rail.a11y.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 108[2mms[22m[39m
 [32m✓[39m src/ui/layout/__tests__/index.test.ts [2m ([22m[2m1 test[22m[2m)[22m[90m 3[2mms[22m[39m
[2m Test Files [22m [1m[32m350 passed[39m[22m[90m (350)[39m
[2m      Tests [22m [1m[32m5003 passed[39m[22m[2m | [22m[33m1 skipped[39m[90m (5004)[39m
[2m   Start at [22m 23:41:16
[2m   Duration [22m 864.32s[2m (transform 10.24s, setup 86.00s, collect 83.25s, tests 31.47s, environment 513.57s, prepare 82.57s)[22m
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
[v125-perf] mini-sld mean=6.90ms median=6.55ms p95=9.18ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures full SLD pipeline and canvas mount[22m[39m
[v125-perf] full-sld mean=119.24ms median=134.99ms p95=149.93ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-06 analysis surface mount[22m[39m
[v125-perf] E-06 mean=1.41ms median=1.46ms p95=1.71ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-37 report surface mount[22m[39m
[v125-perf] E-37 mean=5.22ms median=5.33ms p95=6.42ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-28 protection coordination surface mount[22m[39m
[v125-perf] E-28 mean=9.91ms median=7.25ms p95=23.79ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-29 symmetrical components surface mount[22m[39m
[v125-perf] E-29 mean=7.38ms median=7.34ms p95=8.85ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-30 load-flow surface mount[22m[39m
[v125-perf] E-30 mean=6.68ms median=6.76ms p95=7.96ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-33 source contributions surface mount[22m[39m
[v125-perf] E-33 mean=7.56ms median=8.08ms p95=9.21ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-34 thermal dynamic surface mount[22m[39m
[v125-perf] E-34 mean=7.03ms median=7.04ms p95=8.67ms
 [32m✓[39m src/ui/workspace/__tests__/v125.performance.test.tsx [2m ([22m[2m9 tests[22m[2m)[22m[33m 2376[2mms[22m[39m
[2m Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[32m9 passed[39m[22m[90m (9)[39m
[2m   Start at [22m 23:55:42
[2m   Duration [22m 9.01s[2m (transform 2.38s, setup 253ms, collect 3.69s, tests 2.38s, environment 1.41s, prepare 220ms)[22m
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
 [32m✓[39m src/ui/sld/core/__tests__/goldenNetworkE2E.test.ts [2m ([22m[2m52 tests[22m[2m)[22m[33m 938[2mms[22m[39m
 [32m✓[39m src/ui/sld-editor/utils/topological-layout/__tests__/goldenNetworkSn.test.ts [2m ([22m[2m17 tests[22m[2m)[22m[33m 1740[2mms[22m[39m
 [32m✓[39m src/ui/__tests__/ux-golden-scenario.test.ts [2m ([22m[2m45 tests[22m[2m)[22m[90m 45[2mms[22m[39m
 [32m✓[39m src/ui/sld-editor/utils/topological-layout/__tests__/goldenFixtures.test.ts [2m ([22m[2m27 tests[22m[2m)[22m[90m 115[2mms[22m[39m
 [32m✓[39m src/ui/sld/core/__tests__/switchgearConfigGolden.test.ts [2m ([22m[2m9 tests[22m[2m)[22m[90m 43[2mms[22m[39m
 [32m✓[39m src/ui/sld/core/__tests__/sldRenderManifestGolden.test.ts [2m ([22m[2m10 tests[22m[2m)[22m[90m 50[2mms[22m[39m
[2m Test Files [22m [1m[32m6 passed[39m[22m[90m (6)[39m
[2m      Tests [22m [1m[32m160 passed[39m[22m[90m (160)[39m
[2m   Start at [22m 23:55:53
[2m   Duration [22m 17.43s[2m (transform 725ms, setup 1.49s, collect 1.02s, tests 2.93s, environment 8.61s, prepare 1.38s)[22m
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
[1A[2K[4/18] [chromium] › e2e\catalog-enforcement.spec.ts:233:3 › Catalog-First Enforcement - realny backend › formularz lacznika sekcyjnego blokuje wstawienie bez katalogu
[1A[2K[5/18] [chromium] › e2e\catalog-enforcement.spec.ts:249:3 › Catalog-First Enforcement - realny backend › przycisk domkniecia pierscienia jest nieaktywny bez kandydatow ringu
[1A[2K[6/18] [chromium] › e2e\catalog-enforcement.spec.ts:259:3 › Catalog-First Enforcement - realny backend › backend odrzuca insert_branch_pole_on_segment_sn bez katalogu
[1A[2K[7/18] [chromium] › e2e\catalog-enforcement.spec.ts:273:3 › Catalog-First Enforcement - realny backend › backend odrzuca insert_zksn_on_segment_sn bez katalogu
[1A[2K[8/18] [chromium] › e2e\catalog-enforcement.spec.ts:289:3 › Catalog-First Enforcement - realny backend › backend odrzuca insert_section_switch_sn bez katalogu
[1A[2K[9/18] [chromium] › e2e\catalog-enforcement.spec.ts:305:3 › Catalog-First Enforcement - realny backend › backend odrzuca connect_secondary_ring_sn bez katalogu
[1A[2K[10/18] [chromium] › e2e\create-first-case.spec.ts:132:1 › konfiguracja pierwszego wariantu pracy jest deterministyczna i bez freeze
[1A[2K[11/18] [chromium] › e2e\critical-run-flow.spec.ts:159:1 › krytyczny flow V1 na realnym backendzie: case -> GPZ -> trunk -> station -> branch -> katalogi -> readiness -> run -> wyniki -> SLD -> White Box -> geometria bez zmian
[1A[2K[12/18] [chromium] › e2e\happy-path.spec.ts:32:3 › UI Integration E2E Happy Path › renders canonical active case bar and mode indicator
[1A[2K[13/18] [chromium] › e2e\happy-path.spec.ts:39:3 › UI Integration E2E Happy Path › opens canonical variants helper surface z active case bar
[1A[2K[14/18] [chromium] › e2e\happy-path.spec.ts:47:3 › UI Integration E2E Happy Path › switches shell mode on canonical analytical routes
[1A[2K[15/18] [chromium] › e2e\happy-path.spec.ts:61:3 › UI Integration E2E Happy Path › persists seeded UI state in localStorage
[1A[2K[16/18] [chromium] › e2e\happy-path.spec.ts:83:3 › Context Bar Synchronization › keeps calculate action visible and mode consistent while navigating
[1A[2K[17/18] [chromium] › e2e\sld-editor-real-backend-flex.spec.ts:213:1 › real backend SLD editor flow: source -> trunk -> station -> branch -> update -> delete -> continue
[1A[2K[18/18] [chromium] › e2e\sld-editor-real-backend-flex.spec.ts:331:1 › real backend supports flexible operation order combinations
[1A[2K  18 passed (47.3s)
```

### stderr tail

```text
<empty>
```

## Performance Report

- Profile: `full`
- Measured at: `2026-04-27T21:55:51.554Z`
- Harness: `frontend/src/ui/workspace/__tests__/v125.performance.test.tsx`
- Methodology: `2` warm-up run(s) + `7` measured run(s) per target.

| Target | Kind | Mean [ms] | Median [ms] | P95 [ms] | Max [ms] | Samples [ms] |
|---|---|---:|---:|---:|---:|---|
| Mini-SLD helper surface | mount | 6.90 | 6.55 | 9.18 | 9.18 | 8.11, 7.69, 6.55, 6.10, 5.19, 9.18, 5.47 |
| Full SLD terrain pipeline + canvas | pipeline+mount | 119.24 | 134.99 | 149.93 | 149.93 | 149.93, 134.99, 142.44, 137.25, 88.51, 91.64, 89.92 |
| Nakładki wynikowe SLD | mount | 1.41 | 1.46 | 1.71 | 1.71 | 1.58, 1.57, 1.09, 1.06, 1.71, 1.37, 1.46 |
| Raporty OSD i audytowe | mount | 5.22 | 5.33 | 6.42 | 6.42 | 4.53, 3.77, 6.42, 6.25, 6.17, 5.33, 4.10 |
| Koordynacja zabezpieczeń | mount | 9.91 | 7.25 | 23.79 | 23.79 | 9.87, 7.52, 7.01, 7.25, 7.05, 23.79, 6.86 |
| Sieć zerowa i składowe symetryczne | mount | 7.38 | 7.34 | 8.85 | 8.85 | 6.44, 8.85, 6.16, 6.42, 7.34, 8.85, 7.63 |
| Rozpływ mocy | mount | 6.68 | 6.76 | 7.96 | 7.96 | 7.96, 6.06, 7.00, 6.76, 7.28, 5.78, 5.91 |
| Wkłady źródeł | mount | 7.56 | 8.08 | 9.21 | 9.21 | 5.90, 5.32, 8.78, 8.96, 6.68, 9.21, 8.08 |
| Weryfikacja cieplna i dynamiczna | mount | 7.03 | 7.04 | 8.67 | 8.67 | 7.59, 6.87, 7.15, 8.67, 6.14, 5.79, 7.04 |
