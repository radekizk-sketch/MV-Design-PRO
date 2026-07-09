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
import type {
  CanonicalGpzBay,
  CanonicalGpzSection,
  CanonicalGpzTransformer,
  GpzCanonicalRendererProps,
} from '../../../v2/renderer/GpzCanonicalRenderer';
import {
  allGpzSymbolsOnGrid,
  busbarTopologyOf,
  composeGpz,
  gpzInternalSegmentsEndAtPortsOrBus,
  noDirectTransformerBusTies,
  noGpzSymbolOverlaps,
  type GpzComposition,
} from '../gpz';

const ORIGIN = { x: 0, y: 0 };

const TR1: CanonicalGpzTransformer = {
  transformerRef: 'tr-1',
  designation: 'TR1',
  snMva: 25,
  uhvKv: 110,
  ulvKv: 15,
  vectorGroup: 'YNd11',
};

function lineBay(ref: string, overrides: Partial<CanonicalGpzBay> = {}): CanonicalGpzBay {
  return {
    bayRef: ref,
    bayNumber: '1',
    feederName: 'ODPŁYW 1',
    destinationLabel: 'ST-01',
    fieldRole: 'LINE_OUT',
    cbState: 'closed',
    dsState: 'closed',
    esState: 'open',
    qDesignations: { cb: 'Q0', dsBus: 'Q1', dsLin: 'Q9', es: 'Q8', ct: 'T1' },
    ...overrides,
  };
}

function baseProps(overrides: Partial<GpzCanonicalRendererProps> = {}): GpzCanonicalRendererProps {
  return {
    id: 'gpz-test',
    x: 0,
    y: 0,
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
  const fixtures: ReadonlyArray<{ readonly name: string; readonly props: GpzCanonicalRendererProps }> = [
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
    const composition = composeGpz(baseProps(), ORIGIN);
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

  it('wielu transformatorów — inwariant trzyma dla KAŻDEGO niezależnie', () => {
    const composition = composeGpz(
      baseProps({
        sections: [
          { sectionId: 'sec-1', order: 1, label: 'S1', busVoltageKv: 15, bays: [lineBay('b-1')] },
          { sectionId: 'sec-2', order: 2, label: 'S2', busVoltageKv: 15, bays: [lineBay('b-2')] },
        ],
        transformers: [TR1, { ...TR1, transformerRef: 'tr-2', designation: 'TR2', lvSectionId: 'sec-2' }],
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
  function propsWithTopology(topology?: CanonicalGpzSection['busbarTopology']): GpzCanonicalRendererProps {
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
// (REQUIRED_GPZ_PARITY_KEYS z v2). Podział COVERED/TODO — patrz raport
// zadania: TODO = warstwa DOM/interakcji lub telemetrii/OSD (header SCADA,
// ramka, badge'y statusu/pomiarów, detal glifu uzwojenia TR) — F6 canvas,
// NIE geometria czystej kompozycji.
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

/** TODO (nie produkowane przez czystą kompozycję geometryczną — warstwa
 *  DOM/canvas/telemetrii, F6): [klucz, powód]. */
const TODO_GPZ_PARITY_KEYS: ReadonlyArray<readonly [string, string]> = [
  ['gpz.frame', 'tło/ramka rozdzielni — czysta dekoracja canvas, brak treści IEC 60617, F6'],
  ['gpz.header', 'widget operatorski GpzOperatorHeader (SCADA) — telemetria/OSD, nie prymityw elektryczny, F6'],
  ['gpz.header.transmission', 'podelement nagłówka SCADA — jw., F6'],
  ['gpz.header.name', 'podelement nagłówka SCADA — jw., F6 (nazwa GPZ jest osobno w composition.labels.stationName)'],
  ['gpz.header.address', 'podelement nagłówka SCADA — jw., F6'],
  ['gpz.header.balance', 'podelement nagłówka SCADA (bilans mocy) — nakładka wyników, F6'],
  ['gpz.header.alarms', 'podelement nagłówka SCADA (alarmy) — nakładka wyników, F6'],
  ['gpz.header.control', 'podelement nagłówka SCADA — jw., F6'],
  ['gpz.header.reset_signals', 'przycisk interakcji DOM (reset sygnalizacji) — brak odpowiednika w czystej geometrii, F6'],
  ['gpz.transformer.winding.hv', 'detal WEWNĘTRZNY glifu Transformer2WGlyph (okrąg Y) — własność biblioteki symboli (F1), kompozycja niesie jedną instancję symbolu transformer2W, nie dekomponuje jej na sub-elementy parity'],
  ['gpz.transformer.winding.sn', 'jw. (okrąg Δ) — ta sama przyczyna'],
  ['gpz.bay.panel', 'tło pola (kolor per rola) — czysta dekoracja canvas, brak treści IEC 60617, F6'],
  ['gpz.status_flags', 'badge statusu pola (SPZ/SCO/OWG/...) — nakładka wyników/interpretacji, plan §10 "Nakładki wyników", F6'],
  ['gpz.measurements', 'panel telemetrii pola (P/Q/U/I) — nakładka wyników (BayMeasurements), plan §10, F6'],
];

describe('V3 compose/gpz — migracja visualParityChecklist (WYŁĄCZNIE klucze GPZ)', () => {
  it('kompozycja pełnego fixture (transformator + hvSections + 2 sekcje + coupler) niesie wszystkie klucze COVERED', () => {
    const composition = composeGpz(
      baseProps({
        hvSections: [
          { sectionId: 'hv-1', order: 1, label: '110 kV', busVoltageKv: 110, bays: [lineBay('hv-b-1', { bayNumber: 'H1' })] },
        ],
        sections: [
          { sectionId: 'sec-1', order: 1, label: 'S1', busVoltageKv: 15, bays: [lineBay('b-1')] },
          { sectionId: 'sec-2', order: 2, label: 'S2', busVoltageKv: 15, bays: [lineBay('b-2', { bayNumber: '06' })] },
        ],
        couplers: [{ couplerId: 'spr-1', leftSectionId: 'sec-1', rightSectionId: 'sec-2', designation: 'SP', closedState: 'closed' }],
      }),
      ORIGIN,
    );

    const missing = COVERED_GPZ_PARITY_KEYS.filter((key) => !composition.parityKeys.has(key));
    expect(missing).toEqual([]);
  });

  it.todo('gpz.frame — warstwa canvas (F6), nie geometria compose');
  for (const [key, reason] of TODO_GPZ_PARITY_KEYS) {
    it.todo(`${key} — ${reason}`);
  }

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
