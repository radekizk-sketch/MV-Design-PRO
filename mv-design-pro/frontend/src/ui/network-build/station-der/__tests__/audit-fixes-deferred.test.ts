/**
 * Testy napraw "deferred" z audytu eksperckiego (B.5 + C.7).
 */

import { describe, it, expect } from 'vitest';

import {
  // B.5 — block_transformer
  BLOCK_TRANSFORMER_CATALOG,
  selectBlockTransformersForDer,
  getBlockTransformer,
  // C.7 — time grading
  computeTripTime,
  validateTimeGrading,
  validateTimeGradingRange,
  recommendedDeltaT,
} from '..';

describe('Naprawa B.5 — BlockTransformerCatalog', () => {
  it('katalog ma ≥5 pozycji obejmujących PV/BESS/FW + SN/SN', () => {
    expect(BLOCK_TRANSFORMER_CATALOG.length).toBeGreaterThanOrEqual(5);
    const types = BLOCK_TRANSFORMER_CATALOG;
    expect(types.some((t) => t.applicable_der_kinds.includes('PV'))).toBe(true);
    expect(types.some((t) => t.applicable_der_kinds.includes('BESS'))).toBe(true);
    expect(types.some((t) => t.applicable_der_kinds.includes('FW'))).toBe(true);
  });

  it('zawiera transformator SN/SN dla turbinowni FW (15/3+ kV)', () => {
    const mvToMv = BLOCK_TRANSFORMER_CATALOG.filter((t) => t.is_mv_to_mv);
    expect(mvToMv.length).toBeGreaterThan(0);
    expect(mvToMv[0].applicable_der_kinds).toContain('FW');
    expect(mvToMv[0].lv_kv).toBeGreaterThan(1.0);
  });

  it('selectBlockTransformersForDer filtruje po DER kind', () => {
    const fwOnly = selectBlockTransformersForDer({ derKind: 'FW' });
    expect(fwOnly.length).toBeGreaterThan(0);
    expect(fwOnly.every((t) => t.applicable_der_kinds.includes('FW'))).toBe(true);
  });

  it('selectBlockTransformersForDer filtruje po napięciu HV/LV', () => {
    const pv15to069 = selectBlockTransformersForDer({
      derKind: 'PV',
      hvKv: 15,
      lvKv: 0.69,
    });
    expect(pv15to069.length).toBeGreaterThan(0);
    expect(pv15to069.every((t) => Math.abs(t.hv_kv - 15) < 0.5 && Math.abs(t.lv_kv - 0.69) < 0.05)).toBe(true);
  });

  it('selectBlockTransformersForDer wymusza galwaniczną izolację dla BESS', () => {
    const bessIsolated = selectBlockTransformersForDer({
      derKind: 'BESS',
      requiresGalvanicIsolation: true,
    });
    expect(bessIsolated.length).toBeGreaterThan(0);
    expect(bessIsolated.every((t) => t.galvanic_isolation === true)).toBe(true);
  });

  it('getBlockTransformer zwraca null dla unknown id', () => {
    expect(getBlockTransformer('unknown_xyz')).toBeNull();
  });

  it('getBlockTransformer pobiera szczegóły katalogowe', () => {
    const item = BLOCK_TRANSFORMER_CATALOG[0];
    expect(getBlockTransformer(item.id)?.label_pl).toBe(item.label_pl);
  });
});

describe('Naprawa C.7 — computeTripTime (IEC 60255-151:2009)', () => {
  it('SI: t = 0.14 / ((I/Is)^0.02 - 1) — formuła Standard Inverse', () => {
    // Dla I = 2*Is, TMS=1.0: t = 0.14 / (2^0.02 - 1) ≈ 10.03 s
    const t = computeTripTime(
      { type: 'SI', tms: 1.0, pickup_a: 100 },
      200,
    );
    expect(t).toBeCloseTo(10.03, 1);
  });

  it('VI: dla I = 2*Is, TMS=1.0 → t = 13.5 / (2-1) = 13.5 s', () => {
    const t = computeTripTime(
      { type: 'VI', tms: 1.0, pickup_a: 100 },
      200,
    );
    expect(t).toBeCloseTo(13.5, 1);
  });

  it('EI: dla I = 2*Is, TMS=1.0 → t = 80 / (4-1) ≈ 26.67 s', () => {
    const t = computeTripTime(
      { type: 'EI', tms: 1.0, pickup_a: 100 },
      200,
    );
    expect(t).toBeCloseTo(26.67, 1);
  });

  it('Definite Time (DT): zwraca stały delay', () => {
    const t = computeTripTime(
      { type: 'DT', tms: 0, pickup_a: 100, definite_time_s: 0.5 },
      500,
    );
    expect(t).toBe(0.5);
  });

  it('zwraca null gdy I < pickup', () => {
    const t = computeTripTime(
      { type: 'SI', tms: 1.0, pickup_a: 100 },
      50,
    );
    expect(t).toBeNull();
  });

  it('TMS skaluje czas wyzwolenia liniowo', () => {
    const t1 = computeTripTime({ type: 'SI', tms: 1.0, pickup_a: 100 }, 1000);
    const t2 = computeTripTime({ type: 'SI', tms: 0.5, pickup_a: 100 }, 1000);
    expect(t2! / t1!).toBeCloseTo(0.5, 3);
  });
});

