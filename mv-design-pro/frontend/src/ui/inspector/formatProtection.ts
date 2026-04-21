/**
 * P16c — Protection Function Formatting (PF/CANONICAL parity)
 *
 * CANONICAL ALIGNMENT:
 * - ANSI/IEEE C37.2: Device function numbers
 * - Canonical/CANONICAL: Protection visualization style
 * - ui_canonical_parity.md: UI consistency with PF
 *
 * FORMAT:
 * - "50 I>>: 3×In (≈ 1509 A), T=0,1 s"
 * - "51 I>: 1,2×In, T=1,0 s"
 * - "27 U<: 0,8×Un, T=5 s"
 * - "81U f<: 47,5 Hz, T=0,3 s"
 *
 * 100% POLISH UI
 */

import type { AnsiDeviceNumber, ProtectionFunctionSummary } from '../protection/settings-model';

// =============================================================================
// ANSI to Shortcut Mapping (PF/CANONICAL style)
// =============================================================================

/**
 * Mapowanie numerow ANSI na skroty PF/CANONICAL.
 */
export const ANSI_TO_SHORTCUT: Record<AnsiDeviceNumber, string> = {
  '27': 'U<',
  '59': 'U>',
  '50': 'I>>',
  '51': 'I>',
  '50N': 'Io>>',
  '51N': 'Io>',
  '67': 'I>→',
  '67N': 'Io>→',
  '21': 'Z<',
  '87': 'Id>',
  '81U': 'f<',
  '81O': 'f>',
  '81R': 'df/dt',
  '79': 'SPZ',
  '25': 'SYNC',
  '32': 'P→',
  '46': 'I2>',
  '49': 'Θ>',
  '86': 'LOR',
  '52': 'CB',
};

// =============================================================================
// Formatting Functions
// =============================================================================

/**
 * Formatuje numery ANSI dla wyswietlenia.
 * Dla wielu numerow laczy je znakiem '+'.
 *
 * @example
 * formatAnsiCodes(['50']) // => "50"
 * formatAnsiCodes(['27', '81U']) // => "27+81U"
 */
export function formatAnsiCodes(ansi: AnsiDeviceNumber[]): string {
  if (ansi.length === 0) return '';
  return ansi.join('+');
}

/**
 * Pobiera skrot funkcji dla numerow ANSI.
 * Dla pierwszego numeru zwraca skrot.
 *
 * @example
 * getShortcutForAnsi(['50']) // => "I>>"
 * getShortcutForAnsi(['27']) // => "U<"
 */
export function getShortcutForAnsi(ansi: AnsiDeviceNumber[]): string {
  if (ansi.length === 0) return '';
  const primary = ansi[0];
  return ANSI_TO_SHORTCUT[primary] ?? primary;
}

/**
 * Formatuje wartosc liczbowa w stylu polskim (przecinek jako separator).
 *
 * @example
 * formatNumberPl(1509.5, 0) // => "1510"
 * formatNumberPl(0.1, 1) // => "0,1"
 */
export function formatNumberPl(
  value: number,
  maxFractionDigits: number = 1,
  minFractionDigits: number = 0
): string {
  return value.toLocaleString('pl-PL', {
    minimumFractionDigits: minFractionDigits,
    maximumFractionDigits: maxFractionDigits,
  });
}

/**
 * Formatuje czas opoznienia w stylu polskim.
 *
 * @example
 * formatTimeDelay(0.1) // => "T=0,1 s"
 * formatTimeDelay(5) // => "T=5 s"
 */
export function formatTimeDelay(time_s: number): string {
  const formatted = formatNumberPl(time_s, 1);
  return `T=${formatted} s`;
}

/**
 * Formatuje wartosc computed dla wyswietlenia.
 *
 * @example
 * formatComputedDisplay(1509, 'A') // => "≈ 1509 A"
 * formatComputedDisplay(12.5, 'kV') // => "≈ 12,5 kV"
 */
export function formatComputedDisplay(value: number, unit: string): string {
  const formatted = formatNumberPl(value, 1);
  return `≈ ${formatted} ${unit}`;
}

// =============================================================================
// Main Formatting Function
// =============================================================================

/**
 * Wynik formatowania funkcji zabezpieczeniowej.
 */
export interface FormattedProtectionFunction {
  /** Pelen tekst linii: "50 I>>: 3×In (≈ 1509 A), T=0,1 s" */
  fullLine: string;

  /** Kody ANSI: "50" lub "27+81U" */
  ansiCodes: string;

  /** Skrot funkcji: "I>>" */
  shortcut: string;

  /** Nastawa: "3×In" */
  setpoint: string;

  /** Computed (opcjonalnie): "(≈ 1509 A)" lub null */
  computed: string | null;

  /** Czas (opcjonalnie): "T=0,1 s" lub null */
  time: string | null;

  /** Notatki (opcjonalnie) */
  notes: string | null;

  /** Test ID: "protection-func-50-OVERCURRENT_INST" */
  testId: string;
}

/**
 * Formatuje funkcje zabezpieczeniowa w stylu PF/CANONICAL.
 *
 * FORMAT: "ANSI shortcut: setpoint (≈ computed), T=time s"
 *
 * @example
 * // Input: I>> = 3×In, In=503A, T=0.1s
 * // Output: "50 I>>: 3×In (≈ 1509 A), T=0,1 s"
 */
export function formatProtectionFunction(
  func: ProtectionFunctionSummary
): FormattedProtectionFunction {
  const ansiCodes = formatAnsiCodes(func.ansi);
  const shortcut = getShortcutForAnsi(func.ansi);
  const setpoint = func.setpoint.display_pl;

  // Computed (opcjonalnie)
  let computed: string | null = null;
  if (func.computed) {
    computed = `(${formatComputedDisplay(func.computed.value, func.computed.unit)})`;
  }

  // Czas (opcjonalnie)
  let time: string | null = null;
  if (func.time_delay_s !== undefined) {
    time = formatTimeDelay(func.time_delay_s);
  }

  // Notatki
  const notes = func.notes_pl ?? null;

  // Test ID: deterministyczny
  const primaryAnsi = func.ansi.length > 0 ? func.ansi[0] : 'XX';
  const testId = `protection-func-${primaryAnsi}-${func.code}`;

  // Buduj pelna linie
  let fullLine = `${ansiCodes} ${shortcut}: ${setpoint}`;
  if (computed) {
    fullLine += ` ${computed}`;
  }
  if (time) {
    fullLine += `, ${time}`;
  }

  return {
    fullLine,
    ansiCodes,
    shortcut,
    setpoint,
    computed,
    time,
    notes,
    testId,
  };
}
