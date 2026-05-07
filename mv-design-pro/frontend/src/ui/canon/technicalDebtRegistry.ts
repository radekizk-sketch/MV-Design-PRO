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
      'frontend/src/ui/sld/v2/canvas/SldWorkspaceContainer.tsx',
      'frontend/src/ui/sld/v2/command/SldCommandService.ts',
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
];

export function hasRegisteredDebt(code: string): boolean {
  return TECHNICAL_DEBT_REGISTRY.some((item) => item.code === code);
}
