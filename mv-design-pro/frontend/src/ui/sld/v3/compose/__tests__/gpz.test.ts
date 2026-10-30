/**
 * SLD V3 F5b — testy `compose/gpz.ts` (SLD_CAD_SPEC_V3 §3/§8/§11).
 *
 * Sekcje (a)/(b)/(c) poniżej to MIGRACJA 1:1 inwariantów GPZ z v2 (spec §8:
 * „V3 przejmuje je 1:1"), przeniesionych jako asercje na `GpzComposition`
 * (bez DOM — `render`/`@testing-library/react`) zamiast na wyrenderowanym
 * SVG:
 *   (a) `GpzCanonicalRenderer.noDirectTie.test.tsx`     → `noDirectTransformerBusTies`
 *   (b) `GpzCanonicalRenderer.busbarTopology.test.tsx`  → `composition.sections`/meta segmentów
 *   (c) `visualParityChecklist.test.tsx`                → `composition.parityKeys`
 *       (WYŁĄCZNIE klucze GPZ — REQUIRED_MINI_RMU_PARITY_KEYS to domena
 *       `compose/station.ts`/F5a, poza zakresem tego pliku)
 */
import { describe, expect, it } from 'vitest';

import { GRID } from '../../core/grid';
import { SYMBOL_DEFS } from '../../symbols/defs';
import type {
  CanonicalGpzBay,
  CanonicalGpzSection,
  CanonicalGpzTransformer,
  CanonicalGpzProps,
  RolaPolaGpz,
} from '../../../v2/canvas/canonicalGpzModel';
import { PLAKIETKI_GPZ } from '../../../v2/canvas/canonicalGpzModel';
import type { BayPrimaryDeviceView, BayProtectionMarkingView, CtRatingAnnotationView } from '../../../v2/model/widokPolStacji';
import { uzwojeniaZGrupyPolaczen } from '../../symbols/uzwojenia';
import {
  ETYKIETA_ROLI_POLA_PL,
  KONTRAKT_NEGATYWNY_GPZ,
  ROLE_POL_GPZ,
  szerokoscSlotowNaglowka,
  tekstAlarmowGpz,
  tekstOdplywowGpz,
  tekstTytuluTabeliGpz,
  tekstZasilaniaGpz,
  ulozTabeliGpz,
  ulozWariantTabeliGpz,
  wariantJednowierszowyMiesciSie,
  WYSOKOSC_KARTY_GPZ,
  WYSOKOSC_KARTY_JEDNOWIERSZOWEJ_GPZ,
  type GpzAdnotacje,
  type PoleTabeliGpzWejscie,
} from '../gpzAdnotacje';
import {
  allGpzSymbolsOnGrid,
  busbarTopologyOf,
  composeGpz,
  gpzInternalSegmentsEndAtPortsOrBus,
  noDirectTransformerBusTies,
  noGpzSymbolOverlaps,
  podpisyWPasieBezNakladania,
  polozenieOkreguPrzekaznika,
  type GpzComposition,
  type PodpisAparatuWPasie,
} from '../gpz';
import { labelLineHeight } from '../../core/text';
import { PROTECTION_ANNOTATION_DIAMETER, RAMKA_BLOKU_PRZEKAZNIKA_MARGINES } from '../protectionMarking';

const ORIGIN = { x: 0, y: 0 };

const TR1: CanonicalGpzTransformer = {
  transformerRef: 'tr-1',
  designation: 'TR1',
  snMva: 25,
  uhvKv: 110,
  ulvKv: 15,
  vectorGroup: 'YNd11',
  poleTr: null,
  poleWn: null,
  lvSectionId: 'sec-1',
};

/**
 * GEOMETRIA-STACJI (§0 pkt 4): aparat rysuje się WYŁĄCZNIE z rekordu modelu
 * (`primaryDevices`). Fixtury testów, których intencją jest geometria/tożsamość
 * aparatów (DS/CB/CT/ES), niosą więc rekordy jawnie — dawniej te same symbole
 * dostarczała konwencja roli, zastąpiona sylwetką braku danych.
 */
function rekordy(prefix: string, kinds: readonly BayPrimaryDeviceView['kind'][]): readonly BayPrimaryDeviceView[] {
  return kinds.map((kind, i) => ({ kind, placement: 'MIDSTREAM' as const, deviceRef: `${prefix}/${kind.toLowerCase()}-${i}` }));
}

const APARATY_POLA_LINIOWEGO: readonly BayPrimaryDeviceView['kind'][] = ['DS', 'CB', 'CT', 'DS', 'ES', 'CABLE_HEAD'];

/** Transformator z rekordami pola WN (DS+CB+CT) i pola TR (DS+CB+CT+ES) w modelu. */
function zPolamiTransformatora(tr: CanonicalGpzTransformer): CanonicalGpzTransformer {
  const pole = (ref: string, kinds: readonly BayPrimaryDeviceView['kind'][]): CanonicalGpzBay => ({
    bayRef: ref,
    bayNumber: null,
    feederName: null,
    destinationLabel: null,
    fieldRole: 'TRANSFORMER',
    rolaPola: 'transformatorowe',
    statusFlags: [],
    qDesignations: {},
    primaryDevices: rekordy(ref, kinds),
  });
  return {
    ...tr,
    poleWn: pole(`${tr.transformerRef}/pole-wn`, ['DS', 'CB', 'CT']),
    poleTr: pole(`${tr.transformerRef}/pole-tr`, ['DS', 'CB', 'CT', 'ES']),
  };
}

const TR1_DANE = zPolamiTransformatora(TR1);

/** Rola tła pola zgodna z rolą stosu aparatów (ta sama dana modelu `Bay.bay_role`). */
const ROLA_DLA_STOSU: Readonly<Record<CanonicalGpzBay['fieldRole'], RolaPolaGpz>> = {
  LINE_IN: 'zasilajace',
  LINE_OUT: 'liniowe',
  LINE_BRANCH: 'liniowe',
  TRANSFORMER: 'transformatorowe',
  COUPLER: 'sprzeglo',
  MEASUREMENT: 'pomiarowe',
  SOURCE: 'zrodlowe',
  CAPACITOR_BANK: 'kompensacyjne',
};

function lineBay(ref: string, overrides: Partial<CanonicalGpzBay> = {}): CanonicalGpzBay {
  const fieldRole = overrides.fieldRole ?? 'LINE_OUT';
  return {
    bayRef: ref,
    bayNumber: '1',
    feederName: 'ODPŁYW 1',
    destinationLabel: 'ST-01',
    fieldRole,
    rolaPola: ROLA_DLA_STOSU[fieldRole],
    statusFlags: [],
    cbState: 'closed',
    dsState: 'closed',
    esState: 'open',
    qDesignations: { cb: 'Q0', dsBus: 'Q1', dsLin: 'Q9', es: 'Q8', ct: 'T1' },
    ...overrides,
  };
}

