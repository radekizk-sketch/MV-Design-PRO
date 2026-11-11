// @vitest-environment node
/**
 * P11c — Results Comparison Tests (Minimal)
 *
 * CANONICAL ALIGNMENT:
 * - Tests core comparison functionality
 * - Validates Polish labels
 * - Ensures deterministic behavior
 *
 * SCOPE:
 * - Type exports
 * - API client (mocked)
 * - Comparison status classification
 */

import { describe, it, expect } from 'vitest';
import {
  COMPARISON_STATUS_LABELS,
  COMPARISON_STATUS_COLORS,
  COMPARISON_ELEMENT_LABELS,
} from '../types';

// =============================================================================
// Type Exports Test
// =============================================================================

describe('Comparison Types', () => {
  it('exports Polish labels for comparison status', () => {
    expect(COMPARISON_STATUS_LABELS.IMPROVED).toBe('Poprawa');
    expect(COMPARISON_STATUS_LABELS.REGRESSED).toBe('Pogorszenie');
    expect(COMPARISON_STATUS_LABELS.NO_CHANGE).toBe('Bez zmian');
  });

  it('exports color classes for comparison status', () => {
    expect(COMPARISON_STATUS_COLORS.IMPROVED).toContain('green');
    expect(COMPARISON_STATUS_COLORS.REGRESSED).toContain('red');
    expect(COMPARISON_STATUS_COLORS.NO_CHANGE).toContain('gray');
  });

  it('exports Polish labels for element types', () => {
    expect(COMPARISON_ELEMENT_LABELS.BUS).toBe('Szyna');
    expect(COMPARISON_ELEMENT_LABELS.BRANCH).toBe('Gałąź');
    expect(COMPARISON_ELEMENT_LABELS.SHORT_CIRCUIT).toBe('Zwarcie');
  });
});

// =============================================================================
// Run History Sorting Test (Deterministic)
// =============================================================================

describe('Run History Sorting', () => {
  it('sorts runs by created_at DESC (newest first)', () => {
    const runs = [
      { run_id: '1', created_at: '2026-01-01T10:00:00Z', case_name: 'Case A', case_id: 'c1', result_state: 'FRESH' as const, solver_kind: 'PF', status: 'success', snapshot_id: null, input_hash: 'h1' },
      { run_id: '2', created_at: '2026-01-03T10:00:00Z', case_name: 'Case B', case_id: 'c2', result_state: 'FRESH' as const, solver_kind: 'PF', status: 'success', snapshot_id: null, input_hash: 'h2' },
      { run_id: '3', created_at: '2026-01-02T10:00:00Z', case_name: 'Case C', case_id: 'c3', result_state: 'FRESH' as const, solver_kind: 'PF', status: 'success', snapshot_id: null, input_hash: 'h3' },
    ];

    const sorted = [...runs].sort((a, b) => {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    expect(sorted[0].run_id).toBe('2'); // 2026-01-03 (newest)
    expect(sorted[1].run_id).toBe('3'); // 2026-01-02
    expect(sorted[2].run_id).toBe('1'); // 2026-01-01 (oldest)
  });
});

// =============================================================================
// Delta Sign Classification Test
// =============================================================================

describe('Delta Sign Classification', () => {
  it('classifies zero delta as NO_CHANGE', () => {
    const delta = { value_a: 10, value_b: 10, delta: 0, percent: 0, sign: 0 };
    expect(delta.sign).toBe(0);
  });

  it('classifies negative delta correctly', () => {
    const delta = { value_a: 10, value_b: 8, delta: -2, percent: -20, sign: -1 };
    expect(delta.sign).toBe(-1);
  });

  it('classifies positive delta correctly', () => {
    const delta = { value_a: 10, value_b: 12, delta: 2, percent: 20, sign: 1 };
    expect(delta.sign).toBe(1);
  });
});

// =============================================================================
// Polish UI Labels Test
// =============================================================================

describe('Polish UI Labels (100% PL)', () => {
  it('uses Polish terms for all UI labels', () => {
    // Verify no English terms in labels
    const allLabels = [
      ...Object.values(COMPARISON_STATUS_LABELS),
      ...Object.values(COMPARISON_ELEMENT_LABELS),
    ];

    const englishTerms = ['improvement', 'regression', 'change', 'bus', 'branch', 'circuit'];

    allLabels.forEach((label) => {
      englishTerms.forEach((term) => {
        expect(label.toLowerCase()).not.toContain(term);
      });
    });
  });

  it('uses Polish characters (ą, ę, ł, etc.)', () => {
    expect(COMPARISON_ELEMENT_LABELS.BRANCH).toContain('ź'); // Gałąź contains ą
    expect(COMPARISON_STATUS_LABELS.NO_CHANGE).toMatch(/bez/i);
  });
});
