/**
 * F12-B (docs/execplans/SLD_CAD_REBUILD_PLAN_V3.md §F12, spec §10.1 ARCH-4 —
 * pozycja „LayerTogglePanel jako realny filtr widoczności kategorii elementów
 * sceny v3 — bez atrap"): JAWNY, zamknięty zestaw warstw v3, pochodny
 * WYŁĄCZNIE od tego, co `buildSceneV3` FAKTYCZNIE renderuje (`PreviewElementKind`/
 * `PreviewSegmentKind`, `compose/preview.tsx`) — NIE reużycie 13 warstw v2
 * (`v2/lod/layerToggle.ts`), które są sprzężone z `LodPolicy` v2 (5-poziomowa
 * taksonomia elementów, niekompatybilna z 3-poziomowym kontraktem LOD v3,
 * patrz `canvas/camera.ts` nagłówek decyzja (c)).
 *
 * Zakres filtra: WYŁĄCZNIE RENDER (mapowanie symbols/segments/labels na węzły
 * SVG w `SldCanvasV3.tsx`) — `buildSceneV3`/`layout`/`compose` NIETKNIĘTE,
 * scena (geometria/bbox/routing) jest identyczna niezależnie od
 * `layerVisibility`. Brak propa `layerVisibility` w `SldCanvasV3` = wszystko
 * widoczne (zero zmiany zachowania sprzed tej dostawy).
 *
 * Elementy BEZ przypisanej warstwy (`layerIdForSymbol`/`layerIdForSegment`
 * zwraca `null`) są ZAWSZE widoczne, niezależnie od `layerVisibility` — dot.
 * głównego toru mocy (`elementKind==='segment'`, kind sn/lv/leader): to
 * SZKIELET rysunku, nie kategoria do ukrycia (żadna z sześciu funkcji F12-B
 * nie wymaga jego filtrowania — poza zakresem tego zadania).
 */
import type { PreviewElementKind, PreviewElementMeta } from '../compose/preview';

/** Jawny, zamknięty zestaw warstw v3 (co najmniej 5 — spec §10.1 F12-B pkt 4). */
export type CanvasLayerId =
  | 'stationsApparatus'
  | 'derSources'
  | 'protectionAnnotations'
  | 'labels'
  | 'resultOverlays';

export const CANVAS_LAYER_IDS: readonly CanvasLayerId[] = [
  'stationsApparatus',
  'derSources',
  'protectionAnnotations',
  'labels',
  'resultOverlays',
];

export const CANVAS_LAYER_LABELS_PL: Readonly<Record<CanvasLayerId, string>> = {
  stationsApparatus: 'Stacje i aparatura',
  derSources: 'Źródła i układy PV/BESS/FW',
  protectionAnnotations: 'Zabezpieczenia i adnotacje',
  labels: 'Etykiety',
  resultOverlays: 'Nakładki wyników',
};

/** Mapa warstwa→widoczność. Brak wpisu (lub `undefined` cały obiekt) = warstwa
 *  widoczna (domyślne zachowanie — spec §10.1 „brak propa = wszystko widoczne"). */
export type CanvasLayerVisibility = Readonly<Partial<Record<CanvasLayerId, boolean>>>;

/** `elementKind` symboli sceny objętych warstwą 1 (spec §10.1 F12-B pkt 4:
 *  „stacje-i-aparatura: elementKind station/apparatus/transformer/bus"). */
const STATIONS_APPARATUS_KINDS: ReadonlySet<PreviewElementKind> = new Set([
  'station',
  'apparatus',
  'transformer',
  'bus',
]);

/** `elementKind` symboli sceny objętych warstwą 2 („źródła-DER: der/source"). */
const DER_SOURCES_KINDS: ReadonlySet<PreviewElementKind> = new Set(['der', 'source']);

/**
 * Warstwa docelowa symbolu/segmentu sceny — `null` = element ZAWSZE widoczny
 * (poza zakresem filtra, patrz nagłówek modułu: główny tor mocy
 * `elementKind==='segment'`).
 *
 * Kolejność sprawdzania: `protectionAnnotation` PRZED resztą — segmenty
 * `kind==='protectionTrip'|'measurementLink'` mają `elementKind:
 * 'protectionAnnotation'` (`scene/buildScene.ts` `segmentElementKind`
 * per `classifyStationSegmentKind`), więc sprawdzenie `elementKind` samo
 * wystarcza (żadna dodatkowa gałąź po `kind` nie jest potrzebna — spec §10.1
 * F12-B pkt 4 wymienia `kind` jawnie dla udokumentowania ŹRÓDŁA klasyfikacji,
 * nie jako osobny warunek).
 */
export function layerIdForElementMeta(meta: PreviewElementMeta | undefined): CanvasLayerId | null {
  const elementKind = meta?.elementKind;
  if (!elementKind) return null;
  if (elementKind === 'protectionAnnotation') return 'protectionAnnotations';
  if (STATIONS_APPARATUS_KINDS.has(elementKind)) return 'stationsApparatus';
  if (DER_SOURCES_KINDS.has(elementKind)) return 'derSources';
  return null;
}

/** `true` = element renderowalny pod bieżącym `layerVisibility` (spec §10.1:
 *  brak wpisu/propa = widoczny; `false` jawny = ukryty). */
export function isLayerVisible(
  layerId: CanvasLayerId | null,
  visibility: CanvasLayerVisibility | undefined,
): boolean {
  if (layerId === null) return true;
  if (!visibility) return true;
  const explicit = visibility[layerId];
  return explicit !== false;
}
