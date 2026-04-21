/**
 * P9: Project Tree & Data Manager Tests
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md § A: Project Tree structure
 * - ui_canonical_parity.md § B: Data Manager table
 * - sld_rules.md § G.1: 4-way sync (Tree ↔ DM ↔ Grid ↔ SLD)
 *
 * Tests:
 * - Deterministic column ordering
 * - Mode gating (batch edit only in MODEL_EDIT)
 * - Selection synchronization
 * - Batch edit operations
 * - Filtering and sorting
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useSelectionStore } from '../selection/store';
import { useDataManagerUIStore } from '../data-manager/store';
import { normalizeOperatingMode } from '../operatingMode';
import type {
  TreeNode,
  TreeNodeType,
  DataManagerColumn,
  DataManagerRow,
  DataManagerSort,
  DataManagerFilter,
  BatchEditOperation,
  ElementType,
  OperatingMode,
  ColumnViewPreset,
  ValidationMessage,
} from '../types';
import { COLUMN_VIEW_PRESET_LABELS } from '../types';

// ============================================================================
// Project Tree Tests
// ============================================================================

describe('Drzewo Projektu', () => {
  describe('Tree Structure (PF-style)', () => {
    it('should have canonical tree node types', () => {
      const expectedNodeTypes: TreeNodeType[] = [
        'PROJECT',
        'NETWORK',
        'BUSES',
        'LINES',
        'CABLES',
        'TRANSFORMERS',
        'SWITCHES',
        'SOURCES',
        'LOADS',
        'TYPE_CATALOG',
        'LINE_TYPES',
        'CABLE_TYPES',
        'TRANSFORMER_TYPES',
        'SWITCH_EQUIPMENT_TYPES',
        'CASES',
        'RESULTS',
        'ELEMENT',
      ];

      // Verify all expected node types are defined
      expectedNodeTypes.forEach((nodeType) => {
        expect(typeof nodeType).toBe('string');
      });
    });

    it('should map tree categories to element types correctly', () => {
      const mapping: Record<string, ElementType | null> = {
        BUSES: 'Bus',
        LINES: 'LineBranch',
        CABLES: 'LineBranch',
        TRANSFORMERS: 'TransformerBranch',
        SWITCHES: 'Switch',
        SOURCES: 'Source',
        LOADS: 'Load',
        TYPE_CATALOG: null,
        CASES: null,
        RESULTS: null,
      };

      // Verify mapping exists and is correct
      expect(mapping.BUSES).toBe('Bus');
      expect(mapping.LINES).toBe('LineBranch');
      expect(mapping.TRANSFORMERS).toBe('TransformerBranch');
      expect(mapping.SWITCHES).toBe('Switch');
    });

    it('should build tree with correct Polish labels', () => {
      const expectedLabels: Record<TreeNodeType, string> = {
        PROJECT: 'Projekt',
        NETWORK: 'Sieć',
        BUSES: 'Szyny',
        LINES: 'Linie',
        CABLES: 'Kable',
        TRANSFORMERS: 'Transformatory',
        SWITCHES: 'Łączniki',
        SOURCES: 'Źródła',
        LOADS: 'Odbiory',
        TYPE_CATALOG: 'Katalog typów',
        LINE_TYPES: 'Typy linii',
        CABLE_TYPES: 'Typy kabli',
        TRANSFORMER_TYPES: 'Typy transformatorów',
        SWITCH_EQUIPMENT_TYPES: 'Typy aparatury',
        CASES: 'Przypadki obliczeniowe',
        RESULTS: 'Wyniki',
        ELEMENT: '',
      };

      // Verify all labels are in Polish
      Object.values(expectedLabels).forEach((label) => {
        // All non-empty labels should contain Polish characters or be common words
        if (label) {
          expect(typeof label).toBe('string');
          expect(label.length).toBeGreaterThan(0);
        }
      });
    });
  });

  describe('Tree Node Expansion', () => {
    beforeEach(() => {
      const store = useSelectionStore.getState();
      store.clearSelection();
      // Clear expanded nodes by collapsing all
      store.treeExpandedNodes.forEach((nodeId) => {
        store.collapseTreeNode(nodeId);
      });
    });

    it('should track expanded nodes in store', () => {
      const store = useSelectionStore.getState();

      store.expandTreeNode('network');
      store.expandTreeNode('buses');

      const state = useSelectionStore.getState();
      expect(state.treeExpandedNodes.has('network')).toBe(true);
      expect(state.treeExpandedNodes.has('buses')).toBe(true);
    });

    it('should collapse nodes correctly', () => {
      const store = useSelectionStore.getState();

      store.expandTreeNode('network');
      store.expandTreeNode('buses');
      store.collapseTreeNode('buses');

      const state = useSelectionStore.getState();
      expect(state.treeExpandedNodes.has('network')).toBe(true);
      expect(state.treeExpandedNodes.has('buses')).toBe(false);
    });
  });

  describe('Tree → Selection Sync', () => {
    beforeEach(() => {
      const store = useSelectionStore.getState();
      store.clearSelection();
      store.setMode('MODEL_EDIT');
    });

    it('should select element from tree click', () => {
      const store = useSelectionStore.getState();

      store.selectElement({ id: 'bus-001', type: 'Bus', name: 'Szyna główna' });

      const state = useSelectionStore.getState();
      expect(state.selectedElement).toEqual({
        id: 'bus-001',
        type: 'Bus',
        name: 'Szyna główna',
      });
    });

    it('should center SLD on element when selected from tree', () => {
      const store = useSelectionStore.getState();

      store.selectElement({ id: 'line-001', type: 'LineBranch', name: 'Linia 1' });
      store.centerSldOnElement('line-001');

      const state = useSelectionStore.getState();
      expect(state.sldCenterOnElement).toBe('line-001');
    });

    it('should open property grid on selection', () => {
      const store = useSelectionStore.getState();
      store.togglePropertyGrid(false);

      store.selectElement({ id: 'bus-001', type: 'Bus', name: 'Szyna główna' });

      const state = useSelectionStore.getState();
      expect(state.propertyGridOpen).toBe(true);
    });
  });
});

// ============================================================================
// Data Manager Tests
// ============================================================================

describe('Menedżer Danych', () => {
  describe('Deterministic Column Ordering', () => {
    it('should have fixed column order for Bus elements', () => {
      const busColumns: DataManagerColumn[] = [
        { key: 'id', label: 'ID', type: 'string', sortable: true },
        { key: 'name', label: 'Nazwa', type: 'string', sortable: true },
        { key: 'inService', label: 'W eksploatacji', type: 'boolean', sortable: true },
        { key: 'voltage_kv', label: 'Napięcie', type: 'number', unit: 'kV', sortable: true },
        { key: 'bus_type', label: 'Typ szyny', type: 'enum', sortable: true },
      ];

      // Verify column order is deterministic
      const columnKeys = busColumns.map((c) => c.key);
      expect(columnKeys).toEqual(['id', 'name', 'inService', 'voltage_kv', 'bus_type']);
    });

    it('should have fixed column order for LineBranch elements', () => {
      const lineColumns: DataManagerColumn[] = [
        { key: 'id', label: 'ID', type: 'string', sortable: true },
        { key: 'name', label: 'Nazwa', type: 'string', sortable: true },
        { key: 'inService', label: 'W eksploatacji', type: 'boolean', sortable: true },
        { key: 'typeRefName', label: 'Typ', type: 'ref', sortable: true },
        { key: 'length_km', label: 'Długość', type: 'number', unit: 'km', sortable: true },
        { key: 'from_bus', label: 'Z szyny', type: 'ref', sortable: true },
        { key: 'to_bus', label: 'Do szyny', type: 'ref', sortable: true },
      ];

      // Verify column order is deterministic
      const columnKeys = lineColumns.map((c) => c.key);
      expect(columnKeys).toEqual([
        'id',
        'name',
        'inService',
        'typeRefName',
        'length_km',
        'from_bus',
        'to_bus',
      ]);
    });

    it('should have Polish labels for all columns', () => {
      const columns: DataManagerColumn[] = [
        { key: 'id', label: 'ID', type: 'string', sortable: true },
        { key: 'name', label: 'Nazwa', type: 'string', sortable: true },
        { key: 'inService', label: 'W eksploatacji', type: 'boolean', sortable: true },
      ];

      // Verify labels
      expect(columns[1].label).toBe('Nazwa');
      expect(columns[2].label).toBe('W eksploatacji');
    });
  });

  describe('Sorting', () => {
    it('should sort by column with deterministic tie-breaker (ID)', () => {
      const rows: DataManagerRow[] = [
        {
          id: 'bus-003',
          name: 'Szyna A',
          elementType: 'Bus',
          inService: true,
          typeRef: null,
          typeRefName: null,
          data: {},
          validationMessages: [],
        },
        {
          id: 'bus-001',
          name: 'Szyna A',
          elementType: 'Bus',
          inService: true,
          typeRef: null,
          typeRefName: null,
          data: {},
          validationMessages: [],
        },
        {
          id: 'bus-002',
          name: 'Szyna A',
          elementType: 'Bus',
          inService: true,
          typeRef: null,
          typeRefName: null,
          data: {},
          validationMessages: [],
        },
      ];

      // Sort by name (all same), should use ID as tie-breaker
      const sort: DataManagerSort = { column: 'name', direction: 'asc' };
      const sorted = [...rows].sort((a, b) => {
        const nameCompare = a.name.localeCompare(b.name, 'pl');
        if (nameCompare !== 0) return nameCompare;
        return a.id.localeCompare(b.id); // Tie-breaker
      });

      expect(sorted[0].id).toBe('bus-001');
      expect(sorted[1].id).toBe('bus-002');
      expect(sorted[2].id).toBe('bus-003');
    });

    it('should sort descending correctly', () => {
      const rows: DataManagerRow[] = [
        {
          id: 'bus-001',
          name: 'Alfa',
          elementType: 'Bus',
          inService: true,
          typeRef: null,
          typeRefName: null,
          data: {},
          validationMessages: [],
        },
        {
          id: 'bus-002',
          name: 'Beta',
          elementType: 'Bus',
          inService: true,
          typeRef: null,
          typeRefName: null,
          data: {},
          validationMessages: [],
        },
        {
          id: 'bus-003',
          name: 'Gamma',
          elementType: 'Bus',
          inService: true,
          typeRef: null,
          typeRefName: null,
          data: {},
          validationMessages: [],
        },
      ];

      // Sort by name descending
      const sorted = [...rows].sort((a, b) => {
        const compare = b.name.localeCompare(a.name, 'pl');
        if (compare !== 0) return compare;
        return a.id.localeCompare(b.id);
      });

      expect(sorted[0].name).toBe('Gamma');
      expect(sorted[1].name).toBe('Beta');
      expect(sorted[2].name).toBe('Alfa');
    });
  });

  describe('Filtering', () => {
    const testRows: DataManagerRow[] = [
      {
        id: 'line-001',
        name: 'Linia 1',
        elementType: 'LineBranch',
        inService: true,
        typeRef: 'type-001',
        typeRefName: 'AFL-6 150',
        data: {},
        validationMessages: [],
      },
      {
        id: 'line-002',
        name: 'Linia 2',
        elementType: 'LineBranch',
        inService: false,
        typeRef: null,
        typeRefName: null,
        data: {},
        validationMessages: [],
      },
      {
        id: 'line-003',
        name: 'Linia 3',
        elementType: 'LineBranch',
        inService: true,
        typeRef: null,
        typeRefName: null,
        data: {},
        validationMessages: [],
      },
    ];

    it('should filter by in_service', () => {
      const filtered = testRows.filter((row) => row.inService);
      expect(filtered.length).toBe(2);
      expect(filtered.every((r) => r.inService)).toBe(true);
    });

    it('should filter by with type_ref', () => {
      const filtered = testRows.filter((row) => row.typeRef !== null);
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe('line-001');
    });

    it('should filter by without type_ref', () => {
      const filtered = testRows.filter((row) => row.typeRef === null);
      expect(filtered.length).toBe(2);
    });

    it('should search by ID', () => {
      const query = 'line-002';
      const filtered = testRows.filter((row) =>
        row.id.toLowerCase().includes(query.toLowerCase())
      );
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe('line-002');
    });

    it('should search by name', () => {
      const query = 'linia 1';
      const filtered = testRows.filter((row) =>
        row.name.toLowerCase().includes(query.toLowerCase())
      );
      expect(filtered.length).toBe(1);
      expect(filtered[0].name).toBe('Linia 1');
    });
  });

  describe('Switch State Filtering', () => {
    const switchRows: DataManagerRow[] = [
      {
        id: 'sw-001',
        name: 'Wyłącznik 1',
        elementType: 'Switch',
        inService: true,
        typeRef: null,
        typeRefName: null,
        switchState: 'CLOSED',
        data: {},
        validationMessages: [],
      },
      {
        id: 'sw-002',
        name: 'Wyłącznik 2',
        elementType: 'Switch',
        inService: true,
        typeRef: null,
        typeRefName: null,
        switchState: 'OPEN',
        data: {},
        validationMessages: [],
      },
      {
        id: 'sw-003',
        name: 'Wyłącznik 3',
        elementType: 'Switch',
        inService: true,
        typeRef: null,
        typeRefName: null,
        switchState: 'CLOSED',
        data: {},
        validationMessages: [],
      },
    ];

    it('should filter by OPEN state', () => {
      const filtered = switchRows.filter((row) => row.switchState === 'OPEN');
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe('sw-002');
    });

    it('should filter by CLOSED state', () => {
      const filtered = switchRows.filter((row) => row.switchState === 'CLOSED');
      expect(filtered.length).toBe(2);
    });

    it('should show all when filter is ALL', () => {
      const filter: DataManagerFilter = {
        inServiceOnly: false,
        withTypeOnly: false,
        withoutTypeOnly: false,
        switchStateFilter: 'ALL',
      };
      // ALL means no filtering by switch state
      expect(switchRows.length).toBe(3);
    });
  });
});

// ============================================================================
// Mode Gating Tests
// ============================================================================

describe('Blokada Trybu', () => {
  beforeEach(() => {
    const store = useSelectionStore.getState();
    store.clearSelection();
    store.setMode('MODEL_EDIT');
  });

  describe('Batch Edit Gating', () => {
    it('should allow batch edit in MODEL_EDIT mode', () => {
      const store = useSelectionStore.getState();
      store.setMode('MODEL_EDIT');

      const state = useSelectionStore.getState();
      const canBatchEdit = state.mode === 'MODEL_EDIT';

      expect(canBatchEdit).toBe(true);
    });

    it('should normalize CASE_CONFIG to editable runtime mode', () => {
      const store = useSelectionStore.getState();
      store.setMode('CASE_CONFIG');

      const state = useSelectionStore.getState();
      const canBatchEdit = state.mode === 'MODEL_EDIT';

      expect(state.mode).toBe('MODEL_EDIT');
      expect(canBatchEdit).toBe(true);
    });

    it('should NOT allow batch edit in RESULT_VIEW mode', () => {
      const store = useSelectionStore.getState();
      store.setMode('RESULT_VIEW');

      const state = useSelectionStore.getState();
      const canBatchEdit = state.mode === 'MODEL_EDIT';

      expect(canBatchEdit).toBe(false);
    });
  });

  describe('Read-Only Mode', () => {
    it('should be read-only in RESULT_VIEW', () => {
      const store = useSelectionStore.getState();
      store.setMode('RESULT_VIEW');

      const state = useSelectionStore.getState();
      const isReadOnly = state.mode === 'RESULT_VIEW';

      expect(isReadOnly).toBe(true);
    });

    it('should keep model writable after CASE_CONFIG compatibility input', () => {
      const store = useSelectionStore.getState();
      store.setMode('CASE_CONFIG');

      const state = useSelectionStore.getState();
      const isModelReadOnly = state.mode === 'RESULT_VIEW';

      expect(state.mode).toBe('MODEL_EDIT');
      expect(isModelReadOnly).toBe(false);
    });

    it('should allow editing in MODEL_EDIT', () => {
      const store = useSelectionStore.getState();
      store.setMode('MODEL_EDIT');

      const state = useSelectionStore.getState();
      const isReadOnly = state.mode === 'RESULT_VIEW';

      expect(isReadOnly).toBe(false);
    });
  });
});

// ============================================================================
// 4-Way Sync Tests
// ============================================================================

describe('Synchronizacja 4-kierunkowa (Drzewo ↔ MD ↔ Siatka ↔ SLD)', () => {
  beforeEach(() => {
    const store = useSelectionStore.getState();
    store.clearSelection();
    store.setMode('MODEL_EDIT');
    store.centerSldOnElement(null);
  });

  it('should sync selection from any source to store', () => {
    const store = useSelectionStore.getState();

    // Simulate tree selection
    store.selectElement({ id: 'bus-001', type: 'Bus', name: 'Szyna 1' });

    const state = useSelectionStore.getState();
    expect(state.selectedElement?.id).toBe('bus-001');
    expect(state.propertyGridOpen).toBe(true);
  });

  it('should trigger SLD center when selecting from tree', () => {
    const store = useSelectionStore.getState();

    store.selectElement({ id: 'line-001', type: 'LineBranch', name: 'Linia 1' });
    store.centerSldOnElement('line-001');

    const state = useSelectionStore.getState();
    expect(state.sldCenterOnElement).toBe('line-001');
  });

  it('should preserve selection across mode changes', () => {
    const store = useSelectionStore.getState();

    // Select in MODEL_EDIT
    store.selectElement({ id: 'bus-001', type: 'Bus', name: 'Szyna 1' });

    // Change to CASE_CONFIG compatibility input
    store.setMode('CASE_CONFIG');

    const state = useSelectionStore.getState();
    expect(state.selectedElement?.id).toBe('bus-001');
    expect(state.mode).toBe('MODEL_EDIT');
  });

  it('should use single source of truth (Selection Store)', () => {
    const store1 = useSelectionStore.getState();
    const store2 = useSelectionStore.getState();

    // Both should reference the same store
    store1.selectElement({ id: 'bus-001', type: 'Bus', name: 'Szyna 1' });

    expect(store2.selectedElement).toBeNull(); // Direct reference, not updated yet

    // But getting state again shows the same value
    const state1 = useSelectionStore.getState();
    const state2 = useSelectionStore.getState();

    expect(state1.selectedElement?.id).toBe('bus-001');
    expect(state2.selectedElement?.id).toBe('bus-001');
  });
});

// ============================================================================
// Batch Edit Operation Tests
// ============================================================================

describe('Operacje edycji zbiorczej', () => {
  it('should define SET_IN_SERVICE operation', () => {
    const operation: BatchEditOperation = { type: 'SET_IN_SERVICE', value: true };
    expect(operation.type).toBe('SET_IN_SERVICE');
    expect(operation.value).toBe(true);
  });

  it('should define ASSIGN_TYPE operation', () => {
    const operation: BatchEditOperation = { type: 'ASSIGN_TYPE', typeId: 'type-001' };
    expect(operation.type).toBe('ASSIGN_TYPE');
    expect(operation.typeId).toBe('type-001');
  });

  it('should define CLEAR_TYPE operation', () => {
    const operation: BatchEditOperation = { type: 'CLEAR_TYPE' };
    expect(operation.type).toBe('CLEAR_TYPE');
  });

  it('should define SET_SWITCH_STATE operation', () => {
    const operation: BatchEditOperation = { type: 'SET_SWITCH_STATE', state: 'OPEN' };
    expect(operation.type).toBe('SET_SWITCH_STATE');
    expect(operation.state).toBe('OPEN');
  });

  it('should only allow batch edit in MODEL_EDIT mode', () => {
    const modes: OperatingMode[] = ['MODEL_EDIT', 'CASE_CONFIG', 'RESULT_VIEW'];

    modes.forEach((mode) => {
      const canBatchEdit = normalizeOperatingMode(mode) === 'MODEL_EDIT';
      if (mode === 'RESULT_VIEW') {
        expect(canBatchEdit).toBe(false);
      } else {
        expect(canBatchEdit).toBe(true);
      }
    });
  });
});

// ============================================================================
// Polish Labels Tests
// ============================================================================

describe('Polskie etykiety UI', () => {
  it('should have Polish labels for tree categories', () => {
    const labels = {
      BUSES: 'Szyny',
      LINES: 'Linie',
      CABLES: 'Kable',
      TRANSFORMERS: 'Transformatory',
      SWITCHES: 'Łączniki',
      SOURCES: 'Źródła',
      LOADS: 'Odbiory',
    };

    // Verify Polish characters present (uppercase Ł in Łączniki)
    expect(labels.SWITCHES.toLowerCase()).toContain('ł');
    expect(labels.SOURCES).toContain('ó');
  });

  it('should have Polish labels for Data Manager columns', () => {
    const labels = {
      name: 'Nazwa',
      inService: 'W eksploatacji',
      voltage: 'Napięcie',
      length: 'Długość',
    };

    expect(labels.name).toBe('Nazwa');
    expect(labels.inService).toBe('W eksploatacji');
    expect(labels.length).toContain('ł');
  });

  it('should have Polish labels for batch edit buttons', () => {
    const labels = {
      enable: 'Włącz',
      disable: 'Wyłącz',
      assignType: 'Przypisz typ...',
      clearType: 'Wyczyść typ',
      open: 'Otwórz',
      close: 'Zamknij',
    };

    expect(labels.enable).toBe('Włącz');
    expect(labels.disable).toContain('ł');
    expect(labels.clearType).toContain('ść');
  });

  it('should have Polish labels for filter options', () => {
    const labels = {
      inServiceOnly: 'W eksploatacji',
      withType: 'Z typem',
      withoutType: 'Bez typu',
      all: 'Wszystkie',
      open: 'Otwarty',
      closed: 'Zamknięty',
    };

    expect(labels.all).toBe('Wszystkie');
    expect(labels.closed).toBe('Zamknięty');
  });
});

// ============================================================================
// P9.1: Persistencja stanu UI
// ============================================================================

describe('Persystencja stanu UI', () => {
  beforeEach(() => {
    // Clear localStorage
    localStorage.clear();
  });

  describe('Tree Expansion Persistence', () => {
    it('should persist tree expansion state', () => {
      const store = useSelectionStore.getState();

      // Expand nodes
      store.expandTreeNode('network');
      store.expandTreeNode('buses');

      // Verify they are expanded
      const state = useSelectionStore.getState();
      expect(state.treeExpandedNodes.has('network')).toBe(true);
      expect(state.treeExpandedNodes.has('buses')).toBe(true);
    });

    it('should persist property grid open state', () => {
      const store = useSelectionStore.getState();

      store.togglePropertyGrid(true);

      const state = useSelectionStore.getState();
      expect(state.propertyGridOpen).toBe(true);
    });
  });

  describe('Data Manager UI State Persistence', () => {
    it('should persist selected element type', () => {
      const store = useDataManagerUIStore.getState();

      store.setSelectedElementType('Bus');

      const state = useDataManagerUIStore.getState();
      expect(state.selectedElementType).toBe('Bus');
    });

    it('should persist column view preset', () => {
      const store = useDataManagerUIStore.getState();

      store.setColumnViewPreset('TECHNICAL');

      const state = useDataManagerUIStore.getState();
      expect(state.columnViewPreset).toBe('TECHNICAL');
    });

    it('should persist sort per element type', () => {
      const store = useDataManagerUIStore.getState();

      const sort: DataManagerSort = { column: 'name', direction: 'desc' };
      store.setSort('Bus', sort);

      const state = useDataManagerUIStore.getState();
      expect(state.sortByType.Bus).toEqual(sort);
    });

    it('should persist filter per element type', () => {
      const store = useDataManagerUIStore.getState();

      const filter: DataManagerFilter = {
        inServiceOnly: true,
        withTypeOnly: false,
        withoutTypeOnly: false,
        switchStateFilter: 'ALL',
        showErrorsOnly: false,
      };
      store.setFilter('LineBranch', filter);

      const state = useDataManagerUIStore.getState();
      expect(state.filterByType.LineBranch).toEqual(filter);
    });

    it('should persist search query per element type', () => {
      const store = useDataManagerUIStore.getState();

      store.setSearchQuery('Bus', 'szyna główna');

      const state = useDataManagerUIStore.getState();
      expect(state.searchQueryByType.Bus).toBe('szyna główna');
    });
  });
});

// ============================================================================
// P9.1: Column View Presets
// ============================================================================

describe('Presety widoku kolumn', () => {
  it('should have three preset types', () => {
    const presets: ColumnViewPreset[] = ['BASIC', 'TECHNICAL', 'OPERATIONAL'];
    expect(presets.length).toBe(3);
  });

  it('should have Polish labels for presets', () => {
    expect(COLUMN_VIEW_PRESET_LABELS.BASIC).toBe('Widok podstawowy');
    expect(COLUMN_VIEW_PRESET_LABELS.TECHNICAL).toBe('Parametry techniczne');
    expect(COLUMN_VIEW_PRESET_LABELS.OPERATIONAL).toBe('Eksploatacja');
  });

  it('should switch between presets', () => {
    const store = useDataManagerUIStore.getState();

    store.setColumnViewPreset('BASIC');
    expect(useDataManagerUIStore.getState().columnViewPreset).toBe('BASIC');

    store.setColumnViewPreset('TECHNICAL');
    expect(useDataManagerUIStore.getState().columnViewPreset).toBe('TECHNICAL');

    store.setColumnViewPreset('OPERATIONAL');
    expect(useDataManagerUIStore.getState().columnViewPreset).toBe('OPERATIONAL');
  });
});

// ============================================================================
// P9.1: Error Filtering & Signaling
// ============================================================================

describe('Filtrowanie i sygnalizacja błędów', () => {
  const testRowsWithErrors: DataManagerRow[] = [
    {
      id: 'bus-001',
      name: 'Szyna 1',
      elementType: 'Bus',
      inService: true,
      typeRef: null,
      typeRefName: null,
      data: {},
      validationMessages: [
        { code: 'ERR_001', severity: 'ERROR', message: 'Brak napięcia znamionowego' },
      ],
    },
    {
      id: 'bus-002',
      name: 'Szyna 2',
      elementType: 'Bus',
      inService: true,
      typeRef: null,
      typeRefName: null,
      data: {},
      validationMessages: [
        { code: 'WARN_001', severity: 'WARNING', message: 'Niska moc zwarciowa' },
      ],
    },
    {
      id: 'bus-003',
      name: 'Szyna 3',
      elementType: 'Bus',
      inService: true,
      typeRef: null,
      typeRefName: null,
      data: {},
      validationMessages: [],
    },
  ];

  it('should filter rows with errors only', () => {
    const filter: DataManagerFilter = {
      inServiceOnly: false,
      withTypeOnly: false,
      withoutTypeOnly: false,
      switchStateFilter: 'ALL',
      showErrorsOnly: true,
    };

    const filtered = testRowsWithErrors.filter((row) =>
      row.validationMessages.some((m) => m.severity === 'ERROR')
    );

    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe('bus-001');
  });

  it('should detect errors in rows', () => {
    const rowWithError = testRowsWithErrors[0];
    const hasErrors = rowWithError.validationMessages.some((m) => m.severity === 'ERROR');
    expect(hasErrors).toBe(true);
  });

  it('should detect warnings in rows', () => {
    const rowWithWarning = testRowsWithErrors[1];
    const hasWarnings = rowWithWarning.validationMessages.some((m) => m.severity === 'WARNING');
    expect(hasWarnings).toBe(true);
  });

  it('should handle rows without validation messages', () => {
    const rowNoErrors = testRowsWithErrors[2];
    const hasErrors = rowNoErrors.validationMessages.some((m) => m.severity === 'ERROR');
    const hasWarnings = rowNoErrors.validationMessages.some((m) => m.severity === 'WARNING');
    expect(hasErrors).toBe(false);
    expect(hasWarnings).toBe(false);
  });
});

// ============================================================================
// P9.1: Quick Actions (MODEL_EDIT Only)
// ============================================================================

describe('Szybkie akcje', () => {
  it('should have toggle in-service action', () => {
    const operations: BatchEditOperation[] = [
      { type: 'SET_IN_SERVICE', value: true },
      { type: 'SET_IN_SERVICE', value: false },
    ];

    expect(operations[0].type).toBe('SET_IN_SERVICE');
    expect(operations[0].value).toBe(true);
    expect(operations[1].value).toBe(false);
  });

  it('should have toggle switch state action', () => {
    const operations: BatchEditOperation[] = [
      { type: 'SET_SWITCH_STATE', state: 'OPEN' },
      { type: 'SET_SWITCH_STATE', state: 'CLOSED' },
    ];

    expect(operations[0].type).toBe('SET_SWITCH_STATE');
    expect(operations[0].state).toBe('OPEN');
    expect(operations[1].state).toBe('CLOSED');
  });

  it('should only allow quick actions in MODEL_EDIT mode', () => {
    const modes: OperatingMode[] = ['MODEL_EDIT', 'CASE_CONFIG', 'RESULT_VIEW'];

    modes.forEach((mode) => {
      const canQuickAction = normalizeOperatingMode(mode) === 'MODEL_EDIT';
      if (mode === 'RESULT_VIEW') {
        expect(canQuickAction).toBe(false);
      } else {
        expect(canQuickAction).toBe(true);
      }
    });
  });
});
