import type { StationBlockBuildResult } from './stationBlockBuilder';
import type { LayoutGeometryConfigV1 } from './layoutPipeline';
import type {
  LayoutResultV1,
  NodePlacementV1,
  EdgeRouteV1,
  RectangleV1,
  PathSegmentV1,
  PointV1,
  LayoutValidationErrorV1,
} from './layoutResult';
import { LAYOUT_RESULT_VERSION, computeLayoutResultHash, canonicalizeLayoutResult } from './layoutResult';
import type { LayoutEdgeInputV1, LayoutInputGraphV1, LayoutNodeInputV1 } from './layoutInputGraph';
import { EdgeTypeV1 } from './visualGraph';

export type PlacementStrategy = 'legacy' | 'greedy' | 'force-directed';
export type RoutingStyle = 'orthogonal' | 'diagonal';

export interface LayoutEnginePhaseColors {
  readonly R: string;
  readonly W: string;
  readonly B: string;
}

export interface LayoutEngineOptions {
  readonly strategy?: PlacementStrategy;
  readonly routingStyle?: RoutingStyle;
  readonly minSpacing?: number;
  readonly maxSpacing?: number;
  readonly scale?: number;
  readonly phaseColors?: LayoutEnginePhaseColors;
  readonly retryOnCollision?: boolean;
  readonly maxReflowAttempts?: number;
}

export interface LabelPlacementV1 {
  readonly nodeId: string;
  readonly text: string;
  readonly position: PointV1;
  readonly bounds: RectangleV1;
}

export interface LayoutLayerPlanV1 {
  readonly baseLayer: readonly string[];
  readonly symbolLayer: readonly string[];
  readonly overlayLayer: readonly string[];
  readonly labels: readonly LabelPlacementV1[];
}

export interface LayoutEngineOutputV1 {
  readonly layout: LayoutResultV1;
  readonly layers: LayoutLayerPlanV1;
}

interface EngineDeps {
  readonly legacyLayout: (
    graph: LayoutInputGraphV1,
    config: LayoutGeometryConfigV1,
    stationBlockDetails?: StationBlockBuildResult,
  ) => LayoutResultV1;
}

const DEFAULT_PHASE_COLORS: LayoutEnginePhaseColors = { R: '#d32f2f', W: '#f9a825', B: '#1976d2' };

interface MutablePlacement {
  nodeId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  layer: number;
}

function makeAdjacency(edges: readonly LayoutEdgeInputV1[]): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const edge of edges) {
    const al = adj.get(edge.fromNodeId) ?? [];
    al.push(edge.toNodeId);
    adj.set(edge.fromNodeId, al);
    const bl = adj.get(edge.toNodeId) ?? [];
    bl.push(edge.fromNodeId);
    adj.set(edge.toNodeId, bl);
  }
  for (const [k, v] of adj) adj.set(k, [...new Set(v)].sort());
  return adj;
}

function isGpz(node: LayoutNodeInputV1): boolean {
  return node.nodeType === 'GRID_SOURCE';
}

function nodeSize(node: LayoutNodeInputV1): { width: number; height: number } {
  if (isGpz(node)) return { width: 180, height: 84 };
  return { width: node.symbolProfile.width, height: node.symbolProfile.height };
}

function snap(value: number, grid: number): number {
  return Math.round(value / grid) * grid;
}

function orthogonalSegments(start: PointV1, end: PointV1): PathSegmentV1[] {
  return [{ from: start, to: { x: end.x, y: start.y } }, { from: { x: end.x, y: start.y }, to: end }];
}

function diagonalSegments(start: PointV1, end: PointV1): PathSegmentV1[] {
  return [{ from: start, to: end }];
}

function rectContains(rect: RectangleV1, point: PointV1): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

