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

import { buildSldDataFromSnapshot, projectBayTelemetry } from '../enmToSldAdapter';
import type {
  BayRuntimeState,
  BaySwitchState,
  EnergyNetworkModel,
  LogicalViewsV1,
} from '../../../../../types/enm';

function makeSwitchState(overrides: Partial<BaySwitchState>): BaySwitchState {
  return {
    actual_state: 'nieznany',
    control_mode: 'miejscowe',
    communication_ok: false,
    interlock_blocked: false,
    ...overrides,
  };
}

function makeRuntime(states: Record<string, BaySwitchState>, opts: Partial<BayRuntimeState> = {}): BayRuntimeState {
  return {
    secondary_communication_status: 'ok',
    last_good_update_at: null,
    control_availability: 'dostepne',
    measurement_availability: 'dostepne',
    primary_device_states: states,
    active_alarms: [],
    pending_command: null,
    energization_and_safety: {
      energized_from_bus_side: false,
      energized_from_feeder_side: false,
      grounded: false,
      visible_isolation_gap: false,
      safe_to_work: false,
    },
    ...opts,
  };
}

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

  it('NC RFG Module derivowany z p_mw per ENEA profile progi (enea.yaml)', () => {
    const snap = buildEmptySnapshot();
    snap.generators = [
      // Moduł A: <1 MW (Mikro)
      { id: 'g1', ref_id: 'PV-A', name: 'PV-A', tags: [], meta: {}, bus_ref: 'b', p_mw: 0.05, gen_type: 'pv_inverter' } as never,
      // Moduł B: 1–50 MW (Małe)
      { id: 'g2', ref_id: 'PV-B', name: 'PV-B', tags: [], meta: {}, bus_ref: 'b', p_mw: 5.0, gen_type: 'pv_inverter' } as never,
      // Moduł C: 50–75 MW (Duże)
      { id: 'g3', ref_id: 'PV-C', name: 'PV-C', tags: [], meta: {}, bus_ref: 'b', p_mw: 60.0, gen_type: 'pv_inverter' } as never,
      // Moduł D: >75 MW (B. duże)
      { id: 'g4', ref_id: 'PV-D', name: 'PV-D', tags: [], meta: {}, bus_ref: 'b', p_mw: 100.0, gen_type: 'pv_inverter' } as never,
    ];
    const r = buildSldDataFromSnapshot(snap, null);
    expect(r.ders.find((d) => d.id === 'PV-A')?.ncRfgModule).toBe('A');
    expect(r.ders.find((d) => d.id === 'PV-B')?.ncRfgModule).toBe('B');
    expect(r.ders.find((d) => d.id === 'PV-C')?.ncRfgModule).toBe('C');
    expect(r.ders.find((d) => d.id === 'PV-D')?.ncRfgModule).toBe('D');
  });

  it('NC RFG Module z backend nc_rfg_module nadpisuje pochodny', () => {
    const snap = buildEmptySnapshot();
    snap.generators = [
      // p_mw = 5MW (Moduł B) ale backend ustawił C
      { id: 'g1', ref_id: 'PV-1', name: 'PV-1', tags: [], meta: {}, bus_ref: 'b', p_mw: 5.0, gen_type: 'pv_inverter', nc_rfg_module: 'C' } as never,
    ];
    const r = buildSldDataFromSnapshot(snap, null);
    expect(r.ders[0].ncRfgModule).toBe('C');
  });

  it('operatingPMw i operatingQMvar przekazywane z ENM Generator', () => {
    const snap = buildEmptySnapshot();
    snap.generators = [
      { id: 'g1', ref_id: 'PV-Q', name: 'PV-Q', tags: [], meta: {}, bus_ref: 'b', p_mw: 2.5, q_mvar: 0.8, gen_type: 'pv_inverter' } as never,
    ];
    const r = buildSldDataFromSnapshot(snap, null);
    const der = r.ders.find((d) => d.id === 'PV-Q');
    expect(der?.operatingPMw).toBe(2.5);
    expect(der?.operatingQMvar).toBe(0.8);
  });

  it('operatingQMvar jest null gdy brak q_mvar w generatorze', () => {
    const snap = buildEmptySnapshot();
    snap.generators = [
      { id: 'g2', ref_id: 'PV-NoQ', name: 'PV-NoQ', tags: [], meta: {}, bus_ref: 'b', p_mw: 1.0, gen_type: 'pv_inverter' } as never,
    ];
    const r = buildSldDataFromSnapshot(snap, null);
    const der = r.ders.find((d) => d.id === 'PV-NoQ');
    expect(der?.operatingPMw).toBe(1.0);
    expect(der?.operatingQMvar).toBeNull();
  });

  it('wiele DER na tej samej stacji dostaje różne pozycje Y (bez nakładania)', () => {
    const snap = buildEmptySnapshot();
    snap.generators = [
      { id: 'g1', ref_id: 'DER-1', name: 'PV-1', tags: [], meta: { station_ref: 'STA-1' }, bus_ref: 'b', p_mw: 0.5, gen_type: 'pv_inverter' } as never,
      { id: 'g2', ref_id: 'DER-2', name: 'PV-2', tags: [], meta: { station_ref: 'STA-1' }, bus_ref: 'b', p_mw: 0.5, gen_type: 'pv_inverter' } as never,
      { id: 'g3', ref_id: 'DER-3', name: 'PV-3', tags: [], meta: { station_ref: 'STA-1' }, bus_ref: 'b', p_mw: 0.5, gen_type: 'pv_inverter' } as never,
    ];
    const r = buildSldDataFromSnapshot(snap, null);
    expect(r.ders).toHaveLength(3);
    const ys = r.ders.map((d) => d.y);
    // Każdy DER musi mieć inną pozycję Y
    expect(new Set(ys).size).toBe(3);
    // DERy są posortowane od góry — każdy poniżej poprzedniego
    expect(ys[1]).toBeGreaterThan(ys[0]);
    expect(ys[2]).toBeGreaterThan(ys[1]);
  });

  it('DER podpięty do stacji generuje derConnections z ścieżką L-shape (AC-07)', () => {
    const snap = buildEmptySnapshot();
    snap.substations = [
      {
        id: 's1', ref_id: 'STA-DER-01', name: 'Stacja DER', tags: [], meta: {},
        station_type: 'mv_lv', bus_refs: [], transformer_refs: [],
      } as never,
    ];
    snap.generators = [
      { id: 'g1', ref_id: 'PV-W1', name: 'PV W1', tags: [], meta: { station_ref: 'STA-DER-01' }, bus_ref: 'b', p_mw: 0.5, gen_type: 'pv_inverter' } as never,
    ];
    const r = buildSldDataFromSnapshot(snap, null);
    expect(r.derConnections).toHaveLength(1);
    const wire = r.derConnections[0];
    expect(wire.id).toBe('der-wire-PV-W1');
    // L-shape: 3 points — bus exit → corner (vertical) → DER (horizontal)
    expect(wire.pathPoints).toHaveLength(3);
    // Vertical segment: points 0 and 1 share the same X
    expect(wire.pathPoints[1].x).toBe(wire.pathPoints[0].x);
    // Horizontal segment: points 1 and 2 share the same Y
    expect(wire.pathPoints[2].y).toBe(wire.pathPoints[1].y);
    // The path has non-zero length: DER Y is below bus Y
    expect(wire.pathPoints[1].y).toBeGreaterThan(wire.pathPoints[0].y);
  });

  it('DER bez stacji nie generuje derConnections', () => {
    const snap = buildEmptySnapshot();
    snap.generators = [
      { id: 'g1', ref_id: 'PV-ORPHAN', name: 'PV orphan', tags: [], meta: {}, bus_ref: 'b', p_mw: 0.5, gen_type: 'pv_inverter' } as never,
    ];
    const r = buildSldDataFromSnapshot(snap, null);
    expect(r.ders).toHaveLength(1);
    expect(r.derConnections).toHaveLength(0);
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
      { id: 'br1', ref_id: 'br1', name: 'Kabel Sady', tags: [], meta: {}, type: 'cable', from_bus_ref: 'b15', to_bus_ref: 'bs-out', status: 'closed', catalog_ref: 'XRUHAKXS 120/25', length_km: 1, r_ohm_per_km: 0.5, x_ohm_per_km: 0.1 } as never,
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
    expect(outBay?.outgoingFeeder?.segmentTypeLabel).toBe('Kabel SN');
    expect(outBay?.outgoingFeeder?.segmentLengthLabel).toBe('1 km');
    expect(outBay?.outgoingFeeder?.catalogLabel).toBe('XRUHAKXS 120/25');

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

  it('Bay BEZ outgoing_destination_ref + BEZ branch graph → outgoingFeeder=undefined (Invariant 9)', () => {
    /* Phase 0A audit fix 10/12: STRICT mode — brak ENM ref + brak branch
     * graph → undefined (NIE zafałszowane). Audyt SLD §C.2: heurystyka
     * graph-based zachowana jako fallback ale nie kieruje. */
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
        id: 'b1', ref_id: 'bay-1', name: 'Pole 1', tags: [], meta: {},
        bay_role: 'OUT', substation_ref: 'GPZ-1', bus_ref: 'b15', gpz_section_id: 'A',
        equipment_refs: ['cb1'],
        /* Brak outgoing_destination_ref + brak branches → undefined. */
      } as never,
    ];
    const r = buildSldDataFromSnapshot(snap, null);
    const bay = r.gpzs[0].sections?.[0].bays[0];
    expect(bay?.outgoingFeeder).toBeUndefined();
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
        id: 'b1', ref_id: 'bay-1', name: 'Pole 1', tags: [], meta: {},
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

  it('stacje terenowe są poza strefą GPZ i nie są osadzane w ramce rozdzielni', () => {
    const snap = buildEmptySnapshot();
    snap.substations = [
      { id: 'gpz', ref_id: 'GPZ-1', name: 'GPZ', tags: [], meta: {}, station_type: 'gpz', bus_refs: [], transformer_refs: [] } as never,
      { id: 'st', ref_id: 'ST-1', name: 'Stacja SN/nN 1', tags: [], meta: {}, station_type: 'inline', bus_refs: [], transformer_refs: [] } as never,
    ];

    const r = buildSldDataFromSnapshot(snap, null);

    expect(r.gpzs[0].x).toBe(100);
    expect(r.stations[0].x).toBeGreaterThanOrEqual(900);
    expect(r.stations[0].x).toBeGreaterThan(r.gpzs[0].x + 700);
  });

  it('stacja terenowa dostaje mini-RMU z polami SN zamiast pojedynczej ikony', () => {
    const snap = buildEmptySnapshot();
    snap.substations = [
      { id: 'st', ref_id: 'ST-1', name: 'Stacja SN/nN 1', tags: [], meta: {}, station_type: 'inline', bus_refs: [], transformer_refs: [] } as never,
    ];

    const r = buildSldDataFromSnapshot(snap, null);
    const station = r.stations[0];

    expect(station.snBays).toBeDefined();
    expect(station.snBays?.map((bay) => bay.designation)).toEqual(['WE', 'WY', 'TR']);
    expect(station.snBays?.every((bay) => bay.hasMissingRequiredDevice)).toBe(true);
    expect(station.footprintType).toBe('mv_lv_inline');
  });

  it('PV po stronie nN propaguje badge stacji i pozwala renderować wyłączniki nN', () => {
    const snap = buildEmptySnapshot();
    snap.substations = [
      { id: 'st', ref_id: 'ST-PV', name: 'Stacja PV', tags: [], meta: {}, station_type: 'inline', bus_refs: ['bus-nn'], transformer_refs: ['tr-1'] } as never,
    ];
    snap.generators = [
      {
        id: 'pv1',
        ref_id: 'PV-1',
        name: 'PV Galeria',
        tags: [],
        meta: {},
        bus_ref: 'bus-nn',
        p_mw: 0.5,
        q_mvar: 0,
        gen_type: 'pv_inverter',
        station_ref: 'ST-PV',
        connection_variant: 'nn_side',
      } as never,
    ];

    const r = buildSldDataFromSnapshot(snap, null);
    const station = r.stations[0];

    expect(station.footprintType).toBe('mv_lv_inline');
    expect(station.derBadges).toEqual([{ kind: 'PV', connectionSide: 'nn', count: 1 }]);
    expect(station.nnFeedersCount).toBe(2);
  });

  it('PV po stronie nN rozpoznaje stację z generator.meta.station_ref', () => {
    const snap = buildEmptySnapshot();
    snap.substations = [
      { id: 'st', ref_id: 'ST-PV', name: 'Stacja PV', tags: [], meta: {}, station_type: 'inline', bus_refs: ['bus-nn'], transformer_refs: ['tr-1'] } as never,
    ];
    snap.generators = [
      {
        id: 'pv1',
        ref_id: 'PV-1',
        name: 'PV Galeria',
        tags: [],
        meta: { station_ref: 'ST-PV' },
        bus_ref: 'bus-nn',
        p_mw: 0.5,
        q_mvar: 0,
        gen_type: 'pv_inverter',
        connection_variant: 'nn_side',
      } as never,
    ];

    const r = buildSldDataFromSnapshot(snap, null);

    expect(r.stations[0].derBadges).toEqual([{ kind: 'PV', connectionSide: 'nn', count: 1 }]);
    expect(r.ders.find((der) => der.id === 'PV-1')).toEqual(
      expect.objectContaining({ kind: 'PV', connectionVariant: 'nn_side' }),
    );
  });

  it('stacja terenowa jest pod kablem: kabel trafia w pole WE/WY, nie w środek stacji', () => {
    const snap = buildEmptySnapshot();
    snap.substations = [
      { id: 'st', ref_id: 'ST-1', name: 'Stacja SN/nN 1', tags: [], meta: {}, station_type: 'inline', bus_refs: [], transformer_refs: [] } as never,
    ];
    snap.branches = [
      {
        id: 'seg-1',
        ref_id: 'SEG-1',
        name: 'Kabel 500 m',
        branch_type: 'cable',
        from_bus_ref: 'B1',
        to_bus_ref: 'B2',
        length_km: 0.5,
        tags: [],
        meta: {},
      } as never,
    ];
    snap.line_runs = [
      {
        id: 'run-1',
        run_kind: 'main_trunk',
        starting_bay_ref: 'bay-1',
        starting_port_ref: 'port-1',
        segments: [{ segment_ref: 'SEG-1', order: 1 }],
        stations: [{ substation_ref: 'ST-1', order: 1 }],
      },
    ];

    const r = buildSldDataFromSnapshot(snap, {
      trunks: [{ corridor_ref: 'run-1', segments: ['SEG-1'] }],
      branches: [],
      secondary_connectors: [],
      terminals: [],
    });

    const cableY = r.cableRuns[0].pathPoints.at(-1)?.y;
    expect(cableY).toBeDefined();
    expect(r.stations[0].y).toBe(cableY! + 54);
  });

  it('odcinek SN startuje z głowicy pola GPZ, a nie z szyny ani etykiety', () => {
    const snap = buildEmptySnapshot();
    snap.buses = [
      { id: 'b15', ref_id: 'b15', name: 'Szyna GPZ S1 15 kV', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
    ];
    snap.substations = [
      {
        id: 'gpz', ref_id: 'GPZ-1', name: 'GPZ 1', tags: [], meta: {},
        station_type: 'gpz', bus_refs: ['b15'], transformer_refs: [],
        gpz_sections: [{ section_id: 'S1', order: 1, name: 'Sekcja 1', bus_ref: 'b15' }],
      } as never,
      { id: 'st', ref_id: 'ST-1', name: 'Stacja SN/nN 1', tags: [], meta: {}, station_type: 'inline', bus_refs: [], transformer_refs: [] } as never,
    ];
    snap.bays = [
      {
        id: 'bay-2', ref_id: 'bay-2', name: 'Pole odpływowe 2', tags: [], meta: {},
        bay_role: 'OUT', substation_ref: 'GPZ-1', bus_ref: 'b15', gpz_section_id: 'S1',
        equipment_refs: ['cb-2'],
      } as never,
      {
        id: 'bay-1', ref_id: 'bay-1', name: 'Pole odpływowe 1', tags: [], meta: {},
        bay_role: 'OUT', substation_ref: 'GPZ-1', bus_ref: 'b15', gpz_section_id: 'S1',
        equipment_refs: ['cb-1'],
      } as never,
    ];
    snap.branches = [
      {
        id: 'seg-1',
        ref_id: 'SEG-1',
        name: 'Kabel 500 m',
        type: 'cable',
        from_bus_ref: 'b15',
        to_bus_ref: 'B2',
        catalog_ref: 'XRUHAKXS 120/25',
        length_km: 0.5,
        tags: [],
        meta: {},
      } as never,
    ];
    snap.line_runs = [
      {
        id: 'run-1',
        run_kind: 'main_trunk',
        starting_bay_ref: 'bay-1',
        starting_port_ref: 'bay-1#cable_head',
        segments: [{ segment_ref: 'SEG-1', order: 1 }],
        stations: [{ substation_ref: 'ST-1', order: 1 }],
      },
    ];

    const r = buildSldDataFromSnapshot(snap, null);
    const points = r.cableRuns[0].pathPoints;

    expect(points[0].y).toBeGreaterThan(600);
    expect(points[1].y).toBeGreaterThan(points[0].y + 90);
    expect(points[1].y).toBeGreaterThan(760);
    expect(points[0].x).toBe(416);
    expect(points[0].x).toBe(points[1].x);
    expect(points[1].y).toBe(points[2].y);
    expect(points[2].x).toBeGreaterThan(points[0].x);
    expect(r.stations[0].y).toBe(points[2].y + 54);
    expect(r.cableRuns[0].label).toBe('XRUHAKXS 120/25 · 500 m');
    expect(r.cableRuns[0].segmentLabels?.[0]?.text).toBe('XRUHAKXS 120/25 · 500 m');
    expect(r.cableRuns[0].pendingEndpoint).toBe(false);
  });

  it('bay_number z starting_bay_ref pojawia się jako feeder origin label w segmentLabels', () => {
    const snap = buildEmptySnapshot();
    snap.buses = [
      { id: 'b15', ref_id: 'b15', name: 'Szyna GPZ S1 15 kV', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
    ];
    snap.substations = [
      {
        id: 'gpz', ref_id: 'GPZ-1', name: 'GPZ 1', tags: [], meta: {},
        station_type: 'gpz', bus_refs: ['b15'], transformer_refs: [],
        gpz_sections: [{ section_id: 'S1', order: 1, name: 'Sekcja 1', bus_ref: 'b15' }],
      } as never,
    ];
    snap.bays = [
      {
        id: 'bay-q01', ref_id: 'bay-q01', name: 'Pole Q01 SADY', tags: [], meta: {},
        bay_role: 'OUT', substation_ref: 'GPZ-1', bus_ref: 'b15', gpz_section_id: 'S1',
        equipment_refs: ['cb-1'],
        bay_number: 'Q01',
      } as never,
    ];
    snap.branches = [
      {
        id: 'seg-1', ref_id: 'SEG-1', name: 'Kabel Q01', type: 'cable',
        from_bus_ref: 'b15', to_bus_ref: 'B2',
        catalog_ref: 'XRUHAKXS 120/25', length_km: 0.5,
        tags: [], meta: {},
      } as never,
    ];
    snap.line_runs = [
      {
        id: 'run-q01',
        run_kind: 'main_trunk',
        starting_bay_ref: 'bay-q01',
        starting_port_ref: 'bay-q01#cable_head',
        segments: [{ segment_ref: 'SEG-1', order: 1 }],
        stations: [],
      },
    ];

    const r = buildSldDataFromSnapshot(snap, null);
    const cableRun = r.cableRuns[0];
    expect(cableRun).toBeDefined();

    // Feeder origin label "Q01" powinien być w segmentLabels
    const originLabel = cableRun.segmentLabels?.find(
      (l) => l.segmentRef?.startsWith('feeder-origin-'),
    );
    expect(originLabel).toBeDefined();
    expect(originLabel?.text).toBe('Q01');
    // Pozycja Y — tuż pod głowicą pola GPZ
    expect(originLabel?.y).toBeGreaterThan(600);
  });

  it('bay bez bay_number i bez feeder_short_name nie dodaje feeder origin label', () => {
    const snap = buildEmptySnapshot();
    snap.buses = [
      { id: 'b15', ref_id: 'b15', name: 'Szyna GPZ S1 15 kV', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
    ];
    snap.substations = [
      {
        id: 'gpz', ref_id: 'GPZ-1', name: 'GPZ 1', tags: [], meta: {},
        station_type: 'gpz', bus_refs: ['b15'], transformer_refs: [],
        gpz_sections: [{ section_id: 'S1', order: 1, name: 'Sekcja 1', bus_ref: 'b15' }],
      } as never,
    ];
    snap.bays = [
      {
        id: 'bay-1', ref_id: 'bay-1', name: 'Pole odpływowe 1', tags: [], meta: {},
        bay_role: 'OUT', substation_ref: 'GPZ-1', bus_ref: 'b15', gpz_section_id: 'S1',
        equipment_refs: ['cb-1'],
        // bay_number i feeder_short_name brak
      } as never,
    ];
    snap.branches = [
      {
        id: 'seg-1', ref_id: 'SEG-1', name: 'Kabel 1', type: 'cable',
        from_bus_ref: 'b15', to_bus_ref: 'B2',
        catalog_ref: 'XRUHAKXS 120/25', length_km: 0.5,
        tags: [], meta: {},
      } as never,
    ];
    snap.line_runs = [
      {
        id: 'run-1',
        run_kind: 'main_trunk',
        starting_bay_ref: 'bay-1',
        starting_port_ref: 'bay-1#cable_head',
        segments: [{ segment_ref: 'SEG-1', order: 1 }],
        stations: [],
      },
    ];

    const r = buildSldDataFromSnapshot(snap, null);
    const cableRun = r.cableRuns[0];
    expect(cableRun).toBeDefined();

    // Brak etykiety feeder-origin
    const originLabel = cableRun.segmentLabels?.find(
      (l) => l.segmentRef?.startsWith('feeder-origin-'),
    );
    expect(originLabel).toBeUndefined();
  });

  it('odcinek bez line_runs zachowuje głowicę źródłową z metadanych gałęzi', () => {
    const snap = buildEmptySnapshot();
    snap.buses = [
      { id: 'b15', ref_id: 'b15', name: 'Szyna GPZ S1 15 kV', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
    ];
    snap.substations = [
      {
        id: 'gpz', ref_id: 'GPZ-1', name: 'GPZ 1', tags: [], meta: {},
        station_type: 'gpz', bus_refs: ['b15'], transformer_refs: [],
        gpz_sections: [{ section_id: 'S1', order: 1, name: 'Sekcja 1', bus_ref: 'b15' }],
      } as never,
    ];
    snap.bays = [
      {
        id: 'bay-1', ref_id: 'bay-1', name: 'Pole odpływowe 1', tags: [], meta: {},
        bay_role: 'OUT', substation_ref: 'GPZ-1', bus_ref: 'b15', gpz_section_id: 'S1',
        equipment_refs: ['cb-1'],
      } as never,
      {
        id: 'bay-2', ref_id: 'bay-2', name: 'Pole odpływowe 2', tags: [], meta: {},
        bay_role: 'OUT', substation_ref: 'GPZ-1', bus_ref: 'b15', gpz_section_id: 'S1',
        equipment_refs: ['cb-2'],
      } as never,
    ];
    snap.branches = [
      {
        id: 'seg-1',
        ref_id: 'SEG-1',
        name: 'Kabel 500 m',
        type: 'cable',
        from_bus_ref: 'b15',
        to_bus_ref: 'B2',
        catalog_ref: 'XRUHAKXS 120/25',
        length_km: 0.5,
        tags: [],
        meta: { origin_bay_ref: 'bay-2', origin_apparatus_kind: 'cable_head' },
      } as never,
    ];
    snap.line_runs = [];

    const r = buildSldDataFromSnapshot(snap, null);
    const points = r.cableRuns[0].pathPoints;

    expect(points[0].x).toBe(416);
    expect(points[0].x).toBe(points[1].x);
    expect(points.at(-1)?.x).toBe(points[0].x + 140);
    expect(r.cableRuns[0].label).toBe('XRUHAKXS 120/25 · 500 m');
  });

  it('odcinek bez stacji końcowej jest krótki i opisany parametrami kabla', () => {
    const snap = buildEmptySnapshot();
    snap.buses = [
      { id: 'b15', ref_id: 'b15', name: 'B', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
    ];
    snap.substations = [
      {
        id: 'gpz', ref_id: 'GPZ-1', name: 'GPZ 1', tags: [], meta: {},
        station_type: 'gpz', bus_refs: ['b15'], transformer_refs: [],
        gpz_sections: [{ section_id: 'S1', order: 1, name: 'Sekcja 1', bus_ref: 'b15' }],
      } as never,
    ];
    snap.bays = [
      {
        id: 'bay-1', ref_id: 'bay-1', name: 'Pole odpływowe 1', tags: [], meta: {},
        bay_role: 'OUT', substation_ref: 'GPZ-1', bus_ref: 'b15', gpz_section_id: 'S1',
        equipment_refs: ['cb-1'],
      } as never,
    ];
    snap.branches = [
      {
        id: 'seg-1',
        ref_id: 'SEG-1',
        name: 'Kabel 500 m',
        type: 'cable',
        from_bus_ref: 'b15',
        to_bus_ref: 'B2',
        catalog_ref: 'XRUHAKXS 120/25',
        length_km: 0.5,
        tags: [],
        meta: {},
      } as never,
    ];
    snap.line_runs = [
      {
        id: 'run-1',
        run_kind: 'main_trunk',
        starting_bay_ref: 'bay-1',
        starting_port_ref: 'bay-1#cable_head',
        segments: [{ segment_ref: 'SEG-1', order: 1 }],
        stations: [],
      },
    ];

    const r = buildSldDataFromSnapshot(snap, null);
    const points = r.cableRuns[0].pathPoints;
    const start = points[0];
    const end = points.at(-1);

    expect(r.cableRuns[0].label).toBe('XRUHAKXS 120/25 · 500 m');
    expect(r.cableRuns[0].pendingEndpoint).toBe(true);
    expect(end?.x).toBe(start.x + 140);
    expect(end?.x).toBeGreaterThan(start.x);
    expect(end?.y).toBeGreaterThan(start.y);
  });

  it('dlugosc katalogowa nie steruje geometria oczekujacego odcinka', () => {
    const snap = buildEmptySnapshot();
    snap.buses = [
      { id: 'b15', ref_id: 'b15', name: 'B', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
    ];
    snap.substations = [
      {
        id: 'gpz', ref_id: 'GPZ-1', name: 'GPZ 1', tags: [], meta: {},
        station_type: 'gpz', bus_refs: ['b15'], transformer_refs: [],
        gpz_sections: [{ section_id: 'S1', order: 1, name: 'Sekcja 1', bus_ref: 'b15' }],
      } as never,
    ];
    snap.bays = [
      {
        id: 'bay-1', ref_id: 'bay-1', name: 'Pole odpływowe 1', tags: [], meta: {},
        bay_role: 'OUT', substation_ref: 'GPZ-1', bus_ref: 'b15', gpz_section_id: 'S1',
        equipment_refs: ['cb-1'],
      } as never,
    ];
    snap.branches = [
      {
        id: 'seg-1',
        ref_id: 'SEG-1',
        name: 'Kabel 100 m',
        type: 'cable',
        from_bus_ref: 'b15',
        to_bus_ref: 'B2',
        catalog_ref: 'XRUHAKXS 120/25',
        length_km: 0.1,
        tags: [],
        meta: {},
      } as never,
    ];
    snap.line_runs = [
      {
        id: 'run-1',
        run_kind: 'main_trunk',
        starting_bay_ref: 'bay-1',
        starting_port_ref: 'bay-1#cable_head',
        segments: [{ segment_ref: 'SEG-1', order: 1 }],
        stations: [],
      },
    ];

    const r = buildSldDataFromSnapshot(snap, null);
    const points = r.cableRuns[0].pathPoints;
    const start = points[0];
    const end = points.at(-1);

    expect(r.cableRuns[0].label).toBe('XRUHAKXS 120/25 · 100 m');
    expect(r.cableRuns[0].pendingEndpoint).toBe(true);
    expect(end?.x).toBe(start.x + 140);
  });

  it('kilka odcinków bez stacji ma osobne etykiety i klikalne przedziały', () => {
    const snap = buildEmptySnapshot();
    snap.buses = [
      { id: 'b15', ref_id: 'b15', name: 'B', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
    ];
    snap.substations = [
      {
        id: 'gpz', ref_id: 'GPZ-1', name: 'GPZ 1', tags: [], meta: {},
        station_type: 'gpz', bus_refs: ['b15'], transformer_refs: [],
        gpz_sections: [{ section_id: 'S1', order: 1, name: 'Sekcja 1', bus_ref: 'b15' }],
      } as never,
    ];
    snap.bays = [
      {
        id: 'bay-1', ref_id: 'bay-1', name: 'Pole odpływowe 1', tags: [], meta: {},
        bay_role: 'OUT', substation_ref: 'GPZ-1', bus_ref: 'b15', gpz_section_id: 'S1',
        equipment_refs: ['cb-1'],
      } as never,
    ];
    snap.branches = [
      {
        id: 'seg-1', ref_id: 'SEG-1', name: 'T1', type: 'cable',
        from_bus_ref: 'b15', to_bus_ref: 'B2', catalog_ref: 'XRUHAKXS 120/25',
        length_km: 0.21, tags: [], meta: {},
      } as never,
      {
        id: 'seg-2', ref_id: 'SEG-2', name: 'T2', type: 'cable',
        from_bus_ref: 'B2', to_bus_ref: 'B3', catalog_ref: 'XRUHAKXS 120/25',
        length_km: 0.23, tags: [], meta: {},
      } as never,
      {
        id: 'seg-3', ref_id: 'SEG-3', name: 'T3', type: 'cable',
        from_bus_ref: 'B3', to_bus_ref: 'B4', catalog_ref: 'XRUHAKXS 120/25',
        length_km: 0.18, tags: [], meta: {},
      } as never,
    ];
    snap.line_runs = [
      {
        id: 'run-1',
        run_kind: 'main_trunk',
        starting_bay_ref: 'bay-1',
        starting_port_ref: 'bay-1#cable_head',
        segments: [
          { segment_ref: 'SEG-1', order: 1 },
          { segment_ref: 'SEG-2', order: 2 },
          { segment_ref: 'SEG-3', order: 3 },
        ],
        stations: [],
      },
    ];

    const r = buildSldDataFromSnapshot(snap, null);
    const run = r.cableRuns[0];
    const startX = run.pathPoints[0].x;

    expect(run.pathPoints.at(-1)?.x).toBe(startX + 360);
    // 3 segment labels + 1 voltage annotation (15 kV)
    const segmentTextLabels = run.segmentLabels?.filter(
      (l) => !l.segmentRef?.startsWith('voltage-kv-'),
    );
    expect(segmentTextLabels?.map((label) => label.text)).toEqual([
      'XRUHAKXS 120/25 · 210 m',
      'XRUHAKXS 120/25 · 230 m',
      'XRUHAKXS 120/25 · 180 m',
    ]);
    expect(segmentTextLabels?.map((label) => label.x)).toEqual([
      startX + 60,
      startX + 180,
      startX + 300,
    ]);
    const voltageLabel = run.segmentLabels?.find(
      (l) => l.segmentRef?.startsWith('voltage-kv-'),
    );
    expect(voltageLabel?.text).toBe('15 kV');
    expect(run.segmentPaths?.map((segmentPath) => segmentPath.pathPoints.at(-1)?.x)).toEqual([
      startX + 120,
      startX + 240,
      startX + 360,
    ]);
  });

  it('ciąg kablowy kończy się na ostatnim porcie stacji i pokazuje trasę do kolejnej stacji', () => {
    const snap = buildEmptySnapshot();
    snap.substations = [
      { id: 's1', ref_id: 'ST-1', name: 'Stacja 1', tags: [], meta: {}, station_type: 'inline', bus_refs: [], transformer_refs: [] } as never,
      { id: 's2', ref_id: 'ST-2', name: 'Stacja 2', tags: [], meta: {}, station_type: 'terminal', bus_refs: [], transformer_refs: [] } as never,
    ];
    snap.branches = [
      {
        id: 'seg-1',
        ref_id: 'SEG-1',
        name: 'Kabel 500 m',
        type: 'cable',
        from_bus_ref: 'B1',
        to_bus_ref: 'B2',
        catalog_ref: 'XRUHAKXS 120/25',
        length_km: 0.5,
        tags: [],
        meta: {},
      } as never,
      {
        id: 'seg-2',
        ref_id: 'SEG-2',
        name: 'Kabel 700 m',
        type: 'cable',
        from_bus_ref: 'B2',
        to_bus_ref: 'B3',
        catalog_ref: 'XRUHAKXS 70/25',
        length_km: 0.7,
        tags: [],
        meta: {},
      } as never,
    ];
    snap.line_runs = [
      {
        id: 'run-1',
        run_kind: 'main_trunk',
        starting_bay_ref: 'bay-1',
        starting_port_ref: 'port-1',
        segments: [
          { segment_ref: 'SEG-1', order: 1 },
          { segment_ref: 'SEG-2', order: 2 },
        ],
        stations: [
          { substation_ref: 'ST-1', order: 1 },
          { substation_ref: 'ST-2', order: 2 },
        ],
      },
    ];

    const r = buildSldDataFromSnapshot(snap, null);

    expect(r.cableRuns).toHaveLength(1);
    expect(r.stations.map((station) => station.id)).toEqual(['ST-1', 'ST-2']);
    const lastCablePoint = r.cableRuns[0].pathPoints.at(-1);
    expect(lastCablePoint?.x).toBeLessThan(r.stations[1].x);
    expect(lastCablePoint?.y).toBe(r.stations[1].y - 54);
    expect(r.stations[0].x).toBeLessThan(r.stations[1].x);
    expect(r.cableRuns[0].label).toBe('różne typy katalogowe · 1,2 km');
    expect(r.cableRuns[0].segmentLabels?.map((label) => label.text)).toEqual([
      'XRUHAKXS 120/25 · 500 m',
      'XRUHAKXS 70/25 · 700 m',
    ]);
    expect(r.cableRuns[0].segmentPaths?.map((segmentPath) => segmentPath.segmentRef)).toEqual([
      'SEG-1',
      'SEG-2',
    ]);
    expect(r.cableRuns[0].segmentPaths?.[0]?.pathPoints.at(0)?.x).toBe(r.cableRuns[0].pathPoints[0].x);
    const firstStationInputX = r.cableRuns[0].segmentPaths?.[0]?.pathPoints.at(-1)?.x;
    const firstStationOutputX = r.cableRuns[0].segmentPaths?.[1]?.pathPoints.at(0)?.x;
    expect(firstStationInputX).toBeLessThan(r.stations[0].x);
    expect(firstStationOutputX).toBeGreaterThanOrEqual(r.stations[0].x);
    expect(r.cableRuns[0].segmentPaths?.[1]?.pathPoints.at(-1)?.x).toBe(lastCablePoint?.x);
  });
});

// =============================================================================
// Phase 0B-1: BayRuntimeState telemetry pipeline (OPEN Inv 17 → RESOLVED)
// =============================================================================

describe('projectBayTelemetry — mapowanie BayRuntimeState → GpzBayDescriptor (commit 13)', () => {
  it('null/undefined runtime → puste pola (renderer pokazuje neutral)', () => {
    expect(projectBayTelemetry(null)).toEqual({});
    expect(projectBayTelemetry(undefined)).toEqual({});
  });

  it('CB zamknięty + zdalne → cbState=closed, controlMode=remote', () => {
    const rt = makeRuntime({
      'apparatus_cb_q0': makeSwitchState({ actual_state: 'zamkniety', control_mode: 'zdalne' }),
    });
    const r = projectBayTelemetry(rt);
    expect(r.cbState).toBe('closed');
    expect(r.controlMode).toBe('remote');
  });

  it('CB otwarty + miejscowe → cbState=open, controlMode=local', () => {
    const rt = makeRuntime({
      'apparatus_cb': makeSwitchState({ actual_state: 'otwarty', control_mode: 'miejscowe' }),
    });
    const r = projectBayTelemetry(rt);
    expect(r.cbState).toBe('open');
    expect(r.controlMode).toBe('local');
  });

  it('DS_LIN i ES osobno z różnymi stanami → mapowane niezależnie', () => {
    const rt = makeRuntime({
      'apparatus_cb_q0': makeSwitchState({ actual_state: 'zamkniety', control_mode: 'zdalne' }),
      'apparatus_ds_lin_q9': makeSwitchState({ actual_state: 'otwarty', control_mode: 'zdalne' }),
      'apparatus_es_q8': makeSwitchState({ actual_state: 'zamkniety', control_mode: 'zdalne' }),
    });
    const r = projectBayTelemetry(rt);
    expect(r.cbState).toBe('closed');
    expect(r.dsState).toBe('open');
    expect(r.esState).toBe('closed');
  });

  it('actual_state="awaria" → cbState=unknown (renderer neutral)', () => {
    const rt = makeRuntime({
      'apparatus_cb_q0': makeSwitchState({ actual_state: 'awaria', control_mode: 'odstawione' }),
    });
    const r = projectBayTelemetry(rt);
    expect(r.cbState).toBe('unknown');
  });

  it('"_naped_rozbrojony" warianty → mapowane na pozycję mechaniczną', () => {
    const rt = makeRuntime({
      'apparatus_cb_q0': makeSwitchState({ actual_state: 'zamkniety_naped_rozbrojony', control_mode: 'zdalne' }),
      'apparatus_ds_lin_q9': makeSwitchState({ actual_state: 'otwarty_naped_rozbrojony', control_mode: 'zdalne' }),
    });
    const r = projectBayTelemetry(rt);
    expect(r.cbState).toBe('closed');
    expect(r.dsState).toBe('open');
  });

  it('pending_command obecny → inManipulation=true (renderer wyróżnia żółtym)', () => {
    const rt = makeRuntime(
      {
        'apparatus_cb_q0': makeSwitchState({ actual_state: 'zamkniety', control_mode: 'zdalne' }),
      },
      {
        pending_command: {
          command_id: 'cmd-1',
          command_kind: 'open',
          target_device_ref: 'apparatus_cb_q0',
          state: 'oczekuje',
          progress_percent: null,
          last_event_at: null,
          last_event_message_pl: null,
        } as never,
      },
    );
    const r = projectBayTelemetry(rt);
    expect(r.inManipulation).toBe(true);
  });

  it('interlock_blocked na CB → inManipulation=true', () => {
    const rt = makeRuntime({
      'apparatus_cb_q0': makeSwitchState({
        actual_state: 'zamkniety',
        control_mode: 'zdalne',
        interlock_blocked: true,
      }),
    });
    const r = projectBayTelemetry(rt);
    expect(r.inManipulation).toBe(true);
  });

  it('Brak pending_command + brak interlocków → inManipulation=undefined', () => {
    const rt = makeRuntime({
      'apparatus_cb_q0': makeSwitchState({ actual_state: 'zamkniety', control_mode: 'zdalne' }),
    });
    const r = projectBayTelemetry(rt);
    expect(r.inManipulation).toBeUndefined();
  });

  it('Klucze deterministycznie sortowane → stabilny wybór gdy >1 device w kategorii', () => {
    const rt1 = makeRuntime({
      'apparatus_cb_q0_b': makeSwitchState({ actual_state: 'otwarty', control_mode: 'zdalne' }),
      'apparatus_cb_q0_a': makeSwitchState({ actual_state: 'zamkniety', control_mode: 'zdalne' }),
    });
    const rt2 = makeRuntime({
      'apparatus_cb_q0_a': makeSwitchState({ actual_state: 'zamkniety', control_mode: 'zdalne' }),
      'apparatus_cb_q0_b': makeSwitchState({ actual_state: 'otwarty', control_mode: 'zdalne' }),
    });
    expect(projectBayTelemetry(rt1).cbState).toBe('closed');  // pierwszy alfabetycznie = a
    expect(projectBayTelemetry(rt2).cbState).toBe('closed');
  });

  it('DS_BUS rozróżnione od DS_LIN po nazwie klucza (_dsbus vs _dslin)', () => {
    const rt = makeRuntime({
      'apparatus_ds_bus_q1': makeSwitchState({ actual_state: 'zamkniety', control_mode: 'zdalne' }),
      'apparatus_ds_lin_q9': makeSwitchState({ actual_state: 'otwarty', control_mode: 'zdalne' }),
    });
    const r = projectBayTelemetry(rt);
    /* DS_LIN to ten "domyślny" mapowany do dsState w GpzBayDescriptor.
     * DS_BUS jest osobny — adapter na razie nie eksponuje go, ale klasyfikacja
     * w pickFirstStateForCategory rozróżnia oba. */
    expect(r.dsState).toBe('open');  // DS_LIN actual=otwarty
  });
});

// =============================================================================
// Phase 0B-4: LineRun.stations[] consumed by adapter (PARTIAL → RESOLVED)
// =============================================================================

describe('buildStations — konsumuje line_runs.stations[] z explicit order', () => {
  it('Stacje w line_runs.stations[] sortowane po order, jeden ciąg = jeden kanał Y', () => {
    const snap = buildEmptySnapshot();
    snap.substations = [
      { id: 's1', ref_id: 'ST-1', name: 'A', tags: [], meta: {}, station_type: 'inline', bus_refs: [], transformer_refs: [] } as never,
      { id: 's2', ref_id: 'ST-2', name: 'B', tags: [], meta: {}, station_type: 'branch', bus_refs: [], transformer_refs: [] } as never,
      { id: 's3', ref_id: 'ST-3', name: 'C', tags: [], meta: {}, station_type: 'terminal', bus_refs: [], transformer_refs: [] } as never,
    ];
    snap.line_runs = [
      {
        id: 'run-A',
        run_kind: 'main_trunk',
        starting_bay_ref: 'bay-1',
        starting_port_ref: 'port-1',
        segments: [],
        stations: [
          { substation_ref: 'ST-3', order: 3 },
          { substation_ref: 'ST-1', order: 1 },
          { substation_ref: 'ST-2', order: 2 },
        ],
      },
    ];
    const r = buildSldDataFromSnapshot(snap, null);
    expect(r.stations).toHaveLength(3);
    /* Sortowanie po order: ST-1 (order=1) → ST-2 (order=2) → ST-3 (order=3). */
    expect(r.stations[0].id).toBe('ST-1');
    expect(r.stations[1].id).toBe('ST-2');
    expect(r.stations[2].id).toBe('ST-3');
    /* Wszystkie 3 stacje na tym samym kanale Y (1 ciąg). */
    expect(r.stations[0].y).toBe(r.stations[1].y);
    expect(r.stations[1].y).toBe(r.stations[2].y);
  });

  it('Wiele line_runs → osobne kanały Y, deterministyczne sortowanie po lineRun.id', () => {
    const snap = buildEmptySnapshot();
    snap.substations = [
      { id: 's1', ref_id: 'ST-A1', name: 'A1', tags: [], meta: {}, station_type: 'inline', bus_refs: [], transformer_refs: [] } as never,
      { id: 's2', ref_id: 'ST-B1', name: 'B1', tags: [], meta: {}, station_type: 'inline', bus_refs: [], transformer_refs: [] } as never,
    ];
    snap.line_runs = [
      {
        id: 'run-Z', run_kind: 'main_trunk',
        starting_bay_ref: 'bay-z', starting_port_ref: 'port-z',
        segments: [], stations: [{ substation_ref: 'ST-B1', order: 1 }],
      },
      {
        id: 'run-A', run_kind: 'main_trunk',
        starting_bay_ref: 'bay-a', starting_port_ref: 'port-a',
        segments: [], stations: [{ substation_ref: 'ST-A1', order: 1 }],
      },
    ];
    const r = buildSldDataFromSnapshot(snap, null);
    expect(r.stations).toHaveLength(2);
    /* Sortowanie line_runs po id: run-A (idx=0) → run-Z (idx=1).
     * Stacje w run-A na kanale Y_RUN_BASE; stacje w run-Z na kanale Y_RUN_BASE+RUN_PITCH. */
    const stationA = r.stations.find((s) => s.id === 'ST-A1');
    const stationB = r.stations.find((s) => s.id === 'ST-B1');
    expect(stationA).toBeDefined();
    expect(stationB).toBeDefined();
    expect(stationA!.y).toBeLessThan(stationB!.y);
  });

  it('Stacje NIE wymienione w line_runs (orphans) → osobny kanał Y po lineRun-bazowanych', () => {
    const snap = buildEmptySnapshot();
    snap.substations = [
      { id: 's1', ref_id: 'ST-IN-RUN', name: 'In', tags: [], meta: {}, station_type: 'inline', bus_refs: [], transformer_refs: [] } as never,
      { id: 's2', ref_id: 'ST-ORPHAN', name: 'Orphan', tags: [], meta: {}, station_type: 'inline', bus_refs: [], transformer_refs: [] } as never,
    ];
    snap.line_runs = [
      {
        id: 'run-1', run_kind: 'main_trunk',
        starting_bay_ref: 'bay-1', starting_port_ref: 'port-1',
        segments: [], stations: [{ substation_ref: 'ST-IN-RUN', order: 1 }],
      },
    ];
    const r = buildSldDataFromSnapshot(snap, null);
    expect(r.stations).toHaveLength(2);
    const inRun = r.stations.find((s) => s.id === 'ST-IN-RUN');
    const orphan = r.stations.find((s) => s.id === 'ST-ORPHAN');
    expect(inRun).toBeDefined();
    expect(orphan).toBeDefined();
    /* Orphan na osobnym (wyższym) kanale Y. */
    expect(orphan!.y).toBeGreaterThan(inRun!.y);
  });

  it('Brak line_runs (legacy ENM) → wszystkie stacje jako orphans (back-compat)', () => {
    const snap = buildEmptySnapshot();
    snap.substations = [
      { id: 's1', ref_id: 'ST-1', name: 'A', tags: [], meta: {}, station_type: 'inline', bus_refs: [], transformer_refs: [] } as never,
      { id: 's2', ref_id: 'ST-2', name: 'B', tags: [], meta: {}, station_type: 'inline', bus_refs: [], transformer_refs: [] } as never,
    ];
    /* Brak snap.line_runs → fallback do orphan placement (legacy behavior). */
    const r = buildSldDataFromSnapshot(snap, null);
    expect(r.stations).toHaveLength(2);
    /* Sortowanie alfabetyczne po ref_id: ST-1 → ST-2. Oba w kanale 0 (orphanRunBase=0). */
    expect(r.stations[0].id).toBe('ST-1');
    expect(r.stations[1].id).toBe('ST-2');
    expect(r.stations[0].y).toBe(r.stations[1].y);
  });

  it('Stacja typu GPZ NIE wpada do field stations nawet gdy w line_runs', () => {
    const snap = buildEmptySnapshot();
    snap.substations = [
      { id: 'g', ref_id: 'GPZ-1', name: 'GPZ', tags: [], meta: {}, station_type: 'gpz', bus_refs: [], transformer_refs: [] } as never,
      { id: 's1', ref_id: 'ST-1', name: 'A', tags: [], meta: {}, station_type: 'inline', bus_refs: [], transformer_refs: [] } as never,
    ];
    snap.line_runs = [
      {
        id: 'run-1', run_kind: 'main_trunk',
        starting_bay_ref: 'bay-1', starting_port_ref: 'port-1',
        segments: [],
        stations: [
          { substation_ref: 'GPZ-1', order: 1 },  // GPZ — pomijany
          { substation_ref: 'ST-1', order: 2 },
        ],
      },
    ];
    const r = buildSldDataFromSnapshot(snap, null);
    /* GPZ NIE jest w r.stations (jest osobno w r.gpzs). */
    expect(r.stations.map((s) => s.id)).toEqual(['ST-1']);
  });

  it('Determinizm: ten sam ENM z line_runs → ten sam output 5× pod rząd', () => {
    const snap = buildEmptySnapshot();
    snap.substations = [
      { id: 's1', ref_id: 'ST-A', name: 'A', tags: [], meta: {}, station_type: 'inline', bus_refs: [], transformer_refs: [] } as never,
      { id: 's2', ref_id: 'ST-B', name: 'B', tags: [], meta: {}, station_type: 'branch', bus_refs: [], transformer_refs: [] } as never,
    ];
    snap.line_runs = [
      {
        id: 'run-1', run_kind: 'main_trunk',
        starting_bay_ref: 'bay-1', starting_port_ref: 'port-1',
        segments: [],
        stations: [
          { substation_ref: 'ST-B', order: 2 },
          { substation_ref: 'ST-A', order: 1 },
        ],
      },
    ];
    const reference = buildSldDataFromSnapshot(snap, null);
    for (let i = 0; i < 5; i++) {
      const result = buildSldDataFromSnapshot(snap, null);
      expect(result.stations).toEqual(reference.stations);
    }
  });
});

describe('enmToSldAdapter — buildSldDataFromSnapshot konsumuje runtime_state (commit 13)', () => {
  it('Bay z runtime_state CB=zamkniety → GpzBayDescriptor.cbState=closed', () => {
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
        id: 'b1', ref_id: 'bay-1', name: 'Pole 1', tags: [], meta: {},
        bay_role: 'OUT', substation_ref: 'GPZ-1', bus_ref: 'b15', gpz_section_id: 'A',
        equipment_refs: ['cb1'],
        runtime_state: makeRuntime({
          'apparatus_cb_q0': makeSwitchState({ actual_state: 'zamkniety', control_mode: 'zdalne' }),
          'apparatus_es_q8': makeSwitchState({ actual_state: 'otwarty', control_mode: 'zdalne' }),
        }),
      } as never,
    ];
    const r = buildSldDataFromSnapshot(snap, null);
    const bay = r.gpzs[0].sections?.[0].bays[0];
    expect(bay?.cbState).toBe('closed');
    expect(bay?.esState).toBe('open');
    expect(bay?.controlMode).toBe('remote');
  });

  it('Bay BEZ runtime_state → cbState undefined, esState fallback ("unknown" gdy hasEs)', () => {
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
        id: 'b1', ref_id: 'bay-1', name: 'Pole 1', tags: [], meta: {},
        bay_role: 'OUT', substation_ref: 'GPZ-1', bus_ref: 'b15', gpz_section_id: 'A',
        equipment_refs: ['cb1'],
        /* brak runtime_state */
      } as never,
    ];
    const r = buildSldDataFromSnapshot(snap, null);
    const bay = r.gpzs[0].sections?.[0].bays[0];
    expect(bay?.cbState).toBeUndefined();
    expect(bay?.dsState).toBeUndefined();
    expect(bay?.controlMode).toBeUndefined();
    /* hasEs=true dla OUT → fallback 'unknown' (Invariant 9). */
    expect(bay?.esState).toBe('unknown');
  });

  it('Coupler bay z runtime_state → couplerDescriptor.closed=closed', () => {
    const snap = buildEmptySnapshot();
    snap.buses = [
      { id: 'b15', ref_id: 'b15', name: 'B', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
    ];
    snap.substations = [
      {
        id: 's', ref_id: 'GPZ-1', name: 'GPZ', tags: [], meta: {},
        station_type: 'gpz', bus_refs: ['b15'], transformer_refs: [],
        gpz_sections: [
          { section_id: 'A', order: 1, bus_ref: 'b15', right_coupler_ref: 'bay-coup' },
          { section_id: 'B', order: 2, bus_ref: 'b15', left_coupler_ref: 'bay-coup' },
        ],
      } as never,
    ];
    snap.bays = [
      {
        id: 'cpl', ref_id: 'bay-coup', name: 'CPL', tags: [], meta: {},
        bay_role: 'COUPLER', substation_ref: 'GPZ-1', bus_ref: 'b15',
        equipment_refs: ['cb-coup'],
        runtime_state: makeRuntime({
          'apparatus_cb_q0': makeSwitchState({ actual_state: 'zamkniety', control_mode: 'zdalne' }),
        }),
      } as never,
    ];
    const r = buildSldDataFromSnapshot(snap, null);
    expect(r.gpzs[0].couplers?.[0]?.closed).toBe('closed');
  });

  describe('SupplyPath integration (energized + openPoint propagation)', () => {
    it('cable z aktywnym torem od źródła → energized=true', () => {
      const snap = buildEmptySnapshot();
      snap.buses = [
        { id: 'b_a', ref_id: 'b_a', name: 'A', voltage_kv: 15 } as never,
        { id: 'b_b', ref_id: 'b_b', name: 'B', voltage_kv: 15 } as never,
      ];
      snap.sources = [
        { id: 'src', ref_id: 'src', name: 'Grid', bus_ref: 'b_a', model: 'short_circuit_power', sk3_mva: 250 } as never,
      ];
      snap.branches = [
        { id: 'c1', ref_id: 'c1', name: 'C1', type: 'cable', from_bus_ref: 'b_a', to_bus_ref: 'b_b', status: 'closed', length_km: 1, r_ohm_per_km: 0.2, x_ohm_per_km: 0.08 } as never,
      ];
      const r = buildSldDataFromSnapshot(snap, null);
      expect(r.cableRuns).toHaveLength(1);
      expect(r.cableRuns[0].energized).toBe(true);
      expect(r.cableRuns[0].containsOpenPoint).toBe(false);
    });

    it('cable bez źródła → energized=false', () => {
      const snap = buildEmptySnapshot();
      snap.buses = [
        { id: 'b_a', ref_id: 'b_a', name: 'A', voltage_kv: 15 } as never,
        { id: 'b_b', ref_id: 'b_b', name: 'B', voltage_kv: 15 } as never,
      ];
      // brak sources!
      snap.branches = [
        { id: 'c1', ref_id: 'c1', name: 'C1', type: 'cable', from_bus_ref: 'b_a', to_bus_ref: 'b_b', status: 'closed', length_km: 1, r_ohm_per_km: 0.2, x_ohm_per_km: 0.08 } as never,
      ];
      const r = buildSldDataFromSnapshot(snap, null);
      expect(r.cableRuns[0].energized).toBe(false);
    });

    it('supplyPath dostępny w SldDataPayload', () => {
      const snap = buildEmptySnapshot();
      snap.buses = [
        { id: 'b_a', ref_id: 'b_a', name: 'A', voltage_kv: 15 } as never,
      ];
      snap.sources = [
        { id: 'src', ref_id: 'src', name: 'Grid', bus_ref: 'b_a', model: 'short_circuit_power', sk3_mva: 250 } as never,
      ];
      const r = buildSldDataFromSnapshot(snap, null);
      expect(r.supplyPath.energizedBusRefs).toContain('b_a');
      expect(r.supplyPath.sourceRefs).toContain('src');
    });

    it('null snapshot → empty supplyPath', () => {
      const r = buildSldDataFromSnapshot(null, null);
      expect(r.supplyPath.energizedBusRefs).toEqual([]);
      expect(r.supplyPath.sourceRefs).toEqual([]);
    });
  });

  describe('endpoint port detection (E030)', () => {
    it('kabel bez endpoint_a_port / endpoint_b_port → missingEndpointPort=true', () => {
      const snap = buildEmptySnapshot();
      snap.branches = [
        {
          id: 'k_miss', ref_id: 'k_miss', name: 'K-MISS', tags: [], meta: {},
          type: 'cable', from_bus_ref: 'a', to_bus_ref: 'b', status: 'closed',
          length_km: 1, r_ohm_per_km: 0.5, x_ohm_per_km: 0.1,
          // endpoint_a_port / endpoint_b_port pominięte celowo
        } as never,
      ];
      const r = buildSldDataFromSnapshot(snap, null);
      expect(r.cableRuns).toHaveLength(1);
      expect(r.cableRuns[0].missingEndpointPort).toBe(true);
      expect(r.cableRuns[0].missingPortSegmentRefs).toEqual(['k_miss']);
    });

    it('kabel z oba endpointami → missingEndpointPort=false', () => {
      const snap = buildEmptySnapshot();
      snap.branches = [
        {
          id: 'k_ok', ref_id: 'k_ok', name: 'K-OK', tags: [], meta: {},
          type: 'cable', from_bus_ref: 'a', to_bus_ref: 'b', status: 'closed',
          length_km: 1, r_ohm_per_km: 0.5, x_ohm_per_km: 0.1,
          endpoint_a_port: { port_id: 'p_a' },
          endpoint_b_port: { port_id: 'p_b' },
        } as never,
      ];
      const r = buildSldDataFromSnapshot(snap, null);
      expect(r.cableRuns[0].missingEndpointPort).toBe(false);
      expect(r.cableRuns[0].missingPortSegmentRefs).toEqual([]);
    });

    it('kabel z jednym brakującym portem → missingEndpointPort=true', () => {
      const snap = buildEmptySnapshot();
      snap.branches = [
        {
          id: 'k_one', ref_id: 'k_one', name: 'K-ONE', tags: [], meta: {},
          type: 'cable', from_bus_ref: 'a', to_bus_ref: 'b', status: 'closed',
          length_km: 1, r_ohm_per_km: 0.5, x_ohm_per_km: 0.1,
          endpoint_a_port: { port_id: 'p_a' },
          // endpoint_b_port pominięty
        } as never,
      ];
      const r = buildSldDataFromSnapshot(snap, null);
      expect(r.cableRuns[0].missingEndpointPort).toBe(true);
      expect(r.cableRuns[0].missingPortSegmentRefs).toEqual(['k_one']);
    });

    it('linia napowietrzna bez portów → missingEndpointPort=true', () => {
      const snap = buildEmptySnapshot();
      snap.branches = [
        {
          id: 'l_miss', ref_id: 'l_miss', name: 'L-MISS', tags: [], meta: {},
          type: 'line_overhead', from_bus_ref: 'a', to_bus_ref: 'b', status: 'closed',
          length_km: 2, r_ohm_per_km: 0.3, x_ohm_per_km: 0.4,
        } as never,
      ];
      const r = buildSldDataFromSnapshot(snap, null);
      expect(r.cableRuns[0].missingEndpointPort).toBe(true);
    });
  });

  describe('corridor station placement after endpoint append', () => {
    it('station_refs z korytarza pozycjonuje stację na ciągu, nie w kanale orphan', () => {
      const snap = buildEmptySnapshot();
      snap.substations = [
        { id: 's1', ref_id: 'ST-END', name: 'Na końcu', tags: [], meta: {}, station_type: 'inline', bus_refs: [], transformer_refs: [] } as never,
        { id: 's2', ref_id: 'ST-ORPHAN', name: 'Orphan', tags: [], meta: {}, station_type: 'inline', bus_refs: [], transformer_refs: [] } as never,
      ];
      snap.corridors = [
        {
          id: 'corr-1',
          ref_id: 'corr-1',
          name: 'Magistrala',
          tags: [],
          meta: {},
          corridor_type: 'radial',
          ordered_segment_refs: ['seg-1'],
          station_refs: ['ST-END'],
        } as never,
      ];

      const r = buildSldDataFromSnapshot(snap, null);
      const appended = r.stations.find((s) => s.id === 'ST-END');
      const orphan = r.stations.find((s) => s.id === 'ST-ORPHAN');

      expect(appended).toBeDefined();
      expect(orphan).toBeDefined();
      expect(orphan!.y).toBeGreaterThan(appended!.y);
    });
  });
});
