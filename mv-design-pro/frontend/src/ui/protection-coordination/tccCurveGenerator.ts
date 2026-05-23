/**
 * tccCurveGenerator — generator punktów TCC (Etap 7 z planu).
 *
 * "Krzywe IEC SI/VI/EI + IEEE + DT + custom Bezier"
 *
 * Generuje punkty (I, t) krzywej IDMT do renderowania na TCC chart.
 *
 * Wzór: t(I) = TMS × k / ((I / Ipickup)^alpha - 1) + tdt
 *
 * Stałe k, alpha per typ krzywej (IEC 60255-151 / IEEE C37.112):
 * - IEC Standard Inverse (SI): k=0.14, α=0.02
 * - IEC Very Inverse (VI): k=13.5, α=1.0
 * - IEC Extremely Inverse (EI): k=80.0, α=2.0
 * - IEC Long-Time Inverse: k=120, α=1.0
 * - IEEE Moderately Inverse: k=0.0515, α=0.02 (z B=0.114)
 * - IEEE Very Inverse: k=19.61, α=2.0 (z B=0.491)
 * - IEEE Extremely Inverse: k=28.2, α=2.0 (z B=0.1217)
 * - Definite Time (DT): t = TMS (stała)
 */

export type CurveStandard = 'IEC_SI' | 'IEC_VI' | 'IEC_EI' | 'IEC_LTI' | 'IEEE_MI' | 'IEEE_VI' | 'IEEE_EI' | 'DT';

export interface CurveConstants {
  k: number;
  alpha: number;
  B?: number;
}

export const CURVE_CONSTANTS: Record<CurveStandard, CurveConstants> = {
  IEC_SI: { k: 0.14, alpha: 0.02 },
  IEC_VI: { k: 13.5, alpha: 1.0 },
  IEC_EI: { k: 80.0, alpha: 2.0 },
  IEC_LTI: { k: 120, alpha: 1.0 },
  IEEE_MI: { k: 0.0515, alpha: 0.02, B: 0.114 },
  IEEE_VI: { k: 19.61, alpha: 2.0, B: 0.491 },
  IEEE_EI: { k: 28.2, alpha: 2.0, B: 0.1217 },
  DT: { k: 0, alpha: 0 },
};

export interface CurvePoint {
  currentA: number;
  timeS: number;
}

export interface GenerateCurveInput {
  standard: CurveStandard;
  tms: number;
  pickupCurrentA: number;
  definiteTimeS?: number;
  minMultiple?: number;
  maxMultiple?: number;
  pointsPerDecade?: number;
}

export function curveTime(
  standard: CurveStandard,
  tms: number,
  pickup: number,
  current: number,
  definiteTimeS = 0,
): number {
  if (standard === 'DT') return tms;
  if (current <= pickup) return Infinity;
  const constants = CURVE_CONSTANTS[standard];
  const ratio = current / pickup;
  const denom = Math.pow(ratio, constants.alpha) - 1;
  const idmt = (tms * constants.k) / denom;
  const B = constants.B ?? 0;
  return idmt + tms * B + definiteTimeS;
}

export function generateCurvePoints({
  standard,
  tms,
  pickupCurrentA,
  definiteTimeS = 0,
  minMultiple = 1.2,
  maxMultiple = 100,
  pointsPerDecade = 20,
}: GenerateCurveInput): CurvePoint[] {
  if (standard === 'DT') {
    // Definite time: 2 punkty (lewy pickup, prawy max)
    return [
      { currentA: pickupCurrentA * minMultiple, timeS: tms },
      { currentA: pickupCurrentA * maxMultiple, timeS: tms },
    ];
  }

  const points: CurvePoint[] = [];
  const logMin = Math.log10(minMultiple);
  const logMax = Math.log10(maxMultiple);
  const decades = logMax - logMin;
  const totalPoints = Math.ceil(decades * pointsPerDecade);

  for (let i = 0; i <= totalPoints; i++) {
    const logRatio = logMin + (decades * i) / totalPoints;
    const ratio = Math.pow(10, logRatio);
    const currentA = pickupCurrentA * ratio;
    const timeS = curveTime(standard, tms, pickupCurrentA, currentA, definiteTimeS);
    if (Number.isFinite(timeS) && timeS > 0) {
      points.push({ currentA, timeS });
    }
  }
  return points;
}

/**
 * Test selektywności na konkretnym prądzie zwarciowym.
 */
export function operateTimeAt(
  standard: CurveStandard,
  tms: number,
  pickup: number,
  faultCurrent: number,
  definiteTimeS = 0,
): number {
  return curveTime(standard, tms, pickup, faultCurrent, definiteTimeS);
}

export function describeCurveStandard(standard: CurveStandard): string {
  const descriptions: Record<CurveStandard, string> = {
    IEC_SI: 'IEC Standard Inverse — uniwersalna, najczęściej stosowana w SN.',
    IEC_VI: 'IEC Very Inverse — większa selektywność dla zwarć daleko od źródła.',
    IEC_EI: 'IEC Extremely Inverse — najszybsza dla wysokich krotności.',
    IEC_LTI: 'IEC Long-Time Inverse — dla silników/transformatorów.',
    IEEE_MI: 'IEEE Moderately Inverse — odpowiednik IEC SI ale z offsetem B.',
    IEEE_VI: 'IEEE Very Inverse — strome opadanie krzywej.',
    IEEE_EI: 'IEEE Extremely Inverse — bardzo strome dla zabezpieczeń liniowych.',
    DT: 'Definite Time — stały czas niezależnie od prądu (do nastaw kopii).',
  };
  return descriptions[standard];
}
