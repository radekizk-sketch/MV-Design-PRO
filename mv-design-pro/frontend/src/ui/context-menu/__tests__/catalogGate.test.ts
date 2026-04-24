import { describe, expect, it } from 'vitest';

import {
  catalogGateMode,
  catalogNamespace,
  catalogNamespaceLabel,
  checkCatalogGate,
  requiresCatalog,
  resolveCanonicalOperation,
} from '../catalogGate';

describe('catalog gate', () => {
  it('keeps technical segment and transformer operations as hard catalog-first', () => {
    expect(requiresCatalog('continue_trunk_segment_sn')).toBe(true);
    expect(requiresCatalog('start_branch_segment_sn')).toBe(true);
    expect(requiresCatalog('insert_station_on_segment_sn')).toBe(true);
    expect(requiresCatalog('add_transformer_sn_nn')).toBe(true);
    expect(catalogGateMode('continue_trunk_segment_sn')).toBe('required');
    expect(catalogGateMode('insert_station_on_segment_sn')).toBe('required');
  });

  it('allows topological GPZ and SN bay creation without forcing catalog picker', () => {
    expect(requiresCatalog('add_grid_source_sn')).toBe(false);
    expect(requiresCatalog('add_sn_bay')).toBe(false);
    expect(catalogGateMode('add_grid_source_sn')).toBe('topology_allowed_without_catalog');
    expect(catalogGateMode('add_sn_bay')).toBe('topology_allowed_without_catalog');
  });

  it('keeps canonical namespaces for topological and technical operations', () => {
    expect(catalogNamespace('add_grid_source_sn')).toBe('ZRODLO_SN');
    expect(catalogNamespace('add_sn_bay')).toBe('APARAT_SN');
    expect(catalogNamespace('continue_trunk_segment_sn')).toBe('KABEL_SN');
    expect(catalogNamespace('add_relay')).toBe('ZABEZPIECZENIE');
  });

  it('returns detailed gate shape for required operations', () => {
    const gate = checkCatalogGate('continue_trunk_segment_sn');
    expect(gate.required).toBe(true);
    expect(gate.mode).toBe('required');
    expect(gate.namespace).toBe('KABEL_SN');
    expect(gate.label).toBe('Kabel/linia SN');
  });

  it('returns topology mode without hard blocking for GPZ and SN bay', () => {
    const sourceGate = checkCatalogGate('add_grid_source_sn');
    expect(sourceGate.required).toBe(false);
    expect(sourceGate.mode).toBe('topology_allowed_without_catalog');
    expect(sourceGate.namespace).toBe('ZRODLO_SN');

    const bayGate = checkCatalogGate('add_sn_bay');
    expect(bayGate.required).toBe(false);
    expect(bayGate.mode).toBe('topology_allowed_without_catalog');
    expect(bayGate.namespace).toBe('APARAT_SN');
  });

  it('keeps Polish labels and canonical operation resolution', () => {
    expect(catalogNamespaceLabel('ZRODLO_SN')).toContain('Zasilanie');
    expect(catalogNamespaceLabel('APARAT_SN')).toContain('Aparat');
    expect(resolveCanonicalOperation('add_sn_bay')).toBe('add_sn_bay');
    expect(resolveCanonicalOperation('properties')).toBe('update_element_parameters');
  });
});
