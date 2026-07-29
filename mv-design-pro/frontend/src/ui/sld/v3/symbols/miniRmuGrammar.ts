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
export type DerMarkerShape = 'diamond' | 'battery' | 'circle-spokes' | 'circle-dot';
export const DER_MARKER_SHAPE: Readonly<Record<StationDerGlyphKind, DerMarkerShape>> = {
  pv: 'diamond',
  // Prostokąt bateryjny 2:1 z kreską wewnętrzną — NIE kwadrat (kolizja z aparatem).
  bess: 'battery',
  // Okrąg z 3 ramionami (wirnik) vs okrąg z kropką — rozróżnialne sylwetki.
  wind: 'circle-spokes',
  generator: 'circle-dot',
} as const;

const BBOX = 6 * GRID; // 48
const CENTER = BBOX / 2; // 24 — kotwica stacji (JEDNA KOTWICA) i oś toru pól liniowych.

export const MINI_RMU_STROKE = {
  /** 1. Tor mocy pól + przerwa NO + aparaty + głowice — PIERWSZOPLANOWE. */
  path: 1.6,
  /** 3. Szyna wewnętrzna — linia jednokreskowa (nie belka), lżejsza od toru. */
  bus: 1.2,
  /** 4. TR/DER — uzupełniające. */
  marker: 0.9,
  /** 5. Obrys stacji — najlżejszy kontekst. */
  outline: 0.5,
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
  enclosure: { x: 4, y: 8, width: 40, height: 32, rx: 0 },
  /** Pola liniowe L1/L2 na osi y=24 (tor przez stację = łańcuch pól). */
  linia: {
    y: CENTER,
    /** Kabel zewnętrzny do głowicy (odcinki poza enklozurą). */
    stubL: { x1: 0, x2: 7 },
    stubR: { x1: 41, x2: BBOX },
    /** Głowice kablowe — CAŁKOWICIE WEWNĄTRZ pola (nie dotykają obrysu);
     *  wierzchołek ku KABLOWI (zakończenie kablowe, nie grot kierunku). */
    glowicaL: { xTip: 7, xBase: 11, halfH: 3 },
    glowicaR: { xTip: 41, xBase: 37, halfH: 3 },
    /** Aparaty łączeniowe pól — stan ZAMKNIĘTY (rodzina APARAT, patrz doc). */
    aparatL: { x: 13, size: 4 },
    aparatR: { x: 35, size: 4 },
    /** Łączniki tor→szyna. */
    linkL: { x1: 15, x2: 19 },
    linkR: { x1: 29, x2: 33 },
  },
  /** SZYNA WEWNĘTRZNA — wyłącznie wewnątrz enklozury (K2). */
  bus: { y: CENTER, x1: 19, x2: 29 },
  /** Pole TRANSFORMATOROWE (K3): szyna → aparat TR → transformator (2 okręgi). */
  poleTr: {
    x: 19,
    aparat: { y: 27.5, size: 3 },
    stub1: { y1: CENTER, y2: 27.5 },
    stub2: { y1: 30.5, y2: 31.6 },
    circleR: 2,
    circle1Y: 33.6,
    circle2Y: 36.4,
    /** GS-4 (recenzja 2026-07-23): DER ZA TRANSFORMATOREM (strona nN) — znak
     *  źródła zakotwiczony do GAŁĘZI POLA TR PONIŻEJ uzwojeń, POZA enklozurą
     *  (strona nN jest na zewnątrz rozdzielnicy SN — ten sam wzór co kable
     *  pól liniowych przecinające obrys). INNA kotwica niż DER na SN
     *  (`poleDer`) — mini-RMU nie może kłamać topologicznie. */
    derNn: {
      stub: { y1: 38.4, y2: 41 },
      markerCY: 43.4,
      markerHalf: 2.4,
    },
  },
  /** Pole DER (K5): szyna → aparat DER → marker rodzaju (romb/kwadrat/okrąg). */
  poleDer: {
    x: 29,
    aparat: { y: 17, size: 3 },
    stub1: { y1: 20, y2: CENTER },
    stub2: { y1: 14.4, y2: 17 },
    markerCY: 12,
    markerHalf: 2.4,
  },
  /** Sprzęgło sekcyjne / NO (K6): APARAT W TORZE SZYNY (środek). Zamknięty =
   *  kwadrat na szynie; OTWARTY (NO) = realna PRZERWA szyny + kreska ukośna. */
  sprzeglo: { x: CENTER, size: 4, gapHalf: 3 },
  /** GS-5 (uwaga właściciela 2026-07-23): WĘZEŁ ODGAŁĘZIENIA na szynie —
   *  stacja odgałęźna (≥3 pola liniowe, §19.3). Kropka węzłowa (notacja
   *  junction SLD), NIE trzecie pełne pole: pomiar stref wykazał, że
   *  kompozycja aparat+głowica w osi zejścia korytarza (x=24) łamie światło
   *  minGap.marker=3 względem pola TR (aparat 17,5..20,5 / uzwojenia 17..21)
   *  w każdym wariancie zgodnym z realnym punktem odejścia; pełne pole
   *  odgałęźne żyje od L1 (adaptacyjny jest detal). Kabel zejścia rysuje
   *  scena. Wyklucza się ze sprzęgłem przez klasyfikację (§19.3: sprzęgło ⇒
   *  sekcyjna nadrzędna) — kontrakt `miniRmuFeatureContradictions`. */
  odgalezienie: { x: CENTER, r: 1.1 },
  stroke: MINI_RMU_STROKE,
  minGap: MINI_RMU_MIN_GAP,
} as const;

