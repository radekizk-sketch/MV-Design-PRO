/**
 * runListTypes — typy dla cross-case run history (Pakiet H).
 *
 * RunListView w `history/` pokazuje uruchomienia PRZEKROJOWO (across cases).
 * To INNY scope niż `study-cases/RunHistoryPanel` (per-case).
 */

/**
 * ProofType — 11 typów proof packów (canonical, mirror backendowych enum).
 * Backendowe źródło: backend/src/application/proof_engine/types.py
 */
export type ProofType =
  | 'SC3F_IEC60909'
  | 'VDROP'
  | 'SC1F'
  | 'SC2F'
  | 'SC2FG'
  | 'LOAD_FLOW_VOLTAGE'
  | 'Q_U_REGULATION'
  | 'EQUIPMENT_PROOF'
  | 'LOAD_CURRENTS_OVERLOAD'
  | 'LOSSES_ENERGY'
  | 'PROTECTION_OVERCURRENT'
  | 'EARTHING_GROUND_FAULT_SN';

export const PROOF_TYPE_LABELS_PL: Readonly<Record<ProofType, string>> = Object.freeze({
  SC3F_IEC60909: 'Zwarcie 3-fazowe (IEC 60909)',
  VDROP: 'Spadek napięcia',
  SC1F: 'Zwarcie 1-fazowe',
  SC2F: 'Zwarcie 2-fazowe',
  SC2FG: 'Zwarcie 2-fazowe z ziemią',
  LOAD_FLOW_VOLTAGE: 'Rozpływ mocy — napięcia',
  Q_U_REGULATION: 'Regulacja Q(U)',
  EQUIPMENT_PROOF: 'Sprawdzenie wytrzymałości aparatury',
  LOAD_CURRENTS_OVERLOAD: 'Obciążenia prądowe / przeciążenia',
  LOSSES_ENERGY: 'Straty / energia',
  PROTECTION_OVERCURRENT: 'Zabezpieczenia nadprądowe',
  EARTHING_GROUND_FAULT_SN: 'Zwarcie doziemne SN',
});

export type RunStatus = 'success' | 'failed' | 'running' | 'cancelled';

export const RUN_STATUS_LABELS_PL: Readonly<Record<RunStatus, string>> = Object.freeze({
  success: 'Sukces',
  failed: 'Błąd',
  running: 'W toku',
  cancelled: 'Anulowano',
});

/**
 * Cross-case execution run summary.
 */
export interface RunListEntry {
  run_id: string;
  case_id: string;
  case_name: string;
  proof_type: ProofType;
  status: RunStatus;
  /** ISO 8601 timestamp */
  created_at: string;
  /** Czas wykonania [s] */
  duration_s: number;
  /** SHA-256 hash wyniku (8-char prefix do display) */
  hash_prefix?: string;
  /** Komunikat błędu (gdy status === 'failed') */
  error_message?: string;
}

/**
 * Filter for RunListView.
 */
export interface RunListFilter {
  case_id?: string;
  proof_type?: ProofType;
  status?: RunStatus;
  /** ISO 8601 — runy z dnia od */
  from_date?: string;
  /** ISO 8601 — runy z dnia do */
  to_date?: string;
}

/**
 * Pure filter function (deterministic).
 */
export function filterRuns(
  runs: ReadonlyArray<RunListEntry>,
  filter: RunListFilter,
): RunListEntry[] {
  return runs.filter((r) => {
    if (filter.case_id && r.case_id !== filter.case_id) return false;
    if (filter.proof_type && r.proof_type !== filter.proof_type) return false;
    if (filter.status && r.status !== filter.status) return false;
    if (filter.from_date && r.created_at < filter.from_date) return false;
    if (filter.to_date && r.created_at > filter.to_date) return false;
    return true;
  });
}

/**
 * Sort runs DESC by created_at (najnowsze najpierw, deterministic).
 * Tie-breaker: run_id ASC.
 */
export function sortRunsDescByDate(runs: ReadonlyArray<RunListEntry>): RunListEntry[] {
  return [...runs].sort((a, b) => {
    if (a.created_at !== b.created_at) {
      return b.created_at.localeCompare(a.created_at);
    }
    return a.run_id.localeCompare(b.run_id);
  });
}
