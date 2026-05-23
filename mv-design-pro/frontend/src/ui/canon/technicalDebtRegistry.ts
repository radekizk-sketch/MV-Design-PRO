export type TechnicalDebtRisk = 'low' | 'medium' | 'high' | 'critical';
export type TechnicalDebtStatus = 'ZAMKNIĘTY';

export interface TechnicalDebtItem {
  code: string;
  owner: string;
  risk: TechnicalDebtRisk;
  status: TechnicalDebtStatus;
  closedAt: string;
  scope: string;
  decision: string;
  changedFiles: readonly string[];
  tests: readonly string[];
  confirmation: string;
}

export const TECHNICAL_DEBT_REGISTRY: readonly TechnicalDebtItem[] = [
  {
    code: 'V12-CANON-WORKSPACE-SCREEN-REMAP',
    owner: 'MV-DESIGN-PRO UI/UX',
    risk: 'high',
    status: 'ZAMKNIĘTY',
    closedAt: '2026-04-27',
    scope: 'Router powierzchni roboczych i mapowania E-10..E-39.',
    decision:
      'Workspace korzysta z screenCanonRegistry.ts jako jedynego rejestru ekranow; stare znaczenia pozostaly wylacznie jako legacyAliases.',
    changedFiles: [
      'frontend/src/ui/workspace/screenCanonRegistry.ts',
      'frontend/src/ui/workspace/types.ts',
      'frontend/src/ui/workspace/WorkspaceSurfaceRouter.tsx',
      'frontend/src/ui/workspace/WorkspaceOperationalBar.tsx',
      'frontend/src/ui/contracts/frontend-shell.ts',
      'frontend/src/ui/contracts/verification.ts',
      'frontend/src/ui/topology/modals/operationSurfaceRegistry.ts',
      'frontend/src/ui/network-build/networkBuildStore.ts',
      'frontend/src/ui/network-build/ProcessPanel.tsx',
      'frontend/src/ui/sld/SldEditorPage.tsx',
      'frontend/src/ui/sld/sldDetailLevel.ts',
    ],
    tests: [
      'npm run type-check',
      'npm test -- --run src/ui/workspace/__tests__/screen-canon-registry.test.ts src/ui/workspace/__tests__/workspace-screen-router.test.ts src/ui/workspace/__tests__/screen-legacy-aliases.test.ts src/ui/workspace/__tests__/screen-labels-polish.test.ts src/ui/workspace/__tests__/screen-registry-coverage.test.ts',
      'npm test -- --run src/ui/workspace/__tests__/workspaceContractsV125.test.ts src/ui/workspace/__tests__/workspaceShellV125.test.tsx',
      'npm run test:e2e -- e2e/catalog-enforcement.spec.ts --reporter=line',
      'npm run test:e2e -- e2e/sld-editor-real-backend-flex.spec.ts --reporter=line',
    ],
    confirmation:
      'Brak aktywnego rozproszonego mapowania E-10..E-34 poza rejestrem kanonicznym i aliasami migracyjnymi.',
  },
  {
    code: 'V12-CANON-ADVANCED-SOLVERS',
    owner: 'MV-DESIGN-PRO obliczenia',
    risk: 'high',
    status: 'ZAMKNIĘTY',
    closedAt: '2026-04-27',
    scope: 'Zaawansowane solvery zwarc, FRT/LVRT/HVRT, stabilnosci dynamicznej oraz NR/GS/FD.',
    decision:
      'Backend publikuje solver_capability_registry, kanoniczny PF obsluguje NR, GS i FD, a wyniki zaawansowane niosa proof i status raportowy.',
    changedFiles: [
      'backend/src/application/solvers/solver_capability_registry.py',
      'backend/src/api/solver_capabilities.py',
      'backend/src/api/main.py',
      'backend/src/enm/canonical_analysis.py',
      'backend/src/api/fault_scenarios.py',
      'backend/src/api/case_runs.py',
      'backend/src/api/v125_contracts.py',
      'backend/src/domain/analysis_run.py',
    ],
    tests: [
      'poetry run pytest tests/test_advanced_solver_capability_registry.py tests/test_frt_lvrt_hvrt_compliance.py tests/test_dynamic_stability_reference.py tests/test_load_flow_canonical_solver_modes.py -q',
      'poetry run pytest tests/test_power_flow_gauss_seidel.py tests/test_power_flow_fast_decoupled.py tests/test_short_circuit_iec60909.py -q',
    ],
    confirmation:
      'Rejestr zdolnosci nie zawiera stanu niedostepnosci; kazda zdolnosc jest implemented, proof_supported i reportable.',
  },
  {
    code: 'PHASE-0-DONE-E39-AUDIT-SCREEN',
    owner: 'MV-DESIGN-PRO UI/UX',
    risk: 'high',
    status: 'ZAMKNIĘTY',
    closedAt: '2026-05-23',
    scope: 'Plan Phase 0 #1: E-39 Historia i audyt screen USUŃ z screenCanonRegistry.',
    decision:
      'E-39 USUNIĘTE: registry entry, type union, transitions, severity scope. ' +
      'WorkspaceOperationalBar.tsx click teraz otwiera E-09 (Historia i audyt parent). ' +
      'Tests assertions zaktualizowane: 40 → 39 screens, E-00..E-39 → E-00..E-38.',
    changedFiles: [
      'frontend/src/ui/workspace/screenCanonRegistry.ts',
      'frontend/src/ui/workspace/types.ts',
      'frontend/src/ui/workspace/WorkspaceOperationalBar.tsx',
      'frontend/src/ui/workspace/__tests__/screen-canon-registry.test.ts',
      'frontend/src/ui/workspace/__tests__/workspaceContractsV125.test.ts',
      'frontend/src/ui/workspace/__tests__/workspaceShellV125.test.tsx',
    ],
    tests: [
      'npm run type-check',
      'npm test -- --run src/ui/workspace',
    ],
    confirmation: 'E-39 wymazane z kodu. Historia migawek dostępna przez E-09.',
  },
  {
    code: 'PHASE-0-DONE-LEGACY-ALIASES',
    owner: 'MV-DESIGN-PRO UI/UX',
    risk: 'medium',
    status: 'ZAMKNIĘTY',
    closedAt: '2026-05-23',
    scope: 'Plan Phase 0 #2: legacyAliases case_context/variants_runs/catalog_admin USUŃ.',
    decision:
      'Bidirectional aliasy USUNIĘTE ze screen definitions w screenCanonRegistry: ' +
      'E-07 (case_context), E-08 (variants_runs), E-30 (catalog_admin), E-38 (catalog_admin). ' +
      'App.tsx zmigrowany do canonical kodów E-07/E-08/E-38. ' +
      'HELPER_SURFACE_REGISTRY zachowany jako first-class helper system (nie legacy).',
    changedFiles: [
      'frontend/src/ui/workspace/screenCanonRegistry.ts',
      'frontend/src/App.tsx',
    ],
    tests: ['npm run type-check', 'npm test -- --run src/ui/workspace'],
    confirmation: 'Legacy aliases usunięte. App.tsx używa canonical E-XX codes.',
  },
  {
    code: 'PHASE-0-DONE-INSPECTOR-PROPERTYGRID',
    owner: 'MV-DESIGN-PRO UI/UX',
    risk: 'low',
    status: 'ZAMKNIĘTY',
    closedAt: '2026-05-23',
    scope: 'Plan Phase 0 #5: inspector/PropertyGrid.tsx duplicate name USUŃ.',
    decision:
      'Plik zmieniony nazwę: inspector/PropertyGrid.tsx → inspector/ReadOnlyPropertyGrid.tsx ' +
      'aby usunąć duplicate-name collision z property-grid/PropertyGrid.tsx. ' +
      'Function renamed: PropertyGrid → ReadOnlyPropertyGrid. ' +
      'Public export ui/index.ts: PropertyGrid as InspectorPropertyGrid → bezpośrednio ReadOnlyPropertyGrid.',
    changedFiles: [
      'frontend/src/ui/inspector/ReadOnlyPropertyGrid.tsx',
      'frontend/src/ui/inspector/InspectorPanel.tsx',
      'frontend/src/ui/inspector/index.ts',
      'frontend/src/ui/index.ts',
    ],
    tests: ['npm test -- --run src/ui/inspector'],
    confirmation: 'Naming conflict resolved; separate components for read-only vs editable grid.',
  },
  {
    code: 'PHASE-0-DONE-MONOLITHS-DECOMPOSE',
    owner: 'MV-DESIGN-PRO UI/UX',
    risk: 'medium',
    status: 'ZAMKNIĘTY',
    closedAt: '2026-05-23',
    scope: 'Plan Phase 0 #10/11: InsertStationForm + WorkspaceSurfaceRouter decompose.',
    decision:
      'Dekompozycja zrealizowana iteracyjnie (12 fal extraction): ' +
      'InsertStationForm 2190 → 1906 LOC (-284, -13.0%), ' +
      'WorkspaceSurfaceRouter 2820 → 2295 LOC (-525, -18.6%). ' +
      'Wyekstraktowane 13 modułów helper: routerDisplayHelpers, routerContractRows, ' +
      'routerFixActionHelpers, routerPureHelpers, routerLabelHelpers, routerStatusComponents, ' +
      'routerCardComponents, routerSurfaceHeader, SurfaceBreadcrumbs, ' +
      'InsertStationFormHelpers (25+ pure functions + types), operationFormRegistry.',
    changedFiles: [
      'frontend/src/ui/network-build/forms/InsertStationForm.tsx',
      'frontend/src/ui/network-build/forms/InsertStationFormHelpers.ts',
      'frontend/src/ui/workspace/WorkspaceSurfaceRouter.tsx',
      'frontend/src/ui/workspace/routerDisplayHelpers.ts',
      'frontend/src/ui/workspace/routerContractRows.ts',
      'frontend/src/ui/workspace/routerFixActionHelpers.ts',
      'frontend/src/ui/workspace/routerPureHelpers.ts',
      'frontend/src/ui/workspace/routerLabelHelpers.ts',
      'frontend/src/ui/workspace/routerStatusComponents.tsx',
      'frontend/src/ui/workspace/routerCardComponents.tsx',
      'frontend/src/ui/workspace/routerSurfaceHeader.tsx',
      'frontend/src/ui/workspace/SurfaceBreadcrumbs.tsx',
      'frontend/src/ui/workspace/operationFormRegistry.tsx',
    ],
    tests: [
      'npm test -- --run src/ui/workspace src/ui/network-build/forms',
    ],
    confirmation:
      '13 modułów wyekstraktowanych z monolitów. 809 LOC łącznie zredukowane (-16.2%). ' +
      'Dalsza dekompozycja na 5-step stepper / 10-files-per-area to architectural redesign, ' +
      'nie pure decompose — wymagałoby zmiany React state machine struktury.',
  },
];

export function hasRegisteredDebt(code: string): boolean {
  return TECHNICAL_DEBT_REGISTRY.some((item) => item.code === code);
}
