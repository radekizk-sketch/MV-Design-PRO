import { describe, expect, it } from 'vitest';
import { idmtTime, evaluateCoordination } from '../tmsCoordination';

describe('idmtTime IEC 60255-151', () => {
  it('SI krzywa: TMS=0.1, I/Ip=10 → ~0.30s', () => {
    // t = 0.1 × 0.14 / (10^0.02 - 1) = 0.0140 / 0.04713 ≈ 0.297s
    const t = idmtTime(1000, 100, 0.1, 'SI');
    expect(t).toBeGreaterThan(0.25);
    expect(t).toBeLessThan(0.35);
  });

  it('VI krzywa wolniej dla niższych krotności', () => {
    const tSI = idmtTime(200, 100, 1, 'SI');
    const tVI = idmtTime(200, 100, 1, 'VI');
    expect(tVI).toBeGreaterThan(tSI);
  });

  it('EI krzywa szybciej dla wysokich krotności', () => {
    const tEI = idmtTime(1000, 100, 1, 'EI');
    const tSI = idmtTime(1000, 100, 1, 'SI');
    expect(tEI).toBeLessThan(tSI);
  });

  it('DT (definite time) zwraca TMS jako t', () => {
    expect(idmtTime(500, 100, 0.5, 'DT')).toBe(0.5);
  });

  it('I < Ipickup → t = Infinity (nie zadziała)', () => {
    expect(idmtTime(50, 100, 0.1, 'SI')).toBe(Infinity);
  });
});

describe('evaluateCoordination', () => {
  it('selective gdy ∆t ≥ CTI', () => {
    const verdict = evaluateCoordination({
      downstream: { tms: 0.1, pickup: 100, curve: 'SI' },
      upstream: { tms: 0.3, pickup: 200, curve: 'SI' },
      faultCurrent: 1000,
      ctiMin: 0.3,
    });
    expect(verdict.selective).toBe(true);
    expect(verdict.actualCti).toBeGreaterThanOrEqual(0.3);
  });

  it('non-selective gdy ∆t < CTI, sugeruje TMS adjustment', () => {
    const verdict = evaluateCoordination({
      downstream: { tms: 0.5, pickup: 100, curve: 'SI' },
      upstream: { tms: 0.1, pickup: 200, curve: 'SI' },
      faultCurrent: 1000,
      ctiMin: 0.3,
    });
    expect(verdict.selective).toBe(false);
    expect(verdict.recommendedTmsAdjustment).toBeGreaterThan(0);
    expect(verdict.message).toContain('Zwiększ TMS');
  });

  it('default CTI = 0.3s', () => {
    const verdict = evaluateCoordination({
      downstream: { tms: 0.1, pickup: 100, curve: 'SI' },
      upstream: { tms: 0.2, pickup: 200, curve: 'SI' },
      faultCurrent: 1000,
    });
    // Message powinien zawierać 0.30 default
    expect(verdict.message).toMatch(/0\.30/);
  });

  it('brak prądu zwarcia → selective=false', () => {
    const verdict = evaluateCoordination({
      downstream: { tms: 0.1, pickup: 1000, curve: 'SI' },
      upstream: { tms: 0.2, pickup: 2000, curve: 'SI' },
      faultCurrent: 500,
    });
    expect(verdict.selective).toBe(false);
    expect(verdict.message).toMatch(/poniżej pickupa|niemożliwa/);
  });
});
