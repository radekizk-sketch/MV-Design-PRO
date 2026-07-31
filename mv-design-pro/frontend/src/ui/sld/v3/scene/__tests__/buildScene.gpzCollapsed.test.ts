/**
 * KD-5 — TEST KONTRAKTOWY zwinięcia bloku GPZ na poziomie przeglądowym L0
 * (dług nazwany w V12K-285: „blok GPZ nie jest zwijany na L0 — 30 z 83 symboli
 * L0 to aparaty 16 px przy skali przeglądu ≈2 px").
 *
 * Wymóg inżynierski: na najdalszym zoomie (L0) rozdzielnia zasilająca ma być
 * ZWARTYM symbolem stacji zasilającej (nazwa · napięcie · stan), a nie pełnym
 * układem wewnętrznym; rozwinięcie następuje po przekroczeniu progu LOD.
 *
 * ---------------------------------------------------------------------------
 * WSZYSTKO NA REALNEJ SCENIE (nie na ręcznym fixturze)
 * ---------------------------------------------------------------------------
 * Oba stany (zwinięty / rozwinięty) asertujemy na scenie zbudowanej PEŁNYM
 * pipeline'em `buildSceneV3` z sieci referencyjnej `sldSubstrate52s` — tej
 * samej, na której stoją pozostałe wyrocznie sceny v3. Fixtura budowana ręcznie
 * omijałaby dokładnie tę część łańcucha, którą karta zmienia.
 *
 * TEST MUSI GRYŹĆ: sekcja „REGRESJA WSTRZYKNIĘTA" niżej psuje scenę dokładnie
 * tak, jak wyglądałaby regresja (blok zawsze rozwinięty / blok bez tożsamości /
 * pole odejściowe bez aparatu ciągłości) i sprawdza, że kontrakt to widzi.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3, lod0ReadabilityGaps, allSourcesConnected, allSourcesVisible, type SceneV3 } from '../buildScene';
import { lodPathContinuityGaps, CONTINUITY_APPARATUS_SYMBOL_IDS } from '../lodContinuity';
import { SYMBOL_DEFS, type SymbolId } from '../../symbols/defs';
import { MINI_GPZ, miniGpzPathContinuityGaps, miniGpzMarkerSpacingGaps, miniGpzSignature } from '../../symbols/miniRmuGrammar';
import { minimapProjectionOf, minimapShapesOf } from '../../canvas/minimap';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json');
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

const sceneL0 = buildSceneV3(enm, 0);
const sceneL1 = buildSceneV3(enm, 1);
const sceneL2 = buildSceneV3(enm, 2);

/** Symbole należące do GPZ (blok, jego źródło, jego pola) — po refie właściciela. */
function gpzSymbols(scene: SceneV3) {
  return scene.symbols.filter((s) => (s.meta?.ownerRef ?? '').startsWith('gpz/'));
}
function gpzSegments(scene: SceneV3) {
  return scene.segments.filter((s) => (s.meta?.ownerRef ?? '').startsWith('gpz/'));
}

/**
 * GEOMETRIA WEWNĘTRZNA rozdzielni — to, czego zwinięcie NIE ma prawa zostawić
 * na scenie L0: stosy aparatów pól, transformator, przekładniki, uziemniki,
 * głowice, punkt neutralny. Lista JAWNA (dopisanie tu symbolu to świadoma
 * decyzja, nie cicha edycja).
 */
const GEOMETRIA_WEWNETRZNA: readonly SymbolId[] = [
  'disconnector',
  'loadBreakSwitch',
  'fuseSwitch',
  'earthSwitch',
  'currentTransformer',
  'voltageTransformer',
  'surgeArrester',
  'cableHead',
  'jointSleeve',
  'transformer2W',
  'neutralEarthing',
  'protectionRelay',
  'meter',
];

/** Kontrakt L0 bloku GPZ jako lista braków (pusta = spełniony). Wydzielony,
 *  żeby sekcja regresji mogła go zawołać na scenie CELOWO uszkodzonej. */
