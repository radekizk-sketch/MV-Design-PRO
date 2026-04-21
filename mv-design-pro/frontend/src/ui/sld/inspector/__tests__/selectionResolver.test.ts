/**
 * Selection Resolver — testy.
 *
 * INVARIANTS:
 * - resolveSelectionRef: ten sam elementId + ENM → identyczny SelectionRef
 * - mapowanie SLD → ENM → kategoria budowy jest poprawna
 * - właściwości ENM są zbudowane poprawnie
 */

import { describe, it, expect } from 'vitest';
import { resolveSelectionRef } from '../selectionResolver';
import type { EnergyNetworkModel } from '../../../../types/enm';

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

function makeMinimalEnm(): EnergyNetworkModel {
  return {
    header: {
      enm_version: '1.0',
      name: 'Test',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
      revision: 1,
      hash_sha256: '',
      defaults: { frequency_hz: 50, unit_system: 'SI' },
    },
    buses: [
      {
        id: 'bus-id-1',
        ref_id: 'bus_gpz_110',
        name: 'Szyna 110 kV',
        tags: ['source'],
        meta: {},
        voltage_kv: 110,
        phase_system: '3ph',
      },
      {
        id: 'bus-id-2',
        ref_id: 'bus_gpz_15',
        name: 'Szyna 15 kV',
        tags: [],
        meta: {},
        voltage_kv: 15,
        phase_system: '3ph',
      },
    ],
    branches: [
      {
        id: 'branch-id-1',
        ref_id: 'cab_01',
        name: 'Kabel 01',
        tags: [],
        meta: {},
        type: 'cable',
        from_bus_ref: 'bus_gpz_15',
        to_bus_ref: 'bus_gpz_110',
        status: 'closed',
        length_km: 1.5,
        r_ohm_per_km: 0.2,
        x_ohm_per_km: 0.07,
      },
    ],
    transformers: [
      {
        id: 'trafo-id-1',
        ref_id: 'tr_gpz_t1',
        name: 'TR1 GPZ',
        tags: [],
        meta: {},
        hv_bus_ref: 'bus_gpz_110',
        lv_bus_ref: 'bus_gpz_15',
        sn_mva: 25,
        uhv_kv: 110,
        ulv_kv: 15,
        uk_percent: 10.5,
        pk_kw: 120,
        vector_group: 'Dyn11',
      },
    ],
    sources: [
      {
        id: 'src-id-1',
        ref_id: 'src_grid',
        name: 'Sieć 110 kV',
        tags: [],
        meta: {},
        bus_ref: 'bus_gpz_110',
        model: 'short_circuit_power',
        sk3_mva: 3000,
      },
    ],
    loads: [
      {
        id: 'load-id-1',
        ref_id: 'load_01',
        name: 'Odbiór 01',
        tags: [],
        meta: {},
        bus_ref: 'bus_gpz_15',
        p_mw: 0.5,
        q_mvar: 0.15,
        model: 'pq',
      },
    ],
    generators: [],
    substations: [],
    bays: [],
    junctions: [],
    corridors: [],
  };
}

// ---------------------------------------------------------------------------
// Testy
// ---------------------------------------------------------------------------

