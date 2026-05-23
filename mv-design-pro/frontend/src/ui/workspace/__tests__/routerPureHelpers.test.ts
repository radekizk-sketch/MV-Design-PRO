import { describe, expect, it } from 'vitest';
import {
  auditProofPackStatus,
  resolveLatestCompletedRun,
  generateIec60255SiCurvePoints,
} from '../routerPureHelpers';

describe('auditProofPackStatus', () => {
  it('zwraca "Brak dowodów" gdy proof_count = 0', () => {
    const r = auditProofPackStatus({ proof_count: 0, all_pass: true } as never);
    expect(r.label).toContain('Brak dowodów');
    expect(r.className).toContain('amber');
  });

  it('zwraca "Weryfikacja pozytywna" gdy all_pass=true', () => {
    const r = auditProofPackStatus({ proof_count: 5, all_pass: true } as never);
    expect(r.label).toContain('pozytywna');
    expect(r.className).toContain('emerald');
  });

  it('zwraca "Wymaga sprawdzenia" gdy all_pass=false', () => {
    const r = auditProofPackStatus({ proof_count: 5, all_pass: false } as never);
    expect(r.label).toContain('sprawdzenia');
    expect(r.className).toContain('rose');
  });
});

describe('resolveLatestCompletedRun', () => {
  it('zwraca najnowszy DONE run', () => {
    const runs = [
      { id: 'r1', status: 'DONE', finished_at: '2026-05-01T10:00:00Z' },
      { id: 'r2', status: 'DONE', finished_at: '2026-05-03T10:00:00Z' },
      { id: 'r3', status: 'DONE', finished_at: '2026-05-02T10:00:00Z' },
    ] as never;
    const r = resolveLatestCompletedRun(runs);
    expect(r?.id).toBe('r2');
  });

  it('null gdy żaden DONE', () => {
    const runs = [
      { id: 'r1', status: 'PENDING', finished_at: null },
    ] as never;
    expect(resolveLatestCompletedRun(runs)).toBe(null);
  });

  it('pomija non-DONE runy', () => {
    const runs = [
      { id: 'r1', status: 'PENDING', finished_at: '2026-05-05T10:00:00Z' },
      { id: 'r2', status: 'DONE', finished_at: '2026-05-01T10:00:00Z' },
    ] as never;
    expect(resolveLatestCompletedRun(runs)?.id).toBe('r2');
  });
});

describe('generateIec60255SiCurvePoints', () => {
  it('zwraca 9 punktów (1.05x do 100x pickup)', () => {
    const points = generateIec60255SiCurvePoints(100, 0.1);
    expect(points).toHaveLength(9);
  });

  it('current_a = pickup × multiple', () => {
    const points = generateIec60255SiCurvePoints(100, 0.1);
    expect(points[0].current_a).toBeCloseTo(105, 0);
    expect(points[points.length - 1].current_a).toBe(10000);
  });

  it('time monotonicznie maleje z multiple', () => {
    const points = generateIec60255SiCurvePoints(100, 0.5);
    for (let i = 1; i < points.length; i++) {
      expect(points[i].time_s).toBeLessThanOrEqual(points[i - 1].time_s);
    }
  });

  it('time cap na 60s dla niskich krotności', () => {
    const points = generateIec60255SiCurvePoints(100, 10);
    expect(points[0].time_s).toBeLessThanOrEqual(60);
  });

  it('TMS=0 → wszystkie czasy = 0', () => {
    const points = generateIec60255SiCurvePoints(100, 0);
    expect(points.every((p) => p.time_s === 0)).toBe(true);
  });
});
