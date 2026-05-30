/**
 * LayoutEngine — JEDYNE źródło geometrii SLD (tryb topologiczny).
 *
 * @see docs/sld/SLD_GEOMETRY_CONTRACT_V1.md §1, §2, §7
 *
 * Jedna, ZAGNIEŻDŻONA prawda geometrii:
 *   stacja (L0, bbox dzieci) → pola (L1) → aparaty (L2) + porty (PortAnchor).
 * `lod` PROJEKTUJE z tej jednej kalkulacji (nie liczy trzech layoutów).
 *
 * Tryb 'geo' = dług: zwraca marker `unavailable` (ENM nie ma współrzędnych — 7.6.C),
 * NIE udaje pozycji.
 */

import type { PortKind } from '../../ui/sld/v2/core/ports';
import { BAY_ROLE_TO_PORT_KIND } from '../../ui/sld/v2/core/ports';
import {
  type EnmSnapshot,
  type EdgeGeometry,
  type LayoutBBox,
  type LayoutEngine,
  type LayoutFrame,
  type LayoutMode,
  type LayoutResult,
  type LodLevel,
  type NodeGeometry,
  type PortAnchor,
  type PortSide,
} from '../../ui/sld/v2/geometry/layoutContract';
import {
  type TopologyStationV1,
  type TopologyFieldSpecV1,
} from '../../ui/sld/core/topologyInputReader';
import { buildTopologyTree, type TopologyTree } from './topologyTree';

// ---------------------------------------------------------------------------
// Stałe geometryczne (world-space, przed auto-fit). Dobrane pod czytelność L0/L2.
// ---------------------------------------------------------------------------

const APPARATUS_W = 28;
const APPARATUS_H = 22;
const APPARATUS_GAP_Y = 8;
const FIELD_PAD = 10;
const FIELD_GAP_X = 14;
const FIELD_MIN_H = APPARATUS_H + 2 * FIELD_PAD;
/** Min. rozmiar bloku stacji na L0 — rozróżnialny, zero mikro-znaczków (M-08). */
const STATION_MIN_W = 120;
const STATION_MIN_H = 84;
const STATION_PAD = 12;

/**
 * Wysokość pasma poziomu (oś Y): odstęp między sąsiednimi poziomami drzewa
 * (trunk=0, laterale +/-1..). Musi być > max wysokości bloku → separacja pionowa.
 */
const LATERAL_BAND_Y = 200;

const DEFAULT_FRAME: LayoutFrame = { width: 1600, height: 900, padding: 40 };
/** Docelowe wypełnienie kadru (M-01). */
const TARGET_FILL = 0.86; // >0.75 z marginesem bezpieczeństwa

// ---------------------------------------------------------------------------
// Wewnętrzne struktury pozycjonowania (pre-fit, world-space „surowy").
// ---------------------------------------------------------------------------

interface RawStation {
  ref: string;
  cx: number; // środek bloku X
  cy: number; // środek bloku Y
  station: TopologyStationV1 | null;
  rank: number;
}

/**
 * Szerokość bloku stacji (świat surowy) — używana do gwarancji separacji kolumn.
 * Zależy od liczby pól; min STATION_MIN_W.
 */
function stationBlockWidth(station: TopologyStationV1 | null): number {
  const fields = station?.fieldSpecs ?? [];
  const fieldW = APPARATUS_W + 2 * FIELD_PAD;
  const contentW =
    fields.length > 0
      ? fields.length * fieldW + Math.max(0, fields.length - 1) * FIELD_GAP_X
      : 0;
  return Math.max(STATION_MIN_W, contentW + 2 * STATION_PAD);
}

function makePortId(ownerRef: string, role: string, side: PortSide): string {
  return `${ownerRef}::${role}::${side}`;
}

function portKindForRole(role: string): PortKind {
  const up = role.toUpperCase();
  return (
    BAY_ROLE_TO_PORT_KIND[up] ??
    (up.includes('ODG') || up.includes('FEEDER')
      ? 'sn_branch'
      : up.includes('IN')
        ? 'sn_input'
        : 'sn_output')
  );
}

// ---------------------------------------------------------------------------
// Pozycjonowanie stacji: magistrala pozioma + laterale w pasmach (naprzemiennie).
// ---------------------------------------------------------------------------

