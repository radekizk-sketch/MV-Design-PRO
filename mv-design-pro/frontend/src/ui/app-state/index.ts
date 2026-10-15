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
  useActiveMode,
} from './store';

export type { CaseKind, AnalysisType, WorkMode, EnmHashChainState } from './store';

// V12S-010 — chain pięciu ortogonalnych hashy ENM
export { useEnmHashChain, shortHash } from './useEnmHashChain';
export type { EnmHashChain } from './useEnmHashChain';
