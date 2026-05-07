/**
 * Testy AppendOnEndpointController FSM (Phase 0B operator-grade SLD plan v2).
 *
 * Pokrycie:
 *   1. Initial state = idle.
 *   2. Pełne flow: idle → pick_endpoint → choose_station_type → choose_transformer
 *      → preview_pending → preview_ready → committing → committed.
 *   3. Skip transformer.
 *   4. Cancel z dowolnego stanu.
 *   5. Walidacja: voltage 0, name pusty, nn_voltage 0, catalog_ref pusty.
 *   6. Reset.
 *   7. buildBackendPayload: minimal vs full vs dry_run.
 *   8. isBayAppendCandidate: free endpoint vs zajęty.
 *   9. FSM strict: tranzycja niedozwolona NIE zmienia stanu.
 */
import { describe, it, expect } from 'vitest';

import {
  INITIAL_APPEND_STATE,
  type AppendEndpointInfo,
  type AppendStationDraft,
  type AppendTransformerDraft,
  type AppendPreview,
  type AppendState,
  buildBackendPayload,
  cancel,
  chooseStationType,
  chooseTransformer,
  commit,
  committed,
  isBayAppendCandidate,
  pickEndpoint,
  previewReady,
  reset,
  skipTransformer,
  startAppend,
} from '../AppendOnEndpointController';
import type { GpzBayDescriptor } from '../../renderer/GpzSwitchgearRenderer';
import { FIELD_ROLE } from '../../domain/apparatusContracts';

const VALID_ENDPOINT: AppendEndpointInfo = {
  endpointBusRef: 'bus/abc/downstream',
  bayRef: 'bay/abc/out',
  runRef: 'corridor/abc',
  snVoltageKv: 15,
};

const VALID_STATION: AppendStationDraft = {
  stationName: 'Stacja A',
  stationType: 'terminal',
  nnVoltageKv: 0.4,
};

const VALID_TRANSFORMER: AppendTransformerDraft = {
  transformerCatalogRef: 'tr-sn-nn-15-04-630kva-dyn11',
};

const VALID_PREVIEW: AppendPreview = {
  appendedStationId: 'sub/abc/substation',
  endpointBusRef: 'bus/abc/downstream',
  createdRefs: ['sub/abc/substation', 'bay/abc/in'],
  electricalImpact: {
    topologyChanged: true,
    affectedObjectRefs: ['sub/abc/substation', 'bay/abc/in'],
    endpointBusConsumed: true,
    newTerminalBusRef: null,
  },
};

describe('AppendOnEndpointController — initial state', () => {
  it('Initial state to idle', () => {
    expect(INITIAL_APPEND_STATE).toEqual({ kind: 'idle' });
  });
});

describe('AppendOnEndpointController — happy path', () => {
  it('Pełne flow: idle → committed', () => {
    let s: AppendState = INITIAL_APPEND_STATE;
    s = startAppend(s);
    expect(s.kind).toBe('pick_endpoint');
    s = pickEndpoint(s, VALID_ENDPOINT);
    expect(s.kind).toBe('choose_station_type');
    s = chooseStationType(s, VALID_STATION);
    expect(s.kind).toBe('choose_transformer');
    s = chooseTransformer(s, VALID_TRANSFORMER);
    expect(s.kind).toBe('preview_pending');
    s = previewReady(s, VALID_PREVIEW);
    expect(s.kind).toBe('preview_ready');
    s = commit(s);
    expect(s.kind).toBe('committing');
    s = committed(s, 'sub/abc/substation');
    expect(s.kind).toBe('committed');
    if (s.kind === 'committed') {
      expect(s.stationRef).toBe('sub/abc/substation');
      expect(s.stationName).toBe('Stacja A');
    }
  });

  it('Skip transformer (minimal station): preview_pending bez transformer', () => {
    let s: AppendState = INITIAL_APPEND_STATE;
    s = startAppend(s);
    s = pickEndpoint(s, VALID_ENDPOINT);
    s = chooseStationType(s, VALID_STATION);
    s = skipTransformer(s);
    expect(s.kind).toBe('preview_pending');
    if (s.kind === 'preview_pending') {
      expect(s.transformer).toBeNull();
    }
  });
});

