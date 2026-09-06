/**
 * P11b — Results Inspector Types (Frontend)
 *
 * CANONICAL ALIGNMENT:
 * - Matches backend DTOs from application/analysis_run/dtos.py
 * - SYSTEM_SPEC.md: READ-ONLY result display
 * - wizard_screens.md: RESULT_VIEW mode
 * - ui_canonical_parity.md: Deterministic sorting
 *
 * RULES (BINDING):
 * - These types are READ-ONLY views of backend data
 * - No physics calculations in frontend
 * - Polish labels for UI display
 */

import type { EnergyNetworkModel } from '../../types/enm';
import type {
  AnalysisCaseContext,
  ExportArtifact,
} from '../shared/analysisCaseContext';
import type { ResultStatus as _ResultStatus } from '../types';

// =============================================================================
// Run Header
// =============================================================================

/**
 * Run header metadata (from RunHeaderDTO).
 */
export interface RunHeader {
  run_id: string;
  project_id: string;
  case_id: string;
  snapshot_id: string | null;
  created_at: string;
  status: string;
  result_state: string; // VALID, OUTDATED, NONE
  solver_kind: string; // PF, short_circuit_sn
  input_hash: string;
  analysis_case_context?: AnalysisCaseContext | null;
}

export interface ExportPolicy {
  export_kind: ExportArtifact['export_kind'];
  allows_partial: boolean;
  requires_confirmation: boolean;
  carries_analysis_case_context: boolean;
  carries_proof_pack_ref: boolean;
  carries_result_hash: boolean;
  carries_input_hash: boolean;
  carries_generated_at: boolean;
  carries_generated_by_version: boolean;
  null_rendering: 'dash' | 'empty_cell' | 'null';
  not_applicable_rendering: 'label' | 'empty_cell';
  partial_rendering: string;
}

// =============================================================================
// Result Columns
// =============================================================================

/**
 * Column metadata for result tables.
 */
export interface ResultColumn {
  key: string;
  label_pl: string;
  unit?: string;
}

/**
 * Table metadata.
 */
export interface ResultTableMeta {
  table_id: string;
  label_pl: string;
  row_count: number;
  columns: ResultColumn[];
}

/**
 * Results index response.
 */
export interface ResultsIndex {
  run_header: RunHeader;
  tables: ResultTableMeta[];
  analysis_case_context?: AnalysisCaseContext | null;
  proof_pack_ref?: string | null;
  export_artifact?: ExportArtifact | null;
  export_policy?: ExportPolicy | null;
}

// =============================================================================
// Bus Results (Szyny)
// =============================================================================

/**
 * Single bus result row.
 */
export interface BusResultRow {
  element_id?: string;
  bus_id: string;
  name: string;
  un_kv: number;
  u_kv: number | null;
  u_pu: number | null;
  angle_deg: number | null;
  flags: string[];
}

/**
 * Bus results table.
 */
export interface BusResults {
  run_id: string;
  rows: BusResultRow[];
  analysis_case_context?: AnalysisCaseContext | null;
}

// =============================================================================
// Branch Results (Gałęzie)
// =============================================================================

/**
 * Single branch result row.
 */
export interface BranchResultRow {
  element_id?: string;
  branch_id: string;
  name: string;
  from_bus: string;
  to_bus: string;
  i_a: number | null;
  s_mva: number | null;
  p_mw: number | null;
  q_mvar: number | null;
  loading_pct: number | null;
  flags: string[];
}

/**
 * Branch results table.
 */
export interface BranchResults {
  run_id: string;
  rows: BranchResultRow[];
  analysis_case_context?: AnalysisCaseContext | null;
}

// =============================================================================
// Short-Circuit Results (Zwarcia)
// =============================================================================

/**
 * Wkład gałęziowy prądu zwarciowego (ZWARCIA-PRO F4, karta W-C; V12K-132) —
 * jeden wpis per (źródło, gałąź) z FROZEN solvera (`ShortCircuitBranchContribution`):
 * superpozycja falownikowa ORAZ rozpływ od źródła zastępczego (Thevenin / sieć
 * nadrzędna, source_id="THEVENIN_GRID"), przeniesiony ADDYTYWNIE przez
 * `build_short_circuit_results` (`_sc_rozplyw_galeziowy`: projekcja A→kA +
 * nazwy z grafu przebiegu). Kierunek wprost z solvera: "from_to" | "to_from".
 */
export interface ShortCircuitBranchFlow {
  branch_id: string;
  branch_name: string;
  source_id: string;
  from_node_id: string;
  from_node_name: string;
  to_node_id: string;
  to_node_name: string;
  i_ka: number | null;
  direction: string;
}

/**
 * Single short-circuit result row.
 */