function segmentIntersectsRect(seg: PathSegmentV1, rect: RectangleV1): boolean {
  if (seg.from.x === seg.to.x) {
    if (seg.from.x < rect.x || seg.from.x > rect.x + rect.width) return false;
    const minY = Math.min(seg.from.y, seg.to.y);
    const maxY = Math.max(seg.from.y, seg.to.y);
    return maxY >= rect.y && minY <= rect.y + rect.height;
  }
  if (seg.from.y === seg.to.y) {
    if (seg.from.y < rect.y || seg.from.y > rect.y + rect.height) return false;
    const minX = Math.min(seg.from.x, seg.to.x);
    const maxX = Math.max(seg.from.x, seg.to.x);
    return maxX >= rect.x && minX <= rect.x + rect.width;
  }
  return rectContains(rect, seg.from) || rectContains(rect, seg.to);
}

function shortestPath(source: string, target: string, adj: Map<string, string[]>): string[] {
  if (source === target) return [source];
  const queue: string[] = [source];
  const prev = new Map<string, string | null>([[source, null]]);
  while (queue.length > 0) {
    const curr = queue.shift()!;
    for (const next of adj.get(curr) ?? []) {
      if (prev.has(next)) continue;
      prev.set(next, curr);
      if (next === target) {
        const result: string[] = [];
        let ptr: string | null = next;
        while (ptr) {
          result.push(ptr);
          ptr = prev.get(ptr) ?? null;
        }
        return result.reverse();
      }
      queue.push(next);
    }
  }
  return [source, target];
}

function buildGreedyPlacements(input: LayoutInputGraphV1, gridStep: number, spacing: number): MutablePlacement[] {
  const adj = makeAdjacency(input.edges);
  const sorted = [...input.nodes].sort((a, b) => a.id.localeCompare(b.id));
  const gpz = sorted.find((n) => isGpz(n)) ?? sorted[0];
  const depth = new Map<string, number>([[gpz.id, 0]]);
  const queue: string[] = [gpz.id];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    for (const next of adj.get(curr) ?? []) {
      if (depth.has(next)) continue;
      depth.set(next, (depth.get(curr) ?? 0) + 1);
      queue.push(next);
    }
  }
  const buckets = new Map<number, LayoutNodeInputV1[]>();
  for (const node of sorted) {
    const d = depth.get(node.id) ?? 0;
    const b = buckets.get(d) ?? [];
    b.push(node);
    buckets.set(d, b);
  }
  const out: MutablePlacement[] = [];
  for (const layer of [...buckets.keys()].sort((a, b) => a - b)) {
    const bucket = buckets.get(layer)!;
    bucket.sort((a, b) => a.id.localeCompare(b.id));
    const totalWidth = (bucket.length - 1) * spacing;
    bucket.forEach((node, index) => {
      const size = nodeSize(node);
      out.push({
        nodeId: node.id,
        x: snap(600 - totalWidth / 2 + index * spacing, gridStep),
        y: snap(100 + layer * spacing, gridStep),
        width: size.width,
        height: size.height,
        layer,
      });
    });
  }
  return out;
}

function buildForceDirectedPlacements(input: LayoutInputGraphV1, gridStep: number, minSpacing: number): MutablePlacement[] {
  const sorted = [...input.nodes].sort((a, b) => a.id.localeCompare(b.id));
  const index = new Map(sorted.map((n, i) => [n.id, i]));
  const points = sorted.map((n, i) => ({ id: n.id, x: 300 + (i % 8) * 120, y: 120 + Math.floor(i / 8) * 120 }));
  for (let iter = 0; iter < 80; iter++) {
    const forces = points.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const dx = points[j].x - points[i].x;
        const dy = points[j].y - points[i].y;
        const dist = Math.max(Math.hypot(dx, dy), 1);
        const repulse = (minSpacing * minSpacing) / dist;
        forces[i].x -= (dx / dist) * repulse;
        forces[i].y -= (dy / dist) * repulse;
        forces[j].x += (dx / dist) * repulse;
        forces[j].y += (dy / dist) * repulse;
      }
    }
    for (const edge of input.edges) {
      const i = index.get(edge.fromNodeId);
      const j = index.get(edge.toNodeId);
      if (i === undefined || j === undefined) continue;
      const dx = points[j].x - points[i].x;
      const dy = points[j].y - points[i].y;
      const dist = Math.max(Math.hypot(dx, dy), 1);
      const attract = (dist * dist) / (minSpacing * 2);
      forces[i].x += (dx / dist) * attract;
      forces[i].y += (dy / dist) * attract;
      forces[j].x -= (dx / dist) * attract;
      forces[j].y -= (dy / dist) * attract;
    }
    for (let i = 0; i < points.length; i++) {
      points[i].x += forces[i].x * 0.015;
      points[i].y += forces[i].y * 0.015;
    }
  }
  const adj = makeAdjacency(input.edges);
  const gpz = sorted.find((n) => isGpz(n)) ?? sorted[0];
  return sorted.map((node) => {
    const p = points[index.get(node.id)!];
    const layer = Math.max(shortestPath(gpz.id, node.id, adj).length - 1, 0);
    const size = nodeSize(node);
    return {
      nodeId: node.id,
      x: snap(p.x, gridStep),
      y: snap(Math.max(p.y, 100 + layer * minSpacing * 0.7), gridStep),
      width: size.width,
      height: size.height,
      layer,
    };
  });
}

