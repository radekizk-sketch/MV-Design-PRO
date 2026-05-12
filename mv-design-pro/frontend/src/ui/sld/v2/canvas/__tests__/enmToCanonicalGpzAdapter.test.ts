/**
 * enmToCanonicalGpzAdapter tests — Phase R3 (operator-grade rebuild).
 *
 * Pokrycie: ENM → CanonicalGpzProps mapping bez fallback do placeholderów.
 */
import { describe, expect, it } from 'vitest';

import type { Bay, Bus, EnergyNetworkModel, Substation, Transformer } from '../../../../../types/enm';
import { buildCanonicalGpzProps } from '../enmToCanonicalGpzAdapter';

type EnmFragment = Pick<EnergyNetworkModel, 'substations' | 'bays' | 'transformers' | 'buses' | 'generators'>;

function emptyEnm(): EnmFragment {
  return { substations: [], bays: [], transformers: [], buses: [], generators: [] };
}

function gpz(refId: string = 'GPZ-1', overrides: Partial<Substation> = {}): Substation {
  return {
    id: refId,
    ref_id: refId,
    name: 'GPZ Olsztyn 2',
    tags: [],
    meta: {},
    station_type: 'gpz',
    bus_refs: ['bus-15'],
    transformer_refs: [],
    ...overrides,
  } as Substation;
}

function bus(refId: string, voltageKv: number): Bus {
  return {
    id: refId,
    ref_id: refId,
    name: `Szyna ${voltageKv} kV`,
    voltage_kv: voltageKv,
    phase_system: '3ph',
    tags: [],
    meta: {},
  } as Bus;
}

function bay(refId: string, role: Bay['bay_role'], substationRef: string, busRef: string, overrides: Partial<Bay> = {}): Bay {
  return {
    id: refId,
    ref_id: refId,
    name: refId,
    tags: [],
    meta: {},
    bay_role: role,
    substation_ref: substationRef,
    bus_ref: busRef,
    equipment_refs: [],
    ...overrides,
  } as Bay;
}

function transformer(refId: string, overrides: Partial<Transformer> = {}): Transformer {
  return {
    id: refId,
    ref_id: refId,
    name: refId,
    tags: [],
    meta: {},
    hv_bus_ref: 'bus-110',
    lv_bus_ref: 'bus-15',
    sn_mva: 25,
    uhv_kv: 110,
    ulv_kv: 15,
    uk_percent: 12,
    pk_kw: 100,
    ...overrides,
  } as Transformer;
}

/* ---------------------------------------------------------------------------
   Validation
   --------------------------------------------------------------------------- */

describe('buildCanonicalGpzProps — walidacja', () => {
  it('Brak substation → throw', () => {
    const enm = emptyEnm();
    expect(() => buildCanonicalGpzProps(enm, 'NONEXISTENT', { x: 0, y: 0 })).toThrow();
  });

  it('Substation typu mv_lv → throw (NIE GPZ)', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [{ ...gpz('s'), station_type: 'mv_lv' } as Substation],
    };
    expect(() => buildCanonicalGpzProps(enm, 's', { x: 0, y: 0 })).toThrow(/nie jest typu 'gpz'/);
  });
});

/* ---------------------------------------------------------------------------
   Name mapping (NIE placeholder)
   --------------------------------------------------------------------------- */

describe('buildCanonicalGpzProps — nazwa GPZ (zakaz placeholderów)', () => {
  it('Substation.name → CanonicalGpzProps.name', () => {
    const enm: EnmFragment = { ...emptyEnm(), substations: [gpz('GPZ-5', { name: 'GPZ-5 PST' })] };
    const props = buildCanonicalGpzProps(enm, 'GPZ-5', { x: 0, y: 0 });
    expect(props.name).toBe('GPZ-5 PST');
  });

  it('Brak name (pusty string) → "—" (NIE placeholder "GPZ 1")', () => {
    const enm: EnmFragment = { ...emptyEnm(), substations: [gpz('GPZ-5', { name: '' })] };
    const props = buildCanonicalGpzProps(enm, 'GPZ-5', { x: 0, y: 0 });
    expect(props.name).toBe('—');
  });
});

/* ---------------------------------------------------------------------------
   Transformers
   --------------------------------------------------------------------------- */

