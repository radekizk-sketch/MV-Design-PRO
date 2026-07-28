/**
 * FIX-12 — Protection Coordination Types
 *
 * TypeScript types for protection coordination analysis.
 *
 * CANONICAL ALIGNMENT:
 * - Mirrors backend domain models
 * - 100% Polish UI labels
 * - READ-ONLY views of backend data
 *
 * UWAGA: Mapowanie werdyktów na komunikaty UI:
 * - PASS → "Zgodne"
 * - MARGINAL → "Na granicy dopuszczalności"
 * - FAIL → "Wymaga korekty"
 * - ERROR → "Wystąpił błąd"
 */

import {
  COORDINATION_VERDICT_UI_LABELS,
  COORDINATION_VERDICT_UI_DESCRIPTIONS,
  COORDINATION_VERDICT_UI_COLORS,
} from '../shared/verdict-messages';

// =============================================================================
// Enums and Constants
// =============================================================================

export type DeviceType = 'RELAY' | 'FUSE' | 'RECLOSER' | 'CIRCUIT_BREAKER';
export type CurveStandard = 'IEC' | 'IEEE' | 'FUSE';
export type CurveVariant = 'SI' | 'VI' | 'EI' | 'LTI' | 'DT' | 'MI' | 'STI';
export type CoordinationVerdict = 'PASS' | 'MARGINAL' | 'FAIL' | 'ERROR';

// =============================================================================
// Settings Types
// =============================================================================

export interface CurveSettings {
  standard: CurveStandard;
  variant: CurveVariant;
  pickup_current_a: number;
  time_multiplier: number;
  definite_time_s?: number;
}

export interface StageSettings {
  enabled: boolean;
  pickup_current_a: number;
  time_s?: number;
  curve_settings?: CurveSettings;
  directional: boolean;
}

export interface OvercurrentSettings {
  stage_51: StageSettings;
  stage_50?: StageSettings;
  stage_50_high?: StageSettings;
  stage_51n?: StageSettings;
  stage_50n?: StageSettings;
}

export interface ProtectionDevice {
  id: string;
  name: string;
  device_type: DeviceType;
  location_element_id: string;
  settings: OvercurrentSettings;
  manufacturer?: string;
  model?: string;
  location_description?: string;
  ct_ratio?: string;
  rated_current_a?: number;
}

// =============================================================================
// Currents Data
// =============================================================================

export interface FaultCurrentData {
  location_id: string;
  ik_max_3f_a: number;
  ik_min_3f_a: number;
  ik_max_2f_a?: number;
  ik_min_1f_a?: number;
}

export interface OperatingCurrentData {
  location_id: string;
  i_operating_a: number;
  i_max_operating_a?: number;
  loading_percent?: number;
}

// =============================================================================
// Check Results
// =============================================================================

export interface SensitivityCheck {
  device_id: string;
  i_fault_min_a: number;
  i_pickup_a: number;
  margin_percent: number;
  verdict: CoordinationVerdict;
  verdict_pl: string;
  notes_pl: string;
}

export interface SelectivityCheck {
  upstream_device_id: string;
  downstream_device_id: string;
  analysis_current_a: number;
  t_upstream_s: number;
  t_downstream_s: number;
  margin_s: number;
  required_margin_s: number;
  verdict: CoordinationVerdict;
  verdict_pl: string;
  notes_pl: string;
}

export interface OverloadCheck {
  device_id: string;
  i_operating_a: number;
  i_pickup_a: number;
  margin_percent: number;
  verdict: CoordinationVerdict;
  verdict_pl: string;
  notes_pl: string;
}

// =============================================================================
// TCC Types
// =============================================================================

export interface TCCPoint {
  current_a: number;
  current_multiple: number;
  time_s: number;
}

export interface TCCCurve {
  device_id: string;
  device_name: string;
  curve_type: string;
  pickup_current_a: number;
  time_multiplier: number;
  points: TCCPoint[];
  color: string;
}

export interface FaultMarker {
  id: string;
  label_pl: string;
  current_a: number;
  fault_type: string;
  location: string;
}

// =============================================================================
// Analysis Results
// =============================================================================