describe('resolveSelectionRef', () => {
  const enm = makeMinimalEnm();

  describe('Bus resolution', () => {
    it('resolves source bus — kategoria trunk', () => {
      const result = resolveSelectionRef('bus_gpz_110', 'Bus', enm);
      expect(result).not.toBeNull();
      expect(result!.selectionRef.elementId).toBe('bus_gpz_110');
      expect(result!.selectionRef.element_type).toBe('bus');
      expect(result!.buildCategoryHint).toBe('trunk');
    });

    it('resolves non-source bus — kategoria trunk', () => {
      const result = resolveSelectionRef('bus_gpz_15', 'Bus', enm);
      expect(result).not.toBeNull();
      expect(result!.selectionRef.elementId).toBe('bus_gpz_15');
      expect(result!.buildCategoryHint).toBe('trunk');
    });

    it('returns null for unknown bus', () => {
      const result = resolveSelectionRef('bus_nonexistent', 'Bus', enm);
      expect(result).toBeNull();
    });
  });

  describe('Branch resolution', () => {
    it('resolves cable — kategoria trunk', () => {
      const result = resolveSelectionRef('cab_01', 'LineBranch', enm);
      expect(result).not.toBeNull();
      expect(result!.selectionRef.element_type).toBe('branch');
      expect(result!.buildCategoryHint).toBe('trunk');
    });
  });

  describe('Transformer resolution', () => {
    it('resolves transformer — kategoria transformer', () => {
      const result = resolveSelectionRef('tr_gpz_t1', 'TransformerBranch', enm);
      expect(result).not.toBeNull();
      expect(result!.selectionRef.element_type).toBe('transformer');
      expect(result!.buildCategoryHint).toBe('transformer');
    });
  });

  describe('Source resolution', () => {
    it('resolves source — kategoria source', () => {
      const result = resolveSelectionRef('src_grid', 'Source', enm);
      expect(result).not.toBeNull();
      expect(result!.selectionRef.element_type).toBe('source');
      expect(result!.buildCategoryHint).toBe('source');
    });
  });

  describe('Load resolution', () => {
    it('resolves load — kategoria load', () => {
      const result = resolveSelectionRef('load_01', 'Load', enm);
      expect(result).not.toBeNull();
      expect(result!.selectionRef.element_type).toBe('load');
      expect(result!.buildCategoryHint).toBe('load');
    });
  });

  describe('ENM properties', () => {
    it('builds bus properties with voltage', () => {
      const result = resolveSelectionRef('bus_gpz_110', 'Bus', enm);
      expect(result).not.toBeNull();
      expect(result!.enmProperties.length).toBeGreaterThan(0);

      const busSection = result!.enmProperties.find((s) => s.id === 'enm_bus');
      expect(busSection).toBeDefined();

      const voltageField = busSection!.fields.find((f) => f.key === 'voltage_kv');
      expect(voltageField).toBeDefined();
      expect(voltageField!.value).toBe(110);
      expect(voltageField!.unit).toBe('kV');
    });

    it('builds transformer properties with uk%', () => {
      const result = resolveSelectionRef('tr_gpz_t1', 'TransformerBranch', enm);
      expect(result).not.toBeNull();

      const trafoSection = result!.enmProperties.find((s) => s.id === 'enm_transformer');
      expect(trafoSection).toBeDefined();

      const ukField = trafoSection!.fields.find((f) => f.key === 'uk_percent');
      expect(ukField).toBeDefined();
      expect(ukField!.value).toBe(10.5);
    });

    it('builds source properties with Sk3', () => {
      const result = resolveSelectionRef('src_grid', 'Source', enm);
      const srcSection = result!.enmProperties.find((s) => s.id === 'enm_source');
      expect(srcSection).toBeDefined();

      const sk3Field = srcSection!.fields.find((f) => f.key === 'sk3_mva');
      expect(sk3Field).toBeDefined();
      expect(sk3Field!.value).toBe(3000);
    });
  });

  describe('ENM name resolution', () => {
    it('finds element name from ENM', () => {
      const result = resolveSelectionRef('bus_gpz_110', 'Bus', enm);
      expect(result!.enmName).toBe('Szyna 110 kV');
    });

    it('finds transformer name', () => {
      const result = resolveSelectionRef('tr_gpz_t1', 'TransformerBranch', enm);
      expect(result!.enmName).toBe('TR1 GPZ');
    });
  });


  describe('Ochrona przed selekcją BoundaryNode', () => {
    it('zwraca null dla elementu BoundaryNode', () => {
      const result = resolveSelectionRef('bus_connection_node', 'Bus', enm);
      expect(result).toBeNull();
    });

    it('dla źródła z selekcją BoundaryNode wykonuje fallback do źródła sieci', () => {
      const result = resolveSelectionRef('connection_source', 'Source', enm);
      expect(result).not.toBeNull();
      expect(result!.selectionRef.element_type).toBe('source');
      expect(result!.selectionRef.elementId).toBe('src_grid');
    });
  });

  describe('Determinism', () => {
    it('same input produces identical output', () => {
      const r1 = resolveSelectionRef('bus_gpz_110', 'Bus', enm);
      const r2 = resolveSelectionRef('bus_gpz_110', 'Bus', enm);
      expect(r1).toEqual(r2);
    });

    it('all element types produce consistent results', () => {
      const busResult = resolveSelectionRef('bus_gpz_110', 'Bus', enm);
      const srcResult = resolveSelectionRef('src_grid', 'Source', enm);
      const branchResult = resolveSelectionRef('cab_01', 'LineBranch', enm);
      const trafoResult = resolveSelectionRef('tr_gpz_t1', 'TransformerBranch', enm);
      const loadResult = resolveSelectionRef('load_01', 'Load', enm);

      // All should resolve
      expect(busResult).not.toBeNull();
      expect(srcResult).not.toBeNull();
      expect(branchResult).not.toBeNull();
      expect(trafoResult).not.toBeNull();
      expect(loadResult).not.toBeNull();

      // All should have canonical wizard step ids
      expect(busResult!.selectionRef.wizard_step_id).toBeTruthy();
      expect(srcResult!.selectionRef.wizard_step_id).toBeTruthy();
      expect(branchResult!.selectionRef.wizard_step_id).toBeTruthy();
      expect(trafoResult!.selectionRef.wizard_step_id).toBeTruthy();
      expect(loadResult!.selectionRef.wizard_step_id).toBeTruthy();
    });
  });
});
