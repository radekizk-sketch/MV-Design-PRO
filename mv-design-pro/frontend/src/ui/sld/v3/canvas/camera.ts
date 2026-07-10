/**
 * SLD V3 F6b — kamera kanwy: pan/zoom/pinch + wybór LOD progami zoomu
 * (SLD_CAD_SPEC_V3 §7 „Kontrakt LOD"; REBUILD_PLAN_V3 F6b). Czysty stan +
 * czyste funkcje (reducer) — bez DOM, testowalne bez renderu.
 *
 * ---------------------------------------------------------------------------
 * REUSE v2 (import, NIE kopia — spec §8 „kamera+safe-viewport (Step 7)
 * ZOSTAJE"):
 * ---------------------------------------------------------------------------
 * `v2/viewport/ViewportController.ts` jest CZYSTĄ, generyczną matematyką
 * (`ViewportTransform`/`BoundingBox`, bez typów domenowych v2) — importowana
 * tu bezpośrednio: `zoomToCursor`, `pan`, `fitToView`, `screenToWorld`,
 * `MIN_SCALE`/`MAX_SCALE`. Zero duplikacji.
 *
 * ---------------------------------------------------------------------------
 * WŁASNA CZĘŚĆ v3 (STOP-notatka zbadania, patrz raport F6b) — v2 NIE MA:
 * ---------------------------------------------------------------------------
 *  (a) eksportowanego hooka kamery — cała obsługa wheel/pointer jest wklejona
 *      WEWNĄTRZ `SldCanvasV2.tsx` (2800 linii, `useState`+ręczne handlery),
 *      nieimportowalna bez skopiowania komponentu; `canvas/SldCanvasV3.tsx`
 *      pisze WŁASNE, minimalne wiring pointer/wheel (React), wołające
 *      WYŁĄCZNIE reużytą matematykę niżej;
 *  (b) ŻADNEJ obsługi pinch/touch (grep `TouchEvent|touches\[|pointerType`
 *      w całym `v2/` = zero trafień) — zbudowana od zera w
 *      `canvas/SldCanvasV3.tsx` (Pointer Events, generycznie mysz+dotyk+pen);
 *  (c) `LodPolicy.createLodController` jest typowany na 5 poziomów
 *      (`LodLevel = 0..4`) z progami dopasowanymi do 5-poziomowej taksonomii
 *      ELEMENTÓW v2 (`mini_block_overview`/`gpz_switchgear`/… —
 *      `LodPolicy.ts`), NIE do 3-poziomowego kontraktu spec §7 (L0/L1/L2).
 *      Wymuszenie mapowania 5→3 poziomów byłoby hackiem (utrata znaczenia
 *      progów), nie reuse — poniżej WŁASNA, minimalna histereza 3-poziomowa,
 *      bez debounce/`Date.now()` (P7: histereza marginesem wystarcza, żeby
 *      nie migotać na granicy progu — nadmiarowy stan czasowy nie jest
 *      potrzebny do spełnienia wymogu „nie migocze").
 */
import {
  fitToView,
  pan as panTransform,
  screenToWorld,
  zoomToCursor,
  MIN_SCALE,
  MAX_SCALE,
  IDENTITY_TRANSFORM,
  type ViewportTransform,
  type BoundingBox,
} from '../../v2/viewport/ViewportController';
import type { V3Rect } from '../core/grid';
import type { SceneLod } from '../scene/buildScene';

export { MIN_SCALE, MAX_SCALE, IDENTITY_TRANSFORM };
export type { ViewportTransform, BoundingBox };

// ---------------------------------------------------------------------------
// LOD progi + histereza (WŁASNE, patrz nagłówek — decyzja (c)).
// ---------------------------------------------------------------------------

export interface LodThresholds {
  /** Poniżej tego scale: L0. */
  readonly l0Max: number;
  /** Poniżej tego scale (i >= l0Max): L1. Powyżej: L2. */
  readonly l1Max: number;
}

/**
 * Progi zoomu L0/L1/L2 — DECYZJA WŁASNA F6b: spec §7 nie podaje liczb dla
 * kontraktu 3-poziomowego („progi jak dziś" odnosi się do 5-poziomowej
 * polityki v2, `LodPolicy.LOD_ZOOM_THRESHOLDS`, niekompatybilnej — patrz
 * nagłówek). Wybrane jako przybliżone środki geometryczne przedziałów v2
 * (LOD_1_MAX=0.7 i LOD_2_MAX=1.5 „zlepione" do dwóch progów obejmujących
 * odpowiednik L0=„topologia" / L1=„obiekty" / L2=„pełny szczegół" tej
 * taksonomii) — do kalibracji wizualnej przy render-odbiorze F7, nie
 * wyrocznia CI.
 */
export const DEFAULT_LOD_THRESHOLDS: LodThresholds = { l0Max: 0.4, l1Max: 1.2 };

