/**
 * Layout Pipeline V1 — 6-fazowy, deterministyczny pipeline layoutu SLD.
 *
 * UKŁAD PIONOWY (VERTICAL SN) — STYL ABB/CANONICAL:
 *   GPZ u góry → szyna GPZ pozioma → pola liniowe w równym pitch →
 *   z pól pionowe magistrale SN w dół → odgałęzienia L (bok+dół) →
 *   stacje jako "drop" z magistrali → ring/NOP w kanale wtórnym
 *
 * ESTETYKA PRZEMYSLOWA (E1–E4 + VERTICAL):
 * - E1: Równe odległości pól GPZ na szynie (PITCH_FIELD_X)
 * - E2: Symetryczne ringi (orthogonal, kanał wtórny)
 * - E3: Brak przypadkowych długości wizualnych (snap to grid, stałe kroki)
 * - E4: Wyrównanie pionowe pól stacji (OFFSET_POLE, wspólna oś Y)
 * - V1: GPZ u góry, sieć buduje się w dół (monotoniczny Y)
 * - V2: Magistrale SN pionowe (każde pole GPZ → trunk w dół)
 * - V3: Odgałęzienia L-shape (bok + dół), deterministyczny wybór strony
 * - V4: Stacje jako "drop" (bok + dół z magistrali)
 *
 * PIPELINE:
 *   phase1_place_gpz_and_fields()
 *   phase2_build_trunk_topology()
 *   phase3_place_stations_and_branches()
 *   phase4_route_all_edges()
 *   phase5_place_labels()
 *   phase6_enforce_invariants_and_finalize_hash()
 *
 * REGUŁY:
 * - Każda faza używa WYŁĄCZNIE VisualGraphV1 + GeometryConfig.
 * - Każda faza NIE zna camera/overlay/viewport.
 * - Każda faza NIE modyfikuje Snapshot.
 * - Każda faza zwraca immutable struktury.
 * - DETERMINIZM: ten sam input → identyczny output (bit-for-bit).
 * - KOLIZJE: rozwiązywane WYŁĄCZNIE w osi Y (Y-only push-away).
 * - JEDEN SILNIK: brak flag wyboru, brak równoległych implementacji.
 */

import type {
  VisualGraphV1,
  VisualNodeV1,
  VisualEdgeV1,
  VisualNodeAttributesV1,
  VisualEdgeAttributesV1,
} from './visualGraph';
import { NodeTypeV1, EdgeTypeV1 } from './visualGraph';
import {
  type LayoutResultV1,
  type NodePlacementV1,
  type EdgeRouteV1,
  type SwitchgearBlockV1,
  type SwitchgearPortV1,
  type CatalogRefV1,
  type RelayBindingV1,
  type LayoutValidationErrorV1,
  type PointV1,
  type RectangleV1,
  type PathSegmentV1,
  type CanonicalAnnotationsV1,
  type TrunkNodeAnnotationV1,
  type TrunkSegmentAnnotationV1,
  type BranchPointV1,
  type InlineBranchObjectV1,
  type StationFieldAnnotationV1,
  type GpzFieldAnnotationV1,
  type GpzSectionV1,
  type StationApparatusItemV1,
  type NNFeederV1,
  type ProtectionRelayV1,
  StationBlockType,
  CatalogCategory,
  LAYOUT_RESULT_VERSION,
  computeLayoutResultHash,
  canonicalizeLayoutResult,
} from './layoutResult';
import { FieldRoleV1, type StationBlockDetailV1 } from './fieldDeviceContracts';
import type { StationBlockBuildResult } from './stationBlockBuilder';
import {
  resolveBranchPointDetailsForGraph,
  resolveStationBlockDetailsForGraph,
} from './layoutDetailRegistry';
import type { LayoutEngineOptions } from './layoutEngine';
import { createLayoutEngine } from './layoutEngine';
import { buildSldSemanticGraphFromVisualGraph } from './semanticGraphBuilder';
import { buildLayoutInputGraph, type LayoutInputGraphV1 } from './layoutInputGraph';
import {
  GRID_BASE,
  GRID_SPACING_MAIN,
  X_START,
  Y_GPZ,
  PITCH_FIELD_X,
  TRUNK_STEP_Y,
  BRANCH_OFFSET_X,
  SECONDARY_CHANNEL_OFFSET_X,
  STATION_BLOCK_HEIGHT,
  STATION_BLOCK_WIDTH,
  OFFSET_POLE,
  MIN_VERTICAL_GAP,
  snapToAestheticGrid,
  deterministicBranchSide,
} from '../IndustrialAesthetics';

// =============================================================================
// GEOMETRY CONFIG
// =============================================================================

/** Konfiguracja geometrii layoutu (CANONICAL-grade, vertical SN). */
export interface LayoutGeometryConfigV1 {
  /** Krok siatki [px] */
  readonly gridStep: number;
  /** Odstęp między warstwami Y [px] */
  readonly layerSpacing: number;
  /** Odstęp między bandami branch [px] */
  readonly bandSpacing: number;
  /** Szerokość symbolu domyślna [px] */
  readonly defaultSymbolWidth: number;
  /** Wysokość symbolu domyślna [px] */
  readonly defaultSymbolHeight: number;
  /** Szerokość szyny zbiorczej domyślna [px] */
  readonly defaultBusWidth: number;
  /** Wysokość szyny zbiorczej [px] */
  readonly busHeight: number;
  /** Odstęp między slotami feederów [px] */
  readonly feederSlotSpacing: number;
  /** Pitch kanału secondary connector [px] */
  readonly secondaryLanePitch: number;
  /** Margines bloku switchgear [px] */
  readonly blockMargin: number;
  /** Offset relay nad CB [px] */
  readonly relayOffsetY: number;
  /** Spina X (oś pionowa magistrali) [px] */
  readonly spineX: number;
}

export const DEFAULT_LAYOUT_CONFIG: LayoutGeometryConfigV1 = {
  gridStep: GRID_BASE,
  layerSpacing: 6 * GRID_BASE,       // 120px — layer Y spacing
  bandSpacing: MIN_VERTICAL_GAP,      // 80px — branch band gap
  defaultSymbolWidth: 3 * GRID_BASE,  // 60px
  defaultSymbolHeight: 3 * GRID_BASE, // 60px
  defaultBusWidth: 20 * GRID_BASE,    // 400px
  busHeight: 10,                      // busbar thickness
  feederSlotSpacing: PITCH_FIELD_X,   // 280px — E1: equal field spacing
  secondaryLanePitch: 30,
  blockMargin: GRID_BASE,             // 20px
  relayOffsetY: -2 * GRID_BASE,      // -40px
  spineX: X_START + 2 * GRID_SPACING_MAIN, // centered at ~600px
} as const;

// =============================================================================
// INTERNAL STATE (mutable during pipeline, frozen at output)
// =============================================================================

interface MutablePlacement {
  nodeId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  layer: number;
  bandIndex: number;
  autoPositioned: boolean;
}

interface MutableRoute {
  edgeId: string;
  edgeType: string;
  segments: PathSegmentV1[];
  startPoint: PointV1;
  endPoint: PointV1;
  laneIndex: number;
  isNormallyOpen: boolean;
}

interface MutableBlock {
  blockId: string;
  blockType: StationBlockType;
  bounds: RectangleV1;
  ports: SwitchgearPortV1[];
  internalNodes: string[];
  label: string;
  detail: StationBlockDetailV1 | null;
}

/** Trunk assignment: maps nodeId → trunkIndex (which feeder field) */
interface TrunkAssignment {
  trunkIndex: number;
  trunkX: number;
  depthInTrunk: number;
}

interface PipelineState {
  placements: Map<string, MutablePlacement>;
  routes: MutableRoute[];
  blocks: MutableBlock[];
  catalogRefs: CatalogRefV1[];
  relayBindings: RelayBindingV1[];
  validationErrors: LayoutValidationErrorV1[];
  /** Maps nodeId → trunk assignment (which vertical trunk) */
  trunkAssignments: Map<string, TrunkAssignment>;
  /** Maps nodeId → branch side (1=right, -1=left) */
  branchSides: Map<string, 1 | -1>;
}

// =============================================================================
// HELPERS
// =============================================================================

function snap(value: number): number {
  return snapToAestheticGrid(value);
}

function isStationType(nodeType: string): boolean {
  return (
    nodeType === NodeTypeV1.STATION_SN_NN_A ||
    nodeType === NodeTypeV1.STATION_SN_NN_B ||
    nodeType === NodeTypeV1.STATION_SN_NN_C ||
    nodeType === NodeTypeV1.STATION_SN_NN_D ||
    nodeType === NodeTypeV1.SWITCHGEAR_BLOCK
  );
}

function isBusType(nodeType: string): boolean {
  return nodeType === NodeTypeV1.BUS_SN || nodeType === NodeTypeV1.BUS_NN;
}

function isSourceType(nodeType: string): boolean {
  return (
    nodeType === NodeTypeV1.GRID_SOURCE ||
    nodeType === NodeTypeV1.GENERATOR_PV ||
    nodeType === NodeTypeV1.GENERATOR_BESS ||
    nodeType === NodeTypeV1.GENERATOR_WIND
  );
}

function isSwitchType(nodeType: string): boolean {
  return (
    nodeType === NodeTypeV1.SWITCH_BREAKER ||
    nodeType === NodeTypeV1.SWITCH_DISCONNECTOR ||
    nodeType === NodeTypeV1.SWITCH_LOAD_SWITCH ||
    nodeType === NodeTypeV1.SWITCH_FUSE
  );
}

function nodeTypeToStationBlockType(nodeType: string): StationBlockType {
  switch (nodeType) {
    case NodeTypeV1.STATION_SN_NN_A: return StationBlockType.TYPE_A;
    case NodeTypeV1.STATION_SN_NN_B: return StationBlockType.TYPE_B;
    case NodeTypeV1.STATION_SN_NN_C: return StationBlockType.TYPE_C;
    case NodeTypeV1.STATION_SN_NN_D: return StationBlockType.TYPE_D;
    default: return StationBlockType.TYPE_A;
  }
}

function nodeTypeToCatalogCategory(nodeType: string): CatalogCategory | null {
  switch (nodeType) {
    case NodeTypeV1.SWITCH_BREAKER: return CatalogCategory.BREAKER;
    case NodeTypeV1.SWITCH_DISCONNECTOR: return CatalogCategory.DISCONNECTOR;
    case NodeTypeV1.SWITCH_FUSE: return CatalogCategory.FUSE;
    case NodeTypeV1.TRANSFORMER_WN_SN:
    case NodeTypeV1.TRANSFORMER_SN_NN: return CatalogCategory.TRANSFORMER;
    case NodeTypeV1.GENERATOR_PV: return CatalogCategory.PV_INVERTER;
    case NodeTypeV1.GENERATOR_BESS: return CatalogCategory.BESS_PCS;
    default: return null;
  }
}

