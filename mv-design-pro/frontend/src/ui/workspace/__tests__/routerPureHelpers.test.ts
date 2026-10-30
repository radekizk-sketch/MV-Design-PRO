// @vitest-environment node
import { describe, expect, it } from 'vitest';
// `auditProofPackStatus` usunięty (karta WERDYKT-MIGRACJA-190): pakiet nie ma werdyktu
// zbiorczego — intencja „brak danych ≠ spełnia” jest przypięta w PakietDowodowRozszerzen.test.
import { resolveLatestCompletedRun } from '../routerPureHelpers';

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
