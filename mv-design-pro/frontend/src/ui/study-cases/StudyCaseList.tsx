/**
 * Study Case List Component — P10 FULL MAX
 *
 * List of study cases displayed in the Project Tree.
 * Shows active case indicator and result status.
 *
 * POLISH UI:
 * - "Przypadki obliczeniowe" header
 * - Status labels in Polish
 * - Context menu in Polish
 */

import { useState, useCallback } from 'react';
import { clsx } from 'clsx';
import type { StudyCaseListItem, StudyCaseResultStatus } from './types';
import { RESULT_STATUS_TOOLTIPS } from './types';
import {
  useStudyCasesStore,
  useSortedCases,
} from './store';

// =============================================================================
// Status Icons and Colors
// =============================================================================

const STATUS_DOT_COLORS: Record<StudyCaseResultStatus, string> = {
  NONE: 'bg-gray-400',
  FRESH: 'bg-green-500',
  OUTDATED: 'bg-amber-500',
};

// =============================================================================
// Component Props
// =============================================================================

interface StudyCaseListProps {
  onCaseClick?: (caseId: string) => void;
  onActivateCase?: (caseId: string) => void;
  onCloneCase?: (caseId: string) => void;
  onDeleteCase?: (caseId: string) => void;
  onCreateCase?: () => void;
}

// =============================================================================
// Component
// =============================================================================

export function StudyCaseList({
  onCaseClick,
  onActivateCase,
  onCloneCase,
  onDeleteCase,
  onCreateCase,
}: StudyCaseListProps) {
  const cases = useSortedCases();
  const isLoading = useStudyCasesStore((state) => state.isLoading);
  const [contextMenu, setContextMenu] = useState<{
    caseId: string;
    x: number;
    y: number;
  } | null>(null);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, caseId: string) => {
      e.preventDefault();
      setContextMenu({ caseId, x: e.clientX, y: e.clientY });
    },
    []
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleActivate = useCallback(
    (caseId: string) => {
      onActivateCase?.(caseId);
      closeContextMenu();
    },
    [onActivateCase, closeContextMenu]
  );

  const handleClone = useCallback(
    (caseId: string) => {
      onCloneCase?.(caseId);
      closeContextMenu();
    },
    [onCloneCase, closeContextMenu]
  );

  const handleDelete = useCallback(
    (caseId: string) => {
      onDeleteCase?.(caseId);
      closeContextMenu();
    },
    [onDeleteCase, closeContextMenu]
  );

  if (isLoading) {
    return (
      <div className="p-4 text-center text-gray-500 text-sm">
        Ładowanie przypadków...
      </div>
    );
  }

  return (
    <div className="relative" onClick={closeContextMenu}>
      {/* Header with create button */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-gray-200">
        <span className="text-xs font-medium text-gray-700">
          Przypadki obliczeniowe ({cases.length})
        </span>
        <button
          onClick={onCreateCase}
          className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
              title="Utworz nowy zakres obliczen"
        >
          + Nowy
        </button>
      </div>

      {/* Cases list */}
      {cases.length === 0 ? (
        <div className="p-4 text-center text-gray-400 text-xs">
          Brak przypadków obliczeniowych.
          <br />
              Utworz pierwszy zakres obliczen.
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {cases.map((caseItem) => (
            <StudyCaseListItem
              key={caseItem.id}
              caseItem={caseItem}
              onClick={() => onCaseClick?.(caseItem.id)}
              onContextMenu={(e) => handleContextMenu(e, caseItem.id)}
              onDoubleClick={() => onActivateCase?.(caseItem.id)}
            />
          ))}
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <StudyCaseContextMenu
          caseId={contextMenu.caseId}
          x={contextMenu.x}
          y={contextMenu.y}
          cases={cases}
          onClose={closeContextMenu}
          onActivate={handleActivate}
          onClone={handleClone}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}

// =============================================================================
// List Item Component
// =============================================================================

interface StudyCaseListItemProps {
  caseItem: StudyCaseListItem;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
}

function StudyCaseListItem({
  caseItem,
  onClick,
  onContextMenu,
  onDoubleClick,
}: StudyCaseListItemProps) {
  return (
    <div
      className={clsx(
        'flex items-center px-3 py-2 cursor-pointer',
        'hover:bg-gray-50 transition-colors',
        caseItem.is_active && 'bg-blue-50 hover:bg-blue-100'
      )}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
    >
      {/* Active indicator */}
      <span className="w-4 text-center mr-2">
        {caseItem.is_active && (
                <span className="text-blue-600 font-bold" title="Aktywny zakres obliczen">
            &gt;
          </span>
        )}
      </span>

      {/* Status dot */}
      <span
        className={clsx('mr-2 w-2 h-2 rounded-full flex-shrink-0', STATUS_DOT_COLORS[caseItem.result_status])}
        title={RESULT_STATUS_TOOLTIPS[caseItem.result_status]}
      />

      {/* Name */}
      <span className="flex-1 text-sm truncate" title={caseItem.name}>
        {caseItem.name}
      </span>

      {/* Active badge */}
      {caseItem.is_active && (
        <span className="ml-2 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
          aktywny
        </span>
      )}
    </div>
  );
}

// =============================================================================
// Context Menu Component
// =============================================================================

interface StudyCaseContextMenuProps {
  caseId: string;
  x: number;
  y: number;
  cases: StudyCaseListItem[];
  onClose: () => void;
  onActivate: (caseId: string) => void;
  onClone: (caseId: string) => void;
  onDelete: (caseId: string) => void;
}

function StudyCaseContextMenu({
  caseId,
  x,
  y,
  cases,
  onClose: _onClose,
  onActivate,
  onClone,
  onDelete,
}: StudyCaseContextMenuProps) {
  const caseItem = cases.find((c) => c.id === caseId);
  if (!caseItem) return null;

  return (
    <div
      className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[180px]"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Activate */}
      {!caseItem.is_active && (
        <button
          className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
          onClick={() => onActivate(caseId)}
        >
          Ustaw jako aktywny
        </button>
      )}

      {/* Clone */}
      <button
        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
        onClick={() => onClone(caseId)}
      >
                  Klonuj zakres
      </button>

      {/* Separator */}
      <div className="border-t border-gray-200 my-1" />

      {/* Delete */}
      <button
        className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
        onClick={() => onDelete(caseId)}
      >
                  Usun zakres
      </button>
    </div>
  );
}

export default StudyCaseList;