export interface CoordinationSummary {
  total_devices: number;
  total_checks: number;
  sensitivity: { pass: number; marginal: number; fail: number; error: number };
  selectivity: { pass: number; marginal: number; fail: number; error: number };
  overload: { pass: number; marginal: number; fail: number; error: number };
  overall_verdict: CoordinationVerdict;
  overall_verdict_pl: string;
}

export interface CoordinationResult {
  run_id: string;
  project_id: string;
  sensitivity_checks: SensitivityCheck[];
  selectivity_checks: SelectivityCheck[];
  overload_checks: OverloadCheck[];
  tcc_curves: TCCCurve[];
  fault_markers: FaultMarker[];
  overall_verdict: CoordinationVerdict;
  summary: CoordinationSummary;
  trace_steps: TraceStep[];
  pf_run_id?: string;
  sc_run_id?: string;
  created_at: string;
}

export interface TraceStep {
  step: string;
  description_pl: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
}

// =============================================================================
// API Request/Response
// =============================================================================

export interface RunCoordinationRequest {
  devices: ProtectionDevice[];
  fault_currents: FaultCurrentData[];
  operating_currents: OperatingCurrentData[];
  config?: CoordinationConfig;
  pf_run_id?: string;
  sc_run_id?: string;
}

export interface CoordinationConfig {
  breaker_time_s: number;
  relay_overtravel_s: number;
  safety_factor_s: number;
  sensitivity_margin_pass: number;
  sensitivity_margin_marginal: number;
  overload_margin_pass: number;
  overload_margin_marginal: number;
}

export interface CoordinationSummaryResponse {
  run_id: string;
  project_id: string;
  overall_verdict: CoordinationVerdict;
  overall_verdict_pl: string;
  total_devices: number;
  total_checks: number;
  sensitivity_pass: number;
  sensitivity_fail: number;
  selectivity_pass: number;
  selectivity_fail: number;
  overload_pass: number;
  overload_fail: number;
}

// =============================================================================
// Analysis Status Type
// =============================================================================

export type AnalysisStatus = 'IDLE' | 'RUNNING' | 'SUCCESS' | 'ERROR';

// =============================================================================
// Context Types (StudyCase/Snapshot/Run integration)
// =============================================================================

export interface AnalysisContext {
  projectId: string;
  caseId?: string;
  snapshotId?: string;
  runId?: string;
}

// =============================================================================
// Device Template Type
// =============================================================================

export interface DeviceTemplate {
  id: string;
  name: string;
  description_pl: string;
  device_type: DeviceType;
  settings: OvercurrentSettings;
}

// =============================================================================
// Polish Labels (100% PL, Canonical parity)
// =============================================================================

