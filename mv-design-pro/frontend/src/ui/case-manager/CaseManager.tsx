/**
 * Case Manager Panel — P12a Data Manager Parity
 *
 * CANONICAL ALIGNMENT:
 * - wizard_screens.md § 8: Case management screens
 * - powerfactory_ui_parity.md § A: Mode-based gating
 *
 * PowerFactory-style case management panel with:
 * - List of cases with deterministic sort (name, then id)
 * - Create ShortCircuit / PowerFlow cases
 * - Clone, Rename, Delete, Activate actions
 * - Case configuration panel
 *
 * POLISH UI (100% Polish labels).
 *
 * MODE GATING:
 * - MODEL_EDIT: Full CRUD allowed
 * - CASE_CONFIG: Only config edit allowed
 * - RESULT_VIEW: Read-only
 */

import { useState, useCallback, useMemo } from 'react';
import { clsx } from 'clsx';
import type { StudyCaseListItem, StudyCaseResultStatus } from '../study-cases/types';
import { RESULT_STATUS_LABELS } from '../study-cases/types';
import { useStudyCasesStore, useSortedCases } from '../study-cases/store';
import { useAppStateStore, type CaseKind } from '../app-state';
import { useModeGating } from './useModeGating';
import { createProject } from '../projects/api';
import { ROUTES } from '../navigation';

// =============================================================================
// Types
// =============================================================================

type SortField = 'name' | 'updated_at' | 'result_status';
type SortDirection = 'asc' | 'desc';

interface CaseManagerProps {
  onClose?: () => void;
  onCaseSelected?: (caseId: string) => void;
  onCalculate?: (caseId: string) => void;
  onViewResults?: (caseId: string) => void;
}

// =============================================================================
// Status Styling
// =============================================================================

const STATUS_DOT_COLORS: Record<StudyCaseResultStatus, string> = {
  NONE: 'bg-gray-400',
  FRESH: 'bg-green-500',
  OUTDATED: 'bg-amber-500',
};

const STATUS_COLORS: Record<StudyCaseResultStatus, string> = {
  NONE: 'text-gray-400',
  FRESH: 'text-green-500',
  OUTDATED: 'text-amber-500',
};

// =============================================================================
// Component
// =============================================================================

