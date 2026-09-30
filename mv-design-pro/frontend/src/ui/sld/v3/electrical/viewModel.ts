/**
 * SLD-nN-TOPOLOGIA T0 (`docs/nn/PLAN_SLD_NN_TOPOLOGIA_2026-08.md`) — SZKIELET
 * dla T1. Projekcja grafu elektryczny (`terminalGraph.ts`) na SLD VIEW MODEL:
 * sekcje szyn per domena, przyporządkowanie odpływów/gałęzi do szyn, tor
 * transformatora jako jawna granica domen.
 *
 * ZAKRES T0 (plan §Fazy, T0): WYŁĄCZNIE struktura danych + budowa — ŻADEN
 * konsument (`compose/station.ts`) NIE czyta jeszcze tego modułu (to jest
 * praca T1: „przebudowa `compose/station.ts` na konsumpcję SLD VIEW MODEL z
 * grafu").
 *
 * SEKCJA = SZYNA GŁÓWNA (karta SZYNY-STACJI-LUSTRO, commit 2 — kanon toru pola). Zasada toru
 * pola (`enm/tor_pola.py`, POLA-W-TORZE) przyłącza element, któremu pole służy, do ZACISKU
 * pola, a aparat pola leży w jego torze prądowym; odpływ nN stoi na szynie ZA aparatem pola nN.
 * Zacisk pola i szyna za aparatem nie są osobnymi szynami rozdzielnicy — należą do sekcji
 * szyny głównej swojego pola. Szynę główną wyznacza WYŁĄCZNIE lustro backendu
 * `szynaGlownaStacji` (`ui/shared/szynyStacji.ts` ← `enm.tor_pola.szyna_glowna_stacji`):
 *  - szyna główna stacji → ona sama;
 *  - własny zacisk pola SN → szyna tego pola;
 *  - koniec aparatu pola nN wychodzącego z szyny głównej → ta szyna główna;
 *  - szyna, dla której lustro zwraca `null` (szyna spoza stacji: mufa, koniec odcinka;
 *    szyna za łańcuchem aparatów) → własna sekcja (brak danych ≠ przypisanie).
 * Stację szyny rozstrzyga `stacjaSzyn` (szyna wspólna → pierwsza stacja modelu). Liczba sekcji
 * = liczba różnych szyn głównych w tym sensie, NIE liczba węzłów grafu. Granica transformatora
 * (`hvSectionId`/`lvSectionId`) i przypisania odpływów wskazują sekcję, nie węzeł.
 */
import type { EnergyNetworkModel } from '../../../../types/enm';
import { stacjaSzyn, szynaGlownaStacji } from '../../../shared/szynyStacji';
import type { ConductingEdge, TerminalGraph, TerminalNode, TransformerEdge, VoltageLevelId } from './terminalGraph';

/** Jedna sekcja szyny na widoku SLD — szyna główna (patrz nagłówek). */
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

/** Model ENM czytany przy wyznaczaniu sekcji (stacje i gałęzie — aparaty pól nN). */
export type ModelSekcji = Pick<EnergyNetworkModel, 'substations' | 'branches'>;

function sectionIdForBus(busRef: string): string {
  return `${busRef}#section`;
}

/** Szyna główna sekcji, do której należy `busRef` (lustro `szynaGlownaStacji`, nagłówek). */
function szynaSekcji(
  busRef: string,
  stacjaSzyny: ReadonlyMap<string, string>,
  stacje: ReadonlyMap<string, EnergyNetworkModel['substations'][number]>,
  galezie: EnergyNetworkModel['branches'],
): string {
  const stacjaRef = stacjaSzyny.get(busRef);
  const stacja = stacjaRef ? stacje.get(stacjaRef) : undefined;
  return (stacja ? szynaGlownaStacji(stacja, galezie, busRef) : null) ?? busRef;
}

/** Zbuduj SLD VIEW MODEL z grafu terminali i przynależności szyn do stacji. CZYSTA
 *  projekcja — zero konsumpcji przez `compose/*` w T0 (patrz nagłówek pliku). */
export function buildSldViewModel(graph: TerminalGraph, model: ModelSekcji): SldViewModel {
  const galezie = model.branches ?? [];
  const stacjaSzyny = stacjaSzyn(model.substations ?? [], galezie);
  const stacje = new Map((model.substations ?? []).map((s) => [s.ref_id, s]));
  const sekcjaSzyny = new Map<string, string>();
  const sekcja = (busRef: string): string => {
    let wynik = sekcjaSzyny.get(busRef);
    if (wynik === undefined) {
      wynik = szynaSekcji(busRef, stacjaSzyny, stacje, galezie);
      sekcjaSzyny.set(busRef, wynik);
    }
    return wynik;
  };

  const wezlySekcji = new Map<string, TerminalNode>();
  for (const node of graph.nodes.values()) {
    const glowna = sekcja(node.busRef);
    const wezelGlownej = graph.nodes.get(glowna) ?? node;
    if (!wezlySekcji.has(glowna)) wezlySekcji.set(glowna, wezelGlownej);
  }
  const sections: SldBusSection[] = [...wezlySekcji.entries()].map(([busRef, node]) => ({
    sectionId: sectionIdForBus(busRef),
    busRef,
    name: node.name,
    voltageKv: node.voltageKv,
    voltageLevelId: node.voltageLevelId,
  }));

  const feederAssignments = graph.edges.map((edge: ConductingEdge): SldFeederAssignment => ({
    branchRef: edge.ref,
    sectionId: sectionIdForBus(sekcja(edge.fromBusRef)),
    farSectionId: sectionIdForBus(sekcja(edge.toBusRef)),
  }));
  const transformerBoundaries = graph.transformerEdges.map((tr: TransformerEdge): SldTransformerBoundary => ({
    transformerRef: tr.ref,
    hvSectionId: sectionIdForBus(sekcja(tr.hvTerminal.busRef)),
    lvSectionId: sectionIdForBus(sekcja(tr.lvTerminal.busRef)),
  }));

  return { sections, feederAssignments, transformerBoundaries };
}
