/**
 * SCHEMAT-10 GS-3 (V12K-137) — GRAMATYKA KONSTRUKCYJNA mini-RMU (L0) jako
 * KOMPOZYCJA PÓL (werdykt NO-GO recenzji GS-2, `GRAMATYKA_MINI_RMU_2026-07.md`
 * sekcja K1–K7): L0 = miniaturowy SLD rozdzielnicy, NIE ikona na linii.
 *
 * Relacje nienaruszalne (gramatyka bazowa 2L+T):
 *  - kabel kończy się na GŁOWICY (trójkąt — K4: symbol ZAREZERWOWANY dla głowicy),
 *  - między głowicą a szyną jest APARAT pola (K1),
 *  - SZYNA żyje WEWNĄTRZ enklozury i NIE wychodzi poza obudowę (K2),
 *  - TR i DER przyłączone przez WŁASNE POLA z aparatem (K3/K5),
 *  - NO = STAN aparatu → realna PRZERWA w torze (K6),
 *  - obrys wtórny; głowice+aparaty+ciągłość toru pierwszoplanowe (K7).
 * Reguły 1–19 z dokumentu gramatyki nadal obowiązują (kotwica = środek bboxa,
 * determinizm, parametry globalne — JEDNO miejsce, zero literałów w rendererze).
 */

import { GRID } from '../core/grid';

export type StationDerGlyphKind = 'pv' | 'bess' | 'wind' | 'generator';

/** K4: trójkąt = WYŁĄCZNIE głowica kablowa. Rodzaj DER rozróżniany innymi
 *  kształtami: PV=romb, BESS=kwadrat, FW/generator=okrąg. */
export type DerMarkerShape = 'diamond' | 'square' | 'circle';
export const DER_MARKER_SHAPE: Readonly<Record<StationDerGlyphKind, DerMarkerShape>> = {
  pv: 'diamond',
  bess: 'square',
  wind: 'circle',
  generator: 'circle',
} as const;

const BBOX = 6 * GRID; // 48
const CENTER = BBOX / 2; // 24 — kotwica stacji (JEDNA KOTWICA) i oś toru pól liniowych.

export const MINI_RMU_STROKE = {
  /** Szyna wewnętrzna — najgrubsza (K7: tor pierwszoplanowy). */
  bus: 2,
  /** Tor pola (kabel–głowica–aparat–szyna) — grubszy od obrysu. */
  path: 1.4,
  /** Elementy pomocnicze (marker rodzaju DER). */
  marker: 0.9,
  /** Obrys enklozury — WTÓRNY, najlżejszy (K7). */
  outline: 0.7,
} as const;

export const MINI_RMU_MIN_GAP = { marker: 3, outline: 1 } as const;

/**
 * GEOMETRIA KOMPOZYCJI PÓL (układ 48×48, origin lewy-górny):
 * lewa kotwica W(0,24) → △ głowica L1 → aparat L1 → ═ SZYNA (wewnątrz) ═ →
 * aparat L2 → △ głowica L2 → prawa kotwica E(48,24); pole TR w dół, pole DER
 * w górę — oba OD SZYNY przez własny aparat.
 */
