import { describe, expect, it } from 'vitest';

import type {
  CanonicalGpzBay,
  GpzCanonicalRendererProps,
} from '../renderer/GpzCanonicalRenderer';
import { mapCanonicalToSwitchgearProps } from './mapCanonicalToSwitchgearProps';

function baseBay(overrides: Partial<CanonicalGpzBay> = {}): CanonicalGpzBay {
  return {
    bayRef: 'bay-1',
    bayNumber: '10',
    feederName: 'SADY',
    destinationLabel: '→ ST-001 SADY',
    fieldRole: 'LINE_OUT',
    cbState: 'closed',
    dsState: 'closed',
    esState: 'open',
    qDesignations: { cb: 'Q0', dsBus: 'Q1', dsLin: 'Q9', es: 'Q8', ct: 'T1' },
    measurements: null,
    inManipulation: false,
    ...overrides,
  };
}

function baseCanonical(
  overrides: Partial<GpzCanonicalRendererProps> = {},
): GpzCanonicalRendererProps {
  return {
    id: 'gpz-1',
    x: 100,
    y: 200,
    name: 'GPZ-21 KEK',
    transformers: [
      {
        transformerRef: 't1',
        designation: 'TR1',
        snMva: 16,
        uhvKv: 110,
        ulvKv: 15,
        vectorGroup: 'Dyn11',
      },
      {
        transformerRef: 't2',
        designation: 'TR2',
        snMva: 18,
        uhvKv: 110,
        ulvKv: 15,
        vectorGroup: 'Dyn11',
      },
    ],
    sections: [
      {
        sectionId: 'sec-1',
        order: 1,
        label: 'S1',
        busVoltageKv: 15,
        bays: [baseBay()],
      },
    ],
    couplers: [],
    ...overrides,
  };
}

