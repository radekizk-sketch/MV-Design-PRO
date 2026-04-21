/**
 * CDSE Modal Dispatcher — maps resolved context to modal targets.
 *
 * 1:1 mapping from CdseContextType to canonical modal + operation.
 *
 * INVARIANTS:
 * - Deterministic: same context → same modal
 * - Every context type has exactly one primary modal
 * - Every modal maps to exactly one canonical operation
 * - No fallback logic, no heuristics
 */

import type { CdseContextType, CdseResolvedContext } from './contextResolver';

/**
 * Canonical surface identifiers — match operationSurfaceRegistry entries.
 */
export type CdseModalId =
  | 'AddTrunkSegmentModal'
  | 'InsertStationModal'
  | 'AddBranchModal'
  | 'ConnectRingModal'
  | 'EditDeviceModal'
  | 'EditBusSectionModal'
  | 'EditLoadModal'
  | 'EditSourceModal'
  | 'EditInverterSourceModal'
  | 'EditProtectionModal'
  | 'EditMeasurementModal'
  | 'EditSwitchModal'
  | 'PropertyGridModal';

/**
 * Modal dispatch target — fully resolved modal opening instruction.
 */
export interface ModalDispatchTarget {
  /** Modal component identifier */
  modalId: CdseModalId;
  /** Canonical operation this modal will execute */
  canonicalOp: string;
  /** Catalog namespace for pre-populating catalog picker (if applicable) */
  catalogNamespace?: string;
  /** Pre-filled context data for the modal */
  contextData: {
    elementId: string;
    portId?: string;
    trunkId?: string;
    segmentId?: string;
    terminalId?: string;
    branchId?: string;
    stationId?: string;
  };
}

/**
 * Context type → modal mapping table.
 * Deterministic, exhaustive, no defaults.
 */
const CONTEXT_TO_MODAL: Record<CdseContextType, { modalId: CdseModalId; canonicalOp: string }> = {
  TRUNK_TERMINAL: {
    modalId: 'AddTrunkSegmentModal',
    canonicalOp: 'continue_trunk_segment_sn',
  },
  TRUNK_SEGMENT: {
    modalId: 'InsertStationModal',
    canonicalOp: 'insert_station_on_segment_sn',
  },
  BRANCH_PORT: {
    modalId: 'AddBranchModal',
    canonicalOp: 'start_branch_segment_sn',
  },
  RING_PORT: {
    modalId: 'ConnectRingModal',
    canonicalOp: 'connect_secondary_ring_sn',
  },
  STATION_DEVICE: {
    modalId: 'EditDeviceModal',
    canonicalOp: 'update_element_parameters',
  },
  BUS_SECTION: {
    modalId: 'EditBusSectionModal',
    canonicalOp: 'update_element_parameters',
  },
  LOAD: {
    modalId: 'EditLoadModal',
    canonicalOp: 'update_element_parameters',
  },
  SOURCE: {
    modalId: 'EditSourceModal',
    canonicalOp: 'update_element_parameters',
  },
  INVERTER_SOURCE: {
    modalId: 'EditInverterSourceModal',
    canonicalOp: 'update_element_parameters',
  },
  PROTECTION_DEVICE: {
    modalId: 'EditProtectionModal',
    canonicalOp: 'update_relay_settings',
  },
  MEASUREMENT_DEVICE: {
    modalId: 'EditMeasurementModal',
    canonicalOp: 'update_element_parameters',
  },
  SWITCH: {
    modalId: 'EditSwitchModal',
    canonicalOp: 'update_element_parameters',
  },
  UNKNOWN: {
    modalId: 'PropertyGridModal',
    canonicalOp: 'update_element_parameters',
  },
};

/**
 * Dispatch a modal for the given resolved context.
 *
 * Returns a fully-resolved ModalDispatchTarget, or null if context is UNKNOWN
 * and no fallback is appropriate.
 *
 * @param context - Resolved context from contextResolver
 * @returns ModalDispatchTarget or null
 */
export function dispatchModal(context: CdseResolvedContext): ModalDispatchTarget | null {
  const mapping = CONTEXT_TO_MODAL[context.contextType];
  if (!mapping) {
    return null;
  }

  return {
    modalId: mapping.modalId,
    canonicalOp: mapping.canonicalOp,
    catalogNamespace: context.catalogNamespace,
    contextData: {
      elementId: context.elementId,
      portId: context.portId,
      trunkId: context.trunkId,
      segmentId: context.segmentId,
      terminalId: context.terminalId,
      branchId: context.branchId,
      stationId: context.stationId,
    },
  };
}

/**
 * Get all registered modal mappings — for CI guard validation.
 */
export function getAllModalMappings(): Array<{
  contextType: CdseContextType;
  modalId: CdseModalId;
  canonicalOp: string;
}> {
  return Object.entries(CONTEXT_TO_MODAL).map(([contextType, mapping]) => ({
    contextType: contextType as CdseContextType,
    modalId: mapping.modalId,
    canonicalOp: mapping.canonicalOp,
  }));
}
