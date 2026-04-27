# Verification V12.5

- Generated at: `2026-04-25 23:43:52Z`
- Package manager: `npm`
- Total steps: `16`
- Passed: `16`
- Failed: `0`

| Step | Status | Exit code | Duration [s] |
|---|---|---:|---:|
| UI terminology guard | PASS | 0 | 2.28 |
| Docs archive guard | PASS | 0 | 0.84 |
| V12.xx canon guard | PASS | 0 | 0.95 |
| API lifecycle guard | PASS | 0 | 0.46 |
| Legacy public path guard | PASS | 0 | 0.36 |
| Severity contract guard | PASS | 0 | 0.26 |
| Import graph guard | PASS | 0 | 0.18 |
| Grep-zero guard | PASS | 0 | 0.22 |
| Frontend type-check | PASS | 0 | 66.03 |
| Frontend lint | PASS | 0 | 41.43 |
| Backend V12.5 lint (ruff) | PASS | 0 | 3.26 |
| Backend V12.5 format check (black) | PASS | 0 | 7.95 |
| Backend targeted V12.5 tests | PASS | 0 | 21.74 |
| Frontend V12.5 surface tests | PASS | 0 | 214.56 |
| Golden tests | PASS | 0 | 35.96 |
| Frontend V12.5 performance harness (quick) | PASS | 0 | 19.64 |

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
============================ 102 passed in 15.92s =============================
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
 [32m✓[39m src/ui/network-build/__tests__/converterSourceEntryPoints.test.tsx [2m ([22m[2m8 tests[22m[2m)[22m[90m 88[2mms[22m[39m
 [32m✓[39m src/ui/network-build/__tests__/cardEditActions.test.tsx [2m ([22m[2m4 tests[22m[2m)[22m[90m 65[2mms[22m[39m
 [32m✓[39m src/ui/proof/__tests__/traceCatalogContextExport.spec.tsx [2m ([22m[2m3 tests[22m[2m)[22m[90m 188[2mms[22m[39m
 [32m✓[39m src/ui/active-case-bar/__tests__/ActiveCaseBar.test.tsx [2m ([22m[2m2 tests[22m[2m)[22m[90m 155[2mms[22m[39m
 [32m✓[39m src/ui/network-build/__tests__/StartBranchForm.test.tsx [2m ([22m[2m3 tests[22m[2m)[22m[33m 400[2mms[22m[39m
 [32m✓[39m src/ui/engineering-readiness/__tests__/store.test.ts [2m ([22m[2m9 tests[22m[2m)[22m[90m 12[2mms[22m[39m
 [32m✓[39m src/ui/proof/__tests__/no-codenames.test.ts [2m ([22m[2m3 tests[22m[2m)[22m[90m 23[2mms[22m[39m
 [32m✓[39m src/ui/inspector/__tests__/InspectorPanel.test.tsx [2m ([22m[2m3 tests[22m[2m)[22m[33m 447[2mms[22m[39m
 [32m✓[39m src/ui/navigation/__tests__/routes.test.ts [2m ([22m[2m5 tests[22m[2m)[22m[90m 36[2mms[22m[39m
 [32m✓[39m src/ui/engineering-readiness/__tests__/readinessVisualState.test.ts [2m ([22m[2m8 tests[22m[2m)[22m[90m 7[2mms[22m[39m
 [32m✓[39m src/ui/protection-engine-v1/__tests__/ProtectionSettingsPage.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 151[2mms[22m[39m
 [32m✓[39m src/ui/engineering-readiness/__tests__/EngineeringReadinessPanelContainer.blocking.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 64[2mms[22m[39m
 [32m✓[39m src/ui/engineering-readiness/__tests__/fixActionRouting.test.ts [2m ([22m[2m4 tests[22m[2m)[22m[90m 13[2mms[22m[39m
 [32m✓[39m src/ui/network-build/__tests__/gpzAddSnBayFamilyFlow.test.ts [2m ([22m[2m3 tests[22m[2m)[22m[90m 31[2mms[22m[39m
 [32m✓[39m src/ui/proof/__tests__/traceExportApi.test.ts [2m ([22m[2m2 tests[22m[2m)[22m[90m 40[2mms[22m[39m
 [32m✓[39m src/ui/engineering-readiness/__tests__/readinessLivePanel.integration.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 131[2mms[22m[39m
 [32m✓[39m src/ui/network-build/__tests__/contextMenuConverterEntry.test.ts [2m ([22m[2m2 tests[22m[2m)[22m[90m 15[2mms[22m[39m
 [32m✓[39m src/ui/network-build/__tests__/networkBuildStore.routeSurfaces.test.ts [2m ([22m[2m3 tests[22m[2m)[22m[90m 10[2mms[22m[39m
 [32m✓[39m src/ui/proof/__tests__/TraceMetadataPanel.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 100[2mms[22m[39m
 [32m✓[39m src/ui/protection-diagnostics/__tests__/ProtectionDiagnosticsPanelContainer.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 94[2mms[22m[39m
 [32m✓[39m src/ui/engineering-readiness/__tests__/EngineeringReadinessPanel.blocking.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 85[2mms[22m[39m
 [32m✓[39m src/ui/protection-coordination/__tests__/ProtectionSettingsEditor.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 170[2mms[22m[39m
 [32m✓[39m src/ui/notifications/__tests__/NotificationToast.test.tsx [2m ([22m[2m2 tests[22m[2m)[22m[90m 204[2mms[22m[39m
 [32m✓[39m src/ui/navigation/urlState.test.ts [2m ([22m[2m1 test[22m[2m)[22m[90m 26[2mms[22m[39m
 [32m✓[39m src/ui/protection-coordination/__tests__/TracePanel.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[90m 80[2mms[22m[39m
 [32m✓[39m src/ui/layout/__tests__/index.test.ts [2m ([22m[2m1 test[22m[2m)[22m[90m 7[2mms[22m[39m
[2m Test Files [22m [1m[32m39 passed[39m[22m[90m (39)[39m
[2m      Tests [22m [1m[32m394 passed[39m[22m[90m (394)[39m
[2m   Start at [22m 00:39:25
[2m   Duration [22m 211.81s[2m (transform 9.47s, setup 20.23s, collect 36.49s, tests 7.25s, environment 111.63s, prepare 18.62s)[22m
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
 [32m✓[39m src/ui/sld/core/__tests__/goldenNetworkE2E.test.ts [2m ([22m[2m52 tests[22m[2m)[22m[33m 1807[2mms[22m[39m
 [32m✓[39m src/ui/sld-editor/utils/topological-layout/__tests__/goldenNetworkSn.test.ts [2m ([22m[2m17 tests[22m[2m)[22m[33m 2388[2mms[22m[39m
 [32m✓[39m src/ui/__tests__/ux-golden-scenario.test.ts [2m ([22m[2m45 tests[22m[2m)[22m[90m 86[2mms[22m[39m
 [32m✓[39m src/ui/sld-editor/utils/topological-layout/__tests__/goldenFixtures.test.ts [2m ([22m[2m27 tests[22m[2m)[22m[90m 187[2mms[22m[39m
 [32m✓[39m src/ui/sld/core/__tests__/switchgearConfigGolden.test.ts [2m ([22m[2m9 tests[22m[2m)[22m[90m 71[2mms[22m[39m
 [32m✓[39m src/ui/sld/core/__tests__/sldRenderManifestGolden.test.ts [2m ([22m[2m10 tests[22m[2m)[22m[90m 87[2mms[22m[39m
[2m Test Files [22m [1m[32m6 passed[39m[22m[90m (6)[39m
[2m      Tests [22m [1m[32m160 passed[39m[22m[90m (160)[39m
[2m   Start at [22m 00:42:59
[2m   Duration [22m 33.37s[2m (transform 1.37s, setup 2.86s, collect 2.03s, tests 4.63s, environment 17.15s, prepare 2.89s)[22m
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
[v125-perf] mini-sld mean=21.44ms median=21.92ms p95=23.26ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures full SLD pipeline and canvas mount[22m[39m
[v125-perf] full-sld mean=304.26ms median=281.61ms p95=374.52ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-06 analysis surface mount[22m[39m
[v125-perf] E-06 mean=7.70ms median=6.90ms p95=9.58ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-27 report surface mount[22m[39m
[v125-perf] E-27 mean=15.62ms median=15.50ms p95=16.65ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-28 protection coordination surface mount[22m[39m
[v125-perf] E-28 mean=18.44ms median=18.34ms p95=18.82ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-29 symmetrical components surface mount[22m[39m
[v125-perf] E-29 mean=17.41ms median=17.73ms p95=22.80ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-30 compliance surface mount[22m[39m
[v125-perf] E-30 mean=31.47ms median=32.06ms p95=32.90ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-33 thermal dynamic surface mount[22m[39m
[v125-perf] E-33 mean=30.97ms median=23.98ms p95=46.16ms
[90mstdout[2m | src/ui/workspace/__tests__/v125.performance.test.tsx[2m > [22m[2mV12.5 performance harness[2m > [22m[2mmeasures E-34 convergence surface mount[22m[39m
[v125-perf] E-34 mean=27.05ms median=29.41ms p95=30.04ms
 [32m✓[39m src/ui/workspace/__tests__/v125.performance.test.tsx [2m ([22m[2m9 tests[22m[2m)[22m[33m 3033[2mms[22m[39m
[2m Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[32m9 passed[39m[22m[90m (9)[39m
[2m   Start at [22m 00:43:35
[2m   Duration [22m 16.96s[2m (transform 4.81s, setup 548ms, collect 7.59s, tests 3.03s, environment 3.12s, prepare 509ms)[22m
```

### stderr tail

```text
<empty>
```

## Performance Report

- Profile: `quick`
- Measured at: `2026-04-25T23:43:52.499Z`
- Harness: `frontend/src/ui/workspace/__tests__/v125.performance.test.tsx`
- Methodology: `1` warm-up run(s) + `3` measured run(s) per target.

| Target | Kind | Mean [ms] | Median [ms] | P95 [ms] | Max [ms] | Samples [ms] |
|---|---|---:|---:|---:|---:|---|
| Mini-SLD helper surface | mount | 21.44 | 21.92 | 23.26 | 23.26 | 19.15, 23.26, 21.92 |
| Full SLD terrain pipeline + canvas | pipeline+mount | 304.26 | 281.61 | 374.52 | 374.52 | 281.61, 374.52, 256.65 |
| Nakladka wynikowa na schemacie | mount | 7.70 | 6.90 | 9.58 | 9.58 | 6.90, 9.58, 6.61 |
| Raporty i eksporty | mount | 15.62 | 15.50 | 16.65 | 16.65 | 14.71, 15.50, 16.65 |
| Koordynacja zabezpieczen | mount | 18.44 | 18.34 | 18.82 | 18.82 | 18.34, 18.82, 18.15 |
| Skladowe symetryczne i siec zerowa | mount | 17.41 | 17.73 | 22.80 | 22.80 | 11.72, 17.73, 22.80 |
| Wymagania przylaczeniowe i kodeks sieciowy | mount | 31.47 | 32.06 | 32.90 | 32.90 | 32.06, 29.45, 32.90 |
| Weryfikacja cieplna i dynamiczna toru pradowego | mount | 30.97 | 23.98 | 46.16 | 46.16 | 23.98, 22.76, 46.16 |
| Zbieznosc rozplywu mocy i regulacja zaczepow | mount | 27.05 | 29.41 | 30.04 | 30.04 | 30.04, 29.41, 21.68 |
