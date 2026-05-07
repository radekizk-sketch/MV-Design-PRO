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
      base_model: {
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
      },
    },
  } as FieldReadModelItem;
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
