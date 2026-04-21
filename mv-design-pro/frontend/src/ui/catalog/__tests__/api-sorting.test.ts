/**
 * Catalog API Sorting Tests
 *
 * CANONICAL ALIGNMENT:
 * - P13a: Deterministic type ordering
 * - ui_canonical_parity.md § F.1: Determinism requirements
 *
 * Tests deterministic sorting in fetchTypesByCategory:
 * - Sort order: manufacturer (ascending, nulls last) → name → id
 * - Same input → same output (determinism)
 */

import { describe, it, expect } from 'vitest';
import type { LineType, CableType } from '../types';

/**
 * Deterministic sorting function (extracted from api.ts for testing).
 *
 * Sort order:
 * 1. manufacturer (ascending, nulls last)
 * 2. name (ascending)
 * 3. id (ascending, tie-breaker)
 */
function sortTypes<T extends { id: string; name: string; manufacturer?: string }>(types: T[]): T[] {
  return types.sort((a, b) => {
    // manufacturer (nulls last)
    const hasA = a.manufacturer != null;
    const hasB = b.manufacturer != null;
    if (!hasA && !hasB) {
      // Both null - skip to name comparison
    } else if (!hasA) {
      return 1; // a (null) goes after b
    } else if (!hasB) {
      return -1; // a goes before b (null)
    } else {
      // Both have manufacturer - compare
      if (a.manufacturer < b.manufacturer) return -1;
      if (a.manufacturer > b.manufacturer) return 1;
    }

    // name
    if (a.name < b.name) return -1;
    if (a.name > b.name) return 1;

    // id (tie-breaker)
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;

    return 0;
  });
}