/** GS-5: topologia pól liniowych sylwetki — L0 niesie ROLĘ TOPOLOGICZNĄ
 *  stacji w ciągu (spec §19.3 + prezentacja stacji ostatniej w ciągu,
 *  recenzja NO-GO 2026-07-17 pkt 7): `końcowa` = jedno pole WE (szyna kończy
 *  się w rozdzielnicy — ZERO fantomowego toru na wylot), `przelotowa` = dwa
 *  pola (dziś), `odgałęźna` = dwa pola + węzeł odgałęzienia na szynie.
 *  Sekcyjna (sprzęgło) jest z definicji dwustronna → mapuje na 'przelotowa'
 *  + flaga `sectioned`. */
export type MiniRmuLineTopology = 'końcowa' | 'przelotowa' | 'odgałęźna';

export interface MiniRmuFeatures {
  readonly sectioned: boolean;
  /** GS-5: pola liniowe sylwetki z REALNEJ topologii stacji (nie założenia
   *  „każda stacja przelotowa" — uwaga właściciela 2026-07-23). */
  readonly lineTopology: MiniRmuLineTopology;
  readonly transformer: boolean;
  /** GS-4: DER przyłączony do SZYNY SN (osobne pole SN dla DER — `poleDer`). */
  readonly derOnMv: StationDerGlyphKind | null;
  /** GS-4: DER ZA transformatorem (strona nN — znak przy gałęzi pola TR,
   *  PONIŻEJ uzwojeń, `poleTr.derNn`). NIEZALEŻNE od `derOnMv` — oba mogą
   *  wystąpić naraz. Wymaga `transformer=true` (walidacja
   *  `miniRmuFeatureContradictions`). */
  readonly derBehindTr: StationDerGlyphKind | null;
  readonly noOpen: boolean;
}

export function miniRmuSignature(f: MiniRmuFeatures): string {
  return [
    f.sectioned ? 'SEK' : '-',
    f.lineTopology,
    f.transformer ? 'TR' : '-',
    f.derOnMv ? `SN:${f.derOnMv}` : '-',
    f.derBehindTr ? `nN:${f.derBehindTr}` : '-',
    f.noOpen ? 'NO' : '-',
  ].join('|');
}

/** GS-4/GS-5: sprzeczności kontraktu cech (walidacja czerwona, nie cichy
 *  render). Pusta lista = kombinacja legalna:
 *  - GS-4: `derBehindTr` bez transformatora — źródło „za TR" nie istnieje;
 *  - GS-5: `sectioned` z topologią inną niż dwustronna — sprzęgło dzieli
 *    stację na sekcje, klasyfikacja §19.3 daje mu pierwszeństwo i stacja
 *    sekcyjna jest z definicji dwustronna (mv_lv_sectional);
 *  - GS-5: `noOpen` przy topologii 'końcowa' — punkt NO wymaga DRUGIEGO
 *    toru (drugie pole spięte do sąsiedniego ciągu), stacja jednostronna
 *    nie ma czego normalnie otwierać. */