export const LABELS = {
  title: 'Koordynacja zabezpieczeń nadprądowych',
  subtitle: 'Analiza czułości, selektywności i przeciążalności',

  devices: {
    title: 'Urządzenia zabezpieczeniowe',
    add: 'Dodaj urządzenie',
    remove: 'Usuń',
    clone: 'Klonuj',
    applyTemplate: 'Zastosuj szablon',
    name: 'Nazwa',
    type: 'Typ',
    location: 'Lokalizacja',
    settings: 'Nastawy',
    noDevices: 'Dodaj urządzenia zabezpieczeniowe',
    selectToEdit: 'Wybierz urządzenie do edycji',
  },

  settings: {
    title: 'Nastawy zabezpieczenia',
    stage51: 'Stopień I> (51)',
    stage50: 'Stopień I>> (50)',
    stage50high: 'Stopień I>>> (50 high-set)',
    stage51n: 'Stopień I0> (51N)',
    stage50n: 'Stopień I0>> (50N)',
    pickup: 'Prąd rozruchowy [A]',
    tms: 'Mnożnik czasowy TMS',
    time: 'Czas [s]',
    curve: 'Charakterystyka',
    standard: 'Norma',
    directional: 'Kierunkowy',
    enabled: 'Aktywny',
    manufacturer: 'Producent',
    model: 'Model',
    ctRatio: 'Przekładnik prądowy',
    ratedCurrent: 'Prąd znamionowy [A]',
  },

  context: {
    title: 'Kontekst analizy',
    project: 'Projekt',
    studyCase: 'Wariant pracy',
    snapshot: 'Stan modelu',
    run: 'Przebieg analizy',
    noContext: 'Wybierz kontekst',
    selectCase: 'Wybierz wariant pracy',
    selectSnapshot: 'Wybierz stan modelu',
  },

  checks: {
    sensitivity: {
      title: 'Czułość',
      subtitle: 'Sprawdzenie czy zabezpieczenie zadziała dla I_min (zgodnie z IEC 60909)',
      description: 'Weryfikacja działania zabezpieczenia przy minimalnym prądzie zwarciowym',
      iFaultMin: 'I_min zwarcia [A]',
      iPickup: 'I_pickup [A]',
      margin: 'Margines [%]',
      device: 'Urządzenie',
      notes: 'Uwagi',
    },
    selectivity: {
      title: 'Selektywność',
      subtitle: 'Sprawdzenie stopniowania czasowego (zgodnie z IEC 60255)',
      description: 'Weryfikacja prawidłowego stopniowania czasowego pomiędzy zabezpieczeniami',
      downstream: 'Podrzędne',
      upstream: 'Nadrzędne',
      tDownstream: 't_pod [s]',
      tUpstream: 't_nad [s]',
      deltaT: 'Δt [s]',
      requiredMargin: 'Wymagany margines [s]',
      analysisCurrent: 'Prąd analizy [A]',
      notes: 'Uwagi',
      minDevicesRequired: 'Wymaga minimum 2 urządzeń do sprawdzenia selektywności',
      // Kolumna DZIALANIA (V12K-261). Do tej pory naprawa byla dostepna wylacznie
      // przez KLIK W WIERSZ — bez etykiety, bez przycisku, bez informacji, ze cokolwiek
      // sie stanie. Werdykt bez widocznego nastepnego kroku jest slepym zaulkiem
      // (FLOW §0.2), a niewidoczna akcja to martwy klik z perspektywy projektanta.
      action: 'Działanie',
      fixSettings: 'Popraw nastawy',
      fixSettingsTitle:
        'Otwórz edytor nastaw zabezpieczenia NADRZĘDNEGO tej pary. Przy braku '
        + 'selektywności koryguje się czas zabezpieczenia rezerwowego — podrzędne ma '
        + 'zadziałać pierwsze (stopniowanie CTI).',
    },
    overload: {
      title: 'Przeciążalność',
      subtitle: 'Sprawdzenie czy nie zadziała dla I_roboczego (zgodnie z IEC 60255)',
      description: 'Weryfikacja braku zadziałania przy normalnym prądzie roboczym',
      iOperating: 'I_robocze [A]',
      iPickup: 'I_pickup [A]',
      margin: 'Margines [%]',
      device: 'Urządzenie',
      notes: 'Uwagi',
    },
  },

  tcc: {
    title: 'Wykres czasowo-prądowy (TCC)',
    subtitle: 'Charakterystyki zabezpieczeń w układzie log-log',
    xAxis: 'Prąd [A]',
    yAxis: 'Czas [s]',
    noData: 'Brak danych wykresu',
    curve: 'Krzywa',
    tripTime: 'Czas wyłączenia',
    faultCurrent: 'Prąd zwarciowy',
    operatingCurrent: 'Prąd roboczy',
    selectivityMargin: 'Margines selektywności',
    legend: 'Legenda',
    zoomIn: 'Przybliż',
    zoomOut: 'Oddal',
    resetView: 'Resetuj widok',
  },

  trace: {
    title: 'Ślad obliczeń',
    subtitle: 'Wszystkie kroki obliczeń do audytu',
    step: 'Krok',
    description: 'Opis',
    inputs: 'Wejścia',
    outputs: 'Wyjścia',
    noSteps: 'Brak kroków obliczeniowych',
    timestamp: 'Znacznik czasu',
    expandAll: 'Rozwiń wszystkie',
    collapseAll: 'Zwiń wszystkie',
  },

  /**
   * Etykiety werdyktów UI — przyjazne dla użytkownika.
   * Mapowanie: PASS → "Zgodne", MARGINAL → "Na granicy dopuszczalności",
   * FAIL → "Wymaga korekty", ERROR → "Wystąpił błąd"
   */
  verdict: COORDINATION_VERDICT_UI_LABELS,

  /**
   * Opisy werdyktów UI — techniczne, bez wyrokowego charakteru.
   */
  verdictVerbose: COORDINATION_VERDICT_UI_DESCRIPTIONS,

  deviceTypes: {
    RELAY: 'Przekaźnik nadprądowy',
    FUSE: 'Bezpiecznik',
    RECLOSER: 'Wyłącznik samoczynny',
    CIRCUIT_BREAKER: 'Wyłącznik z wyzwalaczem',
  },

  curveStandards: {
    IEC: 'IEC 60255',
    IEEE: 'IEEE C37.112',
    FUSE: 'Bezpiecznik',
  },

  curveTypes: {
    SI: 'Normalna odwrotna (SI)',
    VI: 'Bardzo odwrotna (VI)',
    EI: 'Ekstremalnie odwrotna (EI)',
    LTI: 'Długoczasowa odwrotna (LTI)',
    DT: 'Czas niezależny (DT)',
    MI: 'Umiarkowanie odwrotna (MI)',
    STI: 'Krótkoczasowa odwrotna (STI)',
  },

  actions: {
    run: 'Wykonaj analizę',
    runAnalysis: 'Wykonaj analizę koordynacji',
    export: 'Eksportuj',
    exportPdf: 'Eksportuj PDF',
    exportDocx: 'Eksportuj DOCX',
    refresh: 'Odśwież',
    save: 'Zapisz konfigurację',
    cancel: 'Anuluj',
    apply: 'Zastosuj',
    reset: 'Resetuj',
    close: 'Zamknij',
  },

  status: {
    idle: 'Gotowe do analizy',
    loading: 'Ładowanie...',
    running: 'Trwa analiza...',
    success: 'Analiza zakończona',
    error: 'Błąd analizy',
  },

  tabs: {
    summary: 'Podsumowanie',
    sensitivity: 'Czułość',
    selectivity: 'Selektywność',
    overload: 'Przeciążalność',
    tcc: 'Wykres TCC',
    trace: 'Ślad obliczeń',
  },

  summary: {
    title: 'Wynik analizy',
    overallVerdict: 'Werdykt ogólny',
    totalDevices: 'Liczba urządzeń',
    totalChecks: 'Liczba sprawdzeń',
    passCount: 'prawidłowych',
    failCount: 'błędnych',
    marginalCount: 'granicznych',
  },

  validation: {
    pickupPositive: 'Prąd rozruchowy musi być dodatni',
    tmsRange: 'TMS musi być w zakresie 0.05-10.0',
    timePositive: 'Czas musi być dodatni',
    minOneDevice: 'Dodaj przynajmniej jedno urządzenie',
    invalidConfig: 'Nieprawidłowa konfiguracja',
    // F-K4 faza 3b: prądy koordynacji pochodzą WYŁĄCZNIE z zakończonych biegów
    // (wcześniej powstawały z Math.random() — patrz `pradyZBiegow.ts`).
    brakPradowZwarciowych:
      'Brak prądów zwarciowych z biegu obliczeniowego — koordynacja nie ma na czym oprzeć '
      + 'marginesów. Uruchom analizę zwarciową dla przypadku maksymalnego (c = 1,10) '
      + 'i minimalnego (c = 0,95).',
    brakPraduMinimalnego:
      'Brak biegu zwarciowego minimalnego (c = 0,95) — czułość zabezpieczeń jest '
      + 'niesprawdzalna. Prąd maksymalny nie zastąpi minimalnego.',
    brakPraduRoboczego:
      'Brak prądu roboczego z rozpływu mocy — kryterium przeciążenia jest niesprawdzalne.',
  },

  templates: {
    title: 'Szablony urządzeń',
    apply: 'Zastosuj szablon',
    noTemplates: 'Brak dostępnych szablonów',
    relay50_51: 'Przekaźnik 50/51 (typowy)',
    relay50_51n: 'Przekaźnik 50/51N (z ziemnozwarciem)',
    fuse: 'Bezpiecznik SN',
    recloser: 'Wyłącznik samoczynny',
  },
} as const;

