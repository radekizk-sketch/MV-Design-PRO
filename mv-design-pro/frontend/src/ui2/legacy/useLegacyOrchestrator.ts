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
 * - deep-linki #analysis / #proof / #report / #catalog przez
 *   openRouteSurface (WorkspaceSurfaceRouter); K8: #variants, #case-config,
 *   #power-flow-results i #protection-results są WYGASZONE — lądują w oknach
 *   ui2 wg `LADOWISKA_WYGASZONYCH_TRAS` (bez powierzchni mostu),
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
import type { ExecutionAnalysisType } from '../../ui/study-cases/types';
import {
  ROUTES,
  getCurrentHashRoute,
  getCurrentSearchParams,
  isAnalysisRouteAlias,
  navigateToResults,
  resolveAnalysisRouteAliasTab,
  useUrlSelectionSync,
} from '../../ui/navigation';
// K6 (H-5 dźwignia 2): tor wykonania przebiegu żyje w przestrzeni „Obliczenia"
// (JEDNA prawda dla menu, paska tytułowego i akcji stanów zerowych ekranów
// wyników). Tu pozostaje wyłącznie delegacja z rodzajem z `activeAnalysisType`.
import {
  fetchAnalysisRunHealth,
  isFailedAnalysisRun,
  isUuid,
  uruchomObliczenie,
  type AnalysisRunHealth,
} from '../spaces/obliczenia/uruchomObliczenie';
import { useShellStore } from '../shell/useShellStore';
import { useNetworkBuildStore } from '../../ui/network-build/networkBuildStore';
import { useSelectionStore } from '../../ui/selection/store';
import type { AreaId } from '../../ui/navigation/areaRegistry';
import type { SelectedElement } from '../../ui/types';
import type { EnergyNetworkModel } from '../../types/enm';
import {
  ANALYSIS_SURFACE_SCREEN_CODE,
  REPORT_SURFACE_SCREEN_CODE,
} from '../../ui/workspace/types';

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

/**
 * K8 (wygaszenie mostów o pełnym parytecie) — trasy mostu, których dostawcą
 * jest DZIŚ okno ui2, a nie powierzchnia trasowa. Wpis = lądowisko:
 * przestrzeń powłoki + opcjonalna zakładka warsztatu (wzorzec lądowiska K3-A1:
 * hash zostaje jedyną prawdą deep-linku, zmienia się TYLKO dostawca widoku).
 *
 * Uzasadnienie parytetu (inwentarz `docs/uiux/INWENTARZ_PARYTETU_MOSTOW_2026-07.md`):
 *  - `#power-flow-results` most renderował GENERYCZNĄ tabelę analityczną E-35
 *    (te same wiersze dla każdej zakładki) — okno „Rozpływ mocy" ui2 daje
 *    tabele szyn i gałęzi, profil napięć i wejście w dowód (nadzbiór),
 *  - `#protection-results` most też renderował generyczną tabelę (zakładka
 *    'protection' nie miała własnej gałęzi) — zakładka „Koordynacja
 *    zabezpieczeń" ui2 (EkranKoordynacji, dostawca E-28) daje realne krzywe
 *    TCC, marginesy CTI i nastawy (nadzbiór),
 *  - `#case-config` most otwierał powierzchnię E-07, dla której router NIE MA
 *    gałęzi renderu — panel prawy pokazywał sam nagłówek bez treści; przestrzeń
 *    „Obliczenia" ui2 (menedżer przypadków + przebiegi) jest jedynym realnym
 *    dostawcą tej zdolności,
 *  - `#variants` most otwierał kartę read-only E-08 (metryki przebiegów +
 *    cztery przyciski nawigacyjne); wszystkie te dane i przejścia są w
 *    przestrzeni „Obliczenia" (historia przebiegów) i w przestrzeniach
 *    docelowych przycisków (Wyniki / Dokumentacja / Gotowość).
 */
const LADOWISKA_WYGASZONYCH_TRAS: Readonly<
  Record<string, { przestrzen: 'wyniki' | 'obliczenia'; zakladkaWynikow?: string }>
> = {
  '#power-flow-results': { przestrzen: 'wyniki', zakladkaWynikow: 'rozplyw' },
  '#protection-results': { przestrzen: 'wyniki', zakladkaWynikow: 'koordynacja' },
  '#case-config': { przestrzen: 'obliczenia' },
  '#variants': { przestrzen: 'obliczenia' },
};

