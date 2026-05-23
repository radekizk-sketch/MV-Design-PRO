/**
 * SC Comparison Types -- PR-21
 *
 * TypeScript types for short-circuit comparison management.
 * Aligned with backend domain/sc_comparison.py and api/batch_execution.py.
 * All labels in Polish. No project codenames.
 */

/**
 * Numeric delta between two values.
 * INVARIANTS:
 * - abs = other - base
 * - rel = abs / base if base != 0, else null
 */
export interface NumericDelta {
  base: number;
  other: number;
  abs: number;
  rel: number | null;
}

/**
 * Per-element delta record.
 */
export interface ElementDelta {
  element_ref: string;
  deltas: Record<string, NumericDelta>;
}

/**
 * SC Comparison response from API.
 */
export interface SCComparison {
  comparison_id: string;
  study_case_id: string;
  analysis_type: string;
  base_scenario_id: string;
  other_scenario_id: string;
  created_at: string;
  input_hash: string;
  deltas_global: Record<string, NumericDelta>;
  deltas_by_source: ElementDelta[];
  deltas_by_branch: ElementDelta[];
}

/**
 * Comparison list response from API.
 */
export interface ComparisonListResponse {
  comparisons: SCComparison[];
  count: number;
}

/**
 * Request to create a comparison.
 */
export interface CreateComparisonRequest {
  base_run_id: string;
  other_run_id: string;
  base_scenario_id: string;
  other_scenario_id: string;
}

/**
 * Delta overlay payload from backend (extends OverlayPayloadV1 with content_hash).
 */
export interface DeltaOverlayPayload {
  run_id: string;
  analysis_type: string;
  elements: DeltaOverlayElement[];
  legend: DeltaOverlayLegendEntry[];
  content_hash: string;
}

/**
 * Single element in delta overlay.
 */
export interface DeltaOverlayElement {
  element_ref: string;
  element_type: string;
  visual_state: 'OK' | 'WARNING' | 'CRITICAL' | 'INACTIVE';
  numeric_badges: Record<string, number | null>;
  color_token: string;
  stroke_token: string;
  animation_token: string | null;
}

/**
 * Legend entry for delta overlay.
 */
export interface DeltaOverlayLegendEntry {
  color_token: string;
  label: string;
  description: string | null;
}

/**
 * Polish labels for SC delta keys.
 */
export const SC_DELTA_KEY_LABELS: Record<string, string> = {
  ikss_a: 'Prad zwarciowy poczatkowy Ik"',
  ip_a: 'Prad udarowy ip',
  ith_a: 'Prad cieplny Ith',
  ib_a: 'Prad wylaczalny Ib',
  sk_mva: 'Moc zwarciowa Sk',
  kappa: 'Wspolczynnik udarowy kappa',
  zkk_ohm: 'Impedancja zwarciowa Zkk',
};

/**
 * Polish labels for Load Flow delta keys.
 */
export const LF_DELTA_KEY_LABELS: Record<string, string> = {
  v_pu: 'Napięcie [p.u.]',
  angle_deg: 'Kąt [°]',
  p_injected_mw: 'P iniekcja [MW]',
  q_injected_mvar: 'Q iniekcja [Mvar]',
  p_from_mw: 'P od [MW]',
  q_from_mvar: 'Q od [Mvar]',
  p_to_mw: 'P do [MW]',
  q_to_mvar: 'Q do [Mvar]',
  losses_p_mw: 'Straty P [MW]',
  losses_q_mvar: 'Straty Q [Mvar]',
  total_losses_p_mw: 'Straty całkowite P [MW]',
  total_losses_q_mvar: 'Straty całkowite Q [Mvar]',
  min_v_pu: 'U min [p.u.]',
  max_v_pu: 'U max [p.u.]',
  slack_p_mw: 'P bilansujący [MW]',
  slack_q_mvar: 'Q bilansujący [Mvar]',
};

/**
 * Unified Polish labels for all delta keys (SC + LF).
 */
export const GLOBAL_DELTA_KEY_LABELS: Record<string, string> = {
  ...SC_DELTA_KEY_LABELS,
  ...LF_DELTA_KEY_LABELS,
};

/**
 * Delta change direction type.
 */
export type DeltaDirection = 'up' | 'down' | 'none';

/**
 * Get delta direction from numeric delta.
 */
export function getDeltaDirection(delta: NumericDelta): DeltaDirection {
  if (delta.abs > 0) return 'up';
  if (delta.abs < 0) return 'down';
  return 'none';
}

/**
 * Polish labels for delta directions.
 */
export const DELTA_DIRECTION_LABELS: Record<DeltaDirection, string> = {
  up: 'Wzrost',
  down: 'Spadek',
  none: 'Bez zmian',
};

/**
 * Arrow symbols for delta directions.
 */
export const DELTA_DIRECTION_ARROWS: Record<DeltaDirection, string> = {
  up: '\u2191',    // up arrow
  down: '\u2193',  // down arrow
  none: '\u2014',  // em dash
};

/**
 * CSS classes for delta directions (Tailwind semantic classes).
 */
export const DELTA_DIRECTION_STYLES: Record<DeltaDirection, string> = {
  up: 'text-amber-600',
  down: 'text-blue-600',
  none: 'text-slate-400',
};