function manhattan(a: PointV1, b: PointV1): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function findPathAStar(start: PointV1, end: PointV1, obstacles: readonly RectangleV1[], step: number): PointV1[] {
  type Rec = { point: PointV1; g: number; f: number; prev: string | null };
  const open = new Map<string, Rec>();
  const all = new Map<string, Rec>();
  const closed = new Set<string>();
  const key = (p: PointV1) => `${p.x}:${p.y}`;
  const dirs = [{ x: step, y: 0 }, { x: -step, y: 0 }, { x: 0, y: step }, { x: 0, y: -step }];
  const k0 = key(start);
  const r0: Rec = { point: start, g: 0, f: manhattan(start, end), prev: null };
  open.set(k0, r0);
  all.set(k0, r0);
  let guard = 0;
  while (open.size > 0 && guard < 5000) {
    guard += 1;
    const current = [...open.values()].sort((a, b) => a.f - b.f || a.point.x - b.point.x || a.point.y - b.point.y)[0];
    const ck = key(current.point);
    if (current.point.x === end.x && current.point.y === end.y) {
      const path: PointV1[] = [];
      let ptr: string | null = ck;
      while (ptr) {
        const it = all.get(ptr);
        if (!it) break;
        path.push(it.point);
        ptr = it.prev;
      }
      return path.reverse();
    }
    open.delete(ck);
    closed.add(ck);
    for (const d of dirs) {
      const next: PointV1 = { x: current.point.x + d.x, y: current.point.y + d.y };
      const nk = key(next);
      if (closed.has(nk)) continue;
      if (obstacles.some((o) => rectContains(o, next))) continue;
      const g = current.g + step;
      const f = g + manhattan(next, end);
      const prev = open.get(nk);
      if (!prev || g < prev.g) {
        const rec: Rec = { point: next, g, f, prev: ck };
        open.set(nk, rec);
        all.set(nk, rec);
      }
    }
  }
  return [start, end];
}

function pointsToSegments(points: readonly PointV1[]): PathSegmentV1[] {
  const out: PathSegmentV1[] = [];
  for (let i = 1; i < points.length; i++) out.push({ from: points[i - 1], to: points[i] });
  return out;
}

function collapseSegments(segments: readonly PathSegmentV1[]): PathSegmentV1[] {
  if (segments.length <= 1) return [...segments];
  const out: PathSegmentV1[] = [segments[0]];
  for (let i = 1; i < segments.length; i++) {
    const prev = out[out.length - 1];
    const curr = segments[i];
    const prevV = prev.from.x === prev.to.x;
    const currV = curr.from.x === curr.to.x;
    if ((prevV && currV && prev.to.x === curr.from.x) || (!prevV && !currV && prev.to.y === curr.from.y)) {
      out[out.length - 1] = { from: prev.from, to: curr.to };
    } else {
      out.push(curr);
    }
  }
  return out;
}

function isOrthogonal(segments: readonly PathSegmentV1[]): boolean {
  return segments.every((s) => s.from.x === s.to.x || s.from.y === s.to.y);
}

