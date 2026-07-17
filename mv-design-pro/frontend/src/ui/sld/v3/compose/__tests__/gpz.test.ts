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
  GpzCanonicalRendererProps,
} from '../../../v2/renderer/GpzCanonicalRenderer';
import type {
  BayPrimaryDeviceView,
  BayProtectionMarkingView,
  CtRatingAnnotationView,
} from '../../../v2/renderer/MiniBlockRmuRenderer';
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
// (REQUIRED_GPZ_PARITY_KEYS z v2). Podział COVERED/ODROCZONE — patrz raport
// zadania: ODROCZONE = warstwa DOM/interakcji lub telemetrii/OSD (header SCADA,
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

/** ODROCZONE (nie produkowane przez czystą kompozycję geometryczną — warstwa
 *  DOM/canvas/telemetrii, F6): [klucz, powód]. */
const DEFERRED_GPZ_PARITY_KEYS: ReadonlyArray<readonly [string, string]> = [
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

  for (const [key, reason] of DEFERRED_GPZ_PARITY_KEYS) {
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
    const composition = composeGpz(baseProps(), ORIGIN);
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
        transformers: [TR1, { ...TR1, transformerRef: 'tr-2', designation: 'TR2', lvSectionId: 'sec-2' }],
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
// (f) F9.9 R-1 (spec §17.1-§17.4, rozstrzygnięcie architekta 2026-07-15) —
// wyjątek „okrąg bez toru w GPZ NIE jest missingData" ZNIESIONY w F11.1
// (spec §17.6 doprecyzowanie, rejestr device-ref w GPZ, parytet ze
// stacjami): GPZ dopasowuje TERAZ `bay.primaryDevices` do szablonu pola i,
// gdy dane się zgadzają, rysuje tor wyzwalania + linię pomiarową DOKŁADNIE
// jak stacja (`resolveStationProtectionMarking` reużyta wprost) — patrz
// `describe` niżej „F11.1: rejestr device-ref".
// ---------------------------------------------------------------------------

describe('V3 compose/gpz — F9.9 R-1 (ZNIESIONY F11.1): okrąg przekaźnika bez rejestru device-ref', () => {
  const propsWithCodes = (codes: readonly string[]): GpzCanonicalRendererProps =>
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
  // Sekwencja DOKŁADNIE odpowiadająca `lineFieldSpec()` (gpz.ts):
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

  const propsWithRegistry = (overrides: Partial<CanonicalGpzBay> = {}): GpzCanonicalRendererProps =>
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

  it('negatyw — zero zgadywania (a): `primaryDevices` NIE odpowiada szablonowi (inna długość) ⇒ CAŁY stos BEZ rejestru, okrąg BEZ linii, missingData zgłoszona', () => {
    const composition = composeGpz(
      propsWithRegistry({ primaryDevices: alignedLineDevices.slice(0, 3) }),
      ORIGIN,
    );
    const breaker = composition.symbols.find(
      (s) => s.meta.bayRef === 'b-prot' && s.symbolId === 'breaker',
    )!;
    expect(breaker.deviceRef).toBeUndefined();
    expect(composition.protectionSegments).toHaveLength(0);
    expect(composition.measurementSegments).toHaveLength(0);
    expect(composition.missingData).toEqual(
      expect.arrayContaining([
        'bay.protection.trip_link_unresolved',
        'bay.protection.measurement_link_unresolved',
        'bay.protection.ct_rating_anchor_unresolved',
      ]),
    );
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
