import { describe, expect, it } from 'vitest';
import {
  OPERATION_SURFACE_REGISTRY,
  getOperationSurfaceByOp,
} from '../../topology/modals/operationSurfaceRegistry';

describe('SLD operation surface compatibility', () => {
  it('keeps the historical active canonical operations available', () => {
    const originalOps = [
      'continue_trunk_segment_sn',
      'insert_station_on_segment_sn',
      'start_branch_segment_sn',
      'insert_section_switch_sn',
      'connect_secondary_ring_sn',
      'set_normal_open_point',
      'add_nn_outgoing_field',
      'add_nn_load',
      'add_converter_source',
      'add_relay',
      'assign_catalog_to_element',
      'update_element_parameters',
    ];

    for (const op of originalOps) {
      const entry = getOperationSurfaceByOp(op);
      expect(entry).toBeDefined();
      expect(entry!.implemented).toBe(true);
    }
  });

  it('keeps the V11/V12 additions available', () => {
    const newOps = [
      'add_genset_nn',
      'add_ups_nn',
      'add_grid_source_sn',
      'add_sn_bay',
      'add_transformer_sn_nn',
      'insert_branch_pole_on_segment_sn',
      'insert_zksn_on_segment_sn',
      'add_ct',
      'add_vt',
    ];

    for (const op of newOps) {
      const entry = getOperationSurfaceByOp(op);
      expect(entry).toBeDefined();
      expect(entry!.implemented).toBe(true);
    }
  });

  it('does not expose removed aliases', () => {
    expect(getOperationSurfaceByOp('add_measurement')).toBeUndefined();
    expect(getOperationSurfaceByOp(['add', 'nn', 'source', 'field'].join('_'))).toBeUndefined();
  });

  it('has unique operations and only Polish labels', () => {
    const ops = OPERATION_SURFACE_REGISTRY.map((entry) => entry.canonicalOp);
    expect(new Set(ops).size).toBe(ops.length);

    const forbiddenWords = ['Add', 'Edit', 'Delete', 'Show', 'Open', 'Close', 'Run', 'Set'];
    for (const entry of OPERATION_SURFACE_REGISTRY) {
      for (const word of forbiddenWords) {
        expect(entry.labelPl).not.toContain(word);
      }
    }
  });

  it('maps selected operations to the expected components', () => {
    expect(getOperationSurfaceByOp('add_genset_nn')?.componentName).toBe(
      'AddDispatchableSourceForm',
    );
    expect(getOperationSurfaceByOp('add_ups_nn')?.componentName).toBe(
      'AddDispatchableSourceForm',
    );
    expect(getOperationSurfaceByOp('add_grid_source_sn')?.componentName).toBe(
      'AddGridSourceForm',
    );
    expect(getOperationSurfaceByOp('add_sn_bay')?.componentName).toBe(
      'AddSnBayForm',
    );
    expect(getOperationSurfaceByOp('add_transformer_sn_nn')?.componentName).toBe(
      'AddTransformerForm',
    );
  });
});
