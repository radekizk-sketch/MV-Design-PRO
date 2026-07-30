/**
 * SLD V3 — MINIMAPA (nawigator kanwy), K11-B §0.1.
 *
 * Dyrektywa właściciela z oceny ekranu 2/10: „stały, mały podgląd CAŁEJ sieci
 * z prostokątem bieżącego kadru kamery; klik/przeciągnięcie w minimapie
 * przenosi kadr".
 *
 * ---------------------------------------------------------------------------
 * ZERO DRUGIEJ PRAWDY GEOMETRII (§0.1)
 * ---------------------------------------------------------------------------
 * Minimapa jest PROJEKCJĄ tej samej `SceneV3`, którą rysuje kanwa — nie ma
 * własnego modelu rysunku, nie czyta ENM, nie liczy layoutu. Bierze scenę
 * poziomu NAJZGRUBSZEGO (LOD 0 — stacje jako mini-RMU, magistrala, laterale;
 * 83 symbole/126 odcinków na sieci referencyjnej wobec 765/690 na LOD 2) i
 * rzutuje bboxy jej elementów na prostokąty i linie. Wołający buduje tę scenę
 * TĄ SAMĄ funkcją `buildSceneV3(snapshot, 0)` co kanwa (czysta, memoizowana na
 * snapshot — wzorzec `buildEnergizationOverlay`/`buildFlowOverlayForSnapshot`
 * w `SldCanvasV3Workspace.tsx`).
 *
 * ---------------------------------------------------------------------------
 * INTERAKCJA WYŁĄCZNIE NA KAMERZE (§0.1)
 * ---------------------------------------------------------------------------
 * Klik/przeciągnięcie w minimapie produkuje PUNKT ŚWIATA, który wołający
 * podaje kamerze jako akcję `'center'` (`camera.ts`) — czysta translacja
 * `viewBox` przy niezmienionej skali. Minimapa NIE zmienia sceny, LOD-u ani
 * skali; jej jedynym wyjściem jest współrzędna.
 *
 * ---------------------------------------------------------------------------
 * MOSTEK MIĘDZY ŚWIATAMI LOD (dlaczego normalizacja, a nie tożsamość)
 * ---------------------------------------------------------------------------
 * Kadr kamery żyje w świecie AKTUALNEGO LOD, a minimapa rysuje świat LOD 0 —
 * a światy per-LOD mają WŁASNE bboxy (osobne rezerwacje, spec §7; na sieci
 * referencyjnej szerokości są równe co do piksela, ale wysokości już nie:
 * 3411 na L0 wobec 3489 na L1/L2). Prostokąt kadru mapujemy więc przez
 * NORMALIZACJĘ bbox→bbox (ta sama zasada proporcji, na której stoi
 * `refScaleFor`/`applyLodScaleMapping` w `camera.ts`): pozycja względna w
 * świecie źródłowym = pozycja względna w świecie docelowym. Dla świata
 * tożsamego mapowanie jest tożsamością (zero błędu), dla różniących się —
 * deterministyczne i odwracalne (`minimapPointToWorld` jest dokładną
 * odwrotnością `worldRectToMinimap` dla tego samego LOD).
 *
 * Wszystko tu jest CZYSTĄ funkcją bez DOM/React — testowalne bez renderu
 * (P7 determinizm: te same wejścia = ten sam wynik, zero `Date`/losowości).
 */
import type { V3Rect } from '../core/grid';
import { SYMBOL_DEFS } from '../symbols/defs';
import type { SceneV3 } from '../scene/buildScene';

/** Prostokąt w układzie MINIMAPY (piksele panelu, początek w jej lewym górnym rogu). */
export interface MinimapRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface MinimapPoint {
  readonly x: number;
  readonly y: number;
}

/** Uproszczony kształt sceny na minimapie. `station` (glif zbiorczy stacji) i
 *  `trunk` (magistrala) są wyróżnione — to szkielet orientacyjny nawigatora;
 *  reszta rysuje się jednolicie, bez próby oddania szczegółu (który na kilku
 *  pikselach byłby nieczytelny — ta sama zasada co próg `MIN_SYMBOL_SCREEN_PX`). */
export type MinimapShapeKind = 'station' | 'symbol' | 'trunk' | 'branch';

