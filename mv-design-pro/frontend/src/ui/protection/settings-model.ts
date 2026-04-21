/**
 * P16b — Protection Settings Model: SETPOINT vs COMPUTED
 *
 * CANONICAL ALIGNMENT:
 * - ANSI/IEEE C37.2: Device function numbers
 * - IEC 60255: Protection relay characteristics
 * - Canonical/CANONICAL parity: Settings representation
 *
 * ZASADA KLUCZOWA:
 * - SETPOINT = źródło prawdy (np. 3×In, 0.8×Un, 47.5 Hz)
 * - COMPUTED = wartość wyliczona z modelu (opcjonalna, np. 1509 A)
 *
 * NIGDY nie przechowuj wartości A/V jako źródła prawdy dla nastaw
 * wyrażonych jako wielokrotność In/Un.
 *
 * 100% POLISH UI
 */

// =============================================================================
// ANSI/IEEE C37.2 Device Function Numbers
// =============================================================================

/**
 * Kody funkcji zabezpieczeniowych zgodne z ANSI/IEEE C37.2.
 */
export type AnsiDeviceNumber =
  | '27'   // Undervoltage (U<)
  | '59'   // Overvoltage (U>)
  | '50'   // Instantaneous overcurrent (I>>)
  | '51'   // Time overcurrent (I>)
  | '50N'  // Instantaneous earth fault (Io>>)
  | '51N'  // Time earth fault (Io>)
  | '67'   // Directional overcurrent
  | '67N'  // Directional earth fault
  | '21'   // Distance
  | '87'   // Differential
  | '81U'  // Underfrequency (f<)
  | '81O'  // Overfrequency (f>)
  | '81R'  // Rate of change of frequency (df/dt)
  | '79'   // Reclosing (SPZ - Samoczynne Ponowne Załączenie)
  | '25'   // Synchrocheck
  | '32'   // Directional power
  | '46'   // Negative sequence current
  | '49'   // Thermal overload
  | '86'   // Lockout
  | '52'   // AC circuit breaker;

/**
 * Kody funkcji zabezpieczeniowych (wewnętrzne).
 */
export type ProtectionFunctionCode =
  | 'UNDERVOLTAGE'      // 27 U<
  | 'OVERVOLTAGE'       // 59 U>
  | 'OVERCURRENT_INST'  // 50 I>>
  | 'OVERCURRENT_TIME'  // 51 I>
  | 'EARTH_FAULT_INST'  // 50N Io>>
  | 'EARTH_FAULT_TIME'  // 51N Io>
  | 'UNDERFREQUENCY'    // 81U f<
  | 'OVERFREQUENCY'     // 81O f>
  | 'ROCOF'             // 81R df/dt
  | 'RECLOSING'         // 79 SPZ
  | 'DISTANCE'          // 21
  | 'DIFFERENTIAL'      // 87
  | 'DIRECTIONAL_OC'    // 67
  | 'SYNCHROCHECK'      // 25
  | 'THERMAL';          // 49

// =============================================================================
// Setpoint Basis Types
// =============================================================================

/**
 * Baza dla nastawy (źródło odniesienia).
 *
 * - UN: Napięcie znamionowe (np. 0.8×Un)
 * - IN: Prąd znamionowy (np. 3×In)
 * - HZ: Częstotliwość jako baza (50 Hz / 60 Hz)
 * - ABS: Wartość bezwzględna (np. 47.5 Hz, 2 Hz/s)
 */
export type ProtectionSetpointBasis = 'UN' | 'IN' | 'HZ' | 'ABS';

/**
 * Operator porównania dla nastawy.
 *
 * - LT: Less Than (<) - np. U<, f<
 * - GT: Greater Than (>) - np. I>, U>, f>
 * - GE: Greater or Equal (>=)
 * - LE: Less or Equal (<=)
 * - EQ: Equal (=) - rzadko używane
 */
export type ProtectionSetpointOperator = 'LT' | 'GT' | 'GE' | 'LE' | 'EQ';

/**
 * Jednostka nastawy.
 *
 * - 'pu': Per-unit (dla UN/IN basis)
 * - 'A', 'V', 'kV': Wartości bezwzględne (tylko dla ABS basis)
 * - 'Hz', 'Hz/s': Częstotliwość i pochodna
 * - 's': Czas (dla opóźnień)
 * - '%': Procent (np. dla 87 różnicowej)
 */
export type ProtectionSetpointUnit = 'pu' | 'A' | 'V' | 'kV' | 'Hz' | 'Hz/s' | 's' | '%';

