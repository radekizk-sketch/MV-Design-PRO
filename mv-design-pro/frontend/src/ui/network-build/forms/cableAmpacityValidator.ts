/**
 * cableAmpacityValidator — walidacja obciążalności kabla/linii (Etap 3 z planu).
 *
 * "Pole 'długość [km]' obowiązkowe + walidacja (>0, <50km dla SN)"
 * "Auto-suggest typu kabla z katalogu na podstawie długości + obciążalności"
 *
 * Reguły:
 * - długość > 0 i < 50 km (dla SN)
 * - prąd nominalny obwodu ≤ obciążalność kabla × factor pogody/grupy
 * - I_zwarcia × √(t) ≤ k_cable × A (kable XLPE Al: k=94, kable Cu: k=143)
 *
 * Normy: PN-EN 60909-0, PN-IEC 60287, ENEA Standard ampacity factors.
 */

export type CableType = 'cable_xlpe_al' | 'cable_xlpe_cu' | 'cable_pvc_cu' | 'overhead_al';

export interface AmpacityValidationInput {
  lengthKm: number;
  cableType: CableType;
  crossSectionMm2: number;
  ratedAmpacityA: number;
  loadCurrentA: number;
  shortCircuitKa: number;
  shortCircuitDurationS: number;
  groupingFactor?: number;
  ambientFactor?: number;
  voltageLevel?: 'SN' | 'WN';
}

export type AmpacityVerdict = 'ok' | 'warning' | 'error';

export interface AmpacityValidationResult {
  verdict: AmpacityVerdict;
  issues: string[];
  ampacityUtilization: number;
  thermalShortCircuitMm2: number;
  recommendation?: string;
}

const SC_FACTOR_K: Record<CableType, number> = {
  cable_xlpe_al: 94,
  cable_xlpe_cu: 143,
  cable_pvc_cu: 115,
  overhead_al: 0, // dla linii napowietrznych nie liczymy thermal SC tym wzorem
};

const MAX_LENGTH_KM: Record<'SN' | 'WN', number> = {
  SN: 50,
  WN: 200,
};

export function validateCableAmpacity({
  lengthKm,
  cableType,
  crossSectionMm2,
  ratedAmpacityA,
  loadCurrentA,
  shortCircuitKa,
  shortCircuitDurationS,
  groupingFactor = 0.9,
  ambientFactor = 1.01,
  voltageLevel = 'SN',
}: AmpacityValidationInput): AmpacityValidationResult {
  const issues: string[] = [];

  // Length validation
  const maxLength = MAX_LENGTH_KM[voltageLevel];
  if (!Number.isFinite(lengthKm) || lengthKm <= 0) {
    issues.push('Długość musi być dodatnia.');
  } else if (lengthKm > maxLength) {
    issues.push(
      `Długość ${lengthKm.toFixed(1)} km przekracza limit ${maxLength} km dla sieci ${voltageLevel}.`,
    );
  }

  // Ampacity check (load current vs derated cable rated)
  const deratedAmpacity = ratedAmpacityA * groupingFactor * ambientFactor;
  const utilization = deratedAmpacity > 0 ? loadCurrentA / deratedAmpacity : Infinity;
  const ampacityUtilization = Math.round(utilization * 1000) / 10;

  if (deratedAmpacity > 0 && loadCurrentA > deratedAmpacity) {
    issues.push(
      `Prąd obwodu ${loadCurrentA.toFixed(0)} A przekracza obciążalność po deratingu ${deratedAmpacity.toFixed(0)} A (${ampacityUtilization.toFixed(1)}%).`,
    );
  }

  // Short-circuit thermal check (I^2 × t = k^2 × A^2)
  // A_min = (I × √t) / k
  const k = SC_FACTOR_K[cableType];
  let thermalShortCircuitMm2 = 0;
  if (k > 0 && shortCircuitKa > 0 && shortCircuitDurationS > 0) {
    thermalShortCircuitMm2 = Math.ceil(
      (shortCircuitKa * 1000 * Math.sqrt(shortCircuitDurationS)) / k,
    );
    if (crossSectionMm2 < thermalShortCircuitMm2) {
      issues.push(
        `Przekrój ${crossSectionMm2} mm² < wymaganego dla zwarcia ${thermalShortCircuitMm2} mm² (IEC 60909).`,
      );
    }
  }

  // Verdict
  let verdict: AmpacityVerdict;
  if (issues.length === 0) {
    if (utilization > 0.9) {
      verdict = 'warning';
      issues.push(`Wysokie obciążenie kabla: ${ampacityUtilization.toFixed(1)}%`);
    } else {
      verdict = 'ok';
    }
  } else {
    const hasHardError = issues.some(
      (s) =>
        s.includes('musi być')
        || s.includes('przekracza obciążalność')
        || s.includes('< wymaganego')
        || s.includes('przekracza limit'),
    );
    verdict = hasHardError ? 'error' : 'warning';
  }

  let recommendation: string | undefined;
  if (verdict === 'error') {
    if (utilization > 1) {
      recommendation = 'Zwiększ przekrój kabla lub zmniejsz obciążenie.';
    } else if (crossSectionMm2 < thermalShortCircuitMm2) {
      recommendation = `Wybierz kabel z przekrojem ≥ ${thermalShortCircuitMm2} mm² aby spełnić warunek zwarciowy.`;
    } else {
      recommendation = 'Sprawdź długość i parametry kabla.';
    }
  }

  return {
    verdict,
    issues,
    ampacityUtilization,
    thermalShortCircuitMm2,
    recommendation,
  };
}
