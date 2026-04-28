import { describe, expect, it } from 'vitest';

import { buildEngineeringDiagnosticsProjection } from '../diagnostics';
import { projectEnmToEngineeringSemanticModel } from '../enmAdapter';

function enmFixture(overrides: Record<string, unknown> = {}) {
  return {
    header: {
      hash_sha256: 'enm-semantic-1',
      created_at: '2026-04-28T10:00:00Z',
    },
    buses: [
      {
        ref_id: 'bus-gpz-sn',
        name: 'SZ-1 15 kV',
        voltage_kv: 15,
        grounding: { type: 'petersen_coil', data_quality: 'complete' },
      },
      { ref_id: 'bus-st-sn', name: 'Stacja 1 SN', voltage_kv: 15 },
    ],
    sources: [
      {
        ref_id: 'source-gpz',
        name: 'GPZ uproszczony',
        bus_ref: 'bus-gpz-sn',
        substation_ref: 'gpz-1',
        sk3_mva: 250,
        x_ohm: 0.55,
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
        catalog_namespace: 'mv-cables',
        materialized_params: {
          r_ohm_per_km: 0.125,
          x_ohm_per_km: 0.105,
        },
      },
    ],
    transformers: [],
    loads: [],
    generators: [],
    measurements: [],
    protection_assignments: [],
    substations: [
      {
        ref_id: 'gpz-1',
        name: 'GPZ Zachod',
        station_type: 'gpz',
        bus_refs: ['bus-gpz-sn'],
        transformer_refs: [],
      },
      {
        ref_id: 'st-1',
        name: 'Stacja 1',
        station_type: 'terminal',
        bus_refs: ['bus-st-sn'],
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
        protection_ref: 'eaz-l1',
      },
    ],
    junctions: [],
    corridors: [],
    branch_points: [],
    logical_views: { trunks: [], branches: [], rings: [] },
    ...overrides,
  } as any;
}

describe('ENM -> EngineeringSemanticModel adapter', () => {
  it('projects GPZ, busbar, bay and segment as semantic elements with validated connections', () => {
    const model = projectEnmToEngineeringSemanticModel(enmFixture(), {
      projectRefId: 'project-1',
      generatedAt: '2026-04-28T10:00:00Z',
    });

    const gpz = model.elements.find((element) => element.refId === 'gpz-1') as any;
    const bay = model.elements.find((element) => element.refId === 'bay-l1') as any;
    const segment = model.elements.find((element) => element.refId === 'seg-1') as any;

    expect(model.semanticHash).toMatch(/^sem-/);
    expect(model.physicalTopologyGraph.elementRefs).toContain('seg-1');
    expect(model.earthingContexts[0]?.earthingMode).toBe('CEWKA_PETERSENA');
    expect(gpz?.elementKind).toBe('GPZ');
    expect(gpz?.structure.modelKind).toBe('UPROSZCZONY_PARAMETRY_NA_SZYNIE_SN');
    expect(gpz?.structure.supplyShortCircuitModelRefId).toBe('source-gpz');
    expect(bay?.engineeringRole).toBe('LINE_FEEDER_BAY');
    expect(bay?.outgoingPortRefId).toBe('bay-l1:out');
    expect(segment?.elementKind).toBe('MV_CABLE_SEGMENT');
    expect(segment?.fromPortRefId).toBe('seg-1:in');
    expect(model.connections.length).toBeGreaterThanOrEqual(3);
    expect(model.connections.every((connection) => connection.validatedByRuleRefs.length > 0)).toBe(true);
  });

  it('keeps semanticHash stable across generatedAt changes', () => {
    const first = projectEnmToEngineeringSemanticModel(enmFixture(), { generatedAt: '2026-04-28T10:00:00Z' });
    const second = projectEnmToEngineeringSemanticModel(enmFixture(), { generatedAt: '2026-04-28T12:00:00Z' });

    expect(second.generatedAt).not.toBe(first.generatedAt);
    expect(second.semanticHash).toBe(first.semanticHash);
  });

  it('changes semanticHash only when used catalog materialization changes', () => {
    const first = projectEnmToEngineeringSemanticModel(enmFixture());
    const second = projectEnmToEngineeringSemanticModel(enmFixture({
      branches: [
        {
          ...enmFixture().branches[0],
          materialized_params: {
            r_ohm_per_km: 0.13,
            x_ohm_per_km: 0.105,
          },
        },
      ],
    }));

    expect(second.usedCatalogMaterializationHash).not.toBe(first.usedCatalogMaterializationHash);
    expect(second.semanticHash).not.toBe(first.semanticHash);
  });

  it('builds diagnostics as a separate projection tied to semanticHash', () => {
    const model = projectEnmToEngineeringSemanticModel(enmFixture());
    const diagnostics = buildEngineeringDiagnosticsProjection(model, {
      generatedAt: '2026-04-28T11:00:00Z',
    });

    expect(diagnostics.semanticHash).toBe(model.semanticHash);
    expect(diagnostics.diagnosticsHash).toMatch(/^diag-/);
    expect('violations' in model).toBe(false);
  });
});
