/**
 * earthingGridCalculator — kalkulator rezystancji siatki uziemiającej (Etap 7).
 *
 * IEEE Std 80, PN-EN 50522 — projektowanie siatek uziemiających podstacji.
 *
 * R_g = ρ × (1/L + 1/√(20 × A) × (1 + 1/(1 + h × √(20/A))))
 *
 * gdzie:
 * - ρ — rezystywność gruntu (Ω·m)
 * - L — total length przewodów uziemiających (m)
 * - A — powierzchnia siatki (m²)
 * - h — głębokość ułożenia (m)
 */

export interface EarthingGridInput {
  soilResistivityOhmM: number;
  totalConductorLengthM: number;
  gridAreaM2: number;
  depthM: number;
  numberOfElectrodes?: number;
  electrodeLengthM?: number;
}

export interface EarthingGridResult {
  gridResistanceOhm: number;
  touchVoltageV?: number;
  stepVoltageV?: number;
  isCompliant: boolean;
  recommendations: string[];
}

export function calculateGridResistance({
  soilResistivityOhmM,
  totalConductorLengthM,
  gridAreaM2,
  depthM,
}: EarthingGridInput): number {
  if (soilResistivityOhmM <= 0 || totalConductorLengthM <= 0 || gridAreaM2 <= 0) {
    return Infinity;
  }
  // Schwartz formula (uproszczona)
  const rho = soilResistivityOhmM;
  const L = totalConductorLengthM;
  const A = gridAreaM2;
  const h = depthM;

  const term1 = 1 / L;
  const sqrtTerm = Math.sqrt(20 * A);
  const term2 = (1 / sqrtTerm) * (1 + 1 / (1 + h * Math.sqrt(20 / A)));
  return rho * (term1 + term2);
}

const MAX_TOUCH_VOLTAGE_V = 50;
const MAX_STEP_VOLTAGE_V = 50;

export function validateGridForFaultCurrent(
  input: EarthingGridInput,
  faultCurrentA: number,
): EarthingGridResult {
  const gridResistanceOhm = calculateGridResistance(input);
  const touchVoltageV = gridResistanceOhm * faultCurrentA * 0.5; // approx 50% drop on grid
  const stepVoltageV = gridResistanceOhm * faultCurrentA * 0.4;

  const recommendations: string[] = [];
  let isCompliant = true;

  if (touchVoltageV > MAX_TOUCH_VOLTAGE_V) {
    isCompliant = false;
    recommendations.push(
      `Napięcie dotykowe ${touchVoltageV.toFixed(1)} V > ${MAX_TOUCH_VOLTAGE_V} V. Zwiększ siatkę lub ogranicz prąd doziemny.`,
    );
  }
  if (stepVoltageV > MAX_STEP_VOLTAGE_V) {
    isCompliant = false;
    recommendations.push(
      `Napięcie krokowe ${stepVoltageV.toFixed(1)} V > ${MAX_STEP_VOLTAGE_V} V. Rozważ wyrównawcze przewody.`,
    );
  }
  if (gridResistanceOhm > 5) {
    recommendations.push(
      `R_g = ${gridResistanceOhm.toFixed(2)} Ω jest wysokie. Typowo dla GPZ wymagane < 1 Ω, dla stacji SN < 5 Ω.`,
    );
  }
  if (isCompliant && recommendations.length === 0) {
    recommendations.push('Siatka uziemiająca spełnia wymagania PN-EN 50522.');
  }

  return {
    gridResistanceOhm,
    touchVoltageV,
    stepVoltageV,
    isCompliant,
    recommendations,
  };
}

/**
 * Estymata wymaganej długości przewodów dla danej R_g target.
 *
 * Iteracyjne — wzór odwrotny do Schwartza.
 */
export function estimateRequiredConductorLength(
  targetResistanceOhm: number,
  soilResistivityOhmM: number,
  gridAreaM2: number,
  depthM: number,
): number {
  const sqrtA = Math.sqrt(20 * gridAreaM2);
  const term2 = (1 / sqrtA) * (1 + 1 / (1 + depthM * Math.sqrt(20 / gridAreaM2)));
  const requiredTerm1 = (targetResistanceOhm / soilResistivityOhmM) - term2;
  if (requiredTerm1 <= 0) return Infinity;
  return 1 / requiredTerm1;
}