/** Deterministyczny tie-break dla multi-source: preferuj GRID_SOURCE, potem leksykograficznie. */
function sourceOrderKey(node: VisualNodeV1): string {
  const priority = node.nodeType === NodeTypeV1.GRID_SOURCE ? '0' : '1';
  return `${priority}_${node.id}`;
}

/** Get adjacency list from graph edges */
function buildAdjacency(graph: VisualGraphV1): Map<string, Array<{ nodeId: string; edge: VisualEdgeV1 }>> {
  const adj = new Map<string, Array<{ nodeId: string; edge: VisualEdgeV1 }>>();
  for (const edge of graph.edges) {
    const from = edge.fromPortRef.nodeId;
    const to = edge.toPortRef.nodeId;
    if (!adj.has(from)) adj.set(from, []);
    if (!adj.has(to)) adj.set(to, []);
    adj.get(from)!.push({ nodeId: to, edge });
    adj.get(to)!.push({ nodeId: from, edge });
  }
  return adj;
}

// =============================================================================
// PHASE 1: PLACE GPZ AND FIELDS (TOP OF DIAGRAM)
// =============================================================================

/**
 * Faza 1: Umieszczenie GPZ u góry schematu.
 *
 * VERTICAL SN LAYOUT:
 * - Źródła (GRID_SOURCE) na samej górze
 * - Transformatory WN/SN pod źródłami
 * - Szyna SN GPZ (root busbar) pod transformatorami — JEDNA szyna GPZ
 * - WYŁĄCZNIE szyna GPZ (root) jest umieszczana w fazie 1
 * - Pozostałe szyny SN są odkrywane w fazie 2 (BFS trunk)
 * - Wyłączniki między transformatorem a szyną SN
 */
function phase1_place_gpz_and_fields(
  graph: VisualGraphV1,
  config: LayoutGeometryConfigV1,
  state: PipelineState,
): void {
  const { defaultSymbolWidth, defaultSymbolHeight, defaultBusWidth, busHeight } = config;
  const adj = buildAdjacency(graph);

  // Layer Y coordinates (top → down, all on grid)
  const Y_SOURCE = snap(Y_GPZ - 2 * OFFSET_POLE);        // Sources above GPZ busbar
  const Y_TR_WN_SN = snap(Y_GPZ + 2 * OFFSET_POLE);       // WN/SN transformers
  const Y_SN_BUS = snap(Y_GPZ + 4 * OFFSET_POLE);          // SN busbar = start of feeders
  const Y_SWITCH_ZONE = snap((Y_TR_WN_SN + Y_SN_BUS) / 2); // Switches between TR and SN bus

  // Find and sort sources (GRID_SOURCE first)
  const sources = graph.nodes
    .filter(n => isSourceType(n.nodeType))
    .sort((a, b) => sourceOrderKey(a).localeCompare(sourceOrderKey(b)));

  // Find WN/SN transformers
  const wnSnTransformers = graph.nodes
    .filter(n => n.nodeType === NodeTypeV1.TRANSFORMER_WN_SN)
    .sort((a, b) => a.id.localeCompare(b.id));

  // Identify ROOT SN bus: the SN bus directly connected to a source (via edges).
  // This is the GPZ horizontal busbar. Other SN buses are trunk nodes placed in phase2.
  const rootBusIds = new Set<string>();
  for (const src of sources) {
    const neighbors = adj.get(src.id) ?? [];
    for (const n of neighbors) {
      const node = graph.nodes.find(nd => nd.id === n.nodeId);
      if (node && node.nodeType === NodeTypeV1.BUS_SN) {
        rootBusIds.add(node.id);
      }
    }
  }
  // Also check source connectedToNodeId attribute
  for (const src of sources) {
    const connId = src.attributes.connectedToNodeId;
    if (connId) {
      const node = graph.nodes.find(nd => nd.id === connId);
      if (node && node.nodeType === NodeTypeV1.BUS_SN) {
        rootBusIds.add(node.id);
      }
    }
  }

  // If no root bus found from source, use the first SN bus connected to a WN/SN transformer
  if (rootBusIds.size === 0) {
    for (const tr of wnSnTransformers) {
      const neighbors = adj.get(tr.id) ?? [];
      for (const n of neighbors) {
        const node = graph.nodes.find(nd => nd.id === n.nodeId);
        if (node && node.nodeType === NodeTypeV1.BUS_SN) {
          rootBusIds.add(node.id);
        }
      }
    }
  }

  // If still none, pick the first SN bus alphabetically
  if (rootBusIds.size === 0) {
    const allSnBuses = graph.nodes
      .filter(n => n.nodeType === NodeTypeV1.BUS_SN)
      .sort((a, b) => a.id.localeCompare(b.id));
    if (allSnBuses.length > 0) {
      rootBusIds.add(allSnBuses[0].id);
    }
  }

  const rootBuses = graph.nodes
    .filter(n => rootBusIds.has(n.id))
    .sort((a, b) => a.id.localeCompare(b.id));

  // Determine the number of direct feeder connections from the root bus
  // Each first-level SN bus neighbor = one feeder field
  const feederBusIds: string[] = [];
  for (const rootBus of rootBuses) {
    const neighbors = adj.get(rootBus.id) ?? [];
    for (const n of [...neighbors].sort((a, b) => a.nodeId.localeCompare(b.nodeId))) {
      const node = graph.nodes.find(nd => nd.id === n.nodeId);
      if (node && node.nodeType === NodeTypeV1.BUS_SN && !rootBusIds.has(node.id)) {
        feederBusIds.push(node.id);
      }
    }
  }

  const numFields = Math.max(feederBusIds.length, sources.length, wnSnTransformers.length, 1);
  const totalFieldWidth = (numFields - 1) * PITCH_FIELD_X;
  const fieldStartX = snap(X_START + PITCH_FIELD_X);

  // Store field start for phase2
  state.placements.set('__fieldStartX__', {
    nodeId: '__fieldStartX__',
    x: fieldStartX,
    y: 0,
    width: numFields,  // encode numFields
    height: 0,
    layer: -1,
    bandIndex: 0,
    autoPositioned: false,
  });

  // Compute GPZ busbar geometry first (needed for source centering)
  const gpzBusX = snap(fieldStartX);
  let gpzBusW = 0;
  for (const bus of rootBuses) {
    const w = bus.attributes.width ?? defaultBusWidth;
    gpzBusW = snap(Math.max(w, totalFieldWidth + 2 * GRID_BASE));
  }
  if (gpzBusW === 0) gpzBusW = snap(totalFieldWidth + 2 * GRID_BASE);
  const gpzBusCenterX = snap(gpzBusX + gpzBusW / 2);

  // Place sources centered above GPZ busbar
  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    // Single source → center above GPZ bus, multiple → distribute along fields
    const x = sources.length === 1
      ? snap(gpzBusCenterX - defaultSymbolWidth / 2)
      : snap(fieldStartX + i * PITCH_FIELD_X);
    state.placements.set(src.id, {
      nodeId: src.id,
      x,
      y: Y_SOURCE,
      width: defaultSymbolWidth,
      height: defaultSymbolHeight,
      layer: 0,
      bandIndex: 0,
      autoPositioned: true,
    });
  }

  // Place ONLY root SN bus(es) on Y_SN_BUS (horizontal busbar spanning all fields)
  for (const bus of rootBuses) {
    const busX = gpzBusX;
    const busW = gpzBusW;
    state.placements.set(bus.id, {
      nodeId: bus.id,
      x: busX,
      y: Y_SN_BUS,
      width: busW,
      height: busHeight,
      layer: 1,
      bandIndex: 0,
      autoPositioned: true,
    });
  }

  // Place WN/SN transformers
  for (let i = 0; i < wnSnTransformers.length; i++) {
    const tr = wnSnTransformers[i];
    const x = snap(fieldStartX + i * PITCH_FIELD_X);
    state.placements.set(tr.id, {
      nodeId: tr.id,
      x,
      y: Y_TR_WN_SN,
      width: defaultSymbolWidth,
      height: defaultSymbolHeight,
      layer: 2,
      bandIndex: 0,
      autoPositioned: true,
    });
  }

  // Place switches in the zone between transformer and SN bus
  const switchNodes = graph.nodes
    .filter(n => isSwitchType(n.nodeType))
    .sort((a, b) => a.id.localeCompare(b.id));

  let switchSlotIndex = 0;
  for (const sw of switchNodes) {
    if (!state.placements.has(sw.id)) {
      const x = snap(fieldStartX + switchSlotIndex * snap(PITCH_FIELD_X / 2));
      state.placements.set(sw.id, {
        nodeId: sw.id,
        x,
        y: Y_SWITCH_ZONE,
        width: snap(defaultSymbolWidth / 2),
        height: snap(defaultSymbolHeight / 2),
        layer: 2,
        bandIndex: 0,
        autoPositioned: true,
      });
      switchSlotIndex++;
    }
  }
}

// =============================================================================
// PHASE 2: BUILD TRUNK TOPOLOGY (VERTICAL TRUNKS DOWNWARD)
// =============================================================================

/**
 * Faza 2: Budowa topologii magistral pionowych.
 *
 * Z szyny GPZ (root bus) identyfikujemy pola liniowe (feeder fields).
 * Każde pierwsze BUS_SN sąsiadujące z root = początek oddzielnej magistrali.
 * BFS po ALL edge types (TRUNK + BRANCH + inne) → każdy odkryty węzeł
 * otrzymuje trunkIndex i depthInTrunk.
 *
 * UWAGA: Adapter segmentuje tylko JEDNĄ najdłuższą ścieżkę jako TRUNK.
 * Dla multi-feeder GPZ inne feedery mają edgeType=BRANCH.
 * Dlatego phase2 BFS idzie po WSZYSTKICH typach krawędzi.
 *
 * Magistrala = oś X stała (= X pola), Y rośnie monotonicznie w dół.
 */
