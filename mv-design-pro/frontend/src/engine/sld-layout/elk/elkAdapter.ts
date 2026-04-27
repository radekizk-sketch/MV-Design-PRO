/**
 * elkAdapter — convert SLD VisualGraph → ELK graph + back-mapping (Pakiet J).
 *
 * Powód: stabilny output (random seed = const), mniej skrzyżowań, standardowy
 * algorytm Sugiyama (audytowalny).
 *
 * KONTRAKT (binding):
 * - VisualGraphV1 → ElkGraph: nodes + edges + ports
 * - ElkGraph → coordinates map (po elk.layout(...)): backendowy ELK się
 *   wywołuje EXTERNAL — adapter nie wymaga elkjs jako runtime dep
 * - SLD-specific port placement:
 *     - GPZ busbar: porty SOUTH, index 1..N (pionowe zejścia pól)
 *     - Branch/station: porty WEST/EAST z rosnącym index
 *
 * DETERMINIZM:
 * - Sortowanie nodes po id ASC przed konwersją
 * - Sortowanie edges po id ASC
 * - Stałe wymiary węzłów (fixed size)
 * - Random seed = 1 (w elkLayoutOptions)
 */

import {
  ELK_GLOBAL_LAYOUT_OPTIONS,
  ELK_NODE_LAYOUT_OPTIONS,
  elkPortOptions,
} from './elkLayoutOptions';
import type { ElkPortSide } from './elkLayoutOptions';

// ============================================================================
// Domain types — wejście (subset of VisualGraphV1)
// ============================================================================

export interface VisualNodeInput {
  id: string;
  /** Stała szerokość węzła (px) */
  width: number;
  /** Stała wysokość węzła (px) */
  height: number;
  /** Porty (handles React Flow) */
  ports: ReadonlyArray<VisualPortInput>;
  /** Klasa elementu — wpływa na default port placement */
  kind: 'gpz_busbar' | 'station' | 'branch_node' | 'generic';
}

export interface VisualPortInput {
  /** Lokalne id portu (per-node unique) */
  id: string;
  /** Strona — opcjonalna (dla 'generic' wymagana) */
  side?: ElkPortSide;
  /** Index porządkowy — opcjonalny (sortowanie wg side dostarcza domyślny) */
  index?: number;
}

export interface VisualEdgeInput {
  id: string;
  source_node: string;
  source_port: string;
  target_node: string;
  target_port: string;
}

export interface VisualGraphInput {
  nodes: ReadonlyArray<VisualNodeInput>;
  edges: ReadonlyArray<VisualEdgeInput>;
}

// ============================================================================
// ELK output types (subset of ElkNode/ElkEdge)
// ============================================================================

export interface ElkPort {
  id: string;
  width: number;
  height: number;
  layoutOptions: Readonly<Record<string, string>>;
}

export interface ElkNode {
  id: string;
  width: number;
  height: number;
  layoutOptions: Readonly<Record<string, string>>;
  ports: ReadonlyArray<ElkPort>;
}

export interface ElkEdge {
  id: string;
  sources: ReadonlyArray<string>;
  targets: ReadonlyArray<string>;
}

export interface ElkGraph {
  id: string;
  layoutOptions: Readonly<Record<string, string>>;
  children: ReadonlyArray<ElkNode>;
  edges: ReadonlyArray<ElkEdge>;
}

/**
 * Default port placement per node kind (gdy port nie ma jawnego side).
 *
 * - gpz_busbar: SOUTH (pionowe zejścia pól)
 * - station: NORTH (wejście od trunku) + SOUTH (wyjścia LV)
 * - branch_node: WEST (wejście) + EAST (wyjścia)
 * - generic: wymaga jawnego side w port input
 */
function defaultPortSide(
  nodeKind: VisualNodeInput['kind'],
  portIdx: number,
  totalPorts: number,
): ElkPortSide {
  switch (nodeKind) {
    case 'gpz_busbar':
      return 'SOUTH';
    case 'station':
      // Pierwszy port = NORTH (wejście), reszta = SOUTH (wyjścia)
      return portIdx === 0 ? 'NORTH' : 'SOUTH';
    case 'branch_node':
      // Pierwszy port = WEST (wejście od trunku), pozostałe = EAST (gałęzie)
      return portIdx === 0 ? 'WEST' : 'EAST';
    case 'generic':
    default: {
      if (totalPorts <= 2) return portIdx === 0 ? 'WEST' : 'EAST';
      const sides: ElkPortSide[] = ['NORTH', 'EAST', 'SOUTH', 'WEST'];
      return sides[portIdx % 4];
    }
  }
}

