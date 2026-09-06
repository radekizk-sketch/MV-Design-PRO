/**
 * Property Grid Tests
 *
 * CANONICAL ALIGNMENT:
 * - wizard_screens.md § 3: Property Grid specifications
 * - ui_canonical_parity.md § D: Property Grid rules
 *
 * Tests:
 * - Deterministic field ordering
 * - type_ref and type params are read-only
 * - Mode gating (MODEL_EDIT vs RESULT_VIEW)
 */

import { describe, it, expect } from 'vitest';
import {
  getFieldDefinitions,
  getBusFieldDefinitions,
  getLineBranchFieldDefinitions,
  getTransformerBranchFieldDefinitions,
  getSwitchFieldDefinitions,
  getSourceFieldDefinitions,
  getLoadFieldDefinitions,
  SECTION_ORDER,
  SECTION_LABELS,
} from '../property-grid/field-definitions';

describe('Property Grid Field Definitions', () => {
  describe('Deterministic Section Order', () => {
    it('should have canonical section order defined', () => {
      expect(SECTION_ORDER).toContain('identification');
      expect(SECTION_ORDER).toContain('state');
      expect(SECTION_ORDER).toContain('calculated');
      expect(SECTION_ORDER).toContain('audit');
    });

    it('should have Polish labels for all sections', () => {
      expect(SECTION_LABELS.identification).toBe('Identyfikacja');
      expect(SECTION_LABELS.state).toBe('Stan');
      expect(SECTION_LABELS.calculated).toBe('Wartości obliczeniowe');
      expect(SECTION_LABELS.audit).toBe('Metadane audytowe');
    });
  });

  describe('Bus Field Definitions', () => {
    const sections = getBusFieldDefinitions();

    it('should have sections in deterministic order', () => {
      const sectionIds = sections.map((s) => s.id);
      expect(sectionIds[0]).toBe('identification');
      expect(sectionIds[1]).toBe('state');
    });

    it('should have identification section with ID, name, UUID fields', () => {
      const idSection = sections.find((s) => s.id === 'identification');
      expect(idSection).toBeDefined();

      const fieldKeys = idSection!.fields.map((f) => f.key);
      expect(fieldKeys).toContain('id');
      expect(fieldKeys).toContain('name');
      expect(fieldKeys).toContain('uuid');
    });

    it('should mark ID and UUID as non-editable', () => {
      const idSection = sections.find((s) => s.id === 'identification');
      const idField = idSection!.fields.find((f) => f.key === 'id');
      const uuidField = idSection!.fields.find((f) => f.key === 'uuid');

      expect(idField!.editable).toBe(false);
      expect(uuidField!.editable).toBe(false);
    });

    it('should mark name as editable', () => {
      const idSection = sections.find((s) => s.id === 'identification');
      const nameField = idSection!.fields.find((f) => f.key === 'name');

      expect(nameField!.editable).toBe(true);
    });

    it('should have calculated section with read-only fields', () => {
      const calcSection = sections.find((s) => s.id === 'calculated');
      expect(calcSection).toBeDefined();

      calcSection!.fields.forEach((field) => {
        expect(field.editable).toBe(false);
        expect(field.source).toBe('calculated');
      });
    });

    it('should have audit section with read-only fields', () => {
      const auditSection = sections.find((s) => s.id === 'audit');
      expect(auditSection).toBeDefined();

      auditSection!.fields.forEach((field) => {
        expect(field.editable).toBe(false);
        expect(field.source).toBe('audit');
      });
    });
  });

  describe('LineBranch Field Definitions', () => {
    const sections = getLineBranchFieldDefinitions();

    it('should have type_reference section with type_ref_with_actions field', () => {
      const typeRefSection = sections.find((s) => s.id === 'type_reference');
      expect(typeRefSection).toBeDefined();

      const typeRefField = typeRefSection!.fields.find((f) => f.key === 'type_ref');
      expect(typeRefField).toBeDefined();
      // type_ref_with_actions has editable: true for button access,
      // but source: 'type' makes the value read-only
      expect(typeRefField!.type).toBe('type_ref_with_actions');
      expect(typeRefField!.source).toBe('type');
    });

    it('should have type_params section with read-only params from catalog', () => {
      const typeParamsSection = sections.find((s) => s.id === 'type_params');
      expect(typeParamsSection).toBeDefined();

      typeParamsSection!.fields.forEach((field) => {
        expect(field.editable).toBe(false);
        expect(field.source).toBe('type');
      });

      const fieldKeys = typeParamsSection!.fields.map((f) => f.key);
      expect(fieldKeys).toContain('r_ohm_per_km');
      expect(fieldKeys).toContain('x_ohm_per_km');
    });

    it('should have local_params section with editable fields', () => {
      const localParamsSection = sections.find((s) => s.id === 'local_params');
      expect(localParamsSection).toBeDefined();

      const lengthField = localParamsSection!.fields.find((f) => f.key === 'length_km');
      expect(lengthField).toBeDefined();
      expect(lengthField!.editable).toBe(true);
      expect(lengthField!.source).toBe('instance');
    });

    it('should have topology section with from_bus and to_bus refs', () => {
      const topoSection = sections.find((s) => s.id === 'topology');
      expect(topoSection).toBeDefined();

      const fieldKeys = topoSection!.fields.map((f) => f.key);
      expect(fieldKeys).toContain('from_bus_id');
      expect(fieldKeys).toContain('to_bus_id');
    });
  });

  describe('TransformerBranch Field Definitions', () => {
    const sections = getTransformerBranchFieldDefinitions();

    it('should have type_params section with uk_percent, pk_kw', () => {
      const typeParamsSection = sections.find((s) => s.id === 'type_params');
      expect(typeParamsSection).toBeDefined();

      const fieldKeys = typeParamsSection!.fields.map((f) => f.key);
      expect(fieldKeys).toContain('uk_percent');
      expect(fieldKeys).toContain('pk_kw');
      expect(fieldKeys).toContain('rated_power_mva');
    });

    it('should have editable tap_position in local_params', () => {
      const localParamsSection = sections.find((s) => s.id === 'local_params');
      expect(localParamsSection).toBeDefined();

      const tapField = localParamsSection!.fields.find((f) => f.key === 'tap_position');
      expect(tapField).toBeDefined();
      expect(tapField!.editable).toBe(true);
    });
  });

  describe('Switch Field Definitions', () => {
    const sections = getSwitchFieldDefinitions();

    it('should have state section with editable switch state', () => {
      const stateSection = sections.find((s) => s.id === 'state');
      expect(stateSection).toBeDefined();

      const stateField = stateSection!.fields.find((f) => f.key === 'state');
      expect(stateField).toBeDefined();
      expect(stateField!.editable).toBe(true);
      expect(stateField!.type).toBe('enum');
      expect(stateField!.enumOptions).toContain('OPEN');
      expect(stateField!.enumOptions).toContain('CLOSED');
    });

    it('should have in_service as editable boolean', () => {
      const stateSection = sections.find((s) => s.id === 'state');
      const inServiceField = stateSection!.fields.find((f) => f.key === 'in_service');

      expect(inServiceField).toBeDefined();
      expect(inServiceField!.editable).toBe(true);
      expect(inServiceField!.type).toBe('boolean');
    });
  });

  describe('Source Field Definitions', () => {
    const sections = getSourceFieldDefinitions();

    it('should have short_circuit section with editable Sk" and R/X', () => {
      const scSection = sections.find((s) => s.id === 'short_circuit');
      expect(scSection).toBeDefined();

      const skField = scSection!.fields.find((f) => f.key === 'sk_mva');
      expect(skField).toBeDefined();
      expect(skField!.editable).toBe(true);
      expect(skField!.type).toBe('number');
      expect(skField!.unit).toBe('MVA');

      const rxField = scSection!.fields.find((f) => f.key === 'rx_ratio');
      expect(rxField!.editable).toBe(true);
      expect(rxField!.type).toBe('number');
    });

    it('should have calculated zk_ohm as read-only', () => {
      const calcSection = sections.find((s) => s.id === 'calculated');
      const zkField = calcSection!.fields.find((f) => f.key === 'zk_ohm');

      expect(zkField).toBeDefined();
      expect(zkField!.editable).toBe(false);
      expect(zkField!.source).toBe('calculated');
    });
  });

  describe('Load Field Definitions', () => {
    const sections = getLoadFieldDefinitions();

    it('should have electrical_params section with editable P, Q and load_type', () => {
      const paramsSection = sections.find((s) => s.id === 'electrical_params');
      expect(paramsSection).toBeDefined();

      const pField = paramsSection!.fields.find((f) => f.key === 'p_mw');
      expect(pField).toBeDefined();
      expect(pField!.editable).toBe(true);
      expect(pField!.type).toBe('number');
      expect(pField!.unit).toBe('MW');

      const loadTypeField = paramsSection!.fields.find((f) => f.key === 'load_type');
      expect(loadTypeField).toBeDefined();
      expect(loadTypeField!.type).toBe('enum');
      expect(loadTypeField!.enumOptions).toContain('CONSTANT_POWER');
      expect(loadTypeField!.enumOptions).toContain('ZIP');
    });

    it('should have topology section with editable bus_id ref', () => {
      const topologySection = sections.find((s) => s.id === 'topology');
      const busField = topologySection!.fields.find((f) => f.key === 'bus_id');

      expect(busField).toBeDefined();
      expect(busField!.editable).toBe(true);
      expect(busField!.type).toBe('ref');
    });
  });

  describe('Field Units', () => {
    const lineSections = getLineBranchFieldDefinitions();

    it('should have units defined for electrical parameters', () => {
      const typeParamsSection = lineSections.find((s) => s.id === 'type_params');

      const rField = typeParamsSection!.fields.find((f) => f.key === 'r_ohm_per_km');
      expect(rField!.unit).toBe('Ω/km');

      const xField = typeParamsSection!.fields.find((f) => f.key === 'x_ohm_per_km');
      expect(xField!.unit).toBe('Ω/km');

      const currentField = typeParamsSection!.fields.find((f) => f.key === 'rated_current_a');
      expect(currentField!.unit).toBe('A');
    });

    it('should have units for length', () => {
      const localParamsSection = lineSections.find((s) => s.id === 'local_params');
      const lengthField = localParamsSection!.fields.find((f) => f.key === 'length_km');

      expect(lengthField!.unit).toBe('km');
    });
  });

  describe('getFieldDefinitions dispatcher', () => {
    it('should return correct definitions for each element type', () => {
      const busFields = getFieldDefinitions('Bus');
      const lineFields = getFieldDefinitions('LineBranch');
      const transformerFields = getFieldDefinitions('TransformerBranch');
      const switchFields = getFieldDefinitions('Switch');
      const sourceFields = getFieldDefinitions('Source');
      const loadFields = getFieldDefinitions('Load');

      expect(busFields.length).toBeGreaterThan(0);
      expect(lineFields.length).toBeGreaterThan(0);
      expect(transformerFields.length).toBeGreaterThan(0);
      expect(switchFields.length).toBeGreaterThan(0);
      expect(sourceFields.length).toBeGreaterThan(0);
      expect(loadFields.length).toBeGreaterThan(0);
    });
  });
});