describe('buildCanonicalGpzProps — transformatory', () => {
  it('Wszystkie transformatory z transformer_refs mapowane', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g', { transformer_refs: ['tr-1', 'tr-2'] })],
      transformers: [
        transformer('tr-1', { name: 'Transformator TR-1', sn_mva: 25 }),
        transformer('tr-2', { name: 'Transformator TR-2', sn_mva: 16 }),
      ],
    };
    const props = buildCanonicalGpzProps(enm, 'g', { x: 0, y: 0 });
    expect(props.transformers).toHaveLength(2);
    expect(props.transformers[0].designation).toBe('TR1');
    expect(props.transformers[1].designation).toBe('TR2');
    expect(props.transformers[0].snMva).toBe(25);
    expect(props.transformers[1].snMva).toBe(16);
  });

  it('Brak transformatorów → pusta tablica (NIE placeholder)', () => {
    const enm: EnmFragment = { ...emptyEnm(), substations: [gpz()] };
    const props = buildCanonicalGpzProps(enm, 'GPZ-1', { x: 0, y: 0 });
    expect(props.transformers).toEqual([]);
  });

  it('Designation extracted from name "TR-1" → "TR1"', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g', { transformer_refs: ['t'] })],
      transformers: [transformer('t', { name: 'TR-1' })],
    };
    const props = buildCanonicalGpzProps(enm, 'g', { x: 0, y: 0 });
    expect(props.transformers[0].designation).toBe('TR1');
  });

  it('Designation fallback "T1" gdy name pusty', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g', { transformer_refs: ['t'] })],
      transformers: [transformer('t', { name: '' })],
    };
    const props = buildCanonicalGpzProps(enm, 'g', { x: 0, y: 0 });
    expect(props.transformers[0].designation).toBe('T1');
  });
});

/* ---------------------------------------------------------------------------
   LV sections
   --------------------------------------------------------------------------- */

describe('buildCanonicalGpzProps — LV sekcje', () => {
  it('gpz_sections explicit → 1:1 mapping', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g', {
        gpz_sections: [
          { section_id: 'sec-1', order: 1, name: 'S1', bus_ref: 'bus-15' },
          { section_id: 'sec-2', order: 2, name: 'S2', bus_ref: 'bus-15' },
        ],
      })],
      buses: [bus('bus-15', 15)],
    };
    const props = buildCanonicalGpzProps(enm, 'g', { x: 0, y: 0 });
    expect(props.sections).toHaveLength(2);
    expect(props.sections[0].label).toBe('S1');
    expect(props.sections[1].label).toBe('S2');
    expect(props.sections[0].busVoltageKv).toBe(15);
  });

  it('Brak gpz_sections + brak bays → []', () => {
    const enm: EnmFragment = { ...emptyEnm(), substations: [gpz()] };
    const props = buildCanonicalGpzProps(enm, 'GPZ-1', { x: 0, y: 0 });
    expect(props.sections).toEqual([]);
  });

  it('Brak gpz_sections ale są bays → auto-syntezuje 1 sekcję domyślną', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz()],
      bays: [bay('b1', 'OUT', 'GPZ-1', 'bus-15')],
      buses: [bus('bus-15', 15)],
    };
    const props = buildCanonicalGpzProps(enm, 'GPZ-1', { x: 0, y: 0 });
    expect(props.sections).toHaveLength(1);
    expect(props.sections[0].label).toBe('S1');
    expect(props.sections[0].sectionId).toMatch(/__synth-section/);
    expect(props.sections[0].bays).toHaveLength(1);
  });

  it('Bays w sekcji mają poprawny fieldRole', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g', {
        gpz_sections: [{ section_id: 's1', order: 1, name: 'S1', bus_ref: 'bus-15' }],
      })],
      bays: [
        bay('b-out', 'OUT', 'g', 'bus-15', { gpz_section_id: 's1' }),
        bay('b-tr', 'TR', 'g', 'bus-15', { gpz_section_id: 's1' }),
      ],
      buses: [bus('bus-15', 15)],
    };
    const props = buildCanonicalGpzProps(enm, 'g', { x: 0, y: 0 });
    const bays = props.sections[0].bays;
    expect(bays.find((b) => b.bayRef === 'b-out')?.fieldRole).toBe('LINE_OUT');
    expect(bays.find((b) => b.bayRef === 'b-tr')?.fieldRole).toBe('TRANSFORMER');
  });

  it('Bays z bay_number + feeder_short_name + outgoing_destination_ref propagowane', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g', {
        gpz_sections: [{ section_id: 's1', order: 1, name: 'S1', bus_ref: 'bus-15' }],
      })],
      bays: [
        bay('b-1', 'OUT', 'g', 'bus-15', {
          gpz_section_id: 's1',
          bay_number: '10',
          feeder_short_name: 'STAROŁĘCKA',
          outgoing_destination_ref: 'ST-001',
        }),
      ],
      buses: [bus('bus-15', 15)],
    };
    const props = buildCanonicalGpzProps(enm, 'g', { x: 0, y: 0 });
    const b = props.sections[0].bays[0];
    expect(b.bayNumber).toBe('10');
    expect(b.feederName).toBe('STAROŁĘCKA');
    expect(b.destinationLabel).toBe('→ ST-001');
  });
});