function phase2_build_trunk_topology(
  graph: VisualGraphV1,
  config: LayoutGeometryConfigV1,
  state: PipelineState,
): void {
  const adj = buildAdjacency(graph);

  // Retrieve fieldStartX from phase1 metadata
  const metaPlacement = state.placements.get('__fieldStartX__');
  const fieldStartX = metaPlacement ? metaPlacement.x : snap(X_START + PITCH_FIELD_X);
  // Clean up transient metadata marker
  state.placements.delete('__fieldStartX__');

  // Y where trunk starts (below SN busbar)
  const trunkStartY = snap(Y_GPZ + 5 * OFFSET_POLE);

  // Identify root SN buses (already placed in phase1, at layer 1)
  const rootBusIds = new Set<string>();
  for (const [nodeId, p] of state.placements) {
    const node = graph.nodes.find(n => n.id === nodeId);
    if (node && node.nodeType === NodeTypeV1.BUS_SN && p.layer === 1) {
      rootBusIds.add(nodeId);
    }
  }

  // Mark all already-placed nodes as visited (GPZ layer)
  const visited = new Set<string>();
  for (const [nodeId] of state.placements) {
    visited.add(nodeId);
  }

  // Determine feeder fields: direct BUS_SN neighbors of root bus
  // Each such neighbor starts a separate vertical trunk
  const feederStarts: Array<{ nodeId: string; trunkIndex: number }> = [];
  let trunkIndex = 0;

  for (const rootId of [...rootBusIds].sort()) {
    const neighbors = adj.get(rootId) ?? [];
    const sortedNeighbors = [...neighbors].sort((a, b) => a.nodeId.localeCompare(b.nodeId));

    for (const n of sortedNeighbors) {
      if (visited.has(n.nodeId)) continue;
      const node = graph.nodes.find(nd => nd.id === n.nodeId);
      if (!node) continue;

      // BUS_SN neighbor = start of a trunk feeder
      // Non-bus neighbor (e.g., line junction) = also a trunk start
      // Skip station/load/source nodes — they don't start trunks
      if (isStationType(node.nodeType) || node.nodeType === NodeTypeV1.LOAD) continue;

      feederStarts.push({ nodeId: n.nodeId, trunkIndex });
      trunkIndex++;
    }
  }

  // BFS from each feeder start → build trunk chains
  // Follow ONLY trunk-forming edges (TRUNK, BUS_COUPLER, TRANSFORMER_LINK).
  // BRANCH edges are NOT followed in phase2 — they will be placed with
  // horizontal offset in phase3 to produce the CANONICAL/ABB layout style:
  // trunk vertical, branches horizontal to the side.
  const isTrunkFormingEdge = (edgeType: string): boolean => {
    return edgeType === EdgeTypeV1.TRUNK ||
           edgeType === EdgeTypeV1.BUS_COUPLER ||
           edgeType === EdgeTypeV1.TRANSFORMER_LINK;
  };

  for (const feeder of feederStarts) {
    const trunkX = snap(fieldStartX + feeder.trunkIndex * PITCH_FIELD_X);

    const queue: Array<{ nodeId: string; depth: number }> = [
      { nodeId: feeder.nodeId, depth: 1 },
    ];

    while (queue.length > 0) {
      const { nodeId, depth } = queue.shift()!;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      state.trunkAssignments.set(nodeId, {
        trunkIndex: feeder.trunkIndex,
        trunkX,
        depthInTrunk: depth,
      });

      // Continue BFS along trunk-forming edges only
      const nextNeighbors = (adj.get(nodeId) ?? [])
        .filter(n => isTrunkFormingEdge(n.edge.edgeType) && !visited.has(n.nodeId))
        .sort((a, b) => a.nodeId.localeCompare(b.nodeId));

      for (const nn of nextNeighbors) {
        queue.push({ nodeId: nn.nodeId, depth: depth + 1 });
      }
    }
  }

  // Phase 2b: Place branch bus nodes with horizontal offset from trunk.
  // Branch buses (connected via BRANCH edges to trunk nodes) get their own
  // sub-trunk axis offset to the side, producing L-shape branch layout.
  const branchEdges = graph.edges
    .filter(e => e.edgeType === EdgeTypeV1.BRANCH)
    .sort((a, b) => a.id.localeCompare(b.id));

  // Track branch lane index per trunk node for deterministic side assignment
  const branchLanePerParent = new Map<string, number>();

  for (const branchEdge of branchEdges) {
    const fromId = branchEdge.fromPortRef.nodeId;
    const toId = branchEdge.toPortRef.nodeId;

    // Determine which end is on the trunk and which is the branch target
    const fromOnTrunk = state.trunkAssignments.has(fromId);
    const toOnTrunk = state.trunkAssignments.has(toId);

    // Only process edges where one end is on trunk, other is not yet placed
    if (fromOnTrunk && !toOnTrunk && !visited.has(toId)) {
      const parentAssignment = state.trunkAssignments.get(fromId)!;
      const branchNode = graph.nodes.find(n => n.id === toId);
      if (!branchNode) continue;

      // Skip loads — they're placed in phase3
      if (branchNode.nodeType === NodeTypeV1.LOAD) continue;

      // Determine branch lane (offset from parent trunk axis)
      const laneKey = fromId;
      const lane = (branchLanePerParent.get(laneKey) ?? 0) + 1;
      branchLanePerParent.set(laneKey, lane);

      const side = deterministicBranchSide(toId);
      const branchX = snap(parentAssignment.trunkX + side * BRANCH_OFFSET_X * lane);
      const branchDepth = parentAssignment.depthInTrunk;

      visited.add(toId);
      state.trunkAssignments.set(toId, {
        trunkIndex: parentAssignment.trunkIndex,
        trunkX: branchX,
        depthInTrunk: branchDepth,
      });

      // BFS from branch node to find continuation (B1→B2, B4→B5→B6)
      // BRANCH continuation: same branchX (B1→B2 stays on same axis)
      // Sub-branch: new offset (B4→B6 when B4 already has B4→B5)
      const branchQueue: Array<{ nodeId: string; depth: number; axisX: number }> = [
        { nodeId: toId, depth: branchDepth, axisX: branchX },
      ];

      let isFirst = true;
      while (branchQueue.length > 0) {
        const { nodeId: bNodeId, depth: bDepth, axisX: currentAxisX } = branchQueue.shift()!;
        if (!isFirst && visited.has(bNodeId)) continue;
        isFirst = false;

        if (!state.trunkAssignments.has(bNodeId)) {
          visited.add(bNodeId);
          state.trunkAssignments.set(bNodeId, {
            trunkIndex: parentAssignment.trunkIndex,
            trunkX: currentAxisX,
            depthInTrunk: bDepth + 1,
          });
        }

        // Find BRANCH and TRANSFORMER_LINK neighbors
        const bNeighbors = (adj.get(bNodeId) ?? [])
          .filter(n => (n.edge.edgeType === EdgeTypeV1.BRANCH ||
                        n.edge.edgeType === EdgeTypeV1.TRANSFORMER_LINK) &&
                       !visited.has(n.nodeId))
          .sort((a, b) => a.nodeId.localeCompare(b.nodeId));

        // Count SN bus neighbors via BRANCH edges (to detect multi-branch nodes)
        const branchBusNeighbors = bNeighbors.filter(n => {
          const node = graph.nodes.find(nd => nd.id === n.nodeId);
          return node && isBusType(node.nodeType) && n.edge.edgeType === EdgeTypeV1.BRANCH;
        });

        // If this node has exactly 1 BRANCH-bus neighbor → continuation (same axis)
        // If this node has 2+ BRANCH-bus neighbors → first continues, rest are sub-branches
        let continuationUsed = false;

        for (const bn of bNeighbors) {
          const bnNode = graph.nodes.find(n => n.id === bn.nodeId);
          if (!bnNode) continue;

          if (bnNode && isBusType(bnNode.nodeType) && bn.edge.edgeType === EdgeTypeV1.BRANCH) {
            if (!continuationUsed || branchBusNeighbors.length <= 1) {
              // Continuation: same axis X, deeper Y
              continuationUsed = true;
              branchQueue.push({ nodeId: bn.nodeId, depth: bDepth + 1, axisX: currentAxisX });
            } else {
              // Sub-branch: offset from current branch axis
              const subSide = deterministicBranchSide(bn.nodeId);
              const subBranchX = snap(currentAxisX + subSide * BRANCH_OFFSET_X);
              visited.add(bn.nodeId);
              state.trunkAssignments.set(bn.nodeId, {
                trunkIndex: parentAssignment.trunkIndex,
                trunkX: subBranchX,
                depthInTrunk: bDepth + 1,
              });
              branchQueue.push({ nodeId: bn.nodeId, depth: bDepth + 1, axisX: subBranchX });
            }
          } else {
            // TRANSFORMER_LINK or non-bus: follow on same axis
            branchQueue.push({ nodeId: bn.nodeId, depth: bDepth + 1, axisX: currentAxisX });
          }
        }
      }
    } else if (toOnTrunk && !fromOnTrunk && !visited.has(fromId)) {
      // Reverse direction — same logic
      const parentAssignment = state.trunkAssignments.get(toId)!;
      const branchNode = graph.nodes.find(n => n.id === fromId);
      if (!branchNode || branchNode.nodeType === NodeTypeV1.LOAD) continue;

      const laneKey = toId;
      const lane = (branchLanePerParent.get(laneKey) ?? 0) + 1;
      branchLanePerParent.set(laneKey, lane);

      const side = deterministicBranchSide(fromId);
      const branchX = snap(parentAssignment.trunkX + side * BRANCH_OFFSET_X * lane);

      visited.add(fromId);
      state.trunkAssignments.set(fromId, {
        trunkIndex: parentAssignment.trunkIndex,
        trunkX: branchX,
        depthInTrunk: parentAssignment.depthInTrunk,
      });
    }
  }

  // Place trunk nodes: CENTERED on trunkX, Y = trunkStartY + depth * TRUNK_STEP_Y
  // Bus nodes on trunk use their specified width (or a narrow default),
  // centered on the trunk axis. Non-bus nodes use defaultSymbolWidth.
  for (const [nodeId, assignment] of state.trunkAssignments) {
    const node = graph.nodes.find(n => n.id === nodeId);
    if (!node || state.placements.has(nodeId)) continue;

    const { defaultSymbolWidth, defaultSymbolHeight, busHeight } = config;
    let w = defaultSymbolWidth;
    let h = defaultSymbolHeight;

    if (isBusType(node.nodeType)) {
      // Trunk buses: use specified width or narrow trunk bus width (not GPZ busbar width)
      const explicitWidth = node.attributes.width;
      w = snap(explicitWidth ?? STATION_BLOCK_WIDTH);  // narrow bus, not defaultBusWidth
      h = busHeight;
    }

    // Center the node on the trunk axis
    const centeredX = snap(assignment.trunkX - w / 2 + defaultSymbolWidth / 2);

    state.placements.set(nodeId, {
      nodeId,
      x: centeredX,
      y: snap(trunkStartY + assignment.depthInTrunk * TRUNK_STEP_Y),
      width: w,
      height: h,
      layer: 4,
      bandIndex: assignment.trunkIndex,
      autoPositioned: true,
    });
  }
}

