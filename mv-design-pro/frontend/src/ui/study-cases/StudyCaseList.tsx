/**
 * Lista zakresów obliczeń widoczna w panelu projektu.
 */

import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import { clsx } from 'clsx';
import { CreateCaseDialog } from './CreateCaseDialog';
import type { StudyCase, StudyCaseListItem, StudyCaseResultStatus } from './types';
import { RESULT_STATUS_TOOLTIPS } from './types';
import { useSortedCases, useStudyCasesStore } from './store';

function hashRequestsCaseCreation(): boolean {
  if (typeof window === 'undefined') return false;
  const queryIndex = window.location.hash.indexOf('?');
  if (queryIndex < 0) return false;
  const params = new URLSearchParams(window.location.hash.slice(queryIndex + 1));
  return params.get('createCase') === '1';
}

function clearCaseCreationHashRequest(): void {
  if (typeof window === 'undefined') return;
  const { hash, pathname, search } = window.location;
  const queryIndex = hash.indexOf('?');
  if (queryIndex < 0) return;
  const hashBase = hash.slice(0, queryIndex);
  const params = new URLSearchParams(hash.slice(queryIndex + 1));
  params.delete('createCase');
  const nextHash = params.toString() ? `${hashBase}?${params.toString()}` : hashBase;
  window.history.replaceState(null, '', `${pathname}${search}${nextHash}`);
}

const STATUS_DOT_COLORS: Record<StudyCaseResultStatus, string> = {
  NONE: 'bg-gray-400',
  FRESH: 'bg-green-500',
  OUTDATED: 'bg-amber-500',
};

interface StudyCaseListProps {
  onCaseClick?: (caseId: string) => void;
  onActivateCase?: (caseId: string) => void;
  onCloneCase?: (caseId: string) => void;
  onDeleteCase?: (caseId: string) => void;
  onCreateCase?: () => void;
  onCaseCreated?: (studyCase: StudyCase) => void;
  createProjectId?: string | null;
  createDisabled?: boolean;
  createDisabledReason?: string;
}

