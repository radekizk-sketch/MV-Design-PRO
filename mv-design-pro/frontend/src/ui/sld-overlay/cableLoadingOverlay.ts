/**
 * cableLoadingOverlay — wskaźniki obciążenia kabli na SLD (Etap 11 z planu).
 *
 * "Overlay na SLD: heat map napięć, wskaźniki obciążenia kabli"
 *
 * Klasyfikacja:
 * - low: ≤50% ampacity (zielony cienka kreska)
 * - normal: 50-80% (zielony pogrubiona)
 * - high: 80-100% (pomarańczowy)
 * - overload: >100% (czerwony pogrubiona + ostrzeżenie)
 *
 * Pure helpers — bez fizyki.
 */

export type CableLoadingVerdict = 'low' | 'normal' | 'high' | 'overload';

export interface CableLoadingEntry {
  cableRef: string;
  loadCurrentA: number;
  ampacityA: number;
  utilizationPercent: number;
  verdict: CableLoadingVerdict;
  color: string;
  strokeWidth: number;
  label: string;
}

const COLORS: Record<CableLoadingVerdict, string> = {
  low: '#16a34a',
  normal: '#16a34a',
  high: '#ea580c',
  overload: '#dc2626',
};

const STROKE_WIDTHS: Record<CableLoadingVerdict, number> = {
  low: 1.5,
  normal: 2.5,
  high: 3,
  overload: 3.5,
};

const LABELS: Record<CableLoadingVerdict, string> = {
  low: 'Niskie obciążenie',
  normal: 'Normalne obciążenie',
  high: 'Wysokie obciążenie',
  overload: 'Przeciążenie',
};

export function classifyCableLoading(utilization: number): CableLoadingVerdict {
  if (utilization > 1.0) return 'overload';
  if (utilization > 0.8) return 'high';
  if (utilization > 0.5) return 'normal';
  return 'low';
}

export interface CableLoadingInput {
  cableRef: string;
  loadCurrentA: number;
  ampacityA: number;
}

export function buildCableLoadingEntry(input: CableLoadingInput): CableLoadingEntry {
  const utilization = input.ampacityA > 0 ? input.loadCurrentA / input.ampacityA : 0;
  const utilizationPercent = Math.round(utilization * 1000) / 10;
  const verdict = classifyCableLoading(utilization);

  return {
    cableRef: input.cableRef,
    loadCurrentA: input.loadCurrentA,
    ampacityA: input.ampacityA,
    utilizationPercent,
    verdict,
    color: COLORS[verdict],
    strokeWidth: STROKE_WIDTHS[verdict],
    label: LABELS[verdict],
  };
}

export function buildCableLoadingOverlay(
  inputs: CableLoadingInput[],
): CableLoadingEntry[] {
  return inputs.map(buildCableLoadingEntry);
}

export function summarizeCableLoading(
  entries: CableLoadingEntry[],
): {
  totalCables: number;
  overloaded: number;
  highLoad: number;
  averageUtilizationPercent: number;
  worstCase: CableLoadingEntry | null;
} {
  if (entries.length === 0) {
    return {
      totalCables: 0,
      overloaded: 0,
      highLoad: 0,
      averageUtilizationPercent: 0,
      worstCase: null,
    };
  }
  const overloaded = entries.filter((e) => e.verdict === 'overload').length;
  const highLoad = entries.filter((e) => e.verdict === 'high').length;
  const avg = entries.reduce((s, e) => s + e.utilizationPercent, 0) / entries.length;
  const worstCase = entries.reduce((max, e) =>
    e.utilizationPercent > max.utilizationPercent ? e : max,
  );
  return {
    totalCables: entries.length,
    overloaded,
    highLoad,
    averageUtilizationPercent: Math.round(avg * 10) / 10,
    worstCase,
  };
}