function gpzCollapseGaps(scene: SceneV3): readonly string[] {
  const gaps: string[] = [];
  const bloki = scene.symbols.filter((s) => s.symbolId === 'gpzCollapsed');
  if (bloki.length !== 1) gaps.push(`blok GPZ na L0 musi być JEDNYM symbolem — jest ${bloki.length}`);
  const wewnetrzne = gpzSymbols(scene).filter((s) => GEOMETRIA_WEWNETRZNA.includes(s.symbolId));
  if (wewnetrzne.length > 0) {
    gaps.push(`geometria wewnętrzna GPZ obecna na L0: ${wewnetrzne.map((s) => s.symbolId).sort().join(', ')}`);
  }
  const szyny = gpzSegments(scene).filter((s) => s.meta?.kind === 'bus' || s.meta?.kind === 'busGpz');
  if (szyny.length > 0) gaps.push(`szyny GPZ obecne na L0: ${szyny.length}`);
  for (const blok of bloki) {
    if (!blok.meta?.gpzGlyph) gaps.push('blok GPZ bez podsumowania sylwetki (meta.gpzGlyph)');
    if (blok.meta?.elementKind !== 'station') gaps.push(`blok GPZ o elementKind=${String(blok.meta?.elementKind)} (oczekiwano 'station')`);
  }
  // Aparat ciągłości pola odejściowego — wymóg 3 K11-B (LOD nie ukrywa
  // aparatów ciągłości toru); bez niego zwinięcie kłamałoby o możliwości
  // odcięcia magistrali.
  const wylaczniki = gpzSymbols(scene).filter((s) => s.symbolId === 'breaker');
  const pola = bloki[0]?.meta?.gpzGlyph?.feeders ?? 0;
  if (wylaczniki.length !== pola) {
    gaps.push(`aparatów ciągłości pól odejściowych ${wylaczniki.length}, pól ${pola}`);
  }
  return gaps;
}

describe('KD-5 — L0: blok GPZ ZWINIĘTY (jeden symbol, zero geometrii pól wewnętrznych)', () => {
  it('kontrakt zwinięcia spełniony na REALNEJ scenie sieci referencyjnej', () => {
    expect(gpzCollapseGaps(sceneL0)).toEqual([]);
  });

  it('GPZ wnosi na L0 dokładnie 3 symbole (blok + sieć zewnętrzna + aparat pola magistrali) wobec 16 na L1', () => {
    // POMIAR BAZOWY (fixtura niezmienna — liczby przybite jak golden): przed
    // zwinięciem GPZ rysował na L0 16 symboli po 16 px świata, co przy skali
    // przeglądu 0,1203 dawało ≈1,9 px na symbol (V12K-285).
    expect(gpzSymbols(sceneL0).map((s) => s.symbolId).sort()).toEqual(['breaker', 'gpzCollapsed', 'gridSource']);
    expect(gpzSymbols(sceneL1).length).toBe(16);
    expect(gpzSymbols(sceneL2).length).toBe(16);
  });

  it('blok niesie TOŻSAMOŚĆ (ref GPZ + pas nazwy z napięciem i stanem) — nie anonimowy prostokąt', () => {
    const blok = sceneL0.symbols.find((s) => s.symbolId === 'gpzCollapsed')!;
    expect(blok.meta?.ownerRef).toBe(sceneL0.meta.gpzId);
    // Ten SAM ref co na L1/L2 (pas tytułowy GPZ) — tożsamość LOD-niezależna.
    const tytulL1 = sceneL1.labels.find((l) => l.ownerRef === `${sceneL0.meta.gpzId}#name-row-0`);
    const tytulL0 = sceneL0.labels.find((l) => l.ownerRef === `${sceneL0.meta.gpzId}#name-row-0`);
    expect(tytulL1?.text).toBeTruthy();
    expect(tytulL0?.text).toBe(tytulL1?.text);
    // Wiersz stanu: liczby z REALNEJ kompozycji (sekcje/TR/pola), nie z nazw.
    const stan = sceneL0.labels.find((l) => l.ownerRef === `${sceneL0.meta.gpzId}#name-row-1`);
    expect(stan?.text).toContain('Widok zbiorczy');
    expect(stan?.text).toContain(`sekcje SN: ${sceneL0.meta.sections.length}`);
    expect(stan?.text).toContain(`transformatory: ${sceneL0.meta.transformers.length}`);
  });

  it('sylwetka bloku odwzorowuje REALNY układ (sekcje/TR/pola) — parytet z poziomem rozwiniętym', () => {
    const blok = sceneL0.symbols.find((s) => s.symbolId === 'gpzCollapsed')!;
    const glif = blok.meta!.gpzGlyph!;
    expect(glif.sections).toBe(sceneL0.meta.sections.length);
    expect(glif.transformers).toBe(sceneL1.symbols.filter((s) => s.symbolId === 'transformer2W' && (s.meta?.ownerRef ?? '').startsWith('gpz/')).length);
    expect(glif.feeders).toBeGreaterThan(0);
    // Sylwetka jest deterministycznym podpisem cech (zero losowości).
    expect(miniGpzSignature(glif)).toBe(`SEK:${glif.sections}|TR:${glif.transformers}|POLA:${glif.feeders}`);
  });

  it('rozmiar bloku daje czytelny ślad na kadrze CAŁEJ sieci (≥ próg rozpoznawalności symbolu)', () => {
    // Skala fit sieci referencyjnej w harnessie 1800×1100 z paddingiem 40.
    const skalaFit = Math.min((1800 - 80) / sceneL0.bbox.width, (1100 - 80) / sceneL0.bbox.height);
    const def = SYMBOL_DEFS.gpzCollapsed;
    expect(def.width * skalaFit).toBeGreaterThanOrEqual(8); // MIN_SYMBOL_SCREEN_PX
    // …i wyraźnie więcej niż stacja SN (hierarchia: GPZ jest punktem zasilania).
    expect(def.width).toBeGreaterThan(SYMBOL_DEFS.stationCollapsed.width);
    // Gramatyka sylwetki jest spójna (tor bez dziur, aparaty rozłączne).
    expect(miniGpzPathContinuityGaps()).toEqual([]);
    expect(miniGpzMarkerSpacingGaps()).toEqual([]);
    expect(MINI_GPZ.bbox.width).toBe(def.width);
    expect(MINI_GPZ.bbox.height).toBe(def.height);
  });
});

