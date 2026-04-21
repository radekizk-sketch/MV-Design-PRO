import { describe, expect, it } from 'vitest';
import { resolveFallbackModalType, resolveFallbackOperation } from '../fixActionRouting';

describe('fixActionRouting', () => {
  it('resolves fallback modal types for known blocker codes', () => {
    expect(resolveFallbackModalType('missing_source')).toBe('SourceModal');
    expect(resolveFallbackModalType('line.missing_catalog')).toBe('CatalogPicker');
    expect(resolveFallbackModalType('missing_generator')).toBe('GeneratorModal');
    expect(resolveFallbackModalType('generator.missing_power')).toBe('GeneratorModal');
  });

  it('returns null for unknown modal codes', () => {
    expect(resolveFallbackModalType('unknown.code')).toBeNull();
    expect(resolveFallbackModalType(null)).toBeNull();
  });

  it('resolves fallback operations for known engineering debt codes', () => {
    expect(resolveFallbackOperation('ELIG_SC1_MISSING_Z0')).toBe('update_element_parameters');
    expect(resolveFallbackOperation('ELIG_SC3_SOURCE_NO_SC_PARAMS')).toBe('update_element_parameters');
    expect(resolveFallbackOperation('ELIG_SC3_MISSING_CATALOG_REF')).toBe('assign_catalog_to_element');
    expect(resolveFallbackOperation('ELIG_SC3_MISSING_IMPEDANCE')).toBe('assign_catalog_to_element');
    expect(resolveFallbackOperation('ELIG_LF_NO_LOADS_OR_GENERATORS')).toBe('add_converter_source');
    expect(resolveFallbackOperation('line.missing_impedance')).toBe('assign_catalog_to_element');
    expect(resolveFallbackOperation('switch.missing_normal_state')).toBe('update_element_parameters');
    expect(resolveFallbackOperation('branch_point.invalid_parent_medium')).toBe('insert_branch_pole_on_segment_sn');
    expect(resolveFallbackOperation('zksn.branch_count_invalid')).toBe('insert_zksn_on_segment_sn');
    expect(resolveFallbackOperation('bess.missing_transformer')).toBe('add_transformer_sn_nn');
    expect(resolveFallbackOperation('missing_generator')).toBe('add_converter_source');
    expect(resolveFallbackOperation('generator.missing_power')).toBe('add_converter_source');
    expect(resolveFallbackOperation('pv.control_mode_missing')).toBe('add_converter_source');
    expect(resolveFallbackOperation('ring.not_configured')).toBe('set_normal_open_point');
  });

  it('returns null for unknown operation codes', () => {
    expect(resolveFallbackOperation('totally.unknown')).toBeNull();
    expect(resolveFallbackOperation(undefined)).toBeNull();
  });
});
