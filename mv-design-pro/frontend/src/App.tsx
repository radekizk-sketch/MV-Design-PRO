/**
 * App Root — CANONICAL_LAYOUT + UI_INTEGRATION_E2E + V12.5
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md: Layout narzędziowy ZAWSZE renderowany
 * - wizard_screens.md Â§ 1.3: Active case bar (always visible)
 * - UI_CORE_ARCHITECTURE.md Â§ 4.1: Navigation structure
 *
 * CANONICAL RULE:
 * > Layout narzędziowy ZAWSZE jest renderowany.
 * > Brak danych = komunikat w obszarze roboczym, a NIE brak UI.
 *
 * Main application entry with:
 * - CanonicalLayout with one active workspace, one inspector and one status bar
 * - Hash-based routing with Polish labels
 * - Mode-aware page rendering
 * - Empty state overlays (NOT empty screens)
 *
 * Routes (Polish):
 * - "" / "#sld" → Schemat jednokreskowy (SLD Editor)
 * - "#sld-view" → Podglad schematu (SLD Read-Only Viewer)
 * - "#analysis" → Poziom analityczny (E-24)
 * - "#report" → Generator raportu (E-25)
 * - "#variants" / "#catalog" / "#case-config" → Helpery shell-a
 * - "#results" / "#proof" / "#protection-results" / "#power-flow-results" / "#compare"
 *   → aliasy prowadzące do E-24
 */

import { useEffect, useState, useCallback, useMemo } from 'react';

import { EnmInspectorPage } from './ui/enm-inspector';
import { FaultScenariosPanel, FaultScenarioModal } from './ui/fault-scenarios';
import { CanonicalLayout } from './ui/layout';
import { SldWorkspaceContainer } from './ui/sld/v2/canvas/SldWorkspaceContainer';
import { ProjectDashboardSurface } from './ui/workspace/surfaces/ProjectDashboardSurface';
import { useAppStateStore } from './ui/app-state';
import { useSnapshotStore } from './ui/topology/snapshotStore';
import { useExecutionRunsStore } from './ui/study-cases/runStore';
import type { ExecutionAnalysisType } from './ui/study-cases/types';
import {
  ROUTES,
  getCurrentHashRoute,
  getCurrentSearchParams,
  getRouteByHash,
  isAnalysisRouteAlias,
  navigateToAnalysis,
  navigateToCaseConfig,
  navigateToCatalog,
  navigateToCompare,
  navigateToNetworkBuild,
  navigateToProof,
  navigateToReport,
  navigateToResults,
  navigateToResultsProtection,
  navigateToSwitchgear,
  navigateToVariants,
  resolveAnalysisRouteAliasTab,
  useUrlSelectionSync,
} from './ui/navigation';
import { NotificationToast } from './ui/notifications/NotificationToast';
import { notify } from './ui/notifications/store';
import { useNetworkStats } from './ui/topology/useNetworkStats';
import { useNetworkBuildStore } from './ui/network-build/networkBuildStore';
import type { AreaId } from './ui/navigation/areaRegistry';
import {
  ANALYSIS_SURFACE_SCREEN_CODE,
  REPORT_SURFACE_SCREEN_CODE,
} from './ui/workspace/types';

function useActiveProjectName(): string | null {
  const store = useAppStateStore();
  return (store as { activeProjectName?: string | null }).activeProjectName ?? null;
}

/**
 * E2E_STABILIZATION: App ready indicator for tests.
 * Set after initial hydration and route sync.
 */
function useAppReady(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Mark app as ready after initial render cycle completes
    const timer = requestAnimationFrame(() => {
      setReady(true);
    });
    return () => cancelAnimationFrame(timer);
  }, []);

  return ready;
}

/**
 * Check if route is a results route (requires RESULT_VIEW mode).
 */

function mapAnalysisTypeToExecutionType(
  analysisType: ReturnType<typeof useAppStateStore.getState>['activeAnalysisType'],
): ExecutionAnalysisType {
  switch (analysisType) {
    case 'LOAD_FLOW':
      return 'LOAD_FLOW';
    case 'SHORT_CIRCUIT':
    case 'PROTECTION':
    default:
      return 'SC_3F';
  }
}

function isResultsRoute(route: string): boolean {
  return (
    route === ROUTES.ANALYSIS.hash ||
    route === ROUTES.REPORT.hash ||
    isAnalysisRouteAlias(route)
  );
}

