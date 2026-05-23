/**
 * powerBalanceCalculator — bilans mocy do wniosku OSD (Etap 13 z planu).
 *
 * "Power balance auto-update z LF wyników (ΣP_źródło - ΣP_odbiory - ΣP_DER ± Δstraty)"
 *
 * Wymagany do wniosku przyłączeniowego:
 * - moc zainstalowana
 * - moc szczytowa (maksymalna)
 * - moc minimalna (off-peak)
 * - bilans całkowity (powinien być ≈ 0 dla obu kierunków)
 */

export interface PowerSource {
  ref: string;
  name: string;
  type: 'grid' | 'der_pv' | 'der_bess' | 'der_fw' | 'genset' | 'ups';
  pInstalledMw: number;
  pPeakMw: number;
  pMinMw: number;
}

export interface PowerLoad {
  ref: string;
  name: string;
  type: 'residential' | 'industrial' | 'service' | 'agriculture';
  pPeakMw: number;
  pAverageMw: number;
}

export interface PowerLossesEstimate {
  transformerLossesMw: number;
  cableLossesMw: number;
  totalLossesMw: number;
}

export interface PowerBalanceInput {
  sources: PowerSource[];
  loads: PowerLoad[];
  losses: PowerLossesEstimate;
}

export interface PowerBalanceResult {
  totalInstalledMw: number;
  totalPeakSourceMw: number;
  totalMinSourceMw: number;
  totalPeakLoadMw: number;
  totalAverageLoadMw: number;
  derInstalledMw: number;
  conventionalSourceMw: number;
  netBalancePeakMw: number;
  netBalanceMinMw: number;
  selfConsumptionRatio: number;
  exportPotentialMw: number;
  warnings: string[];
}

export function calculatePowerBalance({
  sources,
  loads,
  losses,
}: PowerBalanceInput): PowerBalanceResult {
  const totalInstalledMw = sources.reduce((s, src) => s + src.pInstalledMw, 0);
  const totalPeakSourceMw = sources.reduce((s, src) => s + src.pPeakMw, 0);
  const totalMinSourceMw = sources.reduce((s, src) => s + src.pMinMw, 0);
  const totalPeakLoadMw = loads.reduce((s, l) => s + l.pPeakMw, 0);
  const totalAverageLoadMw = loads.reduce((s, l) => s + l.pAverageMw, 0);

  const derSources = sources.filter((s) =>
    ['der_pv', 'der_bess', 'der_fw'].includes(s.type),
  );
  const derInstalledMw = derSources.reduce((s, src) => s + src.pInstalledMw, 0);
  const conventionalSourceMw = totalInstalledMw - derInstalledMw;

  const netBalancePeakMw = totalPeakSourceMw - totalPeakLoadMw - losses.totalLossesMw;
  const netBalanceMinMw = totalMinSourceMw - totalAverageLoadMw - losses.totalLossesMw;

  const selfConsumptionRatio =
    totalPeakLoadMw > 0 ? Math.min(1, totalPeakLoadMw / totalPeakSourceMw) : 0;
  const exportPotentialMw = Math.max(0, totalPeakSourceMw - totalPeakLoadMw - losses.totalLossesMw);

  const warnings: string[] = [];

  if (totalInstalledMw === 0) {
    warnings.push('Brak źródeł zasilania w bilansie.');
  }
  if (totalPeakLoadMw === 0 && derInstalledMw === 0) {
    warnings.push('Brak odbiorów i źródeł DER — pusty projekt.');
  }
  if (netBalancePeakMw < -0.01) {
    warnings.push(
      `Bilans szczytowy ujemny (deficit ${(-netBalancePeakMw).toFixed(3)} MW) — sieć wymaga dosypki z GPZ.`,
    );
  }
  if (netBalanceMinMw > 0.01 && derInstalledMw > 0) {
    warnings.push(
      `W godzinach niskiego obciążenia DER generuje nadmiar ${netBalanceMinMw.toFixed(3)} MW (eksport do sieci).`,
    );
  }
  if (losses.totalLossesMw > totalPeakSourceMw * 0.1 && totalPeakSourceMw > 0) {
    warnings.push(
      `Straty ${losses.totalLossesMw.toFixed(3)} MW > 10% mocy źródłowej — sprawdź konfigurację sieci.`,
    );
  }

  return {
    totalInstalledMw,
    totalPeakSourceMw,
    totalMinSourceMw,
    totalPeakLoadMw,
    totalAverageLoadMw,
    derInstalledMw,
    conventionalSourceMw,
    netBalancePeakMw,
    netBalanceMinMw,
    selfConsumptionRatio,
    exportPotentialMw,
    warnings,
  };
}

export function formatPowerBalanceForOsd(result: PowerBalanceResult): string {
  const lines = [
    `Moc zainstalowana: ${result.totalInstalledMw.toFixed(3)} MW`,
    `  - źródła konwencjonalne: ${result.conventionalSourceMw.toFixed(3)} MW`,
    `  - DER (PV/BESS/FW): ${result.derInstalledMw.toFixed(3)} MW`,
    `Moc szczytowa odbiorów: ${result.totalPeakLoadMw.toFixed(3)} MW`,
    `Bilans szczytowy: ${result.netBalancePeakMw >= 0 ? '+' : ''}${result.netBalancePeakMw.toFixed(3)} MW`,
    `Potencjał eksportu: ${result.exportPotentialMw.toFixed(3)} MW`,
    `Współczynnik własnego użycia: ${(result.selfConsumptionRatio * 100).toFixed(1)}%`,
  ];
  return lines.join('\n');
}
