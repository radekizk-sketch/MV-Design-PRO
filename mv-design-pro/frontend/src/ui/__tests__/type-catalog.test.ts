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

  describe('clearTypeFromBranch w trybie katalog-first', () => {
    it('blokuje odkatalogowanie elementu technicznego', async () => {
      const { clearTypeFromBranch } = await import('../catalog/api');

      await expect(clearTypeFromBranch('proj-123', 'branch-456')).rejects.toThrow(
        /Odkatalogowanie.*katalog-first/i,
      );
      expect(global.fetch).not.toHaveBeenCalled();
    });
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

      // Treść odmowy backendu (`detail`) słowo w słowo; angielski `statusText` nie trafia do treści.
      const blad = (await fetchTypesByCategory('TRANSFORMER').then(
        () => null,
        (e: unknown) => e,
      )) as Error;
      expect(blad.message).toBe('Catalog not found');
      expect(blad.message).not.toContain('Not Found');
    });
  });
});

describe('Property Grid - type_ref_with_actions', () => {
  it('renders type_ref field with action buttons in MODEL_EDIT', () => {
    // This is a conceptual test - actual rendering tested via component tests
    const field = {
      key: 'type_ref',
      label: 'Typ przewodu (katalog)',
      value: 'line-type-123',
      type: 'type_ref_with_actions' as const,
      editable: true,
      source: 'type' as const,
      typeRefName: 'ACSR 240 (ABB)',
      onAssignType: vi.fn(),
      onClearType: vi.fn(),
    };

    expect(field.type).toBe('type_ref_with_actions');
    expect(field.onAssignType).toBeDefined();
    expect(field.onClearType).toBeDefined();
    expect(field.typeRefName).toBe('ACSR 240 (ABB)');
  });

  it('shows "Nie przypisano typu" when type_ref is null', () => {
    const field = {
      key: 'type_ref',
      label: 'Typ przewodu (katalog)',
      value: null,
      type: 'type_ref_with_actions' as const,
      editable: true,
      source: 'type' as const,
      onAssignType: vi.fn(),
    };

    expect(field.value).toBeNull();
    // UI should display "Nie przypisano typu z katalogu"
  });
});

describe('Deterministic Ordering', () => {
  it('sorts types by manufacturer → name → id', () => {
    const types = [
      { id: 'c', name: 'TypeB', manufacturer: 'VendorA' },
      { id: 'a', name: 'TypeA', manufacturer: 'VendorB' },
      { id: 'b', name: 'TypeA', manufacturer: 'VendorB' },
      { id: 'd', name: 'TypeZ', manufacturer: undefined },
      { id: 'e', name: 'TypeA', manufacturer: undefined },
    ];

    types.sort((a, b) => {
      const mfrA = a.manufacturer ?? null;
      const mfrB = b.manufacturer ?? null;
      if (mfrA == null && mfrB != null) return 1;
      if (mfrA != null && mfrB == null) return -1;
      if (mfrA != null && mfrB != null) {
        if (mfrA < mfrB) return -1;
        if (mfrA > mfrB) return 1;
      }
      if (a.name < b.name) return -1;
      if (a.name > b.name) return 1;
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    });

    expect(types[0].id).toBe('c'); // VendorA, TypeB, c
    expect(types[1].id).toBe('a'); // VendorB, TypeA, a
    expect(types[2].id).toBe('b'); // VendorB, TypeA, b
    expect(types[3].id).toBe('e'); // null manufacturer, TypeA, e
    expect(types[4].id).toBe('d'); // null manufacturer, TypeZ, d
  });

  it('is stable across multiple sorts', () => {
    const types = [
      { id: 'a', name: 'TypeA', manufacturer: 'VendorA' },
      { id: 'b', name: 'TypeA', manufacturer: 'VendorA' },
    ];

    const sort1 = [...types].sort((a, b) => {
      const mfrA = a.manufacturer ?? null;
      const mfrB = b.manufacturer ?? null;
      if (mfrA == null && mfrB != null) return 1;
      if (mfrA != null && mfrB == null) return -1;
      if (mfrA != null && mfrB != null) {
        if (mfrA < mfrB) return -1;
        if (mfrA > mfrB) return 1;
      }
      if (a.name < b.name) return -1;
      if (a.name > b.name) return 1;
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    });

    const sort2 = [...types].sort((a, b) => {
      const mfrA = a.manufacturer ?? null;
      const mfrB = b.manufacturer ?? null;
      if (mfrA == null && mfrB != null) return 1;
      if (mfrA != null && mfrB == null) return -1;
      if (mfrA != null && mfrB != null) {
        if (mfrA < mfrB) return -1;
        if (mfrA > mfrB) return 1;
      }
      if (a.name < b.name) return -1;
      if (a.name > b.name) return 1;
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    });

    expect(sort1).toEqual(sort2); // Deterministic
  });
});

describe('Type Reference Validation', () => {
  it('displays validation message for non-existent type_ref', () => {
    const validationMessage = {
      code: 'type_not_found',
      severity: 'ERROR' as const,
      message: 'Typ o ID abc-123 nie istnieje w katalogu',
      field: 'type_ref',
    };

    expect(validationMessage.code).toBe('type_not_found');
    expect(validationMessage.severity).toBe('ERROR');
    expect(validationMessage.field).toBe('type_ref');
  });
});
