/**
 * SupplyPathHighlighter — testy interpretacji toru zasilania (czysta topologia).
 *
 * 4 scenariusze:
 *  - radial closed: GPZ → 2 stacje przez zamknięte łączniki — wszystko zasilone,
 *  - radial open: jedna stacja za otwartym łącznikiem — odłączona,
 *  - ring NMO: pierścień z otwartym punktem — obie strony zasilane z GPZ,
 *    NMO marker na otwartym łączniku,
 *  - no source: brak źródła → pusty highlight.
 */

import { describe, it, expect } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import {
  EMPTY_SUPPLY_PATH,
  buildSupplyPathHighlight,
  isElementEnergized,
  isOpenPoint,
} from '../SupplyPathHighlighter';

function emptyEnm(): EnergyNetworkModel {
  return {
    header: { enm_version: '1.0', name: 'test', revision: 1, hash_sha256: '', defaults: { frequency_hz: 50, unit_system: 'SI' } },
    buses: [],
    branches: [],
    transformers: [],
    sources: [],
    loads: [],
    generators: [],
    substations: [],
    bays: [],
    junctions: [],
    corridors: [],
    measurements: [],
    protection_assignments: [],
    branch_points: [],
    line_runs: [],
    connection_nodes: [],
  } as unknown as EnergyNetworkModel;
}

