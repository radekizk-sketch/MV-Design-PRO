/**
 * ConsciousSplitController — Phase 3 (operator-grade SLD plan v2).
 *
 * FSM workflow „Świadomy podział odcinka" — osobny od append-on-endpoint.
 * Pokazuje skutki elektryczne PRZED commitem (nie tylko hash).
 *
 * Workflow:
 *   1. IDLE
 *   2. PICK_SEGMENT — operator klika odcinek SN (kabel/linia)
 *   3. PICK_SPLIT_POINT — operator klika punkt podziału (snap to grid)
 *   4. CHOOSE_INSERTED_OBJECT — wybór: stacja / ZKSN / słup / NMO
 *   5. CHOOSE_STATION_TYPE — gdy inserted=station, wybór typu
 *   6. CHOOSE_TRANSFORMER — opcjonalny dla station
 *   7. PREVIEW_PENDING — wywołanie backend z dry_run=True
 *   8. PREVIEW_READY — operator widzi electrical_impact (halves, invalidated_results, ...)
 *   9. COMMIT lub CANCEL
 *
 * Czysta FSM (pure functions), bez React deps. Hookowane do
 * SldCommandService.command "conscious-split-on-segment".
 *
 * Acceptance Invariant 5: Świadomy split = osobna komenda, z preview,
 * z potwierdzeniem, audytowana.
 */

import type { Point } from '../geometry/routing';

export type InsertedObjectKind = 'station' | 'zksn' | 'pole' | 'nop';
export type SplitStationType = 'terminal' | 'inline' | 'branch' | 'sectional';

export const INSERTED_OBJECT_LABELS_PL: Readonly<Record<InsertedObjectKind, string>> = {
  station: 'Stacja transformatorowa',
  zksn: 'Złącze kablowe SN (ZKSN)',
  pole: 'Słup rozgałęźny',
  nop: 'Punkt normalnie otwarty (NMO)',
};

/** Stan FSM workflow conscious-split. */
export type SplitStateKind =
  | 'idle'
  | 'pick_segment'
  | 'pick_split_point'
  | 'choose_inserted_object'
  | 'choose_station_type'
  | 'choose_transformer'
  | 'preview_pending'
  | 'preview_ready'
  | 'committing'
  | 'committed'
  | 'cancelled'
  | 'error';

export interface SplitSegmentInfo {
  readonly segmentRef: string;
  readonly segmentType: 'cable' | 'line_overhead';
  readonly fromBusRef: string;
  readonly toBusRef: string;
  readonly lengthKm: number;
  readonly catalogRef?: string | null;
}

export interface SplitInsertAt {
  readonly mode: 'RATIO' | 'ODLEGLOSC_OD_POCZATKU_M';
  readonly value: number;
}

export interface SplitStationDraft {
  readonly stationName: string;
  readonly stationType: SplitStationType;
  readonly nnVoltageKv: number;
}

export interface SplitTransformerDraft {
  readonly transformerCatalogRef: string;
  readonly snMva?: number;
  readonly ukPercent?: number;
}

export interface SplitElectricalImpact {
  readonly topologyTypeChanged: boolean;
  readonly affectedObjectRefs: readonly string[];
  readonly halves: {
    readonly firstSegmentId: string | null;
    readonly secondSegmentId: string | null;
    readonly firstLengthKm: number;
    readonly secondLengthKm: number;
    readonly splitRatio: number;
  };
  readonly catalogInheritance: {
    readonly sourceSegmentRef: string | null;
    readonly sourceCatalogRef: string | null;
    readonly firstInherits: boolean;
    readonly secondInherits: boolean;
    readonly rule: string;
  };
  readonly invalidatedResults: readonly { runRef: string; runKind: string; reason: string }[];
  readonly affectedProofPacks: readonly { proofRef: string; proofKind: string; reason: string }[];
  readonly missingDataAfter: readonly string[];
  readonly affectedBuses: readonly string[];
}

export interface SplitPreview {
  readonly insertedStationId: string;
  readonly stationType: string;
  readonly electricalImpact: SplitElectricalImpact;
}

/* ---------------------------------------------------------------------------
   FSM States
   --------------------------------------------------------------------------- */