function baseProps(overrides: Partial<CanonicalGpzProps> = {}): CanonicalGpzProps {
  return {
    id: 'gpz-test',
    name: 'GPZ TEST',
    transformers: [TR1],
    sections: [
      {
        sectionId: 'sec-1',
        order: 1,
        label: 'S1',
        busVoltageKv: 15,
        bays: [lineBay('b-1')],
      },
    ],
    couplers: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Wyrocznie geometryczne na realnych footprintach (grid_probe/zero-overlap/
// endsAtPortsOrBus) — wzorzec z `compose/__tests__/station.test.ts`.
// ---------------------------------------------------------------------------

describe('V3 compose/gpz — wyrocznie (grid_probe, zero-overlap, endsAtPortsOrBus)', () => {
  const fixtures: ReadonlyArray<{ readonly name: string; readonly props: CanonicalGpzProps }> = [
    { name: 'single_transformer_single_section', props: baseProps() },
    {
      name: 'two_sections_with_coupler',
      props: baseProps({
        sections: [
          { sectionId: 'sec-1', order: 1, label: 'S1', busVoltageKv: 15, bays: [lineBay('b-1'), lineBay('b-2', { fieldRole: 'LINE_IN' })] },
          { sectionId: 'sec-2', order: 2, label: 'S2', busVoltageKv: 15, bays: [lineBay('b-3'), lineBay('b-4', { fieldRole: 'LINE_BRANCH' })] },
        ],
        transformers: [
          TR1,
          { ...TR1, transformerRef: 'tr-2', designation: 'TR2', lvSectionId: 'sec-2' },
        ],
        couplers: [{ couplerId: 'spr-1', leftSectionId: 'sec-1', rightSectionId: 'sec-2', designation: 'SP', closedState: 'closed' }],
      }),
    },
    {
      name: 'coupler_bay_and_measurement_bay',
      props: baseProps({
        sections: [
          {
            sectionId: 'sec-1',
            order: 1,
            label: 'S1',
            busVoltageKv: 15,
            bays: [lineBay('b-1'), lineBay('b-2', { fieldRole: 'COUPLER' }), lineBay('b-3', { fieldRole: 'MEASUREMENT' })],
          },
        ],
      }),
    },
    {
      name: 'hv_sections_with_line_bays',
      props: baseProps({
        hvSections: [
          {
            sectionId: 'hv-1',
            order: 1,
            label: '110 kV',
            busVoltageKv: 110,
            bays: [lineBay('hv-b-1', { bayNumber: 'H1' })],
          },
        ],
      }),
    },
    {
      name: 'no_transformers_no_hv',
      props: baseProps({ transformers: [], hvSections: [] }),
    },
  ];

  for (const { name, props } of fixtures) {
    it(`${name}: grid_probe / zero-overlap / endsAtPortsOrBus = zielone`, () => {
      const composition = composeGpz(props, ORIGIN);
      expect(allGpzSymbolsOnGrid(composition)).toBe(true);
      expect(noGpzSymbolOverlaps(composition)).toBe(true);
      expect(gpzInternalSegmentsEndAtPortsOrBus(composition)).toBe(true);
    });
  }

  it('brak transformatorów i brak hvSections ⇒ composition.missingData zawiera oba markery', () => {
    const composition = composeGpz(baseProps({ transformers: [], hvSections: [] }), ORIGIN);
    expect(composition.missingData).toEqual(expect.arrayContaining(['gpz.hv.missing', 'gpz.transformer.missing']));
    expect(composition.symbols.some((s) => s.symbolId === 'transformer2W')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (a) Migracja `GpzCanonicalRenderer.noDirectTie.test.tsx` — spec §8: TR
// 110/SN kończy się na kotwie pola TR, do szyny SN prowadzi kolumna
// aparatów; ZERO segmentu „lv_connector" (bezpośredni styk).
// ---------------------------------------------------------------------------

describe('V3 compose/gpz — migracja noDirectTie (guard no_direct_110kv_tr_tie_without_switchgear)', () => {
  it('TR 110/SN kończy się na kotwie pola TR, a do szyny SN prowadzi kolumna aparatów', () => {
    const composition = composeGpz(baseProps({ transformers: [TR1_DANE] }), ORIGIN);
    expect(noDirectTransformerBusTies(composition)).toBe(true);

    const tr = composition.transformers[0];
    expect(tr).toBeDefined();

    const hvConnector = composition.segments.find((s) => s.meta.parityKeys.includes('gpz.transformer.hv_connector'));
    expect(hvConnector?.meta.directTie110).toBe(false);
    expect(hvConnector?.meta.terminatesAt).toBe('hv_tr_bay_apparatus');

    const fieldAnchor = composition.segments.find((s) => s.meta.parityKeys.includes('gpz.transformer.field_anchor_connector'));
    expect(fieldAnchor?.meta.directTieSn).toBe(false);
    expect(fieldAnchor?.meta.terminatesAt).toBe('tr_field_anchor');

    const directLvTie = composition.segments.find((s) => s.meta.parityKeys.includes('gpz.transformer.lv_connector'));
    expect(directLvTie).toBeUndefined();

    // Pole WN TR: DS+CB+CT.
    expect(composition.symbols.some((s) => s.meta.testId === `${tr.hvBayTestId}-ds`)).toBe(true);
    expect(composition.symbols.some((s) => s.meta.testId === `${tr.hvBayTestId}-cb`)).toBe(true);
    expect(composition.symbols.some((s) => s.meta.testId === `${tr.hvBayTestId}-ct`)).toBe(true);

    // Pole TR: DS+CB+CT+ES.
    expect(composition.symbols.some((s) => s.meta.testId === `${tr.trFieldTestId}-ds`)).toBe(true);
    expect(composition.symbols.some((s) => s.meta.testId === `${tr.trFieldTestId}-cb`)).toBe(true);
    expect(composition.symbols.some((s) => s.meta.testId === `${tr.trFieldTestId}-ct`)).toBe(true);
    expect(composition.symbols.some((s) => s.meta.testId === `${tr.trFieldTestId}-es`)).toBe(true);
  });

  it('pola WN i TR bez rekordów aparatów: sylwetka braku danych zamiast aparatów z konwencji, styk nadal zakazany', () => {
    // GEOMETRIA-STACJI (§0 pkt 4c): transformator bez rekordów pól nie dostaje
    // wymyślonych DS/CB/CT/ES — obie kolumny niosą JEDNĄ sylwetkę bez stanu, a wyrocznia
    // zakazu bezpośredniego styku trzyma (pole jest, tylko jego wyposażenie jest nieznane).
    const composition = composeGpz(baseProps(), ORIGIN);
    expect(noDirectTransformerBusTies(composition)).toBe(true);
    const tr = composition.transformers[0];
    for (const prefix of [tr.hvBayTestId, tr.trFieldTestId]) {
      const stos = composition.symbols.filter((s) => s.meta.testId?.startsWith(`${prefix}-`));
      expect(stos.map((s) => s.symbolId)).toEqual(['bayNoEquipment']);
      expect(stos[0].state).toBeUndefined();
      expect(stos[0].meta.apparatusSource).toBe('brak');
    }
  });

  it('wyrocznia oblewa, gdy pole TR nie ma ŻADNEGO symbolu (bezpośredni styk)', () => {
    const composition = composeGpz(baseProps(), ORIGIN);
    const tr = composition.transformers[0];
    const bezPolaTr: GpzComposition = {
      ...composition,
      symbols: composition.symbols.filter((s) => !s.meta.testId?.startsWith(`${tr.trFieldTestId}-`)),
    };
    expect(noDirectTransformerBusTies(bezPolaTr)).toBe(false);
  });

  it('wielu transformatorów — inwariant trzyma dla KAŻDEGO niezależnie', () => {
    const composition = composeGpz(
      baseProps({
        sections: [
          { sectionId: 'sec-1', order: 1, label: 'S1', busVoltageKv: 15, bays: [lineBay('b-1')] },
          { sectionId: 'sec-2', order: 2, label: 'S2', busVoltageKv: 15, bays: [lineBay('b-2')] },
        ],
        transformers: [TR1_DANE, zPolamiTransformatora({ ...TR1, transformerRef: 'tr-2', designation: 'TR2', lvSectionId: 'sec-2' })],
      }),
      ORIGIN,
    );
    expect(composition.transformers).toHaveLength(2);
    expect(noDirectTransformerBusTies(composition)).toBe(true);
  });

  it('pole TR z esState="absent" NIE ma ES w polu SN dedykowanym roli TRANSFORMER (bay-fallback), ale pole TR transformatora (`transformers[]`) zawsze ma ES (spec §3)', () => {
    // Fallback bay-based TRANSFORMER role (rzadka gałąź, `section.bays`) —
    // respektuje esState='absent'; pole TR dedykowane transformatora (spec
    // §3 „pole TR: DS+CB+CT+ES") NIE zależy od esState bay'a (inny obiekt ENM).
    const composition = composeGpz(
      baseProps({
        sections: [
          {
            sectionId: 'sec-1',
            order: 1,
            label: 'S1',
            busVoltageKv: 15,
            bays: [{ ...lineBay('b-tr', { fieldRole: 'TRANSFORMER' }), esState: 'absent' }],
          },
        ],
        transformers: [TR1_DANE],
      }),
      ORIGIN,
    );
    const bayEsSymbols = composition.symbols.filter((s) => s.meta.bayRef === 'b-tr' && s.symbolId === 'earthSwitch');
    expect(bayEsSymbols).toHaveLength(0);
    const tr = composition.transformers[0];
    expect(composition.symbols.some((s) => s.meta.testId === `${tr.trFieldTestId}-es`)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (b) Migracja `GpzCanonicalRenderer.busbarTopology.test.tsx` — spec §3:
// single/double/ring + multi-sekcje niezależne.
// ---------------------------------------------------------------------------

describe('V3 compose/gpz — migracja busbarTopology (single/double/ring)', () => {
  function propsWithTopology(topology?: CanonicalGpzSection['busbarTopology']): CanonicalGpzProps {
    return baseProps({
      sections: [{ sectionId: 'sec-1', order: 1, label: 'S1', busVoltageKv: 15, bays: [lineBay('b-1')], busbarTopology: topology }],
    });
  }

  it('default (brak pola) → single: 1 szyna primary, brak reserve, brak ring-closure', () => {
    const composition = composeGpz(propsWithTopology(undefined), ORIGIN);
    expect(busbarTopologyOf(composition, 'sec-1')).toBe('single');
    const segs = composition.segments.filter((s) => s.meta.sectionId === 'sec-1');
    expect(segs.some((s) => s.meta.busbarRole === 'primary')).toBe(true);
    expect(segs.some((s) => s.meta.busbarRole === 'reserve')).toBe(false);
    expect(segs.some((s) => s.meta.ringClosure)).toBe(false);
  });

  it('single (jawnie) → identyczne zachowanie jak default', () => {
    const composition = composeGpz(propsWithTopology('single'), ORIGIN);
    expect(busbarTopologyOf(composition, 'sec-1')).toBe('single');
    const segs = composition.segments.filter((s) => s.meta.sectionId === 'sec-1');
    expect(segs.some((s) => s.meta.busbarRole === 'reserve')).toBe(false);
  });

  it('double → primary + reserve (dashed), brak ring-closure', () => {
    const composition = composeGpz(propsWithTopology('double'), ORIGIN);
    expect(busbarTopologyOf(composition, 'sec-1')).toBe('double');
    const segs = composition.segments.filter((s) => s.meta.sectionId === 'sec-1');
    const primary = segs.find((s) => s.meta.busbarRole === 'primary');
    const reserve = segs.find((s) => s.meta.busbarRole === 'reserve');
    expect(primary).toBeDefined();
    expect(reserve, 'Szyna reserve S2 musi istnieć dla topology=double').toBeDefined();
    expect(reserve?.meta.dashed).toBe(true);
    expect(segs.some((s) => s.meta.ringClosure)).toBe(false);
  });

  it('ring → primary + reserve (solid) + ring-closure', () => {
    const composition = composeGpz(propsWithTopology('ring'), ORIGIN);
    expect(busbarTopologyOf(composition, 'sec-1')).toBe('ring');
    const segs = composition.segments.filter((s) => s.meta.sectionId === 'sec-1');
    const reserve = segs.find((s) => s.meta.busbarRole === 'reserve');
    expect(reserve, 'Szyna reserve S2 musi istnieć dla topology=ring').toBeDefined();
    expect(reserve?.meta.dashed).toBeFalsy();
    expect(segs.some((s) => s.meta.ringClosure), 'Topology ring MUSI mieć ring closure').toBe(true);
  });

  it('multi-sekcje z różnymi topologiami — każda sekcja niezależna', () => {
    const composition = composeGpz(
      baseProps({
        sections: [
          { sectionId: 'sec-1', order: 1, label: 'S1', busVoltageKv: 15, bays: [lineBay('b-1')], busbarTopology: 'single' },
          { sectionId: 'sec-2', order: 2, label: 'S2', busVoltageKv: 15, bays: [lineBay('b-2')], busbarTopology: 'double' },
          { sectionId: 'sec-3', order: 3, label: 'S3', busVoltageKv: 15, bays: [lineBay('b-3')], busbarTopology: 'ring' },
        ],
      }),
      ORIGIN,
    );
    expect(busbarTopologyOf(composition, 'sec-1')).toBe('single');
    expect(busbarTopologyOf(composition, 'sec-2')).toBe('double');
    expect(busbarTopologyOf(composition, 'sec-3')).toBe('ring');

    const reserveBySection = (id: string) =>
      composition.segments.some((s) => s.meta.sectionId === id && s.meta.busbarRole === 'reserve');
    const ringClosureBySection = (id: string) =>
      composition.segments.some((s) => s.meta.sectionId === id && s.meta.ringClosure);

    expect(reserveBySection('sec-1')).toBe(false);
    expect(reserveBySection('sec-2')).toBe(true);
    expect(ringClosureBySection('sec-2')).toBe(false);
    expect(reserveBySection('sec-3')).toBe(true);
    expect(ringClosureBySection('sec-3')).toBe(true);
  });

  it('sekcje niezależne geometrycznie: bbox sekcji 1 i sekcji 2 nie nachodzą (x)', () => {
    const composition = composeGpz(
      baseProps({
        sections: [
          { sectionId: 'sec-1', order: 1, label: 'S1', busVoltageKv: 15, bays: [lineBay('b-1'), lineBay('b-2')] },
          { sectionId: 'sec-2', order: 2, label: 'S2', busVoltageKv: 15, bays: [lineBay('b-3')], busbarTopology: 'ring' },
        ],
      }),
      ORIGIN,
    );
    const primaryOf = (id: string) => composition.segments.find((s) => s.meta.sectionId === id && s.meta.busbarRole === 'primary')!;
    const sec1 = primaryOf('sec-1');
    const sec2 = primaryOf('sec-2');
    const sec1RightX = Math.max(...sec1.points.map((p) => p.x));
    const sec2LeftX = Math.min(...sec2.points.map((p) => p.x));
    expect(sec2LeftX).toBeGreaterThan(sec1RightX);
  });
});

// ---------------------------------------------------------------------------
// (c) Migracja `visualParityChecklist.test.tsx` — WYŁĄCZNIE klucze GPZ
// (dawne REQUIRED_GPZ_PARITY_KEYS z v2). Karta GPZ-PARYTET zamknęła listę odroczeń:
// klucze ramy, nagłówka, uzwojeń, teł pól, plakietek i pomiarów mają realne testy
// zachowania niżej („GPZ-PARYTET — …"), a elementy nagłówka SCADA — kontrakt
// negatywny `KONTRAKT_NEGATYWNY_GPZ` z uzasadnieniem.
// ---------------------------------------------------------------------------

const COVERED_GPZ_PARITY_KEYS = [
  'gpz.root',
  'gpz.hv',
  'gpz.bus.hv',
  'gpz.hv.bay',
  'gpz.transformers',
  'gpz.transformer.symbol',
  'gpz.section',
  'gpz.bus.sn',
  'gpz.bay',
  'gpz.bay.power_path',
  'gpz.apparatus.ds.bus',
  'gpz.apparatus.ds',
  'gpz.apparatus.cb.main',
  'gpz.apparatus.cb',
  'gpz.apparatus.ct',
  'gpz.apparatus.ds.line',
  'gpz.apparatus.es.side',
  'gpz.apparatus.cable_head',
  'gpz.coupler',
  'gpz.section.label',
] as const;

describe('V3 compose/gpz — migracja visualParityChecklist (WYŁĄCZNIE klucze GPZ)', () => {
  it('kompozycja pełnego fixture (transformator + hvSections + 2 sekcje + coupler) niesie wszystkie klucze COVERED', () => {
    const composition = composeGpz(
      baseProps({
        hvSections: [
          { sectionId: 'hv-1', order: 1, label: '110 kV', busVoltageKv: 110, bays: [lineBay('hv-b-1', { bayNumber: 'H1', primaryDevices: rekordy('hv-b-1', ['CB', 'DS']) })] },
        ],
        sections: [
          { sectionId: 'sec-1', order: 1, label: 'S1', busVoltageKv: 15, bays: [lineBay('b-1', { primaryDevices: rekordy('b-1', APARATY_POLA_LINIOWEGO) })] },
          { sectionId: 'sec-2', order: 2, label: 'S2', busVoltageKv: 15, bays: [lineBay('b-2', { bayNumber: '06', primaryDevices: rekordy('b-2', APARATY_POLA_LINIOWEGO) })] },
        ],
        transformers: [TR1_DANE],
        couplers: [{ couplerId: 'spr-1', leftSectionId: 'sec-1', rightSectionId: 'sec-2', designation: 'SP', closedState: 'closed' }],
      }),
      ORIGIN,
    );

    const missing = COVERED_GPZ_PARITY_KEYS.filter((key) => !composition.parityKeys.has(key));
    expect(missing).toEqual([]);
  });

  it('missing-data: bez transformatorów i bez hvSections → composition.missingData zawiera gpz.hv.missing/gpz.transformer.missing (odpowiednik v2 test "missing-data states")', () => {
    const composition = composeGpz(baseProps({ transformers: [], hvSections: [] }), ORIGIN);
    expect(composition.missingData).toEqual(expect.arrayContaining(['gpz.hv.missing', 'gpz.transformer.missing']));
  });
});

// ---------------------------------------------------------------------------
// (d) Mechanizm wierszy (colorSegmentLabelRows) dla podpisów celu pola —
// DECYZJA F5b (patrz nagłówek `gpz.ts`): analogiczny problem do F5a
// (etykieta szersza niż kolumna aparatów) rozwiązany TĄ SAMĄ funkcją, nie
// nowym stagger.
// ---------------------------------------------------------------------------

describe('V3 compose/gpz — mechanizm wierszy podpisów celu pola (kolorowanie przedziałów, nie stagger)', () => {
  it('dwa sąsiednie pola z długimi, nakładającymi się podpisami trafiają w RÓŻNE wiersze (rowIndex)', () => {
    const composition = composeGpz(
      baseProps({
        sections: [
          {
            sectionId: 'sec-1',
            order: 1,
            label: 'S1',
            busVoltageKv: 15,
            bays: [
              lineBay('b-1', { destinationLabel: 'BARDZO DŁUGA NAZWA STACJI DOCELOWEJ 01' }),
              lineBay('b-2', { destinationLabel: 'BARDZO DŁUGA NAZWA STACJI DOCELOWEJ 02' }),
            ],
          },
        ],
      }),
      ORIGIN,
    );
    const rectOf = (ref: string) => composition.labels.fieldCaptions.find((c) => c.ownerRef === `${ref}#caption`)?.primaryRect;
    const r1 = rectOf('b-1');
    const r2 = rectOf('b-2');
    expect(r1).toBeDefined();
    expect(r2).toBeDefined();
    // Nakładające się w X ⇒ różne y (różny wiersz) z definicji kolorowania.
    const overlapX = r1!.x < r2!.x + r2!.width && r1!.x + r1!.width > r2!.x;
    if (overlapX) expect(r1!.y).not.toBe(r2!.y);
  });

  it('pole bez destinationLabel/feederName niepustego ⇒ brak wpisu w fieldCaptions (brak ukrytego długu)', () => {
    const composition = composeGpz(
      baseProps({
        sections: [
          { sectionId: 'sec-1', order: 1, label: 'S1', busVoltageKv: 15, bays: [lineBay('b-1', { destinationLabel: null, feederName: null })] },
        ],
      }),
      ORIGIN,
    );
    expect(composition.labels.fieldCaptions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// FIX-A (recenzja F5b, MED): pole bez `bayNumber` ANI `destinationLabel`
// dostawało `feederName` DWUKROTNIE — raz jako oznacznik
// (`fieldDesignations`), raz jako podpis celu (`fieldCaptions`) — ten sam
// tekst renderowany dwa razy. Dedup: caption z `feederName` TYLKO gdy różni
// się od oznacznika.
// ---------------------------------------------------------------------------

describe('V3 compose/gpz — FIX-A: dedup oznacznika i podpisu pola (bez podwójnego feederName)', () => {
  it('bay z feederName, BEZ bayNumber i BEZ destinationLabel ⇒ fieldCaptions puste, brak wspólnego tekstu z fieldDesignations', () => {
    const composition = composeGpz(
      baseProps({
        sections: [
          {
            sectionId: 'sec-1',
            order: 1,
            label: 'S1',
            busVoltageKv: 15,
            bays: [lineBay('b-1', { bayNumber: null, destinationLabel: null, feederName: 'ODPŁYW 1' })],
          },
        ],
      }),
      ORIGIN,
    );
    expect(composition.labels.fieldCaptions).toHaveLength(0);
    const designationTexts = composition.labels.fieldDesignations.map((d) => d.text);
    const captionTexts = composition.labels.fieldCaptions.map((c) => c.text);
    expect(designationTexts).toContain('ODPŁYW 1');
    // Żaden tekst nie występuje jednocześnie w obu zbiorach.
    expect(designationTexts.some((t) => captionTexts.includes(t))).toBe(false);
  });

  it('bay BEZ bayNumber i BEZ feederName ⇒ oznacznik = deterministyczna numeracja F01 (recenzja NO-GO 2026-07-17 pkt 8)', () => {
    // INTENCJA pkt 8: pole bez ŻADNEGO oznacznika w danych przestaje być
    // anonimowe — dostaje numer rysunkowy per kolejność kompozycji sekcji
    // (F01… liniowe, FT1… transformatorowe). Dane zawsze wygrywają (testy
    // wyżej), numeracja jest OSTATNIM fallbackiem.
    const composition = composeGpz(
      baseProps({
        sections: [
          {
            sectionId: 'sec-1',
            order: 1,
            label: 'S1',
            busVoltageKv: 15,
            bays: [
              lineBay('b-1', { bayNumber: null, destinationLabel: null, feederName: null }),
              lineBay('b-2', { bayNumber: null, destinationLabel: null, feederName: null }),
            ],
          },
        ],
      }),
      ORIGIN,
    );
    const d1 = composition.labels.fieldDesignations.find((d) => d.ownerRef === 'b-1#designation');
    const d2 = composition.labels.fieldDesignations.find((d) => d.ownerRef === 'b-2#designation');
    expect(d1?.text).toBe('F01');
    expect(d2?.text).toBe('F02');
  });

  it('bay Z bayNumber ("05") i feederName, BEZ destinationLabel ⇒ caption = feederName (różni się od oznacznika "05")', () => {
    const composition = composeGpz(
      baseProps({
        sections: [
          {
            sectionId: 'sec-1',
            order: 1,
            label: 'S1',
            busVoltageKv: 15,
            bays: [lineBay('b-1', { bayNumber: '05', destinationLabel: null, feederName: 'ODPŁYW 1' })],
          },
        ],
      }),
      ORIGIN,
    );
    const designation = composition.labels.fieldDesignations.find((d) => d.ownerRef === 'b-1#designation');
    const caption = composition.labels.fieldCaptions.find((c) => c.ownerRef === 'b-1#caption');
    expect(designation?.text).toBe('05');
    expect(caption?.text).toBe('ODPŁYW 1');
  });

  it('destinationLabel obecny ⇒ caption = "→ " + destinationLabel niezależnie od feederName (dedup nie dotyczy tej gałęzi)', () => {
    const composition = composeGpz(
      baseProps({
        sections: [
          {
            sectionId: 'sec-1',
            order: 1,
            label: 'S1',
            busVoltageKv: 15,
            bays: [lineBay('b-1', { bayNumber: null, destinationLabel: 'ST-01', feederName: 'ODPŁYW 1' })],
          },
        ],
      }),
      ORIGIN,
    );
    const caption = composition.labels.fieldCaptions.find((c) => c.ownerRef === 'b-1#caption');
    expect(caption?.text).toBe('→ ST-01');
  });
});

// ---------------------------------------------------------------------------
// FIX-B (recenzja F5b, MED): szyna rezerwowa (`double`/`ring`) pokrywała się z
// primary — `snapToGrid(snBusY - GRID/2)` wraca do `snBusY` (wielokrotność
// GRID). Poprawka: `snBusY - GRID` (8px NAD primary, na siatce).
// ---------------------------------------------------------------------------

describe('V3 compose/gpz — FIX-B: szyna rezerwowa NIE pokrywa się z primary', () => {
  it('topology=double: reserve.y !== primary.y, różnica = dokładnie GRID', () => {
    const composition = composeGpz(
      baseProps({
        sections: [{ sectionId: 'sec-1', order: 1, label: 'S1', busVoltageKv: 15, bays: [lineBay('b-1')], busbarTopology: 'double' }],
      }),
      ORIGIN,
    );
    const segs = composition.segments.filter((s) => s.meta.sectionId === 'sec-1');
    const primary = segs.find((s) => s.meta.busbarRole === 'primary')!;
    const reserve = segs.find((s) => s.meta.busbarRole === 'reserve')!;
    expect(primary.points[0].y).not.toBe(reserve.points[0].y);
    expect(primary.points[0].y - reserve.points[0].y).toBe(GRID);
  });

  it('topology=ring: reserve.y !== primary.y (różnica = GRID), ring-closure łączy oba końce (reserveY↔snBusY)', () => {
    const composition = composeGpz(
      baseProps({
        sections: [{ sectionId: 'sec-1', order: 1, label: 'S1', busVoltageKv: 15, bays: [lineBay('b-1')], busbarTopology: 'ring' }],
      }),
      ORIGIN,
    );
    const segs = composition.segments.filter((s) => s.meta.sectionId === 'sec-1');
    const primary = segs.find((s) => s.meta.busbarRole === 'primary')!;
    const reserve = segs.find((s) => s.meta.busbarRole === 'reserve')!;
    const closure = segs.find((s) => s.meta.ringClosure)!;
    expect(primary.points[0].y).not.toBe(reserve.points[0].y);
    expect(primary.points[0].y - reserve.points[0].y).toBe(GRID);
    // Closure musi dochodzić do AKTUALNEJ (poprawionej) wartości reserveY,
    // nie do stanu sprzed poprawki.
    const closureYs = closure.points.map((p) => p.y);
    expect(closureYs).toContain(reserve.points[0].y);
    expect(closureYs).toContain(primary.points[0].y);
  });
});

// ---------------------------------------------------------------------------
// FIX-C (recenzja F5b, LOW-MED): stos pola kończący się symbolem bez portu S
// (np. ES w polu TR/MEASUREMENT) kolapsował `bottomPort` do `topPort` —
// segment przelotowy startował z GÓRY stosu, przez wszystkie aparaty.
// Poprawka: `bottomPort` = port S ostatniego symbolu, który go MA.
// ---------------------------------------------------------------------------

describe('V3 compose/gpz — FIX-C: bottomPort stosu z ES na końcu = port S CT (nie topPort)', () => {
  it('pole TR transformatora: segment #tr-field-to-bus zaczyna się w porcie S symbolu CT, nie w topPort stosu', () => {
    const composition = composeGpz(baseProps({ transformers: [TR1_DANE] }), ORIGIN);
    const tr = composition.transformers[0];
    const ctSymbol = composition.symbols.find((s) => s.meta.testId === `${tr.trFieldTestId}-ct`)!;
    const dsSymbol = composition.symbols.find((s) => s.meta.testId === `${tr.trFieldTestId}-ds`)!;
    expect(ctSymbol).toBeDefined();
    const ctSouthPort = ctSymbol.ports.bottom;
    expect(ctSouthPort).toBeDefined();

    const toBusSegment = composition.segments.find((s) => s.ownerRef === `${tr.transformerRef}#tr-field-to-bus`)!;
    expect(toBusSegment).toBeDefined();
    expect(toBusSegment.points[0].y).toBe(ctSouthPort.y);
    // NIE topPort stosu (port N symbolu DS, pierwszego w stosie).
    expect(toBusSegment.points[0].y).not.toBe(dsSymbol.ports.top.y);
  });

  it('test ogólny — dla KAŻDEGO transformatora niezależnie (pole TR kończy się ES): bottomPort (CT) > topPort (DS)', () => {
    // `bottomPort` jest konsumowany downstream WYŁĄCZNIE przez pole TR
    // dedykowane transformatora (`trFieldStack`, segment `#tr-field-to-bus`)
    // — to jedyne miejsce w compose, gdzie stos kończy się symbolem (ES) bez
    // portu S. Sprawdzamy niezależnie dla wielu transformatorów (wzorzec z
    // istniejącego testu noDirectTie „wielu transformatorów").
    const composition = composeGpz(
      baseProps({
        sections: [
          { sectionId: 'sec-1', order: 1, label: 'S1', busVoltageKv: 15, bays: [lineBay('b-1')] },
          { sectionId: 'sec-2', order: 2, label: 'S2', busVoltageKv: 15, bays: [lineBay('b-2')] },
        ],
        transformers: [TR1_DANE, zPolamiTransformatora({ ...TR1, transformerRef: 'tr-2', designation: 'TR2', lvSectionId: 'sec-2' })],
      }),
      ORIGIN,
    );
    for (const tr of composition.transformers) {
      const ctSymbol = composition.symbols.find((s) => s.meta.testId === `${tr.trFieldTestId}-ct`)!;
      const dsSymbol = composition.symbols.find((s) => s.meta.testId === `${tr.trFieldTestId}-ds`)!;
      const esSymbol = composition.symbols.find((s) => s.meta.testId === `${tr.trFieldTestId}-es`)!;
      expect(ctSymbol).toBeDefined();
      expect(dsSymbol).toBeDefined();
      expect(esSymbol).toBeDefined();
      const topPortY = dsSymbol.ports.top.y;
      const bottomPortY = ctSymbol.ports.bottom.y;
      expect(bottomPortY).toBeGreaterThan(topPortY);
      const toBusSegment = composition.segments.find((s) => s.ownerRef === `${tr.transformerRef}#tr-field-to-bus`)!;
      expect(toBusSegment.points[0].y).toBe(bottomPortY);
    }
  });
});

// ---------------------------------------------------------------------------
// FIX-D (recenzja F5b, LOW, uczciwość wyroczni): kontrprzykłady na
// `noDirectTransformerBusTies` — ręcznie sklecona minimalna `GpzComposition`
// (nie wywodzona z `composeGpz`, żeby nie maskować ewentualnego błędu
// wyroczni błędem w compose). Wyrocznia NIE była modyfikowana — oba
// kontrprzykłady już dają `false` z istniejącej implementacji.
// ---------------------------------------------------------------------------

describe('V3 compose/gpz — FIX-D: kontrprzykłady wyroczni noDirectTransformerBusTies', () => {
  function minimalSymbol(testId: string): GpzComposition['symbols'][number] {
    return {
      symbolId: 'disconnector',
      x: 0,
      y: 0,
      ports: {},
      meta: { parityKeys: [], testId },
    };
  }

  function minimalGoodComposition(): GpzComposition {
    const transformerRef = 'tr-x';
    const hvBayTestId = 'hv-bay-x';
    const trFieldTestId = 'tr-field-x';
    return {
      gpzId: 'gpz-manual',
      symbols: [
        minimalSymbol(`${hvBayTestId}-ds`),
        minimalSymbol(`${hvBayTestId}-cb`),
        minimalSymbol(`${hvBayTestId}-ct`),
        minimalSymbol(`${trFieldTestId}-ds`),
        minimalSymbol(`${trFieldTestId}-cb`),
        minimalSymbol(`${trFieldTestId}-ct`),
        minimalSymbol(`${trFieldTestId}-es`),
      ],
      segments: [
        {
          ownerRef: `${transformerRef}#hv-connector`,
          points: [{ x: 0, y: 0 }, { x: 0, y: GRID }],
          meta: {
            parityKeys: ['gpz.transformer.hv_connector'],
            transformerRef,
            directTie110: false,
            terminatesAt: 'hv_tr_bay_apparatus',
          },
        },
        {
          ownerRef: `${transformerRef}#field-anchor`,
          points: [{ x: 0, y: 0 }, { x: 0, y: GRID }],
          meta: {
            parityKeys: ['gpz.transformer.field_anchor_connector'],
            transformerRef,
            directTieSn: false,
            terminatesAt: 'tr_field_anchor',
          },
        },
      ],
      labels: {
        stationName: { ownerRef: 'gpz-manual', nameSlot: { x: 0, y: 0, width: GRID, height: GRID }, rows: [] },
        sectionLabels: [],
        transformerLabels: [],
        fieldDesignations: [],
        fieldCaptions: [],
        protection: [],
      },
      sections: [],
      transformers: [{ transformerRef, designation: 'TRX', hvBayTestId, trFieldTestId }],
      parityKeys: new Set(),
      missingData: [],
      protectionSymbols: [],
      // F11.1: `GpzComposition` niesie TERAZ tor wyzwalania/linię pomiarową —
      // puste tu (kontrprzykłady FIX-D dotyczą WYŁĄCZNIE toru mocy TR).
      protectionSegments: [],
      measurementSegments: [],
      bbox: { x: 0, y: 0, width: 0, height: 0 },
      neutralEarthingNotePl: null,
      zone: null,
      adnotacje: null,
      brakiPrzylaczy: [],
      brakiTopologiiFunkcji: [],
    };
  }

  it('baseline ręczny (minimalna kompozycja poprawna z konstrukcji) ⇒ oracle true', () => {
    expect(noDirectTransformerBusTies(minimalGoodComposition())).toBe(true);
  });

  it('segment z parityKey "gpz.transformer.lv_connector" (bezpośredni styk) ⇒ oracle false', () => {
    const good = minimalGoodComposition();
    const composition: GpzComposition = {
      ...good,
      segments: [
        ...good.segments,
        {
          ownerRef: 'tr-x#lv-connector',
          points: [{ x: 0, y: 0 }, { x: 0, y: GRID }],
          meta: { parityKeys: ['gpz.transformer.lv_connector'], transformerRef: 'tr-x' },
        },
      ],
    };
    expect(noDirectTransformerBusTies(composition)).toBe(false);
  });

  it('brak field-anchor (terminatesAt="tr_field_anchor") ⇒ oracle false', () => {
    const good = minimalGoodComposition();
    const composition: GpzComposition = {
      ...good,
      segments: good.segments.filter((s) => !s.meta.parityKeys.includes('gpz.transformer.field_anchor_connector')),
    };
    expect(noDirectTransformerBusTies(composition)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (e) Determinizm (P7).
// ---------------------------------------------------------------------------

describe('V3 compose/gpz — determinizm', () => {
  it('to samo wejście ⇒ identyczny wynik (dwukrotne wywołanie, głęboka równość)', () => {
    const props = baseProps({
      sections: [
        { sectionId: 'sec-1', order: 1, label: 'S1', busVoltageKv: 15, bays: [lineBay('b-1'), lineBay('b-2', { fieldRole: 'COUPLER' })], busbarTopology: 'double' },
        { sectionId: 'sec-2', order: 2, label: 'S2', busVoltageKv: 15, bays: [lineBay('b-3')], busbarTopology: 'ring' },
      ],
      couplers: [{ couplerId: 'spr-1', leftSectionId: 'sec-1', rightSectionId: 'sec-2', designation: 'SP', closedState: 'closed' }],
    });
    const first: GpzComposition = composeGpz(props, ORIGIN);
    const second: GpzComposition = composeGpz(props, ORIGIN);
    expect(second.symbols).toEqual(first.symbols);
    expect(second.segments).toEqual(first.segments);
    expect(second.labels).toEqual(first.labels);
    expect(second.sections).toEqual(first.sections);
    expect(second.transformers).toEqual(first.transformers);
    expect(second.bbox).toEqual(first.bbox);
    expect([...second.parityKeys].sort()).toEqual([...first.parityKeys].sort());
  });

  it('originy symboli i wierzchołki segmentów są wielokrotnościami GRID (grid_probe, sanity)', () => {
    const composition = composeGpz(baseProps(), ORIGIN);
    expect(GRID).toBe(8);
    expect(allGpzSymbolsOnGrid(composition)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (e') SLD-02 (V12K-091): wiersz regulacji zaczepów OLTC/DETC na tabliczce
// transformatora — reużycie `buildOltcAnnotation` (dane z modelu `tap_changer`).
// Addytywny/parytetowy: wiersz i klucz parytetu WYŁĄCZNIE gdy `oltc` obecny;
// bez regulacji fixtury pozostają nietknięte (uczciwy brak = brak wiersza).
// ---------------------------------------------------------------------------

describe('V3 compose/gpz — SLD-02 wiersz regulacji zaczepów OLTC', () => {
  function trLabelRowsOf(composition: GpzComposition, transformerRef: string): readonly string[] {
    const label = composition.labels.transformerLabels.find(
      (l) => l.ownerRef === `${transformerRef}#label`,
    );
    expect(label).toBeDefined();
    return label!.rows.map((r) => r.text);
  }

  it('transformator z regulacją OLTC (AUTO + U_zad) ⇒ wiersz tabliczki + klucz parytetu', () => {
    const composition = composeGpz(
      baseProps({
        transformers: [
          {
            ...TR1,
            oltc: {
              kind: 'OLTC',
              positionLabel: 'poz. +3',
              modeLabel: 'AUTO',
              setpointLabel: 'U_zad 15.5 kV',
            },
          },
        ],
      }),
      ORIGIN,
    );
    expect(trLabelRowsOf(composition, 'tr-1')).toContain('OLTC poz. +3 · AUTO · U_zad 15.5 kV');
    expect(composition.parityKeys.has('gpz.transformer.oltc')).toBe(true);
  });

  it('regulacja DETC bez nastawy (MAN) ⇒ wiersz bez U_zad (uczciwy brak)', () => {
    const composition = composeGpz(
      baseProps({
        transformers: [
          { ...TR1, oltc: { kind: 'DETC', positionLabel: 'poz. −2', modeLabel: 'MAN' } },
        ],
      }),
      ORIGIN,
    );
    expect(trLabelRowsOf(composition, 'tr-1')).toContain('DETC poz. −2 · MAN');
  });

  it('transformator bez regulacji (fixtura bazowa) ⇒ ZERO wierszy OLTC, brak klucza parytetu', () => {
    const composition = composeGpz(baseProps(), ORIGIN);
    const rows = trLabelRowsOf(composition, 'tr-1');
    expect(rows.some((t) => t.startsWith('OLTC') || t.startsWith('DETC'))).toBe(false);
    expect(composition.parityKeys.has('gpz.transformer.oltc')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (f) F9.9 R-1 (spec §17.1-§17.4, rozstrzygnięcie architekta 2026-07-15) —
// wyjątek „okrąg bez toru w GPZ NIE jest missingData" ZNIESIONY w F11.1
// (spec §17.6 doprecyzowanie, rejestr device-ref w GPZ, parytet ze
// stacjami): GPZ dopasowuje TERAZ `bay.primaryDevices` do szablonu pola i,
// gdy dane się zgadzają, rysuje tor wyzwalania + linię pomiarową DOKŁADNIE
// jak stacja (`resolveStationProtectionMarking` reużyta wprost) — patrz
// `describe` niżej „F11.1: rejestr device-ref".
// ---------------------------------------------------------------------------

describe('V3 compose/gpz — F9.9 R-1 (ZNIESIONY F11.1): okrąg przekaźnika bez rejestru device-ref', () => {
  const propsWithCodes = (codes: readonly string[]): CanonicalGpzProps =>
    baseProps({
      sections: [
        {
          sectionId: 'sec-1',
          order: 1,
          label: 'S1',
          busVoltageKv: 15,
          bays: [lineBay('b-prot', { protectionCodes: codes }), lineBay('b-plain')],
        },
      ],
    });

  it('§17.2 brak danych = brak oznaczenia: pola bez protectionCodes ⇒ ZERO okręgów (wszystkie istniejące fixtury tego pliku)', () => {
    const composition = composeGpz(baseProps(), ORIGIN);
    expect(composition.protectionSymbols).toHaveLength(0);
    expect(composition.labels.protection).toHaveLength(0);
  });

  it('F11.1 (usunięcie wyjątku §17.6): pole z kodami, ale BEZ `primaryDevices`/`protectionMarking` refów (bare `protectionCodes`, wywołujący sprzed F11.1) ⇒ DOKŁADNIE jeden okrąg z DWOMA pierwszymi kodami, ZERO segmentów wtórnych, ale missingData JEST zgłaszana TERAZ (parytet ze stacjami — dawny wyjątek R-1 ZNIESIONY)', () => {
    const composition = composeGpz(propsWithCodes(['50/51', '51N']), ORIGIN);
    expect(composition.protectionSymbols).toHaveLength(1);
    expect(composition.protectionSymbols[0].bayRef).toBe('b-prot');
    expect(composition.protectionSymbols[0].protectionCodes).toEqual(['50/51', '51N']);
    // BEZ danych refów (brak `protectionMarking.breakerRef`/`ctRef`) — brak
    // linii wtórnych z KONSTRUKCJI, dokładnie jak stacja z `protection_ref==null`.
    expect(composition.protectionSegments).toHaveLength(0);
    expect(composition.measurementSegments).toHaveLength(0);
    // F11.1: wyjątek §17.6 ZNIESIONY — okrąg bez toru JEST TERAZ missingData
    // (dokładnie jak dla stacji, `bay.protection.trip_link_unresolved`/
    // `measurement_link_unresolved`).
    expect(composition.missingData).toEqual(
      expect.arrayContaining([
        'bay.protection.trip_link_unresolved',
        'bay.protection.measurement_link_unresolved',
      ]),
    );
  });

  it('R-2 (§17.3 zd. 2): >2 kody ⇒ okrąg z dwoma pierwszymi + etykieta pełnej listy (kolejność źródłowa)', () => {
    const composition = composeGpz(propsWithCodes(['87T', '51', '50', '51N']), ORIGIN);
    expect(composition.protectionSymbols[0].protectionCodes).toEqual(['87T', '51']);
    const fullList = composition.labels.protection.filter((l) => l.ownerRef.endsWith('#protection-codes-full'));
    expect(fullList).toHaveLength(1);
    expect(fullList[0].text).toBe('87T · 51 · 50 · 51N');
  });

  it('B-1 (§17.4 L1, circle-only): okrąg BEZ kodów, zero etykiet protection', () => {
    const composition = composeGpz(propsWithCodes(['50/51', '51N', '67N']), ORIGIN, [], 'circle-only');
    expect(composition.protectionSymbols).toHaveLength(1);
    expect(composition.protectionSymbols[0].protectionCodes).toBeUndefined();
    expect(composition.labels.protection).toHaveLength(0);
  });

  it('B-1 (§17.4 L0, none): warstwa adnotacji nieobecna mimo kodów w danych', () => {
    const composition = composeGpz(propsWithCodes(['50/51']), ORIGIN, [], 'none');
    expect(composition.protectionSymbols).toHaveLength(0);
    expect(composition.labels.protection).toHaveLength(0);
  });

  it('istniejące wyrocznie GPZ (grid/overlap/porty/parity) pozostają zielone przy polu z kodami — okrąg nie zaburza toru mocy', () => {
    const composition = composeGpz(propsWithCodes(['50/51', '51N', '67N']), ORIGIN);
    expect(allGpzSymbolsOnGrid(composition)).toBe(true);
    expect(noGpzSymbolOverlaps(composition)).toBe(true);
    expect(gpzInternalSegmentsEndAtPortsOrBus(composition)).toBe(true);
    expect(noDirectTransformerBusTies(composition)).toBe(true);
    // Okrąg leży w KOLUMNIE ADNOTACJI pola (rezerwacja `fieldColumnRequiredWidth`
    // — na prawo od stosu aparatów), na siatce.
    const relay = composition.protectionSymbols[0];
    expect(relay.x % GRID).toBe(0);
    expect(relay.y % GRID).toBe(0);
    const stackXs = composition.symbols
      .filter((s) => s.meta.bayRef === 'b-prot')
      .map((s) => s.x + SYMBOL_DEFS[s.symbolId].width);
    expect(relay.x).toBeGreaterThanOrEqual(Math.max(...stackXs));
  });
});

// ---------------------------------------------------------------------------
// (g) F11.1 (spec §17.2/§18.3/§20.1, rejestr device-ref w GPZ — parytet ze
// stacjami): `bay.primaryDevices` dopasowany DOKŁADNIE do szablonu pola ⇒
// tor wyzwalania + linia pomiarowa + adnotacja CT, TAK SAMO jak
// `compose/station.ts`. Negatyw: dane nierozwiązane/niedopasowane ⇒ zero
// zgadywania (missingData, nie linia „do domyślnego aparatu").
// ---------------------------------------------------------------------------

describe('V3 compose/gpz — F11.1: rejestr device-ref (tor wyzwalania + linia pomiarowa + adnotacja CT)', () => {
  // Sekwencja DOKŁADNIE odpowiadająca `lineFieldTemplate()` (gpz.ts):
  // DS_BUS → CB_MAIN → CT → DS_LIN → ES_SIDE → CABLE_HEAD (esState!=='absent',
  // domyślne `lineBay` niesie 'open' — ES obecny w szablonie).
  const alignedLineDevices: readonly BayPrimaryDeviceView[] = [
    { kind: 'DS', placement: 'UPSTREAM', deviceRef: 'ds-bus-1' },
    { kind: 'CB', placement: 'MIDSTREAM', deviceRef: 'cb-1', switchState: 'closed' },
    { kind: 'CT', placement: 'MIDSTREAM', deviceRef: 'ct-1', linkedRef: 'meas-ct-1' },
    { kind: 'DS', placement: 'MIDSTREAM', deviceRef: 'ds-lin-1' },
    { kind: 'ES', placement: 'DOWNSTREAM', deviceRef: 'es-1' },
    { kind: 'CABLE_HEAD', placement: 'DOWNSTREAM', deviceRef: 'head-1' },
  ];

  const protMarking: BayProtectionMarkingView = {
    codes: ['50/51', '51N'],
    breakerRef: 'cb-1',
    ctRef: 'ct-1',
  };

  const ctRatings: readonly CtRatingAnnotationView[] = [
    { measurementRef: 'meas-ct-1', identifier: 'T1', ratioText: '300/5' },
  ];

  const propsWithRegistry = (overrides: Partial<CanonicalGpzBay> = {}): CanonicalGpzProps =>
    baseProps({
      sections: [
        {
          sectionId: 'sec-1',
          order: 1,
          label: 'S1',
          busVoltageKv: 15,
          bays: [
            lineBay('b-prot', {
              protectionCodes: protMarking.codes,
              primaryDevices: alignedLineDevices,
              protectionMarking: protMarking,
              ctRatingAnnotations: ctRatings,
              ...overrides,
            }),
          ],
        },
      ],
    });

  it('dane zgodne z szablonem ⇒ tor wyzwalania (#trip-line) do wyłącznika deviceRef="cb-1" + "52"', () => {
    const composition = composeGpz(propsWithRegistry(), ORIGIN);
    expect(composition.protectionSegments).toHaveLength(1);
    expect(composition.protectionSegments[0].ownerRef).toBe('b-prot#trip-line');
    const breaker = composition.symbols.find(
      (s) => s.meta.bayRef === 'b-prot' && s.symbolId === 'breaker',
    )!;
    expect(breaker.deviceRef).toBe('cb-1');
    const last = composition.protectionSegments[0].points[0];
    const breakerNorthPort = breaker.ports.top ?? Object.values(breaker.ports)[0];
    expect(last).toEqual({ x: breakerNorthPort.x, y: breakerNorthPort.y });
    expect(composition.labels.protection.some((l) => l.ownerRef === 'b-prot#device-number' && l.text === '52')).toBe(true);
    expect(composition.missingData).not.toContain('bay.protection.trip_link_unresolved');
  });

  it('dane zgodne z szablonem ⇒ linia pomiarowa (#measurement-link) od CT deviceRef="ct-1"', () => {
    const composition = composeGpz(propsWithRegistry(), ORIGIN);
    expect(composition.measurementSegments).toHaveLength(1);
    expect(composition.measurementSegments[0].ownerRef).toBe('b-prot#measurement-link');
    const ct = composition.symbols.find(
      (s) => s.meta.bayRef === 'b-prot' && s.symbolId === 'currentTransformer',
    )!;
    expect(ct.deviceRef).toBe('ct-1');
    expect(ct.linkedRef).toBe('meas-ct-1');
    expect(composition.missingData).not.toContain('bay.protection.measurement_link_unresolved');
  });

  it('dane zgodne z szablonem ⇒ adnotacja CT „T1 · 300/5" zakotwiczona na aparacie CT', () => {
    const composition = composeGpz(propsWithRegistry(), ORIGIN);
    const ctLabel = composition.labels.protection.find((l) => l.ownerRef === 'b-prot#ct-rating-ct-1');
    expect(ctLabel).toBeDefined();
    expect(ctLabel!.text).toBe('T1 · 300/5');
    expect(composition.missingData).not.toContain('bay.protection.ct_rating_anchor_unresolved');
  });

  it('dwie linie wtórne mają RÓŻNE ownerRef (§20.1 „zakaz jednej anonimowej linii")', () => {
    const composition = composeGpz(propsWithRegistry(), ORIGIN);
    expect(composition.protectionSegments[0].ownerRef).not.toBe(composition.measurementSegments[0].ownerRef);
  });

  it('negatyw — zero zgadywania (a): rekordy niepełne (DS+CB+CT) ⇒ stos to DOKŁADNIE te rekordy, bez dorysowanego DS liniowego/ES/głowicy', () => {
    // KOREKTA (GEOMETRIA-STACJI §0 pkt 4): dawniej rekordy porównywano z szablonem roli
    // i przy niezgodności długości rysowano CAŁY szablon bez refów (aparaty z konwencji).
    // Szablon skasowany — stos JEST rekordami modelu, więc „zero zgadywania" znaczy teraz:
    // żaden aparat spoza rekordów nie powstaje, a refy rekordów trafiają na swoje symbole.
    const composition = composeGpz(
      propsWithRegistry({ primaryDevices: alignedLineDevices.slice(0, 3) }),
      ORIGIN,
    );
    const stos = composition.symbols.filter((s) => s.meta.bayRef === 'b-prot');
    expect(stos.map((s) => s.symbolId)).toEqual(['disconnector', 'breaker', 'currentTransformer']);
    expect(stos.map((s) => s.deviceRef)).toEqual(['ds-bus-1', 'cb-1', 'ct-1']);
    expect(stos.every((s) => s.meta.apparatusSource === 'dane')).toBe(true);
  });

  it('negatyw — zero zgadywania (b): `breaker_ref`/`ct_ref` wskazują refy NIEOBECNE w stosie (dane niespójne) ⇒ okrąg pozycjonowany, ale BEZ linii + missingData', () => {
    const composition = composeGpz(
      propsWithRegistry({ protectionMarking: { ...protMarking, breakerRef: 'cb-inny', ctRef: 'ct-inny' } }),
      ORIGIN,
    );
    expect(composition.protectionSymbols).toHaveLength(1);
    expect(composition.protectionSegments).toHaveLength(0);
    expect(composition.measurementSegments).toHaveLength(0);
    expect(composition.missingData).toEqual(
      expect.arrayContaining([
        'bay.protection.trip_link_unresolved',
        'bay.protection.measurement_link_unresolved',
      ]),
    );
  });

  it('istniejące wyrocznie GPZ pozostają zielone z pełnym rejestrem device-ref (tor+linia+adnotacja razem)', () => {
    const composition = composeGpz(propsWithRegistry(), ORIGIN);
    expect(allGpzSymbolsOnGrid(composition)).toBe(true);
    expect(noGpzSymbolOverlaps(composition)).toBe(true);
    expect(gpzInternalSegmentsEndAtPortsOrBus(composition)).toBe(true);
    expect(noDirectTransformerBusTies(composition)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ADAPTER-BUSREF (dług W4/R2/V12K-163): segmenty szyn GPZ niosą addytywny
// `busResultRef` = KANONICZNY Bus ref z propsów (snapshot ENM przez adapter).
// Metadana addytywna: `ownerRef` (kompozyt sceny) NIETKNIĘTY.
// ---------------------------------------------------------------------------

describe('V3 compose/gpz — ADAPTER-BUSREF (busResultRef szyn sekcji + szyny WN)', () => {
  function busSegments(composition: GpzComposition, sectionId: string) {
    return composition.segments.filter(
      (s) => s.ownerRef.startsWith(`${sectionId}#bus`) || s.ownerRef === `${sectionId}#ring-closure`,
    );
  }

  it('sekcja single z busRef ⇒ szyna główna niesie busResultRef = kanoniczny ref (ownerRef pozostaje kompozytem)', () => {
    const composition = composeGpz(
      baseProps({
        sections: [{ sectionId: 'sec-1', order: 1, label: 'S1', busVoltageKv: 15, bays: [lineBay('b-1')], busRef: 'bus/real/sn-1' }],
      }),
      ORIGIN,
    );
    const primary = composition.segments.find((s) => s.ownerRef === 'sec-1#bus-primary');
    expect(primary).toBeDefined();
    expect(primary!.ownerRef).toBe('sec-1#bus-primary'); // identyfikator sceny nietknięty
    expect(primary!.meta.busResultRef).toBe('bus/real/sn-1'); // kanoniczny ref addytywnie
  });

  it('sekcja double ⇒ szyna główna I rezerwowa współdzielą ten sam kanoniczny busResultRef (jedna szyna fizyczna)', () => {
    const composition = composeGpz(
      baseProps({
        sections: [{ sectionId: 'sec-1', order: 1, label: 'S1', busVoltageKv: 15, bays: [lineBay('b-1')], busbarTopology: 'double', busRef: 'bus/real/sn-1' }],
      }),
      ORIGIN,
    );
    const refs = busSegments(composition, 'sec-1').map((s) => s.meta.busResultRef);
    expect(refs.length).toBeGreaterThanOrEqual(2);
    expect(refs.every((r) => r === 'bus/real/sn-1')).toBe(true);
  });

  it('sekcja ring ⇒ szyna główna, rezerwowa I domknięcie ringu niosą ten sam busResultRef', () => {
    const composition = composeGpz(
      baseProps({
        sections: [{ sectionId: 'sec-1', order: 1, label: 'S1', busVoltageKv: 15, bays: [lineBay('b-1')], busbarTopology: 'ring', busRef: 'bus/real/sn-1' }],
      }),
      ORIGIN,
    );
    const closure = composition.segments.find((s) => s.ownerRef === 'sec-1#ring-closure');
    expect(closure!.meta.busResultRef).toBe('bus/real/sn-1');
    expect(busSegments(composition, 'sec-1').every((s) => s.meta.busResultRef === 'bus/real/sn-1')).toBe(true);
  });

  it('NO-OP: sekcja BEZ busRef ⇒ busResultRef undefined (uczciwy brak, zero fabrykacji)', () => {
    const composition = composeGpz(baseProps(), ORIGIN);
    const primary = composition.segments.find((s) => s.ownerRef === 'sec-1#bus-primary');
    expect(primary).toBeDefined();
    expect(primary!.meta.busResultRef).toBeUndefined();
  });

  it('szyna WN niesie busResultRef = props.hvBusRef (gdy obecne)', () => {
    const composition = composeGpz(
      baseProps({
        hvBusRef: 'bus/real/hv-110',
        hvSections: [{ sectionId: 'hv-1', order: 1, label: '110 kV', busVoltageKv: 110, bays: [lineBay('hvb-1', { fieldRole: 'LINE_IN' })] }],
      }),
      ORIGIN,
    );
    const hvBus = composition.segments.find((s) => s.ownerRef === 'gpz-test#hv-bus');
    expect(hvBus).toBeDefined();
    expect(hvBus!.meta.busResultRef).toBe('bus/real/hv-110');
  });
});

// ---------------------------------------------------------------------------
// GPZ-PARYTET — klucze dawniej odroczone: rama, nagłówek, uzwojenia, tła pól,
// plakietki, pomiary + kontrakt negatywny nagłówka SCADA.
// ---------------------------------------------------------------------------

type Prost = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

const przecina = (a: Prost, b: Prost): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const zawiera = (zew: Prost, wew: Prost): boolean =>
  wew.x >= zew.x && wew.y >= zew.y && wew.x + wew.width <= zew.x + zew.width && wew.y + wew.height <= zew.y + zew.height;

function prostokatySymboli(c: GpzComposition): Prost[] {
  return c.symbols.map((sym) => ({ x: sym.x, y: sym.y, width: SYMBOL_DEFS[sym.symbolId].width, height: SYMBOL_DEFS[sym.symbolId].height }));
}

function prostokatyOdcinkow(c: GpzComposition): Prost[] {
  return c.segments.map((seg) => {
    const xs = seg.points.map((p) => p.x);
    const ys = seg.points.map((p) => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  });
}

/** Prostokąty wszystkich treści adnotacji belki i tabeli (bez teł pól). */
function prostokatyAdnotacji(adn: GpzAdnotacje): Prost[] {
  return [adn.zasilanie, adn.odplywy, adn.alarmy, ...(adn.tabela ? [adn.tabela.rect] : [])];
}

/** Pełny GPZ: strona WN z polem zasilającym, transformator, dwie sekcje SN z polami
 *  wszystkich ról, sprzęgło — każda rola modelu obecna. */
function pelnyGpz(overrides: Partial<CanonicalGpzProps> = {}): CanonicalGpzProps {
  return baseProps({
    hvSections: [
      {
        sectionId: 'hv-1',
        order: 1,
        label: '110 kV',
        busVoltageKv: 110,
        bays: [lineBay('hv-b-1', { bayNumber: 'H1', fieldRole: 'LINE_IN', statusFlags: ['SPZ'] })],
      },
    ],
    sections: [
      {
        sectionId: 'sec-1',
        order: 1,
        label: 'S1',
        busVoltageKv: 15,
        bays: [
          lineBay('b-1', { bayNumber: '01', statusFlags: ['SPZ', 'SCO'] }),
          lineBay('b-2', { bayNumber: '02', fieldRole: 'MEASUREMENT', feederName: 'POMIAR' }),
          lineBay('b-3', { bayNumber: '03', rolaPola: 'zrodlowe', feederName: 'FW 1', statusFlags: [] }),
        ],
      },
      {
        sectionId: 'sec-2',
        order: 2,
        label: 'S2',
        busVoltageKv: 15,
        bays: [lineBay('b-4', { bayNumber: '04', statusFlags: ['SCO'] })],
      },
    ],
    couplers: [{ couplerId: 'spr-1', leftSectionId: 'sec-1', rightSectionId: 'sec-2', designation: 'SP', closedState: 'closed' }],
    ...overrides,
  });
}

describe('GPZ-PARYTET — rama i nagłówek (gpz.frame / gpz.header / gpz.header.name)', () => {
  const warianty: ReadonlyArray<readonly [string, CanonicalGpzProps]> = [
    ['minimalny (jedna sekcja, jedno pole)', baseProps()],
    ['pełny (WN + 2 sekcje + sprzęgło, wszystkie role)', pelnyGpz()],
    ['bez nazwy w modelu', pelnyGpz({ name: null })],
    // Pola z rekordami aparatów (szerokość kolumny pola z danych — GEOMETRIA-STACJI §0 pkt 4).
    ['wiele pól (łamanie kart)', baseProps({ sections: [{ sectionId: 'sec-1', order: 1, label: 'S1', busVoltageKv: 15, bays: Array.from({ length: 9 }, (_, i) => lineBay(`b-${i}`, { bayNumber: String(i + 1).padStart(2, '0'), primaryDevices: rekordy(`b-${i}`, APARATY_POLA_LINIOWEGO) })) }] })],
  ];

  for (const [opis, props] of warianty) {
    it(`${opis}: rama obejmuje symbole, odcinki, nagłówek i tabelę z marginesem ≥ GRID; nic z nagłówka/tabeli nie koliduje z treścią`, () => {
      const c = composeGpz(props, ORIGIN);
      expect(c.zone).not.toBeNull();
      expect(c.adnotacje).not.toBeNull();
      const zone = c.zone!;
      const wnetrze = { x: zone.x + GRID, y: zone.y + GRID / 2, width: zone.width - 2 * GRID, height: zone.height - GRID };
      for (const r of [...prostokatySymboli(c), ...prostokatyOdcinkow(c)]) expect(zawiera(zone, r)).toBe(true);
      expect(zawiera(wnetrze, c.labels.stationName.nameSlot)).toBe(true);
      for (const r of prostokatyAdnotacji(c.adnotacje!)) expect(zawiera(wnetrze, r)).toBe(true);
      const tresc = [...prostokatySymboli(c), ...prostokatyOdcinkow(c), ...c.labels.transformerLabels.map((l) => l.nameSlot)];
      for (const r of [c.labels.stationName.nameSlot, ...prostokatyAdnotacji(c.adnotacje!)]) {
        expect(tresc.filter((t) => przecina(r, t))).toEqual([]);
      }
      // Wiersze belki nie nachodzą na siebie ani na tabelę.
      const belka = [c.labels.stationName.nameSlot, ...prostokatyAdnotacji(c.adnotacje!)];
      belka.forEach((a, i) => belka.slice(i + 1).forEach((b) => expect(przecina(a, b)).toBe(false)));
      expect(c.parityKeys.has('gpz.frame')).toBe(true);
      expect(c.parityKeys.has('gpz.header')).toBe(true);
    });
  }

  it('nazwa z modelu: klucz gpz.header.name, tekst nagłówka z nazwy; bez prefiksu podwójnego „GPZ GPZ"', () => {
    const z = composeGpz(baseProps({ name: 'GPZ Północ' }), ORIGIN);
    expect(z.parityKeys.has('gpz.header.name')).toBe(true);
    expect(z.labels.stationName.rows[0].text.startsWith('GPZ Północ')).toBe(true);
    expect(z.missingData).not.toContain('gpz.name.missing');
    const bezPrefiksu = composeGpz(baseProps({ name: 'Północ' }), ORIGIN);
    expect(bezPrefiksu.labels.stationName.rows[0].text.startsWith('GPZ Północ')).toBe(true);
  });

  for (const pusta of [null, '', '   '] as const) {
    it(`brak nazwy w modelu (${JSON.stringify(pusta)}): jawny stan braku, gpz.name.missing, brak klucza gpz.header.name — bez wymyślonej nazwy`, () => {
      const c = composeGpz(baseProps({ name: pusta }), ORIGIN);
      expect(c.missingData).toContain('gpz.name.missing');
      expect(c.parityKeys.has('gpz.header.name')).toBe(false);
      expect(c.parityKeys.has('gpz.header')).toBe(true);
      expect(c.labels.stationName.rows[0].text.startsWith('GPZ — brak nazwy w modelu')).toBe(true);
    });
  }

  it('tabela łamie karty w szerokości treści: wiele pól ⇒ wiele kolumn kart, a tabela nie wystaje poza wnętrze ramy', () => {
    const c = composeGpz(warianty[3][1], ORIGIN);
    const tabela = c.adnotacje!.tabela!;
    expect(tabela.karty).toHaveLength(9);
    expect(tabela.kolumnyKart.length).toBeGreaterThan(1);
    expect(tabela.rect.x + tabela.rect.width).toBeLessThanOrEqual(c.zone!.x + c.zone!.width - GRID);
    // Karty rozłączne parami.
    tabela.karty.forEach((a, i) => tabela.karty.slice(i + 1).forEach((b) => expect(przecina(a.rect, b.rect)).toBe(false)));
  });

  it('karta szersza niż dostępna szerokość (bardzo długie oznaczenie z modelu): jedna kolumna kart, rama rośnie do karty — tekst nie jest ucinany', () => {
    const dlugie = 'Pole odpływowe zasilające osiedle Północ — linia kablowa nr 17';
    const c = composeGpz(baseProps({ sections: [{ sectionId: 'sec-1', order: 1, label: 'S1', busVoltageKv: 15, bays: [lineBay('b-1', { bayNumber: dlugie })] }] }), ORIGIN);
    const tabela = c.adnotacje!.tabela!;
    expect(tabela.kolumnyKart).toHaveLength(1);
    expect(tabela.karty[0].oznaczenie).toBe(dlugie);
    expect(zawiera(c.zone!, tabela.rect)).toBe(true);
  });

  it('pola bez oznaczenia w modelu (brak numeru i nazwy pola WN): karta mówi „bez oznaczenia" — nie wymyśla numeru', () => {
    const c = composeGpz(
      baseProps({ hvSections: [{ sectionId: 'hv-1', order: 1, label: '110 kV', busVoltageKv: 110, bays: [lineBay('hv-b-1', { bayNumber: undefined, feederName: undefined, fieldRole: 'LINE_IN' })] }] }),
      ORIGIN,
    );
    const karta = c.adnotacje!.tabela!.karty.find((k) => k.bayRef === 'hv-b-1')!;
    expect(karta.oznaczenie).toBe('bez oznaczenia');
  });
});

describe('GPZ-PARYTET — uzwojenia transformatora z grupy połączeń (gpz.transformer.winding.hv/.sn)', () => {
  const PRZYPADKI = [
    { grupa: 'Dyn11', gorne: ['trojkat', false], dolne: ['gwiazda', true], godzina: 11 },
    { grupa: 'Yyn0', gorne: ['gwiazda', false], dolne: ['gwiazda', true], godzina: 0 },
    { grupa: 'YNd11', gorne: ['gwiazda', true], dolne: ['trojkat', false], godzina: 11 },
    { grupa: 'Yzn11', gorne: ['gwiazda', false], dolne: ['zygzak', true], godzina: 11 },
    { grupa: 'Dd0', gorne: ['trojkat', false], dolne: ['trojkat', false], godzina: 0 },
  ] as const;

  for (const p of PRZYPADKI) {
    it(`${p.grupa}: rozbiór → uzwojenia (${p.gorne[0]}${p.gorne[1] ? '+N' : ''} / ${p.dolne[0]}${p.dolne[1] ? '+n' : ''}, godz. ${p.godzina}); symbol transformatora niesie je; klucze winding.hv/.sn`, () => {
      const u = uzwojeniaZGrupyPolaczen(p.grupa);
      expect(u).toEqual({
        stan: 'znane',
        gorne: { rodzaj: p.gorne[0], punktNeutralny: p.gorne[1] },
        dolne: { rodzaj: p.dolne[0], punktNeutralny: p.dolne[1] },
        godzina: p.godzina,
      });
      const c = composeGpz(baseProps({ transformers: [{ ...TR1, vectorGroup: p.grupa }] }), ORIGIN);
      const tr = c.symbols.filter((sym) => sym.symbolId === 'transformer2W');
      expect(tr).toHaveLength(1);
      expect(tr[0].uzwojenia).toEqual(u);
      expect(c.parityKeys.has('gpz.transformer.winding.hv')).toBe(true);
      expect(c.parityKeys.has('gpz.transformer.winding.sn')).toBe(true);
      expect(c.missingData.filter((m) => m.startsWith('gpz.transformer.vector_group'))).toEqual([]);
    });
  }

  for (const [opis, grupa, stan, brak] of [
    ['brak grupy w modelu (undefined)', undefined, 'brak', 'gpz.transformer.vector_group.missing:tr-1'],
    ['pusta grupa', '  ', 'brak', 'gpz.transformer.vector_group.missing:tr-1'],
    ['zapis spoza notacji', 'Xy5', 'nierozpoznane', 'gpz.transformer.vector_group.unrecognized:tr-1'],
    ['godzina spoza 0…11', 'Dyn12', 'nierozpoznane', 'gpz.transformer.vector_group.unrecognized:tr-1'],
  ] as const) {
    it(`${opis}: jawny znacznik braku (stan „${stan}"), wpis missingData, BEZ kluczy winding — nie zgadujemy uzwojeń`, () => {
      const c = composeGpz(baseProps({ transformers: [{ ...TR1, vectorGroup: grupa as unknown as string | null }] }), ORIGIN);
      const tr = c.symbols.find((sym) => sym.symbolId === 'transformer2W')!;
      expect(tr.uzwojenia?.stan).toBe(stan);
      expect(c.missingData).toContain(brak);
      expect(c.parityKeys.has('gpz.transformer.winding.hv')).toBe(false);
      expect(c.parityKeys.has('gpz.transformer.winding.sn')).toBe(false);
    });
  }
});

describe('GPZ-PARYTET — tła pól wg roli (gpz.bay.panel) i legenda ról', () => {
  it('każda rola modelu ma etykietę polską i pozycję w legendzie w stałej kolejności', () => {
    // 7. rola: „kompensacyjne" — pole baterii kondensatorów (karta UX-04/POLE-BKR-MODEL).
    expect(ROLE_POL_GPZ).toHaveLength(7);
    for (const rola of ROLE_POL_GPZ) expect(ETYKIETA_ROLI_POLA_PL[rola].length).toBeGreaterThan(0);
  });

  it('pełny GPZ: tło dla każdego pola z rolą z modelu; tła rozłączne parami i nie zachodzą na symbole INNYCH pól', () => {
    const c = composeGpz(pelnyGpz(), ORIGIN);
    const panele = c.adnotacje!.panele;
    expect(c.parityKeys.has('gpz.bay.panel')).toBe(true);
    const oczekiwane: Record<string, string> = { 'hv-b-1': 'zasilajace', 'b-1': 'liniowe', 'b-2': 'pomiarowe', 'b-3': 'zrodlowe', 'b-4': 'liniowe' };
    for (const [ref, rola] of Object.entries(oczekiwane)) {
      expect(panele.find((p) => p.bayRef === ref)?.rola, ref).toBe(rola);
    }
    panele.forEach((a, i) => panele.slice(i + 1).forEach((b) => expect(przecina(a.rect, b.rect), `${a.bayRef} × ${b.bayRef}`).toBe(false)));
    for (const panel of panele) {
      const obce = c.symbols.filter((sym) => sym.meta.bayRef !== undefined && sym.meta.bayRef !== panel.bayRef);
      const kolizje = obce.filter((sym) => przecina(panel.rect, { x: sym.x, y: sym.y, width: SYMBOL_DEFS[sym.symbolId].width, height: SYMBOL_DEFS[sym.symbolId].height }));
      expect(kolizje.map((k) => k.meta.bayRef), panel.bayRef).toEqual([]);
      // Własne symbole pola są w tle w całości.
      const wlasne = c.symbols.filter((sym) => sym.meta.bayRef === panel.bayRef);
      for (const sym of wlasne) {
        expect(zawiera(panel.rect, { x: sym.x, y: sym.y, width: SYMBOL_DEFS[sym.symbolId].width, height: SYMBOL_DEFS[sym.symbolId].height })).toBe(true);
      }
      // Tło w ramie.
      expect(zawiera(c.zone!, panel.rect)).toBe(true);
    }
  });

  it('legenda zawiera WYŁĄCZNIE role obecne w GPZ, w kolejności ROLE_POL_GPZ', () => {
    const c = composeGpz(pelnyGpz(), ORIGIN);
    const legenda = c.adnotacje!.tabela!.legenda.map((l) => l.rola);
    expect(legenda).toEqual(['zasilajace', 'liniowe', 'pomiarowe', 'zrodlowe']);
    const minimalny = composeGpz(baseProps(), ORIGIN);
    expect(minimalny.adnotacje!.tabela!.legenda.map((l) => l.rola)).toEqual(['liniowe']);
  });

  for (const rola of ROLE_POL_GPZ) {
    it(`rola „${rola}" z modelu → tło i próbka karty tej roli (rola nie jest wyprowadzana ze stosu aparatów)`, () => {
      const c = composeGpz(baseProps({ sections: [{ sectionId: 'sec-1', order: 1, label: 'S1', busVoltageKv: 15, bays: [lineBay('b-1', { rolaPola: rola })] }] }), ORIGIN);
      expect(c.adnotacje!.panele.map((p) => p.rola)).toEqual([rola]);
      expect(c.adnotacje!.tabela!.karty.map((k) => k.rola)).toEqual([rola]);
    });
  }
});

describe('GPZ-PARYTET — plakietki automatyki (gpz.status_flags) z danych EAZ modelu', () => {
  for (const flagi of [[], ['SPZ'], ['SCO'], ['SPZ', 'SCO']] as const) {
    it(`pole z plakietkami [${flagi.join(', ')}]: karta niesie dokładnie te plakietki w tej kolejności; klucz status_flags ⇔ co najmniej jedna`, () => {
      const c = composeGpz(baseProps({ sections: [{ sectionId: 'sec-1', order: 1, label: 'S1', busVoltageKv: 15, bays: [lineBay('b-1', { statusFlags: [...flagi] })] }] }), ORIGIN);
      const karta = c.adnotacje!.tabela!.karty[0];
      expect(karta.plakietki.map((p) => p.flaga)).toEqual([...flagi]);
      expect(c.parityKeys.has('gpz.status_flags')).toBe(flagi.length > 0);
      // Plakietki w obrysie karty i rozłączne parami.
      for (const p of karta.plakietki) expect(zawiera(karta.rect, p.rect)).toBe(true);
      karta.plakietki.forEach((a, i) => karta.plakietki.slice(i + 1).forEach((b) => expect(przecina(a.rect, b.rect)).toBe(false)));
    });
  }
});

describe('GPZ-PARYTET — pomiary, bilans i alarmy (gpz.measurements / gpz.header.balance / gpz.header.alarms)', () => {
  it('kompozycja rezerwuje sloty bilansu i alarmów oraz tabelę pomiarów (wartości dokleja kanwa z wyniku backendu)', () => {
    const c = composeGpz(pelnyGpz(), ORIGIN);
    expect(c.parityKeys.has('gpz.measurements')).toBe(true);
    expect(c.parityKeys.has('gpz.header.balance')).toBe(true);
    expect(c.parityKeys.has('gpz.header.alarms')).toBe(true);
    const tabela = c.adnotacje!.tabela!;
    expect(tabela.kolumnyWartosci.map((k) => k.naglowek)).toEqual(['P [MW]', 'Q [Mvar]', 'I [A]', 'U [kV]']);
    // Kolejność kart = kolejność pól kompozycji: WN, potem sekcje SN po kolei.
    expect(tabela.karty.map((k) => k.bayRef)).toEqual(['hv-b-1', 'b-1', 'b-2', 'b-3', 'b-4']);
  });

  it('sloty belki mieszczą NAJDŁUŻSZY wariant tekstu (brak wyniku / wynik / wynik nieaktualny) — geometria nie zależy od stanu biegu', () => {
    const sloty = szerokoscSlotowNaglowka();
    const pelny = { pZasilaniaMw: '−8888,8888', qZasilaniaMvar: '−8888,8888', pOdplywowMw: '−8888,8888', qOdplywowMvar: '−8888,8888' };
    const miara = (t: string): number => Math.ceil(t.length * 13 * 0.62);
    for (const t of [tekstZasilaniaGpz(null), tekstZasilaniaGpz(pelny)]) expect(miara(t)).toBeLessThanOrEqual(sloty.zasilanie);
    for (const t of [tekstOdplywowGpz(null), tekstOdplywowGpz(pelny)]) expect(miara(t)).toBeLessThanOrEqual(sloty.odplywy);
    for (const t of [tekstAlarmowGpz(null, false, false), tekstAlarmowGpz('8888', true, true)]) expect(miara(t)).toBeLessThanOrEqual(sloty.alarmy);
  });

  it('teksty stanu wyniku: brak wyniku ≠ zero, wynik nieaktualny jawnie oznaczony, metryka nieobecna ≠ zero', () => {
    expect(tekstZasilaniaGpz(null)).toBe('Zasilanie GPZ: brak wyniku rozpływu mocy');
    expect(tekstOdplywowGpz(null)).toBe('Odpływy GPZ: brak wyniku rozpływu mocy');
    expect(tekstAlarmowGpz(null, false, false)).toBe('Przeciążenia w GPZ: brak wyniku rozpływu mocy');
    expect(tekstTytuluTabeliGpz(false, false)).toBe('Pola GPZ — brak wyniku rozpływu mocy');
    const bilans = { pZasilaniaMw: '1,2500', qZasilaniaMvar: '0,3000', pOdplywowMw: '1,2400', qOdplywowMvar: '0,2900' };
    expect(tekstZasilaniaGpz(bilans)).toBe('Zasilanie GPZ: P = 1,2500 MW, Q = 0,3000 Mvar');
    expect(tekstOdplywowGpz(bilans)).toBe('Odpływy GPZ: P = 1,2400 MW, Q = 0,2900 Mvar');
    expect(tekstAlarmowGpz('0', true, false)).toBe('Przeciążenia w GPZ: 0');
    expect(tekstAlarmowGpz('2', true, true)).toBe('Przeciążenia w GPZ: 2 · wynik nieaktualny');
    expect(tekstTytuluTabeliGpz(true, true)).toBe('Pola GPZ — wynik rozpływu mocy · wynik nieaktualny');
    const niepelny = { ...bilans, pZasilaniaMw: null };
    expect(tekstZasilaniaGpz(niepelny)).toBe('Zasilanie GPZ: brak wyniku źródła');
    expect(tekstOdplywowGpz({ ...bilans, qOdplywowMvar: null })).toBe('Odpływy GPZ: brak kompletu wyników pól');
    expect(tekstAlarmowGpz(null, true, false)).toBe('Przeciążenia w GPZ: brak wyniku');
  });

  it('układ tabeli: szerokość dostępna steruje liczbą kolumn kart (wąsko ⇒ 1, szeroko ⇒ wszystkie w jednym wierszu)', () => {
    const pola = Array.from({ length: 4 }, (_, i) => ({ bayRef: `b-${i}`, oznaczenie: `0${i}`, rola: 'liniowe' as const, plakietki: [] }));
    const waska = ulozTabeliGpz(pola, 0, 0, 0);
    expect(waska.kolumnyKart).toHaveLength(1);
    const szeroka = ulozTabeliGpz(pola, 0, 0, 100000);
    expect(szeroka.kolumnyKart).toHaveLength(4);
    expect(szeroka.rect.height).toBeLessThan(waska.rect.height);
  });

  // Iloczyn cech: szerokość dostępna (wąska / jednowierszowa ledwo / szeroka) × liczba
  // pól (1, 4, 9) × plakietki (brak / dwie). Wyrocznie: wybrany wariant ma wysokość
  // = min z wariantów wykonalnych; w karcie jednowierszowej wartości nie zachodzą na
  // opis pola; karty rozłączne i w obrysie tabeli; legenda nie zachodzi na tytuł
  // ani na karty.
  const polaTabeli = (n: number, plakietki: readonly (typeof PLAKIETKI_GPZ)[number][]): PoleTabeliGpzWejscie[] =>
    Array.from({ length: n }, (_, i) => ({
      bayRef: `b-${i}`,
      oznaczenie: `Pole liniowe ${i + 1}`,
      rola: (i % 2 === 0 ? 'liniowe' : 'zrodlowe') as PoleTabeliGpzWejscie['rola'],
      plakietki: [...plakietki],
    }));
  const progJednowierszowy = (pola: readonly PoleTabeliGpzWejscie[]): number => {
    // Szerokość karty jednowierszowej CAŁEGO zbioru pól (kolumny wspólne dla tabeli).
    return ulozWariantTabeliGpz(pola, 0, 0, 0, true).karty[0].rect.width;
  };
  for (const n of [1, 4, 9]) {
    // Pięć plakietek — pole Z.11.1 niesie SPZ, LRW, NZ i OWG (rozszerzenie 5 karty UX-04).
    for (const plakietki of [[], ['SPZ', 'SCO'], PLAKIETKI_GPZ] as const) {
      const pola = polaTabeli(n, plakietki);
      const prog = progJednowierszowy(pola);
      for (const [nazwa, szerokosc] of [['wąska', prog - GRID], ['próg jednowierszowy', prog], ['szeroka', 100000]] as const) {
        it(`wariant karty: ${n} pól × plakietki [${plakietki.join(', ')}] × szerokość ${nazwa} — najniższa tabela, wartości obok opisu bez zachodzenia`, () => {
          const tabela = ulozTabeliGpz(pola, 0, 0, szerokosc);
          const dwu = ulozWariantTabeliGpz(pola, 0, 0, szerokosc, false);
          const miesciSie = wariantJednowierszowyMiesciSie(pola, szerokosc);
          expect(miesciSie).toBe(szerokosc >= prog);
          const wysokosci = [dwu.rect.height, ...(miesciSie ? [ulozWariantTabeliGpz(pola, 0, 0, szerokosc, true).rect.height] : [])];
          expect(tabela.rect.height).toBe(Math.min(...wysokosci));
          const jednowierszowa = tabela.karty[0].rect.height === WYSOKOSC_KARTY_JEDNOWIERSZOWEJ_GPZ;
          if (!miesciSie) expect(tabela.karty[0].rect.height).toBe(WYSOKOSC_KARTY_GPZ);
          for (const karta of tabela.karty) {
            expect(zawiera(tabela.rect, karta.rect), karta.bayRef).toBe(true);
            if (jednowierszowa) {
              expect(karta.wartosciY).toBe(karta.rect.y);
              const startWartosci = karta.kolumnaX + tabela.kolumnyWartosci[0].dx;
              const koniecOpisu = Math.max(karta.rolaX, ...karta.plakietki.map((pl) => pl.rect.x + pl.rect.width));
              expect(startWartosci, karta.bayRef).toBeGreaterThanOrEqual(koniecOpisu + GRID);
            } else {
              expect(karta.wartosciY).toBe(karta.rect.y + karta.rect.height / 2);
            }
            // Ostatnia kolumna wartości w obrysie karty.
            const ostatnia = tabela.kolumnyWartosci[tabela.kolumnyWartosci.length - 1];
            expect(karta.kolumnaX + ostatnia.dx + ostatnia.width).toBeLessThanOrEqual(karta.rect.x + karta.rect.width);
          }
          tabela.karty.forEach((a, i) => tabela.karty.slice(i + 1).forEach((b) => expect(przecina(a.rect, b.rect)).toBe(false)));
          for (const pozycja of tabela.legenda) {
            expect(przecina(pozycja.probka, tabela.tytul), pozycja.rola).toBe(false);
            for (const karta of tabela.karty) expect(przecina(pozycja.probka, karta.rect)).toBe(false);
            expect(zawiera(tabela.rect, pozycja.probka)).toBe(true);
          }
        });
      }
    }
  }

  it('legenda w wierszu tytułu, gdy cała mieści się na prawo od tytułu; inaczej pod kartami (łamana)', () => {
    const dwieRole = polaTabeli(2, []);
    const szeroka = ulozTabeliGpz(dwieRole, 0, 0, 100000);
    expect(szeroka.legenda.every((l) => l.y === szeroka.tytul.y)).toBe(true);
    expect(Math.min(...szeroka.legenda.map((l) => l.probka.x))).toBeGreaterThanOrEqual(szeroka.tytul.x + szeroka.tytul.width + GRID);
    const wszystkieRole: PoleTabeliGpzWejscie[] = ROLE_POL_GPZ.map((rola, i) => ({ bayRef: `r-${i}`, oznaczenie: `0${i}`, rola, plakietki: [] }));
    const waska = ulozTabeliGpz(wszystkieRole, 0, 0, 0);
    const dolKart = Math.max(...waska.karty.map((k) => k.rect.y + k.rect.height));
    expect(waska.legenda.every((l) => l.y >= dolKart)).toBe(true);
    expect(new Set(waska.legenda.map((l) => l.y)).size).toBeGreaterThan(1);
  });
});

describe('GPZ-PARYTET — kontrakt negatywny nagłówka SCADA', () => {
  // Plakietka OWG opuściła kontrakt negatywny (rozszerzenie 5 karty UX-04): OWG ma wpis
  // słownika funkcji EAZ z podstawą i kod w zestawie funkcji pola Z.11.1/Z.11.
  it('lista kontraktu negatywnego jest zamknięta: transmisja, adres, sterowanie, kasowanie sygnalizacji — każdy z uzasadnieniem', () => {
    expect(Object.keys(KONTRAKT_NEGATYWNY_GPZ).sort()).toEqual([
      'gpz.header.address',
      'gpz.header.control',
      'gpz.header.reset_signals',
      'gpz.header.transmission',
    ]);
    for (const uzasadnienie of Object.values(KONTRAKT_NEGATYWNY_GPZ)) {
      expect(uzasadnienie).toMatch(/reguła phantom|Brak podstawy/);
    }
  });

  for (const [opis, props] of [['minimalny', baseProps()], ['pełny', pelnyGpz()], ['bez nazwy', pelnyGpz({ name: null })]] as const) {
    it(`${opis}: kompozycja NIE emituje żadnego klucza kontraktu negatywnego; plakietki wyłącznie z alfabetu plakietek`, () => {
      const c = composeGpz(props, ORIGIN);
      for (const klucz of Object.keys(KONTRAKT_NEGATYWNY_GPZ)) expect(c.parityKeys.has(klucz), klucz).toBe(false);
      const plakietki = c.adnotacje!.tabela!.karty.flatMap((k) => k.plakietki.map((p) => p.flaga));
      expect(plakietki.every((f) => (PLAKIETKI_GPZ as readonly string[]).includes(f))).toBe(true);
    });
  }
});

describe('GPZ-PARYTET — determinizm adnotacji', () => {
  it('to samo wejście ⇒ identyczne adnotacje (głęboka równość i równość serializacji)', () => {
    const a = composeGpz(pelnyGpz(), ORIGIN);
    const b = composeGpz(pelnyGpz(), ORIGIN);
    expect(JSON.stringify(a.adnotacje)).toBe(JSON.stringify(b.adnotacje));
    expect([...a.parityKeys].sort()).toEqual([...b.parityKeys].sort());
  });

  it('adnotacje leżą na siatce (tabela, karty; plakietki i tła pól na półsiatce); wiersze belki — krokiem linii pisma pasma nazw', () => {
    const c = composeGpz(pelnyGpz(), ORIGIN);
    const adn = c.adnotacje!;
    const naSiatce = (v: number, krok: number): boolean => Math.abs(v / krok - Math.round(v / krok)) < 1e-9;
    for (const r of [adn.tabela!.rect, ...adn.tabela!.karty.map((k) => k.rect)]) {
      expect(naSiatce(r.x, GRID) && naSiatce(r.y, GRID / 2), JSON.stringify(r)).toBe(true);
    }
    // Plakietki: odstęp między plakietkami to pół siatki.
    for (const r of adn.tabela!.karty.flatMap((k) => k.plakietki.map((p) => p.rect))) {
      expect(naSiatce(r.x, GRID / 2) && naSiatce(r.y, GRID / 2), JSON.stringify(r)).toBe(true);
    }
    // Wiersze belki (bilans, alarmy) są wierszami tekstu jak pasmo nazw stacji:
    // kolejne wiersze co wysokość linii t1 pod wierszem nazwy, x wyrównany z nazwą
    // (etykiety są poza zakresem wyroczni siatki, spec §11.2). Wcięcie GRID = odsunięcie
    // tekstu nazwy w jej slocie (slot = tekst + 2·GRID, tekst wyśrodkowany) — wiersze belki
    // i tabela zaczynają się w tej samej pionowej linii co tekst nazwy.
    const nazwa = c.labels.stationName.nameSlot;
    expect([adn.zasilanie, adn.odplywy, adn.alarmy].map((r) => [r.x, r.y - nazwa.y])).toEqual([
      [nazwa.x + GRID, nazwa.height],
      [nazwa.x + GRID, 2 * nazwa.height],
      [nazwa.x + GRID, 3 * nazwa.height],
    ]);
    expect(adn.tabela!.rect.x).toBe(nazwa.x + GRID);
    for (const p of adn.panele) expect(naSiatce(p.rect.x, GRID / 2) && naSiatce(p.rect.y, GRID / 2)).toBe(true);
  });

  it('przesunięcie originu przesuwa adnotacje o ten sam wektor (translacja, nie przeliczenie)', () => {
    const a = composeGpz(pelnyGpz(), ORIGIN);
    const b = composeGpz(pelnyGpz(), { x: 10 * GRID, y: 20 * GRID });
    const dx = b.zone!.x - a.zone!.x;
    const dy = b.zone!.y - a.zone!.y;
    expect(b.adnotacje!.tabela!.rect).toEqual({ ...a.adnotacje!.tabela!.rect, x: a.adnotacje!.tabela!.rect.x + dx, y: a.adnotacje!.tabela!.rect.y + dy });
    b.adnotacje!.panele.forEach((p, i) => {
      expect(p.rect.x - a.adnotacje!.panele[i].rect.x).toBe(dx);
      expect(p.rect.y - a.adnotacje!.panele[i].rect.y).toBe(dy);
    });
  });
});

/**
 * Karta UX-04/POLE-LINIOWE-WZORZEC — pas podpisów aparatów pola bez nakładania.
 *
 * Iloczyn: {podpisy rozłączne, zachodzące, równej wysokości} × {jeden pas, dwa pasy (inna
 * kotwica X, inna strona)} × {kolejność wejścia wprost, odwrócona}. Defekt, który przypina:
 * Z.11 wykonanie stałe — głowica GK1 odgałęzienia i uziemnik Q51 obok niej dawały ten sam
 * prostokąt podpisu, rozwiązywacz zdejmował drugi (aparat bez oznaczenia na schemacie).
 */
describe('podpisyWPasieBezNakladania — pas podpisów aparatów pola', () => {
  const H = labelLineHeight('t3');
  const podpis = (ref: string, y: number, x = 100, placement: 'left' | 'right' = 'right', symbolX = 0): PodpisAparatuWPasie => ({
    ownerRef: ref,
    text: ref,
    anchor: { x, y },
    placement,
    symbolX,
  });
  const gora = (p: PodpisAparatuWPasie): number => Math.round((p.anchor.y - H / 2) / GRID) * GRID;

  it('podpisy rozłączne — kotwice nietknięte (geometria bez kolizji bez zmian)', () => {
    const wejscie = [podpis('a', 100), podpis('b', 140), podpis('c', 200)];
    expect(podpisyWPasieBezNakladania(wejscie)).toEqual(wejscie);
  });

  it.each([
    ['wprost', false],
    ['odwrócona', true],
  ])('podpisy zachodzące w jednym pasie — rozłączne, kolejność wg wysokości symbolu (wejście %s)', (_n, odwroc) => {
    // Pomiar sceny Z.11 stałego: GK1 środek 676, Q51 środek 680 (kafel 48 px), T3 środek 712.
    const baza = [podpis('Q5', 632, 2128, 'right', 1976), podpis('Q51', 680, 2128, 'right', 2072), podpis('GK1', 676, 2128, 'right', 1992), podpis('T3', 712, 2128, 'right', 2032)];
    const wejscie = odwroc ? [...baza].reverse() : baza;
    const wynik = podpisyWPasieBezNakladania(wejscie);
    expect(wynik.map((p) => p.ownerRef)).toEqual(wejscie.map((p) => p.ownerRef));
    const wgRef = new Map(wynik.map((p) => [p.ownerRef, gora(p)]));
    expect(Object.fromEntries(wgRef)).toEqual({ Q5: 624, GK1: 672, Q51: 688, T3: 704 });
    const posortowane = [...wgRef.values()].sort((a, b) => a - b);
    for (let i = 1; i < posortowane.length; i += 1) expect(posortowane[i]).toBeGreaterThanOrEqual(posortowane[i - 1] + H);
    // Podpis przesunięty ma prostokąt na siatce — rozwiązywacz (`snapToGrid(kotwica − H/2)`)
    // nie przesuwa go z powrotem na podpis poprzedni.
    const przesuniete = wynik.filter((p, i) => p !== wejscie[i]);
    expect(przesuniete.map((p) => p.ownerRef).sort()).toEqual(['Q51']);
    for (const p of przesuniete) expect((p.anchor.y - H / 2) % GRID).toBe(0);
  });

  it('równa wysokość — kolejność wg położenia X symbolu (deterministyczna niezależnie od wejścia)', () => {
    const a = podpis('lewy', 300, 100, 'right', 10);
    const b = podpis('prawy', 300, 100, 'right', 50);
    const wprost = podpisyWPasieBezNakladania([a, b]);
    const odwrotnie = podpisyWPasieBezNakladania([b, a]);
    expect(gora(wprost[0])).toBe(gora(odwrotnie[1]));
    expect(gora(wprost[1])).toBe(gora(odwrotnie[0]));
    expect(gora(wprost[0])).toBeLessThan(gora(wprost[1]));
  });

  it('dwa pasy (inna kotwica X albo inna strona) nie przesuwają się nawzajem', () => {
    const wejscie = [podpis('a', 300, 100), podpis('b', 300, 200), podpis('c', 300, 100, 'left')];
    expect(podpisyWPasieBezNakladania(wejscie)).toEqual(wejscie);
  });
});

/**
 * Karta UX-04/POLE-LINIOWE-WZORZEC (wymaganie właściciela 2026-10-29 pkt 6) — przekaźnik pola
 * z powiązaniami obwodów wtórnych obok pola. Iloczyn: {z powiązaniami, bez} × {oznacznik nad
 * blokiem przekaźnika, na jego wysokości, brak} × {lewe położenie mieści się w rezerwacji, nie}.
 */
describe('polozenieOkreguPrzekaznika — przekaźnik obok pola', () => {
  const baza = {
    powiazany: true,
    rightX: 640,
    textAnchorX: 200,
    rezerwaPrawa: 24,
    pasmoCtVt: 40,
    listaPoPrawej: 136,
    circleTopY: 560,
    oznaczenieDolY: 495 as number | null,
  };
  const prawe = Math.round((baza.rightX - baza.listaPoPrawej - PROTECTION_ANNOTATION_DIAMETER) / GRID) * GRID;
  const lewe = Math.ceil((baza.textAnchorX + baza.rezerwaPrawa + baza.pasmoCtVt + 2 * GRID) / GRID) * GRID;

  it('z powiązaniami i oznacznikiem nad blokiem — tuż za planem pola (pasmo podpisów + CT/VT + 2·GRID)', () => {
    expect(lewe).toBeLessThan(prawe);
    expect(polozenieOkreguPrzekaznika(baza)).toBe(lewe);
    expect(polozenieOkreguPrzekaznika({ ...baza, oznaczenieDolY: null })).toBe(lewe);
  });

  it('bez powiązań — prawo-wyrównany do rezerwacji kolumny (położenie dotychczasowe)', () => {
    expect(polozenieOkreguPrzekaznika({ ...baza, powiazany: false })).toBe(prawe);
  });

  it('oznacznik na wysokości bloku przekaźnika (górna krawędź ramki bloku) — prawe położenie', () => {
    // Ramka bloku zaczyna się pół rastru nad okręgiem (`RAMKA_BLOKU_PRZEKAZNIKA_MARGINES`);
    // wymagany prześwit GRID pod oznacznikiem. Numer „52" nad linią wyłączania nie istnieje
    // w układzie powiązań (linia kończy się na cewce Q0 — uwaga właściciela 2026-10-29 pkt 5).
    const graniczne = baza.circleTopY - RAMKA_BLOKU_PRZEKAZNIKA_MARGINES - GRID;
    expect(polozenieOkreguPrzekaznika({ ...baza, oznaczenieDolY: graniczne })).toBe(lewe);
    expect(polozenieOkreguPrzekaznika({ ...baza, oznaczenieDolY: graniczne + 1 })).toBe(prawe);
  });

  it('lewe położenie poza rezerwacją kolumny — nigdy nie wychodzi poza prawe', () => {
    const waska = { ...baza, rightX: lewe + baza.listaPoPrawej + PROTECTION_ANNOTATION_DIAMETER - GRID };
    expect(polozenieOkreguPrzekaznika(waska)).toBeLessThanOrEqual(lewe);
    expect(polozenieOkreguPrzekaznika(waska)).toBe(Math.round((waska.rightX - baza.listaPoPrawej - PROTECTION_ANNOTATION_DIAMETER) / GRID) * GRID);
  });
});
