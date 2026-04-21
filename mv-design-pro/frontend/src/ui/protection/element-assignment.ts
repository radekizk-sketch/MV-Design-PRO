/**
 * P16a — Protection Element Assignment Contract (READ-ONLY)
 *
 * CANONICAL ALIGNMENT:
 * - sld_rules.md § A: Bijection Symbol ↔ Model Object
 * - ui_canonical_parity.md: Canonical-like protection visualization
 *
 * KONTRAKT DANYCH:
 * Definiuje strukturę przypisania urządzeń zabezpieczeniowych do elementów SLD.
 * Umożliwia wizualizację zabezpieczeń na schemacie bez uruchamiania solverów.
 *
 * WYMAGANIA:
 * - Dane muszą być dostępne statycznie (bez analizy)
 * - Jedno urządzenie może chronić wiele elementów
 * - Jeden element może mieć wiele urządzeń (np. I>, I>>)
 *
 * STATUS: KONTRAKT (nie zaimplementowany)
 * Implementacja wymaga rozszerzenia modelu NetworkModel lub osobnego store.
 */

import type { ElementType } from '../types';

// =============================================================================
// Element Protection Assignment Types
// =============================================================================

/**
 * Typ urządzenia zabezpieczeniowego (zgodny z Canonical).
 */
export type ProtectionDeviceKind =
  | 'RELAY_OVERCURRENT' // Przekaźnik nadprądowy (I>, I>>)
  | 'RELAY_DISTANCE' // Przekaźnik odległościowy
  | 'RELAY_DIFFERENTIAL' // Przekaźnik różnicowy
  | 'RELAY_EARTH_FAULT' // Przekaźnik ziemnozwarciowy (Io>)
  | 'FUSE' // Bezpiecznik
  | 'RECLOSER' // Reklozer
  | 'SECTIONALIZER' // Sekcjonalizer
  | 'OTHER'; // Inny

/**
 * Stan urządzenia zabezpieczeniowego.
 */
export type ProtectionDeviceStatus =
  | 'ACTIVE' // Aktywne (w pracy)
  | 'BLOCKED' // Zablokowane
  | 'TEST' // Tryb testowy
  | 'UNKNOWN'; // Nieznany

/**
 * Przypisanie urządzenia zabezpieczeniowego do elementu.
 * Reprezentuje relację: element sieci ← urządzenie zabezpieczeniowe.
 */
export interface ElementProtectionAssignment {
  /** ID elementu sieci (bijection z SldSymbol.elementId) */
  element_id: string;

  /** Typ elementu (Switch, LineBranch, TransformerBranch, etc.) */
  element_type: ElementType;

  /** ID urządzenia zabezpieczeniowego (referencja do ProtectionDeviceType) */
  device_id: string;

  /** Nazwa urządzenia (dla wyświetlania) */
  device_name_pl: string;

  /** Typ urządzenia */
  device_kind: ProtectionDeviceKind;

  /** Stan urządzenia */
  status: ProtectionDeviceStatus;

  /** Kluczowe nastawy (read-only, dla tooltipa) */
  settings_summary?: ProtectionSettingsSummary;
}

/**
 * Podsumowanie nastaw zabezpieczenia (read-only).
 *
 * NOWY MODEL (P16b):
 * - Nastawy jako funkcje z setpoint (źródło prawdy)
 * - Computed (A/V) tylko gdy dostępne dane bazowe
 *
 * @see settings-model.ts dla typów ProtectionFunctionSummary
 */
export interface ProtectionSettingsSummary {
  /** Lista funkcji zabezpieczeniowych (nowy model setpoint/computed) */
  functions: import('./settings-model').ProtectionFunctionSummary[];

  /** Charakterystyka czasowa (np. "IEC SI", "IEC VI", "ANSI EI") */
  curve_type?: string;

  /**
   * Dane bazowe z modelu (opcjonalne).
   * Jeśli dostępne, pozwalają obliczyć wartości computed.
   */
  base_values?: {
    /** Prąd znamionowy [A] */
    i_rated_a?: number;
    /** Napięcie znamionowe [kV] */
    u_rated_kv?: number;
    /** Częstotliwość bazowa [Hz] */
    f_rated_hz?: number;
  };
}

// =============================================================================
// SLD Symbol Extension (kontrakt rozszerzenia)
// =============================================================================

/**
 * Rozszerzenie symbolu SLD o dane zabezpieczeń.
 * UWAGA: To jest KONTRAKT - SldSymbol jeszcze nie ma tego pola.
 *
 * Proponowane rozszerzenie:
 * ```typescript
 * interface SldSymbol {
 *   ...
 *   // Opcjonalne referencje do urządzeń zabezpieczeniowych
 *   protectionDeviceRefs?: string[];
 * }
 * ```
 */
export interface SldSymbolProtectionExtension {
  /** ID symbolu (pasuje do SldSymbol.id) */
  symbol_id: string;

