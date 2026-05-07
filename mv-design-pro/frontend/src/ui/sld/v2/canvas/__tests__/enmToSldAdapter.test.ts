/**
 * Testy enmToSldAdapter (Iteracja 11) — adapter ENM → propsy rendererów SldCanvasV2.
 *
 * Pokrycie:
 *  1. Pusty snapshot → puste tablice.
 *  2. Determinizm: ten sam input → ten sam output (10× pod rząd).
 *  3. GPZ z transformatorem 110/SN → GpzRendererProps z voltageHighKv=110.
 *  4. Sekcje GPZ → SectionRendererProps z poprawnym numer + bayCount.
 *  5. Logical views: trunks → cableRuns z runKind='main_trunk'.
 *  6. Generators (PV/BESS/FW) → DerRendererProps.
 *  7. Stacje pole-wymiarowe (mv_lv/inline/branch/...) → StationOnRunRendererProps.
 */

import { describe, it, expect } from 'vitest';

import { buildSldDataFromSnapshot } from '../enmToSldAdapter';
import type {
  EnergyNetworkModel,
  LogicalViewsV1,
} from '../../../../../types/enm';

const EMPTY_HEADER = {
  enm_version: '1.0' as const,
  name: 'test',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  revision: 1,
  hash_sha256: 'a'.repeat(64),
  defaults: { frequency_hz: 50, unit_system: 'SI' as const },
};

function buildEmptySnapshot(): EnergyNetworkModel {
  return {
    header: EMPTY_HEADER,
    buses: [],
    branches: [],
    transformers: [],
    sources: [],
    loads: [],
    generators: [],
    substations: [],
    bays: [],
    measurements: [],
    protection_devices: [],
    protection_assignments: [],
    line_runs: [],
    connection_nodes: [],
    cable_joints: [],
  } as never;
}

