import type { EnergyNetworkModel } from '../types/enm';

export function makeCalculationReadySnapshot(): EnergyNetworkModel {
  return {
    header: {
      enm_version: '1.0',
      name: 'Model testowy',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      revision: 1,
      hash_sha256: 'test-ready-snapshot',
      defaults: {
        frequency_hz: 50,
        unit_system: 'SI',
      },
    },
    buses: [
      {
        id: 'bus-source',
        ref_id: 'bus-source',
        name: 'Szyna GPZ',
        tags: [],
        meta: {},
        voltage_kv: 15,
        phase_system: '3ph',
      },
      {
        id: 'bus-load',
        ref_id: 'bus-load',
        name: 'Szyna stacji',
        tags: [],
        meta: {},
        voltage_kv: 15,
        phase_system: '3ph',
      },
    ],
    branches: [
      {
        id: 'line-1',
        ref_id: 'line-1',
        name: 'Odcinek SN 1',
        tags: [],
        meta: {},
        type: 'cable',
        from_bus_ref: 'bus-source',
        to_bus_ref: 'bus-load',
        status: 'closed',
        length_km: 1,
        r_ohm_per_km: 0.12,
        x_ohm_per_km: 0.09,
      },
    ],
    transformers: [],
    sources: [
      {
        id: 'source-1',
        ref_id: 'source-1',
        name: 'Zasilanie GPZ',
        tags: [],
        meta: {},
        bus_ref: 'bus-source',
        model: 'short_circuit_power',
        sk3_mva: 200,
        rx_ratio: 0.1,
      },
    ],
    loads: [],
    generators: [],
    substations: [],
    bays: [],
    junctions: [],
    corridors: [],
    measurements: [],
    protection_assignments: [],
  };
}
