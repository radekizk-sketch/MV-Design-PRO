/**
 * buildNetworkTerrain (R18) tests — ENM → NetworkTerrainRendererProps mapping.
 */
import { describe, expect, it } from 'vitest';

import type { Bay, Bus, EnergyNetworkModel, Generator, Substation, Transformer } from '../../../../../types/enm';
import {
  attachSegmentMeasurements,
  attachStationVoltage,
  buildNetworkTerrain,
  getStationInputPort,
  getStationOutputPort,
} from '../buildNetworkTerrain';

function baseEnm(): EnergyNetworkModel {
  return {
    header: { schema_version: '1.0', source: 'test', generated_at: '2026-05-08T00:00:00Z' } as never,
    buses: [],
    branches: [],
    transformers: [],
    sources: [],
    loads: [],
    generators: [],
    substations: [],
    bays: [],
    junctions: [],
  } as EnergyNetworkModel;
}

function gpz(refId: string): Substation {
  return {
    id: refId, ref_id: refId, name: 'GPZ Test', tags: [], meta: {},
    station_type: 'gpz', bus_refs: ['gpz-bus'], transformer_refs: [],
  } as Substation;
}

function fieldStation(refId: string, name: string, type: Substation['station_type'] = 'mv_lv'): Substation {
  return {
    id: refId, ref_id: refId, name, tags: [], meta: {},
    station_type: type, bus_refs: [`${refId}-bus`], transformer_refs: [`${refId}-tr`],
  } as Substation;
}

function bay(refId: string, role: Bay['bay_role'], substationRef: string): Bay {
  return {
    id: refId, ref_id: refId, name: refId, tags: [], meta: {},
    bay_role: role, substation_ref: substationRef, bus_ref: `${substationRef}-bus`,
    equipment_refs: ['app-1'],
  } as Bay;
}

function transformer(refId: string, snMva: number = 0.4): Transformer {
  return {
    id: refId, ref_id: refId, name: 'TR', tags: [], meta: {},
    bus_hv_ref: 'bus-hv', bus_lv_ref: 'bus-lv',
    sn_mva: snMva, uhv_kv: 15, ulv_kv: 0.4,
  } as Transformer;
}

function busRow(refId: string, voltageKv: number): Bus {
  return {
    id: refId, ref_id: refId, name: `Bus ${voltageKv}`, voltage_kv: voltageKv,
    phase_system: '3ph', tags: [], meta: {},
  } as Bus;
}

describe('buildNetworkTerrain — basic', () => {
  it('Pusty ENM → 0 stations, 0 segments', () => {
    const result = buildNetworkTerrain(baseEnm());
    expect(result.stations.length).toBe(0);
    expect(result.segments.length).toBe(0);
  });

  it('1 GPZ + 0 field stations → 0 stations, 0 segments', () => {
    const enm: EnergyNetworkModel = {
      ...baseEnm(),
      substations: [gpz('gpz-1')],
    };
    const result = buildNetworkTerrain(enm);
    expect(result.stations.length).toBe(0);
    expect(result.segments.length).toBe(0);
  });

  it('1 GPZ + 1 field station → 1 NetworkStation, fallback segments', () => {
    const enm: EnergyNetworkModel = {
      ...baseEnm(),
      substations: [gpz('gpz-1'), fieldStation('sta-1', 'STAROŁĘCKA 42')],
      bays: [bay('sta-1-in', 'IN', 'sta-1'), bay('sta-1-tr', 'TR', 'sta-1')],
      transformers: [transformer('sta-1-tr', 0.4)],
      buses: [busRow('gpz-bus', 15), busRow('sta-1-bus', 15)],
    };
    const result = buildNetworkTerrain(enm);
    expect(result.stations.length).toBe(1);
    expect(result.stations[0].name).toBe('STAROŁĘCKA 42');
    expect(result.stations[0].hasTransformer).toBe(true);
    expect(result.stations[0].transformerRatedKva).toBe(400);
  });
});

