/**
 * Tests for K30-17 SldModeInteractionHandler.resolveClickAction.
 */

import { describe, expect, it } from 'vitest';

import { resolveClickAction } from '../SldModeInteractionHandler';

describe('resolveClickAction', () => {
  describe('NORMALNY mode', () => {
    it('returns SELECT for any element type', () => {
      const result = resolveClickAction('NORMALNY', {
        elementId: 'bus-1',
        elementType: 'bus',
      });
      expect(result.action).toBe('SELECT');
      expect(result.elementId).toBe('bus-1');
    });

    it('SELECT for switch in NORMALNY', () => {
      expect(resolveClickAction('NORMALNY', { elementId: 'sw-1', elementType: 'switch' }).action).toBe('SELECT');
    });
  });

  describe('REVIEW mode (read-only)', () => {
    it('always SELECT (no edit)', () => {
      expect(resolveClickAction('REVIEW', { elementId: 'sw-1', elementType: 'switch' }).action).toBe('SELECT');
      expect(resolveClickAction('REVIEW', { elementId: 'bus-1', elementType: 'bus' }).action).toBe('SELECT');
    });

    it('includes reason for transparency', () => {
      const result = resolveClickAction('REVIEW', { elementId: 'tr-1', elementType: 'transformer' });
      expect(result.reason).toContain('przeglądu');
    });
  });

  describe('SERVICE mode (toggle switches)', () => {
    it('TOGGLE_SERVICE for switch', () => {
      expect(resolveClickAction('SERVICE', { elementId: 'sw-1', elementType: 'switch' }).action).toBe('TOGGLE_SERVICE');
    });

    it('TOGGLE_SERVICE for breaker', () => {
      expect(resolveClickAction('SERVICE', { elementId: 'cb-1', elementType: 'breaker' }).action).toBe('TOGGLE_SERVICE');
    });

    it('TOGGLE_SERVICE for disconnector', () => {
      expect(resolveClickAction('SERVICE', { elementId: 'ds-1', elementType: 'disconnector' }).action).toBe(
        'TOGGLE_SERVICE',
      );
    });

    it('NONE for non-switch in SERVICE mode', () => {
      const result = resolveClickAction('SERVICE', { elementId: 'bus-1', elementType: 'bus' });
      expect(result.action).toBe('NONE');
      expect(result.reason).toContain('łącznik');
    });
  });

  describe('FAULT mode (set fault location)', () => {
    it('SET_FAULT_BUS for bus', () => {
      expect(resolveClickAction('FAULT', { elementId: 'bus-1', elementType: 'bus' }).action).toBe('SET_FAULT_BUS');
    });

    it('SET_FAULT_BUS for busbar', () => {
      expect(resolveClickAction('FAULT', { elementId: 'bb-1', elementType: 'busbar' }).action).toBe('SET_FAULT_BUS');
    });

    it('NONE for non-bus in FAULT mode', () => {
      const result = resolveClickAction('FAULT', { elementId: 'sw-1', elementType: 'switch' });
      expect(result.action).toBe('NONE');
      expect(result.reason).toContain('szynę');
    });
  });

  it('handles case-insensitive elementType (string)', () => {
    expect(resolveClickAction('SERVICE', { elementId: 'sw-1', elementType: 'SWITCH' }).action).toBe('TOGGLE_SERVICE');
    expect(resolveClickAction('FAULT', { elementId: 'bus-1', elementType: 'BUS' }).action).toBe('SET_FAULT_BUS');
  });
});
