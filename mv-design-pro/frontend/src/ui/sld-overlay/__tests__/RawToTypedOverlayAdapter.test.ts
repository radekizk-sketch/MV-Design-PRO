import { describe, expect, it } from 'vitest';

import type { RawOverlayPayload } from '../rawResultOverlayStore';
import { adaptRawOverlayToTyped } from '../RawToTypedOverlayAdapter';

function raw(elements: RawOverlayPayload['elements']): RawOverlayPayload {
  return { run_id: 'run-1', analysis_type: 'LOAD_FLOW', elements };
}

describe('adaptRawOverlayToTyped', () => {
  it('konwertuje dict elementów na tablicę OverlayElement (element_ref ASC)', () => {
    const payload = adaptRawOverlayToTyped(
      raw({
        'BUS-B': {
          ref_id: 'BUS-B',
          kind: 'Bus',
          badges: [],
          metrics: { u_kv: { code: 'u_kv', value: 15.2, unit: 'kV' } },
          severity: 'INFO',
        },
        'BUS-A': {
          ref_id: 'BUS-A',
          kind: 'Bus',
          badges: [],
          metrics: { u_kv: { code: 'u_kv', value: 14.8, unit: 'kV' } },
          severity: 'WARNING',
        },
      }),
    );
    expect(payload).not.toBeNull();
    expect(payload!.run_id).toBe('run-1');
    expect(payload!.elements.map((e) => e.element_ref)).toEqual(['BUS-A', 'BUS-B']);
    const a = payload!.elements[0];
    expect(a.element_type).toBe('Bus');
    expect(a.visual_state).toBe('WARNING');
    expect(a.numeric_badges.u_kv).toBe(14.8);
  });

  it('mapuje severity backendu na visual_state (INFO→OK, IMPORTANT→WARNING, CRITICAL→CRITICAL)', () => {
    const mk = (sev: string) =>
      adaptRawOverlayToTyped(
        raw({ X: { ref_id: 'X', kind: 'Bus', badges: [], metrics: {}, severity: sev } }),
      )!.elements[0].visual_state;
    expect(mk('INFO')).toBe('OK');
    expect(mk('WARNING')).toBe('WARNING');
    expect(mk('IMPORTANT')).toBe('WARNING');
    expect(mk('CRITICAL')).toBe('CRITICAL');
    expect(mk('nieznane')).toBe('OK');
  });

  it('CRITICAL → stroke thick; token koloru z visual_state', () => {
    const el = adaptRawOverlayToTyped(
      raw({ X: { ref_id: 'X', kind: 'Branch', badges: [], metrics: {}, severity: 'CRITICAL' } }),
    )!.elements[0];
    expect(el.stroke_token).toBe('thick');
    expect(el.color_token).toBe('critical');
  });

  it('null/pusty payload → null (uczciwy stan zerowy)', () => {
    expect(adaptRawOverlayToTyped(null)).toBeNull();
    expect(adaptRawOverlayToTyped(raw({}))).toBeNull();
  });

  it('metryka bez wartości → null badge (bez fabrykacji)', () => {
    const el = adaptRawOverlayToTyped(
      raw({
        X: {
          ref_id: 'X',
          kind: 'Bus',
          badges: [],
          metrics: { p_mw: { code: 'p_mw', value: null, unit: 'MW' } },
          severity: 'INFO',
        },
      }),
    )!.elements[0];
    expect(el.numeric_badges.p_mw).toBeNull();
  });

  it('jest deterministyczny', () => {
    const p = raw({
      X: { ref_id: 'X', kind: 'Bus', badges: [], metrics: {}, severity: 'INFO' },
    });
    expect(adaptRawOverlayToTyped(p)).toEqual(adaptRawOverlayToTyped(p));
  });
});
