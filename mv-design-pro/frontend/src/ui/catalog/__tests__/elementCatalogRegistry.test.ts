// @vitest-environment node
/**
 * Element Catalog Registry Tests
 *
 * Weryfikuje deterministyczne mapowanie element → namespace → picker → drzewo.
 * Gwarantuje parity z backend (readiness_checker.py, MATERIALIZATION_CONTRACTS).
 *
 * INVARIANTS testowane:
 * - Każdy typ elementu mapuje na DOKŁADNIE jeden namespace (lub żaden)
 * - Reverse lookups są spójne z forward lookups
 * - getCatalogTreeEntries() jest deterministyczne
 * - Żadnego zgadywania — mapowanie jest kompletne
 */

import { describe, it, expect } from 'vitest';
import {
  ELEMENT_TYPE_TO_NAMESPACE,
  NAMESPACE_TO_PICKER_CATEGORY,
  NAMESPACE_TO_TREE_NODE,
  NAMESPACE_LABEL_PL,
  TREE_NODE_TO_NAMESPACE,
  PICKER_CATEGORY_TO_NAMESPACE,
  CATALOG_TREE_NAMESPACES,
  getNamespaceForElement,
  getPickerCategory,
  getPickerCategoryForElement,
  requiresCatalogBinding,
  getNamespaceLabelPl,
  getNamespaceForTreeNode,
  getCatalogTreeEntries,
} from '../elementCatalogRegistry';

// =============================================================================
// 1. Forward mapping: element → namespace
// =============================================================================

describe('ELEMENT_TYPE_TO_NAMESPACE', () => {
  it('maps line_overhead to LINIA_SN', () => {
    expect(ELEMENT_TYPE_TO_NAMESPACE['line_overhead']).toBe('LINIA_SN');
  });

  it('maps cable to KABEL_SN', () => {
    expect(ELEMENT_TYPE_TO_NAMESPACE['cable']).toBe('KABEL_SN');
  });

  it('maps transformer to TRAFO_SN_NN', () => {
    expect(ELEMENT_TYPE_TO_NAMESPACE['transformer']).toBe('TRAFO_SN_NN');
  });

  it('maps circuit_breaker to APARAT_SN', () => {
    expect(ELEMENT_TYPE_TO_NAMESPACE['circuit_breaker']).toBe('APARAT_SN');
  });

  it('maps pv_inverter to ZRODLO_NN_PV', () => {
    expect(ELEMENT_TYPE_TO_NAMESPACE['pv_inverter']).toBe('ZRODLO_NN_PV');
  });

  it('does NOT map bus (bus has no catalog)', () => {
    expect(ELEMENT_TYPE_TO_NAMESPACE['bus']).toBeUndefined();
  });

  it('maps source to ZRODLO_SN', () => {
    expect(ELEMENT_TYPE_TO_NAMESPACE['source']).toBe('ZRODLO_SN');
  });

  // PARITY z backend readiness_checker.py BRANCH_TYPE_TO_NAMESPACE
  it('covers all backend BRANCH_TYPE_TO_NAMESPACE entries', () => {
    // Backend: LINE → LINIA_SN, CABLE → KABEL_SN, OVERHEAD_LINE → LINIA_SN,
    //          TRANSFORMER → TRAFO_SN_NN, TRANSFORMER_2W → TRAFO_SN_NN
    expect(getNamespaceForElement('line_overhead')).toBe('LINIA_SN');
    expect(getNamespaceForElement('cable')).toBe('KABEL_SN');
    expect(getNamespaceForElement('transformer')).toBe('TRAFO_SN_NN');
  });
});

// =============================================================================
// 2. Forward mapping: namespace → picker category
// =============================================================================

describe('NAMESPACE_TO_PICKER_CATEGORY', () => {
  it('maps every active namespace to a TypeCategory', () => {
    const activeNamespaces = [
      'LINIA_SN', 'KABEL_SN', 'TRAFO_SN_NN', 'APARAT_SN',
      'APARAT_NN', 'KABEL_NN', 'CT', 'VT', 'OBCIAZENIE',
      'ZRODLO_NN_PV', 'ZRODLO_NN_BESS', 'ZABEZPIECZENIE',
    ] as const;

    for (const ns of activeNamespaces) {
      expect(NAMESPACE_TO_PICKER_CATEGORY[ns]).toBeDefined();
    }
  });

  it('maps LINIA_SN to LINE', () => {
    expect(NAMESPACE_TO_PICKER_CATEGORY['LINIA_SN']).toBe('LINE');
  });

  it('maps TRAFO_SN_NN to TRANSFORMER', () => {
    expect(NAMESPACE_TO_PICKER_CATEGORY['TRAFO_SN_NN']).toBe('TRANSFORMER');
  });
});

