/**
 * LayoutComplexityScore — Phase 6 (operator-grade SLD plan v2).
 *
 * Oblicza złożoność topologiczną sieci SN i wybiera odpowiednią strategię
 * layoutu. Operator-grade: layout NIE jest tylko funkcją liczby stacji —
 * uwzględnia odgałęzienia, ringi, NMO, label density, manual locks.
 *
 * @see SLD_LAYOUT_CORRIDOR_AND_COLLISION_RULES.md
 */

import type { EnergyNetworkModel, Substation, Bay } from '../../../../types/enm';

/**
 * Score: 10 metryk topologicznych.
 *
 * Każda metryka ma rosnący wpływ na complexity. Strategy selector używa
 * całego score do decyzji (NIE pojedynczych progów).
 */
export interface LayoutComplexityScore {
  /** Liczba stacji (substations) wszystkich typów. */
  readonly stationCount: number;
  /** Liczba feederów (LineRun.run_kind === 'main_trunk' | 'branch'). */
  readonly feederCount: number;
  /** Liczba odgałęzień (run_kind === 'branch'). */
  readonly branchCount: number;
  /** Maksymalna głębokość odgałęzień (drzewo branchów). */
  readonly maxBranchDepth: number;
  /** Liczba ringów (run_kind === 'ring'). */
  readonly ringCount: number;
  /** Liczba NMO (Punktów Normalnie Otwartych — LineRun.nop_station_ref). */
  readonly nopCount: number;
  /** Liczba DER (PV/BESS/FW + synchronicznych generatorów). */
  readonly derCount: number;
  /**
   * Crossing pressure: heurystyka zatłoczenia ścieżek (0..N).
   * Używana do wykrycia kiedy hierarchia nie pasuje (zbyt wiele ciągów na
   * tej samej osi Y).
   */
  readonly crossingPressure: number;
  /**
   * Label density: szacunek etykiet na 100 px² (wymaga wymiarów viewport).
   * Wyliczana z liczby stacji + DER + bay count.
   */
  readonly labelDensity: number;
  /**
   * Manual locked ratio: procent route segments które operator zablokował
   * (locked=true). 0..1. Gdy >0.3, layout strategy MUSI respektować locks.
   */
  readonly manualLockedRatio: number;
}

/**
 * Strategia layoutu wybierana przez `chooseLayoutStrategy`.
 *
 * `simple_radial` — pojedynczy GPZ + 1-2 ciągi liniowe, bez ringów, ≤ 5 stacji.
 *   Hierarchical layout liniowy działa dobrze.
 *
 * `hierarchical` — kanon Phase 0A: kanały Y per ciąg, stacje wzdłuż.
 *   Skuteczny dla ≤ 20 stacji bez ringów ani odgałęzień.
 *
 * `corridor` — Phase 6: pakuje stacje w korytarze pionowe, orthogonal Manhattan
 *   między korytarzami. Skuteczny dla 20-80 stacji z odgałęzieniami / ringami.
 *
 * `corridor_with_locked` — Phase 6: corridor + rozpoznaje manual locks
 *   (>30% locked routes). Layout NIE recompute'uje zablokowanych segmentów.
 */
export type LayoutStrategy =
  | 'simple_radial'
  | 'hierarchical'
  | 'corridor'
  | 'corridor_with_locked';

/**
 * Domyślne progi dla strategy selectora.
 * Eksportowane jako readonly aby testy mogły je inspekcjonować.
 */
export const STRATEGY_THRESHOLDS = {
  /** Powyżej której liczby stacji corridor strategy jest preferowany. */
  STATION_CORRIDOR_THRESHOLD: 20,
  /** Powyżej której liczby branchów corridor strategy jest preferowany. */
  BRANCH_CORRIDOR_THRESHOLD: 5,
  /** Próg label density przy którym corridor strategy jest preferowany. */
  LABEL_DENSITY_CORRIDOR_THRESHOLD: 1.5,
  /** Powyżej tego ratio manual locks → corridor_with_locked. */
  MANUAL_LOCKED_THRESHOLD: 0.3,
  /** Próg simple_radial: do tej liczby stacji prosty radialny layout wystarczy. */
  SIMPLE_RADIAL_THRESHOLD: 5,
} as const;