export function CaseManager({
  onClose,
  onCaseSelected,
  onCalculate,
  onViewResults,
}: CaseManagerProps) {
  // State
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createKind, setCreateKind] = useState<CaseKind>('ShortCircuitCase');
  const [newCaseName, setNewCaseName] = useState('');
  const [isRenaming, setIsRenaming] = useState<string | null>(null);
  const [renameName, setRenameName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Store
  const cases = useSortedCases();
  const {
    createCase,
    deleteCase,
    cloneCase,
    activateCase,
    updateCase,
    isDeleting,
    isCloning,
    isCreating: isCreatingCase,
    isActivating,
    error,
    clearError,
  } = useStudyCasesStore();

  const projectId = useAppStateStore((state) => state.activeProjectId);
  const setActiveProject = useAppStateStore((state) => state.setActiveProject);
  const setActiveCase = useAppStateStore((state) => state.setActiveCase);

  // Mode gating
  const { canCreate, canDelete, canRename, canClone, canActivate, getBlockedReason } =
    useModeGating();

  // Filtered and sorted cases
  const filteredCases = useMemo(() => {
    let result = [...cases];

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          c.description.toLowerCase().includes(query)
      );
    }

    // Sort (deterministic: primary by field, secondary by name, tertiary by id)
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.name.localeCompare(b.name, 'pl');
          break;
        case 'updated_at':
          cmp = a.updated_at.localeCompare(b.updated_at);
          break;
        case 'result_status':
          cmp = a.result_status.localeCompare(b.result_status);
          break;
      }
      if (cmp === 0) cmp = a.name.localeCompare(b.name, 'pl');
      if (cmp === 0) cmp = a.id.localeCompare(b.id);
      return sortDirection === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [cases, searchQuery, sortField, sortDirection]);

  // Handlers
  const handleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortDirection('asc');
      }
      return field;
    });
  }, []);

  const handleCreate = useCallback(async () => {
    if (!newCaseName.trim()) return;

    // Auto-create default project via API if none exists
    let pid = projectId;
    if (!pid) {
      try {
        const project = await createProject({ name: 'Projekt 1' });
        pid = project.id;
        setActiveProject(pid, project.name);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Nie udało się utworzyć projektu';
        console.error('[CaseManager] Błąd tworzenia projektu:', message);
        // Kontynuuj mimo błędu - store pokaże błąd przy tworzeniu przypadku
      }
    }

    if (!pid) {
      console.error('[CaseManager] Brak project_id po próbie utworzenia projektu');
      return;
    }

    try {
      const created = await createCase({
        project_id: pid,
        name: newCaseName.trim(),
        description: '',
        set_active: true,
      });
      setActiveCase(
        created.id,
        created.name,
        createKind,
        created.result_status
      );
      setIsCreating(false);
      setNewCaseName('');

      // POWERFACTORY_FLOW: After creating a case, close the panel
      // User is automatically taken to SLD view (default route) with the new active case
      onClose?.();

      // Navigate to the canonical editor route to ensure user is in edit mode
      // This handles case where user was on results or other routes
      if (window.location.hash !== ROUTES.SLD.hash) {
        window.location.hash = ROUTES.SLD.hash;
      }
    } catch (e) {
      // Error handled in store
    }
  }, [projectId, newCaseName, createKind, createCase, setActiveProject, setActiveCase, onClose]);

  const handleDelete = useCallback(
    async (caseId: string) => {
      const success = await deleteCase(caseId);
      if (success) {
        setDeleteConfirm(null);
        if (selectedCaseId === caseId) {
          setSelectedCaseId(null);
        }
      }
    },
    [deleteCase, selectedCaseId]
  );

  const handleClone = useCallback(
    async (caseId: string) => {
      const original = cases.find((c) => c.id === caseId);
      try {
        await cloneCase(caseId, original ? `${original.name} (kopia)` : undefined);
      } catch (e) {
        // Error handled in store
      }
    },
    [cloneCase, cases]
  );

  const handleActivate = useCallback(
    async (caseId: string) => {
      try {
        const activated = await activateCase(caseId);
        const kind: CaseKind = 'ShortCircuitCase'; // TODO: Get from backend
        setActiveCase(activated.id, activated.name, kind, activated.result_status);
        onCaseSelected?.(caseId);

        // POWERFACTORY_FLOW: After activating a case, close the panel
        // User is automatically taken to SLD view (default route) with the activated case
        onClose?.();

        // Navigate to the canonical editor route to ensure user is in edit mode
        if (window.location.hash !== ROUTES.SLD.hash) {
          window.location.hash = ROUTES.SLD.hash;
        }
      } catch (e) {
        // Error handled in store
      }
    },
    [activateCase, setActiveCase, onCaseSelected, onClose]
  );

  const handleRename = useCallback(
    async (caseId: string) => {
      if (!renameName.trim()) return;
      try {
        await updateCase(caseId, { name: renameName.trim() });
        setIsRenaming(null);
        setRenameName('');
      } catch (e) {
        // Error handled in store
      }
    },
    [updateCase, renameName]
  );

  const handleCaseClick = useCallback(
    (caseId: string) => {
      setSelectedCaseId(caseId);
      onCaseSelected?.(caseId);
    },
    [onCaseSelected]
  );

  const handleCaseDoubleClick = useCallback(
    (caseId: string) => {
      if (canActivate) {
        handleActivate(caseId);
      }
    },
    [canActivate, handleActivate]
  );

  const startRename = useCallback((caseItem: StudyCaseListItem) => {
    setIsRenaming(caseItem.id);
    setRenameName(caseItem.name);
  }, []);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">
          Przypadki obliczeniowe
        </h2>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
          >
            ✕
          </button>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200 flex items-center justify-between">
          <span className="text-sm text-red-700">{error}</span>
          <button
            onClick={clearError}
            className="text-red-500 hover:text-red-700 text-xs"
          >
            Zamknij
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-gray-50">
        {/* Create Buttons */}
        <button
          onClick={() => {
            setCreateKind('ShortCircuitCase');
            setIsCreating(true);
          }}
          disabled={!canCreate}
          className={clsx(
            'px-3 py-1.5 text-sm rounded transition-colors',
            canCreate
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          )}
          title={getBlockedReason('create') || 'Nowy przypadek zwarciowy'}
        >
          + Zwarciowy
        </button>
        <button
          onClick={() => {
            setCreateKind('PowerFlowCase');
            setIsCreating(true);
          }}
          disabled={!canCreate}
          className={clsx(
            'px-3 py-1.5 text-sm rounded transition-colors',
            canCreate
              ? 'bg-green-600 hover:bg-green-700 text-white'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          )}
          title={getBlockedReason('create') || 'Nowy przypadek rozpływowy'}
        >
          + Rozpływowy
        </button>

        <div className="flex-1" />

        {/* Search */}
        <input
          type="text"
          placeholder="Szukaj..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Cases List */}
      <div className="flex-1 overflow-auto">
        {/* Table Header */}
        <div className="sticky top-0 bg-gray-50 border-b border-gray-200 grid grid-cols-[1fr_auto_auto_auto] px-4 py-2 text-xs font-medium text-gray-600">
          <button
            onClick={() => handleSort('name')}
            className="text-left hover:text-gray-900 flex items-center gap-1"
          >
            Nazwa
            {sortField === 'name' && (
              <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
            )}
          </button>
          <button
            onClick={() => handleSort('result_status')}
            className="w-24 text-left hover:text-gray-900 flex items-center gap-1"
          >
            Status
            {sortField === 'result_status' && (
              <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
            )}
          </button>
          <button
            onClick={() => handleSort('updated_at')}
            className="w-32 text-left hover:text-gray-900 flex items-center gap-1"
          >
            Aktualizacja
            {sortField === 'updated_at' && (
              <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
            )}
          </button>
          <div className="w-32 text-center">Akcje</div>
        </div>

        {/* Cases */}
        {filteredCases.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            {searchQuery
              ? 'Brak przypadków pasujących do wyszukiwania'
              : 'Brak przypadków obliczeniowych. Utwórz pierwszy przypadek.'}
          </div>
        ) : (
          filteredCases.map((caseItem) => (
            <CaseRow
              key={caseItem.id}
              caseItem={caseItem}
              isSelected={selectedCaseId === caseItem.id}
              isRenaming={isRenaming === caseItem.id}
              renameName={renameName}
              deleteConfirm={deleteConfirm === caseItem.id}
              canRename={canRename}
              canClone={canClone}
              canDelete={canDelete}
              canActivate={canActivate}
              isDeleting={isDeleting}
              isCloning={isCloning}
              isActivating={isActivating}
              onClick={() => handleCaseClick(caseItem.id)}
              onDoubleClick={() => handleCaseDoubleClick(caseItem.id)}
              onActivate={() => handleActivate(caseItem.id)}
              onClone={() => handleClone(caseItem.id)}
              onStartRename={() => startRename(caseItem)}
              onRename={() => handleRename(caseItem.id)}
              onCancelRename={() => {
                setIsRenaming(null);
                setRenameName('');
              }}
              onRenameChange={setRenameName}
              onConfirmDelete={() => setDeleteConfirm(caseItem.id)}
              onCancelDelete={() => setDeleteConfirm(null)}
              onDelete={() => handleDelete(caseItem.id)}
              onCalculate={() => onCalculate?.(caseItem.id)}
              onViewResults={() => onViewResults?.(caseItem.id)}
              getBlockedReason={getBlockedReason}
            />
          ))
        )}
      </div>

      {/* Create Dialog */}
      {isCreating && (
        <CreateCaseDialog
          kind={createKind}
          name={newCaseName}
          isCreating={isCreatingCase}
          onNameChange={setNewCaseName}
          onCreate={handleCreate}
          onCancel={() => {
            setIsCreating(false);
            setNewCaseName('');
          }}
        />
      )}
    </div>
  );
}