describe('buildNetworkTerrain — line_runs (R18 main path)', () => {
  it('1 LineRun z 3 stations → 3 segmenty (GPZ→S1, S1→S2, S2→S3)', () => {
    const enm: EnergyNetworkModel = {
      ...baseEnm(),
      substations: [
        gpz('gpz-1'),
        fieldStation('sta-1', 'STA1'),
        fieldStation('sta-2', 'STA2'),
        fieldStation('sta-3', 'STA3'),
      ],
      bays: [
        bay('sta-1-in', 'IN', 'sta-1'),
        bay('sta-1-out', 'OUT', 'sta-1'),
        bay('sta-2-in', 'IN', 'sta-2'),
        bay('sta-2-out', 'OUT', 'sta-2'),
        bay('sta-3-in', 'IN', 'sta-3'),
      ],
      transformers: [transformer('sta-1-tr'), transformer('sta-2-tr'), transformer('sta-3-tr')],
      branches: [
        { id: 'cab1', ref_id: 'cab1', name: 'MST1795', tags: [], meta: {}, kind: 'cable', from_bus: 'gpz-bus', to_bus: 'sta-1-bus', length_km: 0.35 } as never,
        { id: 'cab2', ref_id: 'cab2', name: 'K/E537', tags: [], meta: {}, kind: 'cable', from_bus: 'sta-1-bus', to_bus: 'sta-2-bus', length_km: 0.42 } as never,
        { id: 'cab3', ref_id: 'cab3', name: 'ZKSN6012', tags: [], meta: {}, kind: 'cable', from_bus: 'sta-2-bus', to_bus: 'sta-3-bus', length_km: 0.28 } as never,
      ],
      buses: [busRow('gpz-bus', 15), busRow('sta-1-bus', 15), busRow('sta-2-bus', 15), busRow('sta-3-bus', 15)],
      line_runs: [{
        id: 'run-1',
        run_kind: 'main_trunk',
        starting_bay_ref: 'gpz-bay-1',
        starting_port_ref: 'gpz-bay-1-port',
        segments: [
          { segment_ref: 'cab1', order: 0 },
          { segment_ref: 'cab2', order: 1 },
          { segment_ref: 'cab3', order: 2 },
        ],
        stations: [
          { substation_ref: 'sta-1', order: 0 },
          { substation_ref: 'sta-2', order: 1 },
          { substation_ref: 'sta-3', order: 2 },
        ],
      }],
    };
    const result = buildNetworkTerrain(enm);
    expect(result.stations.length).toBe(3);
    expect(result.segments.length).toBe(3);
    expect(result.segments[0].source.elementRef).toBe('gpz');
    expect(result.segments[0].target.elementRef).toBe('sta-1');
    expect(result.segments[1].source.elementRef).toBe('sta-1');
    expect(result.segments[1].target.elementRef).toBe('sta-2');
    expect(result.segments[2].source.elementRef).toBe('sta-2');
    expect(result.segments[2].target.elementRef).toBe('sta-3');
  });

  it('Każdy segment ma source.portKind=sn_output, target.portKind=sn_input', () => {
    const enm: EnergyNetworkModel = {
      ...baseEnm(),
      substations: [gpz('gpz-1'), fieldStation('sta-1', 'STA1'), fieldStation('sta-2', 'STA2')],
      bays: [bay('sta-1-in', 'IN', 'sta-1'), bay('sta-1-out', 'OUT', 'sta-1'), bay('sta-2-in', 'IN', 'sta-2')],
      transformers: [transformer('sta-1-tr'), transformer('sta-2-tr')],
      buses: [busRow('gpz-bus', 15), busRow('sta-1-bus', 15), busRow('sta-2-bus', 15)],
      line_runs: [{
        id: 'run-1',
        run_kind: 'main_trunk',
        starting_bay_ref: 'gpz-bay-1',
        starting_port_ref: 'gpz-bay-1-port',
        segments: [{ segment_ref: 's1', order: 0 }, { segment_ref: 's2', order: 1 }],
        stations: [{ substation_ref: 'sta-1', order: 0 }, { substation_ref: 'sta-2', order: 1 }],
      }],
    };
    const result = buildNetworkTerrain(enm);
    for (const seg of result.segments) {
      expect(seg.source.portKind).toBe('sn_output');
      expect(seg.target.portKind).toBe('sn_input');
    }
  });

  it('NOP station (tie_open) → segment z runKind=tie_open + energization=deenergized', () => {
    const enm: EnergyNetworkModel = {
      ...baseEnm(),
      substations: [gpz('gpz-1'), fieldStation('sta-1', 'STA1'), fieldStation('sta-2', 'STA2')],
      bays: [bay('sta-1-in', 'IN', 'sta-1'), bay('sta-1-out', 'OUT', 'sta-1'), bay('sta-2-in', 'IN', 'sta-2')],
      transformers: [transformer('sta-1-tr'), transformer('sta-2-tr')],
      buses: [busRow('gpz-bus', 15), busRow('sta-1-bus', 15), busRow('sta-2-bus', 15)],
      line_runs: [{
        id: 'run-1',
        run_kind: 'main_trunk',
        starting_bay_ref: 'gpz-bay-1',
        starting_port_ref: 'gpz-bay-1-port',
        segments: [{ segment_ref: 's1', order: 0 }, { segment_ref: 's2', order: 1 }],
        stations: [{ substation_ref: 'sta-1', order: 0 }, { substation_ref: 'sta-2', order: 1 }],
        nop_station_ref: 'sta-2',
      }],
    };
    const result = buildNetworkTerrain(enm);
    /* Drugi segment (do sta-2 czyli NOP) ma runKind=tie_open */
    expect(result.segments[1].runKind).toBe('tie_open');
    expect(result.segments[1].energization).toBe('deenergized');
    expect(result.segments[1].flowDirection).toBe('none');
  });

  it('Cable number z LineRun.segments[].segment_ref → branch.name', () => {
    const enm: EnergyNetworkModel = {
      ...baseEnm(),
      substations: [gpz('gpz-1'), fieldStation('sta-1', 'STA1')],
      bays: [bay('sta-1-in', 'IN', 'sta-1')],
      transformers: [transformer('sta-1-tr')],
      branches: [
        { id: 'cab1', ref_id: 'cab1', name: 'MST1795', tags: [], meta: {}, kind: 'cable', from_bus: 'gpz-bus', to_bus: 'sta-1-bus', length_km: 0.35 } as never,
      ],
      buses: [busRow('gpz-bus', 15), busRow('sta-1-bus', 15)],
      line_runs: [{
        id: 'run-1',
        run_kind: 'main_trunk',
        starting_bay_ref: 'gpz-bay-1',
        starting_port_ref: 'gpz-bay-1-port',
        segments: [{ segment_ref: 'cab1', order: 0 }],
        stations: [{ substation_ref: 'sta-1', order: 0 }],
      }],
    };
    const result = buildNetworkTerrain(enm);
    expect(result.segments[0].cableNumber).toBe('MST1795');
    expect(result.segments[0].lengthM).toBe(350); // 0.35km * 1000
  });
});