// =============================================================================
// PHASE 3: PLACE STATIONS AND BRANCHES
// =============================================================================

/**
 * Faza 3: Umieszczenie stacji (drop) i odgałęzień (L-shape).
 *
 * STACJE: Stacja wisi jako "drop" z magistrali:
 *   - Punkt wpięcia na magistrali (trunkX, trunkY)
 *   - Poziomo w bok (deterministyczny: lewo/prawo)
 *   - Pionowo w dół — blok stacji
 *
 * ODGAŁĘZIENIA: Branch nodes that are NOT on trunk:
 *   - Od punktu T na magistrali → bok + dół
 *   - Deterministyczny wybór strony (hash elementId)
 */
function collectStationBusIds(
  station: VisualNodeV1,
  graph: VisualGraphV1,
  adj: ReadonlyMap<string, readonly { nodeId: string; edge: VisualEdgeV1 }[]>,
  stationBlockDetails: ReadonlyMap<string, StationBlockDetailV1>,
): string[] {
  const busIds = new Set<string>();
  const detail = stationBlockDetails.get(station.id);

  for (const section of detail?.busSections ?? []) {
    busIds.add(section.id);
  }

  for (const field of detail?.fields ?? []) {
    if (field.busSectionId) busIds.add(field.busSectionId);
    if (field.terminals.incomingNodeId) busIds.add(field.terminals.incomingNodeId);
    if (field.terminals.outgoingNodeId) busIds.add(field.terminals.outgoingNodeId);
  }

  for (const edge of graph.edges) {
    const otherId = edge.fromPortRef.nodeId === station.id
      ? edge.toPortRef.nodeId
      : edge.toPortRef.nodeId === station.id
        ? edge.fromPortRef.nodeId
        : null;
    if (!otherId) continue;

    const otherNode = graph.nodes.find(n => n.id === otherId);
    if (otherNode && isBusType(otherNode.nodeType)) {
      busIds.add(otherId);
    }
  }

  for (const neighbor of adj.get(station.id) ?? []) {
    const neighborNode = graph.nodes.find(n => n.id === neighbor.nodeId);
    if (neighborNode && isBusType(neighborNode.nodeType)) {
      busIds.add(neighbor.nodeId);
    }
  }

  return [...busIds].sort((left, right) => left.localeCompare(right));
}

function findBestPlacedParentForStationBuses(
  busIds: readonly string[],
  state: PipelineState,
  config: LayoutGeometryConfigV1,
): MutablePlacement | null {
  let parentPlacement: MutablePlacement | null = null;

  for (const busId of busIds) {
    const placement = state.placements.get(busId);
    if (placement && isBetterStationParent(placement, parentPlacement)) {
      parentPlacement = placement;
      continue;
    }

    const trunkAssignment = state.trunkAssignments.get(busId);
    if (trunkAssignment) {
      const fallbackPlacement: MutablePlacement = {
        nodeId: busId,
        x: snap(trunkAssignment.trunkX - config.defaultSymbolWidth / 2),
        y: snap(Y_GPZ + 8 * OFFSET_POLE + trunkAssignment.depthInTrunk * TRUNK_STEP_Y),
        width: config.defaultSymbolWidth,
        height: config.busHeight,
        layer: 4,
        bandIndex: trunkAssignment.trunkIndex,
        autoPositioned: true,
      };
      if (isBetterStationParent(fallbackPlacement, parentPlacement)) {
        parentPlacement = fallbackPlacement;
      }
    }
  }

  return parentPlacement;
}

function isBetterStationParent(
  candidate: MutablePlacement,
  current: MutablePlacement | null,
): boolean {
  if (!current) {
    return true;
  }
  const candidateIsNetworkAxis = candidate.layer >= 4;
  const currentIsNetworkAxis = current.layer >= 4;
  if (candidateIsNetworkAxis !== currentIsNetworkAxis) {
    return candidateIsNetworkAxis;
  }
  if (candidate.y !== current.y) {
    return candidate.y > current.y;
  }
  return candidate.x < current.x;
}

function hasGpzLineBay(detail: StationBlockDetailV1 | undefined): boolean {
  return detail?.fields.some((field) => field.fieldRole === FieldRoleV1.GPZ_LINE_BAY) ?? false;
}

function phase3_place_stations_and_branches(
  graph: VisualGraphV1,
  config: LayoutGeometryConfigV1,
  state: PipelineState,
  stationBlockDetails: ReadonlyMap<string, StationBlockDetailV1> = new Map(),
): void {
  const { defaultSymbolWidth, defaultSymbolHeight, busHeight } = config;
  const adj = buildAdjacency(graph);

  // Find station nodes
  const stationNodes = graph.nodes
    .filter(n => isStationType(n.nodeType))
    .sort((a, b) => a.id.localeCompare(b.id));

  // Track branch-side usage per trunk position to avoid overlaps
  const usedSides = new Map<string, Set<1 | -1>>();

  // Build station → bus membership for parent lookup.
  // Station nodes may contain buses implicitly through StationBlockDetailV1, so
  // direct graph edges are not enough after guided station insertion.
  const stationBusMap = new Map<string, string[]>();
  for (const node of graph.nodes) {
    if (isStationType(node.nodeType)) {
      stationBusMap.set(node.id, collectStationBusIds(node, graph, adj, stationBlockDetails));
    }
  }

  for (const station of stationNodes) {
    // Determine placement for station
    const alreadyPlaced = state.placements.has(station.id);

    // Find parent trunk node:
    // 1. Check direct edge neighbors
    // 2. Check internal bus membership (station → bus)
    const neighbors = adj.get(station.id) ?? [];
    let parentPlacement: MutablePlacement | null = null;

    // Sort neighbors for determinism
    const sortedNeighbors = [...neighbors].sort((a, b) => a.nodeId.localeCompare(b.nodeId));
    for (const n of sortedNeighbors) {
      if (state.placements.has(n.nodeId) && n.nodeId !== station.id) {
        const pl = state.placements.get(n.nodeId)!;
        if (isBetterStationParent(pl, parentPlacement)) {
          parentPlacement = pl;
        }
      }
    }

    // If no direct parent found, check internal buses
    if (!parentPlacement) {
      const internalBuses = stationBusMap.get(station.id) ?? [];
      parentPlacement = findBestPlacedParentForStationBuses(internalBuses, state, config);
    }

    // If still no parent, check ALL placed nodes and find one that's
    // connected to a bus that this station should contain.
    // This handles the case where topology has station.busIds → bus nodes
    // but no explicit edge between station and bus in the visual graph.
    if (!parentPlacement) {
      // Check all placed BUS nodes that could belong to this station
      // by looking at connections from station's edges
      for (const [nodeId, placement] of state.placements) {
        const node = graph.nodes.find(n => n.id === nodeId);
        if (node && isBusType(node.nodeType)) {
          // Check if this bus is connected to a neighbor of the station
          const busNeighbors = adj.get(nodeId) ?? [];
          for (const bn of busNeighbors) {
            if (bn.nodeId === station.id || (adj.get(station.id) ?? []).some(s => s.nodeId === nodeId)) {
              if (isBetterStationParent(placement, parentPlacement)) {
                parentPlacement = placement;
              }
            }
          }
        }
      }
    }

    // If not already placed, assign position
    if (!alreadyPlaced) {
      if (!parentPlacement) {
        // No parent found — will be placed in unplaced loop below
        continue;
      }

      // Determine branch side (left/right)
      let side = deterministicBranchSide(station.id);

      // Check if side is already used at this trunk position
      const posKey = `${parentPlacement.x}_${parentPlacement.y}`;
      if (!usedSides.has(posKey)) usedSides.set(posKey, new Set());
      const used = usedSides.get(posKey)!;
      if (used.has(side)) {
        side = (side === 1 ? -1 : 1) as 1 | -1;
      }
      used.add(side);
      state.branchSides.set(station.id, side);

      const stationDetail = stationBlockDetails.get(station.id);
      const isGpzSwitchgearStation = hasGpzLineBay(stationDetail);

      // Station position: horizontal offset + drop down.
      // A downstream SN/nN station must never be drawn inside the GPZ bay area.
      // The GPZ block itself stays near the source, all other stations start
      // below the feeder bay clearance corridor.
      const stationX = snap(parentPlacement.x + side * BRANCH_OFFSET_X);
      const downstreamClearanceY = snap(Y_GPZ + 10 * OFFSET_POLE);
      const stationY = isGpzSwitchgearStation
        ? snap(parentPlacement.y + TRUNK_STEP_Y)
        : snap(Math.max(parentPlacement.y + 2 * TRUNK_STEP_Y, downstreamClearanceY));

      state.placements.set(station.id, {
        nodeId: station.id,
        x: stationX,
        y: stationY,
        width: STATION_BLOCK_WIDTH,
        height: STATION_BLOCK_HEIGHT,
        layer: 5,
        bandIndex: 0,
        autoPositioned: true,
      });
    }

    // Get current placement (may have been set in phase2 or just now)
    const currentPlacement = state.placements.get(station.id);
    if (!currentPlacement) continue;

    const blockType = nodeTypeToStationBlockType(station.nodeType);
    let blockWidth: number = STATION_BLOCK_WIDTH;
    let blockHeight: number = STATION_BLOCK_HEIGHT;

    switch (blockType) {
      case StationBlockType.TYPE_B:
        blockWidth = snap(STATION_BLOCK_WIDTH * 1.2);
        blockHeight = snap(STATION_BLOCK_HEIGHT * 1.2);
        break;
      case StationBlockType.TYPE_C:
        blockWidth = snap(STATION_BLOCK_WIDTH * 1.5);
        blockHeight = snap(STATION_BLOCK_HEIGHT * 1.2);
        break;
      case StationBlockType.TYPE_D:
        blockWidth = snap(STATION_BLOCK_WIDTH * 2);
        blockHeight = snap(STATION_BLOCK_HEIGHT * 1.5);
        break;
    }

    // Update placement size for station block dimensions
    currentPlacement.width = blockWidth;
    currentPlacement.height = blockHeight;

    // Create switchgear block using current placement position
    const stationX = currentPlacement.x;
    const stationY = currentPlacement.y;
    const bounds: RectangleV1 = {
      x: stationX,
      y: stationY,
      width: blockWidth,
      height: blockHeight,
    };

    const ports: SwitchgearPortV1[] = [
      { portId: 'in', role: 'IN', position: { x: stationX + blockWidth / 2, y: stationY } },
      { portId: 'out', role: 'OUT', position: { x: stationX + blockWidth / 2, y: stationY + blockHeight } },
      { portId: 'branch', role: 'BRANCH', position: { x: stationX + blockWidth, y: stationY + blockHeight / 2 } },
    ];

    if (blockType === StationBlockType.TYPE_D) {
      ports.push(
        { portId: 'coupler_a', role: 'COUPLER_A', position: { x: stationX + blockWidth / 3, y: stationY + blockHeight / 2 } },
        { portId: 'coupler_b', role: 'COUPLER_B', position: { x: stationX + 2 * blockWidth / 3, y: stationY + blockHeight / 2 } },
      );
    }

    // Collect internal nodes
    const stationBusIds = new Set<string>();
    for (const edge of graph.edges) {
      if (edge.fromPortRef.nodeId === station.id || edge.toPortRef.nodeId === station.id) {
        const otherId = edge.fromPortRef.nodeId === station.id
          ? edge.toPortRef.nodeId : edge.fromPortRef.nodeId;
        stationBusIds.add(otherId);
      }
    }
    const internalIds: string[] = [];
    for (const node of graph.nodes) {
      if (
        node.nodeType === NodeTypeV1.TRANSFORMER_SN_NN ||
        node.nodeType === NodeTypeV1.BUS_NN ||
        node.nodeType === NodeTypeV1.LOAD
      ) {
        const isConnected = graph.edges.some(e =>
          (e.fromPortRef.nodeId === node.id && stationBusIds.has(e.toPortRef.nodeId)) ||
          (e.toPortRef.nodeId === node.id && stationBusIds.has(e.fromPortRef.nodeId)) ||
          (e.fromPortRef.nodeId === node.id && e.toPortRef.nodeId === station.id) ||
          (e.toPortRef.nodeId === node.id && e.fromPortRef.nodeId === station.id)
        );
        if (isConnected) {
          internalIds.push(node.id);
        }
      }
    }

    state.blocks.push({
      blockId: station.id,
      blockType,
      bounds,
      ports,
      internalNodes: internalIds.sort(),
      label: station.attributes.label,
      detail: null,
    });

    // Place internal nodes inside station block
    let internalY = snap(stationY + config.blockMargin);
    for (const intId of internalIds.sort()) {
      const intNode = graph.nodes.find(n => n.id === intId);
      if (!intNode || state.placements.has(intId)) continue;

      let w = defaultSymbolWidth;
      let h = defaultSymbolHeight;
      if (isBusType(intNode.nodeType)) {
        w = snap(blockWidth - config.blockMargin * 2);
        h = busHeight;
      }

      state.placements.set(intId, {
        nodeId: intId,
        x: snap(stationX + (blockWidth - w) / 2),
        y: snap(internalY),
        width: w,
        height: h,
        layer: 6,
        bandIndex: 0,
        autoPositioned: true,
      });

      internalY = snap(internalY + h + OFFSET_POLE);
    }
  }

  // Place remaining unplaced nodes (branch junctions, loads not in stations, generators, orphan stations)
  const unplacedNodes = graph.nodes
    .filter(n => !state.placements.has(n.id))
    .sort((a, b) => a.id.localeCompare(b.id));

  let quarantineIndex = 0;
  for (const node of unplacedNodes) {
    // Find parent via any edge
    const neighbors = adj.get(node.id) ?? [];
    let bestParent: MutablePlacement | null = null;

    const sortedNbrs = [...neighbors].sort((a, b) => a.nodeId.localeCompare(b.nodeId));
    for (const n of sortedNbrs) {
      if (state.placements.has(n.nodeId)) {
        const pl = state.placements.get(n.nodeId)!;
        if (!bestParent || pl.y < bestParent.y) {
          bestParent = pl;
        }
      }
    }

    let w = defaultSymbolWidth;
    let h = defaultSymbolHeight;
    if (isBusType(node.nodeType)) {
      w = snap(node.attributes.width ?? config.defaultBusWidth);
      h = busHeight;
    }
    if (isStationType(node.nodeType)) {
      w = STATION_BLOCK_WIDTH;
      h = STATION_BLOCK_HEIGHT;
    }

    if (bestParent) {
      // L-shape branch: side + down
      const side = deterministicBranchSide(node.id);
      state.branchSides.set(node.id, side);

      state.placements.set(node.id, {
        nodeId: node.id,
        x: snap(bestParent.x + side * BRANCH_OFFSET_X),
        y: snap(bestParent.y + TRUNK_STEP_Y),
        width: w,
        height: h,
        layer: 4,
        bandIndex: 0,
        autoPositioned: true,
      });
    } else {
      // Quarantine: no parent found, place at bottom
      const quarantineY = snap(Y_GPZ + 20 * OFFSET_POLE + quarantineIndex * TRUNK_STEP_Y);
      state.placements.set(node.id, {
        nodeId: node.id,
        x: snap(X_START + quarantineIndex * GRID_SPACING_MAIN),
        y: quarantineY,
        width: w,
        height: h,
        layer: 9,
        bandIndex: 0,
        autoPositioned: true,
      });
      quarantineIndex++;
    }

    // If this is a station node that wasn't handled above, create a block for it
    if (isStationType(node.nodeType) && !state.blocks.some(b => b.blockId === node.id)) {
      const cp = state.placements.get(node.id)!;
      const bType = nodeTypeToStationBlockType(node.nodeType);
      state.blocks.push({
        blockId: node.id,
        blockType: bType,
        bounds: { x: cp.x, y: cp.y, width: cp.width, height: cp.height },
        ports: [
          { portId: 'in', role: 'IN', position: { x: cp.x + cp.width / 2, y: cp.y } },
          { portId: 'out', role: 'OUT', position: { x: cp.x + cp.width / 2, y: cp.y + cp.height } },
          { portId: 'branch', role: 'BRANCH', position: { x: cp.x + cp.width, y: cp.y + cp.height / 2 } },
        ],
        internalNodes: [],
        label: node.attributes.label,
        detail: null,
      });
    }
  }
}

