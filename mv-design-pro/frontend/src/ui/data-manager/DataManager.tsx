/**
 * Data Manager Component (PF-style Menedżer Danych)
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md § B: Data Manager table
 * - wizard_screens.md § 2: Element lists
 * - sld_rules.md § G.2: Selection sync
 *
 * Features:
 * - Table view with deterministic column ordering
 * - Multi-column sorting with ID tie-breaker
 * - Filtering: in_service, type_ref, switch state
 * - Search by ID + Name
 * - Batch edit (MODEL_EDIT only)
 * - Mode gating
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { clsx } from 'clsx';
import { notify } from '../notifications/store';
import type {
  DataManagerColumn,
  DataManagerRow,
  DataManagerSort,
  DataManagerFilter,
  ElementType,
  OperatingMode,
  BatchEditOperation,
  SwitchState,
  ColumnViewPreset,
  InlineEditState,
  BatchEditPreview,
} from '../types';
import { COLUMN_VIEW_PRESET_LABELS } from '../types';
import { useSelectionStore } from '../selection/store';
import { useTreeSelection } from '../selection/hooks';
import {
  useDataManagerUIStore,
  useDataManagerSort,
  useDataManagerFilter,
  useDataManagerSearchQuery,
} from './store';
import { BatchEditPreviewDialog } from './BatchEditPreviewDialog';

// ============================================================================
// Column Definitions (Deterministic Ordering)
// ============================================================================

/**
 * P9.1: Column definitions per preset and element type.
 * P9.2: Extended with editability metadata for inline editing.
 * Full column definitions (can be filtered per preset).
 */