// =============================================================================
// 3. Forward mapping: namespace → tree node
// =============================================================================

describe('NAMESPACE_TO_TREE_NODE', () => {
  it('maps 4 primary namespaces to tree nodes', () => {
    expect(NAMESPACE_TO_TREE_NODE['LINIA_SN']).toBe('LINE_TYPES');
    expect(NAMESPACE_TO_TREE_NODE['KABEL_SN']).toBe('CABLE_TYPES');
    expect(NAMESPACE_TO_TREE_NODE['TRAFO_SN_NN']).toBe('TRANSFORMER_TYPES');
    expect(NAMESPACE_TO_TREE_NODE['APARAT_SN']).toBe('SWITCH_EQUIPMENT_TYPES');
  });

  it('does NOT map secondary namespaces (no dedicated TreeNodeType)', () => {
    expect(NAMESPACE_TO_TREE_NODE['CT']).toBeUndefined();
    expect(NAMESPACE_TO_TREE_NODE['VT']).toBeUndefined();
    expect(NAMESPACE_TO_TREE_NODE['OBCIAZENIE']).toBeUndefined();
  });
});

// =============================================================================
// 4. Polish labels
// =============================================================================

describe('NAMESPACE_LABEL_PL', () => {
  it('has Polish labels for all namespaces', () => {
    const allNamespaces = Object.keys(NAMESPACE_TO_PICKER_CATEGORY);
    for (const ns of allNamespaces) {
      const label = NAMESPACE_LABEL_PL[ns as keyof typeof NAMESPACE_LABEL_PL];
      expect(label).toBeDefined();
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('uses Polish characters', () => {
    expect(NAMESPACE_LABEL_PL['LINIA_SN']).toContain('napowietrznych');
    expect(NAMESPACE_LABEL_PL['OBCIAZENIE']).toContain('obciążeń');
  });
});

// =============================================================================
// 5. Reverse lookups consistency
// =============================================================================

describe('Reverse lookups', () => {
  it('TREE_NODE_TO_NAMESPACE is inverse of NAMESPACE_TO_TREE_NODE', () => {
    for (const [ns, treeNode] of Object.entries(NAMESPACE_TO_TREE_NODE)) {
      expect(TREE_NODE_TO_NAMESPACE[treeNode as keyof typeof TREE_NODE_TO_NAMESPACE]).toBe(ns);
    }
  });

  it('PICKER_CATEGORY_TO_NAMESPACE maps back to primary namespaces', () => {
    expect(PICKER_CATEGORY_TO_NAMESPACE['LINE']).toBe('LINIA_SN');
    expect(PICKER_CATEGORY_TO_NAMESPACE['CABLE']).toBe('KABEL_SN');
    expect(PICKER_CATEGORY_TO_NAMESPACE['TRANSFORMER']).toBe('TRAFO_SN_NN');
  });
});

// =============================================================================
// 6. Query functions
// =============================================================================

describe('getNamespaceForElement', () => {
  it('returns namespace for known element types', () => {
    expect(getNamespaceForElement('line_overhead')).toBe('LINIA_SN');
    expect(getNamespaceForElement('cable')).toBe('KABEL_SN');
    expect(getNamespaceForElement('transformer')).toBe('TRAFO_SN_NN');
  });

  it('returns undefined for unknown element types', () => {
    expect(getNamespaceForElement('bus')).toBeUndefined();
    expect(getNamespaceForElement('nonexistent')).toBeUndefined();
  });
});

describe('getPickerCategoryForElement', () => {
  it('chains element → namespace → picker category', () => {
    expect(getPickerCategoryForElement('line_overhead')).toBe('LINE');
    expect(getPickerCategoryForElement('cable')).toBe('CABLE');
    expect(getPickerCategoryForElement('transformer')).toBe('TRANSFORMER');
    expect(getPickerCategoryForElement('circuit_breaker')).toBe('MV_APPARATUS');
    expect(getPickerCategoryForElement('pv_inverter')).toBe('PV_INVERTER');
  });

  it('returns undefined for non-catalog elements', () => {
    expect(getPickerCategoryForElement('bus')).toBeUndefined();
  });
});

describe('requiresCatalogBinding', () => {
  it('returns true for technical elements', () => {
    expect(requiresCatalogBinding('line_overhead')).toBe(true);
    expect(requiresCatalogBinding('cable')).toBe(true);
    expect(requiresCatalogBinding('transformer')).toBe(true);
    expect(requiresCatalogBinding('circuit_breaker')).toBe(true);
  });

  it('returns false for non-catalog elements', () => {
    expect(requiresCatalogBinding('bus')).toBe(false);
    expect(requiresCatalogBinding('source')).toBe(true);
  });
});

describe('getNamespaceForTreeNode', () => {
  it('maps tree node types to namespaces', () => {
    expect(getNamespaceForTreeNode('LINE_TYPES')).toBe('LINIA_SN');
    expect(getNamespaceForTreeNode('CABLE_TYPES')).toBe('KABEL_SN');
    expect(getNamespaceForTreeNode('TRANSFORMER_TYPES')).toBe('TRAFO_SN_NN');
    expect(getNamespaceForTreeNode('SWITCH_EQUIPMENT_TYPES')).toBe('APARAT_SN');
  });

  it('returns undefined for non-catalog tree nodes', () => {
    expect(getNamespaceForTreeNode('BUSES')).toBeUndefined();
    expect(getNamespaceForTreeNode('PROJECT')).toBeUndefined();
  });
});

// =============================================================================
// 7. getCatalogTreeEntries — determinism
// =============================================================================

describe('getCatalogTreeEntries', () => {
  it('returns exactly 5 entries (primary catalog categories z GPZ)', () => {
    const entries = getCatalogTreeEntries();
    expect(entries).toHaveLength(5);
  });

  it('returns entries in deterministic order: LINIA, KABEL, ZRODLO, TRAFO, APARAT', () => {
    const entries = getCatalogTreeEntries();
    expect(entries[0].namespace).toBe('LINIA_SN');
    expect(entries[1].namespace).toBe('KABEL_SN');
    expect(entries[2].namespace).toBe('ZRODLO_SN');
    expect(entries[3].namespace).toBe('TRAFO_SN_NN');
    expect(entries[4].namespace).toBe('APARAT_SN');
  });

  it('each entry has all required fields', () => {
    const entries = getCatalogTreeEntries();
    for (const entry of entries) {
      expect(entry.namespace).toBeDefined();
      expect(entry.treeNodeType).toBeDefined();
      expect(entry.labelPl).toBeDefined();
      expect(entry.pickerCategory).toBeDefined();
      expect(entry.labelPl.length).toBeGreaterThan(0);
    }
  });

  it('produces identical output on repeated calls (determinism)', () => {
    const a = getCatalogTreeEntries();
    const b = getCatalogTreeEntries();
    expect(a).toEqual(b);
  });
});

// =============================================================================
// 8. CATALOG_TREE_NAMESPACES ordering
// =============================================================================

describe('CATALOG_TREE_NAMESPACES', () => {
  it('contains exactly 5 namespaces', () => {
    expect(CATALOG_TREE_NAMESPACES).toHaveLength(5);
  });

  it('matches NAMESPACE_TO_TREE_NODE keys', () => {
    const treeNodeKeys = Object.keys(NAMESPACE_TO_TREE_NODE);
    expect(CATALOG_TREE_NAMESPACES).toEqual(expect.arrayContaining(treeNodeKeys));
    expect(treeNodeKeys).toEqual(expect.arrayContaining([...CATALOG_TREE_NAMESPACES]));
  });
});

// =============================================================================
// 9. Integration: full chain element → tree
// =============================================================================

describe('Full chain: element type → tree node type', () => {
  const chains = [
    { elementType: 'line_overhead', namespace: 'LINIA_SN', picker: 'LINE', tree: 'LINE_TYPES' },
    { elementType: 'cable', namespace: 'KABEL_SN', picker: 'CABLE', tree: 'CABLE_TYPES' },
    { elementType: 'transformer', namespace: 'TRAFO_SN_NN', picker: 'TRANSFORMER', tree: 'TRANSFORMER_TYPES' },
    { elementType: 'circuit_breaker', namespace: 'APARAT_SN', picker: 'MV_APPARATUS', tree: 'SWITCH_EQUIPMENT_TYPES' },
  ] as const;

  for (const chain of chains) {
    it(`${chain.elementType} → ${chain.namespace} → ${chain.picker} → ${chain.tree}`, () => {
      const ns = getNamespaceForElement(chain.elementType);
      expect(ns).toBe(chain.namespace);

      const picker = getPickerCategory(ns!);
      expect(picker).toBe(chain.picker);

      const label = getNamespaceLabelPl(ns!);
      expect(label).toBeDefined();

      const treeNode = NAMESPACE_TO_TREE_NODE[ns!];
      expect(treeNode).toBe(chain.tree);

      // Reverse: tree → namespace
      const backNs = getNamespaceForTreeNode(chain.tree);
      expect(backNs).toBe(chain.namespace);
    });
  }
});
