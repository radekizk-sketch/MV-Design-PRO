/**
 * enmToCanonicalGpzAdapter tests — Phase R3 (operator-grade rebuild).
 *
 * Pokrycie: ENM → CanonicalGpzProps mapping bez fallback do placeholderów.
 */
import { describe, expect, it } from 'vitest';

import type {
  Bay,
  BayPrimaryDevice,
  Bus,
  EnergyNetworkModel,
  Generator,
  Measurement,
  ProtectionAssignment,
  Substation,
  Transformer,
} from '../../../../../types/enm';
import { buildCanonicalGpzProps, flagiStatusuPola, rolaPolaGpz } from '../enmToCanonicalGpzAdapter';
import { pole } from '../../../../../test/pola';

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
  // F13.1 (spec §21.1, D3-1): derywacja kolumny WN gdy `gpz_hv_sections`
  // puste czyta `snapshot.sources` — `buildCanonicalGpzProps` wymaga tej
  // kolekcji dokładnie jak produkcyjny wywołujący (`buildScene.ts`).
  | 'sources'
  // Karta GPZ-H5-SLD: odbiory przyłączone do szyny sekcji GPZ (`CanonicalGpzSection.loads`).
  | 'loads'
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
    sources: [],
    loads: [],
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
  return pole({ ref_id: refId, name: refId, bay_role: role, substation_ref: substationRef, bus_ref: busRef, ...overrides });
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
    expect(() => buildCanonicalGpzProps(enm, 'NONEXISTENT')).toThrow();
  });

  it('Substation typu mv_lv → throw (NIE GPZ)', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [{ ...gpz('s'), station_type: 'mv_lv' } as Substation],
    };
    expect(() => buildCanonicalGpzProps(enm, 's')).toThrow(/nie jest typu 'gpz'/);
  });
});

/* ---------------------------------------------------------------------------
   Name mapping (NIE placeholder)
   --------------------------------------------------------------------------- */

describe('buildCanonicalGpzProps — nazwa GPZ (zakaz placeholderów)', () => {
  it('Substation.name → CanonicalGpzProps.name', () => {
    const enm: EnmFragment = { ...emptyEnm(), substations: [gpz('GPZ-5', { name: 'GPZ-5 PST' })] };
    const props = buildCanonicalGpzProps(enm, 'GPZ-5');
    expect(props.name).toBe('GPZ-5 PST');
  });

  // Karta GPZ-PARYTET: brak nazwy w modelu = jawny brak (`null`), nie znak zastępczy „—"
  // udający nazwę (kompozycja zgłasza wtedy `gpz.name.missing`).
  for (const pusta of ['', '   ']) {
    it(`Brak name (${JSON.stringify(pusta)}) → null (jawny brak, NIE placeholder)`, () => {
      const enm: EnmFragment = { ...emptyEnm(), substations: [gpz('GPZ-5', { name: pusta })] };
      const props = buildCanonicalGpzProps(enm, 'GPZ-5');
      expect(props.name).toBeNull();
    });
  }
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
    const props = buildCanonicalGpzProps(enm, 'g');
    expect(props.transformers).toHaveLength(2);
    expect(props.transformers[0].designation).toBe('TR1');
    expect(props.transformers[1].designation).toBe('TR2');
    expect(props.transformers[0].snMva).toBe(25);
    expect(props.transformers[1].snMva).toBe(16);
  });

  it('Brak transformatorów → pusta tablica (NIE placeholder)', () => {
    const enm: EnmFragment = { ...emptyEnm(), substations: [gpz()] };
    const props = buildCanonicalGpzProps(enm, 'GPZ-1');
    expect(props.transformers).toEqual([]);
  });

  it('Designation extracted from name "TR-1" → "TR1"', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g', { transformer_refs: ['t'] })],
      transformers: [transformer('t', { name: 'TR-1' })],
    };
    const props = buildCanonicalGpzProps(enm, 'g');
    expect(props.transformers[0].designation).toBe('TR1');
  });

  it('Designation fallback "T1" gdy name pusty', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g', { transformer_refs: ['t'] })],
      transformers: [transformer('t', { name: '' })],
    };
    const props = buildCanonicalGpzProps(enm, 'g');
    expect(props.transformers[0].designation).toBe('T1');
  });
});

/* ---------------------------------------------------------------------------
   TR-bay ↔ wieża reconciliation (eliminacja podwójnej reprezentacji)
   --------------------------------------------------------------------------- */

