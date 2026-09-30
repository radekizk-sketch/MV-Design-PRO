import { describe, expect, it } from 'vitest';

import {
  buildControlDeviceOptions,
  measurementCountsForField,
} from '../fieldControlSelectors';
import type { FieldReadModelItem } from '../useFieldReadModel';

function fieldItem(): FieldReadModelItem {
  return {
    bay_id: 'bay-1',
    bay_ref: 'bay-1',
    bay_name: 'Pole odpływowe',
    canonical_model: {
      schema_version: 'v10.bay.1',
      created_from: 'recznie',
      integrity_status: 'kompletny',
      base_model: {
        bay_ref: 'bay-1',
        bay_role: 'LINIA_ODG',
        specialization: 'BRAK',
        substation_ref: 'station-1',
        primary_devices: [
          {
            device_ref: 'cb-1',
            kind: 'CB',
            placement: 'MIDSTREAM',
            symbol_ref: 'symbol:cb',
            is_controllable: true,
            catalog_ref: 'cb-cat',
          },
          {
            device_ref: 'ct-1',
            kind: 'CT',
            placement: 'MIDSTREAM',
            symbol_ref: 'symbol:ct',
            is_controllable: false,
          },
        ],
        measurement_chain: {
          chain_ref: 'measurements:bay-1',
          ct_refs: ['ct-1', 'ct-2'],
          vt_refs: ['vt-1'],
          uses_3i0: true,
          uses_3u0: false,
          zero_sequence_current_source: 'suma_ct',
          zero_sequence_voltage_source: 'brak',
          topology: 'ct_vt',
          measurement_sets: [],
        },
        secondary_units: [],
        secondary_architecture: {
          type: 'zintegrowane_zabezpieczenie_i_sterownik',
          measurement_provider: 'zabezpieczenie',
        },
        control_surface: {
          controllable_device_refs: ['cb-1'],
          open_requires_confirmation: true,
          close_requires_confirmation: true,
          kas_available: false,
          local_remote_transfer_supported: false,
        },
        interlocks: { entries: [] },
      },
    },
  };
}

describe('fieldControlSelectors', () => {
  it('zwraca aparaty wykonawcze bez przekładników', () => {
    expect(buildControlDeviceOptions(fieldItem())).toEqual([
      {
        ref_id: 'cb-1',
        name: 'wyłącznik cb-1',
        kind: 'CB',
        catalog_ref: 'cb-cat',
      },
    ]);
  });

  it('liczy przekładniki CT i VT z kanonicznego łańcucha pomiarowego', () => {
    expect(measurementCountsForField(fieldItem())).toEqual({ ct: 2, vt: 1 });
  });
});
