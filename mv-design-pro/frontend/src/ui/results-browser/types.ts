/**
 * FIX-03 — Results Browser Types (Frontend)
 *
 * CANONICAL ALIGNMENT:
 * - SYSTEM_SPEC.md: READ-ONLY result display
 * - wizard_screens.md: RESULT_VIEW mode
 * - ui_canonical_parity.md: Deterministic sorting
 *
 * RULES (BINDING):
 * - These types are READ-ONLY views of backend data
 * - No physics calculations in frontend
 * - Polish labels for UI display (100%)
 */

// =============================================================================
// View Modes
// =============================================================================

/**
 * Available view modes in Results Browser.
 */
export type ResultsViewMode =
  | 'bus_voltages'
  | 'branch_flows'
  | 'losses'
  | 'violations'
  | 'convergence'
  | 'white_box';

/**
 * Polish labels for view modes.
 */
export const VIEW_MODE_LABELS: Record<ResultsViewMode, string> = {
  bus_voltages: 'Napięcia węzłowe',
  branch_flows: 'Przepływy gałęziowe',
  losses: 'Straty',
  violations: 'Naruszenia',
  convergence: 'Zbieżność',
  white_box: 'Ślad obliczeń',
};

/**
 * View mode icons (optional visual indicator).
 */
export const VIEW_MODE_ICONS: Record<ResultsViewMode, string> = {
  bus_voltages: 'V',
  branch_flows: 'I',
  losses: 'P',
  violations: '!',
  convergence: '~',
  white_box: '{}',
};

// =============================================================================
// Export Formats
// =============================================================================

/**
 * Available export formats.
 */
export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

/**
 * Polish labels for export formats.
 */
export const EXPORT_FORMAT_LABELS: Record<ExportFormat, string> = {
  csv: 'CSV',
  xlsx: 'Excel',
  pdf: 'PDF',
};

// =============================================================================
// Column Definitions
// =============================================================================

/**
 * Column definition for results table.
 */
export interface ColumnDef<T = unknown> {
  /** Unique column key (field name) */
  key: string;
  /** Polish header label */
  header: string;
  /** Data type for formatting */
  type: 'string' | 'number' | 'enum' | 'status' | 'percent';
  /** Decimal places for number columns */
  decimals?: number;
  /** Unit suffix (e.g., 'kV', 'MW') */
  unit?: string;
  /** Text alignment */
  align?: 'left' | 'center' | 'right';
  /** Whether column is sortable */
  sortable?: boolean;
  /** Custom render function */
  render?: (value: unknown, row: T) => React.ReactNode;
  /** Width hint */
  width?: string;
}

/**
 * Sort configuration.
 */
export interface SortConfig {
  key: string;
  direction: 'asc' | 'desc';
}

/**
 * Filter state.
 */
export interface FilterState {
  searchQuery?: string;
  statusFilter?: string;
  minValue?: number;
  maxValue?: number;
  [key: string]: unknown;
}

// =============================================================================
// Bus Voltages View
// =============================================================================

/**
 * Bus voltage result row.
 */
export interface BusVoltageRow {
  bus_id: string;
  bus_name: string;
  bus_type: 'SLACK' | 'PV' | 'PQ';
  voltage_kv: number;
  voltage_pu: number;
  angle_deg: number;
  p_mw: number;
  q_mvar: number;
  status: 'PASS' | 'FAIL' | 'WARNING';
}

/**
 * Column definitions for bus voltages.
 */
export const BUS_VOLTAGES_COLUMNS: ColumnDef<BusVoltageRow>[] = [
  { key: 'bus_name', header: 'Węzeł', type: 'string', align: 'left', sortable: true },
  { key: 'bus_type', header: 'Typ', type: 'enum', align: 'center', sortable: true },
  { key: 'voltage_kv', header: 'U [kV]', type: 'number', decimals: 3, align: 'right', sortable: true },
  { key: 'voltage_pu', header: 'U [p.u.]', type: 'number', decimals: 4, align: 'right', sortable: true },
  { key: 'angle_deg', header: 'δ [°]', type: 'number', decimals: 2, align: 'right', sortable: true },
  { key: 'p_mw', header: 'P [MW]', type: 'number', decimals: 3, align: 'right', sortable: true },
  { key: 'q_mvar', header: 'Q [Mvar]', type: 'number', decimals: 3, align: 'right', sortable: true },
  { key: 'status', header: 'Status', type: 'status', align: 'center', sortable: true },
];

