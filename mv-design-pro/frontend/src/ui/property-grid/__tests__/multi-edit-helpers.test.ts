// @vitest-environment node
/**
 * P30c: Multi-Edit Helpers Tests
 *
 * Test multi-edit logic:
 * - Common fields detection
 * - Value merging (uniform vs mixed)
 * - Deterministic ordering
 */

import { describe, it, expect } from 'vitest';
import {
  getCommonFields,
  mergeFieldValues,
  formatMultiEditValue,
  isMultiEditFieldEditable,
  getMultiEditPlaceholder,
  type ElementData,
} from '../multi-edit-helpers';

describe('multi-edit-helpers', () => {
  describe('mergeFieldValues', () => {
    it('returns uniform value when all values are same', () => {
      const result = mergeFieldValues('voltage_kv', [10, 10, 10]);
      expect(result).toEqual({ kind: 'uniform', value: 10 });
    });

    it('returns mixed when values differ', () => {
      const result = mergeFieldValues('voltage_kv', [10, 15, 20]);
      expect(result).toEqual({ kind: 'mixed' });
    });

    it('handles null values uniformly', () => {
      const result = mergeFieldValues('name', [null, null, null]);
      expect(result).toEqual({ kind: 'uniform', value: null });
    });

    it('detects mixed when some values are null', () => {
      const result = mergeFieldValues('name', ['Bus1', null, 'Bus2']);
      expect(result).toEqual({ kind: 'mixed' });
    });

    it('handles empty array', () => {
      const result = mergeFieldValues('name', []);
      expect(result).toEqual({ kind: 'uniform', value: null });
    });

    it('handles single value', () => {
      const result = mergeFieldValues('name', ['Bus1']);
      expect(result).toEqual({ kind: 'uniform', value: 'Bus1' });
    });

    it('handles boolean values', () => {
      const uniform = mergeFieldValues('in_service', [true, true, true]);
      expect(uniform).toEqual({ kind: 'uniform', value: true });

      const mixed = mergeFieldValues('in_service', [true, false, true]);
      expect(mixed).toEqual({ kind: 'mixed' });
    });

    it('handles string values', () => {
      const uniform = mergeFieldValues('name', ['Bus1', 'Bus1', 'Bus1']);
      expect(uniform).toEqual({ kind: 'uniform', value: 'Bus1' });

      const mixed = mergeFieldValues('name', ['Bus1', 'Bus2', 'Bus3']);
      expect(mixed).toEqual({ kind: 'mixed' });
    });
  });

  describe('formatMultiEditValue', () => {
    it('formats uniform values correctly', () => {
      expect(formatMultiEditValue({ kind: 'uniform', value: 10.5 })).toBe('10,5');
      // toLocaleString('pl-PL') output for 1000 depends on ICU locale data availability
      const formatted1000 = formatMultiEditValue({ kind: 'uniform', value: 1000 });
      expect(formatted1000 === '1\u00a0000' || formatted1000 === '1000').toBe(true);
      expect(formatMultiEditValue({ kind: 'uniform', value: true })).toBe('Tak');
      expect(formatMultiEditValue({ kind: 'uniform', value: false })).toBe('Nie');
      expect(formatMultiEditValue({ kind: 'uniform', value: 'Bus1' })).toBe('Bus1');
      expect(formatMultiEditValue({ kind: 'uniform', value: null })).toBe('—');
    });

    it('formats mixed values with placeholder', () => {
      expect(formatMultiEditValue({ kind: 'mixed' })).toBe('— (różne)');
    });
  });

  describe('isMultiEditFieldEditable', () => {
    it('returns true for editable instance fields', () => {
      const field = {
        key: 'voltage_kv',
        label: 'Napięcie znamionowe',
        value: 10,
        editable: true,
        source: 'instance' as const,
        type: 'number' as const,
      };

      const uniform = { kind: 'uniform' as const, value: 10 };
      expect(isMultiEditFieldEditable(field, uniform)).toBe(true);

      const mixed = { kind: 'mixed' as const };
      expect(isMultiEditFieldEditable(field, mixed)).toBe(true);
    });

    it('returns false for non-editable fields', () => {
      const field = {
        key: 'id',
        label: 'ID',
        value: 'bus-1',
        editable: false,
        type: 'string' as const,
      };

      const uniform = { kind: 'uniform' as const, value: 'bus-1' };
      expect(isMultiEditFieldEditable(field, uniform)).toBe(false);
    });

    it('returns false for type/calculated/audit fields', () => {
      const typeField = {
        key: 'r_ohm_per_km',
        label: 'Rezystancja',
        value: 0.5,
        editable: true,
        source: 'type' as const,
        type: 'number' as const,
      };

      expect(isMultiEditFieldEditable(typeField, { kind: 'uniform', value: 0.5 })).toBe(false);

      const calculatedField = {
        ...typeField,
        source: 'calculated' as const,
      };
      expect(isMultiEditFieldEditable(calculatedField, { kind: 'uniform', value: 0.5 })).toBe(false);

      const auditField = {
        ...typeField,
        source: 'audit' as const,
      };
      expect(isMultiEditFieldEditable(auditField, { kind: 'uniform', value: 0.5 })).toBe(false);
    });
  });

  describe('getMultiEditPlaceholder', () => {
    it('returns mixed placeholder for mixed values', () => {
      expect(getMultiEditPlaceholder({ kind: 'mixed' })).toBe('— (różne)');
      expect(getMultiEditPlaceholder({ kind: 'mixed' }, 'kV')).toBe('— (różne)');
    });

    it('returns unit placeholder for uniform values', () => {
      expect(getMultiEditPlaceholder({ kind: 'uniform', value: 10 }, 'kV')).toBe('(kV)');
      expect(getMultiEditPlaceholder({ kind: 'uniform', value: 'Bus1' }, 'MW')).toBe('(MW)');
    });

    it('returns empty string for uniform values without unit', () => {
      expect(getMultiEditPlaceholder({ kind: 'uniform', value: 10 })).toBe('');
      expect(getMultiEditPlaceholder({ kind: 'uniform', value: 'Bus1' })).toBe('');
    });
  });

  describe('getCommonFields', () => {
    it('returns all fields for single element', () => {
      const elements: ElementData[] = [
        {
          id: 'bus-1',
          type: 'Bus',
          name: 'Bus 1',
          data: {
            name: 'Bus 1',
            voltage_kv: 10,
            in_service: true,
          },
        },
      ];

      const sections = getCommonFields(elements);
      expect(sections).toBeTruthy();
      expect(sections.length).toBeGreaterThan(0);
    });

    it('returns common fields for multiple elements of same type', () => {
      const elements: ElementData[] = [
        {
          id: 'bus-1',
          type: 'Bus',
          name: 'Bus 1',
          data: {
            name: 'Bus 1',
            voltage_kv: 10,
            in_service: true,
          },
        },
        {
          id: 'bus-2',
          type: 'Bus',
          name: 'Bus 2',
          data: {
            name: 'Bus 2',
            voltage_kv: 10,
            in_service: false,
          },
        },
      ];

      const sections = getCommonFields(elements);
      expect(sections).toBeTruthy();
      expect(sections.length).toBeGreaterThan(0);

      // Find 'voltage_kv' field
      const voltageField = sections
        .flatMap((s) => s.fields)
        .find((f) => f.key === 'voltage_kv');

      expect(voltageField).toBeTruthy();
      expect(voltageField!.value).toEqual({ kind: 'uniform', value: 10 });

      // Find 'in_service' field (should be mixed)
      const inServiceField = sections
        .flatMap((s) => s.fields)
        .find((f) => f.key === 'in_service');

      expect(inServiceField).toBeTruthy();
      expect(inServiceField!.value).toEqual({ kind: 'mixed' });
    });

    it('returns empty for mixed types', () => {
      const elements: ElementData[] = [
        {
          id: 'bus-1',
          type: 'Bus',
          name: 'Bus 1',
          data: { name: 'Bus 1' },
        },
        {
          id: 'line-1',
          type: 'LineBranch',
          name: 'Line 1',
          data: { name: 'Line 1' },
        },
      ];

      const sections = getCommonFields(elements);
      expect(sections).toEqual([]);
    });

    it('returns empty for no elements', () => {
      const sections = getCommonFields([]);
      expect(sections).toEqual([]);
    });
  });
});
