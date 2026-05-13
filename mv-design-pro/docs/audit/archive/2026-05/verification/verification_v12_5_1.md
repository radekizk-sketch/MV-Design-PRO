# Verification V12.5.1

- Generated at: `2026-04-29 06:12:39Z`
- Package manager: `npm`
- Total steps: `16`
- Passed: `16`
- Failed: `0`

| Step | Status | Exit code | Duration [s] |
|---|---|---:|---:|
| UI terminology guard | PASS | 0 | 1.33 |
| Docs archive guard | PASS | 0 | 0.38 |
| V12.xx canon guard | PASS | 0 | 0.62 |
| API lifecycle guard | PASS | 0 | 0.31 |
| Legacy public path guard | PASS | 0 | 0.20 |
| Severity contract guard | PASS | 0 | 0.11 |
| Import graph guard | PASS | 0 | 0.08 |
| Grep-zero guard | PASS | 0 | 0.10 |
| Frontend type-check | PASS | 0 | 21.03 |
| Frontend lint | PASS | 0 | 14.45 |
| Backend V12.5 lint (ruff) | PASS | 0 | 1.84 |
| Backend V12.5 format check (black) | PASS | 0 | 2.83 |
| Backend targeted V12.5 tests | PASS | 0 | 9.27 |
| Frontend V12.5 surface tests | PASS | 0 | 84.88 |
| Golden tests | PASS | 0 | 13.92 |
| Frontend V12.5 performance harness (quick) | PASS | 0 | 7.16 |

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
============================= 102 passed in 7.01s =============================
```

### stderr tail

```text
<empty>
```

## Frontend V12.5 surface tests

- CWD: `C:\Users\radek\Documents\GitHub\MV-Design-PRO\mv-design-pro\frontend`
- Command: `npm run test -- --run src/ui/layout/__tests__/index.test.ts src/ui/navigation/__tests__/routes.test.ts src/ui/navigation/urlState.test.ts src/__tests__/App.routes.test.tsx src/ui/workspace/__tests__/workspaceShellV125.test.tsx src/ui/network-build/__tests__/networkBuildStore.test.ts src/ui/network-build/__tests__/gpzAddSnBayFamilyFlow.test.ts src/ui/network-build/__tests__/networkBuildStore.routeSurfaces.test.ts src/ui/context-menu/__tests__/catalogGate.test.ts src/ui/protection-results/__tests__/ProtectionResultsInspectorPage.test.tsx src/ui/network-build/__tests__/contextMenuConverterEntry.test.ts src/ui/network-build/__tests__/converterSourceEntryPoints.test.tsx src/ui/network-build/__tests__/cardEditActions.test.tsx src/ui/network-build/__tests__/StartBranchForm.test.tsx src/ui/protection-diagnostics/__tests__/ProtectionDiagnosticsPanelContainer.test.tsx src/ui/protection-coordination/__tests__/ProtectionSettingsEditor.test.tsx src/ui/protection-coordination/__tests__/TracePanel.test.tsx src/ui/protection-engine-v1/__tests__/ProtectionSettingsPage.test.tsx src/ui/engineering-readiness/__tests__ src/ui/active-case-bar/__tests__ src/ui/notifications/__tests__ src/ui/proof/__tests__ src/ui/inspector/__tests__`
- Status: `PASS`

### stdout tail

```text
 [32m✓[39m src/ui/network-build/__tests__/cardEditActions.test.tsx [2m ([22m[2m4 tests[22m[2m)[22m[90m 31[2mms[22m[39m
 [32m✓[39m src/ui/proof/__tests__/traceCatalogContextExport.spec.tsx [2m ([22m[2m3 tests[22m[2m)[22m[90m 60[2mms[22m[39m
 [32m✓[39m src/ui/active-case-bar/__tests__/ActiveCaseBar.test.tsx [2m ([22m[2m2 tests[22m[2m)[22m[90m 53[2mms[22m[39m
 [32m✓[39m src/ui/network-build/__tests__/StartBranchForm.test.tsx [2m ([22m[2m3 tests[22m[2m)[22m[90m 190[2mms[22m[39m
 [32m✓[39m src/ui/engineering-readiness/__tests__/store.test.ts [2m ([22m[2m9 tests[22m[2m)[22m[90m 5[2mms[22m[39m
 [32m✓[39m src/ui/inspector/__tests__/valueProvenance.test.tsx [2m ([22m[2m9 tests[22m[2m)[22m[90m 127[2mms[22m[39m
 [32m✓[39m src/ui/proof/__tests__/no-codenames.test.ts [2m ([22m[2m3 tests[22m[2m)[22m[90m 9[2mms[22m[39m
 [32m✓[39m src/ui/inspector/__tests__/InspectorPanel.test.tsx [2m ([22m[2m3 tests[22m[2m)[22m[90m 131[2mms[22m[39m
 [32m✓[39m src/ui/navigation/__tests__/routes.test.ts [2m ([22m[2m5 tests[22m[2m)[22m[90m 10[2mms[22m[39m
 [32m✓[39m src/ui/engineering-readiness/__tests__/readinessVisualState.test.ts [2m ([22m[2m8 tests[22m[2m)[22m[90m 3[2mms[22m[39m
 [32m✓[39m src/ui/protection-engine-v1/__tests__/ProtectionSettingsPage.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 35[2mms[22m[39m
 [32m✓[39m src/ui/engineering-readiness/__tests__/EngineeringReadinessPanelContainer.blocking.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 26[2mms[22m[39m
 [32m✓[39m src/ui/network-build/__tests__/gpzAddSnBayFamilyFlow.test.ts [2m ([22m[2m3 tests[22m[2m)[22m[90m 5[2mms[22m[39m
 [32m✓[39m src/ui/engineering-readiness/__tests__/fixActionRouting.test.ts [2m ([22m[2m4 tests[22m[2m)[22m[90m 3[2mms[22m[39m
 [32m✓[39m src/ui/proof/__tests__/traceExportApi.test.ts [2m ([22m[2m2 tests[22m[2m)[22m[90m 13[2mms[22m[39m
 [32m✓[39m src/ui/engineering-readiness/__tests__/readinessLivePanel.integration.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 45[2mms[22m[39m
 [32m✓[39m src/ui/network-build/__tests__/contextMenuConverterEntry.test.ts [2m ([22m[2m2 tests[22m[2m)[22m[90m 9[2mms[22m[39m
 [32m✓[39m src/ui/network-build/__tests__/networkBuildStore.routeSurfaces.test.ts [2m ([22m[2m3 tests[22m[2m)[22m[90m 4[2mms[22m[39m
 [32m✓[39m src/ui/proof/__tests__/TraceMetadataPanel.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 37[2mms[22m[39m
 [32m✓[39m src/ui/protection-diagnostics/__tests__/ProtectionDiagnosticsPanelContainer.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 31[2mms[22m[39m
 [32m✓[39m src/ui/engineering-readiness/__tests__/EngineeringReadinessPanel.blocking.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 27[2mms[22m[39m
 [32m✓[39m src/ui/protection-coordination/__tests__/ProtectionSettingsEditor.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 57[2mms[22m[39m
 [32m✓[39m src/ui/notifications/__tests__/NotificationToast.test.tsx [2m ([22m[2m2 tests[22m[2m)[22m[90m 77[2mms[22m[39m
 [32m✓[39m src/ui/navigation/urlState.test.ts [2m ([22m[2m1 test[22m[2m)[22m[90m 11[2mms[22m[39m
 [32m✓[39m src/ui/protection-coordination/__tests__/TracePanel.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 32[2mms[22m[39m
 [32m✓[39m src/ui/layout/__tests__/index.test.ts [2m ([22m[2m1 test[22m[2m)[22m[90m 2[2mms[22m[39m
[2m Test Files [22m [1m[32m40 passed[39m[22m[90m (40)[39m
[2m      Tests [22m [1m[32m406 passed[39m[22m[90m (406)[39m
[2m   Start at [22m 08:10:54
[2m   Duration [22m 83.63s[2m (transform 4.47s, setup 7.41s, collect 15.50s, tests 3.07s, environment 43.82s, prepare 6.89s)[22m
```

### stderr tail

```text
[90mstderr[2m | src/ui/proof/__tests__/TraceViewer.test.tsx[2m > [22m[2mTraceStepView[2m > [22m[2mrenders step title and number[22m[39m
LaTeX-incompatible input and strict mode is set to 'warn': Unrecognized Unicode character "√" (8730) [unknownSymbol]
[90mstderr[2m | src/ui/proof/__tests__/TraceViewer.test.tsx[2m > [22m[2mTraceStepView[2m > [22m[2mrenders formula section[22m[39m
LaTeX-incompatible input and strict mode is set to 'warn': Unrecognized Unicode character "√" (8730) [unknownSymbol]
[90mstderr[2m | src/ui/proof/__tests__/TraceViewer.test.tsx[2m > [22m[2mTraceStepView[2m > [22m[2mrenders inputs table with Polish labels[22m[39m
LaTeX-incompatible input and strict mode is set to 'warn': Unrecognized Unicode character "√" (8730) [unknownSymbol]
[90mstderr[2m | src/ui/proof/__tests__/TraceViewer.test.tsx[2m > [22m[2mTraceStepView[2m > [22m[2mrenders result table[22m[39m
LaTeX-incompatible input and strict mode is set to 'warn': Unrecognized Unicode character "√" (8730) [unknownSymbol]
[90mstderr[2m | src/ui/proof/__tests__/TraceViewer.test.tsx[2m > [22m[2mTraceStepView[2m > [22m[2mrenders notes section[22m[39m
LaTeX-incompatible input and strict mode is set to 'warn': Unrecognized Unicode character "√" (8730) [unknownSymbol]
[90mstderr[2m | src/ui/proof/__tests__/TraceViewer.test.tsx[2m > [22m[2mTraceStepView[2m > [22m[2mrenders phase badge[22m[39m
LaTeX-incompatible input and strict mode is set to 'warn': Unrecognized Unicode character "√" (8730) [unknownSymbol]
[90mstderr[2m | src/ui/proof/__tests__/TraceViewer.test.tsx[2m > [22m[2mTraceViewer Export Buttons[2m > [22m[2mshows deep link button when step is selected[22m[39m
LaTeX-incompatible input and strict mode is set to 'warn': Unrecognized Unicode character "√" (8730) [unknownSymbol]
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
 [32m✓[39m src/ui/sld/core/__tests__/goldenNetworkE2E.test.ts [2m ([22m[2m52 tests[22m[2m)[22m[33m 635[2mms[22m[39m
 [32m✓[39m src/ui/sld-editor/utils/topological-layout/__tests__/goldenNetworkSn.test.ts [2m ([22m[2m17 tests[22m[2m)[22m[33m 1421[2mms[22m[39m
 [32m✓[39m src/ui/__tests__/ux-golden-scenario.test.ts [2m ([22m[2m45 tests[22m[2m)[22m[90m 34[2mms[22m[39m
 [32m✓[39m src/ui/sld-editor/utils/topological-layout/__tests__/goldenFixtures.test.ts [2m ([22m[2m27 tests[22m[2m)[22m[90m 90[2mms[22m[39m
 [32m✓[39m src/ui/sld/core/__tests__/switchgearConfigGolden.test.ts [2m ([22m[2m9 tests[22m[2m)[22m[90m 30[2mms[22m[39m
 [32m✓[39m src/ui/sld/core/__tests__/sldRenderManifestGolden.test.ts [2m ([22m[2m10 tests[22m[2m)[22m[90m 32[2mms[22m[39m
[2m Test Files [22m [1m[32m6 passed[39m[22m[90m (6)[39m
[2m      Tests [22m [1m[32m160 passed[39m[22m[90m (160)[39m
[2m   Start at [22m 08:12:19
[2m   Duration [22m 12.81s[2m (transform 535ms, setup 1.05s, collect 747ms, tests 2.24s, environment 6.17s, prepare 991ms)[22m
```

### stderr tail

```text
<empty>
```

## Frontend V12.5 performance harness (quick)

- CWD: `C:\Users\radek\Documents\GitHub\MV-Design-PRO\mv-design-pro\frontend`
- Command: `npm run test -- --run src/ui/workspace/__tests__/v125.performance.test.tsx`
- Environment: `V125_PERF_PROFILE=quick, V125_PERF_OUTPUT=C:\Users\radek\AppData\Local\Temp\mv_design_pro_v125_perf_quick.json`
- Status: `PASS`

### stdout tail

```text
> mv-design-pro-frontend@0.1.0 test
> vitest run --no-file-parallelism --run src/ui/workspace/__tests__/v125.performance.test.tsx
[7m[1m[36m RUN [39m[22m[27m [36mv1.6.1[39m [90mC:/Users/radek/Documents/GitHub/MV-Design-PRO/mv-design-pro/frontend[39m
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures mini-SLD helper surface mount[22m[39m
[v125-perf] mini-sld mean=6.34ms median=6.49ms p95=6.80ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures full SLD pipeline and canvas mount[22m[39m
[v125-perf] full-sld mean=114.40ms median=109.99ms p95=123.24ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-06 analysis surface mount[22m[39m
[v125-perf] E-06 mean=0.96ms median=0.97ms p95=1.02ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-37 report surface mount[22m[39m
[v125-perf] E-37 mean=3.77ms median=3.77ms p95=4.15ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-28 protection coordination surface mount[22m[39m
[v125-perf] E-28 mean=4.77ms median=4.82ms p95=5.00ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-29 symmetrical components surface mount[22m[39m
[v125-perf] E-29 mean=4.25ms median=4.23ms p95=4.35ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-30 load-flow surface mount[22m[39m
[v125-perf] E-30 mean=7.82ms median=4.70ms p95=14.57ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-33 source contributions surface mount[22m[39m
[v125-perf] E-33 mean=4.12ms median=4.12ms p95=4.17ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-34 thermal dynamic surface mount[22m[39m
[v125-perf] E-34 mean=4.10ms median=4.09ms p95=4.25ms
 [32m✓[39m src/ui/workspace/__tests__/v125.performance.test.tsx [2m ([22m[2m9 tests[22m[2m)[22m[33m 989[2mms[22m[39m
[2m Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[32m9 passed[39m[22m[90m (9)[39m
[2m   Start at [22m 08:12:33
[2m   Duration [22m 6.10s[2m (transform 1.98s, setup 178ms, collect 2.97s, tests 989ms, environment 1.06s, prepare 167ms)[22m
```

### stderr tail

```text
<empty>
```

## Performance Report

- Profile: `quick`
- Measured at: `2026-04-29T06:12:39.571Z`
- Harness: `frontend/src/ui/workspace/__tests__/v125.performance.test.tsx`
- Methodology: `1` warm-up run(s) + `3` measured run(s) per target.

| Target | Kind | Mean [ms] | Median [ms] | P95 [ms] | Max [ms] | Samples [ms] |
|---|---|---:|---:|---:|---:|---|
| Mini-SLD helper surface | mount | 6.34 | 6.49 | 6.80 | 6.80 | 6.49, 6.80, 5.73 |
| Full SLD terrain pipeline + canvas | pipeline+mount | 114.40 | 109.99 | 123.24 | 123.24 | 123.24, 109.99, 109.97 |
| Nakładki wynikowe SLD | mount | 0.96 | 0.97 | 1.02 | 1.02 | 0.97, 1.02, 0.87 |
| Raporty OSD i audytowe | mount | 3.77 | 3.77 | 4.15 | 4.15 | 4.15, 3.77, 3.39 |
| Koordynacja zabezpieczeń | mount | 4.77 | 4.82 | 5.00 | 5.00 | 5.00, 4.82, 4.51 |
| Sieć zerowa i składowe symetryczne | mount | 4.25 | 4.23 | 4.35 | 4.35 | 4.35, 4.17, 4.23 |
| Rozpływ mocy | mount | 7.82 | 4.70 | 14.57 | 14.57 | 14.57, 4.70, 4.20 |
| Wkłady źródeł | mount | 4.12 | 4.12 | 4.17 | 4.17 | 4.17, 4.12, 4.06 |
| Weryfikacja cieplna i dynamiczna | mount | 4.10 | 4.09 | 4.25 | 4.25 | 4.25, 4.09, 3.95 |
