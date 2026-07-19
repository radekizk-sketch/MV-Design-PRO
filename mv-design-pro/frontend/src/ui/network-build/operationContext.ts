import type { ElementType } from '../types';
import type { EnergyNetworkModel, LogicalViewsV1 } from '../../types/enm';
import type { NetworkBuildOperationName } from './networkBuildStore';
import {
  resolveBranchStartOperationContext,
  resolveContinueTrunkOperationContext,
  resolveElementNetworkContext,
  resolveNopCandidates,
  resolveRingOperationContext,
  resolveTransformerOperationContext,
} from './operationContextResolvers';

interface BuildOperationContextArgs {
  canonicalOp: NetworkBuildOperationName;
  elementId: string;
  elementType: ElementType;
  snapshot: EnergyNetworkModel | null;
  logicalViews: LogicalViewsV1 | null;
  extraContext?: Record<string, unknown>;
}

export function buildOperationContext({
  canonicalOp,
  elementId,
  elementType,
  snapshot,
  logicalViews,
  extraContext = {},
}: BuildOperationContextArgs): Record<string, unknown> {
  const context: Record<string, unknown> = {
    element_ref: elementId,
    element_type: elementType,
  };

  const elementContext = resolveElementNetworkContext(snapshot, elementId, elementType);

  if (elementContext.stationRef) {
    context.station_ref = elementContext.stationRef;
  }
  if (elementContext.busNnRef) {
    context.bus_nn_ref = elementContext.busNnRef;
  }
  if (elementContext.feederRef) {
    context.feeder_ref = elementContext.feederRef;
  }
  if (elementType === 'SourceFieldNN') {
    context.existing_field_ref = elementId;
    context.field_role = 'SOURCE';
  }

  switch (canonicalOp) {
    case 'continue_trunk_segment_sn': {
      const trunkContext = resolveContinueTrunkOperationContext(snapshot, logicalViews, elementId, elementType);
      if (trunkContext.stationRef && !context.station_ref) {
        context.station_ref = trunkContext.stationRef;
      }
      if (trunkContext.trunkId) {
        context.trunk_id = trunkContext.trunkId;
        context.trunkId = trunkContext.trunkId;
      }
      if (trunkContext.terminalPortId) {
        context.terminal_port_id = trunkContext.terminalPortId;
        context.port_id = trunkContext.terminalPortId;
      }
      if (trunkContext.terminalId) {
        context.from_terminal_id = trunkContext.terminalId;
        context.terminal_id = trunkContext.terminalId;
        context.terminalId = trunkContext.terminalId;
      }
      if (trunkContext.terminalBusRef) {
        context.from_bus_ref = trunkContext.terminalBusRef;
      }
      if (trunkContext.lineFieldRef) {
        context.field_ref = trunkContext.lineFieldRef;
      }
      context.terminal_name = trunkContext.terminalName;
      context.terminal_voltage_label = trunkContext.terminalVoltageLabel;
      context.is_first_trunk_segment = trunkContext.isFirstTrunkSegment;
      context.existing_segment_count = trunkContext.existingSegmentCount;
      break;
    }
    case 'insert_station_on_segment_sn':
    case 'insert_branch_pole_on_segment_sn':
    case 'insert_zksn_on_segment_sn':
    case 'insert_section_switch_sn':
      context.segment_id = elementId;
      context.segment_ref = elementId;
      context.segmentRef = elementId;
      break;
    case 'start_branch_segment_sn': {
      const branchContext = resolveBranchStartOperationContext(snapshot, elementId, elementType);
      if (branchContext.stationRef && !context.station_ref) {
        context.station_ref = branchContext.stationRef;
      }
      if (branchContext.fromRef) {
        context.from_ref = branchContext.fromRef;
        context.source_type_label = branchContext.sourceType;
        context.source_name = branchContext.sourceName;
        context.source_bus_ref = branchContext.sourceBusRef;
        context.source_voltage_label = branchContext.voltageLabel;
        context.source_port_label = branchContext.portLabel;
      }
      if (branchContext.sourceBusRef || branchContext.busRef) {
        context.from_bus_ref = branchContext.sourceBusRef || branchContext.busRef;
      }
      break;
    }
    case 'connect_secondary_ring_sn': {
      const ringContext = resolveRingOperationContext(snapshot, logicalViews, elementId, elementType);
      context.terminalA_id = ringContext.terminalAId;
      context.terminal_a_id = ringContext.terminalAId;
      context.terminalA_label = ringContext.terminalAId;
      context.terminalB_id = ringContext.terminalBId;
      context.terminal_b_id = ringContext.terminalBId;
      context.terminalB_label = ringContext.terminalBId || 'Wybierz drugi terminal';
      context.nop_candidates = ringContext.nopCandidates;
      break;
    }
    case 'set_normal_open_point':
      context.switch_ref = elementId;
      context.nop_candidates = resolveNopCandidates(snapshot, logicalViews);
      break;
    case 'add_sn_bay':
      context.bus_ref = elementType === 'Bus' ? elementId : context.bus_ref ?? null;
      if (elementContext.stationRef && !context.station_ref) {
        context.station_ref = elementContext.stationRef;
      }
      break;
    case 'add_shunt_compensator_sn': {
      if (elementType === 'Bus') {
        context.bus_ref = elementId;
        const bus = snapshot?.buses?.find(
          (candidate) => candidate.ref_id === elementId || candidate.id === elementId,
        );
        if (bus) {
          context.bus_name = bus.name ?? undefined;
          if (typeof bus.voltage_kv === 'number' && bus.voltage_kv > 0) {
            context.bus_voltage_kv = bus.voltage_kv;
          }
        }
      }
      break;
    }
    case 'add_converter_source': {
      const sourceTechnology = typeof extraContext.source_technology === 'string'
        ? extraContext.source_technology.trim().toUpperCase()
        : 'PV';
      context.field_role = 'SOURCE';
      context.source_technology = sourceTechnology;
      context.source_field_kind =
        sourceTechnology === 'BESS'
          ? 'BESS'
          : sourceTechnology === 'FW'
            ? 'FW'
            : 'PV';
      break;
    }
    case 'add_transformer_sn_nn': {
      const transformerContext = resolveTransformerOperationContext(snapshot, elementId, elementType);
      if (transformerContext.stationRef && !context.station_ref) {
        context.station_ref = transformerContext.stationRef;
      }
      if (transformerContext.hvBusRef) {
        context.hv_bus_ref = transformerContext.hvBusRef;
      }
      if (transformerContext.lvBusRef) {
        context.lv_bus_ref = transformerContext.lvBusRef;
      }
      context.station_name = transformerContext.stationName;
      context.hv_bus_name = transformerContext.hvBusName;
      context.lv_bus_name = transformerContext.lvBusName;
      context.transformer_context_valid = transformerContext.isAllowed;
      context.transformer_block_reason = transformerContext.blockReason;
      break;
    }
    case 'add_genset_nn':
      context.source_field_kind = 'AGREGAT';
      break;
    case 'add_ups_nn':
      context.source_field_kind = 'UPS';
      break;
    default:
      break;
  }

  return {
    ...context,
    ...extraContext,
  };
}
