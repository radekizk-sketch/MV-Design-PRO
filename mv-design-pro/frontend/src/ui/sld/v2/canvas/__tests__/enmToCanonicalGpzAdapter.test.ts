/**
 * enmToCanonicalGpzAdapter tests — Phase R3 (operator-grade rebuild).
 *
 * Pokrycie: ENM → CanonicalGpzProps mapping bez fallback do placeholderów.
 */
import { describe, expect, it } from 'vitest';

import type {
  Bay,
  BayPrimaryDevice,
  Branch,
  Bus,
  EnergyNetworkModel,
  Measurement,
  ProtectionAssignment,
  Substation,
  Transformer,
} from '../../../../../types/enm';
import type { RawOverlayPayload } from '../../../../sld-overlay/rawResultOverlayStore';
import { buildCanonicalGpzProps } from '../enmToCanonicalGpzAdapter';

type EnmFragment = Pick<
  EnergyNetworkModel,
  | 'substations'
  | 'bays'
  | 'transformers'
  | 'buses'
  | 'generators'
  | 'branches'
  // F11.1 (spec §17.2/§18.3, rejestr device-ref w GPZ): `buildCanonicalGpzProps`
  // czyta TERAZ te dwie kolekcje (`resolveBayProtectionMarking`/
  // `resolveBayCtRatingAnnotations`, reużyte ze stacji).
  | 'protection_assignments'
  | 'measurements'
>;

function emptyEnm(): EnmFragment {
  return {
    substations: [],
    bays: [],
    transformers: [],
    buses: [],
    generators: [],
    branches: [],
    protection_assignments: [],
    measurements: [],
  };
}

function cable(refId: string, fromBus: string, toBus: string): Branch {
  return {
    id: refId,
    ref_id: refId,
    name: refId,
    tags: [],
    meta: {},
    type: 'cable',
    from_bus_ref: fromBus,
    to_bus_ref: toBus,
    status: 'closed',
    length_km: 1,
    r_ohm_per_km: 0.1,
    x_ohm_per_km: 0.1,
  } as Branch;
}

function lfOverlay(elements: Record<string, Record<string, number | null>>): RawOverlayPayload {
  return {
    run_id: 'run-1',
    analysis_type: 'LOAD_FLOW',
    elements: Object.fromEntries(
      Object.entries(elements).map(([refId, metrics]) => [
        refId,
        {
          ref_id: refId,
          kind: 'branch',
          badges: [],
          severity: 'INFO',
          metrics: Object.fromEntries(
            Object.entries(metrics).map(([code, value]) => [code, { code, value, unit: '' }]),
          ),
        },
      ]),
    ),
  };
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
   TR-bay ↔ wieża reconciliation (eliminacja podwójnej reprezentacji)
   --------------------------------------------------------------------------- */

describe('buildCanonicalGpzProps — pole TR vs wieża (anty-podwójny render)', () => {
  it('Transformator z polem bay_role:"TR" → POMIJANY jako wieża (renderuje się przez pole)', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g', {
        transformer_refs: ['tr-1'],
        gpz_sections: [{ section_id: 's1', order: 1, name: 'S1', bus_ref: 'bus-15' }],
      })],
      transformers: [transformer('tr-1', { name: 'TR-1' })],
      bays: [bay('bay-tr1', 'TR', 'g', 'bus-15', { gpz_section_id: 's1', equipment_refs: ['tr-1'] })],
      buses: [bus('bus-15', 15)],
    };
    const props = buildCanonicalGpzProps(enm, 'g', { x: 0, y: 0 });
    // Wieża pominięta — transformator NIE w props.transformers.
    expect(props.transformers).toHaveLength(0);
    // ...ale pole TR jest w sekcji jako pole o roli TRANSFORMER.
    const trBay = props.sections[0].bays.find((b) => b.bayRef === 'bay-tr1');
    expect(trBay?.fieldRole).toBe('TRANSFORMER');
  });

  it('Transformator BEZ pola TR (starszy snapshot) → wieża ZOSTAJE (brak regresji)', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g', {
        transformer_refs: ['tr-1'],
        gpz_sections: [{ section_id: 's1', order: 1, name: 'S1', bus_ref: 'bus-15' }],
      })],
      transformers: [transformer('tr-1', { name: 'TR-1' })],
      bays: [bay('b-out', 'OUT', 'g', 'bus-15', { gpz_section_id: 's1' })],
      buses: [bus('bus-15', 15)],
    };
    const props = buildCanonicalGpzProps(enm, 'g', { x: 0, y: 0 });
    expect(props.transformers).toHaveLength(1);
    expect(props.transformers[0].transformerRef).toBe('tr-1');
  });

  it('Mix: jeden TR z polem (pominięty), drugi bez (wieża zostaje)', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g', {
        transformer_refs: ['tr-1', 'tr-2'],
        gpz_sections: [
          { section_id: 's1', order: 1, name: 'S1', bus_ref: 'bus-15' },
          { section_id: 's2', order: 2, name: 'S2', bus_ref: 'bus-15' },
        ],
      })],
      transformers: [transformer('tr-1', { name: 'TR-1' }), transformer('tr-2', { name: 'TR-2' })],
      bays: [bay('bay-tr1', 'TR', 'g', 'bus-15', { gpz_section_id: 's1', equipment_refs: ['tr-1'] })],
      buses: [bus('bus-15', 15)],
    };
    const props = buildCanonicalGpzProps(enm, 'g', { x: 0, y: 0 });
    // Tylko tr-2 jako wieża; tr-1 renderuje się przez pole.
    expect(props.transformers.map((t) => t.transformerRef)).toEqual(['tr-2']);
  });
});