describe('mapCanonicalToSwitchgearProps', () => {
  it('przenosi tożsamość (id/x/y/name)', () => {
    const out = mapCanonicalToSwitchgearProps(baseCanonical());
    expect(out.id).toBe('gpz-1');
    expect(out.x).toBe(100);
    expect(out.y).toBe(200);
    expect(out.name).toBe('GPZ-21 KEK');
  });

  it('wyprowadza voltageHighKv z transformatora i ustawia known=true', () => {
    const out = mapCanonicalToSwitchgearProps(baseCanonical());
    expect(out.voltageHighKv).toBe(110);
    expect(out.voltageHighKvKnown).toBe(true);
    expect(out.voltageLowKv).toBe(15);
  });

  it('voltageHighKv spada do hvSections, gdy brak uhvKv transformatora', () => {
    const out = mapCanonicalToSwitchgearProps(
      baseCanonical({
        transformers: [],
        hvSections: [
          { sectionId: 'hv-1', order: 1, label: 'WN', busVoltageKv: 110, bays: [] },
        ],
      }),
    );
    expect(out.voltageHighKv).toBe(110);
    expect(out.voltageHighKvKnown).toBe(true);
  });

  it('voltageHighKvKnown=false, gdy brak transformatora i brak hvSections (fallback 110)', () => {
    const out = mapCanonicalToSwitchgearProps(
      baseCanonical({ transformers: [], hvSections: undefined }),
    );
    expect(out.voltageHighKv).toBe(110);
    expect(out.voltageHighKvKnown).toBe(false);
  });

  it('voltageLowKv spada do ulvKv transformatora, gdy brak sekcji SN', () => {
    const out = mapCanonicalToSwitchgearProps(baseCanonical({ sections: [] }));
    expect(out.voltageLowKv).toBe(15);
  });

  it('mapuje sekcje SN (label→name/sectionLabel, busVoltageKv, order)', () => {
    const out = mapCanonicalToSwitchgearProps(baseCanonical());
    expect(out.sections).toHaveLength(1);
    const sec = out.sections[0];
    expect(sec.sectionId).toBe('sec-1');
    expect(sec.order).toBe(1);
    expect(sec.name).toBe('S1');
    expect(sec.sectionLabel).toBe('S1');
    expect(sec.busVoltageKv).toBe(15);
    expect(sec.bays).toHaveLength(1);
  });

  it('mapuje hvSections (włącza tryb two-bus)', () => {
    const out = mapCanonicalToSwitchgearProps(
      baseCanonical({
        hvSections: [
          {
            sectionId: 'hv-1',
            order: 1,
            label: 'WN 110 kV',
            busVoltageKv: 110,
            bays: [baseBay({ bayRef: 'hv-bay-1', fieldRole: 'LINE_IN' })],
          },
        ],
      }),
    );
    expect(out.hvSections).toHaveLength(1);
    expect(out.hvSections?.[0].sectionLabel).toBe('WN 110 kV');
    expect(out.hvSections?.[0].busVoltageKv).toBe(110);
    expect(out.hvSections?.[0].bays[0].bayRef).toBe('hv-bay-1');
  });

  it('hvSections jest undefined, gdy kanon nie ma strony WN', () => {
    const out = mapCanonicalToSwitchgearProps(baseCanonical());
    expect(out.hvSections).toBeUndefined();
  });

  it('mapuje pola: bayRef/fieldRole/designation/bayNumber/feederName + stany', () => {
    const out = mapCanonicalToSwitchgearProps(baseCanonical());
    const bay = out.sections[0].bays[0];
    expect(bay.bayRef).toBe('bay-1');
    expect(bay.fieldRole).toBe('LINE_OUT');
    expect(bay.designation).toBe('SADY');
    expect(bay.bayNumber).toBe('10');
    expect(bay.feederName).toBe('SADY');
    expect(bay.hasMissingRequiredDevice).toBe(false);
    expect(bay.cbState).toBe('closed');
    expect(bay.dsState).toBe('closed');
    expect(bay.esState).toBe('open');
    expect(bay.inManipulation).toBe(false);
  });

  it('designation spada do bayNumber, a potem do bayRef', () => {
    const noFeeder = mapCanonicalToSwitchgearProps(
      baseCanonical({
        sections: [
          {
            sectionId: 'sec-1',
            order: 1,
            label: 'S1',
            busVoltageKv: 15,
            bays: [baseBay({ feederName: null })],
          },
        ],
      }),
    );
    expect(noFeeder.sections[0].bays[0].designation).toBe('10');

    const noFeederNoNumber = mapCanonicalToSwitchgearProps(
      baseCanonical({
        sections: [
          {
            sectionId: 'sec-1',
            order: 1,
            label: 'S1',
            busVoltageKv: 15,
            bays: [baseBay({ feederName: null, bayNumber: null })],
          },
        ],
      }),
    );
    expect(noFeederNoNumber.sections[0].bays[0].designation).toBe('bay-1');
  });

  it('qDesignations: switchgear ds == canonical dsLin (oraz dsLin/dsBus/es/ct/cb)', () => {
    const out = mapCanonicalToSwitchgearProps(baseCanonical());
    const q = out.sections[0].bays[0].qDesignations;
    expect(q).toEqual({ cb: 'Q0', ds: 'Q9', dsLin: 'Q9', dsBus: 'Q1', es: 'Q8', ct: 'T1' });
  });

  it('przepuszcza pomiary z przemianowaniem kluczy (pMw→p, i1A→i1, ...)', () => {
    const out = mapCanonicalToSwitchgearProps(
      baseCanonical({
        sections: [
          {
            sectionId: 'sec-1',
            order: 1,
            label: 'S1',
            busVoltageKv: 15,
            bays: [
              baseBay({
                measurements: {
                  pMw: 2.5,
                  qMvar: 0.4,
                  i1A: 120,
                  i2A: 118,
                  i3A: 121,
                  fHz: 50,
                  u12Kv: 15.1,
                  u23Kv: 15.0,
                  u31Kv: 15.2,
                },
              }),
            ],
          },
        ],
      }),
    );
    expect(out.sections[0].bays[0].measurements).toEqual({
      p: 2.5,
      q: 0.4,
      i1: 120,
      i2: 118,
      i3: 121,
      f: 50,
      u12: 15.1,
      u23: 15.0,
      u31: 15.2,
    });
  });

  it('strip null/undefined kluczy pomiarów i zwraca undefined dla pustego', () => {
    const partial = mapCanonicalToSwitchgearProps(
      baseCanonical({
        sections: [
          {
            sectionId: 'sec-1',
            order: 1,
            label: 'S1',
            busVoltageKv: 15,
            bays: [baseBay({ measurements: { pMw: 1.2, qMvar: null, i1A: null } })],
          },
        ],
      }),
    );
    expect(partial.sections[0].bays[0].measurements).toEqual({ p: 1.2 });

    const allNull = mapCanonicalToSwitchgearProps(
      baseCanonical({
        sections: [
          {
            sectionId: 'sec-1',
            order: 1,
            label: 'S1',
            busVoltageKv: 15,
            bays: [baseBay({ measurements: { pMw: null, qMvar: null } })],
          },
        ],
      }),
    );
    expect(allNull.sections[0].bays[0].measurements).toBeUndefined();
  });

  it('measurements=null → undefined', () => {
    const out = mapCanonicalToSwitchgearProps(baseCanonical());
    expect(out.sections[0].bays[0].measurements).toBeUndefined();
  });

  it('outgoingFeeder pochodzi z destinationLabel; brak → undefined', () => {
    const out = mapCanonicalToSwitchgearProps(baseCanonical());
    expect(out.sections[0].bays[0].outgoingFeeder).toEqual({ destination: '→ ST-001 SADY' });

    const noDest = mapCanonicalToSwitchgearProps(
      baseCanonical({
        sections: [
          {
            sectionId: 'sec-1',
            order: 1,
            label: 'S1',
            busVoltageKv: 15,
            bays: [baseBay({ destinationLabel: null })],
          },
        ],
      }),
    );
    expect(noDest.sections[0].bays[0].outgoingFeeder).toBeUndefined();
  });

  it('protectionCodes pola: canonical → switchgear przepuszczane 1:1', () => {
    const codes = ['87T', '51', '50', '51N', 'Buchholz', 'temp', 'ciśnienie'];
    const out = mapCanonicalToSwitchgearProps(
      baseCanonical({
        sections: [
          {
            sectionId: 'sec-1',
            order: 1,
            label: 'S1',
            busVoltageKv: 15,
            bays: [baseBay({ fieldRole: 'TRANSFORMER', protectionCodes: codes })],
          },
        ],
      }),
    );
    expect(out.sections[0].bays[0].protectionCodes).toEqual(codes);
  });

  it('protectionCodes nieobecne na canonical → undefined na switchgear', () => {
    const out = mapCanonicalToSwitchgearProps(baseCanonical());
    expect(out.sections[0].bays[0].protectionCodes).toBeUndefined();
  });

  it('transformerRefs i transformerMeasurements (apparentMva only — bez oil/uarn/nzacz)', () => {
    const out = mapCanonicalToSwitchgearProps(baseCanonical());
    expect(out.transformerCount).toBe(2);
    expect(out.transformerRefs).toEqual(['t1', 't2']);
    expect(out.transformerMeasurements).toEqual([{ apparentMva: 16 }, { apparentMva: 18 }]);
    for (const m of out.transformerMeasurements ?? []) {
      expect(m).not.toHaveProperty('oilTemperatureC');
      expect(m).not.toHaveProperty('uarnKv');
      expect(m).not.toHaveProperty('nzacz');
    }
  });

  it('couplers: closed przepuszczany z closedState', () => {
    const out = mapCanonicalToSwitchgearProps(
      baseCanonical({
        couplers: [
          {
            couplerId: 'cpl-1',
            leftSectionId: 'sec-1',
            rightSectionId: 'sec-2',
            designation: 'SP1',
            closedState: 'closed',
          },
        ],
      }),
    );
    expect(out.couplers).toHaveLength(1);
    expect(out.couplers[0]).toEqual({
      couplerId: 'cpl-1',
      leftSectionId: 'sec-1',
      rightSectionId: 'sec-2',
      designation: 'SP1',
      closed: 'closed',
    });
  });

  it('nie ustawia badge-y (secondary) ani groundFault/ctRatio/hasKasButton na polach', () => {
    const out = mapCanonicalToSwitchgearProps(baseCanonical());
    const bay = out.sections[0].bays[0];
    expect(bay.secondary).toBeUndefined();
    expect(bay.groundFault).toBeUndefined();
    expect(bay.ctRatio).toBeUndefined();
    expect(bay.hasKasButton).toBeUndefined();
  });
});
