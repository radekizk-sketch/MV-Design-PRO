/**
 * AppendOnEndpointController — FSM dla operator-grade workflow Phase 0B.
 *
 * Workflow „Zakończ ciąg w stacji":
 *   1. IDLE
 *   2. PICK_ENDPOINT — operator klika pole bay z topology_terminal lub endpoint segmentu
 *   3. CHOOSE_STATION_TYPE — operator wybiera typ (terminal/inline/branch/sectional)
 *   4. CHOOSE_TRANSFORMER — opcjonalnie catalog_ref transformatora (lub skip)
 *   5. PREVIEW_READY — wywołane backend z dry_run=True; operator widzi ghost station
 *   6. COMMIT lub CANCEL
 *
 * Czysta funkcjonalność (pure FSM), bez dependencji na React/DOM.
 * Konsumowane przez UI workflow w SldCanvasV2 / CadOverlay.
 */

import type { GpzBayDescriptor } from '../renderer/GpzSwitchgearRenderer';

/** Typy stacji jakie można dodać przez append-on-endpoint. */
export type AppendStationType = 'terminal' | 'inline' | 'branch' | 'sectional';

export const APPEND_STATION_TYPE_LABELS_PL: Readonly<Record<AppendStationType, string>> = {
  terminal: 'Stacja końcowa',
  inline: 'Stacja przelotowa',
  branch: 'Stacja odgałęźna',
  sectional: 'Stacja sekcyjna',
};

/** Stan FSM workflow append-on-endpoint. */
export type AppendStateKind =
  | 'idle'
  | 'pick_endpoint'
  | 'choose_station_type'
  | 'choose_transformer'
  | 'preview_pending'
  | 'preview_ready'
  | 'committing'
  | 'committed'
  | 'cancelled'
  | 'error';

export interface AppendEndpointInfo {
  readonly endpointBusRef: string;
  readonly bayRef?: string;
  readonly runRef?: string;
  /** SN voltage of the endpoint bus (kV). */
  readonly snVoltageKv: number;
}

export interface AppendStationDraft {
  readonly stationName: string;
  readonly stationType: AppendStationType;
  readonly nnVoltageKv: number;
}

export interface AppendTransformerDraft {
  readonly transformerCatalogRef: string;
  readonly snMva?: number;
  readonly ukPercent?: number;
}

export interface AppendPreview {
  readonly appendedStationId: string;
  readonly endpointBusRef: string;
  readonly createdRefs: readonly string[];
  readonly electricalImpact: {
    readonly topologyChanged: boolean;
    readonly affectedObjectRefs: readonly string[];
    readonly endpointBusConsumed: boolean;
    readonly newTerminalBusRef: string | null;
  };
}

export interface AppendStateIdle {
  readonly kind: 'idle';
}
export interface AppendStatePickEndpoint {
  readonly kind: 'pick_endpoint';
}
export interface AppendStateChooseStationType {
  readonly kind: 'choose_station_type';
  readonly endpoint: AppendEndpointInfo;
}
export interface AppendStateChooseTransformer {
  readonly kind: 'choose_transformer';
  readonly endpoint: AppendEndpointInfo;
  readonly station: AppendStationDraft;
}
export interface AppendStatePreviewPending {
  readonly kind: 'preview_pending';
  readonly endpoint: AppendEndpointInfo;
  readonly station: AppendStationDraft;
  readonly transformer: AppendTransformerDraft | null;
}
export interface AppendStatePreviewReady {
  readonly kind: 'preview_ready';
  readonly endpoint: AppendEndpointInfo;
  readonly station: AppendStationDraft;
  readonly transformer: AppendTransformerDraft | null;
  readonly preview: AppendPreview;
}
export interface AppendStateCommitting {
  readonly kind: 'committing';
  readonly endpoint: AppendEndpointInfo;
  readonly station: AppendStationDraft;
  readonly transformer: AppendTransformerDraft | null;
}
export interface AppendStateCommitted {
  readonly kind: 'committed';
  readonly stationName: string;
  readonly stationRef: string;
}
export interface AppendStateCancelled {
  readonly kind: 'cancelled';
}
export interface AppendStateError {
  readonly kind: 'error';
  readonly errorCode: string;
  readonly messagePl: string;
}

export type AppendState =
  | AppendStateIdle
  | AppendStatePickEndpoint
  | AppendStateChooseStationType
  | AppendStateChooseTransformer
  | AppendStatePreviewPending
  | AppendStatePreviewReady
  | AppendStateCommitting
  | AppendStateCommitted
  | AppendStateCancelled
  | AppendStateError;

/* ---------------------------------------------------------------------------
   Transitions (pure functions)
   --------------------------------------------------------------------------- */

export const INITIAL_APPEND_STATE: AppendState = { kind: 'idle' };

export function startAppend(state: AppendState): AppendState {
  if (state.kind !== 'idle' && state.kind !== 'cancelled' && state.kind !== 'committed') {
    return state; // FSM nie pozwala startu w środku innego workflow
  }
  return { kind: 'pick_endpoint' };
}

