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
import { executeDomainOp } from './domainApi';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface SnapshotState {
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
  /**
   * R22: Lokalna mutacja snapshot przez updater function (immutable).
   * Używane przez UI modale (BayConfigModal, TransformerEditModal, CouplerEditModal)
   * dla natychmiastowego propagowania zmian do SLD canvas + inspector + property
   * grids — BEZ czekania na backend.
   *
   * Inv 4 (Case Immutability): wyniki obliczeń są INVALIDOWANE — `lastChanges`
   * zawiera affected_object_refs[] które blokuje przeszłe wyniki.
   *
   * Backend persistence dzieje się w R26+ przez executeDomainOperation.
   * Tymczasem patchSnapshot pozwala UI live-edit experience.
   */
  patchSnapshot: (
    updater: (snapshot: EnergyNetworkModel) => EnergyNetworkModel,
    affectedObjectRefs?: readonly string[],
  ) => void;
  /**
   * R33: Undo/redo dla patchSnapshot. Każdy patchSnapshot push'uje stary
   * snapshot na undo stack (max 20). undoSnapshot() restoruje poprzedni.
   * Hookpoint dla Ctrl+Z w canvas.
   *
   * Limit 20 zapobiega nieograniczonemu growth — operator dyspozytora
   * potrzebuje 1-3 undos w typowych workflows.
   */
  undoSnapshot: () => boolean;
  redoSnapshot: () => boolean;
  /** Read-only: ile undos dostępnych (dla UI button enable/disable). */
  canUndo: () => boolean;
  canRedo: () => boolean;
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
    .map((b) => ({ ref_id: b.ref_id, name: b.name, voltage_kv: b.voltage_kv }))
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

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/**
 * R33: Undo/redo stacks (closure scope — nie część SnapshotState żeby nie
 * zwiększać re-render'ów subskrybentów store przy push/pop).
 * Limit MAX_UNDO=20 (operator typically needs 1-3 undos w workflows).
 */
const MAX_UNDO = 20;
let undoStack: EnergyNetworkModel[] = [];
let redoStack: EnergyNetworkModel[] = [];

export const useSnapshotStore = create<SnapshotState>((set, get) => ({
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
    set({ loading: true, error: null, errorCode: null });
    try {
      const response = await executeDomainOp(
        caseId,
        opName,
        payload,
        get().snapshot?.header.hash_sha256 ?? '',
      );

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
        snapshot: response.snapshot,
        logicalViews: response.logical_views,
        readiness: response.readiness,
        fixActions: response.fix_actions,
        materializedParams: response.materialized_params,
        layout: response.layout,
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

      return response;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const errorCode =
        typeof (err as { code?: unknown }).code === 'string'
          ? (err as { code: string }).code
          : 'NETWORK_ERROR';
      set({
        operationHistory: [
          createHistoryEntry(opName, payload, null, 'error'),
          ...get().operationHistory,
        ],
        loading: false,
        error: errorMsg,
        errorCode,
      });
      return null;
    }
  },

  refreshFromBackend: async (caseId: string) => {
    set({ loading: true, error: null, errorCode: null });
    try {
      const response = await executeDomainOp(
        caseId,
        'refresh_snapshot',
        {},
        get().snapshot?.header.hash_sha256 ?? '',
      );

      if (response.error) {
        set({ loading: false, error: response.error, errorCode: response.error_code ?? null });
        return response;
      }

      set({
        snapshot: response.snapshot,
        logicalViews: response.logical_views,
        readiness: response.readiness,
        fixActions: response.fix_actions,
        materializedParams: response.materialized_params,
        layout: response.layout,
        selectionHint: null,
        lastChanges: null,
        lastEvents: [],
        loading: false,
        error: null,
        errorCode: null,
      });

      return response;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const errorCode =
        typeof (err as { code?: unknown }).code === 'string'
          ? (err as { code: string }).code
          : 'NETWORK_ERROR';
      set({ loading: false, error: errorMsg, errorCode });
      return null;
    }
  },

  setSnapshot: (response: DomainOpResponseV1) => {
    set({
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

  patchSnapshot: (
    updater: (snapshot: EnergyNetworkModel) => EnergyNetworkModel,
    affectedObjectRefs: readonly string[] = [],
  ) => {
    const current = get().snapshot;
    if (!current) return;
    /* R33: Push current na undo stack (max MAX_UNDO=20).
     * redoStack jest wyczyszczony — nowy patch zapisuje "głęboki" path. */
    undoStack.push(current);
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack = [];
    const updated = updater(current);
    /* lastChanges propagation — invaliduje wyniki w innych komponentach
     * (Inv 4 — Case Immutability Rule). */
    const changesInfo: ChangesInfo = {
      created_element_ids: [],
      updated_element_ids: [...affectedObjectRefs],
      deleted_element_ids: [],
    };
    set({
      snapshot: updated,
      lastChanges: changesInfo,
    });
  },

  undoSnapshot: () => {
    const previous = undoStack.pop();
    if (!previous) return false;
    const current = get().snapshot;
    if (current) redoStack.push(current);
    set({
      snapshot: previous,
      lastChanges: { created_element_ids: [], updated_element_ids: [], deleted_element_ids: [] },
    });
    return true;
  },

  redoSnapshot: () => {
    const next = redoStack.pop();
    if (!next) return false;
    const current = get().snapshot;
    if (current) {
      undoStack.push(current);
      if (undoStack.length > MAX_UNDO) undoStack.shift();
    }
    set({
      snapshot: next,
      lastChanges: { created_element_ids: [], updated_element_ids: [], deleted_element_ids: [] },
    });
    return true;
  },

  canUndo: () => undoStack.length > 0,
  canRedo: () => redoStack.length > 0,

  clearError: () => set({ error: null, errorCode: null }),

  reset: () => {
    /* R33: clear undo/redo stacks na reset */
    undoStack = [];
    redoStack = [];
    set({
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
    });
  },
}));
