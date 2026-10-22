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
 *   ui2 wg `mostObszarow.TRASY_KANONICZNE` (pole `wygaszona`) (bez powierzchni mostu),
 * - restoreAnalysisRunSnapshot + handleCalculate / handleViewResults,
 * - ładowanie nakładki wyników (raw overlay) dla biegu OGLĄDANEGO z magazynu kontekstu
 *   wyniku (karta K8: `?run=` jest jednym ze źródeł wyboru, nie osobną prawdą),
 * - synchronizacja trybu (MODEL_EDIT / RESULT_VIEW) i przestrzeni z trasą,
 * - routing powierzchni PV/BESS/FW z selekcji na SLD,
 * - synchronizacja selekcji z URL (useUrlSelectionSync).
 *
 * Hook korzysta WYŁĄCZNIE z istniejących store'ów (zero shadow-state).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useAppStateStore } from '../../ui/app-state';
import { modelNiepusty } from '../../ui/topology/pustoscModelu';
import { useSnapshotStore } from '../../ui/topology/snapshotStore';
import {
  runIdOgladanyTeraz,
  useKontekstWynikuStore,
  useNakladkaBieguOgladanego,
  useRunIdOgladany,
} from '../wyniki/kontekst/kontekstWyniku';
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
import { przestrzenDlaTrasy, wpisTrasyWygaszonej, type WpisTrasy } from './mostObszarow';
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

