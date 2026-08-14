/**
 * Kompozycja SCENY L2 (karta T5b, §0 rozstrzygnięcie 3) — GENERYCZNA z grafu
 * domeny, ŻADNEGO szablonu TR→RGnN→odpływy. Układ z topologii (werdykt):
 * "źródła u góry, szyny wg sekcji, odpływy w dół, boundary chipy na
 * krawędzi" — realizowane WPROST przez `hops_from_root` już policzone przez
 * backend (`application/analyses/lv_domain/graph_view.py`, REUSE — zero
 * powtórnego BFS w TS): wiersz = głębokość, kolumna = pozycja w drzewie
 * rodzic→dziecko wyprowadzona z gałęzi domeny. Źródła (transformatory/
 * generatory) siedzą JEDEN wiersz NAD szyną, do której są podłączone — dla
 * typowej (jednopoziomowej) domeny to dosłownie "u góry"; dla generatora za
 * podrozdzielnicą to "u góry TEJ gałęzi", co jest poprawne elektrycznie
 * (źródło nie może wisieć nad całym rysunkiem, jeśli jest 3 przeskoki w głąb).
 *
 * ZERO fizyki — czysta geometria z topologii. Determinizm: te same dane →
 * identyczna scena (sortowanie WSZĘDZIE po `ref_id`).
 */
import type { SymbolId } from '../symbols/defs';
import type {
  LvDomainBoundaryLink,
  LvDomainBranch,
  LvDomainBus,
  LvDomainGraphView,
  LvDomainSubSwitchboard,
  UpstreamEquivalentSnapshot,
} from './types';

// ---------------------------------------------------------------------------
// Geometria — jednostki siatki (px), niezależne od kamery (WŁASNA kanwa L2,
// karta §0 pkt 3 "NOWY POZIOM, WŁASNA KANWA" koncepcji LOD nN).
// ---------------------------------------------------------------------------

// F1 (dowód wizualny e2e/lv-domain-screenshot.spec.ts): kolumny wąskie (96px)
// i margines górny wąski (40px) kolidowały z etykietą tabliczki TR (werdykt:
// "Sn·przekładnia·grupa·uk%", tekst szerszy niż jedna kolumna) i z kotwicą SN
// DWA wiersze nad szyną (`SOURCE_ROW_OFFSET*2` ponad `MARGIN_Y` — przy
// wąskim marginesie kotwica wychodziła poza górną krawędź kanwy). Wartości
// niżej zmierzone na fixturze wieloźródłowej (2×TR w sąsiednich kolumnach) —
// zero nakładania się etykiet, kotwica w całości widoczna.
const COLUMN_WIDTH = 260;
const ROW_HEIGHT = 110;
const SOURCE_ROW_OFFSET = 60;
// Margines lewy dostatecznie szeroki, żeby chip kotwicy SN pierwszej kolumny
// (najszersza etykieta sceny, wyśrodkowana na kolumnie 0) mieścił się W
// CAŁOŚCI po lewej stronie krawędzi kanwy (zmierzone na fixturze
// wieloźródłowej: etykieta „SN 15 kV · Sk″=187.4 MVA · Ik″=7.21 kA" ma
// szerokość rzędu 260px, więc margines musi pokryć jej połowę).
const MARGIN_X = 140;
const MARGIN_Y = 170;
const BOUNDARY_CHIP_OFFSET_X = 96;

export type LvDomainSceneNodeKind =
  | 'anchorChip'
  | 'transformer'
  | 'generator'
  | 'bus'
  | 'busJunction'
  | 'apparatus'
  | 'load'
  | 'boundaryChip';

export interface LvDomainSceneNode {
  readonly kind: LvDomainSceneNodeKind;
  /** `ref_id` elementu domeny (transformator/generator/bus/gałąź/odbiór) albo
   *  identyfikator syntetyczny dla chipów (`anchor:{transformer_ref}`,
   *  `boundary:{branch_ref}`) — WYROCZNIA zgodności (`sceneConformance.test.ts`)
   *  odróżnia je po prefiksie. */
  readonly ref: string;
  readonly x: number;
  readonly y: number;
  readonly label: string;
  readonly symbolId?: SymbolId;
  /** Dane WYSTAWIONE na węźle dla inspekcji (werdykt: "pełny snapshot w
   *  danych/inspekcji") — konsumowane jako `data-*`/tytuł SVG, NIGDY
   *  renderowane jako 10 liczb naraz na kanwie. */
  readonly meta?: Readonly<Record<string, unknown>>;
}