function resolveAnalysisSurfaceTab(route: string, params: URLSearchParams): string {
  const explicitTab = params.get('tab');
  if (explicitTab) {
    return explicitTab;
  }
  return resolveAnalysisRouteAliasTab(route) ?? 'results';
}

function resolveRouteArea(route: string): AreaId | null {
  if (route === '' || route === ROUTES.SLD.hash || route === ROUTES.SLD_VIEW.hash) {
    return 'SCHEMAT_TOPOLOGIA';
  }
  if (route === ROUTES.ANALYSIS.hash || isAnalysisRouteAlias(route)) {
    return 'WYNIKI_ANALIZY';
  }
  if (route === ROUTES.REPORT.hash) {
    return 'RAPORTY_UZASADNIENIA';
  }
  if (route === ROUTES.VARIANTS.hash || route === ROUTES.CASE_CONFIG.hash) {
    return 'STUDIA_OBLICZENIOWE';
  }
  if (route === ROUTES.CATALOG.hash) {
    return 'KATALOGI_TECHNICZNE';
  }
  if (route === ROUTES.SWITCHGEAR.hash) {
    return 'SCHEMAT_TOPOLOGIA';
  }
  if (route === ROUTES.FAULT_SCENARIOS.hash) {
    return 'STUDIA_OBLICZENIOWE';
  }
  if (route === ROUTES.ENM_INSPECTOR.hash) {
    return 'HISTORIA_AUDYT';
  }
  return null;
}

function UnknownRoutePage({ route }: { route: string }) {
  return (
    <div className="flex h-full items-center justify-center bg-slate-50">
      <div className="max-w-lg rounded-lg border border-amber-300 bg-amber-50 px-6 py-5 text-slate-900 shadow-sm">
        <h1 className="text-lg font-semibold">Nieznana trasa interfejsu</h1>
        <p className="mt-2 text-sm leading-6">
          Aktywna trasa <code>{route || '(pusta)'}</code> nie jest zmapowana do kanonicznego
          surface&apos;u. PrzejdĹş do jednej z aktywnych sekcji albo popraw routing.
        </p>
      </div>
    </div>
  );
}

