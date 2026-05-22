import { describe, expect, it } from 'vitest';
import { isRawIdField, redactRawIds } from '../redactor';
import type { CardField } from '../../network-build/cards/ObjectCard';

describe('redactor', () => {
  describe('isRawIdField', () => {
    it('ukrywa ref_id', () => {
      expect(isRawIdField('ref_id')).toBe(true);
    });

    it('ukrywa content_hash', () => {
      expect(isRawIdField('content_hash')).toBe(true);
    });

    it('ukrywa input_hash i result_hash', () => {
      expect(isRawIdField('input_hash')).toBe(true);
      expect(isRawIdField('result_hash')).toBe(true);
    });

    it('ukrywa snapshot_hash i enm_hash', () => {
      expect(isRawIdField('snapshot_hash')).toBe(true);
      expect(isRawIdField('enm_hash')).toBe(true);
    });

    it('ukrywa klucze z prefiksem seg_', () => {
      expect(isRawIdField('seg_001')).toBe(true);
      expect(isRawIdField('seg_xyz')).toBe(true);
    });

    it('pokazuje normalne klucze produktowe', () => {
      expect(isRawIdField('name')).toBe(false);
      expect(isRawIdField('voltage_kv')).toBe(false);
      expect(isRawIdField('sn_mva')).toBe(false);
      expect(isRawIdField('vector_group')).toBe(false);
    });
  });

  describe('redactRawIds', () => {
    it('rozdziela pola produktowe od diagnostycznych', () => {
      const fields: CardField[] = [
        { key: 'name', label: 'Nazwa', value: 'TR-1' },
        { key: 'ref_id', label: 'ID elementu', value: 'tr_001' },
        { key: 'sn_mva', label: 'Moc', value: 100 },
        { key: 'content_hash', label: 'Hash', value: 'abc123' },
      ];

      const result = redactRawIds(fields);

      expect(result.visibleFields).toHaveLength(2);
      expect(result.visibleFields.map((f) => f.key)).toEqual(['name', 'sn_mva']);
      expect(result.diagnosticsFields).toHaveLength(2);
      expect(result.diagnosticsFields.map((f) => f.key)).toEqual(['ref_id', 'content_hash']);
    });

    it('zwraca pustą tablicę gdy brak pól', () => {
      const result = redactRawIds([]);
      expect(result.visibleFields).toEqual([]);
      expect(result.diagnosticsFields).toEqual([]);
    });

    it('zwraca wszystkie jako visible gdy brak debug fields', () => {
      const fields: CardField[] = [
        { key: 'name', label: 'Nazwa', value: 'X' },
        { key: 'voltage_kv', label: 'U', value: 15 },
      ];
      const result = redactRawIds(fields);
      expect(result.visibleFields).toHaveLength(2);
      expect(result.diagnosticsFields).toEqual([]);
    });

    it('zwraca wszystkie jako diagnostics gdy same debug fields', () => {
      const fields: CardField[] = [
        { key: 'ref_id', label: 'ID', value: 'x' },
        { key: 'seg_001', label: 'S', value: 'y' },
      ];
      const result = redactRawIds(fields);
      expect(result.visibleFields).toEqual([]);
      expect(result.diagnosticsFields).toHaveLength(2);
    });

    it('zachowuje kolejność pól w obu kategoriach', () => {
      const fields: CardField[] = [
        { key: 'name', label: 'A', value: 1 },
        { key: 'ref_id', label: 'B', value: 2 },
        { key: 'voltage_kv', label: 'C', value: 3 },
        { key: 'content_hash', label: 'D', value: 4 },
        { key: 'sn_mva', label: 'E', value: 5 },
      ];
      const result = redactRawIds(fields);
      expect(result.visibleFields.map((f) => f.label)).toEqual(['A', 'C', 'E']);
      expect(result.diagnosticsFields.map((f) => f.label)).toEqual(['B', 'D']);
    });
  });
});
