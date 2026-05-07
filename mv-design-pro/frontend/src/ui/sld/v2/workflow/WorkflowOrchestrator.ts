/**
 * WorkflowOrchestrator — Phase 3 polish (operator-grade SLD plan v2).
 *
 * Łączy AppendOnEndpointController + ConsciousSplitController w jednym
 * orchestratorze. Reguły dispatch (Decision Tree):
 *   - Klik na bay (free endpoint) → AppendOnEndpoint workflow.
 *   - Klik na segment → ConsciousSplit workflow.
 *   - ESC w dowolnym workflow → cancel + return to idle.
 *   - Tylko jeden workflow aktywny w danym momencie (mutex).
 *
 * Generuje też CadGhost preview (do CadOverlay) na podstawie aktywnego stanu.
 *
 * Acceptance Invariants:
 *   - 4: Append-on-endpoint = domyślny workflow tworzenia stacji.
 *   - 5: Świadomy split = osobna komenda, z preview, z potwierdzeniem.
 *
 * @see SLD_STATION_APPEND_WORKFLOW.md
 * @see SLD_CONSCIOUS_SPLIT_WORKFLOW.md
 */

import {
  type AppendState,
  cancel as appendCancel,
  INITIAL_APPEND_STATE,
} from './AppendOnEndpointController';
import {
  type SplitState,
  cancelSplit,
  computeSplitPoint,
  INITIAL_SPLIT_STATE,
} from './ConsciousSplitController';
import type { CadGhost } from '../canvas/CadOverlay';
import type { Point } from '../geometry/routing';

export type ActiveWorkflow = 'idle' | 'append-on-endpoint' | 'conscious-split';

export interface OrchestratorState {
  readonly active: ActiveWorkflow;
  readonly append: AppendState;
  readonly split: SplitState;
}

export const INITIAL_ORCHESTRATOR_STATE: OrchestratorState = {
  active: 'idle',
  append: INITIAL_APPEND_STATE,
  split: INITIAL_SPLIT_STATE,
};

/**
 * Decision Tree dispatch:
 *  - bay clicked → activate append workflow (jeśli idle)
 *  - segment clicked → activate split workflow (jeśli idle)
 *  - inny aktywny workflow → reject (mutex)
 */
export type DispatchClick =
  | { kind: 'bay'; bayRef: string }
  | { kind: 'segment'; segmentRef: string }
  | { kind: 'background' };

export interface DispatchResult {
  readonly accepted: boolean;
  readonly activated: ActiveWorkflow;
  readonly rejectionReason?: string;
}

export function dispatchClick(state: OrchestratorState, click: DispatchClick): DispatchResult {
  if (state.active !== 'idle') {
    return {
      accepted: false,
      activated: state.active,
      rejectionReason: `Aktywny workflow '${state.active}' — anuluj go zanim rozpoczniesz nowy.`,
    };
  }
  if (click.kind === 'bay') {
    return { accepted: true, activated: 'append-on-endpoint' };
  }
  if (click.kind === 'segment') {
    return { accepted: true, activated: 'conscious-split' };
  }
  return { accepted: false, activated: 'idle', rejectionReason: 'Klik na tło — brak akcji.' };
}

/**
 * Globalna obsługa ESC: jeśli jakikolwiek workflow aktywny, cancel.
 * Idempotent — gdy idle, zwraca state niezmieniony.
 */
export function handleEsc(state: OrchestratorState): OrchestratorState {
  if (state.active === 'idle') return state;
  if (state.active === 'append-on-endpoint') {
    return {
      active: 'idle',
      append: appendCancel(state.append),
      split: state.split,
    };
  }
  if (state.active === 'conscious-split') {
    return {
      active: 'idle',
      append: state.append,
      split: cancelSplit(state.split),
    };
  }
  return state;
}

/**
 * Activate workflow (po dispatchClick accept). Pure: ustawia active flag,
 * nie tworzy nowego stanu inner FSM (to przekazane do controller).
 */
