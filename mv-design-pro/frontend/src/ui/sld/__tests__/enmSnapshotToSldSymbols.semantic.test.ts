import { describe, expect, it } from 'vitest';

import { assertSldSymbolCopiesMatchSemanticModel } from '../../engineering-semantic';
import { projectEnmSnapshotToSld } from '../enmSnapshotToSldSymbols';

function snapshotFixture() {
  return {
    header: {
      hash_sha256: 'enm-sld-semantic-1',
      created_at: '2026-04-28T10:00:00Z',
    },
    buses: [
      { ref_id: 'bus-gpz-sn', name: 'SZ-1 15 kV', voltage_kv: 15 },
      { ref_id: 'bus-st-sn', name: 'Stacja 1 SN', voltage_kv: 15 },
    ],
    sources: [
      {
        ref_id: 'source-gpz',
        name: 'GPZ Zachod',
        bus_ref: 'bus-gpz-sn',
        substation_ref: 'gpz-1',
        sk3_mva: 250,
      },
    ],
    branches: [
      {
        ref_id: 'seg-1',
        name: 'Kabel SN 1',
        type: 'cable',
        from_bus_ref: 'bus-gpz-sn',
        to_bus_ref: 'bus-st-sn',
        status: 'closed',
        length_km: 1.2,
        catalog_ref: 'XRUHAKXS-3x240',
        materialized_params: {
          r_ohm_per_km: 0.125,
          x_ohm_per_km: 0.105,
        },
      },
    ],
    transformers: [],
    loads: [],
    generators: [],
    substations: [
      {
        ref_id: 'gpz-1',
        name: 'GPZ Zachod',
        station_type: 'gpz',
        bus_refs: ['bus-gpz-sn'],
        transformer_refs: [],
      },
    ],
    bays: [
      {
        ref_id: 'bay-l1',
        name: 'Pole L1',
        bay_role: 'OUT',
        bus_ref: 'bus-gpz-sn',
        substation_ref: 'gpz-1',
        equipment_refs: ['q1-l1'],
      },
    ],
    junctions: [],
    corridors: [],
    measurements: [],
    protection_assignments: [],
    branch_points: [],
    logical_views: { trunks: [], branches: [], rings: [] },
  } as any;
}

describe('projectEnmSnapshotToSld semantic bridge', () => {
  it('returns semantic model, diagnostics and SLD base projection with matching hashes', () => {
    const projection = projectEnmSnapshotToSld(snapshotFixture());

    expect(projection.semanticModel).not.toBeNull();
    expect(projection.diagnostics).not.toBeNull();
    expect(projection.sldBaseProjection).not.toBeNull();
    expect(projection.diagnostics?.semanticHash).toBe(projection.semanticModel?.semanticHash);
    expect(projection.sldBaseProjection?.semanticHash).toBe(projection.semanticModel?.semanticHash);
    expect(projection.sldBaseProjection?.viewHash).toMatch(/^view-/);
  });

  it('copies SLD symbol role data from EngineeringSemanticModel and never from geometry', () => {
    const projection = projectEnmSnapshotToSld(snapshotFixture());

    expect(projection.semanticModel).not.toBeNull();
    expect(projection.sldBaseProjection).not.toBeNull();
    expect(assertSldSymbolCopiesMatchSemanticModel(projection.semanticModel!, projection.sldBaseProjection!)).toEqual([]);
    expect(projection.sldBaseProjection?.symbols.some((symbol) => symbol.elementRefId === 'seg-1')).toBe(true);
    expect(projection.sldBaseProjection?.symbols.every((symbol) => symbol.semanticHash === projection.semanticModel?.semanticHash)).toBe(true);
  });

  it('builds SLD routes from EngineeringConnection ids, not from route geometry as topology', () => {
    const projection = projectEnmSnapshotToSld(snapshotFixture());
    const semanticConnectionIds = new Set(projection.semanticModel?.connections.map((connection) => connection.connectionId) ?? []);

    expect(projection.sldBaseProjection?.routes.length).toBeGreaterThan(0);
    for (const route of projection.sldBaseProjection?.routes ?? []) {
      expect(semanticConnectionIds.has(route.connectionId)).toBe(true);
      expect(route.pathPoints.length).toBeGreaterThan(0);
    }
  });
});
