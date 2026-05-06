/**
 * Testy multi-select extension w selection store (Iteracja 12).
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { useSelectionStore } from '../store';
import type { SelectedElement } from '../../types';

const ELEMENT_A: SelectedElement = { id: 'A', type: 'Bus', name: 'A' } as never;
const ELEMENT_B: SelectedElement = { id: 'B', type: 'Bus', name: 'B' } as never;
const ELEMENT_C: SelectedElement = { id: 'C', type: 'Bus', name: 'C' } as never;

describe('selection store — multi-select operations', () => {
  beforeEach(() => {
    useSelectionStore.getState().clearSelection();
  });

  it('toggleElement dodaje element gdy nie wybrany, usuwa gdy wybrany', () => {
    const store = useSelectionStore.getState();
    store.toggleElement(ELEMENT_A);
    expect(useSelectionStore.getState().selectedElements.map((e) => e.id)).toEqual(['A']);

    store.toggleElement(ELEMENT_B);
    expect(useSelectionStore.getState().selectedElements.map((e) => e.id)).toEqual(['A', 'B']);

    // Toggle ponownie A → usunięcie
    store.toggleElement(ELEMENT_A);
    expect(useSelectionStore.getState().selectedElements.map((e) => e.id)).toEqual(['B']);
  });

  it('extendSelection dodaje bez usuwania', () => {
    const store = useSelectionStore.getState();
    store.selectElement(ELEMENT_A);
    store.extendSelection(ELEMENT_B);
    store.extendSelection(ELEMENT_C);
    expect(useSelectionStore.getState().selectedElements.map((e) => e.id)).toEqual(['A', 'B', 'C']);
  });

  it('extendSelection nie duplikuje istniejących', () => {
    const store = useSelectionStore.getState();
    store.selectElement(ELEMENT_A);
    store.extendSelection(ELEMENT_A);
    expect(useSelectionStore.getState().selectedElements).toHaveLength(1);
  });

  it('removeFromSelection usuwa element po id', () => {
    const store = useSelectionStore.getState();
    store.selectElements([ELEMENT_A, ELEMENT_B, ELEMENT_C]);
    store.removeFromSelection('B');
    expect(useSelectionStore.getState().selectedElements.map((e) => e.id)).toEqual(['A', 'C']);
  });

  it('selectedElement zsynchronizowany z pierwszym elementem multi-selection', () => {
    const store = useSelectionStore.getState();
    store.selectElements([ELEMENT_C, ELEMENT_A, ELEMENT_B]);
    // Sortowanie: A, B, C → selectedElement === A
    expect(useSelectionStore.getState().selectedElement?.id).toBe('A');
  });

  it('clearSelection resetuje wszystkie pola', () => {
    const store = useSelectionStore.getState();
    store.selectElements([ELEMENT_A, ELEMENT_B]);
    store.clearSelection();
    expect(useSelectionStore.getState().selectedElements).toEqual([]);
    expect(useSelectionStore.getState().selectedElement).toBeNull();
  });
});
