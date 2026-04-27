import type { ElementType } from '../../types';
import type { CanonicalOpName } from '../../../types/domainOps';

export type NetworkBuildOperationName = CanonicalOpName;

export type ActiveOperationForm =
  | null
  | { op: 'add_grid_source_sn'; context?: Record<string, unknown> }
  | { op: 'add_sn_bay'; context?: Record<string, unknown> }
  | { op: 'continue_trunk_segment_sn'; context?: Record<string, unknown> }
  | { op: 'insert_station_on_segment_sn'; context?: Record<string, unknown> }
  | { op: 'insert_branch_pole_on_segment_sn'; context?: Record<string, unknown> }
  | { op: 'insert_zksn_on_segment_sn'; context?: Record<string, unknown> }
  | { op: 'start_branch_segment_sn'; context?: Record<string, unknown> }
  | { op: 'insert_section_switch_sn'; context?: Record<string, unknown> }
  | { op: 'connect_secondary_ring_sn'; context?: Record<string, unknown> }
  | { op: 'set_normal_open_point'; context?: Record<string, unknown> }
  | { op: 'add_transformer_sn_nn'; context?: Record<string, unknown> }
  | { op: 'add_nn_outgoing_field'; context?: Record<string, unknown> }
  | { op: 'add_converter_source'; context?: Record<string, unknown> }
  | { op: 'add_genset_nn'; context?: Record<string, unknown> }
  | { op: 'add_ups_nn'; context?: Record<string, unknown> }
  | { op: 'add_nn_load'; context?: Record<string, unknown> }
  | { op: 'add_ct'; context?: Record<string, unknown> }
  | { op: 'add_vt'; context?: Record<string, unknown> }
  | { op: 'add_relay'; context?: Record<string, unknown> }
  | { op: 'assign_catalog_to_element'; context?: Record<string, unknown> }
  | { op: 'update_element_parameters'; context?: Record<string, unknown> }
  | { op: 'refresh_snapshot'; context?: Record<string, unknown> };

export type ActiveObjectCard =
  | null
  | { kind: 'source'; elementId: string }
  | { kind: 'trunk'; corridorRef: string }
  | { kind: 'station'; elementId: string }
  | { kind: 'line_segment'; elementId: string }
  | { kind: 'transformer'; elementId: string }
  | { kind: 'switch'; elementId: string }
  | { kind: 'bay'; elementId: string }
  | { kind: 'nn_switchgear'; elementId: string }
  | { kind: 'renewable_source'; elementId: string }
  | { kind: 'branch_pole'; elementId: string }
  | { kind: 'zksn'; elementId: string };

export type ActiveInspectorPanel =
  | null
  | {
      kind:
        | 'results'
        | 'trace'
        | 'readiness'
        | 'report'
        | 'history'
        | 'topology'
        | 'secondary_links'
        | 'coordination'
        | 'field_measurements'
        | 'field_control'
        | 'field_protection'
        | 'field_source_contributions'
        | 'field_earth_fault'
        | 'field_work_safety'
        | 'field_compare';
      elementId: string;
      elementType: ElementType;
    };
