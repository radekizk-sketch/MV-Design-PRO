/**
 * LayoutStrategyDispatch — Phase 6 polish (operator-grade SLD plan v2).
 *
 * Central dispatcher dla strategii layoutu. Łączy:
 *   - LayoutComplexityScore (10 metryk topologicznych).
 *   - chooseLayoutStrategy (4 strategie: simple_radial / hierarchical /
 *     corridor / corridor_with_locked).
 *   - HierarchicalLayout (Phase 0A kanon — kanały Y per ciąg).
 *   - CorridorLayout (Phase 6 — pakuje stacje per band).
 *
 * Rezultat: operator-grade layout dispatch przez `dispatchLayout(enm, opts)`.
 *
 * Acceptance Invariant 17: deterministyczny placement, fixed seed, no RNG.
 */

import { computeCorridorLayout, type CorridorLayout, toCadCorridorBands } from './CorridorLayout';
import {
  chooseLayoutStrategy,
  computeComplexityScore,
  explainStrategy,
  type LayoutComplexityScore,
  type LayoutStrategy,
} from './LayoutComplexityScore';
import type { EnergyNetworkModel } from '../../../../types/enm';
import type { CadCorridorBand } from '../canvas/CadOverlay';

export interface LayoutDispatchOptions {
  readonly manualLockedCount?: number;
  readonly totalRouteCount?: number;
  readonly viewportArea?: number;
  /** Override strategy (skip score-based selection). */
  readonly forceStrategy?: LayoutStrategy;
}

export interface LayoutDispatchResult {
  /** Wybrana strategia (z score lub override). */
  readonly strategy: LayoutStrategy;
  /** Score który uzasadnia wybór. */
  readonly score: LayoutComplexityScore;
  /** Human-readable wyjaśnienie strategii (Polski). */
  readonly explanation: string;
  /** CorridorLayout wynik (TYLKO gdy strategy ∈ {corridor, corridor_with_locked}). */
  readonly corridor: CorridorLayout | null;
  /** Korytarze do CadOverlay (TYLKO gdy corridor strategy). */
  readonly cadCorridorBands: readonly CadCorridorBand[];
  /** Sygnalna info: czy layout wymaga manualnych locks zachowanych. */
  readonly respectsManualLocks: boolean;
}

/**
 * Dispatch layout: oblicza score, wybiera strategię, wykonuje odpowiedni layout.
 *
 * Reguły:
 *   - simple_radial / hierarchical → corridor=null (frontend caller używa
 *     HierarchicalLayout z BuildSequence dla tych strategii).
 *   - corridor / corridor_with_locked → wykonaj computeCorridorLayout(enm).
 *   - corridor_with_locked → respectsManualLocks=true (signal dla
 *     SldCanvasV2 że NIE recompute'uj zablokowanych routes).
 *
 * Determinizm: same ENM + same options → same dispatch result.
 */
export function dispatchLayout(
  enm: Pick<EnergyNetworkModel, 'substations' | 'bays' | 'generators' | 'line_runs'>,
  options: LayoutDispatchOptions = {},
): LayoutDispatchResult {
  const score = computeComplexityScore(enm, {
    manualLockedCount: options.manualLockedCount,
    totalRouteCount: options.totalRouteCount,
    viewportArea: options.viewportArea,
  });

  const strategy: LayoutStrategy = options.forceStrategy ?? chooseLayoutStrategy(score);
  const explanation = explainStrategy(score, strategy);

  let corridor: CorridorLayout | null = null;
  let cadCorridorBands: readonly CadCorridorBand[] = [];
  if (strategy === 'corridor' || strategy === 'corridor_with_locked') {
    corridor = computeCorridorLayout(enm);
    cadCorridorBands = toCadCorridorBands(corridor);
  }

  const respectsManualLocks = strategy === 'corridor_with_locked';

  return {
    strategy,
    score,
    explanation,
    corridor,
    cadCorridorBands,
    respectsManualLocks,
  };
}

/**
 * Helper diagnostic: sprawdza czy layout dispatch jest deterministyczny.
 * Używane w testach (`reruny same → same dispatch result`).
 */
export function dispatchLayoutMatches(
  a: LayoutDispatchResult,
  b: LayoutDispatchResult,
): boolean {
  if (a.strategy !== b.strategy) return false;
  if (a.respectsManualLocks !== b.respectsManualLocks) return false;
  if (a.cadCorridorBands.length !== b.cadCorridorBands.length) return false;
  for (let i = 0; i < a.cadCorridorBands.length; i++) {
    const ai = a.cadCorridorBands[i];
    const bi = b.cadCorridorBands[i];
    if (ai.id !== bi.id || ai.kind !== bi.kind || ai.yMin !== bi.yMin || ai.yMax !== bi.yMax) {
      return false;
    }
  }
  return true;
}
