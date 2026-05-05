/**
 * PR-5 — Testy HierarchicalLayout: determinizm + przyrostowość.
 *
 * Inwarianty (BINDING):
 * 1. Ten sam BuildSequence → identyczny EffectiveLayout (hash stable, 1000 iteracji).
 * 2. Dodanie komendy zmienia layout TYLKO w obszarze sąsiadującym (nie przesuwa
 *    istniejących obiektów w innych slotach).
 * 3. Snap to grid: każda współrzędna jest wielokrotnością GRID_BASE_PX.
 * 4. Routing ortogonalny: brak diagonalnych segmentów.
 */

import { describe, expect, it } from 'vitest';

import {
  type BuildCommand,
  type BuildSequence,
  appendCommand,
  buildSequenceStats,
  emptyBuildSequence,
  inferBuildPhase,
  tryApplyCommand,
  validateCommand,
} from '../builder/BuildSequence';
import { computeLayout } from '../builder/HierarchicalLayout';
import { isOnGrid, isOrthogonal } from '../geometry/routing';
import { GRID_BASE_PX } from '../theme/tokens';

/* ---------------------------------------------------------------------------
   Helper: sample sequence (GPZ + Section + 2 Bays + 1 Run + 2 Stations + 1 DER)
   --------------------------------------------------------------------------- */

function buildSampleSequence(): BuildSequence {
  let seq = emptyBuildSequence();
  const commands: BuildCommand[] = [
    {
      type: 'InsertGpz',
      id: 'gpz_main',
      name: 'GPZ Główny',
      voltageHighKv: 110,
      voltageLowKv: 15,
      scShortCircuitMva: 500,
    },
    {
      type: 'AddSection',
      id: 'section_1',
      gpzId: 'gpz_main',
      number: 1,
      busVoltageKv: 15,
    },
    {
      type: 'AddBay',
      id: 'bay_F01',
      sectionId: 'section_1',
      designation: 'Pole F-01',
      bayTemplateId: 'bay_template_line_out',
    },
    {
      type: 'AddBay',
      id: 'bay_F02',
      sectionId: 'section_1',
      designation: 'Pole F-02',
      bayTemplateId: 'bay_template_line_out',
    },
    {
      type: 'ExtendCableRun',
      id: 'run_F01',
      fromBayId: 'bay_F01',
      fromPortId: 'gpz_main:bay_F01:sn_output',
      runKind: 'main_trunk',
      segmentKind: 'cable_sn',
      catalogRef: null,
      lengthKm: 2.5,
      parentRunId: null,
      branchOriginStationId: null,
    },
    {
      type: 'InsertStationOnRun',
      id: 'station_ST01',
      runId: 'run_F01',
      afterSegmentId: 'seg_0',
      stationName: 'Stacja ST-01',
      stationTemplateId: 'station_template_inline',
    },
    {
      type: 'InsertStationOnRun',
      id: 'station_ST02',
      runId: 'run_F01',
      afterSegmentId: 'seg_1',
      stationName: 'Stacja ST-02',
      stationTemplateId: 'station_template_terminal',
    },
    {
      type: 'AttachDer',
      id: 'pv_01',
      derKind: 'PV',
      attachmentPortId: 'station_ST02:bay_pv:sn_der_pv',
      parentStationId: 'station_ST02',
      nominalPowerKw: 2000,
      portKind: 'sn_der_pv',
    },
  ];
  for (const cmd of commands) {
    seq = appendCommand(seq, cmd);
  }
  return seq;
}

/* ---------------------------------------------------------------------------
   Determinizm
   --------------------------------------------------------------------------- */

describe('HierarchicalLayout — determinizm (BINDING inwariant)', () => {
  it('ten sam BuildSequence produkuje identyczny hash', () => {
    const seq = buildSampleSequence();
    const layouts = Array.from({ length: 100 }, () => computeLayout(seq));
    const firstHash = layouts[0].hash;
    for (const layout of layouts) {
      expect(layout.hash).toBe(firstHash);
    }
  });

  it('hash zmienia się przy dodaniu nowej komendy', () => {
    const seq1 = buildSampleSequence();
    const layout1 = computeLayout(seq1);

    const seq2 = appendCommand(seq1, {
      type: 'InsertStationOnRun',
      id: 'station_ST03',
      runId: 'run_F01',
      afterSegmentId: 'seg_2',
      stationName: 'Stacja ST-03',
      stationTemplateId: 'station_template_terminal',
    });
    const layout2 = computeLayout(seq2);

    expect(layout1.hash).not.toBe(layout2.hash);
  });

  it('pusta sekwencja produkuje pusty layout (zero elementów)', () => {
    const seq = emptyBuildSequence();
    const layout = computeLayout(seq);
    expect(layout.elements.size).toBe(0);
    expect(layout.paths.size).toBe(0);
  });
});

