/**
 * Protection Engine v1 — TypeScript Types (PR-26)
 *
 * Mirror of backend domain/protection_engine_v1.py
 *
 * INVARIANTS:
 * - 100% PL labels
 * - No heuristics, no auto-defaults
 * - Relay attached to CB (wyłącznik)
 * - Functions: 50 (I>>) and 51 (I>)
 * - IEC IDMT curves
 */

// =============================================================================
// Enums
// =============================================================================

export type IECCurveType =
  | 'IEC_STANDARD_INVERSE'
  | 'IEC_VERY_INVERSE'
  | 'IEC_EXTREMELY_INVERSE';

// =============================================================================
// CT Ratio
// =============================================================================

export interface CTRatio {
  primary_a: number;
  secondary_a: number;
}

// =============================================================================
// Function Settings
// =============================================================================

export interface Function50Settings {
  enabled: boolean;
  pickup_a_secondary: number;
  t_trip_s?: number | null;
}

export interface Function51Settings {
  curve_type: IECCurveType;
  pickup_a_secondary: number;
  tms: number;
  max_time_s?: number | null;
}

// =============================================================================
// Relay
// =============================================================================

export interface RelayV1 {
  relay_id: string;
  attached_cb_id: string;
  ct_ratio: CTRatio;
  f51: Function51Settings;
  f50?: Function50Settings | null;
}

// =============================================================================
// Test Point
// =============================================================================

export interface TestPoint {
  point_id: string;
  i_a_primary: number;
}

// =============================================================================
// Study Input
// =============================================================================

export interface ProtectionStudyInputV1 {
  relays: RelayV1[];
  test_points: TestPoint[];
}

// =============================================================================
// Function Results
// =============================================================================

export interface Function50Result {
  picked_up: boolean;
  t_trip_s?: number | null;
}

export interface Function51Result {
  t_trip_s: number;
  curve_type: string;
  pickup_a_secondary: number;
  tms: number;
}

export interface TestPointFunctionResults {
  '50'?: Function50Result;
  '51'?: Function51Result;
}

// =============================================================================
// Test Point Result
// =============================================================================

export interface TestPointResult {
  point_id: string;
  i_a_secondary: number;
  function_results: TestPointFunctionResults;
  trace: Record<string, unknown>;
}

// =============================================================================
// Relay Result
// =============================================================================

export interface RelayResultV1 {
  relay_id: string;
  attached_cb_id: string;
  per_test_point: TestPointResult[];
}

// =============================================================================
// Protection Result Set V1
// =============================================================================

export interface ProtectionResultSetV1 {
  analysis_type: 'PROTECTION';
  relay_results: RelayResultV1[];
  deterministic_signature: string;
}

// =============================================================================
// API Response
// =============================================================================

export interface ExecuteProtectionResponse {
  status: string;
  input_hash: string;
  result: ProtectionResultSetV1;
}

export interface CurveTimeResponse {
  trip_time_s: number | null;
  will_trip: boolean;
  trace: Record<string, unknown>;
}

export interface CurveTypeInfo {
  value: IECCurveType;
  label_pl: string;
  A: number;
  B: number;
  formula: string;
  standard: string;
}

export interface CurveTypesResponse {
  curves: CurveTypeInfo[];
}

export interface ValidationIssue {
  code: string;
  relay_id?: string;
  point_id?: string;
  message_pl: string;
  severity: 'BLOCKER' | 'WARN' | 'INFO';
  fix_action?: {
    action_type: string;
    element_ref?: string;
    modal_type?: string;
    description_pl: string;
  };
}

export interface ValidationResponse {
  valid: boolean;
  issues: ValidationIssue[];
  issue_count: number;
}

// =============================================================================
// Polish Labels (100% PL)
// =============================================================================

export const LABELS = {
  title: 'Silnik zabezpieczen v1',
  subtitle: 'Analiza zabezpieczen nadpradowych 50/51 z krzywymi IEC IDMT',

  relay: {
    title: 'Konfiguracja przekaznika',
    id: 'Identyfikator przekaznika',
    attachedCb: 'Przypisany wylacznik (CB)',
    ctRatio: 'Przekladnia pradowa CT',
    ctPrimary: 'Strona pierwotna [A]',
    ctSecondary: 'Strona wtorna [A]',
    addRelay: 'Dodaj przekaznik',
    removeRelay: 'Usun przekaznik',
  },

  f50: {
    title: 'Funkcja 50 — Zabezpieczenie zwarciowe (I>>)',
    enabled: 'Aktywna',
    pickup: 'Nastawa rozruchowa [A] (strona wtorna)',
    tripTime: 'Czas wylaczenia [s]',
  },

  f51: {
    title: 'Funkcja 51 — Zabezpieczenie nadpradowe czasowe (I>)',
    curveType: 'Typ krzywej IEC',
    pickup: 'Nastawa rozruchowa [A] (strona wtorna)',
    tms: 'Mnoznik czasowy (TMS)',
    maxTime: 'Maksymalny czas [s]',
  },

  testPoints: {
    title: 'Punkty testowe pradu',
    subtitle: 'Jawne prady do ewaluacji (strona pierwotna CT)',
    pointId: 'Etykieta punktu',
    current: 'Prad [A] (strona pierwotna)',
    addPoint: 'Dodaj punkt testowy',
    removePoint: 'Usun punkt',
  },

  results: {
    title: 'Wyniki analizy zabezpieczen',
    relay: 'Przekaznik',
    testPoint: 'Punkt testowy',
    iSecondary: 'I wtorny [A]',
    f51Time: 't(51) [s]',
    f50Status: 'Status 50',
    tripTime: 'Czas zadziałania',
    picked: 'Zadziałał',
    notPicked: 'Nie zadziałał',
    noData: 'Brak wyników — uruchom analizę',
  },

  curveTypes: {
    IEC_STANDARD_INVERSE: 'Normalna odwrotna (SI)',
    IEC_VERY_INVERSE: 'Bardzo odwrotna (VI)',
    IEC_EXTREMELY_INVERSE: 'Ekstremalnie odwrotna (EI)',
  },

  actions: {
    execute: 'Uruchom analize',
    validate: 'Waliduj dane',
    clear: 'Wyczysc',
  },

  validation: {
    ctPositive: 'Przekladnia CT musi byc dodatnia',
    pickupPositive: 'Nastawa rozruchowa musi byc dodatnia',
    tmsPositive: 'TMS musi byc dodatni',
    currentPositive: 'Prad testowy musi byc dodatni',
    minOneRelay: 'Wymagany minimum jeden przekaznik',
    minOneTestPoint: 'Wymagany minimum jeden punkt testowy',
  },

  errors: {
    'protection.relay_missing_ct_ratio': 'Uzupelnij przekładnie CT',
    'protection.curve_invalid_params': 'Nieprawidlowe parametry krzywej',
    'protection.test_point_missing_current': 'Dodaj punkt testowy pradu',
    'protection.sc_mapping_ambiguous': 'Wybierz zrodlo pradu do analizy',
  },
} as const;
