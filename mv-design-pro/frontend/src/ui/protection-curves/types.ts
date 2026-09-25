/**
 * FIX-06 — Protection Curves Editor Types
 *
 * CANONICAL ALIGNMENT:
 * - SYSTEM_SPEC.md: Analysis layer (interpretation only)
 * - PROTECTION_CURVES_IT_SUPERIOR_CONTRACT.md: UI contract
 * - 100% Polish UI labels
 *
 * RULES (BINDING):
 * - These types are READ-ONLY views of backend data
 * - No physics calculations in frontend
 * - All curve math done by backend
 * - Polish labels for UI display
 */

// =============================================================================
// Curve Standard Types
// =============================================================================

/**
 * Protection curve standard.
 */
export type CurveStandard = 'IEC' | 'IEEE';

/**
 * IEC 60255 curve types.
 */
export type IECCurveType = 'SI' | 'VI' | 'EI' | 'LTI' | 'DT';

/**
 * IEEE C37.112 curve types.
 */
export type IEEECurveType = 'MI' | 'VI' | 'EI' | 'STI' | 'DT';

/**
 * Combined curve type.
 */
export type CurveType = IECCurveType | IEEECurveType;

// =============================================================================
// Curve Data Types
// =============================================================================

/**
 * Single point on a protection curve.
 */
export interface CurvePoint {
  /** Current [A] */
  current_a: number;
  /** Current as multiple of pickup (I/Is) */
  current_multiple: number;
  /** Trip time [s] */
  time_s: number;
}

/**
 * Fault current marker for display on chart.
 */
export interface FaultMarker {
  /** Unique identifier */
  id: string;
  /** Polish label for UI */
  label_pl: string;
  /** Fault current magnitude [A] */
  current_a: number;
  /** Fault type (e.g., "3F", "2F", "1F") */
  fault_type: string;
  /** Fault location description */
  location: string;
}

/**
 * Complete curve definition for editor.
 */
export interface ProtectionCurve {
  /** Unique curve identifier */
  id: string;
  /** Display name (Polish) */
  name_pl: string;
  /** Curve standard (IEC or IEEE) */
  standard: CurveStandard;
  /** Curve type code */
  curve_type: CurveType;
  /** Pickup current [A] */
  pickup_current_a: number;
  /** Time multiplier (TMS for IEC, TD for IEEE) */
  time_multiplier: number;
  /** Definite time for DT curves [s] */
  definite_time_s?: number;
  /** Curve color for chart */
  color: string;
  /** Associated protection device ID */
  device_id?: string;
  /** Is curve enabled/visible */
  enabled: boolean;
  /** Computed curve points (from backend) */
  points: CurvePoint[];
}

// =============================================================================
// Chart Configuration
// =============================================================================

/**
 * Time-current chart configuration.
 */
export interface TimeCurrentChartConfig {
  /** X-axis (current) range [A] */
  currentRange: [number, number];
  /** Y-axis (time) range [s] */
  timeRange: [number, number];
  /** Show grid lines */
  showGrid: boolean;
  /** Show fault current markers */
  showFaultMarkers: boolean;
  /** Chart height in pixels */
  height: number;
}

/**
 * Default chart configuration.
 */
export const DEFAULT_CHART_CONFIG: TimeCurrentChartConfig = {
  currentRange: [10, 10000],
  timeRange: [0.01, 100],
  showGrid: true,
  showFaultMarkers: true,
  height: 500,
};

// =============================================================================
// Editor State Types
// =============================================================================

/**
 * Protection curves editor state.
 */
export interface ProtectionCurvesEditorState {
  /** All curves in the editor */
  curves: ProtectionCurve[];
  /** Selected curve ID */
  selectedCurveId: string | null;
  /** Fault markers */
  faultMarkers: FaultMarker[];
  /** Chart configuration */
  chartConfig: TimeCurrentChartConfig;
  /** Loading state */
  loading: boolean;
  /** Error message */
  error: string | null;
}

// =============================================================================
// UI Labels (100% Polish)
// =============================================================================