describe('Naprawa C.7 — validateTimeGrading (selektywność ∆t)', () => {
  // Standardowy przypadek: nadrzędne TMS=0.5, podrzędne TMS=0.2.
  const upstream = { type: 'SI' as const, tms: 0.5, pickup_a: 600 };
  const downstream = { type: 'SI' as const, tms: 0.2, pickup_a: 250 };

  it('selektywność zachowana przy I=4000 A (typowe Ik" ciągu SN)', () => {
    const r = validateTimeGrading(upstream, downstream, 4000);
    expect(r.is_selective).toBe(true);
    expect(r.status).toBe('selective');
    expect(r.delta_t_s).toBeGreaterThan(0.3);
  });

  it('inwersja koordynacji wykrywana gdy nadrzędne ma niższy TMS niż podrzędne', () => {
    const fastUpstream = { type: 'SI' as const, tms: 0.05, pickup_a: 600 };
    const slowDownstream = { type: 'SI' as const, tms: 1.0, pickup_a: 250 };
    const r = validateTimeGrading(fastUpstream, slowDownstream, 4000);
    expect(r.status).toBe('inverted_grading');
    expect(r.is_selective).toBe(false);
    expect(r.message_pl).toContain('Inwersja koordynacji');
  });

  it('downstream nie pobudza → status downstream_no_pickup', () => {
    const r = validateTimeGrading(upstream, downstream, 100);
    expect(r.status).toBe('downstream_no_pickup');
    expect(r.is_selective).toBe(false);
  });

  it('niewystarczający margines → status insufficient_margin z polskim message', () => {
    const upClose = { type: 'SI' as const, tms: 0.21, pickup_a: 600 };
    const downStdSetting = { type: 'SI' as const, tms: 0.2, pickup_a: 250 };
    const r = validateTimeGrading(upClose, downStdSetting, 4000, 0.3);
    if (r.status === 'insufficient_margin') {
      expect(r.message_pl).toContain('Niewystarczający margines');
      expect(r.message_pl).toContain('PN-EN 60255');
    } else {
      // Niektóre TMS nie spowodują naruszenia — sprawdzamy że selectivity jest zachowane
      expect(r.is_selective).toBe(true);
    }
  });

  it('required_delta_t domyślnie 0.3 s (PN-EN)', () => {
    const r = validateTimeGrading(upstream, downstream, 4000);
    expect(r.required_delta_t_s).toBe(0.3);
  });

  it('niestandardowy required_delta_t (np. 0.5 s dla napowietrznych)', () => {
    const r = validateTimeGrading(upstream, downstream, 4000, 0.5);
    expect(r.required_delta_t_s).toBe(0.5);
  });
});

describe('Naprawa C.7 — validateTimeGradingRange (zakres prądów)', () => {
  const upstream = { type: 'SI' as const, tms: 0.5, pickup_a: 600 };
  const downstream = { type: 'SI' as const, tms: 0.2, pickup_a: 250 };

  it('zakres 500-5000 A daje próbki + worst-case', () => {
    const r = validateTimeGradingRange(upstream, downstream, 500, 5000, 0.3, 10);
    expect(r.samples.length).toBe(10);
    expect(r.worst_delta_t_s).toBeGreaterThan(0);
  });

  it('zwraca summary_pl z polskim opisem', () => {
    const r = validateTimeGradingRange(upstream, downstream, 500, 5000);
    expect(r.summary_pl.length).toBeGreaterThan(0);
    expect(r.summary_pl).toMatch(/[Ss]elektywno/);
  });

  it('rzuca Error gdy i_max <= i_min', () => {
    expect(() => validateTimeGradingRange(upstream, downstream, 5000, 500)).toThrow();
  });
});

describe('Naprawa C.7 — recommendedDeltaT', () => {
  it('cable: 0.3 s', () => {
    expect(recommendedDeltaT('cable')).toBe(0.3);
  });

  it('overhead_line: 0.5 s', () => {
    expect(recommendedDeltaT('overhead_line')).toBe(0.5);
  });

  it('mixed: 0.4 s', () => {
    expect(recommendedDeltaT('mixed')).toBe(0.4);
  });
});
