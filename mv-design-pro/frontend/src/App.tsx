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
 * - "#analysis" → Analizy techniczne (E-35)
 * - "#report" → Generator raportu (E-25)
 * - "#variants" / "#catalog" / "#case-config" → Helpery shell-a
 * - "#results" / "#proof" / "#protection-results" / "#power-flow-results" / "#compare"
 *   → aliasy prowadzące do E-24
 */

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';

import { EnmInspectorPage } from './ui/enm-inspector';
import { FaultScenariosPanel, FaultScenarioModal } from './ui/fault-scenarios';
import { CanonicalLayout as CanonicalLayoutV12 } from './ui/layout';
import { CanonicalLayoutV3 } from './ui/layout/CanonicalLayoutV3';
import { StationWizardSurface } from './ui/network-build/station-wizard-v2/StationWizardSurface';
import { featureFlags } from './ui/config/featureFlags';

// Feature flag: VITE_USE_LAYOUT_V3=1 włącza shell V3 (chrome -48% per
// `docs/audit/DESIGN_IMPL_2026-05-19_KWranPTV.md` § 2). Domyślnie V12.
const CanonicalLayout = featureFlags.USE_LAYOUT_V3 ? CanonicalLayoutV3 : CanonicalLayoutV12;
import { SldWorkspaceContainer } from './ui/sld/v2/canvas/SldWorkspaceContainer';
import { ProjectDashboardSurface } from './ui/workspace/surfaces/ProjectDashboardSurface';
import { useAppStateStore } from './ui/app-state';
import { useSnapshotStore } from './ui/topology/snapshotStore';
import { useExecutionRunsStore } from './ui/study-cases/runStore';
import { getStudyCase } from './ui/study-cases/api';
import { getProject } from './ui/projects/api';
import { useOverlayStore } from './ui/sld-overlay';
import { useRawResultOverlayStore } from './ui/sld-overlay/rawResultOverlayStore';
import type { ExecutionAnalysisType, ExecutionRun } from './ui/study-cases/types';
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
import { HelpPanel } from './ui/help';
import { SettingsPanel } from './ui/settings';
import { OnboardingTour, isOnboardingCompleted } from './ui/onboarding/OnboardingTour';
import { notify } from './ui/notifications/store';
import { sanitizePublicReadinessMessage } from './ui/shared/publicReadinessMessage';
import { useNetworkStats } from './ui/topology/useNetworkStats';
import { useNetworkBuildStore } from './ui/network-build/networkBuildStore';
import { useSelectionStore } from './ui/selection/store';
import type { AreaId } from './ui/navigation/areaRegistry';
import type { SelectedElement } from './ui/types';
import type { DomainOpResponseV1, EnergyNetworkModel } from './types/enm';
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

type AnalysisRunHealth = {
  status?: string | null;
  result_status?: string | null;
  results_valid?: boolean | null;
  error_message?: string | null;
  not_found?: boolean | null;
};

function isFailedAnalysisRun(run?: ExecutionRun | null, health?: AnalysisRunHealth | null): boolean {
  const executionStatus = run?.status?.toUpperCase();
  const canonicalStatus = health?.status?.toUpperCase();
  const resultStatus = health?.result_status?.toUpperCase();

  return executionStatus === 'FAILED'
    || canonicalStatus === 'FAILED'
    || resultStatus === 'FAILED';
}

function hasRenderableRunResults(health: AnalysisRunHealth | null): boolean {
  if (!health || health.not_found) {
    return false;
  }

  const canonicalStatus = health.status?.toUpperCase();
  const resultStatus = health.result_status?.toUpperCase();
  const terminalRun =
    canonicalStatus === 'FINISHED' || canonicalStatus === 'DONE' || canonicalStatus === 'COMPLETED';
  const validResult = resultStatus === 'VALID' || resultStatus === 'FRESH';

  if (canonicalStatus) {
    return terminalRun && (validResult || health.results_valid === true);
  }

  return health.results_valid === true;
}

function isTerminalExecutionRun(run: ExecutionRun): boolean {
  return run.status === 'DONE' || run.status === 'FAILED';
}

