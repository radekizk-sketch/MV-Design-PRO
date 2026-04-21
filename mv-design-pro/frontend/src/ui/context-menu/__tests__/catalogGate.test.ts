/**
 * Testy bramki katalogowej UI — catalogGate.ts
 *
 * Faza 5: Weryfikacja mapy operacja → namespace i logiki bramy.
 *
 * INVARIANTS:
 * - Operacje tworzące segmenty → namespace KABEL_SN
 * - Operacje tworzące transformatory → namespace TRAFO_SN_NN
 * - Operacje NIE tworzące elementów → brak wymagania
 * - Etykiety PL — brak anglicyzmów
 */

import { describe, it, expect } from 'vitest';
import {
  requiresCatalog,
  catalogNamespace,
  catalogNamespaceLabel,
  checkCatalogGate,
  resolveCanonicalOperation,
} from '../catalogGate';

// ===========================================================================
// TEST 1: requiresCatalog — operacje wymagające katalogu
// ===========================================================================

describe('requiresCatalog', () => {
  it('returns true for segment operations', () => {
    expect(requiresCatalog('continue_trunk_segment_sn')).toBe(true);
    expect(requiresCatalog('start_branch_segment_sn')).toBe(true);
    expect(requiresCatalog('connect_secondary_ring_sn')).toBe(true);
  });

  it('returns true for transformer operations', () => {
    expect(requiresCatalog('insert_station_on_segment_sn')).toBe(true);
    expect(requiresCatalog('add_transformer_sn_nn')).toBe(true);
  });

  it('returns true for kanoniczne operacje tworzące lub nadal aktywne aliasy topologii', () => {
    expect(requiresCatalog('continue_trunk_segment_sn')).toBe(true);
    expect(requiresCatalog('insert_station_on_segment_sn')).toBe(true);
    expect(requiresCatalog('start_branch_segment_sn')).toBe(true);
    expect(requiresCatalog('add_grid_source_sn')).toBe(true);
    expect(requiresCatalog('add_sn_bay')).toBe(true);
    expect(requiresCatalog('add_nn_outgoing_field')).toBe(true);
    expect(requiresCatalog('add_converter_source')).toBe(true);
    expect(requiresCatalog('insert_section_switch_sn')).toBe(true);
  });

  it('returns false for non-catalog operations', () => {
    expect(requiresCatalog('properties')).toBe(false);
    expect(requiresCatalog('delete')).toBe(false);
    expect(requiresCatalog('toggle_switch')).toBe(false);
    expect(requiresCatalog('show_tree')).toBe(false);
  });

  it('returns true for GPZ/system source operations', () => {
    expect(requiresCatalog('add_grid_source_sn')).toBe(true);
  });
});

// ===========================================================================
// TEST 2: catalogNamespace — mapowanie na namespace katalogu
// ===========================================================================

describe('catalogNamespace', () => {
  it('maps segment ops to KABEL_SN', () => {
    expect(catalogNamespace('continue_trunk_segment_sn')).toBe('KABEL_SN');
    expect(catalogNamespace('start_branch_segment_sn')).toBe('KABEL_SN');
    expect(catalogNamespace('connect_secondary_ring_sn')).toBe('KABEL_SN');
    expect(catalogNamespace('continue_trunk_segment_sn')).toBe('KABEL_SN');
  });

  it('maps transformer ops to TRAFO_SN_NN', () => {
    expect(catalogNamespace('insert_station_on_segment_sn')).toBe('TRAFO_SN_NN');
    expect(catalogNamespace('add_transformer_sn_nn')).toBe('TRAFO_SN_NN');
  });

  it('maps GPZ op to ZRODLO_SN', () => {
    expect(catalogNamespace('add_grid_source_sn')).toBe('ZRODLO_SN');
  });

  it('maps nN source field ops to APARAT_NN', () => {
    expect(catalogNamespace('add_nn_outgoing_field')).toBe('APARAT_NN');
  });

  it('maps SN bay creation ops to APARAT_SN', () => {
    expect(catalogNamespace('add_sn_bay')).toBe('APARAT_SN');
  });

  it('maps converter source ops to CONVERTER', () => {
    expect(catalogNamespace('add_converter_source')).toBe('CONVERTER');
  });

  it('maps protection ops to correct namespaces', () => {
    expect(catalogNamespace('add_relay')).toBe('ZABEZPIECZENIE');
    expect(catalogNamespace('add_ct')).toBe('CT');
    expect(catalogNamespace('add_vt')).toBe('VT');
  });

  it('returns undefined for non-catalog ops', () => {
    expect(catalogNamespace('properties')).toBeUndefined();
    expect(catalogNamespace('delete')).toBeUndefined();
  });
});

