/**
 * Selection Store Tests
 *
 * CANONICAL ALIGNMENT:
 * - sld_rules.md § E.1: Selection patterns
 * - sld_rules.md § G.1: SLD ↔ Wizard synchronization
 *
 * Tests:
 * - Selection state management
 * - Mode switching
 * - Navigation synchronization
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useCanEdit, useIsMutationBlocked, useSelectionStore } from '../selection/store';

describe('Selection Store', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    const store = useSelectionStore.getState();
    store.clearSelection();
    store.setMode('MODEL_EDIT');
    store.setResultStatus('NONE');
    store.togglePropertyGrid(false);
  });

  describe('Element Selection', () => {
    it('should select an element', () => {
      const { selectElement, selectedElement } = useSelectionStore.getState();

      // Asercja wstepna przywrocona: `selectedElement` bylo destrukturyzowane,
      // ale nigdy nieczytane (urwany dowod). Bez niej test przechodzilby takze
      // wtedy, gdyby `clearSelection()` z `beforeEach` przestal czyscic wybor,
      // bo sprawdzalby tylko stan PO akcji.
      expect(selectedElement).toBeNull();

      selectElement({ id: 'bus-1', type: 'Bus', name: 'Szyna główna' });

      const state = useSelectionStore.getState();
      expect(state.selectedElement).toEqual({
        id: 'bus-1',
        type: 'Bus',
        name: 'Szyna główna',
      });
    });

    it('should clear selection', () => {
      const store = useSelectionStore.getState();

      store.selectElement({ id: 'bus-1', type: 'Bus', name: 'Szyna główna' });
      expect(useSelectionStore.getState().selectedElement).not.toBeNull();

      store.clearSelection();
      expect(useSelectionStore.getState().selectedElement).toBeNull();
    });

    it('should auto-open property grid on selection', () => {
      const store = useSelectionStore.getState();

      expect(store.propertyGridOpen).toBe(false);

      store.selectElement({ id: 'bus-1', type: 'Bus', name: 'Szyna główna' });

      expect(useSelectionStore.getState().propertyGridOpen).toBe(true);
    });

    it('should not close property grid when deselecting', () => {
      const store = useSelectionStore.getState();

      store.selectElement({ id: 'bus-1', type: 'Bus', name: 'Szyna główna' });
      expect(useSelectionStore.getState().propertyGridOpen).toBe(true);

      store.selectElement(null);
      // Property grid stays open per UX design
      expect(useSelectionStore.getState().propertyGridOpen).toBe(true);
    });
  });

  describe('Operating Mode', () => {
    it('should default to MODEL_EDIT mode', () => {
      const state = useSelectionStore.getState();
      expect(state.mode).toBe('MODEL_EDIT');
    });

    it('should change mode', () => {
      const store = useSelectionStore.getState();

      store.setMode('RESULT_VIEW');
      expect(useSelectionStore.getState().mode).toBe('RESULT_VIEW');

      store.setMode('CASE_CONFIG');
      expect(useSelectionStore.getState().mode).toBe('MODEL_EDIT');
    });

    it('should set result status to OUTDATED when entering MODEL_EDIT', () => {
      const store = useSelectionStore.getState();

      store.setResultStatus('FRESH');
      expect(useSelectionStore.getState().resultStatus).toBe('FRESH');

      store.setMode('MODEL_EDIT');
      expect(useSelectionStore.getState().resultStatus).toBe('OUTDATED');
    });
  });

  describe('Result Status', () => {
    it('should default to NONE', () => {
      const state = useSelectionStore.getState();
      expect(state.resultStatus).toBe('NONE');
    });

    it('should update result status', () => {
      const store = useSelectionStore.getState();

      store.setResultStatus('FRESH');
      expect(useSelectionStore.getState().resultStatus).toBe('FRESH');

      store.setResultStatus('OUTDATED');
      expect(useSelectionStore.getState().resultStatus).toBe('OUTDATED');
    });
  });

  describe('Property Grid Toggle', () => {
    it('should toggle property grid visibility', () => {
      const store = useSelectionStore.getState();

      expect(store.propertyGridOpen).toBe(false);

      store.togglePropertyGrid();
      expect(useSelectionStore.getState().propertyGridOpen).toBe(true);

      store.togglePropertyGrid();
      expect(useSelectionStore.getState().propertyGridOpen).toBe(false);
    });

    it('should set property grid to specific state', () => {
      const store = useSelectionStore.getState();

      store.togglePropertyGrid(true);
      expect(useSelectionStore.getState().propertyGridOpen).toBe(true);

      store.togglePropertyGrid(true);
      expect(useSelectionStore.getState().propertyGridOpen).toBe(true);

      store.togglePropertyGrid(false);
      expect(useSelectionStore.getState().propertyGridOpen).toBe(false);
    });
  });

  describe('Tree Node Expansion', () => {
    it('should expand tree nodes', () => {
      const store = useSelectionStore.getState();

      store.expandTreeNode('node-1');
      store.expandTreeNode('node-2');

      const state = useSelectionStore.getState();
      expect(state.treeExpandedNodes.has('node-1')).toBe(true);
      expect(state.treeExpandedNodes.has('node-2')).toBe(true);
    });

    it('should collapse tree nodes', () => {
      const store = useSelectionStore.getState();

      store.expandTreeNode('node-1');
      store.expandTreeNode('node-2');
      store.collapseTreeNode('node-1');

      const state = useSelectionStore.getState();
      expect(state.treeExpandedNodes.has('node-1')).toBe(false);
      expect(state.treeExpandedNodes.has('node-2')).toBe(true);
    });
  });

  describe('SLD Center Request', () => {
    it('should set element to center on', () => {
      const store = useSelectionStore.getState();

      store.centerSldOnElement('bus-123');

      const state = useSelectionStore.getState();
      expect(state.sldCenterOnElement).toBe('bus-123');
    });

    it('should clear center request', () => {
      const store = useSelectionStore.getState();

      store.centerSldOnElement('bus-123');
      store.centerSldOnElement(null);

      const state = useSelectionStore.getState();
      expect(state.sldCenterOnElement).toBeNull();
    });

    it('should clear center request on clearSelection', () => {
      const store = useSelectionStore.getState();

      store.selectElement({ id: 'bus-1', type: 'Bus', name: 'Szyna' });
      store.centerSldOnElement('bus-1');

      store.clearSelection();

      const state = useSelectionStore.getState();
      expect(state.sldCenterOnElement).toBeNull();
    });
  });
});

/**
 * INTENCJA (zachowana z poprzedniej wersji bloku): edycja modelu dozwolona w
 * MODEL_EDIT, mutacje zablokowane w RESULT_VIEW, a `CASE_CONFIG` — alias
 * zgodnosciowy — zachowuje sie jak MODEL_EDIT.
 *
 * CO SIE ZMIENILO I DLACZEGO: poprzednia wersja PRZEPISYWALA CIALA hookow do
 * testu (`state.mode === 'RESULT_VIEW' || state.mode === 'CASE_CONFIG'`) i
 * sprawdzala wlasna kopie predykatu, wiec nie dotykala produktu wcale. Kopia
 * zostala w starym kanonie, w ktorym `CASE_CONFIG` bylo trybem RUCHOWYM. Dzis
 * `CASE_CONFIG` to wylacznie alias WEJSCIOWY: `setMode` normalizuje go przez
 * `normalizeOperatingMode` do `MODEL_EDIT`, a stan `mode` ma typ
 * `RuntimeOperatingMode = 'MODEL_EDIT' | 'RESULT_VIEW'` — porownanie z
 * 'CASE_CONFIG' nie mialo juz czesci wspolnej (TS2367 zglaszal martwa galaz).
 * Teraz predykat ma JEDNO zrodlo prawdy — hook produkcyjny — a test go WYWOLUJE
 * (`renderHook`), zamiast opisywac.
 */
