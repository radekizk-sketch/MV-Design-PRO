import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../types/enm';
import { resolveCatalogNamespaceFromSnapshot, resolveFixActionElementType } from '../fixActionSurfaceRuntime';

const snapshot = {
  header: {} as never,
  buses: [],
  branches: [
    {
      id: 'brk-1',
      ref_id: 'stn/1/sn_field_breaker/000',
      name: 'Wyłącznik pola SN 1',
      tags: [],
      meta: {},
      from_bus_ref: 'bus-sn',
      to_bus_ref: 'bus-sn',
      status: 'closed',
      type: 'breaker',
    },
  ],
  transformers: [],
  sources: [],
  loads: [],
  generators: [],
  substations: [],
  bays: [],
  junctions: [],
  branch_points: [],
  corridors: [],
  measurements: [],
  protection_assignments: [],
} as unknown as EnergyNetworkModel;

describe('fixActionSurfaceRuntime', () => {
  it('uses snapshot semantics over a generic branch hint for switchgear blockers', () => {
    expect(resolveFixActionElementType(snapshot, 'stn/1/sn_field_breaker/000', 'branch')).toBe('Switch');
    expect(resolveCatalogNamespaceFromSnapshot(snapshot, 'stn/1/sn_field_breaker/000')).toBe('APARAT_SN');
  });
});