/**
 * Computes layout complexity score deterministycznie z ENM snapshot.
 *
 * @param enm Snapshot EnergyNetworkModel.
 * @param manualLockedCount Liczba locked routes (z RouteEditor) — opcjonalna.
 * @param totalRouteCount Total routes count — wymagane gdy manualLockedCount > 0.
 */
export function computeComplexityScore(
  enm: Pick<EnergyNetworkModel, 'substations' | 'bays' | 'generators' | 'line_runs'>,
  options: {
    readonly manualLockedCount?: number;
    readonly totalRouteCount?: number;
    readonly viewportArea?: number; // px² dla label density
  } = {},
): LayoutComplexityScore {
  const substations = enm.substations ?? [];
  const bays = enm.bays ?? [];
  const generators = enm.generators ?? [];
  const lineRuns = enm.line_runs ?? [];

  const stationCount = substations.length;

  // Feeders + branches + rings
  let feederCount = 0;
  let branchCount = 0;
  let ringCount = 0;
  let nopCount = 0;
  for (const lr of lineRuns) {
    if (lr.run_kind === 'main_trunk' || lr.run_kind === 'branch') feederCount += 1;
    if (lr.run_kind === 'branch') branchCount += 1;
    if (lr.run_kind === 'ring') ringCount += 1;
    if (lr.nop_station_ref) nopCount += 1;
  }

  // Max branch depth — głębokość drzewa parent_run_ref.
  const maxBranchDepth = computeMaxBranchDepth(lineRuns);

  // DER count
  const derCount = generators.filter((g) =>
    g.gen_type === 'pv_inverter'
    || g.gen_type === 'wind_inverter'
    || g.gen_type === 'fw_pmsg'
    || g.gen_type === 'fw_dfig'
    || g.gen_type === 'fw_scig'
    || g.gen_type === 'bess'
    || g.gen_type === 'synchronous',
  ).length;

  // Crossing pressure: heurystyka — liczba pól liniowych w GPZ × liczba ringów.
  // Im więcej linii wychodzi z GPZ a w sieci są ringi, tym większy
  // pressure na korytarzach.
  const gpzBays = bays.filter((b: Bay) => {
    const sub = substations.find((s: Substation) => s.ref_id === b.substation_ref);
    return sub?.station_type === 'gpz' && (b.bay_role === 'OUT' || b.bay_role === 'FEEDER');
  }).length;
  const crossingPressure = gpzBays * (ringCount + 1);

  // Label density: stacje + DER + bays na viewport area.
  // Default viewport 1920×1080 = 2_073_600 px².
  const viewportArea = options.viewportArea ?? 1_920 * 1_080;
  const labelTotal = stationCount + derCount + Math.min(bays.length, 50); // cap bays na 50
  const labelDensity = (labelTotal / viewportArea) * 100_000; // labels per 100k px²

  // Manual locked ratio.
  const totalRouteCount = options.totalRouteCount ?? 0;
  const manualLockedCount = options.manualLockedCount ?? 0;
  const manualLockedRatio = totalRouteCount > 0 ? manualLockedCount / totalRouteCount : 0;

  return {
    stationCount,
    feederCount,
    branchCount,
    maxBranchDepth,
    ringCount,
    nopCount,
    derCount,
    crossingPressure,
    labelDensity,
    manualLockedRatio,
  };
}

/**
 * Compute max branch depth — głębokość drzewa parent_run_ref.
 * Używana jako proxy dla complexity (głębokie odgałęzienia → corridor).
 */
function computeMaxBranchDepth(lineRuns: readonly { id: string; parent_run_ref?: string | null }[]): number {
  const byId = new Map<string, { id: string; parent_run_ref?: string | null }>();
  for (const lr of lineRuns) byId.set(lr.id, lr);

  let maxDepth = 0;
  for (const lr of lineRuns) {
    let depth = 0;
    let current: typeof lr | undefined = lr;
    const visited = new Set<string>();
    while (current?.parent_run_ref && !visited.has(current.id)) {
      visited.add(current.id);
      const parent = byId.get(current.parent_run_ref);
      if (!parent) break;
      depth += 1;
      current = parent;
    }
    if (depth > maxDepth) maxDepth = depth;
  }
  return maxDepth;
}

