/**
 * useLegacyOrchestrator (karta E1.7a) — headless orkiestracja starego wejścia aplikacji.
 *
 * EKSTRAKCJA 1:1 z `src/App.tsx` (decyzja architekta, karta E1.7 §3b):
 * bezwizualne efekty powłoki zostały PRZENIESIONE (nie skopiowane) do tego hooka,
 * aby przełączenie na nową powłokę (E1.7b/c) mogło współdzielić orkiestrację
 * bez duplikowania stanu. Zero nowej semantyki: trasy, kolejność efektów,
 * zależności i zachowanie są identyczne jak w App.tsx sprzed ekstrakcji.
 *
 * Zakres wyniesionych efektów:
 * - hydracja store'ów z URL: ?project / ?case / ?run / ?snapshot (+ nazwy z API),
 * - deep-linki #analysis / #proof / #report / #catalog / #variants / #case-config /
 *   #switchgear przez openRouteSurface (WorkspaceSurfaceRouter),
 * - restoreAnalysisRunSnapshot + handleCalculate / handleViewResults,
 * - ładowanie nakładki wyników (raw overlay) dla ?run,
 * - synchronizacja trybu (MODEL_EDIT / RESULT_VIEW) i obszaru z trasą,
 * - routing powierzchni PV/BESS/FW z selekcji na SLD,
 * - synchronizacja selekcji z URL (useUrlSelectionSync).
 *
 * Hook korzysta WYŁĄCZNIE z istniejących store'ów (zero shadow-state).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useAppStateStore } from '../../ui/app-state';
import { useSnapshotStore } from '../../ui/topology/snapshotStore';
import { useExecutionRunsStore } from '../../ui/study-cases/runStore';
import { getStudyCase } from '../../ui/study-cases/api';
import { getProject } from '../../ui/projects/api';
import { adaptRawOverlayToTyped, useOverlayStore } from '../../ui/sld-overlay';
import { useRawResultOverlayStore } from '../../ui/sld-overlay/rawResultOverlayStore';
import type { ExecutionAnalysisType, ExecutionRun } from '../../ui/study-cases/types';
import {
  ROUTES,
  getCurrentHashRoute,
  getCurrentSearchParams,
  isAnalysisRouteAlias,
  navigateToResults,
  resolveAnalysisRouteAliasTab,
  useUrlSelectionSync,
} from '../../ui/navigation';
import { notify } from '../../ui/notifications/store';
import { sanitizePublicReadinessMessage } from '../../ui/shared/publicReadinessMessage';
import { useNetworkBuildStore } from '../../ui/network-build/networkBuildStore';
import { useSelectionStore } from '../../ui/selection/store';
import type { AreaId } from '../../ui/navigation/areaRegistry';
import type { SelectedElement } from '../../ui/types';
import type { DomainOpResponseV1, EnergyNetworkModel } from '../../types/enm';
import {
  ANALYSIS_SURFACE_SCREEN_CODE,
  ANALYSIS_ROUTE_DEFAULT_TAB,
  REPORT_SURFACE_SCREEN_CODE,
} from '../../ui/workspace/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function useActiveProjectName(): string | null {
  const store = useAppStateStore();
  return (store as { activeProjectName?: string | null }).activeProjectName ?? null;
}

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

export interface LegacyOrchestratorApi {
  /** Aktywna trasa hash (bez parametrów zapytania). */
  route: string;
  /** Uruchomienie obliczeń dla aktywnego zakresu (dawne App.handleCalculate). */
  handleCalculate: () => Promise<void>;
  /** Przejście do kanonicznej powierzchni wyników E-24 (dawne App.handleViewResults). */
  handleViewResults: () => void;
}

export function useLegacyOrchestrator(): LegacyOrchestratorApi {
  // NAVIGATION_SELECTOR_UI: Use getCurrentHashRoute to strip query params from hash
  const initialRouteRef = useRef(getCurrentHashRoute());
  const initialSearchParamsRef = useRef(getCurrentSearchParams());
  const [route, setRoute] = useState(() => getCurrentHashRoute());
  const [hashVersion, setHashVersion] = useState(0);

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
  // V12K-088 (Opcja 2): backend `overlay_payload` ma `elements` jako dict; typowana
  // rodzina OverlayPayloadV1 (useOverlayStore + V12OverlayModeController + runtime)
  // oczekuje tablicy. Adapter `adaptRawOverlayToTyped` rekoncyliuje oba kontrakty —
  // dotąd `loadOverlay` nie był wołany w produkcji (stub „future PR-16"), więc
  // typowana warstwa nie miała producenta. Teraz karmimy OBIE ścieżki tym samym
  // wynikiem backendu (raw store dla v2/v3 canvas; typed store dla trybu overlay).
  const loadTypedOverlay = useOverlayStore((state) => state.loadOverlay);
  const clearTypedOverlay = useOverlayStore((state) => state.clearOverlay);
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
      if (activeRawRunId) {
        clearRawOverlay();
        clearTypedOverlay();
      }
      return;
    }
    if (routeRunId === activeRawRunId) return;
    void (async () => {
      try {
        const runHealth = await fetchAnalysisRunHealth(routeRunId);
        if (!hasRenderableRunResults(runHealth)) {
          if (activeRawRunId) {
        clearRawOverlay();
        clearTypedOverlay();
      }
          return;
        }
        const res = await fetch(`/api/execution/runs/${routeRunId}/results/v1`);
        if (!res.ok) return;
        const data = await res.json();
        const payload = data?.overlay_payload;
        if (payload && payload.elements && typeof payload.elements === 'object') {
          const rawPayload = {
            run_id: payload.run_id ?? routeRunId,
            analysis_type: payload.analysis_type ?? data?.analysis_type ?? 'LOAD_FLOW',
            elements: payload.elements,
            quality_status: data?.global_results?.quality_status ?? null,
            proof_status: data?.global_results?.proof_status ?? null,
            // OVERLAY-TIMESTAMP: czas ukończenia biegu z topu ResultSetV1 (nie z
            // overlay_payload) — pochodzenie wyniku pokazuje moduł + przebieg + CZAS.
            run_finished_at: data?.run_finished_at ?? null,
          };
          setRawOverlay(rawPayload);
          // V12K-088: karmimy typowaną warstwę tym samym wynikiem (rekoncyliacja).
          const typed = adaptRawOverlayToTyped(rawPayload);
          if (typed) loadTypedOverlay(typed);
          else clearTypedOverlay();
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
    clearTypedOverlay,
    executionActiveRunId,
    hashVersion,
    loadTypedOverlay,
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
      // Phase 0 #2: canonical code zamiast legacy alias 'variants_runs'
      openRouteSurface('E-08', {
        subjectKind: 'helper_context',
        subjectRef: params.get('case') ?? params.get('snapshot') ?? 'variants-context',
      });
      return;
    }
    if (route === ROUTES.CATALOG.hash) {
      // Phase 0 #2: canonical code zamiast legacy alias 'catalog_admin'
      openRouteSurface('E-38', {
        subjectKind: 'helper_context',
        subjectRef: params.get('sel') ?? 'catalog-root',
      });
      return;
    }
    if (route === ROUTES.CASE_CONFIG.hash) {
      // Phase 0 #2: canonical code zamiast legacy alias 'case_context'
      openRouteSurface('E-07', {
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

  return { route, handleCalculate, handleViewResults };
}
