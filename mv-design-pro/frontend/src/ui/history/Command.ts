/**
 * Command Pattern — P30a UNDO/REDO Infrastructure
 *
 * CANONICAL ALIGNMENT:
 * - wizard_screens.md § 1.2: Operating modes (MODEL_EDIT only)
 * - ui_canonical_parity.md § F: Transactional editing
 *
 * INVARIANTS:
 * - Commands are immutable once created
 * - apply() and revert() must be deterministic
 * - Transactions group multiple commands into one undo/redo operation
 * - UNDO/REDO blocked in CASE_CONFIG and RESULT_VIEW modes
 */

/**
 * Base Command interface.
 * All commands must implement apply() and revert() methods.
 */
export interface Command {
  /** Unique command ID (for tracking) */
  id: string;

  /** Human-readable command name in Polish (for UI tooltips) */
  name_pl: string;

  /** Timestamp when command was created (UI clock OK) */
  timestamp: number;

  /**
   * Apply the command (forward operation).
   * Must be deterministic and idempotent.
   */
  apply(): void | Promise<void>;

  /**
   * Revert the command (inverse operation).
   * Must restore exact previous state.
   */
  revert(): void | Promise<void>;

  /**
   * Optional: Merge with another command of the same type.
   * Used for coalescing similar operations (e.g., multiple property edits).
   * @returns true if merged successfully, false otherwise
   */
  merge?(other: Command): boolean;
}

/**
 * Transaction - groups multiple commands into a single undo/redo operation.
 * Example: Moving multiple symbols on SLD = 1 transaction.
 */
export interface Transaction {
  /** Unique transaction ID */
  id: string;

  /** Human-readable transaction name in Polish */
  name_pl: string;

  /** Timestamp when transaction started */
  timestamp: number;

  /** Commands grouped in this transaction */
  commands: Command[];
}

/**
 * Command execution result.
 */
export interface CommandResult {
  success: boolean;
  error?: string;
}

/**
 * Helper to generate unique command IDs.
 */
export function generateCommandId(): string {
  return `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Helper to generate unique transaction IDs.
 */
export function generateTransactionId(): string {
  return `txn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
