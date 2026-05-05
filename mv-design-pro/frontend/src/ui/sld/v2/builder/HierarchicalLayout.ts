/**
 * SLD v2 HierarchicalLayout — deterministyczny layout z BuildSequence (PR-5).
 *
 * Zastępuje:
 * - `engine/sld-layout/pipeline.ts` (Sugiyama 5-faz, ~460 linii)
 * - `engine/sld-layout/phase4-coordinates.ts` (~1036 linii)
 * - `engine/sld-layout/phase5-routing.ts` (A* + collision, ~516 linii)
 *
 * Algorytm: pozycja każdego obiektu wynika z jego miejsca w hierarchii
 * (Slot system z `geometry/slot.ts`). Brak A*, brak Sugiyama, brak heurystyk.
 *
 * Inwarianty:
 * 1. Determinizm: ten sam BuildSequence → identyczny EffectiveLayout (hash stable).
 * 2. Przyrostowość: dodanie komendy zmienia layout TYLKO w obszarze sąsiadującym z nowym
 *    obiektem (przesunięcie ≤ 2 sąsiadów w slocie hierarchicznym).
 * 3. Snap to grid: każda współrzędna jest wielokrotnością GRID_BASE_PX.
 * 4. Ortogonalność: routing wyłącznie L-shape, brak diagonalnych segmentów.
 */

import { routeRunSegment } from '../geometry/routing';
import {
  bayHeadSlot,
  derAttachmentSlot,
  gpzSlot,
  runChannelY,
  sectionSlot,
  stationOnRunSlot,
  type Slot,
} from '../geometry/slot';
import type { BuildCommand, BuildSequence } from './BuildSequence';

export interface EffectiveLayout {
  readonly version: 'v2';
  readonly elements: ReadonlyMap<string, Slot>;
  readonly paths: ReadonlyMap<string, ReadonlyArray<{ x: number; y: number }>>;
  /** Deterministic hash dla testów. */
  readonly hash: string;
}

interface LayoutBuildState {
  /** GPZ id → number of sections added so far. */
  gpzSectionsCount: Map<string, number>;
  /** Section id → number of bays added. */
  sectionBaysCount: Map<string, number>;
  /** Bay id → section id (lookup). */
  bayToSection: Map<string, string>;
  /** Section id → section index in GPZ (0-based). */
  sectionIndexInGpz: Map<string, number>;
  /** Bay id → bay index in section (0-based). */
  bayIndexInSection: Map<string, number>;
  /** Run id → run index in projekt (0-based, dla kanału Y). */
  runIndex: Map<string, number>;
  /** Run id → liczba stacji na ciągu. */
  runStationsCount: Map<string, number>;
  /** Station id → station index in run (0-based). */
  stationIndexInRun: Map<string, number>;
  /** Station id → run id. */
  stationToRun: Map<string, string>;
  /** Run id → liczba odgałęzień (sub-runs). */
  parentRunBranchCount: Map<string, number>;
  /** Run id → branch index (jeżeli ten run jest odgałęzieniem). */
  branchRunIndex: Map<string, number>;
}

function emptyState(): LayoutBuildState {
  return {
    gpzSectionsCount: new Map(),
    sectionBaysCount: new Map(),
    bayToSection: new Map(),
    sectionIndexInGpz: new Map(),
    bayIndexInSection: new Map(),
    runIndex: new Map(),
    runStationsCount: new Map(),
    stationIndexInRun: new Map(),
    stationToRun: new Map(),
    parentRunBranchCount: new Map(),
    branchRunIndex: new Map(),
  };
}

/**
 * Główna funkcja: BuildSequence → EffectiveLayout.
 *
 * Wykonuje komendy sekwencyjnie. Każda komenda alokuje swój slot deterministycznie.
 */
export function computeLayout(sequence: BuildSequence): EffectiveLayout {
  const elements = new Map<string, Slot>();
  const paths = new Map<string, ReadonlyArray<{ x: number; y: number }>>();
  const state = emptyState();

  for (const command of sequence.commands) {
    applyCommandToLayout(command, elements, paths, state);
  }

  const hash = computeLayoutHash(elements, paths);
  return {
    version: 'v2',
    elements,
    paths,
    hash,
  };
}

