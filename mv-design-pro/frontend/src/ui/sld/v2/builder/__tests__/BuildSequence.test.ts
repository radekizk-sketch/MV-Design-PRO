/**
 * BuildSequence tests — event-sourced builder commands.
 *
 * Reference: docs/sld/SLD_CAD_SCADA_REBUILD.md §5 (tryb budowy modelu)
 */

import { describe, expect, it } from 'vitest';

import {
  appendCommand,
  buildSequenceStats,
  emptyBuildSequence,
  inferBuildPhase,
  popLastCommand,
  tryApplyCommand,
  validateCommand,
  type BuildCommand,
  type BuildSequence,
} from '../BuildSequence';

const GPZ_CMD: BuildCommand = {
  type: 'InsertGpz',
  id: 'gpz_1',
  name: 'GPZ Białystok',
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

describe('emptyBuildSequence', () => {
  it('creates empty sequence with v1 version', () => {
    const seq = emptyBuildSequence();
    expect(seq.commands).toEqual([]);
    expect(seq.version).toBe('v1');
  });
});

describe('appendCommand', () => {
  it('returns new sequence (immutability)', () => {
    const seq = emptyBuildSequence();
    const next = appendCommand(seq, GPZ_CMD);
    expect(seq.commands).toEqual([]);
    expect(next.commands).toHaveLength(1);
    expect(next.commands[0]).toEqual(GPZ_CMD);
  });

  it('preserves order across multiple appends', () => {
    let seq = emptyBuildSequence();
    seq = appendCommand(seq, GPZ_CMD);
    seq = appendCommand(seq, SECTION_CMD);
    seq = appendCommand(seq, BAY_CMD);
    expect(seq.commands.map((c) => c.type)).toEqual([
      'InsertGpz',
      'AddSection',
      'AddBay',
    ]);
  });
});

describe('popLastCommand', () => {
  it('returns same sequence when empty', () => {
    const seq = emptyBuildSequence();
    expect(popLastCommand(seq)).toEqual(seq);
  });

  it('removes the last command (undo)', () => {
    let seq = emptyBuildSequence();
    seq = appendCommand(seq, GPZ_CMD);
    seq = appendCommand(seq, SECTION_CMD);
    const undone = popLastCommand(seq);
    expect(undone.commands).toHaveLength(1);
    expect(undone.commands[0]).toEqual(GPZ_CMD);
  });
});

describe('validateCommand — InsertGpz', () => {
  it('allows first GPZ', () => {
    const result = validateCommand(emptyBuildSequence(), GPZ_CMD);
    expect(result.valid).toBe(true);
  });

  it('rejects second GPZ in same project', () => {
    const seq = appendCommand(emptyBuildSequence(), GPZ_CMD);
    const result = validateCommand(seq, {
      ...GPZ_CMD,
      id: 'gpz_2',
      name: 'GPZ 2',
    });
    expect(result.valid).toBe(false);
    expect(result.errorPl).toMatch(/jeden główny punkt zasilania/);
  });
});

describe('validateCommand — AddSection', () => {
  it('rejects when GPZ not present', () => {
    const result = validateCommand(emptyBuildSequence(), SECTION_CMD);
    expect(result.valid).toBe(false);
    expect(result.errorPl).toMatch(/GPZ gpz_1 nie istnieje/);
  });

  it('accepts when GPZ exists', () => {
    const seq = appendCommand(emptyBuildSequence(), GPZ_CMD);
    const result = validateCommand(seq, SECTION_CMD);
    expect(result.valid).toBe(true);
  });
});

describe('validateCommand — AddBay', () => {
  it('rejects when section absent', () => {
    const result = validateCommand(emptyBuildSequence(), BAY_CMD);
    expect(result.valid).toBe(false);
    expect(result.errorPl).toMatch(/Sekcja sec_1 nie istnieje/);
  });

  it('accepts when section exists', () => {
    let seq = emptyBuildSequence();
    seq = appendCommand(seq, GPZ_CMD);
    seq = appendCommand(seq, SECTION_CMD);
    const result = validateCommand(seq, BAY_CMD);
    expect(result.valid).toBe(true);
  });
});

describe('validateCommand — ExtendCableRun (briefa §2 pkt 8)', () => {
  it('rejects cable run directly from GPZ busbar (must go through Bay)', () => {
    let seq = emptyBuildSequence();
    seq = appendCommand(seq, GPZ_CMD);
    seq = appendCommand(seq, SECTION_CMD);
    const result = validateCommand(seq, RUN_CMD);
    expect(result.valid).toBe(false);
    expect(result.errorPl).toMatch(/pole SN/);
    expect(result.errorPl).toMatch(/szyny GPZ/);
  });

  it('accepts when Bay exists', () => {
    let seq = emptyBuildSequence();
    seq = appendCommand(seq, GPZ_CMD);
    seq = appendCommand(seq, SECTION_CMD);
    seq = appendCommand(seq, BAY_CMD);
    const result = validateCommand(seq, RUN_CMD);
    expect(result.valid).toBe(true);
  });
});

describe('validateCommand — InsertStationOnRun', () => {
  it('rejects when run does not exist', () => {
    const cmd: BuildCommand = {
      type: 'InsertStationOnRun',
      id: 'st_1',
      runId: 'run_missing',
      afterSegmentId: 'seg_1',
      stationName: 'Stacja A',
      stationTemplateId: 'station_basic',
    };
    const result = validateCommand(emptyBuildSequence(), cmd);
    expect(result.valid).toBe(false);
    expect(result.errorPl).toMatch(/Ciąg run_missing nie istnieje/);
  });

  it('accepts when run exists', () => {
    let seq = emptyBuildSequence();
    seq = appendCommand(seq, GPZ_CMD);
    seq = appendCommand(seq, SECTION_CMD);
    seq = appendCommand(seq, BAY_CMD);
    seq = appendCommand(seq, RUN_CMD);
    const cmd: BuildCommand = {
      type: 'InsertStationOnRun',
      id: 'st_1',
      runId: 'run_1',
      afterSegmentId: 'seg_1',
      stationName: 'Stacja A',
      stationTemplateId: 'station_basic',
    };
    expect(validateCommand(seq, cmd).valid).toBe(true);
  });
});

describe('validateCommand — AttachDer', () => {
  it('rejects DER without attachment port', () => {
    const cmd: BuildCommand = {
      type: 'AttachDer',
      id: 'der_1',
      derKind: 'PV',
      attachmentPortId: '',
      parentStationId: null,
      nominalPowerKw: 100,
      portKind: 'output',
    };
    const result = validateCommand(emptyBuildSequence(), cmd);
    expect(result.valid).toBe(false);
    expect(result.errorPl).toMatch(/jasno określonego punktu przyłączenia/);
  });

  it('accepts DER with attachment port', () => {
    const cmd: BuildCommand = {
      type: 'AttachDer',
      id: 'der_1',
      derKind: 'PV',
      attachmentPortId: 'port_x',
      parentStationId: null,
      nominalPowerKw: 100,
      portKind: 'output',
    };
    expect(validateCommand(emptyBuildSequence(), cmd).valid).toBe(true);
  });
});

describe('validateCommand — SetSwitchState / SetNop (always valid)', () => {
  it('SetSwitchState accepted unconditionally', () => {
    const result = validateCommand(emptyBuildSequence(), {
      type: 'SetSwitchState',
      deviceId: 'dev_1',
      newState: 'open',
    });
    expect(result.valid).toBe(true);
  });

  it('SetNop accepted unconditionally', () => {
    const result = validateCommand(emptyBuildSequence(), {
      type: 'SetNop',
      runId: 'run_1',
      stationId: 'st_1',
    });
    expect(result.valid).toBe(true);
  });
});

describe('tryApplyCommand', () => {
  it('returns ok=true with new sequence when valid', () => {
    const result = tryApplyCommand(emptyBuildSequence(), GPZ_CMD);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sequence.commands).toHaveLength(1);
    }
  });

  it('returns ok=false with errorPl when invalid', () => {
    const result = tryApplyCommand(emptyBuildSequence(), SECTION_CMD);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorPl).toMatch(/GPZ gpz_1 nie istnieje/);
    }
  });
});