  /** Przypisane urządzenia zabezpieczeniowe */
  protection_device_refs: string[];
}

// =============================================================================
// Adapter Interface (kontrakt adaptera)
// =============================================================================

/**
 * Interfejs adaptera do pobierania przypisań zabezpieczeń.
 * UWAGA: To jest KONTRAKT - adapter nie jest jeszcze zaimplementowany.
 *
 * Implementacja może:
 * - Pobierać z NetworkModel (jeśli model zostanie rozszerzony)
 * - Pobierać z osobnego store
 * - Pobierać z API (jeśli backend dostarczy endpoint)
 */
export interface ProtectionAssignmentAdapter {
  /**
   * Pobierz wszystkie przypisania dla projektu/diagramu.
   */
  getAssignments(projectId: string, diagramId: string): Promise<ElementProtectionAssignment[]>;

  /**
   * Pobierz przypisania dla konkretnego elementu.
   */
  getAssignmentsForElement(elementId: string): Promise<ElementProtectionAssignment[]>;

  /**
   * Sprawdź czy element ma przypisane zabezpieczenia.
   */
  hasProtection(elementId: string): Promise<boolean>;
}

// =============================================================================
// Polish Labels (100% PL)
// =============================================================================

export const PROTECTION_DEVICE_KIND_LABELS: Record<ProtectionDeviceKind, string> = {
  RELAY_OVERCURRENT: 'Przekaźnik nadprądowy',
  RELAY_DISTANCE: 'Przekaźnik odległościowy',
  RELAY_DIFFERENTIAL: 'Przekaźnik różnicowy',
  RELAY_EARTH_FAULT: 'Przekaźnik ziemnozwarciowy',
  FUSE: 'Bezpiecznik',
  RECLOSER: 'Reklozer',
  SECTIONALIZER: 'Sekcjonalizer',
  OTHER: 'Inny',
};

export const PROTECTION_STATUS_LABELS: Record<ProtectionDeviceStatus, string> = {
  ACTIVE: 'Aktywne',
  BLOCKED: 'Zablokowane',
  TEST: 'Tryb testowy',
  UNKNOWN: 'Nieznany',
};

export const PROTECTION_STATUS_COLORS: Record<ProtectionDeviceStatus, string> = {
  ACTIVE: 'text-emerald-600 bg-emerald-50',
  BLOCKED: 'text-rose-600 bg-rose-50',
  TEST: 'text-amber-600 bg-amber-50',
  UNKNOWN: 'text-gray-600 bg-gray-50',
};

// =============================================================================
// Fixture Data (dla testów i mockowania)
// =============================================================================

import {
  createInMultiplierSetpoint,
  createUnMultiplierSetpoint,
  createFrequencySetpoint,
  createRocofSetpoint,
  createPercentSetpoint,
  computeFromSetpoint,
  type ProtectionFunctionSummary,
} from './settings-model';

/**
 * Przykładowe dane fixture do testów UI.
 *
 * ZASADA P16b:
 * - Nastawy jako setpoint (źródło prawdy): np. "3×In", "0,8×Un"
 * - Computed tylko gdy dostępne base_values (np. In = 503 A → I>> = 1509 A)
 * - BRAK hardcoded wartości A/V jako źródła prawdy
 */