describe('buildCanonicalGpzProps — pole TR modelu jako pole toru transformatora (GPZ-PARYTET cz. 3 pkt 2)', () => {
  // Dawniej transformator wskazany przez pole TR był pomijany jako wieża, a pole TR w sekcji
  // nie ma symbolu transformatora — transformator znikał z rysunku. Teraz KAŻDY transformator
  // stacji ma tor (pole WN TR → TR2W → pole TR), a jednoznacznie przypisane pole TR modelu
  // zostaje przeniesione z sekcji do toru (jedno przypisanie steruje obiema stronami).
  function galaz(ref: string, type: string, status: 'open' | 'closed') {
    return { id: ref, ref_id: ref, name: ref, type, status, from_bus_ref: 'bus-15', to_bus_ref: `${ref}-k`, tags: [], meta: {} } as never;
  }
  function enmTr(bays: Bay[], transformers: Transformer[] = [transformer('tr-1', { name: 'TR-1' })]): EnmFragment {
    return {
      ...emptyEnm(),
      substations: [gpz('g', {
        transformer_refs: transformers.map((t) => t.ref_id),
        gpz_sections: [{ section_id: 's1', order: 1, name: 'S1', bus_ref: 'bus-15' }],
        gpz_hv_sections: [{ section_id: 'h1', order: 1, name: 'WN', bus_ref: 'bus-110' }],
      })],
      transformers,
      bays,
      buses: [bus('bus-15', 15), bus('bus-110', 110)],
    };
  }
  const polaSekcji = (props: ReturnType<typeof buildCanonicalGpzProps>): string[] => [
    ...props.sections.flatMap((s) => s.bays.map((b) => b.bayRef)),
    ...(props.hvSections ?? []).flatMap((s) => s.bays.map((b) => b.bayRef)),
  ];

  // Iloczyn: nośnik relacji {equipment_refs, meta.transformer_ref} × strona {SN, WN}.
  for (const nosnik of ['equipment_refs', 'meta.transformer_ref'] as const) {
    for (const strona of ['SN', 'WN'] as const) {
      it(`pole TR (${nosnik}, strona ${strona}) → tor transformatora, nie sekcja`, () => {
        const relacja: Partial<Bay> =
          nosnik === 'equipment_refs' ? { equipment_refs: ['tr-1'] } : { meta: { transformer_ref: 'tr-1' } };
        const props = buildCanonicalGpzProps(
          enmTr([
            bay('bay-tr1', 'TR', 'g', strona === 'SN' ? 'bus-15' : 'bus-110', {
              gpz_section_id: strona === 'SN' ? 's1' : 'h1',
              ...relacja,
            }),
          ]),
          'g',
        );
        expect(props.transformers.map((t) => t.transformerRef)).toEqual(['tr-1']);
        const tr = props.transformers[0];
        expect(strona === 'SN' ? tr.poleTr?.bayRef : tr.poleWn?.bayRef).toBe('bay-tr1');
        expect(strona === 'SN' ? tr.poleWn : tr.poleTr).toBeNull();
        expect(polaSekcji(props)).not.toContain('bay-tr1');
      });
    }
  }

  it('transformator BEZ pola TR → tor zostaje, pola toru nieobecne (null)', () => {
    const props = buildCanonicalGpzProps(enmTr([bay('b-out', 'OUT', 'g', 'bus-15', { gpz_section_id: 's1' })]), 'g');
    expect(props.transformers.map((t) => [t.transformerRef, t.poleTr, t.poleWn])).toEqual([['tr-1', null, null]]);
    expect(polaSekcji(props)).toEqual(['b-out']);
  });

  it('mix: jeden transformator z polem TR, drugi bez — OBA mają tor', () => {
    const props = buildCanonicalGpzProps(
      enmTr(
        [bay('bay-tr1', 'TR', 'g', 'bus-15', { gpz_section_id: 's1', equipment_refs: ['tr-1'] })],
        [transformer('tr-1', { name: 'TR-1' }), transformer('tr-2', { name: 'TR-2' })],
      ),
      'g',
    );
    expect(props.transformers.map((t) => [t.transformerRef, t.poleTr?.bayRef ?? null])).toEqual([
      ['tr-1', 'bay-tr1'],
      ['tr-2', null],
    ]);
    expect(polaSekcji(props)).toEqual([]);
  });

  it('niejednoznaczne: dwa pola TR jednego transformatora → oba zostają w sekcji, tor bez pola', () => {
    const props = buildCanonicalGpzProps(
      enmTr([
        bay('bay-tr1a', 'TR', 'g', 'bus-15', { gpz_section_id: 's1', equipment_refs: ['tr-1'] }),
        bay('bay-tr1b', 'TR', 'g', 'bus-15', { gpz_section_id: 's1', equipment_refs: ['tr-1'] }),
      ]),
      'g',
    );
    expect(props.transformers[0].poleTr).toBeNull();
    expect(polaSekcji(props).sort()).toEqual(['bay-tr1a', 'bay-tr1b']);
  });

  it('niejednoznaczne: pole TR wskazujące dwa transformatory → zostaje w sekcji, oba tory bez pola', () => {
    const props = buildCanonicalGpzProps(
      enmTr(
        [bay('bay-tr12', 'TR', 'g', 'bus-15', { gpz_section_id: 's1', equipment_refs: ['tr-1', 'tr-2'] })],
        [transformer('tr-1'), transformer('tr-2')],
      ),
      'g',
    );
    expect(props.transformers.map((t) => t.poleTr)).toEqual([null, null]);
    expect(polaSekcji(props)).toEqual(['bay-tr12']);
  });

  it('pole o roli innej niż TR wskazujące transformator nie jest polem toru', () => {
    const props = buildCanonicalGpzProps(
      enmTr([bay('b-out', 'OUT', 'g', 'bus-15', { gpz_section_id: 's1', equipment_refs: ['tr-1'] })]),
      'g',
    );
    expect(props.transformers[0].poleTr).toBeNull();
    expect(polaSekcji(props)).toEqual(['b-out']);
  });

  it('pole toru niesie stan łącznika z modelu (gałąź wyłącznika pola TR)', () => {
    for (const stan of ['closed', 'open'] as const) {
      const enm = enmTr([
        bay('bay-tr1', 'TR', 'g', 'bus-15', { gpz_section_id: 's1', equipment_refs: ['tr-1', 'q-tr1'] }),
      ]);
      enm.branches = [galaz('q-tr1', 'breaker', stan)];
      expect(buildCanonicalGpzProps(enm, 'g').transformers[0].poleTr?.cbState).toBe(stan);
    }
  });

  it('determinizm: odwrócona kolejność pól i transformatorów → te same props', () => {
    const pola = [
      bay('bay-tr1', 'TR', 'g', 'bus-15', { gpz_section_id: 's1', equipment_refs: ['tr-1'] }),
      bay('bay-tr2', 'TR', 'g', 'bus-110', { gpz_section_id: 'h1', equipment_refs: ['tr-2'] }),
      bay('b-out', 'OUT', 'g', 'bus-15', { gpz_section_id: 's1' }),
    ];
    const trafa = [transformer('tr-1'), transformer('tr-2')];
    const a = buildCanonicalGpzProps(enmTr(pola, trafa), 'g');
    const b = buildCanonicalGpzProps(enmTr([...pola].reverse(), [...trafa].reverse()), 'g');
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});

describe('buildCanonicalGpzProps — pole źródłowe OZE z rodzajem źródła z modelu (GPZ-PARYTET cz. 3 pkt 1)', () => {
  function gen(ref: string, genType: Generator['gen_type'], fieldRef: string | null): Generator {
    return {
      id: ref, ref_id: ref, name: ref, tags: [], bus_ref: 'bus-15', p_mw: 1, gen_type: genType,
      meta: fieldRef ? { field_ref: fieldRef } : {},
    } as Generator;
  }
  // Iloczyn: wytwórcy pola {PV, BESS, FW ×4 typy, brak, mieszane, rodzaj nierysowany, wytwórca innego pola}.
  const PRZYPADKI: ReadonlyArray<readonly [string, readonly Generator[], string]> = [
    ['PV', [gen('g1', 'pv_inverter', 'oze')], 'DER_PV'],
    ['BESS', [gen('g1', 'bess', 'oze')], 'DER_BESS'],
    ['FW wind_inverter', [gen('g1', 'wind_inverter', 'oze')], 'DER_FW'],
    ['FW fw_pmsg + fw_dfig + fw_scig', [gen('g1', 'fw_pmsg', 'oze'), gen('g2', 'fw_dfig', 'oze'), gen('g3', 'fw_scig', 'oze')], 'DER_FW'],
    ['brak wytwórcy', [], 'DER_UNKNOWN'],
    ['mieszane PV + BESS', [gen('g1', 'pv_inverter', 'oze'), gen('g2', 'bess', 'oze')], 'DER_UNKNOWN'],
    ['rodzaj nierysowany (synchronous)', [gen('g1', 'synchronous', 'oze')], 'DER_UNKNOWN'],
    ['wytwórca innego pola', [gen('g1', 'pv_inverter', 'inne')], 'DER_UNKNOWN'],
  ];
  for (const [opis, generatory, oczekiwana] of PRZYPADKI) {
    it(`OZE × ${opis} → fieldRole SOURCE, rolaZrodla ${oczekiwana}`, () => {
      const enm: EnmFragment = {
        ...emptyEnm(),
        substations: [gpz('g', { gpz_sections: [{ section_id: 's1', order: 1, name: 'S1', bus_ref: 'bus-15' }] })],
        bays: [bay('oze', 'OZE', 'g', 'bus-15', { gpz_section_id: 's1' })],
        generators: [...generatory],
        buses: [bus('bus-15', 15)],
      };
      const pole1 = buildCanonicalGpzProps(enm, 'g').sections[0].bays[0];
      expect(pole1.fieldRole).toBe('SOURCE');
      expect(pole1.rolaZrodla).toBe(oczekiwana);
      expect(pole1.rolaPola).toBe('zrodlowe');
    });
  }

  it('rodzaj źródła tylko w polu OZE — pole odpływowe nie niesie rolaZrodla', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g', { gpz_sections: [{ section_id: 's1', order: 1, name: 'S1', bus_ref: 'bus-15' }] })],
      bays: [bay('out', 'OUT', 'g', 'bus-15', { gpz_section_id: 's1' })],
      generators: [gen('g1', 'pv_inverter', 'out')],
      buses: [bus('bus-15', 15)],
    };
    const pole1 = buildCanonicalGpzProps(enm, 'g').sections[0].bays[0];
    expect(pole1.fieldRole).toBe('LINE_OUT');
    expect(pole1.rolaZrodla).toBeUndefined();
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
    const props = buildCanonicalGpzProps(enm, 'g');
    // GPZ-PARYTET cz. 3: pole TR transformatora GPZ jest polem toru transformatora.
    expect(props.transformers[0].poleTr?.protectionCodes).toEqual(codes);
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
    const props = buildCanonicalGpzProps(enm, 'g');
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
    const props = buildCanonicalGpzProps(enm, 'g');
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
    const props = buildCanonicalGpzProps(enm, 'g');
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
    const props = buildCanonicalGpzProps(enm, 'g');
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
    const props = buildCanonicalGpzProps(enm, 'g');
    const b = props.sections[0].bays[0];
    // W5 (§12–15/uwaga 7): `purpose` addytywnie z `Measurement.purpose` (wariant
    // CT z danych) — `resolveBayCtRatingAnnotations` współdzielony ze stacją,
    // GPZ dziedziczy pole. Helper `measurement()` domyślnie `purpose:'protection'`.
    expect(b.ctRatingAnnotations).toEqual([
      { measurementRef: 'm-1', identifier: 'T1', ratioText: '300/5', arrangement: undefined, purpose: 'protection' },
    ]);
  });

  it('pole GPZ (rekord `bays`) przenosi protection_ref — F11.1 (dawniej ginęło przy syntezie pola z drugiego kanału)', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g', { bus_refs: ['bus-15'] })],
      bays: [bay('fs-1', 'FEEDER', 'g', 'bus-15', {
        name: 'Pole liniowe GPZ',
        protection_codes: ['50/51'],
        protection_ref: 'pa-1',
      })],
      buses: [bus('bus-15', 15)],
      protection_assignments: [protectionAssignment('pa-1', { breaker_ref: 'cb-1', ct_ref: 'ct-1' })],
    };
    const props = buildCanonicalGpzProps(enm, 'g');
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
    const props = buildCanonicalGpzProps(enm, 'g');
    expect(props.sections).toHaveLength(2);
    expect(props.sections[0].label).toBe('S1');
    expect(props.sections[1].label).toBe('S2');
    expect(props.sections[0].busVoltageKv).toBe(15);
  });

  it('Brak gpz_sections + brak bays → []', () => {
    const enm: EnmFragment = { ...emptyEnm(), substations: [gpz()] };
    const props = buildCanonicalGpzProps(enm, 'GPZ-1');
    expect(props.sections).toEqual([]);
  });

  it('Brak gpz_sections ale są bays → auto-syntezuje 1 sekcję domyślną', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz()],
      bays: [bay('b1', 'OUT', 'GPZ-1', 'bus-15')],
      buses: [bus('bus-15', 15)],
    };
    const props = buildCanonicalGpzProps(enm, 'GPZ-1');
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
    const props = buildCanonicalGpzProps(enm, 'g');
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
    const props = buildCanonicalGpzProps(enm, 'g');
    const b = props.sections[0].bays[0];
    expect(b.bayNumber).toBe('10');
    expect(b.feederName).toBe('STAROŁĘCKA');
    // GEOMETRIA-STACJI (§0 pkt 5): podpis celu bez strzałki — strzałkę dokłada kompozycja
    // (dawniej dokładały ją obie warstwy, podpis z podwójną strzałką); cel bez rekordu = ref.
    expect(b.destinationLabel).toBe('ST-001');
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
    const props = buildCanonicalGpzProps(enm, 'g');
    expect(props.hvSections).toHaveLength(1);
    expect(props.hvSections![0].busVoltageKv).toBe(110);
  });

  it('Brak gpz_hv_sections → [] (NIE syntezuje, Inv 9)', () => {
    const enm: EnmFragment = { ...emptyEnm(), substations: [gpz()] };
    const props = buildCanonicalGpzProps(enm, 'GPZ-1');
    expect(props.hvSections).toEqual([]);
  });
});