export interface SplitStateIdle { readonly kind: 'idle'; }
export interface SplitStatePickSegment { readonly kind: 'pick_segment'; }
export interface SplitStatePickSplitPoint {
  readonly kind: 'pick_split_point';
  readonly segment: SplitSegmentInfo;
}
export interface SplitStateChooseInsertedObject {
  readonly kind: 'choose_inserted_object';
  readonly segment: SplitSegmentInfo;
  readonly insertAt: SplitInsertAt;
}
export interface SplitStateChooseStationType {
  readonly kind: 'choose_station_type';
  readonly segment: SplitSegmentInfo;
  readonly insertAt: SplitInsertAt;
  readonly insertedKind: 'station';
}
export interface SplitStateChooseTransformer {
  readonly kind: 'choose_transformer';
  readonly segment: SplitSegmentInfo;
  readonly insertAt: SplitInsertAt;
  readonly insertedKind: 'station';
  readonly station: SplitStationDraft;
}
export interface SplitStatePreviewPending {
  readonly kind: 'preview_pending';
  readonly segment: SplitSegmentInfo;
  readonly insertAt: SplitInsertAt;
  readonly insertedKind: InsertedObjectKind;
  readonly station?: SplitStationDraft;
  readonly transformer?: SplitTransformerDraft | null;
}
export interface SplitStatePreviewReady {
  readonly kind: 'preview_ready';
  readonly segment: SplitSegmentInfo;
  readonly insertAt: SplitInsertAt;
  readonly insertedKind: InsertedObjectKind;
  readonly station?: SplitStationDraft;
  readonly transformer?: SplitTransformerDraft | null;
  readonly preview: SplitPreview;
}
export interface SplitStateCommitting {
  readonly kind: 'committing';
  readonly segment: SplitSegmentInfo;
  readonly insertAt: SplitInsertAt;
  readonly insertedKind: InsertedObjectKind;
  readonly station?: SplitStationDraft;
  readonly transformer?: SplitTransformerDraft | null;
}
export interface SplitStateCommitted {
  readonly kind: 'committed';
  readonly insertedRef: string;
  readonly insertedKind: InsertedObjectKind;
}
export interface SplitStateCancelled { readonly kind: 'cancelled'; }
export interface SplitStateError {
  readonly kind: 'error';
  readonly errorCode: string;
  readonly messagePl: string;
}

export type SplitState =
  | SplitStateIdle
  | SplitStatePickSegment
  | SplitStatePickSplitPoint
  | SplitStateChooseInsertedObject
  | SplitStateChooseStationType
  | SplitStateChooseTransformer
  | SplitStatePreviewPending
  | SplitStatePreviewReady
  | SplitStateCommitting
  | SplitStateCommitted
  | SplitStateCancelled
  | SplitStateError;

export const INITIAL_SPLIT_STATE: SplitState = { kind: 'idle' };

/* ---------------------------------------------------------------------------
   Transitions (pure functions)
   --------------------------------------------------------------------------- */

export function startSplit(state: SplitState): SplitState {
  if (state.kind !== 'idle' && state.kind !== 'cancelled' && state.kind !== 'committed') {
    return state;
  }
  return { kind: 'pick_segment' };
}

export function pickSegment(state: SplitState, segment: SplitSegmentInfo): SplitState {
  if (state.kind !== 'pick_segment') return state;
  if (segment.segmentType !== 'cable' && segment.segmentType !== 'line_overhead') {
    return {
      kind: 'error',
      errorCode: 'split.segment_type_invalid',
      messagePl: `Odcinek '${segment.segmentRef}' nie jest typu SN.`,
    };
  }
  if (segment.lengthKm <= 0) {
    return {
      kind: 'error',
      errorCode: 'split.segment_length_invalid',
      messagePl: 'Odcinek o zerowej długości — podział niemożliwy.',
    };
  }
  return { kind: 'pick_split_point', segment };
}

export function pickSplitPoint(state: SplitState, insertAt: SplitInsertAt): SplitState {
  if (state.kind !== 'pick_split_point') return state;
  // Walidacja insertAt
  if (insertAt.mode === 'RATIO' && (insertAt.value < 0 || insertAt.value > 1)) {
    return {
      kind: 'error',
      errorCode: 'split.insert_at_ratio_invalid',
      messagePl: `Współczynnik podziału ${insertAt.value} poza zakresem [0, 1].`,
    };
  }
  if (insertAt.mode === 'ODLEGLOSC_OD_POCZATKU_M' && insertAt.value < 0) {
    return {
      kind: 'error',
      errorCode: 'split.insert_at_distance_invalid',
      messagePl: 'Odległość od początku odcinka musi być >= 0.',
    };
  }
  return { kind: 'choose_inserted_object', segment: state.segment, insertAt };
}

export function chooseInsertedObject(
  state: SplitState,
  insertedKind: InsertedObjectKind,
): SplitState {
  if (state.kind !== 'choose_inserted_object') return state;
  if (insertedKind === 'station') {
    return {
      kind: 'choose_station_type',
      segment: state.segment,
      insertAt: state.insertAt,
      insertedKind,
    };
  }
  // ZKSN / pole / nop → preview_pending bez station type
  return {
    kind: 'preview_pending',
    segment: state.segment,
    insertAt: state.insertAt,
    insertedKind,
  };
}

