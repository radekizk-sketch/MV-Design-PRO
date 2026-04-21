/**
 * P30b — Keyboard Shortcuts Hook
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md: Standard shortcuts (Ctrl+C/V/D/Z/Y, Esc, Del)
 * - P30a: UNDO/REDO integration (Ctrl+Z, Ctrl+Y)
 *
 * Keyboard shortcuts for SLD editor:
 * - Ctrl+C: Copy
 * - Ctrl+V: Paste
 * - Ctrl+D: Duplicate
 * - Ctrl+Z: Undo
 * - Ctrl+Y / Ctrl+Shift+Z: Redo
 * - Esc: Clear selection
 * - Del/Backspace: Delete (future P30d)
 * - Ctrl+A: Select all
 */

import { useEffect } from 'react';
import { useHistoryStore } from '../../history/HistoryStore';
import { useIsMutationBlocked } from '../../selection/store';
import { useSldEditorStore } from '../SldEditorStore';
import { CopyPasteCommand } from '../commands/CopyPasteCommand';

export interface UseKeyboardShortcutsOptions {
  /** Enable copy/paste shortcuts */
  enableCopyPaste?: boolean;

  /** Enable undo/redo shortcuts */
  enableUndoRedo?: boolean;

  /** Enable selection shortcuts */
  enableSelection?: boolean;

  /** Callback when paste is triggered (for custom positioning) */
  onPaste?: () => void;

  /** Callback when duplicate is triggered */
  onDuplicate?: () => void;
}

/**
 * Hook to handle keyboard shortcuts for SLD editor.
 */
export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions = {}) {
  const {
    enableCopyPaste = true,
    enableUndoRedo = true,
    enableSelection = true,
    onPaste,
    onDuplicate,
  } = options;

  const sldStore = useSldEditorStore();
  const historyStore = useHistoryStore();
  const isMutationBlocked = useIsMutationBlocked();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrl = e.ctrlKey || e.metaKey;
      const isShift = e.shiftKey;

      // Ignore shortcuts if user is typing in input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      // ===== UNDO/REDO =====
      if (enableUndoRedo && !isMutationBlocked) {
        if (isCtrl && e.key === 'z' && !isShift) {
          e.preventDefault();
          historyStore.undo();
          return;
        }
        if (isCtrl && (e.key === 'y' || (e.key === 'z' && isShift))) {
          e.preventDefault();
          historyStore.redo();
          return;
        }
      }

      // ===== COPY/PASTE =====
      if (enableCopyPaste) {
        // Copy: Ctrl+C
        if (isCtrl && e.key === 'c') {
          e.preventDefault();
          sldStore.copySelection();
          return;
        }

        // Paste: Ctrl+V
        if (isCtrl && e.key === 'v' && !isMutationBlocked) {
          e.preventDefault();
          if (onPaste) {
            onPaste();
          } else {
            // Default paste with offset
            executePaste();
          }
          return;
        }

        // Duplicate: Ctrl+D
        if (isCtrl && e.key === 'd' && !isMutationBlocked) {
          e.preventDefault();
          if (onDuplicate) {
            onDuplicate();
          } else {
            executeDuplicate();
          }
          return;
        }
      }

      // ===== SELECTION =====
      if (enableSelection) {
        // Select all: Ctrl+A
        if (isCtrl && e.key === 'a') {
          e.preventDefault();
          sldStore.selectAll();
          return;
        }

        // Clear selection: Esc
        if (e.key === 'Escape') {
          e.preventDefault();
          sldStore.clearSelection();
          sldStore.setSelectedConnection(null);
          // Cancel drag if active
          if (sldStore.dragState) {
            sldStore.cancelDrag();
          }
          // Cancel lasso if active
          if (sldStore.lassoState) {
            sldStore.endLasso();
          }
          return;
        }
      }

      // ===== DELETE =====
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isMutationBlocked) {
        e.preventDefault();
        const selected = sldStore.selectedIds;
        if (selected.length === 0) {
          // No selection - nothing to delete
          return;
        }
        // Delete selected symbols
        selected.forEach((id: string) => sldStore.removeSymbol(id));
        sldStore.clearSelection();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    enableCopyPaste,
    enableUndoRedo,
    enableSelection,
    onPaste,
    onDuplicate,
    isMutationBlocked,
  ]);

  // ===== HELPER FUNCTIONS =====

  const executePaste = () => {
    const PASTE_OFFSET = { x: 10, y: 10 };
    const newSymbols = sldStore.pasteFromClipboard(PASTE_OFFSET);

    if (newSymbols.length === 0) return;

    // Create UNDO/REDO command
    const command = CopyPasteCommand.create({
      newSymbols,
      addFn: (symbols) => {
        symbols.forEach((s) => sldStore.addSymbol(s));
      },
      removeFn: (symbolIds) => {
        symbolIds.forEach((id) => sldStore.removeSymbol(id));
      },
    });

    historyStore.push(command);
  };

  const executeDuplicate = () => {
    const newSymbols = sldStore.duplicateSelection();

    if (newSymbols.length === 0) return;

    // Create UNDO/REDO command
    const command = CopyPasteCommand.create({
      newSymbols,
      addFn: (symbols) => {
        symbols.forEach((s) => sldStore.addSymbol(s));
      },
      removeFn: (symbolIds) => {
        symbolIds.forEach((id) => sldStore.removeSymbol(id));
      },
    });

    historyStore.push(command);
  };
}