// =============================================================================
// Verdict Styling
// =============================================================================

/**
 * Kolory werdyktów UI — łagodniejsze tony dla "Wymaga korekty" (orange zamiast rose).
 */
export const VERDICT_STYLES: Record<
  CoordinationVerdict,
  { bg: string; text: string; border: string }
> = COORDINATION_VERDICT_UI_COLORS;

// =============================================================================
// Default Values
// =============================================================================

export const DEFAULT_CONFIG: CoordinationConfig = {
  breaker_time_s: 0.05,
  relay_overtravel_s: 0.05,
  safety_factor_s: 0.1,
  sensitivity_margin_pass: 1.5,
  sensitivity_margin_marginal: 1.2,
  overload_margin_pass: 1.2,
  overload_margin_marginal: 1.1,
};

export const DEFAULT_CURVE_SETTINGS: CurveSettings = {
  standard: 'IEC',
  variant: 'SI',
  pickup_current_a: 400,
  time_multiplier: 0.3,
};

export const DEFAULT_STAGE_51: StageSettings = {
  enabled: true,
  pickup_current_a: 400,
  curve_settings: DEFAULT_CURVE_SETTINGS,
  directional: false,
};

export const DEFAULT_STAGE_50: StageSettings = {
  enabled: true,
  pickup_current_a: 2000,
  time_s: 0.1,
  directional: false,
};