export interface ShortCircuitRow {
  target_id: string;
  element_id?: string;
  target_name: string | null;
  ikss_ka: number | null;
  ip_ka: number | null;
  ith_ka: number | null;
  sk_mva: number | null;
  fault_type: string | null;
  flags: string[];
  // Pelny bilans IEC 60909 (ZWARCIA-PRO F1) — pola addytywne z wierszy
  // kanonicznych (`build_short_circuit_results`); starsze wyniki bez pol.
  rk_ohm?: number | null;
  xk_ohm?: number | null;
  zk_ohm?: number | null;
  rx_ratio?: number | null;
  xr_ratio?: number | null;
  kappa?: number | null;
  c_factor?: number | null;
  un_kv?: number | null;
  tk_s?: number | null;
  tb_s?: number | null;
  ib_ka?: number | null;
  ik_ka?: number | null;
  ik_thevenin_ka?: number | null;
  ik_inverters_ka?: number | null;
  i2t_ka2s?: number | null;
  // Delta FROZEN V12K-128 (addytywnie): składowe symetryczne impedancji
  // zastępczej WPROST z solvera (`ShortCircuitResult.to_dict` → z1/z2/z0_ohm),
  // przeniesione do wiersza kanonicznego w `_sc_pelny_bilans`. Z1/Z2 dla
  // wszystkich typów, Z0 tylko dla zwarć doziemnych (1F/2F+G). Complex {re, im}.
  // Starszy wynik bez pól → null (uczciwy brak; ekran spada na ślad WHITE BOX).
  z1_ohm?: { re: number; im: number } | null;
  z2_ohm?: { re: number; im: number } | null;
  z0_ohm?: { re: number; im: number } | null;
  // GAP passthrough (V12K-128): wymóg i źródło sieci zerowej Z0 przeniesione do
  // wiersza kanonicznego (dotąd tylko w proof_binding). Starszy wynik → brak/null.
  requires_z0?: boolean | null;
  z0_source?: string | null;
  /**
   * Rozpływ prądu zwarciowego w gałęziach (ZWARCIA-PRO F4, addytywnie;
   * V12K-132): lista wpisów per (źródło, gałąź) — źródło zastępcze (Thevenin /
   * sieć nadrzędna) ORAZ źródła falownikowe; pusta lista = policzono, brak
   * prądu w gałęziach (sieć bez źródła zastępczego i bez falowników zasilających
   * zwarcie); brak pola / null = starszy wynik (uczciwa kreska).
   *
   * V12K-281 (K13): wiersze zbiorcze backendu NIE niosą już rozpływu w tym polu
   * (iloczyn źródło×gałąź per wiersz dawał odpowiedź 730 MB dla 50 stacji) —
   * pole zostaje dla zgodności (mocki/starsze zapisy); świeży wynik niesie
   * `null` + flagę dostępności niżej, a dane wybranego punktu pobiera dostawca
   * na żądanie (`useRozplywZwarciowy`, endpoint rozpływu).
   */
  branch_contributions?: ShortCircuitBranchFlow[] | null;
  /**
   * V12K-281 (K13): rozpływ gałęziowy POLICZONY dla tego punktu i dostępny
   * endpointem na żądanie (`/results/short-circuit/rozplyw?target_id=...`).
   * Brak pola / false = starszy wynik bez rozpływu (uczciwa kreska).
   */
  branch_contributions_available?: boolean | null;
  // Werdykt raportowalności i wiązanie dowodu per punkt (karta P-3, addytywne
  // lustro pól, które backend już wysyła w `build_short_circuit_results`,
  // enm/canonical_analysis.py:1974-1985). Starsze zapisy typu bez pól → optional.
  reporting_status?: string | null;
  reporting_status_pl?: string | null;
  proof_status?: string | null;
  proof_status_pl?: string | null;
  proof_ref?: string | null;
  dopuszczalnosc_raportowa?: boolean;
  reporting_limitations?: string[];
}

/**
 * Short-circuit results table.
 */
export interface ShortCircuitResults {
  run_id: string;
  rows: ShortCircuitRow[];
  analysis_case_context?: AnalysisCaseContext | null;
}

// =============================================================================
// Extended Trace (Ślad obliczeń)
// =============================================================================

/**
 * Single trace step.
 *
 * Matches backend WhiteBoxStep structure from network_model/whitebox/tracer.py
 * Polish labels in UI:
 * - title → Opis kroku
 * - formula_latex → Wzór
 * - inputs → Dane wejściowe
 * - substitution → Podstawienie
 * - result → Wynik
 * - notes → Uwagi
 */
