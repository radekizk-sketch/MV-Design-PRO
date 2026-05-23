/**
 * comparisonDeltaVisualization — delta visualization na SLD (Etap 18 z planu).
 *
 * "Delta visualization na SLD: kolorowanie elementów wg zmiany
 *  (czerwony=pogorszenie, zielony=poprawa)"
 *
 * Pure helpers do mapowania delta → kolor + severity.
 */

export type DeltaDirection = 'improved' | 'degraded' | 'unchanged';

export interface DeltaEntry {
  elementRef: string;
  valueA: number;
  valueB: number;
  deltaAbsolute: number;
  deltaRelative: number;
  metric: string;
}

export interface DeltaVisualizationEntry extends DeltaEntry {
  direction: DeltaDirection;
  color: string;
  severityScore: number;
  label: string;
}

/**
 * Metryki gdzie INCREASE = poprawa (np. napięcie w sieci niedoobciążonej).
 */
const METRICS_HIGHER_IS_BETTER = new Set([
  'voltage_pu',
  'reserve_margin',
  'reliability',
  'power_factor',
]);

/**
 * Metryki gdzie INCREASE = pogorszenie (np. straty, prąd zwarciowy, obciążenie).
 */
const METRICS_LOWER_IS_BETTER = new Set([
  'losses',
  'short_circuit_current',
  'loading',
  'voltage_drop',
  'thd',
]);

const SIGNIFICANT_THRESHOLD_REL = 0.05; // 5% zmiany jako progu istotności

export function classifyDirection(
  metric: string,
  deltaRelative: number,
): DeltaDirection {
  if (Math.abs(deltaRelative) < SIGNIFICANT_THRESHOLD_REL) {
    return 'unchanged';
  }
  if (METRICS_HIGHER_IS_BETTER.has(metric)) {
    return deltaRelative > 0 ? 'improved' : 'degraded';
  }
  if (METRICS_LOWER_IS_BETTER.has(metric)) {
    return deltaRelative < 0 ? 'improved' : 'degraded';
  }
  // Default: assume HIGHER = improved
  return deltaRelative > 0 ? 'improved' : 'degraded';
}

const DIRECTION_COLORS: Record<DeltaDirection, string> = {
  improved: '#16a34a', // green-600
  degraded: '#dc2626', // red-600
  unchanged: '#94a3b8', // slate-400
};

const DIRECTION_LABELS: Record<DeltaDirection, string> = {
  improved: 'Poprawa',
  degraded: 'Pogorszenie',
  unchanged: 'Bez zmian',
};

export function severityScore(deltaRelative: number): number {
  return Math.min(100, Math.round(Math.abs(deltaRelative) * 100));
}

export function buildDeltaVisualization(entries: DeltaEntry[]): DeltaVisualizationEntry[] {
  return entries.map((entry) => {
    const direction = classifyDirection(entry.metric, entry.deltaRelative);
    return {
      ...entry,
      direction,
      color: DIRECTION_COLORS[direction],
      severityScore: severityScore(entry.deltaRelative),
      label: DIRECTION_LABELS[direction],
    };
  });
}

export function summarizeDeltaVisualization(
  entries: DeltaVisualizationEntry[],
): {
  improvedCount: number;
  degradedCount: number;
  unchangedCount: number;
  averageSeverity: number;
  worstDegradation: DeltaVisualizationEntry | null;
  bestImprovement: DeltaVisualizationEntry | null;
} {
  const improved = entries.filter((e) => e.direction === 'improved');
  const degraded = entries.filter((e) => e.direction === 'degraded');
  const unchanged = entries.filter((e) => e.direction === 'unchanged');

  const avgSeverity = entries.length > 0
    ? entries.reduce((sum, e) => sum + e.severityScore, 0) / entries.length
    : 0;

  const worstDegradation = degraded.length > 0
    ? degraded.reduce((max, e) => (e.severityScore > max.severityScore ? e : max))
    : null;

  const bestImprovement = improved.length > 0
    ? improved.reduce((max, e) => (e.severityScore > max.severityScore ? e : max))
    : null;

  return {
    improvedCount: improved.length,
    degradedCount: degraded.length,
    unchangedCount: unchanged.length,
    averageSeverity: Math.round(avgSeverity * 10) / 10,
    worstDegradation,
    bestImprovement,
  };
}