function hasRouteCollision(routes: readonly EdgeRouteV1[], obstacles: readonly RectangleV1[]): boolean {
  return routes.some((r) => r.segments.some((s) => obstacles.some((o) => segmentIntersectsRect(s, o))));
}

function buildLayerPlan(input: LayoutInputGraphV1, placements: readonly NodePlacementV1[], routes: readonly EdgeRouteV1[]): LayoutLayerPlanV1 {
  const nodeMap = new Map(input.nodes.map((n) => [n.id, n]));
  const labels = placements.map((p) => {
    const node = nodeMap.get(p.nodeId);
    const text = node?.label ?? p.nodeId;
    const position = { x: p.bounds.x + p.bounds.width + 8, y: p.bounds.y - 8 };
    return { nodeId: p.nodeId, text, position, bounds: { x: position.x, y: position.y, width: Math.max(64, text.length * 8), height: 20 } };
  });
  return {
    baseLayer: placements.map((p) => p.nodeId).sort(),
    symbolLayer: routes.map((r) => r.edgeId).sort(),
    overlayLayer: input.edges.filter((e) => e.isNormallyOpen).map((e) => e.id).sort(),
    labels,
  };
}

export class LayoutEngine {
  private readonly options: Required<LayoutEngineOptions>;

  public constructor(opts: LayoutEngineOptions, private readonly deps: EngineDeps) {
    this.options = {
      strategy: opts.strategy ?? 'legacy',
      routingStyle: opts.routingStyle ?? 'orthogonal',
      minSpacing: opts.minSpacing ?? 120,
      maxSpacing: opts.maxSpacing ?? 360,
      scale: opts.scale ?? 1,
      phaseColors: opts.phaseColors ?? DEFAULT_PHASE_COLORS,
      retryOnCollision: opts.retryOnCollision ?? true,
      maxReflowAttempts: opts.maxReflowAttempts ?? 2,
    };
  }

  public compute(input: LayoutInputGraphV1, config: LayoutGeometryConfigV1, stationBlockDetails?: StationBlockBuildResult): LayoutEngineOutputV1 {
    if (this.options.strategy === 'legacy') {
      const legacy = this.deps.legacyLayout(input, config, stationBlockDetails);
      return { layout: legacy, layers: buildLayerPlan(input, legacy.nodePlacements, legacy.edgeRoutes) };
    }
    let spacing = Math.max(this.options.minSpacing, input.constraints.minSpacing);
    let out = this.computeModern(input, config, spacing);
    let attempts = 0;
    while (this.options.retryOnCollision
      && attempts < this.options.maxReflowAttempts
      && hasRouteCollision(out.layout.edgeRoutes, out.layout.nodePlacements.map((p) => p.bounds))) {
      attempts += 1;
      spacing = Math.min(this.options.maxSpacing, spacing * 1.2);
      out = this.computeModern(input, config, spacing);
    }
    return out;
  }

