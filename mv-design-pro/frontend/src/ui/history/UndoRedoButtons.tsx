/**
 * UNDO/REDO Buttons — P30a UI Components
 *
 * CANONICAL ALIGNMENT:
 * - wizard_screens.md § 1.2: Operating modes (UNDO/REDO only in MODEL_EDIT)
 * - ui_canonical_parity.md § F: Transactional editing
 *
 * UI buttons for UNDO/REDO operations.
 * 100% Polish UI.
 *
 * INVARIANTS:
 * - Buttons disabled in CASE_CONFIG and RESULT_VIEW modes
 * - Tooltip shows last command name
 * - Keyboard shortcuts: Ctrl+Z (Undo), Ctrl+Y (Redo)
 */

import { useCallback, useEffect } from 'react';
import { clsx } from 'clsx';
import { useHistoryState } from './hooks';

// =============================================================================
// Component
// =============================================================================

export function UndoRedoButtons() {
  const { undo, redo } = useHistoryState();

  // Keyboard shortcuts: Ctrl+Z (Undo), Ctrl+Y (Redo)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl+Z or Cmd+Z (Mac)
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        if (undo.isEnabled) {
          undo.execute();
        }
      }
      // Ctrl+Y or Cmd+Shift+Z (Mac)
      else if (
        ((event.ctrlKey && event.key === 'y') ||
          (event.metaKey && event.shiftKey && event.key === 'z'))
      ) {
        event.preventDefault();
        if (redo.isEnabled) {
          redo.execute();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [undo, redo]);

  const handleUndoClick = useCallback(() => {
    undo.execute();
  }, [undo]);

  const handleRedoClick = useCallback(() => {
    redo.execute();
  }, [redo]);

  return (
    <div className="flex items-center gap-1">
      {/* Undo Button */}
      <button
        onClick={handleUndoClick}
        disabled={!undo.isEnabled}
        className={clsx(
          'px-2 py-1 text-sm rounded transition-colors',
          'flex items-center gap-1.5',
          undo.isEnabled
            ? 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            : 'bg-gray-50 text-gray-300 cursor-not-allowed'
        )}
        title={undo.tooltip}
      >
        <span className="text-base">↶</span>
        <span className="text-xs">Cofnij</span>
      </button>

      {/* Redo Button */}
      <button
        onClick={handleRedoClick}
        disabled={!redo.isEnabled}
        className={clsx(
          'px-2 py-1 text-sm rounded transition-colors',
          'flex items-center gap-1.5',
          redo.isEnabled
            ? 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            : 'bg-gray-50 text-gray-300 cursor-not-allowed'
        )}
        title={redo.tooltip}
      >
        <span className="text-base">↷</span>
        <span className="text-xs">Ponów</span>
      </button>
    </div>
  );
}

export default UndoRedoButtons;