// =============================================================================
// Branch Flows View
// =============================================================================

/**
 * Branch flow result row.
 */
export interface BranchFlowRow {
  branch_id: string;
  branch_name: string;
  from_bus: string;
  to_bus: string;
  p_from_mw: number;
  q_from_mvar: number;
  p_to_mw: number;
  q_to_mvar: number;
  current_ka: number;
  loading_pct: number;
  status: 'PASS' | 'FAIL' | 'WARNING';
}

/**
 * Column definitions for branch flows.
 */
export const BRANCH_FLOWS_COLUMNS: ColumnDef<BranchFlowRow>[] = [
  { key: 'branch_name', header: 'Gałąź', type: 'string', align: 'left', sortable: true },
  { key: 'from_bus', header: 'Od', type: 'string', align: 'left', sortable: true },
  { key: 'to_bus', header: 'Do', type: 'string', align: 'left', sortable: true },
  { key: 'p_from_mw', header: 'P_from [MW]', type: 'number', decimals: 3, align: 'right', sortable: true },
  { key: 'q_from_mvar', header: 'Q_from [Mvar]', type: 'number', decimals: 3, align: 'right', sortable: true },
  { key: 'p_to_mw', header: 'P_to [MW]', type: 'number', decimals: 3, align: 'right', sortable: true },
  { key: 'q_to_mvar', header: 'Q_to [Mvar]', type: 'number', decimals: 3, align: 'right', sortable: true },
  { key: 'current_ka', header: 'I [kA]', type: 'number', decimals: 4, align: 'right', sortable: true },
  { key: 'loading_pct', header: 'Obc. [%]', type: 'percent', decimals: 1, align: 'right', sortable: true },
];

// =============================================================================
// Losses View
// =============================================================================

/**
 * Losses result row.
 */
export interface LossesRow {
  branch_id: string;
  branch_name: string;
  branch_type: string;
  losses_p_mw: number;
  losses_q_mvar: number;
  losses_pct: number;
}

/**
 * Column definitions for losses.
 */
export const LOSSES_COLUMNS: ColumnDef<LossesRow>[] = [
  { key: 'branch_name', header: 'Gałąź', type: 'string', align: 'left', sortable: true },
  { key: 'branch_type', header: 'Typ', type: 'enum', align: 'center', sortable: true },
  { key: 'losses_p_mw', header: 'ΔP [MW]', type: 'number', decimals: 4, align: 'right', sortable: true },
  { key: 'losses_q_mvar', header: 'ΔQ [Mvar]', type: 'number', decimals: 4, align: 'right', sortable: true },
  { key: 'losses_pct', header: 'Straty [%]', type: 'percent', decimals: 2, align: 'right', sortable: true },
];

// =============================================================================
// Violations View
// =============================================================================

/**
 * Violation type.
 */
export type ViolationType = 'OVERVOLTAGE' | 'UNDERVOLTAGE' | 'OVERLOAD' | 'THERMAL';

/**
 * Violation result row.
 */
export interface ViolationRow {
  element_id: string;
  element_name: string;
  element_type: 'bus' | 'branch';
  violation_type: ViolationType;
  voltage_pu?: number;
  loading_pct?: number;
  limit_min_pu?: number;
  limit_max_pu?: number;
  deviation_pct: number;
  severity: 'INFO' | 'WARN' | 'HIGH';
}

/**
 * Polish labels for violation types.
 */
export const VIOLATION_TYPE_LABELS: Record<ViolationType, string> = {
  OVERVOLTAGE: 'Przekroczenie napięcia',
  UNDERVOLTAGE: 'Niedostateczne napięcie',
  OVERLOAD: 'Przeciążenie',
  THERMAL: 'Przeciążenie termiczne',
};

/**
 * Column definitions for violations.
 */