/**
 * Konwertuje VisualGraphInput → ElkGraph (deterministycznie).
 * NIE wymaga elkjs runtime — output to plain JSON.
 */
export function toElkGraph(input: VisualGraphInput): ElkGraph {
  // Sortowanie nodes po id ASC (determinism)
  const sortedNodes = [...input.nodes].sort((a, b) => a.id.localeCompare(b.id));
  const sortedEdges = [...input.edges].sort((a, b) => a.id.localeCompare(b.id));

  const elkNodes: ElkNode[] = sortedNodes.map((node) => {
    const totalPorts = node.ports.length;
    const elkPorts: ElkPort[] = node.ports.map((port, idx) => {
      const side = port.side ?? defaultPortSide(node.kind, idx, totalPorts);
      const portIndex = port.index ?? idx;
      return {
        id: `${node.id}:${port.id}`,
        width: 1,
        height: 1,
        layoutOptions: elkPortOptions(side, portIndex),
      };
    });

    return {
      id: node.id,
      width: node.width,
      height: node.height,
      layoutOptions: ELK_NODE_LAYOUT_OPTIONS,
      ports: elkPorts,
    };
  });

  const elkEdges: ElkEdge[] = sortedEdges.map((edge) => ({
    id: edge.id,
    sources: [`${edge.source_node}:${edge.source_port}`],
    targets: [`${edge.target_node}:${edge.target_port}`],
  }));

  return {
    id: 'root',
    layoutOptions: ELK_GLOBAL_LAYOUT_OPTIONS,
    children: elkNodes,
    edges: elkEdges,
  };
}

// ============================================================================
// Back-mapping: ELK output → coordinates map
// ============================================================================

/**
 * Wynik layoutu ELK po wywołaniu elk.layout(graph).
 * Używamy minimalnego subsetu pól (x, y per node).
 */
export interface ElkLaidNode {
  id: string;
  x?: number;
  y?: number;
}

export interface ElkLaidGraph {
  children?: ReadonlyArray<ElkLaidNode>;
}

export interface CoordinatesMap {
  /** Pozycje węzłów (po lewy-górny narożnik), klucz = node id */
  positions: Map<string, { x: number; y: number }>;
}

/**
 * Konwertuje wynik elk.layout(...) na mapę współrzędnych.
 * Stosuje opcjonalny scale + offset (do wpięcia w canvas zoom/pan).
 */
export function fromElkLaidGraph(
  laid: ElkLaidGraph,
  view?: { scale: number; offset: { x: number; y: number } },
): CoordinatesMap {
  const scale = view?.scale ?? 1;
  const offsetX = view?.offset?.x ?? 0;
  const offsetY = view?.offset?.y ?? 0;
  const positions = new Map<string, { x: number; y: number }>();
  for (const node of laid.children ?? []) {
    const x = (node.x ?? 0) * scale + offsetX;
    const y = (node.y ?? 0) * scale + offsetY;
    positions.set(node.id, { x, y });
  }
  return { positions };
}

// ============================================================================
// Determinism helper — canonical hash (dla snapshot tests)
// ============================================================================

/**
 * Kanoniczna serializacja CoordinatesMap dla SHA-256 fingerprint.
 * Sortuje klucze ASC — wynik jest stabilny przy round-trip.
 */
export function canonicalSerializeCoordinates(map: CoordinatesMap): string {
  const sorted = Array.from(map.positions.entries()).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const obj: Record<string, { x: number; y: number }> = {};
  for (const [id, pos] of sorted) {
    // Quantize do 3 miejsc po przecinku (sub-pixel precision wystarcza)
    obj[id] = {
      x: Math.round(pos.x * 1000) / 1000,
      y: Math.round(pos.y * 1000) / 1000,
    };
  }
  return JSON.stringify(obj);
}

/**
 * Kanoniczna serializacja ElkGraph (dla snapshot tests konwersji).
 */
export function canonicalSerializeElkGraph(graph: ElkGraph): string {
  // children + edges są już posortowane w toElkGraph
  return JSON.stringify({
    id: graph.id,
    layoutOptions: graph.layoutOptions,
    children: graph.children.map((n) => ({
      id: n.id,
      width: n.width,
      height: n.height,
      layoutOptions: n.layoutOptions,
      ports: n.ports.map((p) => ({
        id: p.id,
        width: p.width,
        height: p.height,
        layoutOptions: p.layoutOptions,
      })),
    })),
    edges: graph.edges.map((e) => ({
      id: e.id,
      sources: e.sources,
      targets: e.targets,
    })),
  });
}
