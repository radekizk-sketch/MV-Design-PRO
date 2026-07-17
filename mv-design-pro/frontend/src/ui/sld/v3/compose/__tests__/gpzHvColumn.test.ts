/**
 * SLD V3 F13.1 — testy kolumny WN GPZ (SLD_CAD_SPEC_V3 §21, audyt
 * `docs/sld/SLD_ENGINEERING_CANON_AUDIT_D3_2026-07.md`, D3-1/D3-2/D3-8/D3-9/
 * D3-10). Pokrycie (zadanie §D):
 *   1. Adapter (`enmToCanonicalGpzAdapter.ts`) wywodzi kolumnę WN z relacji
 *      pierwszoklasowych gdy `gpz_hv_sections` puste (fixtura minimalna,
 *      wzorowana na `sldSubstrate52s`: TR 25 MVA Yd11/110/15, szyna 110 kV,
 *      źródło 250 MVA/9,62 kA).
 *   2. Brak TR WN/SN w ENM ⇒ adapter zwraca `hvSystemSource: null` (kolumna
 *      WN nierysowana po stronie compose — `hasHvContent` bez `transformers`).
 *   3. Etykiety kompozycji (`compose/gpz.ts`) pochodzą Z DANYCH, nie z literałów.
 *   4. Wyrocznie `gpzHvColumnGaps`/`gpzDominanceGaps` (`scene/gpzCanonProbes.ts`)
 *      gryzą — pozytyw na realnej fixturze `sldSubstrate52s`, negatyw na
 *      scenie ze zdjętym TR WN/SN.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { Bus, EnergyNetworkModel, Source, Substation, Transformer } from '../../../../../types/enm';
import { buildCanonicalGpzProps } from '../../../v2/canvas/enmToCanonicalGpzAdapter';
import type { GpzCanonicalRendererProps } from '../../../v2/renderer/GpzCanonicalRenderer';
import { composeGpz } from '../gpz';
import { buildSceneV3, gpzDominanceGaps, gpzHvColumnGaps } from '../../scene/buildScene';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here,
  '..',
  '..',
  '..',
  'v2',
  'geometry',
  '__tests__',
  'fixtures',
  'sldSubstrate52s.enm.json',
);
const referenceEnm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

/* =============================================================================
   Fixtura minimalna — wzorowana na sldSubstrate52s (GPZ Referencyjny 15 kV):
   TR 25 MVA Yd11 110/15 kV, szyna 110 kV w bus_refs, źródło 250 MVA/9,62 kA
   na szynie SN GPZ, `gpz_hv_sections: []` (grupowanie layoutu puste — ścieżka
   derywacji, spec §21.1).
   ============================================================================= */

type EnmFragment = Pick<
  EnergyNetworkModel,
  'substations' | 'bays' | 'transformers' | 'buses' | 'generators' | 'branches' | 'protection_assignments' | 'measurements' | 'sources'
>;

function bus(refId: string, voltageKv: number): Bus {
  return { id: refId, ref_id: refId, name: `Szyna ${voltageKv} kV`, voltage_kv: voltageKv, phase_system: '3ph', tags: [], meta: {} } as Bus;
}

function hvTransformer(refId: string, overrides: Partial<Transformer> = {}): Transformer {
  return {
    id: refId,
    ref_id: refId,
    name: 'TR1 110/15 kV',
    tags: [],
    meta: {},
    hv_bus_ref: 'bus-110',
    lv_bus_ref: 'bus-sn',
    sn_mva: 25,
    uhv_kv: 110,
    ulv_kv: 15,
    uk_percent: 11,
    pk_kw: 120,
    vector_group: 'Yd11',
    ...overrides,
  } as Transformer;
}

function systemSource(refId: string, overrides: Partial<Source> = {}): Source {
  return {
    id: refId,
    ref_id: refId,
    name: 'GPZ Referencyjny 15 kV',
    tags: [],
    meta: { source_id: 'GPZ Referencyjny 15 kV' },
    bus_ref: 'bus-sn',
    model: 'short_circuit_power',
    sk3_mva: 250,
    ik3_ka: 9.62,
    ...overrides,
  } as Source;
}

function gpzSubstation(overrides: Partial<Substation> = {}): Substation {
  return {
    id: 'gpz-1',
    ref_id: 'gpz-1',
    name: 'GPZ Testowy',
    tags: [],
    meta: {},
    station_type: 'gpz',
    bus_refs: ['bus-sn', 'bus-110'],
    transformer_refs: ['tr-1'],
    gpz_hv_sections: [],
    gpz_sections: [{ section_id: 'sec-1', order: 0, name: 'Sekcja 1', bus_ref: 'bus-sn' }],
    ...overrides,
  } as Substation;
}

