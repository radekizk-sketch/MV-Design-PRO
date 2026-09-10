/**
 * Study Cases Module — P10 FULL MAX + PR-14 Execution Layer
 *
 * Public API for study case management and execution runs.
 */

// Types
export * from './types';

// Store
export {
  useStudyCasesStore,
  useActiveCase,
  useHasActiveCase,
  useActiveCaseResultStatus,
  useCasesCount,
  useIsLoading,
  useActiveCaseStatusLabel,
  useSortedCases,
} from './store';

// PR-14: Execution Runs Store
export {
  useExecutionRunsStore,
  useActiveRunId,
  useRunStatus,
  useRuns,
  useIsRunInProgress,
  useIsRunButtonDisabled,
  useCachedResultSet,
  useRunError,
} from './runStore';

// Mode Gating
export {
  useCanPerformCaseOperation,
  useCanCreateCase,
  useCanManageCases,
  useCanEditCaseConfig,
  useCaseModeConstraints,
  useCanActivateCase,
} from './modeGating';
export type { StudyCaseOperation } from './modeGating';

// API
export * as studyCasesApi from './api';

// Components
export { StudyCaseList } from './StudyCaseList';
export { CaseCompareView } from './CaseCompareView';
export { CreateCaseDialog } from './CreateCaseDialog';
export { ProtectionCaseConfigPanel } from './ProtectionCaseConfigPanel';

// PR-14: Execution Components
export { RunButton } from './RunButton';
export { RunHistoryPanel } from './RunHistoryPanel';
export { StudyCaseEditor } from './StudyCaseEditor';

// Phase 1 Etap 9 helpers
export {
  cloneCase,
  validateCloneOptions,
} from './caseCloneHelper';
export type {
  CaseConfig as CaseConfigSnapshot,
  CaseResults,
  CloneOptions,
  CloneInput,
  CloneResult,
} from './caseCloneHelper';
export {
  createQuickSwitcher,
  activateCase as activateQuickSwitcherCase,
  nextCase,
  prevCase,
  caseAtIndex,
  closeCase as closeQuickSwitcherCase,
  matchKeyboard as matchQuickSwitcherKeyboard,
} from './quickCaseSwitcher';
export type {
  CaseTab,
  QuickSwitcherState,
  SwitcherAction,
} from './quickCaseSwitcher';
