/**
 * SCHEMAT-10 GS-2 (V12K-137) — GRAMATYKA KONSTRUKCYJNA sylwetki mini-RMU (L0)
 * jako CZYSTE DANE (reguła 13: obrys, promienie, marginesy, siatka, kotwice
 * markerów i minimalne odstępy = parametry GLOBALNE silnika, JEDNO miejsce,
 * ZERO wartości lokalnych w rendererze `StationCollapsedGlyph`).
 *
 * FORMALNA specyfikacja tych reguł żyje w `docs/sld/GRAMATYKA_MINI_RMU_2026-07.md`
 * (sekcja „Specyfikacja konstrukcyjna") — renderer `symbols/glyphs.tsx` jest
 * WYŁĄCZNIE implementacją reguł stąd (reguła 14). Zmiana kształtu sylwetki =
 * zmiana TU (i w dokumencie), nie ręcznych literałów w glifie.
 *
 * Układ (reguły 2–4, 5–7, 10, 12):
 *  - TOR MOCY: pozioma kreska szyny SN przez środek bboxa (y = bbox/2),
 *    współliniowa z portami W/E — mini-RMU jest FRAGMENTEM toru, nie ikoną na
 *    linii (reguła 2/4). Enklozura bez wypełnienia — nie maskuje toru (reguła 3).
 *  - KOLUMNA ROUTINGU (x = bbox/2): pion N–S laterali; wszystkie markery trzymają
 *    się od niej z dala o `minGap.marker` (reguła 5: markery nie dominują toru).
 *  - KOTWICE markerów: STAŁE względem obrysu (reguła 6), z priorytetami i strefami
 *    rozłącznymi (reguła 7). Każdy marker zachowuje `minGap.outline` od enklozury
 *    i `minGap.marker` od sąsiada oraz od kolumny routingu (reguła 10).
 *  - TRANSFORMATOR: rola UZUPEŁNIAJĄCA (reguła 12) — dwa małe okręgi zwieszone
 *    pod szyną w lewej-dolnej strefie, nie dominują wnętrza (proporcja poniżej).
 *
 * Grubości (reguła 11 — proporcje wspólne z L1/L2): obrys = `V3_STROKE_APPARATUS`
 * (ta sama kreska aparatu co glify L1/L2, `glyphs.tsx`); szyna GRUBSZA od obrysu
 * (nośnik „tor” = WAGA, nie kolor — hierarchia §6 szyna > tor > odgałęzienie);
 * markery CIEŃSZE od obrysu (warstwa uzupełniająca). Relacja
 * `bus > outline(apparatus) > marker` zaryglowana testem w `symbols.test.tsx`.
 */

import { GRID } from '../core/grid';

/** Rodzaj DER niesiony przez marker sylwetki — re-eksport z `glyphs.tsx` byłby
 *  cyklem (glyphs importuje ten moduł), więc unia jest tu ŹRÓDŁEM, a `glyphs.tsx`
 *  re-eksportuje `StationDerGlyphKind` z niej (jedna definicja). */
export type StationDerGlyphKind = 'pv' | 'bess' | 'wind' | 'generator';

/** Kształt markera DER (reguła: „rozróżnienie IKONĄ” — PV trójkąt / BESS kwadrat /
 *  FW·generator okrąg, spójnie z glifami `DerPvGlyph`…). */
export type DerMarkerShape = 'triangle' | 'square' | 'circle';

export const DER_MARKER_SHAPE: Readonly<Record<StationDerGlyphKind, DerMarkerShape>> = {
  pv: 'triangle',
  bess: 'square',
  // Farma wiatrowa i generator generyczny = maszyna wirująca → okrąg.
  wind: 'circle',
  generator: 'circle',
} as const;

const BBOX = 6 * GRID; // 48 — patrz `defs.ts` (uzasadnienie czytelności kadru).
const CENTER = BBOX / 2; // 24 — środek = kotwica stacji (JEDNA KOTWICA) i oś szyny.

/**
 * Grubości mini-RMU (reguła 11). `outline` NIE jest tu literałem — glif podaje
 * `V3_STROKE_APPARATUS` (ta sama kreska aparatu co L1/L2); tu trzymamy tylko
 * proporcje SPECYFICZNE dla miniatury (szyna/markery). Wartości dobrane tak, by
 * `bus (2) > apparatus (1.2) > marker (0.9)` — hierarchia wag §6 w skali L0.
 */
export const MINI_RMU_STROKE = {
  bus: 2,
  marker: 0.9,
} as const;

/** Minimalne odstępy (reguła 10) — GLOBALNE, czytelność przy najmniejszych
 *  rozmiarach. `marker` = min. prześwit marker↔marker i marker↔kolumna routingu;
 *  `outline` = min. prześwit marker↔enklozura. */
export const MINI_RMU_MIN_GAP = {
  marker: 4,
  outline: 1,
} as const;

