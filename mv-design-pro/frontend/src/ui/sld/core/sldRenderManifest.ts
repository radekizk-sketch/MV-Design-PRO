import { computeLayoutResultHash, type LayoutResultV1, type NodePlacementV1, type EdgeRouteV1 } from './layoutResult';
import { computeVisualGraphHash, type VisualGraphV1 } from './visualGraph';
import type { VisualTopologyContractV1 } from './visualTopologyContract';
import { CANONICAL_STROKE, CANONICAL_VOLTAGE_COLORS, CANONICAL_VOLTAGE_MAP, getVisualHierarchyLevel, VISUAL_HIERARCHY } from '../sldCanonicalStyle';

function syncHashHex(input: string): string {
  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h0 = ((h0 << 5) + h0 + c) >>> 0;
    h1 = ((h1 << 7) + h1 + c) >>> 0;
    h2 = ((h2 << 3) + h2 + c) >>> 0;
    h3 = ((h3 << 11) + h3 + c) >>> 0;
    h4 = ((h4 << 13) + h4 + c) >>> 0;
    h5 = ((h5 << 17) + h5 + c) >>> 0;
    h6 = ((h6 << 19) + h6 + c) >>> 0;
    h7 = ((h7 << 23) + h7 + c) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map(v => v.toString(16).padStart(8, '0'))
    .join('');
}

export interface SldRenderNodeManifestV1 {
  readonly nodeId: string;
  readonly nodeType: string;
  readonly elementType: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly layer: number;
  readonly hierarchyLevel: 'structure' | 'topology' | 'detail';
  readonly strokeWidth: number;
  readonly voltageColor: string;
}

export interface SldRenderEdgeManifestV1 {
  readonly edgeId: string;
  readonly edgeType: string;
  readonly segmentCount: number;
  readonly totalLengthPx: number;
  readonly laneIndex: number;
  readonly isNormallyOpen: boolean;
  readonly strokeWidth: number;
}


export interface SldVisualTopologySummaryV1 {
  readonly gpz: number;
  readonly szynySn: number;
  readonly polaSn: number;
  readonly segmentyMagistrali: number;
  readonly segmentyOdgalezien: number;
  readonly punktyRozgalezien: number;
  readonly stacje: number;
  readonly ringi: number;
  readonly nopy: number;
}

export interface SldRenderManifestV1 {
  readonly specVersion: '1.0';
  readonly scenarioId: string;
  readonly layoutHash: string;
  readonly visualGraphHash: string;
  readonly styleTokenHash: string;
  readonly visualTopologySummary?: SldVisualTopologySummaryV1;
  readonly nodes: readonly SldRenderNodeManifestV1[];
  readonly edges: readonly SldRenderEdgeManifestV1[];
}

function round3(x: number): number {
  return Number(x.toFixed(3));
}

function resolveVoltageColor(voltageKv: number | null | undefined): string {
  if (voltageKv == null) return CANONICAL_VOLTAGE_COLORS.default;
  const key = CANONICAL_VOLTAGE_MAP[String(voltageKv)] ?? 'default';
  return CANONICAL_VOLTAGE_COLORS[key];
}

function computeEdgeLength(route: EdgeRouteV1): number {
  let sum = 0;
  for (const seg of route.segments) {
    const dx = seg.to.x - seg.from.x;
    const dy = seg.to.y - seg.from.y;
    sum += Math.sqrt(dx * dx + dy * dy);
  }
  return round3(sum);
}

function edgeStrokeWidth(edgeType: string): number {
  if (edgeType === 'BUS_COUPLER') return CANONICAL_STROKE.busbar;
  if (edgeType === 'SECONDARY_CONNECTOR') return CANONICAL_STROKE.aux;
  return CANONICAL_STROKE.feeder;
}

function buildStyleTokenHash(): string {
  return syncHashHex(JSON.stringify({
    CANONICAL_STROKE,
    VISUAL_HIERARCHY,
    CANONICAL_VOLTAGE_COLORS,
  }));
}

function sortedPlacements(result: LayoutResultV1): readonly NodePlacementV1[] {
  return [...result.nodePlacements].sort((a, b) => a.nodeId.localeCompare(b.nodeId));
}

function sortedRoutes(result: LayoutResultV1): readonly EdgeRouteV1[] {
  return [...result.edgeRoutes].sort((a, b) => a.edgeId.localeCompare(b.edgeId));
}

export function buildSldRenderManifest(params: {
  scenarioId: string;
  visualGraph: VisualGraphV1;
  layoutResult: LayoutResultV1;
  visualTopology?: VisualTopologyContractV1 | null;
}): SldRenderManifestV1 {
  const nodeById = new Map(params.visualGraph.nodes.map((n) => [n.id, n]));

  const nodes: readonly SldRenderNodeManifestV1[] = sortedPlacements(params.layoutResult).map((placement) => {
    const node = nodeById.get(placement.nodeId);
    if (!node) {
      throw new Error(`Node not found in visual graph: ${placement.nodeId}`);
    }
    const hierarchyLevel = getVisualHierarchyLevel(node.attributes.elementType);
    return {
      nodeId: placement.nodeId,
      nodeType: node.nodeType,
      elementType: node.attributes.elementType,
      x: round3(placement.position.x),
      y: round3(placement.position.y),
      width: round3(placement.size.width),
      height: round3(placement.size.height),
      layer: placement.layer,
      hierarchyLevel,
      strokeWidth: VISUAL_HIERARCHY[hierarchyLevel].strokeWidth,
      voltageColor: resolveVoltageColor(node.attributes.voltageKv),
    };
  });

  const edges: readonly SldRenderEdgeManifestV1[] = sortedRoutes(params.layoutResult).map((route) => ({
    edgeId: route.edgeId,
    edgeType: route.edgeType,
    segmentCount: route.segments.length,
    totalLengthPx: computeEdgeLength(route),
    laneIndex: route.laneIndex,
    isNormallyOpen: route.isNormallyOpen,
    strokeWidth: edgeStrokeWidth(route.edgeType),
  }));

  return {
    specVersion: '1.0',
    scenarioId: params.scenarioId,
    layoutHash: computeLayoutResultHash(params.layoutResult),
    visualGraphHash: computeVisualGraphHash(params.visualGraph),
    styleTokenHash: buildStyleTokenHash(),
    ...(params.visualTopology
      ? {
        visualTopologySummary: {
          gpz: params.visualTopology.gpz.length,
          szynySn: params.visualTopology.busbarsSn.length,
          polaSn: params.visualTopology.fieldsSn.length,
          segmentyMagistrali: params.visualTopology.trunkSegments.length,
          segmentyOdgalezien: params.visualTopology.branchSegments.length,
          punktyRozgalezien: params.visualTopology.branchJunctions.length,
          stacje: params.visualTopology.stations.length,
          ringi: params.visualTopology.ringConnectors.length,
          nopy: params.visualTopology.nops.length,
        },
      }
      : {}),
    nodes,
    edges,
  };
}
