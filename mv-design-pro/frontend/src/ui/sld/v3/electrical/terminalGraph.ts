/**
 * SLD-nN-TOPOLOGIA T0 (`docs/nn/PLAN_SLD_NN_TOPOLOGIA_2026-08.md`) — graf
 * elektryczny terminali. CZYSTY TS, ZERO Reacta, ZERO fizyki (topologia nie
 * jest fizyka: żadna impedancja/moc/prąd nie jest tu liczona — wyłącznie
 * KTO-Z-KIM jest połączony i w JAKIEJ domenie napięciowej).
 *
 * Architektura docelowa (plan §Architektura): ENM → TERMINAL GRAPH →
 * ELECTRICAL GRAPH → VOLTAGE DOMAINS → CONNECTIVITY VALIDATION → …. Ten plik
 * buduje węzły (szyny ENM) i krawędzie (gałęzie przewodzące ENM) WYŁĄCZNIE z
 * relacji elektrycznych modelu — zero wnioskowania z geometrii/layoutu (to
 * jest dokładnie odwrotność defektu zmierzonego w werdykcie B-02: scena
 * `compose/station.ts` rysuje linię i NAZYWA ją szyną; ten moduł idzie w
 * drugą stronę — czyta model i NIGDY nie zagląda do warstwy rysunku).
 *
 * POMIAR (nie domysł) roli HV/LV transformatora: `types/enm.ts`
 * `Transformer` niesie DWA JAWNE pola `hv_bus_ref`/`lv_bus_ref` (osobne od
 * `from_bus_ref`/`to_bus_ref` używanych przez `Branch`) — model ENM już
 * rozstrzyga, która strona jest HV i która LV. Ten moduł czyta te pola
 * WPROST i NIE porównuje `voltage_kv` obu szyn, żeby wywnioskować „większe
 * napięcie = HV" — takie porównanie byłoby zgadywaniem tam, gdzie dana już
 * istnieje (zakaz `domain_no_guessing_guard`).
 */
import type {
  Branch,
  EnergyNetworkModel,
  Generator,
  Load,
  Source,
  Transformer,
} from '../../../../types/enm';

// ---------------------------------------------------------------------------
// Domena napięciowa — dyskretyzacja po wartości `Bus.voltage_kv`.
// ---------------------------------------------------------------------------

/**
 * Tożsamość domeny napięciowej. Dwie szyny są w TEJ SAMEJ domenie WTEDY I
 * TYLKO WTEDY, gdy ich `voltageLevelId` są identyczne — dyskretyzacja
 * eliminuje artefakty zmiennoprzecinkowe (np. `0.4` wczytane z dwóch źródeł
 * jako `0.4` i `0.40000000000000002`) bez wprowadzania tolerancji, która
 * mogłaby ZLEPIĆ dwie faktycznie różne domeny (np. 15 kV i 15,75 kV — realne,
 * różne poziomy w niektórych sieciach SN).
 */
export type VoltageLevelId = string;

const VOLTAGE_LEVEL_PRECISION = 1e6;

export function voltageLevelIdForKv(voltageKv: number): VoltageLevelId {
  if (!Number.isFinite(voltageKv)) return 'kv:invalid';
  const normalized = Math.round(voltageKv * VOLTAGE_LEVEL_PRECISION) / VOLTAGE_LEVEL_PRECISION;
  return `kv:${normalized}`;
}

// ---------------------------------------------------------------------------
// Węzły — szyny ENM.
// ---------------------------------------------------------------------------

export interface TerminalNode {
  readonly busRef: string;
  readonly name: string;
  readonly voltageKv: number;
  readonly voltageLevelId: VoltageLevelId;
}

// ---------------------------------------------------------------------------
// Krawędzie WEWNĄTRZ jednej domeny — gałęzie ENM (`Branch`, dyskryminowane po
// `type`) oraz łączniki. Łącznik jest KRAWĘDZIĄ niezależnie od stanu
// (`status`) — stan otwarty jest warunkiem RUCHOWYM, nie deklaracją, że
// urządzenie nigdy nie mogłoby zmostkować dwóch domen (inwariant 1/6 muszą
// wykryć błąd DOBORU URZĄDZENIA, nie tylko chwilowy stan łącznika).
// ---------------------------------------------------------------------------

export type ConductingEdgeKind = Branch['type'];