describe('buildNetworkTerrain — DER + footprint', () => {
  it('Stacja z PV + BESS → footprintType=der_station + 2 derBadges', () => {
    const enm: EnergyNetworkModel = {
      ...baseEnm(),
      substations: [gpz('gpz-1'), fieldStation('sta-der', 'PV STATION')],
      bays: [bay('sta-der-in', 'IN', 'sta-der')],
      transformers: [transformer('sta-der-tr')],
      generators: [
        { id: 'g1', ref_id: 'g1', name: 'PV1', tags: [], meta: {}, bus_ref: 'sta-der-bus', p_mw: 0.1, gen_type: 'pv_inverter', station_ref: 'sta-der' } as Generator,
        { id: 'g2', ref_id: 'g2', name: 'BESS1', tags: [], meta: {}, bus_ref: 'sta-der-bus', p_mw: 0.5, gen_type: 'bess', station_ref: 'sta-der' } as Generator,
      ],
      buses: [busRow('gpz-bus', 15), busRow('sta-der-bus', 15)],
    };
    const result = buildNetworkTerrain(enm);
    expect(result.stations[0].footprintType).toBe('der_station');
    expect(result.stations[0].derBadges.length).toBe(2);
  });

  it('Stacja switching → footprintType=switching_station', () => {
    const enm: EnergyNetworkModel = {
      ...baseEnm(),
      substations: [gpz('gpz-1'), fieldStation('sta-sw', 'SP', 'switching')],
      bays: [bay('sta-sw-1', 'IN', 'sta-sw')],
      buses: [busRow('gpz-bus', 15), busRow('sta-sw-bus', 15)],
    };
    const result = buildNetworkTerrain(enm);
    expect(result.stations[0].footprintType).toBe('switching_station');
  });
});

