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
 *
 * ---------------------------------------------------------------------------
 * F8a — ROZSTRZYGNIĘCIE k4/k3 (REBUILD_PLAN_V3 §F8, SLD_V3_ACCEPTANCE.md §3):
 * ---------------------------------------------------------------------------
 *  (k4.1) `lodOverride` ustawiony ⇒ `SldCanvasV3` fituje do bboxa TEGO LOD
 *      (nie zawsze LOD2) — decyzja żyje w wołającym (który bbox przekazuje
 *      jako cel fitu), camera.ts jest agnostyczny na LOD celu fitu (zawsze
 *      przyjmował dowolny `bbox`; problem był tylko w tym, JAKI bbox
 *      wołający wybierał);
 *  (k4.2) przejścia LOD Z KAMERY (nie `lodOverride`) mapują skalę RAZ na
 *      przejście — `applyLodScaleMapping` niżej, wołane z `cameraReducer`
 *      gdy histereza zmienia `lod`;
 *  (k3) 'refit' (snapshot/cel fitu się zmienia = nowy świat, pan/zoom NIE
 *      zachowany) vs 'resize' (viewport się zmienia, świat ten sam — pan/zoom
 *      i skala ZACHOWANE, dostosowywany jest tylko punkt centrowania).
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
 *
 * F8a-2 — FIX-1 (recenzja Opusa, oscylacja LOD 0↔1 na zoomie produkcyjnym,
 * patrz `refScaleFor` niżej): te wartości są od tej dostawy progami w
 * PRZESTRZENI `refScale` (skala „jakby świat LOD2"), NIE surowej `scale`
 * kamery. Dla LOD2 `refScale === scale` (świat odniesienia = samego siebie)
 * — więc wizualnie NIC się nie zmienia dla kalibracji przy LOD2 wykonanej w
 * F7. Dla LOD0/LOD1 punkt przejścia w surowej skali kamery przesuwa się
 * (mnożnik `widthOf(LOD2)/widthOf(danego LOD)`) — to jest CEL naprawy: próg
 * przestaje być przywiązany do rozmiaru świata AKTUALNEGO poziomu, więc
 * `applyLodScaleMapping` (który zachowuje `refScale` z konstrukcji) nie może
 * już retriggerować przejścia w odwrotną stronę.
 */
export const DEFAULT_LOD_THRESHOLDS: LodThresholds = { l0Max: 0.4, l1Max: 1.2 };

/** Margines histerezy (spec §7 „przełączanie progami kamery, histereza"). */
export const LOD_HYSTERESIS_MARGIN = 0.15;

/** Klasyfikacja BEZ histerezy (użyta tylko dla stanu POCZĄTKOWEGO kamery —
 *  brak „obecnego" LOD do porównania, nic do zabezpieczenia histerezą).
 *  Przyjmuje SUROWĄ skalę (nie `refScale`) — stan startowy fituje bezpośrednio
 *  do bboxa CELU fitu (`lodOverride` albo domyślnie LOD2, patrz
 *  `computeInitialCameraState`/`SldCanvasV3` k4.1), więc surowa skala fitu
 *  JEST już `refScale` tego celu (ratio widthOf(cel)/widthOf(cel) = 1) —
 *  przeliczenie nie zmieniłoby wyniku, dodałoby tylko martwy kod. */
export function lodFromScale(scale: number, thresholds: LodThresholds = DEFAULT_LOD_THRESHOLDS): SceneLod {
  if (scale < thresholds.l0Max) return 0;
  if (scale < thresholds.l1Max) return 1;
  return 2;
}

/**
 * Klasyfikacja Z histerezą: zmiana LOD tylko gdy `refScale` przekroczy próg
 * granicy OBECNEGO poziomu razy `(1±margin)` — zapobiega migotaniu przy
 * skali drgającej wokół progu (spec §7). Krokowa (0↔1↔2), nie przeskakuje
 * poziomu bez przejścia przez pośredni próg, nawet przy dużym skoku w jednej
 * aktualizacji (np. duży flick kółka/pinch) — deterministyczne, niezależne
 * od historii poza `currentLod`.
 *
 * F8a-2 — FIX-1: parametr jest `refScale` (skala PRZELICZONA do przestrzeni
 * świata LOD2 przez wołającego, `refScaleFor` niżej), NIE surowa skala
 * kamery — jednostka jawna w nazwie, żeby wołający nie podał przez
 * pomyłkę `transform.scale` bezpośrednio (poprawne wołanie: `cameraReducer`
 * niżej). Sama funkcja jest agnostyczna na to, JAK policzono `refScale` —
 * czysta arytmetyka progów, bez zmiany logiki względem wersji surowo-skalowej.
 */
export function lodFromScaleWithHysteresis(
  refScale: number,
  currentLod: SceneLod,
  thresholds: LodThresholds = DEFAULT_LOD_THRESHOLDS,
  margin: number = LOD_HYSTERESIS_MARGIN,
): SceneLod {
  let lod = currentLod;
  while (lod < 2) {
    const upper = lod === 0 ? thresholds.l0Max : thresholds.l1Max;
    if (refScale >= upper * (1 + margin)) lod = (lod + 1) as SceneLod;
    else break;
  }
  while (lod > 0) {
    const lower = lod === 1 ? thresholds.l0Max : thresholds.l1Max;
    if (refScale <= lower * (1 - margin)) lod = (lod - 1) as SceneLod;
    else break;
  }
  return lod;
}

/**
 * F8a-2 — FIX-1: przelicza surową skalę kamery (natywną dla świata `lod`,
 * bo `applyLodScaleMapping` przelicza `transform.scale` przy KAŻDYM
 * przejściu tak, by pozostał natywny dla NOWEGO świata) do `refScale` —
 * skali w przestrzeni świata LOD2 (świat odniesienia — najszerszy/
 * najpełniejszy, ten, dla którego kalibrowano `DEFAULT_LOD_THRESHOLDS`,
 * patrz nagłówek wyżej). `refScale = scale * widthOf(lod) / widthOf(LOD2)`.
 *
 * Kluczowa własność (usuwa oscylację strukturalnie — diagnoza recenzji):
 * `applyLodScaleMapping` liczy `newScale = scale * widthOf(from) /
 * widthOf(to)`, więc `refScaleFor(newScale, to, …) = newScale *
 * widthOf(to)/widthOf(LOD2) = scale * widthOf(from)/widthOf(LOD2) =
 * refScaleFor(scale, from, …)` — `refScale` jest NIEZMIENNY w poprzek
 * przejścia LOD z konstrukcji. Histereza porównuje więc TĘ SAMĄ wartość
 * przed i po mapowaniu skali ⇒ mapowanie nie może retriggerować przejścia w
 * odwrotną stronę na następnym ticku, niezależnie od tego, jak bardzo światy
 * per-LOD różnią się szerokością (żadny clamp/pasmo specjalne nie jest
 * potrzebne).
 *
 * Fallback: bbox zdegenerowany (width<=0) dla `lod` lub dla LOD2 (np. stary
 * wołający, który nie dostarczył realnych `lodBboxes` — `computeInitialCameraState`
 * bez argumentu `lodBboxes` ustawia domyślnie TEN SAM bbox dla wszystkich
 * trzech poziomów, więc ratio=1 i to i tak nie zmienia wyniku) — brak
 * przeliczenia, zwraca surową skalę (zachowanie sprzed FIX-1).
 */
export function refScaleFor(
  scale: number,
  lod: SceneLod,
  lodBboxes: Readonly<Record<SceneLod, BoundingBox>>,
): number {
  const widthAtLod = lodBboxes[lod].maxX - lodBboxes[lod].minX;
  const widthAtRef = lodBboxes[2].maxX - lodBboxes[2].minX;
  if (widthAtLod <= 0 || widthAtRef <= 0) return scale;
  return scale * (widthAtLod / widthAtRef);
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

/**
 * F8a — ROZSTRZYGNIĘCIE k4.2/k3 (REBUILD_PLAN_V3 §F8, SLD_V3_ACCEPTANCE.md §3):
 * kamera niesie teraz WŁASNY `viewportSize` (potrzebny, by 'resize' i
 * mapowanie skali LOD mogły policzyć środek ekranu bez dodatkowego argumentu
 * z każdym dispatchem) oraz `lodBboxes` — bbox świata KAŻDEGO poziomu LOD
 * (światy L0/L1/L2 mają różne rozmiary, spec §7 „osobne rezerwacje" — patrz
 * `applyLodScaleMapping` niżej). Wołający (`SldCanvasV3`) dostarcza obie
 * wartości przy inicjalizacji i przy 'refit'/'resize'.
 */
export interface CameraState {
  readonly transform: ViewportTransform;
  readonly lod: SceneLod;
  readonly viewportSize: { readonly width: number; readonly height: number };
  readonly lodBboxes: Readonly<Record<SceneLod, BoundingBox>>;
}

export type CameraAction =
  | { readonly type: 'zoom'; readonly cursor: { readonly x: number; readonly y: number }; readonly factor: number }
  | { readonly type: 'pan'; readonly delta: { readonly x: number; readonly y: number } }
  /** k3: zmiana width/height PO MOUNCIE — zachowuje centrum świata i skalę,
   *  dostosowuje WYŁĄCZNIE viewport (patrz `applyResize`). */
  | { readonly type: 'resize'; readonly viewportSize: { readonly width: number; readonly height: number } }
  /** k3: zmiana snapshot (i k4.1: zmiana `lodOverride`, bo zmienia CEL fitu)
   *  — nowa sieć/nowy cel fitu = nowy świat kamery ⇒ pełny refit (pan/zoom
   *  użytkownika NIE jest zachowywany, w przeciwieństwie do 'resize'). */
  | {
      readonly type: 'refit';
      readonly bbox: BoundingBox;
      readonly lodBboxes: Readonly<Record<SceneLod, BoundingBox>>;
      readonly viewportSize: { readonly width: number; readonly height: number };
    };

/**
 * k4.2 — mapowanie skali przy przejściu LOD_a→LOD_b Z KAMERY (ścieżka
 * produkcyjna: zoom/pan zmienia `scale`, histereza przełącza LOD). Światy
 * LOD mają różne rozmiary (osobne rezerwacje §7) — bez korekty przełączenie
 * LOD dawałoby SKOK (ten sam obiekt świata nagle zajmuje inny % ekranu).
 *
 * Strategia (spójna, deterministyczna — jedna z dopuszczonych przez decyzję
 * F8a „np. proporcję szerokości"): stosujemy TĘ SAMĄ szerokość bboxa dla obu
 * osi (kamera ma jeden `scale`, nie scaleX/scaleY odrębnie — `ViewportTransform`
 * nie rozróżnia osi). `newScale = scale * (fromWidth / toWidth)`: gdy świat
 * DOCELOWEGO LOD jest SZERSZY (ten sam koncepcyjny obiekt zajmuje więcej
 * jednostek świata — wyższy LOD rezerwuje więcej miejsca na podpisy/aparaturę,
 * F6d/F5), skala się ZMNIEJSZA o tę samą proporcję, więc obiekt zachowuje
 * PODOBNY rozmiar na ekranie w momencie przejścia (brak skoku). Translacja
 * przeliczana tak, by punkt świata pod ŚRODKIEM viewportu (nie pod kursorem —
 * przejście LOD nie ma „kursora", to efekt zmiany scale, nie akcji
 * użytkownika) został pod środkiem po przeliczeniu. Stosowana RAZ na
 * dispatch (nawet gdy histereza przeskoczy przez pośredni poziom w jednym
 * wywołaniu, patrz `lodFromScaleWithHysteresis`) — czysta funkcja, zero
 * `Date.now()`/losowości (determinizm P7).
 */
export function applyLodScaleMapping(
  transform: ViewportTransform,
  fromBbox: BoundingBox,
  toBbox: BoundingBox,
  viewportSize: { readonly width: number; readonly height: number },
): ViewportTransform {
  const fromWidth = fromBbox.maxX - fromBbox.minX;
  const toWidth = toBbox.maxX - toBbox.minX;
  if (fromWidth <= 0 || toWidth <= 0) return transform;
  const ratio = fromWidth / toWidth;
  if (ratio === 1) return transform;
  const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, transform.scale * ratio));
  const center = { x: viewportSize.width / 2, y: viewportSize.height / 2 };
  const worldCenter = screenToWorld(center, transform);
  return {
    scale: newScale,
    translateX: center.x - worldCenter.x * newScale,
    translateY: center.y - worldCenter.y * newScale,
  };
}