/* ---------------------------------------------------------------------------
   protection_codes (mechanizm string[] — lustro OZE)
   --------------------------------------------------------------------------- */

describe('buildCanonicalGpzProps — protection_codes pola', () => {
  it('Bay.protection_codes → CanonicalGpzBay.protectionCodes (pole TR)', () => {
    const codes = ['87T', '51', '50', '51N', 'Buchholz', 'temp', 'ciśnienie'];
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g', {
        transformer_refs: ['tr-1'],
        gpz_sections: [{ section_id: 's1', order: 1, name: 'S1', bus_ref: 'bus-15' }],
      })],
      transformers: [transformer('tr-1', { name: 'TR-1' })],
      bays: [bay('bay-tr1', 'TR', 'g', 'bus-15', {
        gpz_section_id: 's1',
        equipment_refs: ['tr-1'],
        protection_codes: codes,
      })],
      buses: [bus('bus-15', 15)],
    };
    const props = buildCanonicalGpzProps(enm, 'g', { x: 0, y: 0 });
    const trBay = props.sections[0].bays.find((b) => b.bayRef === 'bay-tr1');
    expect(trBay?.protectionCodes).toEqual(codes);
  });

  it('Bay bez protection_codes → protectionCodes = [] (data-honest, brak placeholdera)', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g', {
        gpz_sections: [{ section_id: 's1', order: 1, name: 'S1', bus_ref: 'bus-15' }],
      })],
      bays: [bay('b-out', 'OUT', 'g', 'bus-15', { gpz_section_id: 's1' })],
      buses: [bus('bus-15', 15)],
    };
    const props = buildCanonicalGpzProps(enm, 'g', { x: 0, y: 0 });
    expect(props.sections[0].bays[0].protectionCodes).toEqual([]);
  });
});

/* ---------------------------------------------------------------------------
   F11.1 — rejestr device-ref: primaryDevices / protectionMarking /
   ctRatingAnnotations (SLD_CAD_SPEC_V3 §17.2/§18.3/§20.1, parytet ze
   stacjami — reużycie WPROST `projectBayPrimaryDevices`/
   `resolveBayProtectionMarking`/`resolveBayCtRatingAnnotations`
   z `enmToSldAdapter.ts`).
   --------------------------------------------------------------------------- */

