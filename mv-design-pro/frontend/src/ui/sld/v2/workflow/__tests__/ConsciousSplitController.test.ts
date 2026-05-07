/**
 * ConsciousSplitController FSM testy (Phase 3 operator-grade SLD plan v2).
 *
 * Pokrycie:
 *   1. Initial state = idle.
 *   2. Pełen flow: pick_segment → pick_split_point → choose_inserted_object →
 *      choose_station_type → choose_transformer → preview_pending →
 *      preview_ready → committing → committed.
 *   3. ZKSN/pole/nop → preview_pending bez station type.
 *   4. Skip transformer.
 *   5. Walidacja: segment type, length, ratio range, distance.
 *   6. Cancel z dowolnego stanu.
 *   7. FSM strict (out-of-order tranzycje no-op).
 *   8. buildBackendPayload (5 cases).
 *   9. computeSplitPoint (RATIO + distance).
 *  10. Polish labels INSERTED_OBJECT_LABELS_PL.
 *  11. Determinizm.
 */
import { describe, expect, it } from 'vitest';

import {
  type InsertedObjectKind,
  type SplitElectricalImpact,
  type SplitPreview,
  type SplitSegmentInfo,
  type SplitState,
  type SplitStationDraft,
  type SplitTransformerDraft,
  INITIAL_SPLIT_STATE,
  INSERTED_OBJECT_LABELS_PL,
  buildBackendPayload,
  cancelSplit,
  chooseInsertedObject,
  chooseStationType,
  chooseTransformer,
  commitSplit,
  committed,
  computeSplitPoint,
  pickSegment,
  pickSplitPoint,
  previewReady,
  resetSplit,
  skipTransformer,
  startSplit,
} from '../ConsciousSplitController';

const VALID_SEGMENT: SplitSegmentInfo = {
  segmentRef: 'seg-1',
  segmentType: 'cable',
  fromBusRef: 'bus-1',
  toBusRef: 'bus-2',
  lengthKm: 1.0,
  catalogRef: 'cab-120-xlpe',
};

const VALID_STATION: SplitStationDraft = {
  stationName: 'Stacja Wielicka',
  stationType: 'inline',
  nnVoltageKv: 0.4,
};

const VALID_TRANSFORMER: SplitTransformerDraft = {
  transformerCatalogRef: 'tr-630-15-04',
};

const VALID_IMPACT: SplitElectricalImpact = {
  topologyTypeChanged: true,
  affectedObjectRefs: ['seg-1', 'sub/abc/substation'],
  halves: {
    firstSegmentId: 'seg-1_a',
    secondSegmentId: 'seg-1_b',
    firstLengthKm: 0.5,
    secondLengthKm: 0.5,
    splitRatio: 0.5,
  },
  catalogInheritance: {
    sourceSegmentRef: 'seg-1',
    sourceCatalogRef: 'cab-120-xlpe',
    firstInherits: true,
    secondInherits: true,
    rule: 'Obie połówki dziedziczą catalog_ref ze źródłowego odcinka.',
  },
  invalidatedResults: [],
  affectedProofPacks: [],
  missingDataAfter: [],
  affectedBuses: ['bus-1', 'bus-2'],
};

const VALID_PREVIEW: SplitPreview = {
  insertedStationId: 'sub/abc/substation',
  stationType: 'inline',
  electricalImpact: VALID_IMPACT,
};

describe('ConsciousSplitController — initial state', () => {
  it('Initial state = idle', () => {
    expect(INITIAL_SPLIT_STATE).toEqual({ kind: 'idle' });
  });
});