/**
 * Nastawa zabezpieczenia — ŹRÓDŁO PRAWDY.
 *
 * Reprezentuje nastawę w formie normowej (np. 3×In, 0.8×Un, 47.5 Hz).
 * NIGDY nie przechowuje wartości A/V jako źródła prawdy dla nastaw ×In/×Un.
 *
 * @example
 * // I>> = 3×In
 * const setpoint: ProtectionSetpoint = {
 *   basis: 'IN',
 *   operator: 'GT',
 *   multiplier: 3.0,
 *   unit: 'pu',
 *   display_pl: '3×In',
 * };
 *
 * @example
 * // f< = 47.5 Hz
 * const setpoint: ProtectionSetpoint = {
 *   basis: 'ABS',
 *   operator: 'LT',
 *   abs_value: 47.5,
 *   unit: 'Hz',
 *   display_pl: '47,5 Hz',
 * };
 */
export interface ProtectionSetpoint {
  /** Baza odniesienia (UN/IN/HZ/ABS) */
  basis: ProtectionSetpointBasis;

  /** Operator porównania (LT/GT/GE/LE/EQ) */
  operator: ProtectionSetpointOperator;

  /**
   * Mnożnik dla basis UN/IN (np. 3.0 dla 3×In, 0.8 dla 0.8×Un).
   * WYMAGANY gdy basis = 'UN' | 'IN'.
   */
  multiplier?: number;

  /**
   * Wartość bezwzględna dla basis ABS (np. 47.5 dla 47.5 Hz).
   * WYMAGANY gdy basis = 'ABS'.
   */
  abs_value?: number;

  /**
   * Jednostka nastawy.
   * - Dla UN/IN: zawsze 'pu'
   * - Dla ABS: 'A', 'V', 'kV', 'Hz', 'Hz/s', '%'
   */
  unit: ProtectionSetpointUnit;

  /**
   * Kanoniczny zapis polski (do wyświetlenia).
   * Używa polskiego formatowania liczb (przecinek dziesiętny).
   *
   * Przykłady:
   * - "3×In"
   * - "0,8×Un"
   * - "47,5 Hz"
   * - "2 Hz/s"
   * - "30%"
   */
  display_pl: string;
}

// =============================================================================
// Computed Value Types
// =============================================================================

/**
 * Jednostka wartości obliczonej.
 */
export type ProtectionComputedUnit = 'A' | 'V' | 'kV' | 'Hz' | 'Hz/s';

/**
 * Wartość obliczona — OPCJONALNA, POCHODNA.
 *
 * Wartość w jednostkach fizycznych (A/V/kV) wyliczona z modelu.
 * ZAWSZE pochodzi z obliczeń, NIGDY nie jest źródłem prawdy.
 *
 * @example
 * // Dla I>> = 3×In, gdzie In = 503 A:
 * const computed: ProtectionComputedValue = {
 *   value: 1509,
 *   unit: 'A',
 *   computed_from: 'multiplier × In_primary (3.0 × 503 A)',
 * };
 */
export interface ProtectionComputedValue {
  /** Wartość obliczona */
  value: number;

  /** Jednostka wartości */
  unit: ProtectionComputedUnit;

  /**
   * Opis źródła obliczenia (dla audytu/debugowania).
   * WYMAGANY — bez tego nie wiadomo skąd wartość pochodzi.
   *
   * Przykłady:
   * - "multiplier × In_primary (3.0 × 503 A)"
   * - "multiplier × Un_lv (0.8 × 0.4 kV)"
   * - "fn_base = 50 Hz"
   */
  computed_from: string;
}

// =============================================================================
// Protection Function Summary
// =============================================================================

/**
 * Podsumowanie funkcji zabezpieczeniowej.
 *
 * Zawiera:
 * - setpoint: WYMAGANY — źródło prawdy nastawy
 * - computed: OPCJONALNY — wartość wyliczona z modelu
 */
export interface ProtectionFunctionSummary {
  /** Kod funkcji wewnętrzny */
  code: ProtectionFunctionCode;

  /** Numery ANSI/IEEE C37.2 */
  ansi: AnsiDeviceNumber[];

  /** Etykieta polska */
  label_pl: string;

  /** Nastawa — ŹRÓDŁO PRAWDY (wymagana) */
  setpoint: ProtectionSetpoint;

  /** Wartość obliczona — OPCJONALNA (jeśli dostępne In/Un/fn) */
  computed?: ProtectionComputedValue;

  /** Czas opóźnienia [s] */
  time_delay_s?: number;

  /** Charakterystyka czasowa (np. "IEC SI", "IEC VI", "ANSI EI") */
  curve_type?: string;

  /** Notatki (np. dla SPZ: parametry cyklu) */
  notes_pl?: string;
}

// =============================================================================
// Polish Labels & Mappings
// =============================================================================

/**
 * Mapowanie kodu funkcji na numery ANSI.
 */