export type LvDomainSceneEdgeKind = 'sourceDrop' | 'coupler' | 'branch' | 'boundaryLink';

export interface LvDomainSceneEdge {
  readonly ref: string;
  readonly kind: LvDomainSceneEdgeKind;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly status?: 'closed' | 'open';
}

export interface LvDomainScene {
  readonly nodes: readonly LvDomainSceneNode[];
  readonly edges: readonly LvDomainSceneEdge[];
  readonly width: number;
  readonly height: number;
  readonly stationRef: string;
  readonly stationName: string;
}

// ---------------------------------------------------------------------------
// Krok 1 — kolumny per szyna, drzewo rodzic→dziecko wyprowadzone Z GAŁĘZI
// (nie z szablonu): rodzic szyny B (depth d>0) = szyna A (depth d-1)
// połączona z B gałęzią o NAJMNIEJSZYM `ref_id` spośród kandydatów — reguła
// deterministyczna, czysto porządkowa (geometria, nie fizyka/topologia).
// ---------------------------------------------------------------------------

interface BusLayout {
  readonly busRef: string;
  readonly depth: number;
  readonly column: number;
}

function assignBusColumns(buses: readonly LvDomainBus[], branches: readonly LvDomainBranch[]): Map<string, BusLayout> {
  const byRef = new Map(buses.map((b) => [b.ref_id, b] as const));
  const byDepth = new Map<number, LvDomainBus[]>();
  for (const bus of buses) {
    const list = byDepth.get(bus.hops_from_root) ?? [];
    list.push(bus);
    byDepth.set(bus.hops_from_root, list);
  }
  for (const list of byDepth.values()) list.sort((a, b) => a.ref_id.localeCompare(b.ref_id));

  // Kandydaci rodzica: gałęzie łączące dwie szyny domeny o różnicy głębokości
  // dokładnie 1, posortowane po ref_id gałęzi (determinizm przy wielu
  // kandydatach — np. dwie gałęzie równoległe do tej samej szyny nadrzędnej).
  const parentBranchOf = new Map<string, LvDomainBranch>();
  const sortedBranches = [...branches].sort((a, b) => a.ref_id.localeCompare(b.ref_id));
  for (const branch of sortedBranches) {
    const fromBus = byRef.get(branch.from_bus_ref);
    const toBus = byRef.get(branch.to_bus_ref);
    if (!fromBus || !toBus) continue;
    if (toBus.hops_from_root === fromBus.hops_from_root + 1 && !parentBranchOf.has(toBus.ref_id)) {
      parentBranchOf.set(toBus.ref_id, branch);
    } else if (fromBus.hops_from_root === toBus.hops_from_root + 1 && !parentBranchOf.has(fromBus.ref_id)) {
      parentBranchOf.set(fromBus.ref_id, branch);
    }
  }

  const layout = new Map<string, BusLayout>();
  const maxDepth = Math.max(0, ...buses.map((b) => b.hops_from_root));
  let nextRootColumn = 0;

  for (let depth = 0; depth <= maxDepth; depth += 1) {
    const busesAtDepth = byDepth.get(depth) ?? [];
    if (depth === 0) {
      for (const bus of busesAtDepth) {
        layout.set(bus.ref_id, { busRef: bus.ref_id, depth, column: nextRootColumn });
        nextRootColumn += 1;
      }
      continue;
    }
    // Grupuj po rodzicu (kolumna rodzica) — dzieci tego samego rodzica
    // dostają kolejne kolumny WOKÓŁ kolumny rodzica (rozstrzygane po
    // ref_id własnej szyny dla determinizmu); szyny bez rozwiązanego
    // rodzica (dane niekompletne) trafiają na koniec, kolejne wolne kolumny.
    const byParentColumn = new Map<number, LvDomainBus[]>();
    const orphans: LvDomainBus[] = [];
    for (const bus of busesAtDepth) {
      const parentBranch = parentBranchOf.get(bus.ref_id);
      const parentRef = parentBranch
        ? parentBranch.from_bus_ref === bus.ref_id
          ? parentBranch.to_bus_ref
          : parentBranch.from_bus_ref
        : undefined;
      const parentLayout = parentRef ? layout.get(parentRef) : undefined;
      if (!parentLayout) {
        orphans.push(bus);
        continue;
      }
      const group = byParentColumn.get(parentLayout.column) ?? [];
      group.push(bus);
      byParentColumn.set(parentLayout.column, group);
    }
    let cursor = 0;
    for (const parentColumn of [...byParentColumn.keys()].sort((a, b) => a - b)) {
      const children = byParentColumn.get(parentColumn)!.sort((a, b) => a.ref_id.localeCompare(b.ref_id));
      const startColumn = Math.max(cursor, parentColumn - (children.length - 1) / 2);
      children.forEach((bus, idx) => {
        layout.set(bus.ref_id, { busRef: bus.ref_id, depth, column: startColumn + idx });
      });
      cursor = startColumn + children.length;
    }
    for (const bus of orphans.sort((a, b) => a.ref_id.localeCompare(b.ref_id))) {
      layout.set(bus.ref_id, { busRef: bus.ref_id, depth, column: cursor });
      cursor += 1;
    }
  }
  return layout;
}