export const PROTECTION_ASSIGNMENT_FIXTURES: ElementProtectionAssignment[] = [
  {
    element_id: 'switch-001',
    element_type: 'Switch',
    device_id: 'relay-oc-001',
    device_name_pl: 'Przekaźnik nadprądowy (F1)',
    device_kind: 'RELAY_OVERCURRENT',
    status: 'ACTIVE',
    settings_summary: {
      functions: [
        // I> (51) = 1.2×In, T=1.0 s
        {
          code: 'OVERCURRENT_TIME',
          ansi: ['51'],
          label_pl: 'Nadprądowa czasowa (I>)',
          setpoint: createInMultiplierSetpoint(1.2, 'GT'),
          time_delay_s: 1.0,
          curve_type: 'IEC SI',
          // computed: brak — bo nie ma base_values.i_rated_a
        },
        // I>> (50) = 3×In, T=0.1 s
        {
          code: 'OVERCURRENT_INST',
          ansi: ['50'],
          label_pl: 'Nadprądowa zwarciowa (I>>)',
          setpoint: createInMultiplierSetpoint(3.0, 'GT'),
          time_delay_s: 0.1,
          // computed: brak — bo nie ma base_values.i_rated_a
        },
      ],
      curve_type: 'IEC SI',
      // base_values: brak — więc computed nie jest obliczane
    },
  },
  {
    element_id: 'switch-002',
    element_type: 'Switch',
    device_id: 'relay-oc-002',
    device_name_pl: 'Przekaźnik nadprądowy (F2)',
    device_kind: 'RELAY_OVERCURRENT',
    status: 'ACTIVE',
    settings_summary: {
      functions: createOvercurrentFunctionsWithComputed(503), // In = 503 A
      curve_type: 'IEC SI',
      base_values: {
        i_rated_a: 503,
        u_rated_kv: 15,
        f_rated_hz: 50,
      },
    },
  },
  {
    element_id: 'trafo-001',
    element_type: 'TransformerBranch',
    device_id: 'relay-diff-001',
    device_name_pl: 'Przekaźnik różnicowy (T1)',
    device_kind: 'RELAY_DIFFERENTIAL',
    status: 'ACTIVE',
    settings_summary: {
      functions: [
        // 87 różnicowa = 30%
        {
          code: 'DIFFERENTIAL',
          ansi: ['87'],
          label_pl: 'Roznicowa',
          setpoint: createPercentSetpoint(30, 'GT'),
          time_delay_s: 0,
        },
      ],
    },
  },
  {
    element_id: 'connection_node-001',
    element_type: 'Bus',
    device_id: 'relay-freq-001',
    device_name_pl: 'Zabezpieczenie czestotliwosciowe (BoundaryNode)',
    device_kind: 'RELAY_OVERCURRENT', // tu powinno być inne, ale na potrzeby fixture
    status: 'ACTIVE',
    settings_summary: {
      functions: [
        // U< (27) = 0.8×Un, T=5 s
        {
          code: 'UNDERVOLTAGE',
          ansi: ['27'],
          label_pl: 'Podnapięciowa (U<)',
          setpoint: createUnMultiplierSetpoint(0.8, 'LT'),
          time_delay_s: 5.0,
        },
        // U> (59) = 1.15×Un, T=0.3 s
        {
          code: 'OVERVOLTAGE',
          ansi: ['59'],
          label_pl: 'Nadnapięciowa (U>)',
          setpoint: createUnMultiplierSetpoint(1.15, 'GT'),
          time_delay_s: 0.3,
        },
        // f< (81U) = 47.5 Hz, T=0.3 s
        {
          code: 'UNDERFREQUENCY',
          ansi: ['81U'],
          label_pl: 'Podczestotliwosciowa (f<)',
          setpoint: createFrequencySetpoint(47.5, 'LT'),
          time_delay_s: 0.3,
        },
        // f> (81O) = 51.5 Hz, T=0.3 s
        {
          code: 'OVERFREQUENCY',
          ansi: ['81O'],
          label_pl: 'Nadczestotliwosciowa (f>)',
          setpoint: createFrequencySetpoint(51.5, 'GT'),
          time_delay_s: 0.3,
        },
        // df/dt (81R) = 2 Hz/s, T=0.3 s
        {
          code: 'ROCOF',
          ansi: ['81R'],
          label_pl: 'Pochodna czestotliwosci (df/dt)',
          setpoint: createRocofSetpoint(2.0, 'GT'),
          time_delay_s: 0.3,
        },
        // SPZ (79)
        {
          code: 'RECLOSING',
          ansi: ['79'],
          label_pl: 'SPZ (Samoczynne Ponowne Zalaczenie)',
          setpoint: {
            basis: 'ABS',
            operator: 'EQ',
            abs_value: 1,
            unit: 'pu',
            display_pl: 'Wlaczone',
          },
          time_delay_s: 600,
          notes_pl: 'Cykl: 1×SPZ, przerwa 0.5s, blokada po 2 probach',
        },
      ],
      base_values: {
        u_rated_kv: 15,
        f_rated_hz: 50,
      },
    },
  },
  {
    element_id: 'line-001',
    element_type: 'LineBranch',
    device_id: 'relay-dist-001',
    device_name_pl: 'Przekaźnik odległościowy (L1)',
    device_kind: 'RELAY_DISTANCE',
    status: 'BLOCKED',
    // brak settings_summary — urządzenie zablokowane
  },
];

/**
 * Helper: tworzy funkcje nadprądowe z computed (gdy In jest znane).
 */
function createOvercurrentFunctionsWithComputed(i_rated_a: number): ProtectionFunctionSummary[] {
  const setpointTime = createInMultiplierSetpoint(1.2, 'GT');
  const setpointInst = createInMultiplierSetpoint(3.0, 'GT');

  return [
    {
      code: 'OVERCURRENT_TIME',
      ansi: ['51'],
      label_pl: 'Nadprądowa czasowa (I>)',
      setpoint: setpointTime,
      computed: computeFromSetpoint(setpointTime, i_rated_a, 'A', 'In'),
      time_delay_s: 1.0,
      curve_type: 'IEC SI',
    },
    {
      code: 'OVERCURRENT_INST',
      ansi: ['50'],
      label_pl: 'Nadprądowa zwarciowa (I>>)',
      setpoint: setpointInst,
      computed: computeFromSetpoint(setpointInst, i_rated_a, 'A', 'In'),
      time_delay_s: 0.1,
    },
  ];
}
