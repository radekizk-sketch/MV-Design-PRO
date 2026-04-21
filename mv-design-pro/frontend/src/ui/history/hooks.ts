/**
 * History Hooks — P30a UNDO/REDO React Integration
 *
 * CANONICAL ALIGNMENT:
 * - wizard_screens.md § 1.2: Operating modes (UNDO/REDO only in MODEL_EDIT)
 * - ui_canonical_parity.md § F: Transactional editing
 *
 * React hooks for integrating UNDO/REDO with components.
 * Includes mode gating (UNDO/REDO blocked in CASE_CONFIG and RESULT_VIEW).
 */

import { useCallback } from 'react';
import { useHistoryStore, useCanUndo, useCanRedo } from './HistoryStore';
import { useActiveMode } from '../app-state/store';
import type { Command } from './Command';

/**
 * Hook: Execute command with UNDO/REDO support.
 * Automatically gates based on operating mode.
 */
export function useExecuteCommand() {
  const push = useHistoryStore((state) => state.push);
  const activeMode = useActiveMode();

  return useCallback(
    async (command: Command): Promise<boolean> => {
      // Block in CASE_CONFIG and RESULT_VIEW modes
      if (activeMode !== 'MODEL_EDIT') {
        console.warn('Command execution blocked: Not in MODEL_EDIT mode');
        return false;
      }

      try {
        await push(command);
        return true;
      } catch (error) {
        console.error('Command execution failed:', error);
        return false;
      }
    },
    [push, activeMode]
  );
}

/**
 * Hook: Undo last command.
 * Automatically gates based on operating mode and undo availability.
 */
export function useUndo() {
  const undo = useHistoryStore((state) => state.undo);
  const activeMode = useActiveMode();
  const canUndo = useCanUndo();

  const isEnabled = activeMode === 'MODEL_EDIT' && canUndo;

  const execute = useCallback(async () => {
    if (!isEnabled) {
      return false;
    }
    return await undo();
  }, [undo, isEnabled]);

  return { execute, isEnabled };
}

/**
 * Hook: Redo last undone command.
 * Automatically gates based on operating mode and redo availability.
 */
export function useRedo() {
  const redo = useHistoryStore((state) => state.redo);
  const activeMode = useActiveMode();
  const canRedo = useCanRedo();

  const isEnabled = activeMode === 'MODEL_EDIT' && canRedo;

  const execute = useCallback(async () => {
    if (!isEnabled) {
      return false;
    }
    return await redo();
  }, [redo, isEnabled]);

  return { execute, isEnabled };
}

/**
 * Hook: Begin transaction (group multiple commands).
 * Example: Moving multiple symbols on SLD = 1 transaction.
 */
export function useBeginTransaction() {
  const beginTransaction = useHistoryStore((state) => state.beginTransaction);
  const activeMode = useActiveMode();

  return useCallback(
    (name_pl: string) => {
      // Only allow in MODEL_EDIT mode
      if (activeMode !== 'MODEL_EDIT') {
        console.warn('Transaction blocked: Not in MODEL_EDIT mode');
        return;
      }
      beginTransaction(name_pl);
    },
    [beginTransaction, activeMode]
  );
}

/**
 * Hook: Commit transaction (finalize grouped commands).
 */
export function useCommitTransaction() {
  const commitTransaction = useHistoryStore((state) => state.commitTransaction);
  return commitTransaction;
}

/**
 * Hook: Rollback transaction (discard grouped commands).
 */
export function useRollbackTransaction() {
  const rollbackTransaction = useHistoryStore((state) => state.rollbackTransaction);
  return rollbackTransaction;
}

/**
 * Hook: Clear all history.
 */
export function useClearHistory() {
  const clear = useHistoryStore((state) => state.clear);
  return clear;
}

/**
 * Hook: Get UNDO/REDO state for UI rendering.
 * Returns enabled state and labels for buttons.
 */
export function useHistoryState() {
  const { execute: executeUndo, isEnabled: undoEnabled } = useUndo();
  const { execute: executeRedo, isEnabled: redoEnabled } = useRedo();
  const undoLabel = useHistoryStore((state) => state.getUndoLabel());
  const redoLabel = useHistoryStore((state) => state.getRedoLabel());

  return {
    undo: {
      execute: executeUndo,
      isEnabled: undoEnabled,
      label: undoLabel ? `Cofnij: ${undoLabel}` : 'Cofnij',
      tooltip: undoLabel ? `Cofnij: ${undoLabel}` : 'Cofnij ostatnią operację',
    },
    redo: {
      execute: executeRedo,
      isEnabled: redoEnabled,
      label: redoLabel ? `Ponów: ${redoLabel}` : 'Ponów',
      tooltip: redoLabel ? `Ponów: ${redoLabel}` : 'Ponów ostatnią cofniętą operację',
    },
  };
}

/**
 * Hook: Check if UNDO/REDO is currently allowed.
 * Blocked in CASE_CONFIG and RESULT_VIEW modes.
 */
export function useIsHistoryAllowed(): boolean {
  const activeMode = useActiveMode();
  return activeMode === 'MODEL_EDIT';
}
