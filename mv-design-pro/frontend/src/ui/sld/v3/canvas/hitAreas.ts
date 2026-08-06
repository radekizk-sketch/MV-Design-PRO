/**
 * SLD V3 — TRAFIENIE I TOŻSAMOŚĆ ZAZNACZENIA na kanwie (karta S9-4, znaleziska
 * audytu `docs/sld/AUDYT_JAKOSCI_SLD_2026-08.md` §3.2).
 *
 * ---------------------------------------------------------------------------
 * PO CO (diagnoza audytu, pomiar na żywej aplikacji — nie z lektury kodu)
 * ---------------------------------------------------------------------------
 * Trzy zmierzone defekty tej samej KLASY („obszar trafienia nie jest własnością
 * obiektu, tylko przypadkową konsekwencją grubości kreski i kolejności
 * malowania"):
 *  (a) klik nad elementem zaznaczał TEN element w 3 przypadkach na 12;
 *  (b) aparaty rysowane kreską (uziemnik, przekładnik, zejście pola — obrys
 *      1,6 px) były niekilkalne w ogóle;
 *  (c) etykiety i nakładki wynikowe MALOWAŁY się nad rysunkiem, ale nie niosły
 *      żadnego uchwytu — klik w nie „znikał" (zdarzenie trafiało w napis bez
 *      obsługi i nie docierało do obiektu pod spodem).
 *
 * ---------------------------------------------------------------------------
 * ROZSTRZYGNIĘCIE — DWA PRZEBIEGI TRAFIENIA (obrys, potem obszar)
 * ---------------------------------------------------------------------------
 * Każdy obiekt kanwy dostaje DWIE geometrie trafienia:
 *
 *  1. OBRYS (`obrys`) — dokładny ślad rysunku: prostokąt gabarytowy symbolu,
 *     kreska toru o grubości widocznej, prostokąt etykiety. Rozstrzyga
 *     PIERWSZY: klik nad tuszem obiektu należy do TEGO obiektu.
 *  2. OBSZAR (`obszar`) — ten sam kształt rozszerzony tak, żeby jego najmniejszy
 *     wymiar na EKRANIE wynosił co najmniej `MIN_HIT_SCREEN_PX`. Rozstrzyga
 *     DOPIERO, gdy klik nie trafił w żaden obrys — czyli „prawie trafiłem".
 *
 * Kolejność ma znaczenie i jest odwzorowana W DOM: warstwa trafień
 * (`sld-v3-trafienia`) ma DWA piętra — najpierw `sld-v3-trafienia-obszar`
 * (rozszerzenia), nad nim `sld-v3-trafienia-obrys` (ślady rysunku). Przeglądarka
 * wybiera węzeł malowany najwyżej, więc rozstrzyga dokładnie tak, jak
 * `pickCanvasHitArea` niżej: rozszerzenie NIGDY nie kradnie kliku obiektowi, nad
 * którego tuszem stoi kursor (to była pułapka „jednego grubego hitboxa":
 * poszerzony cel symbolu zjadał kliki w szynę przechodzącą pod nim). Niezmiennik
 * kolejności pięter pilnuje `hitLayerOrderingInDom` — bramka odbioru, nie
 * obietnica w komentarzu.
 *
 * Cały RYSUNEK kanwy jest przy tym BIERNY (`pointer-events="none"` na korzeniu
 * arkusza): łapią wyłącznie te dwa piętra. Jeden atrybut zamyka klasę „napis bez
 * obsługi połyka klik", bo własność jest dziedziczona — każda przyszła nakładka
 * jest bierna z konstrukcji, a nie dlatego, że ktoś pamiętał ją wypisać.
 *
 * Predykaty parami (reguła KLASA, NIE INSTANCJA pkt 3): geometria WEJŚCIA
 * (co rysuje `SldCanvasV3`) i geometria WYJŚCIA (co rozstrzyga sonda odbioru
 * `sondaSiatkowaTrafien`) pochodzą z TEJ JEDNEJ funkcji `buildCanvasHitAreas`.
 * Kontrakt „render używa tego modułu" jest PRZYPIĘTY testem
 * (`__tests__/trafienieKanwy.contract.test.tsx`), nie deklaracją w komentarzu.
 *
 * Moduł jest CZYSTY (zero DOM, zero Reacta, zero fizyki) — testowalny bez
 * renderu i uruchamialny w skrypcie odbioru `scripts/sld_v3_acceptance.mjs`.
 */
import type { RouteVertex } from '../layout/route';
import type { V3Rect } from '../core/grid';
import { SEGMENT_STROKE_WIDTH, type PreviewElementKind, type PreviewSegment, type PreviewSymbol } from '../compose/preview';
import { SYMBOL_DEFS } from '../symbols/defs';
import type { OwnerKind } from '../layout/labels';
import type { PlannedLabel } from './labelLegibility';