/** Strefa (bbox markera) — do walidacji rozłączności/odstępów przez sondę. */
export interface MiniRmuZone {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Parametry konstrukcyjne sylwetki mini-RMU — JEDYNE źródło geometrii glifu.
 * Wszystkie współrzędne w układzie bboxa 48×48 (origin = lewy-górny róg).
 */
export const MINI_RMU = {
  /** Bbox = 6×GRID (reguła 13: siatka). */
  bbox: { width: BBOX, height: BBOX },
  /** Środek = kotwica stacji na każdym LOD + oś szyny SN (reguła 6/„JEDNA KOTWICA”). */
  center: { x: CENTER, y: CENTER },
  /** Enklozura (obrys RMU) — bez wypełnienia (reguła 3: nie maskuje toru). */
  enclosure: { x: 4, y: 10, width: 40, height: 28, rx: 3 },
  /** Szyna SN — TOR MOCY przez środek, na WYLOT od portu W(0,24) do E(48,24)
   *  (reguła 2/4: moc płynie PRZEZ stację, mini-RMU = fragment toru; szyna
   *  współliniowa i ciągła z trasą magistrali, enklozura jej nie przerywa). */
  bus: { y: CENTER, x1: 0, x2: BBOX },
  /** Kolumna routingu N–S (pion laterali) — markery trzymają się od niej z dala. */
  routingColumnX: CENTER,
  stroke: MINI_RMU_STROKE,
  minGap: MINI_RMU_MIN_GAP,

  /** Kotwice markerów — STAŁE względem obrysu, strefy rozłączne (reguła 5–7, 10). */
  markers: {
    /** Stacja SEKCYJNA (priorytet 1): sprzęgło = dwie kreski flankujące kolumnę
     *  routingu NA szynie (symetrycznie ±`markerHalfGap` od środka). */
    sectioned: {
      leftX: CENTER - MINI_RMU_MIN_GAP.marker, // 20
      rightX: CENTER + MINI_RMU_MIN_GAP.marker, // 28
      y1: 20,
      y2: 28,
    },
    /** TRANSFORMATOR (priorytet 2): rola UZUPEŁNIAJĄCA (reguła 12) — stub w dół +
     *  dwa małe okręgi (dwuuzwojeniowy) w lewej-dolnej strefie POD szyną. */
    transformer: {
      x: 16,
      stubY1: CENTER, // 24
      stubY2: 27,
      circleR: 2.5,
      circle1Y: 30,
      circle2Y: 34,
    },
    /** DER (priorytet 3): stub w GÓRĘ + marker rodzaju w prawej-górnej strefie
     *  NAD szyną. Marker rozłączny z enklozurą (`minGap.outline`) i z kolumną
     *  routingu (`minGap.marker`). */
    der: {
      x: 32,
      stubY1: CENTER, // 24
      stubY2: 19,
      centerY: 15,
      half: 4, // połowa boku/promienia markera → strefa 8×8
    },
    /** Łącznik/punkt NORMALNIE OTWARTY (priorytet 4): kwadrat OTWARTY na szynie,
     *  prawa strefa (za markerem DER, prześwit `minGap.outline` od prawej enklozury). */
    noOpen: {
      x: 37,
      y: 21,
      size: 6,
    },
  },
} as const;

/** Proporcja transformatora względem WNĘTRZA enklozury (reguła 12: „nie może
 *  dominować wnętrza”). Wysokość zajmowana przez oba okręgi TR / wysokość
 *  wnętrza. Zaryglowana testem (`symbols.test.tsx`) jako ≤ 0,5. */
export function transformerInteriorHeightRatio(): number {
  const tr = MINI_RMU.markers.transformer;
  const trTop = tr.circle1Y - tr.circleR;
  const trBottom = tr.circle2Y + tr.circleR;
  return (trBottom - trTop) / MINI_RMU.enclosure.height;
}

/**
 * SONDA CIĄGŁOŚCI TORU PRZEZ GLIF (reguły 2–4) — dowód, że mini-RMU jest
 * FRAGMENTEM toru mocy, nie ikoną na linii:
 *  (a) szyna leży na osi środka bboxa (y = bbox/2) — współliniowa z portami W/E;
 *  (b) szyna biegnie NA WYLOT od portu W (x=0) do portu E (x=bbox) — wejście/
 *      wyjście jednoznaczne, tor ciągły port↔port (nie inset ikony wewnątrz);
 *  (c) szyna przechodzi przez OBIE ściany enklozury (x < enclosure.x i
 *      x > enclosure prawa) — enklozura nie przerywa toru (jest bez wypełnienia,
 *      reguła 3 — sprawdza renderer/test);
 * Zwraca listę naruszeń (pusta = ciągłość zachowana).
 */
export function miniRmuPathContinuityGaps(): readonly string[] {
  const gaps: string[] = [];
  const { bus, enclosure, center, bbox } = MINI_RMU;
  if (bus.y !== center.y) {
    gaps.push(`szyna poza osią środka: bus.y=${bus.y} ≠ center.y=${center.y}`);
  }
  if (bus.x1 !== 0) {
    gaps.push(`szyna nie sięga portu W (x=0): bus.x1=${bus.x1}`);
  }
  if (bus.x2 !== bbox.width) {
    gaps.push(`szyna nie sięga portu E (x=${bbox.width}): bus.x2=${bus.x2}`);
  }
  if (bus.x1 >= enclosure.x || bus.x2 <= enclosure.x + enclosure.width) {
    gaps.push('szyna nie przechodzi przez obie ściany enklozury (tor przerwany)');
  }
  return gaps;
}

export const MINI_RMU_FEATURES = ['sectioned', 'transformer', 'der', 'noOpen'] as const;

/** Nazwana strefa PRYMITYWU markera (pojedynczy rysowany kształt) — do walidacji
 *  rozłączności/odstępów (reguła 10). Sekcyjna to DWA prymitywy (ticki), żeby
 *  kolumna routingu `x=24` przechodziła kanałem MIĘDZY nimi. */
export interface MiniRmuNamedZone extends MiniRmuZone {
  readonly feature: string;
}

/** Wszystkie prymitywy markerów jako strefy (pełny zestaw = kombinacja typ×TR×
 *  DER×NO włączona) — geometria z `MINI_RMU`. Kreska markera wlicza się do
 *  strefy (połowa grubości z każdej strony). */
export function miniRmuMarkerPrimitiveZones(): readonly MiniRmuNamedZone[] {
  const m = MINI_RMU.markers;
  const halfStroke = MINI_RMU.stroke.marker / 2;
  const sec = m.sectioned;
  const tr = m.transformer;
  const der = m.der;
  const no = m.noOpen;
  return [
    { feature: 'sectioned-left', x: sec.leftX - halfStroke, y: sec.y1, width: MINI_RMU.stroke.marker, height: sec.y2 - sec.y1 },
    { feature: 'sectioned-right', x: sec.rightX - halfStroke, y: sec.y1, width: MINI_RMU.stroke.marker, height: sec.y2 - sec.y1 },
    { feature: 'transformer', x: tr.x - tr.circleR, y: tr.circle1Y - tr.circleR, width: 2 * tr.circleR, height: tr.circle2Y + tr.circleR - (tr.circle1Y - tr.circleR) },
    { feature: 'der', x: der.x - der.half, y: der.centerY - der.half, width: 2 * der.half, height: 2 * der.half },
    { feature: 'noOpen', x: no.x, y: no.y, width: no.size, height: no.size },
  ];
}

function zonesOverlap(a: MiniRmuZone, b: MiniRmuZone): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/**
 * SONDA ODSTĘPÓW/KOTWIC MARKERÓW (reguły 5–7, 10) — dowód, że markery:
 *  (a) leżą WEWNĄTRZ enklozury z zapasem `minGap.outline`;
 *  (b) są PARAMI ROZŁĄCZNE (nie zlewają się przy najmniejszych rozmiarach);
 *  (c) kolumna routingu `x=24` przechodzi CZYSTYM kanałem (żaden prymityw jej nie
 *      przecina; ticki sekcyjne flankują ją o `minGap.marker`).
 * Zwraca listę naruszeń (pusta = odstępy zachowane).
 */
export function miniRmuMarkerSpacingGaps(): readonly string[] {
  const gaps: string[] = [];
  const zones = miniRmuMarkerPrimitiveZones();
  const e = MINI_RMU.enclosure;
  const g = MINI_RMU.minGap.outline;
  const col = MINI_RMU.routingColumnX;

  for (const z of zones) {
    if (z.x < e.x + g || z.x + z.width > e.x + e.width - g || z.y < e.y + g || z.y + z.height > e.y + e.height - g) {
      gaps.push(`marker ${z.feature} narusza minGap.outline (${g}) względem enklozury`);
    }
    // Kolumna routingu przecinana przez prymityw (poza tickami sekcyjnymi, które
    // z definicji flankują kolumnę) — zakaz.
    if (!z.feature.startsWith('sectioned') && z.x < col && z.x + z.width > col) {
      gaps.push(`marker ${z.feature} przecina kolumnę routingu x=${col}`);
    }
  }

  for (let i = 0; i < zones.length; i++) {
    for (let j = i + 1; j < zones.length; j++) {
      if (zonesOverlap(zones[i], zones[j])) {
        gaps.push(`markery ${zones[i].feature}↔${zones[j].feature} nachodzą (reguła 10)`);
      }
    }
  }

  // Ticki sekcyjne flankują kolumnę routingu o dokładnie minGap.marker (kanał).
  const sec = MINI_RMU.markers.sectioned;
  if (sec.leftX !== col - MINI_RMU.minGap.marker || sec.rightX !== col + MINI_RMU.minGap.marker) {
    gaps.push(`ticki sekcyjne nie flankują kolumny routingu o minGap.marker (${MINI_RMU.minGap.marker})`);
  }

  return gaps;
}
