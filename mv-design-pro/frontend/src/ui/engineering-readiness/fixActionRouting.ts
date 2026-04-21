import type { CanonicalOpName } from '../../types/domainOps';

const FALLBACK_MODAL_TYPES: Readonly<Record<string, string>> = {
  missing_source: 'SourceModal',
  'line.missing_catalog': 'CatalogPicker',
  missing_generator: 'GeneratorModal',
  'generator.missing_power': 'GeneratorModal',
} as const;

const FALLBACK_OPERATIONS: Readonly<Record<string, CanonicalOpName>> = {
  ELIG_SC1_MISSING_Z0: 'update_element_parameters',
  ELIG_SC3_SOURCE_NO_SC_PARAMS: 'update_element_parameters',
  ELIG_SC3_MISSING_CATALOG_REF: 'assign_catalog_to_element',
  ELIG_SC3_MISSING_IMPEDANCE: 'assign_catalog_to_element',
  ELIG_LF_NO_LOADS_OR_GENERATORS: 'add_converter_source',
  'line.missing_impedance': 'assign_catalog_to_element',
  'switch.missing_normal_state': 'update_element_parameters',
  'branch_point.invalid_parent_medium': 'insert_branch_pole_on_segment_sn',
  'zksn.branch_count_invalid': 'insert_zksn_on_segment_sn',
  'bess.missing_transformer': 'add_transformer_sn_nn',
  missing_generator: 'add_converter_source',
  'generator.missing_power': 'add_converter_source',
  'pv.control_mode_missing': 'add_converter_source',
  'ring.not_configured': 'set_normal_open_point',
} as const;

export function resolveFallbackModalType(code: string | null | undefined): string | null {
  if (!code) {
    return null;
  }
  return FALLBACK_MODAL_TYPES[code] ?? null;
}

export function resolveFallbackOperation(
  code: string | null | undefined,
): CanonicalOpName | null {
  if (!code) {
    return null;
  }
  return FALLBACK_OPERATIONS[code] ?? null;
}
