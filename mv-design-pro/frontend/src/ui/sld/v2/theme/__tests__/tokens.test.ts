/**
 * tokens.ts tests — snapToGrid + getDeviceStyle pure functions.
 *
 * INVARIANTS:
 * - snapToGrid: wszystkie współrzędne to wielokrotność GRID_BASE_PX.
 * - getDeviceStyle: state → style (NIGDY nie zmienia geometrii) — state-style
 *   invariant per PR-13.
 */

import { describe, expect, it } from 'vitest';

import {
  COLOR_DEVICE_CLOSED,
  COLOR_DEVICE_CLOSED_BORDER,
  COLOR_DEVICE_FAULT,
  COLOR_DEVICE_OPEN_BORDER,
  COLOR_DEVICE_UNKNOWN,
  COLOR_PANEL_RAISED,
  COLOR_SELECTION,
  COLOR_TEXT_MUTED,
  GRID_BASE_PX,
  getDeviceStyle,
  snapToGrid,
  type DeviceState,
} from '../tokens';

describe('snapToGrid', () => {
  it('returns 0 for 0', () => {
    expect(snapToGrid(0)).toBe(0);
  });

  it('multiples of GRID_BASE_PX pass through', () => {
    for (const mult of [-3, -1, 0, 1, 2, 5, 10, 100]) {
      const value = mult * GRID_BASE_PX;
      expect(snapToGrid(value)).toBe(value);
    }
  });

  it('rounds half-grid up (Math.round behavior)', () => {
    // GRID_BASE_PX=20; 10 → round(0.5)*20 = 20 (banker's rounding caveat)
    // Math.round(0.5) = 1 in JS, so 10 → 20
    expect(snapToGrid(10)).toBe(20);
    // 30 → round(1.5)*20 = 2*20 = 40
    expect(snapToGrid(30)).toBe(40);
  });

  it('snaps to nearest grid line (round)', () => {
    // 5 → round(0.25)*20 = 0
    expect(snapToGrid(5)).toBe(0);
    // 9 → round(0.45)*20 = 0
    expect(snapToGrid(9)).toBe(0);
    // 11 → round(0.55)*20 = 20
    expect(snapToGrid(11)).toBe(20);
    // 19 → round(0.95)*20 = 20
    expect(snapToGrid(19)).toBe(20);
  });

  it('handles negative values', () => {
    expect(snapToGrid(-1)).toBe(-0); // very close to 0
    expect(snapToGrid(-11)).toBe(-20);
    expect(snapToGrid(-19)).toBe(-20);
    expect(snapToGrid(-30)).toBe(-20); // -1.5 → -1 (Math.round)
  });

  it('result always multiple of GRID_BASE_PX', () => {
    for (const value of [0, 7, 13, 17, 25, 100, 137, 256, -42]) {
      // Math.abs avoids -0 vs +0 mismatch in JS (Object.is(-0, 0) === false)
      expect(Math.abs(snapToGrid(value) % GRID_BASE_PX)).toBe(0);
    }
  });

  it('deterministic — same input → same output', () => {
    expect(snapToGrid(137)).toBe(snapToGrid(137));
    expect(snapToGrid(-42)).toBe(snapToGrid(-42));
  });
});

describe('getDeviceStyle', () => {
  it('closed → green fill + class', () => {
    const s = getDeviceStyle('closed');
    expect(s.fill).toBe(COLOR_DEVICE_CLOSED);
    expect(s.stroke).toBe(COLOR_DEVICE_CLOSED_BORDER);
    expect(s.className).toBe('sld-v2-device-closed');
    expect(s.strokeWidth).toBe(1.5);
  });

  it('open → panel-raised fill, red border', () => {
    const s = getDeviceStyle('open');
    expect(s.fill).toBe(COLOR_PANEL_RAISED);
    expect(s.stroke).toBe(COLOR_DEVICE_OPEN_BORDER);
    expect(s.className).toBe('sld-v2-device-open');
    expect(s.strokeWidth).toBe(1.5);
  });

  it('unknown → gray fill + muted stroke', () => {
    const s = getDeviceStyle('unknown');
    expect(s.fill).toBe(COLOR_DEVICE_UNKNOWN);
    expect(s.stroke).toBe(COLOR_TEXT_MUTED);
    expect(s.className).toBe('sld-v2-device-unknown');
  });

  it('fault → red fill + red border + thicker stroke', () => {
    const s = getDeviceStyle('fault');
    expect(s.fill).toBe(COLOR_DEVICE_FAULT);
    expect(s.stroke).toBe(COLOR_DEVICE_OPEN_BORDER);
    expect(s.strokeWidth).toBe(2);
    expect(s.className).toBe('sld-v2-device-fault');
  });

  it('selected → green fill + selection border + thickest stroke', () => {
    const s = getDeviceStyle('selected');
    expect(s.fill).toBe(COLOR_DEVICE_CLOSED);
    expect(s.stroke).toBe(COLOR_SELECTION);
    expect(s.strokeWidth).toBe(2.5);
    expect(s.className).toBe('sld-v2-device-selected');
  });

  it('all 5 states return defined styles', () => {
    const states: DeviceState[] = ['closed', 'open', 'unknown', 'fault', 'selected'];
    for (const state of states) {
      const s = getDeviceStyle(state);
      expect(s.fill).toBeTruthy();
      expect(s.stroke).toBeTruthy();
      expect(s.strokeWidth).toBeGreaterThan(0);
      expect(s.className).toMatch(/^sld-v2-device-/);
    }
  });

  it('state-style invariant — styles differ per state', () => {
    // Different states return different stroke/fill (or class), so visual
    // appearance changes — but geometry (separate concern) is unaffected.
    const closed = getDeviceStyle('closed');
    const open = getDeviceStyle('open');
    expect(closed.fill).not.toBe(open.fill);
    expect(closed.stroke).not.toBe(open.stroke);
  });

  it('deterministic — same state → same style', () => {
    const s1 = getDeviceStyle('closed');
    const s2 = getDeviceStyle('closed');
    expect(s1).toEqual(s2);
  });
});