export const MINI_RMU = {
  bbox: { width: BBOX, height: BBOX },
  center: { x: CENTER, y: CENTER },
  /** Enklozura — obrys wtórny (K7), bez wypełnienia. */
  enclosure: { x: 4, y: 8, width: 40, height: 32, rx: 2 },
  /** Pola liniowe L1/L2 na osi y=24 (tor przez stację = łańcuch pól). */
  linia: {
    y: CENTER,
    /** Kabel zewnętrzny do głowicy (odcinki poza enklozurą). */
    stubL: { x1: 0, x2: 6 },
    stubR: { x1: 42, x2: BBOX },
    /** Głowice kablowe (trójkąty, wierzchołek ku wnętrzu) — na krawędzi pola. */
    glowicaL: { xTip: 10, xBase: 6, halfH: 3 },
    glowicaR: { xTip: 38, xBase: 42, halfH: 3 },
    /** Aparaty pól liniowych (kwadraty na torze). */
    aparatL: { x: 12, size: 4 },
    aparatR: { x: 36, size: 4 },
    /** Łączniki tor→szyna. */
    linkL: { x1: 14, x2: 18 },
    linkR: { x1: 30, x2: 34 },
  },
  /** SZYNA WEWNĘTRZNA — wyłącznie wewnątrz enklozury (K2). */
  bus: { y: CENTER, x1: 18, x2: 30 },
  /** Pole TRANSFORMATOROWE (K3): szyna → aparat TR → transformator (2 okręgi). */
  poleTr: {
    x: 18,
    aparat: { y: 27.5, size: 3 },
    stub1: { y1: CENTER, y2: 27.5 },
    stub2: { y1: 30.5, y2: 31.6 },
    circleR: 2,
    circle1Y: 33.6,
    circle2Y: 36.4,
  },
  /** Pole DER (K5): szyna → aparat DER → marker rodzaju (romb/kwadrat/okrąg). */
  poleDer: {
    x: 30,
    aparat: { y: 17, size: 3 },
    stub1: { y1: 20, y2: CENTER },
    stub2: { y1: 14.4, y2: 17 },
    markerCY: 12,
    markerHalf: 2.4,
  },
  /** Sprzęgło sekcyjne / NO (K6): APARAT W TORZE SZYNY (środek). Zamknięty =
   *  kwadrat na szynie; OTWARTY (NO) = realna PRZERWA szyny + kreska ukośna. */
  sprzeglo: { x: CENTER, size: 4, gapHalf: 3 },
  stroke: MINI_RMU_STROKE,
  minGap: MINI_RMU_MIN_GAP,
} as const;

export interface MiniRmuFeatures {
  readonly sectioned: boolean;
  readonly transformer: boolean;
  readonly der: StationDerGlyphKind | null;
  readonly noOpen: boolean;
}

export function miniRmuSignature(f: MiniRmuFeatures): string {
  return [f.sectioned ? 'SEK' : '-', f.transformer ? 'TR' : '-', f.der ?? '-', f.noOpen ? 'NO' : '-'].join('|');
}

export function allMiniRmuFeatureCombinations(): readonly MiniRmuFeatures[] {
  const out: MiniRmuFeatures[] = [];
  for (const sectioned of [false, true])
    for (const transformer of [false, true])
      for (const der of [null, 'pv', 'bess', 'wind', 'generator'] as const)
        for (const noOpen of [false, true]) out.push({ sectioned, transformer, der, noOpen });
  return out;
}

/** Proporcja pola TR względem wnętrza (reguła 12 — nie dominuje). */
export function transformerInteriorHeightRatio(): number {
  const t = MINI_RMU.poleTr;
  return (t.circle2Y + t.circleR - MINI_RMU.bus.y) / MINI_RMU.enclosure.height;
}

/**
 * SONDA CIĄGŁOŚCI TORU PRZEZ ŁAŃCUCH PÓL (K1/K2 — ODWRÓCENIE sondy GS-2):
 *  (a) szyna WEWNĄTRZ enklozury (nie na wylot),
 *  (b) łańcuch W→głowicaL→aparatL→szyna→aparatR→głowicaR→E pokrywa oś bez dziur
 *      (styk kolejnych elementów na y=24),
 *  (c) kabel NIE dotyka szyny bezpośrednio (stub kończy się na głowicy).
 */