// =============================================================================
// Case Row Sub-component
// =============================================================================

interface CaseRowProps {
  caseItem: StudyCaseListItem;
  isSelected: boolean;
  isRenaming: boolean;
  renameName: string;
  deleteConfirm: boolean;
  canRename: boolean;
  canClone: boolean;
  canDelete: boolean;
  canActivate: boolean;
  isDeleting: boolean;
  isCloning: boolean;
  isActivating: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  onActivate: () => void;
  onClone: () => void;
  onStartRename: () => void;
  onRename: () => void;
  onCancelRename: () => void;
  onRenameChange: (name: string) => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
  onCalculate: () => void;
  onViewResults: () => void;
  getBlockedReason: (action: 'create' | 'rename' | 'delete' | 'clone' | 'activate' | 'edit_config' | 'calculate') => string | null;
}

function CaseRow({
  caseItem,
  isSelected,
  isRenaming,
  renameName,
  deleteConfirm,
  canRename,
  canClone,
  canDelete,
  canActivate,
  isDeleting,
  isCloning,
  isActivating,
  onClick,
  onDoubleClick,
  onActivate,
  onClone,
  onStartRename,
  onRename,
  onCancelRename,
  onRenameChange,
  onConfirmDelete,
  onCancelDelete,
  onDelete,
  onCalculate: _onCalculate,
  onViewResults: _onViewResults,
  getBlockedReason,
}: CaseRowProps) {
  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={clsx(
        'grid grid-cols-[1fr_auto_auto_auto] px-4 py-2 border-b border-gray-100',
        'cursor-pointer transition-colors',
        isSelected && 'bg-blue-50',
        !isSelected && 'hover:bg-gray-50',
        caseItem.is_active && !isSelected && 'bg-green-50'
      )}
    >
      {/* Name */}
      <div className="flex items-center gap-2 min-w-0">
        {caseItem.is_active && (
          <span className="text-green-600 text-sm font-bold" title="Aktywny przypadek">
            &gt;
          </span>
        )}
        {isRenaming ? (
          <input
            type="text"
            value={renameName}
            onChange={(e) => onRenameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onRename();
              if (e.key === 'Escape') onCancelRename();
            }}
            onClick={(e) => e.stopPropagation()}
            autoFocus
            className="flex-1 px-2 py-1 text-sm border border-blue-400 rounded focus:outline-none"
          />
        ) : (
          <span className="truncate text-sm" title={caseItem.name}>
            {caseItem.name}
          </span>
        )}
        {caseItem.is_active && (
          <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-xs rounded">
            aktywny
          </span>
        )}
      </div>

      {/* Status */}
      <div className="w-24 flex items-center gap-1.5">
        <span className={clsx('w-2 h-2 rounded-full flex-shrink-0', STATUS_DOT_COLORS[caseItem.result_status])} />
        <span className={clsx('text-xs', STATUS_COLORS[caseItem.result_status])}>
          {RESULT_STATUS_LABELS[caseItem.result_status]}
        </span>
      </div>

      {/* Updated At */}
      <div className="w-32 text-xs text-gray-500 flex items-center">
        {new Date(caseItem.updated_at).toLocaleDateString('pl-PL', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </div>

      {/* Actions */}
      <div className="w-32 flex items-center justify-center gap-1">
        {deleteConfirm ? (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              disabled={isDeleting}
              className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
            >
              {isDeleting ? '...' : 'Usuń'}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCancelDelete();
              }}
              className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
            >
              Anuluj
            </button>
          </>
        ) : isRenaming ? (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRename();
              }}
              className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              OK
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCancelRename();
              }}
              className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
            >
              Anuluj
            </button>
          </>
        ) : (
          <>
            {!caseItem.is_active && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onActivate();
                }}
                disabled={!canActivate || isActivating}
                className={clsx(
                  'px-2 py-1 text-xs rounded transition-colors',
                  canActivate
                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                )}
                title={getBlockedReason('activate') || 'Ustaw jako aktywny'}
              >
                {isActivating ? '...' : '>'}
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onStartRename();
              }}
              disabled={!canRename}
              className={clsx(
                'px-2 py-1 text-xs rounded transition-colors',
                canRename
                  ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  : 'bg-gray-50 text-gray-400 cursor-not-allowed'
              )}
              title={getBlockedReason('rename') || 'Zmień nazwę'}
            >
              Ed
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClone();
              }}
              disabled={!canClone || isCloning}
              className={clsx(
                'px-2 py-1 text-xs rounded transition-colors',
                canClone
                  ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  : 'bg-gray-50 text-gray-400 cursor-not-allowed'
              )}
              title={getBlockedReason('clone') || 'Klonuj'}
            >
              {isCloning ? '...' : '⎘'}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onConfirmDelete();
              }}
              disabled={!canDelete}
              className={clsx(
                'px-2 py-1 text-xs rounded transition-colors',
                canDelete
                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                  : 'bg-gray-50 text-gray-400 cursor-not-allowed'
              )}
              title={getBlockedReason('delete') || 'Usuń'}
            >
              ✕
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Create Case Dialog Sub-component
// =============================================================================

interface CreateCaseDialogProps {
  kind: CaseKind;
  name: string;
  isCreating: boolean;
  onNameChange: (name: string) => void;
  onCreate: () => void;
  onCancel: () => void;
}

function CreateCaseDialog({
  kind,
  name,
  isCreating,
  onNameChange,
  onCreate,
  onCancel,
}: CreateCaseDialogProps) {
  const kindLabel =
    kind === 'ShortCircuitCase' ? 'zwarciowy' : 'rozpływowy';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-96 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Nowy przypadek {kindLabel}
        </h3>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nazwa przypadku
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) onCreate();
              if (e.key === 'Escape') onCancel();
            }}
            placeholder={kind === 'ShortCircuitCase' ? 'SC-001' : 'PF-001'}
            autoFocus
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
          >
            Anuluj
          </button>
          <button
            onClick={onCreate}
            disabled={!name.trim() || isCreating}
            className={clsx(
              'px-4 py-2 text-sm text-white rounded',
              name.trim() && !isCreating
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-blue-300 cursor-not-allowed'
            )}
          >
            {isCreating ? 'Tworzenie...' : 'Utwórz'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CaseManager;