describe('buildNetworkTerrain — layout determinizm', () => {
  it('Same ENM → same positions (5 reruny)', () => {
    const enm: EnergyNetworkModel = {
      ...baseEnm(),
      substations: [
        gpz('gpz-1'),
        fieldStation('sta-1', 'STA1'),
        fieldStation('sta-2', 'STA2'),
      ],
      bays: [bay('sta-1-1', 'IN', 'sta-1'), bay('sta-2-1', 'IN', 'sta-2')],
      transformers: [transformer('sta-1-tr'), transformer('sta-2-tr')],
      buses: [busRow('gpz-bus', 15), busRow('sta-1-bus', 15), busRow('sta-2-bus', 15)],
    };
    const ref = buildNetworkTerrain(enm);
    for (let i = 0; i < 5; i++) {
      const r = buildNetworkTerrain(enm);
      expect(r.stations.map((s) => s.x)).toEqual(ref.stations.map((s) => s.x));
      expect(r.stations.map((s) => s.y)).toEqual(ref.stations.map((s) => s.y));
    }
  });

  it('1-szy rząd: 6 stacji (R, R-1pitch, R-2pitch, ..., R-5pitch), 7-ma stacja na 2-gim rzędzie', () => {
    const subs: Substation[] = [gpz('gpz-1')];
    for (let i = 1; i <= 7; i++) {
      subs.push(fieldStation(`sta-${i}`, `STA${i}`));
    }
    const enm: EnergyNetworkModel = {
      ...baseEnm(),
      substations: subs,
      buses: [busRow('gpz-bus', 15)],
    };
    const result = buildNetworkTerrain(enm);
    /* Pierwsze 6 stacji są w pierwszym rzędzie (y=360), 7-ma w 2-gim rzędzie (y=540) */
    const ys = result.stations.map((s) => s.y);
    expect(ys.filter((y) => y === 360).length).toBe(6);
    expect(ys.filter((y) => y === 540).length).toBe(1);
  });
});

describe('attachSegmentMeasurements + attachStationVoltage (R19 hookpoint)', () => {
  it('attachSegmentMeasurements wzbogaca segmenty o load flow data', () => {
    const enm: EnergyNetworkModel = {
      ...baseEnm(),
      substations: [gpz('gpz-1'), fieldStation('sta-1', 'STA1')],
      bays: [bay('sta-1-1', 'IN', 'sta-1')],
      transformers: [transformer('sta-1-tr')],
      buses: [busRow('gpz-bus', 15), busRow('sta-1-bus', 15)],
    };
    const built = buildNetworkTerrain(enm);
    const segId = built.segments[0].segmentId;
    const enriched = attachSegmentMeasurements(built.segments, new Map([
      [segId, { pMw: 5.5, qMvar: 1.2, iA: 80, lossPercent: 1.5 }],
    ]));
    expect(enriched[0].measurements?.pMw).toBe(5.5);
    expect(enriched[0].measurements?.iA).toBe(80);
  });

  it('attachStationVoltage wzbogaca stacje o voltage z load flow', () => {
    const enm: EnergyNetworkModel = {
      ...baseEnm(),
      substations: [gpz('gpz-1'), fieldStation('sta-1', 'STA1')],
      bays: [bay('sta-1-1', 'IN', 'sta-1')],
      transformers: [transformer('sta-1-tr')],
      buses: [busRow('gpz-bus', 15), busRow('sta-1-bus', 15)],
    };
    const built = buildNetworkTerrain(enm);
    const enriched = attachStationVoltage(built.stations, new Map([
      ['sta-1', { actualKv: 14.85, dropPercent: 1.0 }],
    ]));
    expect(enriched[0].voltageActualKv).toBe(14.85);
    expect(enriched[0].voltageDropPercent).toBe(1.0);
  });
});

describe('getStationInputPort + getStationOutputPort (port helpers)', () => {
  it('getStationInputPort zwraca portKind=sn_input + y above station', () => {
    const enm: EnergyNetworkModel = {
      ...baseEnm(),
      substations: [gpz('gpz-1'), fieldStation('sta-1', 'STA1')],
      bays: [bay('sta-1-in', 'IN', 'sta-1')],
      buses: [busRow('gpz-bus', 15)],
    };
    const built = buildNetworkTerrain(enm);
    const port = getStationInputPort(built.stations[0]);
    expect(port.portKind).toBe('sn_input');
    expect(port.y).toBe(built.stations[0].y - 28);
    expect(port.bayRef).toBe('sta-1-in');
  });

  it('getStationOutputPort zwraca portKind=sn_output + y below station', () => {
    const enm: EnergyNetworkModel = {
      ...baseEnm(),
      substations: [gpz('gpz-1'), fieldStation('sta-1', 'STA1')],
      bays: [bay('sta-1-out', 'OUT', 'sta-1')],
      buses: [busRow('gpz-bus', 15)],
    };
    const built = buildNetworkTerrain(enm);
    const port = getStationOutputPort(built.stations[0]);
    expect(port.portKind).toBe('sn_output');
    expect(port.y).toBe(built.stations[0].y + 28);
    expect(port.bayRef).toBe('sta-1-out');
  });
});
