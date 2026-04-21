import {
  isCanonicalOpName,
  type CanonicalOpName,
} from './domainOps';
import { resolveFallbackModalType, resolveFallbackOperation } from '../ui/engineering-readiness/fixActionRouting';

export type WizardSurfaceStepId =
  | 'parametry-modelu'
  | 'punkt-zasilania-gpz'
  | 'struktura-szyn-i-sekcji'
  | 'galezie-linie-kable'
  | 'transformatory'
  | 'odbiorniki-i-zrodla'
  | 'uziemienia-i-skladowe-zerowe'
  | 'walidacja'
  | 'schemat-jednokreskowy'
  | 'uruchomienie-analiz';

export type FixActionSurfaceKind =
  | 'operation_form'
  | 'navigate_to_element'
  | 'unresolved';

export interface FixActionSurfaceDescriptor {
  kind: FixActionSurfaceKind;
  operation: CanonicalOpName | null;
  element_ref: string | null;
  focus_ref: string | null;
  wizard_step_id: WizardSurfaceStepId | null;
  context: Record<string, unknown>;
  unresolved_reason_code: string | null;
}

export interface ResolveFixActionSurfaceInput {
  code: string;
  action_type: string;
  element_ref?: string | null;
  modal_type?: string | null;
  panel?: string | null;
  step_hint?: string | null;
  focus_ref?: string | null;
  payload_hint?: Record<string, unknown> | null;
}

const WIZARD_STEP_HINT_TO_ID: Record<string, WizardSurfaceStepId> = {
  K1: 'parametry-modelu',
  K2: 'punkt-zasilania-gpz',
  K3: 'struktura-szyn-i-sekcji',
  K4: 'galezie-linie-kable',
  K5: 'transformatory',
  K6: 'odbiorniki-i-zrodla',
  K7: 'uziemienia-i-skladowe-zerowe',
  K8: 'walidacja',
  K9: 'schemat-jednokreskowy',
  K10: 'uruchomienie-analiz',
};

