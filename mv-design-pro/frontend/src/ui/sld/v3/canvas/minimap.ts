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
 * TĄ SAMĄ funkcją `buildSceneV3(snapshot)` co kanwa (czysta, memoizowana na
 * snapshot — wzorzec `buildEnergizationOverlay`/`buildFlowOverlayForSnapshot`
 * w `SldCanvasV3Workspace.tsx`).
 *
 * ---------------------------------------------------------------------------
 * INTERAKCJA WYŁĄCZNIE NA KAMERZE (§0.1)
 * ---------------------------------------------------------------------------
 * Klik/przeciągnięcie w minimapie produkuje PUNKT ŚWIATA, który wołający
 * podaje kamerze jako akcję `'center'` (`camera.ts`) — czysta translacja
 * `viewBox` przy niezmienionej skali. Minimapa NIE zmienia sceny ani
 * skali; jej jedynym wyjściem jest współrzędna.
 *
 * ---------------------------------------------------------------------------
 * ŚWIAT KAMERY A ŚWIAT MINIMAPY (przesunięcie o margines arkusza)
 * ---------------------------------------------------------------------------
 * Jedna scena (karta SLD-SKALA-I-NAWIGACJA R1/R7): minimapa i kanwa rysują TĘ
 * SAMĄ scenę. Kamera liczy jednak `viewBox` w układzie arkusza, w którym treść
 * sceny jest przesunięta o margines ramki (`sceneBoxToCameraWorld`), a minimapa
 * — w układzie sceny. Mapowanie między nimi to czyste PRZESUNIĘCIE (ten sam
 * rozmiar świata): `cameraSceneBbox` to prostokąt sceny w układzie kamery.
 * Dawna normalizacja proporcji między bboxami światów per poziom szczegółu
 * zniknęła razem z tymi światami. `minimapPointToWorld` jest dokładną
 * odwrotnością `worldRectToMinimap`.
 *
 * Wszystko tu jest CZYSTĄ funkcją bez DOM/React — testowalne bez renderu
 * (P7 determinizm: te same wejścia = ten sam wynik, zero `Date`/losowości).
 */
import type { V3Rect } from '../core/grid';
import { gabarytSymbolu } from '../symbols/blokZabezpieczen';
import type { SceneV3 } from '../scene/buildScene';
import { prostokatElementuWScenie } from './viewAnchor';

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
    // Gabaryt z jednego źródła: blok zabezpieczeń pola = cała ramka (`gabarytSymbolu`).
    const g = gabarytSymbolu(symbol);
    const topLeft = projectPoint(projection, g.x, g.y);
    shapes.push({
      kind: 'symbol',
      rect: {
        x: topLeft.x,
        y: topLeft.y,
        // Minimalny ślad 1,5 px: element sieci, który po zrzutowaniu ma
        // ułamek piksela, MUSI zostać widoczny jako punkt orientacyjny —
        // inaczej nawigator gubi stacje, po których użytkownik nawiguje.
        width: Math.max(1.5, g.width * projection.scale),
        height: Math.max(1.5, g.height * projection.scale),
      },
    });
  }
  // Stacje (w tym GPZ) — obrys całego rysunku stacji z TEJ SAMEJ sceny, którą
  // rysuje kanwa (`prostokatElementuWScenie`: symbole, odcinki i etykiety
  // należące do stacji). Jedna scena niezależna od skali (karta
  // SLD-SKALA-I-NAWIGACJA, R1/R7) — nawigator nie ma osobnej sceny przeglądu.
  for (const ref of scene.meta.drawnStationIds) {
    const box = prostokatElementuWScenie(scene, ref);
    if (!box) continue;
    const topLeft = projectPoint(projection, box.minX, box.minY);
    shapes.push({
      kind: 'station',
      rect: {
        x: topLeft.x,
        y: topLeft.y,
        width: Math.max(1.5, (box.maxX - box.minX) * projection.scale),
        height: Math.max(1.5, (box.maxY - box.minY) * projection.scale),
      },
    });
  }
  return shapes;
}