/* ---------------------------------------------------------------------------
   Couplers
   --------------------------------------------------------------------------- */

describe('buildCanonicalGpzProps — sprzęgła', () => {
  // GEOMETRIA-STACJI (§0 pkt 2): JEDNO źródło sprzęgła — gałąź `bus_coupler` modelu między
  // szynami dwóch sekcji. Pole COUPLER (i `right_coupler_ref` sekcji) tylko dokłada oznaczenie
  // i rodzaj aparatu; samo nie tworzy sprzęgła. Dawniej test budował sprzęgło z samego pola
  // COUPLER między sekcjami na TEJ SAMEJ szynie — przypadek, którego model nie opisuje.
  function sprzeglo(ref: string, fromBus: string, toBus: string): never {
    return { id: ref, ref_id: ref, name: `Sprzęgło ${ref}`, type: 'bus_coupler', status: 'closed', from_bus_ref: fromBus, to_bus_ref: toBus, tags: [], meta: {} } as never;
  }
  function dwieSekcje(): Substation[] {
    return [gpz('g', {
      bus_refs: ['bus-15a', 'bus-15b'],
      gpz_sections: [
        { section_id: 's1', order: 1, name: 'S1', bus_ref: 'bus-15a', right_coupler_ref: 'cpl-9' },
        { section_id: 's2', order: 2, name: 'S2', bus_ref: 'bus-15b', left_coupler_ref: 'cpl-9' },
      ],
    })];
  }

  it('gałąź bus_coupler między szynami 2 sekcji → sprzęgło; pole COUPLER dokłada oznaczenie', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: dwieSekcje(),
      bays: [bay('cpl-9', 'COUPLER', 'g', 'bus-15a', { name: 'Pole sprzęgła S1–S2', equipment_refs: ['q-cpl'] })],
      branches: [sprzeglo('q-cpl', 'bus-15b', 'bus-15a')],
      buses: [bus('bus-15a', 15), bus('bus-15b', 15)],
    };
    const props = buildCanonicalGpzProps(enm, 'g');
    expect(props.couplers).toHaveLength(1);
    expect(props.couplers[0].couplerId).toBe('q-cpl');
    expect(props.couplers[0].leftSectionId).toBe('s1');
    expect(props.couplers[0].rightSectionId).toBe('s2');
    expect(props.couplers[0].bayRef).toBe('cpl-9');
    // Karta GPZ-H5-SLD etap 2 (wymaganie 5): rysowany element to gałąź łącznika, więc jej
    // nazwa ma pierwszeństwo; nazwa pola COUPLER oznacza łącznik tylko, gdy gałąź jest bez
    // nazwy (intencja dawnej asercji: pole „dokłada oznaczenie" — zachowana w drugim
    // przypadku poniżej).
    expect(props.couplers[0].designation).toBe('Sprzęgło q-cpl');
    const bezNazwyGalezi: EnmFragment = {
      ...enm,
      branches: [{ ...(sprzeglo('q-cpl', 'bus-15b', 'bus-15a') as object), name: '' } as never],
    };
    expect(buildCanonicalGpzProps(bezNazwyGalezi, 'g').couplers[0].designation).toBe('Pole sprzęgła S1–S2');
  });

  it('gałąź bus_coupler BEZ pola COUPLER → sprzęgło z nazwą gałęzi (pole nie warunkuje istnienia)', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: dwieSekcje(),
      branches: [sprzeglo('q-cpl', 'bus-15a', 'bus-15b')],
      buses: [bus('bus-15a', 15), bus('bus-15b', 15)],
    };
    const props = buildCanonicalGpzProps(enm, 'g');
    expect(props.couplers.map((c) => [c.couplerId, c.bayRef, c.designation])).toEqual([['q-cpl', null, 'Sprzęgło q-cpl']]);
  });

  it('pole COUPLER (i right_coupler_ref) BEZ gałęzi bus_coupler → couplers=[] (zero sprzęgła z samego pola)', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: dwieSekcje(),
      bays: [bay('cpl-9', 'COUPLER', 'g', 'bus-15a')],
      buses: [bus('bus-15a', 15), bus('bus-15b', 15)],
    };
    expect(buildCanonicalGpzProps(enm, 'g').couplers).toEqual([]);
  });

  it('1 sekcja → couplers=[]', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g', {
        gpz_sections: [{ section_id: 's1', order: 1, name: 'S1', bus_ref: 'bus-15' }],
      })],
      buses: [bus('bus-15', 15)],
    };
    const props = buildCanonicalGpzProps(enm, 'g');
    expect(props.couplers).toEqual([]);
  });
});

