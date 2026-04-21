/**
 * Property Grid Validation Tests — P12b
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md § D.4: Inline validation
 * - AGENTS.md: Frontend = NOT-A-SOLVER (syntactic validation only)
 *
 * Tests client-side syntactic validation rules.
 */

import { describe, it, expect } from 'vitest';
import { validateField, validateElement } from '../property-grid/validation';
import type { PropertyField } from '../types';

describe('Property Grid Validation', () => {
  describe('validateField', () => {
    it('should validate required string fields', () => {
      const field: PropertyField = {
        key: 'name',
        label: 'Nazwa',
        value: '',
        type: 'string',
        editable: true,
        source: 'instance',
      };

      const result = validateField('Bus', field, '');
      expect(result.valid).toBe(false);
      expect(result.code).toBe('E-REQ-01');
    });

    it('should pass valid string fields', () => {
      const field: PropertyField = {
        key: 'name',
        label: 'Nazwa',
        value: 'Bus1',
        type: 'string',
        editable: true,
        source: 'instance',
      };

      const result = validateField('Bus', field, 'Bus1');
      expect(result.valid).toBe(true);
    });

    it('should validate positive number fields', () => {
      const field: PropertyField = {
        key: 'voltage_kv',
        label: 'Napięcie',
        value: -5,
        type: 'number',
        unit: 'kV',
        editable: true,
        source: 'instance',
      };

      const result = validateField('Bus', field, -5);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('E-RANGE-01');
    });

    it('should pass valid positive number fields', () => {
      const field: PropertyField = {
        key: 'voltage_kv',
        label: 'Napięcie',
        value: 15,
        type: 'number',
        unit: 'kV',
        editable: true,
        source: 'instance',
      };

      const result = validateField('Bus', field, 15);
      expect(result.valid).toBe(true);
    });

    it('should validate maximum value', () => {
      const field: PropertyField = {
        key: 'voltage_kv',
        label: 'Napięcie',
        value: 1000,
        type: 'number',
        unit: 'kV',
        editable: true,
        source: 'instance',
      };

      const result = validateField('Bus', field, 1000);
      expect(result.valid).toBe(false);
      expect(result.severity).toBe('WARNING');
    });

    it('should validate required reference fields', () => {
      const field: PropertyField = {
        key: 'from_bus_id',
        label: 'Szyna początkowa',
        value: '',
        type: 'ref',
        refType: 'Bus',
        editable: true,
        source: 'instance',
      };

      const result = validateField('LineBranch', field, '');
      expect(result.valid).toBe(false);
      expect(result.code).toBe('E-REF-01');
    });

    it('should validate tap_position as integer', () => {
      const field: PropertyField = {
        key: 'tap_position',
        label: 'Zaczep',
        value: 1.5,
        type: 'number',
        editable: true,
        source: 'instance',
      };

      const result = validateField('TransformerBranch', field, 1.5);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('E-TYPE-02');
    });

    it('should validate tap_position range', () => {
      const field: PropertyField = {
        key: 'tap_position',
        label: 'Zaczep',
        value: 25,
        type: 'number',
        editable: true,
        source: 'instance',
      };

      const result = validateField('TransformerBranch', field, 25);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('E-RANGE-03');
    });

    it('should validate cos_phi range', () => {
      const field: PropertyField = {
        key: 'cos_phi',
        label: 'cos φ',
        value: 1.5,
        type: 'number',
        editable: true,
        source: 'instance',
      };

      const result = validateField('Load', field, 1.5);
      expect(result.valid).toBe(false);
    });

    it('should allow null for optional number fields', () => {
      const field: PropertyField = {
        key: 'rated_current_a',
        label: 'Prąd znamionowy',
        value: null,
        type: 'number',
        unit: 'A',
        editable: true,
        source: 'instance',
      };

      // rated_current_a is not required, only validated if present
      const result = validateField('Bus', field, null);
      expect(result.valid).toBe(true);
    });
  });

  describe('validateElement', () => {
    it('should validate all editable instance fields', () => {
      const fields: PropertyField[] = [
        {
          key: 'id',
          label: 'ID',
          value: 'bus-1',
          type: 'string',
          editable: false,
          source: 'instance',
        },
        {
          key: 'name',
          label: 'Nazwa',
          value: '',
          type: 'string',
          editable: true,
          source: 'instance',
        },
        {
          key: 'voltage_kv',
          label: 'Napięcie',
          value: -5,
          type: 'number',
          unit: 'kV',
          editable: true,
          source: 'instance',
        },
      ];

      const messages = validateElement('Bus', fields);

      // Should have 2 errors: empty name and negative voltage
      expect(messages.length).toBe(2);
      expect(messages.some((m) => m.field === 'name')).toBe(true);
      expect(messages.some((m) => m.field === 'voltage_kv')).toBe(true);
    });

    it('should skip non-editable fields', () => {
      const fields: PropertyField[] = [
        {
          key: 'id',
          label: 'ID',
          value: '', // Would fail required if validated
          type: 'string',
          editable: false, // But not editable
          source: 'instance',
        },
      ];

      const messages = validateElement('Bus', fields);
      expect(messages.length).toBe(0);
    });

    it('should skip calculated fields', () => {
      const fields: PropertyField[] = [
        {
          key: 'ikss_ka',
          label: 'Ik"',
          value: null,
          type: 'number',
          unit: 'kA',
          editable: false,
          source: 'calculated',
        },
      ];

      const messages = validateElement('Bus', fields);
      expect(messages.length).toBe(0);
    });

    it('should skip type fields', () => {
      const fields: PropertyField[] = [
        {
          key: 'r_ohm_per_km',
          label: "R'",
          value: 0, // Would fail positive if validated
          type: 'number',
          unit: 'Ω/km',
          editable: false,
          source: 'type',
        },
      ];

      const messages = validateElement('LineBranch', fields);
      expect(messages.length).toBe(0);
    });
  });

  describe('Error codes', () => {
    it('should use E-* prefix for errors', () => {
      const field: PropertyField = {
        key: 'name',
        label: 'Nazwa',
        value: '',
        type: 'string',
        editable: true,
        source: 'instance',
      };

      const result = validateField('Bus', field, '');
      expect(result.code).toMatch(/^E-/);
    });

    it('should use W-* prefix for warnings', () => {
      const field: PropertyField = {
        key: 'voltage_kv',
        label: 'Napięcie',
        value: 600,
        type: 'number',
        unit: 'kV',
        editable: true,
        source: 'instance',
      };

      const result = validateField('Bus', field, 600);
      expect(result.code).toMatch(/^W-/);
      expect(result.severity).toBe('WARNING');
    });
  });

  describe('Polish messages', () => {
    it('should return Polish error messages', () => {
      const field: PropertyField = {
        key: 'name',
        label: 'Nazwa',
        value: '',
        type: 'string',
        editable: true,
        source: 'instance',
      };

      const result = validateField('Bus', field, '');
      expect(result.message).toBe('Pole wymagane');
    });

    it('should return Polish range messages', () => {
      const field: PropertyField = {
        key: 'voltage_kv',
        label: 'Napięcie',
        value: -5,
        type: 'number',
        unit: 'kV',
        editable: true,
        source: 'instance',
      };

      const result = validateField('Bus', field, -5);
      expect(result.message).toBe('Wartość musi być większa od 0');
    });
  });
});