// =============================================================================
// Device Templates (Canonical-style presets)
// =============================================================================

export const DEVICE_TEMPLATES: DeviceTemplate[] = [
  {
    id: 'relay-50-51',
    name: 'Przekaznik 50/51 (typowy)',
    description_pl: 'Standardowy przekaznik nadpradowy z funkcja 50 i 51',
    device_type: 'RELAY',
    settings: {
      stage_51: {
        enabled: true,
        pickup_current_a: 400,
        curve_settings: {
          standard: 'IEC',
          variant: 'SI',
          pickup_current_a: 400,
          time_multiplier: 0.3,
        },
        directional: false,
      },
      stage_50: {
        enabled: true,
        pickup_current_a: 2000,
        time_s: 0.1,
        directional: false,
      },
    },
  },
  {
    id: 'relay-50-51-51n',
    name: 'Przekaznik 50/51/51N',
    description_pl: 'Przekaznik z zabezpieczeniem ziemnozwarciowym',
    device_type: 'RELAY',
    settings: {
      stage_51: {
        enabled: true,
        pickup_current_a: 400,
        curve_settings: {
          standard: 'IEC',
          variant: 'SI',
          pickup_current_a: 400,
          time_multiplier: 0.3,
        },
        directional: false,
      },
      stage_50: {
        enabled: true,
        pickup_current_a: 2000,
        time_s: 0.1,
        directional: false,
      },
      stage_51n: {
        enabled: true,
        pickup_current_a: 100,
        curve_settings: {
          standard: 'IEC',
          variant: 'SI',
          pickup_current_a: 100,
          time_multiplier: 0.2,
        },
        directional: false,
      },
    },
  },
  {
    id: 'fuse-mv',
    name: 'Bezpiecznik SN',
    description_pl: 'Bezpiecznik sredniego napiecia',
    device_type: 'FUSE',
    settings: {
      stage_51: {
        enabled: true,
        pickup_current_a: 100,
        curve_settings: {
          standard: 'FUSE',
          variant: 'EI',
          pickup_current_a: 100,
          time_multiplier: 1.0,
        },
        directional: false,
      },
    },
  },
  {
    id: 'recloser',
    name: 'Wylacznik samoczynny',
    description_pl: 'Reklozer z charakterystyka szybka i wolna',
    device_type: 'RECLOSER',
    settings: {
      stage_51: {
        enabled: true,
        pickup_current_a: 300,
        curve_settings: {
          standard: 'IEC',
          variant: 'VI',
          pickup_current_a: 300,
          time_multiplier: 0.2,
        },
        directional: false,
      },
      stage_50: {
        enabled: true,
        pickup_current_a: 1500,
        time_s: 0.05,
        directional: false,
      },
    },
  },
  {
    id: 'circuit-breaker',
    name: 'Wylacznik z wyzwalaczem',
    description_pl: 'Wylacznik mocy z wyzwalaczem nadpradowym',
    device_type: 'CIRCUIT_BREAKER',
    settings: {
      stage_51: {
        enabled: true,
        pickup_current_a: 500,
        curve_settings: {
          standard: 'IEC',
          variant: 'SI',
          pickup_current_a: 500,
          time_multiplier: 0.4,
        },
        directional: false,
      },
      stage_50: {
        enabled: true,
        pickup_current_a: 3000,
        time_s: 0.08,
        directional: false,
      },
      stage_50_high: {
        enabled: true,
        pickup_current_a: 10000,
        time_s: 0.02,
        directional: false,
      },
    },
  },
];
