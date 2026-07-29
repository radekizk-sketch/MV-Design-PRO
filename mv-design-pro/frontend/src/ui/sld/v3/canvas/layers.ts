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
  | 'resultOverlays'
  | 'resultLabels';

export const CANVAS_LAYER_IDS: readonly CanvasLayerId[] = [
  'stationsApparatus',
  'derSources',
  'protectionAnnotations',
  'labels',
  'resultOverlays',
  'resultLabels',
];

export const CANVAS_LAYER_LABELS_PL: Readonly<Record<CanvasLayerId, string>> = {
  stationsApparatus: 'Stacje i aparatura',
  derSources: 'Źródła i układy PV/BESS/FW',
  protectionAnnotations: 'Zabezpieczenia i adnotacje',
  labels: 'Etykiety',
  resultOverlays: 'Nakładki wyników',
  // W4 (§8): opcjonalna warstwa LICZBOWYCH etykiet wynikowych (U przy węzłach,
  // obciążenie przęseł, S/straty TR, P/Q generacji, Ik″/Ith przy węzłach).
  // Odrębny przełącznik od „Nakładki wyników" (strzałki/badge) — użytkownik
  // włącza liczby niezależnie od strzałek (spec §18 podwarstwy L2-D wyniki).
  resultLabels: 'Etykiety wyników (liczby)',
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

// ---------------------------------------------------------------------------
// W5 (RECENZJA_L2_POLA_WYPOSAZENIE_2026-07 §18 „Podwarstwy L2", P1) —
// przełączalne PODWARSTWY L2 jako GRUPY istniejących warstw renderu v3 (reużycie
// mechanizmu `CanvasLayerVisibility`, dyrektywa właściciela 7 „reużycie zamiast
// duplikacji"). Podwarstwa = WIDOCZNOŚĆ (filtr renderu, `SldCanvasV3.tsx`), NIE
// layout: `buildSceneV3`/`layout`/`compose` NIETKNIĘTE, geometria/bbox/kotwica
// stacji identyczne w KAŻDYM stanie podwarstw (§18 „tożsamość i kotwica stacji
// niezmienne"; test bajt-inwariancji `workspacePanels.test.tsx`). Recenzja
// definiuje cztery podwarstwy — mapowanie 1:1 na warstwy renderu:
//   L2-A aparatura pierwotna    → stacje/aparatura + źródła DER (tor główny)
//   L2-B pomiary + zabezpieczenia → adnotacje zabezpieczeń/pomiarów
//   L2-C dane katalogowe (opisy)  → etykiety techniczne (typ/przekrój/długość…)
//   L2-D wyniki                   → nakładki + liczbowe etykiety wyników
// Użytkownik włącza dowolne kombinacje: master-toggle podwarstwy ustawia
// WSZYSTKICH jej członków; per-warstwowe checkboxy pozostają (granularność).
// ---------------------------------------------------------------------------

/** Podwarstwy L2 (spec §18, W5) — jawny, zamknięty zestaw. */
export type L2SublayerId = 'L2A' | 'L2B' | 'L2C' | 'L2D';

export const L2_SUBLAYER_IDS: readonly L2SublayerId[] = ['L2A', 'L2B', 'L2C', 'L2D'];

export const L2_SUBLAYER_LABELS_PL: Readonly<Record<L2SublayerId, string>> = {
  L2A: 'L2-A · aparatura pierwotna',
  L2B: 'L2-B · pomiary i zabezpieczenia',
  L2C: 'L2-C · dane katalogowe',
  L2D: 'L2-D · wyniki',
};

/** Warstwy renderu wchodzące w skład każdej podwarstwy L2 (spec §18). Suma
 *  pokrywa DOKŁADNIE `CANVAS_LAYER_IDS` bez powtórzeń (wyrocznia
 *  `layers.test.ts` — kompletność i rozłączność). */
export const L2_SUBLAYER_MEMBERS: Readonly<Record<L2SublayerId, readonly CanvasLayerId[]>> = {
  L2A: ['stationsApparatus', 'derSources'],
  L2B: ['protectionAnnotations'],
  L2C: ['labels'],
  L2D: ['resultOverlays', 'resultLabels'],
};

/** Stan zbiorczy podwarstwy: `'on'` gdy WSZYSCY członkowie widoczni, `'off'`
 *  gdy WSZYSCY ukryci, `'mixed'` gdy część (master-checkbox indeterminate). */
export function l2SublayerState(
  visibility: CanvasLayerVisibility | undefined,
  sublayer: L2SublayerId,
): 'on' | 'off' | 'mixed' {
  const members = L2_SUBLAYER_MEMBERS[sublayer];
  const visibleCount = members.filter((layerId) => (visibility?.[layerId] ?? true) !== false).length;
  if (visibleCount === members.length) return 'on';
  if (visibleCount === 0) return 'off';
  return 'mixed';
}

/** Nowa mapa widoczności po przełączeniu master-toggle podwarstwy: `'mixed'`/
 *  `'off'` → wszyscy członkowie widoczni; `'on'` → wszyscy ukryci (klasyczna
 *  logika tri-state master). Czysta funkcja (zwraca NOWY obiekt). */
export function toggleL2Sublayer(
  visibility: CanvasLayerVisibility,
  sublayer: L2SublayerId,
): CanvasLayerVisibility {
  const turnOff = l2SublayerState(visibility, sublayer) === 'on';
  const next: Record<CanvasLayerId, boolean> = { ...visibility } as Record<CanvasLayerId, boolean>;
  for (const layerId of L2_SUBLAYER_MEMBERS[sublayer]) {
    next[layerId] = !turnOff;
  }
  return next;
}
