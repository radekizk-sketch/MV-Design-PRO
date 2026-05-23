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

export function calculateVoltageDrop(input: VoltageDropInput): VoltageDropResult {
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

  const sinPhi = Math.sqrt(1 - cosPhi ** 2);
  const totalImpedance =
    cableResistanceOhmPerKm * cosPhi + cableReactanceOhmPerKm * sinPhi;
  const voltageDropV = Math.sqrt(3) * loadCurrentA * cableLengthKm * totalImpedance;
  const voltageDropPercent = Math.round((voltageDropV / (systemVoltageKv * 1000)) * 10000) / 100;

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
