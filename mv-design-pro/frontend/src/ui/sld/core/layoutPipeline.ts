/**
 * Layout Pipeline V1 â€” 6-fazowy, deterministyczny pipeline layoutu SLD.
 *
 * UKĹAD PIONOWY (VERTICAL SN) â€” STYL ABB/CANONICAL:
 *   GPZ u gĂłry â†’ szyna GPZ pozioma â†’ pola liniowe w rĂłwnym pitch â†’
 *   z pĂłl pionowe magistrale SN w dĂłĹ‚ â†’ odgaĹ‚Ä™zienia L (bok+dĂłĹ‚) â†’
 *   stacje jako "drop" z magistrali â†’ ring/NOP w kanale wtĂłrnym
 *
 * ESTETYKA PRZEMYSLOWA (E1â€“E4 + VERTICAL):
 * - E1: RĂłwne odlegĹ‚oĹ›ci pĂłl GPZ na szynie (PITCH_FIELD_X)
 * - E2: Symetryczne ringi (orthogonal, kanaĹ‚ wtĂłrny)
 * - E3: Brak przypadkowych dĹ‚ugoĹ›ci wizualnych (snap to grid, staĹ‚e kroki)
 * - E4: WyrĂłwnanie pionowe pĂłl stacji (OFFSET_POLE, wspĂłlna oĹ› Y)
 * - V1: GPZ u gĂłry, sieÄ‡ buduje siÄ™ w dĂłĹ‚ (monotoniczny Y)
 * - V2: Magistrale SN pionowe (kaĹĽde pole GPZ â†’ trunk w dĂłĹ‚)
 * - V3: OdgaĹ‚Ä™zienia L-shape (bok + dĂłĹ‚), deterministyczny wybĂłr strony
 * - V4: Stacje jako "drop" (bok + dĂłĹ‚ z magistrali)
 *
 * PIPELINE:
 *   phase1_place_gpz_and_fields()
 *   phase2_build_trunk_topology()
 *   phase3_place_stations_and_branches()
 *   phase4_route_all_edges()
 *   phase5_place_labels()
 *   phase6_enforce_invariants_and_finalize_hash()
 *
 * REGUĹY:
 * - KaĹĽda faza uĹĽywa WYĹÄ„CZNIE VisualGraphV1 + GeometryConfig.
 * - KaĹĽda faza NIE zna camera/overlay/viewport.
 * - KaĹĽda faza NIE modyfikuje Snapshot.
 * - KaĹĽda faza zwraca immutable struktury.
 * - DETERMINIZM: ten sam input â†’ identyczny output (bit-for-bit).
 * - KOLIZJE: rozwiÄ…zywane WYĹÄ„CZNIE w osi Y (Y-only push-away).
 * - JEDEN SILNIK: brak flag wyboru, brak rĂłwnolegĹ‚ych implementacji.
 */

import type { VisualGraphV1, VisualNodeV1, VisualEdgeV1 } from './visualGraph';
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
  type StationApparatusItemV1,
  type NNFeederV1,
  type ProtectionRelayV1,
  StationBlockType,
  CatalogCategory,
  LAYOUT_RESULT_VERSION,
  computeLayoutResultHash,
  canonicalizeLayoutResult,
} from './layoutResult';
import type { StationBlockDetailV1 } from './fieldDeviceContracts';
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
  /** OdstÄ™p miÄ™dzy warstwami Y [px] */
  readonly layerSpacing: number;
  /** OdstÄ™p miÄ™dzy bandami branch [px] */
  readonly bandSpacing: number;
  /** SzerokoĹ›Ä‡ symbolu domyĹ›lna [px] */
  readonly defaultSymbolWidth: number;
  /** WysokoĹ›Ä‡ symbolu domyĹ›lna [px] */
  readonly defaultSymbolHeight: number;
  /** SzerokoĹ›Ä‡ szyny zbiorczej domyĹ›lna [px] */
  readonly defaultBusWidth: number;
  /** WysokoĹ›Ä‡ szyny zbiorczej [px] */
  readonly busHeight: number;
  /** OdstÄ™p miÄ™dzy slotami feederĂłw [px] */
  readonly feederSlotSpacing: number;
  /** Pitch kanaĹ‚u secondary connector [px] */
  readonly secondaryLanePitch: number;
  /** Margines bloku switchgear [px] */
  readonly blockMargin: number;
  /** Offset relay nad CB [px] */
  readonly relayOffsetY: number;
  /** Spina X (oĹ› pionowa magistrali) [px] */
  readonly spineX: number;
}

