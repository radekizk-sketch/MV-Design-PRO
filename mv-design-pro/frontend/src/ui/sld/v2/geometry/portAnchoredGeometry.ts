/**
 * portAnchoredGeometry — warstwa ODCZYTU geometrii dla rendererów (V-07, M-03).
 *
 * @see docs/sld/SLD_GEOMETRY_CONTRACT_V1.md §1 (kontrakt), §4 (migracja bez „drugiej prawdy")
 *
 * JEDNA PRAWDA: ten moduł NIE liczy pozycji. Mapuje ENM → topologię
 * (`readTopologyFromENM`), woła `LayoutEngine.layout`, i wystawia węzły/porty +
 * krawędzie port→port WPROST z `LayoutResult`. Brak slotów (`Y_RUN_BASE`,
 * `X_STATIONS_START + j×pitch`, `GPZ_FIELD_CABLE_HEAD_*`) — pozycje pochodzą
 * wyłącznie z `LayoutResult.nodes[].ports[]`.
 *
 * V-07 (zero wiszących krawędzi): KAŻDA krawędź ma `fromPort`/`toPort` będące
 * realnymi `PortAnchor`; `pathPoints` to `EdgeGeometry.polyline` z silnika, której
 * końce SĄ pozycjami tych portów (silnik to gwarantuje, ten moduł weryfikuje
 * kontrakt i odrzuca krawędź bez realnego portu — nie udaje pozycji).
 */

import type { EnergyNetworkModel } from '../../../../types/enm';
import { readTopologyFromENM } from '../../core/topologyInputReader';
import {
  createTopologicalLayoutEngine,
  type EdgeGeometry,
  type LayoutEngine,
  type LayoutFrame,
  type LayoutMode,
  type LayoutResult,
  type LodLevel,
  type NodeGeometry,
  type PortAnchor,
} from './index';

/** Punkt ścieżki (world-space) — kształt zgodny z `CableRunRenderer.pathPoints`. */
export interface GeometryPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Krawędź zakotwiczona do portów (V-07). `pathPoints` = `EdgeGeometry.polyline`
 * (routing z silnika); `fromPort`/`toPort` = realne `PortAnchor` z `LayoutResult`.
 * Pierwszy/ostatni punkt `pathPoints` POKRYWA się z pozycją portu (anchored).
 */
export interface PortAnchoredEdge {
  /** Ref kabla/linii (z `EdgeGeometry.ref`). */
  readonly ref: string;
  readonly lod: LodLevel;
  readonly fromPortId: string;
  readonly toPortId: string;
  /** Port źródłowy (głowica odpływowa / port brzegowy bloku). */
  readonly fromPort: PortAnchor;
  /** Port docelowy (terminal wejściowy / port brzegowy bloku). */
  readonly toPort: PortAnchor;
  /** Polyline z silnika — końce zakotwiczone w portach. */
  readonly pathPoints: readonly GeometryPoint[];
  readonly label?: string;
}

/**
 * Wynik warstwy odczytu: surowy `LayoutResult` (jedna prawda) + indeks portów +
 * krawędzie zakotwiczone gotowe do renderu. Renderery czytają TYLKO stąd.
 */
export interface PortAnchoredGeometry {
  /** Pełna geometria z silnika (jedna, zagnieżdżona prawda). */
  readonly layout: LayoutResult;
  /** Indeks `portId → PortAnchor` po całej zagnieżdżonej hierarchii. */
  readonly portIndex: ReadonlyMap<string, PortAnchor>;
  /** Krawędzie zakotwiczone (V-07) — każda kończy się w realnym porcie. */
  readonly edges: readonly PortAnchoredEdge[];
  /**
   * Krawędzie z `LayoutResult` odrzucone bo `fromPortId`/`toPortId` nie wskazuje
   * realnego portu. Kontrakt V-07: NIE rysujemy wiszących — raportujemy lukę.
   * Dla zdrowej geometrii: pusta.
   */
  readonly droppedEdgeRefs: readonly string[];
}

/** Spłaszcz całą zagnieżdżoną hierarchię do indeksu `portId → PortAnchor`. */
export function indexPorts(nodes: readonly NodeGeometry[]): Map<string, PortAnchor> {
  const index = new Map<string, PortAnchor>();
  const visit = (node: NodeGeometry): void => {
    for (const port of node.ports) {
      // Pierwszy wpis wygrywa (deterministycznie — kolejność nodes z silnika);
      // portId jest unikalny w obrębie geometrii (owner::role::side).
      if (!index.has(port.portId)) index.set(port.portId, port);
    }
    node.children?.forEach(visit);
  };
  nodes.forEach(visit);
  return index;
}

