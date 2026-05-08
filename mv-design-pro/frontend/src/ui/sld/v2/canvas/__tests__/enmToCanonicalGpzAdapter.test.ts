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

describe('buildCanonicalGpzProps R16 — receivingStations (pełen mini-RMU)', () => {
  function makeRecvStation(refId: string, name: string, type: Substation['station_type'] = 'mv_lv'): Substation {
    return {
      id: refId,
      ref_id: refId,
      name,
      tags: [],
      meta: {},
      station_type: type,
      bus_refs: [`${refId}-bus-15`],
      transformer_refs: [`${refId}-tr`],
    } as Substation;
  }

  it('GPZ bez bays z outgoing_destination_ref → receivingStations=[]', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g')],
      bays: [bay('b1', 'OUT', 'g', 'bus-15')],
      buses: [bus('bus-15', 15)],
    };
    const props = buildCanonicalGpzProps(enm, 'g', { x: 0, y: 0 });
    expect(props.receivingStations).toEqual([]);
  });

  it('GPZ z 1 bay → 1 receivingStation z bays SN', () => {
    const recvSta = makeRecvStation('sta-1', 'STAROŁĘCKA 42');
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g'), recvSta],
      bays: [
        bay('gpz-b1', 'OUT', 'g', 'bus-15', {
          outgoing_destination_ref: 'sta-1',
          feeder_short_name: 'PST1',
          bay_number: '10',
        }),
        bay('sta-1-b-in', 'IN', 'sta-1', 'sta-1-bus-15'),
        bay('sta-1-b-tr', 'TR', 'sta-1', 'sta-1-bus-15'),
        bay('sta-1-b-out', 'OUT', 'sta-1', 'sta-1-bus-15'),
      ],
      transformers: [transformer('sta-1-tr', { sn_mva: 0.63 })],
      buses: [bus('bus-15', 15), bus('sta-1-bus-15', 15)],
    };
    const props = buildCanonicalGpzProps(enm, 'g', { x: 0, y: 0 });
    expect(props.receivingStations?.length).toBe(1);
    const station = props.receivingStations![0];
    expect(station.stationRef).toBe('sta-1');
    expect(station.name).toBe('STAROŁĘCKA 42');
    expect(station.sourceBayRef).toBe('gpz-b1');
    expect(station.cableNumber).toBe('PST1');
    expect(station.snBays.length).toBe(3);
    expect(station.hasTransformer).toBe(true);
    expect(station.transformerRatedKva).toBe(630);
    expect(station.nnFeedersCount).toBeGreaterThan(0);
    expect(station.footprintType).toBe('mv_lv_terminal');
  });

  it('Stacja receiving z DER → footprintType=der_station + derBadges', () => {
    const recvSta = makeRecvStation('sta-der', 'PV STATION');
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g'), recvSta],
      bays: [
        bay('gpz-b1', 'OUT', 'g', 'bus-15', { outgoing_destination_ref: 'sta-der' }),
        bay('sta-der-b1', 'IN', 'sta-der', 'sta-der-bus-15'),
      ],
      transformers: [transformer('sta-der-tr', { sn_mva: 0.4 })],
      generators: [
        {
          id: 'g1', ref_id: 'g1', name: 'PV1', tags: [], meta: {},
          bus_ref: 'sta-der-bus-15', p_mw: 0.1, gen_type: 'pv_inverter',
          station_ref: 'sta-der',
        } as never,
        {
          id: 'g2', ref_id: 'g2', name: 'BESS1', tags: [], meta: {},
          bus_ref: 'sta-der-bus-15', p_mw: 0.5, gen_type: 'bess',
          station_ref: 'sta-der',
        } as never,
      ],
      buses: [bus('bus-15', 15), bus('sta-der-bus-15', 15)],
    };
    const props = buildCanonicalGpzProps(enm, 'g', { x: 0, y: 0 });
    const station = props.receivingStations![0];
    expect(station.footprintType).toBe('der_station');
    expect(station.derBadges.length).toBe(2);
    expect(station.derBadges.find((b) => b.kind === 'PV')?.count).toBe(1);
    expect(station.derBadges.find((b) => b.kind === 'BESS')?.count).toBe(1);
  });

  it('Stacja receiving z station_type=switching → footprintType=switching_station', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g'), makeRecvStation('sta-sw', 'SP-1', 'switching')],
      bays: [
        bay('gpz-b1', 'OUT', 'g', 'bus-15', { outgoing_destination_ref: 'sta-sw' }),
        bay('sta-sw-b1', 'IN', 'sta-sw', 'sta-sw-bus-15'),
      ],
      buses: [bus('bus-15', 15), bus('sta-sw-bus-15', 15)],
    };
    const props = buildCanonicalGpzProps(enm, 'g', { x: 0, y: 0 });
    expect(props.receivingStations![0].footprintType).toBe('switching_station');
  });

  it('Stacja receiving bez transformer → missingData=true (Inv 9)', () => {
    const recvSta = makeRecvStation('sta-1', 'STA');
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g'), recvSta],
      bays: [
        bay('gpz-b1', 'OUT', 'g', 'bus-15', { outgoing_destination_ref: 'sta-1' }),
        bay('sta-1-b1', 'IN', 'sta-1', 'sta-1-bus-15'),
      ],
      transformers: [], // brak — missingData
      buses: [bus('bus-15', 15), bus('sta-1-bus-15', 15)],
    };
    const props = buildCanonicalGpzProps(enm, 'g', { x: 0, y: 0 });
    expect(props.receivingStations![0].missingData).toBe(true);
    expect(props.receivingStations![0].hasTransformer).toBe(false);
  });

  it('outgoing_destination_ref wskazujący na inny GPZ → pominięty (NIE receiving)', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [
        gpz('g1'),
        gpz('g2', { name: 'GPZ-2' }),
      ],
      bays: [
        bay('gpz-b1', 'OUT', 'g1', 'bus-15', { outgoing_destination_ref: 'g2' }),
      ],
      buses: [bus('bus-15', 15)],
    };
    const props = buildCanonicalGpzProps(enm, 'g1', { x: 0, y: 0 });
    expect(props.receivingStations).toEqual([]);
  });

  it('outgoing_destination_ref wskazujący na nieistniejącą stację → pominięty', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g')],
      bays: [
        bay('gpz-b1', 'OUT', 'g', 'bus-15', { outgoing_destination_ref: 'sta-ghost' }),
      ],
      buses: [bus('bus-15', 15)],
    };
    const props = buildCanonicalGpzProps(enm, 'g', { x: 0, y: 0 });
    expect(props.receivingStations).toEqual([]);
  });

  it('Wiele bays GPZ → wiele receivingStations zachowując mapping sourceBayRef', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [
        gpz('g'),
        makeRecvStation('sta-1', 'STA1'),
        makeRecvStation('sta-2', 'STA2'),
        makeRecvStation('sta-3', 'STA3'),
      ],
      bays: [
        bay('gpz-b1', 'OUT', 'g', 'bus-15', { outgoing_destination_ref: 'sta-1' }),
        bay('gpz-b2', 'OUT', 'g', 'bus-15', { outgoing_destination_ref: 'sta-2' }),
        bay('gpz-b3', 'OUT', 'g', 'bus-15', { outgoing_destination_ref: 'sta-3' }),
        bay('sta-1-b1', 'IN', 'sta-1', 'sta-1-bus-15'),
        bay('sta-2-b1', 'IN', 'sta-2', 'sta-2-bus-15'),
        bay('sta-3-b1', 'IN', 'sta-3', 'sta-3-bus-15'),
      ],
      transformers: [
        transformer('sta-1-tr', { sn_mva: 0.4 }),
        transformer('sta-2-tr', { sn_mva: 0.4 }),
        transformer('sta-3-tr', { sn_mva: 0.4 }),
      ],
      buses: [
        bus('bus-15', 15),
        bus('sta-1-bus-15', 15),
        bus('sta-2-bus-15', 15),
        bus('sta-3-bus-15', 15),
      ],
    };
    const props = buildCanonicalGpzProps(enm, 'g', { x: 0, y: 0 });
    expect(props.receivingStations?.length).toBe(3);
    const sourceBayRefs = props.receivingStations!.map((s) => s.sourceBayRef);
    expect(sourceBayRefs).toEqual(['gpz-b1', 'gpz-b2', 'gpz-b3']);
  });

  it('snBays mapping: bay_role=TR → fieldRole=TRANSFORMER, MEASUREMENT → MEASUREMENT', () => {
    const recvSta = makeRecvStation('sta-1', 'STA');
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g'), recvSta],
      bays: [
        bay('gpz-b1', 'OUT', 'g', 'bus-15', { outgoing_destination_ref: 'sta-1' }),
        bay('sta-1-tr-bay', 'TR', 'sta-1', 'sta-1-bus-15'),
        bay('sta-1-meas', 'MEASUREMENT', 'sta-1', 'sta-1-bus-15'),
        bay('sta-1-cpl', 'COUPLER', 'sta-1', 'sta-1-bus-15'),
      ],
      transformers: [transformer('sta-1-tr', { sn_mva: 0.4 })],
      buses: [bus('bus-15', 15), bus('sta-1-bus-15', 15)],
    };
    const props = buildCanonicalGpzProps(enm, 'g', { x: 0, y: 0 });
    const station = props.receivingStations![0];
    const trBay = station.snBays.find((b) => b.bayRef === 'sta-1-tr-bay');
    expect(trBay?.fieldRole).toBe('TRANSFORMER');
    const measBay = station.snBays.find((b) => b.bayRef === 'sta-1-meas');
    expect(measBay?.fieldRole).toBe('MEASUREMENT');
    const cplBay = station.snBays.find((b) => b.bayRef === 'sta-1-cpl');
    expect(cplBay?.fieldRole).toBe('COUPLER');
  });
});
