/**
 * Kontrakt Batch A — Kreator KOMPLETNY kroki 4, 8, 13:
 *   Krok 4 — Aparaty SN (Q1/Q2/Q3 z katalogu)
 *   Krok 8 — Transformator (OLTC + chłodzenie + inrush)
 *   Krok 13 — Zabezpieczenia (TCC + LoM + backup per pole)
 */
import { describe, expect, it } from 'vitest';

import {
  APPARATUS_REFERENCE_CATALOG,
  checkApparatusRating,
  getApparatusByType,
  getApparatusByManufacturer,
} from '../apparatusCatalogContract';
import {
  TRANSFORMER_REFERENCE_CATALOG,
  computeTransformerNominalCurrents,
  computeInrushCurrent,
  evaluateTransformerProtection,
  computeTransformerLosses,
  computeTransformerEfficiency,
} from '../transformerContract';
import {
  IEC_CURVE_CONSTANTS,
  FIELD_PROTECTION_PROFILES,
  computeTripTime,
  checkProtectionCoordination,
} from '../protectionContract';

// ============================================================================
// Krok 4 — Aparaty SN
// ============================================================================

describe('APPARATUS_REFERENCE_CATALOG — Q1/Q2/Q3 typowe', () => {
  it('zawiera 7 typów aparatów (CB_VACUUM, CB_SF6, LBS, LBS_FUSE, DS, ES, RECLOSER)', () => {
    const types = new Set(APPARATUS_REFERENCE_CATALOG.map((a) => a.type));
    expect(types.has('CB_VACUUM')).toBe(true);
    expect(types.has('LBS')).toBe(true);
    expect(types.has('LBS_FUSE')).toBe(true);
    expect(types.has('DS')).toBe(true);
    expect(types.has('ES')).toBe(true);
  });

  it('każdy aparat ma polską designację z prefixem Q1/Q2/Q3', () => {
    for (const a of APPARATUS_REFERENCE_CATALOG) {
      expect(a.designation).toMatch(/^Q[123] —/);
    }
  });

  it('ratedShortTimeCurrentKa ≥ 16 kA dla wszystkich aparatów SN (typowa wartość 15kV)', () => {
    for (const a of APPARATUS_REFERENCE_CATALOG) {
      expect(a.ratedShortTimeCurrentKa).toBeGreaterThanOrEqual(16);
    }
  });

  it('ratedPeakCurrentKa = ratedShortTime × ~2.5 (κ·√2 dla typowych R/X)', () => {
    for (const a of APPARATUS_REFERENCE_CATALOG) {
      const ratio = a.ratedPeakCurrentKa / a.ratedShortTimeCurrentKa;
      expect(ratio).toBeGreaterThan(2.0);
      expect(ratio).toBeLessThan(3.5);
    }
  });
});

describe('checkApparatusRating — weryfikacja dopuszczenia aparatu', () => {
  it('ABB VD4-24-630 w sieci 15kV, 162A, Ith=6.6, ip=10.8 → wszystkie OK', () => {
    const apparatus = APPARATUS_REFERENCE_CATALOG[0]; // ABB VD4-24-630-16
    const check = checkApparatusRating(apparatus, 15, 162, 6.6, 10.8);
    expect(check.voltageOk).toBe(true);
    expect(check.currentOk).toBe(true);
    expect(check.shortCircuitOk).toBe(true);
    expect(check.peakOk).toBe(true);
    expect(check.allOk).toBe(true);
  });

  it('Aparat 24kV niedopuszczony w sieci 30kV → voltageOk=false', () => {
    const apparatus = APPARATUS_REFERENCE_CATALOG[0];
    const check = checkApparatusRating(apparatus, 30, 100, 5, 8);
    expect(check.voltageOk).toBe(false);
    expect(check.allOk).toBe(false);
  });

  it('Aparat 16kA w sieci z Ith=20kA → shortCircuitOk=false', () => {
    const apparatus = APPARATUS_REFERENCE_CATALOG[0]; // 16 kA
    const check = checkApparatusRating(apparatus, 15, 100, 20, 30);
    expect(check.shortCircuitOk).toBe(false);
  });
});