function primaryDevice(overrides: Partial<BayPrimaryDevice> & Pick<BayPrimaryDevice, 'kind' | 'device_ref'>): BayPrimaryDevice {
  return {
    placement: 'MIDSTREAM',
    ...overrides,
  } as BayPrimaryDevice;
}

function protectionAssignment(refId: string, overrides: Partial<ProtectionAssignment> = {}): ProtectionAssignment {
  return {
    id: refId,
    ref_id: refId,
    name: refId,
    tags: [],
    meta: {},
    breaker_ref: 'cb-1',
    device_type: 'overcurrent',
    settings: [],
    is_enabled: true,
    ...overrides,
  } as ProtectionAssignment;
}

function measurement(refId: string, overrides: Partial<Measurement> = {}): Measurement {
  return {
    id: refId,
    ref_id: refId,
    name: refId,
    tags: [],
    meta: {},
    measurement_type: 'CT',
    bus_ref: 'bus-15',
    rating: { ratio_primary: 300, ratio_secondary: 5 },
    connection: 'star',
    purpose: 'protection',
    ...overrides,
  } as Measurement;
}

describe('buildCanonicalGpzProps — F11.1 rejestr device-ref (primaryDevices/protectionMarking/ctRatingAnnotations)', () => {
  it('Bay bez primary_devices/protection_ref/measurements → wszystkie trzy pola undefined (stan dzisiejszy fixtury referencyjnej, STOP-notatka F9.2)', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g', { gpz_sections: [{ section_id: 's1', order: 1, name: 'S1', bus_ref: 'bus-15' }] })],
      bays: [bay('b-out', 'OUT', 'g', 'bus-15', { gpz_section_id: 's1' })],
      buses: [bus('bus-15', 15)],
    };
    const props = buildCanonicalGpzProps(enm, 'g', { x: 0, y: 0 });
    const b = props.sections[0].bays[0];
    expect(b.primaryDevices).toBeUndefined();
    expect(b.protectionMarking).toBeUndefined();
    expect(b.ctRatingAnnotations).toBeUndefined();
  });

  it('Bay.primary_devices (forward-compat) → CanonicalGpzBay.primaryDevices, posortowane wg placement, TA SAMA projekcja co stacje', () => {
    const devices: BayPrimaryDevice[] = [
      primaryDevice({ device_ref: 'ct-1', kind: 'CT', placement: 'MIDSTREAM' }),
      primaryDevice({ device_ref: 'ds-bus', kind: 'DS', placement: 'UPSTREAM' }),
      primaryDevice({ device_ref: 'cb-1', kind: 'CB', placement: 'MIDSTREAM' }),
    ];
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g', { gpz_sections: [{ section_id: 's1', order: 1, name: 'S1', bus_ref: 'bus-15' }] })],
      bays: [{
        ...bay('b-out', 'OUT', 'g', 'bus-15', { gpz_section_id: 's1' }),
        primary_devices: devices,
      } as never],
      buses: [bus('bus-15', 15)],
    };
    const props = buildCanonicalGpzProps(enm, 'g', { x: 0, y: 0 });
    const b = props.sections[0].bays[0];
    expect(b.primaryDevices?.map((d) => d.deviceRef)).toEqual(['ds-bus', 'ct-1', 'cb-1']);
  });

  it('Bay.protection_ref → ProtectionAssignment rozwiązany na CanonicalGpzBay.protectionMarking (breakerRef/ctRef)', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g', { gpz_sections: [{ section_id: 's1', order: 1, name: 'S1', bus_ref: 'bus-15' }] })],
      bays: [bay('b-out', 'OUT', 'g', 'bus-15', {
        gpz_section_id: 's1',
        protection_codes: ['50/51', '51N'],
        protection_ref: 'pa-1',
      })],
      buses: [bus('bus-15', 15)],
      protection_assignments: [protectionAssignment('pa-1', { breaker_ref: 'cb-1', ct_ref: 'ct-1' })],
    };
    const props = buildCanonicalGpzProps(enm, 'g', { x: 0, y: 0 });
    const b = props.sections[0].bays[0];
    expect(b.protectionMarking).toEqual({ codes: ['50/51', '51N'], breakerRef: 'cb-1', ctRef: 'ct-1', ctRefsSecondary: undefined });
  });

  it('CT Measurement.bay_ref → CanonicalGpzBay.ctRatingAnnotations (identyfikator + przekładnia, wzorzec §18.3)', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g', { gpz_sections: [{ section_id: 's1', order: 1, name: 'S1', bus_ref: 'bus-15' }] })],
      bays: [bay('b-out', 'OUT', 'g', 'bus-15', { gpz_section_id: 's1' })],
      buses: [bus('bus-15', 15)],
      measurements: [measurement('m-1', { bay_ref: 'b-out', name: 'T1', rating: { ratio_primary: 300, ratio_secondary: 5 } })],
    };
    const props = buildCanonicalGpzProps(enm, 'g', { x: 0, y: 0 });
    const b = props.sections[0].bays[0];
    expect(b.ctRatingAnnotations).toEqual([
      { measurementRef: 'm-1', identifier: 'T1', ratioText: '300/5', arrangement: undefined },
    ]);
  });

  it('mergeBaysWithFieldSpecs (pole syntetyzowane z field_specs) przenosi protection_ref — naprawa F11.1 (znalezisko własne, pole ginęło cicho przed tą fazą)', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g', {
        bus_refs: ['bus-15'],
        meta: {
          field_specs: [{
            field_ref: 'fs-1',
            bus_ref: 'bus-15',
            bay_role: 'FEEDER',
            name: 'Pole liniowe GPZ',
            protection_codes: ['50/51'],
            protection_ref: 'pa-1',
          }],
        },
      })],
      buses: [bus('bus-15', 15)],
      protection_assignments: [protectionAssignment('pa-1', { breaker_ref: 'cb-1', ct_ref: 'ct-1' })],
    };
    const props = buildCanonicalGpzProps(enm, 'g', { x: 0, y: 0 });
    const b = props.sections[0].bays.find((x) => x.bayRef === 'fs-1');
    expect(b?.protectionMarking?.breakerRef).toBe('cb-1');
    expect(b?.protectionMarking?.ctRef).toBe('ct-1');
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
   Pomiary P/Q/I z overlay rozpływu mocy
   --------------------------------------------------------------------------- */