describe('ConsciousSplitController — happy path full', () => {
  it('Pełen flow station: idle → committed', () => {
    let s: SplitState = INITIAL_SPLIT_STATE;
    s = startSplit(s);
    expect(s.kind).toBe('pick_segment');
    s = pickSegment(s, VALID_SEGMENT);
    expect(s.kind).toBe('pick_split_point');
    s = pickSplitPoint(s, { mode: 'RATIO', value: 0.5 });
    expect(s.kind).toBe('choose_inserted_object');
    s = chooseInsertedObject(s, 'station');
    expect(s.kind).toBe('choose_station_type');
    s = chooseStationType(s, VALID_STATION);
    expect(s.kind).toBe('choose_transformer');
    s = chooseTransformer(s, VALID_TRANSFORMER);
    expect(s.kind).toBe('preview_pending');
    s = previewReady(s, VALID_PREVIEW);
    expect(s.kind).toBe('preview_ready');
    s = commitSplit(s);
    expect(s.kind).toBe('committing');
    s = committed(s, 'sub/abc/substation');
    expect(s.kind).toBe('committed');
    if (s.kind === 'committed') {
      expect(s.insertedRef).toBe('sub/abc/substation');
      expect(s.insertedKind).toBe('station');
    }
  });

  it('ZKSN flow: idle → preview_pending z insertedKind=zksn (pomija station type)', () => {
    let s: SplitState = startSplit(INITIAL_SPLIT_STATE);
    s = pickSegment(s, VALID_SEGMENT);
    s = pickSplitPoint(s, { mode: 'RATIO', value: 0.3 });
    s = chooseInsertedObject(s, 'zksn');
    expect(s.kind).toBe('preview_pending');
    if (s.kind === 'preview_pending') {
      expect(s.insertedKind).toBe('zksn');
      expect(s.station).toBeUndefined();
    }
  });

  it('Pole rozgałęźny flow: insertedKind=pole', () => {
    let s: SplitState = startSplit(INITIAL_SPLIT_STATE);
    s = pickSegment(s, VALID_SEGMENT);
    s = pickSplitPoint(s, { mode: 'RATIO', value: 0.5 });
    s = chooseInsertedObject(s, 'pole');
    expect(s.kind).toBe('preview_pending');
    if (s.kind === 'preview_pending') {
      expect(s.insertedKind).toBe('pole');
    }
  });

  it('NMO flow: insertedKind=nop', () => {
    let s: SplitState = startSplit(INITIAL_SPLIT_STATE);
    s = pickSegment(s, VALID_SEGMENT);
    s = pickSplitPoint(s, { mode: 'RATIO', value: 0.5 });
    s = chooseInsertedObject(s, 'nop');
    expect(s.kind).toBe('preview_pending');
    if (s.kind === 'preview_pending') {
      expect(s.insertedKind).toBe('nop');
    }
  });

  it('Skip transformer dla station', () => {
    let s: SplitState = startSplit(INITIAL_SPLIT_STATE);
    s = pickSegment(s, VALID_SEGMENT);
    s = pickSplitPoint(s, { mode: 'RATIO', value: 0.5 });
    s = chooseInsertedObject(s, 'station');
    s = chooseStationType(s, VALID_STATION);
    s = skipTransformer(s);
    expect(s.kind).toBe('preview_pending');
    if (s.kind === 'preview_pending') {
      expect(s.transformer).toBeNull();
    }
  });
});

describe('ConsciousSplitController — walidacja', () => {
  it('pickSegment z złym typem → error', () => {
    let s: SplitState = startSplit(INITIAL_SPLIT_STATE);
    s = pickSegment(s, { ...VALID_SEGMENT, segmentType: 'transformer' as never });
    expect(s.kind).toBe('error');
  });

  it('pickSegment z lengthKm=0 → error', () => {
    let s: SplitState = startSplit(INITIAL_SPLIT_STATE);
    s = pickSegment(s, { ...VALID_SEGMENT, lengthKm: 0 });
    expect(s.kind).toBe('error');
    if (s.kind === 'error') {
      expect(s.errorCode).toBe('split.segment_length_invalid');
    }
  });

  it('pickSplitPoint RATIO z value > 1 → error', () => {
    let s: SplitState = startSplit(INITIAL_SPLIT_STATE);
    s = pickSegment(s, VALID_SEGMENT);
    s = pickSplitPoint(s, { mode: 'RATIO', value: 1.5 });
    expect(s.kind).toBe('error');
    if (s.kind === 'error') {
      expect(s.errorCode).toBe('split.insert_at_ratio_invalid');
    }
  });

  it('pickSplitPoint distance ujemny → error', () => {
    let s: SplitState = startSplit(INITIAL_SPLIT_STATE);
    s = pickSegment(s, VALID_SEGMENT);
    s = pickSplitPoint(s, { mode: 'ODLEGLOSC_OD_POCZATKU_M', value: -100 });
    expect(s.kind).toBe('error');
  });

  it('chooseStationType z pustym name → error', () => {
    let s: SplitState = startSplit(INITIAL_SPLIT_STATE);
    s = pickSegment(s, VALID_SEGMENT);
    s = pickSplitPoint(s, { mode: 'RATIO', value: 0.5 });
    s = chooseInsertedObject(s, 'station');
    s = chooseStationType(s, { ...VALID_STATION, stationName: '   ' });
    expect(s.kind).toBe('error');
  });

  it('chooseTransformer z pustym catalog_ref → error', () => {
    let s: SplitState = startSplit(INITIAL_SPLIT_STATE);
    s = pickSegment(s, VALID_SEGMENT);
    s = pickSplitPoint(s, { mode: 'RATIO', value: 0.5 });
    s = chooseInsertedObject(s, 'station');
    s = chooseStationType(s, VALID_STATION);
    s = chooseTransformer(s, { transformerCatalogRef: '' });
    expect(s.kind).toBe('error');
  });
});