export function miniRmuFeatureContradictions(f: MiniRmuFeatures): readonly string[] {
  const g: string[] = [];
  if (f.derBehindTr != null && !f.transformer)
    g.push('GS-4: derBehindTr bez transformatora — źródło „za TR" wymaga pola TR (hasTransformer=true)');
  if (f.sectioned && f.lineTopology !== 'przelotowa')
    g.push('GS-5: sectioned wymaga topologii dwustronnej (sprzęgło ⇒ sekcyjna nadrzędna, §19.3)');
  if (f.noOpen && f.lineTopology === 'końcowa')
    g.push('GS-5: noOpen przy stacji końcowej — punkt NO wymaga drugiego toru (przelotowa/odgałęźna)');
  return g;
}

/** Macierz WYŁĄCZNIE kombinacji legalnych (GS-4: strona DER; GS-5: topologia
 *  pól liniowych w iloczynie; kombinacje sprzeczne wykluczone z konstrukcji,
 *  ich odrzucenie dowodzi test przez `miniRmuFeatureContradictions`). */
export function allMiniRmuFeatureCombinations(): readonly MiniRmuFeatures[] {
  const out: MiniRmuFeatures[] = [];
  const kinds = [null, 'pv', 'bess', 'wind', 'generator'] as const;
  const topologies: readonly MiniRmuLineTopology[] = ['końcowa', 'przelotowa', 'odgałęźna'];
  for (const sectioned of [false, true])
    for (const lineTopology of topologies)
      for (const transformer of [false, true])
        for (const derOnMv of kinds)
          for (const derBehindTr of kinds)
            for (const noOpen of [false, true]) {
              const f: MiniRmuFeatures = { sectioned, lineTopology, transformer, derOnMv, derBehindTr, noOpen };
              if (miniRmuFeatureContradictions(f).length > 0) continue;
              out.push(f);
            }
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
  // GS-4: strefa DER za TR (nN) — POZA enklozurą (strona nN na zewnątrz
  // rozdzielnicy SN), wewnątrz bboxa, gałąź ciągła od uzwojeń do markera.
  const nn = poleTr.derNn;
  if (nn.markerCY - nn.markerHalf < enclosure.y + enclosure.height)
    g.push('GS-4: marker DER nN wchodzi w enklozurę (strona nN jest na zewnątrz rozdzielnicy SN)');
  if (nn.markerCY + nn.markerHalf > MINI_RMU.bbox.height - minGap.outline)
    g.push('GS-4: marker DER nN wychodzi poza bbox glifu');
  if (nn.stub.y1 > poleTr.circle2Y + poleTr.circleR + 0.001 || nn.stub.y2 < nn.markerCY - nn.markerHalf - 0.001)
    g.push('GS-4: przerwa gałęzi nN między uzwojeniami TR a markerem DER (tor niedomknięty)');
  // GS-5: węzeł odgałęzienia MUSI leżeć NA szynie (wewnątrz jej przęsła) —
  // kropka poza szyną fabrykowałaby punkt odejścia.
  const od = MINI_RMU.odgalezienie;
  if (od.x - od.r < MINI_RMU.bus.x1 || od.x + od.r > MINI_RMU.bus.x2)
    g.push('GS-5: węzeł odgałęzienia poza przęsłem szyny');
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
    // GS-4: DER za TR (nN) — INNA kotwica niż DER na SN (gałąź pola TR);
    // osobna rodzina cechy (`derNn`), bo strefa SN i nN to różne przyłącza.
    { feature: 'derNn-marker', x: t.x - t.derNn.markerHalf, y: t.derNn.markerCY - t.derNn.markerHalf, width: 2 * t.derNn.markerHalf, height: 2 * t.derNn.markerHalf },
    { feature: 'noOpen', x: sp.x - sp.gapHalf, y: y - 2 * sp.gapHalf, width: 2 * sp.gapHalf, height: 2 * sp.gapHalf },
  ];
}
