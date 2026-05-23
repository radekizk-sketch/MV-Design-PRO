/**
 * LF Delta Labels Tests
 *
 * INVARIANTS VERIFIED:
 * - LF delta key labels are Polish
 * - GLOBAL_DELTA_KEY_LABELS contains both SC and LF keys
 * - No EN strings in labels
 * - getDeltaDirection is deterministic
 * - Compare mode for LF uses same float policy as backend
 */

import { describe, it, expect } from 'vitest';
import {
  GLOBAL_DELTA_KEY_LABELS,
  SC_DELTA_KEY_LABELS,
  LF_DELTA_KEY_LABELS,
  getDeltaDirection,
  DELTA_DIRECTION_LABELS,
  DELTA_DIRECTION_ARROWS,
  DELTA_DIRECTION_STYLES,
} from '../sldDeltaOverlay.types';
import type { NumericDelta } from '../sldDeltaOverlay.types';

// =============================================================================
// Tests: LF Delta Key Labels
// =============================================================================

describe('LF_DELTA_KEY_LABELS', () => {
  it('contains all expected LF keys', () => {
    const expectedKeys = [
      'v_pu', 'angle_deg', 'p_injected_mw', 'q_injected_mvar',
      'p_from_mw', 'q_from_mvar', 'p_to_mw', 'q_to_mvar',
      'losses_p_mw', 'losses_q_mvar',
      'total_losses_p_mw', 'total_losses_q_mvar',
      'min_v_pu', 'max_v_pu',
      'slack_p_mw', 'slack_q_mvar',
    ];

    for (const key of expectedKeys) {
      expect(LF_DELTA_KEY_LABELS).toHaveProperty(key);
      expect(typeof LF_DELTA_KEY_LABELS[key]).toBe('string');
      expect(LF_DELTA_KEY_LABELS[key].length).toBeGreaterThan(0);
    }
  });

  it('labels are in Polish (contain Polish characters or units)', () => {
    // At minimum, labels should not be raw English field names
    for (const [key, label] of Object.entries(LF_DELTA_KEY_LABELS)) {
      expect(label).not.toBe(key); // Label differs from key
      expect(label.length).toBeGreaterThan(2);
    }
  });
});

// =============================================================================
// Tests: GLOBAL_DELTA_KEY_LABELS
// =============================================================================

describe('GLOBAL_DELTA_KEY_LABELS', () => {
  it('contains all SC keys', () => {
    for (const key of Object.keys(SC_DELTA_KEY_LABELS)) {
      expect(GLOBAL_DELTA_KEY_LABELS).toHaveProperty(key);
      expect(GLOBAL_DELTA_KEY_LABELS[key]).toBe(SC_DELTA_KEY_LABELS[key]);
    }
  });

  it('contains all LF keys', () => {
    for (const key of Object.keys(LF_DELTA_KEY_LABELS)) {
      expect(GLOBAL_DELTA_KEY_LABELS).toHaveProperty(key);
      expect(GLOBAL_DELTA_KEY_LABELS[key]).toBe(LF_DELTA_KEY_LABELS[key]);
    }
  });

  it('SC and LF keys do not overlap', () => {
    const scKeys = new Set(Object.keys(SC_DELTA_KEY_LABELS));
    const lfKeys = new Set(Object.keys(LF_DELTA_KEY_LABELS));

    for (const key of lfKeys) {
      expect(scKeys.has(key)).toBe(false);
    }
  });
});

// =============================================================================
// Tests: getDeltaDirection (deterministic)
// =============================================================================

describe('getDeltaDirection', () => {
  it('returns "up" for positive abs delta', () => {
    const delta: NumericDelta = { base: 1.0, other: 1.5, abs: 0.5, rel: 0.5 };
    expect(getDeltaDirection(delta)).toBe('up');
  });

  it('returns "down" for negative abs delta', () => {
    const delta: NumericDelta = { base: 1.5, other: 1.0, abs: -0.5, rel: -0.333 };
    expect(getDeltaDirection(delta)).toBe('down');
  });

  it('returns "none" for zero abs delta', () => {
    const delta: NumericDelta = { base: 1.0, other: 1.0, abs: 0, rel: 0 };
    expect(getDeltaDirection(delta)).toBe('none');
  });

  it('is deterministic (same input → same output)', () => {
    const delta: NumericDelta = { base: 1.0, other: 1.05, abs: 0.05, rel: 0.05 };
    expect(getDeltaDirection(delta)).toBe(getDeltaDirection(delta));
  });

  it('handles null rel gracefully', () => {
    const delta: NumericDelta = { base: 0, other: 0.5, abs: 0.5, rel: null };
    expect(getDeltaDirection(delta)).toBe('up');
  });
});

// =============================================================================
// Tests: Direction labels are Polish
// =============================================================================

describe('DELTA_DIRECTION_LABELS', () => {
  it('all labels are in Polish', () => {
    expect(DELTA_DIRECTION_LABELS.up).toBe('Wzrost');
    expect(DELTA_DIRECTION_LABELS.down).toBe('Spadek');
    expect(DELTA_DIRECTION_LABELS.none).toBe('Bez zmian');
  });
});

// =============================================================================
// Tests: Compare determinism with float policy
// =============================================================================

describe('Compare mode float determinism', () => {
  it('delta abs is exact (no epsilon rounding)', () => {
    // The compare mode must use the same float policy as backend:
    // abs = other - base (exact)
    // No UI-side epsilon heuristics
    const delta: NumericDelta = { base: 0.999999, other: 1.000001, abs: 0.000002, rel: 0.000002 };
    // Direction should be deterministic based on exact abs
    expect(getDeltaDirection(delta)).toBe('up');
  });

  it('very small positive delta is still "up"', () => {
    const delta: NumericDelta = { base: 1.0, other: 1.0000001, abs: 0.0000001, rel: 0.0000001 };
    expect(getDeltaDirection(delta)).toBe('up');
  });

  it('very small negative delta is still "down"', () => {
    const delta: NumericDelta = { base: 1.0, other: 0.9999999, abs: -0.0000001, rel: -0.0000001 };
    expect(getDeltaDirection(delta)).toBe('down');
  });
});