describe('KD-5 — po przekroczeniu progu LOD: PEŁNA geometria (rozwinięcie)', () => {
  it('L1/L2: zero bloków zwiniętych, pełny układ wewnętrzny obecny', () => {
    for (const scene of [sceneL1, sceneL2]) {
      expect(scene.symbols.some((s) => s.symbolId === 'gpzCollapsed')).toBe(false);
      const wewn = gpzSymbols(scene).filter((s) => GEOMETRIA_WEWNETRZNA.includes(s.symbolId));
      expect(wewn.length).toBeGreaterThan(0);
      expect(gpzSymbols(scene).some((s) => s.symbolId === 'transformer2W')).toBe(true);
      expect(gpzSegments(scene).some((s) => s.meta?.kind === 'busGpz')).toBe(true);
      expect(gpzSegments(scene).some((s) => s.meta?.kind === 'bus')).toBe(true);
    }
  });
});

describe('KD-5 — zwinięcie NIE przemeblowuje świata (jedna kotwica) i nie łamie wyroczni', () => {
  it('punkt zaczepu magistrali, rama strefy GPZ i bbox świata IDENTYCZNE na L0 i L2', () => {
    // Uwaga: sama TRASA magistrali między stacjami różni się poziomem korytarza
    // per LOD (`interStationCorridorY` — reguła sprzed KD-5, korytarz L0 biegnie
    // osią magistrali). Zwinięcia GPZ dotyczy PUNKT ZACZEPU: gdyby blok liczył
    // własną geometrię zamiast czytać kompozycję pełną, magistrala startowałaby
    // gdzie indziej i cały świat by się przesunął.
    const zaczep = (s: SceneV3) => {
      const trunk = s.segments.filter((g) => g.meta?.kind === 'snTrunk');
      return JSON.stringify(trunk[0]?.points[0]);
    };
    expect(zaczep(sceneL0)).toBe(zaczep(sceneL2));
    expect(zaczep(sceneL0)).toBe(zaczep(sceneL1));
    // Zbiór przęseł magistrali na L0 jest PODZBIOREM L2 (nic nie ginie przez
    // zwinięcie; L2 ma dodatkowo mostki przecięć `#tee-*`, których liczba
    // zależy od poziomu szczegółu — reguła sprzed KD-5).
    const owners = (s: SceneV3) =>
      new Set(s.segments.filter((g) => g.meta?.kind === 'snTrunk').map((g) => String(g.meta?.ownerRef)));
    const l0 = owners(sceneL0);
    const l2 = owners(sceneL2);
    expect([...l0].filter((o) => !l2.has(o))).toEqual([]);
    expect(JSON.stringify(sceneL0.meta.gpzZone)).toBe(JSON.stringify(sceneL2.meta.gpzZone));
    // Szerokość świata identyczna na wszystkich LOD — to ona niesie offset
    // magistrali (`mainRowDx` z bboxu GPZ). Wysokość różni się per LOD od
    // dawna (rezerwy pasm etykiet, patrz nagłówek `canvas/minimap.ts`).
    expect(sceneL0.bbox.x).toBe(sceneL2.bbox.x);
    expect(sceneL0.bbox.width).toBe(sceneL2.bbox.width);
  });

  it('ciągłość toru energii (K11-B wymóg 3) zachowana na L0 — aparat ciągłości pochodzi z pola odejściowego GPZ', () => {
    expect(lodPathContinuityGaps(sceneL0)).toEqual([]);
    const ids = new Set<string>(CONTINUITY_APPARATUS_SYMBOL_IDS);
    const aparaty = sceneL0.symbols.filter((s) => ids.has(s.symbolId));
    expect(aparaty.length).toBeGreaterThan(0);
    expect(aparaty.every((s) => (s.meta?.ownerRef ?? '').startsWith('gpz/'))).toBe(true);
  });

  it('wyrocznie L0 zielone: czytelność, widoczność i połączenie źródeł', () => {
    expect(lod0ReadabilityGaps(sceneL0)).toEqual([]);
    expect(allSourcesVisible(sceneL0)).toBe(true);
    expect(allSourcesConnected(sceneL0)).toBe(true);
  });

  it('determinizm: dwa biegi L0 dają BAJT-IDENTYCZNĄ scenę', () => {
    expect(JSON.stringify(buildSceneV3(enm, 0))).toBe(JSON.stringify(buildSceneV3(enm, 0)));
  });

  it('minimapa DZIEDZICZY zwinięcie (ta sama projekcja sceny L0, zero osobnej ścieżki renderu)', () => {
    const projection = minimapProjectionOf(sceneL0.bbox)!;
    const shapes = minimapShapesOf(sceneL0, projection);
    // Liczba kształtów = liczba elementów sceny L0 (nic nie dorysowane).
    expect(shapes.length).toBe(sceneL0.segments.filter((s) => s.points.length >= 2).length + sceneL0.symbols.length);
    // Blok GPZ jest w nawigatorze klasą „station" (stacja zasilająca).
    const stacje = shapes.filter((s) => s.kind === 'station').length;
    expect(stacje).toBe(
      sceneL0.symbols.filter((s) => s.symbolId === 'stationCollapsed' || s.symbolId === 'gpzCollapsed').length,
    );
    // Żaden aparat pola GPZ nie trafia już do nawigatora (dziedziczenie zwinięcia).
    expect(gpzSymbols(sceneL0).filter((s) => GEOMETRIA_WEWNETRZNA.includes(s.symbolId)).length).toBe(0);
  });
});