export const FUNCTION_CODE_TO_ANSI: Record<ProtectionFunctionCode, AnsiDeviceNumber[]> = {
  UNDERVOLTAGE: ['27'],
  OVERVOLTAGE: ['59'],
  OVERCURRENT_INST: ['50'],
  OVERCURRENT_TIME: ['51'],
  EARTH_FAULT_INST: ['50N'],
  EARTH_FAULT_TIME: ['51N'],
  UNDERFREQUENCY: ['81U'],
  OVERFREQUENCY: ['81O'],
  ROCOF: ['81R'],
  RECLOSING: ['79'],
  DISTANCE: ['21'],
  DIFFERENTIAL: ['87'],
  DIRECTIONAL_OC: ['67'],
  SYNCHROCHECK: ['25'],
  THERMAL: ['49'],
};

/**
 * Etykiety polskie dla funkcji zabezpieczeniowych.
 */
export const FUNCTION_CODE_LABELS_PL: Record<ProtectionFunctionCode, string> = {
  UNDERVOLTAGE: 'Podnapięciowa (U<)',
  OVERVOLTAGE: 'Nadnapięciowa (U>)',
  OVERCURRENT_INST: 'Nadprądowa zwarciowa (I>>)',
  OVERCURRENT_TIME: 'Nadprądowa czasowa (I>)',
  EARTH_FAULT_INST: 'Ziemnozwarciowa zwarciowa (Io>>)',
  EARTH_FAULT_TIME: 'Ziemnozwarciowa czasowa (Io>)',
  UNDERFREQUENCY: 'Podczestotliwosciowa (f<)',
  OVERFREQUENCY: 'Nadczestotliwosciowa (f>)',
  ROCOF: 'Pochodna czestotliwosci (df/dt)',
  RECLOSING: 'SPZ (Samoczynne Ponowne Zalaczenie)',
  DISTANCE: 'Odleglosciowa',
  DIFFERENTIAL: 'Roznicowa',
  DIRECTIONAL_OC: 'Kierunkowa nadprądowa',
  SYNCHROCHECK: 'Kontrola synchronizmu',
  THERMAL: 'Przeciazeniowa termiczna',
};

/**
 * Etykiety polskie dla bazy nastawy.
 */
export const SETPOINT_BASIS_LABELS_PL: Record<ProtectionSetpointBasis, string> = {
  UN: 'Napięcie znamionowe (Un)',
  IN: 'Prąd znamionowy (In)',
  HZ: 'Częstotliwość bazowa (fn)',
  ABS: 'Wartość bezwzględna',
};

/**
 * Etykiety polskie dla operatorów.
 */
export const SETPOINT_OPERATOR_LABELS_PL: Record<ProtectionSetpointOperator, string> = {
  LT: 'mniejszy niż (<)',
  GT: 'większy niż (>)',
  GE: 'większy lub równy (>=)',
  LE: 'mniejszy lub równy (<=)',
  EQ: 'równy (=)',
};

// =============================================================================
// Builder Functions (helpers)
// =============================================================================

/**
 * Tworzy setpoint dla wielokrotności In.
 */
export function createInMultiplierSetpoint(
  multiplier: number,
  operator: ProtectionSetpointOperator = 'GT'
): ProtectionSetpoint {
  const displayMultiplier = multiplier.toLocaleString('pl-PL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return {
    basis: 'IN',
    operator,
    multiplier,
    unit: 'pu',
    display_pl: `${displayMultiplier}×In`,
  };
}

/**
 * Tworzy setpoint dla wielokrotności Un.
 */
export function createUnMultiplierSetpoint(
  multiplier: number,
  operator: ProtectionSetpointOperator = 'LT'
): ProtectionSetpoint {
  const displayMultiplier = multiplier.toLocaleString('pl-PL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return {
    basis: 'UN',
    operator,
    multiplier,
    unit: 'pu',
    display_pl: `${displayMultiplier}×Un`,
  };
}

/**
 * Tworzy setpoint dla wartości częstotliwości.
 */