/** k3 — 'resize': świat NIE zmienia się (ten sam snapshot/LOD), zmienia się
 *  tylko rozmiar viewportu (np. panel boczny otwarty/zamknięty). Zachowuje
 *  punkt świata pod STARYM środkiem viewportu pod NOWYM środkiem oraz skalę
 *  — użytkownik nie traci swojego pan/zoom, kanwa tylko „oddycha" wraz z
 *  rozmiarem kontenera. */
function applyResize(
  state: CameraState,
  nextViewportSize: { readonly width: number; readonly height: number },
): CameraState {
  const oldCenter = { x: state.viewportSize.width / 2, y: state.viewportSize.height / 2 };
  const worldCenter = screenToWorld(oldCenter, state.transform);
  const newCenter = { x: nextViewportSize.width / 2, y: nextViewportSize.height / 2 };
  const transform: ViewportTransform = {
    scale: state.transform.scale,
    translateX: newCenter.x - worldCenter.x * state.transform.scale,
    translateY: newCenter.y - worldCenter.y * state.transform.scale,
  };
  return { ...state, transform, viewportSize: nextViewportSize };
}

export function cameraReducer(state: CameraState, action: CameraAction): CameraState {
  if (action.type === 'resize') {
    return applyResize(state, action.viewportSize);
  }
  if (action.type === 'refit') {
    const transform = fitToView(action.bbox, action.viewportSize);
    return {
      transform,
      lod: lodFromScale(transform.scale),
      viewportSize: action.viewportSize,
      lodBboxes: action.lodBboxes,
    };
  }
  const transform =
    action.type === 'zoom'
      ? zoomToCursor(state.transform, action.cursor, action.factor)
      : panTransform(state.transform, action.delta);
  // F8a-2 — FIX-1: histereza porównuje `refScale` (przestrzeń świata LOD2),
  // NIE surową `transform.scale` (natywną dla świata `state.lod`) — patrz
  // `refScaleFor` wyżej. `transform.scale` jest tu jeszcze PRZED ewentualnym
  // mapowaniem LOD (natywna dla `state.lod`, bo `zoomToCursor`/`panTransform`
  // operują na transformie z poprzedniego ticku bez zmiany świata).
  const refScale = refScaleFor(transform.scale, state.lod, state.lodBboxes);
  const nextLod = lodFromScaleWithHysteresis(refScale, state.lod);
  if (nextLod === state.lod) {
    return { ...state, transform };
  }
  const mappedTransform = applyLodScaleMapping(
    transform,
    state.lodBboxes[state.lod],
    state.lodBboxes[nextLod],
    state.viewportSize,
  );
  return { ...state, transform: mappedTransform, lod: nextLod };
}

/** Stan początkowy kamery: dopasowany do `bbox` (cel fitu — patrz F8a k4.1 w
 *  `SldCanvasV3.tsx`: `lodOverride` ustawiony ⇒ wołający przekazuje bbox TEGO
 *  LOD, nie zawsze LOD2), LOD klasyfikowany bez histerezy (brak wcześniejszego
 *  stanu do zabezpieczenia). `lodBboxes` domyślnie = `bbox` dla wszystkich
 *  trzech poziomów (brak realnego mapowania skali, gdy wołający go nie
 *  dostarczy — zachowanie kompatybilne z wywołaniami sprzed F8a). */
export function computeInitialCameraState(
  bbox: BoundingBox,
  viewportSize: { readonly width: number; readonly height: number },
  lodBboxes?: Readonly<Record<SceneLod, BoundingBox>>,
): CameraState {
  const transform = fitToView(bbox, viewportSize);
  return {
    transform,
    lod: lodFromScale(transform.scale),
    viewportSize,
    lodBboxes: lodBboxes ?? { 0: bbox, 1: bbox, 2: bbox },
  };
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