/**
 * Wybiera strategię layoutu na podstawie complexity score.
 *
 * Reguły (w kolejności):
 *   1. manual_locked_ratio > 0.3 → corridor_with_locked.
 *   2. station_count ≤ SIMPLE_RADIAL_THRESHOLD ∧ branch_count == 0 ∧
 *      ring_count == 0 → simple_radial.
 *   3. station_count ≥ STATION_CORRIDOR_THRESHOLD ∨ branch_count ≥
 *      BRANCH_CORRIDOR_THRESHOLD ∨ ring_count ≥ 1 ∨ label_density >
 *      LABEL_DENSITY_CORRIDOR_THRESHOLD → corridor.
 *   4. Default: hierarchical.
 *
 * Deterministyczna pure function — same score → same strategy.
 */
export function chooseLayoutStrategy(score: LayoutComplexityScore): LayoutStrategy {
  if (score.manualLockedRatio > STRATEGY_THRESHOLDS.MANUAL_LOCKED_THRESHOLD) {
    return 'corridor_with_locked';
  }
  if (
    score.stationCount <= STRATEGY_THRESHOLDS.SIMPLE_RADIAL_THRESHOLD
    && score.branchCount === 0
    && score.ringCount === 0
  ) {
    return 'simple_radial';
  }
  if (
    score.stationCount >= STRATEGY_THRESHOLDS.STATION_CORRIDOR_THRESHOLD
    || score.branchCount >= STRATEGY_THRESHOLDS.BRANCH_CORRIDOR_THRESHOLD
    || score.ringCount >= 1
    || score.labelDensity > STRATEGY_THRESHOLDS.LABEL_DENSITY_CORRIDOR_THRESHOLD
  ) {
    return 'corridor';
  }
  return 'hierarchical';
}

/**
 * Diagnostic helper — zwraca human-readable reason dla wybranej strategii.
 */
export function explainStrategy(score: LayoutComplexityScore, strategy: LayoutStrategy): string {
  switch (strategy) {
    case 'corridor_with_locked':
      return `Manual locks ${(score.manualLockedRatio * 100).toFixed(0)}% > ${
        STRATEGY_THRESHOLDS.MANUAL_LOCKED_THRESHOLD * 100
      }% — operator zablokował ≥1/3 tras, layout respektuje locks.`;
    case 'simple_radial':
      return `${score.stationCount} stacji ≤ ${STRATEGY_THRESHOLDS.SIMPLE_RADIAL_THRESHOLD}, brak odgałęzień ani ringów — prosty radialny layout.`;
    case 'corridor':
      const reasons: string[] = [];
      if (score.stationCount >= STRATEGY_THRESHOLDS.STATION_CORRIDOR_THRESHOLD) {
        reasons.push(`${score.stationCount} stacji ≥ ${STRATEGY_THRESHOLDS.STATION_CORRIDOR_THRESHOLD}`);
      }
      if (score.branchCount >= STRATEGY_THRESHOLDS.BRANCH_CORRIDOR_THRESHOLD) {
        reasons.push(`${score.branchCount} odgałęzień ≥ ${STRATEGY_THRESHOLDS.BRANCH_CORRIDOR_THRESHOLD}`);
      }
      if (score.ringCount >= 1) {
        reasons.push(`${score.ringCount} ringów`);
      }
      if (score.labelDensity > STRATEGY_THRESHOLDS.LABEL_DENSITY_CORRIDOR_THRESHOLD) {
        reasons.push(`label density ${score.labelDensity.toFixed(2)} > ${STRATEGY_THRESHOLDS.LABEL_DENSITY_CORRIDOR_THRESHOLD}`);
      }
      return `Corridor strategy: ${reasons.join(', ')}.`;
    case 'hierarchical':
      return `Hierarchical layout: ${score.stationCount} stacji, ${score.branchCount} odgałęzień, ${score.ringCount} ringów — wszystkie poniżej corridor thresholds.`;
  }
}