export const VIOLATIONS_COLUMNS: ColumnDef<ViolationRow>[] = [
  { key: 'element_name', header: 'Element', type: 'string', align: 'left', sortable: true },
  { key: 'element_type', header: 'Typ elementu', type: 'enum', align: 'center', sortable: true },
  { key: 'violation_type', header: 'Rodzaj naruszenia', type: 'enum', align: 'left', sortable: true },
  { key: 'voltage_pu', header: 'U [p.u.]', type: 'number', decimals: 4, align: 'right', sortable: true },
  { key: 'loading_pct', header: 'Obc. [%]', type: 'percent', decimals: 1, align: 'right', sortable: true },
  { key: 'limit_min_pu', header: 'Umin [p.u.]', type: 'number', decimals: 2, align: 'right', sortable: true },
  { key: 'limit_max_pu', header: 'Umax [p.u.]', type: 'number', decimals: 2, align: 'right', sortable: true },
  { key: 'deviation_pct', header: 'Odch. [%]', type: 'percent', decimals: 2, align: 'right', sortable: true },
  { key: 'severity', header: 'Severity', type: 'status', align: 'center', sortable: true },
];

// =============================================================================
// Convergence View
// =============================================================================

/**
 * Convergence iteration row.
 */
export interface ConvergenceRow {
  iteration: number;
  max_mismatch_pu: number;
  norm_mismatch: number;
  max_mismatch_bus?: string;
  jacobian_rcond?: number;
  converged: boolean;
}

/**
 * Column definitions for convergence.
 */
export const CONVERGENCE_COLUMNS: ColumnDef<ConvergenceRow>[] = [
  { key: 'iteration', header: 'Iteracja', type: 'number', decimals: 0, align: 'center', sortable: true },
  { key: 'max_mismatch_pu', header: 'Max Δ [p.u.]', type: 'number', decimals: 6, align: 'right', sortable: true },
  { key: 'norm_mismatch', header: 'Norma Δ', type: 'number', decimals: 6, align: 'right', sortable: true },
  { key: 'max_mismatch_bus', header: 'Węzeł max Δ', type: 'string', align: 'left', sortable: true },
  { key: 'jacobian_rcond', header: 'rcond(J)', type: 'number', decimals: 6, align: 'right', sortable: true },
  { key: 'converged', header: 'Zbieżny', type: 'status', align: 'center', sortable: true },
];

// =============================================================================
// Run Comparison
// =============================================================================

/**
 * Run header for comparison.
 */
export interface RunHeaderCompare {
  run_id: string;
  case_id: string;
  case_name?: string;
  created_at: string;
  solver_kind: string;
  status: string;
  converged?: boolean;
}

/**
 * Comparison status for a row.
 */
export type ComparisonStatus = 'IDENTICAL' | 'CHANGED' | 'ONLY_IN_A' | 'ONLY_IN_B';

/**
 * Polish labels for comparison status.
 */
export const COMPARISON_STATUS_LABELS: Record<ComparisonStatus, string> = {
  IDENTICAL: 'Bez zmian',
  CHANGED: 'Zmieniono',
  ONLY_IN_A: 'Tylko w A',
  ONLY_IN_B: 'Tylko w B',
};

/**
 * Tailwind classes for comparison status.
 */
export const COMPARISON_STATUS_COLORS: Record<ComparisonStatus, string> = {
  IDENTICAL: 'bg-slate-50 text-slate-600',
  CHANGED: 'bg-amber-50 text-amber-700',
  ONLY_IN_A: 'bg-red-50 text-red-700',
  ONLY_IN_B: 'bg-green-50 text-green-700',
};

/**
 * Generic comparison row.
 */
export interface ComparisonRow<T> {
  row_id: string;
  value_a: T | null;
  value_b: T | null;
  status: ComparisonStatus;
  delta?: Record<string, number>;
}

// =============================================================================
// Status Labels and Colors
// =============================================================================

/**
 * Status types.
 */
export type ResultStatus = 'PASS' | 'FAIL' | 'WARNING';

/**
 * Polish labels for status.
 */
export const STATUS_LABELS: Record<ResultStatus, string> = {
  PASS: 'ZGODNY',
  FAIL: 'NIEZGODNY',
  WARNING: 'OSTRZEŻENIE',
};

/**
 * Tailwind classes for status badges.
 */