export interface ConductingEdge {
  readonly ref: string;
  readonly name: string;
  readonly kind: ConductingEdgeKind;
  readonly fromBusRef: string;
  readonly toBusRef: string;
  readonly status: 'closed' | 'open';
  readonly catalogNamespace: string | null;
  readonly materializedParams: Readonly<Record<string, unknown>> | null;
}

// ---------------------------------------------------------------------------
// Krawędzie MIĘDZY domenami — WYŁĄCZNIE transformatory (plan §0.1: "TRANSFOR-
// MATORY = JEDYNE krawędzie międzydomenowe z jawnymi terminalami"). ENM nie
// niesie dziś żadnego typu "Converter" (zmierzone: `grep -n "Converter"
// types/enm.ts` — zero trafień) — druga legalna krawędź międzydomenowa
// zapowiedziana w planie (konwerter DER) NIE ISTNIEJE jeszcze w modelu jako
// osobny typ elementu; `Generator`/inwerter dziś siedzi jako TERMINAL LIŚCIOWY
// na JEDNEJ szynie (patrz `LeafTerminal` niżej), zgodnie z `connection_variant`
// ENM (`nn_side`/`DEDICATED_MV_CONNECTION`/…) — żadna krawędź konwertera nie
// jest tu fabrykowana. Gdy backend doda realny typ konwertera, ten graf
// zyska drugi wariant krawędzi międzydomenowej analogiczny do transformatora.
// ---------------------------------------------------------------------------

export interface TransformerTerminal {
  readonly busRef: string;
  readonly voltageKv: number;
  readonly voltageLevelId: VoltageLevelId;
  /** Napięcie znamionowe uzwojenia z tabliczki transformatora
   *  (`Transformer.uhv_kv`/`ulv_kv`) — ODRĘBNE od `voltageKv` szyny (to
   *  ostatnie jest napięciem ZNAMIONOWYM SZYNY, do której transformator jest
   *  podłączony; oba powinny się zgadzać w granicach tolerancji — inwariant 2
   *  czyta OBA pola właśnie po to, żeby wykryć rozjazd). */
  readonly ratedKv: number;
}

export interface TransformerEdge {
  readonly ref: string;
  readonly name: string;
  readonly hvTerminal: TransformerTerminal;
  readonly lvTerminal: TransformerTerminal;
}

// ---------------------------------------------------------------------------
// Terminale liściowe — odbiory/źródła (plan §0.1: "odbiory/źródła = terminale
// liściowe").
// ---------------------------------------------------------------------------

export type LeafTerminalKind = 'load' | 'generator' | 'source';

export interface LeafTerminal {
  readonly ref: string;
  readonly name: string;
  readonly kind: LeafTerminalKind;
  readonly busRef: string;
}

// ---------------------------------------------------------------------------
// Referencje nierozwiązywalne (dowiązanie do szyny, której NIE MA w modelu) —
// wyprowadzone PODCZAS budowy, konsumowane przez inwariant 4/5.
// ---------------------------------------------------------------------------

export type UnresolvedReferenceOwnerKind =
  | 'branch_from'
  | 'branch_to'
  | 'transformer_hv'
  | 'transformer_lv'
  | 'load'
  | 'generator'
  | 'source';

export interface UnresolvedReference {
  readonly ownerRef: string;
  readonly ownerKind: UnresolvedReferenceOwnerKind;
  readonly danglingBusRef: string;
}

// ---------------------------------------------------------------------------
// Graf terminali kompletny.
// ---------------------------------------------------------------------------

export interface TerminalGraph {
  readonly nodes: ReadonlyMap<string, TerminalNode>;
  readonly edges: readonly ConductingEdge[];
  readonly transformerEdges: readonly TransformerEdge[];
  readonly leaves: readonly LeafTerminal[];
  readonly unresolvedReferences: readonly UnresolvedReference[];
}

function terminalNodeFromBus(bus: { ref_id: string; name: string; voltage_kv: number }): TerminalNode {
  return {
    busRef: bus.ref_id,
    name: bus.name,
    voltageKv: bus.voltage_kv,
    voltageLevelId: voltageLevelIdForKv(bus.voltage_kv),
  };
}

function transformerTerminal(
  nodes: ReadonlyMap<string, TerminalNode>,
  busRef: string,
  ratedKv: number,
): TransformerTerminal | null {
  const node = nodes.get(busRef);
  if (!node) return null;
  return { busRef, voltageKv: node.voltageKv, voltageLevelId: node.voltageLevelId, ratedKv };
}