function apparatusSymbolFor(branchType: LvDomainBranch['type']): SymbolId | undefined {
  switch (branchType) {
    case 'breaker':
      return 'nnBreaker';
    case 'switch':
    case 'disconnector':
      return 'nnBreaker';
    case 'fuse':
      return 'nnFuseSwitch';
    case 'bus_coupler':
      return 'nnBreaker';
    case 'cable':
    case 'line_overhead':
      return undefined; // przewód — kreska, bez glifu aparatu
    default:
      return undefined;
  }
}

function symbolForGenerator(genType: string | null | undefined): SymbolId {
  switch (genType) {
    case 'pv_inverter':
      return 'derPv';
    case 'bess':
      return 'derBess';
    default:
      return 'derGenerator';
  }
}

/** Etykieta tabliczki TR (werdykt: "Sn·przekładnia·grupa·uk%"). */
export function transformerNameplateLabel(t: {
  readonly sn_mva: number;
  readonly uhv_kv: number;
  readonly ulv_kv: number;
  readonly vector_group?: string | null;
  readonly uk_percent: number;
}): string {
  const sn = `${t.sn_mva} MVA`;
  const ratio = `${t.uhv_kv}/${t.ulv_kv} kV`;
  const group = t.vector_group ?? '—';
  return `${sn} · ${ratio} · ${group} · uk=${t.uk_percent}%`;
}

/** Etykieta chipa kotwicy SN (werdykt: chip kompakt na ekranie, pełny
 *  snapshot w meta). */
export function anchorChipLabel(snapshot: UpstreamEquivalentSnapshot): string {
  if (snapshot.status !== 'OK') {
    return 'SN · brak danych';
  }
  const uVoltage = snapshot.voltage_kv != null ? `${snapshot.voltage_kv} kV` : '—';
  const sk = snapshot.sk_mva != null ? `Sk″=${snapshot.sk_mva.toFixed(1)} MVA` : 'Sk″=—';
  const ik = snapshot.ikss_ka != null ? `Ik″=${snapshot.ikss_ka.toFixed(2)} kA` : 'Ik″=—';
  return `SN ${uVoltage} · ${sk} · ${ik}`;
}

