/**
 * E3 NETWORK AUTO-LAYOUT — MODEL → GEOMETRY for the whole radial MV network, deterministic.
 * Builds ON E2: places the GPZ + the trunk magistrala + every lateral feeder as a "comb" (trunk
 * horizontal in the 15 kV plane, each trunk station's lateral subtree tidy-laid DOWNWARD), so each
 * station owns a slot a per-station E2 SLD can be drawn into. Phases:
 *   1. TREE     — parent→children (GPZ = root); station-tree level; the trunk chain.
 *   2. LATERALS — tidy-layout each trunk station's lateral subtree (leaf columns, level rows).
 *   3. TRUNK    — trunk stations left→right, slot width = their lateral subtree width.
 *   4. ROUTING  — orthogonal feeders parent→child; the normally-open sectionalizer kept (drawn open).
 *   5. HASH     — FNV-1a over rounded geometry; same model → bit-identical layout.
 * NO-ORPHAN (CI #465): every station is placed regardless of switch state. Read-only; no render.
 */
import type { NetworkStation, SldNetworkModel } from './networkModel';

export interface NetworkLayoutConfig {
  readonly gpzY: number; // y of the GPZ block (110 band, top)
  readonly trunkY: number; // y of the trunk magistrala row (15 band)
  readonly xStart: number;
  readonly colW: number; // horizontal slot per lateral leaf
  readonly trunkGap: number; // extra gap between trunk slots
  readonly lateralRowH: number; // vertical pitch down a lateral
  readonly blockW: number;
  readonly blockH: number;
}

export const DEFAULT_NETWORK_CONFIG: NetworkLayoutConfig = {
  gpzY: 80,
  trunkY: 360,
  xStart: 240,
  colW: 150,
  trunkGap: 70,
  lateralRowH: 150,
  blockW: 116,
  blockH: 92,
};