/* ---------------------------------------------------------------------------
   Stan łączników z modelu (GPZ-PARYTET cz. 2, pkt 2)
   --------------------------------------------------------------------------- */

describe('buildCanonicalGpzProps — stan łączników pola i sprzęgła z modelu', () => {
  function galaz(ref: string, type: string, status: 'open' | 'closed' | undefined, from = 'bus-15a', to = `${ref}-k`) {
    return { id: ref, ref_id: ref, name: ref, type, status, from_bus_ref: from, to_bus_ref: to, tags: [], meta: {} } as never;
  }
  // GEOMETRIA-STACJI (§0 pkt 1–2): sekcje na RÓŻNYCH szynach, sprzęgło = gałąź `bus_coupler`
  // między nimi; stan sprzęgła ze `status` gałęzi (brak statusu = nieznany — trzeci rysunek).
  // Dawniej „brak gałęzi sprzęgła" dawał sprzęgło nieustalone z samego pola COUPLER; teraz
  // brak gałęzi = brak sprzęgła (osobny test w bloku „sprzęgła"), a stan nieznany pochodzi
  // z gałęzi bez `status`.
  function enmZeStanami(stanPola: 'open' | 'closed' | null, stanSprzegla: 'open' | 'closed' | null): EnmFragment {
    return {
      ...emptyEnm(),
      substations: [gpz('g', {
        bus_refs: ['bus-15a', 'bus-15b'],
        gpz_sections: [
          { section_id: 's1', order: 1, name: 'S1', bus_ref: 'bus-15a', right_coupler_ref: 'cpl' },
          { section_id: 's2', order: 2, name: 'S2', bus_ref: 'bus-15b', left_coupler_ref: 'cpl' },
        ],
      })],
      bays: [
        bay('pole-1', 'OUT', 'g', 'bus-15a', { gpz_section_id: 's1', equipment_refs: stanPola ? ['q-pole'] : [] }),
        bay('cpl', 'COUPLER', 'g', 'bus-15a', { equipment_refs: ['q-cpl'] }),
      ],
      branches: [
        ...(stanPola ? [galaz('q-pole', 'breaker', stanPola)] : []),
        galaz('q-cpl', 'bus_coupler', stanSprzegla ?? undefined, 'bus-15a', 'bus-15b'),
      ],
      buses: [bus('bus-15a', 15), bus('bus-15b', 15)],
    };
  }

  // Iloczyn: obiekt {pole odpływowe, sprzęgło} × stan w modelu {zamknięty, otwarty, brak danej}.
  for (const stan of ['closed', 'open', null] as const) {
    it(`pole i sprzęgło: gałąź ${stan ?? 'brak'} → ${stan ?? 'unknown'}`, () => {
      const props = buildCanonicalGpzProps(enmZeStanami(stan, stan), 'g');
      const pole1 = props.sections.flatMap((s) => s.bays).find((b) => b.bayRef === 'pole-1');
      expect(pole1?.cbState).toBe(stan ?? 'unknown');
      expect(props.couplers[0].closedState).toBe(stan ?? 'unknown');
    });
  }

  it('stany pola i sprzęgła niezależne (sprzęgło otwarte, pole zamknięte)', () => {
    const props = buildCanonicalGpzProps(enmZeStanami('closed', 'open'), 'g');
    expect(props.sections.flatMap((s) => s.bays).find((b) => b.bayRef === 'pole-1')?.cbState).toBe('closed');
    expect(props.couplers[0].closedState).toBe('open');
  });

  it('rekord aparatu sprzeczny ze statusem gałęzi → nieustalony (jak K6a)', () => {
    const enm = enmZeStanami('closed', 'closed');
    enm.bays = enm.bays.map((b) =>
      b.ref_id === 'cpl'
        ? ({
            ...b,
            primary_devices: [{
              device_ref: 'q0', linked_ref: 'q-cpl', symbol_ref: 'symbol:ds', kind: 'DS', placement: 'MIDSTREAM',
              is_controllable: true, switch_state: { actual_state: 'otwarty' },
            } as BayPrimaryDevice],
          } as Bay)
        : b,
    );
    expect(buildCanonicalGpzProps(enm, 'g').couplers[0].closedState).toBe('unknown');
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
    const props = buildCanonicalGpzProps(enm, 'g');
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
    const props = buildCanonicalGpzProps(enm, 'g');
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
    const props = buildCanonicalGpzProps(enm, 'g');
    const q = props.sections[0].bays[0].qDesignations;
    expect(q.cb).toBeUndefined();
    expect(q.dsBus).toBe('Q1');
    expect(q.es).toBe('Q8');
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
    const ref = buildCanonicalGpzProps(enm, 'g');
    for (let i = 0; i < 5; i++) {
      expect(buildCanonicalGpzProps(enm, 'g')).toEqual(ref);
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

    const props = buildCanonicalGpzProps(enm, 'g');

    expect(props.sections).toHaveLength(2);
    expect(props.sections[0].bays.map((b) => b.bayRef)).toEqual(['bay-01', 'bay-03']);
    expect(props.sections[1].bays.map((b) => b.bayRef)).toEqual(['bay-02', 'bay-04']);
  });
});
describe('buildCanonicalGpzProps — pola GPZ wyłącznie z rekordów `bays` (karta W5-B)', () => {
  it('rekordy pól GPZ trafiają do sekcji wg `gpz_section_id`', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g', {
        gpz_sections: [
          { section_id: 's1', order: 1, name: 'S1', bus_ref: 'bus-15' },
          { section_id: 's2', order: 2, name: 'S2', bus_ref: 'bus-15' },
        ],
      })],
      bays: [
        bay('field-01', 'OUT', 'g', 'bus-15', { name: 'Pole odpływowe SN 1', gpz_section_id: 's1', bay_number: '1' }),
        bay('field-02', 'OUT', 'g', 'bus-15', { name: 'Pole odpływowe SN 2', gpz_section_id: 's2', bay_number: '2' }),
      ],
      buses: [bus('bus-15', 15)],
    };

    const props = buildCanonicalGpzProps(enm, 'g');

    expect(props.sections[0].bays.map((b) => b.bayRef)).toEqual(['field-01']);
    expect(props.sections[1].bays.map((b) => b.bayRef)).toEqual(['field-02']);
  });

  it('NEGATYW: sekcje GPZ bez rekordów pól ⇒ zero pól (brak syntezy pól z innych danych)', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g', {
        gpz_sections: [{ section_id: 's1', order: 1, name: 'S1', bus_ref: 'bus-15' }],
      })],
      bays: [bay('obce', 'OUT', 'inna-stacja', 'bus-15', { gpz_section_id: 's1' })],
      buses: [bus('bus-15', 15)],
    };

    const props = buildCanonicalGpzProps(enm, 'g');

    expect(props.sections.flatMap((s) => s.bays)).toEqual([]);
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

    const props = buildCanonicalGpzProps(enm, 'g');

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

    const props = buildCanonicalGpzProps(enm, 'g');
    expect(props.sections[0].busRef ?? null).toBeNull();
  });

  it('Brak szyny WN (>60 kV) ⇒ hvBusRef=null', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g', { bus_refs: ['bus-15'], gpz_sections: [{ section_id: 's1', order: 1, name: 'S1', bus_ref: 'bus-15' }] })],
      bays: [bay('bay-1', 'OUT', 'g', 'bus-15', { gpz_section_id: 's1' })],
      buses: [bus('bus-15', 15)],
    };
    const props = buildCanonicalGpzProps(enm, 'g');
    expect(props.hvBusRef ?? null).toBeNull();
  });

  /* KARTA WN-WYNIK — ODMOWA ZAMIAST PODSTAWIENIA po stronie WN.
     Kompozycja rysuje JEDEN odcinek szyny WN, więc punkt wyniku wolno mu
     przypisać wyłącznie wtedy, gdy model ma DOKŁADNIE JEDNĄ szynę WN. Kreator GPZ
     buduje jedną wspólną szynę WN (karta GPZ-MODEL — test niżej); kilka szyn WN
     w stacji daje tylko jawne sekcje WN — wtedy `find(...)` cicho brałby pierwszą
     i jeden narysowany odcinek pokazywałby wielkość jednego z dwóch węzłów. */
  it('GPZ z DWIEMA szynami 110 kV ⇒ hvBusRef=null — rysunek ma JEDNĄ szynę WN, więc odmawiamy zamiast podstawiać pierwszą', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g', {
        bus_refs: ['bus-15', 'bus-110-tr1', 'bus-110-tr2'],
        gpz_sections: [{ section_id: 's1', order: 1, name: 'S1', bus_ref: 'bus-15' }],
        transformer_refs: ['tr1', 'tr2'],
      })],
      bays: [bay('bay-1', 'OUT', 'g', 'bus-15', { gpz_section_id: 's1' })],
      buses: [bus('bus-15', 15), bus('bus-110-tr1', 110), bus('bus-110-tr2', 110)],
      transformers: [
        transformer('tr1', { hv_bus_ref: 'bus-110-tr1', lv_bus_ref: 'bus-15' }),
        transformer('tr2', { hv_bus_ref: 'bus-110-tr2', lv_bus_ref: 'bus-15' }),
      ],
    };
    const props = buildCanonicalGpzProps(enm, 'g');
    expect(props.hvBusRef ?? null).toBeNull();
    // Sekcja SN pozostaje jednoznaczna — odmowa dotyczy WYŁĄCZNIE strony WN.
    expect(props.sections[0].busRef).toBe('bus-15');
  });

  it('GPZ 3×TR na JEDNEJ wspólnej szynie 110 kV (karta GPZ-MODEL) ⇒ hvBusRef wskazuje tę szynę', () => {
    // Kształt modelu z kreatora GPZ, przypadek A: wszystkie transformatory WN/SN
    // mają stronę górną na tej samej szynie WN, każdy stronę dolną na swojej sekcji SN.
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g', {
        bus_refs: ['bus-110', 'bus-15-s1', 'bus-15-s2'],
        gpz_sections: [
          { section_id: 's1', order: 1, name: 'S1', bus_ref: 'bus-15-s1' },
          { section_id: 's2', order: 2, name: 'S2', bus_ref: 'bus-15-s2' },
        ],
        transformer_refs: ['tr1', 'tr2', 'tr3'],
      })],
      bays: [bay('bay-1', 'OUT', 'g', 'bus-15-s1', { gpz_section_id: 's1' })],
      buses: [bus('bus-110', 110), bus('bus-15-s1', 15), bus('bus-15-s2', 15)],
      transformers: [
        transformer('tr1', { hv_bus_ref: 'bus-110', lv_bus_ref: 'bus-15-s1' }),
        transformer('tr2', { hv_bus_ref: 'bus-110', lv_bus_ref: 'bus-15-s2' }),
        transformer('tr3', { hv_bus_ref: 'bus-110', lv_bus_ref: 'bus-15-s1' }),
      ],
    };
    const props = buildCanonicalGpzProps(enm, 'g');
    expect(props.hvBusRef).toBe('bus-110');
    expect(props.transformers.map((t) => t.hvBusRef)).toEqual(['bus-110', 'bus-110', 'bus-110']);
  });

  it('GPZ 1×TR (JEDNA szyna 110 kV) mimo drugiej szyny WN spoza bus_refs ⇒ hvBusRef wskazuje szynę TEJ stacji', () => {
    // Prymat danych: zbiór szyn WN liczymy z `Substation.bus_refs`, nie z całej
    // migawki — szyna WN sąsiedniej stacji nie może uczynić tej niejednoznaczną.
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g', {
        bus_refs: ['bus-15', 'bus-110'],
        gpz_sections: [{ section_id: 's1', order: 1, name: 'S1', bus_ref: 'bus-15' }],
      })],
      bays: [bay('bay-1', 'OUT', 'g', 'bus-15', { gpz_section_id: 's1' })],
      buses: [bus('bus-15', 15), bus('bus-110', 110), bus('bus-110-obca', 110)],
    };
    const props = buildCanonicalGpzProps(enm, 'g');
    expect(props.hvBusRef).toBe('bus-110');
  });
});


