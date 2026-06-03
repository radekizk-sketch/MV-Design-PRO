/**
 * E2 AUTO-LAYOUT — the station layout engine (Sugiyama adapted to an SLD). MODEL → GEOMETRY,
 * deterministic. Phases:
 *   1. BANDS    — distinct un_kv descending → horizontal voltage tiers (y per band).
 *   2. ORDER    — bays per busbar ordered line → metering → source/transformer, tie-broken by id.
 *   3. COORDS   — main busbar spans its bays at a fixed pitch; each LV busbar is a short bar under
 *                 its transformer pole; transformers drop vertically between tiers.
 *   4. ROUTING  — every connection is orthogonal (vertical bus→bay drops, vertical transformers).
 *   5. HASH     — FNV-1a over the rounded geometry; same model → bit-identical layout.
 * It does NOT render and does NOT touch the solver/core (read-only). Output feeds a thin renderer.
 */
import {
  BAY_ROLE_RANK,
  type StationBay,
  type StationModel,
} from './layoutModel';

export interface LayoutConfig {
  readonly busbarY0: number; // y of the top (highest-voltage) busbar
  readonly bandSpacing: number; // vertical distance between voltage tiers
  readonly bayPitch: number; // horizontal distance between bays on a busbar
  readonly xStart: number; // x of the first bay
  readonly busPadX: number; // busbar overhang past its outer bays
  readonly bayDrop: number; // bay length (busbar → source/apparatus anchor)
}

export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  busbarY0: 200,
  bandSpacing: 300,
  bayPitch: 240,
  xStart: 460,
  busPadX: 80,
  bayDrop: 250,
};

export interface BusPlacement {
  readonly id: string;
  readonly unKv: number;
  readonly band: number;
  readonly y: number;
  readonly x1: number;
  readonly x2: number;
}
export interface BayPlacement {
  readonly id: string;
  readonly busId: string;
  readonly role: StationBay['role'];
  readonly sourceKind?: StationBay['sourceKind'];
  readonly label: string;
  readonly x: number;
  readonly busY: number;
  readonly anchorY: number; // where the bay's symbol/source sits
  readonly toBus?: string;
}
export interface TransformerPlacement {
  readonly id: string;
  readonly x: number;
  readonly hvY: number;
  readonly lvY: number;
}
export interface EdgeRoute {
  readonly id: string;
  readonly points: readonly (readonly [number, number])[]; // orthogonal polyline
}
export interface StationLayout {
  readonly buses: readonly BusPlacement[];
  readonly bays: readonly BayPlacement[];
  readonly transformers: readonly TransformerPlacement[];
  readonly edges: readonly EdgeRoute[];
  readonly bbox: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly hash: string;
}

const r = (v: number): number => Math.round(v); // snap to integer grid (determinism)