export function activateWorkflow(
  state: OrchestratorState,
  workflow: 'append-on-endpoint' | 'conscious-split',
): OrchestratorState {
  if (state.active !== 'idle' && state.active !== workflow) {
    // Mutex: nie pozwól zmienić workflow w środku innego.
    return state;
  }
  return { ...state, active: workflow };
}

/**
 * Update append state (delegate do AppendOnEndpointController).
 * Auto-deactivate jeśli append → idle/cancelled/committed/error.
 */
export function updateAppend(state: OrchestratorState, newAppend: AppendState): OrchestratorState {
  const next = { ...state, append: newAppend };
  if (
    newAppend.kind === 'idle'
    || newAppend.kind === 'cancelled'
    || newAppend.kind === 'committed'
    || newAppend.kind === 'error'
  ) {
    return { ...next, active: 'idle' };
  }
  if (state.active !== 'append-on-endpoint') {
    return { ...next, active: 'append-on-endpoint' };
  }
  return next;
}

/**
 * Update split state (delegate do ConsciousSplitController).
 * Auto-deactivate jeśli split → idle/cancelled/committed/error.
 */
export function updateSplit(state: OrchestratorState, newSplit: SplitState): OrchestratorState {
  const next = { ...state, split: newSplit };
  if (
    newSplit.kind === 'idle'
    || newSplit.kind === 'cancelled'
    || newSplit.kind === 'committed'
    || newSplit.kind === 'error'
  ) {
    return { ...next, active: 'idle' };
  }
  if (state.active !== 'conscious-split') {
    return { ...next, active: 'conscious-split' };
  }
  return next;
}

/**
 * Builds CadGhost array dla active workflow. Używane przez SldCanvasV2 +
 * CadOverlay do ghost preview operator-grade.
 */
export function buildCadGhosts(
  state: OrchestratorState,
  options: {
    readonly endpointPoint?: Point | null;
    readonly segmentFrom?: Point | null;
    readonly segmentTo?: Point | null;
  } = {},
): readonly CadGhost[] {
  const ghosts: CadGhost[] = [];
  if (state.active === 'append-on-endpoint') {
    const ap = state.append;
    if (ap.kind === 'preview_pending' || ap.kind === 'preview_ready' || ap.kind === 'choose_transformer') {
      const point = options.endpointPoint ?? { x: 0, y: 0 };
      let label: string | undefined;
      if (ap.kind === 'preview_pending' || ap.kind === 'preview_ready' || ap.kind === 'choose_transformer') {
        label = `Stacja: ${ap.station?.stationName ?? '...'}`;
      }
      ghosts.push({ kind: 'append-station', position: point, label });
    }
  } else if (state.active === 'conscious-split') {
    const sp = state.split;
    if (
      sp.kind === 'preview_pending'
      || sp.kind === 'preview_ready'
      || sp.kind === 'choose_inserted_object'
      || sp.kind === 'choose_station_type'
      || sp.kind === 'choose_transformer'
    ) {
      const segFrom = options.segmentFrom ?? { x: 0, y: 0 };
      const segTo = options.segmentTo ?? { x: 100, y: 0 };
      const splitPoint = computeSplitPoint(
        segFrom, segTo, sp.insertAt, sp.segment.lengthKm,
      );
      const kind: CadGhost['kind'] =
        sp.kind === 'choose_inserted_object'
          ? 'split-station' // domyślny do wyboru
          : sp.insertedKind === 'station' ? 'split-station'
          : sp.insertedKind === 'zksn' ? 'split-zksn'
          : sp.insertedKind === 'pole' ? 'split-pole'
          : 'split-station'; // nop fallback
      ghosts.push({
        kind,
        position: splitPoint,
        label: sp.kind === 'preview_ready' && sp.station
          ? `Podział: ${sp.station.stationName}`
          : undefined,
      });
    }
  }
  return ghosts;
}

/**
 * Helper: czy orchestrator jest w stanie aktywnego preview (gotowe do
 * commit/cancel decision)?
 */
export function isPreviewActive(state: OrchestratorState): boolean {
  if (state.active === 'append-on-endpoint') return state.append.kind === 'preview_ready';
  if (state.active === 'conscious-split') return state.split.kind === 'preview_ready';
  return false;
}
