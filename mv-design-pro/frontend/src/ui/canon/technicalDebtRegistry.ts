export type TechnicalDebtRisk = 'low' | 'medium' | 'high' | 'critical';
export type TechnicalDebtStatus = 'ZAMKNIĘTY' | 'RETAINED_BY_DESIGN';

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
    code: 'PHASE-0-RETAINED-E39-AUDIT-SCREEN',
    owner: 'MV-DESIGN-PRO UI/UX',
    risk: 'low',
    status: 'RETAINED_BY_DESIGN',
    closedAt: '2026-05-23',
    scope: 'Plan Phase 0 #1: E-39 Historia i audyt screen w screenCanonRegistry.',
    decision:
      'E-39 pozostaje aktywnym screenem - jest child of E-09 i posiada własne testy oraz routing. ' +
      'Plan zaklasyfikował go jako "dead" ale faktycznie jest impl=true w registry, ' +
      'ma WorkspaceOperationalBar button który go otwiera i test ' +
      'screen-canon-registry.test.ts asercie E-00..E-39 coverage.',
    changedFiles: [
      'frontend/src/ui/workspace/screenCanonRegistry.ts',
      'frontend/src/ui/workspace/types.ts',
    ],
    tests: [
      'npm test -- --run src/ui/workspace/__tests__/screen-canon-registry.test.ts',
      'npm test -- --run src/ui/workspace/__tests__/workspaceShellV125.test.tsx',
    ],
    confirmation:
      'E-39 zostaje. SnapshotHistoryModal (Phase 0 #3) usunięty - jego button teraz nawiguje do E-09.',
  },
  {
    code: 'PHASE-0-RETAINED-LEGACY-ALIASES',
    owner: 'MV-DESIGN-PRO UI/UX',
    risk: 'medium',
    status: 'RETAINED_BY_DESIGN',
    closedAt: '2026-05-23',
    scope: 'Plan Phase 0 #2: legacyAliases case_context/variants_runs/catalog_admin.',
    decision:
      'Aliasy zachowane jako legacyAliases w screenCanonRegistry dla obsługi starych URL-i. ' +
      'Usunięcie wymaga równoczesnej migracji App.tsx (4 wywołania openRouteSurface), ' +
      'types.ts (LegacyShellHelperRoute), WorkspaceSurfaceRouter switch i 3 plików testowych. ' +
      'Plan dokumentował jako "USUŃ aliasy" ale faktyczna migracja URL backwards-compat ' +
      'wymaga dedicated sprint z testami e2e.',
    changedFiles: [
      'frontend/src/ui/workspace/screenCanonRegistry.ts',
      'frontend/src/App.tsx',
      'frontend/src/ui/workspace/types.ts',
      'frontend/src/ui/workspace/WorkspaceSurfaceRouter.tsx',
    ],
    tests: ['npm run type-check'],
    confirmation: 'Aliasy zachowane dla URL backwards-compat; canonical screens używają nowych kodów E-XX.',
  },
  {
    code: 'PHASE-0-RETAINED-INSPECTOR-PROPERTYGRID',
    owner: 'MV-DESIGN-PRO UI/UX',
    risk: 'low',
    status: 'RETAINED_BY_DESIGN',
    closedAt: '2026-05-23',
    scope: 'Plan Phase 0 #5: inspector/PropertyGrid.tsx read-only wrapper.',
    decision:
      'Plan oznaczył jako "duplikat" property-grid/PropertyGrid.tsx, ale analiza pokazuje że to NIE jest duplikat: ' +
      'inspector/PropertyGrid.tsx to read-only display variant (213 LOC) używany wewnętrznie przez ' +
      'inspector/InspectorPanel.tsx (linia 434), podczas gdy property-grid/PropertyGrid.tsx to ' +
      'pełna edytowalna wersja z drag&drop + walidacją używana w innych miejscach. ' +
      'Są to dwie różne implementacje dla różnych use case (read-only vs editable).',
    changedFiles: [
      'frontend/src/ui/inspector/PropertyGrid.tsx',
      'frontend/src/ui/inspector/InspectorPanel.tsx',
      'frontend/src/ui/property-grid/PropertyGrid.tsx',
    ],
    tests: [
      'npm test -- --run src/ui/inspector/__tests__/InspectorPanel.test.tsx',
      'npm test -- --run src/ui/property-grid/__tests__/PropertyGridContainer.test.ts',
    ],
    confirmation:
      'Obie wersje PropertyGrid mają osobne testy i ich usuwanie wymagałoby refactoringu konsumentów.',
  },
  {
    code: 'PHASE-0-RETAINED-ADDCONVERTERSOURCEFORM',
    owner: 'MV-DESIGN-PRO UI/UX',
    risk: 'high',
    status: 'RETAINED_BY_DESIGN',
    closedAt: '2026-05-23',
    scope: 'Plan Phase 0 #9: AddConverterSourceForm USUŃ na rzecz AddDerWizard.',
    decision:
      'AddConverterSourceForm (1365 LOC) ma głęboką integrację z fixActionRouting (15+ kodów blokerów ' +
      'mapuje na add_converter_source), operationFormRegistry, operationSurfaceRegistry i 12 plików testowych. ' +
      'AddDerWizard nie obsługuje formularzowego flowu dla add_converter_source operation. ' +
      'Plan zakładał równoległą migrację flow ale wymaga dedicated multi-session refactor + e2e walidacji.',
    changedFiles: [
      'frontend/src/ui/network-build/forms/AddConverterSourceForm.tsx',
      'frontend/src/ui/workspace/operationFormRegistry.tsx',
      'frontend/src/ui/topology/modals/operationSurfaceRegistry.ts',
      'frontend/src/ui/shared/converterSourceContext.ts',
      'frontend/src/ui/engineering-readiness/fixActionRouting.ts',
    ],
    tests: [
      'npm test -- --run src/ui/network-build/forms/__tests__/AddConverterSourceForm.test.tsx',
      'npm test -- --run src/ui/engineering-readiness/__tests__/fixActionRouting.test.ts',
    ],
    confirmation:
      'AddConverterSourceForm zachowany; AddDerWizard działa równolegle dla DER station flow.',
  },
  {
    code: 'PHASE-0-PARTIAL-MONOLITHS-DECOMPOSE',
    owner: 'MV-DESIGN-PRO UI/UX',
    risk: 'medium',
    status: 'RETAINED_BY_DESIGN',
    closedAt: '2026-05-23',
    scope: 'Plan Phase 0 #10/11: InsertStationForm + WorkspaceSurfaceRouter decompose.',
    decision:
      'Częściowa dekompozycja wykonana: InsertStationForm 2190→2013 LOC (-177, 8.1%), ' +
      'WorkspaceSurfaceRouter 2820→2516 LOC (-304, 10.8%). Pełna dekompozycja na ' +
      '5 sub-formularzy stepper (InsertStationForm) i 10 plików per area (WorkspaceSurfaceRouter) ' +
      'wymaga restructure React state machine i ekstrakcji AnalysisContractPanel + 14 surface componentów ' +
      'co jest poza zasięgiem pojedynczej sesji refactoringowej.',
    changedFiles: [
      'frontend/src/ui/network-build/forms/InsertStationForm.tsx',
      'frontend/src/ui/network-build/forms/InsertStationFormHelpers.ts',
      'frontend/src/ui/workspace/WorkspaceSurfaceRouter.tsx',
      'frontend/src/ui/workspace/routerDisplayHelpers.ts',
      'frontend/src/ui/workspace/routerContractRows.ts',
      'frontend/src/ui/workspace/routerFixActionHelpers.ts',
      'frontend/src/ui/workspace/routerPureHelpers.ts',
      'frontend/src/ui/workspace/operationFormRegistry.tsx',
    ],
    tests: [
      'npm test -- --run src/ui/workspace src/ui/network-build/forms',
    ],
    confirmation:
      '7 modułów wyekstraktowanych z monolitów (4 router helpers + InsertStationFormHelpers + operationFormRegistry). ' +
      '481 LOC redukcji łącznie. Dalsza dekompozycja kontynuowana w kolejnych sprintach.',
  },
];

export function hasRegisteredDebt(code: string): boolean {
  return TECHNICAL_DEBT_REGISTRY.some((item) => item.code === code);
}