describe('buildSequenceStats', () => {
  it('counts zero on empty sequence', () => {
    const stats = buildSequenceStats(emptyBuildSequence());
    expect(stats).toEqual({
      gpzCount: 0,
      sectionCount: 0,
      bayCount: 0,
      runCount: 0,
      stationCount: 0,
      derCount: 0,
      totalCommands: 0,
    });
  });

  it('counts each command kind correctly', () => {
    let seq = emptyBuildSequence();
    seq = appendCommand(seq, GPZ_CMD);
    seq = appendCommand(seq, SECTION_CMD);
    seq = appendCommand(seq, BAY_CMD);
    seq = appendCommand(seq, RUN_CMD);
    seq = appendCommand(seq, {
      type: 'InsertStationOnRun',
      id: 'st_1',
      runId: 'run_1',
      afterSegmentId: 'seg_1',
      stationName: 'Stacja A',
      stationTemplateId: 'station_basic',
    });
    seq = appendCommand(seq, {
      type: 'AttachDer',
      id: 'der_1',
      derKind: 'PV',
      attachmentPortId: 'port_x',
      parentStationId: 'st_1',
      nominalPowerKw: 100,
      portKind: 'output',
    });
    const stats = buildSequenceStats(seq);
    expect(stats.gpzCount).toBe(1);
    expect(stats.sectionCount).toBe(1);
    expect(stats.bayCount).toBe(1);
    expect(stats.runCount).toBe(1);
    expect(stats.stationCount).toBe(1);
    expect(stats.derCount).toBe(1);
    expect(stats.totalCommands).toBe(6);
  });

  it('SetSwitchState/SetNop counted only in totalCommands', () => {
    let seq = emptyBuildSequence();
    seq = appendCommand(seq, {
      type: 'SetSwitchState',
      deviceId: 'dev_1',
      newState: 'open',
    });
    seq = appendCommand(seq, {
      type: 'SetNop',
      runId: 'run_1',
      stationId: 'st_1',
    });
    const stats = buildSequenceStats(seq);
    expect(stats.gpzCount).toBe(0);
    expect(stats.totalCommands).toBe(2);
  });
});