/** Margines histerezy (spec §7 „przełączanie progami kamery, histereza"). */
export const LOD_HYSTERESIS_MARGIN = 0.15;

/** Klasyfikacja BEZ histerezy (użyta tylko dla stanu POCZĄTKOWEGO kamery —
 *  brak „obecnego" LOD do porównania, nic do zabezpieczenia histerezą). */
export function lodFromScale(scale: number, thresholds: LodThresholds = DEFAULT_LOD_THRESHOLDS): SceneLod {
  if (scale < thresholds.l0Max) return 0;
  if (scale < thresholds.l1Max) return 1;
  return 2;
}

/**
 * Klasyfikacja Z histerezą: zmiana LOD tylko gdy scale przekroczy próg
 * granicy OBECNEGO poziomu razy `(1±margin)` — zapobiega migotaniu przy
 * scale drgającym wokół progu (spec §7). Krokowa (0↔1↔2), nie przeskakuje
 * poziomu bez przejścia przez pośredni próg, nawet przy dużym skoku scale w
 * jednej aktualizacji (np. duży flick kółka/pinch) — deterministyczne,
 * niezależne od historii poza `currentLod`.
 */
export function lodFromScaleWithHysteresis(
  scale: number,
  currentLod: SceneLod,
  thresholds: LodThresholds = DEFAULT_LOD_THRESHOLDS,
  margin: number = LOD_HYSTERESIS_MARGIN,
): SceneLod {
  let lod = currentLod;
  while (lod < 2) {
    const upper = lod === 0 ? thresholds.l0Max : thresholds.l1Max;
    if (scale >= upper * (1 + margin)) lod = (lod + 1) as SceneLod;
    else break;
  }
  while (lod > 0) {
    const lower = lod === 1 ? thresholds.l0Max : thresholds.l1Max;
    if (scale <= lower * (1 - margin)) lod = (lod - 1) as SceneLod;
    else break;
  }
  return lod;
}

// ---------------------------------------------------------------------------
// Stan kamery + reducer (czysty — testowalny bez DOM/React).
// ---------------------------------------------------------------------------

/** Mostek typów: `SceneV3.bbox` jest `V3Rect` (x/y/width/height, `core/grid.ts`),
 *  `ViewportController` (v2, reużyty) oczekuje `BoundingBox` (minX/minY/maxX/
 *  maxY) — czysta konwersja, zero geometrii domenowej. */
export function boundingBoxOfRect(rect: V3Rect): BoundingBox {
  return { minX: rect.x, minY: rect.y, maxX: rect.x + rect.width, maxY: rect.y + rect.height };
}

export interface CameraState {
  readonly transform: ViewportTransform;
  readonly lod: SceneLod;
}

export type CameraAction =
  | { readonly type: 'zoom'; readonly cursor: { readonly x: number; readonly y: number }; readonly factor: number }
  | { readonly type: 'pan'; readonly delta: { readonly x: number; readonly y: number } };

export function cameraReducer(state: CameraState, action: CameraAction): CameraState {
  const transform =
    action.type === 'zoom'
      ? zoomToCursor(state.transform, action.cursor, action.factor)
      : panTransform(state.transform, action.delta);
  const lod = lodFromScaleWithHysteresis(transform.scale, state.lod);
  return { transform, lod };
}

/** Stan początkowy kamery: dopasowany do bbox (spec „widok sieci" domyślnie
 *  w całości widoczny), LOD klasyfikowany bez histerezy (brak wcześniejszego
 *  stanu do zabezpieczenia). */
export function computeInitialCameraState(
  bbox: BoundingBox,
  viewportSize: { readonly width: number; readonly height: number },
): CameraState {
  const transform = fitToView(bbox, viewportSize);
  return { transform, lod: lodFromScale(transform.scale) };
}

// ---------------------------------------------------------------------------
// Pinch (2 aktywne pointery) — geometria czysta, bez wiedzy o DOM/eventach.
// ---------------------------------------------------------------------------

export function pointerDistance(points: readonly [{ readonly x: number; readonly y: number }, { readonly x: number; readonly y: number }]): number {
  return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
}

export function pointerMidpoint(
  points: readonly [{ readonly x: number; readonly y: number }, { readonly x: number; readonly y: number }],
): { readonly x: number; readonly y: number } {
  return { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
}

// ---------------------------------------------------------------------------
// viewBox pochodny od transformu kamery (SVG-natywny sposób „przesuwania
// kamery" — bez dodatkowego `<g transform>` opakowującego całą scenę).
// ---------------------------------------------------------------------------

export function cameraViewBox(
  transform: ViewportTransform,
  viewportSize: { readonly width: number; readonly height: number },
): string {
  const topLeft = screenToWorld({ x: 0, y: 0 }, transform);
  const worldWidth = viewportSize.width / transform.scale;
  const worldHeight = viewportSize.height / transform.scale;
  return `${topLeft.x} ${topLeft.y} ${worldWidth} ${worldHeight}`;
}
