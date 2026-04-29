import { describe, expect, it } from 'vitest';
import { projectEnergyNetworkModelToSemantic } from '../enmAdapter';
import type { EnergyNetworkModel } from '../../../types/enm';

function snapshotWithFieldSpecs(): Partial<EnergyNetworkModel> {
  return {
    header: {
      enm_version: '1.0',
      name: 'Projekt field specs',
      created_at: '2026-04-29T00:00:00Z',
      updated_at: '2026-04-29T00:00:00Z',
      revision: 1,
      hash_sha256: 'hash-field-specs',
      defaults: { frequency_hz: 50, unit_system: 'SI' },
    },
    buses: [
      {
        id: 'bus-1',
        ref_id: 'bus-sn-1',
        name: 'Szyna SN',
        tags: [],
        meta: {},
        voltage_kv: 15,
        phase_system: '3ph',
      },
    ],
    substations: [
      {
        id: 'gpz-1',
        ref_id: 'gpz-1',
        name: 'GPZ',
        tags: [],
        station_type: 'gpz',
        bus_refs: ['bus-sn-1'],
        transformer_refs: [],
        meta: {
          field_specs: [
            {
              field_ref: 'gpz-1/bay/out-1',
              name: 'Pole odpływowe SN',
              bay_role: 'OUT',
              bus_ref: 'bus-sn-1',
              equipment_refs: ['breaker-1'],
              tags: [],
              meta: {},
            },
          ],
        },
      },
    ],
    bays: [],
    sources: [],
    branches: [],
    transformers: [],
  };
}

describe('ENM adapter field_specs', () => {
  it('projects canonical substation field_specs as semantic MV bay elements', () => {
    const semanticModel = projectEnergyNetworkModelToSemantic(snapshotWithFieldSpecs());

    const bay = semanticModel?.elements.find((element) => element.refId === 'gpz-1/bay/out-1');
    expect(bay).toMatchObject({
      elementKind: 'MV_BAY',
      engineeringRole: 'LINE_FEEDER_BAY',
      voltageDomain: 'SN',
      bayFunction: 'ODPLYWOWE_LINIOWE',
      connectedBusbarSectionRefId: 'bus-sn-1',
      mainSwitchingDeviceRefId: 'breaker-1',
    });
    expect(bay?.ports).toEqual([
      expect.objectContaining({
        role: 'BAY_SN_OUT',
        voltageDomain: 'SN',
        connectionSide: 'STRONA_LINII',
      }),
    ]);
    expect(semanticModel?.connections).toContainEqual(
      expect.objectContaining({
        connectionId: 'gpz-1/bay/out-1:bus',
        validatedByRuleRefs: ['SEM-BAY-BUSBAR'],
      }),
    );
  });

  it('projects MV/LV stations with semantic SN and nN ports', () => {
    const semanticModel = projectEnergyNetworkModelToSemantic({
      ...snapshotWithFieldSpecs(),
      buses: [
        ...snapshotWithFieldSpecs().buses!,
        {
          id: 'bus-nn-1',
          ref_id: 'bus-nn-1',
          name: 'Szyna nN',
          tags: [],
          meta: {},
          voltage_kv: 0.4,
          phase_system: '3ph',
        },
      ],
      substations: [
        ...snapshotWithFieldSpecs().substations!,
        {
          id: 'st-1',
          ref_id: 'st-1',
          name: 'Stacja przelotowa',
          tags: [],
          station_type: 'inline',
          bus_refs: ['bus-sn-1', 'bus-nn-1'],
          transformer_refs: ['tr-1'],
          meta: {},
        },
      ],
    });

    const station = semanticModel?.elements.find((element) => element.refId === 'st-1');
    expect(station).toMatchObject({
      elementKind: 'MV_LV_STATION',
      engineeringRole: 'MV_LV_STATION',
      voltageDomain: 'SN',
    });
    expect(station?.ports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'BUSBAR_SN', voltageDomain: 'SN' }),
        expect.objectContaining({ role: 'BUSBAR_NN', voltageDomain: 'NN' }),
      ]),
    );
  });
});