// =============================================================================
// PHASE 4: ROUTE ALL EDGES (ORTHOGONAL, VERTICAL-FIRST)
// =============================================================================

/**
 * Faza 4: Routing wszystkich krawędzi.
 *
 * VERTICAL SN RULES:
 * - TRUNK edges: vertical-first (same X → straight down; different X → Z-shape)
 * - BRANCH edges: L-shape (horizontal to branch X, then vertical)
 * - SECONDARY_CONNECTOR (ring/NOP): orthogonal via secondary channel
 * - TRANSFORMER_LINK: straight vertical
 * - ALL segments orthogonal (0° or 90°)
 * - ALL points snapped to GRID_BASE
 */
function phase4_route_all_edges(
  graph: VisualGraphV1,
  config: LayoutGeometryConfigV1,
  state: PipelineState,
): void {
  const sortedEdges = [...graph.edges].sort((a, b) => a.id.localeCompare(b.id));
  let secondaryLaneCounter = 0;

  // Build set of root bus IDs (layer 1 = GPZ busbar) for routing optimization
  const rootBusNodeIds = new Set<string>();
  for (const [nodeId, p] of state.placements) {
    const node = graph.nodes.find(n => n.id === nodeId);
    if (node && node.nodeType === NodeTypeV1.BUS_SN && p.layer === 1) {
      rootBusNodeIds.add(nodeId);
    }
  }

  for (const edge of sortedEdges) {
    const fromP = state.placements.get(edge.fromPortRef.nodeId);
    const toP = state.placements.get(edge.toPortRef.nodeId);

    // Smart routing: when one endpoint is a root bus (wide GPZ busbar),
    // use the OTHER endpoint's center X as the connection point on the bus.
    // This creates clean vertical feeders from the bus at field positions.
    let startX: number, startY: number, endX: number, endY: number;

    const fromIsRootBus = rootBusNodeIds.has(edge.fromPortRef.nodeId);
    const toIsRootBus = rootBusNodeIds.has(edge.toPortRef.nodeId);

    if (fromIsRootBus && toP) {
      // FROM root bus → use target's center X (feeder field position) on the bus
      const targetCX = snap(toP.x + toP.width / 2);
      startX = targetCX;
      startY = fromP ? snap(fromP.y + fromP.height) : 0;  // bottom edge of bus
      endX = targetCX;
      endY = toP ? snap(toP.y) : 0;  // top edge of target
    } else if (toIsRootBus && fromP) {
      // TO root bus → use source's center X on the bus
      const sourceCX = snap(fromP.x + fromP.width / 2);
      startX = sourceCX;
      startY = fromP ? snap(fromP.y + fromP.height) : 0;
      endX = sourceCX;
      endY = toP ? snap(toP.y) : 0;
    } else {
      // Normal: center-to-center
      startX = fromP ? snap(fromP.x + fromP.width / 2) : snap(config.spineX);
      startY = fromP ? snap(fromP.y + fromP.height / 2) : 0;
      endX = toP ? snap(toP.x + toP.width / 2) : snap(config.spineX);
      endY = toP ? snap(toP.y + toP.height / 2) : 0;
    }

    // Ensure start is above end (smaller Y first) for downward growth
    const [sx, sy, ex, ey] = startY <= endY
      ? [startX, startY, endX, endY]
      : [endX, endY, startX, startY];

    const startPoint: PointV1 = { x: sx, y: sy };
    const endPoint: PointV1 = { x: ex, y: ey };

    let segments: PathSegmentV1[];
    let laneIndex = 0;

    if (edge.edgeType === EdgeTypeV1.TRUNK) {
      // TRUNK: vertical first, then horizontal if needed
      if (Math.abs(sx - ex) < GRID_BASE) {
        // Same X → straight vertical
        segments = [
          { from: startPoint, to: endPoint },
        ];
      } else {
        // Different X → Z-shape: vertical to midY, horizontal, vertical to end
        const midY = snap((sy + ey) / 2);
        segments = [
          { from: startPoint, to: { x: sx, y: midY } },
          { from: { x: sx, y: midY }, to: { x: ex, y: midY } },
          { from: { x: ex, y: midY }, to: endPoint },
        ];
      }
    } else if (edge.edgeType === EdgeTypeV1.SECONDARY_CONNECTOR) {
      // Ring/NOP: orthogonal via secondary channel (horizontal offset)
      laneIndex = secondaryLaneCounter++;
      const channelX = snap(Math.max(sx, ex) + SECONDARY_CHANNEL_OFFSET_X + laneIndex * config.secondaryLanePitch);

      segments = [
        { from: startPoint, to: { x: channelX, y: sy } },
        { from: { x: channelX, y: sy }, to: { x: channelX, y: ey } },
        { from: { x: channelX, y: ey }, to: endPoint },
      ];
    } else if (edge.edgeType === EdgeTypeV1.TRANSFORMER_LINK) {
      // Transformer: straight vertical
      if (Math.abs(sx - ex) < GRID_BASE) {
        segments = [{ from: startPoint, to: endPoint }];
      } else {
        // L-shape if not aligned
        segments = [
          { from: startPoint, to: { x: sx, y: ey } },
          { from: { x: sx, y: ey }, to: endPoint },
        ];
      }
    } else {
      // BRANCH and others: L-shape (horizontal then vertical)
      if (Math.abs(sx - ex) < GRID_BASE) {
        // Same X → straight vertical
        segments = [{ from: startPoint, to: endPoint }];
      } else if (Math.abs(sy - ey) < GRID_BASE) {
        // Same Y → straight horizontal
        segments = [{ from: startPoint, to: endPoint }];
      } else {
        // L-shape: horizontal first, then vertical
        segments = [
          { from: startPoint, to: { x: ex, y: sy } },
          { from: { x: ex, y: sy }, to: endPoint },
        ];
      }
    }

    // Snap ALL routing points to GRID_BASE
    segments = segments.map(s => ({
      from: { x: snap(s.from.x), y: snap(s.from.y) },
      to: { x: snap(s.to.x), y: snap(s.to.y) },
    }));

    // Filter out zero-length segments
    segments = segments.filter(s =>
      Math.abs(s.from.x - s.to.x) >= 1 || Math.abs(s.from.y - s.to.y) >= 1
    );

    if (segments.length === 0) {
      segments = [{ from: startPoint, to: endPoint }];
    }

    state.routes.push({
      edgeId: edge.id,
      edgeType: edge.edgeType,
      segments,
      startPoint: segments[0].from,
      endPoint: segments[segments.length - 1].to,
      laneIndex,
      isNormallyOpen: edge.isNormallyOpen,
    });
  }
}

