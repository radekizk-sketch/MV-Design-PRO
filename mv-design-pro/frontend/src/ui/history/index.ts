/**
 * History Module — P30a UNDO/REDO Public API
 *
 * CANONICAL ALIGNMENT:
 * - wizard_screens.md § 1.2: Operating modes (UNDO/REDO only in MODEL_EDIT)
 * - ui_canonical_parity.md § F: Transactional editing
 *
 * Public exports for UNDO/REDO infrastructure.
 */

// Core types
export type { Command, Transaction, CommandResult } from './Command';
export { generateCommandId, generateTransactionId } from './Command';

// Store
export {
  useHistoryStore,
  useCanUndo,
  useCanRedo,
  useUndoLabel,
  useRedoLabel,
} from './HistoryStore';

// Hooks
export {
  useExecuteCommand,
  useUndo,
  useRedo,
  useBeginTransaction,
  useCommitTransaction,
  useRollbackTransaction,
  useClearHistory,
  useHistoryState,
  useIsHistoryAllowed,
} from './hooks';

// Commands (pilot implementations)
export { PropertyEditCommand } from './commands/PropertyEditCommand';
export type { PropertyEditCommandParams } from './commands/PropertyEditCommand';

export { SymbolMoveCommand } from './commands/SymbolMoveCommand';
export type {
  SymbolMoveCommandParams,
  SymbolPosition,
} from './commands/SymbolMoveCommand';

// Pakiet H — cross-case run history + change audit
export { RunListView } from './RunListView';
export type { RunListViewProps } from './RunListView';
export {
  PROOF_TYPE_LABELS_PL,
  RUN_STATUS_LABELS_PL,
  filterRuns,
  sortRunsDescByDate,
} from './runListTypes';
export type {
  ProofType,
  RunListEntry,
  RunListFilter,
  RunStatus,
} from './runListTypes';
export {
  AUDIT_ACTION_LABELS_PL,
  ChangeAuditTrailPanel,
  filterAudit,
  sortAuditDesc,
} from './ChangeAuditTrailPanel';
export type {
  AuditAction,
  AuditEntry,
  AuditFilter,
  ChangeAuditTrailPanelProps,
} from './ChangeAuditTrailPanel';
