/**
 * SLD Overlay Runtime Types — PR-16
 *
 * CANONICAL ALIGNMENT:
 * - sld_rules.md § B: Results as Overlay (never modifies model)
 * - Producenci w tym module: `RawToTypedOverlayAdapter`, `ShortCircuitFlowOverlayAdapter`.
 *   Dawny backendowy odpowiednik `domain/result_set.py::OverlayPayloadV1` skasowany
 *   w karcie AB-1a Pakiet L (LEGACY_USUNAC C55 — tylko re-eksport, zero konsumenta).
 *
 * INVARIANTS:
 * - NO physics types (no impedance, no power factor, etc.)
 * - NO hex colors — only semantic tokens
 * - All visual decisions made by backend analysis layer
 */

/**
 * Visual state of an overlay element.
 * Determined by backend analysis layer, NOT by UI.
 */
export type OverlayVisualState = 'OK' | 'WARNING' | 'CRITICAL' | 'INACTIVE';

/**
 * Single overlay element — visual state for one SLD symbol.
 *
 * INVARIANTS:
 * - element_ref matches NetworkModel element ID (bijection with SLD symbol)
 * - visual_state is pre-computed by analysis layer
 * - color_token is semantic, NOT hex
 * - numeric_badges are display-only values
 */
export interface OverlayElement {
  /** Element ID in NetworkModel (bijection with SLD symbol elementId) */
  element_ref: string;

  /** Element type (Bus, LineBranch, etc.) */
  element_type: string;

  /** Visual state token (determined by analysis, NOT by UI) */
  visual_state: OverlayVisualState;

  /** Pre-computed numeric display values */
  numeric_badges: Record<string, number | null>;

  /** Semantic color token */
  color_token: string;

  /** Semantic stroke token */
  stroke_token: string;

  /** Optional animation token (null = no animation) */
  animation_token: string | null;
}

/**
 * Legend entry for overlay display.
 *
 * INVARIANTS:
 * - label is Polish text from backend
 * - color_token matches tokens used in OverlayElement
 * - UI does NOT generate legend entries
 */
export interface OverlayLegendEntry {
  /** Semantic color token matching overlay elements */
  color_token: string;

  /** Polish label */
  label: string;

  /** Optional description */
  description: string | null;
}

/**
 * Complete overlay payload from backend — V1 contract.
 *
 * INVARIANTS:
 * - run_id is BINDING — overlay tied to specific calculation run
 * - analysis_type identifies the source analysis
 * - 100% deterministic (same run_id → same payload)
 * - NO hex colors, NO physics calculations
 */
export interface OverlayPayloadV1 {
  /** Binding reference to calculation run */
  run_id: string;

  /** Analysis type (SC_3F, SC_1F, LOAD_FLOW, PROTECTION) */
  analysis_type: string;

  /** Overlay data for affected elements */
  elements: OverlayElement[];

  /** Legend entries for this overlay */
  legend: OverlayLegendEntry[];
}

/**
 * Analysis overlay type identifiers.
 * Used by backend to tag overlay payloads with their source analysis.
 */
export type OverlayAnalysisType =
  | 'SC_3F'
  | 'SC_1F'
  | 'SC_2F'
  | 'LOAD_FLOW'
  | 'PROTECTION_COVERAGE'
  | 'VOLTAGE_PROFILE'
  | 'OVERLOAD'
  | 'THERMAL_WITHSTAND'
  | 'DYNAMIC_WITHSTAND'
  | 'LOSSES'
  | 'VARIANT_DELTA';

/**
 * Polish labels for overlay analysis types.
 * Used in legend headers and UI labels.
 */
export const OVERLAY_ANALYSIS_LABELS: Readonly<Record<OverlayAnalysisType, string>> = {
  SC_3F: 'Zwarcie trójfazowe (3F)',
  SC_1F: 'Zwarcie jednofazowe (1F)',
  SC_2F: 'Zwarcie dwufazowe (2F)',
  LOAD_FLOW: 'Rozpływ mocy',
  PROTECTION_COVERAGE: 'Pokrycie ochronne',
  VOLTAGE_PROFILE: 'Profil napięciowy',
  OVERLOAD: 'Przeciążenie termiczne',
  THERMAL_WITHSTAND: 'Wytrzymałość cieplna (Ith)',
  DYNAMIC_WITHSTAND: 'Wytrzymałość dynamiczna (Idyn)',
  LOSSES: 'Straty mocy',
  VARIANT_DELTA: 'Porównanie wariantów',
} as const;

/**
 * Power flow overlay numeric badges (pre-computed by backend).
 * NO physics in frontend — all values are backend-provided.
 */
export interface PowerFlowOverlayBadges {
  /** Active power [kW] */
  p_kw: number | null;
  /** Reactive power [kvar] */
  q_kvar: number | null;
  /** Current [A] */
  i_a: number | null;
  /** Loading [%] */
  loading_percent: number | null;
  /** Voltage [pu] */
  v_pu: number | null;
}

/**
 * Short circuit overlay numeric badges.
 */
export interface ShortCircuitOverlayBadges {
  /** Initial symmetrical SC current [kA] */
  ik_3f_ka: number | null;
  /** Peak SC current [kA] */
  ip_ka: number | null;
  /** Thermal SC current [kA] */
  ith_ka: number | null;
}

/**
 * Variant delta overlay badges for A/B comparison.
 */
export interface VariantDeltaOverlayBadges {
  /** Delta token: ADDED, REMOVED, MODIFIED, UNCHANGED */
  delta_token: 'ADDED' | 'REMOVED' | 'MODIFIED' | 'UNCHANGED';
  /** Change description (Polish) */
  change_description_pl: string | null;
}