// ===========================================================================
// TEST 3: checkCatalogGate — kompletna logika bramy
// ===========================================================================

describe('checkCatalogGate', () => {
  it('returns required=true with namespace for gated operations', () => {
    const gate = checkCatalogGate('continue_trunk_segment_sn');
    expect(gate.required).toBe(true);
    expect(gate.namespace).toBe('KABEL_SN');
    expect(gate.label).toBeDefined();
    expect(gate.canonicalOperation).toBe('continue_trunk_segment_sn');
  });

  it('returns required=false for ungated operations', () => {
    const gate = checkCatalogGate('properties');
    expect(gate.required).toBe(false);
    expect(gate.namespace).toBeUndefined();
    expect(gate.label).toBeUndefined();
  });

  it('resolves action IDs to canonical operations', () => {
    expect(checkCatalogGate('insert_station_on_segment_sn').canonicalOperation).toBe(
      'insert_station_on_segment_sn',
    );
    expect(checkCatalogGate('start_branch_segment_sn').canonicalOperation).toBe(
      'start_branch_segment_sn',
    );
    expect(checkCatalogGate('add_converter_source').canonicalOperation).toBe('add_converter_source');
    expect(checkCatalogGate('add_sn_bay').canonicalOperation).toBe('add_sn_bay');
  });

  it('provides Polish labels for all namespaces', () => {
    const gatedOps = [
      'continue_trunk_segment_sn',
      'insert_station_on_segment_sn',
      'start_branch_segment_sn',
      'add_grid_source_sn',
      'add_sn_bay',
      'add_nn_outgoing_field',
      'add_converter_source',
      'insert_section_switch_sn',
      'add_relay',
      'add_ct',
      'add_vt',
    ];
    for (const opId of gatedOps) {
      const gate = checkCatalogGate(opId);
      if (gate.required && gate.label) {
        // Label nie powinien byc pusty
        expect(gate.label.length).toBeGreaterThan(0);
      }
    }
  });
});

// ===========================================================================
// TEST 4: catalogNamespaceLabel — etykiety PL
// ===========================================================================

describe('catalogNamespaceLabel', () => {
  it('returns Polish labels without English', () => {
    expect(catalogNamespaceLabel('ZRODLO_SN')).toContain('Zasilanie');
    expect(catalogNamespaceLabel('KABEL_SN')).toContain('SN');
    expect(catalogNamespaceLabel('TRAFO_SN_NN')).toContain('Transformator');
    expect(catalogNamespaceLabel('CONVERTER')).toContain('przekształtnikowe');
    expect(catalogNamespaceLabel('ZABEZPIECZENIE')).toContain('Zabezpieczenie');
    expect(catalogNamespaceLabel('CT')).toContain('adowy');
    expect(catalogNamespaceLabel('VT')).toContain('owy');
  });
});

// ===========================================================================
// TEST 5: resolveCanonicalOperation — mapowanie action ID → canonical
// ===========================================================================

describe('resolveCanonicalOperation', () => {
  it('maps known action IDs to canonical operations', () => {
    expect(resolveCanonicalOperation('continue_trunk_segment_sn')).toBe('continue_trunk_segment_sn');
    expect(resolveCanonicalOperation('insert_station_on_segment_sn')).toBe('insert_station_on_segment_sn');
    expect(resolveCanonicalOperation('start_branch_segment_sn')).toBe('start_branch_segment_sn');
    expect(resolveCanonicalOperation('add_grid_source_sn')).toBe('add_grid_source_sn');
    expect(resolveCanonicalOperation('add_sn_bay')).toBe('add_sn_bay');
    expect(resolveCanonicalOperation('add_transformer_sn_nn')).toBe('add_transformer_sn_nn');
    expect(resolveCanonicalOperation('add_nn_outgoing_field')).toBe('add_nn_outgoing_field');
    expect(resolveCanonicalOperation('add_nn_load')).toBe('add_nn_load');
    expect(resolveCanonicalOperation('add_converter_source')).toBe('add_converter_source');
    expect(resolveCanonicalOperation('insert_section_switch_sn')).toBe('insert_section_switch_sn');
  });

  it('passes through unknown IDs as-is', () => {
    expect(resolveCanonicalOperation('some_custom_op')).toBe('some_custom_op');
    expect(resolveCanonicalOperation('properties')).toBe('update_element_parameters');
  });
});
