/**
 * P15b — Protection Comparison Types (Frontend)
 *
 * CANONICAL ALIGNMENT:
 * - P15b: Protection Selectivity Comparison (A/B)
 * - Matches backend DTOs from domain/protection_comparison.py
 *
 * RULES (BINDING):
 * - These types are READ-ONLY views of backend comparison data
 * - No physics calculations in frontend
 * - Polish labels for UI display
 * - 100% deterministic (same inputs → same outputs)
 */

// =============================================================================
// State Change Types
// =============================================================================

/**
 * Protection state change between Run A and Run B.
 * Backend: domain/protection_comparison.py → StateChange
 */
export type ProtectionStateChange =
  | 'NO_CHANGE'
  | 'TRIP_TO_NO_TRIP'
  | 'NO_TRIP_TO_TRIP'
  | 'INVALID_CHANGE';

/**
 * Polish labels for state changes. Reużyte w ekranie ui2 (tabela zmian stanu,
 * `porownanieModel.ts::naWierszeStanowZabezpieczen`, karta CV-3.3-B2).
 */
export const STATE_CHANGE_LABELS: Record<ProtectionStateChange, string> = {
  NO_CHANGE: 'Bez zmian',
  TRIP_TO_NO_TRIP: 'Utrata zadziałania',
  NO_TRIP_TO_TRIP: 'Pojawienie się zadziałania',
  INVALID_CHANGE: 'Nieprawidłowa zmiana',
};

// =============================================================================
// Issue Types
// =============================================================================

/**
 * Issue codes for protection comparison ranking.
 * Backend: domain/protection_comparison.py → IssueCode
 */
export type IssueCode =
  | 'TRIP_LOST'
  | 'TRIP_GAINED'
  | 'DELAY_INCREASED'
  | 'DELAY_DECREASED'
  | 'INVALID_STATE'
  | 'MARGIN_DECREASED'
  | 'MARGIN_INCREASED';

/**
 * Polish labels for issue codes. Reużyte w ekranie ui2 (ranking zabezpieczeń,
 * `strings.ts::rodzajProblemuZabezpieczenPL`, karta CV-3.3-B2) — jedyne
 * źródło tego słownika, zero drugiej mapy tych samych kodów.
 */
export const ISSUE_CODE_LABELS: Record<IssueCode, string> = {
  TRIP_LOST: 'Utrata zadziałania',
  TRIP_GAINED: 'Pojawienie się zadziałania',
  DELAY_INCREASED: 'Wydłużenie czasu',
  DELAY_DECREASED: 'Skrócenie czasu',
  INVALID_STATE: 'Nieprawidłowy stan',
  MARGIN_DECREASED: 'Zmniejszenie marginesu',
  MARGIN_INCREASED: 'Zwiększenie marginesu',
};

/**
 * Severity levels (1-5).
 * Backend: domain/protection_comparison.py → IssueSeverity
 *
 * Etykiety PL: ekran ui2 reużywa `wagaPL`/`WAGA_PL` z
 * `ui2/wyniki/porownanie/strings.ts` (ta sama skala 1–5, karta CV-3.3-B2)
 * zamiast osobnego słownika tutaj — `SEVERITY_LABELS`/`SEVERITY_COLORS`
 * (Tailwind) skasowane jako martwe eksporty (karta CV-3.3-B2, D3): jedyny
 * konsument, `ProtectionComparisonPage.tsx`, jest skasowany, a ui2 nie
 * stylizuje wagi kolorem Tailwind (system tagu `ostrzezenie` wzorca).
 */
export type IssueSeverity = 1 | 2 | 3 | 4 | 5;

// =============================================================================
// Comparison Row
// =============================================================================

/**
 * Single comparison row (per element/fault pair).
 * Backend: domain/protection_comparison.py → ProtectionComparisonRow
 *
 * NAPRAWA (karta CV-3.3-B2, błąd napotkany przy okazji — Zero-Debt):
 * `i_fault_a_a`/`i_fault_a_b`/`delta_i_fault_a` były tu typowane jako
 * nienullowalny `number`, mimo że backend (`api/protection_comparisons.py::
 * ComparisonRowResponse`, komentarz „FAB-E (E1)") jawnie wysyła `float | None`
 * — element nieobecny w run A LUB run B daje `None`, nigdy fabrykowane 0.0 A.
 * Ekran ui2 (`porownanieModel.ts::naWierszeStanowZabezpieczen`) już liczył
 * się z `null` w praktyce (obronny `typeof wartosc !== 'number'`) — typ był
 * fałszywą pewnością (deklaracja bez pokrycia w kontrakcie backendu).
 */