/* ---------------------------------------------------------------------------
   HV sections
   --------------------------------------------------------------------------- */

describe('buildCanonicalGpzProps — HV sekcje', () => {
  it('gpz_hv_sections explicit → mapping (NIE syntezuje)', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g', {
        gpz_hv_sections: [
          { section_id: 'hv-1', order: 1, name: 'HV-1', bus_ref: 'bus-110' },
        ],
      })],
      buses: [bus('bus-110', 110)],
    };
    const props = buildCanonicalGpzProps(enm, 'g', { x: 0, y: 0 });
    expect(props.hvSections).toHaveLength(1);
    expect(props.hvSections![0].busVoltageKv).toBe(110);
  });

  it('Brak gpz_hv_sections → [] (NIE syntezuje, Inv 9)', () => {
    const enm: EnmFragment = { ...emptyEnm(), substations: [gpz()] };
    const props = buildCanonicalGpzProps(enm, 'GPZ-1', { x: 0, y: 0 });
    expect(props.hvSections).toEqual([]);
  });
});

/* ---------------------------------------------------------------------------
   Couplers
   --------------------------------------------------------------------------- */

describe('buildCanonicalGpzProps — sprzęgła', () => {
  it('Coupler między 2 sekcjami z right_coupler_ref → mapping', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g', {
        gpz_sections: [
          { section_id: 's1', order: 1, name: 'S1', bus_ref: 'bus-15', right_coupler_ref: 'cpl-9' },
          { section_id: 's2', order: 2, name: 'S2', bus_ref: 'bus-15', left_coupler_ref: 'cpl-9' },
        ],
      })],
      bays: [bay('cpl-9', 'COUPLER', 'g', 'bus-15')],
      buses: [bus('bus-15', 15)],
    };
    const props = buildCanonicalGpzProps(enm, 'g', { x: 0, y: 0 });
    expect(props.couplers).toHaveLength(1);
    expect(props.couplers[0].leftSectionId).toBe('s1');
    expect(props.couplers[0].rightSectionId).toBe('s2');
  });

  it('1 sekcja → couplers=[]', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g', {
        gpz_sections: [{ section_id: 's1', order: 1, name: 'S1', bus_ref: 'bus-15' }],
      })],
      buses: [bus('bus-15', 15)],
    };
    const props = buildCanonicalGpzProps(enm, 'g', { x: 0, y: 0 });
    expect(props.couplers).toEqual([]);
  });
});

/* ---------------------------------------------------------------------------
   Q-numbering
   --------------------------------------------------------------------------- */

describe('buildCanonicalGpzProps — Q-numbering IEC 81346', () => {
  it('LINE_OUT → Q0/Q1/Q9/Q8/T1', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g', {
        gpz_sections: [{ section_id: 's1', order: 1, name: 'S1', bus_ref: 'bus-15' }],
      })],
      bays: [bay('b1', 'OUT', 'g', 'bus-15', { gpz_section_id: 's1' })],
      buses: [bus('bus-15', 15)],
    };
    const props = buildCanonicalGpzProps(enm, 'g', { x: 0, y: 0 });
    const q = props.sections[0].bays[0].qDesignations;
    expect(q.cb).toBe('Q0');
    expect(q.dsBus).toBe('Q1');
    expect(q.dsLin).toBe('Q9');
    expect(q.es).toBe('Q8');
    expect(q.ct).toBe('T1');
  });

  it('TRANSFORMER → Q0/Q1/Q8/T1 (brak Q9 line disconnector)', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g', {
        gpz_sections: [{ section_id: 's1', order: 1, name: 'S1', bus_ref: 'bus-15' }],
      })],
      bays: [bay('b1', 'TR', 'g', 'bus-15', { gpz_section_id: 's1' })],
      buses: [bus('bus-15', 15)],
    };
    const props = buildCanonicalGpzProps(enm, 'g', { x: 0, y: 0 });
    const q = props.sections[0].bays[0].qDesignations;
    expect(q.cb).toBe('Q0');
    expect(q.dsBus).toBe('Q1');
    expect(q.dsLin).toBeUndefined();
  });

  it('MEASUREMENT → Q1+Q8 (brak CB)', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g', {
        gpz_sections: [{ section_id: 's1', order: 1, name: 'S1', bus_ref: 'bus-15' }],
      })],
      bays: [bay('b1', 'MEASUREMENT', 'g', 'bus-15', { gpz_section_id: 's1' })],
      buses: [bus('bus-15', 15)],
    };
    const props = buildCanonicalGpzProps(enm, 'g', { x: 0, y: 0 });
    const q = props.sections[0].bays[0].qDesignations;
    expect(q.cb).toBeUndefined();
    expect(q.dsBus).toBe('Q1');
    expect(q.es).toBe('Q8');
  });
});