function applyCommandToLayout(
  command: BuildCommand,
  elements: Map<string, Slot>,
  paths: Map<string, ReadonlyArray<{ x: number; y: number }>>,
  state: LayoutBuildState,
): void {
  switch (command.type) {
    case 'InsertGpz': {
      elements.set(command.id, gpzSlot());
      state.gpzSectionsCount.set(command.id, 0);
      break;
    }

    case 'AddSection': {
      const sectionsCount = state.gpzSectionsCount.get(command.gpzId) ?? 0;
      const sectionIndex = sectionsCount;
      state.gpzSectionsCount.set(command.gpzId, sectionsCount + 1);
      state.sectionIndexInGpz.set(command.id, sectionIndex);
      state.sectionBaysCount.set(command.id, 0);
      elements.set(command.id, sectionSlot(sectionIndex));
      break;
    }

    case 'AddBay': {
      const sectionIndex = state.sectionIndexInGpz.get(command.sectionId) ?? 0;
      const baysCount = state.sectionBaysCount.get(command.sectionId) ?? 0;
      const bayIndex = baysCount;
      state.sectionBaysCount.set(command.sectionId, baysCount + 1);
      state.bayIndexInSection.set(command.id, bayIndex);
      state.bayToSection.set(command.id, command.sectionId);
      elements.set(command.id, bayHeadSlot(sectionIndex, bayIndex));
      break;
    }

    case 'ExtendCableRun': {
      // Każdy run dostaje kolejny kanał Y
      const newRunIdx = state.runIndex.size;
      state.runIndex.set(command.id, newRunIdx);
      state.runStationsCount.set(command.id, 0);

      // Jeżeli to odgałęzienie, zwiększ licznik odgałęzień parent run-a
      if (command.parentRunId) {
        const parentBranchCount = state.parentRunBranchCount.get(command.parentRunId) ?? 0;
        state.parentRunBranchCount.set(command.parentRunId, parentBranchCount + 1);
        state.branchRunIndex.set(command.id, parentBranchCount);
      }

      // Slot ciągu = pierwszy slot stacji (anchor) — używany jako reference dla rendererów
      // Tu zapisujemy pozycję startową ciągu (środek kanału Y, X startowe pola)
      const sectionId = state.bayToSection.get(command.fromBayId);
      if (sectionId) {
        const sectionIndex = state.sectionIndexInGpz.get(sectionId) ?? 0;
        const bayIndex = state.bayIndexInSection.get(command.fromBayId) ?? 0;
        const bayHead = bayHeadSlot(sectionIndex, bayIndex);
        const channelY = runChannelY(newRunIdx);
        elements.set(command.id, { x: bayHead.x, y: channelY });
      }
      break;
    }

    case 'InsertStationOnRun': {
      const runIdx = state.runIndex.get(command.runId) ?? 0;
      const stationsCount = state.runStationsCount.get(command.runId) ?? 0;
      const stationIndex = stationsCount;
      state.runStationsCount.set(command.runId, stationsCount + 1);
      state.stationIndexInRun.set(command.id, stationIndex);
      state.stationToRun.set(command.id, command.runId);

      // Slot stacji
      const stationSlotPos = stationOnRunSlot(runIdx, stationIndex);
      elements.set(command.id, stationSlotPos);

      // Routing segmentu: od poprzedniego punktu (GPZ bay lub poprzednia stacja) do tej stacji
      const channelY = runChannelY(runIdx);
      let fromPoint: Slot | undefined;
      if (stationIndex === 0) {
        // Pierwsza stacja — łączymy z portem pola GPZ
        // Find run start (zapisany w elementach jako run id)
        fromPoint = elements.get(command.runId);
      } else {
        // Kolejna stacja — łączymy z poprzednią stacją na ciągu
        const prevStationId = findPreviousStation(command.runId, stationIndex - 1, state);
        if (prevStationId) {
          fromPoint = elements.get(prevStationId);
        }
      }

      if (fromPoint) {
        const segmentPath = routeRunSegment(fromPoint, stationSlotPos, channelY);
        paths.set(`${command.runId}::seg_${stationIndex}`, segmentPath.points);
      }
      break;
    }

    case 'AttachDer': {
      // DER pozycjonowany przy stacji macierzystej (jeżeli dotyczy)
      if (command.parentStationId) {
        const runId = state.stationToRun.get(command.parentStationId);
        if (runId) {
          const runIdx = state.runIndex.get(runId) ?? 0;
          const parentStationIdx = state.stationIndexInRun.get(command.parentStationId) ?? 0;
          elements.set(command.id, derAttachmentSlot(runIdx, parentStationIdx));

          // Routing DER → station port
          const stationSlotPos = elements.get(command.parentStationId);
          const derSlot = elements.get(command.id);
          if (stationSlotPos && derSlot) {
            const path = routeRunSegment(derSlot, stationSlotPos, derSlot.y);
            paths.set(`${command.id}::attach`, path.points);
          }
        }
      }
      break;
    }

    case 'SetSwitchState':
    case 'SetNop': {
      // Komendy stanu nie zmieniają geometrii (state→style invariant)
      break;
    }
  }
}

function findPreviousStation(
  runId: string,
  prevIndex: number,
  state: LayoutBuildState,
): string | null {
  for (const [stationId, idx] of state.stationIndexInRun.entries()) {
    if (state.stationToRun.get(stationId) === runId && idx === prevIndex) {
      return stationId;
    }
  }
  return null;
}

/**
 * Deterministic hash layoutu (do testów regresji).
 *
 * Hash zależy WYŁĄCZNIE od slotów obiektów i ścieżek, nie od kolejności iteracji.
 */
function computeLayoutHash(
  elements: Map<string, Slot>,
  paths: Map<string, ReadonlyArray<{ x: number; y: number }>>,
): string {
  // Sortuj keys deterministycznie
  const sortedElementKeys = [...elements.keys()].sort();
  const sortedPathKeys = [...paths.keys()].sort();

  const parts: string[] = [];
  for (const k of sortedElementKeys) {
    const slot = elements.get(k)!;
    parts.push(`${k}:${slot.x},${slot.y}`);
  }
  parts.push('|');
  for (const k of sortedPathKeys) {
    const points = paths.get(k)!;
    parts.push(`${k}:` + points.map((p) => `${p.x},${p.y}`).join('->'));
  }

  // Prosty hash (FNV-1a 32-bit) — wystarczające dla testów regresji w Vitest
  return fnv1a32(parts.join(';'));
}

function fnv1a32(str: string): string {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