/**
 * Najmniejszy dopuszczalny wymiar obszaru trafienia w pikselach EKRANU.
 *
 * 24 px to wymiar celu wskazywanego myszą przyjęty w karcie S9-4 (audyt §3.2,
 * naprawa do P-1/P-3: „ujednolicić trafienie: jeden przezroczysty obszar
 * trafienia na obiekt, min. 24 px"). Wielkość jest własnością EKRANU, nie
 * arkusza — dlatego przeliczana przez skalę kamery (`hitPadWorld`), a nie
 * zapisana jako stała świata. Stała świata (dawne `SEGMENT_HIT_STROKE_WIDTH=12`)
 * dawała 7,2 px ekranu przy skali 0,6 i 36 px przy skali 3 — raz za mało, raz
 * za dużo.
 */
export const MIN_HIT_SCREEN_PX = 24;

/** Rodzaj obiektu kanwy — jednostka INWENTARZA klasy (raport sondy per rodzaj). */
export type HitObjectClass =
  | 'stacja'
  | 'aparat'
  | 'transformator'
  | 'zrodlo'
  | 'uklad-der'
  | 'adnotacja'
  | 'szyna'
  | 'tor'
  | 'lacznik-wiersza'
  | 'etykieta'
  | 'znacznik-wyniku';

/** Wszystkie rodzaje obiektów kanwy — lista ZAMKNIĘTA (dopisanie rodzaju bez
 *  obsługi w `buildCanvasHitAreas` łamie test kontraktu inwentarza). */
export const HIT_OBJECT_CLASSES: readonly HitObjectClass[] = [
  'stacja',
  'aparat',
  'transformator',
  'zrodlo',
  'uklad-der',
  'adnotacja',
  'szyna',
  'tor',
  'lacznik-wiersza',
  'etykieta',
  'znacznik-wyniku',
];

