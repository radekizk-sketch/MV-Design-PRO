/**
 * SupplyPathHighlighter — interpretacja topologii operatorskiej toru zasilania.
 *
 * BFS od źródeł (Source.bus_ref) przez aktywne łączniki (status='closed')
 * i transformatory; zbiera listę szyn pod napięciem, gałęzi czynnych, otwartych
 * punktów (NMO + otwarte łączniki) oraz zasilanych elementów (DER, stacje, pola).
 *
 * Reguła architektoniczna: **brak fizyki**. Bez prądów, napięć, impedancji,
 * spadków — to wszystko należy do solverów (`network_model/solvers/`). Tu jest
 * tylko topologia operatorska: czy element jest osiągalny ze źródła przez
 * zamknięte łączniki.
 *
 * Cel: operator klika dowolny element → wynik to lista "energizedElements"
 * (zielony tor czynny) i "openPoints" (czerwony marker otwarcia/NMO).
 *
 * Determinizm: ten sam ENM → identyczny wynik (sortowane wyjścia).
 */

import type { EnergyNetworkModel } from '../../../../types/enm';

// =============================================================================
// Result shape
// =============================================================================

export interface SupplyPathHighlight {
  /** Szyny pod napięciem (energized buses) — refs. */
  readonly energizedBusRefs: readonly string[];
  /** Gałęzie pod napięciem (Cable / OverheadLine / SwitchBranch closed). */
  readonly energizedBranchRefs: readonly string[];
  /** Transformatory pod napięciem (przewodzą prąd). */
  readonly energizedTransformerRefs: readonly string[];
  /** Otwarte łączniki (status='open') między szynami pod napięciem i bez. */
  readonly openPointBranchRefs: readonly string[];
  /** Stacje pod napięciem — referencje Substation, których szyny są w energized set. */
  readonly energizedSubstationRefs: readonly string[];
  /** DER przyłączone do energized buses. */
  readonly energizedGeneratorRefs: readonly string[];
  /** Źródła użyte jako startowe (Source.ref_id). */
  readonly sourceRefs: readonly string[];
}

export const EMPTY_SUPPLY_PATH: SupplyPathHighlight = Object.freeze({
  energizedBusRefs: [],
  energizedBranchRefs: [],
  energizedTransformerRefs: [],
  openPointBranchRefs: [],
  energizedSubstationRefs: [],
  energizedGeneratorRefs: [],
  sourceRefs: [],
});

// =============================================================================
// BFS
// =============================================================================

interface AdjacencyEntry {
  readonly busRef: string;
  readonly via:
    | { kind: 'branch'; ref: string; status: 'closed' | 'open' }
    | { kind: 'transformer'; ref: string };
}

function buildAdjacency(enm: EnergyNetworkModel): Map<string, AdjacencyEntry[]> {
  const adj = new Map<string, AdjacencyEntry[]>();
  const push = (busRef: string, entry: AdjacencyEntry): void => {
    const list = adj.get(busRef);
    if (list) {
      list.push(entry);
    } else {
      adj.set(busRef, [entry]);
    }
  };

  for (const branch of enm.branches ?? []) {
    push(branch.from_bus_ref, {
      busRef: branch.to_bus_ref,
      via: { kind: 'branch', ref: branch.ref_id, status: branch.status },
    });
    push(branch.to_bus_ref, {
      busRef: branch.from_bus_ref,
      via: { kind: 'branch', ref: branch.ref_id, status: branch.status },
    });
  }

  for (const tr of enm.transformers ?? []) {
    push(tr.hv_bus_ref, {
      busRef: tr.lv_bus_ref,
      via: { kind: 'transformer', ref: tr.ref_id },
    });
    push(tr.lv_bus_ref, {
      busRef: tr.hv_bus_ref,
      via: { kind: 'transformer', ref: tr.ref_id },
    });
  }

  return adj;
}

/**
 * Topologiczne highlight toru zasilania.
 *
 * @param enm — model ENM (read-only, snapshot).
 * @returns deterministyczny zestaw refs (sortowane).
 */