export const STATUS_COLORS: Record<ResultStatus, string> = {
  PASS: 'bg-emerald-100 text-emerald-700',
  FAIL: 'bg-rose-100 text-rose-700',
  WARNING: 'bg-amber-100 text-amber-700',
};

/**
 * Severity levels.
 */
export type Severity = 'INFO' | 'WARN' | 'HIGH';

/**
 * Polish labels for severity.
 */
export const SEVERITY_LABELS: Record<Severity, string> = {
  INFO: 'Informacja',
  WARN: 'Ostrzeżenie',
  HIGH: 'Istotny problem',
};

/**
 * Tailwind classes for severity badges.
 */
export const SEVERITY_COLORS: Record<Severity, string> = {
  INFO: 'bg-slate-100 text-slate-600',
  WARN: 'bg-amber-100 text-amber-700',
  HIGH: 'bg-rose-100 text-rose-700',
};

// =============================================================================
// Results Browser State
// =============================================================================

/**
 * Complete results browser state.
 */
export interface ResultsBrowserState {
  // Current view mode
  viewMode: ResultsViewMode;

  // Loaded data
  busVoltages: BusVoltageRow[];
  branchFlows: BranchFlowRow[];
  losses: LossesRow[];
  violations: ViolationRow[];
  convergence: ConvergenceRow[];

  // Filtering/sorting
  filters: FilterState;
  sortConfig: SortConfig | null;

  // Selection for comparison
  selectedRunIds: string[];

  // Loading states
  isLoading: boolean;
  error: string | null;
}

// =============================================================================
// UI Labels (100% Polish)
// =============================================================================

export const RESULTS_BROWSER_LABELS = {
  title: 'Przeglądarka wyników',
  subtitle: 'Wyniki analizy sieciowej',

  views: VIEW_MODE_LABELS,

  actions: {
    export_csv: 'Eksportuj CSV',
    export_xlsx: 'Eksportuj Excel',
    export_pdf: 'Eksportuj PDF',
    compare: 'Porównaj',
    filter: 'Filtruj',
    sort: 'Sortuj',
    clear_filters: 'Wyczyść filtry',
    select_all: 'Zaznacz wszystko',
    deselect_all: 'Odznacz wszystko',
    refresh: 'Odśwież',
    close: 'Zamknij',
  },

  status: STATUS_LABELS,
  severity: SEVERITY_LABELS,
  violations: VIOLATION_TYPE_LABELS,
  comparison_status: COMPARISON_STATUS_LABELS,

  messages: {
    no_data: 'Brak danych do wyświetlenia',
    loading: 'Ładowanie...',
    error: 'Błąd wczytywania danych',
    export_success: 'Eksport zakończony pomyślnie',
    export_error: 'Błąd eksportu',
    no_violations: 'Brak naruszeń - wszystkie parametry w normie',
    select_runs_to_compare: 'Wybierz co najmniej 2 runy do porównania',
    comparison_ready: 'Porównanie gotowe',
  },

  table: {
    rows_shown: 'Wyświetlono {shown} z {total} wierszy',
    no_results: 'Filtr nie wskazuje wyników spełniających kryteria',
    sort_asc: 'Sortuj rosnąco',
    sort_desc: 'Sortuj malejąco',
  },

  filters: {
    search_placeholder: 'Szukaj...',
    status_all: 'Wszystkie statusy',
    type_all: 'Wszystkie typy',
    min_value: 'Wartość min.',
    max_value: 'Wartość max.',
  },

  comparison: {
    title: 'Porównanie wyników',
    run_a: 'Run A',
    run_b: 'Run B',
    delta: 'Różnica (Δ)',
    show_only_changes: 'Pokaż tylko zmiany',
  },
} as const;

// =============================================================================
// Bus Type Labels
// =============================================================================

export const BUS_TYPE_LABELS: Record<string, string> = {
  SLACK: 'Bilans',
  PV: 'PV',
  PQ: 'PQ',
};

// =============================================================================
// Element Type Labels
// =============================================================================

export const ELEMENT_TYPE_LABELS: Record<string, string> = {
  bus: 'Węzeł',
  branch: 'Gałąź',
  line: 'Linia',
  transformer: 'Transformator',
};