// =============================================================================
// PHASE 5: PLACE LABELS (DETERMINISTIC, NO OVERLAPS)
// =============================================================================

/**
 * Faza 5: Umieszczenie etykiet.
 *
 * VERTICAL SN LABEL RULES:
 * - Segmenty pionowe: etykieta po prawej stronie (fallback: lewa, stack)
 * - Odgałęzienia: etykieta na odcinku poziomym
 * - Stacje: nazwa nad blokiem
 * - Zakaz etykiet nałożonych na symbole
 * - Deterministic tiebreak (sort po id)
 */
function phase5_place_labels(
  _graph: VisualGraphV1,
  _config: LayoutGeometryConfigV1,
  _state: PipelineState,
): void {
  // Labels are placed in the rendering layer, not in the layout result.
  // The layout pipeline only provides positions and routes.
  // Label placement is handled by the existing phase5-routing.ts in the engine.
}

// =============================================================================
// PHASE 6: ENFORCE INVARIANTS AND FINALIZE HASH
// =============================================================================

/**
 * Faza 6: Wymuszenie inwariancji i finalizacja.
 *
 * - Sprawdź symbol-symbol overlap (= 0, resolve w osi Y).
 * - Y-ONLY push-away (NIGDY nie przesuwaj w osi X — zachowaj magistrali)
 * - Oblicz bounds.
 * - Catalog refs, relay bindings.
 * - Oblicz hash (world geometry only).
 */
function phase6_enforce_invariants_and_finalize(
  graph: VisualGraphV1,
  config: LayoutGeometryConfigV1,
  state: PipelineState,
): void {
  // 1. Resolve symbol-symbol overlaps — Y-ONLY push-away
  const MAX_ITERATIONS = 20;
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let hasOverlap = false;
    const entries = [...state.placements.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i][1];
        const b = entries[j][1];

        // AABB overlap check
        if (
          a.x < b.x + b.width && a.x + a.width > b.x &&
          a.y < b.y + b.height && a.y + a.height > b.y
        ) {
          hasOverlap = true;
          // Y-ONLY push-away — NIGDY nie przesuwaj w osi X
          if (a.layer > b.layer || (a.layer === b.layer && a.nodeId > b.nodeId)) {
            a.y = snap(b.y + b.height + config.blockMargin);
          } else {
            b.y = snap(a.y + a.height + config.blockMargin);
          }
        }
      }
    }

    if (!hasOverlap) break;
  }

  // 2. Catalog validation
  for (const node of graph.nodes) {
    const category = nodeTypeToCatalogCategory(node.nodeType);
    if (category !== null) {
      state.catalogRefs.push({
        nodeId: node.id,
        catalogTypeId: null,
        catalogCategory: category,
      });
      state.validationErrors.push({
        code: 'MISSING_CATALOG_REF',
        message: `Węzeł ${node.id} (${node.attributes.elementName}) wymaga referencji do katalogu (${category})`,
        nodeId: node.id,
        fixAction: `Przypisz typ z katalogu ${category} do elementu ${node.attributes.elementName}`,
      });
    }
  }

  // 3. Relay binding
  const breakerNodes = graph.nodes
    .filter(n => n.nodeType === NodeTypeV1.SWITCH_BREAKER)
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const cb of breakerNodes) {
    const cbPlacement = state.placements.get(cb.id);
    if (cbPlacement) {
      state.relayBindings.push({
        breakerNodeId: cb.id,
        relayId: `relay_${cb.id}`,
        functions: ['50', '51'],
        ctNodeId: null,
        relayPosition: {
          x: cbPlacement.x + cbPlacement.width / 2,
          y: cbPlacement.y + config.relayOffsetY,
        },
      });
    }
  }
}

// =============================================================================
// PHASE 7: CANONICAL SLD ANNOTATIONS
// =============================================================================

