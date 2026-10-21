/**
 * Fault Scenarios Types — PR-24 + PR-25 (v2)
 *
 * All labels in Polish. No project codenames.
 * Deterministic sorting (lexicographic by name).
 *
 * PR-25 additions:
 * - FaultModeValue: METALLIC | IMPEDANCE
 * - FaultImpedance: { r_f_ohm, x_f_ohm } — nazwy kontraktu OD-14 (te same co w backendzie)
 * - LocationType: + NODE, BRANCH_POINT
 *
 * Partia integracji 10: pola-fantomy `fault_impedance_type` (zawsze METALLIC), `arc_params`
 * (zawsze odrzucane) i `z0_bus_data` (nigdy nie czytane przez bieg) skasowane w backendzie —
 * backend odrzuca żądanie z polem spoza kontraktu (422).
 */

// Partia integracji 10 (OD-14): SC_2F_G — 1:1 z `domain/fault_scenario.py::FaultType`.
export type FaultTypeValue = 'SC_3F' | 'SC_2F' | 'SC_1F' | 'SC_2F_G';

export const FAULT_TYPE_LABELS: Readonly<Record<FaultTypeValue, string>> = {
  SC_3F: 'Zwarcie trójfazowe',
  SC_2F: 'Zwarcie dwufazowe',
  SC_1F: 'Zwarcie jednofazowe',
  SC_2F_G: 'Zwarcie dwufazowe z ziemią',
} as const;

/** v2 (PR-25): Fault mode — metallic or through impedance */
export type FaultModeValue = 'METALLIC' | 'IMPEDANCE';

export const FAULT_MODE_LABELS: Readonly<Record<FaultModeValue, string>> = {
  METALLIC: 'Metaliczne',
  IMPEDANCE: 'Przez impedancję',
} as const;

/** Impedancja przejścia w miejscu zwarcia Z_f = R_f + jX_f [Ω] (kontrakt OD-14, R_f, X_f ≥ 0). */
export interface FaultImpedanceData {
  r_f_ohm: number;
  x_f_ohm: number;
}

/** v1 + v2 location types */
export type LocationType = 'BUS' | 'BRANCH' | 'NODE' | 'BRANCH_POINT';

export const LOCATION_TYPE_LABELS: Readonly<Record<LocationType, string>> = {
  BUS: 'Szyna',
  BRANCH: 'Gałąź',
  NODE: 'Węzeł',
  BRANCH_POINT: 'Punkt na odcinku',
} as const;

export interface FaultLocation {
  element_ref: string;
  location_type: LocationType;
  position: number | null;
}

export interface ShortCircuitConfig {
  c_factor: number;
  thermal_time_seconds: number;
  include_branch_contributions: boolean;
}

export interface FaultScenario {
  scenario_id: string;
  study_case_id: string;
  name: string;
  analysis_type: string;
  fault_type: FaultTypeValue;
  location: FaultLocation;
  config: ShortCircuitConfig;
  /** v2 (PR-25): fault mode */
  fault_mode: FaultModeValue;
  /** v2 (PR-25): explicit fault impedance Zf */
  fault_impedance: FaultImpedanceData | null;
  created_at: string;
  updated_at: string;
  content_hash: string;
}

export interface FaultScenarioListResponse {
  scenarios: FaultScenario[];
  count: number;
}

export interface CreateFaultScenarioRequest {
  name: string;
  fault_type: FaultTypeValue;
  location: FaultLocation;
  config?: ShortCircuitConfig;
  /** v2 (PR-25) */
  fault_mode?: FaultModeValue;
  /** v2 (PR-25) */
  fault_impedance?: FaultImpedanceData;
}

export interface UpdateFaultScenarioRequest {
  name?: string;
  fault_type?: FaultTypeValue;
  location?: FaultLocation;
  config?: ShortCircuitConfig;
  /** v2 (PR-25) */
  fault_mode?: FaultModeValue;
  /** v2 (PR-25) */
  fault_impedance?: FaultImpedanceData | null;
}

export interface FixAction {
  action_type: 'OPEN_MODAL' | 'NAVIGATE_TO_ELEMENT' | 'SELECT_CATALOG' | 'ADD_MISSING_DEVICE';
  element_ref: string | null;
  modal_type: string | null;
  payload_hint: Record<string, unknown> | null;
}

export interface EligibilityIssue {
  code: string;
  severity: 'BLOCKER' | 'WARNING' | 'INFO';
  message_pl: string;
  element_ref: string | null;
  element_type: string | null;
  fix_action: FixAction | null;
}

export interface ScenarioEligibilityResult {
  analysis_type: string;
  status: 'ELIGIBLE' | 'INELIGIBLE';
  blockers: EligibilityIssue[];
  warnings: EligibilityIssue[];
}

export interface ScenarioSldOverlay {
  scenario_id: string;
  overlay_type: string;
  /** v2 (PR-25): fault mode in overlay */
  fault_mode?: FaultModeValue;
  elements: Array<{
    element_ref: string;
    element_type: string;
    visual_state: string;
    color_token: string;
    stroke_token: string;
    animation_token: string | null;
    numeric_badges: Record<string, number | null>;
    /** v2 (PR-25): branch point alpha for visual positioning */
    branch_point_alpha?: number;
    /** v2 (PR-25): fault impedance metadata */
    fault_impedance?: FaultImpedanceData;
  }>;
  legend: Array<{
    color_token: string;
    label: string;
    description: string;
  }>;
  label: string;
}

export function getFaultTypeLabel(type: FaultTypeValue): string {
  return FAULT_TYPE_LABELS[type] ?? type;
}

export function getFaultModeLabel(mode: FaultModeValue): string {
  return FAULT_MODE_LABELS[mode] ?? mode;
}

export function getLocationTypeLabel(type: LocationType): string {
  return LOCATION_TYPE_LABELS[type] ?? type;
}