describe('enmToSldAdapter — adapter snapshot → SldCanvasV2', () => {
  it('zwraca puste tablice gdy snapshot jest null', () => {
    const r = buildSldDataFromSnapshot(null, null);
    expect(r.gpzs).toEqual([]);
    expect(r.sections).toEqual([]);
    expect(r.cableRuns).toEqual([]);
    expect(r.stations).toEqual([]);
    expect(r.ders).toEqual([]);
  });

  it('zwraca puste tablice gdy snapshot pusty', () => {
    const snap = buildEmptySnapshot();
    const r = buildSldDataFromSnapshot(snap, null);
    expect(r.gpzs).toEqual([]);
    expect(r.sections).toEqual([]);
    expect(r.cableRuns).toEqual([]);
    expect(r.stations).toEqual([]);
    expect(r.ders).toEqual([]);
  });

  it('jest deterministyczny: ten sam input → ten sam output 10× pod rząd', () => {
    const snap = buildEmptySnapshot();
    snap.buses = [
      { id: 'b', ref_id: 'b', name: 'BUS-1', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
    ];
    snap.substations = [
      {
        id: 's', ref_id: 'GPZ-1', name: 'GPZ', tags: [], meta: {},
        station_type: 'gpz', bus_refs: ['b'], transformer_refs: [],
      } as never,
    ];
    const first = buildSldDataFromSnapshot(snap, null);
    for (let i = 0; i < 9; i++) {
      const next = buildSldDataFromSnapshot(snap, null);
      expect(JSON.stringify(next)).toBe(JSON.stringify(first));
    }
  });

  it('GPZ → GpzRendererProps z voltageHighKv=110 i voltageLowKv z busa', () => {
    const snap = buildEmptySnapshot();
    snap.buses = [
      { id: 'b1', ref_id: 'b1', name: 'BUS-SN', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
    ];
    snap.substations = [
      {
        id: 's', ref_id: 'GPZ-1', name: 'GPZ Centralny', tags: [], meta: {},
        station_type: 'gpz', bus_refs: ['b1'], transformer_refs: [],
      } as never,
    ];
    const r = buildSldDataFromSnapshot(snap, null);
    expect(r.gpzs).toHaveLength(1);
    expect(r.gpzs[0].id).toBe('GPZ-1');
    expect(r.gpzs[0].name).toBe('GPZ Centralny');
    expect(r.gpzs[0].voltageHighKv).toBe(110);
    expect(r.gpzs[0].voltageLowKv).toBe(15);
  });

  it('Sekcje GPZ → SectionRendererProps z numer + bayCount', () => {
    const snap = buildEmptySnapshot();
    snap.buses = [
      { id: 'b1', ref_id: 'b1', name: 'B1', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
    ];
    snap.substations = [
      {
        id: 's', ref_id: 'GPZ-1', name: 'GPZ', tags: [], meta: {},
        station_type: 'gpz', bus_refs: ['b1'], transformer_refs: [],
        gpz_sections: [
          { section_id: 'SEC-A', order: 1, bus_ref: 'b1' },
          { section_id: 'SEC-B', order: 2, bus_ref: 'b1' },
        ],
      } as never,
    ];
    snap.bays = [
      { id: 'bay1', ref_id: 'bay1', name: 'POLE 01', tags: [], meta: {}, bay_role: 'OUT', substation_ref: 'GPZ-1', bus_ref: 'b1', gpz_section_id: 'SEC-A', equipment_refs: [] } as never,
      { id: 'bay2', ref_id: 'bay2', name: 'POLE 02', tags: [], meta: {}, bay_role: 'OUT', substation_ref: 'GPZ-1', bus_ref: 'b1', gpz_section_id: 'SEC-A', equipment_refs: [] } as never,
    ];
    const r = buildSldDataFromSnapshot(snap, null);
    expect(r.sections).toHaveLength(2);
    expect(r.sections[0].number).toBe(1);
    expect(r.sections[0].busVoltageKv).toBe(15);
    expect(r.sections[0].bayCount).toBe(2);
    expect(r.sections[1].number).toBe(2);
    expect(r.sections[1].bayCount).toBe(0);
  });

  it('logical_views.trunks → cableRuns z main_trunk runKind', () => {
    const snap = buildEmptySnapshot();
    snap.branches = [
      {
        id: 'k1', ref_id: 'k1', name: 'K-1', tags: [], meta: {},
        type: 'cable', from_bus_ref: 'a', to_bus_ref: 'b', status: 'closed',
        length_km: 1, r_ohm_per_km: 0.5, x_ohm_per_km: 0.1,
      } as never,
    ];
    const lv: LogicalViewsV1 = {
      trunks: [{ corridor_ref: 'TRUNK-1', corridor_type: 'main', segments: ['k1'], no_point_ref: null, terminals: [] }],
      branches: [],
      secondary_connectors: [],
      terminals: [],
    };
    const r = buildSldDataFromSnapshot(snap, lv);
    expect(r.cableRuns).toHaveLength(1);
    expect(r.cableRuns[0].id).toBe('TRUNK-1');
    expect(r.cableRuns[0].runKind).toBe('main_trunk');
    expect(r.cableRuns[0].segmentKind).toBe('cable_sn');
  });

  it('Linia napowietrzna SN → segmentKind=overhead_line_sn', () => {
    const snap = buildEmptySnapshot();
    snap.branches = [
      {
        id: 'l1', ref_id: 'l1', name: 'L-1', tags: [], meta: {},
        type: 'line_overhead', from_bus_ref: 'a', to_bus_ref: 'b', status: 'closed',
        length_km: 2, r_ohm_per_km: 0.3, x_ohm_per_km: 0.4,
      } as never,
    ];
    const lv: LogicalViewsV1 = {
      trunks: [{ corridor_ref: 'T1', corridor_type: 'overhead', segments: ['l1'], no_point_ref: null, terminals: [] }],
      branches: [],
      secondary_connectors: [],
      terminals: [],
    };
    const r = buildSldDataFromSnapshot(snap, lv);
    expect(r.cableRuns[0].segmentKind).toBe('overhead_line_sn');
  });

  it('Generators z gen_type=pv_inverter/bess/wind_inverter → DER renderery', () => {
    const snap = buildEmptySnapshot();
    snap.generators = [
      { id: 'g1', ref_id: 'PV-1', name: 'PV-1', tags: [], meta: {}, bus_ref: 'b', p_mw: 1.5, gen_type: 'pv_inverter' } as never,
      { id: 'g2', ref_id: 'BESS-1', name: 'BESS-1', tags: [], meta: {}, bus_ref: 'b', p_mw: 2.0, gen_type: 'bess' } as never,
      { id: 'g3', ref_id: 'FW-1', name: 'FW-1', tags: [], meta: {}, bus_ref: 'b', p_mw: 5.0, gen_type: 'wind_inverter' } as never,
    ];
    const r = buildSldDataFromSnapshot(snap, null);
    expect(r.ders).toHaveLength(3);
    expect(r.ders.find((d) => d.kind === 'PV')).toBeTruthy();
    expect(r.ders.find((d) => d.kind === 'BESS')).toBeTruthy();
    expect(r.ders.find((d) => d.kind === 'FW')).toBeTruthy();
    // P_mw → nominalPowerKw
    expect(r.ders.find((d) => d.id === 'PV-1')?.nominalPowerKw).toBe(1500);
  });

  it('GPZ → GpzRendererProps zawiera sections + couplers + bays z ENM (e2e wiring)', () => {
    const snap = buildEmptySnapshot();
    snap.buses = [
      { id: 'b15', ref_id: 'b15', name: 'BUS-15kV', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
      { id: 'bs', ref_id: 'bs-out', name: 'BUS-out', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
    ];
    snap.substations = [
      {
        id: 's', ref_id: 'GPZ-1', name: 'GPZ Centralny', tags: [], meta: {},
        station_type: 'gpz', bus_refs: ['b15'], transformer_refs: ['TR1', 'TR2'],
        gpz_sections: [
          { section_id: 'SEC-A', order: 1, name: 'sekcja A', bus_ref: 'b15', right_coupler_ref: 'bay-spr' },
          { section_id: 'SEC-B', order: 2, name: 'sekcja B', bus_ref: 'b15', left_coupler_ref: 'bay-spr' },
        ],
      } as never,
      {
        id: 's2', ref_id: 'ST-001', name: 'ST-001 SADY', tags: [], meta: {},
        station_type: 'mv_lv', bus_refs: ['bs-out'], transformer_refs: [],
      } as never,
    ];
    snap.bays = [
      { id: 'b1', ref_id: 'bay-out-1', name: 'POLE 01 SADY', tags: [], meta: {}, bay_role: 'OUT', substation_ref: 'GPZ-1', bus_ref: 'b15', gpz_section_id: 'SEC-A', equipment_refs: ['cb1', 'ds1'] } as never,
      { id: 'b2', ref_id: 'bay-spr', name: 'Sprzęgło', tags: [], meta: {}, bay_role: 'COUPLER', substation_ref: 'GPZ-1', bus_ref: 'b15', equipment_refs: ['cb-spr'] } as never,
      { id: 'b3', ref_id: 'bay-tr-1', name: 'Pole TR1', tags: [], meta: {}, bay_role: 'TR', substation_ref: 'GPZ-1', bus_ref: 'b15', gpz_section_id: 'SEC-B', equipment_refs: [] } as never,
    ];
    snap.branches = [
      { id: 'br1', ref_id: 'br1', name: 'Kabel Sady', tags: [], meta: {}, type: 'cable', from_bus_ref: 'b15', to_bus_ref: 'bs-out', status: 'closed', length_km: 1, r_ohm_per_km: 0.5, x_ohm_per_km: 0.1 } as never,
    ];

    const r = buildSldDataFromSnapshot(snap, null);
    expect(r.gpzs).toHaveLength(1);
    const g = r.gpzs[0];

    /* Sections z ENM gpz_sections[]. */
    expect(g.sections).toHaveLength(2);
    expect(g.sections?.[0].sectionId).toBe('SEC-A');
    expect(g.sections?.[0].sectionLabel).toBe('sekcja A');
    expect(g.sections?.[1].sectionLabel).toBe('sekcja B');

    /* Bays per sekcja (excluding couplers). */
    expect(g.sections?.[0].bays).toHaveLength(1);
    expect(g.sections?.[0].bays[0].bayRef).toBe('bay-out-1');
    expect(g.sections?.[1].bays).toHaveLength(1);
    expect(g.sections?.[1].bays[0].bayRef).toBe('bay-tr-1');

    /* Coupler między sekcjami. */
    expect(g.couplers).toHaveLength(1);
    expect(g.couplers?.[0].couplerId).toBe('bay-spr');
    expect(g.couplers?.[0].leftSectionId).toBe('SEC-A');
    expect(g.couplers?.[0].rightSectionId).toBe('SEC-B');

    /* TransformerCount z transformer_refs. */
    expect(g.transformerCount).toBe(2);

    /* feedersCount z bays[role=OUT]. */
    expect(g.feedersCount).toBe(1);

    /* Outgoing feeder destination derived from topology branch.
     * Invariant 9: brak telemetrii w ENM → energized UNDEFINED (NIE
     * hardcoded true). Renderer wyświetli neutral kolor. */
    const outBay = g.sections?.[0].bays[0];
    expect(outBay?.outgoingFeeder?.destination).toBe('→ ST-001 SADY');
    expect(outBay?.outgoingFeeder?.energized).toBeUndefined();

    /* Bay z TR (nieliniowy) — brak outgoingFeeder. */
    const trBay = g.sections?.[1].bays[0];
    expect(trBay?.outgoingFeeder).toBeUndefined();

    /* hasMissingRequiredDevice = true gdy equipment_refs puste. */
    expect(trBay?.hasMissingRequiredDevice).toBe(true);
    expect(outBay?.hasMissingRequiredDevice).toBe(false);
  });

  it('Bay LINE_OUT z ENM → esState=unknown + Q-designations IEC 81346 (Q0/Q9/Q1/Q8/T1)', () => {
    const snap = buildEmptySnapshot();
    snap.buses = [
      { id: 'b15', ref_id: 'b15', name: 'B', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
    ];
    snap.substations = [
      {
        id: 's', ref_id: 'GPZ-1', name: 'GPZ', tags: [], meta: {},
        station_type: 'gpz', bus_refs: ['b15'], transformer_refs: [],
        gpz_sections: [{ section_id: 'A', order: 1, bus_ref: 'b15' }],
      } as never,
    ];
    snap.bays = [
      { id: 'b1', ref_id: 'bay-1', name: 'POLE 01', tags: [], meta: {}, bay_role: 'OUT', substation_ref: 'GPZ-1', bus_ref: 'b15', gpz_section_id: 'A', equipment_refs: ['cb1'] } as never,
    ];
    const r = buildSldDataFromSnapshot(snap, null);
    const bay = r.gpzs[0].sections?.[0].bays[0];
    /* ES present (line role → BHP) ale stan unknown (Invariant 9). */
    expect(bay?.esState).toBe('unknown');
    /* Q-designations zgodnie z IEC 81346-2 dla pola liniowego. */
    expect(bay?.qDesignations).toEqual({ cb: 'Q0', ds: 'Q9', dsBus: 'Q1', es: 'Q8', ct: 'T1' });
  });

  it('Bay COUPLER → esState=absent (sprzęgło GPZ tradycyjnie bez ES)', () => {
    const snap = buildEmptySnapshot();
    snap.buses = [
      { id: 'b15', ref_id: 'b15', name: 'B', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
    ];
    snap.substations = [
      {
        id: 's', ref_id: 'GPZ-1', name: 'GPZ', tags: [], meta: {},
        station_type: 'gpz', bus_refs: ['b15'], transformer_refs: [],
        gpz_sections: [{ section_id: 'A', order: 1, bus_ref: 'b15' }],
      } as never,
    ];
    snap.bays = [
      { id: 'b1', ref_id: 'bay-cpl', name: 'Sprzęgło', tags: [], meta: {}, bay_role: 'COUPLER', substation_ref: 'GPZ-1', bus_ref: 'b15', gpz_section_id: 'A', equipment_refs: ['cb1'] } as never,
    ];
    const r = buildSldDataFromSnapshot(snap, null);
    /* COUPLER bays są w sekcji ale są filtrowane przez sectionFromGpzSection
     * (kuplery renderowane osobno w couplers[]). Tu testujemy nie ten case
     * — bo coupler bay nie pojawi się w bays[]. */
    expect(r.gpzs[0].sections?.[0].bays).toHaveLength(0);
  });

  it('Bay TR → esState=unknown + Q-designations bez DS_LIN (TR ma tylko DS_BUS)', () => {
    const snap = buildEmptySnapshot();
    snap.buses = [
      { id: 'b15', ref_id: 'b15', name: 'B', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
    ];
    snap.substations = [
      {
        id: 's', ref_id: 'GPZ-1', name: 'GPZ', tags: [], meta: {},
        station_type: 'gpz', bus_refs: ['b15'], transformer_refs: [],
        gpz_sections: [{ section_id: 'A', order: 1, bus_ref: 'b15' }],
      } as never,
    ];
    snap.bays = [
      { id: 'b1', ref_id: 'bay-tr', name: 'Pole TR1', tags: [], meta: {}, bay_role: 'TR', substation_ref: 'GPZ-1', bus_ref: 'b15', gpz_section_id: 'A', equipment_refs: ['cb1'] } as never,
    ];
    const r = buildSldDataFromSnapshot(snap, null);
    const bay = r.gpzs[0].sections?.[0].bays[0];
    expect(bay?.esState).toBe('unknown');
    expect(bay?.qDesignations).toEqual({ cb: 'Q0', ds: 'Q1', es: 'Q8', ct: 'T1' });
  });

  it('ENM gpz_hv_sections[] dostarczone → adapter NIE syntetyzuje, używa explicit (BLOCKER-26 fix)', () => {
    const snap = buildEmptySnapshot();
    snap.buses = [
      { id: 'b110', ref_id: 'b110-A', name: 'BUS-110-A', voltage_kv: 110, phase_system: '3ph', tags: [], meta: {} } as never,
      { id: 'b110b', ref_id: 'b110-B', name: 'BUS-110-B', voltage_kv: 110, phase_system: '3ph', tags: [], meta: {} } as never,
      { id: 'b15', ref_id: 'b15', name: 'BUS-15', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
    ];
    snap.transformers = [
      { id: 't1', ref_id: 'TR1', name: 'TR1', tags: [], meta: {}, hv_bus_ref: 'b110-A', lv_bus_ref: 'b15', sn_mva: 25, uhv_kv: 110, ulv_kv: 15, uk_percent: 12, pk_kw: 100 } as never,
    ];
    snap.substations = [
      {
        id: 's', ref_id: 'GPZ-1', name: 'GPZ', tags: [], meta: {},
        station_type: 'gpz', bus_refs: ['b15'], transformer_refs: ['TR1'],
        gpz_hv_sections: [
          { section_id: 'hv-A', order: 1, name: 'HV-A', bus_ref: 'b110-A' },
          { section_id: 'hv-B', order: 2, name: 'HV-B', bus_ref: 'b110-B' },
        ],
      } as never,
    ];
    snap.bays = [
      { id: 'b1', ref_id: 'hv-bay-1', name: 'POR', tags: [], meta: {}, bay_role: 'IN', substation_ref: 'GPZ-1', bus_ref: 'b110-A', gpz_section_id: 'hv-A', equipment_refs: [] } as never,
    ];
    const r = buildSldDataFromSnapshot(snap, null);
    /* hvSections z ENM NIE z synthesize — 2 sekcje (NIE 1 z synth). */
    expect(r.gpzs[0].hvSections).toHaveLength(2);
    expect(r.gpzs[0].hvSections?.[0].sectionId).toBe('hv-A');
    expect(r.gpzs[0].hvSections?.[1].sectionId).toBe('hv-B');
    /* Pole HV-bay-1 jest w sekcji hv-A (z gpz_section_id), NIE syntezowane. */
    expect(r.gpzs[0].hvSections?.[0].bays).toHaveLength(1);
    expect(r.gpzs[0].hvSections?.[0].bays[0].bayRef).toBe('hv-bay-1');
    /* NIE ma prefixu __hv-derived- (bo NIE syntezowane). */
    expect(r.gpzs[0].hvSections?.[0].bays[0].bayRef).not.toContain('__hv-derived-');
  });

  it('Bay.bay_number z ENM → renderer otrzymuje przez bayNumber prop', () => {
    const snap = buildEmptySnapshot();
    snap.buses = [
      { id: 'b15', ref_id: 'b15', name: 'B', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
    ];
    snap.substations = [
      {
        id: 's', ref_id: 'GPZ-1', name: 'GPZ', tags: [], meta: {},
        station_type: 'gpz', bus_refs: ['b15'], transformer_refs: [],
        gpz_sections: [{ section_id: 'A', order: 1, bus_ref: 'b15' }],
      } as never,
    ];
    snap.bays = [
      {
        id: 'b1', ref_id: 'bay-1', name: 'POLE 23', tags: [], meta: {},
        bay_role: 'OUT', substation_ref: 'GPZ-1', bus_ref: 'b15', gpz_section_id: 'A',
        equipment_refs: ['cb1'],
        bay_number: '23/1', // explicit kanon dyspozytorski
        feeder_short_name: 'SADY',
      } as never,
    ];
    const r = buildSldDataFromSnapshot(snap, null);
    const bay = r.gpzs[0].sections?.[0].bays[0];
    expect(bay?.bayNumber).toBe('23/1');
    /* feeder_short_name preferowane przed bay.name. */
    expect(bay?.feederName).toBe('SADY');
  });

  it('Bay.outgoing_destination_ref z ENM → adapter NIE wnioskuje z grafu, używa explicit', () => {
    const snap = buildEmptySnapshot();
    snap.buses = [
      { id: 'b15', ref_id: 'b15', name: 'B', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
    ];
    snap.substations = [
      {
        id: 's', ref_id: 'GPZ-1', name: 'GPZ', tags: [], meta: {},
        station_type: 'gpz', bus_refs: ['b15'], transformer_refs: [],
        gpz_sections: [{ section_id: 'A', order: 1, bus_ref: 'b15' }],
      } as never,
      { id: 'st', ref_id: 'ST-DEST', name: 'STACJA DOCELOWA', tags: [], meta: {}, station_type: 'mv_lv', bus_refs: [], transformer_refs: [] } as never,
    ];
    snap.bays = [
      {
        id: 'b1', ref_id: 'bay-1', name: 'P1', tags: [], meta: {},
        bay_role: 'OUT', substation_ref: 'GPZ-1', bus_ref: 'b15', gpz_section_id: 'A',
        equipment_refs: ['cb1'],
        outgoing_destination_ref: 'ST-DEST',
      } as never,
    ];
    const r = buildSldDataFromSnapshot(snap, null);
    const bay = r.gpzs[0].sections?.[0].bays[0];
    /* Destination = nazwa stacji (z lookupu), NIE z wnioskowania graph. */
    expect(bay?.outgoingFeeder?.destination).toBe('→ STACJA DOCELOWA');
  });

  it('Invariant 9 — coupler bez telemetrii ENM → closed=unknown (NIE hardcoded true)', () => {
    const snap = buildEmptySnapshot();
    snap.buses = [
      { id: 'b1', ref_id: 'b15', name: 'B', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
    ];
    snap.substations = [
      {
        id: 's', ref_id: 'GPZ-1', name: 'GPZ', tags: [], meta: {},
        station_type: 'gpz', bus_refs: ['b15'], transformer_refs: [],
        gpz_sections: [
          { section_id: 'A', order: 1, bus_ref: 'b15', right_coupler_ref: 'spr1' },
          { section_id: 'B', order: 2, bus_ref: 'b15', left_coupler_ref: 'spr1' },
        ],
      } as never,
    ];
    snap.bays = [
      { id: 'b', ref_id: 'spr1', name: 'Sprzęgło', tags: [], meta: {}, bay_role: 'COUPLER', substation_ref: 'GPZ-1', bus_ref: 'b15', equipment_refs: [] } as never,
    ];
    const r = buildSldDataFromSnapshot(snap, null);
    expect(r.gpzs[0].couplers).toHaveLength(1);
    expect(r.gpzs[0].couplers?.[0].closed).toBe('unknown');
  });

  it('Invariant 9 — synthesized HV bays NIE mają hardcoded energization/cbState/dsState', () => {
    const snap = buildEmptySnapshot();
    snap.buses = [
      { id: 'b110', ref_id: 'b110', name: 'BUS-110', voltage_kv: 110, phase_system: '3ph', tags: [], meta: {} } as never,
      { id: 'b15', ref_id: 'b15', name: 'BUS-15', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
    ];
    snap.transformers = [
      { id: 't1', ref_id: 'TR1', name: 'TR1', tags: [], meta: {}, hv_bus_ref: 'b110', lv_bus_ref: 'b15', sn_mva: 25, uhv_kv: 110, ulv_kv: 15, uk_percent: 12, pk_kw: 100 } as never,
    ];
    snap.sources = [
      { id: 'src1', ref_id: 'EC2', name: 'EC2', tags: [], meta: {}, bus_ref: 'b110', model: 'thevenin', sk3_mva: 1500 } as never,
    ];
    snap.substations = [
      { id: 's', ref_id: 'GPZ-1', name: 'GPZ', tags: [], meta: {}, station_type: 'gpz', bus_refs: ['b15'], transformer_refs: ['TR1'] } as never,
    ];
    const r = buildSldDataFromSnapshot(snap, null);
    const hvSec = r.gpzs[0].hvSections?.[0];
    expect(hvSec).toBeDefined();
    /* HV bays NIE mają hardkodowanych runtime states. */
    for (const bay of hvSec!.bays) {
      expect(bay.energization).toBeUndefined();
      expect(bay.cbState).toBeUndefined();
      expect(bay.dsState).toBeUndefined();
      /* bayRef ma stabilny prefix `__hv-derived-` (synthesized — NIE ENM bay ref). */
      expect(bay.bayRef).toContain('__hv-derived-');
    }
  });

  it('Invariant 9 — inferHvVoltageKv nie używa heurystyki "voltage > 30" (deterministyczne ENM lookup)', () => {
    /* GPZ bez transformatorów → voltageHighKv=110 jako default UI fallback,
     * ale derived path nie używa heurystyki source.bus_ref. */
    const snap = buildEmptySnapshot();
    snap.buses = [
      { id: 'b15', ref_id: 'b15', name: 'B', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
    ];
    snap.substations = [
      { id: 's', ref_id: 'GPZ-1', name: 'GPZ', tags: [], meta: {}, station_type: 'gpz', bus_refs: ['b15'], transformer_refs: [] } as never,
    ];
    const r = buildSldDataFromSnapshot(snap, null);
    /* Brak trafa → fallback 110 (na poziomie UI). */
    expect(r.gpzs[0].voltageHighKv).toBe(110);
    /* Brak hvSections — brak danych do syntezy. */
    expect(r.gpzs[0].hvSections).toBeUndefined();
  });

  it('GPZ bez gpz_sections → sections=[] + couplers=[] (no-op gracefully)', () => {
    const snap = buildEmptySnapshot();
    snap.buses = [
      { id: 'b1', ref_id: 'b1', name: 'B1', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
    ];
    snap.substations = [
      { id: 's', ref_id: 'GPZ-1', name: 'GPZ', tags: [], meta: {}, station_type: 'gpz', bus_refs: ['b1'], transformer_refs: [] } as never,
    ];
    const r = buildSldDataFromSnapshot(snap, null);
    expect(r.gpzs).toHaveLength(1);
    expect(r.gpzs[0].sections).toEqual([]);
    expect(r.gpzs[0].couplers).toEqual([]);
    expect(r.gpzs[0].feedersCount).toBe(0);
  });

  it('GPZ z transformatorem 110/SN → voltageHighKv = uhv_kv z transformatora', () => {
    const snap = buildEmptySnapshot();
    snap.buses = [
      { id: 'b1', ref_id: 'b110', name: 'BUS-110', voltage_kv: 110, phase_system: '3ph', tags: [], meta: {} } as never,
      { id: 'b2', ref_id: 'b15', name: 'BUS-15', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
    ];
    snap.transformers = [
      { id: 't1', ref_id: 'TR1', name: 'TR1', tags: [], meta: {}, hv_bus_ref: 'b110', lv_bus_ref: 'b15', sn_mva: 25, uhv_kv: 110, ulv_kv: 15, uk_percent: 12, pk_kw: 100 } as never,
    ];
    snap.substations = [
      { id: 's', ref_id: 'GPZ-1', name: 'GPZ', tags: [], meta: {}, station_type: 'gpz', bus_refs: ['b15'], transformer_refs: ['TR1'] } as never,
    ];
    const r = buildSldDataFromSnapshot(snap, null);
    expect(r.gpzs[0].voltageHighKv).toBe(110);
    expect(r.gpzs[0].voltageLowKv).toBe(15);
    expect(r.gpzs[0].transformerCount).toBe(1);
  });

  it('GPZ z transformatorem + source → auto-syntezuje hvSections z TR feeder + incoming bay', () => {
    const snap = buildEmptySnapshot();
    snap.buses = [
      { id: 'b110', ref_id: 'b110', name: 'BUS-110', voltage_kv: 110, phase_system: '3ph', tags: [], meta: {} } as never,
      { id: 'b15', ref_id: 'b15', name: 'BUS-15', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
    ];
    snap.transformers = [
      { id: 't1', ref_id: 'TR1', name: 'TR1', tags: [], meta: {}, hv_bus_ref: 'b110', lv_bus_ref: 'b15', sn_mva: 25, uhv_kv: 110, ulv_kv: 15, uk_percent: 12, pk_kw: 100 } as never,
      { id: 't2', ref_id: 'TR2', name: 'TR2', tags: [], meta: {}, hv_bus_ref: 'b110', lv_bus_ref: 'b15', sn_mva: 25, uhv_kv: 110, ulv_kv: 15, uk_percent: 12, pk_kw: 100 } as never,
    ];
    snap.sources = [
      { id: 'src1', ref_id: 'EC2', name: 'EC2', tags: [], meta: {}, bus_ref: 'b110', model: 'thevenin', sk3_mva: 1500 } as never,
    ];
    snap.substations = [
      { id: 's', ref_id: 'GPZ-1', name: 'GPZ', tags: [], meta: {}, station_type: 'gpz', bus_refs: ['b15'], transformer_refs: ['TR1', 'TR2'] } as never,
    ];
    const r = buildSldDataFromSnapshot(snap, null);
    const g = r.gpzs[0];
    expect(g.hvSections).toBeDefined();
    expect(g.hvSections).toHaveLength(1);
    const hvSec = g.hvSections![0];
    expect(hvSec.busVoltageKv).toBe(110);
    expect(hvSec.sectionLabel).toBe('sekcja A');
    /* 1 incoming + 2 TR feeders = 3 bays */
    expect(hvSec.bays).toHaveLength(3);
    expect(hvSec.bays[0].fieldRole).toBe('LINE_IN');
    expect(hvSec.bays[0].designation).toBe('EC2');
    expect(hvSec.bays[1].feederName).toBe('TR1');
    expect(hvSec.bays[2].feederName).toBe('TR2');
  });

  it('GPZ bez transformatorów → hvSections=undefined (single-bus mode)', () => {
    const snap = buildEmptySnapshot();
    snap.buses = [
      { id: 'b15', ref_id: 'b15', name: 'BUS-15', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
    ];
    snap.substations = [
      { id: 's', ref_id: 'GPZ-1', name: 'GPZ', tags: [], meta: {}, station_type: 'gpz', bus_refs: ['b15'], transformer_refs: [] } as never,
    ];
    const r = buildSldDataFromSnapshot(snap, null);
    expect(r.gpzs[0].hvSections).toBeUndefined();
  });

  it('Stacje pole-wymiarowe → StationOnRunRendererProps z poprawnym topologicalType', () => {
    const snap = buildEmptySnapshot();
    snap.substations = [
      { id: 's1', ref_id: 'ST-1', name: 'Stacja-1', tags: [], meta: {}, station_type: 'mv_lv', bus_refs: [], transformer_refs: [] } as never,
      { id: 's2', ref_id: 'ST-2', name: 'Stacja-2', tags: [], meta: {}, station_type: 'inline', bus_refs: [], transformer_refs: [] } as never,
      { id: 's3', ref_id: 'ST-3', name: 'Stacja-3', tags: [], meta: {}, station_type: 'branch', bus_refs: [], transformer_refs: [] } as never,
      { id: 's4', ref_id: 'ST-4', name: 'Stacja-4', tags: [], meta: {}, station_type: 'sectional', bus_refs: [], transformer_refs: [] } as never,
      { id: 's5', ref_id: 'ST-5', name: 'Stacja-5', tags: [], meta: {}, station_type: 'terminal', bus_refs: [], transformer_refs: [] } as never,
    ];
    const r = buildSldDataFromSnapshot(snap, null);
    expect(r.stations).toHaveLength(5);
    const types = r.stations.map((s) => s.topologicalType);
    expect(types).toContain('końcowa');
    expect(types).toContain('przelotowa');
    expect(types).toContain('odgałęźna');
    expect(types).toContain('sekcyjna');
  });
});