export interface TraceStep {
  /** Unique key for the step (internal) */
  key?: string;
  /** Step index (1-based for display) */
  step?: number;
  /** Human-readable step title (Polish) */
  title?: string;
  /** LaTeX formula for the calculation */
  formula_latex?: string;
  /** Input values with units */
  inputs?: Record<string, TraceValue>;
  /** Substitution string (formula with values) */
  substitution?: string;
  /** Result values with units */
  result?: Record<string, TraceValue>;
  /** Additional notes or references */
  notes?: string;
  /** Domain element id used for catalog context mapping */
  element_id?: string | null;
  /** Solver-side target id, e.g. fault node id */
  target_id?: string | null;
  /** Explicit solver reference for audit/export */
  solver_ref?: string | null;
  /** Catalog binding visible for this step */
  catalog_binding?: CatalogContextEntry['catalog_binding'] | null;
  /** Alias for explicit source catalog */
  source_catalog?: CatalogContextEntry['catalog_binding'] | null;
  source_catalog_label?: string | null;
  /** Parameter provenance */
  parameter_source?: string | null;
  parameter_origin?: string | null;
  source_mode?: string | null;
  materialized_params?: Record<string, unknown> | null;
  manual_overrides?: Array<Record<string, unknown>>;
  overrides?: Array<Record<string, unknown>>;
  manual_override_count?: number;
  has_manual_overrides?: boolean;
  catalog_context_entry?: CatalogContextEntry | null;
  primary_element_ref?: string | null;
  primary_element_type?: string | null;
  related_elements?: TraceRelatedElement[];
  selection_refs?: string[];
  /** Legacy fields for backward compatibility */
  step_id?: string;
  phase?: string;
  description?: string;
  equation_id?: string;
  output?: unknown;
  timestamp?: string;
  [key: string]: unknown;
}

/**
 * Trace value with unit and optional label.
 *
 * Wariant zespolony (`re`/`im`): niektore kroki WHITE BOX (impedancja
 * zastepcza Z = R + jX, `ElementCalculationProofPanel` `firstComplexValue`/
 * `complexParts`) niosa liczbe zespolona zamiast skalara — solver realnie
 * to emituje, komponent to juz konsumuje (duck-typing na `unknown`); pola
 * dodane addytywnie (oba opcjonalne), zeby nie zlamac istniejacych
 * konsumentow skalara `value`.
 */
export interface TraceValue {
  value?: number | string | boolean | null;
  unit?: string;
  label?: string;
  /** Skladowa rzeczywista Z = R + jX — obecna razem z `im`, `value` wtedy nieistotne. */
  re?: number;
  /** Skladowa urojona Z = R + jX. */
  im?: number;
}

export interface TraceRelatedElement {
  element_ref: string;
  element_type?: string;
  role: string;
}

export interface CatalogContextEntry {
  element_id: string;
  element_type: string;
  name?: string | null;
  catalog_binding?: {
    catalog_namespace?: string | null;
    catalog_item_id?: string | null;
      catalog_item_version?: string | null;
  } | null;
  source_catalog?: {
    catalog_namespace?: string | null;
    catalog_item_id?: string | null;
    catalog_item_version?: string | null;
  } | null;
  source_catalog_label?: string | null;
  parameter_source?: string | null;
  parameter_origin?: string | null;
  source_mode?: string | null;
  materialized_params?: Record<string, unknown> | null;
  overrides?: Array<Record<string, unknown>>;
  manual_overrides?: Array<Record<string, unknown>>;
  manual_override_count?: number;
  has_manual_overrides?: boolean;
}

/**
 * Polish labels for trace step fields.
 */
export const TRACE_FIELD_LABELS: Record<string, string> = {
  key: 'Identyfikator',
  step: 'Numer kroku',
  title: 'Opis',
  formula_latex: 'Wzór',
  inputs: 'Dane wejściowe',
  substitution: 'Podstawienie',
  result: 'Wynik',
  notes: 'Uwagi',
  phase: 'Faza',
  description: 'Opis',
  equation_id: 'Równanie',
};

/**
 * Polish labels for common trace value keys.
 */
export const TRACE_VALUE_LABELS: Record<string, string> = {
  // Impedance
  z_thevenin_ohm: 'Impedancja Thevenina',
  r_ohm: 'Rezystancja',
  x_ohm: 'Reaktancja',
  z_ohm: 'Impedancja',
  // Currents
  ikss_ka: 'Prąd zwarciowy początkowy Ik"',
  ip_ka: 'Prąd udarowy ip',
  ith_ka: 'Prąd cieplny Ith',
  i_a: 'Prąd',
  // Voltages
  un_kv: 'Napięcie znamionowe',
  u_kv: 'Napięcie',
  u_pu: 'Napięcie (j.w.)',
  c_factor: 'Współczynnik napięciowy c',
  // Power
  sk_mva: 'Moc zwarciowa Sk"',
  p_mw: 'Moc czynna',
  q_mvar: 'Moc bierna',
  s_mva: 'Moc pozorna',
  // Grid
  connection_node: 'Węzeł przyłączenia (BoundaryNode)',
  // Other
  kappa: 'Współczynnik κ',
  m_factor: 'Współczynnik m',
  n_factor: 'Współczynnik n',
};

