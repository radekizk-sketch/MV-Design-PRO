/**
 * sensitivityAnalyzer — analiza wrażliwości pure helpers (Etap 10 z planu).
 *
 * "Sensitivity Analysis UI (NOWY): czułość napięcia na zmianę P/Q, czułość strat na config"
 *
 * Analiza wrażliwości:
 * - dU/dP — jak napięcie szyny zmienia się przy zmianie mocy czynnej
 * - dU/dQ — jak napięcie szyny zmienia się przy zmianie mocy biernej
 * - dStraty/dP — jak straty zmieniają się przy zmianie mocy
 *
 * Metoda: linearyzacja wokół punktu pracy (Jacobian z PF solvera).
 */

export interface SensitivityPoint {
  busRef: string;
  dUdP: number;
  dUdQ: number;
  dLossesdP?: number;
}

export interface SensitivityAnalysisResult {
  points: SensitivityPoint[];
  mostSensitiveToP: SensitivityPoint | null;
  mostSensitiveToQ: SensitivityPoint | null;
  averageSensitivityP: number;
  averageSensitivityQ: number;
}

export function analyzeSensitivity(points: SensitivityPoint[]): SensitivityAnalysisResult {
  if (points.length === 0) {
    return {
      points: [],
      mostSensitiveToP: null,
      mostSensitiveToQ: null,
      averageSensitivityP: 0,
      averageSensitivityQ: 0,
    };
  }

  const mostP = points.reduce((max, p) =>
    Math.abs(p.dUdP) > Math.abs(max.dUdP) ? p : max,
  );
  const mostQ = points.reduce((max, p) =>
    Math.abs(p.dUdQ) > Math.abs(max.dUdQ) ? p : max,
  );

  const sumP = points.reduce((sum, p) => sum + Math.abs(p.dUdP), 0);
  const sumQ = points.reduce((sum, p) => sum + Math.abs(p.dUdQ), 0);

  return {
    points,
    mostSensitiveToP: mostP,
    mostSensitiveToQ: mostQ,
    averageSensitivityP: sumP / points.length,
    averageSensitivityQ: sumQ / points.length,
  };
}

export function classifySensitivity(sensitivity: number): 'low' | 'medium' | 'high' {
  const abs = Math.abs(sensitivity);
  if (abs < 0.01) return 'low';
  if (abs < 0.05) return 'medium';
  return 'high';
}

export function describeSensitivity(point: SensitivityPoint): string {
  const dudpClass = classifySensitivity(point.dUdP);
  const dudqClass = classifySensitivity(point.dUdQ);
  return (
    `${point.busRef}: dU/dP=${point.dUdP.toFixed(4)} (${dudpClass}), `
    + `dU/dQ=${point.dUdQ.toFixed(4)} (${dudqClass})`
  );
}

/**
 * Identyfikuje szyny z wysoką wrażliwością → kandydaci do regulacji napięcia (kompensatory).
 */
export function findCompensationCandidates(
  result: SensitivityAnalysisResult,
  threshold = 0.05,
): SensitivityPoint[] {
  return result.points.filter(
    (p) => Math.abs(p.dUdQ) >= threshold,
  );
}

/**
 * Symuluje wpływ DER (P, Q) na napięcie wszystkich szyn (linearyzacja).
 */
export function simulateDerImpact(
  sensitivity: SensitivityAnalysisResult,
  derPowerMw: number,
  derQMvar: number,
): Array<{ busRef: string; deltaUpu: number }> {
  return sensitivity.points.map((p) => ({
    busRef: p.busRef,
    deltaUpu: p.dUdP * derPowerMw + p.dUdQ * derQMvar,
  }));
}
