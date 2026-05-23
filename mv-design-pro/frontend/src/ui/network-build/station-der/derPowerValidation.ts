/**
 * derPowerValidation — walidacja mocy DER vs transformator (Etap 5 z planu).
 *
 * Pure helpers — bez side-effects, deterministyczne. Klient UI używa do
 * real-time feedback w AddDerWizard / RenewableSourceCard.
 *
 * Reguły:
 * - DER moc ≤ 80% mocy transformatora → OK
 * - DER moc 80-100% → WARNING (margines termiczny zbyt mały)
 * - DER moc > 100% → ERROR (przekroczenie nominalnej mocy transformatora)
 *
 * Norma: rule_der_must_match_bay_type + rule_der_power_vs_transformer
 * (backend semantic_rules).
 */

export type DerPowerVerdict = 'ok' | 'warning' | 'error';

export interface DerPowerValidationResult {
  verdict: DerPowerVerdict;
  utilizationPercent: number;
  message: string;
  recommendation?: string;
}

export interface DerPowerValidationInput {
  derPowerKva: number;
  transformerRatedKva: number;
  warningThreshold?: number;
  errorThreshold?: number;
}

const DEFAULT_WARNING_THRESHOLD = 0.8;
const DEFAULT_ERROR_THRESHOLD = 1.0;

export function validateDerPowerVsTransformer({
  derPowerKva,
  transformerRatedKva,
  warningThreshold = DEFAULT_WARNING_THRESHOLD,
  errorThreshold = DEFAULT_ERROR_THRESHOLD,
}: DerPowerValidationInput): DerPowerValidationResult {
  if (!Number.isFinite(derPowerKva) || derPowerKva <= 0) {
    return {
      verdict: 'error',
      utilizationPercent: 0,
      message: 'Moc DER musi być dodatnia.',
      recommendation: 'Sprawdź wartość mocy znamionowej źródła.',
    };
  }
  if (!Number.isFinite(transformerRatedKva) || transformerRatedKva <= 0) {
    return {
      verdict: 'error',
      utilizationPercent: Infinity,
      message: 'Brak danych mocy transformatora.',
      recommendation: 'Wybierz transformator z katalogu lub uzupełnij moc znamionową.',
    };
  }

  const utilization = derPowerKva / transformerRatedKva;
  const utilizationPercent = Math.round(utilization * 1000) / 10;

  if (utilization > errorThreshold) {
    const excess = derPowerKva - transformerRatedKva;
    return {
      verdict: 'error',
      utilizationPercent,
      message: `Moc DER (${derPowerKva.toFixed(0)} kVA) przekracza moc transformatora (${transformerRatedKva.toFixed(0)} kVA) o ${excess.toFixed(0)} kVA.`,
      recommendation: `Zmień transformator na większy (minimum ${derPowerKva.toFixed(0)} kVA) lub zmniejsz moc DER.`,
    };
  }
  if (utilization > warningThreshold) {
    return {
      verdict: 'warning',
      utilizationPercent,
      message: `Moc DER stanowi ${utilizationPercent.toFixed(1)}% mocy transformatora. Niewielki margines termiczny.`,
      recommendation: `Rozważ większy transformator dla bezpiecznego marginesu (zalecane ≤80%).`,
    };
  }
  return {
    verdict: 'ok',
    utilizationPercent,
    message: `Moc DER stanowi ${utilizationPercent.toFixed(1)}% mocy transformatora — w bezpiecznym zakresie.`,
  };
}

/**
 * Lista certyfikowanych inverterów PTPIREE — placeholder enrichment.
 * Konsumowane przez UI gdy user pyta "czy mój inverter jest certyfikowany".
 */
export function isInverterPtpireeCertified(manufacturerRef: string, modelRef: string): boolean {
  // Konsument powinien używać ptpireeCertifiedInverters.ts data source.
  // Tu placeholder dla typu danych.
  return manufacturerRef.length > 0 && modelRef.length > 0;
}