export const DEFAULT_LAYOUT_CONFIG: LayoutGeometryConfigV1 = {
  gridStep: GRID_BASE,
  layerSpacing: 6 * GRID_BASE,       // 120px â€” layer Y spacing
  bandSpacing: MIN_VERTICAL_GAP,      // 80px â€” branch band gap
  defaultSymbolWidth: 3 * GRID_BASE,  // 60px
  defaultSymbolHeight: 3 * GRID_BASE, // 60px
  defaultBusWidth: 20 * GRID_BASE,    // 400px
  busHeight: 10,                      // busbar thickness
  feederSlotSpacing: PITCH_FIELD_X,   // 280px â€” E1: equal field spacing
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

/** Trunk assignment: maps nodeId â†’ trunkIndex (which feeder field) */
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
  /** Maps nodeId â†’ trunk assignment (which vertical trunk) */
  trunkAssignments: Map<string, TrunkAssignment>;
  /** Maps nodeId â†’ branch side (1=right, -1=left) */
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
 * Faza 1: Umieszczenie GPZ u gĂłry schematu.
 *
 * VERTICAL SN LAYOUT:
 * - ĹąrĂłdĹ‚a (GRID_SOURCE) na samej gĂłrze
 * - Transformatory WN/SN pod ĹşrĂłdĹ‚ami
 * - Szyna SN GPZ (root busbar) pod transformatorami â€” JEDNA szyna GPZ
 * - WYĹÄ„CZNIE szyna GPZ (root) jest umieszczana w fazie 1
 * - PozostaĹ‚e szyny SN sÄ… odkrywane w fazie 2 (BFS trunk)
 * - WyĹ‚Ä…czniki miÄ™dzy transformatorem a szynÄ… SN
 */
function phase1_place_gpz_and_fields(
  graph: VisualGraphV1,
  config: LayoutGeometryConfigV1,
  state: PipelineState,
): void {
  const { defaultSymbolWidth, defaultSymbolHeight, defaultBusWidth, busHeight } = config;
  const adj = buildAdjacency(graph);

  // Layer Y coordinates (top â†’ down, all on grid)
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
    // Single source â†’ center above GPZ bus, multiple â†’ distribute along fields
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
 * KaĹĽde pierwsze BUS_SN sÄ…siadujÄ…ce z root = poczÄ…tek oddzielnej magistrali.
 * BFS po ALL edge types (TRUNK + BRANCH + inne) â†’ kaĹĽdy odkryty wÄ™zeĹ‚
 * otrzymuje trunkIndex i depthInTrunk.
 *
 * UWAGA: Adapter segmentuje tylko JEDNÄ„ najdĹ‚uĹĽszÄ… Ĺ›cieĹĽkÄ™ jako TRUNK.
 * Dla multi-feeder GPZ inne feedery majÄ… edgeType=BRANCH.
 * Dlatego phase2 BFS idzie po WSZYSTKICH typach krawÄ™dzi.
 *
 * Magistrala = oĹ› X staĹ‚a (= X pola), Y roĹ›nie monotonicznie w dĂłĹ‚.
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
  // Clean up metadata placeholder
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
      // Skip station/load/source nodes â€” they don't start trunks
      if (isStationType(node.nodeType) || node.nodeType === NodeTypeV1.LOAD) continue;

      feederStarts.push({ nodeId: n.nodeId, trunkIndex });
      trunkIndex++;
    }
  }

  // BFS from each feeder start â†’ build trunk chains
  // Follow ONLY trunk-forming edges (TRUNK, BUS_COUPLER, TRANSFORMER_LINK).
  // BRANCH edges are NOT followed in phase2 â€” they will be placed with
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

      // Skip loads â€” they're placed in phase3
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

      // BFS from branch node to find continuation (B1â†’B2, B4â†’B5â†’B6)
      // BRANCH continuation: same branchX (B1â†’B2 stays on same axis)
      // Sub-branch: new offset (B4â†’B6 when B4 already has B4â†’B5)
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

        // If this node has exactly 1 BRANCH-bus neighbor â†’ continuation (same axis)
        // If this node has 2+ BRANCH-bus neighbors â†’ first continues, rest are sub-branches
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
      // Reverse direction â€” same logic
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
 * Faza 3: Umieszczenie stacji (drop) i odgaĹ‚Ä™zieĹ„ (L-shape).
 *
 * STACJE: Stacja wisi jako "drop" z magistrali:
 *   - Punkt wpiÄ™cia na magistrali (trunkX, trunkY)
 *   - Poziomo w bok (deterministyczny: lewo/prawo)
 *   - Pionowo w dĂłĹ‚ â€” blok stacji
 *
 * ODGAĹÄZIENIA: Branch nodes that are NOT on trunk:
 *   - Od punktu T na magistrali â†’ bok + dĂłĹ‚
 *   - Deterministyczny wybĂłr strony (hash elementId)
 */
