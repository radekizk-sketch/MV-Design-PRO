/**
 * CableValidationBanner — kompozycja walidacji kabla (Etap 3/4 z planu).
 *
 * Łączy:
 * - validateCableAmpacity (obciążalność termiczna + zwarciowa)
 * - calculateVoltageDrop (spadek napięcia)
 *
 * Wyświetla worst-case verdict + listę violations + rekomendacje.
 */

import { validateCableAmpacity, type CableType, type AmpacityVerdict } from './cableAmpacityValidator';
import { calculateVoltageDrop, type DropVerdict } from './voltageDropValidator';

interface CableValidationBannerProps {
  cableType: CableType;
  lengthKm: number;
  crossSectionMm2: number;
  ratedAmpacityA: number;
  loadCurrentA: number;
  shortCircuitKa: number;
  shortCircuitDurationS: number;
  cableResistanceOhmPerKm: number;
  cableReactanceOhmPerKm: number;
  cosPhi: number;
  systemVoltageKv: number;
  voltageLevel?: 'SN' | 'WN';
  className?: string;
}

export function CableValidationBanner({
  cableType,
  lengthKm,
  crossSectionMm2,
  ratedAmpacityA,
  loadCurrentA,
  shortCircuitKa,
  shortCircuitDurationS,
  cableResistanceOhmPerKm,
  cableReactanceOhmPerKm,
  cosPhi,
  systemVoltageKv,
  voltageLevel = 'SN',
  className,
}: CableValidationBannerProps) {
  const ampResult = validateCableAmpacity({
    cableType,
    lengthKm,
    crossSectionMm2,
    ratedAmpacityA,
    loadCurrentA,
    shortCircuitKa,
    shortCircuitDurationS,
    voltageLevel,
  });

  const dropResult = calculateVoltageDrop({
    loadCurrentA,
    cableLengthKm: lengthKm,
    cableResistanceOhmPerKm,
    cableReactanceOhmPerKm,
    cosPhi,
    systemVoltageKv,
  });

  const worstVerdict = worstOf(ampResult.verdict, dropResult.verdict);

  return (
    <div
      className={`rounded border p-3 ${bannerColors(worstVerdict)} ${className ?? ''}`}
      data-testid={`cable-validation-banner-${worstVerdict}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span aria-hidden="true">{iconFor(worstVerdict)}</span>
        <span>{titleFor(worstVerdict)}</span>
      </div>
      <ul className="mt-2 list-inside list-disc text-xs">
        <li data-testid="cable-ampacity-check">
          Obciążalność: <strong>{ampResult.ampacityUtilization.toFixed(1)}%</strong>
          {ampResult.thermalShortCircuitMm2 > 0 && (
            <> (zwarcie wymaga ≥ {ampResult.thermalShortCircuitMm2} mm²)</>
          )}
        </li>
        <li data-testid="cable-voltage-drop-check">
          Spadek napięcia: <strong>{dropResult.voltageDropPercent.toFixed(2)}%</strong>
          {' — '}
          {dropResult.message.replace(`Spadek napięcia ${dropResult.voltageDropPercent.toFixed(2)}% `, '')}
        </li>
      </ul>
      {ampResult.issues.length > 0 && (
        <ul className="mt-1 list-inside list-disc text-xs text-slate-700">
          {ampResult.issues.map((issue, idx) => (
            <li key={`amp-${idx}`} data-testid={`cable-amp-issue-${idx}`}>{issue}</li>
          ))}
        </ul>
      )}
      {(ampResult.recommendation || dropResult.recommendation) && (
        <p className="mt-1 text-xs italic">
          {ampResult.recommendation ?? dropResult.recommendation}
        </p>
      )}
    </div>
  );
}

function worstOf(
  amp: AmpacityVerdict,
  drop: DropVerdict,
): AmpacityVerdict | DropVerdict {
  if (amp === 'error' || drop === 'error') return 'error';
  if (amp === 'warning' || drop === 'warning') return 'warning';
  return 'ok';
}

function bannerColors(verdict: string): string {
  if (verdict === 'error') return 'border-red-300 bg-red-50 text-red-900';
  if (verdict === 'warning') return 'border-amber-300 bg-amber-50 text-amber-900';
  return 'border-emerald-300 bg-emerald-50 text-emerald-900';
}

function iconFor(verdict: string): string {
  return verdict === 'error' ? '✗' : verdict === 'warning' ? '⚠' : '✓';
}

function titleFor(verdict: string): string {
  return verdict === 'error'
    ? 'Kabel nie spełnia wymagań'
    : verdict === 'warning'
      ? 'Kabel wymaga sprawdzenia'
      : 'Kabel spełnia wymagania';
}