async function fetchAnalysisRunHealth(runId: string): Promise<AnalysisRunHealth | null> {
  try {
    const response = await fetch(`/api/analysis-runs/${runId}`);
    if (response.status === 404) {
      return {
        status: 'NOT_FOUND',
        result_status: 'NONE',
        results_valid: false,
        error_message: 'RUN_NOT_FOUND',
        not_found: true,
      };
    }
    if (!response.ok) {
      return null;
    }
    return {
      ...((await response.json()) as AnalysisRunHealth),
      not_found: false,
    };
  } catch {
    return null;
  }
}

function isAnalysisRunMissing(health: AnalysisRunHealth | null): boolean {
  return health?.not_found === true || health?.status?.toUpperCase() === 'NOT_FOUND';
}

function clearRunParamFromCurrentHash(routeRunId: string): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const hash = window.location.hash || '';
  const queryIndex = hash.indexOf('?');
  if (queryIndex < 0) {
    return false;
  }
  const routeHash = hash.slice(0, queryIndex) || ROUTES.SLD.hash;
  const params = new URLSearchParams(hash.slice(queryIndex + 1));
  if (params.get('run') !== routeRunId) {
    return false;
  }
  params.delete('run');
  const nextHash = params.toString() ? `${routeHash}?${params.toString()}` : routeHash;
  window.history.replaceState(
    window.history.state,
    '',
    `${window.location.pathname}${window.location.search}${nextHash}`,
  );
  return true;
}

function openSldOverlayFromCurrentContext(): void {
  if (typeof window === 'undefined') {
    return;
  }

  const params = getCurrentSearchParams();
  params.set('overlay', '1');
  params.set('legend', '1');
  const query = params.toString();
  window.location.hash = query ? `${ROUTES.SLD.hash}?${query}` : ROUTES.SLD.hash;
}

function analysisRunFailureMessage(): string {
  return 'Obliczenia nie zakończyły się wynikiem. Sprawdź konfigurację układu i dane katalogowe.';
}

async function waitForExecutionRunTerminalState(
  initialRun: ExecutionRun,
  pollRunStatus: (runId: string) => Promise<ExecutionRun>,
): Promise<ExecutionRun> {
  let current = initialRun;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    if (isTerminalExecutionRun(current)) {
      return current;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 750));
    current = await pollRunStatus(current.id);
  }
  return current;
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

function resolveRouteRunId(
  params: URLSearchParams,
  fallbackRunId: string | null,
  activeCaseId: string | null,
): string | null {
  const routeRunId = params.get('run')?.trim();
  if (routeRunId) {
    return routeRunId;
  }

  const routeCaseId = params.get('case')?.trim();
  if (routeCaseId && routeCaseId !== activeCaseId) {
    return null;
  }

  return fallbackRunId?.trim() || null;
}

type AnalysisRunSnapshotPayload = {
  run_id?: unknown;
  snapshot_id?: unknown;
  snapshot?: unknown;
};

const EMPTY_LOGICAL_VIEWS = {
  trunks: [],
  branches: [],
  secondary_connectors: [],
  terminals: [],
};

function isEnergyNetworkModel(value: unknown): value is EnergyNetworkModel {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<EnergyNetworkModel>;
  return (
    !!candidate.header
    && Array.isArray(candidate.buses)
    && Array.isArray(candidate.branches)
    && Array.isArray(candidate.substations)
  );
}

function hasTopologicalContent(snapshot: EnergyNetworkModel | null | undefined): boolean {
  if (!snapshot) {
    return false;
  }
  return [
    snapshot.sources,
    snapshot.buses,
    snapshot.branches,
    snapshot.transformers,
    snapshot.loads,
    snapshot.generators,
    snapshot.substations,
    snapshot.bays,
    snapshot.junctions,
    snapshot.branch_points,
    snapshot.corridors,
    snapshot.line_runs,
  ].some((items) => Array.isArray(items) && items.length > 0);
}