export function composeLvDomainScene(
  view: LvDomainGraphView,
  upstreamEquivalents: readonly UpstreamEquivalentSnapshot[] = [],
): LvDomainScene {
  const nodes: LvDomainSceneNode[] = [];
  const edges: LvDomainSceneEdge[] = [];

  if (view.status !== 'OK') {
    return { nodes, edges, width: 0, height: 0, stationRef: view.station_ref, stationName: view.station_name ?? '' };
  }

  const busLayout = assignBusColumns(view.buses, view.branches);
  const busByRef = new Map(view.buses.map((b) => [b.ref_id, b] as const));
  const subSwitchboardBusRefs = new Set<string>(
    view.sub_switchboards.flatMap((s: LvDomainSubSwitchboard) => s.bus_refs),
  );

  function positionOf(busRef: string): { readonly x: number; readonly y: number } | undefined {
    const layout = busLayout.get(busRef);
    if (!layout) return undefined;
    return {
      x: MARGIN_X + layout.column * COLUMN_WIDTH,
      y: MARGIN_Y + layout.depth * ROW_HEIGHT,
    };
  }

  // --- Szyny (sekcje) — wg wzorca: sekcja pełna (depth 0 lub kontener
  // podrozdzielnicy) dostaje glif rozdzielnicy nN; pozostałe węzły trasy
  // (przelotowe punkty odcinka kablowego) dostają mały węzeł (bez pełnego
  // gabarytu rozdzielnicy — unika fabrykowania fałszywych "rozdzielnic" dla
  // każdej mufy/punktu pośredniego).
  for (const bus of [...view.buses].sort((a, b) => a.ref_id.localeCompare(b.ref_id))) {
    const pos = positionOf(bus.ref_id);
    if (!pos) continue;
    const isBoard = bus.hops_from_root === 0 || subSwitchboardBusRefs.has(bus.ref_id);
    nodes.push({
      kind: isBoard ? 'bus' : 'busJunction',
      ref: bus.ref_id,
      x: pos.x,
      y: pos.y,
      label: bus.name,
      symbolId: isBoard ? 'nnDistributionBoard' : 'junction',
      meta: { voltageKv: bus.voltage_kv, voltageLevelId: bus.voltage_level_id, hopsFromRoot: bus.hops_from_root },
    });
  }

  // --- Źródła: transformatory (JEDEN wiersz nad ich szyną nN) + kotwica SN.
  const snapshotByTransformerRef = new Map(upstreamEquivalents.map((s) => [s.transformer_ref, s] as const));
  for (const trafo of [...view.transformers].sort((a, b) => a.ref_id.localeCompare(b.ref_id))) {
    const busPos = positionOf(trafo.lv_bus_ref);
    if (!busPos) continue;
    const trafoPos = { x: busPos.x, y: busPos.y - SOURCE_ROW_OFFSET };
    nodes.push({
      kind: 'transformer',
      ref: trafo.ref_id,
      x: trafoPos.x,
      y: trafoPos.y,
      label: transformerNameplateLabel(trafo),
      symbolId: 'transformer2W',
      meta: { hvBusRef: trafo.hv_bus_ref, lvBusRef: trafo.lv_bus_ref },
    });
    edges.push({
      ref: `${trafo.ref_id}#source-drop`,
      kind: 'sourceDrop',
      x1: trafoPos.x,
      y1: trafoPos.y,
      x2: busPos.x,
      y2: busPos.y,
    });

    const snapshot = snapshotByTransformerRef.get(trafo.ref_id);
    const anchorPos = { x: trafoPos.x, y: trafoPos.y - SOURCE_ROW_OFFSET };
    nodes.push({
      kind: 'anchorChip',
      ref: `anchor:${trafo.ref_id}`,
      x: anchorPos.x,
      y: anchorPos.y,
      label: snapshot ? anchorChipLabel(snapshot) : 'SN · brak danych',
      meta: snapshot as unknown as Record<string, unknown> | undefined,
    });
    edges.push({
      ref: `anchor:${trafo.ref_id}#drop`,
      kind: 'sourceDrop',
      x1: anchorPos.x,
      y1: anchorPos.y,
      x2: trafoPos.x,
      y2: trafoPos.y,
    });
  }

  // --- Generatory (PV/BESS/G1) — JEDEN wiersz nad szyną, do której są
  // podłączone (dowolna głębokość — wieloźródłowość jawna, karta §0 pkt 3).
  for (const gen of [...view.generators].sort((a, b) => a.ref_id.localeCompare(b.ref_id))) {
    const busPos = positionOf(gen.bus_ref);
    if (!busPos) continue;
    const genPos = { x: busPos.x + COLUMN_WIDTH * 0.5, y: busPos.y - SOURCE_ROW_OFFSET };
    nodes.push({
      kind: 'generator',
      ref: gen.ref_id,
      x: genPos.x,
      y: genPos.y,
      label: `${gen.name} · ${gen.p_mw} MW`,
      symbolId: symbolForGenerator(gen.gen_type),
      meta: { busRef: gen.bus_ref, genType: gen.gen_type, connectionVariant: gen.connection_variant },
    });
    edges.push({
      ref: `${gen.ref_id}#source-drop`,
      kind: 'sourceDrop',
      x1: genPos.x,
      y1: genPos.y,
      x2: busPos.x,
      y2: busPos.y,
    });
  }

  // --- Gałęzie: sprzęgło = poziomy łącznik MIĘDZY sekcjami tej samej
  // głębokości; pozostałe = odpływ pionowy (aparat na trasie).
  for (const branch of [...view.branches].sort((a, b) => a.ref_id.localeCompare(b.ref_id))) {
    const fromPos = positionOf(branch.from_bus_ref);
    const toPos = positionOf(branch.to_bus_ref);
    if (!fromPos || !toPos) continue;
    const fromBus = busByRef.get(branch.from_bus_ref);
    const toBus = busByRef.get(branch.to_bus_ref);
    const isCoupler = branch.type === 'bus_coupler' && fromBus && toBus && fromBus.hops_from_root === toBus.hops_from_root;

    const symbolId = apparatusSymbolFor(branch.type);
    if (symbolId && !isCoupler) {
      const midX = (fromPos.x + toPos.x) / 2;
      const midY = (fromPos.y + toPos.y) / 2;
      nodes.push({
        kind: 'apparatus',
        ref: branch.ref_id,
        x: midX,
        y: midY,
        label: branch.name,
        symbolId,
        meta: { status: branch.status, catalogRef: branch.catalog_ref, type: branch.type },
      });
    }
    edges.push({
      ref: branch.ref_id,
      kind: isCoupler ? 'coupler' : 'branch',
      x1: fromPos.x,
      y1: fromPos.y,
      x2: toPos.x,
      y2: toPos.y,
      status: branch.status,
    });
  }

  // --- Odbiory (liście) — mała etykieta pod szyną, do której są podłączone.
  for (const load of [...view.loads].sort((a, b) => a.ref_id.localeCompare(b.ref_id))) {
    const busPos = positionOf(load.bus_ref);
    if (!busPos) continue;
    nodes.push({
      kind: 'load',
      ref: load.ref_id,
      x: busPos.x,
      y: busPos.y + ROW_HEIGHT * 0.5,
      label: `${load.name} · ${load.p_mw} MW`,
      symbolId: 'loadArrow',
      meta: { busRef: load.bus_ref, pMw: load.p_mw, qMvar: load.q_mvar },
    });
  }

  // --- Boundary chipy — na krawędzi (bok szyny źródłowej, TA SAMA
  // wysokość), werdykt §0 pkt 3.
  for (const link of [...view.boundary_links].sort((a: LvDomainBoundaryLink, b) => a.branch_ref.localeCompare(b.branch_ref))) {
    const fromPos = positionOf(link.from_bus_ref);
    if (!fromPos) continue;
    const chipPos = { x: fromPos.x + BOUNDARY_CHIP_OFFSET_X, y: fromPos.y };
    nodes.push({
      kind: 'boundaryChip',
      ref: `boundary:${link.branch_ref}`,
      x: chipPos.x,
      y: chipPos.y,
      label: `→ ${link.target_station_name}`,
      meta: { targetStationRef: link.target_station_ref, branchRef: link.branch_ref },
    });
    edges.push({
      ref: `boundary:${link.branch_ref}#link`,
      kind: 'boundaryLink',
      x1: fromPos.x,
      y1: fromPos.y,
      x2: chipPos.x,
      y2: chipPos.y,
    });
  }

  const maxX = nodes.length > 0 ? Math.max(...nodes.map((n) => n.x)) : MARGIN_X;
  const maxY = nodes.length > 0 ? Math.max(...nodes.map((n) => n.y)) : MARGIN_Y;

  return {
    nodes,
    edges,
    width: maxX + MARGIN_X + COLUMN_WIDTH,
    height: maxY + MARGIN_Y + ROW_HEIGHT,
    stationRef: view.station_ref,
    stationName: view.station_name ?? '',
  };
}