describe('ConsciousSplitController — cancel + reset', () => {
  it('Cancel z 5 różnych stanów → cancelled', () => {
    const states: SplitState[] = [
      { kind: 'idle' },
      { kind: 'pick_segment' },
      { kind: 'pick_split_point', segment: VALID_SEGMENT },
      {
        kind: 'choose_inserted_object',
        segment: VALID_SEGMENT,
        insertAt: { mode: 'RATIO', value: 0.5 },
      },
      {
        kind: 'preview_ready',
        segment: VALID_SEGMENT,
        insertAt: { mode: 'RATIO', value: 0.5 },
        insertedKind: 'station',
        station: VALID_STATION,
        transformer: null,
        preview: VALID_PREVIEW,
      },
    ];
    for (const s of states) {
      expect(cancelSplit(s).kind).toBe('cancelled');
    }
  });

  it('resetSplit → idle', () => {
    expect(resetSplit()).toEqual({ kind: 'idle' });
  });

  it('startSplit z preview_ready → no-op', () => {
    const inFlight: SplitState = {
      kind: 'preview_ready',
      segment: VALID_SEGMENT,
      insertAt: { mode: 'RATIO', value: 0.5 },
      insertedKind: 'station',
      station: VALID_STATION,
      transformer: null,
      preview: VALID_PREVIEW,
    };
    expect(startSplit(inFlight)).toBe(inFlight);
  });
});

describe('ConsciousSplitController — FSM strict', () => {
  it('previewReady na pick_segment → no-op', () => {
    const next = previewReady({ kind: 'pick_segment' }, VALID_PREVIEW);
    expect(next.kind).toBe('pick_segment');
  });

  it('commitSplit na preview_pending → no-op', () => {
    const s: SplitState = {
      kind: 'preview_pending',
      segment: VALID_SEGMENT,
      insertAt: { mode: 'RATIO', value: 0.5 },
      insertedKind: 'zksn',
    };
    expect(commitSplit(s).kind).toBe('preview_pending');
  });

  it('committed na idle → no-op', () => {
    expect(committed({ kind: 'idle' }, 'x')).toEqual({ kind: 'idle' });
  });
});

describe('ConsciousSplitController — buildBackendPayload', () => {
  it('Station + transformer + dry_run', () => {
    const state: SplitState = {
      kind: 'preview_pending',
      segment: VALID_SEGMENT,
      insertAt: { mode: 'RATIO', value: 0.4 },
      insertedKind: 'station',
      station: VALID_STATION,
      transformer: VALID_TRANSFORMER,
    };
    const payload = buildBackendPayload(state, true);
    expect(payload).toMatchObject({
      segment_id: 'seg-1',
      insert_at: { mode: 'RATIO', value: 0.4 },
      station: {
        name: 'Stacja Wielicka',
        station_type: 'inline',
        nn_voltage_kv: 0.4,
      },
      nn_voltage_kv: 0.4,
      transformer: { transformer_catalog_ref: 'tr-630-15-04' },
      dry_run: true,
    });
  });

  it('ZKSN bez station/transformer', () => {
    const state: SplitState = {
      kind: 'preview_pending',
      segment: VALID_SEGMENT,
      insertAt: { mode: 'RATIO', value: 0.5 },
      insertedKind: 'zksn',
    };
    const payload = buildBackendPayload(state, false);
    expect(payload.station).toBeUndefined();
    expect(payload.transformer).toBeUndefined();
    expect(payload.dry_run).toBeUndefined();
  });

  it('Station bez transformer (skip)', () => {
    const state: SplitState = {
      kind: 'preview_pending',
      segment: VALID_SEGMENT,
      insertAt: { mode: 'RATIO', value: 0.5 },
      insertedKind: 'station',
      station: VALID_STATION,
      transformer: null,
    };
    const payload = buildBackendPayload(state, false);
    expect(payload.station).toBeDefined();
    expect(payload.transformer).toBeUndefined();
  });

  it('Distance mode', () => {
    const state: SplitState = {
      kind: 'preview_pending',
      segment: VALID_SEGMENT,
      insertAt: { mode: 'ODLEGLOSC_OD_POCZATKU_M', value: 250 },
      insertedKind: 'station',
      station: VALID_STATION,
      transformer: null,
    };
    const payload = buildBackendPayload(state, false);
    expect(payload.insert_at).toEqual({ mode: 'ODLEGLOSC_OD_POCZATKU_M', value: 250 });
  });

  it('Stan idle → throw', () => {
    expect(() => buildBackendPayload({ kind: 'idle' }, false)).toThrow();
  });
});