describe('Selection Store Hooks', () => {
  describe('useCanEdit', () => {
    it('should return true in MODEL_EDIT mode', () => {
      const { result } = renderHook(() => useCanEdit());

      act(() => useSelectionStore.getState().setMode('MODEL_EDIT'));

      expect(result.current).toBe(true);
    });

    it('should return false in RESULT_VIEW mode', () => {
      const { result } = renderHook(() => useCanEdit());

      act(() => useSelectionStore.getState().setMode('RESULT_VIEW'));

      expect(result.current).toBe(false);
    });
  });

  describe('useIsMutationBlocked', () => {
    it('should return false in MODEL_EDIT mode', () => {
      const { result } = renderHook(() => useIsMutationBlocked());

      act(() => useSelectionStore.getState().setMode('MODEL_EDIT'));

      expect(result.current).toBe(false);
    });

    it('should return true in RESULT_VIEW mode', () => {
      const { result } = renderHook(() => useIsMutationBlocked());

      act(() => useSelectionStore.getState().setMode('RESULT_VIEW'));

      expect(result.current).toBe(true);
    });

    it('should return false in CASE_CONFIG compatibility alias', () => {
      const { result } = renderHook(() => useIsMutationBlocked());

      act(() => useSelectionStore.getState().setMode('CASE_CONFIG'));

      expect(result.current).toBe(false);
      // Alias jest normalizowany DO stanu ruchowego, a nie przechowywany.
      expect(useSelectionStore.getState().mode).toBe('MODEL_EDIT');
    });
  });
});