function positionStations(
  tree: TopologyTree,
  stationById: ReadonlyMap<string, TopologyStationV1>,
): Map<string, RawStation> {
  const raw = new Map<string, RawStation>();
  if (!tree.rootRef) return raw;

  const isStationRef = (ref: string): boolean => !!stationById.get(ref) || tree.nodes.get(ref)?.isStation === true;

  // Dzieci-stacje danego węzła (po przejściu przez węzły pośrednie BUS:, które nie są
  // stacjami — kabel kończący się „w powietrzu" lub punkt łączeniowy). Determinizm:
  // children już posortowane leksykalnie w drzewie.
  const stationChildren = (ref: string): string[] => {
    const out: string[] = [];
    const visit = (r: string) => {
      const node = tree.nodes.get(r);
      if (!node) return;
      for (const c of node.children) {
        if (isStationRef(c)) out.push(c);
        else visit(c); // przejdź przez węzeł pośredni do jego dzieci-stacji
      }
    };
    visit(ref);
    return out;
  };

  // --- Tidy-tree: magistrala = oś pozioma (poziom 0); laterale = ranki pionowe ---
  // Każda stacja-trunk rezerwuje rozłączny zakres kolumn obejmujący jej poddrzewo
  // lateralne; lateral schodzi w poziomach Y (głębokość) w obrębie tego zakresu.
  // Sąsiednie laterale (różni rodzice → różne zakresy kolumn) nie kolidują nigdy;
  // rodzeństwo lateralne (ten sam rodzic) dostaje rozłączne podzakresy.
  // Komórka = (kolumna całkowita, poziom całkowity); rozłączne komórki ⇒ M-02.

  // Krok kolumny = max szerokość bloku + margines (gwarancja separacji w poziomie).
  let maxBlockW = STATION_MIN_W;
  for (const st of stationById.values()) {
    maxBlockW = Math.max(maxBlockW, stationBlockWidth(st));
  }
  const colStepX = maxBlockW + 60;

  interface Placed {
    ref: string;
    col: number; // środek kolumnowy (może być ułamkowy → wyśrodkowanie nad poddrzewem)
    level: number; // 0 = trunk; >0 w dół; <0 w górę
  }
  const placed: Placed[] = [];

  // Szerokość poddrzewa lateralnego (w kolumnach) — barycenter/median: węzeł centrowany
  // nad swoimi pod-lateralami. Łańcuch (1 dziecko-kontynuacja) nie poszerza.
  const lateralWidth = new Map<string, number>();
  const computeLateralWidth = (ref: string): number => {
    const cached = lateralWidth.get(ref);
    if (cached !== undefined) return cached;
    const kids = stationChildren(ref);
    let w: number;
    if (kids.length <= 1) {
      // liść lub kontynuacja łańcucha (dziecko leży głębiej, ta sama kolumna)
      w = kids.length === 1 ? Math.max(1, computeLateralWidth(kids[0])) : 1;
    } else {
      // rozgałęzienie: pierwsze dziecko kontynuuje kolumnę, reszta = nowe podzakresy
      const [first, ...rest] = kids;
      w = computeLateralWidth(first);
      for (const r of rest) w += computeLateralWidth(r);
    }
    lateralWidth.set(ref, w);
    return w;
  };

  // Rozłóż lateral: `colStart` = lewy brzeg przydzielonego zakresu (w kolumnach),
  // `level` bieżący poziom, `dir` kierunek (+1 dół / -1 góra). Łańcuch trzyma kolumnę,
  // pod-rozgałęzienia dostają rozłączne podzakresy w prawo.
  const placeLateral = (startRef: string, colStart: number, level: number, dir: 1 | -1): void => {
    let currentRef: string | null = startRef;
    let lvl = level;
    let baseCol = colStart;
    while (currentRef !== null) {
      const kids = stationChildren(currentRef);
      const myWidth = computeLateralWidth(currentRef);
      // wyśrodkuj węzeł nad swoim zakresem [baseCol, baseCol+myWidth)
      placed.push({ ref: currentRef, col: baseCol + (myWidth - 1) / 2, level: lvl });
      if (kids.length === 0) break;
      const [first, ...rest] = kids;
      // kontynuacja łańcucha: pierwszy zajmuje lewą część zakresu
      let cursor = baseCol + computeLateralWidth(first);
      for (const r of rest) {
        placeLateral(r, cursor, lvl + dir, dir);
        cursor += computeLateralWidth(r);
      }
      // wejdź w pierwsze dziecko (ten sam kierunek, głębiej)
      currentRef = first;
      lvl += dir;
      // baseCol pierwszego = lewy brzeg (pierwszy zajmuje [baseCol, baseCol+width(first)))
    }
  };

  // Trunk: kolejne kolumny od korzenia. Każda stacja-trunk rezerwuje swój zakres +
  // zakresy lateralne. Determinizm: trunkRefs w kolejności od korzenia.
  // Kierunek lateralu naprzemiennie GLOBALNIE (nad/pod osią) → zbalansowane drzewo (§2).
  let trunkCol = 0;
  let lateralParity = 0;
  tree.trunkRefs.forEach((ref) => {
    const laterals = stationChildren(ref).filter((c) => !tree.nodes.get(c)?.onTrunk);
    // szerokość zakresu tej stacji = max(1, suma szerokości lateralnych)
    const lateralsWidth = laterals.reduce((s, l) => s + computeLateralWidth(l), 0);
    const slotWidth = Math.max(1, lateralsWidth);
    // stacja trunk wyśrodkowana nad swoim slotem
    placed.push({ ref, col: trunkCol + (slotWidth - 1) / 2, level: 0 });
    // laterale: rozłączne podzakresy w obrębie slotu; kierunek naprzemiennie globalnie
    let cursor = trunkCol;
    laterals.forEach((latRef) => {
      const dir: 1 | -1 = lateralParity % 2 === 0 ? 1 : -1;
      lateralParity += 1;
      placeLateral(latRef, cursor, dir, dir);
      cursor += computeLateralWidth(latRef);
    });
    trunkCol += slotWidth;
  });

  // Stacje nieosiągnięte z drzewa (np. odizolowane) — kolejne kolumny, osobny poziom.
  const placedRefs = new Set(placed.map((p) => p.ref));
  let orphanLevel = 0;
  for (const st of [...stationById.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    if (placedRefs.has(st.id)) continue;
    placed.push({ ref: st.id, col: trunkCol, level: orphanLevel + 4 });
    trunkCol += 1;
    orphanLevel = (orphanLevel + 1) % 3;
  }

  // Konwersja (col, level) -> świat. Tylko REALNE stacje stają się blokami.
  for (const p of placed) {
    if (!isStationRef(p.ref)) continue; // pomiń węzły pośrednie BUS:
    raw.set(p.ref, {
      ref: p.ref,
      cx: p.col * colStepX,
      cy: p.level * LATERAL_BAND_Y,
      station: stationById.get(p.ref) ?? null,
      rank: tree.nodes.get(p.ref)?.rank ?? 0,
    });
  }

  return raw;
}

// ---------------------------------------------------------------------------
// Budowa zagnieżdżonej geometrii stacji (L0 → L1 pola → L2 aparaty + porty).
// ---------------------------------------------------------------------------

function buildFieldGeometry(
  field: TopologyFieldSpecV1,
  fieldX: number,
  fieldTopY: number,
  fieldW: number,
): { node: NodeGeometry; height: number } {
  const equip = field.equipmentRefs;
  const innerH = Math.max(
    APPARATUS_H,
    equip.length * APPARATUS_H + Math.max(0, equip.length - 1) * APPARATUS_GAP_Y,
  );
  const fieldH = Math.max(FIELD_MIN_H, innerH + 2 * FIELD_PAD);
  const apparatusX = fieldX + (fieldW - APPARATUS_W) / 2;

  const apparatus: NodeGeometry[] = equip.map((eqRef, i) => {
    const ay = fieldTopY + FIELD_PAD + i * (APPARATUS_H + APPARATUS_GAP_Y);
    // Port (głowica/terminal) na dole aparatu — V-07 na L2.
    const port: PortAnchor = {
      portId: makePortId(eqRef, field.bayRole, 'bottom'),
      ownerRef: eqRef,
      kind: portKindForRole(field.bayRole),
      x: apparatusX + APPARATUS_W / 2,
      y: ay + APPARATUS_H,
      side: 'bottom',
    };
    return {
      ref: eqRef,
      x: apparatusX,
      y: ay,
      width: APPARATUS_W,
      height: APPARATUS_H,
      rank: 0,
      lod: 'L2' as LodLevel,
      ports: [port],
      label: field.bayRole,
      nodeKind: 'apparatus',
    };
  });

  // Port brzegowy pola (L1): głowica odpływowa pola — na dole środka pola.
  const fieldPort: PortAnchor = {
    portId: makePortId(field.fieldRef, field.bayRole, 'bottom'),
    ownerRef: field.fieldRef,
    kind: portKindForRole(field.bayRole),
    x: fieldX + fieldW / 2,
    y: fieldTopY + fieldH,
    side: 'bottom',
  };

  const node: NodeGeometry = {
    ref: field.fieldRef,
    x: fieldX,
    y: fieldTopY,
    width: fieldW,
    height: fieldH,
    rank: 0,
    lod: 'L1',
    ports: [fieldPort],
    children: apparatus.length > 0 ? apparatus : undefined,
    label: field.name,
    nodeKind: `field:${field.bayRole}`,
  };
  return { node, height: fieldH };
}

function buildStationGeometry(rawStation: RawStation): NodeGeometry {
  const station = rawStation.station;
  const fields = station?.fieldSpecs ?? [];

  // Liczba kolumn pól; szerokość bloku z nich (min STATION_MIN_W).
  const fieldW = APPARATUS_W + 2 * FIELD_PAD;
  const contentW =
    fields.length > 0
      ? fields.length * fieldW + Math.max(0, fields.length - 1) * FIELD_GAP_X
      : 0;
  const blockW = Math.max(STATION_MIN_W, contentW + 2 * STATION_PAD);

  // Najpierw policz wysokości pól, by ustalić wysokość bloku.
  const startX = rawStation.cx - blockW / 2;
  const fieldsTopY = rawStation.cy - STATION_MIN_H / 2 + STATION_PAD;
  const innerLeft = startX + (blockW - contentW) / 2;

  const fieldNodes: NodeGeometry[] = [];
  let maxFieldH = FIELD_MIN_H;
  fields.forEach((f, i) => {
    const fx = innerLeft + i * (fieldW + FIELD_GAP_X);
    const { node, height } = buildFieldGeometry(f, fx, fieldsTopY, fieldW);
    fieldNodes.push(node);
    if (height > maxFieldH) maxFieldH = height;
  });

  const blockH = Math.max(STATION_MIN_H, maxFieldH + 2 * STATION_PAD);
  const blockX = startX;
  const blockY = rawStation.cy - blockH / 2;

  // Porty brzegowe stacji (L0/L1): IN (lewo), OUT (prawo), FEEDER (dół), TR (dół).
  const stationPorts: PortAnchor[] = [
    {
      portId: makePortId(rawStation.ref, 'IN', 'left'),
      ownerRef: rawStation.ref,
      kind: 'sn_input',
      x: blockX,
      y: rawStation.cy,
      side: 'left',
    },
    {
      portId: makePortId(rawStation.ref, 'OUT', 'right'),
      ownerRef: rawStation.ref,
      kind: 'sn_output',
      x: blockX + blockW,
      y: rawStation.cy,
      side: 'right',
    },
    {
      portId: makePortId(rawStation.ref, 'FEEDER', 'bottom'),
      ownerRef: rawStation.ref,
      kind: 'sn_branch',
      x: rawStation.cx,
      y: blockY + blockH,
      side: 'bottom',
    },
    {
      portId: makePortId(rawStation.ref, 'INTOP', 'top'),
      ownerRef: rawStation.ref,
      kind: 'sn_input',
      x: rawStation.cx,
      y: blockY,
      side: 'top',
    },
  ];

  return {
    ref: rawStation.ref,
    x: blockX,
    y: blockY,
    width: blockW,
    height: blockH,
    rank: rawStation.rank,
    lod: 'L0',
    ports: stationPorts,
    children: fieldNodes.length > 0 ? fieldNodes : undefined,
    label: station?.name ?? rawStation.ref,
    nodeKind: station?.stationType ?? 'station',
  };
}

// ---------------------------------------------------------------------------
// Krawędzie: zakotwiczone port→port (V-07), routing ortogonalny.
// ---------------------------------------------------------------------------

function portById(nodes: readonly NodeGeometry[]): Map<string, PortAnchor> {
  const map = new Map<string, PortAnchor>();
  const visit = (n: NodeGeometry) => {
    for (const p of n.ports) map.set(p.portId, p);
    n.children?.forEach(visit);
  };
  nodes.forEach(visit);
  return map;
}

/** Wybierz port brzegowy stacji po stronie. */
function stationBoundaryPort(stationRef: string, side: PortSide): string {
  const role = side === 'left' ? 'IN' : side === 'right' ? 'OUT' : side === 'bottom' ? 'FEEDER' : 'INTOP';
  return makePortId(stationRef, role, side);
}

function orthogonalPolyline(
  from: PortAnchor,
  to: PortAnchor,
): ReadonlyArray<{ x: number; y: number }> {
  // L-shape / Z-shape ortogonalny: wyjdź zgodnie ze stroną portu, dojdź do celu.
  const pts: { x: number; y: number }[] = [{ x: from.x, y: from.y }];
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  if (from.side === 'left' || from.side === 'right') {
    pts.push({ x: midX, y: from.y });
    pts.push({ x: midX, y: to.y });
  } else {
    pts.push({ x: from.x, y: midY });
    pts.push({ x: to.x, y: midY });
  }
  pts.push({ x: to.x, y: to.y });
  return pts;
}

function buildEdges(
  tree: TopologyTree,
  raw: Map<string, RawStation>,
  ports: Map<string, PortAnchor>,
): EdgeGeometry[] {
  const edges: EdgeGeometry[] = [];
  // Każda krawędź drzewa stacja→dziecko = segment (parentBranch).
  const ordered = [...tree.nodes.values()].sort((a, b) => a.ref.localeCompare(b.ref));
  for (const node of ordered) {
    if (node.parent === null) continue;
    if (!raw.has(node.ref) || !raw.has(node.parent)) continue;
    const parentRaw = raw.get(node.parent)!;
    const childRaw = raw.get(node.ref)!;
    const branch = tree.parentBranch.get(node.ref);
    const branchRef = branch?.id ?? `edge:${node.parent}->${node.ref}`;

    // Strona wyjścia z rodzica: trunk→trunk = OUT(prawo); trunk→lateral = FEEDER(dół).
    const childOnTrunk = node.onTrunk;
    const fromSide: PortSide = childOnTrunk ? 'right' : 'bottom';
    // Wejście do dziecka: od strony rodzica.
    const toSide: PortSide = childOnTrunk
      ? 'left'
      : childRaw.cy < parentRaw.cy
        ? 'bottom'
        : 'top';

    const fromPortId = stationBoundaryPort(node.parent, fromSide);
    const toPortId = stationBoundaryPort(node.ref, toSide);
    const fromPort = ports.get(fromPortId);
    const toPort = ports.get(toPortId);
    if (!fromPort || !toPort) continue;

    edges.push({
      ref: branchRef,
      lod: 'L0',
      fromPortId,
      toPortId,
      polyline: orthogonalPolyline(fromPort, toPort),
      label: branch?.name,
    });
  }
  return edges;
}

// ---------------------------------------------------------------------------
// Auto-fit ≥75% (M-01) — skala + translacja, mutuje współrzędne zagnieżdżone.
// ---------------------------------------------------------------------------

function computeBBox(nodes: readonly NodeGeometry[]): LayoutBBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const visit = (n: NodeGeometry) => {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
    n.children?.forEach(visit);
  };
  nodes.forEach(visit);
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

function transformPort(p: PortAnchor, s: number, dx: number, dy: number): PortAnchor {
  return { ...p, x: p.x * s + dx, y: p.y * s + dy };
}

function transformNode(n: NodeGeometry, s: number, dx: number, dy: number): NodeGeometry {
  return {
    ...n,
    x: n.x * s + dx,
    y: n.y * s + dy,
    width: n.width * s,
    height: n.height * s,
    ports: n.ports.map((p) => transformPort(p, s, dx, dy)),
    children: n.children?.map((c) => transformNode(c, s, dx, dy)),
  };
}

function autoFit(
  nodes: readonly NodeGeometry[],
  edges: readonly EdgeGeometry[],
  frame: LayoutFrame,
): { nodes: NodeGeometry[]; edges: EdgeGeometry[]; bbox: LayoutBBox } {
  const bbox = computeBBox(nodes);
  const pad = frame.padding ?? 40;
  const usableW = Math.max(1, frame.width - 2 * pad);
  const usableH = Math.max(1, frame.height - 2 * pad);
  const contentW = Math.max(1, bbox.maxX - bbox.minX);
  const contentH = Math.max(1, bbox.maxY - bbox.minY);

  // Skala tak, by bbox wypełnił TARGET_FILL użytecznej powierzchni (≥75%).
  const sFit = Math.min(usableW / contentW, usableH / contentH);
  const s = sFit * TARGET_FILL;

  // Wycentruj.
  const scaledW = contentW * s;
  const scaledH = contentH * s;
  const dx = pad + (usableW - scaledW) / 2 - bbox.minX * s;
  const dy = pad + (usableH - scaledH) / 2 - bbox.minY * s;

  const fitNodes = nodes.map((n) => transformNode(n, s, dx, dy));
  const fitEdges = edges.map((e) => ({
    ...e,
    polyline: e.polyline.map((pt) => ({ x: pt.x * s + dx, y: pt.y * s + dy })),
  }));
  return { nodes: fitNodes, edges: fitEdges, bbox: computeBBox(fitNodes) };
}

// ---------------------------------------------------------------------------
// Projekcja LOD: z jednej zagnieżdżonej geometrii wybierz głębokość renderu.
// ---------------------------------------------------------------------------

function projectLod(node: NodeGeometry, lod: LodLevel): NodeGeometry {
  if (lod === 'L0') {
    return { ...node, children: undefined };
  }
  if (lod === 'L1') {
    // stacja + pola, ale aparaty (L2) odcięte
    return {
      ...node,
      children: node.children?.map((field) => ({ ...field, children: undefined })),
    };
  }
  // L2 = pełna głębokość
  return node;
}

// ---------------------------------------------------------------------------
// Silnik.
// ---------------------------------------------------------------------------

export class TopologicalLayoutEngine implements LayoutEngine {
  constructor(private readonly frame: LayoutFrame = DEFAULT_FRAME) {}

  layout(snapshot: EnmSnapshot, mode: LayoutMode, lod?: LodLevel): LayoutResult {
    if (mode === 'geo') {
      return {
        mode,
        nodes: [],
        edges: [],
        bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
        unavailable: {
          code: 'geo.coordinates_missing',
          reason:
            'Tryb geo niedostępny — ENM nie zawiera współrzędnych geograficznych (dług 7.6.C). ' +
            'Wymaga importu GIS/CGMES.',
        },
      };
    }

    const stationById = new Map<string, TopologyStationV1>(
      snapshot.stations.map((s) => [s.id, s]),
    );
    const tree = buildTopologyTree(snapshot);
    const raw = positionStations(tree, stationById);

    // Buduj zagnieżdżoną geometrię stacji (korzenie L0), w deterministycznej kolejności.
    const rawSorted = [...raw.values()].sort((a, b) => a.ref.localeCompare(b.ref));
    const stationNodesRaw = rawSorted.map(buildStationGeometry);

    // Krawędzie na surowych pozycjach (porty pre-fit).
    const portsRaw = portById(stationNodesRaw);
    const edgesRaw = buildEdges(tree, raw, portsRaw);

    // Auto-fit ≥75% (M-01).
    const { nodes: fitNodes, edges: fitEdges, bbox } = autoFit(
      stationNodesRaw,
      edgesRaw,
      this.frame,
    );

    // Projekcja LOD (z jednej prawdy).
    const projected = lod ? fitNodes.map((n) => projectLod(n, lod)) : fitNodes;
    const projectedEdges =
      lod && lod !== 'L2'
        ? fitEdges.map((e) => ({ ...e, lod }))
        : fitEdges;

    return {
      mode,
      nodes: projected,
      edges: projectedEdges,
      bbox,
    };
  }
}

/** Fabryka domyślna. */
export function createTopologicalLayoutEngine(frame?: LayoutFrame): LayoutEngine {
  return new TopologicalLayoutEngine(frame);
}
