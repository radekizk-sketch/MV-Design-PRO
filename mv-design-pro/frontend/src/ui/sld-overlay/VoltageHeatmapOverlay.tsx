/**
 * VoltageHeatmapOverlay — kolorowanie szyn na SLD wg napięcia (Etap 11 z planu).
 *
 * Mapowanie:
 * - U ≥ 1.10 p.u. → czerwony (over-voltage)
 * - 1.05 ≤ U < 1.10 → pomarańczowy (warning high)
 * - 0.95 ≤ U < 1.05 → zielony (normal)
 * - 0.90 ≤ U < 0.95 → pomarańczowy (warning low)
 * - U < 0.90 p.u. → czerwony (under-voltage)
 *
 * Norma: PN-EN 50160 dopuszczalne wahania napięcia ±10% Un.
 */

export type VoltageVerdict = 'over' | 'warning_high' | 'normal' | 'warning_low' | 'under';

export interface VoltageHeatmapEntry {
  busRef: string;
  voltagePu: number;
  verdict: VoltageVerdict;
  color: string;
  label: string;
}

const COLORS: Record<VoltageVerdict, string> = {
  over: '#dc2626', // red-600
  warning_high: '#ea580c', // orange-600
  normal: '#16a34a', // green-600
  warning_low: '#ea580c',
  under: '#dc2626',
};

const LABELS: Record<VoltageVerdict, string> = {
  over: 'Przekroczenie napięcia (> +10% Un)',
  warning_high: 'Napięcie podwyższone (+5% do +10%)',
  normal: 'Napięcie w normie (±5%)',
  warning_low: 'Napięcie obniżone (-5% do -10%)',
  under: 'Spadek napięcia (< -10% Un)',
};

export function classifyVoltage(voltagePu: number): VoltageVerdict {
  if (voltagePu >= 1.10) return 'over';
  if (voltagePu >= 1.05) return 'warning_high';
  if (voltagePu >= 0.95) return 'normal';
  if (voltagePu >= 0.90) return 'warning_low';
  return 'under';
}

export function buildVoltageHeatmap(
  busVoltages: Array<{ busRef: string; voltagePu: number }>,
): VoltageHeatmapEntry[] {
  return busVoltages.map((entry) => {
    const verdict = classifyVoltage(entry.voltagePu);
    return {
      busRef: entry.busRef,
      voltagePu: entry.voltagePu,
      verdict,
      color: COLORS[verdict],
      label: LABELS[verdict],
    };
  });
}

interface VoltageHeatmapLegendProps {
  className?: string;
}

export function VoltageHeatmapLegend({ className }: VoltageHeatmapLegendProps) {
  const entries: Array<{ verdict: VoltageVerdict; range: string }> = [
    { verdict: 'over', range: '≥ +10%' },
    { verdict: 'warning_high', range: '+5% do +10%' },
    { verdict: 'normal', range: '±5%' },
    { verdict: 'warning_low', range: '-5% do -10%' },
    { verdict: 'under', range: '< -10%' },
  ];
  return (
    <div
      className={`flex flex-col gap-1 rounded border border-slate-300 bg-white p-2 text-xs ${className ?? ''}`}
      data-testid="voltage-heatmap-legend"
    >
      <div className="font-semibold text-slate-700">Heatmap napięć (PN-EN 50160)</div>
      {entries.map((entry) => (
        <div key={entry.verdict} className="flex items-center gap-2">
          <span
            className="inline-block h-3 w-3 rounded"
            style={{ backgroundColor: COLORS[entry.verdict] }}
            aria-hidden="true"
          />
          <span className="text-slate-600">{entry.range}</span>
          <span className="text-slate-500">— {LABELS[entry.verdict]}</span>
        </div>
      ))}
    </div>
  );
}
