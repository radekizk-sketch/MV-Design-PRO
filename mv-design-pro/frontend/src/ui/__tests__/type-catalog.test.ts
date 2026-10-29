/**
 * Type Catalog Tests (P8.2)
 *
 * CANONICAL ALIGNMENT:
 * - P8.2: UI Assign/Clear Type (Canonical Type Library parity)
 * - Deterministic ordering: manufacturer → name → id
 * - Mode gating: MODEL_EDIT only for mutations
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchTypesByCategory } from '../catalog/api';
import type { LineType } from '../catalog/types';

// Mock fetch
global.fetch = vi.fn();

describe('Type Catalog API', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    global.fetch = vi.fn();
  });

  describe('fetchTypesByCategory', () => {
    it('fetches line types and sorts deterministically', async () => {
      const mockTypes: LineType[] = [
        {
          id: 'line-003',
          name: 'ACSR 120',
          manufacturer: 'Siemens',
          r_ohm_per_km: 0.25,
          x_ohm_per_km: 0.35,
          b_us_per_km: 2.5,
          rated_current_a: 400,
          max_temperature_c: 70,
          voltage_rating_kv: 110,
          cross_section_mm2: 120,
        },
        {
          id: 'line-001',
          name: 'ACSR 240',
          manufacturer: 'ABB',
          r_ohm_per_km: 0.12,
          x_ohm_per_km: 0.39,
          b_us_per_km: 2.82,
          rated_current_a: 645,
          max_temperature_c: 70,
          voltage_rating_kv: 110,
          cross_section_mm2: 240,
        },
        {
          id: 'line-002',
          name: 'ACSR 240',
          manufacturer: 'ABB',
          r_ohm_per_km: 0.13,
          x_ohm_per_km: 0.40,
          b_us_per_km: 2.80,
          rated_current_a: 640,
          max_temperature_c: 70,
          voltage_rating_kv: 110,
          cross_section_mm2: 240,
        },
        {
          id: 'line-004',
          name: 'ACSR 50',
          manufacturer: undefined, // null manufacturer (sorts last)
          r_ohm_per_km: 0.60,
          x_ohm_per_km: 0.40,
          b_us_per_km: 2.5,
          rated_current_a: 200,
          max_temperature_c: 70,
          voltage_rating_kv: 15,
          cross_section_mm2: 50,
        },
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockTypes,
      });

      const result = await fetchTypesByCategory('LINE');

      // Deterministic order: manufacturer (ABB, Siemens, null) → name → id
      expect(result).toHaveLength(4);
      expect(result[0].id).toBe('line-001'); // ABB, ACSR 240, line-001
      expect(result[1].id).toBe('line-002'); // ABB, ACSR 240, line-002
      expect(result[2].id).toBe('line-003'); // Siemens, ACSR 120
      expect(result[3].id).toBe('line-004'); // null manufacturer → last
    });

    it('handles empty catalog', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const result = await fetchTypesByCategory('CABLE');

      expect(result).toEqual([]);
    });

    it('throws error on API failure', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ detail: 'Catalog not found' }),
      });

      await expect(fetchTypesByCategory('TRANSFORMER')).rejects.toThrow('404 Not Found');
    });
  });
});
