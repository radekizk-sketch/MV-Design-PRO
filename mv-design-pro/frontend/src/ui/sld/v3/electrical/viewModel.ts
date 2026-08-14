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
