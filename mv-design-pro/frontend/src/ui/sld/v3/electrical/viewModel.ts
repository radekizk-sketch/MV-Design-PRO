/**
 * SLD-nN-TOPOLOGIA T0 (`docs/nn/PLAN_SLD_NN_TOPOLOGIA_2026-08.md`) — SZKIELET
 * dla T1. Projekcja grafu elektryczny (`terminalGraph.ts`) na SLD VIEW MODEL:
 * sekcje szyn per domena, przyporządkowanie odpływów/gałęzi do szyn, tor
 * transformatora jako jawna granica domen.
 *
 * ZAKRES T0 (plan §Fazy, T0): WYŁĄCZNIE struktura danych + budowa — ŻADEN
 * konsument (`compose/station.ts`) NIE czyta jeszcze tego modułu (to jest
 * praca T1: „przebudowa `compose/station.ts` na konsumpcję SLD VIEW MODEL z
 * grafu"). Budowa tutaj jest CELOWO 1:1 z węzłami grafu terminali (jedna
 * sekcja = jedna szyna ENM) — wielosekcyjne RGnN z jawnym `NnSection`
 * (sprzęgło/incoming_refs) to rozszerzenie T1, nie regresja T0 (żadna
 * informacja się dziś nie gubi: `NnSection`/`GPZSection` żyją w
 * `Substation`, poza zakresem tego pliku).
 */
import type { ConductingEdge, TerminalGraph, TransformerEdge, VoltageLevelId } from './terminalGraph';

// ---------------------------------------------------------------------------
// T1 (`docs/nn/PLAN_SLD_NN_TOPOLOGIA_2026-08.md` §0.1) — granica transformatora
// jako WYŁĄCZNE źródło prawdy dla „który aparat jest incomerem (aparatem
// głównym) sekcji szyny nN". ZASTĘPUJE domysł pozycyjny (dziś: KAŻDA gałąź
// dotykająca szyny nN jest traktowana jako odpływ, `enmToSldAdapter.ts`
// `buildNnBoardFeeders` wołany z pustym `excludeBranchRefs`, gdy stacja nie
// deklaruje `NnSection.incoming_refs` — QF-TR1-podobny aparat wpada do listy
// odpływów zamiast być narysowany PRZED szyną).
// ---------------------------------------------------------------------------

/**
 * Krawędź grafu (WYŁĄCZNIE `graph.edges`, ZERO transformatorów — granica
 * między transformatorem a jego WŁASNĄ domeną nN nie może sama być kolejnym
 * przeskokiem transformatorowym) DOTYKAJĄCA `boardBusRef` na NAJKRÓTSZEJ
 * ścieżce od `lvTerminalBusRef`. `null` w DWÓCH przypadkach, oba uczciwe (zero
 * fabrykacji): (a) `lvTerminalBusRef === boardBusRef` — transformator
 * podłączony WPROST do szyny nN, bez pośredniego łącznika głównego, sekcja
 * NIE ma osobnego incomera; (b) brak ścieżki nietransformatorowej między
 * terminalem a szyną — dana modelu niekompletna (wołający honestly degraduje,
 * feedery liczone bez wykluczenia incomera).
 *
 * BFS nieważony (WYŁĄCZNIE `graph.edges`, każdy krok waga 1) — krótszy niż
 * `minTransformerCrossings` (który dodatkowo liczy przeskoki transformatorowe,
 * niepotrzebne tutaj: szukamy ścieżki WEWNĄTRZ jednej domeny).
 */
export function findLvIncomerEdge(
  graph: TerminalGraph,
  lvTerminalBusRef: string,
  boardBusRef: string,
): ConductingEdge | null {
  if (lvTerminalBusRef === boardBusRef) return null;
  if (!graph.nodes.has(lvTerminalBusRef) || !graph.nodes.has(boardBusRef)) return null;

  const adjacency = new Map<string, ConductingEdge[]>();
  const addHop = (busRef: string, edge: ConductingEdge): void => {
    (adjacency.get(busRef) ?? adjacency.set(busRef, []).get(busRef)!).push(edge);
  };
  for (const edge of graph.edges) {
    addHop(edge.fromBusRef, edge);
    addHop(edge.toBusRef, edge);
  }

  const parentEdgeOf = new Map<string, ConductingEdge>();
  const visited = new Set<string>([lvTerminalBusRef]);
  const queue: string[] = [lvTerminalBusRef];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === boardBusRef) break;
    for (const edge of adjacency.get(current) ?? []) {
      const next = edge.fromBusRef === current ? edge.toBusRef : edge.fromBusRef;
      if (visited.has(next)) continue;
      visited.add(next);
      parentEdgeOf.set(next, edge);
      queue.push(next);
    }
  }
  if (!visited.has(boardBusRef)) return null;
  return parentEdgeOf.get(boardBusRef) ?? null;
}

