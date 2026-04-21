/**
 * History Store — P30a UNDO/REDO State Management
 *
 * CANONICAL ALIGNMENT:
 * - wizard_screens.md § 1.2: Operating modes (UNDO/REDO only in MODEL_EDIT)
 * - ui_canonical_parity.md § F: Transactional editing
 *
 * SINGLE SOURCE OF TRUTH for:
 * - Undo stack (past commands)
 * - Redo stack (future commands)
 * - Active transaction (for grouping commands)
 *
 * INVARIANTS:
 * - Undo stack = commands that can be undone
 * - Redo stack = commands that can be redone
 * - push() clears redo stack (linear history)
 * - Transactions group multiple commands into single undo/redo operation
 * - UNDO/REDO blocked in CASE_CONFIG and RESULT_VIEW modes
 */

import { create } from 'zustand';
import type { Command, Transaction } from './Command';
import { generateTransactionId } from './Command';

/**
 * Maximum undo history size (prevent memory leaks).
 */
const MAX_HISTORY_SIZE = 100;

/**
 * History state interface.
 */
interface HistoryState {
  /** Commands that can be undone (most recent = last) */
  undoStack: Command[];

  /** Commands that can be redone (most recent = last) */
  redoStack: Command[];

  /** Active transaction (null if not in transaction) */
  activeTransaction: Transaction | null;

  /** Actions */
  push: (command: Command) => Promise<void>;
  undo: () => Promise<boolean>;
  redo: () => Promise<boolean>;
  clear: () => void;
  beginTransaction: (name_pl: string) => void;
  commitTransaction: () => Promise<void>;
  rollbackTransaction: () => void;

  /** Computed helpers */
  canUndo: () => boolean;
  canRedo: () => boolean;
  getUndoLabel: () => string | null;
  getRedoLabel: () => string | null;
}

/**
 * Zustand store for command history.
 */
export const useHistoryStore = create<HistoryState>()((set, get) => ({
  // Initial state
  undoStack: [],
  redoStack: [],
  activeTransaction: null,

  /**
   * Push a new command onto the undo stack.
   * Clears redo stack (linear history).
   * If in transaction, adds to transaction instead of pushing directly.
   */
  push: async (command: Command) => {
    const state = get();

    // If in transaction, add to transaction commands
    if (state.activeTransaction) {
      state.activeTransaction.commands.push(command);
      return;
    }

    // Apply the command
    try {
      await command.apply();

      // Push to undo stack and clear redo stack
      set((state) => {
        const newUndoStack = [...state.undoStack, command];
        // Limit stack size
        if (newUndoStack.length > MAX_HISTORY_SIZE) {
          newUndoStack.shift();
        }
        return {
          undoStack: newUndoStack,
          redoStack: [], // Clear redo stack on new command
        };
      });
    } catch (error) {
      console.error('Command apply failed:', error);
      throw error;
    }
  },

  /**
   * Undo the last command.
   * Moves command from undo stack to redo stack.
   */
  undo: async () => {
    const state = get();
    if (state.undoStack.length === 0) {
      return false;
    }

    const command = state.undoStack[state.undoStack.length - 1];

    try {
      // Revert the command
      await command.revert();

      // Move from undo to redo
      set((state) => ({
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, command],
      }));

      return true;
    } catch (error) {
      console.error('Command revert failed:', error);
      return false;
    }
  },

  /**
   * Redo the last undone command.
   * Moves command from redo stack to undo stack.
   */
  redo: async () => {
    const state = get();
    if (state.redoStack.length === 0) {
      return false;
    }

    const command = state.redoStack[state.redoStack.length - 1];

    try {
      // Re-apply the command
      await command.apply();

      // Move from redo to undo
      set((state) => ({
        redoStack: state.redoStack.slice(0, -1),
        undoStack: [...state.undoStack, command],
      }));

      return true;
    } catch (error) {
      console.error('Command re-apply failed:', error);
      return false;
    }
  },

  /**
   * Clear all history.
   */
  clear: () => {
    set({
      undoStack: [],
      redoStack: [],
      activeTransaction: null,
    });
  },

  /**
   * Begin a new transaction.
   * All commands pushed until commitTransaction() will be grouped.
   */
  beginTransaction: (name_pl: string) => {
    const state = get();
    if (state.activeTransaction) {
      console.warn('Transaction already active, committing previous transaction');
      get().commitTransaction();
    }

    set({
      activeTransaction: {
        id: generateTransactionId(),
        name_pl,
        timestamp: Date.now(),
        commands: [],
      },
    });
  },

  /**
   * Commit the active transaction.
   * Groups all commands into a single undo/redo operation.
   */
  commitTransaction: async () => {
    const state = get();
    if (!state.activeTransaction) {
      console.warn('No active transaction to commit');
      return;
    }

    const transaction = state.activeTransaction;

    // If transaction has no commands, just clear it
    if (transaction.commands.length === 0) {
      set({ activeTransaction: null });
      return;
    }

    // If transaction has only one command, push it directly
    if (transaction.commands.length === 1) {
      set({ activeTransaction: null });
      await get().push(transaction.commands[0]);
      return;
    }

    // Create a composite command from transaction
    const compositeCommand: Command = {
      id: transaction.id,
      name_pl: transaction.name_pl,
      timestamp: transaction.timestamp,
      apply: async () => {
        for (const cmd of transaction.commands) {
          await cmd.apply();
        }
      },
      revert: async () => {
        // Revert in reverse order
        for (let i = transaction.commands.length - 1; i >= 0; i--) {
          await transaction.commands[i].revert();
        }
      },
    };

    // Clear transaction and push composite command
    set({ activeTransaction: null });
    await get().push(compositeCommand);
  },

  /**
   * Rollback the active transaction (discard all commands).
   */
  rollbackTransaction: () => {
    set({ activeTransaction: null });
  },

  /**
   * Check if undo is available.
   */
  canUndo: () => {
    return get().undoStack.length > 0;
  },

  /**
   * Check if redo is available.
   */
  canRedo: () => {
    return get().redoStack.length > 0;
  },

  /**
   * Get label for undo button (command name in Polish).
   */
  getUndoLabel: () => {
    const state = get();
    if (state.undoStack.length === 0) return null;
    const lastCommand = state.undoStack[state.undoStack.length - 1];
    return lastCommand.name_pl;
  },

  /**
   * Get label for redo button (command name in Polish).
   */
  getRedoLabel: () => {
    const state = get();
    if (state.redoStack.length === 0) return null;
    const lastCommand = state.redoStack[state.redoStack.length - 1];
    return lastCommand.name_pl;
  },
}));

// =============================================================================
// Derived Hooks
// =============================================================================

/**
 * Hook: Check if undo is available.
 */
export function useCanUndo(): boolean {
  return useHistoryStore((state) => state.undoStack.length > 0);
}

/**
 * Hook: Check if redo is available.
 */
export function useCanRedo(): boolean {
  return useHistoryStore((state) => state.redoStack.length > 0);
}

/**
 * Hook: Get undo button label (Polish).
 */
export function useUndoLabel(): string {
  const label = useHistoryStore((state) => state.getUndoLabel());
  return label ? `Cofnij: ${label}` : 'Cofnij';
}

/**
 * Hook: Get redo button label (Polish).
 */
export function useRedoLabel(): string {
  const label = useHistoryStore((state) => state.getRedoLabel());
  return label ? `Ponów: ${label}` : 'Ponów';
}