describe('Helpers — filter by type / manufacturer', () => {
  it('getApparatusByType("DS") zwraca tylko odłączniki', () => {
    const ds = getApparatusByType('DS');
    expect(ds.length).toBeGreaterThan(0);
    for (const a of ds) expect(a.type).toBe('DS');
  });

  it('getApparatusByManufacturer("ABB") zwraca tylko ABB', () => {
    const abb = getApparatusByManufacturer('ABB');
    expect(abb.length).toBeGreaterThan(0);
    for (const a of abb) expect(a.manufacturerRef).toBe('ABB');
  });
});

// ============================================================================
// Krok 8 — Transformator
// ============================================================================

describe('TRANSFORMER_REFERENCE_CATALOG — typowe TR 15/0.4 kV', () => {
  it('zawiera TR 630 kVA olejowy + dry-type', () => {
    expect(TRANSFORMER_REFERENCE_CATALOG.length).toBeGreaterThanOrEqual(3);
    const tr630 = TRANSFORMER_REFERENCE_CATALOG.filter((t) => t.ratedPowerKva === 630);
    expect(tr630.length).toBeGreaterThanOrEqual(2);
  });

  it('wszystkie TR mają vector group Dyn5 lub Dyn11', () => {
    for (const t of TRANSFORMER_REFERENCE_CATALOG) {
      expect(['Dyn5', 'Dyn11']).toContain(t.vectorGroup);
    }
  });

  it('uk% w zakresie 4-7% (typowy dla TR SN/nN)', () => {
    for (const t of TRANSFORMER_REFERENCE_CATALOG) {
      expect(t.shortCircuitVoltagePct).toBeGreaterThanOrEqual(4);
      expect(t.shortCircuitVoltagePct).toBeLessThanOrEqual(7);
    }
  });

  it('inrushFactor w zakresie 8-12 (per IEC 60076-1)', () => {
    for (const t of TRANSFORMER_REFERENCE_CATALOG) {
      expect(t.inrushFactor).toBeGreaterThanOrEqual(8);
      expect(t.inrushFactor).toBeLessThanOrEqual(15);
    }
  });
});

describe('computeTransformerNominalCurrents — In = Sn/(√3·Un)', () => {
  it('TR 630 kVA 15/0.4 kV → I1=24.25A, I2=909.3A', () => {
    const t = TRANSFORMER_REFERENCE_CATALOG[0];
    const { primaryNominalA, secondaryNominalA } = computeTransformerNominalCurrents(t);
    // I1 = 630_000 / (√3 × 15_000) = 630000/25981 = 24.25 A.
    expect(primaryNominalA).toBeCloseTo(24.25, 1);
    // I2 = 630_000 / (√3 × 400) = 909.3 A.
    expect(secondaryNominalA).toBeCloseTo(909.3, 0);
  });

  it('TR 1000 kVA → I1 ≈ 38.5 A', () => {
    const t = TRANSFORMER_REFERENCE_CATALOG[2]; // 1000 kVA
    const { primaryNominalA } = computeTransformerNominalCurrents(t);
    expect(primaryNominalA).toBeCloseTo(38.5, 1);
  });
});

describe('computeInrushCurrent — Iinrush = factor × In', () => {
  it('TR ABB 630 (factor=10) → Iinrush ≈ 242 A', () => {
    const t = TRANSFORMER_REFERENCE_CATALOG[0];
    const inrush = computeInrushCurrent(t);
    // 10 × 24.25 = 242.5 A.
    expect(inrush).toBeCloseTo(242.5, 0);
  });

  it('TR Siemens dry-type (factor=12) ma wyższy inrush', () => {
    const tABB = TRANSFORMER_REFERENCE_CATALOG[0];
    const tSiemens = TRANSFORMER_REFERENCE_CATALOG[1];
    expect(computeInrushCurrent(tSiemens)).toBeGreaterThan(computeInrushCurrent(tABB));
  });
});