export interface MinimapSymbolShape {
  readonly kind: 'station' | 'symbol';
  readonly rect: MinimapRect;
}

export interface MinimapSegmentShape {
  readonly kind: 'trunk' | 'branch';
  readonly points: readonly MinimapPoint[];
}

export type MinimapShape = MinimapSymbolShape | MinimapSegmentShape;

/**
 * Rzutowanie świata sceny na prostokąt panelu minimapy: JEDNOLITA skala obu
 * osi (rysunek sieci nie może być rozciągnięty — proporcje magistrali i
 * odgałęzień niosą informację o układzie) + wyśrodkowanie treści w panelu.
 */
export interface MinimapProjection {
  /** Rozmiar panelu [px]. */
  readonly width: number;
  readonly height: number;
  /** Skala świat→panel (ta sama dla X i Y). */
  readonly scale: number;
  /** Przesunięcie po wyśrodkowaniu [px]. */
  readonly offsetX: number;
  readonly offsetY: number;
  /** bbox świata LOD 0, z którego liczono rzut. */
  readonly worldBbox: V3Rect;
}

/** Domyślna szerokość panelu minimapy [px] — mieści sieć referencyjną
 *  (14352×3411, proporcja 4,2:1) bez zabierania kanwie miejsca. */
export const MINIMAP_DEFAULT_WIDTH = 260;
/** Granice wysokości panelu: sieć bardzo płaska nie może zdegenerować się do
 *  paska, bardzo wysoka — do słupa zasłaniającego schemat. */
export const MINIMAP_MIN_HEIGHT = 56;
export const MINIMAP_MAX_HEIGHT = 180;

/**
 * Rzut sceny LOD 0 na panel o zadanej szerokości; wysokość WYPROWADZONA z
 * proporcji sieci (przycięta do granic wyżej), żeby panel nie miał pustych
 * pasów. bbox zdegenerowany (zerowa szerokość/wysokość — pusty projekt) ⇒
 * `null`: nawigator bez treści nie jest rysowany (uczciwy stan zerowy).
 */
export function minimapProjectionOf(
  sceneBbox: V3Rect,
  panelWidth: number = MINIMAP_DEFAULT_WIDTH,
): MinimapProjection | null {
  if (!(sceneBbox.width > 0) || !(sceneBbox.height > 0) || !(panelWidth > 0)) return null;
  const aspectHeight = (panelWidth * sceneBbox.height) / sceneBbox.width;
  const height = Math.min(MINIMAP_MAX_HEIGHT, Math.max(MINIMAP_MIN_HEIGHT, aspectHeight));
  const scale = Math.min(panelWidth / sceneBbox.width, height / sceneBbox.height);
  return {
    width: panelWidth,
    height,
    scale,
    offsetX: (panelWidth - sceneBbox.width * scale) / 2,
    offsetY: (height - sceneBbox.height * scale) / 2,
    worldBbox: sceneBbox,
  };
}

function projectPoint(projection: MinimapProjection, x: number, y: number): MinimapPoint {
  return {
    x: (x - projection.worldBbox.x) * projection.scale + projection.offsetX,
    y: (y - projection.worldBbox.y) * projection.scale + projection.offsetY,
  };
}

/**
 * Kształty minimapy z REALNEJ sceny (zero fabrykacji: rysujemy dokładnie te
 * elementy, które scena niesie — nic nie dokładamy i niczego nie dopowiadamy).
 * Kolejność wynikowa = kolejność sceny (determinizm renderu).
 */
export function minimapShapesOf(scene: SceneV3, projection: MinimapProjection): readonly MinimapShape[] {
  const shapes: MinimapShape[] = [];
  for (const segment of scene.segments) {
    if (segment.points.length < 2) continue;
    shapes.push({
      kind: segment.meta?.kind === 'snTrunk' || segment.meta?.kind === 'busGpz' ? 'trunk' : 'branch',
      points: segment.points.map((p) => projectPoint(projection, p.x, p.y)),
    });
  }
  for (const symbol of scene.symbols) {
    const def = SYMBOL_DEFS[symbol.symbolId];
    const topLeft = projectPoint(projection, symbol.x, symbol.y);
    shapes.push({
      kind: symbol.symbolId === 'stationCollapsed' ? 'station' : 'symbol',
      rect: {
        x: topLeft.x,
        y: topLeft.y,
        // Minimalny ślad 1,5 px: element sieci, który po zrzutowaniu ma
        // ułamek piksela, MUSI zostać widoczny jako punkt orientacyjny —
        // inaczej nawigator gubi stacje, po których użytkownik nawiguje.
        width: Math.max(1.5, def.width * projection.scale),
        height: Math.max(1.5, def.height * projection.scale),
      },
    });
  }
  return shapes;
}