function fullFixture(): EnmFragment {
  return {
    substations: [gpzSubstation()],
    bays: [],
    transformers: [hvTransformer('tr-1')],
    buses: [bus('bus-sn', 15), bus('bus-110', 110)],
    generators: [],
    branches: [],
    protection_assignments: [],
    measurements: [],
    sources: [systemSource('src-1')],
  };
}

/* =============================================================================
   1/2/5. Adapter — derywacja kolumny WN
   ============================================================================= */

describe('buildCanonicalGpzProps — F13.1 derywacja kolumny WN (spec §21.1)', () => {
  it('gpz_hv_sections puste + TR/szyna WN/źródło pełne ⇒ hvSystemSource wywiedzione Z DANYCH', () => {
    const props = buildCanonicalGpzProps(fullFixture(), 'gpz-1', { x: 0, y: 0 });
    // INTENCJA (recenzja NO-GO 2026-07-17 pkt 2): napięcie tabliczki = szyna
    // ŹRÓDŁA (`Source.bus_ref` = bus-sn, 15 kV) — dawna semantyka „zawsze
    // napięcie szyny WN" (110) parowała dane zwarciowe 15 kV z cudzym
    // napięciem (Ik″=Sk″/(√3·U) przestawało się zgadzać). `sourceOnHvBus`
    // mówi kompozycji, po której stronie zaczepić symbol.
    expect(props.hvSystemSource).toEqual({
      sourceRef: 'src-1',
      name: 'GPZ Referencyjny 15 kV',
      sk3Mva: 250,
      ik3Ka: 9.62,
      voltageKv: 15,
      sourceOnHvBus: false,
      // Napięcie SZYNY WN — osobny kanał dla etykiety „Szyna WN · 110 kV"
      // (regres „Szyna WN · 15 kV" wykryty renderem gpzFeeder).
      hvBusVoltageKv: 110,
    });
  });

  it('brak transformatora WN/SN (uhv_kv<=60) w ENM ⇒ hvSystemSource null (kolumna WN nierysowana)', () => {
    const enm = fullFixture();
    const props = buildCanonicalGpzProps(
      { ...enm, transformers: [hvTransformer('tr-1', { uhv_kv: 15 })] },
      'gpz-1',
      { x: 0, y: 0 },
    );
    expect(props.hvSystemSource).toBeNull();
  });

  it('brak transformatora W OGÓLE (transformer_refs puste) ⇒ hvSystemSource null I props.transformers puste', () => {
    const enm = fullFixture();
    const props = buildCanonicalGpzProps(
      { ...enm, substations: [gpzSubstation({ transformer_refs: [] })] },
      'gpz-1',
      { x: 0, y: 0 },
    );
    expect(props.hvSystemSource).toBeNull();
    expect(props.transformers).toEqual([]);
  });

  it('brak szyny WN w Substation.bus_refs (voltage_kv>60) ⇒ hvSystemSource null', () => {
    const enm = fullFixture();
    const props = buildCanonicalGpzProps(
      { ...enm, substations: [gpzSubstation({ bus_refs: ['bus-sn'] })] },
      'gpz-1',
      { x: 0, y: 0 },
    );
    expect(props.hvSystemSource).toBeNull();
  });

  it('brak źródła na szynie GPZ (SN lub WN) ⇒ hvSystemSource null', () => {
    const enm = fullFixture();
    const props = buildCanonicalGpzProps({ ...enm, sources: [] }, 'gpz-1', { x: 0, y: 0 });
    expect(props.hvSystemSource).toBeNull();
  });

  it('źródło na szynie WN (nie tylko SN) jest TEŻ rozwiązywane (bus_ref ∈ szyny GPZ, SN lub WN)', () => {
    const enm = fullFixture();
    const props = buildCanonicalGpzProps(
      { ...enm, sources: [systemSource('src-1', { bus_ref: 'bus-110' })] },
      'gpz-1',
      { x: 0, y: 0 },
    );
    expect(props.hvSystemSource?.sourceRef).toBe('src-1');
  });

  it('gpz_hv_sections NIEPUSTE ⇒ hvSystemSource null (ścieżka hvSectionDefs nadrzędna, derywacja pominięta)', () => {
    const enm = fullFixture();
    const props = buildCanonicalGpzProps(
      {
        ...enm,
        substations: [
          gpzSubstation({
            gpz_hv_sections: [{ section_id: 'hv-1', order: 1, name: 'HV-1', bus_ref: 'bus-110' }],
          }),
        ],
      },
      'gpz-1',
      { x: 0, y: 0 },
    );
    expect(props.hvSystemSource).toBeNull();
    expect(props.hvSections).toHaveLength(1);
  });

  it('nazwa źródła preferuje meta.source_id nad Source.name', () => {
    const enm = fullFixture();
    const props = buildCanonicalGpzProps(
      {
        ...enm,
        sources: [systemSource('src-1', { name: 'inna nazwa', meta: { source_id: 'Nazwa z meta' } })],
      },
      'gpz-1',
      { x: 0, y: 0 },
    );
    expect(props.hvSystemSource?.name).toBe('Nazwa z meta');
  });
});