describe('AppendOnEndpointController — walidacja', () => {
  it('pickEndpoint z voltage 0 → error state', () => {
    let s: AppendState = startAppend(INITIAL_APPEND_STATE);
    s = pickEndpoint(s, { ...VALID_ENDPOINT, snVoltageKv: 0 });
    expect(s.kind).toBe('error');
    if (s.kind === 'error') {
      expect(s.errorCode).toBe('append.endpoint_voltage_invalid');
    }
  });

  it('chooseStationType z pustym name → error', () => {
    let s: AppendState = startAppend(INITIAL_APPEND_STATE);
    s = pickEndpoint(s, VALID_ENDPOINT);
    s = chooseStationType(s, { ...VALID_STATION, stationName: '   ' });
    expect(s.kind).toBe('error');
    if (s.kind === 'error') {
      expect(s.errorCode).toBe('append.station_name_empty');
    }
  });

  it('chooseStationType z nn_voltage 0 → error', () => {
    let s: AppendState = startAppend(INITIAL_APPEND_STATE);
    s = pickEndpoint(s, VALID_ENDPOINT);
    s = chooseStationType(s, { ...VALID_STATION, nnVoltageKv: 0 });
    expect(s.kind).toBe('error');
    if (s.kind === 'error') {
      expect(s.errorCode).toBe('append.nn_voltage_invalid');
    }
  });

  it('chooseTransformer z pustym catalog_ref → error', () => {
    let s: AppendState = startAppend(INITIAL_APPEND_STATE);
    s = pickEndpoint(s, VALID_ENDPOINT);
    s = chooseStationType(s, VALID_STATION);
    s = chooseTransformer(s, { transformerCatalogRef: '   ' });
    expect(s.kind).toBe('error');
    if (s.kind === 'error') {
      expect(s.errorCode).toBe('append.catalog_ref_empty');
    }
  });
});

describe('AppendOnEndpointController — cancel + reset', () => {
  it('Cancel z dowolnego stanu → cancelled', () => {
    const states: AppendState[] = [
      { kind: 'idle' },
      { kind: 'pick_endpoint' },
      { kind: 'choose_station_type', endpoint: VALID_ENDPOINT },
      {
        kind: 'preview_ready',
        endpoint: VALID_ENDPOINT,
        station: VALID_STATION,
        transformer: VALID_TRANSFORMER,
        preview: VALID_PREVIEW,
      },
    ];
    for (const before of states) {
      const after = cancel(before);
      expect(after.kind).toBe('cancelled');
    }
  });

  it('Reset → idle', () => {
    expect(reset()).toEqual({ kind: 'idle' });
  });

  it('startAppend z committed → restart (pick_endpoint)', () => {
    const committedState: AppendState = {
      kind: 'committed',
      stationName: 'X',
      stationRef: 'sub/x/substation',
    };
    const next = startAppend(committedState);
    expect(next.kind).toBe('pick_endpoint');
  });

  it('startAppend z preview_ready (środek workflow) → NIE zmienia stanu', () => {
    const inFlight: AppendState = {
      kind: 'preview_ready',
      endpoint: VALID_ENDPOINT,
      station: VALID_STATION,
      transformer: null,
      preview: VALID_PREVIEW,
    };
    const next = startAppend(inFlight);
    expect(next).toBe(inFlight);
  });
});

describe('AppendOnEndpointController — FSM strict (out-of-order tranzycje)', () => {
  it('chooseStationType na idle → no-op', () => {
    const next = chooseStationType({ kind: 'idle' }, VALID_STATION);
    expect(next.kind).toBe('idle');
  });

  it('previewReady gdy NIE w preview_pending → no-op', () => {
    const next = previewReady({ kind: 'pick_endpoint' }, VALID_PREVIEW);
    expect(next.kind).toBe('pick_endpoint');
  });

  it('commit z preview_pending (brak preview) → no-op', () => {
    const next = commit({
      kind: 'preview_pending',
      endpoint: VALID_ENDPOINT,
      station: VALID_STATION,
      transformer: null,
    });
    expect(next.kind).toBe('preview_pending');
  });

  it('committed gdy NIE w committing → no-op', () => {
    const next = committed({ kind: 'idle' }, 'sub/abc');
    expect(next.kind).toBe('idle');
  });
});

