/**
 * cableThermalAgingHelper — model termiczny kabla (Etap 4 z planu).
 *
 * IEC 60853 (cyclic rating), IEC 60287 (steady-state).
 *
 * Życie kabla zależy od temperatury XLPE:
 * - T_op ≤ 90°C → normalne życie (30+ lat)
 * - T_op = 100°C → życie skrócone ~50%
 * - T_op > 105°C → przyspieszone starzenie
 *
 * Reguła Arrhenius'a: każde +10°C → 2× szybsze starzenie.
 */

export type CableInsulationType = 'XLPE' | 'EPR' | 'PVC' | 'paper_oil';

const MAX_TEMPERATURES_C: Record<CableInsulationType, number> = {
  XLPE: 90,
  EPR: 90,
  PVC: 70,
  paper_oil: 80,
};

const REFERENCE_LIFE_YEARS = 30;
const TEMPERATURE_RULE_DEG = 10; // °C per 2× aging

export interface ThermalAgingInput {
  insulationType: CableInsulationType;
  ambientTempC: number;
  loadFactor: number;
  installationMedium: 'soil' | 'air' | 'duct';
}

export interface ThermalAgingResult {
  estimatedTempC: number;
  isWithinLimit: boolean;
  expectedLifeYears: number;
  agingFactor: number;
  recommendation?: string;
}

const TEMP_RISE_FACTORS: Record<'soil' | 'air' | 'duct', number> = {
  soil: 40,
  air: 30,
  duct: 50,
};

export function estimateOperatingTemperature({
  ambientTempC,
  loadFactor,
  installationMedium,
}: Omit<ThermalAgingInput, 'insulationType'> & { insulationType?: CableInsulationType }): number {
  const baseRise = TEMP_RISE_FACTORS[installationMedium];
  const rise = baseRise * loadFactor * loadFactor;
  return ambientTempC + rise;
}

export function calculateThermalAging(input: ThermalAgingInput): ThermalAgingResult {
  const estimatedTempC = estimateOperatingTemperature(input);
  const maxTempC = MAX_TEMPERATURES_C[input.insulationType];
  const isWithinLimit = estimatedTempC <= maxTempC;

  // Arrhenius simplified
  const deltaT = estimatedTempC - maxTempC;
  const agingFactor = Math.pow(2, deltaT / TEMPERATURE_RULE_DEG);
  const expectedLifeYears = Math.max(1, REFERENCE_LIFE_YEARS / agingFactor);

  let recommendation: string | undefined;
  if (!isWithinLimit) {
    if (deltaT > 15) {
      recommendation = `Krytyczne przekroczenie temperatury kabla o ${deltaT.toFixed(1)}°C. Wymiana zalecana w ciągu ${expectedLifeYears.toFixed(1)} lat.`;
    } else {
      recommendation = `Przekroczenie temperatury o ${deltaT.toFixed(1)}°C — życie kabla skrócone do ${expectedLifeYears.toFixed(1)} lat. Rozważ większy przekrój.`;
    }
  } else if (agingFactor > 0.5) {
    recommendation = `Temperatura w normie ale wysoka — rozważ monitoring termiczny.`;
  }

  return {
    estimatedTempC: Math.round(estimatedTempC * 10) / 10,
    isWithinLimit,
    expectedLifeYears: Math.round(expectedLifeYears * 10) / 10,
    agingFactor: Math.round(agingFactor * 100) / 100,
    recommendation,
  };
}

export function describeInsulationType(type: CableInsulationType): string {
  return {
    XLPE: 'XLPE — polietylen sieciowany (90°C). Standardowy dla SN.',
    EPR: 'EPR — etylen-propylen (90°C). Stosowany do 30 kV.',
    PVC: 'PVC — polichlorek winylu (70°C). Tylko nN.',
    paper_oil: 'Papier-olej (80°C). Stare instalacje SN/WN.',
  }[type];
}
