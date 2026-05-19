/**
 * Protection Contract — krok 13 Kreatora KOMPLETNEGO.
 *
 * Zabezpieczenia per ANSI Device Numbers (IEEE C37.2) + IEC 60255:
 *   27   — Undervoltage (przepiec)
 *   50   — Instantaneous Overcurrent
 *   51   — Time Overcurrent (inverse time)
 *   51N  — Time Overcurrent Neutral (ziemnozwarciowe)
 *   59   — Overvoltage
 *   59N  — Residual Overvoltage (ziemnozwarciowe napięciowe)
 *   67   — Directional Overcurrent
 *   81   — Frequency (under/over)
 *   87   — Differential (różnicowe)
 *   25   — Synchrocheck
 *   78   — Loss of Synchronism
 *   46   — Negative Sequence (przerwa faza)
 *   40   — Loss of Excitation (generator)
 *   32   — Reverse Power
 *
 * Koordynacja TCC (Time-Current Coordination):
 *   Margines selektywności t_margin ≥ 0.3 s (per IEEE 242)
 *   ΔI/I ≥ 1.5 (per ANSI standard) — krzywe inverse-time
 */

/** Numer funkcji ANSI. */
export type AnsiDeviceFunction =
  | '27' | '50' | '51' | '51N' | '59' | '59N'
  | '67' | '67N' | '81U' | '81O' | '87' | '87T'
  | '25' | '78' | '46' | '40' | '32';

/** Charakterystyka krzywej time-current per IEC 60255-151. */
export type TccCurveType =
  | 'IEC_SI'      // Standard Inverse
  | 'IEC_VI'      // Very Inverse
  | 'IEC_EI'      // Extremely Inverse
  | 'IEC_LTI'     // Long-Time Inverse
  | 'ANSI_MI'     // Moderately Inverse
  | 'ANSI_VI'     // Very Inverse
  | 'ANSI_EI'     // Extremely Inverse
  | 'DEFINITE_TIME';

/** Konfiguracja zabezpieczenia. */
export interface ProtectionFunction {
  readonly ansi: AnsiDeviceFunction;
  readonly labelPl: string;
  /** Nastawa prądu/napięcia/częstotliwości. */
  readonly pickup: number;
  readonly pickupUnit: 'A' | 'V' | 'Hz' | 'pu';
  /** Krzywa TCC dla 50/51/67. */
  readonly curve?: TccCurveType;
  /** Time Dial Setting (mnożnik krzywej). */
  readonly tds?: number;
  /** Czas operacji dla DEFINITE_TIME (s). */
  readonly definiteTimeSec?: number;
  readonly enabled: boolean;
}

/**
 * Czas zadziałania krzywej IEC 60255-151:
 *   t = (k × β) / ((I/Ip)^α − 1) × TDS
 *
 * Stałe per typ krzywej:
 *   SI:  k=0.14, α=0.02
 *   VI:  k=13.5, α=1.0
 *   EI:  k=80.0, α=2.0
 *   LTI: k=120,  α=1.0
 */
export const IEC_CURVE_CONSTANTS: Readonly<Record<TccCurveType,
  { readonly k: number; readonly alpha: number }>> = {
  IEC_SI:    { k: 0.14, alpha: 0.02 },
  IEC_VI:    { k: 13.5, alpha: 1.0 },
  IEC_EI:    { k: 80.0, alpha: 2.0 },
  IEC_LTI:   { k: 120,  alpha: 1.0 },
  ANSI_MI:   { k: 0.0515, alpha: 0.02 },
  ANSI_VI:   { k: 19.61, alpha: 2.0 },
  ANSI_EI:   { k: 28.2,  alpha: 2.0 },
  DEFINITE_TIME: { k: 0, alpha: 0 },
};

/**
 * Czas zadziałania zabezpieczenia dla danego prądu (I/Ip).
 */
export function computeTripTime(
  func: ProtectionFunction,
  currentMultiplier: number,
): number {
  if (func.curve === 'DEFINITE_TIME' || !func.curve) {
    return func.definiteTimeSec ?? 0;
  }
  if (currentMultiplier <= 1.0) return Infinity;
  const constants = IEC_CURVE_CONSTANTS[func.curve];
  const denominator = Math.pow(currentMultiplier, constants.alpha) - 1;
  const tds = func.tds ?? 1.0;
  return (constants.k / denominator) * tds;
}

/**
 * Sprawdzenie selektywności (koordynacji TCC) dwóch zabezpieczeń.
 * Margines selektywności t_upstream - t_downstream ≥ 0.3 s.
 */
export interface CoordinationCheckInput {
  readonly downstream: ProtectionFunction;
  readonly upstream: ProtectionFunction;
  readonly faultCurrent: number;
  readonly minMarginSec: number;       // typ. 0.3
}