describe('inferBuildPhase', () => {
  it('NO_SOURCE on empty', () => {
    expect(inferBuildPhase(emptyBuildSequence())).toBe('NO_SOURCE');
  });

  it('HAS_SOURCE when only GPZ added', () => {
    const seq = appendCommand(emptyBuildSequence(), GPZ_CMD);
    expect(inferBuildPhase(seq)).toBe('HAS_SOURCE');
  });

  it('HAS_SOURCE when GPZ + section + bay but no run yet', () => {
    let seq = emptyBuildSequence();
    seq = appendCommand(seq, GPZ_CMD);
    seq = appendCommand(seq, SECTION_CMD);
    seq = appendCommand(seq, BAY_CMD);
    expect(inferBuildPhase(seq)).toBe('HAS_SOURCE');
  });

  it('HAS_TRUNKS when cable run extended but no station', () => {
    let seq = emptyBuildSequence();
    seq = appendCommand(seq, GPZ_CMD);
    seq = appendCommand(seq, SECTION_CMD);
    seq = appendCommand(seq, BAY_CMD);
    seq = appendCommand(seq, RUN_CMD);
    expect(inferBuildPhase(seq)).toBe('HAS_TRUNKS');
  });

  it('HAS_STATIONS when station added without DER', () => {
    let seq = emptyBuildSequence();
    seq = appendCommand(seq, GPZ_CMD);
    seq = appendCommand(seq, SECTION_CMD);
    seq = appendCommand(seq, BAY_CMD);
    seq = appendCommand(seq, RUN_CMD);
    seq = appendCommand(seq, {
      type: 'InsertStationOnRun',
      id: 'st_1',
      runId: 'run_1',
      afterSegmentId: 'seg_1',
      stationName: 'Stacja A',
      stationTemplateId: 'station_basic',
    });
    expect(inferBuildPhase(seq)).toBe('HAS_STATIONS');
  });

  it('READY when DER attached', () => {
    let seq = emptyBuildSequence();
    seq = appendCommand(seq, GPZ_CMD);
    seq = appendCommand(seq, SECTION_CMD);
    seq = appendCommand(seq, BAY_CMD);
    seq = appendCommand(seq, RUN_CMD);
    seq = appendCommand(seq, {
      type: 'InsertStationOnRun',
      id: 'st_1',
      runId: 'run_1',
      afterSegmentId: 'seg_1',
      stationName: 'Stacja A',
      stationTemplateId: 'station_basic',
    });
    seq = appendCommand(seq, {
      type: 'AttachDer',
      id: 'der_1',
      derKind: 'PV',
      attachmentPortId: 'port_x',
      parentStationId: 'st_1',
      nominalPowerKw: 100,
      portKind: 'output',
    });
    expect(inferBuildPhase(seq)).toBe('READY');
  });
});

describe('BuildSequence determinism', () => {
  it('same command sequence → identical state across runs', () => {
    const buildSeq = (): BuildSequence => {
      let seq = emptyBuildSequence();
      seq = appendCommand(seq, GPZ_CMD);
      seq = appendCommand(seq, SECTION_CMD);
      return seq;
    };
    expect(buildSeq()).toEqual(buildSeq());
  });
});