/** Normalizacja pozycji względnej między bboxami dwóch światów LOD (patrz
 *  nagłówek „MOSTEK MIĘDZY ŚWIATAMI LOD"). */
function renormalize(value: number, from: { readonly start: number; readonly size: number }, to: { readonly start: number; readonly size: number }): number {
  if (!(from.size > 0) || !(to.size > 0)) return value;
  return to.start + ((value - from.start) / from.size) * to.size;
}

/**
 * Prostokąt KADRU KAMERY na minimapie. `cameraWorldRect` to widoczny wycinek
 * świata AKTUALNEGO LOD (dokładnie to, co niesie `viewBox` kanwy —
 * `camera.ts::cameraViewBox`), `cameraSceneBbox` to bbox świata tego LOD.
 * Wynik jest w pikselach panelu; może wystawać poza panel (kadr szerszy niż
 * sieć przy pełnym oddaleniu) — wołający przycina go `clipPath`, bo obcięcie
 * liczbowe kłamałoby o położeniu kamery.
 */
export function worldRectToMinimap(
  cameraWorldRect: V3Rect,
  cameraSceneBbox: V3Rect,
  projection: MinimapProjection,
): MinimapRect {
  const bbox0 = projection.worldBbox;
  const x0 = renormalize(cameraWorldRect.x, { start: cameraSceneBbox.x, size: cameraSceneBbox.width }, { start: bbox0.x, size: bbox0.width });
  const y0 = renormalize(cameraWorldRect.y, { start: cameraSceneBbox.y, size: cameraSceneBbox.height }, { start: bbox0.y, size: bbox0.height });
  const widthRatio = cameraSceneBbox.width > 0 ? bbox0.width / cameraSceneBbox.width : 1;
  const heightRatio = cameraSceneBbox.height > 0 ? bbox0.height / cameraSceneBbox.height : 1;
  const topLeft = projectPoint(projection, x0, y0);
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: cameraWorldRect.width * widthRatio * projection.scale,
    height: cameraWorldRect.height * heightRatio * projection.scale,
  };
}

/**
 * ODWROTNOŚĆ `worldRectToMinimap` dla punktu: punkt panelu → punkt świata
 * AKTUALNEGO LOD (ten, w którym kamera liczy `viewBox`). To jedyne wyjście
 * minimapy do kamery — wołający podaje wynik jako `{ type: 'center' }`.
 */
export function minimapPointToWorld(
  point: MinimapPoint,
  cameraSceneBbox: V3Rect,
  projection: MinimapProjection,
): MinimapPoint {
  const bbox0 = projection.worldBbox;
  const world0X = (point.x - projection.offsetX) / projection.scale + bbox0.x;
  const world0Y = (point.y - projection.offsetY) / projection.scale + bbox0.y;
  return {
    x: renormalize(world0X, { start: bbox0.x, size: bbox0.width }, { start: cameraSceneBbox.x, size: cameraSceneBbox.width }),
    y: renormalize(world0Y, { start: bbox0.y, size: bbox0.height }, { start: cameraSceneBbox.y, size: cameraSceneBbox.height }),
  };
}

/** `viewBox` kanwy („x y w h") → prostokąt świata. Zwraca `null` dla wartości
 *  niepełnej/niepoliczalnej (viewport 0×0 przed pierwszym pomiarem układu) —
 *  brak pomiaru nie jest dowodem położenia kamery. */
export function parseCameraViewBox(viewBox: string): V3Rect | null {
  const parts = viewBox.trim().split(/\s+/).map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [x, y, width, height] = parts;
  if (!(width > 0) || !(height > 0)) return null;
  return { x, y, width, height };
}