/* =============================================================================
   3. Kompozycja — etykiety Z DANYCH (compose/gpz.ts)
   ============================================================================= */

describe('composeGpz — F13.1 kolumna WN: gridSource na szczycie, etykiety z danych', () => {
  function propsWithHvColumn(): GpzCanonicalRendererProps {
    return buildCanonicalGpzProps(fullFixture(), 'gpz-1', { x: 0, y: 0 });
  }

  // INTENCJA (recenzja NO-GO 2026-07-17 pkt 2/3): strona zaczepu podąża za
  // SZYNĄ ŹRÓDŁA. Fixtura niesie EKWIWALENT na szynie SN (`bus_ref: bus-sn`)
  // ⇒ zaczep nad szyną SN (`#source-bus-extension`); przyłącze WN zaczepia
  // się nad WN tylko gdy `Source.bus_ref` = szyna WN (test niżej).
  it('źródło-ekwiwalent na szynie SN ⇒ zaczep nad szyną SN (#source-bus-extension), NIE nad WN', () => {
    const props = propsWithHvColumn();
    const composition = composeGpz(props, { x: 0, y: 0 }, [{ id: 'src-1' }]);
    const snExtension = composition.segments.find((s) => s.ownerRef === 'gpz-1#source-bus-extension');
    const sourceDrop = composition.segments.find((s) => s.ownerRef === 'src-1#grid-source-drop');
    expect(sourceDrop).toBeDefined();
    expect(snExtension).toBeDefined();
    // Zejście źródła kończy się NA WYSOKOŚCI szyny SN (napięcie danych = 15 kV).
    expect(sourceDrop!.points[sourceDrop!.points.length - 1].y).toBe(snExtension!.points[0].y);
    expect(composition.segments.some((s) => s.ownerRef === 'gpz-1#hv-bus-source-extension')).toBe(false);
  });

  it('źródło z bus_ref na szynie WN ⇒ zaczep nad szyną WN (#hv-bus-source-extension), ciągłość toru §21.1', () => {
    const enm = fullFixture();
    const props = buildCanonicalGpzProps(
      { ...enm, sources: [systemSource('src-1', { bus_ref: 'bus-110' })] },
      'gpz-1',
      { x: 0, y: 0 },
    );
    const composition = composeGpz(props, { x: 0, y: 0 }, [{ id: 'src-1' }]);
    const hvBus = composition.segments.find((s) => s.meta.testId === 'gpz-canonical-hv-bus');
    const sourceDrop = composition.segments.find((s) => s.ownerRef === 'src-1#grid-source-drop');
    const hvExtension = composition.segments.find((s) => s.ownerRef === 'gpz-1#hv-bus-source-extension');
    expect(hvBus).toBeDefined();
    expect(sourceDrop).toBeDefined();
    expect(hvExtension).toBeDefined();
    expect(sourceDrop!.points[sourceDrop!.points.length - 1].y).toBe(hvBus!.points[0].y);
    expect(composition.segments.some((s) => s.ownerRef === 'gpz-1#source-bus-extension')).toBe(false);
  });

  it('nazwa źródła + tabliczka danych — WYŁĄCZNIE wartości z hvSystemSource (formatowanie PL, przecinek dziesiętny)', () => {
    const props = propsWithHvColumn();
    const composition = composeGpz(props, { x: 0, y: 0 }, [{ id: 'src-1' }]);
    const label = composition.labels.transformerLabels.find((l) => l.ownerRef === 'src-1#system-source-label');
    expect(label).toBeDefined();
    expect(label!.rows[0].text).toBe('GPZ Referencyjny 15 kV');
    // pkt 3: ekwiwalent na szynach SN mówi to WPROST, a napięcie tabliczki
    // jest napięciem szyny źródła (15 kV) — spójne z Sk″/Ik″.
    expect(label!.rows[1].text).toBe('Ekwiwalent sieci zasilającej');
    expect(label!.rows[2].text).toBe('Sk″ 250 MVA · Ik″ 9,62 kA · 15 kV');
  });

  it('brak dopasowania hvSystemSource.sourceRef do wpisu gridSources ⇒ ZERO etykiety (glif źródła zostaje)', () => {
    const props = propsWithHvColumn();
    const composition = composeGpz(props, { x: 0, y: 0 }, [{ id: 'inny-ref' }]);
    expect(composition.symbols.some((s) => s.symbolId === 'gridSource')).toBe(true);
    expect(composition.labels.transformerLabels.some((l) => l.ownerRef === 'inny-ref#system-source-label')).toBe(false);
  });

  it('etykieta transformatora niesie grupę połączeń Z DANYCH („Yd11 · 25 MVA"), nie literał w kodzie', () => {
    const props = propsWithHvColumn();
    const composition = composeGpz(props, { x: 0, y: 0 });
    const label = composition.labels.transformerLabels.find((l) => l.ownerRef === 'tr-1#label');
    // pkt 4 (recenzja NO-GO 2026-07-17): uk%/Pk z danych ENM na tabliczce TR.
    expect(label!.rows.map((r) => r.text)).toEqual(['TR1', 'Yd11 · 25 MVA', '110/15 kV', 'uk 11% · Pk 120 kW']);
  });

  it('transformator BEZ vector_group (null) ⇒ etykieta pomija grupę połączeń (uczciwy brak, nie fabrykuje)', () => {
    const enm = fullFixture();
    const props = buildCanonicalGpzProps(
      { ...enm, transformers: [hvTransformer('tr-1', { vector_group: null })] },
      'gpz-1',
      { x: 0, y: 0 },
    );
    const composition = composeGpz(props, { x: 0, y: 0 });
    const label = composition.labels.transformerLabels.find((l) => l.ownerRef === 'tr-1#label');
    expect(label!.rows.map((r) => r.text)).toEqual(['TR1', '25 MVA', '110/15 kV', 'uk 11% · Pk 120 kW']);
  });

  it('brak TR w ENM ⇒ adapter nie niesie transformatora, kompozycja bez kolumny WN (missingData)', () => {
    const enm = fullFixture();
    const props = buildCanonicalGpzProps({ ...enm, substations: [gpzSubstation({ transformer_refs: [] })] }, 'gpz-1', { x: 0, y: 0 });
    const composition = composeGpz(props, { x: 0, y: 0 }, [{ id: 'src-1' }]);
    expect(composition.symbols.some((s) => s.symbolId === 'transformer2W')).toBe(false);
    expect(composition.missingData).toEqual(expect.arrayContaining(['gpz.hv.missing', 'gpz.transformer.missing']));
    // Fallback: gridSource wraca do zaczepu nad szyną SN (brak kolumny WN do wieńczenia).
    expect(composition.segments.some((s) => s.ownerRef === 'gpz-1#source-bus-extension')).toBe(true);
  });

  it('szyny sekcji SN GPZ niosą busbarKind "busGpz" (D3-2, grubsza klasa)', () => {
    const props = propsWithHvColumn();
    const composition = composeGpz(props, { x: 0, y: 0 });
    const primaryBus = composition.segments.find((s) => s.ownerRef === 'sec-1#bus-primary');
    expect(primaryBus?.meta.busbarKind).toBe('busGpz');
  });

  it('strefa GPZ (rama-DEKORACJA, przebudowa nadzorcy) obejmuje CAŁOŚĆ kompozycji; nagłówek = blok nazwy GPZ z przekładnią Z DANYCH', () => {
    // F13.1 (przejęcie nadzorcy po agencie): rama NIE jest segmentem toru
    // mocy (poprzednia wersja wprowadzała niedokotwiczone końce §11.3 i
    // fałszowała piony §15.1) — jest polem `composition.zone` (dekoracja
    // renderowana z meta sceny), a nagłówek „GPZ ⟨nazwa⟩ · UHV/ULV kV"
    // JEST blokiem nazwy GPZ (`labels.stationName` — D3-12 „pas tytułowy
    // ZAMIAST luźnych etykiet").
    const props = propsWithHvColumn();
    const composition = composeGpz(props, { x: 0, y: 0 });
    expect(composition.parityKeys.has('gpz.zone.frame')).toBe(true);
    expect(composition.parityKeys.has('gpz.zone.header')).toBe(true);
    expect(composition.segments.some((s) => s.meta.testId === 'gpz-canonical-zone-frame')).toBe(false);
    const zone = composition.zone;
    expect(zone).not.toBeNull();
    const contentXs = [...composition.symbols.map((s) => s.x), ...composition.segments.flatMap((s) => s.points.map((p) => p.x))];
    const contentYs = [...composition.symbols.map((s) => s.y), ...composition.segments.flatMap((s) => s.points.map((p) => p.y))];
    expect(zone!.x).toBeLessThanOrEqual(Math.min(...contentXs));
    expect(zone!.x + zone!.width).toBeGreaterThanOrEqual(Math.max(...contentXs));
    expect(zone!.y).toBeLessThanOrEqual(Math.min(...contentYs));
    expect(zone!.y + zone!.height).toBeGreaterThanOrEqual(Math.max(...contentYs));
    // Nieujemność po translacji końcowej (kontrakt arkusza k5b/D2):
    expect(zone!.x).toBeGreaterThanOrEqual(0);
    expect(zone!.y).toBeGreaterThanOrEqual(0);
    // pkt 3 (recenzja NO-GO 2026-07-17): nazwa „GPZ Testowy" JUŻ niesie
    // prefiks — nagłówek NIE dubluje „GPZ GPZ …".
    expect(composition.labels.stationName.rows[0]?.text).toBe('GPZ Testowy · 110/15 kV');
  });
});