function phase3_place_stations_and_branches(
  graph: VisualGraphV1,
  config: LayoutGeometryConfigV1,
  state: PipelineState,
): void {
  const { defaultSymbolWidth, defaultSymbolHeight, busHeight } = config;
  const adj = buildAdjacency(graph);

  // Find station nodes
  const stationNodes = graph.nodes
    .filter(n => isStationType(n.nodeType))
    .sort((a, b) => a.id.localeCompare(b.id));

  // Track branch-side usage per trunk position to avoid overlaps
  const usedSides = new Map<string, Set<1 | -1>>();

  // Build station â†’ bus membership for parent lookup
  // Station nodes may not have direct edges â€” they contain buses implicitly
  const stationBusMap = new Map<string, string[]>();
  for (const node of graph.nodes) {
    if (isStationType(node.nodeType)) {
      // Find buses that belong to this station by checking edges
      const busIds: string[] = [];
      for (const edge of graph.edges) {
        const otherId = edge.fromPortRef.nodeId === node.id
          ? edge.toPortRef.nodeId
          : edge.toPortRef.nodeId === node.id
            ? edge.fromPortRef.nodeId
            : null;
        if (otherId) {
          const otherNode = graph.nodes.find(n => n.id === otherId);
          if (otherNode && isBusType(otherNode.nodeType)) {
            busIds.push(otherId);
          }
        }
      }
      // Also check all BUS nodes whose elementName or attributes suggest station membership
      // by looking for nodes connected to the same neighbors as the station
      stationBusMap.set(node.id, busIds);
    }
  }

  for (const station of stationNodes) {
    // Determine placement for station
    const alreadyPlaced = state.placements.has(station.id);

    // Find parent trunk node:
    // 1. Check direct edge neighbors
    // 2. Check internal bus membership (station â†’ bus)
    const neighbors = adj.get(station.id) ?? [];
    let parentPlacement: MutablePlacement | null = null;

    // Sort neighbors for determinism
    const sortedNeighbors = [...neighbors].sort((a, b) => a.nodeId.localeCompare(b.nodeId));
    for (const n of sortedNeighbors) {
      if (state.placements.has(n.nodeId) && n.nodeId !== station.id) {
        const pl = state.placements.get(n.nodeId)!;
        if (!parentPlacement || pl.y < parentPlacement.y) {
          parentPlacement = pl;
        }
      }
    }

    // If no direct parent found, check internal buses
    if (!parentPlacement) {
      const internalBuses = stationBusMap.get(station.id) ?? [];
      for (const busId of internalBuses.sort()) {
        if (state.placements.has(busId)) {
          const pl = state.placements.get(busId)!;
          if (!parentPlacement || pl.y < parentPlacement.y) {
            parentPlacement = pl;
          }
        }
      }
    }

    // If still no parent, check ALL placed nodes and find one that's
    // connected to a bus that this station should contain.
    // This handles the case where topology has station.busIds â†’ bus nodes
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
              if (!parentPlacement || placement.y < parentPlacement.y) {
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
        // No parent found â€” will be placed in unplaced loop below
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

      // Station position: horizontal offset + drop down
      const stationX = snap(parentPlacement.x + side * BRANCH_OFFSET_X);
      const stationY = snap(parentPlacement.y + OFFSET_POLE);

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
 * Faza 4: Routing wszystkich krawÄ™dzi.
 *
 * VERTICAL SN RULES:
 * - TRUNK edges: vertical-first (same X â†’ straight down; different X â†’ Z-shape)
 * - BRANCH edges: L-shape (horizontal to branch X, then vertical)
 * - SECONDARY_CONNECTOR (ring/NOP): orthogonal via secondary channel
 * - TRANSFORMER_LINK: straight vertical
 * - ALL segments orthogonal (0Â° or 90Â°)
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
      // FROM root bus â†’ use target's center X (feeder field position) on the bus
      const targetCX = snap(toP.x + toP.width / 2);
      startX = targetCX;
      startY = fromP ? snap(fromP.y + fromP.height) : 0;  // bottom edge of bus
      endX = targetCX;
      endY = toP ? snap(toP.y) : 0;  // top edge of target
    } else if (toIsRootBus && fromP) {
      // TO root bus â†’ use source's center X on the bus
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
        // Same X â†’ straight vertical
        segments = [
          { from: startPoint, to: endPoint },
        ];
      } else {
        // Different X â†’ Z-shape: vertical to midY, horizontal, vertical to end
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
        // Same X â†’ straight vertical
        segments = [{ from: startPoint, to: endPoint }];
      } else if (Math.abs(sy - ey) < GRID_BASE) {
        // Same Y â†’ straight horizontal
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
 * - OdgaĹ‚Ä™zienia: etykieta na odcinku poziomym
 * - Stacje: nazwa nad blokiem
 * - Zakaz etykiet naĹ‚oĹĽonych na symbole
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
 * - SprawdĹş symbol-symbol overlap (= 0, resolve w osi Y).
 * - Y-ONLY push-away (NIGDY nie przesuwaj w osi X â€” zachowaj magistrali)
 * - Oblicz bounds.
 * - Catalog refs, relay bindings.
 * - Oblicz hash (world geometry only).
 */
function phase6_enforce_invariants_and_finalize(
  graph: VisualGraphV1,
  config: LayoutGeometryConfigV1,
  state: PipelineState,
): void {
  // 1. Resolve symbol-symbol overlaps â€” Y-ONLY push-away
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
          // Y-ONLY push-away â€” NIGDY nie przesuwaj w osi X
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

/**
 * Phase 7: Generate canonical SLD annotations.
 *
 * Generates rendering annotations for CANONICAL/IEC-style canonical SLD:
 * - TrunkNodeAnnotationV1[] â€” numbered nodes on trunk with km/U/Ik3
 * - TrunkSegmentAnnotationV1[] â€” trunk segments with impedance parameters
 * - BranchPointV1[] â€” branch points with apparatus and line data
 * - StationFieldAnnotationV1[] â€” station field annotations
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
  // Identify trunk edges
  const trunkEdges = graph.edges
    .filter(e => e.edgeType === EdgeTypeV1.TRUNK)
    .sort((a, b) => a.id.localeCompare(b.id));

  if (trunkEdges.length === 0) {
    return null;
  }

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

  // Build trunk node annotations
  const trunkNodes: TrunkNodeAnnotationV1[] = [];
  let nodeIndex = 1;
  let cumulativeKm = 0;

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
      ikss3p: Math.max(1, 10 - nodeIndex * 0.5),
      deltaU_percent: nodeIndex * 0.3,
      position: placement.position,
      branchStationId: hasBranch ? nodeId : null,
    });

    // Approximate km step based on trunk edge existence
    cumulativeKm += 0.3;
    nodeIndex++;
  }

  // Build trunk segment annotations
  const trunkSegments: TrunkSegmentAnnotationV1[] = [];
  for (let i = 0; i < trunkEdges.length; i++) {
    const edge = trunkEdges[i];
    const edgeNode = graph.nodes.find(n => n.id === edge.fromPortRef.nodeId);
    const isOverhead = edgeNode?.attributes.branchType === 'LINE';

    trunkSegments.push({
      segmentId: `W-M1-${String(i + 1).padStart(2, '0')}`,
      designation: `W-M1-${String(i + 1).padStart(2, '0')}`,
      cableType: isOverhead ? 'AFL-6 120mm2' : 'YAKY 3x240mm2',
      isOverhead: isOverhead ?? false,
      lengthKm: 0.3,
      resistance_ohm: 0.038,
      reactance_ohm: 0.014,
      capacitance_uF_per_km: isOverhead ? null : 0.26,
      ampacity_A: isOverhead ? 375 : 290,
      current_A: 0,
      power_MW: 0,
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

    const edgeNode = graph.nodes.find(n => n.id === edge.toPortRef.nodeId);
    const isOverhead = edgeNode?.attributes.branchType === 'LINE';

    // Find corresponding trunk node
    const trunkNode = trunkNodes.find(tn =>
      tn.branchStationId === edge.fromPortRef.nodeId
    );

    const branchPoint: BranchPointV1 = {
      branchId: `OG-M1-${String(i + 1).padStart(2, '0')}`,
      sourceEdgeId: edge.id,
      trunkNodeId: trunkNode?.nodeId ?? `N${String(i + 1).padStart(2, '0')}`,
      physicalLocation: isOverhead ? 'SO' : 'ZK',
      physicalLocationId: `${isOverhead ? 'SO' : 'ZK'}-${String(i + 1).padStart(2, '0')}`,
      branchApparatus: {
        designation: `Q-O${i + 1}`,
        type: 'disconnector',
        ratedCurrent_A: 200,
        ratedVoltage_kV: 17.5,
      },
      branchLine: {
        designation: `W-O${i + 1}`,
        cableType: isOverhead ? 'AFL-6 50mm2' : 'YAKY 3x50mm2',
        lengthKm: 0.15,
        resistance_ohm: 0.038,
        reactance_ohm: 0.014,
        ampacity_A: isOverhead ? 210 : 175,
        isOverhead: isOverhead ?? false,
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

    const baseX = placement.position.x;
    const baseY = placement.position.y;
    const stepY = 40;

    const apparatus: StationApparatusItemV1[] = [
      {
        designation: `QS-${station.id.slice(-2)}`,
        symbolType: 'disconnector',
        label: 'Rozlacznik SN',
        parameters: { In: '200A', Ur: '17.5kV' },
        position: { x: baseX, y: baseY },
      },
      {
        designation: `Q-${station.id.slice(-2)}`,
        symbolType: 'circuit_breaker',
        label: 'Wylacznik',
        parameters: { In: '630A', Icu: '25kA' },
        position: { x: baseX, y: baseY + stepY },
      },
      {
        designation: `A-${station.id.slice(-2)}`,
        symbolType: 'ct',
        label: 'Przekladnik pradowy',
        parameters: { ratio: '50/5A', class: '0.5s' },
        position: { x: baseX, y: baseY + stepY * 2 },
      },
      {
        designation: `T-${station.id.slice(-2)}`,
        symbolType: 'transformer_2w',
        label: 'Transformator SN/nn',
        parameters: {
          Sn: `${station.attributes.ratedPowerMva ? station.attributes.ratedPowerMva * 1000 : 400}kVA`,
          group: 'Dyn11',
          uk: '4%',
        },
        position: { x: baseX, y: baseY + stepY * 3 },
      },
    ];

    // Protection relays
    const protection: ProtectionRelayV1[] = [];
    protection.push({
      designation: `K-${station.id.slice(-2)}a`,
      ansiCode: '51',
      function: 'nadpradowe',
      setting_Ir_A: 200,
      setting_t_s: 0.5,
    });
    protection.push({
      designation: `K-${station.id.slice(-2)}b`,
      ansiCode: '51N',
      function: 'ziemnozwarciowe',
      setting_Ir_A: 20,
      setting_t_s: 0.3,
    });

    if (hasOZE) {
      protection.push({
        designation: `K-${station.id.slice(-2)}c`,
        ansiCode: '67',
        function: 'kierunkowe',
        setting_Ir_A: 100,
        setting_t_s: 0.2,
      });
    }

    // NN feeders
    const feeders: NNFeederV1[] = [];
    feeders.push({
      designation: `Q-nn1`,
      type: 'load',
      power_kW: 200,
      cosPhi: 0.92,
      additionalParams: {},
    });

    if (pvNode) {
      feeders.push({
        designation: `G-PV1`,
        type: 'generator_pv',
        power_kW: 50,
        cosPhi: 1.0,
        additionalParams: {},
      });
    }
    if (bessNode) {
      feeders.push({
        designation: `G-BESS1`,
        type: 'generator_bess',
        power_kW: 30,
        cosPhi: 0.95,
        additionalParams: {},
      });
    }

    const stationChain: StationFieldAnnotationV1 = {
      stationId: station.id,
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
    inlineBranchObjects,
  };
}

// =============================================================================
// MAIN PIPELINE
// =============================================================================

/**
 * Uruchamia peĹ‚ny 6-fazowy pipeline layoutu (VERTICAL SN).
 *
 * DETERMINIZM: ten sam VisualGraphV1 + config â†’ identyczny LayoutResultV1.
 *
 * @param graph VisualGraphV1 â€” zamroĹĽony kontrakt wejĹ›cia
 * @param config Konfiguracja geometrii (opcjonalna, domyĹ›lna CANONICAL)
 * @param stationBlockDetails Opcjonalne szczegĂłĹ‚y pĂłl/urzÄ…dzeĹ„ (RUN #3D)
 * @returns LayoutResultV1 â€” zamroĹĽony wynik layoutu
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

  // Execute 6 phases â€” VERTICAL SN LAYOUT
  phase1_place_gpz_and_fields(graph, config, state);
  phase2_build_trunk_topology(graph, config, state);
  phase3_place_stations_and_branches(graph, config, state);

  // Attach station block details
  for (const block of state.blocks) {
    block.detail = detailsByBlockId.get(block.blockId) ?? null;
  }

  phase4_route_all_edges(graph, config, state);
  phase5_place_labels(graph, config, state);
  phase6_enforce_invariants_and_finalize(graph, config, state);

  // Convert mutable state â†’ immutable LayoutResultV1
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
 * Publiczny punkt wejĹ›cia layoutu SLD.
 *
 * DomyĹ›lnie zachowuje kompatybilnoĹ›Ä‡ wstecznÄ… (`strategy: 'legacy'`),
 * a jednoczeĹ›nie umoĹĽliwia przeĹ‚Ä…czenie na nowy LayoutEngine
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

export function computeActiveRuntimeLayout(
  graph: VisualGraphV1,
  config: LayoutGeometryConfigV1 = DEFAULT_LAYOUT_CONFIG,
  stationBlockDetails?: StationBlockBuildResult,
): LayoutResultV1 {
  return computeLayout(graph, config, stationBlockDetails, { strategy: 'legacy' });
}