/* ---------------------------------------------------------------------------
   Header propagation
   --------------------------------------------------------------------------- */

describe('buildCanonicalGpzProps — header (transmisja + bilans + alarmy)', () => {
  it('options.balance + alarms + transmissionStatus propagowane', () => {
    const enm: EnmFragment = { ...emptyEnm(), substations: [gpz()] };
    const props = buildCanonicalGpzProps(enm, 'GPZ-1', {
      x: 0,
      y: 0,
      transmissionStatus: 'ok',
      controlAvailability: 'remote',
      balance: { pMw: -3.1, qMvar: -0.4 },
      alarms: { enclosureDoorOpen: true },
      addressLine: 'ul. Poznańska 13/15',
      radioId: 'radio nr 587',
    });
    expect(props.transmissionStatus).toBe('ok');
    expect(props.controlAvailability).toBe('remote');
    expect(props.balance).toEqual({ pMw: -3.1, qMvar: -0.4 });
    expect(props.alarms?.enclosureDoorOpen).toBe(true);
    expect(props.addressLine).toBe('ul. Poznańska 13/15');
    expect(props.radioId).toBe('radio nr 587');
  });
});

/* ---------------------------------------------------------------------------
   Determinizm
   --------------------------------------------------------------------------- */

describe('buildCanonicalGpzProps — determinizm', () => {
  it('Same ENM → same props (5 reruny)', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g', {
        transformer_refs: ['t1', 't2'],
        gpz_sections: [{ section_id: 's1', order: 1, name: 'S1', bus_ref: 'bus-15' }],
      })],
      transformers: [transformer('t1'), transformer('t2')],
      bays: [bay('b1', 'OUT', 'g', 'bus-15', { gpz_section_id: 's1' })],
      buses: [bus('bus-15', 15)],
    };
    const ref = buildCanonicalGpzProps(enm, 'g', { x: 0, y: 0 });
    for (let i = 0; i < 5; i++) {
      expect(buildCanonicalGpzProps(enm, 'g', { x: 0, y: 0 })).toEqual(ref);
    }
  });
});
describe('buildCanonicalGpzProps - regresja przypisania pol SN do sekcji', () => {
  it('nie zostawia pustej rozdzielni, gdy pola maja bus_ref, ale nie maja gpz_section_id', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g', {
        gpz_sections: [
          { section_id: 's1', order: 1, name: 'S1', bus_ref: 'bus-15' },
          { section_id: 's2', order: 2, name: 'S2', bus_ref: 'bus-15' },
        ],
      })],
      bays: [
        bay('bay-01', 'OUT', 'g', 'bus-15', { bay_number: '1' }),
        bay('bay-02', 'OUT', 'g', 'bus-15', { bay_number: '2' }),
        bay('bay-03', 'TR', 'g', 'bus-15', { bay_number: '3' }),
        bay('bay-04', 'MEASUREMENT', 'g', 'bus-15', { bay_number: '4' }),
      ],
      buses: [bus('bus-15', 15)],
    };

    const props = buildCanonicalGpzProps(enm, 'g', { x: 0, y: 0 });

    expect(props.sections).toHaveLength(2);
    expect(props.sections[0].bays.map((b) => b.bayRef)).toEqual(['bay-01', 'bay-03']);
    expect(props.sections[1].bays.map((b) => b.bayRef)).toEqual(['bay-02', 'bay-04']);
  });
});
describe('buildCanonicalGpzProps - meta.field_specs', () => {
  it('renderuje pola SN GPZ zapisane jako field_specs, gdy snapshot.bays jest pusty', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g', {
        meta: {
          field_specs: [
            { field_ref: 'field-01', name: 'Pole odpływowe SN 1', bay_role: 'OUT', bus_ref: 'bus-15', gpz_section_id: 's1', bay_number: '1' },
            { field_ref: 'field-02', name: 'Pole odpływowe SN 2', bay_role: 'OUT', bus_ref: 'bus-15', gpz_section_id: 's2', bay_number: '2' },
          ],
        },
        gpz_sections: [
          { section_id: 's1', order: 1, name: 'S1', bus_ref: 'bus-15' },
          { section_id: 's2', order: 2, name: 'S2', bus_ref: 'bus-15' },
        ],
      })],
      bays: [],
      buses: [bus('bus-15', 15)],
    };

    const props = buildCanonicalGpzProps(enm, 'g', { x: 0, y: 0 });

    expect(props.sections[0].bays.map((bay) => bay.bayRef)).toEqual(['field-01']);
    expect(props.sections[1].bays.map((bay) => bay.bayRef)).toEqual(['field-02']);
  });
});
