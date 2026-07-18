/**
 * voltageDropValidator — walidacja spadku napięcia w obwodzie (Etap 4 z planu).
 *
 * Reguła PN-IEC 60364-5-52: ΔU ≤ 5% U_n dla normalnych warunków,
 * dopuszczalne do 8% w rozruchach silnikowych.
 *
 * Wzór: ΔU = √3 × I × L × (R × cos φ + X × sin φ) / 1000  [V dla linii 3F]
 *
 * Dla cable XLPE 15 kV:
 *   - R_20: per katalog (~0.125 Ω/km dla 240 mm² Al)
 *   - X: ~0.10 Ω/km dla SN
 */

import { fetchCableVoltageDrop } from './cableVoltageDropApi';

export interface VoltageDropInput {
  loadCurrentA: number;
  cableLengthKm: number;
  cableResistanceOhmPerKm: number;
  cableReactanceOhmPerKm: number;
  cosPhi: number;
  systemVoltageKv: number;
  maxDropPercent?: number;
  isMotorLoad?: boolean;
}

export type DropVerdict = 'ok' | 'warning' | 'error';

export interface VoltageDropResult {
  verdict: DropVerdict;
  voltageDropV: number;
  voltageDropPercent: number;
  message: string;
  recommendation?: string;
}

const DEFAULT_MAX_DROP_PERCENT = 5;
const MOTOR_MAX_DROP_PERCENT = 8;

/**
 * Walidacja spadku napięcia.
 *
 * Fizyka ΔU liczy się w backendzie (WHITE BOX); ta funkcja waliduje dane
 * wejściowe (bez fizyki), wysyła je do końcówki i buduje werdykt z gotowego
 * ΔU% (progowe porównanie z limitem to interpretacja normatywna, nie fizyka).
 * Brak backendu = uczciwy komunikat PL, NIGDY lokalne liczenie.
 */
export async function calculateVoltageDrop(
  input: VoltageDropInput,
  options: { signal?: AbortSignal } = {},
): Promise<VoltageDropResult> {
  const {
    loadCurrentA,
    cableLengthKm,
    cableResistanceOhmPerKm,
    cableReactanceOhmPerKm,
    cosPhi,
    systemVoltageKv,
    maxDropPercent,
    isMotorLoad = false,
  } = input;

  if (cableLengthKm <= 0 || loadCurrentA <= 0 || systemVoltageKv <= 0) {
    return {
      verdict: 'error',
      voltageDropV: 0,
      voltageDropPercent: 0,
      message: 'Niepoprawne dane wejściowe (długość/prąd/napięcie ≤ 0).',
    };
  }

  if (cosPhi < 0 || cosPhi > 1) {
    return {
      verdict: 'error',
      voltageDropV: 0,
      voltageDropPercent: 0,
      message: `Współczynnik mocy cos φ = ${cosPhi} poza zakresem [0, 1].`,
    };
  }

  let voltageDropV: number;
  let voltageDropPercent: number;
  try {
    const response = await fetchCableVoltageDrop(
      {
        current_a: loadCurrentA,
        length_km: cableLengthKm,
        r_ohm_per_km: cableResistanceOhmPerKm,
        x_ohm_per_km: cableReactanceOhmPerKm,
        cos_phi: cosPhi,
        line_voltage_v: systemVoltageKv * 1000,
      },
      options,
    );
    voltageDropV = response.delta_u_v;
    voltageDropPercent = Math.round(response.delta_u_pct * 100) / 100;
  } catch (error) {
    return {
      verdict: 'error',
      voltageDropV: 0,
      voltageDropPercent: 0,
      message:
        error instanceof Error
          ? error.message
          : 'Podgląd spadku napięcia niedostępny — backend solvera nie odpowiedział.',
    };
  }

  const limit = maxDropPercent ?? (isMotorLoad ? MOTOR_MAX_DROP_PERCENT : DEFAULT_MAX_DROP_PERCENT);
  const warningLimit = limit * 0.8;

  let verdict: DropVerdict;
  let message: string;
  let recommendation: string | undefined;

  if (voltageDropPercent > limit) {
    verdict = 'error';
    message = `Spadek napięcia ${voltageDropPercent.toFixed(2)}% przekracza dopuszczalny ${limit}% (PN-IEC 60364-5-52).`;
    recommendation = `Zwiększ przekrój kabla lub skróć trasę. Zalecany przekrój: ${Math.ceil((voltageDropPercent / limit) * 100)}% obecnego.`;
  } else if (voltageDropPercent > warningLimit) {
    verdict = 'warning';
    message = `Spadek napięcia ${voltageDropPercent.toFixed(2)}% blisko limitu ${limit}%.`;
    recommendation = 'Rozważ większy przekrój dla bezpiecznego marginesu (≤80% limitu).';
  } else {
    verdict = 'ok';
    message = `Spadek napięcia ${voltageDropPercent.toFixed(2)}% w normie (limit ${limit}%).`;
  }

  return { verdict, voltageDropV, voltageDropPercent, message, recommendation };
}