describe('buildCanonicalGpzProps — pomiary pola z overlay rozpływu', () => {
  function gpzWith2Feeders(): EnmFragment {
    return {
      ...emptyEnm(),
      substations: [gpz('g', {
        gpz_sections: [{ section_id: 's1', order: 1, name: 'S1', bus_ref: 'bus-15' }],
      })],
      bays: [
        bay('bay-A', 'OUT', 'g', 'bus-15', {
          gpz_section_id: 's1',
          outgoing_destination_ref: 'bus-dstA',
        }),
        bay('bay-B', 'OUT', 'g', 'bus-15', {
          gpz_section_id: 's1',
          outgoing_destination_ref: 'bus-dstB',
        }),
      ],
      buses: [bus('bus-15', 15)],
      branches: [
        cable('br-A', 'bus-15', 'bus-dstA'),
        cable('br-B', 'bus-15', 'bus-dstB'),
      ],
    };
  }

  it('2 pola liniowe na sekcji + overlay → kanoniczne bays niosą poprawne pomiary', () => {
    const enm = gpzWith2Feeders();
    const overlay = lfOverlay({
      'br-A': { P_MW: 2.5, Q_Mvar: 0.8, I_A: 96.2 },
      'br-B': { P_MW: 1.0, Q_Mvar: 0.3, I_A: 40.0 },
    });
    const props = buildCanonicalGpzProps(enm, 'g', { x: 0, y: 0 }, overlay);
    const bays = props.sections[0].bays;
    const a = bays.find((b) => b.bayRef === 'bay-A');
    const b = bays.find((b) => b.bayRef === 'bay-B');
    expect(a?.measurements).toEqual({ pMw: 2.5, qMvar: 0.8, i1A: 96.2 });
    expect(b?.measurements).toEqual({ pMw: 1.0, qMvar: 0.3, i1A: 40.0 });
  });

  it('pole bez dopasowania w overlay → measurements null', () => {
    const enm = gpzWith2Feeders();
    const overlay = lfOverlay({ 'br-A': { P_MW: 2.5, Q_Mvar: 0.8, I_A: 96.2 } });
    const props = buildCanonicalGpzProps(enm, 'g', { x: 0, y: 0 }, overlay);
    const b = props.sections[0].bays.find((bay) => bay.bayRef === 'bay-B');
    expect(b?.measurements).toBeNull();
  });

  it('brak overlay → wszystkie measurements null (backward-compatible)', () => {
    const enm = gpzWith2Feeders();
    const props = buildCanonicalGpzProps(enm, 'g', { x: 0, y: 0 });
    for (const b of props.sections[0].bays) {
      expect(b.measurements).toBeNull();
    }
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

/* ---------------------------------------------------------------------------
   ADAPTER-BUSREF (dług W4/R2/V12K-163): kanoniczny Bus ref sekcji GPZ + szyny WN
   niesiony ze snapshotu (prymat danych, zero parsowania refów sceny).
   --------------------------------------------------------------------------- */

describe('buildCanonicalGpzProps — ADAPTER-BUSREF (bus_ref sekcji + hvBusRef)', () => {
  it('GPZ 2 sekcje + sprzęgło ⇒ każda sekcja niesie KANONICZNY bus_ref ze snapshotu', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g', {
        bus_refs: ['bus-sn-1', 'bus-sn-2', 'bus-110'],
        gpz_sections: [
          { section_id: 's1', order: 1, name: 'S1', bus_ref: 'bus-sn-1' },
          { section_id: 's2', order: 2, name: 'S2', bus_ref: 'bus-sn-2' },
        ],
      })],
      bays: [
        bay('bay-1', 'OUT', 'g', 'bus-sn-1', { gpz_section_id: 's1' }),
        bay('bay-2', 'OUT', 'g', 'bus-sn-2', { gpz_section_id: 's2' }),
        bay('cpl', 'COUPLER', 'g', 'bus-sn-1', { gpz_section_id: 's1' }),
      ],
      buses: [bus('bus-sn-1', 15), bus('bus-sn-2', 15), bus('bus-110', 110)],
    };

    const props = buildCanonicalGpzProps(enm, 'g', { x: 0, y: 0 });

    const byId = new Map(props.sections.map((s) => [s.sectionId, s]));
    // Prymat danych: bus_ref DOKŁADNIE ze snapshotu, nie z parsowania sectionId.
    expect(byId.get('s1')?.busRef).toBe('bus-sn-1');
    expect(byId.get('s2')?.busRef).toBe('bus-sn-2');
    // Szyna WN = jedyna szyna voltage_kv > 60 w bus_refs.
    expect(props.hvBusRef).toBe('bus-110');
  });

  it('Sekcja bez bus_ref w snapshocie ⇒ busRef=null (uczciwy brak, zero fabrykacji)', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g', {
        bus_refs: ['bus-15'],
        gpz_sections: [{ section_id: 's1', order: 1, name: 'S1' } as never],
      })],
      bays: [bay('bay-1', 'OUT', 'g', 'bus-15', { gpz_section_id: 's1' })],
      buses: [bus('bus-15', 15)],
    };

    const props = buildCanonicalGpzProps(enm, 'g', { x: 0, y: 0 });
    expect(props.sections[0].busRef ?? null).toBeNull();
  });

  it('Brak szyny WN (>60 kV) ⇒ hvBusRef=null', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g', { bus_refs: ['bus-15'], gpz_sections: [{ section_id: 's1', order: 1, name: 'S1', bus_ref: 'bus-15' }] })],
      bays: [bay('bay-1', 'OUT', 'g', 'bus-15', { gpz_section_id: 's1' })],
      buses: [bus('bus-15', 15)],
    };
    const props = buildCanonicalGpzProps(enm, 'g', { x: 0, y: 0 });
    expect(props.hvBusRef ?? null).toBeNull();
  });
});
