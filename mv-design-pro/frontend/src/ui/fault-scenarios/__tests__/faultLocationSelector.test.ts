import { describe, expect, it } from 'vitest';
import {
  describeFaultLocationKind,
  describeFaultLocation,
  getFaultLocationContext,
  buildFaultLocationOptions,
  calculatePositionAlongBranchPct,
} from '../faultLocationSelector';

describe('describeFaultLocationKind', () => {
  it('zwraca PL label per kind', () => {
    expect(describeFaultLocationKind('bus')).toBe('Szyna');
    expect(describeFaultLocationKind('branch_far')).toContain('koniec');
    expect(describeFaultLocationKind('branch_near')).toContain('początek');
    expect(describeFaultLocationKind('branch_middle')).toContain('środek');
    expect(describeFaultLocationKind('terminal')).toContain('Terminal');
    expect(describeFaultLocationKind('station')).toContain('Stacja');
  });
});

describe('describeFaultLocation', () => {
  it('format: "Kind (elementName)"', () => {
    const desc = describeFaultLocation({
      kind: 'bus',
      elementRef: 'bus-1',
      elementName: 'Szyna A',
      description: '',
    });
    expect(desc).toContain('Szyna');
    expect(desc).toContain('Szyna A');
  });
});

describe('getFaultLocationContext', () => {
  it('zwraca opis fizyczny', () => {
    expect(getFaultLocationContext('bus')).toContain('I_k_max');
    expect(getFaultLocationContext('branch_far')).toContain('Najniższy');
    expect(getFaultLocationContext('branch_middle')).toContain('50%');
  });
});

describe('buildFaultLocationOptions', () => {
  it('zwraca opcje dla buses', () => {
    const options = buildFaultLocationOptions({
      buses: [{ ref: 'b1', name: 'GPZ A', voltageKv: 15 }],
      branches: [],
      terminals: [],
    });
    expect(options).toHaveLength(1);
    expect(options[0].kind).toBe('bus');
  });

  it('branches: 3 opcje per branch (near/middle/far)', () => {
    const options = buildFaultLocationOptions({
      buses: [],
      branches: [{ ref: 'br1', name: 'Linia 1', voltageKv: 15 }],
      terminals: [],
    });
    expect(options).toHaveLength(3);
    const kinds = options.map((o) => o.kind);
    expect(kinds).toContain('branch_near');
    expect(kinds).toContain('branch_middle');
    expect(kinds).toContain('branch_far');
  });

  it('terminals', () => {
    const options = buildFaultLocationOptions({
      buses: [],
      branches: [],
      terminals: [{ ref: 't1', name: 'Terminal pole 1', voltageKv: 15 }],
    });
    expect(options).toHaveLength(1);
    expect(options[0].kind).toBe('terminal');
  });
});

describe('calculatePositionAlongBranchPct', () => {
  it('near=5%, middle=50%, far=95%', () => {
    expect(calculatePositionAlongBranchPct('branch_near')).toBe(0.05);
    expect(calculatePositionAlongBranchPct('branch_middle')).toBe(0.50);
    expect(calculatePositionAlongBranchPct('branch_far')).toBe(0.95);
  });

  it('inne kindy → 100%', () => {
    expect(calculatePositionAlongBranchPct('bus')).toBe(1.00);
    expect(calculatePositionAlongBranchPct('terminal')).toBe(1.00);
  });
});
