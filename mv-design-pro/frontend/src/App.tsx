/**
 * App Root â€” CANONICAL_LAYOUT + UI_INTEGRATION_E2E + V12.5
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md: Layout narzÄ™dziowy ZAWSZE renderowany
 * - wizard_screens.md Â§ 1.3: Active case bar (always visible)
 * - UI_CORE_ARCHITECTURE.md Â§ 4.1: Navigation structure
 *
 * CANONICAL RULE:
 * > Layout narzÄ™dziowy ZAWSZE jest renderowany.
 * > Brak danych = komunikat w obszarze roboczym, a NIE brak UI.
 *
 * Main application entry with:
 * - CanonicalLayout with one active workspace, one inspector and one status bar
 * - Hash-based routing with Polish labels
 * - Mode-aware page rendering
 * - Empty state overlays (NOT empty screens)
 *
 * Routes (Polish):
 * - "" / "#sld" â†’ Schemat jednokreskowy (SLD Editor)
 * - "#sld-view" â†’ Podglad schematu (SLD Read-Only Viewer)
 * - "#analysis" â†’ Poziom analityczny (E-24)
 * - "#report" â†’ Generator raportu (E-25)
 * - "#variants" / "#catalog" / "#case-config" â†’ Helpery shell-a
 * - "#results" / "#proof" / "#protection-results" / "#power-flow-results" / "#compare"
 *   â†’ aliasy prowadzÄ…ce do E-24
 */

import { useEffect, useState, useCallback, useMemo } from 'react';

import { SLDViewPage, SldEditorPage } from './ui/sld';
import { EnmInspectorPage } from './ui/enm-inspector';
import { FaultScenariosPanel, FaultScenarioModal } from './ui/fault-scenarios';
import { CanonicalLayout } from './ui/layout';
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
  navigateToVariants,
  navigateToSwitchgear,
  resolveAnalysisRouteAliasTab,
  useUrlSelectionSync,
} from './ui/navigation';
import { NotificationToast } from './ui/notifications/NotificationToast';
import { notify } from './ui/notifications/store';
import { InspectorResolver } from './ui/inspector-panel';
import { useNetworkStats } from './ui/topology/useNetworkStats';
import { useNetworkBuildStore } from './ui/network-build/networkBuildStore';
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
    clearRouteManagedSurface();
  }, [clearRouteManagedSurface, hashVersion, openRouteSurface, route, setActiveRun, setExecutionActiveRun]);

  const handleCalculate = useCallback(async () => {
    if (!activeCaseId) {
      notify('Nie wybrano zakresu obliczeń.', 'error');
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
      notify('Obliczenia uruchomione. Wyniki dostępne po zakończeniu.', 'success');
      navigateToResults({ runId: run.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'BĹ‚Ä…d uruchomienia obliczeĹ„';
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
    <div data-testid="app-root" data-ready={appReady}>
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

  // Menu action handler â€” routes navigation from MainMenuBar
  const handleMenuAction = useCallback((actionId: string) => {
    switch (actionId) {
      case 'sld':
        window.location.hash = '';
        break;
      case 'network-build':
        navigateToNetworkBuild();
        break;
      case 'switchgear':
        navigateToSwitchgear();
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
        // Toggle panels â€” handled by layout
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
    navigateToVariants,
  ]);

  // Common layout props for CanonicalLayout
  const layoutProps = {
    onCalculate: handleCalculate,
    onViewResults: handleViewResults,
    projectName: projectName ?? 'Nowy projekt',
    inspectorContent: <InspectorResolver />,
    validationStatus: validationStatus,
    validationWarnings: readiness?.warnings?.length ?? 0,
    validationErrors: readiness?.blockers?.length ?? 0,
    onMenuAction: handleMenuAction,
    networkStats: networkStats,
  };

  // Inspektor modelu ENM (v4.2 â€” diagnostyka inĹĽynierska)
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

  // SLD_READ_ONLY_UI: Podglad schematu jednokreskowego (tylko odczyt)
  if (route === '#sld-view') {
    return wrapWithReadyIndicator(
      <CanonicalLayout {...layoutProps}>
        <SLDViewPage useDemo={false} />
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
  // CANONICAL_LAYOUT: Default â€” SLD Editor Page (ALWAYS shows tools)
  // This replaces the old DesignerPage with proper Canonical-style layout
  return wrapWithReadyIndicator(
    <CanonicalLayout {...layoutProps}>
      <SldEditorPage useDemo={false} />
    </CanonicalLayout>
  );
}

export default App;

