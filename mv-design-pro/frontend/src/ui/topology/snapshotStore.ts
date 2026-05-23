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
  setSnapshot: (response: DomainOpResponseV1) => void;
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

function snapshotResponseState(response: DomainOpResponseV1) {
  return {
    snapshot: response.snapshot,
    logicalViews: response.logical_views,
    readiness: response.readiness,
    fixActions: response.fix_actions,
    materializedParams: response.materialized_params,
    layout: response.layout,
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
  logicalViews: null,
  readiness: null,
  fixActions: [],
  materializedParams: null,
  layout: null,
  selectionHint: null,
  lastChanges: null,
  lastEvents: [],
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

  setSnapshot: (response: DomainOpResponseV1) => {
    set({
      caseId: get().caseId,
      snapshot: response.snapshot,
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

  clearError: () => set({ error: null, errorCode: null }),

  reset: () =>
    set({
      caseId: null,
      snapshot: null,
      logicalViews: null,
      readiness: null,
      fixActions: [],
      materializedParams: null,
      layout: null,
      selectionHint: null,
      lastChanges: null,
      lastEvents: [],
      operationHistory: [],
      loading: false,
      error: null,
      errorCode: null,
    }),
}));
