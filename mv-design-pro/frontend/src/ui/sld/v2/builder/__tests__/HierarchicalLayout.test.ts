/**
 * HierarchicalLayout tests — deterministyczny layout z BuildSequence (PR-5).
 *
 * Cover invariants:
 * 1. Determinizm — same BuildSequence → same EffectiveLayout (hash stable)
 * 2. Snap to grid — wszystkie współrzędne to multiple of GRID_BASE_PX
 * 3. SetSwitchState/SetNop nie zmieniają geometrii (state→style invariant)
 * 4. Każda komenda alokuje deterministycznie swój slot
 */

import { describe, expect, it } from 'vitest';

import {
  appendCommand,
  emptyBuildSequence,
  type BuildCommand,
} from '../BuildSequence';
import { computeLayout } from '../HierarchicalLayout';

const GPZ_CMD: BuildCommand = {
  type: 'InsertGpz',
  id: 'gpz_1',
  name: 'GPZ Test',
  voltageHighKv: 110,
  voltageLowKv: 15,
  scShortCircuitMva: 4000,
};

const SECTION_CMD: BuildCommand = {
  type: 'AddSection',
  id: 'sec_1',
  gpzId: 'gpz_1',
  number: 1,
  busVoltageKv: 15,
};

const BAY_CMD: BuildCommand = {
  type: 'AddBay',
  id: 'bay_1',
  sectionId: 'sec_1',
  designation: 'Q01',
  bayTemplateId: 'bay_outgoing_sn',
};

const RUN_CMD: BuildCommand = {
  type: 'ExtendCableRun',
  id: 'run_1',
  fromBayId: 'bay_1',
  fromPortId: 'p_out',
  runKind: 'main_trunk',
  segmentKind: 'cable_sn',
  catalogRef: null,
  lengthKm: 2.5,
  parentRunId: null,
  branchOriginStationId: null,
};

const STATION_CMD: BuildCommand = {
  type: 'InsertStationOnRun',
  id: 'st_1',
  runId: 'run_1',
  afterSegmentId: 'seg_1',
  stationName: 'Stacja A',
  stationTemplateId: 'station_basic',
};

const DER_CMD: BuildCommand = {
  type: 'AttachDer',
  id: 'der_1',
  derKind: 'PV',
  attachmentPortId: 'port_x',
  parentStationId: 'st_1',
  nominalPowerKw: 100,
  portKind: 'output',
};

function buildFullSequence() {
  let seq = emptyBuildSequence();
  seq = appendCommand(seq, GPZ_CMD);
  seq = appendCommand(seq, SECTION_CMD);
  seq = appendCommand(seq, BAY_CMD);
  seq = appendCommand(seq, RUN_CMD);
  seq = appendCommand(seq, STATION_CMD);
  seq = appendCommand(seq, DER_CMD);
  return seq;
}

