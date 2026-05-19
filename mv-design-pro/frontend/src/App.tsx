/**
 * App Root — CANONICAL_LAYOUT + UI_INTEGRATION_E2E + V12.5
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md: Layout narzędziowy ZAWSZE renderowany
 * - wizard_screens.md § 1.3: Active case bar (always visible)
 * - UI_CORE_ARCHITECTURE.md § 4.1: Navigation structure
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
 * - "" bez aktywnego projektu → Pulpit projektu E-00
 * - "" z aktywnym projektem / "#sld" → Schemat jednokreskowy E-01
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
import { CanonicalLayout as CanonicalLayoutV12 } from './ui/layout';
import { CanonicalLayoutV3 } from './ui/layout/CanonicalLayoutV3';

// Feature flag: VITE_USE_LAYOUT_V3=1 włącza shell V3 (chrome -48% per
// `docs/audit/DESIGN_IMPL_2026-05-19_KWranPTV.md` § 2). Domyślnie V12.
const CanonicalLayout = (import.meta.env.VITE_USE_LAYOUT_V3 === '1')
  ? CanonicalLayoutV3
  : CanonicalLayoutV12;
import { SldWorkspaceContainer } from './ui/sld/v2/canvas/SldWorkspaceContainer';
import { ProjectDashboardSurface } from './ui/workspace/surfaces/ProjectDashboardSurface';
import { useAppStateStore } from './ui/app-state';
import { useSnapshotStore } from './ui/topology/snapshotStore';
import { useExecutionRunsStore } from './ui/study-cases/runStore';
import { useOverlayStore } from './ui/sld-overlay';
import { useRawResultOverlayStore } from './ui/sld-overlay/rawResultOverlayStore';
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
import { useSelectionStore } from './ui/selection/store';
import type { AreaId } from './ui/navigation/areaRegistry';
import type { SelectedElement } from './ui/types';
import {
  ANALYSIS_SURFACE_SCREEN_CODE,
  ANALYSIS_ROUTE_DEFAULT_TAB,
  REPORT_SURFACE_SCREEN_CODE,
} from './ui/workspace/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

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

interface DerSurfaceRouteTarget {
  selectedRef: string;
  screenCode: 'E-21' | 'E-22' | 'E-23';
  entityType: 'pv_source' | 'bess_source' | 'fw_source';
  titlePl: string;
  derKind: 'PV' | 'BESS' | 'FW';
}

function resolveDerSurfaceTarget(input: {
  selectedRef: string | null | undefined;
  selectedType?: string | null;
  selectedName?: string | null;
  semanticRole?: string | null;
  semanticHash?: string | null;
}): DerSurfaceRouteTarget | null {
  const selectedRef = input.selectedRef?.trim();
  if (!selectedRef) {
    return null;
  }

  const normalizedType = (input.selectedType ?? '').toUpperCase();
  const normalizedRole = (input.semanticRole ?? '').toUpperCase();
  const normalizedSemanticHash = (input.semanticHash ?? '').toUpperCase();
  const joinedSelection = `${normalizedType} ${normalizedRole} ${normalizedSemanticHash}`;

  if (
    joinedSelection.includes('PV')
    || normalizedType === 'PVINVERTER'
    || normalizedSemanticHash.startsWith('SOURCE:PV')
  ) {
    return {
      selectedRef,
      screenCode: 'E-21',
      entityType: 'pv_source',
      titlePl: input.selectedName?.trim() || 'Falownik PV',
      derKind: 'PV',
    };
  }

  if (
    joinedSelection.includes('BESS')
    || joinedSelection.includes('STORAGE')
    || normalizedType === 'BESSINVERTER'
    || normalizedSemanticHash.startsWith('SOURCE:BESS')
  ) {
    return {
      selectedRef,
      screenCode: 'E-22',
      entityType: 'bess_source',
      titlePl: input.selectedName?.trim() || 'Magazyn energii',
      derKind: 'BESS',
    };
  }

  if (
    joinedSelection.includes('WIND')
    || joinedSelection.includes('FW')
    || normalizedSemanticHash.startsWith('SOURCE:FW')
    || normalizedSemanticHash.startsWith('SOURCE:WIND')
  ) {
    return {
      selectedRef,
      screenCode: 'E-23',
      entityType: 'fw_source',
      titlePl: input.selectedName?.trim() || 'Farma wiatrowa',
      derKind: 'FW',
    };
  }

  return null;
}

function resolveDerSurfaceFromSldSelection(params: URLSearchParams): DerSurfaceRouteTarget | null {
  return resolveDerSurfaceTarget({
    selectedRef: params.get('sel'),
    selectedType: params.get('type'),
    selectedName: params.get('name'),
    semanticRole: params.get('role'),
    semanticHash: params.get('sh'),
  });
}

function resolveDerSurfaceFromSelectedElement(
  selectedElement: SelectedElement | null,
): DerSurfaceRouteTarget | null {
  if (!selectedElement) {
    return null;
  }

  return resolveDerSurfaceTarget({
    selectedRef: selectedElement.id,
    selectedType: selectedElement.type,
    selectedName: selectedElement.name,
    semanticRole: selectedElement.semanticEngineeringRole,
    semanticHash: selectedElement.semanticHash,
  });
}

function isSldRoute(route: string): boolean {
  return route === ROUTES.SLD.hash || route === ROUTES.SLD_VIEW.hash || route === '';
}

function UnknownRoutePage({ route }: { route: string }) {
  return (
    <div className="flex h-full items-center justify-center bg-slate-50">
      <div className="max-w-lg rounded-lg border border-amber-300 bg-amber-50 px-6 py-5 text-slate-900 shadow-sm">
        <h1 className="text-lg font-semibold">Nieznana trasa interfejsu</h1>
        <p className="mt-2 text-sm leading-6">
          Aktywna trasa <code>{route || '(pusta)'}</code> nie jest zmapowana do kanonicznego
          powierzchni. Przejdź do jednej z aktywnych sekcji albo popraw routing.
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
  const activeCaseName = useAppStateStore((state) => state.activeCaseName);
  const activeCaseKind = useAppStateStore((state) => state.activeCaseKind);
  const activeAnalysisType = useAppStateStore((state) => state.activeAnalysisType);
  const activeRunId = useAppStateStore((state) => state.activeRunId);
  const setActiveProject = useAppStateStore((state) => state.setActiveProject);
  const setActiveCase = useAppStateStore((state) => state.setActiveCase);
  const setActiveRun = useAppStateStore((state) => state.setActiveRun);
  const setActiveSnapshot = useAppStateStore((state) => state.setActiveSnapshot);
  const setActiveCaseResultStatus = useAppStateStore((state) => state.setActiveCaseResultStatus);
  const setExecutionActiveRun = useExecutionRunsStore((state) => state.setActiveRun);
  const readiness = useSnapshotStore((state) => state.readiness);
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const snapshotError = useSnapshotStore((state) => state.error);
  const refreshSnapshotFromBackend = useSnapshotStore((state) => state.refreshFromBackend);
  const createAndExecuteRun = useExecutionRunsStore((state) => state.createAndExecuteRun);
  const appReady = useAppReady();
  const projectName = useActiveProjectName();
  const openRouteSurface = useNetworkBuildStore((state) => state.openRouteSurface);
  const clearRouteManagedSurface = useNetworkBuildStore((state) => state.clearRouteManagedSurface);
  const selectedElement = useSelectionStore((state) => state.selectedElement);

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

  useEffect(() => {
    const params = getCurrentSearchParams();
    const routeProjectId = params.get('project')?.trim();
    if (!routeProjectId || (routeProjectId === activeProjectId && projectName)) {
      return;
    }

    setActiveProject(routeProjectId, routeProjectId);
  }, [
    activeProjectId,
    hashVersion,
    projectName,
    route,
    setActiveProject,
  ]);

  useEffect(() => {
    const params = getCurrentSearchParams();
    const routeCaseId = params.get('case')?.trim();
    if (!routeCaseId || routeCaseId === activeCaseId) {
      return;
    }

    setActiveCase(
      routeCaseId,
      'Zakres obliczeń z adresu',
      'ShortCircuitCase',
      'NONE',
    );
  }, [
    activeCaseId,
    hashVersion,
    route,
    setActiveCase,
  ]);

  // Sync mode with route
  useEffect(() => {
    if (isResultsRoute(route)) {
      setActiveMode('RESULT_VIEW');
    } else {
      setActiveMode('MODEL_EDIT');
    }
  }, [route, setActiveMode]);

  useEffect(() => {
    if (!activeCaseId || snapshot || snapshotError) {
      return;
    }

    void refreshSnapshotFromBackend(activeCaseId);
  }, [activeCaseId, refreshSnapshotFromBackend, snapshot, snapshotError]);

  // K30-3 / NO-GO #9 fix: gdy URL ma ?run=<runId>, fetch overlay payload
  // z /api/execution/runs/{run_id}/results/v1 i load do useRawResultOverlayStore.
  // Adresuje user feedback "nie widać wyników obliczeń" — bez tego v2 canvas
  // nie pokazuje LOAD_FLOW/SC_3F overlay.
  // UWAGA: backend ResultsContractV1.overlay_payload ma OTHER schema niż typed
  // OverlayPayloadV1 (`elements` dict, nie array). Używamy raw store.
  void useOverlayStore; // unused but kept for future PR-16 integration
  const setRawOverlay = useRawResultOverlayStore((state) => state.setPayload);
  const clearRawOverlay = useRawResultOverlayStore((state) => state.clear);
  const activeRawRunId = useRawResultOverlayStore((state) => state.payload?.run_id ?? null);
  useEffect(() => {
    const params = getCurrentSearchParams();
    const routeRunId = params.get('run')?.trim();
    if (!routeRunId) {
      if (activeRawRunId) clearRawOverlay();
      return;
    }
    if (routeRunId === activeRawRunId) return;
    void (async () => {
      try {
        const res = await fetch(`/api/execution/runs/${routeRunId}/results/v1`);
        if (!res.ok) return;
        const data = await res.json();
        const payload = data?.overlay_payload;
        if (payload && payload.elements && typeof payload.elements === 'object') {
          setRawOverlay({
            run_id: payload.run_id ?? routeRunId,
            analysis_type: payload.analysis_type ?? data?.analysis_type ?? 'LOAD_FLOW',
            elements: payload.elements,
            quality_status: data?.global_results?.quality_status ?? null,
            proof_status: data?.global_results?.proof_status ?? null,
          });
        }
      } catch {
        // network errors silently — overlay just won't be shown
      }
    })();
  }, [hashVersion, activeRawRunId, setRawOverlay, clearRawOverlay]);

  useEffect(() => {
    const params = getCurrentSearchParams();
    const routeRunId = params.get('run');
    if (isSldRoute(route)) {
      const derSurface = resolveDerSurfaceFromSelectedElement(selectedElement)
        ?? resolveDerSurfaceFromSldSelection(params);
      if (derSurface) {
        openRouteSurface(derSurface.screenCode, {
          entityRef: derSurface.selectedRef,
          entityType: derSurface.entityType,
          subjectKind: 'entity',
          subjectRef: derSurface.selectedRef,
          titlePl: derSurface.titlePl,
          route: 'sld',
          payload: {
            derId: derSurface.selectedRef,
            derKind: derSurface.derKind,
            derName: derSurface.titlePl,
            derRole: params.get('role'),
            semanticHash: params.get('sh'),
            selectionType: params.get('type'),
          },
        });
        return;
      }
    }
    if (
      route === ROUTES.ANALYSIS.hash
      || isAnalysisRouteAlias(route)
    ) {
      setActiveRun(routeRunId);
      setExecutionActiveRun(routeRunId);
      if (isUuid(routeRunId)) {
        void fetch(`/api/analysis-runs/${routeRunId}/snapshot`)
          .then((response) => (response.ok ? response.json() : null))
          .then((payload: { snapshot_id?: unknown } | null) => {
            if (typeof payload?.snapshot_id === 'string' && payload.snapshot_id.trim()) {
              setActiveSnapshot(payload.snapshot_id);
              setActiveCaseResultStatus('FRESH');
            }
          })
          .catch(() => {
            // Brak wersji modelu nie blokuje samej nawigacji; ekran wyników pokaże status braku.
          });
      }
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
      if (isUuid(routeRunId)) {
        void fetch(`/api/analysis-runs/${routeRunId}/snapshot`)
          .then((response) => (response.ok ? response.json() : null))
          .then((payload: { snapshot_id?: unknown } | null) => {
            if (typeof payload?.snapshot_id === 'string' && payload.snapshot_id.trim()) {
              setActiveSnapshot(payload.snapshot_id);
              setActiveCaseResultStatus('FRESH');
            }
          })
          .catch(() => {
            // Raport pozostaje otwarty; brak wersji modelu jest widoczny w sekcji statusu.
          });
      }
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
  }, [
    clearRouteManagedSurface,
    hashVersion,
    openRouteSurface,
    route,
    selectedElement,
    setActiveCaseResultStatus,
    setActiveRun,
    setActiveSnapshot,
    setExecutionActiveRun,
  ]);

  useEffect(() => {
    return useSelectionStore.subscribe((state, previousState) => {
      if (state.selectedElement === previousState.selectedElement) {
        return;
      }
      if (!isSldRoute(getCurrentHashRoute())) {
        return;
      }

      const derSurface = resolveDerSurfaceFromSelectedElement(state.selectedElement);
      if (!derSurface) {
        return;
      }

      openRouteSurface(derSurface.screenCode, {
        entityRef: derSurface.selectedRef,
        entityType: derSurface.entityType,
        subjectKind: 'entity',
        subjectRef: derSurface.selectedRef,
        titlePl: derSurface.titlePl,
        route: 'sld',
        payload: {
          derId: derSurface.selectedRef,
          derKind: derSurface.derKind,
          derName: derSurface.titlePl,
          derRole: state.selectedElement?.semanticEngineeringRole ?? null,
          semanticHash: state.selectedElement?.semanticHash ?? null,
          selectionType: state.selectedElement?.type ?? null,
        },
      });
    });
  }, [openRouteSurface]);

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
      let caseIdForRun = activeCaseId;
      if (!isUuid(caseIdForRun)) {
        caseIdForRun = crypto.randomUUID();
        setActiveCase(
          caseIdForRun,
          activeCaseName ?? 'Zwarcie maksymalne IEC 60909',
          activeCaseKind ?? 'ShortCircuitCase',
          'NONE',
        );
      }
      const run = await createAndExecuteRun(caseIdForRun, { analysis_type: analysisType });
      setActiveRun(run.id);
      setActiveCaseResultStatus('FRESH');
      try {
        const response = await fetch(`/api/analysis-runs/${run.id}/snapshot`);
        if (response.ok) {
          const payload = (await response.json()) as { snapshot_id?: unknown };
          if (typeof payload.snapshot_id === 'string' && payload.snapshot_id.trim()) {
            setActiveSnapshot(payload.snapshot_id);
          }
        }
      } catch {
        // Wyniki pozostają dostępne; panel statusu pokaże brak wersji modelu, jeśli backend jej nie zwróci.
      }
      notify('Obliczenie zakończone. Otwieram wyniki.', 'success');
      navigateToResults({ runId: run.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Błąd wykonania obliczeń';
      notify(message, 'error');
    }
  }, [
    activeAnalysisType,
    activeCaseId,
    activeCaseKind,
    activeCaseName,
    createAndExecuteRun,
    navigateToResults,
    readiness,
    setActiveCase,
    setActiveCaseResultStatus,
    setActiveRun,
    setActiveSnapshot,
  ]);

  /**
   * Navigate to canonical E-24 results surface.
   */
  const handleViewResults = useCallback(() => {
    const params = getCurrentSearchParams();
    openRouteSurface(ANALYSIS_SURFACE_SCREEN_CODE, {
      titlePl: 'Poziom analityczny',
      tabId: ANALYSIS_ROUTE_DEFAULT_TAB,
      entityRef: params.get('sel'),
      subjectKind: 'analysis_run',
      subjectRef: activeRunId,
      payload: {
        runId: activeRunId,
        legacyRoute: ROUTES.ANALYSIS.hash,
      },
    });
    navigateToResults({ runId: activeRunId });
  }, [activeRunId, navigateToResults, openRouteSurface]);

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
        navigateToNetworkBuild();
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
      case 'export':
        setActiveArea('RAPORTY_UZASADNIENIA');
        navigateToReport({ runId: activeRunId });
        break;
      case 'variants':
        navigateToVariants({ caseId: activeCaseId });
        break;
      case 'readiness':
      case 'show-readiness':
        setActiveArea('MODEL_SIECI');
        openRouteSurface('E-04', {
          titlePl: 'Gotowość modelu i lista braków',
          tabId: 'braki',
          subjectKind: 'analysis_case',
          subjectRef: activeCaseId,
          route: 'analysis',
          openMode: 'replace_right_panel',
        });
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
    openRouteSurface,
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

  // Inspektor modelu ENM (v4.2 — diagnostyka inżynierska)
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