describe('computeSplitPoint', () => {
  it('RATIO 0.5 → środek', () => {
    const p = computeSplitPoint({ x: 0, y: 0 }, { x: 100, y: 0 }, { mode: 'RATIO', value: 0.5 }, 1);
    expect(p).toEqual({ x: 50, y: 0 });
  });

  it('RATIO 0.3 → 30% drogi', () => {
    const p = computeSplitPoint({ x: 0, y: 0 }, { x: 100, y: 100 }, { mode: 'RATIO', value: 0.3 }, 1);
    expect(p).toEqual({ x: 30, y: 30 });
  });

  it('RATIO clamp do [0, 1]', () => {
    const p1 = computeSplitPoint({ x: 0, y: 0 }, { x: 100, y: 0 }, { mode: 'RATIO', value: 1.5 }, 1);
    expect(p1).toEqual({ x: 100, y: 0 });
    const p2 = computeSplitPoint({ x: 0, y: 0 }, { x: 100, y: 0 }, { mode: 'RATIO', value: -0.5 }, 1);
    expect(p2).toEqual({ x: 0, y: 0 });
  });

  it('Distance mode 250m / 500m segment → ratio 0.5', () => {
    const p = computeSplitPoint(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { mode: 'ODLEGLOSC_OD_POCZATKU_M', value: 250 },
      0.5, // 500m = 0.5km
    );
    expect(p).toEqual({ x: 50, y: 0 });
  });

  it('Distance mode 0m segment → fallback ratio 0.5', () => {
    const p = computeSplitPoint(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { mode: 'ODLEGLOSC_OD_POCZATKU_M', value: 100 },
      0,
    );
    expect(p).toEqual({ x: 50, y: 0 });
  });
});

describe('INSERTED_OBJECT_LABELS_PL — Polish operator-grade', () => {
  it('4 kinds mają Polskie etykiety', () => {
    const expectedKeys: InsertedObjectKind[] = ['station', 'zksn', 'pole', 'nop'];
    for (const k of expectedKeys) {
      const label = INSERTED_OBJECT_LABELS_PL[k];
      expect(label).toBeTruthy();
      expect(label.length).toBeGreaterThan(0);
    }
    expect(INSERTED_OBJECT_LABELS_PL.station).toMatch(/Stacja/);
    expect(INSERTED_OBJECT_LABELS_PL.zksn).toMatch(/ZKSN|Złącze/);
    expect(INSERTED_OBJECT_LABELS_PL.pole).toMatch(/Słup/);
    expect(INSERTED_OBJECT_LABELS_PL.nop).toMatch(/NMO|otwarty/);
  });
});

describe('Determinizm — 5 reruny FSM tranzycji', () => {
  it('Same flow → same final state', () => {
    function run(): SplitState {
      let s: SplitState = INITIAL_SPLIT_STATE;
      s = startSplit(s);
      s = pickSegment(s, VALID_SEGMENT);
      s = pickSplitPoint(s, { mode: 'RATIO', value: 0.5 });
      s = chooseInsertedObject(s, 'station');
      s = chooseStationType(s, VALID_STATION);
      s = chooseTransformer(s, VALID_TRANSFORMER);
      return s;
    }
    const ref = run();
    for (let i = 0; i < 5; i++) {
      expect(run()).toEqual(ref);
    }
  });
});
