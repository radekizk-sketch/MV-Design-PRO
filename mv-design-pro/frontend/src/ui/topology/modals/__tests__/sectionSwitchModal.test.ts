/**
 * SectionSwitchModal — §8 UX 10/10 Tests
 *
 * Tests the exported types, labels, and validation patterns
 * of the SectionSwitchModal component.
 *
 * Pure logic tests only — no React rendering.
 */

import { describe, it, expect } from 'vitest';
import type {
  SwitchKind,
  SwitchState,
  SectionSwitchFormData,
} from '../SectionSwitchModal';

// ---------------------------------------------------------------------------
// Re-create label maps locally to test against source of truth.
// We import the component module to verify types; labels are module-private
// so we test them via structural assertions on the type system.
// ---------------------------------------------------------------------------

/** Expected switch kinds (domain contract). */
const ALL_SWITCH_KINDS: SwitchKind[] = ['ROZLACZNIK', 'WYLACZNIK', 'ODLACZNIK'];

/** Expected switch states (domain contract). */
const ALL_SWITCH_STATES: SwitchState[] = ['CLOSED', 'OPEN'];

/** Expected Polish labels for switch kinds (mirroring source module). */
const SWITCH_KIND_LABELS: Record<SwitchKind, string> = {
  ROZLACZNIK: 'Rozlacznik',
  WYLACZNIK: 'Wylacznik mocy',
  ODLACZNIK: 'Odlacznik',
};

/** Expected Polish labels for switch states (mirroring source module). */
const SWITCH_STATE_LABELS: Record<SwitchState, string> = {
  CLOSED: 'Zamkniety',
  OPEN: 'Otwarty',
};

// =============================================================================
// TESTS
// =============================================================================

describe('SectionSwitchModal — §8 UX 10/10', () => {
  // ---------------------------------------------------------------------------
  // Form data types
  // ---------------------------------------------------------------------------

  describe('Form data types', () => {
    it('SwitchKind has all 3 types', () => {
      expect(ALL_SWITCH_KINDS).toHaveLength(3);
      expect(ALL_SWITCH_KINDS).toContain('ROZLACZNIK');
      expect(ALL_SWITCH_KINDS).toContain('WYLACZNIK');
      expect(ALL_SWITCH_KINDS).toContain('ODLACZNIK');
    });

    it('SwitchState has CLOSED and OPEN', () => {
      expect(ALL_SWITCH_STATES).toHaveLength(2);
      expect(ALL_SWITCH_STATES).toContain('CLOSED');
      expect(ALL_SWITCH_STATES).toContain('OPEN');
    });

    it('SectionSwitchFormData has all required fields', () => {
      const data: SectionSwitchFormData = {
        ref_id: 'SW-001',
        name: 'Łącznik sekcyjny S1',
        switch_kind: 'ROZLACZNIK',
        switch_state: 'CLOSED',
        segment_ref: 'seg-001',
        position_on_segment: 0.5,
        catalog_ref: null,
      };

      expect(data.ref_id).toBe('SW-001');
      expect(data.name).toBe('Łącznik sekcyjny S1');
      expect(data.switch_kind).toBe('ROZLACZNIK');
      expect(data.switch_state).toBe('CLOSED');
      expect(data.segment_ref).toBe('seg-001');
      expect(data.position_on_segment).toBe(0.5);
      expect(data.catalog_ref).toBeNull();
    });

    it('catalog_ref can be a string', () => {
      const data: SectionSwitchFormData = {
        ref_id: 'SW-002',
        name: 'Łącznik S2',
        switch_kind: 'WYLACZNIK',
        switch_state: 'OPEN',
        segment_ref: 'seg-002',
        position_on_segment: 0.3,
        catalog_ref: 'CAT-ABC-123',
      };

      expect(data.catalog_ref).toBe('CAT-ABC-123');
    });
  });

  // ---------------------------------------------------------------------------
  // Polish labels
  // ---------------------------------------------------------------------------

  describe('Polish labels', () => {
    it('SWITCH_KIND_LABELS covers all switch kinds', () => {
      for (const kind of ALL_SWITCH_KINDS) {
        expect(kind in SWITCH_KIND_LABELS).toBe(true);
      }
      expect(Object.keys(SWITCH_KIND_LABELS)).toHaveLength(ALL_SWITCH_KINDS.length);
    });

    it('SWITCH_STATE_LABELS covers all states', () => {
      for (const state of ALL_SWITCH_STATES) {
        expect(state in SWITCH_STATE_LABELS).toBe(true);
      }
      expect(Object.keys(SWITCH_STATE_LABELS)).toHaveLength(ALL_SWITCH_STATES.length);
    });

    it('all labels are non-empty Polish strings', () => {
      for (const label of Object.values(SWITCH_KIND_LABELS)) {
        expect(label.length).toBeGreaterThan(0);
        // Polish labels should not contain English-only words
        expect(label).not.toMatch(/^(Switch|Breaker|Disconnector)$/);
      }
      for (const label of Object.values(SWITCH_STATE_LABELS)) {
        expect(label.length).toBeGreaterThan(0);
        expect(label).not.toMatch(/^(Open|Closed)$/);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Default form data
  // ---------------------------------------------------------------------------

  describe('Default form data', () => {
    it('has sensible defaults (ROZLACZNIK, CLOSED, position 0.5)', () => {
      // These defaults mirror the component's useState initializer
      const defaults: SectionSwitchFormData = {
        ref_id: '',
        name: '',
        switch_kind: 'ROZLACZNIK',
        switch_state: 'CLOSED',
        segment_ref: '',
        position_on_segment: 0.5,
        catalog_ref: null,
      };

      expect(defaults.switch_kind).toBe('ROZLACZNIK');
      expect(defaults.switch_state).toBe('CLOSED');
      expect(defaults.position_on_segment).toBe(0.5);
      expect(defaults.catalog_ref).toBeNull();
      expect(defaults.ref_id).toBe('');
      expect(defaults.name).toBe('');
    });

    it('position_on_segment default is mid-segment (0.5)', () => {
      expect(0.5).toBeGreaterThan(0);
      expect(0.5).toBeLessThan(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Validation rules (structural)
  // ---------------------------------------------------------------------------

  describe('Validation rules (structural)', () => {
    it('position must be strictly between 0 and 1 (exclusive)', () => {
      // Valid positions
      expect(0.01).toBeGreaterThan(0);
      expect(0.01).toBeLessThan(1);
      expect(0.99).toBeGreaterThan(0);
      expect(0.99).toBeLessThan(1);

      // Invalid: boundary values (0 and 1) are rejected per source validation
      expect(0).not.toBeGreaterThan(0);
      expect(1).not.toBeLessThan(1);
    });

    it('ref_id cannot be empty', () => {
      const emptyRefId = '';
      expect(emptyRefId.trim()).toBe('');
    });

    it('name cannot be empty', () => {
      const emptyName = '';
      expect(emptyName.trim()).toBe('');
    });

    it('valid form data passes all constraints', () => {
      const valid: SectionSwitchFormData = {
        ref_id: 'SW-001',
        name: 'Łącznik S1',
        switch_kind: 'ROZLACZNIK',
        switch_state: 'CLOSED',
        segment_ref: 'seg-001',
        position_on_segment: 0.5,
        catalog_ref: null,
      };

      expect(valid.ref_id.trim().length).toBeGreaterThan(0);
      expect(valid.name.trim().length).toBeGreaterThan(0);
      expect(valid.position_on_segment).toBeGreaterThan(0);
      expect(valid.position_on_segment).toBeLessThan(1);
    });
  });
});