/** FNV-1a 32-bit over the rounded geometry — deterministic, render-independent. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function layoutStation(model: StationModel, config: LayoutConfig = DEFAULT_LAYOUT_CONFIG): StationLayout {
  // ── Phase 1: BANDS — distinct un_kv descending → tier index → y. ──
  const distinctKv = Array.from(new Set(model.buses.map((b) => b.unKv))).sort((a, b) => b - a);
  const bandOf = (unKv: number): number => distinctKv.indexOf(unKv);
  const bandY = (band: number): number => config.busbarY0 + band * config.bandSpacing;
  const busKv = new Map(model.buses.map((b) => [b.id, b.unKv]));

  // ── Phase 2: ORDER — main-bus bays by (role rank, id). LV-bus bays grouped per bus, by id. ──
  const baysOnMain = model.bays
    .filter((b) => b.busId === model.mainBus)
    .slice()
    .sort((a, b) => BAY_ROLE_RANK[a.role] - BAY_ROLE_RANK[b.role] || a.id.localeCompare(b.id));

  // ── Phase 3: COORDS. ──
  const bayPlacements: BayPlacement[] = [];
  const transformers: TransformerPlacement[] = [];
  const busPlacements: BusPlacement[] = [];
  const edges: EdgeRoute[] = [];

  const mainY = bandY(bandOf(busKv.get(model.mainBus) ?? distinctKv[0]));
  const poleXByLvBus = new Map<string, number>();

  // Main busbar bays at a fixed pitch.
  baysOnMain.forEach((bay, i) => {
    const x = r(config.xStart + i * config.bayPitch);
    const anchorY = r(mainY + config.bayDrop);
    bayPlacements.push({
      id: bay.id, busId: model.mainBus, role: bay.role, sourceKind: bay.sourceKind,
      label: bay.label, x, busY: r(mainY), anchorY, toBus: bay.toBus,
    });
    edges.push({ id: `e/${bay.id}`, points: [[x, r(mainY)], [x, anchorY]] });
    if (bay.role === 'transformer' && bay.toBus) poleXByLvBus.set(bay.toBus, x);
  });

  const mainXs = bayPlacements.filter((b) => b.busId === model.mainBus).map((b) => b.x);
  busPlacements.push({
    id: model.mainBus, unKv: busKv.get(model.mainBus) ?? 0, band: bandOf(busKv.get(model.mainBus) ?? 0),
    y: r(mainY), x1: r(Math.min(...mainXs) - config.busPadX), x2: r(Math.max(...mainXs) + config.busPadX),
  });

  // Each LOWER bus: a short busbar centered under its transformer pole, carrying its source bays.
  const lvBuses = model.buses.filter((b) => b.id !== model.mainBus).map((b) => b.id);
  for (const busId of lvBuses) {
    const poleX = poleXByLvBus.get(busId) ?? config.xStart;
    const lvY = bandY(bandOf(busKv.get(busId) ?? 0));
    const lvBays = model.bays
      .filter((b) => b.busId === busId)
      .slice()
      .sort((a, b) => BAY_ROLE_RANK[a.role] - BAY_ROLE_RANK[b.role] || a.id.localeCompare(b.id));
    const span = (lvBays.length - 1) * (config.bayPitch * 0.6);
    lvBays.forEach((bay, i) => {
      const x = r(poleX - span / 2 + i * (config.bayPitch * 0.6));
      const anchorY = r(lvY + config.bayDrop * 0.5);
      bayPlacements.push({
        id: bay.id, busId, role: bay.role, sourceKind: bay.sourceKind, label: bay.label,
        x, busY: r(lvY), anchorY,
      });
      edges.push({ id: `e/${bay.id}`, points: [[x, r(lvY)], [x, anchorY]] });
    });
    const lvXs = lvBays.map((_, i) => r(poleX - span / 2 + i * (config.bayPitch * 0.6)));
    busPlacements.push({
      id: busId, unKv: busKv.get(busId) ?? 0, band: bandOf(busKv.get(busId) ?? 0),
      y: r(lvY), x1: r(Math.min(poleX, ...lvXs) - config.busPadX * 0.6),
      x2: r(Math.max(poleX, ...lvXs) + config.busPadX * 0.6),
    });
  }

  // ── Phase 4: transformer drops (vertical, HV pole → LV busbar), orthogonal. ──
  for (const tr of model.transformers.slice().sort((a, b) => a.id.localeCompare(b.id))) {
    const x = poleXByLvBus.get(tr.lvBus) ?? config.xStart;
    const hvY = r(mainY);
    const lvY = r(bandY(bandOf(busKv.get(tr.lvBus) ?? 0)));
    transformers.push({ id: tr.id, x, hvY, lvY });
    edges.push({ id: `e/${tr.id}`, points: [[x, hvY], [x, lvY]] });
  }

  // ── Phase 5: bbox + deterministic hash. ──
  const allX = [...busPlacements.flatMap((b) => [b.x1, b.x2]), ...bayPlacements.map((b) => b.x)];
  const allY = [...busPlacements.map((b) => b.y), ...bayPlacements.map((b) => b.anchorY)];
  const bbox = {
    x: Math.min(...allX) - 40, y: Math.min(...allY) - 60,
    width: Math.max(...allX) - Math.min(...allX) + 240, height: Math.max(...allY) - Math.min(...allY) + 160,
  };

  const sortById = <T extends { id: string }>(xs: T[]): T[] => xs.slice().sort((a, b) => a.id.localeCompare(b.id));
  const sig =
    sortById(busPlacements).map((b) => `B|${b.id}|${b.y}|${b.x1}|${b.x2}`).join(';') +
    '::' + sortById(bayPlacements).map((b) => `F|${b.id}|${b.x}|${b.busY}|${b.anchorY}`).join(';') +
    '::' + sortById(transformers).map((t) => `T|${t.id}|${t.x}|${t.hvY}|${t.lvY}`).join(';') +
    '::' + sortById([...edges]).map((e) => `E|${e.id}|${e.points.map((p) => p.join(',')).join('>')}`).join(';');

  return {
    buses: sortById(busPlacements),
    bays: sortById(bayPlacements),
    transformers: sortById(transformers),
    edges: sortById([...edges]),
    bbox,
    hash: fnv1a(sig),
  };
}
