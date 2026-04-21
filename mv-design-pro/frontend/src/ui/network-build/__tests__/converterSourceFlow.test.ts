import { describe, expect, it } from 'vitest';
import { buildOperationContext } from '../operationContext';
import { resolveStationRef } from '../forms/enmResolvers';

const snapshot = {
  substations: [
    {
      id: 'st-1',
      ref_id: 'st-1',
      name: 'ST-1',
      bus_refs: ['bus-sn-1', 'bus-nn-1'],
      transformer_refs: [],
    },
  ],
  bays: [],
  buses: [
    { id: 'bus-sn-1', ref_id: 'bus-sn-1', name: 'Szyna SN 1', voltage_kv: 15 },
    { id: 'bus-nn-1', ref_id: 'bus-nn-1', name: 'Szyna nN 1', voltage_kv: 0.4 },
  ],
  generators: [],
  loads: [],
  transformers: [],
  branches: [],
  branch_points: [],
} as any;

const logicalViews = {
  terminals: [],
} as any;

describe('converter source shared flow', () => {
  it('builds shared converter context with FW field kind', () => {
    const context = buildOperationContext({
      canonicalOp: 'add_converter_source',
      elementId: 'bus-nn-1',
      elementType: 'BusNN',
      snapshot,
      logicalViews,
      extraContext: { source_technology: 'FW' },
    });

    expect(context.station_ref).toBe('st-1');
    expect(context.bus_nn_ref).toBe('bus-nn-1');
    expect(context.source_field_kind).toBe('FW');
  });

  it('resolves station automatically when snapshot has exactly one station', () => {
    expect(resolveStationRef({}, snapshot)).toBe('st-1');
  });
});