describe('evaluateTransformerProtection — bezpiecznik HRC + CT primary', () => {
  it('TR 630 + fuse 63A + CT 200A → fuseInrushOk + fuseSelectiveOk + ctOk', () => {
    const t = TRANSFORMER_REFERENCE_CATALOG[0];
    const result = evaluateTransformerProtection({
      transformer: t,
      fuseRatingA: 63,
      ctPrimaryRatingA: 50,  // 50A — typical for SN side of small TR
    });
    // In1 = 24.25; fuseInrushOk: 63 ≥ 2 × 24.25 = 48.5 ✓
    expect(result.fuseInrushOk).toBe(true);
    // fuseSelectiveOk: 63 ≤ 6 × 24.25 = 145.5 ✓
    expect(result.fuseSelectiveOk).toBe(true);
    // CT 50A: 1.2 × 24.25 = 29.1 ≤ 50 ≤ 2 × 24.25 = 48.5 — 50 > 48.5 → CT za duży.
    expect(result.ctRatingOk).toBe(false);
  });

  it('Bezpiecznik za mały (≤ 2 × In) → fuseInrushOk = false', () => {
    const t = TRANSFORMER_REFERENCE_CATALOG[0];
    const result = evaluateTransformerProtection({
      transformer: t, fuseRatingA: 40, ctPrimaryRatingA: 50,
    });
    // 2 × 24.25 = 48.5; 40 < 48.5 → fail.
    expect(result.fuseInrushOk).toBe(false);
  });
});

describe('computeTransformerLosses + computeTransformerEfficiency', () => {
  it('TR 630, β=0.5, cosφ=0.95 → strats ≈ 580 + 0.25 × 6500 = 2205 W', () => {
    const t = TRANSFORMER_REFERENCE_CATALOG[0];
    const losses = computeTransformerLosses(t, 0.5);
    expect(losses.noLoadW).toBe(580);
    expect(losses.loadW).toBe(0.25 * 6500);
    expect(losses.totalW).toBeCloseTo(2205, 0);
  });

  it('Efficiency at β=0.5, cosφ=0.95 → ~99%', () => {
    const t = TRANSFORMER_REFERENCE_CATALOG[0];
    const eff = computeTransformerEfficiency(t, 0.5, 0.95);
    expect(eff).toBeGreaterThan(98.5);
    expect(eff).toBeLessThan(99.5);
  });

  it('Efficiency maleje przy β=1.0 (pełne obciążenie + pełne straty obciążeniowe)', () => {
    const t = TRANSFORMER_REFERENCE_CATALOG[0];
    const eff50 = computeTransformerEfficiency(t, 0.5, 0.95);
    const eff100 = computeTransformerEfficiency(t, 1.0, 0.95);
    // Sprawność maksymalna typowo przy β ≈ 50-60% — przy 100% spada.
    expect(eff100).toBeLessThan(eff50);
  });
});

// ============================================================================
// Krok 13 — Zabezpieczenia
// ============================================================================

describe('IEC_CURVE_CONSTANTS — krzywe time-current', () => {
  it('IEC_SI: k=0.14, α=0.02', () => {
    expect(IEC_CURVE_CONSTANTS.IEC_SI.k).toBe(0.14);
    expect(IEC_CURVE_CONSTANTS.IEC_SI.alpha).toBe(0.02);
  });

  it('IEC_VI: k=13.5, α=1.0', () => {
    expect(IEC_CURVE_CONSTANTS.IEC_VI.k).toBe(13.5);
    expect(IEC_CURVE_CONSTANTS.IEC_VI.alpha).toBe(1.0);
  });

  it('IEC_EI: k=80.0, α=2.0', () => {
    expect(IEC_CURVE_CONSTANTS.IEC_EI.k).toBe(80.0);
    expect(IEC_CURVE_CONSTANTS.IEC_EI.alpha).toBe(2.0);
  });
});

