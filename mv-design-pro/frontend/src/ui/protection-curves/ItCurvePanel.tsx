/**
 * Audyt E, faza E-4 — panel „Krzywa I-t" dla funkcji nadprądowej.
 *
 * Wpina krzywą czasowo-prądową (I-t) z pola `it_curve` widoku zabezpieczeń
 * (`settings_summary.functions[].it_curve`, solver IEC 60255) do wykresu
 * log-log `TimeCurrentChart`. Gdy krzywa niedostępna (`it_curve === null`),
 * pokazuje UCZCIWY stan „brak danych" z przyczyną po polsku wyprowadzoną
 * z `it_curve_missing_data`.
 *
 * ZASADA (BINDING): ZERO fizyki w UI — punkty pochodzą wyłącznie z backendu,
 * panel je tylko rysuje/opisuje. Brak fabrykacji punktów.
 */

import { useMemo } from 'react';
import type { ProtectionFunctionItCurve } from '../protection';
import { TimeCurrentChart } from './TimeCurrentChart';
import { DEFAULT_CHART_CONFIG } from './types';
import {
  itCurveMissingReasonsPl,
  itCurveToProtectionCurve,
} from './itCurveAdapter';

interface ItCurvePanelProps {
  /** Krzywa I-t z backendu (lub null/brak gdy niedostępna) */
  itCurve?: ProtectionFunctionItCurve | null;

  /** Kody braku danych krzywej (np. ["time_multiplier"]) */
  itCurveMissingData?: string[];

  /** Stabilny identyfikator krzywej na wykresie (np. kod funkcji) */
  curveId: string;
}

/** Formatowanie liczby w konwencji polskiej (przecinek dziesiętny). */
function fmtPl(value: number, digits: number): string {
  return value.toFixed(digits).replace('.', ',');
}

/**
 * Panel krzywej I-t pojedynczej funkcji nadprądowej.
 *
 * Renderuje nagłówek „Krzywa I-t", a następnie:
 * - gdy `itCurve` z punktami → mini-wykres log-log + podsumowanie liczbowe,
 * - gdy brak → uczciwy stan zerowy z przyczyną.
 */
export function ItCurvePanel({
  itCurve,
  itCurveMissingData,
  curveId,
}: ItCurvePanelProps) {
  const chartConfig = useMemo(
    () => ({
      ...DEFAULT_CHART_CONFIG,
      height: 200,
      showFaultMarkers: false,
    }),
    [],
  );

  const protectionCurve = useMemo(
    () =>
      itCurve && itCurve.points.length > 0
        ? itCurveToProtectionCurve(itCurve, curveId)
        : null,
    [itCurve, curveId],
  );

  const hasCurve = protectionCurve !== null && itCurve != null;

  return (
    <div
      className="mt-2 rounded border border-slate-200 bg-white p-2"
      data-testid="it-curve-panel"
    >
      <div className="mb-1 text-xs font-medium text-slate-700">Krzywa I-t</div>

      {hasCurve ? (
        <>
          <div data-testid="it-curve-chart">
            <TimeCurrentChart curves={[protectionCurve!]} config={chartConfig} />
          </div>
          <div
            className="mt-1 text-xs text-slate-500"
            data-testid="it-curve-summary"
          >
            {itCurve!.curve_label_pl} · {itCurve!.points.length} pkt · Ip ={' '}
            {fmtPl(itCurve!.pickup_a, 0)} A
          </div>
        </>
      ) : (
        <div
          className="rounded bg-slate-50 p-2 text-xs italic text-slate-500"
          data-testid="it-curve-missing"
        >
          <div className="not-italic font-medium text-slate-600">
            Brak danych krzywej I-t
          </div>
          <ul className="mt-1 list-disc pl-4">
            {itCurveMissingReasonsPl(itCurveMissingData).map((reason, index) => (
              <li key={`${index}-${reason}`}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default ItCurvePanel;