export function createFrequencySetpoint(
  value: number,
  operator: ProtectionSetpointOperator
): ProtectionSetpoint {
  const displayValue = value.toLocaleString('pl-PL', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return {
    basis: 'ABS',
    operator,
    abs_value: value,
    unit: 'Hz',
    display_pl: `${displayValue} Hz`,
  };
}

/**
 * Tworzy setpoint dla df/dt (ROCOF).
 */
export function createRocofSetpoint(
  value: number,
  operator: ProtectionSetpointOperator = 'GT'
): ProtectionSetpoint {
  const displayValue = value.toLocaleString('pl-PL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
  return {
    basis: 'ABS',
    operator,
    abs_value: value,
    unit: 'Hz/s',
    display_pl: `${displayValue} Hz/s`,
  };
}

/**
 * Tworzy setpoint dla wartości procentowej (np. różnicowa).
 */
export function createPercentSetpoint(
  value: number,
  operator: ProtectionSetpointOperator = 'GT'
): ProtectionSetpoint {
  const displayValue = value.toLocaleString('pl-PL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return {
    basis: 'ABS',
    operator,
    abs_value: value,
    unit: '%',
    display_pl: `${displayValue}%`,
  };
}

/**
 * Oblicza wartość computed z setpoint i wartości bazowej.
 * Zwraca undefined jeśli baza nie jest dostępna.
 */
export function computeFromSetpoint(
  setpoint: ProtectionSetpoint,
  baseValue: number | undefined,
  baseUnit: ProtectionComputedUnit,
  baseDescription: string
): ProtectionComputedValue | undefined {
  if (baseValue === undefined) return undefined;

  if (setpoint.basis === 'ABS') {
    // Dla ABS nie ma przeliczenia, ale możemy zwrócić wartość
    if (setpoint.abs_value === undefined) return undefined;
    return {
      value: setpoint.abs_value,
      unit: baseUnit,
      computed_from: `wartosc bezwzgledna`,
    };
  }

  if (setpoint.multiplier === undefined) return undefined;

  const computedValue = setpoint.multiplier * baseValue;
  const multiplierStr = setpoint.multiplier.toLocaleString('pl-PL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  const baseValueStr = baseValue.toLocaleString('pl-PL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });

  return {
    value: computedValue,
    unit: baseUnit,
    computed_from: `${multiplierStr} × ${baseDescription} (${baseValueStr} ${baseUnit})`,
  };
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Błąd walidacji setpoint.
 */
export interface SetpointValidationError {
  code: 'INVALID_UNIT_FOR_BASIS' | 'MISSING_MULTIPLIER' | 'MISSING_ABS_VALUE' | 'COMPUTED_WITHOUT_SOURCE';
  message_pl: string;
}

/**
 * Waliduje setpoint — wykrywa nieprawidłowe kombinacje.
 *
 * Reguły:
 * 1. Dla basis UN/IN: unit musi być 'pu', multiplier wymagany
 * 2. Dla basis ABS: unit może być A/V/kV/Hz/Hz/s/%, abs_value wymagany
 * 3. Dla basis HZ: unit musi być 'Hz' lub 'pu'
 */
export function validateSetpoint(setpoint: ProtectionSetpoint): SetpointValidationError | null {
  // Reguła 1: UN/IN → unit = 'pu', multiplier required
  if (setpoint.basis === 'UN' || setpoint.basis === 'IN') {
    if (setpoint.unit !== 'pu') {
      return {
        code: 'INVALID_UNIT_FOR_BASIS',
        message_pl: `Dla bazy ${setpoint.basis} jednostka musi byc 'pu', otrzymano '${setpoint.unit}'`,
      };
    }
    if (setpoint.multiplier === undefined) {
      return {
        code: 'MISSING_MULTIPLIER',
        message_pl: `Dla bazy ${setpoint.basis} wymagany jest multiplier`,
      };
    }
  }

  // Reguła 2: ABS → abs_value required
  if (setpoint.basis === 'ABS') {
    if (setpoint.abs_value === undefined) {
      return {
        code: 'MISSING_ABS_VALUE',
        message_pl: `Dla bazy ABS wymagana jest wartosc abs_value`,
      };
    }
    // Dla ABS dozwolone jednostki: A, V, kV, Hz, Hz/s, %
    const allowedUnits: ProtectionSetpointUnit[] = ['A', 'V', 'kV', 'Hz', 'Hz/s', '%'];
    if (!allowedUnits.includes(setpoint.unit)) {
      return {
        code: 'INVALID_UNIT_FOR_BASIS',
        message_pl: `Dla bazy ABS dozwolone jednostki to: ${allowedUnits.join(', ')}`,
      };
    }
  }

  return null;
}

/**
 * Waliduje computed value — wymaga computed_from.
 */
export function validateComputed(computed: ProtectionComputedValue): SetpointValidationError | null {
  if (!computed.computed_from || computed.computed_from.trim() === '') {
    return {
      code: 'COMPUTED_WITHOUT_SOURCE',
      message_pl: `Wartosc computed musi miec wypelnione pole computed_from`,
    };
  }
  return null;
}

/**
 * Waliduje ProtectionFunctionSummary.
 */
export function validateFunctionSummary(summary: ProtectionFunctionSummary): SetpointValidationError[] {
  const errors: SetpointValidationError[] = [];

  const setpointError = validateSetpoint(summary.setpoint);
  if (setpointError) errors.push(setpointError);

  if (summary.computed) {
    const computedError = validateComputed(summary.computed);
    if (computedError) errors.push(computedError);
  }

  return errors;
}