export function pickEndpoint(state: AppendState, endpoint: AppendEndpointInfo): AppendState {
  if (state.kind !== 'pick_endpoint') return state;
  if (endpoint.snVoltageKv <= 0) {
    return {
      kind: 'error',
      errorCode: 'append.endpoint_voltage_invalid',
      messagePl: `Szyna '${endpoint.endpointBusRef}' nie ma napięcia znamionowego.`,
    };
  }
  return { kind: 'choose_station_type', endpoint };
}

export function chooseStationType(
  state: AppendState,
  station: AppendStationDraft,
): AppendState {
  if (state.kind !== 'choose_station_type') return state;
  if (!station.stationName.trim()) {
    return {
      kind: 'error',
      errorCode: 'append.station_name_empty',
      messagePl: 'Nazwa stacji jest wymagana.',
    };
  }
  if (station.nnVoltageKv <= 0) {
    return {
      kind: 'error',
      errorCode: 'append.nn_voltage_invalid',
      messagePl: 'Napięcie nN musi być większe od 0.',
    };
  }
  return { kind: 'choose_transformer', endpoint: state.endpoint, station };
}

export function skipTransformer(state: AppendState): AppendState {
  if (state.kind !== 'choose_transformer') return state;
  return {
    kind: 'preview_pending',
    endpoint: state.endpoint,
    station: state.station,
    transformer: null,
  };
}

export function chooseTransformer(
  state: AppendState,
  transformer: AppendTransformerDraft,
): AppendState {
  if (state.kind !== 'choose_transformer') return state;
  if (!transformer.transformerCatalogRef.trim()) {
    return {
      kind: 'error',
      errorCode: 'append.catalog_ref_empty',
      messagePl: 'Wybór katalogu transformatora jest wymagany.',
    };
  }
  return {
    kind: 'preview_pending',
    endpoint: state.endpoint,
    station: state.station,
    transformer,
  };
}

export function previewReady(
  state: AppendState,
  preview: AppendPreview,
): AppendState {
  if (state.kind !== 'preview_pending') return state;
  return {
    kind: 'preview_ready',
    endpoint: state.endpoint,
    station: state.station,
    transformer: state.transformer,
    preview,
  };
}

export function commit(state: AppendState): AppendState {
  if (state.kind !== 'preview_ready') return state;
  return {
    kind: 'committing',
    endpoint: state.endpoint,
    station: state.station,
    transformer: state.transformer,
  };
}

export function committed(
  state: AppendState,
  stationRef: string,
): AppendState {
  if (state.kind !== 'committing') return state;
  return {
    kind: 'committed',
    stationName: state.station.stationName,
    stationRef,
  };
}

export function cancel(_state: AppendState): AppendState {
  // Cancel zawsze prowadzi do cancelled (idempotentny escape hatch).
  // _state przyjmowany dla spójności sygnatury z innymi tranzycjami; ignorowany
  // bo cancel jest globalnym escape hatchem.
  return { kind: 'cancelled' };
}

export function reset(): AppendState {
  return INITIAL_APPEND_STATE;
}

/* ---------------------------------------------------------------------------
   Helpers / projection
   --------------------------------------------------------------------------- */

/**
 * Buduje payload do `execute_domain_operation('append_station_on_endpoint', payload)`.
 */
export function buildBackendPayload(state: AppendState, dryRun: boolean): Record<string, unknown> {
  if (state.kind !== 'preview_pending' && state.kind !== 'preview_ready' && state.kind !== 'committing') {
    throw new Error(`buildBackendPayload nie obsługuje stanu '${state.kind}'`);
  }
  const payload: Record<string, unknown> = {
    endpoint_bus_ref: state.endpoint.endpointBusRef,
    station: {
      name: state.station.stationName,
      station_type: state.station.stationType,
      nn_voltage_kv: state.station.nnVoltageKv,
    },
    nn_voltage_kv: state.station.nnVoltageKv,
  };
  if (state.endpoint.runRef) payload.run_ref = state.endpoint.runRef;
  if (state.transformer) {
    payload.transformer = {
      transformer_catalog_ref: state.transformer.transformerCatalogRef,
      ...(state.transformer.snMva !== undefined ? { sn_mva: state.transformer.snMva } : {}),
      ...(state.transformer.ukPercent !== undefined ? { uk_percent: state.transformer.ukPercent } : {}),
    };
  }
  if (dryRun) payload.dry_run = true;
  return payload;
}

/**
 * Sprawdza czy bay w SLD jest free endpoint (kandydat dla append-on-endpoint).
 * Wykorzystywane w GpzSwitchgearRenderer / SldCommandService dla disabled state.
 */
export function isBayAppendCandidate(bay: GpzBayDescriptor): boolean {
  // Pole jest endpointem gdy nie ma jeszcze odpływu (outgoingFeeder undefined)
  // i jest typu liniowego/transformatorowego/odgałęźnego (nie pomiarowe ani sprzęgło).
  if (bay.outgoingFeeder !== undefined) return false;
  const role = bay.fieldRole;
  return role === 'GPZ_LINE_BAY' || role === 'LINE_OUT' || role === 'LINE_BRANCH' || role === 'RMU_LINE';
}
