/**
 * App Root â€” POWERFACTORY_LAYOUT + UI_INTEGRATION_E2E + PROJECT_TREE_PARITY_V1
 *
 * CANONICAL ALIGNMENT:
 * - powerfactory_ui_parity.md: Layout narzÄ™dziowy ZAWSZE renderowany
 * - wizard_screens.md Â§ 1.3: Active case bar (always visible)
 * - UI_CORE_ARCHITECTURE.md Â§ 4.1: Navigation structure
 *
 * POWERFACTORY/ETAP RULE:
 * > Layout narzÄ™dziowy ZAWSZE jest renderowany.
 * > Brak danych = komunikat w obszarze roboczym, a NIE brak UI.
 *
 * Main application entry with:
 * - PowerFactoryLayout with ALWAYS visible Project Tree, Inspector, Status Bar
 * - Hash-based routing with Polish labels
 * - Mode-aware page rendering
 * - Empty state overlays (NOT empty screens)
 *
 * Routes (Polish):
 * - "" / "#sld" / "#network-build" â†’ Edytor sieci (aliasy zgodnosci)
 * - "#results" / "#results-workspace" â†’ Wyniki i analiza
 * - "#proof" â†’ Pomocniczy Ĺ›lad obliczeĹ„
 * - "#protection-results" â†’ Wyniki zabezpieczeĹ„
 * - "#power-flow-results" â†’ Wyniki rozpĹ‚ywu
 * - "#protection-settings" â†’ Nastawy zabezpieczeĹ„
 * - "#catalog" â†’ Biblioteka typĂłw
 * - "#case-config" â†’ Konfiguracja przypadku obliczeniowego
 */

import { Suspense, lazy, useEffect, useState, useCallback, useMemo } from 'react';

import { resolveResultsRunId } from './ui/results-inspector/viewState';
import { PowerFactoryLayout } from './ui/layout';
import { useAppStateStore } from './ui/app-state';
import { useSnapshotStore } from './ui/topology/snapshotStore';
import { useExecutionRunsStore } from './ui/study-cases/runStore';
import type { ExecutionAnalysisType } from './ui/study-cases/types';
import { ROUTES, useUrlSelectionSync, getCurrentHashRoute, getCurrentSearchParams, normalizeHashRoute } from './ui/navigation';
import { useSelectionStore } from './ui/selection';
import { NotificationToast } from './ui/notifications/NotificationToast';
import { notify } from './ui/notifications/store';
import type { TreeNode, TreeNodeType, ElementType } from './ui/types';
import { InspectorResolver } from './ui/inspector-panel';
import { useNetworkTreeElements, useNetworkStats } from './ui/topology/useNetworkTreeElements';

const NetworkEditorPage = lazy(() =>
  import('./ui/network-editor').then((module) => ({ default: module.NetworkEditorPage })),
);
const ResultsWorkspacePage = lazy(() =>
  import('./ui/results-workspace').then((module) => ({ default: module.ResultsWorkspacePage })),
);
const LegacyTraceWorkspacePage = lazy(() =>
  import('./ui/results-inspector/LegacyTraceWorkspacePage').then((module) => ({
    default: module.LegacyTraceWorkspacePage,
  })),
);
const ProtectionResultsInspectorPage = lazy(() =>
  import('./ui/protection-results').then((module) => ({
    default: module.ProtectionResultsInspectorPage,
  })),
);
const PowerFlowResultsInspectorPage = lazy(() =>
  import('./ui/power-flow-results').then((module) => ({
    default: module.PowerFlowResultsInspectorPage,
  })),
);
const ReferencePatternsPage = lazy(() =>
  import('./ui/reference-patterns').then((module) => ({ default: module.ReferencePatternsPage })),
);
const SLDViewPage = lazy(() =>
  import('./ui/sld').then((module) => ({ default: module.SLDViewPage })),
);
const EnmInspectorPage = lazy(() =>
  import('./ui/enm-inspector').then((module) => ({ default: module.EnmInspectorPage })),
);
const FaultScenariosRoutePage = lazy(() =>
  import('./ui/fault-scenarios').then((module) => ({
    default: function FaultScenariosRoutePage() {
      return (
        <div className="flex flex-col h-full">
          <module.FaultScenariosPanel studyCaseId={null} />
          <module.FaultScenarioModal />
        </div>
      );
    },
  })),
);
const TypeLibraryBrowser = lazy(() =>
  import('./ui/catalog').then((module) => ({ default: module.TypeLibraryBrowser })),
);
const PowerDistributionPage = lazy(() =>
  import('./ui/power-distribution').then((module) => ({
    default: module.PowerDistributionPage,
  })),
);
const CaseConfigPage = lazy(() =>
  import('./ui/study-cases/CaseConfigPage').then((module) => ({
    default: module.CaseConfigPage,
  })),
);
const ProtectionSettingsPage = lazy(() =>
  import('./ui/protection-engine-v1/ProtectionSettingsPage').then((module) => ({
    default: module.ProtectionSettingsPage,
  })),
);