export interface StationPlacement {
  readonly id: string;
  readonly kind: NetworkStation['kind'];
  readonly level: number; // station-tree level from GPZ (GPZ=0, trunk head=1)
  readonly x: number; // block center x
  readonly y: number; // block center y
  readonly w: number;
  readonly h: number;
  readonly der: readonly string[];
  readonly trafoMva: number | null;
  readonly name: string;
  readonly nopDownstream: boolean;
}
export interface FeederRoute {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly open: boolean;
  readonly points: readonly (readonly [number, number])[]; // orthogonal polyline
}
export interface NetworkLayout {
  readonly gpz: { readonly id: string; readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  readonly stations: readonly StationPlacement[];
  readonly feeders: readonly FeederRoute[];
  readonly bands: readonly { readonly kv: number; readonly y: number }[];
  readonly bbox: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly hash: string;
}

const r = (v: number): number => Math.round(v);

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function layoutNetwork(model: SldNetworkModel, config: NetworkLayoutConfig = DEFAULT_NETWORK_CONFIG): NetworkLayout {
  const byId = new Map(model.stations.map((s) => [s.id, s]));
  // ── Phase 1: TREE (children sorted by id ⇒ determinism), station-tree level. ──
  const childrenOf = new Map<string, string[]>();
  for (const s of model.stations) {
    const p = s.parent ?? 'GPZ';
    (childrenOf.get(p) ?? childrenOf.set(p, []).get(p)!).push(s.id);
  }
  for (const k of childrenOf.keys()) childrenOf.get(k)!.sort();

  const level = new Map<string, number>([['GPZ', 0]]);
  const queue = ['GPZ'];
  while (queue.length) {
    const u = queue.shift()!;
    for (const c of childrenOf.get(u) ?? []) {
      level.set(c, (level.get(u) ?? 0) + 1);
      queue.push(c);
    }
  }

  // The trunk chain: trunk-kind stations hanging off GPZ, then following the trunk-kind child.
  const trunk: string[] = [];
  let cur: string | undefined = (childrenOf.get('GPZ') ?? []).find((id) => byId.get(id)?.kind === 'trunk');
  while (cur) {
    trunk.push(cur);
    cur = (childrenOf.get(cur) ?? []).find((id) => byId.get(id)?.kind === 'trunk');
  }

  // ── Phase 2: LATERALS — tidy-layout each trunk station's lateral subtree downward. ──
  // A lateral subtree = the trunk station's descendants reached through non-trunk children. We lay
  // it out with leaves at sequential columns (no overlap) and y by sub-level; the trunk station is
  // the root at the trunk row. Returns column count (slot width) + relative placements.
  const placements = new Map<string, StationPlacement>();

  const lateralChildren = (id: string): string[] =>
    (childrenOf.get(id) ?? []).filter((c) => byId.get(c)?.kind === 'lateral');

  // recursive tidy: assign each node a column (leaf order) and depth; returns [minCol, maxCol].
  function tidy(id: string, depthFromTrunk: number, nextCol: { c: number }, out: Map<string, { col: number; depth: number }>): [number, number] {
    const kids = lateralChildren(id);
    if (kids.length === 0) {
      const col = nextCol.c++;
      out.set(id, { col, depth: depthFromTrunk });
      return [col, col];
    }
    let lo = Infinity;
    let hi = -Infinity;
    for (const k of kids) {
      const [klo, khi] = tidy(k, depthFromTrunk + 1, nextCol, out);
      lo = Math.min(lo, klo);
      hi = Math.max(hi, khi);
    }
    out.set(id, { col: (lo + hi) / 2, depth: depthFromTrunk });
    return [lo, hi];
  }

  // ── Phase 3: TRUNK — place trunk stations left→right; slot width = lateral subtree columns. ──
  let slotX = config.xStart;
  const trunkXById = new Map<string, number>();
  for (const tId of trunk) {
    const rel = new Map<string, { col: number; depth: number }>();
    const counter = { c: 0 };
    // lateral roots = the trunk station's lateral children; tidy each, accumulating columns.
    for (const lr of lateralChildren(tId)) tidy(lr, 1, counter, rel);
    const cols = Math.max(1, counter.c);
    const slotWidth = cols * config.colW;
    const centerX = r(slotX + slotWidth / 2 - config.colW / 2);
    trunkXById.set(tId, centerX);
    const t = byId.get(tId)!;
    placements.set(tId, {
      id: tId, kind: 'trunk', level: level.get(tId) ?? 1, x: centerX, y: config.trunkY,
      w: config.blockW, h: config.blockH, der: t.der, trafoMva: t.trafo_mva, name: t.name, nopDownstream: t.nop_downstream,
    });
    // place this trunk station's laterals relative to its slot (col 0 at slotX).
    for (const [id, rc] of rel) {
      const s = byId.get(id)!;
      placements.set(id, {
        id, kind: 'lateral', level: level.get(id) ?? 2,
        x: r(slotX + rc.col * config.colW), y: r(config.trunkY + rc.depth * config.lateralRowH),
        w: config.blockW, h: config.blockH, der: s.der, trafoMva: s.trafo_mva, name: s.name, nopDownstream: s.nop_downstream,
      });
    }
    slotX += slotWidth + config.trunkGap;
  }

  // ── Phase 4: ROUTING — orthogonal feeders parent→child (and GPZ→trunk head). ──
  const gpzHead = trunk[0];
  const gpz = { id: 'GPZ', x: placements.get(gpzHead)?.x ?? config.xStart, y: config.gpzY, w: config.blockW + 30, h: config.blockH };
  const feeders: FeederRoute[] = [];
  const portTop = (p: StationPlacement): [number, number] => [p.x, p.y - p.h / 2];
  const portBot = (p: StationPlacement): [number, number] => [p.x, p.y + p.h / 2];
  for (const e of model.edges) {
    const to = placements.get(e.to);
    if (!to) continue;
    if (e.from === 'GPZ') {
      feeders.push({ id: `f/${e.from}-${e.to}`, from: e.from, to: e.to, open: e.open,
        points: [[gpz.x, gpz.y + gpz.h / 2], [gpz.x, to.y - to.h / 2]] });
      continue;
    }
    const from = placements.get(e.from);
    if (!from) continue;
    // trunk→trunk: horizontal along the magistrala; trunk/lateral→lateral: vertical drop (Z if offset).
    const a = from.kind === 'trunk' && to.kind === 'trunk' ? [from.x + from.w / 2, from.y] as [number, number] : portBot(from);
    const b = from.kind === 'trunk' && to.kind === 'trunk' ? [to.x - to.w / 2, to.y] as [number, number] : portTop(to);
    const pts: (readonly [number, number])[] = a[0] === b[0] || a[1] === b[1]
      ? [a, b]
      : [a, [a[0], r((a[1] + b[1]) / 2)], [b[0], r((a[1] + b[1]) / 2)], b];
    feeders.push({ id: `f/${e.from}-${e.to}`, from: e.from, to: e.to, open: e.open, points: pts });
  }

  // ── Phase 5: bands, bbox, deterministic hash. ──
  const bands = [
    { kv: model.gpz.hv_kv, y: config.gpzY },
    { kv: model.gpz.sn_kv, y: config.trunkY },
  ];
  const xs = [gpz.x - gpz.w / 2, gpz.x + gpz.w / 2, ...[...placements.values()].flatMap((p) => [p.x - p.w / 2, p.x + p.w / 2])];
  const ys = [gpz.y - gpz.h / 2, ...[...placements.values()].flatMap((p) => [p.y - p.h / 2, p.y + p.h / 2])];
  const bbox = {
    x: Math.min(...xs) - 60, y: Math.min(...ys) - 60,
    width: Math.max(...xs) - Math.min(...xs) + 120, height: Math.max(...ys) - Math.min(...ys) + 140,
  };

  const sortById = <T extends { id: string }>(xs2: T[]): T[] => xs2.slice().sort((a, b) => a.id.localeCompare(b.id));
  const stations = sortById([...placements.values()]);
  const routes = sortById(feeders);
  const sig =
    `G|${gpz.x}|${gpz.y};` +
    stations.map((p) => `S|${p.id}|${p.x}|${p.y}|${p.w}|${p.h}`).join(';') +
    '::' + routes.map((f) => `F|${f.id}|${f.open ? 'O' : 'C'}|${f.points.map((p) => p.join(',')).join('>')}`).join(';');

  return { gpz, stations, feeders: routes, bands, bbox, hash: fnv1a(sig) };
}
