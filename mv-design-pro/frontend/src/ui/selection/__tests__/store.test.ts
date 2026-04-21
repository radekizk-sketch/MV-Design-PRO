/**
 * Selection Store Tests
 *
 * Tests for the Selection Zustand store.
 * Validates:
 * - Single and multi-select element management
 * - Deterministic sorting of multi-selection
 * - Operating mode transitions and result status side effects
 * - Multi-selection common type detection (P30c)
 * - Property grid auto-open on selection
 * - Tree node expand/collapse
 * - SLD center-on-element
 * - Clear selection
 * - Mode-derived helper hooks (useCanEdit, useIsMutationBlocked, etc.)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useSelectionStore } from '../store';
import type { SelectedElement } from '../../types';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const BUS_ELEMENT: SelectedElement = { id: 'bus-001', type: 'Bus', name: 'Szyna GPZ' };
const LINE_ELEMENT: SelectedElement = { id: 'line-001', type: 'LineBranch', name: 'Linia L1' };
const BUS_ELEMENT_2: SelectedElement = { id: 'bus-002', type: 'Bus', name: 'Szyna Stacja 1' };
const SWITCH_ELEMENT: SelectedElement = { id: 'sw-001', type: 'Switch', name: 'Wylacznik Q1' };

describe('useSelectionStore', () => {
  beforeEach(() => {
    useSelectionStore.setState({
      selectedElements: [],
      selectedElement: null,
      mode: 'MODEL_EDIT',
      resultStatus: 'NONE',
      propertyGridOpen: false,
      treeExpandedNodes: new Set<string>(),
      sldCenterOnElement: null,
    });
  });

  // ===========================================================================
  // Initial State
  // ===========================================================================

  describe('initial state', () => {
    it('should have no selected elements', () => {
      const state = useSelectionStore.getState();
      expect(state.selectedElements).toEqual([]);
      expect(state.selectedElement).toBeNull();
    });

    it('should be in MODEL_EDIT mode', () => {
      expect(useSelectionStore.getState().mode).toBe('MODEL_EDIT');
    });

    it('should have NONE result status', () => {
      expect(useSelectionStore.getState().resultStatus).toBe('NONE');
    });

    it('should have property grid closed', () => {
      expect(useSelectionStore.getState().propertyGridOpen).toBe(false);
    });
  });

  // ===========================================================================
  // selectElement (single selection)
  // ===========================================================================

  describe('selectElement', () => {
    it('should select a single element', () => {
      useSelectionStore.getState().selectElement(BUS_ELEMENT);

      const state = useSelectionStore.getState();
      expect(state.selectedElement).toEqual(BUS_ELEMENT);
      expect(state.selectedElements).toEqual([BUS_ELEMENT]);
    });

    it('should auto-open property grid on selection', () => {
      expect(useSelectionStore.getState().propertyGridOpen).toBe(false);

      useSelectionStore.getState().selectElement(BUS_ELEMENT);
      expect(useSelectionStore.getState().propertyGridOpen).toBe(true);
    });

    it('should clear selection when null is passed', () => {
      useSelectionStore.getState().selectElement(BUS_ELEMENT);
      useSelectionStore.getState().selectElement(null);

      const state = useSelectionStore.getState();
      expect(state.selectedElement).toBeNull();
      expect(state.selectedElements).toEqual([]);
    });

    it('should keep property grid open after clearing selection if it was open', () => {
      useSelectionStore.getState().selectElement(BUS_ELEMENT);
      expect(useSelectionStore.getState().propertyGridOpen).toBe(true);

      // Clearing selection should NOT close property grid
      useSelectionStore.getState().selectElement(null);
      expect(useSelectionStore.getState().propertyGridOpen).toBe(true);
    });

    it('should replace previous selection with new element', () => {
      useSelectionStore.getState().selectElement(BUS_ELEMENT);
      useSelectionStore.getState().selectElement(LINE_ELEMENT);

      expect(useSelectionStore.getState().selectedElement).toEqual(LINE_ELEMENT);
      expect(useSelectionStore.getState().selectedElements).toEqual([LINE_ELEMENT]);
    });
  });

  // ===========================================================================
  // selectElements (multi-selection, P30c)
  // ===========================================================================

  describe('selectElements (multi-select)', () => {
    it('should select multiple elements sorted by ID (deterministic)', () => {
      useSelectionStore.getState().selectElements([LINE_ELEMENT, BUS_ELEMENT, SWITCH_ELEMENT]);

      const state = useSelectionStore.getState();
      expect(state.selectedElements).toHaveLength(3);
      // Should be sorted by ID: bus-001 < line-001 < sw-001
      expect(state.selectedElements[0].id).toBe('bus-001');
      expect(state.selectedElements[1].id).toBe('line-001');
      expect(state.selectedElements[2].id).toBe('sw-001');
    });

    it('should set selectedElement to first element after sort', () => {
      useSelectionStore.getState().selectElements([LINE_ELEMENT, BUS_ELEMENT]);

      // First after sort by ID = bus-001
      expect(useSelectionStore.getState().selectedElement?.id).toBe('bus-001');
    });

    it('should auto-open property grid on multi-select', () => {
      useSelectionStore.getState().selectElements([BUS_ELEMENT, LINE_ELEMENT]);
      expect(useSelectionStore.getState().propertyGridOpen).toBe(true);
    });

    it('should handle empty array', () => {
      useSelectionStore.getState().selectElement(BUS_ELEMENT);
      useSelectionStore.getState().selectElements([]);

      const state = useSelectionStore.getState();
      expect(state.selectedElements).toEqual([]);
      expect(state.selectedElement).toBeNull();
    });

    it('should produce deterministic order regardless of input order', () => {
      useSelectionStore.getState().selectElements([SWITCH_ELEMENT, BUS_ELEMENT, LINE_ELEMENT]);
      const order1 = useSelectionStore.getState().selectedElements.map(e => e.id);

      useSelectionStore.getState().selectElements([BUS_ELEMENT, LINE_ELEMENT, SWITCH_ELEMENT]);
      const order2 = useSelectionStore.getState().selectedElements.map(e => e.id);

      useSelectionStore.getState().selectElements([LINE_ELEMENT, SWITCH_ELEMENT, BUS_ELEMENT]);
      const order3 = useSelectionStore.getState().selectedElements.map(e => e.id);

      expect(order1).toEqual(order2);
      expect(order2).toEqual(order3);
    });
  });

  // ===========================================================================
  // getMultiSelection (P30c common type detection)
  // ===========================================================================

  describe('getMultiSelection', () => {
    it('should return null when no elements selected', () => {
      expect(useSelectionStore.getState().getMultiSelection()).toBeNull();
    });

    it('should detect common type when all elements are same type', () => {
      useSelectionStore.getState().selectElements([BUS_ELEMENT, BUS_ELEMENT_2]);

      const multiSel = useSelectionStore.getState().getMultiSelection();
      expect(multiSel).not.toBeNull();
      expect(multiSel!.commonType).toBe('Bus');
      expect(multiSel!.elements).toHaveLength(2);
    });

    it('should return null commonType for mixed element types', () => {
      useSelectionStore.getState().selectElements([BUS_ELEMENT, LINE_ELEMENT, SWITCH_ELEMENT]);

      const multiSel = useSelectionStore.getState().getMultiSelection();
      expect(multiSel).not.toBeNull();
      expect(multiSel!.commonType).toBeNull();
      expect(multiSel!.elements).toHaveLength(3);
    });

    it('should work for single element selection', () => {
      useSelectionStore.getState().selectElement(BUS_ELEMENT);

      const multiSel = useSelectionStore.getState().getMultiSelection();
      expect(multiSel).not.toBeNull();
      expect(multiSel!.commonType).toBe('Bus');
      expect(multiSel!.elements).toHaveLength(1);
    });
  });

  // ===========================================================================
  // Mode Management
  // ===========================================================================

  describe('setMode', () => {
    it('should normalize compatibility mode to runtime model mode', () => {
      useSelectionStore.getState().setMode('CASE_CONFIG');
      expect(useSelectionStore.getState().mode).toBe('MODEL_EDIT');
    });

    it('should set resultStatus to OUTDATED when entering MODEL_EDIT', () => {
      useSelectionStore.getState().setMode('MODEL_EDIT');
      expect(useSelectionStore.getState().resultStatus).toBe('OUTDATED');
    });

    it('should keep runtime edit status for compatibility alias and clear it for result mode', () => {
      useSelectionStore.getState().setMode('CASE_CONFIG');
      expect(useSelectionStore.getState().resultStatus).toBe('OUTDATED');

      useSelectionStore.getState().setMode('RESULT_VIEW');
      expect(useSelectionStore.getState().resultStatus).toBe('NONE');
    });
  });

  describe('setResultStatus', () => {
    it('should update result status', () => {
      useSelectionStore.getState().setResultStatus('FRESH');
      expect(useSelectionStore.getState().resultStatus).toBe('FRESH');
    });
  });

  // ===========================================================================
  // Property Grid Toggle
  // ===========================================================================

  describe('togglePropertyGrid', () => {
    it('should toggle property grid visibility', () => {
      expect(useSelectionStore.getState().propertyGridOpen).toBe(false);

      useSelectionStore.getState().togglePropertyGrid();
      expect(useSelectionStore.getState().propertyGridOpen).toBe(true);

      useSelectionStore.getState().togglePropertyGrid();
      expect(useSelectionStore.getState().propertyGridOpen).toBe(false);
    });

    it('should accept explicit open parameter', () => {
      useSelectionStore.getState().togglePropertyGrid(true);
      expect(useSelectionStore.getState().propertyGridOpen).toBe(true);

      useSelectionStore.getState().togglePropertyGrid(true);
      expect(useSelectionStore.getState().propertyGridOpen).toBe(true);

      useSelectionStore.getState().togglePropertyGrid(false);
      expect(useSelectionStore.getState().propertyGridOpen).toBe(false);
    });
  });

  // ===========================================================================
  // Tree Node Management
  // ===========================================================================

  describe('tree node expand/collapse', () => {
    it('should expand a tree node', () => {
      useSelectionStore.getState().expandTreeNode('node-1');
      expect(useSelectionStore.getState().treeExpandedNodes.has('node-1')).toBe(true);
    });

    it('should collapse a tree node', () => {
      useSelectionStore.getState().expandTreeNode('node-1');
      useSelectionStore.getState().collapseTreeNode('node-1');
      expect(useSelectionStore.getState().treeExpandedNodes.has('node-1')).toBe(false);
    });

    it('should handle expanding multiple nodes', () => {
      useSelectionStore.getState().expandTreeNode('node-1');
      useSelectionStore.getState().expandTreeNode('node-2');
      useSelectionStore.getState().expandTreeNode('node-3');

      const expanded = useSelectionStore.getState().treeExpandedNodes;
      expect(expanded.has('node-1')).toBe(true);
      expect(expanded.has('node-2')).toBe(true);
      expect(expanded.has('node-3')).toBe(true);
    });

    it('should only collapse specified node, leaving others expanded', () => {
      useSelectionStore.getState().expandTreeNode('node-1');
      useSelectionStore.getState().expandTreeNode('node-2');
      useSelectionStore.getState().collapseTreeNode('node-1');

      const expanded = useSelectionStore.getState().treeExpandedNodes;
      expect(expanded.has('node-1')).toBe(false);
      expect(expanded.has('node-2')).toBe(true);
    });
  });

  // ===========================================================================
  // SLD Center
  // ===========================================================================

  describe('centerSldOnElement', () => {
    it('should set center element', () => {
      useSelectionStore.getState().centerSldOnElement('bus-001');
      expect(useSelectionStore.getState().sldCenterOnElement).toBe('bus-001');
    });

    it('should clear center element', () => {
      useSelectionStore.getState().centerSldOnElement('bus-001');
      useSelectionStore.getState().centerSldOnElement(null);
      expect(useSelectionStore.getState().sldCenterOnElement).toBeNull();
    });
  });

  // ===========================================================================
  // clearSelection
  // ===========================================================================

  describe('clearSelection', () => {
    it('should clear all selection state', () => {
      useSelectionStore.getState().selectElements([BUS_ELEMENT, LINE_ELEMENT]);
      useSelectionStore.getState().centerSldOnElement('bus-001');

      useSelectionStore.getState().clearSelection();

      const state = useSelectionStore.getState();
      expect(state.selectedElements).toEqual([]);
      expect(state.selectedElement).toBeNull();
      expect(state.sldCenterOnElement).toBeNull();
    });
  });
});