/**
 * Extended trace with run context.
 */
export interface ExtendedTrace {
  run_id: string;
  snapshot_id: string | null;
  input_hash: string;
  white_box_trace: TraceStep[];
  selection_index?: Record<string, number>;
  catalog_context: CatalogContextEntry[];
  catalog_context_by_element?: Record<string, CatalogContextEntry>;
  catalog_context_summary?: {
    element_count?: number;
    by_type?: Record<string, number>;
    by_parameter_origin?: Record<string, number>;
    manual_override_element_count?: number;
    manual_override_count?: number;
  };
  analysis_case_context?: AnalysisCaseContext | null;
}

// =============================================================================
// SLD Overlay
// =============================================================================

/**
 * SLD bus overlay data.
 */
export interface SldOverlayBus {
  symbol_id: string;
  bus_id: string;
  /** Alias used by overlay_builder and SLD components */
  node_id: string;
  u_pu?: number;
  u_kv?: number;
  angle_deg?: number;
  ikss_ka?: number;
  sk_mva?: number;
  /** Energy validation voltage status: PASS | WARNING | FAIL | NOT_COMPUTED */
  voltage_status?: string;
  /** Worst energy validation status for this node */
  ev_status?: string;
}

/** @deprecated Use SldOverlayBus instead. */
export type SldOverlayNode = SldOverlayBus;

/**
 * SLD branch overlay data.
 */
export interface SldOverlayBranch {
  symbol_id: string;
  branch_id: string;
  p_mw?: number;
  q_mvar?: number;
  i_a?: number;
  loading_pct?: number;
  /** Worst energy validation status for this branch */
  ev_status?: string;
}

/**
 * Complete SLD result overlay.
 */
export interface SldResultOverlay {
  diagram_id: string;
  run_id: string;
  /** Swiezosc wyniku wzgledem modelu: NONE | FRESH | OUTDATED (liczy backend). */
  result_status: string;
  /** Kod przyczyny statusu z backendu (np. `model-zmieniony`). */
  result_status_reason?: string;
  /** Zdanie po polsku wyjasniajace przyczyne statusu — prosto z backendu. */
  result_status_reason_pl?: string;
  /** Node overlay data (primary field used by overlay_builder and SLD components) */
  nodes: SldOverlayBus[];
  /** @deprecated Use nodes instead */
  buses?: SldOverlayBus[];
  branches: SldOverlayBranch[];
  /** Overall energy validation status: PASS | WARNING | FAIL */
  overall_ev_status?: string;
}

export interface ResultsRunSnapshot {
  run_id: string;
  snapshot_id: string | null;
  snapshot: EnergyNetworkModel;
}

// =============================================================================
// UI State Types
// =============================================================================

/**
 * Active tab in Results Inspector.
 */
export type ResultsInspectorTab = 'BUSES' | 'BRANCHES' | 'SHORT_CIRCUIT' | 'TRACE';

/**
 * Polish tab labels.
 */
export const RESULTS_TAB_LABELS: Record<ResultsInspectorTab, string> = {
  BUSES: 'Szyny',
  BRANCHES: 'Gałęzie',
  SHORT_CIRCUIT: 'Zwarcia',
  TRACE: 'Ślad obliczeń',
};

/**
 * Result status labels (Polish).
 */
export const RESULT_STATUS_LABELS: Record<string, string> = {
  NONE: 'Wyniki nieuruchomione',
  FRESH: 'Wyniki aktualne',
  VALID: 'Wyniki aktualne',
  OUTDATED: 'Wyniki nieaktualne',
};

/**
 * Result status severity for visual indication.
 */
export const RESULT_STATUS_SEVERITY: Record<string, 'info' | 'success' | 'warning'> = {
  NONE: 'info',
  FRESH: 'success',
  VALID: 'success',
  OUTDATED: 'warning',
};

/**
 * Flag labels (Polish).
 */
export const FLAG_LABELS: Record<string, string> = {
  SLACK: 'Węzeł bilansujący',
  VOLTAGE_VIOLATION: 'Naruszenie napięcia',
  OVERLOADED: 'Przeciążenie',
};

/**
 * Solver kind labels (Polish).
 */
export const SOLVER_KIND_LABELS: Record<string, string> = {
  PF: 'Rozpływ mocy',
  short_circuit_sn: 'Zwarcie SN',
  power_flow: 'Rozpływ mocy',
};

