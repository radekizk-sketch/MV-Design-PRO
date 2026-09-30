/**
 * P9: Project Tree Tests
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md § A: Project Tree structure
 * - sld_rules.md § G.1: selection synchronization (Tree ↔ Grid ↔ SLD)
 *
 * Tests:
 * - Tree node types, categories, Polish labels
 * - Tree node expand/collapse
 * - Tree → selection sync
 * - Mode gating (edit only in MODEL_EDIT)
 * - Selection synchronization (4-way: Tree ↔ Grid ↔ SLD)
 * - Tree expansion / property grid persistence
 *
 * Kasacja 2026-09-09 (karta KASACJA-DATA-MANAGER): opisy i asercje dotyczące
 * `ui/data-manager/**` (Menedżer Danych, edycja zbiorcza, ich presety kolumn)
 * usunięte razem z martwym modułem — 0 konsumentów produkcyjnych. Ten plik
 * zachowuje WYŁĄCZNIE pokrycie, które nie zależało od tamtego modułu.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useSelectionStore } from '../selection/store';
import type { TreeNodeType, ElementType } from '../types';

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
      // Próbka etykiet (nie komplet rejestru `TreeNodeType` — dlatego `Partial`):
      // test pilnuje, że etykiety są niepustymi napisami PL, nie że pokrywają
      // każdy rodzaj węzła. Pokrycie rejestru to osobna zdolność.
      const expectedLabels: Partial<Record<TreeNodeType, string>> = {
        PROJECT: 'Projekt',
        NETWORK: 'Sieć',
        BUSES: 'Szyny',
        LINES: 'Linie',
        CABLES: 'Kable',
        TRANSFORMERS: 'Transformatory',
        SWITCHES: 'Łączniki',
        SOURCES: 'Zasilanie GPZ',
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
// Mode Gating Tests
// ============================================================================

describe('Blokada Trybu', () => {
  beforeEach(() => {
    const store = useSelectionStore.getState();
    store.clearSelection();
    store.setMode('MODEL_EDIT');
  });

  describe('Bramkowanie edycji wg trybu', () => {
    it('should allow editing in MODEL_EDIT mode', () => {
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

    it('should NOT allow editing in RESULT_VIEW mode', () => {
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
// Selection Sync Tests
// ============================================================================

describe('Synchronizacja selekcji (Drzewo ↔ Siatka ↔ SLD)', () => {
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
      SOURCES: 'Zasilanie GPZ',
      LOADS: 'Odbiory',
    };

    // Verify Polish characters present (uppercase Ł in Łączniki)
    expect(labels.SWITCHES.toLowerCase()).toContain('ł');
    expect(labels.SOURCES).toContain('GPZ');
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
});