/** Lądowisko ui2 wygaszonej trasy mostu (null = trasa nadal w moście). */
function ladowiskoWygaszonejTrasy(
  route: string,
): { przestrzen: 'wyniki' | 'obliczenia'; zakladkaWynikow?: string } | null {
  return LADOWISKA_WYGASZONYCH_TRAS[route] ?? null;
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
  /** Przejście do wyników — warsztat ui2 przez trasę #analysis (K3-A1). */
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
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const snapshotError = useSnapshotStore((state) => state.error);
  const refreshSnapshotFromBackend = useSnapshotStore((state) => state.refreshFromBackend);
  const setAnalysisRunSnapshot = useSnapshotStore((state) => state.setAnalysisRunSnapshot);
  const refreshReadinessFromBackend = useSnapshotStore(
    (state) => state.refreshReadinessFromBackend,
  );
  const resetSnapshotStore = useSnapshotStore((state) => state.reset);
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
            // Migawka przebiegu to PODGLĄD modelu, na którym policzono wynik —
            // nie niesie gotowości (końcówka zwraca wyłącznie `run_id`,
            // `snapshot_id`, `snapshot`). Zapis nie rusza `readiness`: gotowość
            // opisuje BIEŻĄCY model (jedna prawda — `useSnapshotStore.readiness`).
            setAnalysisRunSnapshot(payload.snapshot, snapshotId);
            if (fallbackCaseId && useSnapshotStore.getState().readiness == null) {
              // Zimne wejście na głęboki link przebiegu: gotowości bieżącego
              // modelu nikt jeszcze nie policzył — pytamy o nią backend, zamiast
              // ją zmyślać. Nieudany odczyt zostawia stan nieustalony (`null`).
              void refreshReadinessFromBackend(fallbackCaseId);
            }
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
      refreshReadinessFromBackend,
      refreshSnapshotFromBackend,
      setActiveCaseResultStatus,
      setActiveRun,
      setActiveSnapshot,
      setAnalysisRunSnapshot,
      setExecutionActiveRun,
      setHashVersion,
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

  // K3-A1 (jedno lądowisko wyników): warsztat przestrzeni „Wyniki" renderuje
  // się wyłącznie przy activeSpace='wyniki' (LegacyWarsztat), a sam hash tego
  // NIE ustawiał — zimny deep-link `#analysis?run=…` i DONE-owe
  // `navigateToResults` lądowały w moście legacy (hub E-35).
  //
  // K8 (wygaszenie mostów): ten sam efekt obsługuje teraz WYGASZONE trasy —
  // wpis w `LADOWISKA_WYGASZONYCH_TRAS` niesie przestrzeń i (dla wyników)
  // zakładkę warsztatu, więc zimny deep-link starym adresem ląduje w oknie
  // ui2 z zachowanym kontekstem (projekt/przypadek/przebieg hydratuje K2 i
  // efekt trasowy niżej). #proof/#compare nadal mają zakładki ui2 wyłącznie
  // przez Ctrl+K (bez pełnego parytetu trasy — patrz inwentarz K8).
  // Bez pętli z mostem tras AppRoot: `mostTrasyPrzestrzeni` działa tylko przy
  // JAWNYM wyborze przestrzeni (AppShell.selectSpace), nie przy zmianie store'a,
  // a ustawienie tej samej przestrzeni po hashu jest idempotentne.
  useEffect(() => {
    const ladowisko = ladowiskoWygaszonejTrasy(route);
    if (ladowisko) {
      const shell = useShellStore.getState();
      if (shell.activeSpace !== ladowisko.przestrzen) {
        shell.setActiveSpace(ladowisko.przestrzen);
      }
      if (ladowisko.zakladkaWynikow) {
        shell.setWynikiTab(ladowisko.zakladkaWynikow);
      }
      return;
    }
    if (route === ROUTES.ANALYSIS.hash || route === '#results') {
      const shell = useShellStore.getState();
      if (shell.activeSpace !== 'wyniki') {
        shell.setActiveSpace('wyniki');
      }
    }
  }, [hashVersion, route]);

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
    // K8: trasa WYGASZONA — kontekst przebiegu odtwarzamy tak samo jak dotąd
    // (deep-link `?run=`/`?case=` musi działać po staremu), ale powierzchni
    // mostu NIE otwieramy: lądowiskiem jest okno ui2, a zalegająca powierzchnia
    // trasowa przykryłaby je (klasa C) albo zajęła prawy panel (klasa B).
    const ladowisko = ladowiskoWygaszonejTrasy(route);
    if (ladowisko) {
      if (ladowisko.przestrzen === 'wyniki') {
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
      clearRouteManagedSurface();
      return;
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
    // K8: gałęzie tras #variants (E-08) i #case-config (E-07) USUNIĘTE —
    // obie trasy są wygaszone (patrz `LADOWISKA_WYGASZONYCH_TRAS` wyżej).
    if (route === ROUTES.CATALOG.hash) {
      // Phase 0 #2: canonical code zamiast legacy alias 'catalog_admin'
      openRouteSurface('E-38', {
        subjectKind: 'helper_context',
        subjectRef: params.get('sel') ?? 'catalog-root',
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

  /**
   * Uruchomienie obliczeń dla aktywnego zakresu — delegacja do JEDNEJ prawdy
   * toru wykonania (`spaces/obliczenia/uruchomObliczenie`). Rodzaj analizy
   * pochodzi z `activeAnalysisType` (menu / pasek tytułowy / wyszukiwarka);
   * ekrany wyników wołają ten sam tor z rodzajem WPROST (K6 / H-5).
   */
  const handleCalculate = useCallback(async () => {
    await uruchomObliczenie(mapAnalysisTypeToExecutionType(activeAnalysisType));
  }, [activeAnalysisType]);

  /**
   * Przejście do wyników (dawne App.handleViewResults). K3-A1: trasa
   * #analysis ustawia przestrzeń 'wyniki' (efekt wyżej) — lądowiskiem jest
   * warsztat ui2; powierzchnię mostu w zakładce „Pozostałe analizy" otwiera
   * efekt trasowy orkiestratora (bez dublowania openRouteSurface tutaj).
   */
  const handleViewResults = useCallback(() => {
    navigateToResults({ runId: effectiveRunId });
  }, [effectiveRunId, navigateToResults]);

  return { route, handleCalculate, handleViewResults };
}