/**
 * Wygodny wariant `findLvIncomerEdge` dla „terminal LV KTÓREGOŚ transformatora
 * stacji" — wybiera PIERWSZY (deterministycznie, po `ref` posortowanym
 * rosnąco) transformator z `transformerRefs` obecny w grafie; `null`, gdy
 * ŻADEN z podanych refów nie odpowiada krawędzi transformatorowej grafu
 * (dana niekompletna — zero zgadywania, wołający degraduje honestly).
 */
export function findLvIncomerEdgeForStationTransformers(
  graph: TerminalGraph,
  transformerRefs: readonly string[],
  boardBusRef: string,
): ConductingEdge | null {
  const sortedRefs = [...transformerRefs].sort((a, b) => a.localeCompare(b));
  for (const ref of sortedRefs) {
    const tr = graph.transformerEdges.find((t) => t.ref === ref);
    if (!tr) continue;
    return findLvIncomerEdge(graph, tr.lvTerminal.busRef, boardBusRef);
  }
  return null;
}

/** Jedna sekcja szyny na widoku SLD — 1:1 z węzłem grafu terminali w T0. */
export interface SldBusSection {
  readonly sectionId: string;
  readonly busRef: string;
  readonly name: string;
  readonly voltageKv: number;
  readonly voltageLevelId: VoltageLevelId;
}

/** Przyporządkowanie gałęzi (odpływu/pola) do sekcji szyny, z której WYCHODZI
 *  (strona `fromBusRef` gałęzi — jedna prawda z `terminalGraph.ts`, zero
 *  odrębnej heurystyki kierunku). */
export interface SldFeederAssignment {
  readonly branchRef: string;
  readonly sectionId: string;
  readonly farSectionId: string | null;
}

/** Tor transformatora jako GRANICA JAWNA dwóch sekcji (HV/LV) — nigdy
 *  artefakt layoutu (patrz dowód defektu B-02, `sceneConformance.test.ts`). */
export interface SldTransformerBoundary {
  readonly transformerRef: string;
  readonly hvSectionId: string;
  readonly lvSectionId: string;
}

export interface SldViewModel {
  readonly sections: readonly SldBusSection[];
  readonly feederAssignments: readonly SldFeederAssignment[];
  readonly transformerBoundaries: readonly SldTransformerBoundary[];
}

function sectionIdForBus(busRef: string): string {
  return `${busRef}#section`;
}

function feederAssignmentFor(edge: ConductingEdge): SldFeederAssignment {
  return {
    branchRef: edge.ref,
    sectionId: sectionIdForBus(edge.fromBusRef),
    farSectionId: sectionIdForBus(edge.toBusRef),
  };
}

function transformerBoundaryFor(tr: TransformerEdge): SldTransformerBoundary {
  return {
    transformerRef: tr.ref,
    hvSectionId: sectionIdForBus(tr.hvTerminal.busRef),
    lvSectionId: sectionIdForBus(tr.lvTerminal.busRef),
  };
}

/** Zbuduj SLD VIEW MODEL z grafu terminali. CZYSTA projekcja — zero
 *  konsumpcji przez `compose/*` w T0 (patrz nagłówek pliku). */
export function buildSldViewModel(graph: TerminalGraph): SldViewModel {
  const sections: SldBusSection[] = [...graph.nodes.values()].map((node) => ({
    sectionId: sectionIdForBus(node.busRef),
    busRef: node.busRef,
    name: node.name,
    voltageKv: node.voltageKv,
    voltageLevelId: node.voltageLevelId,
  }));

  const feederAssignments = graph.edges.map(feederAssignmentFor);
  const transformerBoundaries = graph.transformerEdges.map(transformerBoundaryFor);

  return { sections, feederAssignments, transformerBoundaries };
}