/**
 * Zbuduj graf terminali WYŁĄCZNIE z relacji elektrycznych ENM. Referencje
 * wskazujące na nieistniejącą szynę NIE wyrzucają wyjątku (WHITE BOX: model
 * może być niekompletny w trakcie edycji) — trafiają do
 * `unresolvedReferences`, a element NIE dostaje krawędzi/terminala liściowego
 * dla brakującej strony (zero fabrykacji węzła, którego ENM nie deklaruje).
 */
export function buildTerminalGraph(enm: EnergyNetworkModel): TerminalGraph {
  const nodes = new Map<string, TerminalNode>();
  for (const bus of enm.buses ?? []) {
    nodes.set(bus.ref_id, terminalNodeFromBus(bus));
  }

  const unresolvedReferences: UnresolvedReference[] = [];
  const edges: ConductingEdge[] = [];
  for (const branch of (enm.branches ?? []) as readonly Branch[]) {
    const fromKnown = nodes.has(branch.from_bus_ref);
    const toKnown = nodes.has(branch.to_bus_ref);
    if (!fromKnown) {
      unresolvedReferences.push({
        ownerRef: branch.ref_id,
        ownerKind: 'branch_from',
        danglingBusRef: branch.from_bus_ref,
      });
    }
    if (!toKnown) {
      unresolvedReferences.push({
        ownerRef: branch.ref_id,
        ownerKind: 'branch_to',
        danglingBusRef: branch.to_bus_ref,
      });
    }
    // Gałąź BEZ obu końców rozwiązanych nie niesie użytecznej informacji o
    // domenach — pomijamy ją jako krawędź (nierozwiązanie już zaraportowane
    // wyżej), zero fabrykacji krawędzi do nieistniejącego węzła.
    if (!fromKnown || !toKnown) continue;
    edges.push({
      ref: branch.ref_id,
      name: branch.name,
      kind: branch.type,
      fromBusRef: branch.from_bus_ref,
      toBusRef: branch.to_bus_ref,
      status: branch.status,
      catalogNamespace: branch.catalog_namespace ?? null,
      materializedParams:
        (branch.materialized_params as Readonly<Record<string, unknown>> | null | undefined) ?? null,
    });
  }

  const transformerEdges: TransformerEdge[] = [];
  for (const tr of (enm.transformers ?? []) as readonly Transformer[]) {
    const hv = transformerTerminal(nodes, tr.hv_bus_ref, tr.uhv_kv);
    const lv = transformerTerminal(nodes, tr.lv_bus_ref, tr.ulv_kv);
    if (!hv) {
      unresolvedReferences.push({
        ownerRef: tr.ref_id,
        ownerKind: 'transformer_hv',
        danglingBusRef: tr.hv_bus_ref,
      });
    }
    if (!lv) {
      unresolvedReferences.push({
        ownerRef: tr.ref_id,
        ownerKind: 'transformer_lv',
        danglingBusRef: tr.lv_bus_ref,
      });
    }
    if (!hv || !lv) continue;
    transformerEdges.push({ ref: tr.ref_id, name: tr.name, hvTerminal: hv, lvTerminal: lv });
  }

  const leaves: LeafTerminal[] = [];
  for (const load of (enm.loads ?? []) as readonly Load[]) {
    if (!nodes.has(load.bus_ref)) {
      unresolvedReferences.push({ ownerRef: load.ref_id, ownerKind: 'load', danglingBusRef: load.bus_ref });
      continue;
    }
    leaves.push({ ref: load.ref_id, name: load.name, kind: 'load', busRef: load.bus_ref });
  }
  for (const gen of (enm.generators ?? []) as readonly Generator[]) {
    if (!nodes.has(gen.bus_ref)) {
      unresolvedReferences.push({ ownerRef: gen.ref_id, ownerKind: 'generator', danglingBusRef: gen.bus_ref });
      continue;
    }
    leaves.push({ ref: gen.ref_id, name: gen.name, kind: 'generator', busRef: gen.bus_ref });
  }
  for (const src of (enm.sources ?? []) as readonly Source[]) {
    if (!nodes.has(src.bus_ref)) {
      unresolvedReferences.push({ ownerRef: src.ref_id, ownerKind: 'source', danglingBusRef: src.bus_ref });
      continue;
    }
    leaves.push({ ref: src.ref_id, name: src.name, kind: 'source', busRef: src.bus_ref });
  }

  return {
    nodes,
    edges,
    transformerEdges,
    leaves,
    unresolvedReferences,
  };
}