/* =============================================================================
   4. Wyrocznie (scene/gpzCanonProbes.ts, re-eksport z buildScene.ts)
   ============================================================================= */

describe('gpzHvColumnGaps / gpzDominanceGaps — F13.1 wyrocznie (spec §21, D3-1/D3-2)', () => {
  it('pozytyw: fixtura referencyjna sldSubstrate52s (TR WN/SN + szyna 110 kV + źródło) ⇒ gpzHvColumnGaps = []', () => {
    const scene = buildSceneV3(referenceEnm, 2);
    const gaps = gpzHvColumnGaps(scene, referenceEnm);
    expect(gaps).toEqual([]);
  });

  it('test negatywny (dowód, że wyrocznia gryzie): ENM dalej niesie TR WN/SN, ale SCENA go nie ma (usunięty symbol transformer2W) ⇒ gap', () => {
    const scene = buildSceneV3(referenceEnm, 2);
    const strippedScene = {
      ...scene,
      symbols: scene.symbols.filter((s) => s.symbolId !== 'transformer2W' || !s.meta?.testId?.includes('gpz-canonical')),
    };
    // Kontrola: fixtura referencyjna BEZ mutacji → zero gapów (dowód, że
    // wyrocznia nie fałszywie alarmuje na poprawnej scenie).
    expect(gpzHvColumnGaps(scene, referenceEnm)).toEqual([]);
    // Scena ze zdjętym symbolem TR WN/SN, dane ENM NIETKNIĘTE (dalej niosą
    // TR) ⇒ wyrocznia MUSI zgłosić brak.
    const gaps = gpzHvColumnGaps(strippedScene, referenceEnm);
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps.some((g) => g.reason.includes('transformer2W'))).toBe(true);
  });

  it('pozytyw: bbox strefy GPZ ≥ bbox największej stacji na fixturze referencyjnej', () => {
    const scene = buildSceneV3(referenceEnm, 2);
    const gaps = gpzDominanceGaps(scene);
    const bboxGap = gaps.find((g) => g.reason.includes('powierzchnia'));
    expect(bboxGap).toBeUndefined();
  });

  it('test negatywny: scena BEZ szyny busGpz (GPZ ma sekcje SN) ⇒ gpzDominanceGaps zgłasza lukę grubości', () => {
    const scene = buildSceneV3(referenceEnm, 2);
    const stripped = {
      ...scene,
      segments: scene.segments.map((seg) => (seg.meta?.kind === 'busGpz' ? { ...seg, meta: { ...seg.meta, kind: 'bus' as const } } : seg)),
    };
    const gaps = gpzDominanceGaps(stripped);
    expect(gaps.some((g) => g.reason.includes('busGpz'))).toBe(true);
  });
});