export function buildSupplyPathHighlight(
  enm: EnergyNetworkModel | null,
): SupplyPathHighlight {
  if (!enm) {
    return EMPTY_SUPPLY_PATH;
  }

  const sources = enm.sources ?? [];
  if (sources.length === 0) {
    return EMPTY_SUPPLY_PATH;
  }

  const adj = buildAdjacency(enm);
  const energizedBuses = new Set<string>();
  const energizedBranches = new Set<string>();
  const energizedTransformers = new Set<string>();
  const openPoints = new Set<string>();

  const queue: string[] = [];
  for (const source of sources) {
    if (!energizedBuses.has(source.bus_ref)) {
      energizedBuses.add(source.bus_ref);
      queue.push(source.bus_ref);
    }
  }

  while (queue.length > 0) {
    const bus = queue.shift()!;
    const neighbors = adj.get(bus) ?? [];
    for (const entry of neighbors) {
      if (entry.via.kind === 'branch') {
        if (entry.via.status === 'open') {
          // Otwarcie — zaznacz jako punkt otwarty (NMO / przerwa).
          openPoints.add(entry.via.ref);
          continue;
        }
        energizedBranches.add(entry.via.ref);
      } else {
        energizedTransformers.add(entry.via.ref);
      }
      if (!energizedBuses.has(entry.busRef)) {
        energizedBuses.add(entry.busRef);
        queue.push(entry.busRef);
      }
    }
  }

  // Stacje pod napięciem: substation z przynajmniej jedną szyną w energized set.
  const energizedSubstations = new Set<string>();
  for (const sub of enm.substations ?? []) {
    for (const busRef of sub.bus_refs ?? []) {
      if (energizedBuses.has(busRef)) {
        energizedSubstations.add(sub.ref_id);
        break;
      }
    }
  }

  // DER pod napięciem: generator z bus_ref w energized set.
  const energizedGenerators = new Set<string>();
  for (const gen of enm.generators ?? []) {
    if (energizedBuses.has(gen.bus_ref)) {
      energizedGenerators.add(gen.ref_id);
    }
  }

  const sortedArray = (s: Set<string>): readonly string[] =>
    [...s].sort((a, b) => a.localeCompare(b));

  return {
    energizedBusRefs: sortedArray(energizedBuses),
    energizedBranchRefs: sortedArray(energizedBranches),
    energizedTransformerRefs: sortedArray(energizedTransformers),
    openPointBranchRefs: sortedArray(openPoints),
    energizedSubstationRefs: sortedArray(energizedSubstations),
    energizedGeneratorRefs: sortedArray(energizedGenerators),
    sourceRefs: sortedArray(new Set(sources.map((s) => s.ref_id))),
  };
}

// =============================================================================
// Predicate helpers — for renderers / selectors
// =============================================================================

export function isElementEnergized(
  highlight: SupplyPathHighlight,
  elementRef: string,
): boolean {
  return (
    highlight.energizedBusRefs.includes(elementRef) ||
    highlight.energizedBranchRefs.includes(elementRef) ||
    highlight.energizedTransformerRefs.includes(elementRef) ||
    highlight.energizedSubstationRefs.includes(elementRef) ||
    highlight.energizedGeneratorRefs.includes(elementRef) ||
    highlight.sourceRefs.includes(elementRef)
  );
}

export function isOpenPoint(
  highlight: SupplyPathHighlight,
  branchRef: string,
): boolean {
  return highlight.openPointBranchRefs.includes(branchRef);
}

// =============================================================================
// Down-stream from element — pomocnik dla "kliknij stację → tor do niej"
// =============================================================================

/**
 * Czy element `elementRef` jest w torze zasilania (energized) — czyli czy
 * od źródła można do niego dojść przez zamknięte łączniki.
 */
export function isInSupplyPath(
  highlight: SupplyPathHighlight,
  elementRef: string,
): boolean {
  return isElementEnergized(highlight, elementRef);
}

/**
 * Czy element jest typu, który może być pod napięciem (bus / branch / TR /
 * substation / generator / source). Helper dla testów / typeguardów.
 */
const SUPPLY_PATH_ELIGIBLE_TYPES: readonly string[] = [
  'Bus',
  'Branch',
  'Cable',
  'OverheadLine',
  'SwitchBranch',
  'Transformer',
  'Substation',
  'Generator',
  'Source',
];

export function isSupplyPathEligibleType(elementType: string): boolean {
  return SUPPLY_PATH_ELIGIBLE_TYPES.includes(elementType);
}