/* ---------------------------------------------------------------------------
   Karta GPZ-PARYTET — rola pola (tło `gpz.bay.panel`) i plakietki SPZ/SCO
   (`gpz.status_flags`) WYŁĄCZNIE z danych modelu. Iloczyn cech: rola pola
   (7 ról ENM) × kody funkcji EAZ ({brak, 79, 81U, 79+81U, zapis małymi literami
   ze spacją}) × ścieżka (funkcja czysta, adapter end-to-end).
   --------------------------------------------------------------------------- */

// Karta GPZ-H5: pola funkcyjne sekcji SN GPZ H5 (ENEA Zeszyt 1 §13) — EARTHING, CAPACITOR.
const ROLE_ENM: ReadonlyArray<Bay['bay_role']> = [
  'IN', 'OUT', 'FEEDER', 'TR', 'COUPLER', 'MEASUREMENT', 'OZE', 'EARTHING', 'CAPACITOR',
];

describe('buildCanonicalGpzProps — rola pola 1:1 z modelu (bez zlewania ról)', () => {
  const OCZEKIWANA = {
    IN: 'zasilajace',
    OUT: 'liniowe',
    FEEDER: 'liniowe',
    TR: 'transformatorowe',
    COUPLER: 'sprzeglo',
    MEASUREMENT: 'pomiarowe',
    OZE: 'zrodlowe',
    EARTHING: 'uziemiajace',
    CAPACITOR: 'kompensacyjne',
  } as const;

  for (const rola of ROLE_ENM) {
    it(`bay_role=${rola} → rolaPola=${OCZEKIWANA[rola]} (funkcja i adapter)`, () => {
      expect(rolaPolaGpz(rola)).toBe(OCZEKIWANA[rola]);
      const enm: EnmFragment = {
        ...emptyEnm(),
        substations: [gpz('g', { gpz_sections: [{ section_id: 's1', order: 1, name: 'S1', bus_ref: 'bus-15' }] })],
        bays: [bay('b', rola, 'g', 'bus-15', { gpz_section_id: 's1' })],
        buses: [bus('bus-15', 15)],
      };
      const props = buildCanonicalGpzProps(enm, 'g');
      expect(props.sections[0].bays[0].rolaPola).toBe(OCZEKIWANA[rola]);
    });
  }

  it('rola OZE nie jest już zlewana z odpływem (dawne mapowanie OZE → LINE_OUT gubiło ją)', () => {
    expect(rolaPolaGpz('OZE')).not.toBe(rolaPolaGpz('OUT'));
  });
});

