/**
 * trunkOriginResolver — testy rozpoznania punktu wyprowadzenia odcinka SN.
 */

import { describe, it, expect } from 'vitest';

import { resolveTrunkOriginKind, resolveOriginKindFromContext } from '../trunkOriginResolver';
import type { BranchPointSN, EnergyNetworkModel } from '../../../types/enm';

function snapshotWith(overrides: Partial<EnergyNetworkModel>): EnergyNetworkModel {
  return {
    header: { version: 'v1', case_id: 'case', generated_at: '2026-01-01T00:00:00Z' },
    buses: [],
    branches: [],
    transformers: [],
    sources: [],
    loads: [],
    generators: [],
    substations: [],
    bays: [],
    junctions: [],
    branch_points: [],
    corridors: [],
    measurements: [],
    protection_assignments: [],
    ...overrides,
  } as EnergyNetworkModel;
}

describe('resolveOriginKindFromContext', () => {
  it('mapuje sourceType "ZKSN" na pole_liniowe_kablowe_zksn', () => {
    expect(resolveOriginKindFromContext({ source_type_label: 'ZKSN' })).toBe('pole_liniowe_kablowe_zksn');
  });

  it('mapuje sourceType "Słup rozgałęźny" na slup', () => {
    expect(resolveOriginKindFromContext({ source_type_label: 'Słup rozgałęźny' })).toBe('slup');
  });

  it('mapuje sourceType "Stacja SN/nN" na pole_liniowe_kablowe_stacja domyślnie', () => {
    expect(resolveOriginKindFromContext({ source_type_label: 'Stacja SN/nN' })).toBe('pole_liniowe_kablowe_stacja');
  });

  it('uwzględnia jawny bay_kind = pole_liniowe_napowietrzne_stacja', () => {
    expect(
      resolveOriginKindFromContext({
        source_type_label: 'Stacja SN/nN',
        bay_kind: 'pole_liniowe_napowietrzne',
      }),
    ).toBe('pole_liniowe_napowietrzne_stacja');
  });

  it('zwraca null gdy brak danych', () => {
    expect(resolveOriginKindFromContext({})).toBeNull();
    expect(resolveOriginKindFromContext(null)).toBeNull();
  });
});

describe('resolveTrunkOriginKind ze snapshotu', () => {
  it('rozpoznaje ZKSN po from_ref = bp/zksn/1.BRANCH_1', () => {
    const zksn: BranchPointSN = {
      id: 'bp/zksn/1',
      ref_id: 'bp/zksn/1',
      branch_point_type: 'zksn',
      parent_segment_id: 'seg/aaa/cable_1',
      bus_ref: 'bus/z',
      name: 'ZKSN-01',
      ports: { MAIN_IN: 'bus/in', MAIN_OUT: 'bus/out', BRANCH: ['bus/br/1'] }, // ui-terminology-ignore
    } as BranchPointSN;
    const snapshot = snapshotWith({ branch_points: [zksn] });
    expect(
      resolveTrunkOriginKind(snapshot, { from_ref: 'bp/zksn/1.BRANCH_1' }),
    ).toBe('pole_liniowe_kablowe_zksn');
  });

  it('rozpoznaje słup rozgałęźny po from_ref', () => {
    const pole: BranchPointSN = {
      id: 'bp/slup/1',
      ref_id: 'bp/slup/1',
      branch_point_type: 'branch_pole',
      parent_segment_id: 'seg/aaa/line_1',
      bus_ref: 'bus/p',
      name: 'Słup 12',
      ports: { MAIN_IN: 'bus/in', MAIN_OUT: 'bus/out', BRANCH: ['bus/br/1'] }, // ui-terminology-ignore
    } as BranchPointSN;
    const snapshot = snapshotWith({ branch_points: [pole] });
    expect(
      resolveTrunkOriginKind(snapshot, { from_ref: 'bp/slup/1.BRANCH' }),
    ).toBe('slup');
  });

  it('rozpoznaje pole liniowe GPZ po bay + station_type=gpz', () => {
    const snapshot = snapshotWith({
      substations: [{ id: 'gpz/1', ref_id: 'gpz/1', name: 'GPZ', station_type: 'gpz', bus_refs: [], transformer_refs: [] } as never],
      bays: [{ id: 'bay/gpz/1', ref_id: 'bay/gpz/1', bay_role: 'OUT', substation_ref: 'gpz/1', bus_ref: 'bus/sn', equipment_refs: [] } as never],
    });
    expect(
      resolveTrunkOriginKind(snapshot, { field_ref: 'bay/gpz/1' }),
    ).toBe('pole_liniowe_kablowe_gpz');
  });

  it('pole liniowe stacji SN/nN — domyślnie kablowe', () => {
    const snapshot = snapshotWith({
      substations: [{ id: 'stn/1', ref_id: 'stn/1', name: 'Stacja', station_type: 'mv_lv', bus_refs: [], transformer_refs: [] } as never],
      bays: [{ id: 'bay/stn/1', ref_id: 'bay/stn/1', bay_role: 'FEEDER', substation_ref: 'stn/1', bus_ref: 'bus/sn', equipment_refs: [] } as never],
    });
    expect(
      resolveTrunkOriginKind(snapshot, { field_ref: 'bay/stn/1' }),
    ).toBe('pole_liniowe_kablowe_stacja');
  });

  it('pole liniowe stacji z meta.bay_kind=pole_liniowe_napowietrzne → napowietrzne', () => {
    const snapshot = snapshotWith({
      substations: [{ id: 'stn/1', ref_id: 'stn/1', name: 'Stacja', station_type: 'mv_lv', bus_refs: [], transformer_refs: [] } as never],
      bays: [{
        id: 'bay/stn/1',
        ref_id: 'bay/stn/1',
        bay_role: 'FEEDER',
        substation_ref: 'stn/1',
        bus_ref: 'bus/sn',
        equipment_refs: [],
        meta: { bay_kind: 'pole_liniowe_napowietrzne' },
      } as never],
    });
    expect(
      resolveTrunkOriginKind(snapshot, { field_ref: 'bay/stn/1' }),
    ).toBe('pole_liniowe_napowietrzne_stacja');
  });
});