function getRequiredHint(payloadHint: Record<string, unknown> | null | undefined): string | null {
  const value = payloadHint?.required;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function getCatalogNamespaceHint(
  input: ResolveFixActionSurfaceInput,
): string | null {
  const payloadNamespace = input.payload_hint?.catalog_namespace;
  if (typeof payloadNamespace === 'string' && payloadNamespace.length > 0) {
    return payloadNamespace;
  }

  if (input.step_hint === 'switch') {
    return 'APARAT_SN';
  }

  if (input.step_hint === 'branch_point') {
    return 'mv_branch_points';
  }

  switch (input.modal_type) {
    case 'TransformerModal':
      return 'TRAFO_SN_NN';
    case 'SourceModal':
      return 'ZRODLO_SN';
    case 'LoadModal':
      return 'OBCIAZENIE';
    case 'CatalogPicker':
      if (input.code === 'catalog.ref_missing') {
        return 'CONVERTER';
      }
      return null;
    default:
      return null;
  }
}

function resolveOperationFromModalType(
  input: ResolveFixActionSurfaceInput,
): CanonicalOpName | null {
  const fallbackModalType = input.modal_type ?? resolveFallbackModalType(input.code);
  const required = getRequiredHint(input.payload_hint);

  switch (fallbackModalType) {
    case 'SourceModal':
      return input.action_type === 'SELECT_CATALOG' ? 'assign_catalog_to_element' : 'add_grid_source_sn';
    case 'NodeModal':
      return 'update_element_parameters';
    case 'BranchModal':
      if (input.action_type === 'SELECT_CATALOG') {
        return 'assign_catalog_to_element';
      }
      return required === 'valid_branch_port' ? 'start_branch_segment_sn' : 'update_element_parameters';
    case 'TransformerModal':
      if (input.action_type === 'SELECT_CATALOG') {
        return 'assign_catalog_to_element';
      }
      if (
        required === 'blocking_transformer_ref' ||
        required === 'transformer_field' ||
        required === 'block_transformer_for_oze' ||
        required === 'block_transformer_for_bess'
      ) {
        return 'add_transformer_sn_nn';
      }
      return 'update_element_parameters';
    case 'LoadModal':
      return input.action_type === 'SELECT_CATALOG' ? 'assign_catalog_to_element' : 'add_nn_load';
    case 'GeneratorModal':
      return input.action_type === 'SELECT_CATALOG' ? 'assign_catalog_to_element' : 'add_converter_source';
    case 'CatalogPicker':
    case 'BranchPointCatalogPicker':
      return 'assign_catalog_to_element';
    case 'FieldDeviceModal':
    case 'BranchPointSwitchStateModal':
    case 'BranchPointPortsModal':
    case 'InsertZksnForm':
    case 'StudyCaseSettings':
    case 'Uzupełnij Z0':
    case 'Uzupełnij Z2':
    case 'Zmień tryb zwarcia':
      return 'update_element_parameters';
    case 'ProtectionBindingModal':
    case 'relay_settings':
      return 'add_relay';
    case 'AddTransformerModal':
      return 'add_transformer_sn_nn';
    case 'StartBranchModal':
      return 'start_branch_segment_sn';
    default:
      return null;
  }
}

const FIX_ACTION_CODE_TO_OPERATION: Readonly<Record<string, CanonicalOpName>> = {
  'catalog.ref_missing': 'assign_catalog_to_element',
  'generator.connection_variant_missing': 'add_converter_source',
  'generator.connection_variant_invalid': 'add_converter_source',
  'generator.station_ref_missing': 'add_converter_source',
  'generator.station_ref_invalid': 'add_converter_source',
  'generator.block_transformer_missing': 'add_transformer_sn_nn',
  'generator.block_transformer_invalid': 'add_converter_source',
  'generator.block_transformer_catalog_missing': 'assign_catalog_to_element',
  'station.nn_without_transformer': 'add_transformer_sn_nn',
  'generator.nn_variant_requires_station_transformer': 'add_transformer_sn_nn',
  'generator.block_variant_requires_block_transformer': 'add_transformer_sn_nn',
  'protection.binding_missing': 'add_relay',
  'branch_point.catalog_ref_missing': 'assign_catalog_to_element',
  'branch_point.switch_state_missing': 'update_element_parameters',
  'branch_point.required_port_missing': 'update_element_parameters',
  'zksn.branch_count_invalid': 'update_element_parameters',
  'branch_connection.invalid_source_port': 'start_branch_segment_sn',
  'oze.transformer_required': 'add_transformer_sn_nn',
  'bess.transformer_required': 'add_transformer_sn_nn',
  'pv_bess.transformer_required': 'add_transformer_sn_nn',
  'switch.catalog_ref_missing': 'assign_catalog_to_element',
  LF_CONVERGENCE_TOLERANCE_INVALID: 'update_element_parameters',
  LF_CONVERGENCE_ITER_LIMIT_INVALID: 'update_element_parameters',
  LF_SOLVER_DAMPING_INVALID: 'update_element_parameters',
};

export function resolveWizardSurfaceStepId(stepHint: string | null | undefined): WizardSurfaceStepId | null {
  if (!stepHint) {
    return null;
  }
  return WIZARD_STEP_HINT_TO_ID[stepHint] ?? null;
}

export function resolveFixActionSurface(
  input: ResolveFixActionSurfaceInput,
): FixActionSurfaceDescriptor {
  const wizardStepId = resolveWizardSurfaceStepId(input.step_hint);
  const baseContext: Record<string, unknown> = {
    ...(input.payload_hint ?? {}),
  };

  if (input.element_ref) {
    baseContext.element_ref = input.element_ref;
  }
  if (input.focus_ref) {
    baseContext.focus_ref = input.focus_ref;
  }
  if (wizardStepId) {
    baseContext.wizard_step_id = wizardStepId;
  }
  if (input.step_hint) {
    baseContext.surface_hint = input.step_hint;
  }

  if (isCanonicalOpName(input.action_type)) {
    return {
      kind: 'operation_form',
      operation: input.action_type,
      element_ref: input.element_ref ?? null,
      focus_ref: input.focus_ref ?? null,
      wizard_step_id: wizardStepId,
      context: baseContext,
      unresolved_reason_code: null,
    };
  }

  if (input.action_type === 'NAVIGATE_TO_ELEMENT') {
    return {
      kind: 'navigate_to_element',
      operation: null,
      element_ref: input.element_ref ?? null,
      focus_ref: input.focus_ref ?? null,
      wizard_step_id: wizardStepId,
      context: baseContext,
      unresolved_reason_code: null,
    };
  }

  let operation: CanonicalOpName | null = null;
  if (input.action_type === 'SELECT_CATALOG') {
    operation = 'assign_catalog_to_element';
    const catalogNamespace = getCatalogNamespaceHint(input);
    if (catalogNamespace && baseContext.catalog_namespace === undefined) {
      baseContext.catalog_namespace = catalogNamespace;
    }
  } else {
    operation =
      (input.panel === 'catalog'
        ? 'assign_catalog_to_element'
        : input.panel === 'transformer_panel'
          ? 'add_transformer_sn_nn'
          : null)
      ?? resolveFallbackOperation(input.code)
      ?? resolveOperationFromModalType(input)
      ?? FIX_ACTION_CODE_TO_OPERATION[input.code]
      ?? null;
  }

  if (!operation) {
    return {
      kind: 'unresolved',
      operation: null,
      element_ref: input.element_ref ?? null,
      focus_ref: input.focus_ref ?? null,
      wizard_step_id: wizardStepId,
      context: baseContext,
      unresolved_reason_code: `${input.action_type}:${input.modal_type ?? input.panel ?? input.code}`,
    };
  }

  return {
    kind: 'operation_form',
    operation,
    element_ref: input.element_ref ?? null,
    focus_ref: input.focus_ref ?? null,
    wizard_step_id: wizardStepId,
    context: baseContext,
    unresolved_reason_code: null,
  };
}
