/**
 * CableValidationBanner — kompozycja walidacji kabla (Etap 3/4 z planu).
 *
 * Łączy:
 * - validateCableAmpacity (obciążalność termiczna + zwarciowa)
 * - calculateVoltageDrop (spadek napięcia — fizyka ΔU liczona w backendzie)
 *
 * Wyświetla worst-case verdict + listę violations + rekomendacje. Spadek
 * napięcia pochodzi z końcówki solvera (asynchronicznie), z jawnym stanem
 * ładowania i uczciwym komunikatem błędu PL przy braku backendu.
 */

import { useEffect, useState } from 'react';

import { validateCableAmpacity, type CableType, type AmpacityVerdict } from './cableAmpacityValidator';
import { calculateVoltageDrop, type DropVerdict, type VoltageDropResult } from './voltageDropValidator';
import type { FlowDirection, ReactiveCharacter } from './cableVoltageDropApi';

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
  /**
   * Karta F-K5 (dług V12K-190): kierunek mocy czynnej. Dla toru przyłączenia
   * generacji („generation") ΔU jest WZROSTEM napięcia — i to on jest zwykle
   * ograniczeniem wiodącym. Brak pola = odbiór (zachowanie sprzed karty).
   */
  flowDirection?: FlowDirection;
  /** Charakter mocy biernej: pobór Q („inductive") tłumi wzrost od generacji. */
  reactiveCharacter?: ReactiveCharacter;
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
  flowDirection = 'load',
  reactiveCharacter = 'inductive',
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

  const [dropResult, setDropResult] = useState<VoltageDropResult | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setDropResult(null);

    void calculateVoltageDrop(
      {
        loadCurrentA,
        cableLengthKm: lengthKm,
        cableResistanceOhmPerKm,
        cableReactanceOhmPerKm,
        cosPhi,
        systemVoltageKv,
        flowDirection,
        reactiveCharacter,
      },
      { signal: controller.signal },
    )
      .then((result) => {
        if (controller.signal.aborted) {
          return;
        }
        setDropResult(result);
      })
      .catch(() => {
        if (controller.signal.aborted) {
          return;
        }
        setDropResult({
          verdict: 'error',
          voltageDropV: 0,
          voltageDropPercent: 0,
          message: 'Podgląd spadku napięcia niedostępny — backend solvera nie odpowiedział.',
        });
      });

    return () => controller.abort();
  }, [
    loadCurrentA,
    lengthKm,
    cableResistanceOhmPerKm,
    cableReactanceOhmPerKm,
    cosPhi,
    systemVoltageKv,
    flowDirection,
    reactiveCharacter,
  ]);

  const worstVerdict: AmpacityVerdict | DropVerdict = dropResult
    ? worstOf(ampResult.verdict, dropResult.verdict)
    : ampResult.verdict;

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
          {dropResult ? (
            <>
              Spadek napięcia: <strong>{dropResult.voltageDropPercent.toFixed(2)}%</strong>
              {' — '}
              {dropResult.message.replace(
                `Spadek napięcia ${dropResult.voltageDropPercent.toFixed(2)}% `,
                '',
              )}
            </>
          ) : (
            <>
              Spadek napięcia: <strong>obliczanie…</strong>
            </>
          )}
        </li>
      </ul>
      {ampResult.issues.length > 0 && (
        <ul className="mt-1 list-inside list-disc text-xs text-slate-700">
          {ampResult.issues.map((issue, idx) => (
            <li key={`amp-${idx}`} data-testid={`cable-amp-issue-${idx}`}>{issue}</li>
          ))}
        </ul>
      )}
      {(ampResult.recommendation || dropResult?.recommendation) && (
        <p className="mt-1 text-xs italic">
          {ampResult.recommendation ?? dropResult?.recommendation}
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