function createAnalysisRunSnapshotEnvelope(
  snapshot: EnergyNetworkModel,
  snapshotId: string,
): DomainOpResponseV1 {
  const stableSnapshotId = snapshotId || snapshot.header.hash_sha256;
  return {
    snapshot,
    logical_views: snapshot.logical_views ?? EMPTY_LOGICAL_VIEWS,
    readiness: {
      ready: true,
      blockers: [],
      warnings: [],
    },
    fix_actions: [],
    changes: {
      created_element_ids: [],
      updated_element_ids: [],
      deleted_element_ids: [],
    },
    selection_hint: null,
    audit_trail: [],
    domain_events: [],
    materialized_params: {
      lines_sn: {},
      transformers_sn_nn: {},
    },
    layout: {
      layout_hash: stableSnapshotId,
      layout_version: 'analysis-run-snapshot',
    },
  };
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
  const initialRouteRef = useRef(getCurrentHashRoute());
  const initialSearchParamsRef = useRef(getCurrentSearchParams());
  const [route, setRoute] = useState(() => getCurrentHashRoute());
  const [hashVersion, setHashVersion] = useState(0);
  // Globalne panele UX (G7 Help, G8 Settings, G5 Onboarding)
  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  // Auto-show onboarding przy pierwszym uruchomieniu
  useEffect(() => {
    if (!isOnboardingCompleted()) {
      setOnboardingOpen(true);
    }
  }, []);

  // Globalny F1 → Help, Ctrl+, → Settings
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        setHelpOpen(true);
      } else if (e.key === ',' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setSettingsOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  const setActiveMode = useAppStateStore((state) => state.setActiveMode);
  const setActiveArea = useAppStateStore((state) => state.setActiveArea);
  const activeArea = useAppStateStore((state) => state.activeArea);
  const activeProjectId = useAppStateStore((state) => state.activeProjectId);
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const activeCaseName = useAppStateStore((state) => state.activeCaseName);
  const activeCaseKind = useAppStateStore((state) => state.activeCaseKind);
  const activeAnalysisType = useAppStateStore((state) => state.activeAnalysisType);
  const activeRunId = useAppStateStore((state) => state.activeRunId);
  const activeSnapshotId = useAppStateStore((state) => state.activeSnapshotId);
  const setActiveProject = useAppStateStore((state) => state.setActiveProject);
  const setActiveCase = useAppStateStore((state) => state.setActiveCase);
  const setActiveRun = useAppStateStore((state) => state.setActiveRun);
  const setActiveSnapshot = useAppStateStore((state) => state.setActiveSnapshot);
  const setActiveCaseResultStatus = useAppStateStore((state) => state.setActiveCaseResultStatus);
  const executionActiveRunId = useExecutionRunsStore((state) => state.activeRunId);
  const setExecutionActiveRun = useExecutionRunsStore((state) => state.setActiveRun);
  const readiness = useSnapshotStore((state) => state.readiness);
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const snapshotError = useSnapshotStore((state) => state.error);
  const refreshSnapshotFromBackend = useSnapshotStore((state) => state.refreshFromBackend);
  const setSnapshotFromResponse = useSnapshotStore((state) => state.setSnapshot);
  const resetSnapshotStore = useSnapshotStore((state) => state.reset);
  const createAndExecuteRun = useExecutionRunsStore((state) => state.createAndExecuteRun);
  const pollRunStatus = useExecutionRunsStore((state) => state.pollRunStatus);
  const appReady = useAppReady();
  const projectName = useActiveProjectName();
  const openRouteSurface = useNetworkBuildStore((state) => state.openRouteSurface);
  const clearRouteManagedSurface = useNetworkBuildStore((state) => state.clearRouteManagedSurface);
  const selectedElement = useSelectionStore((state) => state.selectedElement);
  const effectiveRunId = activeRunId ?? executionActiveRunId;

  const restoreAnalysisRunSnapshot = useCallback(
    (routeRunId: string, expectedCaseId: string | null) => {
      void Promise.all([
        fetch(`/api/analysis-runs/${routeRunId}/snapshot`)
          .then((response) => (response.ok ? response.json() : null)),
        fetchAnalysisRunHealth(routeRunId),
      ])
        .then(([payload, runHealth]: [AnalysisRunSnapshotPayload | null, AnalysisRunHealth | null]) => {
          const currentParams = getCurrentSearchParams();
          const currentRunParam = currentParams.get('run')?.trim() || null;
          const currentState = useAppStateStore.getState();
          const currentExecutionRunId = useExecutionRunsStore.getState().activeRunId;
          const runStillActive = currentRunParam
            ? currentRunParam === routeRunId
            : currentState.activeRunId === routeRunId || currentExecutionRunId === routeRunId;
          const currentCaseParam = currentParams.get('case')?.trim() || null;
          const caseStillActive = !expectedCaseId
            || currentCaseParam === expectedCaseId
            || currentState.activeCaseId === expectedCaseId;
          if (!runStillActive || !caseStillActive) {
            return;
          }

          const fallbackCaseId = expectedCaseId ?? currentState.activeCaseId;
          if (isAnalysisRunMissing(runHealth)) {
            setActiveRun(null);
            setExecutionActiveRun(null);
            setActiveSnapshot(null);
            setActiveCaseResultStatus('NONE');
            if (clearRunParamFromCurrentHash(routeRunId)) {
              setHashVersion((current) => current + 1);
            }
            if (fallbackCaseId && !hasTopologicalContent(useSnapshotStore.getState().snapshot)) {
              void refreshSnapshotFromBackend(fallbackCaseId);
            }
            return;
          }

          const snapshotId = typeof payload?.snapshot_id === 'string'
            ? payload.snapshot_id.trim()
            : '';
          const failedRun = isFailedAnalysisRun(null, runHealth);
          if (snapshotId) {
            setActiveSnapshot(snapshotId);
            setActiveCaseResultStatus(failedRun ? 'NONE' : 'FRESH');
          }
          if (isEnergyNetworkModel(payload?.snapshot) && hasTopologicalContent(payload.snapshot)) {
            setSnapshotFromResponse(
              createAnalysisRunSnapshotEnvelope(payload.snapshot, snapshotId),
            );
            return;
          }

          if (fallbackCaseId && !hasTopologicalContent(useSnapshotStore.getState().snapshot)) {
            void refreshSnapshotFromBackend(fallbackCaseId);
          }
        })
        .catch(() => {
          const fallbackCaseId = expectedCaseId ?? useAppStateStore.getState().activeCaseId;
          if (fallbackCaseId && !hasTopologicalContent(useSnapshotStore.getState().snapshot)) {
            void refreshSnapshotFromBackend(fallbackCaseId);
          }
        });
    },
    [
      refreshSnapshotFromBackend,
      setActiveCaseResultStatus,
      setActiveRun,
      setActiveSnapshot,
      setExecutionActiveRun,
      setHashVersion,
      setSnapshotFromResponse,
    ],
  );

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
    // updateUrlWithSelection używa replaceState, więc odtwarzamy stan trasy,
    // gdy hash zmienił się bez natywnego zdarzenia hashchange.
    const currentRoute = getCurrentHashRoute();
    if (currentRoute !== route) {
      setRoute(currentRoute);
      setHashVersion((current) => current + 1);
    }
  });

  useEffect(() => {
    const routeArea = resolveRouteArea(route);
    if (routeArea) {
      setActiveArea(routeArea);
    }
  }, [hashVersion, route, setActiveArea]);

  useEffect(() => {
    if (!isSldRoute(route)) {
      return;
    }
    const explicitRunId = getCurrentSearchParams().get('run')?.trim();
    if (explicitRunId && activeArea !== 'SCHEMAT_TOPOLOGIA') {
      setActiveArea('SCHEMAT_TOPOLOGIA');
    }
  }, [activeArea, hashVersion, route, setActiveArea]);

  useEffect(() => {
    const params = getCurrentSearchParams();
    const routeProjectId = params.get('project')?.trim();
    if (!routeProjectId) {
      return;
    }

    if (routeProjectId !== activeProjectId) {
      setActiveProject(routeProjectId, null);
    }

    if (routeProjectId === activeProjectId && projectName && projectName !== routeProjectId) {
      return;
    }

    let cancelled = false;
    void getProject(routeProjectId)
      .then((project) => {
        if (!cancelled && useAppStateStore.getState().activeProjectId === routeProjectId) {
          setActiveProject(routeProjectId, project.name);
        }
      })
      .catch(() => {
        if (!cancelled && !useAppStateStore.getState().activeProjectName) {
          setActiveProject(routeProjectId, routeProjectId);
        }
      });

    return () => {
      cancelled = true;
    };
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
    const routeProjectId = params.get('project')?.trim();
    const routeRunId = params.get('run')?.trim();
    const routeCaseAlreadyHydrated =
      routeCaseId === activeCaseId
      && Boolean(activeProjectId)
      && (
        Boolean(routeRunId)
        || Boolean(routeProjectId && routeProjectId === activeProjectId)
      );
    if (!routeCaseId || routeCaseAlreadyHydrated) {
      return;
    }

    if (!routeProjectId) {
      let cancelled = false;

      void getStudyCase(routeCaseId)
        .then((studyCase) => {
          if (cancelled) {
            return;
          }

          const current = useAppStateStore.getState();
          const projectChanged = current.activeProjectId !== studyCase.project_id;
          const caseChanged = current.activeCaseId !== studyCase.id;

          if (projectChanged) {
            setActiveProject(studyCase.project_id, null);
          }

          void getProject(studyCase.project_id)
            .then((project) => {
              if (!cancelled && useAppStateStore.getState().activeProjectId === studyCase.project_id) {
                setActiveProject(studyCase.project_id, project.name);
              }
            })
            .catch(() => {
              if (
                !cancelled
                && useAppStateStore.getState().activeProjectId === studyCase.project_id
                && !useAppStateStore.getState().activeProjectName
              ) {
                setActiveProject(studyCase.project_id, null);
              }
            });

          if (projectChanged || caseChanged) {
            resetSnapshotStore();
            setActiveSnapshot(null);
          }

          setActiveCase(
            studyCase.id,
            studyCase.name || 'Zakres obliczeń z adresu',
            'ShortCircuitCase',
            studyCase.result_status,
          );
        })
        .catch(() => {
          if (cancelled || useAppStateStore.getState().activeCaseId === routeCaseId) {
            return;
          }

          resetSnapshotStore();
          setActiveSnapshot(null);
          setActiveCase(
            routeCaseId,
            'Zakres obliczeń z adresu',
            'ShortCircuitCase',
            'NONE',
          );
        });

      return () => {
        cancelled = true;
      };
    }

    resetSnapshotStore();
    setActiveSnapshot(null);
    setActiveCase(
      routeCaseId,
      'Zakres obliczeń z adresu',
      'ShortCircuitCase',
      'NONE',
    );
  }, [
    activeCaseId,
    hashVersion,
    resetSnapshotStore,
    route,
    setActiveCase,
    setActiveProject,
    setActiveSnapshot,
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
    const routeRunId = resolveRouteRunId(
      getCurrentSearchParams(),
      activeRunId ?? executionActiveRunId,
      activeCaseId,
    );
    if (routeRunId) {
      return;
    }

    void refreshSnapshotFromBackend(activeCaseId);
  }, [
    activeCaseId,
    activeRunId,
    executionActiveRunId,
    hashVersion,
    refreshSnapshotFromBackend,
    route,
    snapshot,
    snapshotError,
  ]);

  useEffect(() => {
    const snapshotHash = snapshot?.header?.hash_sha256;
    if (!snapshotHash || activeSnapshotId) {
      return;
    }

    setActiveSnapshot(snapshotHash);
  }, [activeSnapshotId, setActiveSnapshot, snapshot?.header?.hash_sha256]);

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
    const explicitRouteRunId = params.get('run')?.trim() || null;
    const routeRunId = explicitRouteRunId && (isResultsRoute(route) || isSldRoute(route))
      ? explicitRouteRunId
      : isResultsRoute(route)
      ? resolveRouteRunId(params, activeRunId ?? executionActiveRunId, activeCaseId)
      : null;
    if (!routeRunId) {
      if (activeRawRunId) clearRawOverlay();
      return;
    }
    if (routeRunId === activeRawRunId) return;
    void (async () => {
      try {
        const runHealth = await fetchAnalysisRunHealth(routeRunId);
        if (!hasRenderableRunResults(runHealth)) {
          if (activeRawRunId) clearRawOverlay();
          return;
        }
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
  }, [
    activeCaseId,
    activeRawRunId,
    activeRunId,
    clearRawOverlay,
    executionActiveRunId,
    hashVersion,
    route,
    setRawOverlay,
  ]);

  useEffect(() => {
    const params = getCurrentSearchParams();
    const routeRunId = resolveRouteRunId(
      params,
      activeRunId ?? executionActiveRunId,
      activeCaseId,
    );
    if (isSldRoute(route)) {
      if (routeRunId) {
        if (activeRunId !== routeRunId) {
          setActiveRun(routeRunId);
        }
        if (executionActiveRunId !== routeRunId) {
          setExecutionActiveRun(routeRunId);
        }
        if (isUuid(routeRunId)) {
          restoreAnalysisRunSnapshot(routeRunId, params.get('case')?.trim() || activeCaseId);
        }
      }
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
      if (activeRunId !== routeRunId) {
        setActiveRun(routeRunId);
      }
      if (executionActiveRunId !== routeRunId) {
        setExecutionActiveRun(routeRunId);
      }
      if (isUuid(routeRunId)) {
        restoreAnalysisRunSnapshot(routeRunId, params.get('case')?.trim() || activeCaseId);
      }
      openRouteSurface(ANALYSIS_SURFACE_SCREEN_CODE, {
        titlePl: 'Analizy techniczne',
        tabId: resolveAnalysisSurfaceTab(route, params),
        entityRef: params.get('sel'),
        subjectKind: 'analysis_run',
        subjectRef: routeRunId,
        payload: {
          runId: routeRunId,
          legacyRoute: route,
          selectedName: params.get('name'),
          selectedType: params.get('type'),
        },
      });
      return;
    }
    if (route === ROUTES.REPORT.hash) {
      const initialReportParams = initialRouteRef.current === ROUTES.REPORT.hash
        ? initialSearchParamsRef.current
        : null;
      const routeSelectionRef =
        params.get('sel') ?? selectedElement?.id ?? initialReportParams?.get('sel') ?? null;
      const routeSelectionName =
        params.get('name') ?? selectedElement?.name ?? initialReportParams?.get('name') ?? null;
      const routeSelectionType =
        params.get('type') ?? selectedElement?.type ?? initialReportParams?.get('type') ?? null;
      if (activeRunId !== routeRunId) {
        setActiveRun(routeRunId);
      }
      if (executionActiveRunId !== routeRunId) {
        setExecutionActiveRun(routeRunId);
      }
      if (isUuid(routeRunId)) {
        restoreAnalysisRunSnapshot(routeRunId, params.get('case')?.trim() || activeCaseId);
      }
      openRouteSurface(REPORT_SURFACE_SCREEN_CODE, {
        entityRef: routeSelectionRef,
        subjectKind: 'report',
        subjectRef: routeRunId,
        payload: {
          runId: routeRunId,
          selectedName: routeSelectionName,
          selectedType: routeSelectionType,
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
    activeCaseId,
    activeRunId,
    clearRouteManagedSurface,
    executionActiveRunId,
    hashVersion,
    openRouteSurface,
    route,
    restoreAnalysisRunSnapshot,
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
      notify('Wybierz aktywny zakres obliczeń.', 'error');
      return;
    }

    if (readiness && !readiness.ready) {
      const firstBlocker = readiness.blockers?.[0];
      notify(
        firstBlocker
          ? sanitizePublicReadinessMessage(firstBlocker.message_pl)
          : 'Dokończ konfigurację układu przed analizą.',
        'warning',
      );
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
      const createdRun = await createAndExecuteRun(caseIdForRun, { analysis_type: analysisType });
      const run = await waitForExecutionRunTerminalState(createdRun, pollRunStatus);
      const runHealth = await fetchAnalysisRunHealth(run.id);
      setActiveRun(run.id);

      if (isFailedAnalysisRun(run, runHealth)) {
        setActiveCaseResultStatus('NONE');
        notify(analysisRunFailureMessage(), 'error');
        return;
      }

      if (run.status !== 'DONE') {
        setActiveCaseResultStatus('NONE');
        notify('Obliczenia są nadal wykonywane. Wyniki zostaną pokazane po zakończeniu solvera.', 'info');
        return;
      }

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
    pollRunStatus,
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
      titlePl: 'Analizy techniczne',
      tabId: ANALYSIS_ROUTE_DEFAULT_TAB,
      entityRef: params.get('sel'),
      subjectKind: 'analysis_run',
      subjectRef: effectiveRunId,
      payload: {
        runId: effectiveRunId,
        legacyRoute: ROUTES.ANALYSIS.hash,
        selectedName: params.get('name'),
        selectedType: params.get('type'),
      },
    });
    navigateToResults({ runId: effectiveRunId });
  }, [effectiveRunId, navigateToResults, openRouteSurface]);

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
      {/* Globalne panele UX dostępne z każdego ekranu */}
      <HelpPanel isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
      <SettingsPanel isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <OnboardingTour isOpen={onboardingOpen} onClose={() => setOnboardingOpen(false)} />
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
      case 'overlay':
        setActiveArea('SCHEMAT_TOPOLOGIA');
        openSldOverlayFromCurrentContext();
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
        openRouteSurface(ANALYSIS_SURFACE_SCREEN_CODE, {
          titlePl: 'Analizy techniczne',
          tabId: ANALYSIS_ROUTE_DEFAULT_TAB,
          entityRef: getCurrentSearchParams().get('sel'),
          subjectKind: 'analysis_run',
          subjectRef: effectiveRunId,
          payload: {
            runId: effectiveRunId,
            legacyRoute: ROUTES.ANALYSIS.hash,
            selectedName: getCurrentSearchParams().get('name'),
            selectedType: getCurrentSearchParams().get('type'),
          },
        });
        navigateToAnalysis({ runId: effectiveRunId });
        break;
      case 'compare':
        navigateToCompare({ runId: effectiveRunId });
        break;
      case 'report':
      case 'export':
        setActiveArea('RAPORTY_UZASADNIENIA');
        openRouteSurface(REPORT_SURFACE_SCREEN_CODE, {
          entityRef: getCurrentSearchParams().get('sel'),
          subjectKind: 'report',
          subjectRef: effectiveRunId,
          payload: {
            runId: effectiveRunId,
            selectedName: getCurrentSearchParams().get('name'),
            selectedType: getCurrentSearchParams().get('type'),
          },
        });
        navigateToReport({ runId: effectiveRunId });
        break;
      case 'variants':
        navigateToVariants({ caseId: activeCaseId });
        break;
      case 'readiness':
      case 'show-readiness':
        setActiveArea('WYNIKI_ANALIZY');
        openRouteSurface('E-04', {
          titlePl: 'Konfiguracja techniczna układu',
          tabId: 'kontrola',
          subjectKind: 'analysis_case',
          subjectRef: activeCaseId,
          route: 'analysis',
          openMode: 'replace_right_panel',
        });
        navigateToAnalysis({ caseId: activeCaseId, runId: effectiveRunId });
        break;
      case 'proof':
      case 'whitebox':
        navigateToProof({ runId: effectiveRunId });
        break;
      case 'protection':
        navigateToResultsProtection({ runId: effectiveRunId });
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
    handleCalculate,
    effectiveRunId,
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
  // Zadanie 11 planu UI/UX 100%: dev tool ukryty domyślnie za feature flag.
  if (route === '#enm-inspector' && featureFlags.ENM_INSPECTOR_VISIBLE) {
    return wrapWithReadyIndicator(
      <CanonicalLayout {...layoutProps}>
        <EnmInspectorPage />
      </CanonicalLayout>
    );
  }

  // Kreator Stacji KOMPLETNY v2 — 17-krokowy flow inżynierski
  // (UI/UX 100% Zadanie 9 — wpięcie StationWizardSurface).
  if (route === '#kreator-stacji-v2') {
    return wrapWithReadyIndicator(
      <CanonicalLayout {...layoutProps}>
        <StationWizardSurface />
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