/**
 * Prostokąt KADRU KAMERY na minimapie. `cameraWorldRect` to widoczny wycinek
 * świata kamery (dokładnie to, co niesie `viewBox` kanwy —
 * `camera.ts::cameraViewBox`), `cameraSceneBbox` to prostokąt sceny w świecie
 * kamery (przesunięty o margines arkusza). Wynik jest w pikselach panelu; może
 * wystawać poza panel (kadr szerszy niż sieć przy pełnym oddaleniu) — rysunek bierze część
 * wspólną z panelem (`ramkaWPanelu`), a liczby kadru zostają nieprzycięte w atrybutach.
 */
export function worldRectToMinimap(
  cameraWorldRect: V3Rect,
  cameraSceneBbox: V3Rect,
  projection: MinimapProjection,
): MinimapRect {
  const bbox0 = projection.worldBbox;
  const topLeft = projectPoint(
    projection,
    cameraWorldRect.x - cameraSceneBbox.x + bbox0.x,
    cameraWorldRect.y - cameraSceneBbox.y + bbox0.y,
  );
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: cameraWorldRect.width * projection.scale,
    height: cameraWorldRect.height * projection.scale,
  };
}

/** Grubość obrysu ramki kadru w nawigatorze [px panelu]. */
export const GRUBOSC_RAMKI_NAWIGATORA = 1.5;

/**
 * Karta SLD-SKALA-I-NAWIGACJA R7: ramka kadru RYSOWANA w nawigatorze — część wspólna kadru
 * (`worldRectToMinimap`, liczbowo prawdziwa, może wystawać) z panelem, cofnięta o pół obrysu, żeby
 * każdy bok ramki był widoczny w panelu. Przycięcie przez `clipPath` ucinało obrys po stronie
 * wystającej (ramka „wychodziła” poza panel bez krawędzi). Prawdziwe położenie kamery zostaje
 * w atrybutach `data-frame-*` (e2e `sld-minimapa`).
 *
 * B-02 2026-11-13 (P0-01): ramka ma ZAWSZE cztery krawędzie. Bok krótszy niż
 * `MIN_BOK_RAMKI_NAWIGATORA` (kadr bardzo mały albo całkiem poza schematem) rozszerza się do
 * tego minimum wokół swojego środka przyciętego do panelu — kadr poza schematem pokazuje się
 * jako mała ramka przy krawędzi panelu po stronie kamery, nie znika.
 */
export const MIN_BOK_RAMKI_NAWIGATORA = 6;

function bokWPanelu(od: number, dlugosc: number, panel: number): readonly [number, number] {
  const pol = GRUBOSC_RAMKI_NAWIGATORA / 2;
  const lo = pol;
  const hi = panel - pol;
  let s = Math.min(hi, Math.max(lo, od));
  let e = Math.min(hi, Math.max(lo, od + dlugosc));
  const min = Math.min(MIN_BOK_RAMKI_NAWIGATORA, hi - lo);
  if (e - s < min) {
    const srodek = Math.min(hi - min / 2, Math.max(lo + min / 2, (s + e) / 2));
    s = srodek - min / 2;
    e = srodek + min / 2;
  }
  return [s, e];
}

export function ramkaWPanelu(frame: MinimapRect, projection: MinimapProjection): MinimapRect {
  const [x0, x1] = bokWPanelu(frame.x, frame.width, projection.width);
  const [y0, y1] = bokWPanelu(frame.y, frame.height, projection.height);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** Czy kadr ma część wspólną z panelem (kadr całkiem poza schematem — nie). */
export function kadrPrzecinaPanel(frame: MinimapRect, projection: MinimapProjection): boolean {
  return frame.x < projection.width && frame.x + frame.width > 0 && frame.y < projection.height && frame.y + frame.height > 0;
}

/**
 * ODWROTNOŚĆ `worldRectToMinimap` dla punktu: punkt panelu → punkt świata
 * kamery (ten, w którym kamera liczy `viewBox`). To jedyne wyjście minimapy do
 * kamery — wołający podaje wynik jako `{ type: 'center' }`.
 */
export function minimapPointToWorld(
  point: MinimapPoint,
  cameraSceneBbox: V3Rect,
  projection: MinimapProjection,
): MinimapPoint {
  const bbox0 = projection.worldBbox;
  return {
    x: (point.x - projection.offsetX) / projection.scale - bbox0.x + cameraSceneBbox.x,
    y: (point.y - projection.offsetY) / projection.scale - bbox0.y + cameraSceneBbox.y,
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
