/**
 * Snapshot Store V1 — Zustand store for V1 domain operation state.
 *
 * Holds the full canonical response envelope from POST /enm/domain-ops:
 * - snapshot (EnergyNetworkModel)
 * - logical_views (trunks, branches, secondary_connectors, terminals)
 * - readiness + fix_actions
 * - materialized_params (frozen catalog copies)
 * - layout (deterministic hash)
 * - selection_hint
 * - domain_events
 *
 * SLD = pure function(snapshot, logical_views, overlay)
 * No local topology graph state — everything derived from backend snapshot.
 *
 * DETERMINISTIC: same operation → same snapshot → same SLD.
 * BINDING: PL labels, no codenames.
 */

import { create } from 'zustand';
import type {
  DomainOpResponseV1,
  EnergyNetworkModel,
  LogicalViewsV1,
  MaterializedParams,
  LayoutInfo,
  ReadinessInfo,
  FixAction,
  SelectionHint,
  ChangesInfo,
  DomainEvent,
  TerminalRef,
} from '../../types/enm';
import type { SemanticIssue } from '../../types/domainOps';
import { publicBusName } from '../shared/enmVisibility';
import { executeDomainOp } from './domainApi';
import { notify } from '../notifications/store';
import { getOperationSuccessMessage } from './operationSuccessMessages';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface SnapshotState {
  /** Case currently owning the in-memory ENM snapshot. */
  caseId: string | null;
  /** ENM snapshot — single source of truth. */
  snapshot: EnergyNetworkModel | null;
  /**
   * JEDNO źródło prawdy o rewizji BIEŻĄCEGO modelu (karta S9-11, W-5 audytu
   * `docs/sld/AUDYT_JAKOSCI_SLD_2026-08.md`). `snapshot.header.revision` opisuje
   * migawkę WYŚWIETLANĄ — a ta bywa PODGLĄDEM PRZEBIEGU (`setAnalysisRunSnapshot`),
   * czyli modelem SPRZED biegu. Konsumenci liczący świeżość wyników z rewizji
   * wyświetlanej migawki dawali sprzeczne werdykty (chip „nieustalone" vs
   * nagłówek wyników „aktualne" — trzy prawdy stanu z pomiaru audytu).
   *
   * Pole aktualizuje KAŻDA ścieżka, która poznaje bieżący model (operacja
   * domenowa, refresh, odczyt gotowości przy podglądzie przebiegu) — i ŻADNA,
   * która wgrywa podgląd. `null` = rewizja nieznana (uczciwe „nieustalone",
   * nigdy wartość zmyślona). PREDYKATY PARAMI: wszystkie werdykty świeżości
   * czytają TO pole, nie liczą własnej rewizji.
   */
  rewizjaBiezacegoModelu: number | null;
  /** Deterministic logical views (trunks, branches, terminals). */
  logicalViews: LogicalViewsV1 | null;
  /** Analysis readiness (blockers + warnings). */
  readiness: ReadinessInfo | null;
  /** Navigation fix actions for blockers. */
  fixActions: FixAction[];
  /** Frozen catalog parameter copies. */
  materializedParams: MaterializedParams | null;
  /** Deterministic topology layout hash. */
  layout: LayoutInfo | null;
  /** Last selection hint from operation. */
  selectionHint: SelectionHint | null;
  /** Last operation changes (created/updated/deleted). */
  lastChanges: ChangesInfo | null;
  /** Last domain events. */
  lastEvents: DomainEvent[];
  /** Semantic issues z ostatniej operacji (validate_semantic post-hook). */
  lastSemanticIssues: SemanticIssue[];
  /** History of domain operations for the snapshot timeline. */
  operationHistory: SnapshotOperationHistoryEntry[];
  /** Loading state. */
  loading: boolean;
  /** Last error message (null = no error). */
  error: string | null;
  /** Last error code from domain operation. */
  errorCode: string | null;

  // Actions
  executeDomainOperation: (
    caseId: string,
    opName: string,
    payload: Record<string, unknown>,
  ) => Promise<DomainOpResponseV1 | null>;
  /** Refresh snapshot from backend without mutation (calls refresh_snapshot op). */
  refreshFromBackend: (caseId: string) => Promise<DomainOpResponseV1 | null>;
  /**
   * Odczyt gotowości BIEŻĄCEGO modelu bez podmiany widocznej migawki.
   * Używane, gdy w store'ie leży migawka przebiegu (podgląd wyniku), a gotowość
   * jeszcze nikt nie policzył (zimne wejście na głęboki link przebiegu).
   */
  refreshReadinessFromBackend: (caseId: string) => Promise<DomainOpResponseV1 | null>;
  setSnapshot: (response: DomainOpResponseV1) => void;
  /**
   * Zapis migawki PRZEBIEGU (podgląd modelu, na którym policzono wynik).
   * NIE dotyka `readiness`/`fixActions` — gotowość opisuje bieżący model i nie
   * wolno jej wyprowadzać z migawki przebiegu (audyt szczytu 2026-08-01, D5).
   */
  setAnalysisRunSnapshot: (snapshot: EnergyNetworkModel, snapshotId: string) => void;
  clearError: () => void;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Selectors (pure, derived from snapshot)
// ---------------------------------------------------------------------------

/** Get all bus refs from snapshot, sorted. */
export function selectBusRefs(snapshot: EnergyNetworkModel | null): string[] {
  if (!snapshot) return [];
  return (snapshot.buses ?? [])
    .map((b) => b.ref_id)
    .sort();
}

/** Get bus options for dropdowns (ref_id + name + voltage). */
export function selectBusOptions(
  snapshot: EnergyNetworkModel | null,
): Array<{ ref_id: string; name: string; voltage_kv: number }> {
  if (!snapshot) return [];
  return (snapshot.buses ?? [])
    .map((b) => ({ ref_id: b.ref_id, name: publicBusName(b), voltage_kv: b.voltage_kv }))
    .sort((a, b) => a.ref_id.localeCompare(b.ref_id));
}

/** Get trunk views from logical views. */
export function selectTrunks(logicalViews: LogicalViewsV1 | null) {
  return logicalViews?.trunks ?? [];
}

/** Get branch views from logical views. */
export function selectBranches(logicalViews: LogicalViewsV1 | null) {
  return logicalViews?.branches ?? [];
}

/** Get all terminals from logical views. */
export function selectTerminals(logicalViews: LogicalViewsV1 | null): TerminalRef[] {
  return logicalViews?.terminals ?? [];
}

/** Get open terminals (available for click-to-extend). */
export function selectOpenTerminals(logicalViews: LogicalViewsV1 | null): TerminalRef[] {
  return (logicalViews?.terminals ?? []).filter((t) => t.status === 'OTWARTY');
}

/** Is the network analysis-ready? */
export function selectIsReady(readiness: ReadinessInfo | null): boolean {
  return readiness?.ready ?? false;
}

/** Get blocker count. */
export function selectBlockerCount(readiness: ReadinessInfo | null): number {
  return readiness?.blockers?.length ?? 0;
}

export interface SnapshotOperationHistoryEntry {
  id: string;
  timestamp: string;
  operation: string;
  operationLabel?: string | null;
  elementRef: string | null;
  elementName: string | null;
  status: 'success' | 'error' | 'pending';
  createdElementIds?: string[];
  updatedElementIds?: string[];
  deletedElementIds?: string[];
}

/**
 * Most referencja → nazwa obiektu na schemacie (warstwa prezentacji).
 *
 * Był tu od początku, ale WYŁĄCZNIE prywatnie — dziennik operacji był jedynym
 * konsumentem, więc każdy inny ekran pokazywał surowe referencje
 * (`gpz/8600…/section/001/bus_sn`). Karta V126-JEZYK: ekran wyników nazywa
 * obiekty tak, jak nazywa je schemat; brak nazwy = uczciwy `null`, nigdy
 * nazwa zmyślona z referencji.
 */
export function selectElementName(
  snapshot: EnergyNetworkModel | null,
  elementRef: string | null,
): string | null {
  return resolveElementName(snapshot, elementRef);
}

function resolveElementName(
  snapshot: EnergyNetworkModel | null,
  elementRef: string | null,
): string | null {
  if (!snapshot || !elementRef) {
    return null;
  }

  const candidates = [
    ...(snapshot.buses ?? []),
    ...(snapshot.branches ?? []),
    ...(snapshot.transformers ?? []),
    ...(snapshot.sources ?? []),
    ...(snapshot.loads ?? []),
    ...(snapshot.generators ?? []),
    ...(snapshot.substations ?? []),
    ...(snapshot.bays ?? []),
    ...(snapshot.junctions ?? []),
    ...(snapshot.branch_points ?? []),
    ...(snapshot.corridors ?? []),
    ...(snapshot.measurements ?? []),
    ...(snapshot.protection_assignments ?? []),
  ];

  const match = candidates.find((item) => item.ref_id === elementRef || item.id === elementRef);
  return match?.name ?? null;
}

function createHistoryEntry(
  operation: string,
  payload: Record<string, unknown>,
  response: DomainOpResponseV1 | null,
  status: 'success' | 'error',
): SnapshotOperationHistoryEntry {
  const elementRef =
    response?.selection_hint?.element_id
    ?? (typeof payload.element_ref === 'string' ? payload.element_ref : null)
    ?? (typeof payload.bus_ref === 'string' ? payload.bus_ref : null)
    ?? response?.changes.created_element_ids?.[0]
    ?? null;

  return {
    id: `${operation}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    operation,
    elementRef,
    elementName: resolveElementName(response?.snapshot ?? null, elementRef),
    status,
    createdElementIds: response?.changes.created_element_ids ?? [],
    updatedElementIds: response?.changes.updated_element_ids ?? [],
    deletedElementIds: response?.changes.deleted_element_ids ?? [],
  };
}

const ANALYSIS_RUN_LAYOUT_VERSION = 'analysis-run-snapshot';

/**
 * Rewizja bieżącego modelu z odpowiedzi operacji domenowej / odświeżenia.
 * Jedyny dozwolony dostawca pola `rewizjaBiezacegoModelu` (odpowiedź backendu
 * ZAWSZE opisuje bieżący model — nigdy podgląd przebiegu).
 */
function rewizjaZOdpowiedzi(response: DomainOpResponseV1 | null | undefined): number | null {
  const revision = response?.snapshot?.header?.revision;
  return typeof revision === 'number' ? revision : null;
}

function snapshotResponseState(response: DomainOpResponseV1) {
  return {
    snapshot: response.snapshot,
    logicalViews: response.logical_views,
    readiness: response.readiness,
    fixActions: response.fix_actions,
    materializedParams: response.materialized_params,
    layout: response.layout,
    rewizjaBiezacegoModelu: rewizjaZOdpowiedzi(response),
  };
}

function snapshotHashFromResponse(response: DomainOpResponseV1 | null | undefined): string {
  const hash = (response?.snapshot?.header as { hash_sha256?: unknown } | undefined)?.hash_sha256;
  return typeof hash === 'string' ? hash : '';
}

function errorStatus(err: unknown): number | null {
  if (typeof err !== 'object' || err === null) return null;
  const status = (err as { status?: unknown }).status;
  return typeof status === 'number' ? status : null;
}

function errorCode(err: unknown): string {
  if (typeof err !== 'object' || err === null) return 'NETWORK_ERROR';
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' ? code : 'NETWORK_ERROR';
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isSnapshotVersionConflict(err: unknown): boolean {
  if (errorStatus(err) === 409) return true;
  return /konflikt wersji|snapshot.*conflict|409 conflict/i.test(errorMessage(err));
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useSnapshotStore = create<SnapshotState>((set, get) => ({
  caseId: null,
  snapshot: null,
  rewizjaBiezacegoModelu: null,
  logicalViews: null,
  readiness: null,
  fixActions: [],
  materializedParams: null,
  layout: null,
  selectionHint: null,
  lastChanges: null,
  lastEvents: [],
  lastSemanticIssues: [],
  operationHistory: [],
  loading: false,
  error: null,
  errorCode: null,

  executeDomainOperation: async (
    caseId: string,
    opName: string,
      payload: Record<string, unknown>,
  ) => {
    set({ caseId, loading: true, error: null, errorCode: null });
    try {
      const response = await executeDomainOp(
        caseId,
        opName,
        payload,
        get().snapshot?.header.hash_sha256 ?? '',
      );

      if (get().caseId !== caseId) {
        return response;
      }

      if (response.error) {
        set({
          operationHistory: [
            createHistoryEntry(opName, payload, response, 'error'),
            ...get().operationHistory,
          ],
          lastSemanticIssues: response.semantic_issues ?? [],
          loading: false,
          error: response.error,
          errorCode: response.error_code ?? null,
        });
        return response;
      }

      set({
        ...snapshotResponseState(response),
        selectionHint: response.selection_hint,
        lastChanges: response.changes,
        lastEvents: response.domain_events,
        lastSemanticIssues: response.semantic_issues ?? [],
        operationHistory: [
          createHistoryEntry(opName, payload, response, 'success'),
          ...get().operationHistory,
        ],
        loading: false,
        error: null,
        errorCode: null,
      });

      // Centralny toast sukcesu — jeden punkt dla WSZYSTKICH operacji domenowych
      // (kryt. #2: każda akcja ma feedback sukcesu). Operacje ciche (refresh/undo)
      // pomijane przez getOperationSuccessMessage.
      const successMessage = getOperationSuccessMessage(opName);
      if (successMessage) {
        notify(successMessage, 'success');
      }

      return response;
    } catch (err) {
      if (get().caseId !== caseId) {
        return null;
      }
      if (opName !== 'refresh_snapshot' && isSnapshotVersionConflict(err)) {
        try {
          const refreshResponse = await executeDomainOp(caseId, 'refresh_snapshot', {}, '');
          if (get().caseId !== caseId) {
            return null;
          }
          if (refreshResponse.error) {
            set({
              loading: false,
              error: refreshResponse.error,
              errorCode: refreshResponse.error_code ?? null,
            });
            return null;
          }

          set({
            ...snapshotResponseState(refreshResponse),
            selectionHint: null,
            lastChanges: null,
            lastEvents: [],
            error: null,
            errorCode: null,
          });

          const retryResponse = await executeDomainOp(
            caseId,
            opName,
            payload,
            snapshotHashFromResponse(refreshResponse),
          );

          if (get().caseId !== caseId) {
            return retryResponse;
          }

          if (retryResponse.error) {
            set({
              operationHistory: [
                createHistoryEntry(opName, payload, retryResponse, 'error'),
                ...get().operationHistory,
              ],
              loading: false,
              error: retryResponse.error,
              errorCode: retryResponse.error_code ?? null,
            });
            return retryResponse;
          }

          set({
            ...snapshotResponseState(retryResponse),
            selectionHint: retryResponse.selection_hint,
            lastChanges: retryResponse.changes,
            lastEvents: retryResponse.domain_events,
            lastSemanticIssues: retryResponse.semantic_issues ?? [],
            operationHistory: [
              createHistoryEntry(opName, payload, retryResponse, 'success'),
              ...get().operationHistory,
            ],
            loading: false,
            error: null,
            errorCode: null,
          });

          return retryResponse;
        } catch (retryErr) {
          if (get().caseId !== caseId) {
            return null;
          }
          const retryMsg = errorMessage(retryErr);
          set({
            operationHistory: [
              createHistoryEntry(opName, payload, null, 'error'),
              ...get().operationHistory,
            ],
            loading: false,
            error: retryMsg,
            errorCode: errorCode(retryErr),
          });
          return null;
        }
      }
      const errorMsg = errorMessage(err);
      set({
        operationHistory: [
          createHistoryEntry(opName, payload, null, 'error'),
          ...get().operationHistory,
        ],
        loading: false,
        error: errorMsg,
        errorCode: errorCode(err),
      });
      return null;
    }
  },

  refreshFromBackend: async (caseId: string) => {
    set({ caseId, loading: true, error: null, errorCode: null });
    try {
      const response = await executeDomainOp(
        caseId,
        'refresh_snapshot',
        {},
        get().snapshot?.header.hash_sha256 ?? '',
      );

      if (get().caseId !== caseId) {
        return response;
      }

      if (response.error) {
        set({ loading: false, error: response.error, errorCode: response.error_code ?? null });
        return response;
      }

      set({
        ...snapshotResponseState(response),
        selectionHint: null,
        lastChanges: null,
        lastEvents: [],
        loading: false,
        error: null,
        errorCode: null,
      });

      return response;
    } catch (err) {
      if (get().caseId !== caseId) {
        return null;
      }
      set({ loading: false, error: errorMessage(err), errorCode: errorCode(err) });
      return null;
    }
  },

  refreshReadinessFromBackend: async (caseId: string) => {
    try {
      // Bez `snapshot_base_hash`: w store'ie może leżeć migawka przebiegu, a jej
      // odcisk nie jest odciskiem bieżącego modelu — pytamy wyłącznie o gotowość.
      const response = await executeDomainOp(caseId, 'refresh_snapshot', {}, '');
      if (response.error) {
        return response;
      }
      if (get().caseId !== null && get().caseId !== caseId) {
        return response;
      }
      // Podmieniamy WYŁĄCZNIE gotowość, akcje naprawcze i rewizję bieżącego
      // modelu — widoczna migawka (podgląd przebiegu) zostaje nietknięta.
      // Rewizja pochodzi z tej samej odpowiedzi `refresh_snapshot`, która
      // opisuje BIEŻĄCY model: to domyka lukę W-5 przy zimnym wejściu na
      // głęboki link przebiegu (dotąd chrom nie miał ŻADNEGO źródła bieżącej
      // rewizji i chip trwał na „nieustalone" — dług S9-3-DLUG-W5).
      set({
        readiness: response.readiness,
        fixActions: response.fix_actions,
        rewizjaBiezacegoModelu: rewizjaZOdpowiedzi(response) ?? get().rewizjaBiezacegoModelu,
      });
      return response;
    } catch {
      // Gotowości nie udało się ustalić — zostaje stan nieustalony (`null`),
      // nigdy wartość zmyślona.
      return null;
    }
  },

  setSnapshot: (response: DomainOpResponseV1) => {
    set({
      caseId: get().caseId,
      snapshot: response.snapshot,
      rewizjaBiezacegoModelu: rewizjaZOdpowiedzi(response),
      logicalViews: response.logical_views,
      readiness: response.readiness,
      fixActions: response.fix_actions,
      materializedParams: response.materialized_params,
      layout: response.layout,
      selectionHint: response.selection_hint,
      lastChanges: response.changes,
      lastEvents: response.domain_events,
      operationHistory: [],
    });
  },

  setAnalysisRunSnapshot: (snapshot: EnergyNetworkModel, snapshotId: string) => {
    // Końcówka `/api/analysis-runs/{run}/snapshot` niesie wyłącznie `snapshot`
    // — bez widoków logicznych, zmian i sparametryzowanych kopii katalogu.
    // Nie zgadujemy ich: puste struktury zamiast wartości zmyślonych.
    // `rewizjaBiezacegoModelu` CELOWO nietknięta (W-5): migawka przebiegu to
    // PODGLĄD modelu, na którym policzono wynik — jej rewizja nie opisuje
    // bieżącego modelu i nie wolno jej za niego podstawić.
    set({
      caseId: get().caseId,
      snapshot,
      logicalViews: snapshot.logical_views ?? {
        trunks: [],
        branches: [],
        secondary_connectors: [],
        terminals: [],
      },
      materializedParams: { lines_sn: {}, transformers_sn_nn: {} },
      layout: {
        layout_hash: snapshotId || snapshot.header.hash_sha256,
        layout_version: ANALYSIS_RUN_LAYOUT_VERSION,
      },
      selectionHint: null,
      lastChanges: { created_element_ids: [], updated_element_ids: [], deleted_element_ids: [] },
      lastEvents: [],
      operationHistory: [],
    });
  },

  clearError: () => set({ error: null, errorCode: null }),

  reset: () =>
    set({
      caseId: null,
      snapshot: null,
      rewizjaBiezacegoModelu: null,
      logicalViews: null,
      readiness: null,
      fixActions: [],
      materializedParams: null,
      layout: null,
      selectionHint: null,
      lastChanges: null,
      lastEvents: [],
      lastSemanticIssues: [],
      operationHistory: [],
      loading: false,
      error: null,
      errorCode: null,
    }),
}));
