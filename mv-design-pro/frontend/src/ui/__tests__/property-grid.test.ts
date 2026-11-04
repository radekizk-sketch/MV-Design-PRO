// @vitest-environment node
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
      // Karta JEDNA-SCIEZKA-EDYCJI: fantomowa sekcja „Stan" szyny skasowana.
      expect(sectionIds[0]).toBe('identification');
      expect(sectionIds[1]).toBe('electrical_params');
    });

    it('should have identification section with ID, name, ref_id fields', () => {
      // Odbiór K7c-FE (2026-09-09, karta KASACJA-DATA-MANAGER — błąd napotkany przy
      // pełnym vitest src/ui, naprawiony u źródła): `uuid` nigdy nie było kluczem w
      // modelu ENM (ma `id` i `ref_id` — identyfikator kanoniczny); ten test
      // sprawdzał klucz-fantom sprzed naprawy field-definitions.ts w 387024dc.
      const idSection = sections.find((s) => s.id === 'identification');
      expect(idSection).toBeDefined();

      const fieldKeys = idSection!.fields.map((f) => f.key);
      expect(fieldKeys).toContain('id');
      expect(fieldKeys).toContain('name');
      expect(fieldKeys).toContain('ref_id');
    });

    it('should mark ID and ref_id as non-editable', () => {
      const idSection = sections.find((s) => s.id === 'identification');
      const idField = idSection!.fields.find((f) => f.key === 'id');
      const refIdField = idSection!.fields.find((f) => f.key === 'ref_id');

      expect(idField!.editable).toBe(false);
      expect(refIdField!.editable).toBe(false);
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

      // Karta JEDNA-SCIEZKA-EDYCJI: klucz modelu ENM `catalog_ref` (dawny `type_ref` nie istniał).
      const typeRefField = typeRefSection!.fields.find((f) => f.key === 'catalog_ref');
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
      // Odbiór K7c-FE (2026-09-09): klucze zgodne z modelem ENM `BranchBase`
      // (były `from_bus_id`/`to_bus_id` — klucze-fantomy naprawione w 387024dc).
      const topoSection = sections.find((s) => s.id === 'topology');
      expect(topoSection).toBeDefined();

      const fieldKeys = topoSection!.fields.map((f) => f.key);
      expect(fieldKeys).toContain('from_bus_ref');
      expect(fieldKeys).toContain('to_bus_ref');
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
      // Klucz modelu ENM `Transformer.sn_mva` (dawny `rated_power_mva` nie istniał w rekordzie).
      expect(fieldKeys).toContain('sn_mva');
      expect(fieldKeys).toContain('uhv_kv');
      expect(fieldKeys).toContain('ulv_kv');
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

    // Karta JEDNA-SCIEZKA-EDYCJI: położenie łącznika = klucz modelu `status` (closed/open),
    // zapis operacją otwarcia/zamknięcia; `in_service` (nieobecny w modelu) skasowany.
    it('should have state section with editable switch position `status`', () => {
      const stateSection = sections.find((s) => s.id === 'state');
      expect(stateSection).toBeDefined();

      const stateField = stateSection!.fields.find((f) => f.key === 'status');
      expect(stateField).toBeDefined();
      expect(stateField!.editable).toBe(true);
      expect(stateField!.type).toBe('enum');
      expect(stateField!.enumOptions).toEqual(['closed', 'open']);
      expect(stateField!.enumLabels).toEqual({ closed: 'zamknięty', open: 'otwarty' });
    });

    it('nie niesie fantomów in_service / lifecycle_state / electrical_params', () => {
      const klucze = sections.flatMap((s) => s.fields.map((f) => f.key));
      expect(klucze).not.toContain('in_service');
      expect(klucze).not.toContain('lifecycle_state');
      expect(sections.find((s) => s.id === 'electrical_params')).toBeUndefined();
    });
  });

  describe('Source Field Definitions', () => {
    const sections = getSourceFieldDefinitions();

    it('should have short_circuit section with editable Sk" and R/X', () => {
      // Karta K7-FE (2026-09-09): klucz zgodny z modelem ENM `Source.sk3_mva`
      // (był `sk_mva` — klucz-fantom naprawiony w 387024dc).
      const scSection = sections.find((s) => s.id === 'short_circuit');
      expect(scSection).toBeDefined();

      const skField = scSection!.fields.find((f) => f.key === 'sk3_mva');
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

    it('should have electrical_params section with editable P, Q and read-only model', () => {
      const paramsSection = sections.find((s) => s.id === 'electrical_params');
      expect(paramsSection).toBeDefined();

      const pField = paramsSection!.fields.find((f) => f.key === 'p_mw');
      expect(pField).toBeDefined();
      expect(pField!.editable).toBe(true);
      expect(pField!.type).toBe('number');
      expect(pField!.unit).toBe('MW');

      // Karta JEDNA-SCIEZKA-EDYCJI: model odbioru = klucz `model` (pq/zip), wyprowadzany przez
      // backend ze współczynników ZIP — odczyt (dawny `load_type` backend odrzucał).
      expect(paramsSection!.fields.find((f) => f.key === 'load_type')).toBeUndefined();
      const modelField = paramsSection!.fields.find((f) => f.key === 'model');
      expect(modelField).toBeDefined();
      expect(modelField!.type).toBe('enum');
      expect(modelField!.editable).toBe(false);
      expect(modelField!.enumOptions).toEqual(['pq', 'zip']);
    });

    it('should have topology section with read-only bus_ref', () => {
      // Odbiór K7c-FE (2026-09-09): klucz zgodny z modelem ENM `Load.bus_ref`
      // (był `bus_id` — klucz-fantom naprawiony w 387024dc).
      const topologySection = sections.find((s) => s.id === 'topology');
      const busField = topologySection!.fields.find((f) => f.key === 'bus_ref');

      expect(busField).toBeDefined();
      // Karta JEDNA-SCIEZKA-EDYCJI: przepięcie odbioru to operacja topologiczna.
      expect(busField!.editable).toBe(false);
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

      const currentField = typeParamsSection!.fields.find((f) => f.key === 'rating.in_a');
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
