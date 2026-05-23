/**
 * transformerLossesCalculator — straty transformatora (Etap 4 wsparcie).
 *
 * Straty całkowite = P_0 (jałowe) + β² × P_k (obciążeniowe)
 *
 * P_0 — straty jałowe (no-load losses) - stałe podczas pracy
 * P_k — straty obciążeniowe (load losses) przy β=1
 * β = S_load / S_n (obciążenie względne)
 *
 * Sprawność η = (P_out) / (P_out + P_straty)
 *
 * Norma: PN-EN 60076-1.
 */

export interface TransformerLossesInput {
  ratedPowerMva: number;
  noLoadLossesKw: number;
  loadLossesKw: number;
  loadingFactor: number;
  cosPhi: number;
}

export interface TransformerLossesResult {
  noLoadLossesKw: number;
  loadLossesKw: number;
  totalLossesKw: number;
  efficiency: number;
  efficiencyPercent: number;
  outputPowerMw: number;
}

export function calculateTransformerLosses({
  ratedPowerMva,
  noLoadLossesKw,
  loadLossesKw,
  loadingFactor,
  cosPhi,
}: TransformerLossesInput): TransformerLossesResult {
  const beta = Math.max(0, loadingFactor);
  const actualLoadLossesKw = loadLossesKw * beta * beta;
  const totalLossesKw = noLoadLossesKw + actualLoadLossesKw;
  const outputPowerMw = ratedPowerMva * beta * cosPhi;
  const outputPowerKw = outputPowerMw * 1000;
  const efficiency = outputPowerKw > 0 ? outputPowerKw / (outputPowerKw + totalLossesKw) : 0;

  return {
    noLoadLossesKw,
    loadLossesKw: actualLoadLossesKw,
    totalLossesKw,
    efficiency,
    efficiencyPercent: Math.round(efficiency * 10000) / 100,
    outputPowerMw,
  };
}

/**
 * Optymalne obciążenie z punktu widzenia strat:
 * β_opt = √(P_0 / P_k_nominal)
 */
export function calculateOptimalLoadingFactor(
  noLoadLossesKw: number,
  loadLossesKw: number,
): number {
  if (loadLossesKw <= 0) return 1;
  return Math.sqrt(noLoadLossesKw / loadLossesKw);
}

export function annualEnergyLossesKwh(
  losses: TransformerLossesResult,
  hoursPerYear = 8760,
  utilizationFactor = 0.5,
): {
  noLoadEnergyKwh: number;
  loadEnergyKwh: number;
  totalEnergyKwh: number;
} {
  const noLoadEnergyKwh = losses.noLoadLossesKw * hoursPerYear;
  const loadEnergyKwh = losses.loadLossesKw * hoursPerYear * utilizationFactor;
  return {
    noLoadEnergyKwh: Math.round(noLoadEnergyKwh),
    loadEnergyKwh: Math.round(loadEnergyKwh),
    totalEnergyKwh: Math.round(noLoadEnergyKwh + loadEnergyKwh),
  };
}
