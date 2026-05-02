import { describe, expect, it } from 'vitest';

import { buildFieldReadModelOptions } from '../fieldReadModelSelectors';
import type { EnergyNetworkModel } from '../../../types/enm';
import type { FieldReadModelItem } from '../useFieldReadModel';

describe('fieldReadModelSelectors', () => {
  it('wyznacza szynę pola GPZ z sekcji GPZ, gdy legacy bay nie ma bus_ref', () => {
    const fieldItem = {
      bay_id: 'bay-gpz-1',
      bay_ref: 'sn/gpz/bay/1',
      bay_name: 'Pole odpływowe SN',
      canonical_model: {
        base_model: {
          bay_ref: 'sn/gpz/bay/1',
          bay_role: 'LINIA_OUT',
          substation_ref: 'gpz-1',
          gpz_section_id: 'A',
          primary_devices: [],
          measurement_chain: null,
          protection_config: null,
          secondary_units: [],
        },
      },
    } as unknown as FieldReadModelItem;

    const snapshot = {
      buses: [
        {
          id: 'bus-gpz-a',
          ref_id: 'bus-gpz-a',
          name: 'Szyna GPZ sekcja A',
          voltage_kv: 15,
        },
      ],
      bays: [],
      substations: [
        {
          id: 'gpz-1',
          ref_id: 'gpz-1',
          name: 'GPZ 1',
          station_type: 'gpz',
          bus_refs: ['bus-gpz-a'],
          transformer_refs: [],
          gpz_sections: [
            {
              section_id: 'A',
              order: 1,
              name: 'Sekcja A',
              bus_ref: 'bus-gpz-a',
            },
          ],
        },
      ],
    } as unknown as EnergyNetworkModel;

    expect(buildFieldReadModelOptions([fieldItem], snapshot)[0]?.bus_name).toBe('Szyna GPZ sekcja A');
  });
});
