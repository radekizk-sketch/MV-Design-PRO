import { describe, expect, it } from 'vitest';

import {
  adaptOltcControlToOverlay,
  formatOltcPositionLabel,
  type OltcControlResultV1,
} from '../OltcOverlayAdapter';

describe('formatOltcPositionLabel', () => {
  it('formatuje pozycję ze znakiem (minus typograficzny)', () => {
    expect(formatOltcPositionLabel(0)).toBe('poz. 0');
    expect(formatOltcPositionLabel(2)).toBe('poz. +2');
    expect(formatOltcPositionLabel(-3)).toBe('poz. −3');
  });
});

describe('adaptOltcControlToOverlay', () => {
  const base: OltcControlResultV1 = {
    run_id: 'run-1',
    converged: true,
    final_positions: { 'TR-B': 3, 'TR-A': -2 },
    switch_counts: { 'TR-B': 4, 'TR-A': 1 },
  };

  it('tworzy element overlay per transformator z badge pozycji i przełączeń', () => {
    const payload = adaptOltcControlToOverlay(base);
    expect(payload.run_id).toBe('run-1');
    expect(payload.analysis_type).toBe('PF');
    expect(payload.elements).toHaveLength(2);
    const trB = payload.elements.find((e) => e.element_ref === 'TR-B');
    expect(trB?.numeric_badges.tap_position).toBe(3);
    expect(trB?.numeric_badges.switch_count).toBe(4);
    expect(trB?.element_type).toBe('TransformerBranch');
    expect(trB?.visual_state).toBe('OK');
  });

  it('sortuje element_id rosnąco (determinizm)', () => {
    const payload = adaptOltcControlToOverlay(base);
    expect(payload.elements.map((e) => e.element_ref)).toEqual(['TR-A', 'TR-B']);
  });

  it('brak zbieżności → WARNING i token ostrzeżenia', () => {
    const payload = adaptOltcControlToOverlay({ ...base, converged: false });
    expect(payload.elements[0].visual_state).toBe('WARNING');
    expect(payload.elements[0].color_token).toBe('warning');
  });

  it('brak switch_counts → badge tylko pozycji (bez fabrykacji)', () => {
    const payload = adaptOltcControlToOverlay({
      run_id: 'r',
      converged: true,
      final_positions: { 'TR-A': 0 },
    });
    const el = payload.elements[0];
    expect(el.numeric_badges.tap_position).toBe(0);
    expect('switch_count' in el.numeric_badges).toBe(false);
  });

  it('pusta lista pozycji → pusty overlay (uczciwy stan zerowy)', () => {
    const payload = adaptOltcControlToOverlay({
      run_id: 'r',
      converged: true,
      final_positions: {},
    });
    expect(payload.elements).toEqual([]);
  });

  it('jest deterministyczny', () => {
    expect(adaptOltcControlToOverlay(base)).toEqual(adaptOltcControlToOverlay(base));
  });
});
