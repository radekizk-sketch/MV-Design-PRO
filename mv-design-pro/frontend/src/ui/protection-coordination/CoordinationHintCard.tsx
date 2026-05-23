/**
 * CoordinationHintCard — wizualizacja werdyktu selektywności (Etap 7 z planu).
 *
 * "Real-time selectivity validation: hint 'zwiększ TMS o 0.15 dla ∆t=0.35s'"
 *
 * Kompozycyjny komponent — konsumuje `evaluateCoordination()` z `tmsCoordination.ts`.
 */

import { evaluateCoordination, type ProtectionPair, type CoordinationVerdict } from './tmsCoordination';

interface CoordinationHintCardProps {
  pair: ProtectionPair;
  className?: string;
  onApplyAdjustment?: (newTms: number) => void;
}

export function CoordinationHintCard({
  pair,
  className,
  onApplyAdjustment,
}: CoordinationHintCardProps) {
  const verdict = evaluateCoordination(pair);

  return (
    <div
      className={`flex flex-col gap-2 rounded border p-3 ${verdictBg(verdict)} ${className ?? ''}`}
      data-testid={`coordination-hint-${verdict.selective ? 'selective' : 'non-selective'}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="text-lg">
          {verdict.selective ? '✓' : '⚠'}
        </span>
        <strong className="text-sm">
          {verdict.selective ? 'Koordynacja zachowana' : 'Brak selektywności'}
        </strong>
        <span className="text-xs text-slate-600">
          (∆t = {verdict.actualCti.toFixed(3)} s)
        </span>
      </div>
      <p className="text-xs text-slate-700">{verdict.message}</p>
      {!verdict.selective && verdict.recommendedTmsAdjustment !== undefined && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-600">
            Sugerowana korekta TMS upstream: <strong>+{verdict.recommendedTmsAdjustment.toFixed(3)}</strong>
          </span>
          {onApplyAdjustment ? (
            <button
              type="button"
              onClick={() => onApplyAdjustment(pair.upstream.tms + (verdict.recommendedTmsAdjustment ?? 0))}
              className="rounded bg-amber-500 px-2 py-0.5 text-xs font-semibold text-slate-950 hover:bg-amber-400"
              data-testid="coordination-apply-tms"
              title="Zastosuj sugerowaną korektę TMS"
            >
              Zastosuj
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function verdictBg(verdict: CoordinationVerdict): string {
  return verdict.selective ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50';
}
