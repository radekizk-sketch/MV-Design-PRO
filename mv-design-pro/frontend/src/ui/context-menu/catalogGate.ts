/**
 * Bramka katalogowa UI - sprawdzenie wymagania katalogu przed operacja.
 *
 * Regula: frontend nigdy nie wysyla operacji tworzacej segment lub aparat
 * bez poprawnego `catalog_binding` w payload.
 */

import { isCanonicalOpName, type CanonicalOpName } from '../../types/domainOps';
import { resolveContextActionOperation } from './actionRouting';

export type CatalogNamespace =
  | 'ZRODLO_SN'
  | 'KABEL_SN'
  | 'TRAFO_SN_NN'
  | 'APARAT_SN'
  | 'APARAT_NN'
  | 'CONVERTER'
  | 'mv_branch_points'
  | 'ZRODLO_NN_PV'
  | 'ZRODLO_NN_BESS'
  | 'ZABEZPIECZENIE'
  | 'CT'
  | 'VT'
  | 'OBCIAZENIE';

export type CatalogGateMode = 'required' | 'topology_allowed_without_catalog' | 'optional';

interface CatalogGateRule {
  mode: CatalogGateMode;
  namespace: CatalogNamespace;
}

const CATALOG_GATE_RULES: Record<string, CatalogGateRule> = {
  add_grid_source_sn: {
    mode: 'topology_allowed_without_catalog',
    namespace: 'ZRODLO_SN',
  },
  add_sn_bay: {
    mode: 'topology_allowed_without_catalog',
    namespace: 'APARAT_SN',
  },
  continue_trunk_segment_sn: {
    mode: 'required',
    namespace: 'KABEL_SN',
  },
  start_branch_segment_sn: {
    mode: 'required',
    namespace: 'KABEL_SN',
  },
  insert_station_on_segment_sn: {
    mode: 'required',
    namespace: 'TRAFO_SN_NN',
  },
  add_transformer_sn_nn: {
    mode: 'required',
    namespace: 'TRAFO_SN_NN',
  },
  connect_secondary_ring_sn: {
    mode: 'required',
    namespace: 'KABEL_SN',
  },
  insert_section_switch_sn: {
    mode: 'required',
    namespace: 'APARAT_SN',
  },
  add_nn_outgoing_field: {
    mode: 'required',
    namespace: 'APARAT_NN',
  },
  add_converter_source: {
    mode: 'required',
    namespace: 'CONVERTER',
  },
  add_relay: {
    mode: 'required',
    namespace: 'ZABEZPIECZENIE',
  },
  add_ct: {
    mode: 'required',
    namespace: 'CT',
  },
  add_vt: {
    mode: 'required',
    namespace: 'VT',
  },
};

function resolveCanonicalOperationName(operationId: string): CanonicalOpName | null {
  const resolved = resolveContextActionOperation(operationId) ?? operationId;
  return isCanonicalOpName(resolved) ? resolved : null;
}

export function requiresCatalog(operationId: string): boolean {
  const canonicalOp = resolveCanonicalOperationName(operationId);
  if (canonicalOp === null) {
    return false;
  }
  return CATALOG_GATE_RULES[canonicalOp]?.mode === 'required';
}

export function catalogNamespace(operationId: string): CatalogNamespace | undefined {
  const canonicalOp = resolveCanonicalOperationName(operationId);
  if (canonicalOp === null) {
    return undefined;
  }
  return CATALOG_GATE_RULES[canonicalOp]?.namespace;
}

export function catalogGateMode(operationId: string): CatalogGateMode | undefined {
  const canonicalOp = resolveCanonicalOperationName(operationId);
  if (canonicalOp === null) {
    return undefined;
  }
  return CATALOG_GATE_RULES[canonicalOp]?.mode;
}

export function catalogNamespaceLabel(ns: CatalogNamespace): string {
  const labels: Record<CatalogNamespace, string> = {
    ZRODLO_SN: 'Zasilanie systemowe SN',
    KABEL_SN: 'Kabel/linia SN',
    TRAFO_SN_NN: 'Transformator SN/nN',
    APARAT_SN: 'Aparat SN',
    APARAT_NN: 'Aparat nN',
    CONVERTER: 'Źródło przekształtnikowe',
    mv_branch_points: 'Slup odgalezny SN',
    ZRODLO_NN_PV: 'Falownik PV',
    ZRODLO_NN_BESS: 'Falownik BESS',
    ZABEZPIECZENIE: 'Zabezpieczenie',
    CT: 'Przekladnik pradowy',
    VT: 'Przekladnik napieciowy',
    OBCIAZENIE: 'Obciazenie',
  };
  return labels[ns];
}

export function resolveCanonicalOperation(actionId: string): string {
  return resolveCanonicalOperationName(actionId) ?? actionId;
}

export interface CatalogGateResult {
  required: boolean;
  mode: CatalogGateMode;
  namespace?: CatalogNamespace;
  label?: string;
  canonicalOperation: string;
}

export function checkCatalogGate(actionId: string): CatalogGateResult {
  const canonicalOperation = resolveCanonicalOperation(actionId);
  const mode = catalogGateMode(actionId) ?? 'optional';
  const namespace = catalogNamespace(actionId);
  if (!namespace) {
    return {
      required: false,
      mode,
      canonicalOperation,
    };
  }

  return {
    required: mode === 'required',
    mode,
    namespace,
    label: catalogNamespaceLabel(namespace),
    canonicalOperation,
  };
}
