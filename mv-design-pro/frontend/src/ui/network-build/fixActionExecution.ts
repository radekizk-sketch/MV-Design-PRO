import type { CanonicalOpName } from '../../types/domainOps';
import type { FixAction } from '../../types/enm';
import { resolveModalType } from '../schema-completeness/fixActionModalBridge';

type SupportedOperation =
  | 'assign_catalog_to_element'
  | 'update_element_parameters'
  | 'add_transformer_sn_nn'
  | 'set_normal_open_point'
  | 'insert_branch_pole_on_segment_sn'
  | 'insert_zksn_on_segment_sn';

const CODE_TO_MODAL_TYPE: Record<string, string> = {
  missing_source: 'SourceModal',
  'network.no_source': 'SourceModal',
  'source.missing_short_circuit': 'SourceModal',
  no_source: 'SourceModal',
  missing_transformer: 'TransformerModal',
  'transformer.missing_uk_percent': 'TransformerModal',
  no_transformer: 'TransformerModal',
  missing_catalog: 'CatalogPicker',
  'line.missing_catalog': 'CatalogPicker',
  'line.missing_impedance': 'CatalogPicker',
  no_catalog: 'CatalogPicker',
  missing_protection: 'ProtectionBindingModal',
  no_protection: 'ProtectionBindingModal',
  missing_load: 'LoadModal',
  missing_generator: 'GeneratorModal',
  missing_field_device: 'FieldDeviceModal',
  'switch.missing_normal_state': 'FieldDeviceModal',
  missing_bay: 'FieldDeviceModal',
};

const CODE_TO_OPERATION: Array<{ pattern: RegExp; op: SupportedOperation }> = [
  { pattern: /catalog|missing_type|impedance|zero_seq|missing_rating|line\.missing_impedance|transformer\.missing_uk_percent/i, op: 'assign_catalog_to_element' },
  { pattern: /tap_position|operating|switch_state|normal_state|grounding|network\.grounding|switch\.missing_normal_state/i, op: 'update_element_parameters' },
  { pattern: /branch_point\.invalid_parent_medium|branch_connection\.source_not_branch_capable/i, op: 'insert_branch_pole_on_segment_sn' },
  { pattern: /zksn\.branch_count_invalid|branch_connection\.invalid_source_port|branch_point\.branch_port_occupied/i, op: 'insert_zksn_on_segment_sn' },
  { pattern: /transformer|oze\.missing_transformer|bess\.missing_transformer/i, op: 'add_transformer_sn_nn' },
  { pattern: /ring|nop/i, op: 'set_normal_open_point' },
];

export function resolveOperationForCode(code: string): SupportedOperation | null {
  for (const candidate of CODE_TO_OPERATION) {
    if (candidate.pattern.test(code)) {
      return candidate.op;
    }
  }

  return null;
}

interface ExecuteFixActionParams {
  action: FixAction;
  navigateToElement: (elementRef: string) => void;
  openOperationForm: (op: CanonicalOpName, context?: Record<string, unknown>) => void;
}

export function executeFixAction({
  action,
  navigateToElement,
  openOperationForm,
}: ExecuteFixActionParams) {
  const payload = action.element_ref ? { element_ref: action.element_ref } : {};

  switch (action.action_type) {
    case 'NAVIGATE_TO_ELEMENT': {
      if (action.element_ref) {
        navigateToElement(action.element_ref);
      }
      return;
    }
    case 'OPEN_MODAL': {
      if (action.element_ref) {
        navigateToElement(action.element_ref);
      }
      const modalType = action.modal_type ?? CODE_TO_MODAL_TYPE[action.code] ?? null;
      const modalId = resolveModalType(modalType);
      if (modalId) {
        window.dispatchEvent(
          new CustomEvent('modal:open', { detail: { modalId, context: payload } }),
        );
        return;
      }
      openOperationForm(resolveOperationForCode(action.code) ?? 'update_element_parameters', payload);
      return;
    }
    case 'SELECT_CATALOG': {
      if (action.element_ref) {
        navigateToElement(action.element_ref);
      }
      openOperationForm('assign_catalog_to_element', payload);
      return;
    }
    case 'ADD_MISSING_DEVICE': {
      if (action.element_ref) {
        navigateToElement(action.element_ref);
      }
      const modalType = action.modal_type ?? CODE_TO_MODAL_TYPE[action.code] ?? null;
      const modalId = resolveModalType(modalType);
      if (modalId) {
        window.dispatchEvent(
          new CustomEvent('modal:open', { detail: { modalId, context: payload } }),
        );
        return;
      }
      openOperationForm(resolveOperationForCode(action.code) ?? 'update_element_parameters', payload);
      return;
    }
    default:
      return;
  }
}