  private computeModern(input: LayoutInputGraphV1, config: LayoutGeometryConfigV1, spacing: number): LayoutEngineOutputV1 {
    const placements = this.options.strategy === 'force-directed'
      ? buildForceDirectedPlacements(input, config.gridStep, spacing)
      : buildGreedyPlacements(input, config.gridStep, spacing);

    const nodePlacements: NodePlacementV1[] = placements.map((p) => ({
      nodeId: p.nodeId,
      position: { x: p.x, y: p.y },
      size: { width: p.width, height: p.height },
      bounds: { x: p.x, y: p.y, width: p.width, height: p.height },
      layer: p.layer,
      bandIndex: 0,
      autoPositioned: true,
    })).sort((a, b) => a.nodeId.localeCompare(b.nodeId));

    const nodeMap = new Map(nodePlacements.map((p) => [p.nodeId, p]));
    const obstacles = nodePlacements.map((p) => ({ x: p.bounds.x - 8, y: p.bounds.y - 8, width: p.bounds.width + 16, height: p.bounds.height + 16 }));
    const edgeRoutes: EdgeRouteV1[] = input.edges.map((edge) => {
      const from = nodeMap.get(edge.fromNodeId);
      const to = nodeMap.get(edge.toNodeId);
      if (!from || !to) {
        return { edgeId: edge.id, edgeType: edge.edgeType, segments: [], startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 0 }, laneIndex: 0, isNormallyOpen: edge.isNormallyOpen };
      }
      const start = { x: snap(from.bounds.x + from.bounds.width / 2, config.gridStep), y: snap(from.bounds.y + from.bounds.height / 2, config.gridStep) };
      const end = { x: snap(to.bounds.x + to.bounds.width / 2, config.gridStep), y: snap(to.bounds.y + to.bounds.height / 2, config.gridStep) };
      const segs = this.options.routingStyle === 'diagonal'
        ? diagonalSegments(start, end)
        : collapseSegments(pointsToSegments(findPathAStar(start, end, obstacles, config.gridStep)));
      const fallback = this.options.routingStyle === 'diagonal' ? diagonalSegments(start, end) : orthogonalSegments(start, end);
      const segments = this.options.routingStyle === 'orthogonal' && !isOrthogonal(segs) ? fallback : (segs.length > 0 ? segs : fallback);
      return {
        edgeId: edge.id,
        edgeType: edge.edgeType,
        segments,
        startPoint: start,
        endPoint: end,
        laneIndex: edge.edgeType === EdgeTypeV1.SECONDARY_CONNECTOR ? 1 : 0,
        isNormallyOpen: edge.isNormallyOpen,
      };
    }).sort((a, b) => a.edgeId.localeCompare(b.edgeId));

    const validationErrors: LayoutValidationErrorV1[] = [];
    if (!this.options.phaseColors.R || !this.options.phaseColors.W || !this.options.phaseColors.B) {
      validationErrors.push({ code: 'PHASE_COLOR_MISSING', message: 'Brakuje kolorów faz R/W/B.', nodeId: null, fixAction: 'Uzupełnij phaseColors.' });
    }

    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    for (const p of nodePlacements) {
      minX = Math.min(minX, p.bounds.x);
      minY = Math.min(minY, p.bounds.y);
      maxX = Math.max(maxX, p.bounds.x + p.bounds.width);
      maxY = Math.max(maxY, p.bounds.y + p.bounds.height);
    }

    const base: LayoutResultV1 = {
      version: LAYOUT_RESULT_VERSION,
      nodePlacements,
      edgeRoutes,
      switchgearBlocks: [],
      catalogRefs: [],
      relayBindings: [],
      validationErrors,
      bounds: { x: Number.isFinite(minX) ? minX : 0, y: Number.isFinite(minY) ? minY : 0, width: Number.isFinite(maxX) ? maxX - minX : 0, height: Number.isFinite(maxY) ? maxY - minY : 0 },
      hash: '',
      canonicalAnnotations: {
        trunkNodes: nodePlacements.filter((n) => n.layer > 0).map((n) => ({ nodeId: n.nodeId, trunkId: 'TRUNK-1', kmFromGPZ: n.layer * 0.2, voltageKV: 15, ikss3p: null, deltaU_percent: null, position: n.position, branchStationId: null })),
        trunkSegments: edgeRoutes.filter((e) => e.edgeType === EdgeTypeV1.TRUNK).map((e, idx) => ({ segmentId: e.edgeId, designation: `L-${idx + 1}`, cableType: 'SN', isOverhead: false, lengthKm: Math.abs(e.endPoint.x - e.startPoint.x + e.endPoint.y - e.startPoint.y) / 1000, resistance_ohm: null, reactance_ohm: null, capacitance_uF_per_km: null, ampacity_A: null, current_A: null, power_MW: null })),
        branchPoints: [],
        stationChains: [],
        inlineBranchObjects: [],
      },
    };

    const withHash = canonicalizeLayoutResult({ ...base, hash: computeLayoutResultHash(base) });
    return { layout: withHash, layers: buildLayerPlan(input, withHash.nodePlacements, withHash.edgeRoutes) };
  }
}

export function createLayoutEngine(options: LayoutEngineOptions, deps: EngineDeps): LayoutEngine {
  return new LayoutEngine(options, deps);
}