function App() {
  // NAVIGATION_SELECTOR_UI: Use getCurrentHashRoute to strip query params from hash
  const [route, setRoute] = useState(() => getCurrentHashRoute());
  const [hashVersion, setHashVersion] = useState(0);
  const setActiveMode = useAppStateStore((state) => state.setActiveMode);
  const setActiveArea = useAppStateStore((state) => state.setActiveArea);
  const activeProjectId = useAppStateStore((state) => state.activeProjectId);
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const activeAnalysisType = useAppStateStore((state) => state.activeAnalysisType);
  const activeRunId = useAppStateStore((state) => state.activeRunId);
  const setActiveRun = useAppStateStore((state) => state.setActiveRun);
  const setExecutionActiveRun = useExecutionRunsStore((state) => state.setActiveRun);
  const readiness = useSnapshotStore((state) => state.readiness);
  const createAndExecuteRun = useExecutionRunsStore((state) => state.createAndExecuteRun);
  const appReady = useAppReady();
  const projectName = useActiveProjectName();
  const openRouteSurface = useNetworkBuildStore((state) => state.openRouteSurface);
  const clearRouteManagedSurface = useNetworkBuildStore((state) => state.clearRouteManagedSurface);

  // NAVIGATION_SELECTOR_UI: Sync selection with URL (refresh preserves selection)
  useUrlSelectionSync();

  useEffect(() => {
    // NAVIGATION_SELECTOR_UI: Strip query params when handling hash changes
    const handler = () => {
      setRoute(getCurrentHashRoute());
      setHashVersion((current) => current + 1);
    };
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  useEffect(() => {
    const routeArea = resolveRouteArea(route);
    if (routeArea) {
      setActiveArea(routeArea);
    }
  }, [route, setActiveArea]);

  // Sync mode with route
  useEffect(() => {
    if (isResultsRoute(route)) {
      setActiveMode('RESULT_VIEW');
    } else {
      setActiveMode('MODEL_EDIT');
    }
  }, [route, setActiveMode]);

  useEffect(() => {
    const params = getCurrentSearchParams();
    const routeRunId = params.get('run');
    if (
      route === ROUTES.ANALYSIS.hash
      || isAnalysisRouteAlias(route)
    ) {
      setActiveRun(routeRunId);
      setExecutionActiveRun(routeRunId);
      openRouteSurface(ANALYSIS_SURFACE_SCREEN_CODE, {
        titlePl: 'Poziom analityczny',
        tabId: resolveAnalysisSurfaceTab(route, params),
        entityRef: params.get('sel'),
        subjectKind: 'analysis_run',
        subjectRef: routeRunId,
        payload: {
          runId: routeRunId,
          legacyRoute: route,
        },
      });
      return;
    }
    if (route === ROUTES.REPORT.hash) {
      setActiveRun(routeRunId);
      setExecutionActiveRun(routeRunId);
      openRouteSurface(REPORT_SURFACE_SCREEN_CODE, {
        entityRef: params.get('sel'),
        subjectKind: 'report',
        subjectRef: routeRunId,
        payload: {
          runId: routeRunId,
        },
      });
      return;
    }
    if (route === ROUTES.VARIANTS.hash) {
      openRouteSurface('variants_runs', {
        subjectKind: 'helper_context',
        subjectRef: params.get('case') ?? params.get('snapshot') ?? 'variants-context',
      });
      return;
    }
    if (route === ROUTES.CATALOG.hash) {
      openRouteSurface('catalog_admin', {
        subjectKind: 'helper_context',
        subjectRef: params.get('sel') ?? 'catalog-root',
      });
      return;
    }
    if (route === ROUTES.CASE_CONFIG.hash) {
      openRouteSurface('case_context', {
        subjectKind: 'helper_context',
        subjectRef: params.get('case') ?? params.get('snapshot') ?? 'case-context',
      });
      return;
    }
    if (route === ROUTES.SWITCHGEAR.hash) {
      openRouteSurface('switchgear_wizard', {
        subjectKind: 'helper_context',
        subjectRef: params.get('case') ?? params.get('snapshot') ?? 'switchgear-context',
      });
      return;
    }
    clearRouteManagedSurface();
  }, [clearRouteManagedSurface, hashVersion, openRouteSurface, route, setActiveRun, setExecutionActiveRun]);

  const handleCalculate = useCallback(async () => {
    if (!activeCaseId) {
      notify('Brak aktywnego zakresu obliczeń.', 'error');
      return;
    }

    if (readiness && !readiness.ready) {
      const firstBlocker = readiness.blockers?.[0];
      notify(firstBlocker?.message_pl ?? 'Model nie jest gotowy do analizy.', 'warning');
      return;
    }

    try {
      const analysisType = mapAnalysisTypeToExecutionType(activeAnalysisType);
      const run = await createAndExecuteRun(activeCaseId, { analysis_type: analysisType });
      setActiveRun(run.id);
      notify('Uruchomiono obliczenia. PrzejdĹş do widoku wynikĂłw po zakoĹ„czeniu.', 'success');
      navigateToResults({ runId: run.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'BĹ‚ąd uruchomienia obliczeĹ„';
      notify(message, 'error');
    }
  }, [activeAnalysisType, activeCaseId, createAndExecuteRun, navigateToResults, readiness, setActiveRun]);

  /**
   * Navigate to canonical E-24 results surface.
   */
  const handleViewResults = useCallback(() => {
    navigateToResults({ runId: activeRunId });
  }, [activeRunId, navigateToResults]);

  const networkStats = useNetworkStats();

  // E2E_STABILIZATION: Wrapper with app-ready indicator
  const wrapWithReadyIndicator = (content: React.ReactNode) => (
    <div
      data-testid="app-root"
      data-ready={appReady}
      className="mv-dark-scada min-h-screen bg-chrome-900 text-chrome-100"
      data-ui-theme="dark-scada"
    >
      {appReady && <div data-testid="app-ready" style={{ display: 'none' }} />}
      <NotificationToast />
      {content}
    </div>
  );

  // Derive validation status from readiness
  const validationStatus = useMemo(() => {
    if (!readiness) return undefined;
    const blockerCount = readiness.blockers?.length ?? 0;
    const warningCount = readiness.warnings?.length ?? 0;
    if (blockerCount > 0) return 'errors' as const;
    if (warningCount > 0) return 'warnings' as const;
    return 'valid' as const;
  }, [readiness]);

  // Action handler for canonical top/workspace controls.
  const handleMenuAction = useCallback((actionId: string) => {
    switch (actionId) {
      case 'sld':
        window.location.hash = '';
        break;
      case 'network-build':
        navigateToNetworkBuild();
        break;
      case 'switchgear':
        navigateToSwitchgear({ caseId: activeCaseId });
        break;
      case 'power-distribution':
        navigateToNetworkBuild();
        break;
      case 'case-manager':
        navigateToCaseConfig({ caseId: activeCaseId });
        break;
      case 'sld-view':
        window.location.hash = ROUTES.SLD_VIEW.hash;
        break;
      case 'catalog':
        navigateToCatalog();
        break;
      case 'results':
      case 'analysis':
        navigateToAnalysis({ runId: activeRunId });
        break;
      case 'compare':
        navigateToCompare({ runId: activeRunId });
        break;
      case 'report':
        navigateToReport({ runId: activeRunId });
        break;
      case 'variants':
        navigateToVariants({ caseId: activeCaseId });
        break;
      case 'proof':
      case 'whitebox':
        navigateToProof({ runId: activeRunId });
        break;
      case 'protection':
        navigateToResultsProtection({ runId: activeRunId });
        break;
      case 'run-sc-3f':
      case 'run-sc-1f':
      case 'run-power-flow':
        handleCalculate();
        break;
      case 'navigator':
      case 'inspector':
        // Toggle panels — handled by layout
        break;
      default:
        if (import.meta.env.DEV) {
          console.debug(`[handleMenuAction] Unhandled action: ${actionId}`);
        }
    }
  }, [
    activeCaseId,
    activeRunId,
    handleCalculate,
    navigateToAnalysis,
    navigateToCaseConfig,
    navigateToCatalog,
    navigateToCompare,
    navigateToNetworkBuild,
    navigateToProof,
    navigateToReport,
    navigateToResultsProtection,
    navigateToSwitchgear,
    navigateToVariants,
  ]);

  // Common layout props for CanonicalLayout
  const layoutProps = {
    onCalculate: handleCalculate,
    onViewResults: handleViewResults,
    projectName: projectName ?? undefined,
    validationStatus: validationStatus,
    validationWarnings: readiness?.warnings?.length ?? 0,
    validationErrors: readiness?.blockers?.length ?? 0,
    onMenuAction: handleMenuAction,
    networkStats: networkStats,
  };

  // Inspektor modelu ENM (v4.2 — diagnostyka inĹĽynierska)
  if (route === '#enm-inspector') {
    return wrapWithReadyIndicator(
      <CanonicalLayout {...layoutProps}>
        <EnmInspectorPage />
      </CanonicalLayout>
    );
  }

  // PR-24: Scenariusze zwarciowe (Fault Scenarios)
  if (route === '#fault-scenarios') {
    return wrapWithReadyIndicator(
      <CanonicalLayout {...layoutProps}>
        <div className="flex flex-col h-full">
          <FaultScenariosPanel studyCaseId={null} />
          <FaultScenarioModal />
        </div>
      </CanonicalLayout>
    );
  }

  // E-00: Pulpit projektu (Dashboard) — renderowany dla #dashboard ORAZ
  // domyślnie gdy brak aktywnego projektu (etap 2 dostawy).
  if (route === '#dashboard' || (route === '' && !activeProjectId)) {
    return wrapWithReadyIndicator(
      <CanonicalLayout {...layoutProps}>
        <ProjectDashboardSurface />
      </CanonicalLayout>
    );
  }

  // SLD_READ_ONLY_UI: Podglad schematu jednokreskowego (tylko odczyt)
  if (route === '#sld-view') {
    return wrapWithReadyIndicator(
      <CanonicalLayout {...layoutProps}>
        <SldWorkspaceContainer readOnly />
      </CanonicalLayout>
    );
  }

  const isKnownRoute = getRouteByHash(route) !== null || isAnalysisRouteAlias(route);

  if (!isKnownRoute) {
    return wrapWithReadyIndicator(
      <CanonicalLayout {...layoutProps}>
        <UnknownRoutePage route={route} />
      </CanonicalLayout>
    );
  }
  // CANONICAL_LAYOUT: domyślna trasa "" / "#sld" → środowisko SLD (E-01).
  // Etap 1 dostawy: SldWorkspaceContainer renderuje SldCanvasV2 z menu
  // kontekstowym i drill-downem stacji. Adapter danych snapshot → propsy
  // rendererów dostarcza Etap 3 roadmapy.
  return wrapWithReadyIndicator(
    <CanonicalLayout {...layoutProps}>
      <SldWorkspaceContainer />
    </CanonicalLayout>
  );
}

export default App;

