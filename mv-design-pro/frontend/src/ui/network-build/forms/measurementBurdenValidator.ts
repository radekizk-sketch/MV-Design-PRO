/**
 * measurementBurdenValidator — walidacja obciążenia wtórnego CT/VT (Etap 6).
 *
 * IEC 61869-2 (CT): obciążenie znamionowe ≤ Pn × ALF^(-2) dla zachowania klasy.
 * IEC 61869-3 (VT): obciążenie wtórne nie może przekroczyć VA znamionowych.
 *
 * Obwód wtórny:
 * - Przewody (Rcab × 2)
 * - Bezpieczniki
 * - Przekaźnik / licznik (impedance VA)
 */

export interface SecondaryBurdenInput {
  ctRatedVa: number;
  ctSecondaryCurrentA: number;
  ctAlf: number;
  cableLengthM: number;
  cableCrossSectionMm2: number;
  burdenItems: Array<{ name: string; va: number }>;
}

export interface BurdenValidationResult {
  totalBurdenVa: number;
  cableBurdenVa: number;
  externalBurdenVa: number;
  utilizationPercent: number;
  isWithinClass: boolean;
  recommendation?: string;
}

// Resistivity of copper at 75°C
const CU_RESISTIVITY_OHM_MM2_PER_M = 0.0224;

export function validateSecondaryBurden({
  ctRatedVa,
  ctSecondaryCurrentA,
  cableLengthM,
  cableCrossSectionMm2,
  burdenItems,
}: SecondaryBurdenInput): BurdenValidationResult {
  const cableResistanceOhm =
    (2 * CU_RESISTIVITY_OHM_MM2_PER_M * cableLengthM) / cableCrossSectionMm2;
  const cableBurdenVa = ctSecondaryCurrentA * ctSecondaryCurrentA * cableResistanceOhm;
  const externalBurdenVa = burdenItems.reduce((sum, item) => sum + item.va, 0);
  const totalBurdenVa = cableBurdenVa + externalBurdenVa;

  const utilizationPercent = ctRatedVa > 0
    ? Math.round((totalBurdenVa / ctRatedVa) * 1000) / 10
    : 0;

  const isWithinClass = totalBurdenVa <= ctRatedVa;

  let recommendation: string | undefined;
  if (!isWithinClass) {
    if (cableBurdenVa > externalBurdenVa) {
      recommendation = `Zwiększ przekrój przewodu wtórnego (obecnie ${cableCrossSectionMm2} mm² → minimum ${Math.ceil((cableCrossSectionMm2 * totalBurdenVa) / ctRatedVa)} mm²).`;
    } else {
      recommendation = `Zmniejsz obciążenie zewnętrzne lub wybierz CT o większym Pn (obecnie ${ctRatedVa} VA → wymagane ${Math.ceil(totalBurdenVa)} VA).`;
    }
  }

  return {
    totalBurdenVa,
    cableBurdenVa,
    externalBurdenVa,
    utilizationPercent,
    isWithinClass,
    recommendation,
  };
}

/**
 * VT burden — sumowanie VA na obwodach wtórnych.
 */
export interface VtBurdenInput {
  vtRatedVa: number;
  burdenItems: Array<{ name: string; va: number; powerFactor?: number }>;
}

export function validateVtBurden({
  vtRatedVa,
  burdenItems,
}: VtBurdenInput): {
  totalBurdenVa: number;
  utilizationPercent: number;
  isWithinClass: boolean;
} {
  const totalBurdenVa = burdenItems.reduce((sum, item) => sum + item.va, 0);
  const utilizationPercent = vtRatedVa > 0
    ? Math.round((totalBurdenVa / vtRatedVa) * 1000) / 10
    : 0;
  return {
    totalBurdenVa,
    utilizationPercent,
    isWithinClass: totalBurdenVa <= vtRatedVa,
  };
}