export const PROTECTION_CURVES_LABELS = {
  title: 'Edytor krzywych zabezpieczen',
  subtitle: 'Charakterystyki czasowo-pradowe (I-t)',

  chart: {
    title: 'Wykres I-t',
    xAxisLabel: 'Prad [A]',
    yAxisLabel: 'Czas [s]',
    noData: 'Brak danych wykresu',
    faultMarkerLabel: 'Prad zwarcia',
  },

  curves: {
    title: 'Krzywe zabezpieczen',
    add: 'Dodaj krzywa',
    remove: 'Usun',
    enable: 'Wlacz',
    disable: 'Wylacz',
    noSelection: 'Wybierz krzywa do edycji',
    empty: 'Brak krzywych',
  },

  library: {
    title: 'Biblioteka krzywych',
    iec: 'Krzywe IEC 60255',
    ieee: 'Krzywe IEEE C37.112',
    addToChart: 'Dodaj do wykresu',
  },

  settings: {
    title: 'Ustawienia krzywej',
    name: 'Nazwa',
    standard: 'Norma',
    curveType: 'Typ krzywej',
    pickupCurrent: 'Prad rozruchowy Is [A]',
    timeMultiplier: 'Mnoznik czasowy TMS',
    timeDial: 'Mnoznik czasowy TD',
    definiteTime: 'Czas niezalezny [s]',
    color: 'Kolor',
    apply: 'Zastosuj',
    reset: 'Resetuj',
  },

  coordination: {
    title: 'Analiza koordynacji',
    status: 'Status',
    margin: 'Margines',
    upstream: 'Nadrzedne',
    downstream: 'Podrzedne',
    recommendation: 'Zalecenie',
    checkAll: 'Sprawdz wszystkie',
    minMargin: 'Margines minimalny',
    noData: 'Brak danych do analizy',
  },

  faults: {
    title: 'Punkty zwarciowe',
    current: 'Prad zwarcia',
    location: 'Lokalizacja',
    type: 'Typ zwarcia',
    tripTime: 'Czas wylaczenia',
    add: 'Dodaj punkt',
    remove: 'Usun',
    noTrip: 'Nie zadzial',
  },

  actions: {
    export: 'Eksportuj',
    import: 'Importuj',
    save: 'Zapisz',
    close: 'Zamknij',
    refresh: 'Odswiez',
  },

  curveTypes: {
    // IEC 60255
    SI: 'Normalna odwrotna (SI)',
    VI: 'Bardzo odwrotna (VI)',
    EI: 'Ekstremalnie odwrotna (EI)',
    LTI: 'Dlugoczasowa odwrotna (LTI)',
    DT: 'Czas niezalezny (DT)',
    // IEEE C37.112
    MI: 'Umiarkowanie odwrotna (MI)',
    STI: 'Krotkoczas. odwrotna (STI)',
  },

  standards: {
    IEC: 'IEC 60255',
    IEEE: 'IEEE C37.112',
  },

  messages: {
    loading: 'Ladowanie...',
    error: 'Blad wczytywania danych',
    saved: 'Zapisano zmiany',
    curvesUpdated: 'Krzywe zaktualizowane',
  },
} as const;

/**
 * Default curve colors for chart.
 */
export const CURVE_COLORS = [
  '#2563eb', // blue
  '#dc2626', // red
  '#16a34a', // green
  '#9333ea', // purple
  '#ea580c', // orange
  '#0891b2', // cyan
  '#4f46e5', // indigo
  '#be123c', // rose
] as const;

/**
 * IEC curve type options for select.
 */
export const IEC_CURVE_OPTIONS: { value: IECCurveType; label: string }[] = [
  { value: 'SI', label: 'Normalna odwrotna (SI)' },
  { value: 'VI', label: 'Bardzo odwrotna (VI)' },
  { value: 'EI', label: 'Ekstremalnie odwrotna (EI)' },
  { value: 'LTI', label: 'Dlugoczasowa odwrotna (LTI)' },
  { value: 'DT', label: 'Czas niezalezny (DT)' },
];

/**
 * IEEE curve type options for select.
 */
export const IEEE_CURVE_OPTIONS: { value: IEEECurveType; label: string }[] = [
  { value: 'MI', label: 'Umiarkowanie odwrotna (MI)' },
  { value: 'VI', label: 'Bardzo odwrotna (VI)' },
  { value: 'EI', label: 'Ekstremalnie odwrotna (EI)' },
  { value: 'STI', label: 'Krotkoczas. odwrotna (STI)' },
  { value: 'DT', label: 'Czas niezalezny (DT)' },
];