describe('SupplyPathHighlighter — topologia operatorska', () => {
  it('brak źródła → pusty highlight', () => {
    const enm = emptyEnm();
    const h = buildSupplyPathHighlight(enm);
    expect(h).toEqual(EMPTY_SUPPLY_PATH);
  });

  it('null ENM → pusty highlight', () => {
    expect(buildSupplyPathHighlight(null)).toEqual(EMPTY_SUPPLY_PATH);
  });

  it('radial closed: GPZ → ST1 → ST2 przez zamknięte łączniki — wszystko zasilone', () => {
    const enm = emptyEnm();
    enm.buses = [
      { id: 'b_gpz', ref_id: 'b_gpz', name: 'GPZ', voltage_kv: 15 } as never,
      { id: 'b_st1', ref_id: 'b_st1', name: 'ST1', voltage_kv: 15 } as never,
      { id: 'b_st2', ref_id: 'b_st2', name: 'ST2', voltage_kv: 15 } as never,
    ];
    enm.sources = [
      { id: 'src_gpz', ref_id: 'src_gpz', name: 'Grid', bus_ref: 'b_gpz', model: 'short_circuit_power', sk3_mva: 250 } as never,
    ];
    enm.branches = [
      { id: 'c1', ref_id: 'c1', name: 'C1', type: 'cable', from_bus_ref: 'b_gpz', to_bus_ref: 'b_st1', status: 'closed', length_km: 1, r_ohm_per_km: 0.2, x_ohm_per_km: 0.08 } as never,
      { id: 'c2', ref_id: 'c2', name: 'C2', type: 'cable', from_bus_ref: 'b_st1', to_bus_ref: 'b_st2', status: 'closed', length_km: 1, r_ohm_per_km: 0.2, x_ohm_per_km: 0.08 } as never,
    ];
    enm.substations = [
      { id: 'sub_gpz', ref_id: 'sub_gpz', name: 'GPZ', station_type: 'gpz', bus_refs: ['b_gpz'] } as never,
      { id: 'sub_st1', ref_id: 'sub_st1', name: 'ST1', station_type: 'mv_lv', bus_refs: ['b_st1'] } as never,
      { id: 'sub_st2', ref_id: 'sub_st2', name: 'ST2', station_type: 'mv_lv', bus_refs: ['b_st2'] } as never,
    ];

    const h = buildSupplyPathHighlight(enm);

    expect(h.energizedBusRefs).toEqual(['b_gpz', 'b_st1', 'b_st2']);
    expect(h.energizedBranchRefs).toEqual(['c1', 'c2']);
    expect(h.energizedSubstationRefs).toEqual(['sub_gpz', 'sub_st1', 'sub_st2']);
    expect(h.openPointBranchRefs).toEqual([]);
    expect(h.sourceRefs).toEqual(['src_gpz']);

    expect(isElementEnergized(h, 'b_st1')).toBe(true);
    expect(isElementEnergized(h, 'b_unknown')).toBe(false);
  });

  it('radial open: ST2 za otwartym łącznikiem — odłączona, NMO marker', () => {
    const enm = emptyEnm();
    enm.buses = [
      { id: 'b_gpz', ref_id: 'b_gpz', name: 'GPZ', voltage_kv: 15 } as never,
      { id: 'b_st1', ref_id: 'b_st1', name: 'ST1', voltage_kv: 15 } as never,
      { id: 'b_st2', ref_id: 'b_st2', name: 'ST2', voltage_kv: 15 } as never,
    ];
    enm.sources = [
      { id: 'src_gpz', ref_id: 'src_gpz', name: 'Grid', bus_ref: 'b_gpz', model: 'short_circuit_power', sk3_mva: 250 } as never,
    ];
    enm.branches = [
      { id: 'c1', ref_id: 'c1', name: 'C1', type: 'cable', from_bus_ref: 'b_gpz', to_bus_ref: 'b_st1', status: 'closed', length_km: 1, r_ohm_per_km: 0.2, x_ohm_per_km: 0.08 } as never,
      { id: 'sw_open', ref_id: 'sw_open', name: 'NMO', type: 'breaker', from_bus_ref: 'b_st1', to_bus_ref: 'b_st2', status: 'open' } as never,
    ];

    const h = buildSupplyPathHighlight(enm);

    expect(h.energizedBusRefs).toEqual(['b_gpz', 'b_st1']);
    expect(h.energizedBranchRefs).toEqual(['c1']);
    expect(h.openPointBranchRefs).toEqual(['sw_open']);
    expect(isOpenPoint(h, 'sw_open')).toBe(true);
    expect(isElementEnergized(h, 'b_st2')).toBe(false);
  });

  it('ring NMO: pierścień zasilany z GPZ z otwartym punktem — obie strony pod napięciem', () => {
    const enm = emptyEnm();
    enm.buses = [
      { id: 'b_gpz', ref_id: 'b_gpz', name: 'GPZ', voltage_kv: 15 } as never,
      { id: 'b_a', ref_id: 'b_a', name: 'A', voltage_kv: 15 } as never,
      { id: 'b_b', ref_id: 'b_b', name: 'B', voltage_kv: 15 } as never,
      { id: 'b_c', ref_id: 'b_c', name: 'C', voltage_kv: 15 } as never,
    ];
    enm.sources = [
      { id: 'src', ref_id: 'src', name: 'Grid', bus_ref: 'b_gpz', model: 'short_circuit_power', sk3_mva: 250 } as never,
    ];
    enm.branches = [
      // Tor 1: GPZ → A → B
      { id: 'c1', ref_id: 'c1', name: 'GPZ-A', type: 'cable', from_bus_ref: 'b_gpz', to_bus_ref: 'b_a', status: 'closed', length_km: 1, r_ohm_per_km: 0.2, x_ohm_per_km: 0.08 } as never,
      { id: 'c2', ref_id: 'c2', name: 'A-B', type: 'cable', from_bus_ref: 'b_a', to_bus_ref: 'b_b', status: 'closed', length_km: 1, r_ohm_per_km: 0.2, x_ohm_per_km: 0.08 } as never,
      // Tor 2: GPZ → C
      { id: 'c3', ref_id: 'c3', name: 'GPZ-C', type: 'cable', from_bus_ref: 'b_gpz', to_bus_ref: 'b_c', status: 'closed', length_km: 1, r_ohm_per_km: 0.2, x_ohm_per_km: 0.08 } as never,
      // NMO: B-C otwarte (punkt podziału pierścienia)
      { id: 'nmo_bc', ref_id: 'nmo_bc', name: 'NMO B-C', type: 'breaker', from_bus_ref: 'b_b', to_bus_ref: 'b_c', status: 'open' } as never,
    ];

    const h = buildSupplyPathHighlight(enm);

    // Obie strony pierścienia zasilane mimo NMO.
    expect(h.energizedBusRefs).toEqual(['b_a', 'b_b', 'b_c', 'b_gpz']);
    expect(h.energizedBranchRefs).toEqual(['c1', 'c2', 'c3']);
    expect(h.openPointBranchRefs).toEqual(['nmo_bc']);
  });

  it('transformator: 110 kV bus zasila 15 kV bus przez TR', () => {
    const enm = emptyEnm();
    enm.buses = [
      { id: 'b_hv', ref_id: 'b_hv', name: 'HV', voltage_kv: 110 } as never,
      { id: 'b_lv', ref_id: 'b_lv', name: 'LV', voltage_kv: 15 } as never,
    ];
    enm.sources = [
      { id: 'src', ref_id: 'src', name: 'Grid', bus_ref: 'b_hv', model: 'short_circuit_power', sk3_mva: 1000 } as never,
    ];
    enm.transformers = [
      { id: 'tr1', ref_id: 'tr1', name: 'TR1', hv_bus_ref: 'b_hv', lv_bus_ref: 'b_lv', sn_mva: 25, uhv_kv: 110, ulv_kv: 15, uk_percent: 10.5, pk_kw: 80 } as never,
    ];

    const h = buildSupplyPathHighlight(enm);

    expect(h.energizedBusRefs).toEqual(['b_hv', 'b_lv']);
    expect(h.energizedTransformerRefs).toEqual(['tr1']);
  });

  it('generator: PV przyłączony do energized bus → energized', () => {
    const enm = emptyEnm();
    enm.buses = [
      { id: 'b_gpz', ref_id: 'b_gpz', name: 'GPZ', voltage_kv: 15 } as never,
      { id: 'b_pv', ref_id: 'b_pv', name: 'PV', voltage_kv: 0.4 } as never,
    ];
    enm.sources = [
      { id: 'src', ref_id: 'src', name: 'Grid', bus_ref: 'b_gpz', model: 'short_circuit_power', sk3_mva: 250 } as never,
    ];
    enm.transformers = [
      { id: 'tr_pv', ref_id: 'tr_pv', name: 'TR PV', hv_bus_ref: 'b_gpz', lv_bus_ref: 'b_pv', sn_mva: 0.5, uhv_kv: 15, ulv_kv: 0.4, uk_percent: 6, pk_kw: 5 } as never,
    ];
    enm.generators = [
      { id: 'gen_pv', ref_id: 'gen_pv', name: 'PV-1', gen_type: 'pv_inverter', bus_ref: 'b_pv' } as never,
    ];

    const h = buildSupplyPathHighlight(enm);

    expect(h.energizedGeneratorRefs).toEqual(['gen_pv']);
  });

  it('determinizm: ten sam ENM → identyczny wynik 10 razy', () => {
    const enm = emptyEnm();
    enm.buses = [
      { id: 'b1', ref_id: 'b1', name: 'B1', voltage_kv: 15 } as never,
      { id: 'b2', ref_id: 'b2', name: 'B2', voltage_kv: 15 } as never,
    ];
    enm.sources = [
      { id: 'src', ref_id: 'src', name: 'S', bus_ref: 'b1', model: 'short_circuit_power', sk3_mva: 100 } as never,
    ];
    enm.branches = [
      { id: 'br1', ref_id: 'br1', name: 'B', type: 'cable', from_bus_ref: 'b1', to_bus_ref: 'b2', status: 'closed', length_km: 1, r_ohm_per_km: 0.2, x_ohm_per_km: 0.08 } as never,
    ];
    const first = buildSupplyPathHighlight(enm);
    for (let i = 0; i < 10; i++) {
      const next = buildSupplyPathHighlight(enm);
      expect(next).toEqual(first);
    }
  });
});
