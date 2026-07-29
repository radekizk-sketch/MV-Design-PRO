import { describe, expect, it } from 'vitest';
import {
  auditProofPackStatus,
  resolveLatestCompletedRun,
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

// Testy generateIec60255SiCurvePoints USUNIĘTE w karcie F-E5b wraz z generatorem:
// fizyka krzywej IEC 60255 nie należy do warstwy prezentacji (krzywe TCC
// dostarcza backend). Świadomie NIE przeniesione do testów backendu — intencją
// karty jest usunięcie fizyki z UI, nie jej duplikacja.