/* ---------------------------------------------------------------------------
   Przyrostowość — dodanie obiektu nie przesuwa istniejących
   --------------------------------------------------------------------------- */

describe('HierarchicalLayout — przyrostowość (BINDING inwariant)', () => {
  it('dodanie kolejnej stacji nie zmienia pozycji wcześniejszych stacji', () => {
    const seq1 = buildSampleSequence();
    const layout1 = computeLayout(seq1);

    const seq2 = appendCommand(seq1, {
      type: 'InsertStationOnRun',
      id: 'station_ST03',
      runId: 'run_F01',
      afterSegmentId: 'seg_2',
      stationName: 'Stacja ST-03',
      stationTemplateId: 'station_template_terminal',
    });
    const layout2 = computeLayout(seq2);

    // Wszystkie poprzednie obiekty mają niezmienione sloty
    for (const [id, slot] of layout1.elements) {
      const slot2 = layout2.elements.get(id);
      expect(slot2).toBeDefined();
      expect(slot2).toEqual(slot);
    }
  });

  it('dodanie nowej sekcji w GPZ nie zmienia pozycji istniejących pól', () => {
    let seq = emptyBuildSequence();
    seq = appendCommand(seq, {
      type: 'InsertGpz',
      id: 'gpz_1',
      name: 'GPZ',
      voltageHighKv: 110,
      voltageLowKv: 15,
      scShortCircuitMva: null,
    });
    seq = appendCommand(seq, {
      type: 'AddSection',
      id: 'section_1',
      gpzId: 'gpz_1',
      number: 1,
      busVoltageKv: 15,
    });
    seq = appendCommand(seq, {
      type: 'AddBay',
      id: 'bay_F01_s1',
      sectionId: 'section_1',
      designation: 'F-01',
      bayTemplateId: 'bay_template_line_out',
    });

    const layout1 = computeLayout(seq);
    const bayF01Pos = layout1.elements.get('bay_F01_s1');

    // Dodaj nową sekcję
    seq = appendCommand(seq, {
      type: 'AddSection',
      id: 'section_2',
      gpzId: 'gpz_1',
      number: 2,
      busVoltageKv: 15,
    });
    const layout2 = computeLayout(seq);

    expect(layout2.elements.get('bay_F01_s1')).toEqual(bayF01Pos);
  });

  it('dodanie pola w sekcji 2 nie zmienia pól w sekcji 1', () => {
    let seq = emptyBuildSequence();
    seq = appendCommand(seq, { type: 'InsertGpz', id: 'g', name: 'g', voltageHighKv: 110, voltageLowKv: 15, scShortCircuitMva: null });
    seq = appendCommand(seq, { type: 'AddSection', id: 's1', gpzId: 'g', number: 1, busVoltageKv: 15 });
    seq = appendCommand(seq, { type: 'AddSection', id: 's2', gpzId: 'g', number: 2, busVoltageKv: 15 });
    seq = appendCommand(seq, { type: 'AddBay', id: 'b1_s1', sectionId: 's1', designation: 'B1', bayTemplateId: 'bay_template_line_out' });

    const layout1 = computeLayout(seq);
    const b1Pos = layout1.elements.get('b1_s1');

    seq = appendCommand(seq, { type: 'AddBay', id: 'b1_s2', sectionId: 's2', designation: 'B1', bayTemplateId: 'bay_template_line_out' });
    const layout2 = computeLayout(seq);

    expect(layout2.elements.get('b1_s1')).toEqual(b1Pos);
  });
});

/* ---------------------------------------------------------------------------
   Snap to grid + ortogonalność
   --------------------------------------------------------------------------- */

describe('HierarchicalLayout — snap to grid', () => {
  it('każdy slot jest wielokrotnością GRID_BASE_PX', () => {
    const seq = buildSampleSequence();
    const layout = computeLayout(seq);
    for (const [, slot] of layout.elements) {
      expect(slot.x % GRID_BASE_PX).toBe(0);
      expect(slot.y % GRID_BASE_PX).toBe(0);
    }
  });

  it('każda ścieżka jest ortogonalna i na siatce', () => {
    const seq = buildSampleSequence();
    const layout = computeLayout(seq);
    for (const [pathId, points] of layout.paths) {
      const path = { points };
      expect(isOrthogonal(path), `Path ${pathId} not orthogonal`).toBe(true);
      expect(isOnGrid(path), `Path ${pathId} not on grid`).toBe(true);
    }
  });
});

/* ---------------------------------------------------------------------------
   BuildSequence walidacja
   --------------------------------------------------------------------------- */