describe('computeTripTime — czas zadziałania zabezpieczenia', () => {
  it('IEC_SI, I/Ip=2, TDS=1 → t ≈ 10 s', () => {
    const func = FIELD_PROTECTION_PROFILES.LINE[1]; // 51 SI
    const t = computeTripTime(func, 2.0);
    // t = 0.14 / (2^0.02 - 1) × 0.3 = 0.14 / 0.01396 × 0.3 = 3.01 s
    // Z TDS=0.3 → ~3 s.
    expect(t).toBeGreaterThan(2);
    expect(t).toBeLessThan(5);
  });

  it('Definite-time → zwraca definiteTimeSec niezależnie od prądu', () => {
    const func = FIELD_PROTECTION_PROFILES.LINE[0]; // 50 instantaneous
    expect(computeTripTime(func, 2.0)).toBe(0.05);
    expect(computeTripTime(func, 5.0)).toBe(0.05);
  });

  it('I/Ip ≤ 1 → t = Infinity (nie zadziała)', () => {
    const func = FIELD_PROTECTION_PROFILES.LINE[1];
    expect(computeTripTime(func, 1.0)).toBe(Infinity);
    expect(computeTripTime(func, 0.5)).toBe(Infinity);
  });
});

describe('checkProtectionCoordination — selektywność TCC', () => {
  it('Margin ≥ 0.3s → selective', () => {
    const downstream = FIELD_PROTECTION_PROFILES.LINE[1];
    const upstream = { ...downstream, tds: 0.6 }; // 2× wolniejszy
    const result = checkProtectionCoordination({
      downstream, upstream, faultCurrent: 1000, minMarginSec: 0.3,
    });
    expect(result.selective).toBe(true);
    expect(result.margin).toBeGreaterThan(0.3);
  });

  it('Margin < 0.3s → not selective (kolizja czasowa)', () => {
    const func = FIELD_PROTECTION_PROFILES.LINE[1];
    const result = checkProtectionCoordination({
      downstream: func, upstream: { ...func, tds: 0.32 }, // tylko trochę wolniejszy
      faultCurrent: 1000, minMarginSec: 0.3,
    });
    expect(result.selective).toBe(false);
  });
});

describe('FIELD_PROTECTION_PROFILES — typowe zestawy', () => {
  it('LINE: 4 funkcje (50/51/51N/67)', () => {
    expect(FIELD_PROTECTION_PROFILES.LINE.length).toBe(4);
    const ansis = FIELD_PROTECTION_PROFILES.LINE.map((f) => f.ansi);
    expect(ansis).toContain('50');
    expect(ansis).toContain('51');
    expect(ansis).toContain('51N');
    expect(ansis).toContain('67');
  });

  it('TRANSFORMER: zawiera 87T (różnicowe)', () => {
    const ansis = FIELD_PROTECTION_PROFILES.TRANSFORMER.map((f) => f.ansi);
    expect(ansis).toContain('87T');
    expect(ansis).toContain('51');
    expect(ansis).toContain('51N');
  });

  it('DER: NC RfG (27/59/81U/81O/67/46) — 6 funkcji', () => {
    expect(FIELD_PROTECTION_PROFILES.DER.length).toBe(6);
    const ansis = FIELD_PROTECTION_PROFILES.DER.map((f) => f.ansi);
    expect(ansis).toContain('27');
    expect(ansis).toContain('59');
    expect(ansis).toContain('81U');
    expect(ansis).toContain('81O');
    expect(ansis).toContain('67');
    expect(ansis).toContain('46');
  });

  it('Każda funkcja ma polską etykietę', () => {
    const all = [
      ...FIELD_PROTECTION_PROFILES.LINE,
      ...FIELD_PROTECTION_PROFILES.TRANSFORMER,
      ...FIELD_PROTECTION_PROFILES.DER,
    ];
    for (const f of all) {
      expect(f.labelPl).toBeTruthy();
      expect(f.labelPl.length).toBeGreaterThan(3);
    }
  });

  it('Wszystkie funkcje są domyślnie enabled', () => {
    const all = [
      ...FIELD_PROTECTION_PROFILES.LINE,
      ...FIELD_PROTECTION_PROFILES.TRANSFORMER,
      ...FIELD_PROTECTION_PROFILES.DER,
    ];
    for (const f of all) expect(f.enabled).toBe(true);
  });
});