/**
 * Zbuduj zakotwiczone krawędzie z `LayoutResult`. Czyta `edge.polyline` i mapuje
 * `fromPortId/toPortId` na realne `PortAnchor`. Krawędź bez realnego portu po
 * którejkolwiek stronie jest ODRZUCANA (V-07: zero wiszących), a jej ref trafia
 * do `dropped`. Determinizm: kolejność = kolejność `edges` z silnika.
 */
export function buildPortAnchoredEdges(
  edges: readonly EdgeGeometry[],
  portIndex: ReadonlyMap<string, PortAnchor>,
): { edges: PortAnchoredEdge[]; dropped: string[] } {
  const anchored: PortAnchoredEdge[] = [];
  const dropped: string[] = [];
  for (const edge of edges) {
    const fromPort = portIndex.get(edge.fromPortId);
    const toPort = portIndex.get(edge.toPortId);
    if (!fromPort || !toPort) {
      dropped.push(edge.ref);
      continue;
    }
    anchored.push({
      ref: edge.ref,
      lod: edge.lod,
      fromPortId: edge.fromPortId,
      toPortId: edge.toPortId,
      fromPort,
      toPort,
      pathPoints: edge.polyline,
      ...(edge.label !== undefined ? { label: edge.label } : {}),
    });
  }
  return { edges: anchored, dropped };
}

/**
 * Projekcja `LayoutResult` → warstwa odczytu dla rendererów. Czysta funkcja nad
 * gotowym wynikiem silnika (nie liczy pozycji).
 */
export function projectPortAnchoredGeometry(layout: LayoutResult): PortAnchoredGeometry {
  const portIndex = indexPorts(layout.nodes);
  const { edges, dropped } = buildPortAnchoredEdges(layout.edges, portIndex);
  return { layout, portIndex, edges, droppedEdgeRefs: dropped };
}

/**
 * Run liniowy dla renderera, zakotwiczony do portów (V-07). Kształt zgodny z
 * polami `CableRunRenderer.pathPoints`/`segmentKind` używanymi do RYSOWANIA —
 * renderer czyta `pathPoints` (końce w portach), nie liczy geometrii.
 */
export interface PortAnchoredCableRun {
  readonly id: string;
  readonly runKind: 'main_trunk' | 'branch' | 'ring' | 'loop';
  readonly segmentKind: 'cable_sn' | 'overhead_line_sn';
  /** Punkty ścieżki z silnika (`EdgeGeometry.polyline`) — końce na portach. */
  readonly pathPoints: readonly GeometryPoint[];
  readonly fromPortId: string;
  readonly toPortId: string;
  readonly label?: string;
}

/**
 * Projekcja zakotwiczonych krawędzi → runy gotowe dla `CableRunRenderer`.
 * Renderer dostaje `pathPoints` WPROST z `LayoutResult` (jedna prawda) —
 * brak rekomputacji pozycji w warstwie prezentacji. `runKind` mapuje stronę
 * portu źródłowego: bok (left/right) = magistrala, dół (bottom) = odgałęzienie.
 */
export function toCableRuns(edges: readonly PortAnchoredEdge[]): PortAnchoredCableRun[] {
  return edges.map((edge) => ({
    id: edge.ref,
    runKind: edge.fromPort.side === 'bottom' ? 'branch' : 'main_trunk',
    segmentKind: 'cable_sn',
    pathPoints: edge.pathPoints,
    fromPortId: edge.fromPortId,
    toPortId: edge.toPortId,
    ...(edge.label !== undefined ? { label: edge.label } : {}),
  }));
}

/**
 * Pełna ścieżka odczytu: ENM → topologia → `LayoutEngine.layout` → geometria
 * zakotwiczona. To jest seam V-07 dla rendererów (jedna prawda geometrii).
 *
 * @param enm        kanoniczny model energetyczny
 * @param snapshotId id snapshotu (deterministyczny fingerprint reader)
 * @param mode       tryb layoutu ('topological' | 'geo')
 * @param lod        opcjonalny poziom detalu (projekcja z jednej prawdy)
 * @param options    opcjonalny kadr auto-fit + wstrzykiwalny silnik (testy)
 */
export function buildPortAnchoredGeometryFromENM(
  enm: EnergyNetworkModel,
  snapshotId: string,
  mode: LayoutMode = 'topological',
  lod?: LodLevel,
  options?: { readonly frame?: LayoutFrame; readonly engine?: LayoutEngine },
): PortAnchoredGeometry {
  const snapshot = readTopologyFromENM(enm, snapshotId);
  const engine = options?.engine ?? createTopologicalLayoutEngine(options?.frame);
  const layout = engine.layout(snapshot, mode, lod);
  return projectPortAnchoredGeometry(layout);
}
