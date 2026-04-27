/**
 * App State Module — P12a Data Manager Parity + canonical layout
 *
 * Global application state for active project, case, mode, and run.
 */

export {
  useAppStateStore,
  useActiveProjectId,
  useActiveCaseId,
  useActiveCaseName,
  useActiveCaseKind,
  useActiveMode,
  useActiveModeLabel,
  useCaseKindLabel,
  useResultStatusLabel,
  useHasActiveCase,
  useCanCalculate,
  useIssuePanelOpen,
  // UI_INTEGRATION_E2E + canonical layout:
  useActiveSnapshotId,
  useActiveAnalysisType,
  useActiveAnalysisTypeLabel,
  useActiveRunId,
  useUIContext,
} from './store';

export type { CaseKind, AnalysisType, AreaCode, WorkMode } from './store';
