// @vitest-environment node
/**
 * Tests for PR-15: Result Contract v1 — Overlay Adapter
 *
 * Tests:
 * - test_overlay_adapter_determinism
 * - test_overlay_adapter_empty_payload
 * - test_overlay_adapter_metrics_sorted
 * - test_overlay_adapter_preserves_badges
 */

import { describe, it, expect } from 'vitest';
import type { ResultSetV1 } from '../results';
import { toOverlayMap } from '../results';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeResultSet(
  overrides: Partial<ResultSetV1> = {},
): ResultSetV1 {
  return {
    contract_version: '1.0',
    run_id: 'test-run-001',
    analysis_type: 'SC_3F',
    solver_input_hash: 'a'.repeat(64),
    created_at: '2024-01-01T00:00:00Z',
    deterministic_signature: 'b'.repeat(64),
    global_results: {},
    element_results: [],
    overlay_payload: {
      elements: {},
      legend: {
        title: 'Legenda wyników',
        entries: [
          { severity: 'INFO', label: 'Poprawne', description: '' },
          { severity: 'WARNING', label: 'Ostrzeżenie', description: '' },
          { severity: 'IMPORTANT', label: 'Ważne', description: '' },
          { severity: 'BLOCKER', label: 'Blokujące', description: '' },
        ],
      },
      warnings: [],
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests: Overlay Adapter Determinism
// ---------------------------------------------------------------------------

describe('toOverlayMap', () => {
  it('produces same output for same input (determinism)', () => {
    const rs = makeResultSet({
      overlay_payload: {
        elements: {
          'bus-2': {
            ref_id: 'bus-2',
            kind: 'bus',
            badges: [
              { label: 'NIEGOTOWE', severity: 'BLOCKER', code: 'NOT_READY' },
            ],
            metrics: {
              IK_3F_A: {
                code: 'IK_3F_A',
                value: 12500,
                unit: 'A',
                format_hint: 'fixed0',
                source: 'solver',
              },
            },
            severity: 'BLOCKER',
          },
          'bus-1': {
            ref_id: 'bus-1',
            kind: 'bus',
            badges: [],
            metrics: {
              V_PU: {
                code: 'V_PU',
                value: 1.02,
                unit: 'p.u.',
                format_hint: 'fixed4',
                source: 'solver',
              },
            },
            severity: 'INFO',
          },
        },
        legend: {
          title: 'Legenda wyników',
          entries: [],
        },
        warnings: [],
      },
    });

    const map1 = toOverlayMap(rs);
    const map2 = toOverlayMap(rs);

    // Same keys in same order
    expect([...map1.keys()]).toEqual([...map2.keys()]);

    // Same order (bus-1 before bus-2 — sorted)
    expect([...map1.keys()]).toEqual(['bus-1', 'bus-2']);

    // Same values
    for (const [key, entry1] of map1) {
      const entry2 = map2.get(key);
      expect(entry2).toBeDefined();
      expect(entry1.ref_id).toBe(entry2!.ref_id);
      expect(entry1.kind).toBe(entry2!.kind);
      expect(entry1.severity).toBe(entry2!.severity);
      expect(entry1.badges.length).toBe(entry2!.badges.length);
      expect(entry1.metrics.length).toBe(entry2!.metrics.length);
    }
  });

  it('handles empty overlay payload', () => {
    const rs = makeResultSet();
    const map = toOverlayMap(rs);
    expect(map.size).toBe(0);
  });

  it('sorts metrics by code within each element', () => {
    const rs = makeResultSet({
      overlay_payload: {
        elements: {
          'bus-1': {
            ref_id: 'bus-1',
            kind: 'bus',
            badges: [],
            metrics: {
              Z_OHM: {
                code: 'Z_OHM',
                value: 5.0,
                unit: 'Ohm',
                format_hint: 'fixed2',
                source: 'solver',
              },
              A_CODE: {
                code: 'A_CODE',
                value: 1.0,
                unit: 'A',
                format_hint: 'fixed0',
                source: 'solver',
              },
              M_CODE: {
                code: 'M_CODE',
                value: 3.0,
                unit: 'MW',
                format_hint: 'fixed2',
                source: 'solver',
              },
            },
            severity: 'INFO',
          },
        },
        legend: { title: '', entries: [] },
        warnings: [],
      },
    });

    const map = toOverlayMap(rs);
    const entry = map.get('bus-1')!;
    const codes = entry.metrics.map((m) => m.code);
    expect(codes).toEqual(['A_CODE', 'M_CODE', 'Z_OHM']);
  });

  it('preserves badges from overlay elements', () => {
    const rs = makeResultSet({
      overlay_payload: {
        elements: {
          'bus-1': {
            ref_id: 'bus-1',
            kind: 'bus',
            badges: [
              { label: 'BRAK KATALOGU', severity: 'WARNING', code: 'MISSING_CATALOG' },
              { label: 'NIEGOTOWE', severity: 'BLOCKER', code: 'NOT_READY' },
            ],
            metrics: {},
            severity: 'BLOCKER',
          },
        },
        legend: { title: '', entries: [] },
        warnings: [],
      },
    });

    const map = toOverlayMap(rs);
    const entry = map.get('bus-1')!;
    expect(entry.badges.length).toBe(2);
    expect(entry.badges[0].label).toBe('BRAK KATALOGU');
    expect(entry.badges[1].label).toBe('NIEGOTOWE');
  });

  it('maps element kinds correctly', () => {
    const rs = makeResultSet({
      overlay_payload: {
        elements: {
          'bus-1': {
            ref_id: 'bus-1',
            kind: 'bus',
            badges: [],
            metrics: {},
            severity: 'INFO',
          },
          'branch-1': {
            ref_id: 'branch-1',
            kind: 'branch',
            badges: [],
            metrics: {},
            severity: 'INFO',
          },
          'trafo-1': {
            ref_id: 'trafo-1',
            kind: 'transformer',
            badges: [],
            metrics: {},
            severity: 'INFO',
          },
        },
        legend: { title: '', entries: [] },
        warnings: [],
      },
    });

    const map = toOverlayMap(rs);
    expect(map.get('bus-1')!.kind).toBe('bus');
    expect(map.get('branch-1')!.kind).toBe('branch');
    expect(map.get('trafo-1')!.kind).toBe('transformer');
  });
});
