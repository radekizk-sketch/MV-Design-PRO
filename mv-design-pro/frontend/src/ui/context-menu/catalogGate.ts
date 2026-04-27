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

export type CatalogGateMode = 'required' | 'topology_allowed_without_catalog';


const CATALOG_REQUIRED_OPERATIONS: Record<string, CatalogNamespace> = {
  add_grid_source_sn: 'ZRODLO_SN',
  add_sn_bay: 'APARAT_SN',
  continue_trunk_segment_sn: 'KABEL_SN',
  start_branch_segment_sn: 'KABEL_SN',
  insert_station_on_segment_sn: 'TRAFO_SN_NN',
  add_transformer_sn_nn: 'TRAFO_SN_NN',
  connect_secondary_ring_sn: 'KABEL_SN',
  insert_section_switch_sn: 'APARAT_SN',
  add_nn_outgoing_field: 'APARAT_NN',
  add_converter_source: 'CONVERTER',
  add_relay: 'ZABEZPIECZENIE',
  add_ct: 'CT',
  add_vt: 'VT',
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
  return canonicalOp in CATALOG_REQUIRED_OPERATIONS;
}

export function catalogNamespace(operationId: string): CatalogNamespace | undefined {
  const canonicalOp = resolveCanonicalOperationName(operationId);
  if (canonicalOp === null) {
    return undefined;
  }
  return CATALOG_REQUIRED_OPERATIONS[canonicalOp];
}

export function catalogGateMode(operationId: string): CatalogGateMode | undefined {
  const canonicalOp = resolveCanonicalOperationName(operationId);
  if (canonicalOp === null || !(canonicalOp in CATALOG_REQUIRED_OPERATIONS)) {
    return undefined;
  }
  if (canonicalOp === 'add_grid_source_sn' || canonicalOp === 'add_sn_bay') {
    return 'topology_allowed_without_catalog';
  }
  return 'required';
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
  mode?: CatalogGateMode;
  namespace?: CatalogNamespace;
  label?: string;
  canonicalOperation: string;
}

export function checkCatalogGate(actionId: string): CatalogGateResult {
  const canonicalOperation = resolveCanonicalOperation(actionId);
  const namespace = catalogNamespace(actionId);
  if (!namespace) {
    return {
      required: false,
      canonicalOperation,
    };
  }

  const mode = catalogGateMode(actionId);
  if (mode === 'topology_allowed_without_catalog') {
    return {
      required: false,
      mode,
      namespace,
      label: catalogNamespaceLabel(namespace),
      canonicalOperation,
    };
  }

  return {
    required: true,
    mode,
    namespace,
    label: catalogNamespaceLabel(namespace),
    canonicalOperation,
  };
}
