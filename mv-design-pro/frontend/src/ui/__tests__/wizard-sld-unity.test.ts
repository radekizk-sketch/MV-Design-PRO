/**
 * Wizard/SLD Unity Verification Tests -- Phase 6 (Frontend)
 *
 * CANONICAL ALIGNMENT:
 * - sld_rules.md SS A.1: Bijection: Symbol <-> Model Object
 * - sld_rules.md SS E.1: Selection patterns (deterministic ordering)
 * - sld_rules.md SS G.1: SLD <-> Wizard synchronization
 * - wizard_screens.md SS 1.2: Operating modes (MODEL_EDIT, RESULT_VIEW)
 * - ui_canonical_parity.md SS A: Mode-based gating
 * - UI_CORE_ARCHITECTURE.md SS 4.3: Deterministic URL encoding
 *
 * These tests verify the FRONTEND ARCHITECTURE INVARIANTS:
 * 1. Selection store is the single source of truth for selection
 * 2. URL state sync preserves selection across navigation
 * 3. SLD Editor store symbols match model elements (bijection)
 * 4. Mode gating works correctly (MODEL_EDIT allows edits, RESULT_VIEW blocks)
 * 5. Deterministic ordering of selected elements
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useSelectionStore } from '../selection/store';
import { useAppStateStore } from '../app-state/store';
import { useSldEditorStore } from '../sld-editor/SldEditorStore';
import {
  encodeSelectionToParams,
  decodeSelectionFromParams,
} from '../navigation/urlState';
import type { SelectedElement } from '../types';
import type { AnySldSymbol, BusSymbol } from '../sld-editor/types';

// =============================================================================
// Test 1: Selection Store is Single Source of Truth
// =============================================================================

describe('Wizard/SLD Unity: Selection Store', () => {
  beforeEach(() => {
    // Reset to initial state
    const store = useSelectionStore.getState();
    store.clearSelection();
    store.setMode('MODEL_EDIT');
    store.setResultStatus('NONE');
    store.togglePropertyGrid(false);
  });

  it('selection store is single source of truth -- selectElement updates selectedElements', () => {
    const store = useSelectionStore.getState();

    store.selectElement({
      id: 'bus-001',
      type: 'Bus',
      name: 'Szyna glowna GPZ',
    });

    const state = useSelectionStore.getState();
    expect(state.selectedElements).toHaveLength(1);
    expect(state.selectedElements[0]).toEqual({
      id: 'bus-001',
      type: 'Bus',
      name: 'Szyna glowna GPZ',
    });
    // Compatibility: selectedElement matches first element
    expect(state.selectedElement).toEqual(state.selectedElements[0]);
  });

  it('clearSelection empties both selectedElements and selectedElement', () => {
    const store = useSelectionStore.getState();

    store.selectElement({
      id: 'bus-001',
      type: 'Bus',
      name: 'Szyna glowna GPZ',
    });
    expect(useSelectionStore.getState().selectedElements).toHaveLength(1);

    store.clearSelection();

    const state = useSelectionStore.getState();
    expect(state.selectedElements).toHaveLength(0);
    expect(state.selectedElement).toBeNull();
  });

  it('selectElements replaces entire selection', () => {
    const store = useSelectionStore.getState();

    store.selectElements([
      { id: 'bus-001', type: 'Bus', name: 'Szyna 1' },
      { id: 'line-001', type: 'LineBranch', name: 'Linia 1' },
    ]);

    const state = useSelectionStore.getState();
    expect(state.selectedElements).toHaveLength(2);
    // selectedElement is the first in sorted order
    expect(state.selectedElement).not.toBeNull();
  });
});

// =============================================================================
// Test 2: Selection Elements Are Always Sorted (Determinism)
// =============================================================================

describe('Wizard/SLD Unity: Selection Determinism', () => {
  beforeEach(() => {
    const store = useSelectionStore.getState();
    store.clearSelection();
    store.setMode('MODEL_EDIT');
  });

  it('selection elements are always sorted by ID (alphabetically)', () => {
    const store = useSelectionStore.getState();

    // Add elements in reverse alphabetical order
    store.selectElements([
      { id: 'z-switch', type: 'Switch', name: 'Wylacznik Z' },
      { id: 'a-bus', type: 'Bus', name: 'Szyna A' },
      { id: 'm-line', type: 'LineBranch', name: 'Linia M' },
    ]);

    const state = useSelectionStore.getState();
    const ids = state.selectedElements.map((e) => e.id);

    // Must be sorted alphabetically regardless of insertion order
    expect(ids).toEqual(['a-bus', 'm-line', 'z-switch']);
  });

  it('first element in sorted list becomes selectedElement (compatibility)', () => {
    const store = useSelectionStore.getState();

    store.selectElements([
      { id: 'z-last', type: 'Bus', name: 'Last' },
      { id: 'a-first', type: 'Bus', name: 'First' },
    ]);

    const state = useSelectionStore.getState();
    // selectedElement is the first in sorted order
    expect(state.selectedElement?.id).toBe('a-first');
  });

  it('empty selection yields null selectedElement', () => {
    const store = useSelectionStore.getState();
    store.selectElements([]);

    const state = useSelectionStore.getState();
    expect(state.selectedElement).toBeNull();
    expect(state.selectedElements).toHaveLength(0);
  });
});

// =============================================================================
// Test 3: SLD Symbols Maintain Bijection with Model
// =============================================================================

describe('Wizard/SLD Unity: SLD Symbol Bijection', () => {
  beforeEach(() => {
    const store = useSldEditorStore.getState();
    store.clearSelection();
    store.setSymbols([]);
  });

  it('each symbol has unique elementId (bijection)', () => {
    const symbols: AnySldSymbol[] = [
      {
        id: 'sym-bus-1',
        elementId: 'bus-001',
        elementType: 'Bus',
        elementName: 'Szyna 1',
        position: { x: 100, y: 100 },
        inService: true,
        width: 60,
        height: 8,
      } as BusSymbol,
      {
        id: 'sym-bus-2',
        elementId: 'bus-002',
        elementType: 'Bus',
        elementName: 'Szyna 2',
        position: { x: 200, y: 100 },
        inService: true,
        width: 60,
        height: 8,
      } as BusSymbol,
      {
        id: 'sym-bus-3',
        elementId: 'bus-003',
        elementType: 'Bus',
        elementName: 'Szyna 3',
        position: { x: 300, y: 100 },
        inService: true,
        width: 60,
        height: 8,
      } as BusSymbol,
    ];

    const store = useSldEditorStore.getState();
    store.setSymbols(symbols);

    const state = useSldEditorStore.getState();

    // All symbols are present
    expect(state.symbols.size).toBe(3);

    // Each elementId is unique (bijection: one symbol per model element)
    const elementIds = new Set<string>();
    state.symbols.forEach((sym) => {
      expect(elementIds.has(sym.elementId)).toBe(false);
      elementIds.add(sym.elementId);
    });
    expect(elementIds.size).toBe(3);
  });

  it('symbol IDs and element IDs are distinct namespaces', () => {
    const symbols: AnySldSymbol[] = [
      {
        id: 'sym-1',
        elementId: 'elem-1',
        elementType: 'Bus',
        elementName: 'Szyna',
        position: { x: 0, y: 0 },
        inService: true,
        width: 60,
        height: 8,
      } as BusSymbol,
    ];

    const store = useSldEditorStore.getState();
    store.setSymbols(symbols);

    const sym = useSldEditorStore.getState().symbols.get('sym-1');
    expect(sym).toBeDefined();
    expect(sym!.id).toBe('sym-1');
    expect(sym!.elementId).toBe('elem-1');
    // Symbol ID != Element ID (different namespaces)
    expect(sym!.id).not.toBe(sym!.elementId);
  });

  it('removing a symbol preserves remaining symbols', () => {
    const symbols: AnySldSymbol[] = [
      {
        id: 'sym-a',
        elementId: 'elem-a',
        elementType: 'Bus',
        elementName: 'A',
        position: { x: 0, y: 0 },
        inService: true,
        width: 60,
        height: 8,
      } as BusSymbol,
      {
        id: 'sym-b',
        elementId: 'elem-b',
        elementType: 'Bus',
        elementName: 'B',
        position: { x: 100, y: 0 },
        inService: true,
        width: 60,
        height: 8,
      } as BusSymbol,
    ];

    const store = useSldEditorStore.getState();
    store.setSymbols(symbols);
    expect(useSldEditorStore.getState().symbols.size).toBe(2);

    store.removeSymbol('sym-a');

    const state = useSldEditorStore.getState();
    expect(state.symbols.size).toBe(1);
    expect(state.symbols.has('sym-a')).toBe(false);
    expect(state.symbols.has('sym-b')).toBe(true);
  });

  it('SLD selectedIds are always sorted (determinism)', () => {
    const symbols: AnySldSymbol[] = [
      {
        id: 'c-sym',
        elementId: 'c-elem',
        elementType: 'Bus',
        elementName: 'C',
        position: { x: 0, y: 0 },
        inService: true,
        width: 60,
        height: 8,
      } as BusSymbol,
      {
        id: 'a-sym',
        elementId: 'a-elem',
        elementType: 'Bus',
        elementName: 'A',
        position: { x: 100, y: 0 },
        inService: true,
        width: 60,
        height: 8,
      } as BusSymbol,
      {
        id: 'b-sym',
        elementId: 'b-elem',
        elementType: 'Bus',
        elementName: 'B',
        position: { x: 200, y: 0 },
        inService: true,
        width: 60,
        height: 8,
      } as BusSymbol,
    ];

    const store = useSldEditorStore.getState();
    store.setSymbols(symbols);

    // Select all in reverse order
    store.selectMultiple(['c-sym', 'a-sym', 'b-sym']);

    const state = useSldEditorStore.getState();
    // DETERMINISM: selectedIds must always be sorted
    expect(state.selectedIds).toEqual(['a-sym', 'b-sym', 'c-sym']);
  });
});

// =============================================================================
// Test 4: Mode Gating (MODEL_EDIT allows edits, RESULT_VIEW blocks)
// =============================================================================

describe('Wizard/SLD Unity: Mode Gating', () => {
  beforeEach(() => {
    useAppStateStore.getState().reset();
  });

  it('MODEL_EDIT mode allows model editing', () => {
    const store = useAppStateStore.getState();
    store.setActiveMode('MODEL_EDIT');

    const state = useAppStateStore.getState();
    expect(state.isModelEditable()).toBe(true);
    expect(state.isReadOnly()).toBe(false);
  });

  it('RESULT_VIEW mode blocks all edits', () => {
    const store = useAppStateStore.getState();
    store.setActiveMode('RESULT_VIEW');

    const state = useAppStateStore.getState();
    expect(state.isModelEditable()).toBe(false);
    expect(state.isReadOnly()).toBe(true);
    expect(state.isCaseConfigEditable()).toBe(false);
  });

  it('CASE_CONFIG compatibility input normalizes to MODEL_EDIT runtime', () => {
    const store = useAppStateStore.getState();
    store.setActiveMode('CASE_CONFIG');

    const state = useAppStateStore.getState();
    expect(state.activeMode).toBe('MODEL_EDIT');
    expect(state.isModelEditable()).toBe(true);
    expect(state.isCaseConfigEditable()).toBe(true);
    expect(state.isReadOnly()).toBe(false);
  });

  it('mode transitions work correctly through compatibility input and runtime modes', () => {
    const store = useAppStateStore.getState();

    // Start in MODEL_EDIT (default)
    expect(useAppStateStore.getState().activeMode).toBe('MODEL_EDIT');

    // Compatibility input normalizes to MODEL_EDIT
    store.setActiveMode('CASE_CONFIG');
    expect(useAppStateStore.getState().activeMode).toBe('MODEL_EDIT');

    // Transition to RESULT_VIEW
    store.setActiveMode('RESULT_VIEW');
    expect(useAppStateStore.getState().activeMode).toBe('RESULT_VIEW');

    // Back to MODEL_EDIT
    store.setActiveMode('MODEL_EDIT');
    expect(useAppStateStore.getState().activeMode).toBe('MODEL_EDIT');
  });

  it('selection store mode gating aligns with app state', () => {
    // Verify Selection Store also enforces mode gating
    const selStore = useSelectionStore.getState();

    selStore.setMode('MODEL_EDIT');
    expect(useSelectionStore.getState().mode).toBe('MODEL_EDIT');

    selStore.setMode('RESULT_VIEW');
    expect(useSelectionStore.getState().mode).toBe('RESULT_VIEW');

    selStore.setMode('CASE_CONFIG');
    expect(useSelectionStore.getState().mode).toBe('MODEL_EDIT');
  });

  it('entering MODEL_EDIT sets result status to OUTDATED', () => {
    const selStore = useSelectionStore.getState();

    selStore.setResultStatus('FRESH');
    expect(useSelectionStore.getState().resultStatus).toBe('FRESH');

    // Entering MODEL_EDIT invalidates results
    selStore.setMode('MODEL_EDIT');
    expect(useSelectionStore.getState().resultStatus).toBe('OUTDATED');
  });
});

// =============================================================================
// Test 5: URL State Preserves Selection Parameters
// =============================================================================

describe('Wizard/SLD Unity: URL State Sync', () => {
  it('encodeSelectionToParams encodes selection correctly', () => {
    const selection: SelectedElement = {
      id: 'bus-001',
      type: 'Bus',
      name: 'Szyna glowna',
    };

    const params = encodeSelectionToParams(selection);

    expect(params.get('sel')).toBe('bus-001');
    expect(params.get('type')).toBe('Bus');
    expect(params.get('name')).toBe('Szyna glowna');
  });

  it('decodeSelectionFromParams decodes valid params', () => {
    const params = new URLSearchParams();
    params.set('sel', 'line-042');
    params.set('type', 'LineBranch');
    params.set('name', 'Linia SN-42');

    const selection = decodeSelectionFromParams(params);

    expect(selection).not.toBeNull();
    expect(selection!.id).toBe('line-042');
    expect(selection!.type).toBe('LineBranch');
    expect(selection!.name).toBe('Linia SN-42');
  });

  it('encode-decode round trip preserves selection', () => {
    const original: SelectedElement = {
      id: 'trafo-007',
      type: 'TransformerBranch',
      name: 'Transformator TR-7',
    };

    const params = encodeSelectionToParams(original);
    const decoded = decodeSelectionFromParams(params);

    expect(decoded).toEqual(original);
  });

  it('decodeSelectionFromParams returns null for incomplete params', () => {
    // Missing 'type' param
    const params = new URLSearchParams();
    params.set('sel', 'bus-001');
    params.set('name', 'Szyna');

    const result = decodeSelectionFromParams(params);
    expect(result).toBeNull();
  });

  it('decodeSelectionFromParams returns null for invalid element type', () => {
    const params = new URLSearchParams();
    params.set('sel', 'x-001');
    params.set('type', 'InvalidType');
    params.set('name', 'Invalid');

    const result = decodeSelectionFromParams(params);
    expect(result).toBeNull();
  });

  it('encodeSelectionToParams with null clears params', () => {
    const params = encodeSelectionToParams(null);

    expect(params.get('sel')).toBeNull();
    expect(params.get('type')).toBeNull();
    expect(params.get('name')).toBeNull();
    expect(params.toString()).toBe('');
  });
  it('decodeSelectionFromParams returns null for identyfikator BoundaryNode', () => {
    const params = new URLSearchParams();
    params.set('sel', 'bus_connection_node');
    params.set('type', 'Bus');
    params.set('name', 'Węzeł graniczny');

    const result = decodeSelectionFromParams(params);
    expect(result).toBeNull();
  });

  it('encodeSelectionToParams pomija selekcję BoundaryNode', () => {
    const params = encodeSelectionToParams({
      id: 'connection_virtual_node',
      type: 'Bus',
      name: 'Węzeł BoundaryNode',
    });

    expect(params.toString()).toBe('');
  });


  it('all valid element types are accepted by decoder', () => {
    const validTypes = [
      'Bus',
      'LineBranch',
      'TransformerBranch',
      'Switch',
      'Source',
      'Load',
    ];

    for (const type of validTypes) {
      const params = new URLSearchParams();
      params.set('sel', `elem-${type}`);
      params.set('type', type);
      params.set('name', `Element ${type}`);

      const result = decodeSelectionFromParams(params);
      expect(result).not.toBeNull();
      expect(result!.type).toBe(type);
    }
  });
});