export interface CoordinationCheckResult {
  readonly downstreamTime: number;
  readonly upstreamTime: number;
  readonly margin: number;
  readonly selective: boolean;
}

export function checkProtectionCoordination(
  input: CoordinationCheckInput,
): CoordinationCheckResult {
  const downRatio = input.faultCurrent / input.downstream.pickup;
  const upRatio = input.faultCurrent / input.upstream.pickup;
  const tDown = computeTripTime(input.downstream, downRatio);
  const tUp = computeTripTime(input.upstream, upRatio);
  const margin = tUp - tDown;
  return {
    downstreamTime: tDown,
    upstreamTime: tUp,
    margin,
    selective: margin >= input.minMarginSec,
  };
}

/**
 * Typowe konfiguracje zabezpieczeń per typ pola.
 */
export const FIELD_PROTECTION_PROFILES = {
  /** Pole liniowe SN — typowy zestaw (50/51/51N/67). */
  LINE: [
    {
      ansi: '50' as const,
      labelPl: 'Zwarcie 3-fazowe (przekraczające)',
      pickup: 1000, pickupUnit: 'A' as const,
      curve: 'DEFINITE_TIME' as const, definiteTimeSec: 0.05,
      enabled: true,
    },
    {
      ansi: '51' as const,
      labelPl: 'Zwarcie zwłoczne',
      pickup: 200, pickupUnit: 'A' as const,
      curve: 'IEC_SI' as const, tds: 0.3,
      enabled: true,
    },
    {
      ansi: '51N' as const,
      labelPl: 'Zwarcie ziemnozwarciowe',
      pickup: 50, pickupUnit: 'A' as const,
      curve: 'IEC_SI' as const, tds: 0.3,
      enabled: true,
    },
    {
      ansi: '67' as const,
      labelPl: 'Kierunkowe nadprądowe',
      pickup: 200, pickupUnit: 'A' as const,
      curve: 'IEC_SI' as const, tds: 0.3,
      enabled: true,
    },
  ] as readonly ProtectionFunction[],

  /** Pole transformatorowe — 51 + 51N + 87T (różnicowe). */
  TRANSFORMER: [
    {
      ansi: '51' as const,
      labelPl: 'Nadprądowe transformatora',
      pickup: 60, pickupUnit: 'A' as const,
      curve: 'IEC_VI' as const, tds: 0.3,
      enabled: true,
    },
    {
      ansi: '51N' as const,
      labelPl: 'Ziemnozwarciowe TR',
      pickup: 10, pickupUnit: 'A' as const,
      curve: 'IEC_SI' as const, tds: 0.5,
      enabled: true,
    },
    {
      ansi: '87T' as const,
      labelPl: 'Różnicowe transformatora',
      pickup: 0.3, pickupUnit: 'pu' as const,
      curve: 'DEFINITE_TIME' as const, definiteTimeSec: 0.05,
      enabled: true,
    },
  ] as readonly ProtectionFunction[],

  /** Pole DER (PV/BESS) — 27/59/81/67/46 per NC RfG. */
  DER: [
    {
      ansi: '27' as const,
      labelPl: 'Podnapięciowe LV',
      pickup: 0.85, pickupUnit: 'pu' as const,
      curve: 'DEFINITE_TIME' as const, definiteTimeSec: 1.5,
      enabled: true,
    },
    {
      ansi: '59' as const,
      labelPl: 'Nadnapięciowe HV',
      pickup: 1.15, pickupUnit: 'pu' as const,
      curve: 'DEFINITE_TIME' as const, definiteTimeSec: 0.2,
      enabled: true,
    },
    {
      ansi: '81U' as const,
      labelPl: 'Podczęstotliwościowe',
      pickup: 47.5, pickupUnit: 'Hz' as const,
      curve: 'DEFINITE_TIME' as const, definiteTimeSec: 0.2,
      enabled: true,
    },
    {
      ansi: '81O' as const,
      labelPl: 'Nadczęstotliwościowe',
      pickup: 51.5, pickupUnit: 'Hz' as const,
      curve: 'DEFINITE_TIME' as const, definiteTimeSec: 0.2,
      enabled: true,
    },
    {
      ansi: '67' as const,
      labelPl: 'Kierunkowe nadprądowe (anti-island)',
      pickup: 200, pickupUnit: 'A' as const,
      curve: 'IEC_SI' as const, tds: 0.3,
      enabled: true,
    },
    {
      ansi: '46' as const,
      labelPl: 'Asymetria prądu (negative sequence)',
      pickup: 0.15, pickupUnit: 'pu' as const,
      curve: 'DEFINITE_TIME' as const, definiteTimeSec: 5,
      enabled: true,
    },
  ] as readonly ProtectionFunction[],
} as const;