describe('buildCanonicalGpzProps — plakietki SPZ/SCO z kodów funkcji EAZ pola', () => {
  const KODY: ReadonlyArray<readonly [string, readonly string[]]> = [
    ['brak', []],
    ['79', ['79']],
    ['81U', ['81U']],
    ['79+81U', ['50', '51', '79', '81U']],
    ['zapis małymi literami ze spacją', [' 79 ', '81u']],
  ];
  for (const rola of ROLE_ENM) {
    for (const [opis, kody] of KODY) {
      it(`rola=${rola} × kody=${opis}`, () => {
        const oczekiwane: string[] = [];
        if (kody.some((k) => k.trim() === '79')) oczekiwane.push('SPZ');
        if (kody.some((k) => k.trim().toUpperCase() === '81U') && rola !== 'OZE') oczekiwane.push('SCO');
        expect(flagiStatusuPola({ protection_codes: [...kody], bay_role: rola })).toEqual(oczekiwane);
        const enm: EnmFragment = {
          ...emptyEnm(),
          substations: [gpz('g', { gpz_sections: [{ section_id: 's1', order: 1, name: 'S1', bus_ref: 'bus-15' }] })],
          bays: [bay('b', rola, 'g', 'bus-15', { gpz_section_id: 's1', protection_codes: [...kody] })],
          buses: [bus('bus-15', 15)],
        };
        expect(buildCanonicalGpzProps(enm, 'g').sections[0].bays[0].statusFlags).toEqual(oczekiwane);
      });
    }
  }
});

describe('buildCanonicalGpzProps — napięcie sekcji bez wartości domyślnej', () => {
  it('sekcja wskazująca szynę spoza modelu → busVoltageKv null (dawniej 15 kV z powietrza)', () => {
    const enm: EnmFragment = {
      ...emptyEnm(),
      substations: [gpz('g', { gpz_sections: [{ section_id: 's1', order: 1, name: 'S1', bus_ref: 'bus-brak' }] })],
      bays: [bay('b', 'OUT', 'g', 'bus-15', { gpz_section_id: 's1' })],
      buses: [bus('bus-15', 15)],
    };
    expect(buildCanonicalGpzProps(enm, 'g').sections[0].busVoltageKv).toBeNull();
  });
});