export interface ProtectionComparisonRow {
  protected_element_ref: string;
  fault_target_id: string;
  device_id_a: string;
  device_id_b: string;
  trip_state_a: string;
  trip_state_b: string;
  t_trip_s_a: number | null;
  t_trip_s_b: number | null;
  i_fault_a_a: number | null;
  i_fault_a_b: number | null;
  delta_t_s: number | null;
  delta_i_fault_a: number | null;
  margin_percent_a: number | null;
  margin_percent_b: number | null;
  state_change: ProtectionStateChange;
}

// =============================================================================
// Ranking Issue
// =============================================================================

/**
 * Single ranking issue.
 * Backend: domain/protection_comparison.py → RankingIssue
 */
export interface RankingIssue {
  issue_code: IssueCode;
  severity: IssueSeverity;
  element_ref: string;
  fault_target_id: string;
  description_pl: string;
  evidence_refs: number[];
}

// =============================================================================
// Summary
// =============================================================================

/**
 * Comparison summary statistics.
 * Backend: domain/protection_comparison.py → ProtectionComparisonSummary
 */
export interface ProtectionComparisonSummary {
  total_rows: number;
  no_change_count: number;
  trip_to_no_trip_count: number;
  no_trip_to_trip_count: number;
  invalid_change_count: number;
  total_issues: number;
  critical_issues: number;
  major_issues: number;
  moderate_issues: number;
  minor_issues: number;
}

// =============================================================================
// Comparison Result (Full)
// =============================================================================

/**
 * Full protection comparison result.
 * Backend: domain/protection_comparison.py → ProtectionComparisonResult
 */
export interface ProtectionComparisonResult {
  comparison_id: string;
  run_a_id: string;
  run_b_id: string;
  project_id: string;
  rows: ProtectionComparisonRow[];
  ranking: RankingIssue[];
  summary: ProtectionComparisonSummary;
  input_hash: string;
  /**
   * B1/B5 (karta CV-3.3-B): proweniencja biegu A/B — dowód CO było
   * porównywane (`snapshot_hash`/`input_hash`/`envelope` biegu R1). Backend:
   * `api/protection_comparisons.py::RunProvenanceResponse`.
   */
  provenance_a: RunProvenance;
  provenance_b: RunProvenance;
  created_at: string;
}

/**
 * Proweniencja jednego biegu R1 wewnątrz odpowiedzi porównania (B1).
 * Backend: `api/protection_comparisons.py::RunProvenanceResponse`.
 */
export interface RunProvenance {
  run_id: string;
  analysis_type: string;
  status: string;
  snapshot_hash: string;
  input_hash: string;
  finished_at: string | null;
  envelope: Record<string, unknown> | null;
}

// =============================================================================
// Trace Types
// =============================================================================

/**
 * Single trace step.
 * Backend: domain/protection_comparison.py → ProtectionComparisonTraceStep
 */
export interface ProtectionComparisonTraceStep {
  step: string;
  description_pl: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
}

/**
 * Full comparison trace.
 * Backend: domain/protection_comparison.py → ProtectionComparisonTrace
 */
export interface ProtectionComparisonTrace {
  comparison_id: string;
  run_a_id: string;
  run_b_id: string;
  library_fingerprint_a: string | null;
  library_fingerprint_b: string | null;
  steps: ProtectionComparisonTraceStep[];
  created_at: string;
}

// =============================================================================
// Protection Run (for selectors)
// =============================================================================

/**
 * Protection run item for selector dropdowns.
 * Backend: `api/protection_runs.py::ProtectionRunListItemResponse`
 * (`GET /projects/{project_id}/protection-runs`, karta CV-3.3-B).
 */
export interface ProtectionRunItem {
  id: string;
  project_id: string | null;
  study_case_id: string;
  analysis_type: string;
  status: string;
  created_at: string;
  finished_at: string | null;
  input_hash: string;
  /**
   * B5 (karta CV-3.3-B): dowód KTÓRY stan modelu opisuje bieg — etykieta
   * wyboru w porównaniu A/B niesie rodzaj + rewizja/scenariusz + krótki
   * `snapshot_hash`, nie sam UUID biegu.
   */
  snapshot_hash: string;
  model_revision: number | null;
  /** `[identyfikator_scenariusza, rewizja_scenariusza]` albo `null` = stan normalny. */
  scenario_ref: [string, number] | null;
}