export function miniRmuPathContinuityGaps(): readonly string[] {
  const g: string[] = [];
  const { linia, bus, enclosure, bbox } = MINI_RMU;
  const eL = enclosure.x;
  const eR = enclosure.x + enclosure.width;
  if (bus.x1 <= eL || bus.x2 >= eR) g.push('K2: szyna wychodzi poza enklozurę');
  // Łańcuch styków na osi (kolejne segmenty muszą się stykać):
  const chain: Array<[number, number, string]> = [
    [linia.stubL.x1, linia.stubL.x2, 'kabel L'],
    [Math.min(linia.glowicaL.xBase, linia.glowicaL.xTip), Math.max(linia.glowicaL.xBase, linia.glowicaL.xTip), 'głowica L'],
    [linia.aparatL.x - linia.aparatL.size / 2, linia.aparatL.x + linia.aparatL.size / 2, 'aparat L'],
    [linia.linkL.x1, linia.linkL.x2, 'łącznik L'],
    [bus.x1, bus.x2, 'szyna'],
    [linia.linkR.x1, linia.linkR.x2, 'łącznik R'],
    [linia.aparatR.x - linia.aparatR.size / 2, linia.aparatR.x + linia.aparatR.size / 2, 'aparat R'],
    [Math.min(linia.glowicaR.xTip, linia.glowicaR.xBase), Math.max(linia.glowicaR.xTip, linia.glowicaR.xBase), 'głowica R'],
    [linia.stubR.x1, linia.stubR.x2, 'kabel R'],
  ];
  for (let i = 1; i < chain.length; i++) {
    if (chain[i - 1][1] < chain[i][0] - 0.001)
      g.push(`przerwa toru między „${chain[i - 1][2]}" a „${chain[i][2]}"`);
  }
  if (chain[0][0] !== 0 || chain[chain.length - 1][1] !== bbox.width)
    g.push('tor nie sięga kotwic W/E');
  // K1: kabel kończy się na głowicy, nie na szynie:
  if (linia.stubL.x2 > bus.x1) g.push('K1: kabel L dotyka szyny');
  if (linia.stubR.x1 < bus.x2) g.push('K1: kabel R dotyka szyny');
  if (bus.y !== MINI_RMU.center.y) g.push('szyna poza osią kotwicy');
  return g;
}

/** Sonda odstępów pól (reguła 10): pole TR (dół) i DER (góra) rozłączne od
 *  aparatu sprzęgła i od enklozury o minGap. */
export function miniRmuMarkerSpacingGaps(): readonly string[] {
  const g: string[] = [];
  const { poleTr, poleDer, enclosure, sprzeglo, minGap } = MINI_RMU;
  if (poleTr.circle2Y + poleTr.circleR > enclosure.y + enclosure.height - minGap.outline)
    g.push('pole TR wychodzi poza enklozurę');
  if (poleDer.markerCY - poleDer.markerHalf < enclosure.y + minGap.outline)
    g.push('pole DER wychodzi poza enklozurę');
  if (Math.abs(poleTr.x - sprzeglo.x) < sprzeglo.size / 2 + minGap.marker)
    g.push('pole TR koliduje ze sprzęgłem');
  if (Math.abs(poleDer.x - sprzeglo.x) < sprzeglo.size / 2 + minGap.marker)
    g.push('pole DER koliduje ze sprzęgłem');
  return g;
}

/** Strefy prymitywów per cecha (do testu czytelności — reguła 17). */
export interface MiniRmuPrimitiveZone { readonly feature: string; readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export function miniRmuMarkerPrimitiveZones(): readonly MiniRmuPrimitiveZone[] {
  const { poleTr: t, poleDer: d, sprzeglo: sp, linia: L } = MINI_RMU;
  const y = L.y;
  return [
    { feature: 'sectioned', x: sp.x - sp.size / 2, y: y - sp.size / 2, width: sp.size, height: sp.size },
    { feature: 'transformer-aparat', x: t.x - t.aparat.size / 2, y: t.aparat.y, width: t.aparat.size, height: t.aparat.size },
    { feature: 'transformer-uzwojenia', x: t.x - t.circleR, y: t.circle1Y - t.circleR, width: 2 * t.circleR, height: t.circle2Y - t.circle1Y + 2 * t.circleR },
    { feature: 'der-aparat', x: d.x - d.aparat.size / 2, y: d.aparat.y, width: d.aparat.size, height: d.aparat.size },
    { feature: 'der-marker', x: d.x - d.markerHalf, y: d.markerCY - d.markerHalf, width: 2 * d.markerHalf, height: 2 * d.markerHalf },
    { feature: 'noOpen', x: sp.x - sp.gapHalf, y: y - 2 * sp.gapHalf, width: 2 * sp.gapHalf, height: 2 * sp.gapHalf },
  ];
}