describe('Catalog API Sorting', () => {
  describe('Deterministic Sort Order', () => {
    it('should sort by manufacturer, then name, then id', () => {
      const types: LineType[] = [
        { id: 'c', name: 'Type C', manufacturer: 'Vendor Z', r_ohm_per_km: 0.1, x_ohm_per_km: 0.2, b_us_per_km: 1.0, rated_current_a: 200, max_temperature_c: 70, voltage_rating_kv: 15, cross_section_mm2: 100 },
        { id: 'b', name: 'Type B', manufacturer: 'Vendor A', r_ohm_per_km: 0.1, x_ohm_per_km: 0.2, b_us_per_km: 1.0, rated_current_a: 200, max_temperature_c: 70, voltage_rating_kv: 15, cross_section_mm2: 100 },
        { id: 'a', name: 'Type A', manufacturer: 'Vendor A', r_ohm_per_km: 0.1, x_ohm_per_km: 0.2, b_us_per_km: 1.0, rated_current_a: 200, max_temperature_c: 70, voltage_rating_kv: 15, cross_section_mm2: 100 },
      ];

      const sorted = sortTypes(types);

      expect(sorted[0].id).toBe('a'); // Vendor A, Type A
      expect(sorted[1].id).toBe('b'); // Vendor A, Type B
      expect(sorted[2].id).toBe('c'); // Vendor Z, Type C
    });

    it('should place nulls last for manufacturer', () => {
      const types: LineType[] = [
        { id: 'b', name: 'Type B', manufacturer: undefined, r_ohm_per_km: 0.1, x_ohm_per_km: 0.2, b_us_per_km: 1.0, rated_current_a: 200, max_temperature_c: 70, voltage_rating_kv: 15, cross_section_mm2: 100 },
        { id: 'a', name: 'Type A', manufacturer: 'Vendor A', r_ohm_per_km: 0.1, x_ohm_per_km: 0.2, b_us_per_km: 1.0, rated_current_a: 200, max_temperature_c: 70, voltage_rating_kv: 15, cross_section_mm2: 100 },
        { id: 'c', name: 'Type C', manufacturer: undefined, r_ohm_per_km: 0.1, x_ohm_per_km: 0.2, b_us_per_km: 1.0, rated_current_a: 200, max_temperature_c: 70, voltage_rating_kv: 15, cross_section_mm2: 100 },
      ];

      const sorted = sortTypes(types);

      expect(sorted[0].id).toBe('a'); // Vendor A (has manufacturer)
      expect(sorted[1].id).toBe('b'); // null manufacturer, Type B
      expect(sorted[2].id).toBe('c'); // null manufacturer, Type C
    });

    it('should use id as tie-breaker when name and manufacturer are equal', () => {
      const types: LineType[] = [
        { id: 'type-3', name: 'Type A', manufacturer: 'Vendor A', r_ohm_per_km: 0.1, x_ohm_per_km: 0.2, b_us_per_km: 1.0, rated_current_a: 200, max_temperature_c: 70, voltage_rating_kv: 15, cross_section_mm2: 100 },
        { id: 'type-1', name: 'Type A', manufacturer: 'Vendor A', r_ohm_per_km: 0.1, x_ohm_per_km: 0.2, b_us_per_km: 1.0, rated_current_a: 200, max_temperature_c: 70, voltage_rating_kv: 15, cross_section_mm2: 100 },
        { id: 'type-2', name: 'Type A', manufacturer: 'Vendor A', r_ohm_per_km: 0.1, x_ohm_per_km: 0.2, b_us_per_km: 1.0, rated_current_a: 200, max_temperature_c: 70, voltage_rating_kv: 15, cross_section_mm2: 100 },
      ];

      const sorted = sortTypes(types);

      expect(sorted[0].id).toBe('type-1');
      expect(sorted[1].id).toBe('type-2');
      expect(sorted[2].id).toBe('type-3');
    });

    it('should produce deterministic results (same input → same output)', () => {
      const types: CableType[] = [
        { id: 'd', name: 'Cable D', manufacturer: 'Vendor B', r_ohm_per_km: 0.1, x_ohm_per_km: 0.2, c_nf_per_km: 200, rated_current_a: 300, voltage_rating_kv: 15, cross_section_mm2: 150, max_temperature_c: 90 },
        { id: 'a', name: 'Cable A', manufacturer: 'Vendor A', r_ohm_per_km: 0.1, x_ohm_per_km: 0.2, c_nf_per_km: 200, rated_current_a: 300, voltage_rating_kv: 15, cross_section_mm2: 150, max_temperature_c: 90 },
        { id: 'c', name: 'Cable C', manufacturer: undefined, r_ohm_per_km: 0.1, x_ohm_per_km: 0.2, c_nf_per_km: 200, rated_current_a: 300, voltage_rating_kv: 15, cross_section_mm2: 150, max_temperature_c: 90 },
        { id: 'b', name: 'Cable B', manufacturer: 'Vendor A', r_ohm_per_km: 0.1, x_ohm_per_km: 0.2, c_nf_per_km: 200, rated_current_a: 300, voltage_rating_kv: 15, cross_section_mm2: 150, max_temperature_c: 90 },
      ];

      const sorted1 = sortTypes([...types]);
      const sorted2 = sortTypes([...types]);

      // Same input should produce identical output
      expect(sorted1.map((t) => t.id)).toEqual(sorted2.map((t) => t.id));
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty array', () => {
      const types: LineType[] = [];
      const sorted = sortTypes(types);
      expect(sorted).toEqual([]);
    });

    it('should handle single element', () => {
      const types: LineType[] = [
        { id: 'a', name: 'Type A', manufacturer: 'Vendor A', r_ohm_per_km: 0.1, x_ohm_per_km: 0.2, b_us_per_km: 1.0, rated_current_a: 200, max_temperature_c: 70, voltage_rating_kv: 15, cross_section_mm2: 100 },
      ];
      const sorted = sortTypes(types);
      expect(sorted).toEqual(types);
    });

    it('should handle all null manufacturers', () => {
      const types: LineType[] = [
        { id: 'c', name: 'Type C', manufacturer: undefined, r_ohm_per_km: 0.1, x_ohm_per_km: 0.2, b_us_per_km: 1.0, rated_current_a: 200, max_temperature_c: 70, voltage_rating_kv: 15, cross_section_mm2: 100 },
        { id: 'a', name: 'Type A', manufacturer: undefined, r_ohm_per_km: 0.1, x_ohm_per_km: 0.2, b_us_per_km: 1.0, rated_current_a: 200, max_temperature_c: 70, voltage_rating_kv: 15, cross_section_mm2: 100 },
        { id: 'b', name: 'Type B', manufacturer: undefined, r_ohm_per_km: 0.1, x_ohm_per_km: 0.2, b_us_per_km: 1.0, rated_current_a: 200, max_temperature_c: 70, voltage_rating_kv: 15, cross_section_mm2: 100 },
      ];

      const sorted = sortTypes(types);

      expect(sorted[0].id).toBe('a'); // Sort by name
      expect(sorted[1].id).toBe('b');
      expect(sorted[2].id).toBe('c');
    });
  });
});
