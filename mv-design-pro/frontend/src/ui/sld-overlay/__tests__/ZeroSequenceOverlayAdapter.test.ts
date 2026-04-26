/**
 * Tests for ZeroSequenceOverlayAdapter — Pakiet E.
 *
 * Sprawdza:
 *   - Severity → visual_state (deterministic)
 *   - Sort element_ref ASC
 *   - numeric_badges: i0_a, u0_kv
 *   - animation_token: flow_forward/flow_reverse
 *   - Legend Polish strings
 */

import { describe, expect, it } from 'vitest';

import {
  adaptZeroSequenceToOverlay,
} from '../ZeroSequenceOverlayAdapter';
import type { ZeroSequenceResultV1 } from '../ZeroSequenceOverlayAdapter';

describe('ZeroSequenceOverlayAdapter — projekcja wyników 3I0/3U0', () => {
  it('zwraca payload z analysis_type EARTHING_GROUND_FAULT_SN', () => {
    const result: ZeroSequenceResultV1 = {
      run_id: 'RUN_1',
      ground_fault_active: false,
      elements: [],
    };
    const overlay = adaptZeroSequenceToOverlay(result);
    expect(overlay.run_id).toBe('RUN_1');
    expect(overlay.analysis_type).toBe('EARTHING_GROUND_FAULT_SN');
  });

  it('sortuje elementy po element_ref ASC (determinizm)', () => {
    const result: ZeroSequenceResultV1 = {
      run_id: 'R',
      ground_fault_active: false,
      elements: [
        { element_id: 'C', severity: 'INFO' },
        { element_id: 'A', severity: 'INFO' },
        { element_id: 'B', severity: 'INFO' },
      ],
    };
    const overlay = adaptZeroSequenceToOverlay(result);
    expect(overlay.elements.map((e) => e.element_ref)).toEqual(['A', 'B', 'C']);
  });

  it('mapuje severity INFO/WARN/HIGH → OK/WARNING/CRITICAL', () => {
    const result: ZeroSequenceResultV1 = {
      run_id: 'R',
      ground_fault_active: true,
      elements: [
        { element_id: 'a', severity: 'INFO' },
        { element_id: 'b', severity: 'WARN' },
        { element_id: 'c', severity: 'HIGH' },
      ],
    };
    const overlay = adaptZeroSequenceToOverlay(result);
    expect(overlay.elements[0].visual_state).toBe('OK');
    expect(overlay.elements[1].visual_state).toBe('WARNING');
    expect(overlay.elements[2].visual_state).toBe('CRITICAL');
  });

  it('numeric_badges zawierają i0_a i u0_kv', () => {
    const result: ZeroSequenceResultV1 = {
      run_id: 'R',
      ground_fault_active: false,
      elements: [
        { element_id: 'a', severity: 'INFO', i0_a: 25.5, u0_kv: 0.12 },
      ],
    };
    const overlay = adaptZeroSequenceToOverlay(result);
    expect(overlay.elements[0].numeric_badges.i0_a).toBe(25.5);
    expect(overlay.elements[0].numeric_badges.u0_kv).toBe(0.12);
  });

  it('numeric_badges pominięte gdy brak wartości', () => {
    const result: ZeroSequenceResultV1 = {
      run_id: 'R',
      ground_fault_active: false,
      elements: [{ element_id: 'a', severity: 'INFO' }],
    };
    const overlay = adaptZeroSequenceToOverlay(result);
    expect(overlay.elements[0].numeric_badges).toEqual({});
  });

  it('direction → animation_token (forward/reverse/none)', () => {
    const result: ZeroSequenceResultV1 = {
      run_id: 'R',
      ground_fault_active: true,
      elements: [
        { element_id: 'a', severity: 'WARN', i0_a: 10, direction: 'forward' },
        { element_id: 'b', severity: 'WARN', i0_a: 10, direction: 'reverse' },
        { element_id: 'c', severity: 'WARN', i0_a: 10, direction: 'none' },
      ],
    };
    const overlay = adaptZeroSequenceToOverlay(result);
    expect(overlay.elements[0].animation_token).toBe('flow_forward');
    expect(overlay.elements[1].animation_token).toBe('flow_reverse');
    expect(overlay.elements[2].animation_token).toBeNull();
  });

  it('stroke_token: HIGH → thick, inne → normal', () => {
    const result: ZeroSequenceResultV1 = {
      run_id: 'R',
      ground_fault_active: true,
      elements: [
        { element_id: 'a', severity: 'INFO' },
        { element_id: 'b', severity: 'HIGH' },
      ],
    };
    const overlay = adaptZeroSequenceToOverlay(result);
    expect(overlay.elements[0].stroke_token).toBe('normal');
    expect(overlay.elements[1].stroke_token).toBe('thick');
  });

  it('legenda — 3 wpisy w PL (zwarcie aktywne)', () => {
    const result: ZeroSequenceResultV1 = {
      run_id: 'R',
      ground_fault_active: true,
      elements: [],
    };
    const overlay = adaptZeroSequenceToOverlay(result);
    expect(overlay.legend).toHaveLength(3);
    expect(overlay.legend[2].label).toMatch(/Zwarcie doziemne aktywne/);
  });

  it('legenda warianta dla nieaktywnego zwarcia', () => {
    const result: ZeroSequenceResultV1 = {
      run_id: 'R',
      ground_fault_active: false,
      elements: [],
    };
    const overlay = adaptZeroSequenceToOverlay(result);
    expect(overlay.legend[2].label).toMatch(/Krytyczne 3U/);
  });

  it('determinizm: 100 wywołań → ten sam payload', () => {
    const result: ZeroSequenceResultV1 = {
      run_id: 'R',
      ground_fault_active: false,
      elements: [
        { element_id: 'B', severity: 'INFO', i0_a: 1.0 },
        { element_id: 'A', severity: 'WARN', i0_a: 5.0 },
      ],
    };
    const first = JSON.stringify(adaptZeroSequenceToOverlay(result));
    for (let i = 0; i < 100; i += 1) {
      expect(JSON.stringify(adaptZeroSequenceToOverlay(result))).toBe(first);
    }
  });
});
