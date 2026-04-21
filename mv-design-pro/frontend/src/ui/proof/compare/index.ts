/**
 * Porównanie śladów obliczeń (Trace Comparison) — Eksporty
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md: Porównanie Case/Run A vs B
 * - SYSTEM_SPEC.md: READ-ONLY display
 */

// Types
export type {
  TraceDiffStatus,
  TraceDiffFilter,
  TraceFieldDiff,
  TraceDiffStep,
  TraceCompareMetadata,
  TraceDiffSummary,
  TraceComparisonResult,
  TraceDiffExport,
} from './types';

export {
  TRACE_DIFF_STATUS_LABELS,
  TRACE_DIFF_STATUS_COLORS,
  TRACE_DIFF_STATUS_BORDER,
  TRACE_DIFF_FILTER_LABELS,
} from './types';

// Diff Algorithm
export {
  generateStepKey,
  diffTraces,
  filterDiffSteps,
  findChangeIndices,
  findNextChange,
  findPrevChange,
  sortDiffStepsByImportance,
} from './diffTrace';

// Export
export {
  createDiffExport,
  generateExportFilename,
  downloadDiffJson,
  copyDiffJsonToClipboard,
} from './exportDiffJson';

// Components
export { TraceDiffList } from './TraceDiffList';
export { TraceCompareView, TraceComparePage } from './TraceCompareView';