const COLUMNS_BY_TYPE: Record<string, DataManagerColumn[]> = {
  Bus: [
    { key: 'id', label: 'ID', type: 'string', sortable: true, width: 120, editable: false, source: 'instance' },
    { key: 'name', label: 'Nazwa', type: 'string', sortable: true, width: 180, editable: true, source: 'instance' },
    { key: 'inService', label: 'W eksploatacji', type: 'boolean', sortable: true, width: 100, editable: false, source: 'instance' }, // Editable via quick action
    { key: 'voltage_kv', label: 'Napięcie', type: 'number', unit: 'kV', sortable: true, width: 100, editable: true, source: 'instance', validation: (v) => (typeof v === 'number' && v > 0 && v <= 500 ? null : 'Napięcie musi być > 0 i ≤ 500 kV') },
    { key: 'bus_type', label: 'Typ szyny', type: 'enum', sortable: true, width: 100, editable: true, source: 'instance', enumOptions: ['ZBIORCZA', 'SEKCYJNA', 'ODCZEPOWA'] },
  ],
  LineBranch: [
    { key: 'id', label: 'ID', type: 'string', sortable: true, width: 120, editable: false, source: 'instance' },
    { key: 'name', label: 'Nazwa', type: 'string', sortable: true, width: 180, editable: true, source: 'instance' },
    { key: 'inService', label: 'W eksploatacji', type: 'boolean', sortable: true, width: 100, editable: false, source: 'instance' }, // Editable via quick action
    { key: 'typeRefName', label: 'Typ', type: 'ref', sortable: true, width: 150, editable: false, source: 'type' }, // Read-only (type reference)
    { key: 'length_km', label: 'Długość', type: 'number', unit: 'km', sortable: true, width: 100, editable: true, source: 'instance', validation: (v) => (typeof v === 'number' && v > 0 && v <= 100 ? null : 'Długość musi być > 0 i ≤ 100 km') },
    { key: 'from_bus', label: 'Z szyny', type: 'ref', sortable: true, width: 120, editable: false, source: 'instance' }, // Topology - not inline editable
    { key: 'to_bus', label: 'Do szyny', type: 'ref', sortable: true, width: 120, editable: false, source: 'instance' }, // Topology - not inline editable
  ],
  TransformerBranch: [
    { key: 'id', label: 'ID', type: 'string', sortable: true, width: 120, editable: false, source: 'instance' },
    { key: 'name', label: 'Nazwa', type: 'string', sortable: true, width: 180, editable: true, source: 'instance' },
    { key: 'inService', label: 'W eksploatacji', type: 'boolean', sortable: true, width: 100, editable: false, source: 'instance' }, // Editable via quick action
    { key: 'typeRefName', label: 'Typ', type: 'ref', sortable: true, width: 150, editable: false, source: 'type' }, // Read-only (type reference)
    { key: 'rated_power_mva', label: 'Moc znam.', type: 'number', unit: 'MVA', sortable: true, width: 100, editable: false, source: 'type' }, // From type catalog
    { key: 'tap_position', label: 'Poz. zaczep.', type: 'number', sortable: true, width: 80, editable: true, source: 'instance', validation: (v) => (typeof v === 'number' && v >= -10 && v <= 10 ? null : 'Pozycja zaczepu musi być w zakresie -10..10') },
    { key: 'from_bus', label: 'SG', type: 'ref', sortable: true, width: 120, editable: false, source: 'instance' }, // Topology - not inline editable
    { key: 'to_bus', label: 'DN', type: 'ref', sortable: true, width: 120, editable: false, source: 'instance' }, // Topology - not inline editable
  ],
  Switch: [
    { key: 'id', label: 'ID', type: 'string', sortable: true, width: 120, editable: false, source: 'instance' },
    { key: 'name', label: 'Nazwa', type: 'string', sortable: true, width: 180, editable: true, source: 'instance' },
    { key: 'inService', label: 'W eksploatacji', type: 'boolean', sortable: true, width: 100, editable: false, source: 'instance' }, // Editable via quick action
    { key: 'switchState', label: 'Stan', type: 'enum', sortable: true, width: 80, editable: false, source: 'instance' }, // Editable via quick action
    { key: 'switch_type', label: 'Rodzaj', type: 'enum', sortable: true, width: 120, editable: false, source: 'instance' }, // Fixed for switch type
    { key: 'typeRefName', label: 'Typ urządzenia', type: 'ref', sortable: true, width: 150, editable: false, source: 'type' }, // Read-only (type reference)
    { key: 'from_bus', label: 'Z szyny', type: 'ref', sortable: true, width: 120, editable: false, source: 'instance' }, // Topology - not inline editable
    { key: 'to_bus', label: 'Do szyny', type: 'ref', sortable: true, width: 120, editable: false, source: 'instance' }, // Topology - not inline editable
  ],
  Source: [
    { key: 'id', label: 'ID', type: 'string', sortable: true, width: 120, editable: false, source: 'instance' },
    { key: 'name', label: 'Nazwa', type: 'string', sortable: true, width: 180, editable: true, source: 'instance' },
    { key: 'inService', label: 'W eksploatacji', type: 'boolean', sortable: true, width: 100, editable: false, source: 'instance' }, // Editable via quick action
    { key: 'source_type', label: 'Rodzaj źródła', type: 'enum', sortable: true, width: 120, editable: false, source: 'instance' }, // Fixed for source
    { key: 'sk_mva', label: 'Sk"', type: 'number', unit: 'MVA', sortable: true, width: 100, editable: true, source: 'instance', validation: (v) => (typeof v === 'number' && v > 0 && v <= 50000 ? null : 'Sk" musi być > 0 i ≤ 50000 MVA') },
    { key: 'bus_id', label: 'Szyna', type: 'ref', sortable: true, width: 120, editable: false, source: 'instance' }, // Topology - not inline editable
  ],
  Load: [
    { key: 'id', label: 'ID', type: 'string', sortable: true, width: 120, editable: false, source: 'instance' },
    { key: 'name', label: 'Nazwa', type: 'string', sortable: true, width: 180, editable: true, source: 'instance' },
    { key: 'inService', label: 'W eksploatacji', type: 'boolean', sortable: true, width: 100, editable: false, source: 'instance' }, // Editable via quick action
    { key: 'p_mw', label: 'P', type: 'number', unit: 'MW', sortable: true, width: 80, editable: true, source: 'instance', validation: (v) => (typeof v === 'number' && v >= 0 && v <= 1000 ? null : 'P musi być ≥ 0 i ≤ 1000 MW') },
    { key: 'q_mvar', label: 'Q', type: 'number', unit: 'Mvar', sortable: true, width: 80, editable: true, source: 'instance', validation: (v) => (typeof v === 'number' && v >= -1000 && v <= 1000 ? null : 'Q musi być w zakresie -1000..1000 Mvar') },
    { key: 'bus_id', label: 'Szyna', type: 'ref', sortable: true, width: 120, editable: false, source: 'instance' }, // Topology - not inline editable
  ],
};

/**
 * P9.1: Get columns for element type and preset.
 * Different presets show different subsets of columns.
 */
function getColumnsForPreset(
  elementType: ElementType,
  _preset: ColumnViewPreset
): DataManagerColumn[] {
  const allColumns = COLUMNS_BY_TYPE[elementType] ?? COLUMNS_BY_TYPE.Bus;

  // For now, all presets show all columns
  // Future: filter columns based on preset
  // BASIC: ID, Name, InService
  // TECHNICAL: + type-specific technical params
  // OPERATIONAL: + operational params (tap_position, switch_state, etc)

  // Phase 1: Return all columns for all presets
  return allColumns;
}

