// @vitest-environment node
/**
 * Testy enmToSldAdapter — adapter ENM → model widoku SLD czytany przez scenę v3.
 *
 * Pokrycie:
 *  1. Pusty snapshot → puste tablice.
 *  2. Determinizm: ten sam input → ten sam output (10× pod rząd).
 *  3. Logical views / line_runs / łańcuch gałęzi → cableRuns (rodzaj, odcinki, terminale
 *     §16, etykiety odcinków).
 *  4. Stacje pole-wymiarowe (mv_lv/inline/branch/...) → StationOnRunViewModel.
 *  5. topologyRuns (relacje ciągów) i sources (źródła widoku).
 * GPZ-PARYTET cz. 3: testy pól bez czytelnika rysunku (sekcje, wytwórcy v2, punkty
 * rozgałęzienia, wiązania końcówek, raport czytelności, geometria slotowa) skasowane
 * razem z tymi polami.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

import {
  buildSldDataFromSnapshot,
  resolveBayCtRatingAnnotations,
  resolveBayProtectionMarking,
  resolveBayVtMountings,
} from '../enmToSldAdapter';
import { FIELD_ROLE } from '../../domain/apparatusContracts';
import type {
  Bay,
  BayPrimaryDevice,
  BaySwitchState,
  EnergyNetworkModel,
  LogicalViewsV1,
} from '../../../../../types/enm';
import { pole } from '../../../../../test/pola';
import { polaSnStacji } from '../../../../shared/polaStacji';

function makeSwitchState(overrides: Partial<BaySwitchState>): BaySwitchState {
  return {
    actual_state: 'nieznany',
    control_mode: 'miejscowe',
    communication_ok: false,
    interlock_blocked: false,
    ...overrides,
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

/** F9.2 sonda: fixtura realna `sldSubstrate52s` (v2, 53 stacje SN + 1 GPZ) —
 *  ta sama fixtura co `v3/scene/__tests__/buildScene.test.ts`. */
function resolveFixturePath(fileName: string): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', '..', 'geometry', '__tests__', 'fixtures', fileName);
}

function attachMainRun(
  snapshot: EnergyNetworkModel,
  stationRefs: readonly string[],
  runId = 'run-test',
): void {
  snapshot.line_runs = [
    {
      id: runId,
      run_kind: 'main_trunk',
      starting_bay_ref: `${runId}/bay`,
      starting_port_ref: `${runId}/port`,
      segments: [],
      stations: stationRefs.map((substation_ref, index) => ({ substation_ref, order: index + 1 })),
    },
  ];
}

/** Rekordy pól rozdzielnicy ZKSN — kształt `enm.pola.pola_zksn_z_portow` (WE, WY, ODG n). */
function polaZksnTestowe(punkt: string, szyna: string, odgalezien: number): Bay[] {
  const porty: [string, Bay['bay_role'], string, string][] = [
    ['MAIN_IN', 'IN', 'LINIA_IN', 'WE'],
    ['MAIN_OUT', 'OUT', 'LINIA_OUT', 'WY'],
    ...Array.from({ length: odgalezien }, (_, i): [string, Bay['bay_role'], string, string] => [
      odgalezien > 1 ? `BRANCH_${i + 1}` : 'BRANCH', 'OUT', 'LINIA_ODG', `ODG ${i + 1}`,
    ]),
  ];
  return porty.map(([port, bay_role, field_role, name]) => pole({
    ref_id: `${punkt}/pole/${port}`,
    name,
    bay_role,
    field_role,
    branch_point_ref: punkt,
    branch_point_port_id: port,
    bus_ref: szyna,
  }));
}