describe('KD-5 — REGRESJA WSTRZYKNIĘTA: kontrakt GRYZIE', () => {
  it('blok „zawsze rozwinięty" (geometria pól wraca na L0) ⇒ kontrakt czerwony', () => {
    const rozwiniety: SceneV3 = {
      ...sceneL0,
      symbols: [...sceneL0.symbols, ...gpzSymbols(sceneL1).filter((s) => GEOMETRIA_WEWNETRZNA.includes(s.symbolId))],
    };
    const gaps = gpzCollapseGaps(rozwiniety);
    expect(gaps.some((g) => g.startsWith('geometria wewnętrzna GPZ obecna na L0'))).toBe(true);
  });

  it('usunięcie bloku zwiniętego ⇒ kontrakt czerwony (brak reprezentacji GPZ)', () => {
    const bezBloku: SceneV3 = { ...sceneL0, symbols: sceneL0.symbols.filter((s) => s.symbolId !== 'gpzCollapsed') };
    expect(gpzCollapseGaps(bezBloku).some((g) => g.includes('musi być JEDNYM symbolem'))).toBe(true);
  });

  it('blok bez podsumowania sylwetki ⇒ kontrakt czerwony ORAZ luka czytelności L0', () => {
    const bezSylwetki: SceneV3 = {
      ...sceneL0,
      symbols: sceneL0.symbols.map((s) =>
        s.symbolId === 'gpzCollapsed' ? { ...s, meta: { ...s.meta, gpzGlyph: undefined } } : s,
      ),
    };
    expect(gpzCollapseGaps(bezSylwetki).some((g) => g.includes('bez podsumowania sylwetki'))).toBe(true);
    expect(lod0ReadabilityGaps(bezSylwetki).some((g) => g.element === 'sylwetka GPZ')).toBe(true);
  });

  it('blok bez etykiety tożsamości ⇒ luka czytelności L0 („tożsamość GPZ")', () => {
    const bezNazwy: SceneV3 = {
      ...sceneL0,
      labels: sceneL0.labels.filter((l) => !l.ownerRef.startsWith(`${sceneL0.meta.gpzId}#name-row`)),
    };
    expect(lod0ReadabilityGaps(bezNazwy).some((g) => g.element === 'tożsamość GPZ')).toBe(true);
  });

  it('pole odejściowe bez aparatu ciągłości ⇒ kontrakt czerwony ORAZ luka ciągłości LOD', () => {
    const bezWylacznika: SceneV3 = {
      ...sceneL0,
      symbols: sceneL0.symbols.filter((s) => s.symbolId !== 'breaker'),
    };
    expect(bezWylacznika.symbols.length).toBeLessThan(sceneL0.symbols.length);
    expect(gpzCollapseGaps(bezWylacznika).some((g) => g.startsWith('aparatów ciągłości'))).toBe(true);
    expect(lodPathContinuityGaps(bezWylacznika).some((g) => g.reason === 'brak-aparatow-ciaglosci')).toBe(true);
  });
});
