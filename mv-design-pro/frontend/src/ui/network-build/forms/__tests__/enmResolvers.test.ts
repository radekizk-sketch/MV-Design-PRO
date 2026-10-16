import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../types/enm';
import {
  listNnFeederOptions,
  listNnLoadOptions,
  resolveNnLoadRef,
  resolveStationRef,
  stationLabel,
} from '../enmResolvers';

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
        meta: {
          nn_field_specs: [
            {
              field_ref: 'nn-feeder-1',
              name: 'Odpływ nN 1',
              bay_role: 'FEEDER',
              bus_ref: 'bus-nn-ref',
              meta: { feeder_role: 'ODPLYW_NN' },
            },
          ],
        },
        station_type: 'mv_lv',
        bus_refs: ['bus-nn-ref'],
        transformer_refs: [],
      },
    ],
    bays: [],
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

  it('pokazuje odpływ nN zapisany w meta stacji także dla kontekstu z id stacji', () => {
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

    // Karta ETYKIETA-STACJI-PRZELOTOWEJ: rodzaj z topologii, nie z deklaracji „inline" —
    // stacja fikstury nie ma dwóch połączonych pól liniowych.
    expect(stationLabel(snapshot, 'station-id')).toBe('S01 · Stacja końcowa');
  });
});

describe('listNnLoadOptions / resolveNnLoadRef (kreator wyłącznika różnicowoprądowego nN)', () => {
  const migawka = {
    buses: [
      { id: 'b1', ref_id: 'b1', name: 'Szyna nN 1', voltage_kv: 0.4 },
      { id: 'b2', ref_id: 'b2', name: 'Szyna nN 2', voltage_kv: 0.4 },
      { id: 'bs', ref_id: 'bs', name: 'Szyna SN', voltage_kv: 15 },
    ],
    loads: [
      { id: 'l-z', ref_id: 'l-z', name: 'Zakład', bus_ref: 'b1' },
      { id: 'l-a2', ref_id: 'l-a2', name: 'Apteka', bus_ref: 'b2' },
      { id: 'l-a1', ref_id: 'l-a1', name: 'Apteka', bus_ref: 'b2' },
      { id: 'l-sn', ref_id: 'l-sn', name: 'Odbiór SN', bus_ref: 'bs' },
      { id: 'l-x', ref_id: 'l-x', name: 'Bez szyny', bus_ref: 'brak' },
    ],
    branches: [
      { id: 'r', ref_id: 'r', name: '', meta: { device_role: 'RCD', load_ref: 'l-z' } },
      { id: 'k', ref_id: 'k', name: 'Kabel', meta: { load_ref: 'l-a1' } },
    ],
  } as unknown as EnergyNetworkModel;

  it('tylko odbiory w paśmie nN, kolejność nazwa → ref, RCD rozpoznany po meta.device_role', () => {
    expect(listNnLoadOptions(migawka)).toEqual([
      { ref_id: 'l-a1', name: 'Apteka', bus_ref: 'b2', bus_name: 'Szyna nN 2', rcd_name: null },
      { ref_id: 'l-a2', name: 'Apteka', bus_ref: 'b2', bus_name: 'Szyna nN 2', rcd_name: null },
      // Gałąź RCD bez nazwy — etykieta z refu (nigdy pusty napis).
      { ref_id: 'l-z', name: 'Zakład', bus_ref: 'b1', bus_name: 'Szyna nN 1', rcd_name: 'r' },
    ]);
    expect(listNnLoadOptions(null)).toEqual([]);
  });

  it('kontekst: jawne load_ref ma pierwszeństwo przed element_ref; odbiór SN nie jest rozstrzygnięciem', () => {
    expect(resolveNnLoadRef({ load_ref: 'l-z', element_ref: 'l-a1' }, migawka)).toBe('l-z');
    expect(resolveNnLoadRef({ element_ref: 'l-a1' }, migawka)).toBe('l-a1');
    expect(resolveNnLoadRef({ focus_ref: 'l-a2' }, migawka)).toBe('l-a2');
    expect(resolveNnLoadRef({ load_ref: 'l-sn' }, migawka)).toBeNull();
  });

  it('kontekst szyny: jeden odbiór → rozstrzygnięty, kilka → null (bez domysłu), brak kontekstu → null', () => {
    expect(resolveNnLoadRef({ bus_nn_ref: 'b1' }, migawka)).toBe('l-z');
    expect(resolveNnLoadRef({ element_ref: 'b2' }, migawka)).toBeNull();
    expect(resolveNnLoadRef(undefined, migawka)).toBeNull();
    expect(resolveNnLoadRef({ load_ref: 'l-z' }, null)).toBeNull();
  });
});