describe('AppendOnEndpointController — buildBackendPayload', () => {
  const minimalState: AppendState = {
    kind: 'preview_pending',
    endpoint: VALID_ENDPOINT,
    station: VALID_STATION,
    transformer: null,
  };
  const fullState: AppendState = {
    kind: 'preview_pending',
    endpoint: VALID_ENDPOINT,
    station: VALID_STATION,
    transformer: VALID_TRANSFORMER,
  };

  it('Minimal: bez transformer w payload', () => {
    const payload = buildBackendPayload(minimalState, false);
    expect(payload).toMatchObject({
      endpoint_bus_ref: 'bus/abc/downstream',
      run_ref: 'corridor/abc',
      station: {
        name: 'Stacja A',
        station_type: 'terminal',
        nn_voltage_kv: 0.4,
      },
      nn_voltage_kv: 0.4,
    });
    expect(payload.transformer).toBeUndefined();
    expect(payload.dry_run).toBeUndefined();
  });

  it('Full: z transformer w payload', () => {
    const payload = buildBackendPayload(fullState, false);
    expect(payload.transformer).toMatchObject({
      transformer_catalog_ref: 'tr-sn-nn-15-04-630kva-dyn11',
    });
  });

  it('dry_run=true → payload.dry_run=true', () => {
    const payload = buildBackendPayload(fullState, true);
    expect(payload.dry_run).toBe(true);
  });

  it('Bez run_ref endpoint → payload bez run_ref', () => {
    const noRunState: AppendState = {
      kind: 'preview_pending',
      endpoint: { ...VALID_ENDPOINT, runRef: undefined },
      station: VALID_STATION,
      transformer: null,
    };
    const payload = buildBackendPayload(noRunState, false);
    expect(payload.run_ref).toBeUndefined();
  });

  it('Stan idle → throw', () => {
    expect(() => buildBackendPayload({ kind: 'idle' }, false)).toThrow();
  });
});

describe('AppendOnEndpointController — isBayAppendCandidate', () => {
  function makeBay(overrides: Partial<GpzBayDescriptor>): GpzBayDescriptor {
    return {
      bayRef: 'bay-1',
      fieldRole: FIELD_ROLE.GPZ_LINE_BAY,
      designation: 'POLE 1',
      hasMissingRequiredDevice: false,
      ...overrides,
    };
  }

  it('Pole liniowe BEZ outgoingFeeder → kandydat', () => {
    expect(isBayAppendCandidate(makeBay({}))).toBe(true);
  });

  it('Pole liniowe Z outgoingFeeder → NIE kandydat', () => {
    expect(
      isBayAppendCandidate(
        makeBay({ outgoingFeeder: { destination: '→ ST-1 SADY' } }),
      ),
    ).toBe(false);
  });

  it('Pole TR (TRANSFORMER) → NIE kandydat', () => {
    expect(
      isBayAppendCandidate(
        makeBay({ fieldRole: FIELD_ROLE.TRANSFORMER }),
      ),
    ).toBe(false);
  });

  it('Pole MEASUREMENT (PN) → NIE kandydat', () => {
    expect(
      isBayAppendCandidate(
        makeBay({ fieldRole: FIELD_ROLE.MEASUREMENT }),
      ),
    ).toBe(false);
  });

  it('Pole COUPLER → NIE kandydat', () => {
    expect(
      isBayAppendCandidate(
        makeBay({ fieldRole: FIELD_ROLE.COUPLER }),
      ),
    ).toBe(false);
  });

  it('Pole RMU_LINE BEZ outgoingFeeder → kandydat', () => {
    expect(
      isBayAppendCandidate(
        makeBay({ fieldRole: FIELD_ROLE.RMU_LINE }),
      ),
    ).toBe(true);
  });
});