// PROJECT_TREE_PARITY_V1: Get active project name from store
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

function RouteLoadingState() {
  return (
    <div className="flex h-full min-h-[240px] items-center justify-center bg-slate-50 text-sm text-slate-500">
      <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2 shadow-sm">
        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
        Ładowanie modułu inżynierskiego...
      </div>
    </div>
  );
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
    route === '#results' ||
    route === '#proof' ||
    route === '#protection-results' ||
    route === '#power-flow-results' ||
    route === '#reference-patterns' ||
    route === '#protection-settings'
  );
}

function App() {
  // NAVIGATION_SELECTOR_UI: Use getCurrentHashRoute to strip query params from hash
  const [route, setRoute] = useState(() => normalizeHashRoute(getCurrentHashRoute()));
  const [hashVersion, setHashVersion] = useState(0);
  const setActiveMode = useAppStateStore((state) => state.setActiveMode);
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const activeAnalysisType = useAppStateStore((state) => state.activeAnalysisType);
  const activeRunId = useAppStateStore((state) => state.activeRunId);
  const setActiveRun = useAppStateStore((state) => state.setActiveRun);
  const readiness = useSnapshotStore((state) => state.readiness);
  const createAndExecuteRun = useExecutionRunsStore((state) => state.createAndExecuteRun);
  const appReady = useAppReady();
  const projectName = useActiveProjectName();
  const selectElement = useSelectionStore((state) => state.selectElement);
  const centerSldOnElement = useSelectionStore((state) => state.centerSldOnElement);

  // NAVIGATION_SELECTOR_UI: Sync selection with URL (refresh preserves selection)
  useUrlSelectionSync();

  useEffect(() => {
    // NAVIGATION_SELECTOR_UI: Strip query params when handling hash changes
    const handler = () => {
      const rawRoute = getCurrentHashRoute();
      const normalizedRoute = normalizeHashRoute(rawRoute);
      setRoute(normalizedRoute);
      setHashVersion((current) => current + 1);

      if (normalizedRoute !== rawRoute) {
        const query = window.location.hash.includes('?') ? window.location.hash.slice(window.location.hash.indexOf('?')) : '';
        window.history.replaceState(null, '', `${window.location.pathname}${normalizedRoute}${query}`);
      }
    };
    handler();
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  // Sync mode with route
  useEffect(() => {
    if (isResultsRoute(route)) {
      setActiveMode('RESULT_VIEW');
    } else if (route === '#case-config') {
      setActiveMode('CASE_CONFIG');
    } else {
      setActiveMode('MODEL_EDIT');
    }
  }, [route, setActiveMode]);

  const handleCalculate = useCallback(async () => {
    if (!activeCaseId) {
      notify('Brak aktywnego przypadku obliczeniowego.', 'error');
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
      notify('Uruchomiono obliczenia. Otwieram kanoniczna przestrzen wynikow dla biezacego uruchomienia.', 'success');
      window.location.hash = `${ROUTES.RESULTS.hash}?run=${run.id}&mode=run`;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'BĹ‚Ä…d uruchomienia obliczeĹ„';
      notify(message, 'error');
    }
  }, [activeAnalysisType, activeCaseId, createAndExecuteRun, readiness, setActiveRun]);

  /**
   * Navigate to Results (PrzeglÄ…d wynikĂłw).
   * UI_INTEGRATION_E2E: Uses #results route.
   */
  const handleViewResults = useCallback(() => {
    window.location.hash = activeRunId
      ? `${ROUTES.RESULTS.hash}?run=${activeRunId}&mode=run`
      : `${ROUTES.RESULTS.hash}?mode=run`;
  }, [activeRunId]);

  // PROJECT_TREE_PARITY_V1: Tree node click handler
  // Updates selection â†’ syncs URL â†’ triggers Results Table / Inspector update
  const handleTreeNodeClick = useCallback((node: TreeNode) => {
    // Only handle element nodes (not categories)
    if (node.nodeType === 'ELEMENT' && node.elementId && node.elementType) {
      selectElement({
        id: node.elementId,
        type: node.elementType as ElementType,
        name: node.label,
      });
      centerSldOnElement(node.elementId);
    }
  }, [selectElement, centerSldOnElement]);

  // PROJECT_TREE_PARITY_V1: Tree category click handler
  const handleTreeCategoryClick = useCallback((_nodeType: TreeNodeType, _elementType?: ElementType) => {
    // Category navigation not yet implemented - silent no-op
    // Filter by category will be available in future version
    if (import.meta.env.DEV) {
      console.debug('[handleTreeCategoryClick] Category click - filter not yet implemented');
    }
  }, []);

  // PROJECT_TREE_PARITY_V1: Tree run click handler
  const handleTreeRunClick = useCallback((runId: string) => {
    // Navigate to results with run context
    window.location.hash = `${ROUTES.RESULTS.hash}?run=${runId}&mode=run`;
  }, []);

  // Network tree elements derived from ENM snapshot (replaces mock data)
  const treeElements = useNetworkTreeElements();
  const networkStats = useNetworkStats();

  // E2E_STABILIZATION: Wrapper with app-ready indicator
  const wrapWithReadyIndicator = (content: React.ReactNode) => (
    <div data-testid="app-root" data-ready={appReady}>
      {appReady && <div data-testid="app-ready" style={{ display: 'none' }} />}
      <NotificationToast />
      {content}
    </div>
  );

  const renderRouteModule = (content: React.ReactNode) => (
    <Suspense fallback={<RouteLoadingState />}>{content}</Suspense>
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

  const routeSearchParams = useMemo(() => getCurrentSearchParams(), [hashVersion]);
  const effectiveRunId = resolveResultsRunId(routeSearchParams.get('run'), activeRunId) ?? undefined;

  // Menu action handler â€” routes navigation from MainMenuBar
  const handleMenuAction = useCallback((actionId: string) => {
    switch (actionId) {
      case 'sld':
      case 'editor':
      case 'network-editor':
      case 'network-build':
        window.location.hash = ROUTES.SLD.hash;
        break;
      case 'catalog':
        window.location.hash = '#catalog';
        break;
      case 'results':
        window.location.hash = activeRunId
          ? `${ROUTES.RESULTS.hash}?run=${activeRunId}&mode=run`
          : `${ROUTES.RESULTS.hash}?mode=run`;
        break;
      case 'proof':
      case 'whitebox':
        window.location.hash = activeRunId
          ? `${ROUTES.PROOF.hash}?run=${activeRunId}`
          : ROUTES.PROOF.hash;
        break;
      case 'protection':
        window.location.hash = '#protection-settings';
        break;
      case 'case-manager':
        useAppStateStore.getState().toggleCaseManager(true);
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
  }, [activeRunId, handleCalculate]);

  // Common layout props for PowerFactoryLayout
  const layoutProps = {
    onCalculate: handleCalculate,
    onViewResults: handleViewResults,
    projectName: projectName ?? 'Nowy projekt',
    treeElements: treeElements,
    onTreeNodeClick: handleTreeNodeClick,
    onTreeCategoryClick: handleTreeCategoryClick,
    onTreeRunClick: handleTreeRunClick,
    inspectorContent: <InspectorResolver />,
    validationStatus: validationStatus,
    validationWarnings: readiness?.warnings?.length ?? 0,
    validationErrors: readiness?.blockers?.length ?? 0,
    onMenuAction: handleMenuAction,
    networkStats: networkStats,
  };

  // Kanoniczna przestrzen wynikow: run / batch / compare / overlay
  if (route === '#results') {
    return wrapWithReadyIndicator(
      <PowerFactoryLayout {...layoutProps} hideInspector={true}>
        {renderRouteModule(<ResultsWorkspacePage />)}
      </PowerFactoryLayout>
    );
  }

  // Pomocniczy Ĺ›lad obliczeĹ„ dla diagnostyki inĹĽynierskiej
  if (route === '#proof') {
    return wrapWithReadyIndicator(
      <PowerFactoryLayout {...layoutProps} hideInspector={true}>
        {renderRouteModule(<LegacyTraceWorkspacePage runId={effectiveRunId} />)}
      </PowerFactoryLayout>
    );
  }

  // Protection Results Inspector
  if (route === '#protection-results') {
    return wrapWithReadyIndicator(
      <PowerFactoryLayout {...layoutProps}>
        {renderRouteModule(<ProtectionResultsInspectorPage />)}
      </PowerFactoryLayout>
    );
  }

  // P20b: Power Flow Results Inspector
  if (route === '#power-flow-results') {
    return wrapWithReadyIndicator(
      <PowerFactoryLayout {...layoutProps}>
        {renderRouteModule(<PowerFlowResultsInspectorPage />)}
      </PowerFactoryLayout>
    );
  }

  // Wzorce odniesienia (Reference Patterns)
  if (route === '#reference-patterns') {
    return wrapWithReadyIndicator(
      <PowerFactoryLayout {...layoutProps} hideInspector={true}>
        {renderRouteModule(<ReferencePatternsPage />)}
      </PowerFactoryLayout>
    );
  }

  // Budowa sieci (ten sam kanoniczny ekran modelowania co #sld)
  if (route === ROUTES.SLD.hash) {
    return wrapWithReadyIndicator(
      <PowerFactoryLayout {...layoutProps}>
        {renderRouteModule(<NetworkEditorPage />)}
      </PowerFactoryLayout>
    );
  }

  // Inspektor modelu ENM (v4.2 â€” diagnostyka inĹĽynierska)
  if (route === '#enm-inspector') {
    return wrapWithReadyIndicator(
      <PowerFactoryLayout {...layoutProps}>
        {renderRouteModule(<EnmInspectorPage />)}
      </PowerFactoryLayout>
    );
  }

  // PR-24: Scenariusze zwarciowe (Fault Scenarios)
  if (route === '#fault-scenarios') {
    return wrapWithReadyIndicator(
      <PowerFactoryLayout {...layoutProps}>
        {renderRouteModule(<FaultScenariosRoutePage />)}
      </PowerFactoryLayout>
    );
  }

  // Biblioteka typow (Catalog / Type Library Browser)
  if (route === '#catalog') {
    return wrapWithReadyIndicator(
      <PowerFactoryLayout {...layoutProps} hideInspector={true}>
        {renderRouteModule(<TypeLibraryBrowser />)}
      </PowerFactoryLayout>
    );
  }

  // Konfiguracja przypadku obliczeniowego
  if (route === '#case-config') {
    return wrapWithReadyIndicator(
      <PowerFactoryLayout {...layoutProps}>
        {renderRouteModule(<CaseConfigPage />)}
      </PowerFactoryLayout>
    );
  }

  // Nastawy zabezpieczen
  if (route === '#protection-settings') {
    return wrapWithReadyIndicator(
      <PowerFactoryLayout {...layoutProps}>
        {renderRouteModule(<ProtectionSettingsPage />)}
      </PowerFactoryLayout>
    );
  }

  // Architektura rozdzialu mocy (Power Distribution Architecture)
  if (route === '#power-distribution') {
    return wrapWithReadyIndicator(
      <PowerFactoryLayout {...layoutProps}>
        {renderRouteModule(<PowerDistributionPage />)}
      </PowerFactoryLayout>
    );
  }

  // SLD_READ_ONLY_UI: Podglad schematu jednokreskowego (tylko odczyt)
  if (route === '#sld-view') {
    return wrapWithReadyIndicator(
      <PowerFactoryLayout {...layoutProps}>
        {renderRouteModule(<SLDViewPage useDemo={false} />)}
      </PowerFactoryLayout>
    );
  }
  // POWERFACTORY_LAYOUT: Default â€” SLD Editor Page (ALWAYS shows tools)
  // This replaces the old DesignerPage with proper PowerFactory-style layout
  return wrapWithReadyIndicator(
    <PowerFactoryLayout {...layoutProps}>
      {renderRouteModule(<NetworkEditorPage />)}
    </PowerFactoryLayout>
  );
}

export default App;