export function StudyCaseList({
  onCaseClick,
  onActivateCase,
  onCloneCase,
  onDeleteCase,
  onCreateCase,
  onCaseCreated,
  createProjectId = null,
  createDisabled = false,
  createDisabledReason = 'Akcja niedostępna.',
}: StudyCaseListProps) {
  const cases = useSortedCases();
  const isLoading = useStudyCasesStore((state) => state.isLoading);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    caseId: string;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    if (!createProjectId) {
      return undefined;
    }

    const syncFromHash = () => {
      if (hashRequestsCaseCreation()) {
        setIsCreateDialogOpen(true);
      }
    };

    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, [createProjectId]);

  const handleContextMenu = useCallback((e: MouseEvent, caseId: string) => {
    e.preventDefault();
    setContextMenu({ caseId, x: e.clientX, y: e.clientY });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleActivate = useCallback(
    (caseId: string) => {
      onActivateCase?.(caseId);
      closeContextMenu();
    },
    [onActivateCase, closeContextMenu],
  );

  const handleClone = useCallback(
    (caseId: string) => {
      onCloneCase?.(caseId);
      closeContextMenu();
    },
    [onCloneCase, closeContextMenu],
  );

  const handleDelete = useCallback(
    (caseId: string) => {
      onDeleteCase?.(caseId);
      closeContextMenu();
    },
    [onDeleteCase, closeContextMenu],
  );

  const handleCreate = useCallback(
    (e: MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => {
      e.stopPropagation();
      if (createProjectId) {
        setIsCreateDialogOpen(true);
        return;
      }
      onCreateCase?.();
    },
    [createProjectId, onCreateCase],
  );

  const handleCloseCreateDialog = useCallback(() => {
    setIsCreateDialogOpen(false);
    clearCaseCreationHashRequest();
  }, []);

  if (isLoading) {
    return <div className="p-4 text-center text-sm text-gray-500">Ładowanie zakresów...</div>;
  }

  return (
    <div className="relative" onClick={closeContextMenu}>
      <div className="flex items-center justify-between border-b border-gray-200 px-2 py-1">
        <span className="text-xs font-medium text-gray-700">
          Zakresy obliczeń ({cases.length})
        </span>
        {createProjectId && !createDisabled ? (
          <a
            href="#case-config?createCase=1"
            role="button"
            onClick={handleCreate}
            className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
            title="Utwórz nowy zakres obliczeń"
          >
            + Nowy
          </a>
        ) : (
          <button
            type="button"
            onClick={handleCreate}
            disabled={createDisabled || !onCreateCase}
            className={clsx(
              'text-xs',
              createDisabled || !onCreateCase
                ? 'cursor-not-allowed text-gray-400'
                : 'text-blue-600 hover:text-blue-800 hover:underline',
            )}
            title={createDisabled || !onCreateCase ? createDisabledReason : 'Utwórz nowy zakres obliczeń'}
          >
            + Nowy
          </button>
        )}
      </div>

      {cases.length === 0 ? (
        <div className="p-4 text-center text-xs text-gray-400">
          Brak zakresów obliczeń.
          <br />
          Utwórz pierwszy zakres obliczeń.
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {cases.map((caseItem) => (
            <StudyCaseRow
              key={caseItem.id}
              caseItem={caseItem}
              onClick={() => onCaseClick?.(caseItem.id)}
              onContextMenu={(e) => handleContextMenu(e, caseItem.id)}
              onDoubleClick={() => onActivateCase?.(caseItem.id)}
            />
          ))}
        </div>
      )}

      {contextMenu && (
        <StudyCaseContextMenu
          caseId={contextMenu.caseId}
          x={contextMenu.x}
          y={contextMenu.y}
          cases={cases}
          onActivate={handleActivate}
          onClone={handleClone}
          onDelete={handleDelete}
        />
      )}

      {createProjectId && (
        <CreateCaseDialog
          projectId={createProjectId}
          isOpen={isCreateDialogOpen}
          onClose={handleCloseCreateDialog}
          onCreated={onCaseCreated}
        />
      )}
    </div>
  );
}

interface StudyCaseRowProps {
  caseItem: StudyCaseListItem;
  onClick: () => void;
  onContextMenu: (e: MouseEvent) => void;
  onDoubleClick: () => void;
}

function StudyCaseRow({ caseItem, onClick, onContextMenu, onDoubleClick }: StudyCaseRowProps) {
  return (
    <div
      className={clsx(
        'flex cursor-pointer items-center px-3 py-2 transition-colors',
        'hover:bg-gray-50',
        caseItem.is_active && 'bg-blue-50 hover:bg-blue-100',
      )}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
    >
      <span className="mr-2 w-4 text-center">
        {caseItem.is_active && (
          <span className="font-bold text-blue-600" title="Aktywny zakres obliczeń">
            &gt;
          </span>
        )}
      </span>

      <span
        className={clsx('mr-2 h-2 w-2 flex-shrink-0 rounded-full', STATUS_DOT_COLORS[caseItem.result_status])}
        title={RESULT_STATUS_TOOLTIPS[caseItem.result_status]}
      />

      <span className="flex-1 truncate text-sm" title={caseItem.name}>
        {caseItem.name}
      </span>

      {caseItem.is_active && (
        <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">
          aktywny
        </span>
      )}
    </div>
  );
}

interface StudyCaseContextMenuProps {
  caseId: string;
  x: number;
  y: number;
  cases: StudyCaseListItem[];
  onActivate: (caseId: string) => void;
  onClone: (caseId: string) => void;
  onDelete: (caseId: string) => void;
}

function StudyCaseContextMenu({
  caseId,
  x,
  y,
  cases,
  onActivate,
  onClone,
  onDelete,
}: StudyCaseContextMenuProps) {
  const caseItem = cases.find((c) => c.id === caseId);
  if (!caseItem) return null;

  return (
    <div
      className="fixed z-50 min-w-[180px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      {!caseItem.is_active && (
        <button
          type="button"
          className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
          onClick={() => onActivate(caseId)}
        >
          Ustaw jako aktywny
        </button>
      )}

      <button
        type="button"
        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
        onClick={() => onClone(caseId)}
      >
        Klonuj zakres
      </button>

      <div className="my-1 border-t border-gray-200" />

      <button
        type="button"
        className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
        onClick={() => onDelete(caseId)}
      >
        Usuń zakres
      </button>
    </div>
  );
}

export default StudyCaseList;
