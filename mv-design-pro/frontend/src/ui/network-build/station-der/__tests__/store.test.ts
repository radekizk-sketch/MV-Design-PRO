/**
 * Testy useStationDerStore — single source of truth dla integracji E-13 ↔ DER.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  useStationDerStore,
  selectDersOfStation,
  selectStationOfDer,
  selectDerById,
  selectDerCountByKind,
} from '../store';
import { computeDerCompleteness } from '../types';

const FROZEN_NOW = '2026-05-06T10:00:00Z';

const SAMPLE_PV: Parameters<typeof useStationDerStore.getState>[0] extends never
  ? never
  : Parameters<ReturnType<typeof useStationDerStore.getState>['attachDer']>[0] = {
  id: 'der_pv_001',
  project_id: 'projekt-test',
  station_id: 'station_001',
  der_kind: 'PV',
  name: 'PV Centralna 1',
  connection_side: 'SN',
  pcc_ref: 'pcc_001',
  bay_ref: 'bay_001',
  voltage_level_ref: 'lv_0_69kV',
  catalogs: {
    device_catalog_ref: 'pv_inv_sma_2500',
  },
  profiles: {
    nc_rfg_profile_ref: 'ncrfg_pse',
  },
  nominal_power_kw: 2500,
  created_at: FROZEN_NOW,
};

const SAMPLE_BESS = {
  ...SAMPLE_PV,
  id: 'der_bess_001',
  der_kind: 'BESS' as const,
  name: 'BESS Centralna 1',
  connection_side: 'nN' as const,
  bay_ref: null,
  lv_busbar_ref: 'busbar_001',
  catalogs: {
    device_catalog_ref: 'bess_pcs_abb_500',
    battery_catalog_ref: 'bess_bat_byd_2880',
  },
  nominal_power_kw: 500,
};

describe('useStationDerStore — single source of truth E-13 ↔ DER', () => {
  beforeEach(() => {
    useStationDerStore.getState().reset();
  });

  it('attachDer dodaje DER ze station_id i wszystkimi polami', () => {
    const der = useStationDerStore.getState().attachDer(SAMPLE_PV);
    expect(der.id).toBe('der_pv_001');
    expect(der.station_id).toBe('station_001');
    expect(der.der_kind).toBe('PV');
    expect(der.connection_side).toBe('SN');
    expect(der.pcc_ref).toBe('pcc_001');
    expect(der.completeness).toBe('complete');
    expect(der.created_at).toBe(FROZEN_NOW);
  });

  it('detachDer usuwa DER ze store', () => {
    useStationDerStore.getState().attachDer(SAMPLE_PV);
    useStationDerStore.getState().detachDer('der_pv_001');
    expect(useStationDerStore.getState().ders['der_pv_001']).toBeUndefined();
  });

  it('updateDerCatalogs aktualizuje catalog selections + completeness', () => {
    useStationDerStore.getState().attachDer({
      ...SAMPLE_PV,
      catalogs: {}, // brak device → missing_catalog
    });
    expect(useStationDerStore.getState().ders[SAMPLE_PV.id].completeness).toBe('missing_catalog');

    useStationDerStore.getState().updateDerCatalogs(
      SAMPLE_PV.id,
      { device_catalog_ref: 'pv_inv_sma_2500' },
    );
    expect(useStationDerStore.getState().ders[SAMPLE_PV.id].completeness).toBe('complete');
  });

  it('updateDerProfiles wymaga nc_rfg_profile_ref dla complete', () => {
    useStationDerStore.getState().attachDer({
      ...SAMPLE_PV,
      profiles: {}, // brak NC RfG → missing_profile
    });
    expect(useStationDerStore.getState().ders[SAMPLE_PV.id].completeness).toBe('missing_profile');
    useStationDerStore.getState().updateDerProfiles(
      SAMPLE_PV.id,
      { nc_rfg_profile_ref: 'ncrfg_pse' },
    );
    expect(useStationDerStore.getState().ders[SAMPLE_PV.id].completeness).toBe('complete');
  });

  it('updateDerConnection zmienia connection_side i wpływa na completeness', () => {
    useStationDerStore.getState().attachDer(SAMPLE_PV);
    useStationDerStore.getState().updateDerConnection(SAMPLE_PV.id, {
      connection_side: 'nN',
      bay_ref: null,
      lv_busbar_ref: 'busbar_xyz',
    });
    expect(useStationDerStore.getState().ders[SAMPLE_PV.id].connection_side).toBe('nN');
    expect(useStationDerStore.getState().ders[SAMPLE_PV.id].lv_busbar_ref).toBe('busbar_xyz');
  });

  it('completeness = no_pcc gdy brak pcc_ref', () => {
    const result = computeDerCompleteness({
      connection_side: 'SN',
      pcc_ref: null,
      catalogs: { device_catalog_ref: 'x' } as never,
      profiles: { nc_rfg_profile_ref: 'y' } as never,
      voltage_level_ref: 'z',
    });
    expect(result).toBe('no_pcc');
  });

  it('selectDersOfStation zwraca wszystkie DERy stacji posortowane po id', () => {
    useStationDerStore.getState().attachDer(SAMPLE_PV);
    useStationDerStore.getState().attachDer(SAMPLE_BESS);
    useStationDerStore.getState().attachDer({
      ...SAMPLE_PV,
      id: 'der_pv_002',
      station_id: 'station_other',
    });

    const dersOfStation = selectDersOfStation(useStationDerStore.getState(), 'station_001');
    expect(dersOfStation).toHaveLength(2);
    expect(dersOfStation.map((d) => d.id)).toEqual(['der_bess_001', 'der_pv_001']);
  });

  it('selectStationOfDer mapuje DER → station_id', () => {
    useStationDerStore.getState().attachDer(SAMPLE_PV);
    expect(selectStationOfDer(useStationDerStore.getState(), 'der_pv_001')).toBe('station_001');
    expect(selectStationOfDer(useStationDerStore.getState(), 'unknown')).toBeNull();
  });

  it('selectDerById zwraca DER po id albo null', () => {
    useStationDerStore.getState().attachDer(SAMPLE_PV);
    expect(selectDerById(useStationDerStore.getState(), 'der_pv_001')?.name).toBe('PV Centralna 1');
    expect(selectDerById(useStationDerStore.getState(), 'unknown')).toBeNull();
  });

  it('selectDerCountByKind agreguje liczbę PV/BESS/FW per stacja', () => {
    useStationDerStore.getState().attachDer(SAMPLE_PV);
    useStationDerStore.getState().attachDer({ ...SAMPLE_PV, id: 'der_pv_002' });
    useStationDerStore.getState().attachDer(SAMPLE_BESS);
    useStationDerStore.getState().attachDer({
      ...SAMPLE_BESS,
      id: 'der_fw_001',
      der_kind: 'FW',
      catalogs: { device_catalog_ref: 'wt_vestas_v117_3450' },
    });

    const counts = selectDerCountByKind(useStationDerStore.getState(), 'station_001');
    expect(counts).toEqual({ pv: 2, bess: 1, fw: 1, total: 4 });
  });

  it('determinizm: identyczna sekwencja → identyczny stan (sortowanie po id)', () => {
    const state1 = (() => {
      useStationDerStore.getState().reset();
      useStationDerStore.getState().attachDer({ ...SAMPLE_PV, id: 'b' });
      useStationDerStore.getState().attachDer({ ...SAMPLE_PV, id: 'a' });
      return JSON.stringify(selectDersOfStation(useStationDerStore.getState(), 'station_001').map((d) => d.id));
    })();
    const state2 = (() => {
      useStationDerStore.getState().reset();
      useStationDerStore.getState().attachDer({ ...SAMPLE_PV, id: 'a' });
      useStationDerStore.getState().attachDer({ ...SAMPLE_PV, id: 'b' });
      return JSON.stringify(selectDersOfStation(useStationDerStore.getState(), 'station_001').map((d) => d.id));
    })();
    expect(state1).toBe(state2);
    expect(state1).toBe('["a","b"]');
  });

  it('updateDerReadiness aktualizuje pojedynczą oś macierzy', () => {
    useStationDerStore.getState().attachDer(SAMPLE_PV);
    useStationDerStore.getState().updateDerReadiness(SAMPLE_PV.id, {
      sc_3f: 'ready',
      frt: 'partial',
    });
    const der = useStationDerStore.getState().ders[SAMPLE_PV.id];
    expect(der.readiness.sc_3f).toBe('ready');
    expect(der.readiness.frt).toBe('partial');
    expect(der.readiness.sc_1f).toBe('blocked');
  });
});
