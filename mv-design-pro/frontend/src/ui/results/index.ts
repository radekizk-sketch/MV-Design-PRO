/**
 * Results Module Exports
 *
 * Canonical-grade results lifecycle management.
 */

export {
  useResultsStore,
  useIsOverlayVisible,
  useIsCalculateEnabled,
  useResultStatusMessage,
  useCanEnterResultView,
  useSelectedRunId,
  useRunHistory,
  useLastAnalysisType,
  type CalculationResult,
  type RunHistoryEntry,
} from './resultsStore';

export { ResultStatusBar, type CalculationAnalysisType } from './ResultStatusBar';

export {
  useSafeModeTransition,
  useModelMutation,
  useCanEditTopology,
  useCanEditParameters,
  useIsReadOnly,
  useShouldShowOverlay,
  useOverlayVisibility,
} from './modeGating';

export { ProtectionDiagnosticsPanel } from './ProtectionDiagnosticsPanel';