function edgeNumber(
  attributes: VisualEdgeAttributesV1,
  keys: readonly string[],
): number | null {
  const rawAttributes = attributes as unknown as Record<string, unknown>;
  for (const key of keys) {
    const value = rawAttributes[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function edgeString(
  attributes: VisualEdgeAttributesV1,
  keys: readonly string[],
): string | null {
  const rawAttributes = attributes as unknown as Record<string, unknown>;
  for (const key of keys) {
    const value = rawAttributes[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function nodeNumber(
  attributes: VisualNodeAttributesV1 | null | undefined,
  keys: readonly string[],
): number | null {
  if (!attributes) {
    return null;
  }
  const rawAttributes = attributes as unknown as Record<string, unknown>;
  for (const key of keys) {
    const value = rawAttributes[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function isEngineeringDisplayName(value: string | undefined, fallbackId: string): boolean {
  const normalized = value?.trim();
  if (!normalized || normalized === fallbackId) return false;
  if (/^\d+$/.test(normalized)) return false;
  if (/^[a-f0-9]{8,}$/i.test(normalized)) return false;
  if (/^(sn|nn|gpz|tr|station)?[/-]?[a-f0-9]{8,}$/i.test(normalized)) return false;
  return true;
}

/**
 * Phase 7: Generate canonical SLD annotations.
 *
 * Generates rendering annotations for CANONICAL/IEC-style canonical SLD:
 * - TrunkNodeAnnotationV1[] — numbered nodes on trunk with km/U/Ik3
 * - TrunkSegmentAnnotationV1[] — trunk segments with impedance parameters
 * - BranchPointV1[] — branch points with apparatus and line data
 * - StationFieldAnnotationV1[] — station field annotations
 *
 * RULE: Phase 7 does NOT modify Phase 1-6 results.
 *       It adds ONLY rendering annotations.
 *
 * DETERMINISM: Same input produces identical output.
 */
function phase7_generate_canonical_annotations(
  graph: VisualGraphV1,
  _placements: readonly NodePlacementV1[],
  _routes: readonly EdgeRouteV1[],
  _config: LayoutGeometryConfigV1,
  stationBlocks: readonly MutableBlock[],
): CanonicalAnnotationsV1 | null {
  if (graph.nodes.length === 0 && graph.edges.length === 0) {
    return null;
  }

  // Identify trunk edges
  const trunkEdges = graph.edges
    .filter(e => e.edgeType === EdgeTypeV1.TRUNK)
    .sort((a, b) => a.id.localeCompare(b.id));

  // Build placement lookup
  const placementMap = new Map<string, NodePlacementV1>();
  for (const p of _placements) {
    placementMap.set(p.nodeId, p);
  }

  const blockDetailMap = new Map<string, StationBlockDetailV1>();
  for (const block of stationBlocks) {
    if (block.detail) {
      blockDetailMap.set(block.blockId, block.detail);
    }
  }
  const branchPointDetailMap = resolveBranchPointDetailsForGraph(graph);

  const gpzSections: GpzSectionV1[] = [];
  const gpzFeederFields: GpzFieldAnnotationV1[] = [];
  const sourceNodeIdsByBus = new Map<string, string[]>();
  const sourceNodes = graph.nodes
    .filter((node) => isSourceType(node.nodeType))
    .sort((left, right) => left.id.localeCompare(right.id));
  for (const source of sourceNodes) {
    const connectedToNodeId = source.attributes.connectedToNodeId;
    if (typeof connectedToNodeId === 'string' && connectedToNodeId) {
      sourceNodeIdsByBus.set(connectedToNodeId, [
        ...(sourceNodeIdsByBus.get(connectedToNodeId) ?? []),
        source.id,
      ]);
    }
    for (const edge of graph.edges) {
      const otherNodeId = edge.fromPortRef.nodeId === source.id
        ? edge.toPortRef.nodeId
        : edge.toPortRef.nodeId === source.id
          ? edge.fromPortRef.nodeId
          : null;
      if (otherNodeId) {
        sourceNodeIdsByBus.set(otherNodeId, [
          ...(sourceNodeIdsByBus.get(otherNodeId) ?? []),
          source.id,
        ]);
      }
    }
  }

  for (const block of [...stationBlocks].sort((left, right) => left.blockId.localeCompare(right.blockId))) {
    const detail = block.detail;
    if (!detail) {
      continue;
    }
    const fields = detail.fields
      .filter((field) => field.fieldRole === FieldRoleV1.GPZ_LINE_BAY)
      .sort((left, right) => left.id.localeCompare(right.id));
    if (fields.length === 0) {
      continue;
    }

    const firstFieldBusId = fields[0].busSectionId ?? null;
    const rootBusId = firstFieldBusId ?? detail.busSections[0]?.id ?? block.blockId;
    const rootBusPlacement = placementMap.get(rootBusId);
    const gpzFieldPitchX = GRID_BASE * 6;
    const busbar = rootBusPlacement
      ? {
          x: rootBusPlacement.bounds.x,
          y: rootBusPlacement.bounds.y,
          width: rootBusPlacement.bounds.width,
          height: rootBusPlacement.bounds.height,
        }
      : {
          x: block.bounds.x,
          y: Math.max(Y_GPZ, block.bounds.y - OFFSET_POLE),
          width: Math.max(block.bounds.width, (fields.length - 1) * gpzFieldPitchX + 2 * GRID_BASE),
          height: 10,
        };
    const totalFieldWidth = (fields.length - 1) * gpzFieldPitchX;
    const firstAxisX = snap(busbar.x + busbar.width / 2 - totalFieldWidth / 2);
    const fieldAxes = new Map<string, number>();

    for (let index = 0; index < fields.length; index++) {
      const field = fields[index];
      const rootId = field.busSectionId ?? rootBusId;
      const axisX = snap(firstAxisX + index * gpzFieldPitchX);
      fieldAxes.set(field.id, axisX);
      gpzFeederFields.push({
        fieldId: field.id,
        feederNodeId: field.terminals.outgoingNodeId ?? field.id,
        rootBusId: rootId,
        designation: field.name ?? field.id,
        axisX,
        busTap: { x: axisX, y: snap(busbar.y + busbar.height) },
        segmentStart: { x: axisX, y: snap(busbar.y + busbar.height + 4 * OFFSET_POLE) },
        headCenter: { x: axisX, y: snap(busbar.y + busbar.height + 3 * OFFSET_POLE) },
        detail,
      });
    }

    const sections = detail.busSections.length > 0
      ? [...detail.busSections].sort((left, right) => left.orderIndex - right.orderIndex || left.id.localeCompare(right.id))
      : [{ id: rootBusId, stationId: block.blockId, orderIndex: 0, catalogRef: null }];
    for (const section of sections) {
      const sectionFields = fields.filter((field) => field.busSectionId === section.id);
      const effectiveFields = sectionFields.length > 0 ? sectionFields : fields;
      const axes = effectiveFields
        .map((field) => fieldAxes.get(field.id))
        .filter((axis): axis is number => typeof axis === 'number');
      if (axes.length === 0) {
        continue;
      }
      const minAxis = Math.min(...axes);
      const maxAxis = Math.max(...axes);
      gpzSections.push({
        sectionId: section.id,
        rootBusId,
        rootBusName: graph.nodes.find((node) => node.id === rootBusId)?.attributes.label ?? null,
        order: section.orderIndex,
        bounds: {
          x: snap(minAxis - GRID_BASE * 2),
          y: snap(busbar.y - GRID_BASE),
          width: snap(maxAxis - minAxis + GRID_BASE * 4),
          height: snap(3 * OFFSET_POLE + GRID_BASE),
        },
        busbar,
        centerX: snap((minAxis + maxAxis) / 2),
        fieldIds: effectiveFields.map((field) => field.id).sort(),
        sourceNodeIds: [...new Set(sourceNodeIdsByBus.get(rootBusId) ?? [])].sort(),
        leftCouplerEdgeId: null,
        rightCouplerEdgeId: null,
      });
    }
  }

  // Build trunk node annotations
  const trunkNodes: TrunkNodeAnnotationV1[] = [];
  let nodeIndex = 1;
  const cumulativeKm = 0;

  // Collect all unique nodes on trunk edges in order
  const trunkNodeIds = new Set<string>();
  for (const edge of trunkEdges) {
    trunkNodeIds.add(edge.fromPortRef.nodeId);
    trunkNodeIds.add(edge.toPortRef.nodeId);
  }

  const sortedTrunkNodeIds = [...trunkNodeIds].sort((a, b) => {
    const pa = placementMap.get(a);
    const pb = placementMap.get(b);
    if (!pa || !pb) return a.localeCompare(b);
    return pa.position.y - pb.position.y;
  });

  for (const nodeId of sortedTrunkNodeIds) {
    const placement = placementMap.get(nodeId);
    if (!placement) continue;

    // Check if this node has any BRANCH edges (is a branch point)
    const hasBranch = graph.edges.some(
      e => e.edgeType === EdgeTypeV1.BRANCH &&
           (e.fromPortRef.nodeId === nodeId || e.toPortRef.nodeId === nodeId)
    );

    const node = graph.nodes.find(n => n.id === nodeId);
    const voltageKV = node?.attributes.voltageKv ?? 15;

    trunkNodes.push({
      nodeId: `N${String(nodeIndex).padStart(2, '0')}`,
      trunkId: 'M1',
      kmFromGPZ: cumulativeKm,
      voltageKV,
      ikss3p: nodeNumber(node?.attributes, ['ikss3p', 'ikss3pKa', 'ik3pKa', 'ik3p_ka']),
      deltaU_percent: nodeNumber(node?.attributes, ['deltaU_percent', 'deltaUPercent', 'delta_u_percent']),
      position: placement.position,
      branchStationId: hasBranch ? nodeId : null,
    });

    nodeIndex++;
  }

  // Build trunk segment annotations
  const trunkSegments: TrunkSegmentAnnotationV1[] = [];
  for (let i = 0; i < trunkEdges.length; i++) {
    const edge = trunkEdges[i];
    const isOverhead = edge.attributes.branchType === 'LINE';
    const designation = edgeString(edge.attributes, ['designation', 'iecDesignation', 'segmentCode'])
      ?? `W-M1-${String(i + 1).padStart(2, '0')}`;

    trunkSegments.push({
      segmentId: edge.id,
      designation,
      cableType: edge.attributes.branchType ?? 'Typ z katalogu',
      isOverhead,
      lengthKm: edge.attributes.lengthKm,
      resistance_ohm: edgeNumber(edge.attributes, ['resistance_ohm', 'r_ohm']),
      reactance_ohm: edgeNumber(edge.attributes, ['reactance_ohm', 'x_ohm']),
      capacitance_uF_per_km: null,
      ampacity_A: edgeNumber(edge.attributes, ['ampacity_A', 'rated_current_a']),
      current_A: edgeNumber(edge.attributes, ['current_A', 'current_a']),
      power_MW: edgeNumber(edge.attributes, ['power_MW', 'p_mw']),
    });
  }

  // Build branch point annotations
  const branchPoints: BranchPointV1[] = [];
  const branchEdges = graph.edges
    .filter(e => e.edgeType === EdgeTypeV1.BRANCH)
    .sort((a, b) => a.id.localeCompare(b.id));

  for (let i = 0; i < branchEdges.length; i++) {
    const edge = branchEdges[i];
    const fromPlacement = placementMap.get(edge.fromPortRef.nodeId);
    if (!fromPlacement) continue;

    const isOverhead = edge.attributes.branchType === 'LINE';
    const physicalLocationPrefix = isOverhead ? 'SO' : 'ZK';

    // Find corresponding trunk node
    const trunkNode = trunkNodes.find(tn =>
      tn.branchStationId === edge.fromPortRef.nodeId
    );

    const branchPoint: BranchPointV1 = {
      branchId: `OG-M1-${String(i + 1).padStart(2, '0')}`,
      sourceEdgeId: edge.id,
      trunkNodeId: trunkNode?.nodeId ?? `N${String(i + 1).padStart(2, '0')}`,
      physicalLocation: physicalLocationPrefix,
      physicalLocationId: `${physicalLocationPrefix}-${String(i + 1).padStart(2, '0')}`,
      branchApparatus: {
        designation: `Q-O${i + 1}`,
        type: 'disconnector',
        ratedCurrent_A: edgeNumber(edge.attributes, ['switch_rated_current_a', 'rated_current_a']),
        ratedVoltage_kV: edgeNumber(edge.attributes, ['rated_voltage_kv', 'voltage_rating_kv']),
      },
      branchLine: {
        designation: edge.attributes.label || `Odgałęzienie SN ${i + 1}`,
        cableType: edge.attributes.branchType ?? 'Typ z katalogu',
        lengthKm: edge.attributes.lengthKm,
        resistance_ohm: edgeNumber(edge.attributes, ['resistance_ohm', 'r_ohm']),
        reactance_ohm: edgeNumber(edge.attributes, ['reactance_ohm', 'x_ohm']),
        ampacity_A: edgeNumber(edge.attributes, ['ampacity_A', 'rated_current_a']),
        isOverhead,
      },
      targetStationId: edge.toPortRef.nodeId,
      position: fromPlacement.position,
    };

    branchPoints.push({
      ...branchPoint,
      detail: branchPointDetailMap?.get(edge.id) ?? null,
    });
  }

  // Build station apparatus chains
  const stationChains: StationFieldAnnotationV1[] = [];
  const stationNodes = graph.nodes
    .filter(n =>
      n.nodeType === NodeTypeV1.STATION_SN_NN_A ||
      n.nodeType === NodeTypeV1.STATION_SN_NN_B ||
      n.nodeType === NodeTypeV1.STATION_SN_NN_C ||
      n.nodeType === NodeTypeV1.STATION_SN_NN_D
    )
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const station of stationNodes) {
    const placement = placementMap.get(station.id);
    if (!placement) continue;

    const stationType = station.nodeType === NodeTypeV1.STATION_SN_NN_A ? 'TYPE_A'
      : station.nodeType === NodeTypeV1.STATION_SN_NN_B ? 'TYPE_B'
      : station.nodeType === NodeTypeV1.STATION_SN_NN_C ? 'TYPE_C'
      : 'TYPE_D';

    // Detect OZE from connected nodes
    const connectedEdges = graph.edges.filter(
      e => e.fromPortRef.nodeId === station.id || e.toPortRef.nodeId === station.id
    );
    const connectedNodeIds = connectedEdges.map(e =>
      e.fromPortRef.nodeId === station.id ? e.toPortRef.nodeId : e.fromPortRef.nodeId
    );
    const connectedNodes = graph.nodes.filter(n => connectedNodeIds.includes(n.id));
    const pvNode = connectedNodes.find(n => n.nodeType === NodeTypeV1.GENERATOR_PV);
    const bessNode = connectedNodes.find(n => n.nodeType === NodeTypeV1.GENERATOR_BESS);
    const windNode = connectedNodes.find(n => n.nodeType === NodeTypeV1.GENERATOR_WIND);
    const hasOZE = !!(pvNode || bessNode || windNode);
    const ozeType = pvNode ? 'PV' as const
      : bessNode ? 'BESS' as const
      : windNode ? 'WIND' as const
      : null;

    const stationDisplayName = isEngineeringDisplayName(station.attributes.label, station.id)
      ? station.attributes.label
      : `Stacja SN/nN ${stationChains.length + 1}`;
    const baseX = placement.position.x;
    const baseY = placement.position.y;
    const stepY = 40;
    const transformerParameters: Record<string, string | number> = {};
    if (typeof station.attributes.ratedPowerMva === 'number' && Number.isFinite(station.attributes.ratedPowerMva)) {
      transformerParameters.Sn = `${station.attributes.ratedPowerMva} MVA`;
    }

    const apparatus: StationApparatusItemV1[] = [
      {
        designation: `QS-${station.id.slice(-2)}`,
        symbolType: 'disconnector',
        label: 'Rozłącznik SN',
        parameters: {},
        position: { x: baseX, y: baseY },
      },
      {
        designation: `Q-${station.id.slice(-2)}`,
        symbolType: 'circuit_breaker',
        label: 'Wyłącznik',
        parameters: {},
        position: { x: baseX, y: baseY + stepY },
      },
      {
        designation: `A-${station.id.slice(-2)}`,
        symbolType: 'ct',
        label: 'Przekładnik prądowy',
        parameters: {},
        position: { x: baseX, y: baseY + stepY * 2 },
      },
      {
        designation: `T-${station.id.slice(-2)}`,
        symbolType: 'transformer_2w',
        label: 'Transformator SN/nN',
        parameters: transformerParameters,
        position: { x: baseX, y: baseY + stepY * 3 },
      },
    ];

    // Nastawy i wyniki zabezpieczeń pochodzą z backendu; SLD nie fabrykuje wartości.
    const protection: ProtectionRelayV1[] = [];

    // Odpływy nN/OZE pokazujemy tylko dla elementów faktycznie obecnych w grafie.
    const feeders: NNFeederV1[] = [];

    if (pvNode) {
      feeders.push({
        designation: pvNode.attributes.label || 'PV',
        type: 'generator_pv',
        power_kW: typeof pvNode.attributes.ratedPowerMva === 'number'
          ? pvNode.attributes.ratedPowerMva * 1000
          : 0,
        cosPhi: null,
        additionalParams: {},
      });
    }
    if (bessNode) {
      feeders.push({
        designation: bessNode.attributes.label || 'BESS',
        type: 'generator_bess',
        power_kW: typeof bessNode.attributes.ratedPowerMva === 'number'
          ? bessNode.attributes.ratedPowerMva * 1000
          : 0,
        additionalParams: {},
        cosPhi: null,
      });
    }

    const stationChain: StationFieldAnnotationV1 = {
      stationId: station.id,
      stationName: stationDisplayName,
      stationType,
      hasOZE,
      ozeType,
      apparatus,
      nnBusbar: {
        voltageKV: 0.4,
        feeders,
      },
      protection,
    };

    stationChains.push({
      ...stationChain,
      detail: blockDetailMap.get(station.id) ?? null,
    });
  }

  // Build inline branch objects (BRANCH_POLE and ZKSN_NODE)
  const inlineBranchObjects: InlineBranchObjectV1[] = [];
  const inlineBranchNodes = graph.nodes
    .filter(n => n.nodeType === NodeTypeV1.BRANCH_POLE || n.nodeType === NodeTypeV1.ZKSN_NODE)
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const node of inlineBranchNodes) {
    const placement = placementMap.get(node.id);
    if (!placement) continue;
    inlineBranchObjects.push({
      nodeId: node.id,
      objectType: node.nodeType === NodeTypeV1.BRANCH_POLE ? 'branch_pole' : 'zksn',
      label: node.attributes.label,
      position: { x: placement.position.x, y: placement.position.y },
      branchPortCount: node.nodeType === NodeTypeV1.ZKSN_NODE ? 2 : 1,
    });
  }

  return {
    trunkNodes,
    trunkSegments,
    branchPoints,
    stationChains,
    gpzSections,
    gpzFeederFields,
    inlineBranchObjects,
  };
}

// =============================================================================
// MAIN PIPELINE
// =============================================================================

/**
 * Uruchamia pełny 6-fazowy pipeline layoutu (VERTICAL SN).
 *
 * DETERMINIZM: ten sam VisualGraphV1 + config → identyczny LayoutResultV1.
 *
 * @param graph VisualGraphV1 — zamrożony kontrakt wejścia
 * @param config Konfiguracja geometrii (opcjonalna, domyślna CANONICAL)
 * @param stationBlockDetails Opcjonalne szczegóły pól/urządzeń (RUN #3D)
 * @returns LayoutResultV1 — zamrożony wynik layoutu
 */
function legacyPipelineInternal(
  graph: VisualGraphV1,
  config: LayoutGeometryConfigV1 = DEFAULT_LAYOUT_CONFIG,
  stationBlockDetails?: StationBlockBuildResult,
): LayoutResultV1 {
  // Inicjalizacja stanu pipeline
  const state: PipelineState = {
    placements: new Map(),
    routes: [],
    blocks: [],
    catalogRefs: [],
    relayBindings: [],
    validationErrors: [],
    trunkAssignments: new Map(),
    branchSides: new Map(),
  };

  // Build lookup map for station block details (RUN #3D)
  const detailsByBlockId = new Map<string, StationBlockDetailV1>();
  if (stationBlockDetails) {
    for (const block of stationBlockDetails.stationBlocks) {
      detailsByBlockId.set(block.blockId, block);
    }
  }

  // Execute 6 phases — VERTICAL SN LAYOUT
  phase1_place_gpz_and_fields(graph, config, state);
  phase2_build_trunk_topology(graph, config, state);
  phase3_place_stations_and_branches(graph, config, state, detailsByBlockId);

  // Attach station block details
  for (const block of state.blocks) {
    block.detail = detailsByBlockId.get(block.blockId) ?? null;
  }

  phase4_route_all_edges(graph, config, state);
  phase5_place_labels(graph, config, state);
  phase6_enforce_invariants_and_finalize(graph, config, state);

  // Convert mutable state → immutable LayoutResultV1
  const nodePlacements: NodePlacementV1[] = [...state.placements.values()]
    .sort((a, b) => a.nodeId.localeCompare(b.nodeId))
    .map(p => ({
      nodeId: p.nodeId,
      position: { x: p.x, y: p.y },
      size: { width: p.width, height: p.height },
      bounds: { x: p.x, y: p.y, width: p.width, height: p.height },
      layer: p.layer,
      bandIndex: p.bandIndex,
      autoPositioned: p.autoPositioned,
    }));

  const edgeRoutes: EdgeRouteV1[] = [...state.routes]
    .sort((a, b) => a.edgeId.localeCompare(b.edgeId))
    .map(r => ({
      edgeId: r.edgeId,
      edgeType: r.edgeType,
      segments: r.segments,
      startPoint: r.startPoint,
      endPoint: r.endPoint,
      laneIndex: r.laneIndex,
      isNormallyOpen: r.isNormallyOpen,
    }));

  const switchgearBlocks: SwitchgearBlockV1[] = [...state.blocks]
    .sort((a, b) => a.blockId.localeCompare(b.blockId));

  const catalogRefs = [...state.catalogRefs]
    .sort((a, b) => a.nodeId.localeCompare(b.nodeId));

  const relayBindings = [...state.relayBindings]
    .sort((a, b) => a.breakerNodeId.localeCompare(b.breakerNodeId));

  const validationErrors = [...state.validationErrors]
    .sort((a, b) => (a.nodeId ?? '').localeCompare(b.nodeId ?? ''));

  // Compute bounds
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of nodePlacements) {
    minX = Math.min(minX, p.bounds.x);
    minY = Math.min(minY, p.bounds.y);
    maxX = Math.max(maxX, p.bounds.x + p.bounds.width);
    maxY = Math.max(maxY, p.bounds.y + p.bounds.height);
  }
  for (const b of switchgearBlocks) {
    minX = Math.min(minX, b.bounds.x);
    minY = Math.min(minY, b.bounds.y);
    maxX = Math.max(maxX, b.bounds.x + b.bounds.width);
    maxY = Math.max(maxY, b.bounds.y + b.bounds.height);
  }

  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 100; maxY = 100; }

  const bounds: RectangleV1 = {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };

  // Phase 7: Generate canonical SLD annotations (additive only)
  const canonicalAnnotations = phase7_generate_canonical_annotations(
    graph,
    nodePlacements,
    edgeRoutes,
    config,
    state.blocks,
  );

  const resultWithoutHash: LayoutResultV1 = {
    version: LAYOUT_RESULT_VERSION,
    nodePlacements,
    edgeRoutes,
    switchgearBlocks,
    catalogRefs,
    relayBindings,
    validationErrors,
    bounds,
    hash: '',
    canonicalAnnotations,
  };

  const hash = computeLayoutResultHash(resultWithoutHash);
  const result: LayoutResultV1 = { ...resultWithoutHash, hash };

  return canonicalizeLayoutResult(result);
}

/**
 * Publiczny punkt wejścia layoutu SLD.
 *
 * Domyślnie zachowuje kompatybilność wsteczną (`strategy: 'legacy'`),
 * a jednocześnie umożliwia przełączenie na nowy LayoutEngine
 * (strategia greedy/force-directed + routing ortogonalny/diagonalny).
 */
export function computeLayout(
  graph: VisualGraphV1,
  config: LayoutGeometryConfigV1 = DEFAULT_LAYOUT_CONFIG,
  stationBlockDetails?: StationBlockBuildResult,
  options: LayoutEngineOptions = { strategy: 'legacy' },
): LayoutResultV1 {
  const effectiveStationBlockDetails = stationBlockDetails ?? resolveStationBlockDetailsForGraph(graph);

  if ((options.strategy ?? 'legacy') === 'legacy') {
    return legacyPipelineInternal(graph, config, effectiveStationBlockDetails);
  }

  const semanticGraph = buildSldSemanticGraphFromVisualGraph(graph);
  const baseLayoutInput = buildLayoutInputGraph(semanticGraph, {
    minSpacing: options.minSpacing,
    maxSpacing: options.maxSpacing,
  });
  const legacyDimensions = new Map(
    graph.nodes.map((node) => [node.id, { width: node.attributes.width, height: node.attributes.height }] as const),
  );
  const layoutInput: LayoutInputGraphV1 = {
    ...baseLayoutInput,
    nodes: baseLayoutInput.nodes.map((node) => {
      const legacy = legacyDimensions.get(node.id);
      if (!legacy) return node;
      const width = legacy.width ?? node.symbolProfile.width;
      const height = legacy.height ?? node.symbolProfile.height;
      if (width === node.symbolProfile.width && height === node.symbolProfile.height) return node;
      return {
        ...node,
        symbolProfile: {
          ...node.symbolProfile,
          width,
          height,
        },
      };
    }),
  };

  const engine = createLayoutEngine(options, {
    legacyLayout: () => {
      throw new Error('Legacy callback is disabled in canonical computeLayout path.');
    },
  });
  return engine.compute(layoutInput, config, effectiveStationBlockDetails).layout;
}