// ---------------------------------------------------------------------------
// Osiągalność WEWNĄTRZ domeny (WYŁĄCZNIE `edges` — transformatory NIGDY nie
// są brane pod uwagę tutaj, to jest dokładnie definicja "nie-transformator").
// JEDNO źródło prawdy dla inwariantu 6 (`invariants.ts`) i testu ścieżkowego
// P0.12(b) (`__tests__/pathInvariants.test.ts`) — reguła KLASA §3
// (`CLAUDE.md`): dwa niezależne opisy tego samego predykatu byłyby gotowym
// rozjazdem.
// ---------------------------------------------------------------------------

/** Składowe spójności grafu liczone WYŁĄCZNIE po `edges` (gałęzie ENM, zero
 *  transformatorów) — każda szyna trafia do dokładnie jednej składowej.
 *  Zwraca mapę `busRef -> id składowej` (id = indeks w kolejności odkrycia,
 *  deterministyczny dla ustalonej kolejności `graph.nodes`/`graph.edges`). */
export function nonTransformerComponents(graph: TerminalGraph): ReadonlyMap<string, number> {
  const adjacency = new Map<string, string[]>();
  const addEdge = (a: string, b: string): void => {
    (adjacency.get(a) ?? adjacency.set(a, []).get(a)!).push(b);
  };
  for (const edge of graph.edges) {
    addEdge(edge.fromBusRef, edge.toBusRef);
    addEdge(edge.toBusRef, edge.fromBusRef);
  }

  const componentOf = new Map<string, number>();
  let nextComponentId = 0;
  for (const busRef of graph.nodes.keys()) {
    if (componentOf.has(busRef)) continue;
    const componentId = nextComponentId++;
    const queue: string[] = [busRef];
    componentOf.set(busRef, componentId);
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const neighbour of adjacency.get(current) ?? []) {
        if (componentOf.has(neighbour)) continue;
        componentOf.set(neighbour, componentId);
        queue.push(neighbour);
      }
    }
  }
  return componentOf;
}

/**
 * Minimalna liczba przejść przez krawędź transformatorową na NAJKRÓTSZEJ (po
 * liczbie przejść międzydomenowych) ścieżce z `fromBusRef` do `toBusRef`,
 * poruszając się po CAŁYM grafie (`edges` — waga 0 — oraz `transformerEdges`
 * — waga 1). `null` gdy żadna ścieżka nie istnieje (szyny w rozłącznych
 * składowych grafu PEŁNEGO, licząc transformatory). Algorytm: 0-1 BFS
 * (deque), O(V+E) — węzły odwiedzone z NIŻSZYM kosztem nie są ponownie
 * przetwarzane.
 */
export function minTransformerCrossings(
  graph: TerminalGraph,
  fromBusRef: string,
  toBusRef: string,
): number | null {
  if (!graph.nodes.has(fromBusRef) || !graph.nodes.has(toBusRef)) return null;
  if (fromBusRef === toBusRef) return 0;

  type Hop = { readonly to: string; readonly weight: 0 | 1 };
  const adjacency = new Map<string, Hop[]>();
  const addHop = (a: string, b: string, weight: 0 | 1): void => {
    (adjacency.get(a) ?? adjacency.set(a, []).get(a)!).push({ to: b, weight });
  };
  for (const edge of graph.edges) {
    addHop(edge.fromBusRef, edge.toBusRef, 0);
    addHop(edge.toBusRef, edge.fromBusRef, 0);
  }
  for (const tr of graph.transformerEdges) {
    addHop(tr.hvTerminal.busRef, tr.lvTerminal.busRef, 1);
    addHop(tr.lvTerminal.busRef, tr.hvTerminal.busRef, 1);
  }

  const dist = new Map<string, number>([[fromBusRef, 0]]);
  const deque: string[] = [fromBusRef];
  while (deque.length > 0) {
    const current = deque.shift()!;
    const currentDist = dist.get(current)!;
    for (const hop of adjacency.get(current) ?? []) {
      const candidate = currentDist + hop.weight;
      const known = dist.get(hop.to);
      if (known !== undefined && known <= candidate) continue;
      dist.set(hop.to, candidate);
      if (hop.weight === 0) deque.unshift(hop.to);
      else deque.push(hop.to);
    }
  }
  return dist.get(toBusRef) ?? null;
}