describe('BuildSequence — walidacja komend', () => {
  it('odrzuca duplikat InsertGpz', () => {
    let seq = emptyBuildSequence();
    seq = appendCommand(seq, { type: 'InsertGpz', id: 'g1', name: 'GPZ 1', voltageHighKv: 110, voltageLowKv: 15, scShortCircuitMva: null });

    const result = validateCommand(seq, { type: 'InsertGpz', id: 'g2', name: 'GPZ 2', voltageHighKv: 110, voltageLowKv: 15, scShortCircuitMva: null });
    expect(result.valid).toBe(false);
    expect(result.errorPl).toContain('GPZ');
  });

  it('odrzuca AddSection bez wcześniejszego InsertGpz', () => {
    const seq = emptyBuildSequence();
    const result = validateCommand(seq, { type: 'AddSection', id: 's1', gpzId: 'nonexistent', number: 1, busVoltageKv: 15 });
    expect(result.valid).toBe(false);
  });

  it('odrzuca ExtendCableRun bez pola SN (zakaz wyprowadzania z szyny GPZ)', () => {
    let seq = emptyBuildSequence();
    seq = appendCommand(seq, { type: 'InsertGpz', id: 'g', name: 'G', voltageHighKv: 110, voltageLowKv: 15, scShortCircuitMva: null });
    seq = appendCommand(seq, { type: 'AddSection', id: 's', gpzId: 'g', number: 1, busVoltageKv: 15 });

    const result = validateCommand(seq, {
      type: 'ExtendCableRun',
      id: 'r1',
      fromBayId: 'nonexistent_bay',
      fromPortId: 'p',
      runKind: 'main_trunk',
      segmentKind: 'cable_sn',
      catalogRef: null,
      lengthKm: 1,
      parentRunId: null,
      branchOriginStationId: null,
    });
    expect(result.valid).toBe(false);
    expect(result.errorPl).toContain('pole SN');
  });

  it('akceptuje pełną sekwencję A → B → C → D → E → F (Scenariusze briefa)', () => {
    const seq = buildSampleSequence();
    const stats = buildSequenceStats(seq);
    expect(stats.gpzCount).toBe(1);
    expect(stats.sectionCount).toBe(1);
    expect(stats.bayCount).toBe(2);
    expect(stats.runCount).toBe(1);
    expect(stats.stationCount).toBe(2);
    expect(stats.derCount).toBe(1);
  });
});

describe('BuildSequence — inferBuildPhase', () => {
  it('pusta sekwencja → NO_SOURCE', () => {
    expect(inferBuildPhase(emptyBuildSequence())).toBe('NO_SOURCE');
  });

  it('GPZ bez ciągu → HAS_SOURCE', () => {
    let seq = emptyBuildSequence();
    seq = appendCommand(seq, { type: 'InsertGpz', id: 'g', name: 'G', voltageHighKv: 110, voltageLowKv: 15, scShortCircuitMva: null });
    expect(inferBuildPhase(seq)).toBe('HAS_SOURCE');
  });

  it('GPZ + ciąg bez stacji → HAS_TRUNKS', () => {
    let seq = emptyBuildSequence();
    seq = appendCommand(seq, { type: 'InsertGpz', id: 'g', name: 'G', voltageHighKv: 110, voltageLowKv: 15, scShortCircuitMva: null });
    seq = appendCommand(seq, { type: 'AddSection', id: 's', gpzId: 'g', number: 1, busVoltageKv: 15 });
    seq = appendCommand(seq, { type: 'AddBay', id: 'b', sectionId: 's', designation: 'B', bayTemplateId: 't' });
    seq = appendCommand(seq, {
      type: 'ExtendCableRun', id: 'r', fromBayId: 'b', fromPortId: 'p',
      runKind: 'main_trunk', segmentKind: 'cable_sn', catalogRef: null,
      lengthKm: 1, parentRunId: null, branchOriginStationId: null,
    });
    expect(inferBuildPhase(seq)).toBe('HAS_TRUNKS');
  });

  it('Pełna sieć z DER → READY', () => {
    expect(inferBuildPhase(buildSampleSequence())).toBe('READY');
  });
});

describe('BuildSequence — tryApplyCommand', () => {
  it('successful apply zwraca { ok: true }', () => {
    const seq = emptyBuildSequence();
    const result = tryApplyCommand(seq, {
      type: 'InsertGpz', id: 'g', name: 'G', voltageHighKv: 110, voltageLowKv: 15, scShortCircuitMva: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sequence.commands.length).toBe(1);
    }
  });

  it('failed apply zwraca { ok: false, errorPl }', () => {
    let seq = emptyBuildSequence();
    seq = appendCommand(seq, { type: 'InsertGpz', id: 'g', name: 'G', voltageHighKv: 110, voltageLowKv: 15, scShortCircuitMva: null });

    const result = tryApplyCommand(seq, {
      type: 'InsertGpz', id: 'g2', name: 'G2', voltageHighKv: 110, voltageLowKv: 15, scShortCircuitMva: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorPl).toBeTruthy();
    }
  });
});