describe('enmToSldAdapter — adapter snapshot → SldCanvasV2', () => {
  it('zwraca puste tablice gdy snapshot jest null', () => {
    const r = buildSldDataFromSnapshot(null, null);
    expect(r.gpzs).toEqual([]);
    expect(r.cableRuns).toEqual([]);
    expect(r.stations).toEqual([]);
    expect(r.topologyRuns).toEqual([]);
    expect(r.sources).toEqual([]);
  });

  it('zachowuje oznaczenie stacji z workflow UI zamiast numeru pozycji w ciagu', () => {
    const snap = buildEmptySnapshot();
    snap.substations = [
      { id: 's1', ref_id: 'sub/1/substation', name: 'Stacja SN/nN 1', tags: [], meta: {}, station_type: 'inline', bus_refs: [], transformer_refs: [] } as never,
      { id: 's2', ref_id: 'sub/2/substation', name: 'Stacja SN/nN 2', tags: [], meta: {}, station_type: 'inline', bus_refs: [], transformer_refs: [] } as never,
      { id: 's3', ref_id: 'sub/3/substation', name: 'Stacja SN/nN 3', tags: [], meta: {}, station_type: 'inline', bus_refs: [], transformer_refs: [] } as never,
      { id: 's10', ref_id: 'sub/10/substation', name: 'Stacja SN/nN 10', tags: [], meta: {}, station_type: 'inline', bus_refs: [], transformer_refs: [] } as never,
    ];
    attachMainRun(snap, [
      'sub/1/substation',
      'sub/2/substation',
      'sub/3/substation',
      'sub/10/substation',
    ]);

    const result = buildSldDataFromSnapshot(snap, null);
    const station = result.stations.find((item) => item.id === 'sub/10/substation');

    expect(station?.stationCode).toBe('S10');
    expect(station?.stationCode).not.toBe('S04');
  });

  it('zwraca puste tablice gdy snapshot pusty', () => {
    const snap = buildEmptySnapshot();
    const r = buildSldDataFromSnapshot(snap, null);
    expect(r.gpzs).toEqual([]);
    expect(r.cableRuns).toEqual([]);
    expect(r.stations).toEqual([]);
    expect(r.topologyRuns).toEqual([]);
    expect(r.sources).toEqual([]);
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

  it('logical_views.trunks → cableRuns z main_trunk runKind', () => {
    const snap = buildEmptySnapshot();
    snap.branches = [
      {
        id: 'k1', ref_id: 'k1', name: 'K-1', tags: [], meta: {},
        type: 'cable', from_bus_ref: 'a', to_bus_ref: 'b', status: 'closed',
        catalog_ref: 'cable-base-epr-al-1c-150',
        length_km: 1, r_ohm_per_km: 0.5, x_ohm_per_km: 0.1,
      } as never,
    ];
    const lv: LogicalViewsV1 = {
      trunks: [{ corridor_ref: 'TRUNK-1', corridor_type: 'main', segments: ['k1'], no_point_refs: [], terminals: [] }],
      branches: [],
      secondary_connectors: [],
      terminals: [],
    };
    const r = buildSldDataFromSnapshot(snap, lv);
    expect(r.cableRuns).toHaveLength(1);
    expect(r.cableRuns[0].id).toBe('TRUNK-1');
    expect(r.cableRuns[0].runKind).toBe('main_trunk');
    expect(r.cableRuns[0].segmentKind).toBe('cable_sn');
    expect(r.cableRuns[0].label).toBe('Kabel SN EPR Al 3×1×150 mm² · 1 km');
  });

  it('SLD opisuje kabel jednożyłowy jako komplet trzech faz toru SN', () => {
    const snap = buildEmptySnapshot();
    snap.branches = [
      {
        id: 'k1', ref_id: 'k1', name: 'K-1', tags: [], meta: {},
        type: 'cable', from_bus_ref: 'a', to_bus_ref: 'b', status: 'closed',
        catalog_ref: 'cable-enea-operator-na2xs2y-1x150',
        materialized_params: {
          catalog_label: 'ENEA Operator NA2XS2Y 1X150',
          return_conductor_cross_section_mm2: 25,
        },
        length_km: 0.5, r_ohm_per_km: 0.206, x_ohm_per_km: 0.107,
      } as never,
    ];
    const lv: LogicalViewsV1 = {
      trunks: [{ corridor_ref: 'TRUNK-1', corridor_type: 'main', segments: ['k1'], no_point_refs: [], terminals: [] }],
      branches: [],
      secondary_connectors: [],
      terminals: [],
    };

    const r = buildSldDataFromSnapshot(snap, lv);

    expect(r.cableRuns[0].label).toBe('3 × NA2XS2Y 1×150/25 mm² · 500 m');
  });

  it('SLD usuwa nazwe operatora takze z etykiety z prefiksem 3 faz i bierze zyle powrotna z katalogu', () => {
    const snap = buildEmptySnapshot();
    snap.branches = [
      {
        id: 'k1', ref_id: 'k1', name: 'K-1', tags: [], meta: {},
        type: 'cable', from_bus_ref: 'a', to_bus_ref: 'b', status: 'closed',
        catalog_ref: 'cable-operator-na2xs2y-1x150-35',
        materialized_params: {
          catalog_label: '3 x ENEA OPERATOR NA2XS2Y 1x150',
        },
        return_conductor_cross_section_mm2: 35,
        length_km: 0.72, r_ohm_per_km: 0.206, x_ohm_per_km: 0.107,
      } as never,
    ];
    const lv: LogicalViewsV1 = {
      trunks: [{ corridor_ref: 'TRUNK-1', corridor_type: 'main', segments: ['k1'], no_point_refs: [], terminals: [] }],
      branches: [],
      secondary_connectors: [],
      terminals: [],
    };

    const r = buildSldDataFromSnapshot(snap, lv);

    expect(r.cableRuns[0].label).toBe('3 × NA2XS2Y 1×150/35 mm² · 720 m');
    expect(r.cableRuns[0].label).not.toMatch(/operator/i);
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
      trunks: [{ corridor_ref: 'T1', corridor_type: 'overhead', segments: ['l1'], no_point_refs: [], terminals: [] }],
      branches: [],
      secondary_connectors: [],
      terminals: [],
    };
    const r = buildSldDataFromSnapshot(snap, lv);
    expect(r.cableRuns[0].segmentKind).toBe('overhead_line_sn');
  });

  it('Stacje pole-wymiarowe → topologicalType z POL i POŁĄCZEŃ, nie z deklaracji station_type', () => {
    // Karta ETYKIETA-STACJI-PRZELOTOWEJ (§19.3): każda stacja deklaruje rodzaj INNY niż wynika
    // z jej rozdzielnicy — rysunek idzie za polami (1 pole ⇒ końcowa, 2 połączone ⇒ przelotowa,
    // 3 ⇒ odgałęźna, sprzęgło ⇒ sekcyjna).
    // Pola rozdzielnic: rekordy `bays` (karta W5-B — jedyny nośnik pól).
    const pola = (ref: string, role: readonly string[]) => role.map((rola, i) => ({
      ref_id: `${ref}/p${i}`, substation_ref: ref, bus_ref: `${ref}/sn`, bay_role: rola, equipment_refs: [],
    }) as never);
    const snap = buildEmptySnapshot();
    snap.substations = [
      { id: 's1', ref_id: 'ST-1', name: 'Stacja-1', tags: [], meta: {}, station_type: 'branch', bus_refs: ['ST-1/sn'], transformer_refs: [] } as never,
      { id: 's2', ref_id: 'ST-2', name: 'Stacja-2', tags: [], meta: {}, station_type: 'terminal', bus_refs: ['ST-2/sn'], transformer_refs: [] } as never,
      { id: 's3', ref_id: 'ST-3', name: 'Stacja-3', tags: [], meta: {}, station_type: 'inline', bus_refs: ['ST-3/sn'], transformer_refs: [] } as never,
      { id: 's4', ref_id: 'ST-4', name: 'Stacja-4', tags: [], meta: {}, station_type: 'mv_lv', bus_refs: ['ST-4/sn'], transformer_refs: [] } as never,
    ];
    snap.bays = [
      ...pola('ST-1', ['IN']),
      ...pola('ST-2', ['IN', 'OUT']),
      ...pola('ST-3', ['IN', 'OUT', 'FEEDER']),
      ...pola('ST-4', ['IN', 'COUPLER', 'OUT']),
    ];
    snap.branches = [
      { id: 'kabel-1-2', ref_id: 'kabel-1-2', name: 'Kabel 1-2', type: 'cable', from_bus_ref: 'ST-1/sn', to_bus_ref: 'ST-2/sn', tags: [], meta: {} } as never,
      { id: 'kabel-2-3', ref_id: 'kabel-2-3', name: 'Kabel 2-3', type: 'cable', from_bus_ref: 'ST-2/sn', to_bus_ref: 'ST-3/sn', tags: [], meta: {} } as never,
    ];
    attachMainRun(snap, ['ST-1', 'ST-2', 'ST-3', 'ST-4'], 'run-station-types');
    const r = buildSldDataFromSnapshot(snap, null);
    expect(Object.fromEntries(r.stations.map((s) => [s.id, s.topologicalType]))).toEqual({
      'ST-1': 'końcowa',
      'ST-2': 'przelotowa',
      'ST-3': 'odgałęźna',
      'ST-4': 'sekcyjna',
    });
  });

  it('stacja terenowa bez jawnych pól SN nie dostaje atrap Q01/Q02/TR', () => {
    const snap = buildEmptySnapshot();
    snap.substations = [
      { id: 'st', ref_id: 'ST-1', name: 'Stacja SN/nN 1', tags: [], meta: {}, station_type: 'inline', bus_refs: [], transformer_refs: [] } as never,
    ];
    attachMainRun(snap, ['ST-1'], 'run-no-bays');

    const r = buildSldDataFromSnapshot(snap, null);
    const station = r.stations[0];

    expect(station.snBays).toBeDefined();
    expect(station.snBays).toEqual([]);
    expect(station.hasTransformer).toBe(false);
    // Bez pól liniowych stacja jest końcowa (rodzaj z pól, nie z deklaracji `inline`).
    expect(station.topologicalType).toBe('końcowa');
  });

  it('pola SN stacji z rekordów `bays`: kolejność zapisu, rola kanoniczna, oznaczenie z roli; pola nN poza blokiem SN', () => {
    const snap = buildEmptySnapshot();
    snap.buses = [
      { id: 'bus-sn', ref_id: 'bus-sn', name: 'Szyna SN', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {}, substation_ref: 'ST-FS' } as never,
      { id: 'bus-nn', ref_id: 'bus-nn', name: 'Szyna nN', voltage_kv: 0.4, phase_system: '3ph', tags: [], meta: {}, substation_ref: 'ST-FS' } as never,
    ];
    snap.branches = [
      { id: 'sw-in', ref_id: 'sw-in', name: 'Aparat WE', type: 'breaker', from_bus_ref: 'bus-sn', to_bus_ref: 't-in', status: 'closed', tags: [], meta: {} } as never,
      { id: 'sw-out', ref_id: 'sw-out', name: 'Aparat WY', type: 'breaker', from_bus_ref: 'bus-sn', to_bus_ref: 't-out', status: 'closed', tags: [], meta: {} } as never,
      { id: 'sw-tr', ref_id: 'sw-tr', name: 'Aparat TR', type: 'breaker', from_bus_ref: 'bus-sn', to_bus_ref: 't-tr', status: 'closed', tags: [], meta: {} } as never,
    ];
    snap.transformers = [
      {
        id: 'tr-1',
        ref_id: 'tr-1',
        name: 'TR 1',
        tags: [],
        meta: {},
        hv_bus_ref: 'bus-sn',
        lv_bus_ref: 'bus-nn',
        sn_mva: 1,
        uhv_kv: 15,
        ulv_kv: 0.4,
        uk_percent: 6,
        pk_kw: 8,
        vector_group: 'Dyn11',
      } as never,
    ];
    snap.bays = [
      pole({ ref_id: 'field-in', name: 'Pole liniowe wejściowe 1', bay_role: 'IN', field_role: 'LINIA_IN', substation_ref: 'ST-FS', bus_ref: 'bus-sn', equipment_refs: ['sw-in'] }),
      pole({ ref_id: 'field-out', name: 'Pole liniowe wyjściowe 1', bay_role: 'OUT', field_role: 'LINIA_OUT', substation_ref: 'ST-FS', bus_ref: 'bus-sn', equipment_refs: ['sw-out'] }),
      // Pole nN tej samej stacji — nie jest polem bloku SN.
      pole({ ref_id: 'field-nn', name: 'Odpływ nN', bay_role: 'FEEDER', substation_ref: 'ST-FS', bus_ref: 'bus-nn' }),
      pole({ ref_id: 'field-tr', name: 'Pole transformatorowe 1', bay_role: 'TR', field_role: 'TRANSFORMATOROWE', substation_ref: 'ST-FS', bus_ref: 'bus-sn', equipment_refs: ['sw-tr'] }),
    ];
    snap.substations = [
      {
        id: 'st',
        ref_id: 'ST-FS',
        name: 'Stacja katalogowa',
        tags: [],
        meta: {},
        station_type: 'inline',
        bus_refs: ['bus-sn', 'bus-nn'],
        transformer_refs: ['tr-1'],
      } as never,
    ];
    attachMainRun(snap, ['ST-FS'], 'run-pola-stacji');

    const r = buildSldDataFromSnapshot(snap, null);
    const station = r.stations[0];
    if (!station.snBays) throw new Error('stacja inline z Bay powinna niesc snBays');

    expect(station.snBays).toHaveLength(3);
    expect(station.snBays.map((bay) => bay.designation)).toEqual(['WE', 'WY', 'TR']);
    expect(station.snBays.map((bay) => bay.fieldRole)).toEqual([
      FIELD_ROLE.RMU_LINE,
      FIELD_ROLE.RMU_LINE,
      FIELD_ROLE.RMU_TRANSFORMER,
    ]);
    expect(station.snBays.every((bay) => bay.hasMissingRequiredDevice === false)).toBe(true);
    expect(station.snBays.every((bay) => bay.cbState === 'closed')).toBe(true);
    expect(station.hasTransformer).toBe(true);
    expect(station.transformerVectorGroup).toBe('Dyn11');
    expect(station.snBays.map((bay) => bay.bayRef)).toEqual(['field-in', 'field-out', 'field-tr']);
  });

  it('oznaczenie pola bloku stacji: numer pola > krótka nazwa odpływu > skrót roli > nazwa pola (rola spoza kanonu)', () => {
    const snap = makeStationOnlySnapshot('ST-OZN');
    snap.bays = [
      pole({ ref_id: 'p-num', bay_role: 'OUT', field_role: 'LINIA_OUT', substation_ref: 'ST-OZN', bus_ref: 'bus-sn', bay_number: '7', feeder_short_name: 'SADY' }),
      pole({ ref_id: 'p-krotka', bay_role: 'OUT', field_role: 'LINIA_OUT', substation_ref: 'ST-OZN', bus_ref: 'bus-sn', feeder_short_name: 'SADY' }),
      pole({ ref_id: 'p-rola', bay_role: 'OUT', field_role: 'LINIA_ODG', substation_ref: 'ST-OZN', bus_ref: 'bus-sn' }),
      pole({ ref_id: 'p-nazwa', name: 'Pole specjalne', bay_role: 'OUT', field_role: 'NIEZNANA', substation_ref: 'ST-OZN', bus_ref: 'bus-sn' }),
    ];
    const bays = buildSldDataFromSnapshot(snap, null).stations.find((s) => s.id === 'ST-OZN')?.snBays ?? [];
    // `field_role` spoza kanonu nie zgaduje roli — spada na rolę modelu (OUT ⇒ WY).
    expect(bays.map((b) => [b.bayRef, b.designation])).toEqual([
      ['p-num', '7'],
      ['p-krotka', 'SADY'],
      ['p-rola', 'ODG'],
      ['p-nazwa', 'WY'],
    ]);
  });

  it('dodaje dedykowane pole PV do mini-rozdzielni stacji dla przyłączenia SN', () => {
    const snap = buildEmptySnapshot();
    snap.substations = [
      {
        id: 'st',
        ref_id: 'ST-PV',
        name: 'Stacja PV',
        tags: [],
        meta: {},
        station_type: 'inline',
        bus_refs: ['bus-sn'],
        transformer_refs: [],
      } as never,
    ];
    snap.bays = [
      pole({ ref_id: 'field-in', name: 'Pole WE', bay_role: 'IN', field_role: 'LINIA_IN', substation_ref: 'ST-PV', bus_ref: 'bus-sn', equipment_refs: ['sw-in'] }),
      pole({ ref_id: 'field-out', name: 'Pole WY', bay_role: 'OUT', field_role: 'LINIA_OUT', substation_ref: 'ST-PV', bus_ref: 'bus-sn', equipment_refs: ['sw-out'] }),
      pole({ ref_id: 'field-tr', name: 'Pole TR', bay_role: 'TR', field_role: 'TRANSFORMATOROWE', substation_ref: 'ST-PV', bus_ref: 'bus-sn', equipment_refs: ['sw-tr'] }),
    ];
    snap.buses = [
      { id: 'bus-sn', ref_id: 'bus-sn', name: 'Szyna SN', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {}, substation_ref: 'ST-PV' } as never,
    ];
    snap.branches = [
      { id: 'sw-in', ref_id: 'sw-in', name: 'Aparat WE', type: 'breaker', from_bus_ref: 'bus-sn', to_bus_ref: 't-in', status: 'closed', tags: [], meta: {} } as never,
      { id: 'sw-out', ref_id: 'sw-out', name: 'Aparat WY', type: 'breaker', from_bus_ref: 'bus-sn', to_bus_ref: 't-out', status: 'closed', tags: [], meta: {} } as never,
      { id: 'sw-tr', ref_id: 'sw-tr', name: 'Aparat TR', type: 'breaker', from_bus_ref: 'bus-sn', to_bus_ref: 't-tr', status: 'closed', tags: [], meta: {} } as never,
    ];
    snap.generators = [
      {
        id: 'pv-1',
        ref_id: 'gen/pv-1',
        name: 'PV 1',
        bus_ref: 'bus-sn',
        p_mw: 0.5,
        q_mvar: 0,
        gen_type: 'pv_inverter',
        station_ref: 'ST-PV',
        connection_variant: 'block_transformer',
        blocking_transformer_ref: 'tr-pv',
        catalog_ref: 'pv-cat',
        tags: [],
        meta: {},
      } as never,
    ];
    attachMainRun(snap, ['ST-PV'], 'run-pv-bay');

    const r = buildSldDataFromSnapshot(snap, null);
    const station = r.stations[0];
    if (!station.snBays) throw new Error('stacja der_station powinna niesc snBays');

    expect(station.snBays.map((bay) => bay.fieldRole)).toContain(FIELD_ROLE.DER_PV);
    expect(station.snBays.find((bay) => bay.fieldRole === FIELD_ROLE.DER_PV)?.designation).toBe('PV');
  });

  it('adapter propaguje busVoltageKv z snapshot.buses (najwyższe > 0.5 kV)', () => {
    const snap = buildEmptySnapshot();
    snap.substations = [
      { id: 'st', ref_id: 'ST-V', name: 'Stacja SN', tags: [], meta: {}, station_type: 'inline', bus_refs: ['b-sn', 'b-nn'], transformer_refs: [] } as never,
    ];
    attachMainRun(snap, ['ST-V'], 'run-voltage');
    snap.buses = [
      { id: 'b-sn', ref_id: 'b-sn', name: 'BUS-SN-15', voltage_kv: 15, phase_system: '3ph', tags: [], meta: { substation_ref: 'ST-V' }, substation_ref: 'ST-V' } as never,
      { id: 'b-nn', ref_id: 'b-nn', name: 'BUS-NN-04', voltage_kv: 0.4, phase_system: '3ph', tags: [], meta: { substation_ref: 'ST-V' }, substation_ref: 'ST-V' } as never,
    ];

    const r = buildSldDataFromSnapshot(snap, null);
    expect(r.stations[0].busVoltageKv).toBe(15);
  });

  it('adapter zwraca busVoltageKv=null gdy stacja nie ma SN buses (LV-only excluded)', () => {
    const snap = buildEmptySnapshot();
    snap.substations = [
      { id: 'st', ref_id: 'ST-LV', name: 'Stacja LV-only', tags: [], meta: {}, station_type: 'inline', bus_refs: ['b-nn'], transformer_refs: [] } as never,
    ];
    attachMainRun(snap, ['ST-LV'], 'run-lv-only');
    snap.buses = [
      { id: 'b-nn', ref_id: 'b-nn', name: 'BUS-NN', voltage_kv: 0.4, phase_system: '3ph', tags: [], meta: { substation_ref: 'ST-LV' }, substation_ref: 'ST-LV' } as never,
    ];

    const r = buildSldDataFromSnapshot(snap, null);
    expect(r.stations[0].busVoltageKv).toBeNull();
  });

  it('adapter propaguje voltageKv ciągów kabli z `from_bus` voltage_kv', () => {
    const snap = buildEmptySnapshot();
    snap.substations = [
      { id: 'g', ref_id: 'GPZ', name: 'GPZ', tags: [], meta: {}, station_type: 'gpz', bus_refs: ['b15'], transformer_refs: [] } as never,
      { id: 's', ref_id: 'ST-1', name: 'Stacja', tags: [], meta: {}, station_type: 'inline', bus_refs: ['b-tgt'], transformer_refs: [] } as never,
    ];
    snap.buses = [
      { id: 'b15', ref_id: 'b15', name: 'B-SN', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
      { id: 'b-tgt', ref_id: 'b-tgt', name: 'B-T', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
    ];
    snap.branches = [
      {
        id: 'c1', ref_id: 'c1', name: 'Cable-1', type: 'cable',
        from_bus_ref: 'b15', to_bus_ref: 'b-tgt',
        status: 'closed', length_km: 1.0, r_ohm_per_km: 0.2, x_ohm_per_km: 0.1,
        catalog_ref: 'cable-base-xlpe-al-1c-185', tags: [], meta: {},
      } as never,
    ];

    const r = buildSldDataFromSnapshot(snap, null);
    expect(r.cableRuns.length).toBeGreaterThan(0);
    // Każdy run powinien mieć voltageKv = 15 (z b15.voltage_kv)
    for (const run of r.cableRuns) {
      expect(run.voltageKv).toBe(15);
    }
  });

  it('voltageKv=null gdy from_bus.voltage_kv niedostępne', () => {
    const snap = buildEmptySnapshot();
    snap.substations = [
      { id: 'g', ref_id: 'GPZ', name: 'GPZ', tags: [], meta: {}, station_type: 'gpz', bus_refs: ['b-empty'], transformer_refs: [] } as never,
      { id: 's', ref_id: 'ST-1', name: 'Stacja', tags: [], meta: {}, station_type: 'inline', bus_refs: ['b-tgt2'], transformer_refs: [] } as never,
    ];
    snap.buses = [
      // No voltage_kv on either bus
      { id: 'b-empty', ref_id: 'b-empty', name: 'B', phase_system: '3ph', tags: [], meta: {} } as never,
      { id: 'b-tgt2', ref_id: 'b-tgt2', name: 'BT', phase_system: '3ph', tags: [], meta: {} } as never,
    ];
    snap.branches = [
      {
        id: 'c2', ref_id: 'c2', name: 'Cable-2', type: 'cable',
        from_bus_ref: 'b-empty', to_bus_ref: 'b-tgt2',
        status: 'closed', length_km: 0.5, r_ohm_per_km: 0.2, x_ohm_per_km: 0.1,
        tags: [], meta: {},
      } as never,
    ];

    const r = buildSldDataFromSnapshot(snap, null);
    for (const run of r.cableRuns) {
      expect(run.voltageKv).toBeNull();
    }
  });

  it('PV po stronie nN nie tworzy pola źródłowego SN ani nie zmienia układu SN stacji', () => {
    const snap = buildEmptySnapshot();
    snap.substations = [
      { id: 'st', ref_id: 'ST-PV', name: 'Stacja PV', tags: [], meta: {}, station_type: 'inline', bus_refs: ['bus-nn'], transformer_refs: ['tr-1'] } as never,
    ];
    attachMainRun(snap, ['ST-PV'], 'run-pv-nn');
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

    // Stacja bez pól liniowych ⇒ układ końcowy (rodzaj z pól); DER po stronie nN nie zmienia
    // układu SN.
    expect(station.topologicalType).toBe('końcowa');
    expect(
      (station.snBays ?? []).filter((bay) =>
        [FIELD_ROLE.DER_PV, FIELD_ROLE.DER_BESS, FIELD_ROLE.DER_FW, FIELD_ROLE.DER_UNKNOWN].includes(
          bay.fieldRole as never,
        ),
      ),
    ).toEqual([]);
    // Zero fabrykacji (B-02): bez rekordów odbiorów nN brak agregatu odbioru nN (nie
    // „odpływ, bo jest DER").
    expect(station.aggregatedLvLoad).toBeNull();
  });

  it('DER z transformatorem blokowym nie powiększa transformatora stacji i jest źródłem rysunku', () => {
    const snap = buildEmptySnapshot();
    snap.substations = [
      { id: 'st', ref_id: 'ST-PV', name: 'Stacja PV', tags: [], meta: {}, station_type: 'inline', bus_refs: ['bus-sn', 'bus-nn'], transformer_refs: ['tr-1'] } as never,
    ];
    snap.transformers = [
      { id: 'tr-1', ref_id: 'tr-1', name: 'TR stacji', hv_bus_ref: 'bus-sn', lv_bus_ref: 'bus-nn', sn_mva: 0.25, uhv_kv: 15, ulv_kv: 0.4, tags: [], meta: {} } as never,
      { id: 'tr-pv', ref_id: 'tr-pv', name: 'TR blokowy PV', hv_bus_ref: 'bus-sn', lv_bus_ref: 'bus-pv', sn_mva: 1.25, uhv_kv: 15, ulv_kv: 0.69, tags: [], meta: {} } as never,
    ];
    attachMainRun(snap, ['ST-PV'], 'run-pv-block');
    snap.generators = [
      { id: 'pv-nn', ref_id: 'PV-NN', name: 'PV nN', tags: [], meta: {}, bus_ref: 'bus-nn', p_mw: 0.185, q_mvar: 0, gen_type: 'pv_inverter', station_ref: 'ST-PV', connection_variant: 'nn_side' } as never,
      { id: 'pv-block', ref_id: 'PV-BLOCK', name: 'PV blokowy', tags: [], meta: {}, bus_ref: 'bus-pv', p_mw: 1.0, q_mvar: 0, gen_type: 'pv_inverter', station_ref: 'ST-PV', connection_variant: 'block_transformer', blocking_transformer_ref: 'tr-pv' } as never,
    ];

    const r = buildSldDataFromSnapshot(snap, null);

    expect(r.stations[0].transformerRatedKva).toBe(250);
    expect(r.stations[0].transformerUnits?.map((u) => u.ref)).toEqual(['tr-1']);
    expect(r.sources.find((zrodlo) => zrodlo.id === 'PV-BLOCK')).toMatchObject({ kind: 'pv', ratedPower: 1 });
  });

  // Kontrola mocy transformatora wobec źródeł to JEDNA reguła backendu (decyzja O-53,
  // `domain/generator_validation.py` `sprawdz_moc_transformatora`, kod
  // `converter.transformer_capacity_exceeded`). Dawny alarm adaptera liczył drugą, rozbieżną
  // regułę we froncie (stałe cosφ 0,9, bez k_j i k_obc) — skasowany.
  it('adapter nie wystawia własnej oceny mocy transformatora stacji, nawet przy przekroczeniu', () => {
    const snap = buildEmptySnapshot();
    snap.substations = [
      { id: 'st', ref_id: 'ST-PV', name: 'Stacja PV', tags: [], meta: {}, station_type: 'inline', bus_refs: ['bus-nn'], transformer_refs: ['tr-1'] } as never,
    ];
    snap.transformers = [
      { id: 'tr-1', ref_id: 'tr-1', name: 'TR stacji', hv_bus_ref: 'bus-sn', lv_bus_ref: 'bus-nn', sn_mva: 0.25, uhv_kv: 15, ulv_kv: 0.4, tags: [], meta: {} } as never,
    ];
    attachMainRun(snap, ['ST-PV'], 'run-pv-overload');
    snap.generators = [
      { id: 'pv-nn', ref_id: 'PV-NN', name: 'PV nN', tags: [], meta: {}, bus_ref: 'bus-nn', p_mw: 0.5, q_mvar: 0, gen_type: 'pv_inverter', station_ref: 'ST-PV', connection_variant: 'nn_side' } as never,
    ];

    const r = buildSldDataFromSnapshot(snap, null);

    expect(Object.keys(r.stations[0])).not.toContain('alarmSeverity');
    expect(r.stations[0].transformerRatedKva).toBe(250);
  });

  it.each([
    ['station_ref', { station_ref: 'ST-PV' }, {}],
    ['meta.station_ref', {}, { station_ref: 'ST-PV' }],
  ] as const)('PV na dedykowanym przyłączu SN przypisany do stacji przez %s daje pole źródłowe stacji', (_nosnik, przypisanie, meta) => {
    const snap = buildEmptySnapshot();
    snap.substations = [
      { id: 'st', ref_id: 'ST-PV', name: 'Stacja PV', tags: [], meta: {}, station_type: 'inline', bus_refs: ['bus-nn'], transformer_refs: ['tr-1'] } as never,
    ];
    attachMainRun(snap, ['ST-PV'], 'run-pv-meta');
    snap.generators = [
      {
        id: 'pv1',
        ref_id: 'PV-1',
        name: 'PV Galeria',
        tags: [],
        meta,
        bus_ref: 'bus-nn',
        p_mw: 0.5,
        q_mvar: 0,
        gen_type: 'pv_inverter',
        connection_variant: 'DEDICATED_MV_CONNECTION',
        catalog_ref: 'PV-TYP',
        ...przypisanie,
      } as never,
    ];

    const r = buildSldDataFromSnapshot(snap, null);

    // Jeden nośnik przypisania wytwórcy do stacji (`station_ref`, a gdy brak —
    // `meta.station_ref`) dla pól źródłowych SN stacji.
    expect(
      (r.stations[0].snBays ?? [])
        .filter((bay) => bay.fieldRole === FIELD_ROLE.DER_PV)
        .map((bay) => bay.bayRef),
    ).toEqual(['ST-PV/der-bay/PV-1']);
  });

  it('odcinek SN z pola GPZ: ciąg z odcinkiem, terminale z ENM i etykieta katalogowa', () => {
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

    expect(r.cableRuns.map((run) => run.id)).toEqual(['run-1']);
    expect(r.cableRuns[0].segmentRefs).toEqual(['SEG-1']);
    // §16: terminale odcinka z gałęzi ENM; szyna GPZ należy do GPZ (lustro `szynyStacji`).
    // K2b §0.4: rodzaj odcinka z `Branch.type` (kabel ciągły, linia napowietrzna przerywana).
    expect(r.cableRuns[0].segmentPaths).toEqual([
      {
        segmentRef: 'SEG-1',
        segmentKind: 'cable_sn',
        fromTerminal: { busRef: 'b15', ownerRef: 'GPZ-1' },
        toTerminal: { busRef: 'B2', ownerRef: null },
      },
    ]);
    expect(r.cableRuns[0].label).toBe('XRUHAKXS 120/25 · 500 m');
    expect(r.cableRuns[0].segmentLabels?.[0]?.text).toBe('XRUHAKXS 120/25 · 500 m');
  });

  it('etykiety odcinków dotyczą wyłącznie realnych odcinków ciągu (bez wpisów zastępczych pola i napięcia)', () => {
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

    // GPZ-PARYTET cz. 3: dawne wpisy `feeder-origin-*` / `voltage-kv-*` niosły refy
    // nieistniejących odcinków (scena v3 szuka etykiety po refie odcinka — nikt ich nie
    // czytał). Oznaczenie pola (`bay_number`) rysuje pole GPZ, napięcie niesie `voltageKv`.
    expect(cableRun.segmentLabels?.map((label) => label.segmentRef)).toEqual(['SEG-1']);
    expect(cableRun.segmentLabels?.map((label) => label.text)).toEqual(['XRUHAKXS 120/25 · 500 m']);
    expect(cableRun.voltageKv).toBe(15);
  });

  it('odcinek bez line_runs: osobny ciąg gałęzi z etykietą katalogową', () => {
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

    expect(r.cableRuns.map((run) => [run.id, run.runKind, run.segmentRefs])).toEqual([
      ['SEG-1', 'main_trunk', ['SEG-1']],
    ]);
    expect(r.cableRuns[0].label).toBe('XRUHAKXS 120/25 · 500 m');
  });

  it('odcinek bez stacji końcowej: koniec bez właściciela, opis z parametrów kabla', () => {
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

    expect(r.cableRuns[0].label).toBe('XRUHAKXS 120/25 · 500 m');
    expect(r.cableRuns[0].segmentPaths?.[0]?.toTerminal).toEqual({ busRef: 'B2', ownerRef: null });
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

    // Każdy odcinek ma własną etykietę (różne długości) i własną krawędź terminal-to-terminal.
    expect(run.segmentLabels?.map((label) => [label.segmentRef, label.text])).toEqual([
      ['SEG-1', 'XRUHAKXS 120/25 · 210 m'],
      ['SEG-2', 'XRUHAKXS 120/25 · 230 m'],
      ['SEG-3', 'XRUHAKXS 120/25 · 180 m'],
    ]);
    expect(run.segmentPaths?.map((sp) => [sp.segmentRef, sp.fromTerminal?.busRef, sp.toTerminal?.busRef])).toEqual([
      ['SEG-1', 'b15', 'B2'],
      ['SEG-2', 'B2', 'B3'],
      ['SEG-3', 'B3', 'B4'],
    ]);
    expect(run.voltageKv).toBe(15);
  });

  it('ciąg kablowy przez stacje: kolejność stacji, etykiety odcinków i ciągłość terminali', () => {
    const snap = buildEmptySnapshot();
    snap.substations = [
      // Karta ETYKIETA-STACJI-PRZELOTOWEJ: rodzaj z topologii — Stacja 1 na szynie B2 między
      // odcinkami, z kablem od szyny innej stacji (B1, „Stacja 0") i do Stacji 2 (B3), z polami
      // WE i WY ⇒ przelotowa; dawniej z deklaracji `inline` na stacji bez pól i szyn.
      { id: 's0', ref_id: 'ST-0', name: 'Stacja 0', tags: [], meta: {}, station_type: 'mv_lv', bus_refs: ['B1'], transformer_refs: [] } as never,
      {
        id: 's1', ref_id: 'ST-1', name: 'Stacja 1', tags: [], station_type: 'inline', bus_refs: ['B2'], transformer_refs: [], meta: {},
      } as never,
      { id: 's2', ref_id: 'ST-2', name: 'Stacja 2', tags: [], meta: {}, station_type: 'terminal', bus_refs: ['B3'], transformer_refs: [] } as never,
    ];
    // Pola WE i WY Stacji 1: rekordy `bays` (karta W5-B — jedyny nośnik pól).
    snap.bays = [
      { ref_id: 'ST-1/in', substation_ref: 'ST-1', bus_ref: 'B2', bay_role: 'IN', equipment_refs: [] } as never,
      { ref_id: 'ST-1/out', substation_ref: 'ST-1', bus_ref: 'B2', bay_role: 'OUT', equipment_refs: [] } as never,
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
    expect(r.cableRuns[0].label).toBe('różne typy katalogowe · 1,2 km');
    expect(r.cableRuns[0].segmentLabels?.map((label) => label.text)).toEqual([
      'XRUHAKXS 120/25 · 500 m',
      'XRUHAKXS 70/25 · 700 m',
    ]);
    expect(r.cableRuns[0].segmentPaths?.map((segmentPath) => segmentPath.segmentRef)).toEqual([
      'SEG-1',
      'SEG-2',
    ]);
    // Krawędzie terminal-to-terminal: koniec odcinka 1 i początek odcinka 2 to szyna
    // Stacji 1 (B2), więc ciąg przechodzi PRZEZ stację, a nie obok niej.
    expect(r.cableRuns[0].segmentPaths?.map((sp) => [sp.fromTerminal, sp.toTerminal])).toEqual([
      [{ busRef: 'B1', ownerRef: 'ST-0' }, { busRef: 'B2', ownerRef: 'ST-1' }],
      [{ busRef: 'B2', ownerRef: 'ST-1' }, { busRef: 'B3', ownerRef: 'ST-2' }],
    ]);
  });

  it('syntetyczny ciąg SN przechodzi przez kolejną szynę SN stacji, gdy from/to używa aliasów', () => {
    const snap = buildEmptySnapshot();
    snap.buses = [
      { id: 'g-bus', ref_id: 'gpz/1/section/001/bus_sn', name: 'Szyna GPZ', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
      { id: 's1-in', ref_id: 'stn/a/sn_in', name: 'S1 in', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
      { id: 's1-out', ref_id: 'stn/a/sn_out', name: 'S1 out', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
      { id: 's2-in', ref_id: 'stn/b/sn_in', name: 'S2 in', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
    ];
    snap.substations = [
      {
        id: 'gpz', ref_id: 'gpz/1/station', name: 'GPZ', tags: [], meta: {},
        station_type: 'gpz', bus_refs: ['gpz/1/section/001/bus_sn'], transformer_refs: [],
      } as never,
      {
        id: 's1', ref_id: 'stn/a/station', name: 'Stacja 1', tags: [], meta: {},
        station_type: 'inline', bus_refs: ['stn/a/sn_in', 'stn/a/sn_out'], transformer_refs: [],
      } as never,
      {
        id: 's2', ref_id: 'stn/b/station', name: 'Stacja 2', tags: [], meta: {},
        station_type: 'terminal', bus_refs: ['stn/b/sn_in'], transformer_refs: [],
      } as never,
    ];
    snap.branches = [
      {
        id: 'seg-1',
        ref_id: 'SEG-ALIAS-1',
        name: 'Kabel GPZ-S1',
        type: 'cable',
        from_bus_ref: 'gpz/1/section/001/bus_sn',
        to_bus_ref: 'stn/a/sn_in',
        catalog_ref: 'YAKXS 3X120',
        length_km: 0.1,
        tags: [],
        meta: {},
      } as never,
      {
        id: 'seg-2',
        ref_id: 'SEG-ALIAS-2',
        name: 'Kabel S1-S2',
        type: 'cable',
        from_bus_ref: 'stn/a/sn_out',
        to_bus_ref: 'stn/b/sn_in',
        catalog_ref: 'YAKXS 3X120',
        length_km: 0.2,
        tags: [],
        meta: {},
      } as never,
    ];

    const r = buildSldDataFromSnapshot(snap, null);

    expect(r.stations.map((station) => station.id)).toEqual(['stn/a/station', 'stn/b/station']);
    expect(r.cableRuns).toHaveLength(1);
    expect(r.cableRuns[0].segmentRefs).toEqual(['SEG-ALIAS-1', 'SEG-ALIAS-2']);
    expect(r.cableRuns[0].segmentPaths).toHaveLength(2);
    expect(r.cableRuns[0].segmentPaths?.map((sp) => sp.toTerminal?.ownerRef)).toEqual(['stn/a/station', 'stn/b/station']);
  });
});

describe('enmToSldAdapter line run merge', () => {
  it('jawny line_run rozszerza sie o dalszy realny odcinek SN z ENM', () => {
    const snap = buildEmptySnapshot();
    snap.buses = [
      { id: 'gpz-bus', ref_id: 'gpz/a/section/001/bus_sn', name: 'SN GPZ', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
      { id: 'st-a-bus', ref_id: 'stn/a/sn_bus', name: 'SN A', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
      { id: 'st-b-bus', ref_id: 'stn/b/sn_bus', name: 'SN B', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
    ];
    snap.substations = [
      { id: 'gpz', ref_id: 'gpz/a/substation', name: 'GPZ', tags: [], meta: {}, station_type: 'gpz', bus_refs: ['gpz/a/section/001/bus_sn'], transformer_refs: [], gpz_sections: [{ section_id: 'A', order: 1, bus_ref: 'gpz/a/section/001/bus_sn' }] } as never,
      { id: 'st-a', ref_id: 'stn/a/station', name: 'Stacja A', tags: [], meta: {}, station_type: 'inline', bus_refs: ['stn/a/sn_bus'], transformer_refs: [] } as never,
      { id: 'st-b', ref_id: 'stn/b/station', name: 'Stacja B', tags: [], meta: {}, station_type: 'terminal', bus_refs: ['stn/b/sn_bus'], transformer_refs: [] } as never,
    ];
    snap.branches = [
      { id: 'seg-1', ref_id: 'seg/1', name: 'Odcinek 1', type: 'cable', from_bus_ref: 'gpz/a/section/001/bus_sn', to_bus_ref: 'stn/a/sn_bus', catalog_ref: 'cable-base-epr-al-1c-150', length_km: 0.8, tags: [], meta: {} } as never,
      { id: 'seg-2', ref_id: 'seg/2', name: 'Odcinek 2', type: 'cable', from_bus_ref: 'stn/a/sn_bus', to_bus_ref: 'stn/b/sn_bus', catalog_ref: 'cable-base-epr-al-1c-150', length_km: 0.6, tags: [], meta: {} } as never,
    ];
    snap.line_runs = [
      {
        id: 'run-1',
        run_kind: 'main_trunk',
        starting_bay_ref: 'bay-1',
        starting_port_ref: 'port-1',
        segments: [{ segment_ref: 'seg/1', order: 1 }],
        stations: [{ substation_ref: 'stn/a/station', order: 1 }],
      },
    ];

    const result = buildSldDataFromSnapshot(snap, null);
    const stationA = result.stations.find((station) => station.id === 'stn/a/station');
    const stationB = result.stations.find((station) => station.id === 'stn/b/station');

    expect(result.cableRuns).toHaveLength(1);
    expect(result.cableRuns[0].segmentRefs).toEqual(['seg/1', 'seg/2']);
    expect(stationA).toBeDefined();
    expect(stationB).toBeDefined();
    expect(result.stations.map((station) => station.id)).toEqual(['stn/a/station', 'stn/b/station']);
  });

  it('korytarz z samymi segmentami wyprowadza stacje z terminali odcinkow SN', () => {
    const snap = buildEmptySnapshot();
    snap.buses = [
      { id: 'gpz-bus', ref_id: 'gpz/c/section/001/bus_sn', name: 'SN GPZ', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
      { id: 'st-1-bus', ref_id: 'stn/c1/sn_bus', name: 'SN 1', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
      { id: 'st-2-bus', ref_id: 'stn/c2/sn_bus', name: 'SN 2', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
      { id: 'st-3-bus', ref_id: 'stn/c3/sn_bus', name: 'SN 3', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
    ];
    snap.substations = [
      { id: 'gpz', ref_id: 'gpz/c/substation', name: 'GPZ', tags: [], meta: {}, station_type: 'gpz', bus_refs: ['gpz/c/section/001/bus_sn'], transformer_refs: [], gpz_sections: [{ section_id: 'A', order: 1, bus_ref: 'gpz/c/section/001/bus_sn' }] } as never,
      { id: 'st-1', ref_id: 'stn/c1/station', name: 'Stacja 1', tags: [], meta: {}, station_type: 'inline', bus_refs: ['stn/c1/sn_bus'], transformer_refs: [] } as never,
      { id: 'st-2', ref_id: 'stn/c2/station', name: 'Stacja 2', tags: [], meta: {}, station_type: 'inline', bus_refs: ['stn/c2/sn_bus'], transformer_refs: [] } as never,
      { id: 'st-3', ref_id: 'stn/c3/station', name: 'Stacja 3', tags: [], meta: {}, station_type: 'terminal', bus_refs: ['stn/c3/sn_bus'], transformer_refs: [] } as never,
    ];
    snap.branches = [
      { id: 'seg-1', ref_id: 'seg/c1', name: 'Odcinek 1', type: 'cable', from_bus_ref: 'gpz/c/section/001/bus_sn', to_bus_ref: 'stn/c1/sn_bus', catalog_ref: 'YAKXS 3X120', length_km: 0.1, tags: [], meta: {} } as never,
      { id: 'seg-2', ref_id: 'seg/c2', name: 'Odcinek 2', type: 'cable', from_bus_ref: 'stn/c1/sn_bus', to_bus_ref: 'stn/c2/sn_bus', catalog_ref: 'YAKXS 3X120', length_km: 0.1, tags: [], meta: {} } as never,
      { id: 'seg-3', ref_id: 'seg/c3', name: 'Odcinek 3', type: 'cable', from_bus_ref: 'stn/c2/sn_bus', to_bus_ref: 'stn/c3/sn_bus', catalog_ref: 'YAKXS 3X120', length_km: 0.1, tags: [], meta: {} } as never,
    ];
    snap.corridors = [
      {
        id: 'corridor-1',
        ref_id: 'corridor-1',
        name: 'Magistrala SN',
        tags: [],
        meta: {},
        corridor_type: 'radial',
        ordered_segment_refs: ['seg/c1', 'seg/c2', 'seg/c3'],
      } as never,
    ];

    const result = buildSldDataFromSnapshot(snap, null);

    expect(result.cableRuns).toHaveLength(1);
    expect(result.cableRuns[0].segmentRefs).toEqual(['seg/c1', 'seg/c2', 'seg/c3']);
    expect(result.stations.map((station) => station.id)).toEqual([
      'stn/c1/station',
      'stn/c2/station',
      'stn/c3/station',
    ]);
  });
});

// =============================================================================
// Phase 0B-4: LineRun.stations[] consumed by adapter (PARTIAL → RESOLVED)
// =============================================================================

describe('buildStations — konsumuje line_runs.stations[] z explicit order', () => {
  it('Stacje w line_runs.stations[] sortowane po order', () => {
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
  });

  it('Wiele line_runs → stacje w kolejności ciągów posortowanych po lineRun.id', () => {
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
    /* Sortowanie line_runs po id: run-A (idx=0) → run-Z (idx=1). */
    expect(r.stations.map((s) => s.id)).toEqual(['ST-A1', 'ST-B1']);
  });

  it('Stacje NIE wymienione w line_runs → nie są renderowane jako orphan grid', () => {
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
    expect(r.stations).toHaveLength(1);
    const inRun = r.stations.find((s) => s.id === 'ST-IN-RUN');
    const orphan = r.stations.find((s) => s.id === 'ST-ORPHAN');
    expect(inRun).toBeDefined();
    expect(orphan).toBeUndefined();
  });

  it('Brak line_runs (legacy ENM) → stacje bez ciągu nie trafiają do widoku', () => {
    const snap = buildEmptySnapshot();
    snap.substations = [
      { id: 's1', ref_id: 'ST-1', name: 'A', tags: [], meta: {}, station_type: 'inline', bus_refs: [], transformer_refs: [] } as never,
      { id: 's2', ref_id: 'ST-2', name: 'B', tags: [], meta: {}, station_type: 'inline', bus_refs: [], transformer_refs: [] } as never,
    ];
    const r = buildSldDataFromSnapshot(snap, null);
    expect(r.stations).toHaveLength(0);
  });

  it('nie generuje sztucznych odcinkow SN dla stacji bez jawnych segmentow', () => {
    const snap = buildEmptySnapshot();
    snap.substations = [
      { id: 's1', ref_id: 'ST-1', name: 'Stacja 1', tags: [], meta: {}, station_type: 'inline', bus_refs: [], transformer_refs: [] } as never,
      { id: 's2', ref_id: 'ST-2', name: 'Stacja 2', tags: [], meta: {}, station_type: 'branch', bus_refs: [], transformer_refs: [] } as never,
      { id: 's3', ref_id: 'ST-3', name: 'Stacja 3', tags: [], meta: {}, station_type: 'terminal', bus_refs: [], transformer_refs: [] } as never,
    ];

    const r = buildSldDataFromSnapshot(snap, null);

    expect(r.stations).toHaveLength(0);
    expect(r.cableRuns).toEqual([]);
    expect(JSON.stringify(r)).not.toContain('Brak odcinka SN');
    expect(JSON.stringify(r)).not.toContain('topology-guide');
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

  // W5-C: stacja NOP wynika z POZYCJI NORMALNEJ łącznika pola stacji
  // (`SwitchBranch.normal_state`), jedynego źródła punktu podziału. Iloczyn: pozycja normalna
  // łącznika pola {open, closed, niezadeklarowana} × rodzaj aparatu {switch, fuse} × dawna
  // kopia `line_runs[].nop_station_ref` {brak, wskazuje stację} — kopia NIE wpływa na wynik.
  describe('stacja punktu podziału z pozycji normalnej łącznika pola', () => {
    const przypadki: Array<[string, 'open' | 'closed' | null, 'switch' | 'fuse', boolean]> = [];
    for (const normal of ['open', 'closed', null] as const) {
      for (const typ of ['switch', 'fuse'] as const) {
        for (const kopia of [false, true]) {
          przypadki.push([`${typ} normal=${String(normal)} kopia=${kopia}`, normal, typ, kopia]);
        }
      }
    }
    it.each(przypadki)('%s', (_opis, normal, typ, kopia) => {
      const snap = buildEmptySnapshot();
      snap.substations = [
        { id: 's1', ref_id: 'ST-NOP', name: 'Stacja NOP', tags: [], meta: {}, station_type: 'sectional', bus_refs: ['b-nop'], transformer_refs: [] } as never,
        { id: 's2', ref_id: 'ST-REG', name: 'Stacja regularna', tags: [], meta: {}, station_type: 'inline', bus_refs: ['b-reg'], transformer_refs: [] } as never,
      ];
      snap.buses = [
        { id: 'b-nop', ref_id: 'b-nop', name: 'Szyna NOP', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
        { id: 'b-nop-l', ref_id: 'b-nop-l', name: 'Wyjście NOP', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
        { id: 'b-reg', ref_id: 'b-reg', name: 'Szyna REG', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
      ];
      snap.branches = [
        {
          id: 'sw-pola', ref_id: 'sw-pola', name: 'Łącznik pola', tags: [], meta: {},
          type: typ, from_bus_ref: 'b-nop', to_bus_ref: 'b-nop-l', status: 'closed',
          ...(typ === 'switch' && normal !== null ? { normal_state: normal } : {}),
        } as never,
      ];
      snap.bays = [
        pole({ ref_id: 'bay-nop', bay_role: 'OUT', bus_ref: 'b-nop', substation_ref: 'ST-NOP', equipment_refs: ['sw-pola'] }),
      ];
      snap.line_runs = [
        {
          id: 'run-1', run_kind: 'main_trunk',
          starting_bay_ref: 'bay-1', starting_port_ref: 'port-1',
          segments: [],
          ...(kopia ? { nop_station_ref: 'ST-REG' } : {}),
          stations: [
            { substation_ref: 'ST-NOP', order: 2 },
            { substation_ref: 'ST-REG', order: 1 },
          ],
        } as never,
      ];
      const r = buildSldDataFromSnapshot(snap, null);
      const nopStation = r.stations.find((s) => s.id === 'ST-NOP');
      const regStation = r.stations.find((s) => s.id === 'ST-REG');
      const oczekiwanyNop = typ === 'switch' && normal === 'open';
      expect(nopStation?.isNop === true).toBe(oczekiwanyNop);
      // Dawna kopia nigdy nie oznacza stacji (nie ma łącznika z pozycją normalną open).
      expect(regStation?.isNop).toBeUndefined();
    });
  });

  it('transformer.sn_mva → transformerRatedKva [kVA] na stacji (Projektant moc znamionowa)', () => {
    const snap = buildEmptySnapshot();
    snap.buses = [
      { id: 'b-mv', ref_id: 'b-mv', name: 'MV', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
      { id: 'b-lv', ref_id: 'b-lv', name: 'LV', voltage_kv: 0.4, phase_system: '3ph', tags: [], meta: {} } as never,
    ];
    snap.substations = [
      {
        id: 's1', ref_id: 'ST-1', name: 'ST-1', tags: [], meta: {},
        station_type: 'inline', bus_refs: ['b-mv', 'b-lv'], transformer_refs: ['TR-1'],
      } as never,
    ];
    snap.transformers = [
      {
        id: 't1', ref_id: 'TR-1', name: 'TR-1', tags: [], meta: {},
        hv_bus_ref: 'b-mv', lv_bus_ref: 'b-lv',
        sn_mva: 0.63, uhv_kv: 15, ulv_kv: 0.4, uk_percent: 6, pk_kw: 5,
      } as never,
    ];
    snap.line_runs = [
      {
        id: 'run-1', run_kind: 'main_trunk',
        starting_bay_ref: 'bay-1', starting_port_ref: 'port-1',
        segments: [],
        stations: [{ substation_ref: 'ST-1', order: 1 }],
      },
    ];
    const r = buildSldDataFromSnapshot(snap, null);
    const station = r.stations.find((s) => s.id === 'ST-1');
    expect(station?.transformerRatedKva).toBe(630);
  });

  it('brak transformatora → transformerRatedKva=null', () => {
    const snap = buildEmptySnapshot();
    snap.substations = [
      { id: 's1', ref_id: 'ST-1', name: 'ST-1', tags: [], meta: {}, station_type: 'inline', bus_refs: [], transformer_refs: [] } as never,
    ];
    snap.line_runs = [
      {
        id: 'run-1', run_kind: 'main_trunk',
        starting_bay_ref: 'bay-1', starting_port_ref: 'port-1',
        segments: [],
        stations: [{ substation_ref: 'ST-1', order: 1 }],
      },
    ];
    const r = buildSldDataFromSnapshot(snap, null);
    const station = r.stations.find((s) => s.id === 'ST-1');
    expect(station?.transformerRatedKva).toBeNull();
  });

  // K30 audit loop: synthetic snapshot z 30 stacji + 2 GPZ + 2 line_runs (A/B)
  // weryfikuje że adapter skaluje się do K30 bez backendu (no-op safety net).
  it('synthetic: 30 stations + 2 GPZ + 2 line_runs → 32 stations, 2 lineRuns, cumulative km', () => {
    const snap = buildEmptySnapshot();
    // 2 GPZ
    snap.substations = [
      { id: 'gpz-a', ref_id: 'GPZ-A', name: 'GPZ-A Główny', tags: [], meta: {}, station_type: 'gpz', bus_refs: ['busA'], transformer_refs: [], gpz_sections: [{ section_id: 'A', order: 1, bus_ref: 'busA' }] } as never,
      { id: 'gpz-b', ref_id: 'GPZ-B', name: 'GPZ-B Backup', tags: [], meta: {}, station_type: 'gpz', bus_refs: ['busB'], transformer_refs: [], gpz_sections: [{ section_id: 'B', order: 1, bus_ref: 'busB' }] } as never,
    ];
    snap.buses = [
      { id: 'busA', ref_id: 'busA', name: 'SN A', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
      { id: 'busB', ref_id: 'busB', name: 'SN B', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
    ];
    // 30 inline stations (15 na A, 15 na B) z transformerami sn_mva=0.4 (400 kVA)
    for (let i = 2; i <= 31; i++) {
      const id = `S${i.toString().padStart(2, '0')}`;
      const trId = `TR-${id}`;
      snap.substations.push({
        id, ref_id: id, name: `Stacja ${id}`, tags: [],
        // Karta ETYKIETA-STACJI-PRZELOTOWEJ: S28 jest sekcyjna, bo MA sprzęgło w rozdzielnicy
        // (rodzaj z pól — rekordy `bays` niżej, karta W5-B), a nie dlatego, że tak ją zadeklarowano.
        meta: {},
        station_type: i === 28 ? 'sectional' : 'inline',
        bus_refs: [], transformer_refs: [trId],
      } as never);
      if (i === 28) {
        (snap.bays as never[]).push(
          { ref_id: `${id}/in`, substation_ref: id, bus_ref: `${id}/sn`, bay_role: 'IN', equipment_refs: [] } as never,
          { ref_id: `${id}/sp`, substation_ref: id, bus_ref: `${id}/sn`, bay_role: 'COUPLER', equipment_refs: [] } as never,
        );
      }
      (snap.transformers as never[]).push({
        id: `tr${i}`, ref_id: trId, name: trId, tags: [], meta: {},
        hv_bus_ref: 'busA', lv_bus_ref: `${id}-lv`,
        sn_mva: 0.4, uhv_kv: 15, ulv_kv: 0.4, uk_percent: 6, pk_kw: 5,
      } as never);
    }
    // 2 line_runs: A trunk (15 stations) + B trunk (15 stations)
    const stationsA = [];
    const stationsB = [];
    for (let i = 2; i <= 16; i++) {
      stationsA.push({ substation_ref: `S${i.toString().padStart(2, '0')}`, order: i - 1 });
    }
    for (let i = 17; i <= 31; i++) {
      stationsB.push({ substation_ref: `S${i.toString().padStart(2, '0')}`, order: i - 16 });
    }
    snap.line_runs = [
      { id: 'run-a', run_kind: 'main_trunk', starting_bay_ref: 'bay-a', starting_port_ref: 'port-a', segments: [], stations: stationsA },
      { id: 'run-b', run_kind: 'main_trunk', starting_bay_ref: 'bay-b', starting_port_ref: 'port-b', segments: [], stations: stationsB },
    ];

    const r = buildSldDataFromSnapshot(snap, null);

    // 32 stations total (30 field + 2 GPZ, ale buildStations zwraca tylko field stations)
    expect(r.stations.length).toBe(30);
    // 2 GPZ widoczne w gpzs[]
    expect(r.gpzs.length).toBe(2);
    expect(r.gpzs.map((g) => g.id).sort()).toEqual(['GPZ-A', 'GPZ-B']);
    // 2 line_runs widoczne w cableRuns[]
    expect(r.cableRuns.length).toBe(2);
    expect(r.cableRuns.map((c) => c.id).sort()).toEqual(['run-a', 'run-b']);
    expect(r.stations.find((s) => s.id === 'S17')?.stationCode).toBe('S17');
    // S28 sectional rozpoznany
    const s28 = r.stations.find((s) => s.id === 'S28');
    expect(s28?.topologicalType).toBe('sekcyjna');
    // Wszystkie stacje mają transformerRatedKva=400 (z sn_mva=0.4)
    const allHaveKva = r.stations.every((s) => s.transformerRatedKva === 400);
    expect(allHaveKva).toBe(true);
  });

  // K30 audit loop: weryfikacja że adapter syntezuje main_trunk z łańcucha
  // branches gdy brak jawnych line_runs (K30 live seed case).
  it('synthetic: 5 cables w łańcuchu GPZ→S2→S3→S4→S5 bez line_runs → 1 syntetyczny main_trunk', () => {
    const snap = buildEmptySnapshot();
    snap.buses = [
      { id: 'gpz_bus', ref_id: 'gpz/abc/section/001/bus_sn', name: 'GPZ Sec1', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
      { id: 's2_bus', ref_id: 'stn/aa1/sn_bus', name: 'S2', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
      { id: 's3_bus', ref_id: 'stn/aa2/sn_bus', name: 'S3', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
      { id: 's4_bus', ref_id: 'stn/aa3/sn_bus', name: 'S4', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
      { id: 's5_bus', ref_id: 'stn/aa4/sn_bus', name: 'S5', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
    ];
    snap.substations = [
      { id: 'gpz', ref_id: 'gpz/abc/substation', name: 'GPZ Główny', tags: [], meta: {}, station_type: 'gpz', bus_refs: ['gpz/abc/section/001/bus_sn'], transformer_refs: [], gpz_sections: [{ section_id: 'A', order: 1, bus_ref: 'gpz/abc/section/001/bus_sn' }] } as never,
      { id: 's2', ref_id: 'stn/aa1/station', name: 'S2', tags: [], meta: {}, station_type: 'inline', bus_refs: ['stn/aa1/sn_bus'], transformer_refs: [] } as never,
      { id: 's3', ref_id: 'stn/aa2/station', name: 'S3', tags: [], meta: {}, station_type: 'inline', bus_refs: ['stn/aa2/sn_bus'], transformer_refs: [] } as never,
      { id: 's4', ref_id: 'stn/aa3/station', name: 'S4', tags: [], meta: {}, station_type: 'inline', bus_refs: ['stn/aa3/sn_bus'], transformer_refs: [] } as never,
      { id: 's5', ref_id: 'stn/aa4/station', name: 'S5', tags: [], meta: {}, station_type: 'inline', bus_refs: ['stn/aa4/sn_bus'], transformer_refs: [] } as never,
    ];
    // Chain: GPZ_sec → S2 → S3 → S4 → S5 (5 cables w łańcuchu)
    snap.branches = [
      { id: 'c1', ref_id: 'seg/1', name: 'C1', type: 'cable', from_bus_ref: 'gpz/abc/section/001/bus_sn', to_bus_ref: 'stn/aa1/sn_bus', catalog_ref: 'cable-base-epr-al-1c-150', length_km: 1.5, tags: [], meta: {} } as never,
      { id: 'c2', ref_id: 'seg/2', name: 'C2', type: 'cable', from_bus_ref: 'stn/aa1/sn_bus', to_bus_ref: 'stn/aa2/sn_bus', catalog_ref: 'cable-base-epr-al-1c-150', length_km: 1.0, tags: [], meta: {} } as never,
      { id: 'c3', ref_id: 'seg/3', name: 'C3', type: 'cable', from_bus_ref: 'stn/aa2/sn_bus', to_bus_ref: 'stn/aa3/sn_bus', catalog_ref: 'cable-base-epr-al-1c-150', length_km: 0.8, tags: [], meta: {} } as never,
      { id: 'c4', ref_id: 'seg/4', name: 'C4', type: 'cable', from_bus_ref: 'stn/aa3/sn_bus', to_bus_ref: 'stn/aa4/sn_bus', catalog_ref: 'cable-base-epr-al-1c-150', length_km: 0.5, tags: [], meta: {} } as never,
      { id: 'c5', ref_id: 'seg/5', name: 'C5', type: 'cable', from_bus_ref: 'stn/aa4/sn_bus', to_bus_ref: 'stn/aa4/downstream', catalog_ref: 'cable-base-epr-al-1c-150', length_km: 0.3, tags: [], meta: {} } as never,
    ];
    snap.line_runs = []; // jawne brak — sprawdza synthesis path

    const r = buildSldDataFromSnapshot(snap, null);
    // Z 5 cables w łańcuchu adapter syntezuje 1 main_trunk, NIE 5 osobnych run-ów
    expect(r.cableRuns.length).toBe(1);
    expect(r.cableRuns[0].runKind).toBe('main_trunk');
    expect(r.cableRuns[0].segmentRefs?.length).toBe(5);
    // 4 stacje końcowe widoczne (S2, S3, S4, S5 — S5 dochodzi do downstream
    // ale to_bus matchuje stn/aa4/... więc widoczne)
    expect(r.cableRuns[0].id).toMatch(/^synth_trunk_/);
  });

  // K30 audit loop: weryfikacja że adapter nie crashes z runtime errors na
  // dużych snapshot (30 stacji = 30+ buses + 30+ transformers + DERs).
  it('synthetic: deterministic output 3× pod rząd (no flaky behavior)', () => {
    const snap = buildEmptySnapshot();
    snap.substations = [
      { id: 'gpz-a', ref_id: 'GPZ-A', name: 'GPZ-A', tags: [], meta: {}, station_type: 'gpz', bus_refs: ['busA'], transformer_refs: [], gpz_sections: [{ section_id: 'A', order: 1, bus_ref: 'busA' }] } as never,
    ];
    snap.buses = [
      { id: 'busA', ref_id: 'busA', name: 'SN A', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
    ];
    for (let i = 2; i <= 31; i++) {
      const id = `S${i.toString().padStart(2, '0')}`;
      snap.substations.push({
        id, ref_id: id, name: `Stacja ${id}`, tags: [], meta: {},
        station_type: 'inline', bus_refs: [], transformer_refs: [],
      } as never);
    }
    const stations = [];
    for (let i = 2; i <= 31; i++) {
      stations.push({ substation_ref: `S${i.toString().padStart(2, '0')}`, order: i - 1 });
    }
    snap.line_runs = [
      { id: 'run-1', run_kind: 'main_trunk', starting_bay_ref: 'bay-1', starting_port_ref: 'port-1', segments: [], stations },
    ];

    const r1 = buildSldDataFromSnapshot(snap, null);
    const r2 = buildSldDataFromSnapshot(snap, null);
    const r3 = buildSldDataFromSnapshot(snap, null);
    expect(r1.stations.map((s) => s.id)).toEqual(r2.stations.map((s) => s.id));
    expect(r2.stations.map((s) => s.id)).toEqual(r3.stations.map((s) => s.id));
    expect(r1.stations.length).toBe(30);
  });

  it('duży ciąg SN zachowuje kolejność stacji i ciągłość odcinków', () => {
    const snap = buildEmptySnapshot();
    snap.substations = [
      { id: 'gpz-a', ref_id: 'GPZ-A', name: 'GPZ-A', tags: [], meta: {}, station_type: 'gpz', bus_refs: ['busA'], transformer_refs: [], gpz_sections: [{ section_id: 'A', order: 1, bus_ref: 'busA' }] } as never,
    ];
    snap.buses = [
      { id: 'busA', ref_id: 'busA', name: 'SN A', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
    ];
    for (let i = 1; i <= 30; i += 1) {
      const id = `S${i.toString().padStart(2, '0')}`;
      snap.substations.push({
        id,
        ref_id: id,
        name: `Stacja ${id}`,
        tags: [],
        meta: {},
        station_type: 'inline',
        bus_refs: [],
        transformer_refs: [],
      } as never);
    }
    snap.branches = Array.from({ length: 30 }, (_, index) => ({
      id: `seg-${index + 1}`,
      ref_id: `seg-${index + 1}`,
      name: `Odcinek ${index + 1}`,
      type: 'cable',
      from_bus_ref: index === 0 ? 'busA' : `S${index.toString().padStart(2, '0')}/sn`,
      to_bus_ref: `S${(index + 1).toString().padStart(2, '0')}/sn`,
      status: 'closed',
      catalog_ref: 'cable-base-epr-al-1c-150',
      length_km: 0.18,
      tags: [],
      meta: {},
    })) as never;
    snap.line_runs = [
      {
        id: 'run-large',
        run_kind: 'main_trunk',
        starting_bay_ref: 'bay-1',
        starting_port_ref: 'port-1',
        segments: Array.from({ length: 30 }, (_, index) => ({
          segment_ref: `seg-${index + 1}`,
          order: index + 1,
        })),
        stations: Array.from({ length: 30 }, (_, index) => ({
          substation_ref: `S${(index + 1).toString().padStart(2, '0')}`,
          order: index + 1,
        })),
      },
    ] as never;

    const r = buildSldDataFromSnapshot(snap, null);
    const sciezki = r.cableRuns[0].segmentPaths ?? [];

    expect(r.stations.map((station) => station.id)).toEqual(
      Array.from({ length: 30 }, (_, index) => `S${(index + 1).toString().padStart(2, '0')}`),
    );
    expect(r.cableRuns).toHaveLength(1);
    expect(sciezki.map((sp) => sp.segmentRef)).toEqual(
      Array.from({ length: 30 }, (_, index) => `seg-${index + 1}`),
    );
    // Ciągłość: koniec odcinka i = początek odcinka i+1 (ta sama szyna ENM).
    for (let i = 1; i < sciezki.length; i += 1) {
      expect(sciezki[i].fromTerminal?.busRef).toBe(sciezki[i - 1].toTerminal?.busRef);
    }
  });
});

describe('enmToSldAdapter — buildSldDataFromSnapshot: tor zasilania i ciągłość zacisków', () => {
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

    it('otwarty łącznik sekcyjny → ciąg strony zasilającej niesie punkt otwarty, ciąg za nim nie', () => {
      const snap = buildEmptySnapshot();
      snap.buses = [
        { id: 'b_a', ref_id: 'b_a', name: 'A', voltage_kv: 15 } as never,
        { id: 'b_mid', ref_id: 'b_mid', name: 'MID', voltage_kv: 15 } as never,
        { id: 'b_end', ref_id: 'b_end', name: 'END', voltage_kv: 15 } as never,
        { id: 'b_far', ref_id: 'b_far', name: 'FAR', voltage_kv: 15 } as never,
      ];
      snap.sources = [
        { id: 'src', ref_id: 'src', name: 'Grid', bus_ref: 'b_a', model: 'short_circuit_power', sk3_mva: 250 } as never,
      ];
      snap.branches = [
        // Energized incoming cable (source side).
        { id: 'c1', ref_id: 'seg/c1/segment', name: 'C1', type: 'cable', from_bus_ref: 'b_a', to_bus_ref: 'b_mid', status: 'closed', length_km: 1, r_ohm_per_km: 0.2, x_ohm_per_km: 0.08 } as never,
        // Open section switch (NMO) carrying a real model name.
        { id: 'sw1', ref_id: 'sw/op1/switch', name: 'Łącznik sekcyjny NO (rezerwa)', type: 'switch', from_bus_ref: 'b_mid', to_bus_ref: 'b_end', status: 'open' } as never,
        // De-energized reserve cable (beyond the open point).
        { id: 'c2', ref_id: 'seg/c2/segment', name: 'C2', type: 'cable', from_bus_ref: 'b_end', to_bus_ref: 'b_far', status: 'closed', length_km: 1, r_ohm_per_km: 0.2, x_ohm_per_km: 0.08 } as never,
      ];
      const r = buildSldDataFromSnapshot(snap, null);
      // Punkt otwarty (łącznik, nie odcinek) przypisany do ciągu odcinka dochodzącego do
      // jego węzła (strona zasilająca) — relacja odcinek↔węzeł z ENM, bez geometrii.
      expect(Object.fromEntries(r.cableRuns.map((run) => [run.id, run.containsOpenPoint]))).toEqual({
        'seg/c1/segment': true,
        'seg/c2/segment': false,
      });
      expect(Object.fromEntries(r.cableRuns.map((run) => [run.id, run.energized]))).toEqual({
        'seg/c1/segment': true,
        'seg/c2/segment': false,
      });
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

  describe('corridor station placement after endpoint append', () => {
    it('station_refs z korytarza dołącza stację do widoku, stacja spoza ciągów zostaje poza nim', () => {
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
      expect(orphan).toBeUndefined();
    });

    it('station_refs bez realnych odcinków w korytarzu: stacja w widoku, bez ciągu kablowego', () => {
      const snap = buildEmptySnapshot();
      snap.substations = [
        { id: 's1', ref_id: 'ST-ORPHAN', name: 'Stacja bez odcinka', tags: [], meta: {}, station_type: 'inline', bus_refs: [], transformer_refs: [] } as never,
      ];
      snap.corridors = [
        {
          id: 'corr-empty',
          ref_id: 'corr-empty',
          name: 'Korytarz bez odcinków',
          tags: [],
          meta: {},
          corridor_type: 'radial',
          ordered_segment_refs: [],
          station_refs: ['ST-ORPHAN'],
        } as never,
      ];

      const r = buildSldDataFromSnapshot(snap, null);
      const orphan = r.stations.find((s) => s.id === 'ST-ORPHAN');

      expect(orphan).toBeDefined();
      expect(r.cableRuns.flatMap((run) => run.segmentRefs ?? [])).toEqual([]);
    });
  });
});

describe('enmToSldAdapter — kontrakt topologii terenowej SLD', () => {

  it('wystawia topologyRuns z relacjami ciągu z modelu; etykiety bez refów programistycznych', () => {
    const snap = buildEmptySnapshot();
    snap.buses = [
      { id: 'b-gpz', ref_id: 'gpz/sn_bus', name: 'Szyna GPZ', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
      { id: 'b-st', ref_id: 'stn/a/sn_bus', name: 'Szyna stacji', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
    ];
    snap.substations = [
      { id: 'g', ref_id: 'gpz/1/station', name: 'GPZ testowy', tags: [], meta: {}, station_type: 'gpz', bus_refs: ['gpz/sn_bus'], transformer_refs: [] } as never,
      { id: 's', ref_id: 'stn/a/station', name: 'Stacja S01', tags: [], meta: {}, station_type: 'inline', bus_refs: ['stn/a/sn_bus'], transformer_refs: [] } as never,
    ];
    snap.branches = [
      {
        id: 'br-1',
        ref_id: 'seg/a/segment_L',
        name: 'Kabel GPZ-S01',
        tags: [],
        meta: {},
        type: 'cable',
        status: 'closed',
        from_bus_ref: 'gpz/sn_bus',
        to_bus_ref: 'stn/a/sn_bus',
        length_km: 0.12,
        r_ohm_per_km: 0.2,
        x_ohm_per_km: 0.08,
        endpoint_a_port: { port_id: 'gpz/bay/001/out' },
        endpoint_b_port: { port_id: 'stn/a/q01/in' },
      } as never,
    ];
    snap.line_runs = [
      {
        id: 'run-a',
        name: 'Magistrala testowa',
        run_kind: 'main_trunk',
        starting_bay_ref: 'gpz/bay/001',
        starting_port_ref: 'gpz/bay/001/out',
        segments: [{ segment_ref: 'seg/a/segment_L', order: 1 }],
        stations: [{ substation_ref: 'stn/a/station', order: 1 }],
      },
    ];

    const result = buildSldDataFromSnapshot(snap, null);

    expect(result.topologyRuns).toEqual([
      {
        id: 'run-a',
        kind: 'main_trunk',
        lineName: 'Magistrala testowa',
        parentRunRef: null,
        branchOriginStationRef: null,
        nopStationRef: null,
        startingBayRef: 'gpz/bay/001',
        startingPortRef: 'gpz/bay/001/out',
        stationRefs: ['stn/a/station'],
      },
    ]);
    const teksty = result.cableRuns.flatMap((run) => [run.label ?? '', ...(run.segmentLabels ?? []).map((l) => l.text)]);
    expect(teksty.length).toBeGreaterThan(1);
    expect(teksty.join(' ')).not.toMatch(/seg\/|ref\/|hash/i);
  });

  it('odgałęzienie ze stacji ciągu głównego: relacja rodzica i zacisk początku na szynie tej stacji', () => {
    const snap = buildEmptySnapshot();
    snap.buses = [
      { id: 'b-gpz', ref_id: 'gpz/sn_bus', name: 'Szyna GPZ', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
      { id: 'b-main', ref_id: 'stn/main/sn_bus', name: 'Szyna S01', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
      { id: 'b-branch', ref_id: 'stn/branch/sn_bus', name: 'Szyna O01', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
    ];
    snap.substations = [
      { id: 'g', ref_id: 'gpz/1/station', name: 'GPZ', tags: [], meta: {}, station_type: 'gpz', bus_refs: ['gpz/sn_bus'], transformer_refs: [] } as never,
      { id: 's1', ref_id: 'stn/main/station', name: 'Stacja S01', tags: [], meta: {}, station_type: 'inline', bus_refs: ['stn/main/sn_bus'], transformer_refs: [] } as never,
      { id: 's2', ref_id: 'stn/branch/station', name: 'Odgałęzienie O01', tags: [], meta: {}, station_type: 'terminal', bus_refs: ['stn/branch/sn_bus'], transformer_refs: [] } as never,
    ];
    snap.branches = [
      { id: 'br-main', ref_id: 'seg/main/segment', name: 'Kabel GPZ-S01', tags: [], meta: {}, type: 'cable', status: 'closed', from_bus_ref: 'gpz/sn_bus', to_bus_ref: 'stn/main/sn_bus', length_km: 0.2, r_ohm_per_km: 0.2, x_ohm_per_km: 0.08 } as never,
      { id: 'br-branch', ref_id: 'seg/branch/segment', name: 'Kabel S01-O01', tags: [], meta: {}, type: 'cable', status: 'closed', from_bus_ref: 'stn/main/sn_bus', to_bus_ref: 'stn/branch/sn_bus', length_km: 0.35, r_ohm_per_km: 0.2, x_ohm_per_km: 0.08 } as never,
    ];
    snap.line_runs = [
      {
        id: 'run-main',
        name: 'Magistrala',
        run_kind: 'main_trunk',
        starting_bay_ref: 'gpz/bay/001',
        starting_port_ref: 'gpz/bay/001/out',
        segments: [{ segment_ref: 'seg/main/segment', order: 1 }],
        stations: [{ substation_ref: 'stn/main/station', order: 1 }],
      },
      {
        id: 'run-branch',
        name: 'Odgałęzienie S01',
        run_kind: 'branch',
        starting_bay_ref: 'stn/main/q02',
        starting_port_ref: 'stn/main/q02/out',
        parent_run_ref: 'run-main',
        branch_origin_station_ref: 'stn/main/station',
        segments: [{ segment_ref: 'seg/branch/segment', order: 1 }],
        stations: [{ substation_ref: 'stn/branch/station', order: 1 }],
      },
    ];

    const result = buildSldDataFromSnapshot(snap, null);
    const branchRun = result.topologyRuns.find((run) => run.id === 'run-branch');

    expect(branchRun).toMatchObject({
      kind: 'branch',
      parentRunRef: 'run-main',
      branchOriginStationRef: 'stn/main/station',
      stationRefs: ['stn/branch/station'],
    });
    const branchCableRun = result.cableRuns.find((run) => run.id === 'run-branch');
    expect(branchCableRun?.runKind).toBe('branch');
    expect(branchCableRun?.segmentPaths?.[0]?.fromTerminal).toEqual({
      busRef: 'stn/main/sn_bus',
      ownerRef: 'stn/main/station',
    });
  });

  it('odgałęzienie ze słupa: relacja rodzica i zacisk początku na szynie słupa, nie GPZ', () => {
    const snap = buildEmptySnapshot();
    snap.buses = [
      { id: 'b-gpz', ref_id: 'gpz/sn_bus', name: 'Szyna GPZ', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
      { id: 'b-bp', ref_id: 'bp/bus', name: 'Punkt rozgałęzienia', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
      { id: 'b-end', ref_id: 'end/sn_bus', name: 'Koniec ciągu', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
      { id: 'b-branch', ref_id: 'stn/branch/sn_bus', name: 'Szyna odgałęzienia', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
    ];
    snap.substations = [
      { id: 'g', ref_id: 'gpz/1/station', name: 'GPZ', tags: [], meta: {}, station_type: 'gpz', bus_refs: ['gpz/sn_bus'], transformer_refs: [] } as never,
      { id: 's2', ref_id: 'stn/branch/station', name: 'Stacja odgałęzienia', tags: [], meta: {}, station_type: 'terminal', bus_refs: ['stn/branch/sn_bus'], transformer_refs: [] } as never,
    ];
    snap.branches = [
      { id: 'seg-left', ref_id: 'seg-left', name: 'Linia do słupa', tags: [], meta: {}, type: 'line_overhead', status: 'closed', from_bus_ref: 'gpz/sn_bus', to_bus_ref: 'bp/bus', length_km: 0.35, r_ohm_per_km: 0.2, x_ohm_per_km: 0.08 } as never,
      { id: 'seg-right', ref_id: 'seg-right', name: 'Linia za słupem', tags: [], meta: {}, type: 'line_overhead', status: 'closed', from_bus_ref: 'bp/bus', to_bus_ref: 'end/sn_bus', length_km: 0.35, r_ohm_per_km: 0.2, x_ohm_per_km: 0.08 } as never,
      { id: 'seg-branch', ref_id: 'seg-branch', name: 'Odgałęzienie do stacji', tags: [], meta: {}, type: 'line_overhead', status: 'closed', from_bus_ref: 'bp/bus', to_bus_ref: 'stn/branch/sn_bus', length_km: 0.2, r_ohm_per_km: 0.2, x_ohm_per_km: 0.08 } as never,
    ];
    snap.branch_points = [
      {
        id: 'bp-1',
        ref_id: 'bp-1',
        name: 'Słup rozgałęźny SN',
        tags: [],
        meta: {},
        branch_point_type: 'branch_pole',
        parent_segment_id: 'seg-original',
        bus_ref: 'bp/bus',
        catalog_ref: 'SLUP-ODG-12',
        catalog_namespace: 'mv_branch_points',
        ports: { MAIN_IN: 'gpz/sn_bus', MAIN_OUT: 'end/sn_bus', BRANCH: ['bp/branch_bus'] },
        branch_occupied: { BRANCH: 'seg-branch' },
        switch_state: 'closed',
        runtime_inputs: {
          operation_semantics: 'insert_point_in_run',
          main_segment_refs: ['seg-left', 'seg-right'],
          source_run_ref: 'run-main',
        },
      } as never,
    ];
    snap.line_runs = [
      {
        id: 'run-main',
        name: 'Magistrala',
        run_kind: 'main_trunk',
        starting_bay_ref: 'gpz/bay/001',
        starting_port_ref: 'gpz/bay/001/out',
        segments: [
          { segment_ref: 'seg-left', order: 1 },
          { segment_ref: 'seg-right', order: 2 },
        ],
        stations: [],
      },
      {
        id: 'run-branch',
        name: 'Odgałęzienie ze słupa',
        run_kind: 'branch',
        starting_bay_ref: 'bp-1',
        starting_port_ref: 'bp-1.BRANCH',
        parent_run_ref: 'run-main',
        branch_origin_station_ref: 'bp-1',
        segments: [{ segment_ref: 'seg-branch', order: 1 }],
        stations: [{ substation_ref: 'stn/branch/station', order: 1 }],
      },
    ];

    const result = buildSldDataFromSnapshot(snap, null);
    const branchRun = result.topologyRuns.find((run) => run.id === 'run-branch');
    const branchCableRun = result.cableRuns.find((run) => run.id === 'run-branch');

    expect(branchRun).toMatchObject({ parentRunRef: 'run-main', branchOriginStationRef: 'bp-1' });
    expect(branchCableRun?.segmentRefs).toEqual(['seg-branch']);
    expect(branchCableRun?.segmentPaths?.[0]?.fromTerminal?.busRef).toBe('bp/bus');
    expect(result.cableRuns.find((run) => run.id === 'run-main')?.segmentRefs).toEqual(['seg-left', 'seg-right']);
  });
});


describe('ciąg SN po podziale odcinka punktem rozgałęzienia', () => {

  it('odtwarza ciag po podziale segmentu, gdy line_run wskazuje stary parent_segment_id', () => {
    const snap = buildEmptySnapshot();
    snap.buses = [
      { id: 'b15', ref_id: 'b15', name: 'Szyna GPZ S1 15 kV', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
      { id: 'zksn-bus', ref_id: 'zksn-bus', name: 'ZKSN', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
      { id: 'end-bus', ref_id: 'end-bus', name: 'Koniec ciagu', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
    ];
    snap.branches = [
      { id: 'seg-l', ref_id: 'SEG-L', name: 'Kabel do ZKSN', tags: [], meta: {}, type: 'cable', from_bus_ref: 'b15', to_bus_ref: 'zksn-bus', status: 'closed', length_km: 0.5, r_ohm_per_km: 0.2, x_ohm_per_km: 0.08 } as never,
      { id: 'seg-r', ref_id: 'SEG-R', name: 'Kabel za ZKSN', tags: [], meta: {}, type: 'cable', from_bus_ref: 'zksn-bus', to_bus_ref: 'end-bus', status: 'closed', length_km: 0.5, r_ohm_per_km: 0.2, x_ohm_per_km: 0.08 } as never,
    ];
    snap.branch_points = [
      {
        id: 'zksn-1',
        ref_id: 'zksn-1',
        name: 'ZKSN SN',
        tags: [],
        meta: {},
        branch_point_type: 'zksn',
        parent_segment_id: 'SEG-OLD',
        bus_ref: 'zksn-bus',
        catalog_ref: 'ZKSN-3P',
        catalog_namespace: 'mv_branch_points',
        ports: { MAIN_IN: 'b15', MAIN_OUT: 'end-bus', BRANCH: ['branch-port-1'] },
        switch_state: 'closed',
      } as never,
    ];
    // Karta W5-B: pola rozdzielnicy ZKSN = rekordy `bays` punktu (WE, WY, ODG) — jak
    // backend `enm.pola.pola_zksn_z_portow` dla jednego portu odgałęzienia.
    snap.bays = polaZksnTestowe('zksn-1', 'zksn-bus', 1);
    snap.line_runs = [
      {
        id: 'run-zksn',
        run_kind: 'main_trunk',
        starting_bay_ref: 'bay-1',
        starting_port_ref: 'bay-1#cable_head',
        segments: [{ segment_ref: 'SEG-OLD', order: 1 }],
        stations: [],
      },
    ];

    const result = buildSldDataFromSnapshot(snap, null);
    const run = result.cableRuns.find((candidate) => candidate.id === 'run-zksn');

    expect(run?.segmentRefs).toEqual(['SEG-L', 'SEG-R']);
    expect(run?.segmentPaths?.map((sp) => sp.segmentRef)).toEqual(['SEG-L', 'SEG-R']);
  });

});

// =============================================================================
// F9.2 (SLD_CAD_SPEC_V3 §12.1/§13) — projekcja primaryDevices + sources
// =============================================================================

function makePrimaryDevice(overrides: Partial<BayPrimaryDevice>): BayPrimaryDevice {
  return {
    device_ref: 'device',
    symbol_ref: 'symbol:device',
    kind: 'CB',
    placement: 'MIDSTREAM',
    is_controllable: true,
    ...overrides,
  };
}

function makeStationOnlySnapshot(stationRef: string): EnergyNetworkModel {
  const snap = buildEmptySnapshot();
  snap.substations = [
    {
      id: 'st', ref_id: stationRef, name: 'Stacja testowa', tags: [], meta: {},
      station_type: 'inline', bus_refs: [], transformer_refs: [],
    } as never,
  ];
  attachMainRun(snap, [stationRef]);
  return snap;
}

describe('F9.2 — projekcja Bay.primary_devices (SLD_CAD_SPEC_V3 §12.1)', () => {
  it('primaryDevices jest nieobecny, gdy Bay (ENM) nie niesie primary_devices — stan dzisiejszy (STOP-notatka raportu F9.2)', () => {
    const snap = makeStationOnlySnapshot('ST-1');
    snap.bays = [
      { id: 'b1', ref_id: 'bay-1', name: 'Pole 1', tags: [], meta: {}, bay_role: 'OUT', substation_ref: 'ST-1', bus_ref: 'bus-sn', equipment_refs: [] } as never,
    ];

    const r = buildSldDataFromSnapshot(snap, null);
    const station = r.stations.find((s) => s.id === 'ST-1');
    expect(station?.snBays).toHaveLength(1);
    expect(station?.snBays?.[0]?.primaryDevices).toBeUndefined();
  });

  it('gdy primary_devices obecne (kontrakt forward-compat), sortuje wg placement UPSTREAM→MIDSTREAM→DOWNSTREAM ze stabilnym tie-breakerem = kolejność ENM', () => {
    const snap = makeStationOnlySnapshot('ST-1');
    const primaryDevices: BayPrimaryDevice[] = [
      makePrimaryDevice({ device_ref: 'ct-1', kind: 'CT', placement: 'MIDSTREAM' }),
      makePrimaryDevice({ device_ref: 'ds-bus', kind: 'DS', placement: 'UPSTREAM' }),
      makePrimaryDevice({ device_ref: 'cb-1', kind: 'CB', placement: 'MIDSTREAM' }),
      makePrimaryDevice({ device_ref: 'head', kind: 'CABLE_HEAD', placement: 'DOWNSTREAM' }),
    ];
    snap.bays = [
      {
        id: 'b1', ref_id: 'bay-1', name: 'Pole liniowe', tags: [], meta: {},
        bay_role: 'OUT', substation_ref: 'ST-1', bus_ref: 'bus-sn', equipment_refs: [],
        primary_devices: primaryDevices,
      } as never,
    ];

    const r = buildSldDataFromSnapshot(snap, null);
    const devices = r.stations.find((s) => s.id === 'ST-1')?.snBays?.[0]?.primaryDevices;
    expect(devices?.map((d) => d.deviceRef)).toEqual(['ds-bus', 'ct-1', 'cb-1', 'head']);
    expect(devices?.map((d) => d.placement)).toEqual(['UPSTREAM', 'MIDSTREAM', 'MIDSTREAM', 'DOWNSTREAM']);
    expect(devices?.map((d) => d.kind)).toEqual(['DS', 'CT', 'CB', 'CABLE_HEAD']);
  });

  it('mapuje switch_state.actual_state na uproszczony słownik closed/open/unknown (mirror cbState/dsState/esState)', () => {
    const snap = makeStationOnlySnapshot('ST-1');
    const primaryDevices: BayPrimaryDevice[] = [
      makePrimaryDevice({
        device_ref: 'cb-closed', kind: 'CB', placement: 'MIDSTREAM',
        switch_state: makeSwitchState({ actual_state: 'zamkniety' }),
      }),
      makePrimaryDevice({
        device_ref: 'ds-open', kind: 'DS', placement: 'UPSTREAM',
        switch_state: makeSwitchState({ actual_state: 'otwarty' }),
      }),
      makePrimaryDevice({
        device_ref: 'es-fault', kind: 'ES', placement: 'OFF_PATH',
        switch_state: makeSwitchState({ actual_state: 'awaria' }),
      }),
      makePrimaryDevice({ device_ref: 'ct-no-state', kind: 'CT', placement: 'MIDSTREAM' }),
    ];
    snap.bays = [
      {
        id: 'b1', ref_id: 'bay-1', name: 'Pole', tags: [], meta: {},
        bay_role: 'OUT', substation_ref: 'ST-1', bus_ref: 'bus-sn', equipment_refs: [],
        primary_devices: primaryDevices,
      } as never,
    ];

    const r = buildSldDataFromSnapshot(snap, null);
    const devices = r.stations.find((s) => s.id === 'ST-1')?.snBays?.[0]?.primaryDevices ?? [];
    const byRef = new Map(devices.map((d) => [d.deviceRef, d.switchState]));
    expect(byRef.get('ds-open')).toBe('open');
    expect(byRef.get('cb-closed')).toBe('closed');
    expect(byRef.get('es-fault')).toBe('unknown');
    expect(byRef.get('ct-no-state')).toBeUndefined();
  });

  it('przenosi section_side 1:1 (LEFT/CENTER/RIGHT), null gdy ENM nie niesie strony', () => {
    const snap = makeStationOnlySnapshot('ST-1');
    const primaryDevices: BayPrimaryDevice[] = [
      makePrimaryDevice({ device_ref: 'ds-left', kind: 'DS', placement: 'UPSTREAM', section_side: 'LEFT' }),
      makePrimaryDevice({ device_ref: 'cb-right', kind: 'CB', placement: 'MIDSTREAM', section_side: 'RIGHT' }),
      makePrimaryDevice({ device_ref: 'ct-none', kind: 'CT', placement: 'MIDSTREAM' }),
    ];
    snap.bays = [
      {
        id: 'b1', ref_id: 'bay-1', name: 'Pole', tags: [], meta: {},
        bay_role: 'OUT', substation_ref: 'ST-1', bus_ref: 'bus-sn', equipment_refs: [],
        primary_devices: primaryDevices,
      } as never,
    ];

    const r = buildSldDataFromSnapshot(snap, null);
    const devices = r.stations.find((s) => s.id === 'ST-1')?.snBays?.[0]?.primaryDevices ?? [];
    const byRef = new Map(devices.map((d) => [d.deviceRef, d.sectionSide]));
    expect(byRef.get('ds-left')).toBe('LEFT');
    expect(byRef.get('cb-right')).toBe('RIGHT');
    expect(byRef.get('ct-none')).toBeNull();
  });

  it('determinizm: 10× ten sam input → identyczna projekcja primaryDevices', () => {
    const snap = makeStationOnlySnapshot('ST-1');
    const primaryDevices: BayPrimaryDevice[] = [
      makePrimaryDevice({ device_ref: 'ct-1', kind: 'CT', placement: 'MIDSTREAM' }),
      makePrimaryDevice({ device_ref: 'ds-bus', kind: 'DS', placement: 'UPSTREAM' }),
    ];
    snap.bays = [
      {
        id: 'b1', ref_id: 'bay-1', name: 'Pole', tags: [], meta: {},
        bay_role: 'OUT', substation_ref: 'ST-1', bus_ref: 'bus-sn', equipment_refs: [],
        primary_devices: primaryDevices,
      } as never,
    ];

    const runs = Array.from({ length: 10 }, () =>
      buildSldDataFromSnapshot(snap, null).stations.find((s) => s.id === 'ST-1')?.snBays?.[0]?.primaryDevices,
    );
    for (const run of runs) {
      expect(run).toEqual(runs[0]);
    }
  });
});

describe('F10.6 — designation per-aparat (SLD_CAD_SPEC_V3 §19.1, D1, V12K-035)', () => {
  it('przenosi BayPrimaryDevice.designation 1:1 do BayPrimaryDeviceView.designation', () => {
    const snap = makeStationOnlySnapshot('ST-1');
    const primaryDevices: BayPrimaryDevice[] = [
      makePrimaryDevice({ device_ref: 'cb-1', kind: 'CB', placement: 'MIDSTREAM', designation: 'Q7' }),
      makePrimaryDevice({ device_ref: 'ds-1', kind: 'DS', placement: 'UPSTREAM' }),
    ];
    snap.bays = [
      {
        id: 'b1', ref_id: 'bay-1', name: 'Pole', tags: [], meta: {},
        bay_role: 'OUT', substation_ref: 'ST-1', bus_ref: 'bus-sn', equipment_refs: [],
        primary_devices: primaryDevices,
      } as never,
    ];

    const r = buildSldDataFromSnapshot(snap, null);
    const devices = r.stations.find((s) => s.id === 'ST-1')?.snBays?.[0]?.primaryDevices ?? [];
    const byRef = new Map(devices.map((d) => [d.deviceRef, d.designation]));
    expect(byRef.get('cb-1')).toBe('Q7');
    expect(byRef.get('ds-1')).toBeUndefined();
  });
});

/**
 * F10.6 / CTVT-RENDER — projekcje adnotacji pola (CT, VT, strefa 87T) liczone wprost z rekordu
 * pola i migawki (`resolveBay*`, te same funkcje rzutuje blok GPZ). Karta W5-B: blok STACJI ich
 * nie rzutuje (przypięte niżej — decyzja wyglądu SLD oczekuje werdyktu właściciela B-02).
 */
describe('F10.6 — układ CT/VT + strefa 87T (SLD_CAD_SPEC_V3 §18.3/§20.2, D3/D4/D5, V12K-036)', () => {
  it('ctRatingAnnotations niesie arrangement z Measurement.ct_arrangement, undefined gdy dana niedostarczona', () => {
    const snap = makeStationOnlySnapshot('ST-1');
    snap.bays = [
      {
        id: 'b1', ref_id: 'bay-1', name: 'Pole', tags: [], meta: {},
        bay_role: 'OUT', substation_ref: 'ST-1', bus_ref: 'bus-sn', equipment_refs: [],
      } as never,
    ];
    snap.measurements = [
      {
        id: 'm1', ref_id: 'ct-1', name: 'CT1', tags: [], meta: {},
        measurement_type: 'CT', bus_ref: 'bus-sn', bay_ref: 'bay-1',
        rating: { ratio_primary: 300, ratio_secondary: 5 },
        connection: 'star', purpose: 'protection', ct_arrangement: '3xCT',
      },
      {
        id: 'm2', ref_id: 'ct-2', name: 'CT2', tags: [], meta: {},
        measurement_type: 'CT', bus_ref: 'bus-sn', bay_ref: 'bay-1',
        rating: { ratio_primary: 150, ratio_secondary: 5 },
        connection: 'star', purpose: 'protection',
      },
    ] as never;

    const annotations = resolveBayCtRatingAnnotations(snap.bays[0], snap) ?? [];
    const byRef = new Map(annotations.map((a) => [a.measurementRef, a.arrangement]));
    expect(byRef.get('ct-1')).toBe('3xCT');
    expect(byRef.get('ct-2')).toBeUndefined();
  });

  it('W5 (§12–15/uwaga 7): ctRatingAnnotations niesie purpose z Measurement.purpose (wariant CT z danych)', () => {
    const snap = makeStationOnlySnapshot('ST-1');
    snap.bays = [
      {
        id: 'b1', ref_id: 'bay-1', name: 'Pole', tags: [], meta: {},
        bay_role: 'OUT', substation_ref: 'ST-1', bus_ref: 'bus-sn', equipment_refs: [],
      } as never,
    ];
    snap.measurements = [
      {
        id: 'm1', ref_id: 'ct-p', name: 'CT-P', tags: [], meta: {},
        measurement_type: 'CT', bus_ref: 'bus-sn', bay_ref: 'bay-1',
        rating: { ratio_primary: 300, ratio_secondary: 5 },
        connection: 'star', purpose: 'protection',
      },
      {
        id: 'm2', ref_id: 'ct-m', name: 'CT-M', tags: [], meta: {},
        measurement_type: 'CT', bus_ref: 'bus-sn', bay_ref: 'bay-1',
        rating: { ratio_primary: 150, ratio_secondary: 5 },
        connection: 'star', purpose: 'metering',
      },
    ] as never;

    const annotations = resolveBayCtRatingAnnotations(snap.bays[0], snap) ?? [];
    const byRef = new Map(annotations.map((a) => [a.measurementRef, a]));
    // przeznaczenie CT rozróżnione Z DANYCH (pomiarowy vs zabezpieczeniowy)
    expect(byRef.get('ct-p')?.purpose).toBe('protection');
    expect(byRef.get('ct-m')?.purpose).toBe('metering');
    // kanał geometrycznie neutralny: purpose NIE w tekście przekładni
    expect(byRef.get('ct-p')?.ratioText).toBe('300/5');
    expect(byRef.get('ct-m')?.ratioText).toBe('150/5');
  });

  it('protectionMarking.ctRefsSecondary przenosi ProtectionAssignment.ct_refs_secondary, undefined gdy puste', () => {
    const snap = makeStationOnlySnapshot('ST-1');
    snap.bays = [
      {
        id: 'b1', ref_id: 'bay-1', name: 'Pole 87T', tags: [], meta: {},
        bay_role: 'TR', substation_ref: 'ST-1', bus_ref: 'bus-sn', equipment_refs: [],
        protection_codes: ['87T'], protection_ref: 'prot-1',
      } as never,
      {
        id: 'b2', ref_id: 'bay-2', name: 'Pole zwykłe', tags: [], meta: {},
        bay_role: 'OUT', substation_ref: 'ST-1', bus_ref: 'bus-sn', equipment_refs: [],
        protection_codes: ['51'], protection_ref: 'prot-2',
      } as never,
    ];
    snap.protection_assignments = [
      {
        id: 'assign-diff', ref_id: 'prot-1', name: 'Diff', tags: [], meta: {},
        breaker_ref: 'cb-1', ct_ref: 'ct-1', ct_refs_secondary: ['ct-2'],
        device_type: 'differential', settings: [], is_enabled: true,
      },
      {
        id: 'assign-oc', ref_id: 'prot-2', name: 'OC', tags: [], meta: {},
        breaker_ref: 'cb-2', ct_ref: 'ct-3',
        device_type: 'overcurrent', settings: [], is_enabled: true,
      },
    ] as never;

    const byRef = new Map(snap.bays.map((b) => [b.ref_id, resolveBayProtectionMarking(b, snap)?.ctRefsSecondary]));
    expect(byRef.get('bay-1')).toEqual(['ct-2']);
    expect(byRef.get('bay-2')).toBeUndefined();
  });

  it('CTVT-RENDER (V12K-176): ctRatingAnnotations niesie cores z Measurement.ct_cores, undefined gdy dana niedostarczona', () => {
    const snap = makeStationOnlySnapshot('ST-1');
    snap.bays = [
      {
        id: 'b1', ref_id: 'bay-1', name: 'Pole', tags: [], meta: {},
        bay_role: 'OUT', substation_ref: 'ST-1', bus_ref: 'bus-sn', equipment_refs: [],
      } as never,
    ];
    snap.measurements = [
      {
        id: 'm1', ref_id: 'ct-3rdz', name: 'CT1', tags: [], meta: {},
        measurement_type: 'CT', bus_ref: 'bus-sn', bay_ref: 'bay-1',
        rating: { ratio_primary: 300, ratio_secondary: 5 },
        connection: 'star', purpose: 'protection', ct_cores: 3,
      },
      {
        id: 'm2', ref_id: 'ct-brak', name: 'CT2', tags: [], meta: {},
        measurement_type: 'CT', bus_ref: 'bus-sn', bay_ref: 'bay-1',
        rating: { ratio_primary: 150, ratio_secondary: 5 },
        connection: 'star', purpose: 'protection',
      },
    ] as never;

    const annotations = resolveBayCtRatingAnnotations(snap.bays[0], snap) ?? [];
    const byRef = new Map(annotations.map((a) => [a.measurementRef, a.cores]));
    expect(byRef.get('ct-3rdz')).toBe(3);
    expect(byRef.get('ct-brak')).toBeUndefined();
  });

  it('CTVT-RENDER (V12K-176): vtMountingAnnotations niesie montaż z Measurement.vt_mounting, undefined gdy ŻADEN VT pola nie niesie danej', () => {
    const snap = makeStationOnlySnapshot('ST-1');
    snap.bays = [
      {
        id: 'b1', ref_id: 'bay-1', name: 'Pole z montażem', tags: [], meta: {},
        bay_role: 'OUT', substation_ref: 'ST-1', bus_ref: 'bus-sn', equipment_refs: [],
      } as never,
      {
        id: 'b2', ref_id: 'bay-2', name: 'Pole bez montażu', tags: [], meta: {},
        bay_role: 'OUT', substation_ref: 'ST-1', bus_ref: 'bus-sn', equipment_refs: [],
      } as never,
    ];
    snap.measurements = [
      {
        id: 'm1', ref_id: 'vt-cable', name: 'VT1', tags: [], meta: {},
        measurement_type: 'VT', bus_ref: 'bus-sn', bay_ref: 'bay-1',
        rating: { ratio_primary: 15000, ratio_secondary: 100 },
        connection: 'star', purpose: 'protection', vt_mounting: 'cable',
      },
      {
        id: 'm2', ref_id: 'vt-brak', name: 'VT2', tags: [], meta: {},
        measurement_type: 'VT', bus_ref: 'bus-sn', bay_ref: 'bay-2',
        rating: { ratio_primary: 15000, ratio_secondary: 100 },
        connection: 'star', purpose: 'protection',
      },
    ] as never;

    const byRef = new Map(snap.bays.map((b) => [b.ref_id, resolveBayVtMountings(b, snap)]));
    expect(byRef.get('bay-1')).toEqual([
      { measurementRef: 'vt-cable', identifier: 'VT1', mounting: 'cable' },
    ]);
    expect(byRef.get('bay-2')).toBeUndefined();
  });

  it('W5-B: blok STACJI nie rzutuje adnotacji pola mimo danych (zabezpieczenia, CT, VT) — rysunek bez zmian wyglądu', () => {
    const snap = makeStationOnlySnapshot('ST-1');
    snap.bays = [
      pole({
        ref_id: 'bay-1', bay_role: 'TR', substation_ref: 'ST-1', bus_ref: 'bus-sn',
        protection_codes: ['87T'], protection_ref: 'prot-1',
      }),
    ];
    snap.protection_assignments = [
      {
        id: 'assign-diff', ref_id: 'prot-1', name: 'Diff', tags: [], meta: {},
        breaker_ref: 'cb-1', ct_ref: 'ct-1', device_type: 'differential', settings: [], is_enabled: true,
      },
    ] as never;
    snap.measurements = [
      {
        id: 'm1', ref_id: 'ct-1', name: 'CT1', tags: [], meta: {},
        measurement_type: 'CT', bus_ref: 'bus-sn', bay_ref: 'bay-1',
        rating: { ratio_primary: 300, ratio_secondary: 5 }, connection: 'star', purpose: 'metering',
      },
    ] as never;

    const bay = buildSldDataFromSnapshot(snap, null).stations.find((s) => s.id === 'ST-1')?.snBays?.[0];
    expect(bay?.bayRef).toBe('bay-1');
    // Dane są (resolver je widzi)…
    expect(resolveBayProtectionMarking(snap.bays[0], snap)?.codes).toEqual(['87T']);
    expect(resolveBayCtRatingAnnotations(snap.bays[0], snap)).toHaveLength(1);
    // …a blok stacji ich nie rzutuje.
    expect(bay?.protectionMarking).toBeUndefined();
    expect(bay?.ctRatingAnnotations).toBeUndefined();
    expect(bay?.meteringMeasurementRef).toBeUndefined();
    expect(bay?.vtArrangements).toBeUndefined();
    expect(bay?.vtMountingAnnotations).toBeUndefined();
  });
});

describe('F9.2 — projekcja źródeł SldDataPayload.sources (SLD_CAD_SPEC_V3 §13.1/§13.2)', () => {
  it('pusty snapshot → sources = []', () => {
    const r = buildSldDataFromSnapshot(buildEmptySnapshot(), null);
    expect(r.sources).toEqual([]);
  });

  it('projektuje Source (ENM, sieć zewnętrzna) jako kind=external_grid z connectionRef=bus_ref, ratedPower/operationalState nieobecne', () => {
    const snap = buildEmptySnapshot();
    snap.sources = [
      {
        id: 'src-1', ref_id: 'GPZ/source/main', name: 'GPZ Referencyjny', tags: [], meta: {},
        bus_ref: 'bus-hv-1', model: 'external_grid',
      } as never,
    ];

    const r = buildSldDataFromSnapshot(snap, null);
    expect(r.sources).toEqual([
      { id: 'GPZ/source/main', kind: 'external_grid', connectionRef: 'bus-hv-1', ratedPower: undefined, operationalState: undefined },
    ]);
  });

  it('mapuje Generator.gen_type na kind pv/bess/generator/wind; gen_type nieznany/null → kind=unknown + missingData=true (F8b-1/f92-2: NIE wykluczony — źródło nie może zginąć bez śladu)', () => {
    const snap = buildEmptySnapshot();
    snap.generators = [
      { id: 'g-pv', ref_id: 'gen-pv', name: 'PV', tags: [], meta: {}, bus_ref: 'bus-nn', p_mw: 0.5, gen_type: 'pv_inverter', station_ref: 'ST-1' } as never,
      { id: 'g-bess', ref_id: 'gen-bess', name: 'BESS', tags: [], meta: {}, bus_ref: 'bus-nn', p_mw: 0.3, gen_type: 'bess', station_ref: 'ST-1' } as never,
      { id: 'g-sync', ref_id: 'gen-sync', name: 'G', tags: [], meta: {}, bus_ref: 'bus-sn', p_mw: 2, gen_type: 'synchronous' } as never,
      { id: 'g-fw', ref_id: 'gen-fw', name: 'FW', tags: [], meta: {}, bus_ref: 'bus-sn', p_mw: 5, gen_type: 'wind_inverter' } as never,
      { id: 'g-unk', ref_id: 'gen-unk', name: 'Unknown', tags: [], meta: {}, bus_ref: 'bus-sn', p_mw: 1, gen_type: null } as never,
    ];

    const r = buildSldDataFromSnapshot(snap, null);
    const byRef = new Map(r.sources?.map((s) => [s.id, s.kind]));
    expect(byRef.get('gen-pv')).toBe('pv');
    expect(byRef.get('gen-bess')).toBe('bess');
    expect(byRef.get('gen-sync')).toBe('generator');
    expect(byRef.get('gen-fw')).toBe('wind');
    // F8b-1 (f92-2): gen_type=null NIE ginie bez śladu — kind='unknown',
    // missingData=true, WCIĄŻ obecny na liście (spec §13.1: „0 źródeł ENM
    // bez reprezentacji na scenie").
    expect(byRef.get('gen-unk')).toBe('unknown');
    const unk = r.sources?.find((s) => s.id === 'gen-unk');
    expect(unk?.missingData).toBe(true);
    expect(r.sources).toHaveLength(5);
    // Źródła ROZPOZNANE nie noszą missingData (undefined, nie false — zgodnie
    // z konwencją opcjonalnych flag adaptera).
    const pv = r.sources?.find((s) => s.id === 'gen-pv');
    expect(pv?.missingData).toBeUndefined();
  });

  it('connectionRef preferuje Generator.station_ref, fallback do bus_ref; ratedPower preferuje limits.p_max_mw, fallback do p_mw', () => {
    const snap = buildEmptySnapshot();
    snap.generators = [
      { id: 'g-1', ref_id: 'gen-1', name: 'PV z limits', tags: [], meta: {}, bus_ref: 'bus-nn-1', p_mw: 0.4, gen_type: 'pv_inverter', station_ref: 'ST-1', limits: { p_max_mw: 0.5 } } as never,
      { id: 'g-2', ref_id: 'gen-2', name: 'PV bez station_ref/limits', tags: [], meta: {}, bus_ref: 'bus-nn-2', p_mw: 0.2, gen_type: 'pv_inverter' } as never,
    ];

    const r = buildSldDataFromSnapshot(snap, null);
    const byRef = new Map(r.sources?.map((s) => [s.id, s]));
    expect(byRef.get('gen-1')).toMatchObject({ connectionRef: 'ST-1', ratedPower: 0.5 });
    expect(byRef.get('gen-2')).toMatchObject({ connectionRef: 'bus-nn-2', ratedPower: 0.2 });
  });

  it('sonda fixtura sldSubstrate52s: liczba źródeł per kind (1 external_grid GPZ + 20 DER: 8 pv, 8 bess, 4 wind)', () => {
    const fixturePath = resolveFixturePath('sldSubstrate52s.enm.json');
    const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

    const r = buildSldDataFromSnapshot(enm, null);
    const byKind = new Map<string, number>();
    for (const s of r.sources ?? []) {
      byKind.set(s.kind, (byKind.get(s.kind) ?? 0) + 1);
    }

    expect(r.sources).toHaveLength(21);
    expect(byKind.get('external_grid')).toBe(1);
    expect(byKind.get('pv')).toBe(8);
    expect(byKind.get('bess')).toBe(8);
    expect(byKind.get('wind')).toBe(4);
    expect(byKind.get('generator')).toBeUndefined();
  });

  it('sonda fixtura sldSubstrate52s: pola bloku stacji z torem pierwotnym = rekordy pól SN stacji niosące primary_devices (§12.1)', () => {
    const fixturePath = resolveFixturePath('sldSubstrate52s.enm.json');
    const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

    const r = buildSldDataFromSnapshot(enm, null);
    const narysowane = r.stations
      .flatMap((s) => s.snBays ?? [])
      .filter((b) => b.primaryDevices !== undefined)
      .map((b) => b.bayRef)
      .sort();
    // Karta W5-B: jeden nośnik — rekordy `bays` pól SN stacji rysowanych blokiem.
    // GEOMETRIA-STACJI (§0 pkt 4a): rekordem aparatu jest też gałąź łączeniowa pola
    // (wyłącznik / rozłącznik / odłącznik / bezpiecznik) wskazana w `equipment_refs` — sieć
    // referencyjna niesie wyłącznik pola właśnie tak, bez `primary_devices`. Rachunek ręczny
    // po typach gałęzi (nie przez funkcję adaptera).
    const typyLacznikow = new Set(['breaker', 'switch', 'disconnector', 'fuse']);
    const typGalezi = new Map(enm.branches.map((g) => [g.ref_id, g.type]));
    const zDanymi = r.stations
      .flatMap((s) => polaSnStacji(enm, s.id))
      .filter(
        (b) =>
          (b.primary_devices ?? []).length > 0 ||
          b.equipment_refs.some((ref) => typyLacznikow.has(typGalezi.get(ref) ?? '')),
      )
      .map((b) => b.ref_id)
      .sort();
    expect(zDanymi.length).toBeGreaterThan(0);
    expect(narysowane).toEqual(zDanymi);
  });
});

// =============================================================================
// Karta #135 — stan ruchowy pola bez fabrykacji (telemetria łącznika)
// =============================================================================

describe('stan ruchowy pola bez fabrykacji — adapter v2 (karta #135)', () => {
  function snapshotZAparatemPola(switchState: Record<string, unknown> | undefined): EnergyNetworkModel {
    const snap = buildEmptySnapshot();
    snap.buses = [
      { id: 'bus-sn', ref_id: 'bus-sn', name: 'Szyna SN', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {}, substation_ref: 'ST-T' } as never,
    ];
    snap.branches = [
      { id: 'sw-in', ref_id: 'sw-in', name: 'Aparat WE', type: 'breaker', from_bus_ref: 'bus-sn', to_bus_ref: 't-in', status: 'closed', tags: [], meta: {} } as never,
    ];
    snap.substations = [
      {
        id: 'st',
        ref_id: 'ST-T',
        name: 'Stacja telemetrii',
        tags: [],
        meta: {},
        station_type: 'inline',
        bus_refs: ['bus-sn'],
        transformer_refs: [],
      } as never,
    ];
    snap.bays = [
      pole({
        ref_id: 'field-in',
        name: 'Pole WE',
        bay_role: 'IN',
        field_role: 'LINIA_IN',
        substation_ref: 'ST-T',
        bus_ref: 'bus-sn',
        equipment_refs: ['sw-in'],
        primary_devices: [
          {
            device_ref: 'q0',
            symbol_ref: 'symbol:cb',
            kind: 'CB',
            placement: 'MIDSTREAM',
            is_controllable: true,
            ...(switchState === undefined ? {} : { switch_state: switchState }),
          } as BayPrimaryDevice,
        ],
      }),
    ];
    attachMainRun(snap, ['ST-T'], 'run-telemetria');
    return snap;
  }

  function stanAparatu(snap: EnergyNetworkModel): string | undefined {
    const station = buildSldDataFromSnapshot(snap, null).stations[0];
    if (!station.snBays) throw new Error('stacja z polami SN powinna nieść snBays');
    return station.snBays[0].primaryDevices?.[0]?.switchState;
  }

  it('rekord z samym stanem łącznika (bez telemetrii) zachowuje stan — telemetria nie jest warunkiem', () => {
    expect(stanAparatu(snapshotZAparatemPola({ actual_state: 'otwarty' }))).toBe('open');
  });

  it('rekord z telemetrią (null i wartości) — ten sam stan łącznika', () => {
    expect(
      stanAparatu(snapshotZAparatemPola({
        actual_state: 'otwarty',
        control_mode: null,
        communication_ok: null,
        interlock_blocked: null,
      })),
    ).toBe('open');
    expect(
      stanAparatu(snapshotZAparatemPola({
        actual_state: 'zamkniety',
        control_mode: 'zdalne',
        communication_ok: true,
        interlock_blocked: false,
      })),
    ).toBe('closed');
  });

  it('brak rekordu stanu — brak stanu (zero domysłu)', () => {
    expect(stanAparatu(snapshotZAparatemPola(undefined))).toBeUndefined();
  });

  it('stan łączników pola stacji z `status` gałęzi z equipment_refs (GPZ-PARYTET cz. 2, pkt 2)', () => {
    for (const status of ['closed', 'open'] as const) {
      const snap = snapshotZAparatemPola(undefined);
      snap.branches = snap.branches.map((g) => ({ ...g, status }) as never);
      const pole0 = buildSldDataFromSnapshot(snap, null).stations[0].snBays?.[0];
      expect(pole0?.cbState).toBe(status);
      // Brak gałęzi odłącznika i rekordu uziemnika → nieustalone, nie domyślne zamknięte/otwarte.
      expect(pole0?.dsState).toBe('unknown');
      expect(pole0?.esState).toBe('unknown');
    }
  });

  it('aparat powiązany z gałęzią łączeniową: stan z `status` gałęzi; rekord sprzeczny → nieustalony', () => {
    const zPowiazaniem = (switchState: Record<string, unknown> | undefined) => {
      const snap = snapshotZAparatemPola(switchState);
      const aparaty = snap.bays[0].primary_devices ?? [];
      snap.bays[0] = { ...snap.bays[0], primary_devices: aparaty.map((a) => ({ ...a, linked_ref: 'sw-in' })) };
      return snap;
    };
    expect(stanAparatu(zPowiazaniem(undefined))).toBe('closed');
    expect(stanAparatu(zPowiazaniem({ actual_state: 'zamkniety' }))).toBe('closed');
    expect(stanAparatu(zPowiazaniem({ actual_state: 'otwarty' }))).toBe('unknown');
    expect(stanAparatu(zPowiazaniem({ actual_state: 'awaria' }))).toBe('unknown');
  });
});

describe('rodzaj źródła pola OZE z przyłączonych wytwórców (GPZ-PARYTET cz. 2, pkt 3)', () => {
  function wytworca(ref: string, genType: string, poleRef: string | null): never {
    return {
      id: ref, ref_id: ref, name: ref, tags: [], bus_ref: 'bus-sn', p_mw: 0.5, gen_type: genType,
      meta: poleRef ? { field_ref: poleRef } : {},
    } as never;
  }

  function rolaPolaOze(generatory: readonly never[], fieldRole?: string): string | undefined {
    const snap = makeStationOnlySnapshot('ST-OZE');
    snap.bays = [
      {
        id: 'oze', ref_id: 'pole-oze', name: 'Pole OZE', tags: [], meta: {}, bay_role: 'OZE',
        substation_ref: 'ST-OZE', bus_ref: 'bus-sn', equipment_refs: [],
        ...(fieldRole ? { field_role: fieldRole } : {}),
      } as never,
    ];
    snap.generators = [...generatory];
    const station = buildSldDataFromSnapshot(snap, null).stations.find((s) => s.id === 'ST-OZE');
    return station?.snBays?.[0]?.fieldRole;
  }

  // Iloczyn: przyłączeni wytwórcy {brak, PV, BESS, wiatr, synchroniczny (rodzaj spoza rysowanych),
  // PV+BESS, PV+PV, wytwórca innego pola} → rola pola.
  const PRZYPADKI: ReadonlyArray<readonly [string, readonly never[], string]> = [
    ['brak wytwórcy', [], FIELD_ROLE.DER_UNKNOWN],
    ['falownik PV', [wytworca('g1', 'pv_inverter', 'pole-oze')], FIELD_ROLE.DER_PV],
    ['magazyn energii', [wytworca('g1', 'bess', 'pole-oze')], FIELD_ROLE.DER_BESS],
    ['turbina wiatrowa', [wytworca('g1', 'fw_pmsg', 'pole-oze')], FIELD_ROLE.DER_FW],
    ['generator synchroniczny', [wytworca('g1', 'synchronous', 'pole-oze')], FIELD_ROLE.DER_UNKNOWN],
    ['PV i BESS w jednym polu', [wytworca('g1', 'pv_inverter', 'pole-oze'), wytworca('g2', 'bess', 'pole-oze')], FIELD_ROLE.DER_UNKNOWN],
    ['dwa falowniki PV', [wytworca('g1', 'pv_inverter', 'pole-oze'), wytworca('g2', 'pv_inverter', 'pole-oze')], FIELD_ROLE.DER_PV],
    ['BESS innego pola', [wytworca('g1', 'bess', 'pole-inne')], FIELD_ROLE.DER_UNKNOWN],
  ];
  for (const [opis, generatory, oczekiwana] of PRZYPADKI) {
    it(`${opis} → ${oczekiwana} (nigdy PV z domysłu)`, () => {
      expect(rolaPolaOze(generatory)).toBe(oczekiwana);
    });
  }

  it('rola kanoniczna pola (`field_role`) wygrywa z rodzajem wytwórcy', () => {
    expect(rolaPolaOze([wytworca('g1', 'bess', 'pole-oze')], 'PV_SN')).toBe(FIELD_ROLE.DER_PV);
  });

  it('determinizm: kolejność wytwórców nie zmienia roli', () => {
    const a = [wytworca('g1', 'pv_inverter', 'pole-oze'), wytworca('g2', 'bess', 'pole-oze')];
    expect(rolaPolaOze(a)).toBe(rolaPolaOze([...a].reverse()));
  });
});

/**
 * K2b §0.4 — RODZAJ KAŻDEGO ODCINKA z ENM (`Branch.type`): kabel → `cable_sn`, linia
 * napowietrzna → `overhead_line_sn`, per odcinek (ciąg mieszany nie dziedziczy rodzaju
 * pierwszego odcinka). Iloczyn: każdy odcinek każdego ciągu sieci referencyjnej 52 stacji
 * (81 kabli, 8 linii napowietrznych) × rodzaj gałęzi.
 */
describe('enmToSldAdapter — rodzaj odcinka per segment (K2b)', () => {
  it('segmentPaths[].segmentKind = rodzaj gałęzi ENM tego odcinka, na każdym odcinku sieci 52 stacji', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const enm = (
      JSON.parse(readFileSync(resolve(here, '../../geometry/__tests__/fixtures/sldSubstrate52s.enm.json'), 'utf8')) as {
        enm: EnergyNetworkModel;
      }
    ).enm;
    const typ = new Map(enm.branches.map((b) => [b.ref_id, b.type] as const));
    const r = buildSldDataFromSnapshot(enm, null);
    const licznik = { cable_sn: 0, overhead_line_sn: 0 };
    for (const run of r.cableRuns) {
      for (const sp of run.segmentPaths ?? []) {
        const oczekiwany = typ.get(sp.segmentRef) === 'cable' ? 'cable_sn' : 'overhead_line_sn';
        expect(sp.segmentKind, sp.segmentRef).toBe(oczekiwany);
        licznik[oczekiwany] += 1;
      }
    }
    expect(licznik.cable_sn).toBeGreaterThan(0);
    expect(licznik.overhead_line_sn).toBeGreaterThan(0);
  });
});