export interface HitRectShape {
  readonly ksztalt: 'prostokat';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface HitPolylineShape {
  readonly ksztalt: 'lamana';
  readonly points: readonly RouteVertex[];
  /** Połowa grubości kreski trafienia [świat]. */
  readonly halfWidth: number;
}

export type HitShape = HitRectShape | HitPolylineShape;

/** Jeden obiekt kanwy wraz z jego tożsamością i obiema geometriami trafienia. */
export interface CanvasHitArea {
  /** `data-testid` węzła treści — tożsamość obiektu w DOM (stabilna per LOD). */
  readonly testId: string;
  /** Ref elementu modelu (ENM lub kompozyt `#…`). `undefined` = obiekt
   *  rysunkowy bez odpowiednika w modelu (węzeł trasy, kropka T) — wtedy
   *  tożsamością jest `testId`, NIGDY zgadywany ref. */
  readonly ownerRef: string | undefined;
  readonly elementKind: PreviewElementKind | undefined;
  readonly klasa: HitObjectClass;
  /** Kolejność malowania w DOM (rośnie = wyżej). Rozstrzyga nakładanie. */
  readonly z: number;
  readonly obrys: HitShape;
  readonly obszar: HitShape;
}

// ---------------------------------------------------------------------------
// Geometria — przeliczenie „minimum ekranowe" na świat arkusza
// ---------------------------------------------------------------------------

/** Skala wiarygodna? (viewport 0×0 przed pierwszym pomiarem układu daje 0/NaN —
 *  wtedy przyjmujemy 1:1 świat↔ekran, jak `planSceneLabels`: brak pomiaru nie
 *  jest dowodem czegokolwiek). */
function bezpiecznaSkala(scale: number): number {
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

/** Minimalny wymiar obszaru trafienia wyrażony w jednostkach ŚWIATA arkusza. */
export function minHitWorldSize(scale: number): number {
  return MIN_HIT_SCREEN_PX / bezpiecznaSkala(scale);
}

/** Połowa minimalnego wymiaru — promień „prawie trafiłem" wokół kreski. */
export function hitPadWorld(scale: number): number {
  return minHitWorldSize(scale) / 2;
}

/** Prostokąt rozszerzony symetrycznie do minimum ekranowego (środek bez zmian). */
export function expandRectToMinHit(rect: V3Rect, scale: number): HitRectShape {
  const min = minHitWorldSize(scale);
  const width = Math.max(rect.width, min);
  const height = Math.max(rect.height, min);
  return {
    ksztalt: 'prostokat',
    x: rect.x + rect.width / 2 - width / 2,
    y: rect.y + rect.height / 2 - height / 2,
    width,
    height,
  };
}

/** Gabaryt symbolu = jego OBRYS trafienia (glif IEC mieści się w tym prostokącie). */
export function symbolInkRect(symbol: PreviewSymbol): V3Rect {
  const def = SYMBOL_DEFS[symbol.symbolId];
  return { x: symbol.x, y: symbol.y, width: def.width, height: def.height };
}

/** Połowa grubości WIDOCZNEJ kreski odcinka (obrys trafienia toru). */
export function segmentInkHalfWidth(segment: PreviewSegment): number {
  return SEGMENT_STROKE_WIDTH[segment.meta?.kind ?? 'sn'] / 2;
}

/** Połowa grubości kreski trafienia odcinka — nigdy cieńsza niż obrys rysunku
 *  i nigdy cieńsza niż połowa minimum ekranowego. */
export function segmentHitHalfWidth(segment: PreviewSegment, scale: number): number {
  return Math.max(segmentInkHalfWidth(segment), hitPadWorld(scale));
}

/** Grubość kreski trafienia odcinka podawana wprost do `stroke-width`. */
export function segmentHitStrokeWidth(segment: PreviewSegment, scale: number): number {
  return 2 * segmentHitHalfWidth(segment, scale);
}

// ---------------------------------------------------------------------------
// Klasyfikacja rodzaju obiektu (inwentarz klasy)
// ---------------------------------------------------------------------------

function klasaSymbolu(elementKind: PreviewElementKind | undefined): HitObjectClass {
  switch (elementKind) {
    case 'station':
      return 'stacja';
    case 'transformer':
      return 'transformator';
    case 'source':
      return 'zrodlo';
    case 'der':
      return 'uklad-der';
    case 'protectionAnnotation':
      return 'adnotacja';
    default:
      // `apparatus` oraz symbole rysunkowe bez kategorii (węzeł trasy, kropka T)
      // — jeden bucket „aparat", zgodnie z `classifySymbolElementKind`.
      return 'aparat';
  }
}

function klasaOdcinka(segment: PreviewSegment): HitObjectClass {
  const kind = segment.meta?.kind ?? 'sn';
  if (kind === 'bus' || kind === 'busGpz') return 'szyna';
  if (kind === 'sheetContinuation') return 'lacznik-wiersza';
  return 'tor';
}

/**
 * Kategoria elementu, którą niesie klik w ETYKIETĘ — JAWNA, ZAMKNIĘTA tabela
 * `OwnerKind → PreviewElementKind`. Etykieta jest UCHWYTEM swojego właściciela:
 * klik w napis „S08 · 15 kV" zaznacza szynę, klik w „Q1" — aparat pola, a nie
 * stację ani tło (audyt P-2: „zaznaczenie musi nieść owner-ref klikniętego
 * aparatu"). Dopisanie nowego `OwnerKind` bez decyzji tutaj nie skompiluje się
 * (`satisfies Record<OwnerKind, …>`).
 */
export const LABEL_OWNER_ELEMENT_KIND = {
  'segment-span': 'segment',
  'segment-lateral': 'segment',
  'station-name': 'station',
  'port-caption': 'apparatus',
  'field-role': 'apparatus',
  apparatus: 'apparatus',
  der: 'der',
  'busbar-voltage': 'bus',
  'no-point': 'apparatus',
  protection: 'protectionAnnotation',
  'lv-load': 'bus',
} satisfies Record<OwnerKind, PreviewElementKind>;

// ---------------------------------------------------------------------------
// Budowa obszarów trafienia CAŁEJ kanwy
// ---------------------------------------------------------------------------

/** Znacznik wynikowy (warstwa S9-2) w kształcie potrzebnym do trafienia —
 *  strukturalny, żeby moduł nie zależał od `SldCanvasV3.tsx` (cykl importów). */
export interface ResultMarkerHitInput {
  readonly testId: string;
  readonly ownerRef: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface CanvasHitAreaInput {
  readonly symbols: readonly PreviewSymbol[];
  readonly segments: readonly PreviewSegment[];
  /** Etykiety WEDŁUG PLANU renderu (`planSceneLabels`) — rysowane są tylko te,
   *  więc tylko te są uchwytami. Etykiety ukryte progiem czytelności nie mają
   *  obszaru trafienia (nie ma czego kliknąć — uczciwie). */
  readonly labels: readonly PlannedLabel[];
  readonly resultMarkers: readonly ResultMarkerHitInput[];
  /** Skala kamery [px ekranu na jednostkę świata]. */
  readonly scale: number;
  /** `testId` obiektów UKRYTYCH filtrem warstw — bez węzła w DOM, więc i bez
   *  obszaru trafienia. Pusty zbiór = wszystko widoczne. */
  readonly ukryteTestId?: ReadonlySet<string>;
}

/** `data-testid` symbolu — TA SAMA formuła co render (`symbolTestId`). */
function testIdSymbolu(symbol: PreviewSymbol, index: number): string {
  return symbol.meta?.testId ?? `sld-v3-symbol-${index}`;
}

/** `data-testid` odcinka — TA SAMA formuła co render (`segmentTestId`). */
function testIdOdcinka(segment: PreviewSegment, index: number): string {
  return segment.meta?.testId ?? `sld-v3-segment-${index}`;
}

/**
 * Obszary trafienia WSZYSTKICH obiektów kanwy, w kolejności malowania DOM
 * (odcinki → symbole → etykiety → znaczniki wyniku). Kolejność jest częścią
 * kontraktu: rozstrzyga, który obiekt wygrywa przy nałożeniu obrysów.
 */
export function buildCanvasHitAreas(input: CanvasHitAreaInput): readonly CanvasHitArea[] {
  const { symbols, segments, labels, resultMarkers, scale } = input;
  const ukryte = input.ukryteTestId;
  const areas: CanvasHitArea[] = [];
  let z = 0;

  segments.forEach((segment, index) => {
    if (segment.points.length < 2) return;
    const testId = testIdOdcinka(segment, index);
    if (ukryte?.has(testId)) return;
    areas.push({
      testId,
      ownerRef: segment.meta?.ownerRef,
      elementKind: segment.meta?.elementKind,
      klasa: klasaOdcinka(segment),
      z: z++,
      obrys: { ksztalt: 'lamana', points: segment.points, halfWidth: segmentInkHalfWidth(segment) },
      obszar: { ksztalt: 'lamana', points: segment.points, halfWidth: segmentHitHalfWidth(segment, scale) },
    });
  });

  symbols.forEach((symbol, index) => {
    const testId = testIdSymbolu(symbol, index);
    if (ukryte?.has(testId)) return;
    const rect = symbolInkRect(symbol);
    areas.push({
      testId,
      ownerRef: symbol.meta?.ownerRef,
      elementKind: symbol.meta?.elementKind,
      klasa: klasaSymbolu(symbol.meta?.elementKind),
      z: z++,
      obrys: { ksztalt: 'prostokat', x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      obszar: expandRectToMinHit(rect, scale),
    });
  });

  labels.forEach((planned) => {
    const testId = `sld-v3-label-${planned.index}`;
    if (ukryte?.has(testId)) return;
    areas.push({
      testId,
      ownerRef: planned.label.ownerRef,
      elementKind: LABEL_OWNER_ELEMENT_KIND[planned.label.ownerKind],
      klasa: 'etykieta',
      z: z++,
      obrys: {
        ksztalt: 'prostokat',
        x: planned.rect.x,
        y: planned.rect.y,
        width: planned.rect.width,
        height: planned.rect.height,
      },
      obszar: expandRectToMinHit(planned.rect, scale),
    });
  });

  resultMarkers.forEach((marker) => {
    if (ukryte?.has(marker.testId)) return;
    areas.push({
      testId: marker.testId,
      ownerRef: marker.ownerRef,
      elementKind: undefined,
      klasa: 'znacznik-wyniku',
      z: z++,
      obrys: { ksztalt: 'prostokat', x: marker.x, y: marker.y, width: marker.width, height: marker.height },
      obszar: expandRectToMinHit(marker, scale),
    });
  });

  return areas;
}

// ---------------------------------------------------------------------------
// Rozstrzyganie trafienia
// ---------------------------------------------------------------------------

function wProstokacie(shape: HitRectShape, x: number, y: number): boolean {
  return x >= shape.x && x <= shape.x + shape.width && y >= shape.y && y <= shape.y + shape.height;
}

/** Kwadrat odległości punktu od odcinka [a,b]. */
function kwadratOdleglosciOdOdcinka(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const dlugoscKw = dx * dx + dy * dy;
  if (dlugoscKw === 0) {
    const ex = px - ax;
    const ey = py - ay;
    return ex * ex + ey * ey;
  }
  let t = ((px - ax) * dx + (py - ay) * dy) / dlugoscKw;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const rx = px - (ax + t * dx);
  const ry = py - (ay + t * dy);
  return rx * rx + ry * ry;
}

function naLamanej(shape: HitPolylineShape, x: number, y: number): boolean {
  const r = shape.halfWidth;
  const rKw = r * r;
  for (let i = 1; i < shape.points.length; i += 1) {
    const a = shape.points[i - 1];
    const b = shape.points[i];
    if (kwadratOdleglosciOdOdcinka(a.x, a.y, b.x, b.y, x, y) <= rKw) return true;
  }
  return false;
}

export function pointInHitShape(shape: HitShape, x: number, y: number): boolean {
  return shape.ksztalt === 'prostokat' ? wProstokacie(shape, x, y) : naLamanej(shape, x, y);
}

/** Prostokąt otaczający kształt trafienia (indeks przestrzenny sondy). */
export function hitShapeBbox(shape: HitShape): V3Rect {
  if (shape.ksztalt === 'prostokat') {
    return { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of shape.points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return {
    x: minX - shape.halfWidth,
    y: minY - shape.halfWidth,
    width: maxX - minX + 2 * shape.halfWidth,
    height: maxY - minY + 2 * shape.halfWidth,
  };
}

/**
 * Obiekt trafiony punktem `(x, y)` — DWA PRZEBIEGI, dokładnie jak przeglądarka
 * na drzewie DOM budowanym przez `SldCanvasV3` (patrz nagłówek):
 *  1. obrysy rysunku (najwyższy w kolejności malowania wygrywa),
 *  2. dopiero potem obszary rozszerzone (znów najwyższy).
 * `null` = tło arkusza.
 */
export function pickCanvasHitArea(
  areas: readonly CanvasHitArea[],
  x: number,
  y: number,
): CanvasHitArea | null {
  let trafionyObrys: CanvasHitArea | null = null;
  for (const area of areas) {
    if (pointInHitShape(area.obrys, x, y) && (trafionyObrys === null || area.z > trafionyObrys.z)) {
      trafionyObrys = area;
    }
  }
  if (trafionyObrys) return trafionyObrys;
  let trafionyObszar: CanvasHitArea | null = null;
  for (const area of areas) {
    if (pointInHitShape(area.obszar, x, y) && (trafionyObszar === null || area.z > trafionyObszar.z)) {
      trafionyObszar = area;
    }
  }
  return trafionyObszar;
}

// ---------------------------------------------------------------------------
// ODCZYT Z DRZEWA DOM — druga, NIEZALEŻNA strona kontraktu
// ---------------------------------------------------------------------------
//
// Sonda odbioru nie może pytać modelu, czy model jest zgodny z modelem. Dlatego
// czyta obszary trafienia z FAKTYCZNIE WYRENDEROWANEGO drzewa (`SldCanvasV3`
// przepuszczony przez `renderToStaticMarkup`), a oczekiwanie liczy ze SCENY.
// Obiekt, któremu render nie dał uchwytu (dokładnie przypadek etykiet przed tą
// kartą), po prostu NIE ISTNIEJE w zbiorze odczytanym z DOM — i każdy klik nad
// nim jest chybieniem, nie „niezmierzonym przypadkiem".

/** Nazwy atrybutów kanału audytu trafień (jedno miejsce dla renderu i sondy). */
export const HIT_ATTR = {
  for: 'data-hit-for',
  role: 'data-hit-role',
  klasa: 'data-hit-klasa',
  ownerRef: 'data-hit-owner-ref',
} as const;

/** Minimalny kontrakt węzła drzewa, którego potrzebuje odczyt — pozwala czytać
 *  zarówno `Element` przeglądarki/jsdom, jak i dowolną strukturę zgodną. */
export interface HitDomNode {
  readonly tagName: string;
  getAttribute(name: string): string | null;
  readonly parentNode: HitDomNode | null;
  querySelectorAll(selector: string): ArrayLike<HitDomNode>;
}

/** Efektywna wartość `pointer-events` — najbliższy przodek (lub sam węzeł) z
 *  jawnym atrybutem wygrywa (własność DZIEDZICZONA, dokładnie jak w CSS/SVG).
 *  Brak deklaracji w całej gałęzi = domyślne `visiblePainted` (węzeł ŁAPIE). */
export function effectivePointerEvents(node: HitDomNode): string {
  let current: HitDomNode | null = node;
  while (current) {
    const value = current.getAttribute?.('pointer-events');
    if (value) return value;
    current = current.parentNode;
  }
  return 'visiblePainted';
}

function parsePolylineD(d: string): RouteVertex[] {
  const points: RouteVertex[] = [];
  for (const match of d.matchAll(/[ML]\s*(-?[\d.]+)[,\s]+(-?[\d.]+)/g)) {
    points.push({ x: Number(match[1]), y: Number(match[2]) });
  }
  return points;
}

function shapeFromNode(node: HitDomNode): HitShape | null {
  const tag = node.tagName.toLowerCase();
  if (tag === 'rect') {
    const x = Number(node.getAttribute('x'));
    const y = Number(node.getAttribute('y'));
    const width = Number(node.getAttribute('width'));
    const height = Number(node.getAttribute('height'));
    if (![x, y, width, height].every(Number.isFinite)) return null;
    return { ksztalt: 'prostokat', x, y, width, height };
  }
  if (tag === 'path') {
    const points = parsePolylineD(node.getAttribute('d') ?? '');
    const strokeWidth = Number(node.getAttribute('stroke-width'));
    if (points.length < 2 || !Number.isFinite(strokeWidth)) return null;
    return { ksztalt: 'lamana', points, halfWidth: strokeWidth / 2 };
  }
  return null;
}

/**
 * Obszary trafienia ODCZYTANE Z DRZEWA renderu. Kolejność wynika z kolejności
 * dokumentu (= kolejności malowania), więc `pickCanvasHitArea` na tym zbiorze
 * rozstrzyga dokładnie tak, jak zrobiłaby to przeglądarka.
 *
 * Węzeł bez pary (sam obrys albo sam obszar) jest zwracany z brakującym
 * kształtem zastąpionym tym, który istnieje — dzięki temu niekompletny render
 * NIE udaje poprawnego, tylko wychodzi w pomiarze rozmiaru (`ponizejMinimum`).
 */
export function hitAreasFromDom(root: HitDomNode): readonly CanvasHitArea[] {
  const wgTestId = new Map<string, { obrys?: HitShape; obszar?: HitShape; ownerRef?: string; klasa?: string; z: number }>();
  const wezly = root.querySelectorAll(`[${HIT_ATTR.for}]`);
  for (let i = 0; i < wezly.length; i += 1) {
    const node = wezly[i];
    const testId = node.getAttribute(HIT_ATTR.for);
    if (!testId) continue;
    if (effectivePointerEvents(node) === 'none') continue;
    const shape = shapeFromNode(node);
    if (!shape) continue;
    const rola = node.getAttribute(HIT_ATTR.role) === 'obrys' ? 'obrys' : 'obszar';
    const wpis = wgTestId.get(testId) ?? { z: i };
    wpis[rola] = shape;
    wpis.z = i;
    wpis.ownerRef = node.getAttribute(HIT_ATTR.ownerRef) ?? wpis.ownerRef;
    wpis.klasa = node.getAttribute(HIT_ATTR.klasa) ?? wpis.klasa;
    wgTestId.set(testId, wpis);
  }
  const areas: CanvasHitArea[] = [];
  for (const [testId, wpis] of wgTestId) {
    const obrys = wpis.obrys ?? wpis.obszar;
    const obszar = wpis.obszar ?? wpis.obrys;
    if (!obrys || !obszar) continue;
    areas.push({
      testId,
      ownerRef: wpis.ownerRef ?? undefined,
      elementKind: undefined,
      klasa: (HIT_OBJECT_CLASSES.includes(wpis.klasa as HitObjectClass) ? wpis.klasa : 'aparat') as HitObjectClass,
      z: wpis.z,
      obrys,
      obszar,
    });
  }
  areas.sort((a, b) => a.z - b.z);
  return areas;
}

/**
 * Sprawdzenie NIEZMIENNIKA WARSTW: wszystkie węzły roli `obszar` (rozszerzenie
 * do minimum ekranowego) leżą w drzewie PRZED wszystkimi węzłami roli `obrys`
 * (ślad rysunku). Tylko przy tym porządku przeglądarka rozstrzyga trafienie tak
 * samo jak `pickCanvasHitArea` (najpierw obrys, potem rozszerzenie) — bez niego
 * poszerzony cel symbolu znów zjadałby kliki w szynę pod nim.
 * `null` = warstwa pusta (brak którejkolwiek roli), więc nie ma czego naruszyć.
 */
export function hitLayerOrderingInDom(root: HitDomNode): {
  readonly maksZObszaru: number;
  readonly minZObrysu: number;
  readonly poprawna: boolean;
} | null {
  const wezly = root.querySelectorAll(`[${HIT_ATTR.for}]`);
  let maksZObszaru = -1;
  let minZObrysu = Number.POSITIVE_INFINITY;
  for (let i = 0; i < wezly.length; i += 1) {
    const rola = wezly[i].getAttribute(HIT_ATTR.role);
    if (rola === 'obszar') maksZObszaru = Math.max(maksZObszaru, i);
    else if (rola === 'obrys') minZObrysu = Math.min(minZObrysu, i);
  }
  if (maksZObszaru < 0 || !Number.isFinite(minZObrysu)) return null;
  return { maksZObszaru, minZObrysu, poprawna: maksZObszaru < minZObrysu };
}

/**
 * Węzły, które ŁAPIĄ kliki, a nie są zadeklarowanym uchwytem obiektu — czyli
 * kandydaci na „klik znika w napisie". Kontrakt kanwy v3: cały RYSUNEK jest
 * bierny (`pointer-events="none"` na korzeniu), a łapie wyłącznie warstwa
 * trafień. Każdy wyjątek od tej reguły jest naruszeniem i musi wyjść w sondzie.
 */
export function pointerBlockersInDom(root: HitDomNode): readonly string[] {
  const naruszenia: string[] = [];
  const wszystkie = root.querySelectorAll('*');
  for (let i = 0; i < wszystkie.length; i += 1) {
    const node = wszystkie[i];
    if (node.getAttribute(HIT_ATTR.for)) continue;
    const tag = node.tagName.toLowerCase();
    // Grupy/definicje same z siebie nic nie malują — łapie wyłącznie kształt
    // i tekst. `animate` (SMIL) nie ma geometrii.
    if (tag === 'g' || tag === 'svg' || tag === 'defs' || tag === 'animate' || tag === 'title' || tag === 'desc') continue;
    if (effectivePointerEvents(node) === 'none') continue;
    naruszenia.push(`${tag}[${node.getAttribute('data-testid') ?? '—'}]`);
  }
  return naruszenia;
}

// ---------------------------------------------------------------------------
// SONDA SIATKOWA (kryterium odbioru karty S9-4)
// ---------------------------------------------------------------------------

/** Krok siatki klików [jednostki świata]. 1 j.św. gwarantuje, że każdy tor
 *  (najcieńszy rysowany obrys to 1,2 j.św. — `SEGMENT_STROKE_WIDTH.lv`) dostaje
 *  próbki: przy kroku większym niż grubość kreski cienki tor wypadał z pomiaru
 *  i sonda mierzyłaby wyłącznie symbole (dokładnie ta klasa defektu, którą
 *  audyt nazwał „aparaty rysowane kreską są niekilkalne"). */
export const SONDA_KROK_SIATKI = 1;

/** Ile próbek maksymalnie z jednego obiektu (rozłożonych równomiernie po jego
 *  obrysie). Ogranicza koszt sondy bez utraty reprezentacji: wielkie szyny nie
 *  zdominują statystyki kosztem 687 aparatów pola. */
export const SONDA_MAKS_PROBEK_NA_OBIEKT = 12;

export interface SondaKlasaStat {
  readonly klasa: HitObjectClass;
  readonly obiektow: number;
  readonly probek: number;
  readonly trafionych: number;
  /** Obiekty tej klasy, których obszar trafienia jest mniejszy niż minimum. */
  readonly ponizejMinimum: number;
}

export interface SondaChybienie {
  readonly x: number;
  readonly y: number;
  readonly oczekiwanyTestId: string;
  readonly otrzymanyTestId: string | null;
  readonly klasa: HitObjectClass;
}

export interface SondaTrafienWynik {
  readonly probek: number;
  readonly trafionych: number;
  /** Udział trafień [0..1]; `1` dla pustej sceny (nie ma czego chybić). */
  readonly skutecznosc: number;
  /** Obiekty, których obszar trafienia nie osiąga `MIN_HIT_SCREEN_PX`. */
  readonly ponizejMinimum: readonly { readonly testId: string; readonly ekranPx: number }[];
  readonly wgKlas: readonly SondaKlasaStat[];
  readonly chybienia: readonly SondaChybienie[];
}

/** Najmniejszy wymiar obszaru trafienia obiektu wyrażony w pikselach EKRANU. */
export function hitAreaScreenSize(area: CanvasHitArea, scale: number): number {
  const s = bezpiecznaSkala(scale);
  if (area.obszar.ksztalt === 'prostokat') {
    return Math.min(area.obszar.width, area.obszar.height) * s;
  }
  return 2 * area.obszar.halfWidth * s;
}

/** Prosty indeks kubełkowy po prostokątach otaczających — sonda odpytuje setki
 *  tysięcy punktów, przegląd liniowy 2,5 tys. obiektów byłby kwadratowy. */
class IndeksKubelkowy {
  private readonly kubelki = new Map<string, CanvasHitArea[]>();

  constructor(
    private readonly bok: number,
    areas: readonly CanvasHitArea[],
    ksztalt: (area: CanvasHitArea) => HitShape,
  ) {
    for (const area of areas) {
      const bbox = hitShapeBbox(ksztalt(area));
      const x0 = Math.floor(bbox.x / bok);
      const x1 = Math.floor((bbox.x + bbox.width) / bok);
      const y0 = Math.floor(bbox.y / bok);
      const y1 = Math.floor((bbox.y + bbox.height) / bok);
      for (let gx = x0; gx <= x1; gx += 1) {
        for (let gy = y0; gy <= y1; gy += 1) {
          const key = `${gx}|${gy}`;
          const bucket = this.kubelki.get(key);
          if (bucket) bucket.push(area);
          else this.kubelki.set(key, [area]);
        }
      }
    }
  }

  kandydaci(x: number, y: number): readonly CanvasHitArea[] {
    return this.kubelki.get(`${Math.floor(x / this.bok)}|${Math.floor(y / this.bok)}`) ?? [];
  }
}

/** Punkty siatki GLOBALNEJ (krok `krok`, zaczepiona w 0) leżące w obrysie. */
function probkiObrysu(area: CanvasHitArea, krok: number, maks: number): readonly RouteVertex[] {
  const bbox = hitShapeBbox(area.obrys);
  const x0 = Math.ceil(bbox.x / krok) * krok;
  const y0 = Math.ceil(bbox.y / krok) * krok;
  const kandydaci: RouteVertex[] = [];
  for (let y = y0; y <= bbox.y + bbox.height; y += krok) {
    for (let x = x0; x <= bbox.x + bbox.width; x += krok) {
      if (pointInHitShape(area.obrys, x, y)) kandydaci.push({ x, y });
    }
  }
  if (kandydaci.length <= maks) return kandydaci;
  const wybrane: RouteVertex[] = [];
  for (let i = 0; i < maks; i += 1) {
    wybrane.push(kandydaci[Math.floor((i * (kandydaci.length - 1)) / (maks - 1))]);
  }
  return wybrane;
}

/**
 * SONDA SIATKOWA — kryterium odbioru karty S9-4.
 *
 * Metoda (dwa NIEZALEŻNE źródła, inaczej sonda pytałaby modelu o model):
 *
 *  - OCZEKIWANIE liczone ze SCENY (`oczekiwane` = `buildCanvasHitAreas`): po
 *    każdym obiekcie przechodzi siatka punktów o kroku `SONDA_KROK_SIATKI`
 *    (siatka GLOBALNA, zaczepiona w początku arkusza — punkt wspólny dwóch
 *    obrysów jest JEDNYM punktem, nie dwoma). Obiektem oczekiwanym jest ten,
 *    którego OBRYS RYSUNKU zawiera punkt; przy nałożeniu — malowany najwyżej
 *    (tak czyta rysunek człowiek: symbol leży NA szynie, więc klik należy do
 *    symbolu).
 *  - WYNIK rozstrzygany na zbiorze `trafiane` — w odbiorze ODCZYTANYM Z DRZEWA
 *    renderu (`hitAreasFromDom`). Obiekt, któremu render nie dał uchwytu, nie
 *    ma tam wpisu, więc KAŻDY klik nad nim jest chybieniem. To jest ta różnica,
 *    dzięki której sonda gryzie (etykiety przed tą kartą: 0 uchwytów).
 *
 * Chybienie = punkt, w którym wynik nie jest obiektem oczekiwanym — niezależnie
 * od przyczyny (brak uchwytu, kradzież kliku przez rozszerzenie sąsiada, zła
 * kolejność malowania, napis łapiący zdarzenie).
 */
export function sondaSiatkowaTrafien(
  oczekiwane: readonly CanvasHitArea[],
  opcje: {
    readonly scale: number;
    /** Zbiór rozstrzygający trafienie. Domyślnie ten sam co oczekiwany — wtedy
     *  sonda mierzy WYŁĄCZNIE spójność samego modelu (przydatne w testach
     *  jednostkowych geometrii); odbiór podaje tu zbiór z DRZEWA renderu. */
    readonly trafiane?: readonly CanvasHitArea[];
    readonly krok?: number;
    readonly maksProbekNaObiekt?: number;
    readonly maksChybienWRaporcie?: number;
    /** Próg rozmiaru celu [px ekranu]. Domyślnie `MIN_HIT_SCREEN_PX` (pomiar
     *  „czy kod dotrzymuje własnej obietnicy"). Skrypt ODBIORU podaje tu próg
     *  KARTY jako liczbę — bramka nie może mierzyć się stałą, którą pilnuje:
     *  obniżenie `MIN_HIT_SCREEN_PX` obniżyłoby wtedy i cel, i miarę, więc
     *  iniekcja regresji przechodziłaby na zielono (sprawdzone: przechodziła). */
    readonly minEkranPx?: number;
  },
): SondaTrafienWynik {
  const krok = opcje.krok ?? SONDA_KROK_SIATKI;
  const maks = opcje.maksProbekNaObiekt ?? SONDA_MAKS_PROBEK_NA_OBIEKT;
  const maksChybien = opcje.maksChybienWRaporcie ?? 12;
  const minEkranPx = opcje.minEkranPx ?? MIN_HIT_SCREEN_PX;
  const trafiane = opcje.trafiane ?? oczekiwane;
  const indeksOczekiwan = new IndeksKubelkowy(64, oczekiwane, (a) => a.obrys);
  const indeksObrysow = new IndeksKubelkowy(64, trafiane, (a) => a.obrys);
  const indeksObszarow = new IndeksKubelkowy(64, trafiane, (a) => a.obszar);

  const statystyki = new Map<HitObjectClass, { obiektow: number; probek: number; trafionych: number; ponizejMinimum: number }>();
  for (const klasa of HIT_OBJECT_CLASSES) {
    statystyki.set(klasa, { obiektow: 0, probek: 0, trafionych: 0, ponizejMinimum: 0 });
  }
  // Rozmiar mierzy się na tym, co NAPRAWDĘ jest w drzewie — obiekt bez uchwytu
  // ma rozmiar 0 px, a nie „taki, jaki by miał, gdyby był".
  const wgTestId = new Map(trafiane.map((a) => [a.testId, a]));
  const ponizejMinimum: { testId: string; ekranPx: number }[] = [];
  const chybienia: SondaChybienie[] = [];
  let probek = 0;
  let trafionych = 0;

  for (const area of oczekiwane) {
    const stat = statystyki.get(area.klasa);
    if (stat) stat.obiektow += 1;
    const wDrzewie = wgTestId.get(area.testId);
    const ekranPx = wDrzewie ? hitAreaScreenSize(wDrzewie, opcje.scale) : 0;
    // Tolerancja 1e-9: `24/scale*scale` bywa 23,999999999999996 w IEEE 754.
    if (ekranPx + 1e-9 < minEkranPx) {
      ponizejMinimum.push({ testId: area.testId, ekranPx });
      if (stat) stat.ponizejMinimum += 1;
    }
    for (const punkt of probkiObrysu(area, krok, maks)) {
      // Oczekiwanie: najwyżej malowany obrys SCENY zawierający punkt.
      let oczekiwany: CanvasHitArea = area;
      for (const kandydat of indeksOczekiwan.kandydaci(punkt.x, punkt.y)) {
        if (kandydat.z > oczekiwany.z && pointInHitShape(kandydat.obrys, punkt.x, punkt.y)) {
          oczekiwany = kandydat;
        }
      }
      // Wynik: dwa przebiegi na kandydatach z indeksu (identyczne z
      // `pickCanvasHitArea`, tylko bez przeglądu liniowego).
      let wynik: CanvasHitArea | null = null;
      for (const kandydat of indeksObrysow.kandydaci(punkt.x, punkt.y)) {
        if (pointInHitShape(kandydat.obrys, punkt.x, punkt.y) && (wynik === null || kandydat.z > wynik.z)) {
          wynik = kandydat;
        }
      }
      if (wynik === null) {
        for (const kandydat of indeksObszarow.kandydaci(punkt.x, punkt.y)) {
          if (pointInHitShape(kandydat.obszar, punkt.x, punkt.y) && (wynik === null || kandydat.z > wynik.z)) {
            wynik = kandydat;
          }
        }
      }
      probek += 1;
      const statOczekiwanego = statystyki.get(oczekiwany.klasa);
      if (statOczekiwanego) statOczekiwanego.probek += 1;
      if (wynik !== null && wynik.testId === oczekiwany.testId) {
        trafionych += 1;
        if (statOczekiwanego) statOczekiwanego.trafionych += 1;
      } else if (chybienia.length < maksChybien) {
        chybienia.push({
          x: punkt.x,
          y: punkt.y,
          oczekiwanyTestId: oczekiwany.testId,
          otrzymanyTestId: wynik?.testId ?? null,
          klasa: oczekiwany.klasa,
        });
      }
    }
  }

  return {
    probek,
    trafionych,
    skutecznosc: probek === 0 ? 1 : trafionych / probek,
    ponizejMinimum,
    wgKlas: HIT_OBJECT_CLASSES.map((klasa) => {
      const s = statystyki.get(klasa)!;
      return {
        klasa,
        obiektow: s.obiektow,
        probek: s.probek,
        trafionych: s.trafionych,
        ponizejMinimum: s.ponizejMinimum,
      };
    }),
    chybienia,
  };
}