// ============================================================================
// Polish Labels
// ============================================================================

const CATEGORY_LABELS: Record<string, string> = {
  Bus: 'Szyny',
  LineBranch: 'Linie',
  CableBranch: 'Kable',
  TransformerBranch: 'Transformatory',
  Switch: 'Łączniki',
  Source: 'Zasilanie GPZ',
  Load: 'Odbiory',
};

const SWITCH_STATE_LABELS: Record<string, string> = {
  OPEN: 'Otwarty',
  CLOSED: 'Zamknięty',
  ALL: 'Wszystkie',
};

// ============================================================================
// Props
// ============================================================================

interface DataManagerProps {
  elementType: ElementType;
  rows: DataManagerRow[];
  mode: OperatingMode;
  onRowSelect?: (row: DataManagerRow) => void;
  onBatchEdit?: (selectedIds: string[], operation: BatchEditOperation) => Promise<void>;
  onOpenTypePicker?: (elementIds: string[], category: string) => void;
  // P9.2: Inline editing callback
  onCellEdit?: (rowId: string, field: string, value: unknown) => Promise<void>;
}

// ============================================================================
// Component
// ============================================================================

export function DataManager({
  elementType,
  rows,
  mode,
  onRowSelect,
  onBatchEdit,
  onOpenTypePicker,
  onCellEdit,
}: DataManagerProps) {
  // Selection state
  const { selectedElement, centerSldOnElement } = useSelectionStore();
  const { handleTreeClick } = useTreeSelection();

  // P9.1: Persistent UI state
  const {
    columnViewPreset,
    setColumnViewPreset,
    setSort: setPersistentSort,
    setFilter: setPersistentFilter,
    setSearchQuery: setPersistentSearchQuery,
    setSelectedElementType,
  } = useDataManagerUIStore();

  const persistedSort = useDataManagerSort(elementType);
  const persistedFilter = useDataManagerFilter(elementType);
  const persistedSearchQuery = useDataManagerSearchQuery(elementType);

  // Local state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<DataManagerSort>(persistedSort);
  const [filter, setFilter] = useState<DataManagerFilter>(persistedFilter);
  const [searchQuery, setSearchQuery] = useState(persistedSearchQuery);
  const [batchEditPending, setBatchEditPending] = useState(false);

  // P9.2: Inline editing state
  const [editingCell, setEditingCell] = useState<InlineEditState | null>(null);
  const [editValue, setEditValue] = useState<unknown>(null);
  const [inlineEditPending, setInlineEditPending] = useState(false);

  // P9.2: Batch edit preview state
  const [batchPreview, setBatchPreview] = useState<BatchEditPreview | null>(null);

  // P9.1: Search input ref for Ctrl+F
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Persist elementType selection
  useEffect(() => {
    setSelectedElementType(elementType);
  }, [elementType, setSelectedElementType]);

  // Persist state changes
  useEffect(() => {
    setPersistentSort(elementType, sort);
  }, [elementType, sort, setPersistentSort]);

  useEffect(() => {
    setPersistentFilter(elementType, filter);
  }, [elementType, filter, setPersistentFilter]);

  useEffect(() => {
    setPersistentSearchQuery(elementType, searchQuery);
  }, [elementType, searchQuery, setPersistentSearchQuery]);

  // P9.1: Keyboard shortcuts (Ctrl+F, Esc)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+F: Focus search input
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      // Esc: Clear search
      if (e.key === 'Escape' && document.activeElement === searchInputRef.current) {
        e.preventDefault();
        setSearchQuery('');
        searchInputRef.current?.blur();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Get columns for this element type and preset
  const columns = getColumnsForPreset(elementType, columnViewPreset);

  // Check if batch edit is allowed
  const canBatchEdit = mode === 'MODEL_EDIT';

  // Filter rows
  const filteredRows = useMemo(() => {
    let result = [...rows];

    // Search filter (ID + Name)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(
        (row) =>
          row.id.toLowerCase().includes(query) ||
          row.name.toLowerCase().includes(query)
      );
    }

    // In service filter
    if (filter.inServiceOnly) {
      result = result.filter((row) => row.inService);
    }

    // Type filter
    if (filter.withTypeOnly) {
      result = result.filter((row) => row.typeRef !== null);
    }
    if (filter.withoutTypeOnly) {
      result = result.filter((row) => row.typeRef === null);
    }

    // Switch state filter
    if (elementType === 'Switch' && filter.switchStateFilter !== 'ALL') {
      result = result.filter((row) => row.switchState === filter.switchStateFilter);
    }

    // P9.1: Errors only filter
    if (filter.showErrorsOnly) {
      result = result.filter(
        (row) => row.validationMessages.some((m) => m.severity === 'ERROR')
      );
    }

    return result;
  }, [rows, searchQuery, filter, elementType]);

  // Sort rows (with deterministic ID tie-breaker)
  const sortedRows = useMemo(() => {
    const sorted = [...filteredRows];
    sorted.sort((a, b) => {
      const aVal = getRowValue(a, sort.column);
      const bVal = getRowValue(b, sort.column);

      let compare = 0;
      if (aVal === null && bVal === null) compare = 0;
      else if (aVal === null) compare = 1;
      else if (bVal === null) compare = -1;
      else if (typeof aVal === 'string' && typeof bVal === 'string') {
        compare = aVal.localeCompare(bVal, 'pl');
      } else if (typeof aVal === 'number' && typeof bVal === 'number') {
        compare = aVal - bVal;
      } else if (typeof aVal === 'boolean' && typeof bVal === 'boolean') {
        compare = aVal === bVal ? 0 : aVal ? -1 : 1;
      } else {
        compare = String(aVal).localeCompare(String(bVal), 'pl');
      }

      // Apply sort direction
      if (sort.direction === 'desc') compare = -compare;

      // Tie-breaker: ID
      if (compare === 0) {
        compare = a.id.localeCompare(b.id);
      }

      return compare;
    });
    return sorted;
  }, [filteredRows, sort]);

  // P9.2: Inline editing handlers
  const canInlineEdit = mode === 'MODEL_EDIT';

  const handleCellDoubleClick = useCallback(
    (row: DataManagerRow, col: DataManagerColumn) => {
      if (!canInlineEdit) return;
      if (!col.editable) return;
      if (col.source !== 'instance') return;

      const currentValue = getRowValue(row, col.key);
      setEditingCell({ rowId: row.id, columnKey: col.key, value: currentValue });
      setEditValue(currentValue);
    },
    [canInlineEdit]
  );

  const handleCellEditChange = useCallback((value: unknown) => {
    setEditValue(value);
  }, []);

  const handleCellEditConfirm = useCallback(async () => {
    if (!editingCell || !onCellEdit) {
      setEditingCell(null);
      return;
    }

    // Find column for validation
    const col = columns.find((c) => c.key === editingCell.columnKey);
    if (!col) {
      setEditingCell(null);
      return;
    }

    // Validate
    if (col.validation) {
      const error = col.validation(editValue);
      if (error) {
        notify(`Błąd walidacji: ${error}`, 'warning');
        return;
      }
    }

    // Apply edit
    setInlineEditPending(true);
    try {
      await onCellEdit(editingCell.rowId, editingCell.columnKey, editValue);
      setEditingCell(null);
    } catch (err) {
      notify(`Błąd zapisu: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setInlineEditPending(false);
    }
  }, [editingCell, editValue, onCellEdit, columns]);

  const handleCellEditCancel = useCallback(() => {
    setEditingCell(null);
    setEditValue(null);
  }, []);

  // Handle column header click
  const handleColumnClick = useCallback((columnKey: string) => {
    setSort((prev) => ({
      column: columnKey,
      direction: prev.column === columnKey && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  }, []);

  // Handle row click
  const handleRowClick = useCallback(
    (row: DataManagerRow) => {
      handleTreeClick(row.id, row.elementType, row.name);
      centerSldOnElement(row.id);
      onRowSelect?.(row);
    },
    [handleTreeClick, centerSldOnElement, onRowSelect]
  );

  // Handle checkbox change
  const handleCheckboxChange = useCallback((rowId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(rowId);
      } else {
        next.delete(rowId);
      }
      return next;
    });
  }, []);

  // Handle select all
  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedIds(new Set(sortedRows.map((row) => row.id)));
      } else {
        setSelectedIds(new Set());
      }
    },
    [sortedRows]
  );

  // P9.2: Generate batch edit preview
  const generateBatchPreview = useCallback(
    (operation: BatchEditOperation): BatchEditPreview | null => {
      if (selectedIds.size === 0) return null;

      const selectedRows = sortedRows.filter((row) => selectedIds.has(row.id));
      const changes = selectedRows.map((row) => {
        let field: string;
        let fieldLabel: string;
        let oldValue: unknown;
        let newValue: unknown;

        switch (operation.type) {
          case 'SET_IN_SERVICE':
            field = 'in_service';
            fieldLabel = 'W eksploatacji';
            oldValue = row.inService;
            newValue = operation.value;
            break;
          case 'ASSIGN_TYPE':
            field = 'type_ref';
            fieldLabel = 'Typ';
            oldValue = row.typeRef;
            newValue = operation.typeId;
            break;
          case 'CLEAR_TYPE':
            field = 'type_ref';
            fieldLabel = 'Typ';
            oldValue = row.typeRef;
            newValue = null;
            break;
          case 'SET_SWITCH_STATE':
            field = 'state';
            fieldLabel = 'Stan łącznika';
            oldValue = row.switchState;
            newValue = operation.state;
            break;
          case 'SET_PARAMETER':
            field = operation.field;
            fieldLabel = columns.find((c) => c.key === operation.field)?.label ?? operation.field;
            oldValue = getRowValue(row, operation.field);
            newValue = operation.value;
            break;
          default:
            return null;
        }

        // Validate change
        const col = columns.find((c) => c.key === field);
        let validation: { valid: boolean; error?: string } = { valid: true };
        if (col?.validation) {
          const validationError = col.validation(newValue);
          if (validationError) {
            validation = { valid: false, error: validationError };
          }
        }

        return {
          elementId: row.id,
          elementName: row.name,
          field,
          fieldLabel,
          oldValue,
          newValue,
          validation,
        };
      }).filter((change) => change !== null);

      const hasErrors = changes.some((change) => !change.validation.valid);

      return {
        operation,
        changes,
        hasErrors,
      };
    },
    [selectedIds, sortedRows, columns]
  );

  // P9.2: Apply batch edit (after preview confirmation)
  const applyBatchEdit = useCallback(
    async (preview: BatchEditPreview) => {
      if (!onBatchEdit || preview.hasErrors) return;

      setBatchEditPending(true);
      try {
        await onBatchEdit(Array.from(selectedIds), preview.operation);
        setSelectedIds(new Set());
        setBatchPreview(null);
      } catch (err) {
        notify(`Błąd podczas operacji zbiorczej: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setBatchEditPending(false);
      }
    },
    [onBatchEdit, selectedIds]
  );

  // Batch edit handlers (P9.2: now generate preview instead of direct execution)
  const handleBatchSetInService = useCallback(
    (value: boolean) => {
      if (!canBatchEdit || selectedIds.size === 0) return;
      const preview = generateBatchPreview({ type: 'SET_IN_SERVICE', value });
      if (preview) {
        setBatchPreview(preview);
      }
    },
    [canBatchEdit, selectedIds, generateBatchPreview]
  );

  const handleBatchClearType = useCallback(() => {
    if (!canBatchEdit || selectedIds.size === 0) return;
    const preview = generateBatchPreview({ type: 'CLEAR_TYPE' });
    if (preview) {
      setBatchPreview(preview);
    }
  }, [canBatchEdit, selectedIds, generateBatchPreview]);

  const handleBatchAssignType = useCallback(() => {
    if (!canBatchEdit || selectedIds.size === 0) return;
    const category =
      elementType === 'LineBranch'
        ? 'LINE'
        : elementType === 'TransformerBranch'
        ? 'TRANSFORMER'
        : elementType === 'Switch'
        ? 'SWITCH_EQUIPMENT'
        : null;
    if (category) {
      onOpenTypePicker?.(Array.from(selectedIds), category);
    }
  }, [canBatchEdit, selectedIds, elementType, onOpenTypePicker]);

  const handleBatchSetSwitchState = useCallback(
    (state: SwitchState) => {
      if (!canBatchEdit || selectedIds.size === 0 || elementType !== 'Switch') return;
      const preview = generateBatchPreview({ type: 'SET_SWITCH_STATE', state });
      if (preview) {
        setBatchPreview(preview);
      }
    },
    [canBatchEdit, selectedIds, elementType, generateBatchPreview]
  );

  // P9.1: Quick action handlers (single row)
  const handleQuickToggleInService = useCallback(
    async (rowId: string, currentValue: boolean, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!canBatchEdit) return;
      setBatchEditPending(true);
      try {
        await onBatchEdit?.([rowId], { type: 'SET_IN_SERVICE', value: !currentValue });
      } finally {
        setBatchEditPending(false);
      }
    },
    [canBatchEdit, onBatchEdit]
  );

  const handleQuickToggleSwitchState = useCallback(
    async (rowId: string, currentState: SwitchState | undefined, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!canBatchEdit || !currentState) return;
      const newState: SwitchState = currentState === 'CLOSED' ? 'OPEN' : 'CLOSED';
      setBatchEditPending(true);
      try {
        await onBatchEdit?.([rowId], { type: 'SET_SWITCH_STATE', state: newState });
      } finally {
        setBatchEditPending(false);
      }
    },
    [canBatchEdit, onBatchEdit]
  );

  const allSelected = sortedRows.length > 0 && sortedRows.every((row) => selectedIds.has(row.id));
  const someSelected = selectedIds.size > 0 && !allSelected;

  // Check if element type supports type_ref
  const supportsTypeRef = ['LineBranch', 'TransformerBranch', 'Switch'].includes(elementType);

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm h-full flex flex-col">
      {/* Header */}
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              MENEDŻER DANYCH: {CATEGORY_LABELS[elementType] ?? elementType}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {sortedRows.length} z {rows.length} elementów
            </p>
          </div>
          <div className="text-xs text-gray-500">
            {getModeLabel(mode)}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="border-b border-gray-200 px-4 py-2 flex flex-wrap gap-2 items-center">
        {/* Search */}
        <div className="flex-1 min-w-48">
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Szukaj... (Ctrl+F)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* P9.1: Column View Preset Selector */}
        <div className="flex items-center gap-1 text-xs">
          <label className="text-gray-600">Widok:</label>
          <select
            value={columnViewPreset}
            onChange={(e) => setColumnViewPreset(e.target.value as ColumnViewPreset)}
            className="border border-gray-300 rounded px-2 py-1 text-xs"
          >
            {Object.entries(COLUMN_VIEW_PRESET_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={filter.inServiceOnly}
              onChange={(e) =>
                setFilter((prev) => ({ ...prev, inServiceOnly: e.target.checked }))
              }
              className="rounded border-gray-300"
            />
            W eksploatacji
          </label>

          {supportsTypeRef && (
            <>
              <label className="flex items-center gap-1 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={filter.withTypeOnly}
                  onChange={(e) =>
                    setFilter((prev) => ({
                      ...prev,
                      withTypeOnly: e.target.checked,
                      withoutTypeOnly: e.target.checked ? false : prev.withoutTypeOnly,
                    }))
                  }
                  className="rounded border-gray-300"
                />
                Z typem
              </label>
              <label className="flex items-center gap-1 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={filter.withoutTypeOnly}
                  onChange={(e) =>
                    setFilter((prev) => ({
                      ...prev,
                      withoutTypeOnly: e.target.checked,
                      withTypeOnly: e.target.checked ? false : prev.withTypeOnly,
                    }))
                  }
                  className="rounded border-gray-300"
                />
                Bez typu
              </label>
            </>
          )}

          {elementType === 'Switch' && (
            <select
              value={filter.switchStateFilter}
              onChange={(e) =>
                setFilter((prev) => ({
                  ...prev,
                  switchStateFilter: e.target.value as 'ALL' | 'OPEN' | 'CLOSED',
                }))
              }
              className="text-xs border border-gray-300 rounded px-2 py-1"
            >
              <option value="ALL">{SWITCH_STATE_LABELS.ALL}</option>
              <option value="OPEN">{SWITCH_STATE_LABELS.OPEN}</option>
              <option value="CLOSED">{SWITCH_STATE_LABELS.CLOSED}</option>
            </select>
          )}

          {/* P9.1: Show errors only filter */}
          <label className="flex items-center gap-1 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={filter.showErrorsOnly}
              onChange={(e) =>
                setFilter((prev) => ({ ...prev, showErrorsOnly: e.target.checked }))
              }
              className="rounded border-gray-300"
            />
            Tylko błędne
          </label>
        </div>
      </div>

      {/* Batch Edit Toolbar (MODEL_EDIT only) */}
      {canBatchEdit && selectedIds.size > 0 && (
        <div className="border-b border-gray-200 bg-blue-50 px-4 py-2 flex items-center gap-2">
          <span className="text-xs text-blue-700 font-medium">
            Zaznaczono: {selectedIds.size}
          </span>
          <div className="flex-1" />
          <span className="text-xs text-gray-500 mr-2">Edytuj zbiorczo:</span>
          <button
            onClick={() => handleBatchSetInService(true)}
            disabled={batchEditPending}
            className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50"
          >
            Włącz
          </button>
          <button
            onClick={() => handleBatchSetInService(false)}
            disabled={batchEditPending}
            className="px-2 py-1 text-xs bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200 disabled:opacity-50"
          >
            Wyłącz
          </button>
          {supportsTypeRef && (
            <>
              <button
                onClick={handleBatchAssignType}
                disabled={batchEditPending}
                className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50"
              >
                Przypisz typ...
              </button>
              <button
                onClick={handleBatchClearType}
                disabled={batchEditPending}
                className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
              >
                Wyczyść typ
              </button>
            </>
          )}
          {elementType === 'Switch' && (
            <>
              <button
                onClick={() => handleBatchSetSwitchState('CLOSED')}
                disabled={batchEditPending}
                className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50"
              >
                Zamknij
              </button>
              <button
                onClick={() => handleBatchSetSwitchState('OPEN')}
                disabled={batchEditPending}
                className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50"
              >
                Otwórz
              </button>
            </>
          )}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              {/* Checkbox column (MODEL_EDIT only) */}
              {canBatchEdit && (
                <th className="px-2 py-2 text-left border-b border-gray-200 w-8">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={clsx(
                    'px-3 py-2 text-left border-b border-gray-200 font-medium text-gray-700',
                    col.sortable && 'cursor-pointer hover:bg-gray-100'
                  )}
                  style={{ width: col.width }}
                  onClick={() => col.sortable && handleColumnClick(col.key)}
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    {col.unit && (
                      <span className="text-gray-400 font-normal">[{col.unit}]</span>
                    )}
                    {sort.column === col.key && (
                      <span className="text-blue-500">
                        {sort.direction === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </div>
                </th>
              ))}
              {/* P9.1: Quick actions column (MODEL_EDIT only) */}
              {canBatchEdit && (
                <th className="px-3 py-2 text-left border-b border-gray-200 font-medium text-gray-700 w-32">
                  Akcje
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => {
              const hasErrors = row.validationMessages.some((m) => m.severity === 'ERROR');
              const hasWarnings = row.validationMessages.some((m) => m.severity === 'WARNING');
              return (
                <tr
                  key={row.id}
                  className={clsx(
                    'border-b border-gray-100 hover:bg-gray-50 cursor-pointer',
                    selectedElement?.id === row.id && 'bg-blue-50',
                    !row.inService && 'text-gray-400',
                    hasErrors && 'border-l-4 border-l-red-500'
                  )}
                  onClick={() => handleRowClick(row)}
                >
                  {/* Checkbox */}
                  {canBatchEdit && (
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(row.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleCheckboxChange(row.id, e.target.checked);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-gray-300"
                      />
                    </td>
                  )}
                  {columns.map((col, colIdx) => {
                    const isEditing = editingCell?.rowId === row.id && editingCell?.columnKey === col.key;
                    const isEditable = canInlineEdit && col.editable && col.source === 'instance';
                    const isFromType = col.source === 'type';

                    return (
                      <td
                        key={col.key}
                        className={clsx(
                          'px-3 py-2',
                          row.validationMessages.some((m) => m.field === col.key) &&
                            'bg-red-50 text-red-700',
                          isEditable && 'cursor-pointer hover:bg-blue-50',
                          isFromType && 'bg-gray-50'
                        )}
                        onDoubleClick={() => !isEditing && handleCellDoubleClick(row, col)}
                        title={isFromType ? 'Parametr z typu katalogowego (tylko odczyt)' : undefined}
                      >
                        <div className="flex items-center gap-2">
                          {/* P9.1: Error/Warning badge (first column only) */}
                          {colIdx === 0 && (hasErrors || hasWarnings) && (
                            <span
                              className={clsx(
                                'px-1.5 py-0.5 text-xs font-semibold rounded',
                                hasErrors
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-yellow-100 text-yellow-700'
                              )}
                              title={
                                hasErrors
                                  ? 'Błąd: ' + row.validationMessages.find((m) => m.severity === 'ERROR')?.message
                                  : 'Ostrzeżenie: ' + row.validationMessages.find((m) => m.severity === 'WARNING')?.message
                              }
                            >
                              {hasErrors ? 'ERR' : 'WARN'}
                            </span>
                          )}
                          {/* P9.2: Inline editing cell */}
                          {isEditing ? (
                            renderEditableCell(col, editValue, handleCellEditChange, handleCellEditConfirm, handleCellEditCancel, inlineEditPending)
                          ) : (
                            renderCellValue(row, col)
                          )}
                        </div>
                      </td>
                    );
                  })}
                {/* P9.1: Quick actions cell (MODEL_EDIT only) */}
                {canBatchEdit && (
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      {/* Toggle In Service */}
                      <button
                        onClick={(e) => handleQuickToggleInService(row.id, row.inService, e)}
                        disabled={batchEditPending}
                        className={clsx(
                          'px-1.5 py-0.5 text-xs rounded disabled:opacity-50 transition-colors',
                          row.inService
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        )}
                        title={row.inService ? 'Wylacz' : 'Wlacz'}
                      >
                        {row.inService ? 'ON' : 'OFF'}
                      </button>
                      {/* Toggle Switch State (Switch only) */}
                      {elementType === 'Switch' && row.switchState && (
                        <button
                          onClick={(e) => handleQuickToggleSwitchState(row.id, row.switchState, e)}
                          disabled={batchEditPending}
                          className={clsx(
                            'px-1.5 py-0.5 text-xs rounded disabled:opacity-50 transition-colors',
                            row.switchState === 'CLOSED'
                              ? 'bg-green-100 text-green-700 hover:bg-green-200'
                              : 'bg-red-100 text-red-700 hover:bg-red-200'
                          )}
                          title={row.switchState === 'CLOSED' ? 'Otwórz' : 'Zamknij'}
                        >
                          {row.switchState === 'CLOSED' ? 'Z' : 'O'}
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
              );
            })}
            {sortedRows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + (canBatchEdit ? 2 : 0)}
                  className="px-4 py-8 text-center text-gray-500"
                >
                  Brak elementów do wyświetlenia
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 px-4 py-2 bg-gray-50 text-xs text-gray-500">
        Razem: {rows.length} | Wyświetlono: {sortedRows.length}
        {selectedIds.size > 0 && ` | Zaznaczono: ${selectedIds.size}`}
      </div>

      {/* P9.2: Batch Edit Preview Dialog */}
      <BatchEditPreviewDialog
        preview={batchPreview}
        pending={batchEditPending}
        onConfirm={() => {
          if (batchPreview) {
            applyBatchEdit(batchPreview);
          }
        }}
        onCancel={() => setBatchPreview(null)}
      />
    </div>
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * P9.2: Render editable cell (input/select based on column type).
 */
function renderEditableCell(
  col: DataManagerColumn,
  value: unknown,
  onChange: (value: unknown) => void,
  onConfirm: () => void,
  onCancel: () => void,
  pending: boolean
): React.ReactNode {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onConfirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  // Enum type - render select
  if (col.type === 'enum' && col.enumOptions) {
    return (
      <select
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={onConfirm}
        autoFocus
        disabled={pending}
        className="w-full px-2 py-1 text-xs border border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-600"
        onClick={(e) => e.stopPropagation()}
      >
        {col.enumOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  // Number type - render number input
  if (col.type === 'number') {
    return (
      <input
        type="number"
        step="any"
        value={typeof value === 'number' ? value : ''}
        onChange={(e) => onChange(e.target.value ? parseFloat(e.target.value) : null)}
        onKeyDown={handleKeyDown}
        onBlur={onConfirm}
        autoFocus
        disabled={pending}
        className="w-full px-2 py-1 text-xs border border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-600"
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  // String type - render text input
  return (
    <input
      type="text"
      value={String(value ?? '')}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={onConfirm}
      autoFocus
      disabled={pending}
      className="w-full px-2 py-1 text-xs border border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-600"
      onClick={(e) => e.stopPropagation()}
    />
  );
}

function getRowValue(row: DataManagerRow, key: string): unknown {
  if (key === 'inService') return row.inService;
  if (key === 'typeRefName') return row.typeRefName;
  if (key === 'switchState') return row.switchState;
  return row.data[key] ?? null;
}

function renderCellValue(row: DataManagerRow, col: DataManagerColumn): React.ReactNode {
  const value = getRowValue(row, col.key);

  if (value === null || value === undefined) {
    return <span className="text-gray-300">—</span>;
  }

  if (col.type === 'boolean') {
    return value ? 'TAK' : 'NIE';
  }

  if (col.key === 'switchState') {
    return SWITCH_STATE_LABELS[value as string] ?? value;
  }

  if (col.type === 'number' && typeof value === 'number') {
    return value.toFixed(col.key.includes('kv') || col.key.includes('mva') ? 2 : 3);
  }

  return String(value);
}

function getModeLabel(mode: OperatingMode): string {
  switch (mode) {
    case 'MODEL_EDIT':
      return 'Tryb: Model sieci';
    case 'CASE_CONFIG':
      return 'Tryb: Model sieci';
    case 'RESULT_VIEW':
      return 'Tryb: Analiza i wyniki';
    default:
      return mode;
  }
}

export default DataManager;
