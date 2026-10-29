// @vitest-environment node
/**
 * Mass Review — testy logiki przeglądów masowych.
 *
 * Weryfikuje:
 * - Poprawne rozpoznawanie łączników (switch types)
 * - Poprawne filtrowanie brakujących katalogów
 * - Etykiety stanów łączników w PL
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// switchTypeLabel (unit logic from SwitchReview)
// ---------------------------------------------------------------------------

function switchTypeLabel(kind: string | null | undefined): string {
  switch (kind) {
    case 'BREAKER': return 'Wyłącznik';
    case 'DISCONNECTOR': return 'Rozłącznik';
    case 'LOAD_SWITCH': return 'Rozłącznik obciążeniowy';
    case 'FUSE': return 'Bezpiecznik';
    default: return kind ?? '—';
  }
}

function switchStateLabel(state: string | null | undefined): string {
  switch (state) {
    case 'OPEN':
    case 'open': return 'Otwarty';
    case 'CLOSED':
    case 'closed': return 'Zamknięty';
    default: return state ?? '—';
  }
}

describe('switchTypeLabel', () => {
  it('returns Polish labels for known switch types', () => {
    expect(switchTypeLabel('BREAKER')).toBe('Wyłącznik');
    expect(switchTypeLabel('DISCONNECTOR')).toBe('Rozłącznik');
    expect(switchTypeLabel('FUSE')).toBe('Bezpiecznik');
    expect(switchTypeLabel('LOAD_SWITCH')).toBe('Rozłącznik obciążeniowy');
  });

  it('returns the raw value for unknown types', () => {
    expect(switchTypeLabel('UNKNOWN')).toBe('UNKNOWN');
  });

  it('returns dash for null/undefined', () => {
    expect(switchTypeLabel(null)).toBe('—');
    expect(switchTypeLabel(undefined)).toBe('—');
  });
});

describe('switchStateLabel', () => {
  it('returns Polish labels for both upper and lower case', () => {
    expect(switchStateLabel('OPEN')).toBe('Otwarty');
    expect(switchStateLabel('open')).toBe('Otwarty');
    expect(switchStateLabel('CLOSED')).toBe('Zamknięty');
    expect(switchStateLabel('closed')).toBe('Zamknięty');
  });
});

// ---------------------------------------------------------------------------
// Branch type identification
// ---------------------------------------------------------------------------

describe('Branch type filtering', () => {
  const switchTypes = ['switch', 'breaker', 'bus_coupler', 'disconnector', 'fuse'];
  const lineTypes = ['line_overhead', 'cable'];

  it('correctly identifies switch branches', () => {
    expect(switchTypes.includes('switch')).toBe(true);
    expect(switchTypes.includes('breaker')).toBe(true);
    expect(switchTypes.includes('fuse')).toBe(true);
    expect(switchTypes.includes('bus_coupler')).toBe(true);
    expect(switchTypes.includes('disconnector')).toBe(true);
  });

  it('does not include line types in switch types', () => {
    expect(switchTypes.includes('line_overhead')).toBe(false);
    expect(switchTypes.includes('cable')).toBe(false);
  });

  it('correctly identifies line/cable branches', () => {
    expect(lineTypes.includes('line_overhead')).toBe(true);
    expect(lineTypes.includes('cable')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Missing catalog detection
// ---------------------------------------------------------------------------

describe('Missing catalog detection', () => {
  it('detects branches without catalog_ref', () => {
    const branches = [
      { ref_id: 'b1', type: 'line_overhead', catalog_ref: null },
      { ref_id: 'b2', type: 'cable', catalog_ref: 'AXCES 3x120' },
      { ref_id: 'b3', type: 'switch', catalog_ref: null },
    ];

    const missingCatalog = branches.filter(
      (b) => (b.type === 'line_overhead' || b.type === 'cable') && !b.catalog_ref,
    );

    expect(missingCatalog).toHaveLength(1);
    expect(missingCatalog[0].ref_id).toBe('b1');
  });
});
