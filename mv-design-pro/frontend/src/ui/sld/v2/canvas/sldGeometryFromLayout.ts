/**
 * sldGeometryFromLayout — most między JEDNĄ prawdą geometrii (LayoutEngine) a
 * propsami rendererów `SldCanvasV2`. Migracja §4 kontraktu geometrii: pozycje
 * węzłów (stacje/GPZ) i geometria krawędzi (cable runs) pochodzą z `LayoutResult`
 * (drzewo + porty), NIE ze slotów (`Y_RUN_BASE`, `X_STATIONS_START + j×pitch`).
 *
 * @see docs/sld/SLD_GEOMETRY_CONTRACT_V1.md §1 (kontrakt), §4 (migracja bez „drugiej prawdy")
 *
 * Ten moduł NIE liczy pozycji — czyta `buildPortAnchoredGeometryFromENM` (warstwa
 * odczytu V-07) i NAKŁADA wynik na istniejące, bogate propsy rendererów (które
 * niosą symbole/etykiety/role — pozostają nienaruszone). Override jest ŁAGODNY:
 * gdy silnik nie zwrócił geometrii dla danego ref (np. stacja-sierota poza
 * drzewem), props zachowuje swoją dotychczasową pozycję → render nie pęka.
 *
 * Konwencje kotwic rendererów (z `NodeGeometry` = top-left + width/height):
 *  - Stacja (`StationOnRunRenderer`) kotwiczy ŚRODKIEM szyny → mapujemy środek.
 *  - GPZ (`GpzRenderer`/`GpzCanonicalRenderer`) kotwiczy lewym-górnym → mapujemy
 *    pozycję węzła (top-left).
 *  - Cable run (`CableRunRenderer`) rysuje `pathPoints` port→port — bierzemy
 *    polyline krawędzi z silnika (końce zakotwiczone w realnych portach, V-07).
 */

import type { EnergyNetworkModel } from '../../../../types/enm';
import {
  buildPortAnchoredGeometryFromENM,
  type LayoutFrame,
  type NodeGeometry,
  type PortAnchoredGeometry,
} from '../geometry';

/** Punkt geometrii (world-space) — kształt zgodny z `pathPoints`. */
export interface LayoutPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Indeks geometrii z silnika, gotowy do nałożenia na propsy rendererów.
 * `nodeByRef` = węzły L0 (stacje/GPZ/branch-points) po `ref`. Krawędzie są w
 * `geometry.edges` (port→port) i służą bramce spójności + testom zakotwiczenia.
 */
export interface SldLayoutGeometry {
  /** Surowa warstwa odczytu (jedna prawda) — krawędzie + porty + bbox. */
  readonly geometry: PortAnchoredGeometry;
  /** Węzeł L0 po ref obiektu (stacja/GPZ/branch-point). */
  readonly nodeByRef: ReadonlyMap<string, NodeGeometry>;
}

/** Środek bloku węzła (układ świata po auto-fit). Stacja kotwiczy środkiem szyny. */
export function nodeCenter(node: NodeGeometry): LayoutPoint {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}

/**
 * Zbuduj indeks geometrii z ENM. Woła warstwę odczytu (LayoutEngine → port-anchored)
 * i indeksuje węzły L0 + krawędzie po segmencie. `frame` opcjonalnie steruje
 * auto-fit (≥75% kadru). Zwraca `null` gdy tryb niedostępny (geo = dług) lub brak
 * węzłów — wtedy adapter zachowuje pozycje slotowe (render działa).
 */
export function buildSldLayoutGeometry(
  snapshot: EnergyNetworkModel,
  snapshotId: string,
  frame?: LayoutFrame,
): SldLayoutGeometry | null {
  let geometry: PortAnchoredGeometry;
  try {
    geometry = buildPortAnchoredGeometryFromENM(
      snapshot,
      snapshotId,
      'topological',
      undefined,
      frame ? { frame } : undefined,
    );
  } catch {
    // Silnik/czytnik topologii nie poradził sobie z tym ENM (np. niekompletny,
    // graniczny snapshot). NIE wywracamy renderu — wracamy do pozycji slotowych
    // (override pominięty). Lepszy działający (stary) render niż brak renderu.
    return null;
  }
  if (geometry.layout.unavailable || geometry.layout.nodes.length === 0) {
    return null;
  }

  // BRAMKA spójności: override nakładamy TYLKO gdy silnik zbudował REALNE drzewo
  // (≥1 krawędź port→port). Bez krawędzi (np. stacje zadeklarowane, ale nie
  // powiązane szynami → sieć rozspójniona) layout daje tylko sieroty — wtedy
  // pozostawiamy całą geometrię slotową (render działa, stary kontrakt). To
  // gwarantuje, że pozycje węzłów i geometria krawędzi pochodzą z TEJ SAMEJ,
  // spójnej kalkulacji — bez mieszania (część layout, część slot).
  if (geometry.edges.length === 0) {
    return null;
  }

  // Indeks węzłów L0 (korzenie hierarchii = stacje/GPZ/branch-points).
  const nodeByRef = new Map<string, NodeGeometry>();
  for (const node of geometry.layout.nodes) {
    nodeByRef.set(node.ref, node);
  }

  return { geometry, nodeByRef };
}

/**
 * Nałóż pozycje z silnika na propsy stacji (środek bloku). Stacje spoza drzewa
 * (brak węzła) zachowują pozycję slotową. Czysta funkcja — zwraca nową tablicę.
 */
export function applyLayoutToStations<T extends { id: string; x: number; y: number }>(
  stations: readonly T[],
  layout: SldLayoutGeometry,
): T[] {
  return stations.map((station) => {
    const node = layout.nodeByRef.get(station.id);
    if (!node) return station;
    const c = nodeCenter(node);
    return { ...station, x: c.x, y: c.y };
  });
}

/**
 * Nałóż pozycje z silnika na propsy GPZ (top-left węzła — konwencja GpzRenderer).
 * GPZ to korzeń drzewa; gdy silnik nie zwrócił węzła, zachowaj pozycję slotową.
 */
export function applyLayoutToGpzs<T extends { id: string; x: number; y: number }>(
  gpzs: readonly T[],
  layout: SldLayoutGeometry,
): T[] {
  return gpzs.map((gpz) => {
    const node = layout.nodeByRef.get(gpz.id);
    if (!node) return gpz;
    return { ...gpz, x: node.x, y: node.y };
  });
}

/**
 * Cable runs: NIE nakładamy geometrii krawędzi z silnika wprost (sklejanie
 * polyline per-segment dla wielostacyjnego ciągu dawało plątaninę — nieciągłość
 * na każdej stacji pośredniej). Zamiast tego adapter PRZEBUDOWUJE cable-runs po
 * przesunięciu stacji: `buildCableRuns` wyprowadza trasę z `station.x/y` (oraz
 * głowic pól), więc kable podążają za stacjami-drzewa istniejącą, działającą
 * logiką routingu i kończą NA stacjach (zero wiszących). Pełny per-segment
 * routing/wariant w układzie drzewa = B-02 owner.
 */
