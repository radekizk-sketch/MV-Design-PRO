import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../types/enm';
import { listNnFeederOptions, listNnSourceFieldOptions, resolveStationRef, stationLabel } from '../enmResolvers';
import { pole } from '../../../../test/pola';

function snapshotWithCanonicalNnField(): EnergyNetworkModel {
  return {
    header: {
      enm_version: '1.0',
      name: 'Test',
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-01T00:00:00.000Z',
      revision: 1,
      hash_sha256: '',
      defaults: { frequency_hz: 50, unit_system: 'SI' },
    },
    buses: [
      {
        id: 'bus-nn-id',
        ref_id: 'bus-nn-ref',
        name: 'Szyna nN stacji',
        tags: [],
        meta: {},
        voltage_kv: 0.4,
        phase_system: '3ph',
      },
    ],
    branches: [],
    transformers: [],
    sources: [],
    loads: [],
    generators: [],
    substations: [
      {
        id: 'station-id',
        ref_id: 'station-ref',
        name: 'Stacja SN/nN 1',
        tags: [],
        meta: {},
        station_type: 'mv_lv',
        bus_refs: ['bus-nn-ref'],
        transformer_refs: [],
      },
    ],
    // Karta W5-B: pole nN stacji = rekord `bays` na szynie nN.
    bays: [
      pole({
        ref_id: 'nn-feeder-1',
        name: 'Odpływ nN 1',
        bay_role: 'FEEDER',
        substation_ref: 'station-ref',
        bus_ref: 'bus-nn-ref',
        meta: { feeder_role: 'ODPLYW_NN' },
      }),
    ],
    junctions: [],
    corridors: [],
    measurements: [],
    protection_assignments: [],
  };
}

describe('enmResolvers', () => {
  it('normalizuje id stacji do ref_id przy formularzach odpływów nN', () => {
    const snapshot = snapshotWithCanonicalNnField();

    expect(resolveStationRef({ station_ref: 'station-id' }, snapshot)).toBe('station-ref');
  });

  it('pokazuje odpływ nN (rekord pola nN stacji) także dla kontekstu z id stacji', () => {
    const snapshot = snapshotWithCanonicalNnField();

    expect(listNnFeederOptions(snapshot, 'station-id', 'bus-nn-ref')).toEqual([
      {
        ref_id: 'nn-feeder-1',
        name: 'Odpływ nN 1',
        kind: 'ODPLYW_NN',
        bus_ref: 'bus-nn-ref',
      },
    ]);
  });

  it('zastępuje roboczą nazwę stacji publicznym oznaczeniem technicznym', () => {
    const snapshot = snapshotWithCanonicalNnField();
    snapshot.substations[0].name = 'Stacja inline';
    snapshot.substations[0].station_type = 'inline';

    expect(stationLabel(snapshot, 'station-id')).toBe('S01 · Stacja przelotowa');
  });

  /**
   * Karta W5-B: JEDEN klasyfikator pola nN (rekord `bays`). Iloczyn: {odpływ: rola FEEDER, rola
   * odpływu ODPLYW_NN} × {źródło: `source_field_kind` (BESS, WIND), rola odpływu ZRODLO_NN_FW,
   * rola OZE bez technologii, rola ZRODLO_* bez znanej technologii} × {szyna nN, szyna SN}.
   */
  it('klasyfikuje pola nN z rekordów `bays`; pola na szynie SN nie są polami nN', () => {
    const snapshot = snapshotWithCanonicalNnField();
    snapshot.buses.push({ id: 'bus-sn-ref', ref_id: 'bus-sn-ref', name: 'SN', tags: [], meta: {}, voltage_kv: 15, phase_system: '3ph' } as never);
    const nn = (ref: string, bay_role: 'FEEDER' | 'OZE' | 'OUT', meta: Record<string, unknown>, bus = 'bus-nn-ref') =>
      pole({ ref_id: ref, name: ref, bay_role, substation_ref: 'station-ref', bus_ref: bus, meta });
    snapshot.bays = [
      nn('odp-rola', 'FEEDER', {}),
      nn('odp-meta', 'OUT', { feeder_role: 'ODPLYW_NN' }),
      nn('zr-bess', 'OUT', { source_field_kind: 'BESS' }),
      nn('zr-wiatr', 'OZE', { source_field_kind: 'WIND' }),
      nn('zr-fw', 'OUT', { feeder_role: 'ZRODLO_NN_FW' }),
      nn('zr-oze', 'OZE', {}),
      nn('zr-inne', 'OUT', { feeder_role: 'ZRODLO_NN_NOWE' }),
      nn('sn-feeder', 'FEEDER', {}, 'bus-sn-ref'),
      nn('sn-oze', 'OZE', {}, 'bus-sn-ref'),
    ];
    expect(listNnFeederOptions(snapshot, 'station-ref', null).map((o) => [o.ref_id, o.kind])).toEqual([
      ['odp-meta', 'ODPLYW_NN'],
      ['odp-rola', 'ODPLYW_NN'],
    ]);
    expect(listNnSourceFieldOptions(snapshot, 'station-ref', null).map((o) => [o.ref_id, o.kind])).toEqual([
      ['zr-bess', 'BESS'],
      ['zr-fw', 'FW'],
      ['zr-inne', 'ZRODLO_NN'],
      ['zr-oze', 'PV'],
      ['zr-wiatr', 'FW'],
    ]);
  });
});
