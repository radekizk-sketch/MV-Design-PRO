/** GPZ P0 — skład aparatów pola z ENM, bez szablonowego dorysowywania. */
import { describe, expect, it } from 'vitest';

import { composeGpz } from '../gpz';
import type { CanonicalGpzBay, GpzCanonicalRendererProps } from '../../../v2/renderer/GpzCanonicalRenderer';

const bay: CanonicalGpzBay = {
  bayRef: 'pole-a-01',
  bayNumber: '01',
  feederName: 'Magistrala',
  destinationLabel: null,
  fieldRole: 'LINE_OUT',
  cbState: 'unknown',
  dsState: 'unknown',
  esState: 'open',
  qDesignations: {},
  // Rzeczywisty zestaw: 1 rozłącznik, CT, uziemnik i zakończenie kabla;
  // brak wyłącznika CB i drugiego odłącznika, więc żaden nie może się pojawić.
  primaryDevices: [
    { kind: 'LOAD_SWITCH', placement: 'UPSTREAM', deviceRef: 'pole-a-01/q1', switchState: 'closed' },
    { kind: 'CT', placement: 'MIDSTREAM', deviceRef: 'pole-a-01/ct1' },
    { kind: 'ES', placement: 'GROUND_BRANCH', deviceRef: 'pole-a-01/es1', switchState: 'open' },
    { kind: 'CABLE_HEAD', placement: 'DOWNSTREAM', deviceRef: 'pole-a-01/k1' },
  ],
};
const gpz: GpzCanonicalRendererProps = {
  id: 'gpz-test',
  x: 0,
  y: 0,
  name: 'GPZ',
  transformers: [],
  sections: [{ sectionId: 'A', order: 1, label: 'A', busVoltageKv: 15, bays: [bay] }],
  couplers: [],
};

describe('GPZ — aparat pierwotny wyłącznie z ENM', () => {
  it('pokazuje faktyczne cztery aparaty z refami, bez fikcyjnego CB i DS', () => {
    const composition = composeGpz(gpz, { x: 0, y: 0 });
    const devices = composition.symbols.filter((s) => s.meta.bayRef === 'pole-a-01');
    expect(devices.map((s) => s.symbolId)).toEqual([
      'loadBreakSwitch', 'currentTransformer', 'cableHead', 'earthSwitch',
    ]);
    expect(devices.map((s) => s.deviceRef)).toEqual([
      'pole-a-01/q1', 'pole-a-01/ct1', 'pole-a-01/k1', 'pole-a-01/es1',
    ]);
    expect(devices.some((s) => s.symbolId === 'breaker' || s.symbolId === 'disconnector')).toBe(false);
    expect(composition.missingData).not.toContain('gpz.bay.primary_devices_missing');
  });


  it('sam bezpiecznik FUSE nie staje się fikcyjnym rozłącznikiem', () => {
    const withFuse = {
      ...gpz,
      sections: [{
        ...gpz.sections[0],
        bays: [{
          ...bay,
          primaryDevices: [
            { kind: 'DS' as const, placement: 'UPSTREAM' as const, deviceRef: 'pole-a-01/ds1', switchState: 'open' as const },
            { kind: 'FUSE' as const, placement: 'MIDSTREAM' as const, deviceRef: 'pole-a-01/f1' },
            { kind: 'CABLE_HEAD' as const, placement: 'DOWNSTREAM' as const, deviceRef: 'pole-a-01/k1' },
          ],
        }],
      }],
    };
    const composition = composeGpz(withFuse, { x: 0, y: 0 });
    const devices = composition.symbols.filter((s) => s.meta.bayRef === bay.bayRef);
    expect(devices.map((s) => s.symbolId)).toEqual(['disconnector', 'fuse', 'cableHead']);
    expect(devices.some((s) => s.symbolId === 'fuseSwitch')).toBe(false);
  });

  it('brak rejestru aparatów jest jawną luką, nie zgodą na manipulację', () => {
    const incomplete = {
      ...gpz,
      sections: [{ ...gpz.sections[0], bays: [{ ...bay, primaryDevices: undefined }] }],
    };
    const composition = composeGpz(incomplete, { x: 0, y: 0 });
    expect(composition.missingData).toContain('gpz.bay.primary_devices_missing');
    expect(composition.symbols.some((s) => s.meta.bayRef === bay.bayRef && s.deviceRef != null)).toBe(false);
  });
});