export function chooseStationType(state: SplitState, station: SplitStationDraft): SplitState {
  if (state.kind !== 'choose_station_type') return state;
  if (!station.stationName.trim()) {
    return { kind: 'error', errorCode: 'split.station_name_empty', messagePl: 'Nazwa stacji jest wymagana.' };
  }
  if (station.nnVoltageKv <= 0) {
    return { kind: 'error', errorCode: 'split.nn_voltage_invalid', messagePl: 'Napięcie nN musi być > 0.' };
  }
  return {
    kind: 'choose_transformer',
    segment: state.segment,
    insertAt: state.insertAt,
    insertedKind: 'station',
    station,
  };
}

export function skipTransformer(state: SplitState): SplitState {
  if (state.kind !== 'choose_transformer') return state;
  return {
    kind: 'preview_pending',
    segment: state.segment,
    insertAt: state.insertAt,
    insertedKind: 'station',
    station: state.station,
    transformer: null,
  };
}

export function chooseTransformer(state: SplitState, transformer: SplitTransformerDraft): SplitState {
  if (state.kind !== 'choose_transformer') return state;
  if (!transformer.transformerCatalogRef.trim()) {
    return { kind: 'error', errorCode: 'split.transformer_catalog_empty', messagePl: 'Wybór katalogu transformatora wymagany.' };
  }
  return {
    kind: 'preview_pending',
    segment: state.segment,
    insertAt: state.insertAt,
    insertedKind: 'station',
    station: state.station,
    transformer,
  };
}

export function previewReady(state: SplitState, preview: SplitPreview): SplitState {
  if (state.kind !== 'preview_pending') return state;
  return {
    kind: 'preview_ready',
    segment: state.segment,
    insertAt: state.insertAt,
    insertedKind: state.insertedKind,
    station: state.station,
    transformer: state.transformer,
    preview,
  };
}

export function commitSplit(state: SplitState): SplitState {
  if (state.kind !== 'preview_ready') return state;
  return {
    kind: 'committing',
    segment: state.segment,
    insertAt: state.insertAt,
    insertedKind: state.insertedKind,
    station: state.station,
    transformer: state.transformer,
  };
}

export function committed(state: SplitState, insertedRef: string): SplitState {
  if (state.kind !== 'committing') return state;
  return { kind: 'committed', insertedRef, insertedKind: state.insertedKind };
}

export function cancelSplit(_state: SplitState): SplitState {
  return { kind: 'cancelled' };
}

export function resetSplit(): SplitState {
  return INITIAL_SPLIT_STATE;
}

/* ---------------------------------------------------------------------------
   Helpers / projection
   --------------------------------------------------------------------------- */

/**
 * Buduje payload do `execute_domain_operation('insert_station_on_segment_sn', payload)`.
 * Spójny z backend `_build_split_preview_metadata()` (Krok 3 Phase 0C).
 */
export function buildBackendPayload(state: SplitState, dryRun: boolean): Record<string, unknown> {
  if (state.kind !== 'preview_pending' && state.kind !== 'preview_ready' && state.kind !== 'committing') {
    throw new Error(`buildBackendPayload nie obsługuje stanu '${state.kind}'`);
  }
  const payload: Record<string, unknown> = {
    segment_id: state.segment.segmentRef,
    insert_at: { mode: state.insertAt.mode, value: state.insertAt.value },
  };
  if (state.insertedKind === 'station' && state.station) {
    payload.station = {
      name: state.station.stationName,
      station_type: state.station.stationType,
      nn_voltage_kv: state.station.nnVoltageKv,
    };
    payload.nn_voltage_kv = state.station.nnVoltageKv;
    if (state.transformer) {
      payload.transformer = {
        transformer_catalog_ref: state.transformer.transformerCatalogRef,
        ...(state.transformer.snMva !== undefined ? { sn_mva: state.transformer.snMva } : {}),
        ...(state.transformer.ukPercent !== undefined ? { uk_percent: state.transformer.ukPercent } : {}),
      };
    }
  }
  if (dryRun) payload.dry_run = true;
  return payload;
}

/**
 * Compute split point in world coordinates given segment endpoints + insertAt.
 * Używane do ghost preview w CadOverlay.
 */
export function computeSplitPoint(
  fromPoint: Point,
  toPoint: Point,
  insertAt: SplitInsertAt,
  segmentLengthKm: number,
): Point {
  let ratio: number;
  if (insertAt.mode === 'RATIO') {
    ratio = Math.max(0, Math.min(1, insertAt.value));
  } else {
    // ODLEGLOSC_OD_POCZATKU_M
    if (segmentLengthKm <= 0) ratio = 0.5;
    else ratio = Math.max(0, Math.min(1, insertAt.value / (segmentLengthKm * 1000)));
  }
  return {
    x: fromPoint.x + (toPoint.x - fromPoint.x) * ratio,
    y: fromPoint.y + (toPoint.y - fromPoint.y) * ratio,
  };
}
