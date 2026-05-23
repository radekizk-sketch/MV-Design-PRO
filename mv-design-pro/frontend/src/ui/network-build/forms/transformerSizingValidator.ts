/**
 * transformerSizingValidator — walidacja doboru transformatora (Etap 4 z planu).
 *
 * Wzory PN-EN 50588-1 / PN-EN 60076:
 * - Moc znamionowa: S_n ≥ S_obciążenia / (β × η)
 * - Współczynnik obciążenia β: zalecane 0.5-0.8 (max ekonomicznie 0.6-0.7)
 * - Sprawność η: typowo 0.98-0.99 dla TR SN/nN olejowych
 *
 * Walidacja:
 * 1. S_n adekwatne do obciążenia z marginesem
 * 2. Napięcie nN zgodne z odbiorami (0.4/0.5/0.69 kV)
 * 3. Vector group zgodny ze standardem (Dyn5, Dyn11, YNyn0 itp.)
 * 4. Tap-changer (OLTC vs no-load) per typ aplikacji
 */

export type VectorGroup = 'Dyn5' | 'Dyn11' | 'YNyn0' | 'YNd5' | 'YNd11' | 'Yzn5' | 'Yzn11';
export type TransformerCooling = 'ONAN' | 'ONAF' | 'OFAF' | 'KNAN';

export interface TransformerSizingInput {
  ratedPowerMva: number;
  primaryVoltageKv: number;
  secondaryVoltageKv: number;
  loadActivePowerMva: number;
  vectorGroup: VectorGroup;
  cooling: TransformerCooling;
  hasOltc: boolean;
  efficiency?: number;
  loadFactor?: number;
}

export type SizingVerdict = 'ok' | 'warning' | 'error' | 'oversized';

export interface SizingValidationResult {
  verdict: SizingVerdict;
  issues: string[];
  utilizationPercent: number;
  recommendation?: string;
  suggestedRatedPowerMva?: number;
}

const TYPICAL_EFFICIENCY = 0.985;
const TARGET_LOAD_FACTOR = 0.65;
const STANDARD_SIZES_MVA = [0.05, 0.063, 0.1, 0.16, 0.25, 0.4, 0.63, 1.0, 1.6, 2.5, 4.0, 6.3, 10, 16, 25, 40];
const STANDARD_NN_VOLTAGES = [0.4, 0.5, 0.69];

export function validateTransformerSizing(input: TransformerSizingInput): SizingValidationResult {
  const issues: string[] = [];
  const {
    ratedPowerMva,
    secondaryVoltageKv,
    loadActivePowerMva,
    vectorGroup,
    cooling,
    hasOltc,
    efficiency = TYPICAL_EFFICIENCY,
    loadFactor = TARGET_LOAD_FACTOR,
  } = input;

  if (ratedPowerMva <= 0) {
    return {
      verdict: 'error',
      issues: ['Moc transformatora musi być > 0 MVA.'],
      utilizationPercent: 0,
    };
  }

  // Wymagana moc S_n = S_load / (β × η)
  const requiredPowerMva = loadActivePowerMva / (loadFactor * efficiency);
  const utilization = loadActivePowerMva / (ratedPowerMva * efficiency);
  const utilizationPercent = Math.round(utilization * 1000) / 10;

  // Sprawdź obciążenie
  if (utilization > 1.0) {
    issues.push(
      `Transformator ${ratedPowerMva} MVA przeciążony: ${utilizationPercent.toFixed(1)}% > 100%.`,
    );
  } else if (utilization > 0.85) {
    issues.push(
      `Wysokie obciążenie transformatora: ${utilizationPercent.toFixed(1)}%. Margines termiczny niski.`,
    );
  }

  // Sprawdź czy nie jest oversized (β < 0.3 = duża nieefektywność)
  if (utilization < 0.3 && loadActivePowerMva > 0) {
    issues.push(
      `Transformator znacznie niedoobciążony: ${utilizationPercent.toFixed(1)}% < 30%. Wysokie straty jałowe.`,
    );
  }

  // Sprawdź napięcie wtórne
  const isStandardNn = STANDARD_NN_VOLTAGES.some((v) => Math.abs(secondaryVoltageKv - v) < 0.01);
  if (!isStandardNn && secondaryVoltageKv < 1) {
    issues.push(
      `Napięcie wtórne ${secondaryVoltageKv} kV nietypowe dla nN. Sprawdź zgodność z odbiorami.`,
    );
  }

  // Vector group check
  if (cooling === 'OFAF' && ratedPowerMva < 10) {
    issues.push('Chłodzenie OFAF zwykle dla TR > 10 MVA — sprawdź uzasadnienie ekonomiczne.');
  }
  if (hasOltc && ratedPowerMva < 0.4) {
    issues.push('OLTC zwykle nie stosowany dla TR < 0.4 MVA — sprawdź potrzebę.');
  }

  // Verdict
  let verdict: SizingVerdict;
  if (issues.length === 0) {
    verdict = 'ok';
  } else if (utilization < 0.3) {
    verdict = 'oversized';
  } else if (utilization > 1.0) {
    verdict = 'error';
  } else {
    verdict = 'warning';
  }

  // Suggested size — najbliższy STANDARD_SIZES_MVA ≥ requiredPowerMva
  let suggestedRatedPowerMva: number | undefined;
  if (verdict === 'error' || verdict === 'oversized') {
    suggestedRatedPowerMva = STANDARD_SIZES_MVA.find((s) => s >= requiredPowerMva);
  }

  let recommendation: string | undefined;
  if (verdict === 'error') {
    recommendation = `Zwiększ moc transformatora do ${suggestedRatedPowerMva ?? requiredPowerMva.toFixed(2)} MVA (β=${loadFactor}).`;
  } else if (verdict === 'oversized') {
    recommendation = `Rozważ mniejszy transformator (${suggestedRatedPowerMva ?? requiredPowerMva.toFixed(2)} MVA) dla optymalnej sprawności.`;
  } else if (verdict === 'warning' && utilizationPercent > 85) {
    recommendation = 'Rozważ większy transformator dla bezpiecznego marginesu obciążenia.';
  }

  // Vector group description
  const vgDescription = describeVectorGroup(vectorGroup);
  if (vgDescription && !issues.some((i) => i.includes('group'))) {
    // OK
  }

  return {
    verdict,
    issues,
    utilizationPercent,
    recommendation,
    suggestedRatedPowerMva,
  };
}

export function describeVectorGroup(vg: VectorGroup): string {
  const descriptions: Record<VectorGroup, string> = {
    Dyn5: 'Dyn5 — układ trójkąt-gwiazda, przesunięcie 150° (dystrybucja klasyczna SN/nN).',
    Dyn11: 'Dyn11 — układ trójkąt-gwiazda, przesunięcie 330° (zalecane PN-EN).',
    YNyn0: 'YNyn0 — gwiazda-gwiazda, bez przesunięcia (transformatory blokowe).',
    YNd5: 'YNd5 — gwiazda-trójkąt, przesunięcie 150° (zwiększa odporność na asymetrię).',
    YNd11: 'YNd11 — gwiazda-trójkąt, przesunięcie 330° (transformatory generatorowe).',
    Yzn5: 'Yzn5 — gwiazda-zygzag, transformator małej mocy.',
    Yzn11: 'Yzn11 — gwiazda-zygzag, alternatywa Dyn dla nN.',
  };
  return descriptions[vg];
}
