import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../types/enm';
import { listNnFeederOptions, resolveStationRef } from '../enmResolvers';

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
});
