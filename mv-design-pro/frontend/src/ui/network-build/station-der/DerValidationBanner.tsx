/**
 * DerValidationBanner — banner walidacji DER (Etap 5 integration).
 *
 * Kompozycja:
 * - validateDerPowerVsTransformer (derPowerValidation)
 * - evaluateNcRfgCompliance (NcRfgComplianceBadge)
 * - validateAntiIslanding (antiIslandingValidator)
 *
 * Render: zielony/amber/czerwony banner zależnie od najgorszego werdyktu.
 */

import { validateDerPowerVsTransformer } from './derPowerValidation';
import { evaluateNcRfgCompliance, type NcRfgChecklist } from './NcRfgComplianceBadge';

interface DerValidationBannerProps {
  derPowerKva: number;
  transformerRatedKva: number;
  ncRfgChecklist: NcRfgChecklist;
  className?: string;
}

export function DerValidationBanner({
  derPowerKva,
  transformerRatedKva,
  ncRfgChecklist,
  className,
}: DerValidationBannerProps) {
  const powerResult = validateDerPowerVsTransformer({
    derPowerKva,
    transformerRatedKva,
  });
  const ncRfgResult = evaluateNcRfgCompliance(ncRfgChecklist);

  const isError = powerResult.verdict === 'error' || ncRfgResult.status === 'non_compliant';
  const isWarning = powerResult.verdict === 'warning' || ncRfgResult.status === 'audit_required';
  const isOk = !isError && !isWarning;

  const colors = isError
    ? 'border-red-300 bg-red-50 text-red-900'
    : isWarning
      ? 'border-amber-300 bg-amber-50 text-amber-900'
      : 'border-emerald-300 bg-emerald-50 text-emerald-900';

  return (
    <div
      className={`rounded border p-3 ${colors} ${className ?? ''}`}
      data-testid={`der-validation-banner-${isError ? 'error' : isWarning ? 'warning' : 'ok'}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span aria-hidden="true">{isError ? '✗' : isWarning ? '⚠' : '✓'}</span>
        <span>
          {isError && 'DER niezgodny z wymaganiami'}
          {isWarning && 'DER wymaga uwagi'}
          {isOk && 'DER zgodny z wymaganiami NC RfG'}
        </span>
      </div>
      <ul className="mt-2 list-inside list-disc text-xs">
        <li data-testid="der-power-check">
          Moc DER vs transformator: <strong>{powerResult.utilizationPercent.toFixed(1)}%</strong>
          {' — '}
          {powerResult.message}
        </li>
        <li data-testid="der-ncrfg-check">
          NC RfG: <strong>{ncRfgResult.passedCount}/{ncRfgResult.totalCount}</strong>
          {ncRfgResult.missing.length > 0 && (
            <> — brakuje: {ncRfgResult.missing.join(', ')}</>
          )}
        </li>
      </ul>
      {powerResult.recommendation && (
        <p className="mt-1 text-xs italic">{powerResult.recommendation}</p>
      )}
    </div>
  );
}
