/**
 * earthingFaultCurrent — kalkulator prądu doziemnego (Etap 7 z planu).
 *
 * PN-EN 50522 — sieci SN z różnymi metodami uziemienia:
 * - Solid: I_F = U_n / (√3 × Z_0)
 * - Resistor: I_F = U_n / (√3 × R_n)
 * - Petersen: I_F ≈ I_C × (1 - K), gdzie K = L_c / (3 × C × U_n)
 * - IT (izolowany): I_F = 3 × U_n × ω × C
 *
 * Wymagane dla:
 * - Sprawdzenia napięć dotykowych U_t i U_s (limity PN-EN 50522)
 * - Doboru zabezpieczeń doziemnych (50G/51G/67N/64REF)
 * - Walidacji siatki uziemiającej (R_E × I_F → U_uziom)
 */

import type { EarthingType } from './earthingSystemHelper';

export interface EarthingFaultInput {
  earthingType: EarthingType;
  systemVoltageKv: number;
  cableCapacitanceUfPerKm?: number;
  networkLengthKm?: number;
  resistorOhm?: number;
  petersenInductanceMh?: number;
  zeroSeqImpedanceOhm?: number;
  petersenCompensationRatio?: number;
}

export interface EarthingFaultResult {
  currentA: number;
  description: string;
  voltageStepRiskV: number | null;
  recommendedGridResistanceOhm: number | null;
}

const GRAVITY_CONSTANT = 50; // V max touch voltage per PN-EN 50522 dla SN
const OMEGA = 2 * Math.PI * 50; // 50 Hz

export function calculateEarthingFault({
  earthingType,
  systemVoltageKv,
  cableCapacitanceUfPerKm = 0.3,
  networkLengthKm = 10,
  resistorOhm,
  zeroSeqImpedanceOhm,
  petersenCompensationRatio = 0.95,
}: EarthingFaultInput): EarthingFaultResult {
  const uPhaseV = (systemVoltageKv * 1000) / Math.sqrt(3);
  let currentA = 0;
  let description = '';

  switch (earthingType) {
    case 'Solid':
      currentA = zeroSeqImpedanceOhm
        ? uPhaseV / zeroSeqImpedanceOhm
        : (systemVoltageKv * 1000) / 0.5; // fallback assumption
      description = `Solid grounding: I_F = U_n/(√3 × Z_0) ≈ ${currentA.toFixed(0)} A`;
      break;

    case 'Resistor':
      if (!resistorOhm) {
        return {
          currentA: 0,
          description: 'Brak wartości R_n.',
          voltageStepRiskV: null,
          recommendedGridResistanceOhm: null,
        };
      }
      currentA = uPhaseV / resistorOhm;
      description = `Resistor: I_F = U_n/(√3 × R_n) = ${uPhaseV.toFixed(0)}/${resistorOhm} = ${currentA.toFixed(0)} A`;
      break;

    case 'Petersen': {
      // Capacitive earth-fault current: I_C = 3 × U × ω × C
      const capacityF = (cableCapacitanceUfPerKm * 1e-6) * networkLengthKm;
      const icA = 3 * uPhaseV * OMEGA * capacityF;
      currentA = icA * (1 - petersenCompensationRatio);
      description = `Petersen: I_C ≈ ${icA.toFixed(0)} A, kompensacja ${(petersenCompensationRatio * 100).toFixed(0)}% → I_res ≈ ${currentA.toFixed(0)} A`;
      break;
    }

    case 'IT': {
      const capacityF = (cableCapacitanceUfPerKm * 1e-6) * networkLengthKm;
      currentA = 3 * uPhaseV * OMEGA * capacityF;
      description = `IT (izolowany): I_F = 3 × U × ω × C ≈ ${currentA.toFixed(1)} A (capacitive)`;
      break;
    }

    case 'TN-S':
    case 'TN-C':
    case 'TN-C-S':
    case 'TT':
      currentA = uPhaseV / 0.5; // typical loop impedance
      description = `${earthingType} (nN): I_F szacunkowo ${currentA.toFixed(0)} A. Sprawdź pętlę zwarcia.`;
      break;
  }

  // Napięcie krokowe: U_step = R_grid × I_F. Max 50V wg PN-EN 50522.
  const recommendedGridResistanceOhm = currentA > 0 ? GRAVITY_CONSTANT / currentA : null;
  const voltageStepRiskV = currentA > 0 ? 1.0 * currentA : null; // dla R_grid=1Ω

  return {
    currentA,
    description,
    voltageStepRiskV,
    recommendedGridResistanceOhm,
  };
}

export function isCurrentSafeForGrid(faultCurrentA: number, gridResistanceOhm: number): {
  isSafe: boolean;
  touchVoltageV: number;
  message: string;
} {
  const touchVoltageV = faultCurrentA * gridResistanceOhm;
  const isSafe = touchVoltageV <= GRAVITY_CONSTANT;
  return {
    isSafe,
    touchVoltageV,
    message: isSafe
      ? `Napięcie dotykowe ${touchVoltageV.toFixed(1)} V ≤ ${GRAVITY_CONSTANT} V — bezpieczne (PN-EN 50522).`
      : `Napięcie dotykowe ${touchVoltageV.toFixed(1)} V > ${GRAVITY_CONSTANT} V — zwiększ siatkę uziemiającą lub ograniczy prąd doziemny.`,
  };
}