// S9-11 / P-8: pustość modelu z JEDNEGO źródła (`ui/topology/pustoscModelu`) —
// lokalna lista rodzin (bez `measurements`/`protection_assignments`/
// `shunt_capacitors`/`connection_nodes`) była trzecim, rozbieżnym werdyktem
// tej samej klasy.
function hasTopologicalContent(snapshot: EnergyNetworkModel | null | undefined): boolean {
  return modelNiepusty(snapshot);
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
  const activeProjectId = useAppStateStore((state) => state.activeProjectId);
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const activeAnalysisType = useAppStateStore((state) => state.activeAnalysisType);
  const activeSnapshotId = useAppStateStore((state) => state.activeSnapshotId);
  const setActiveProject = useAppStateStore((state) => state.setActiveProject);
  const setActiveCase = useAppStateStore((state) => state.setActiveCase);
  const setActiveSnapshot = useAppStateStore((state) => state.setActiveSnapshot);
  const setActiveCaseResultStatus = useAppStateStore((state) => state.setActiveCaseResultStatus);
  // Karta K8: bieg oglądany pochodzi WYŁĄCZNIE z magazynu kontekstu wyniku.
  const runIdOgladany = useRunIdOgladany();
  const wybierzBieg = useKontekstWynikuStore((state) => state.wybierzBieg);
  const porzucOczekujacy = useKontekstWynikuStore((state) => state.porzucOczekujacy);
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
          const runStillActive = currentRunParam
            ? currentRunParam === routeRunId
            : runIdOgladanyTeraz() === routeRunId;
          const currentCaseParam = currentParams.get('case')?.trim() || null;
          const caseStillActive = !expectedCaseId
            || currentCaseParam === expectedCaseId
            || currentState.activeCaseId === expectedCaseId;
          if (!runStillActive || !caseStillActive) {
            return;
          }

          const fallbackCaseId = expectedCaseId ?? currentState.activeCaseId;
          if (isAnalysisRunMissing(runHealth)) {
            porzucOczekujacy(routeRunId);
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
      porzucOczekujacy,
      refreshReadinessFromBackend,
      refreshSnapshotFromBackend,
      setActiveCaseResultStatus,
      setActiveSnapshot,
      setAnalysisRunSnapshot,
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

  // D1 (JEDEN KANON NAWIGACJI): KAŻDA trasa hash ląduje w swojej przestrzeni
  // wg jednej tabeli `mostObszarow.TRASY_KANONICZNE`. Wcześniej przestrzeń
  // ustawiały tylko cztery trasy wygaszone plus `#analysis`/`#results`, więc
  // wejście starym adresem (`#report`, `#dashboard`, `#fault-scenarios`,
  // `#enm-inspector`, `#catalog`, `#sld-view`) zostawiało nawigację powłoki na
  // POPRZEDNIEJ przestrzeni — użytkownik widział treść jednego etapu, a pasek
  // nawigacji podświetlał inny. Trasa bez mapowania (`''` = sam kontekst,
  // adres spoza kanonu) przestrzeni nie rusza.
  //
  // Zakładkę warsztatu „Wyniki" niesie ten sam wiersz tabeli (trasy wygaszone).
  // Bez pętli z mostem tras AppRoot: `mostTrasyPrzestrzeni` działa tylko przy
  // JAWNYM wyborze przestrzeni (AppShell.selectSpace), nie przy zmianie store'a,
  // a ustawienie tej samej przestrzeni po hashu jest idempotentne.
  useEffect(() => {
    const przestrzen = przestrzenDlaTrasy(route);
    if (przestrzen == null) {
      return;
    }
    const shell = useShellStore.getState();
    if (shell.activeSpace !== przestrzen) {
      shell.setActiveSpace(przestrzen);
    }
    const zakladka = wpisTrasyWygaszonej(route)?.zakladkaWynikow;
    if (zakladka) {
      shell.setWynikiTab(zakladka);
    }
    // Parytet zachowania sprzed D1: panel budowy modelu w lewym doku schematu
    // był stanem CHWILOWYM — każda zmiana adresu przywracała panel toru pracy
    // (bo obszar był wtedy wyprowadzany z trasy). Zachowujemy to wprost.
    if (shell.panelSchematu !== 'schemat') {
      shell.setPanelSchematu('schemat');
    }
  }, [hashVersion, route]);

  useEffect(() => {
    if (!activeCaseId || snapshot || snapshotError) {
      return;
    }
    // Migawkę modelu zastępuje podgląd biegu WYŁĄCZNIE przy jawnym wskazaniu biegu
    // adresem (`?run=`); bieg wybrany w aplikacji nie podmienia modelu roboczego.
    const routeRunId = resolveRouteRunId(getCurrentSearchParams(), null, activeCaseId);
    if (routeRunId) {
      return;
    }

    void refreshSnapshotFromBackend(activeCaseId);
  }, [
    activeCaseId,
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

  // Nakładka wyników schematu (K30-3 / NO-GO #9, V12K-088) — karta K8: bieg nakładki
  // to bieg OGLĄDANY z magazynu kontekstu wyniku, na KAŻDEJ trasie (dotąd na schemacie
  // nakładka wczytywała się tylko z jawnego `?run=`, choć tor biegu obiecywał, że
  // „odświeży się sama"). Wynik pochodzi z JEDNEJ pamięci `results/v1` magazynu
  // (`useWynikBiegu`) — ten sam odczyt, który karmi panel dolny i inspektor. Bieg
  // nieaktualny NIE jest ukrywany: kanwa oznacza go predykatem świeżości (K8 §0 pkt 3).
  // Typowana rodzina OverlayPayloadV1 jest karmiona tym samym wynikiem (rekoncyliacja
  // `adaptRawOverlayToTyped`).
  const loadTypedOverlay = useOverlayStore((state) => state.loadOverlay);
  const clearTypedOverlay = useOverlayStore((state) => state.clearOverlay);
  const setRawOverlay = useRawResultOverlayStore((state) => state.setPayload);
  const clearRawOverlay = useRawResultOverlayStore((state) => state.clear);
  const activeRawRunId = useRawResultOverlayStore((state) => state.payload?.run_id ?? null);
  const nakladka = useNakladkaBieguOgladanego();
  useEffect(() => {
    const { payload, runId, stan } = nakladka;
    if (!runId || !payload) {
      // Brak biegu, wczytywanie albo błąd odczytu: nakładka INNEGO biegu nie zostaje
      // na schemacie pod etykietą pochodzenia — schemat pokazuje tylko bieg oglądany.
      if (activeRawRunId && (activeRawRunId !== runId || stan?.rodzaj === 'blad')) {
        clearRawOverlay();
        clearTypedOverlay();
      }
      return;
    }
    if (payload.run_id === activeRawRunId) return;
    setRawOverlay(payload);
    const typed = adaptRawOverlayToTyped(payload);
    if (typed) loadTypedOverlay(typed);
    else clearTypedOverlay();
  }, [activeRawRunId, clearRawOverlay, clearTypedOverlay, loadTypedOverlay, nakladka, setRawOverlay]);

  // Adres → magazyn kontekstu: `?run=` jest JEDNYM ze źródeł wyboru biegu („url").
  // Stosowany raz na wartość parametru w danym przypadku — późniejszy wybór
  // użytkownika (panel, ekran, pasek) nie jest nadpisywany przy każdej zmianie
  // trasy. Zmiana przypadku (hydracja `?case=`) czyści kontekst, więc klucz
  // obejmuje przypadek i wskazanie z adresu wraca po przełączeniu.
  const ostatniBiegZAdresuRef = useRef<string | null>(null);
  useEffect(() => {
    const routeRunId = getCurrentSearchParams().get('run')?.trim() || null;
    const klucz = routeRunId ? `${activeCaseId ?? ''}|${routeRunId}` : null;
    if (klucz === ostatniBiegZAdresuRef.current) return;
    ostatniBiegZAdresuRef.current = klucz;
    if (routeRunId) wybierzBieg(routeRunId, 'url');
  }, [activeCaseId, hashVersion, route, wybierzBieg]);

  useEffect(() => {
    const params = getCurrentSearchParams();
    // Bieg JAWNIE wskazany adresem — tylko on podmienia model na podgląd migawki biegu.
    const biegZAdresu = resolveRouteRunId(params, null, activeCaseId);
    // Bieg powierzchni trasowych: wskazany adresem albo oglądany (magazyn kontekstu).
    const routeRunId = resolveRouteRunId(params, runIdOgladany, activeCaseId);
    const odtworzMigawkeBiegu = () => {
      if (isUuid(biegZAdresu)) {
        restoreAnalysisRunSnapshot(biegZAdresu, params.get('case')?.trim() || activeCaseId);
      }
    };
    if (isSldRoute(route)) {
      odtworzMigawkeBiegu();
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
    const ladowisko: WpisTrasy | null = wpisTrasyWygaszonej(route);
    if (ladowisko) {
      if (ladowisko.przestrzen === 'wyniki') {
        odtworzMigawkeBiegu();
      }
      clearRouteManagedSurface();
      return;
    }
    if (
      route === ROUTES.ANALYSIS.hash
      || isAnalysisRouteAlias(route)
    ) {
      odtworzMigawkeBiegu();
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
      odtworzMigawkeBiegu();
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
    // obie trasy są wygaszone (patrz `mostObszarow.TRASY_KANONICZNE` (pole `wygaszona`) wyżej).
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
    clearRouteManagedSurface,
    hashVersion,
    openRouteSurface,
    route,
    restoreAnalysisRunSnapshot,
    runIdOgladany,
    selectedElement,
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
    navigateToResults({ runId: runIdOgladany });
  }, [runIdOgladany]);

  return { route, handleCalculate, handleViewResults };
}
