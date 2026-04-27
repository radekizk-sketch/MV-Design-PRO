/**
 * compare/index-aggregate — barrel re-export 3 modułów porównania (Pakiet I).
 *
 * STRATEGIA (binding, D6 — uporządkowanie BEZ konsolidacji):
 * - Każdy moduł zachowuje własny `index.ts` i kontrakt.
 * - Ten plik re-eksportuje pod jednym namespacem dla wygody konsumentów.
 * - Wspólne typy (`ComparisonRow`, `DiffSeverity`) z `compare/shared/types`.
 *
 * UŻYCIE:
 *   import * as Compare from '@/ui/compare/index-aggregate';
 *   const sorted = Compare.sortBySeverityDesc(rows);
 *   const view = <Compare.CompareView ... />;
 */

// Wspólne typy + helpers (Pakiet I)
export {
  DIFF_SEVERITY_LABELS_PL,
  DIFF_SEVERITY_ORDER,
  computeDeltaPercent,
  filterByMinSeverity,
  sortBySeverityDesc,
} from './shared/types';
export type { ComparisonRow, DiffSeverity } from './shared/types';

// Re-export modułów (każdy zachowuje swój scope — patrz INDEX.md)
export * as CompareModule from './index';
