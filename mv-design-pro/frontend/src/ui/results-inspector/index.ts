/**
 * P11b — Results Inspector Module Exports
 *
 * CANONICAL ALIGNMENT:
 * - wizard_screens.md: RESULT_VIEW mode components
 */

// Types
export * from './types';

// Rozpakowanie wartosci kroku sladu WHITE BOX (WB-2 — jedno miejsce dla calego frontu)
export * from './traceValue';

// API
export * from './api';

// Store
export {
  useResultsInspectorStore,
  useHasSelectedRun,
  useAvailableTables,
  useHasShortCircuitResults,
  useFilteredBusResults,
  useFilteredBranchResults,
  useRunResultStatusLabel,
  useIsAnyLoading,
} from './store';
