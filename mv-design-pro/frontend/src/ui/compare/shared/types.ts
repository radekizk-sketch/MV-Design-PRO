/**
 * compare/shared/types — wspólne typy dla 3 modułów porównania (Pakiet I).
 *
 * STRATEGIA (binding, D6 — uporządkowanie BEZ konsolidacji):
 * - 3 moduły zachowują własne kontrakty (różne types.ts, różne API):
 *   - `compare/`        — A/B selektor runs + delta table
 *   - `comparison/`     — A/B comparison szyn/gałęzi (SLD_COMPARISON_MODE)
 *   - `comparisons/`    — SC + SLD delta overlay
 * - Ten plik definiuje WYŁĄCZNIE typy używane CROSS-MODULE
 *   (re-eksport, NIE refactor).
 * - `protection-comparison/` zostaje samodzielne (device-centric).
 *
 * NIE konsolidować w polimorficzny moduł — refactor podniósłby ryzyko
 * zmiany snapshot hash w `comparison/SLD_COMPARISON_MODE`.
 */

/**
 * Severity of a difference between A and B.
 * Wszystkie 3 moduły powinny używać tego enum'a, NIE własnych wariantów.
 */
export type DiffSeverity = 'none' | 'info' | 'minor' | 'major' | 'critical';

export const DIFF_SEVERITY_LABELS_PL: Readonly<Record<DiffSeverity, string>> = Object.freeze({
  none: 'Brak różnicy',
  info: 'Informacja',
  minor: 'Drobna',
  major: 'Istotna',
  critical: 'Krytyczna',
});

export const DIFF_SEVERITY_ORDER: Readonly<Record<DiffSeverity, number>> = Object.freeze({
  none: 0,
  info: 1,
  minor: 2,
  major: 3,
  critical: 4,
});

/**
 * Generic comparison row (A vs B).
 *
 * INVARIANT: każdy moduł porównawczy może rozszerzyć ten typ o własne pola
 * (np. `branch_id`, `bus_id`, `relay_id`), ale `metric_label`, `value_a`,
 * `value_b`, `delta`, `severity` są wspólne.
 */
export interface ComparisonRow {
  /** Etykieta metryki (PL) — wyświetlana w wierszu */
  metric_label: string;
  /** Wartość strony A (string lub number, format display-only) */
  value_a: string | number;
  /** Wartość strony B */
  value_b: string | number;
  /** Delta B − A (jeśli wyliczalna numerycznie) */
  delta?: number;
  /** Procentowa delta (B − A) / A * 100 */
  delta_percent?: number;
  /** Severity różnicy */
  severity: DiffSeverity;
  /** Jednostka (np. "kV", "%") — opcjonalna */
  unit?: string;
}

/**
 * Sortuje wiersze DESC po severity (krytyczne najpierw), tie-break metric_label ASC.
 * Pure function, deterministyczna.
 */
export function sortBySeverityDesc<T extends ComparisonRow>(rows: ReadonlyArray<T>): T[] {
  return [...rows].sort((a, b) => {
    const sevA = DIFF_SEVERITY_ORDER[a.severity];
    const sevB = DIFF_SEVERITY_ORDER[b.severity];
    if (sevA !== sevB) return sevB - sevA;
    return a.metric_label.localeCompare(b.metric_label);
  });
}

/**
 * Filtruje wiersze po minimalnym poziomie severity (≥ minSeverity).
 */
export function filterByMinSeverity<T extends ComparisonRow>(
  rows: ReadonlyArray<T>,
  minSeverity: DiffSeverity,
): T[] {
  const min = DIFF_SEVERITY_ORDER[minSeverity];
  return rows.filter((r) => DIFF_SEVERITY_ORDER[r.severity] >= min);
}

/**
 * Wylicza procent delta z A i B (B − A) / A * 100.
 * Zwraca undefined gdy A === 0 lub wartości nie są liczbami.
 */
export function computeDeltaPercent(
  a: string | number,
  b: string | number,
): number | undefined {
  const numA = typeof a === 'number' ? a : Number(a);
  const numB = typeof b === 'number' ? b : Number(b);
  if (!Number.isFinite(numA) || !Number.isFinite(numB)) return undefined;
  if (numA === 0) return undefined;
  return ((numB - numA) / numA) * 100;
}