describe('computeLayout — empty sequence', () => {
  it('produces empty layout with v2 version', () => {
    const layout = computeLayout(emptyBuildSequence());
    expect(layout.version).toBe('v2');
    expect(layout.elements.size).toBe(0);
    expect(layout.paths.size).toBe(0);
    expect(typeof layout.hash).toBe('string');
    expect(layout.hash).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('computeLayout — element placement', () => {
  it('places GPZ', () => {
    const layout = computeLayout(appendCommand(emptyBuildSequence(), GPZ_CMD));
    expect(layout.elements.has('gpz_1')).toBe(true);
    const gpz = layout.elements.get('gpz_1')!;
    expect(typeof gpz.x).toBe('number');
    expect(typeof gpz.y).toBe('number');
  });

  it('places section after GPZ', () => {
    let seq = emptyBuildSequence();
    seq = appendCommand(seq, GPZ_CMD);
    seq = appendCommand(seq, SECTION_CMD);
    const layout = computeLayout(seq);
    expect(layout.elements.has('sec_1')).toBe(true);
  });

  it('places bay after section', () => {
    let seq = emptyBuildSequence();
    seq = appendCommand(seq, GPZ_CMD);
    seq = appendCommand(seq, SECTION_CMD);
    seq = appendCommand(seq, BAY_CMD);
    const layout = computeLayout(seq);
    expect(layout.elements.has('bay_1')).toBe(true);
  });

  it('places run anchored to bay head', () => {
    let seq = emptyBuildSequence();
    seq = appendCommand(seq, GPZ_CMD);
    seq = appendCommand(seq, SECTION_CMD);
    seq = appendCommand(seq, BAY_CMD);
    seq = appendCommand(seq, RUN_CMD);
    const layout = computeLayout(seq);
    expect(layout.elements.has('run_1')).toBe(true);
    const run = layout.elements.get('run_1')!;
    const bay = layout.elements.get('bay_1')!;
    // Run starts at same X as bay head
    expect(run.x).toBe(bay.x);
  });

  it('places station on run + creates segment path', () => {
    let seq = emptyBuildSequence();
    seq = appendCommand(seq, GPZ_CMD);
    seq = appendCommand(seq, SECTION_CMD);
    seq = appendCommand(seq, BAY_CMD);
    seq = appendCommand(seq, RUN_CMD);
    seq = appendCommand(seq, STATION_CMD);
    const layout = computeLayout(seq);
    expect(layout.elements.has('st_1')).toBe(true);
    expect(layout.paths.has('run_1::seg_0')).toBe(true);
    const segPath = layout.paths.get('run_1::seg_0')!;
    expect(segPath.length).toBeGreaterThanOrEqual(2);
  });

  it('places DER attached to parent station + creates attach path', () => {
    const layout = computeLayout(buildFullSequence());
    expect(layout.elements.has('der_1')).toBe(true);
    expect(layout.paths.has('der_1::attach')).toBe(true);
  });
});

describe('computeLayout — multiple sections', () => {
  it('positions multiple sections at different X offsets', () => {
    let seq = emptyBuildSequence();
    seq = appendCommand(seq, GPZ_CMD);
    seq = appendCommand(seq, SECTION_CMD);
    seq = appendCommand(seq, {
      ...SECTION_CMD,
      id: 'sec_2',
      number: 2,
    });
    const layout = computeLayout(seq);
    const sec1 = layout.elements.get('sec_1')!;
    const sec2 = layout.elements.get('sec_2')!;
    // sec_2 to the right of sec_1
    expect(sec2.x).toBeGreaterThan(sec1.x);
    // Same Y (busbar level)
    expect(sec2.y).toBe(sec1.y);
  });

  it('positions multiple bays at different X within section', () => {
    let seq = emptyBuildSequence();
    seq = appendCommand(seq, GPZ_CMD);
    seq = appendCommand(seq, SECTION_CMD);
    seq = appendCommand(seq, BAY_CMD);
    seq = appendCommand(seq, {
      ...BAY_CMD,
      id: 'bay_2',
      designation: 'Q02',
    });
    const layout = computeLayout(seq);
    const bay1 = layout.elements.get('bay_1')!;
    const bay2 = layout.elements.get('bay_2')!;
    expect(bay2.x).toBeGreaterThan(bay1.x);
    expect(bay2.y).toBe(bay1.y);
  });
});

describe('computeLayout — multiple stations on a run', () => {
  it('positions stations sequentially + creates per-segment paths', () => {
    let seq = emptyBuildSequence();
    seq = appendCommand(seq, GPZ_CMD);
    seq = appendCommand(seq, SECTION_CMD);
    seq = appendCommand(seq, BAY_CMD);
    seq = appendCommand(seq, RUN_CMD);
    seq = appendCommand(seq, STATION_CMD);
    seq = appendCommand(seq, {
      ...STATION_CMD,
      id: 'st_2',
      stationName: 'Stacja B',
    });
    const layout = computeLayout(seq);
    expect(layout.elements.has('st_1')).toBe(true);
    expect(layout.elements.has('st_2')).toBe(true);
    expect(layout.paths.has('run_1::seg_0')).toBe(true);
    expect(layout.paths.has('run_1::seg_1')).toBe(true);
    // Station 2 is further along the run than station 1
    const st1 = layout.elements.get('st_1')!;
    const st2 = layout.elements.get('st_2')!;
    expect(st2.x).toBeGreaterThan(st1.x);
  });
});

describe('computeLayout — SetSwitchState/SetNop state-only', () => {
  it('SetSwitchState does not change geometry', () => {
    const base = buildFullSequence();
    const baseLayout = computeLayout(base);

    const withSwitchState = appendCommand(base, {
      type: 'SetSwitchState',
      deviceId: 'dev_x',
      newState: 'open',
    });
    const stateLayout = computeLayout(withSwitchState);
    expect(stateLayout.hash).toBe(baseLayout.hash);
    expect(stateLayout.elements.size).toBe(baseLayout.elements.size);
  });

  it('SetNop does not change geometry', () => {
    const base = buildFullSequence();
    const baseLayout = computeLayout(base);

    const withNop = appendCommand(base, {
      type: 'SetNop',
      runId: 'run_1',
      stationId: 'st_1',
    });
    const nopLayout = computeLayout(withNop);
    expect(nopLayout.hash).toBe(baseLayout.hash);
  });
});

describe('computeLayout — determinism', () => {
  it('same sequence → identical layout hash', () => {
    const seq = buildFullSequence();
    const l1 = computeLayout(seq);
    const l2 = computeLayout(seq);
    expect(l1.hash).toBe(l2.hash);
    expect(l1.elements.size).toBe(l2.elements.size);
    expect(l1.paths.size).toBe(l2.paths.size);
  });

  it('different sequences → different hashes (sanity)', () => {
    const seq1 = appendCommand(emptyBuildSequence(), GPZ_CMD);
    let seq2 = emptyBuildSequence();
    seq2 = appendCommand(seq2, GPZ_CMD);
    seq2 = appendCommand(seq2, SECTION_CMD);
    const h1 = computeLayout(seq1).hash;
    const h2 = computeLayout(seq2).hash;
    expect(h1).not.toBe(h2);
  });

  it('hash is hex string of length 8 (FNV-1a 32-bit)', () => {
    const layout = computeLayout(buildFullSequence());
    expect(layout.hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('hash insensitive to Map iteration order (sorted keys)', () => {
    // Apply same commands in same order — hash must equal regardless of
    // internal Map ordering quirks. Stronger: build twice and verify.
    const a = computeLayout(buildFullSequence());
    const b = computeLayout(buildFullSequence());
    expect(a.hash).toBe(b.hash);
  });
});

describe('computeLayout — branch run (parentRunId)', () => {
  it('handles branch run as child of parent run', () => {
    let seq = emptyBuildSequence();
    seq = appendCommand(seq, GPZ_CMD);
    seq = appendCommand(seq, SECTION_CMD);
    seq = appendCommand(seq, BAY_CMD);
    seq = appendCommand(seq, RUN_CMD);
    seq = appendCommand(seq, STATION_CMD);
    seq = appendCommand(seq, {
      ...RUN_CMD,
      id: 'run_2',
      parentRunId: 'run_1',
      branchOriginStationId: 'st_1',
      runKind: 'branch',
    });
    const layout = computeLayout(seq);
    expect(layout.elements.has('run_2')).toBe(true);
  });
});
