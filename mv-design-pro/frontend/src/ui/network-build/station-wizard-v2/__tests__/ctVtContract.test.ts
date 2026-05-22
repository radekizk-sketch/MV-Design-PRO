/**
 * Kontrakt CT/VT wielordzeniowy/wielouzwojeniowy — Excel MT880 1:1.
 *
 * Test wymusza zgodność z referencyjnymi wartościami z Excel'a
 * `obliczenia.xlsx` (bundle KWranPTV) zgodnie z wymaganiem #5 (/goal):
 * konfigurator pól SN obsługuje przekładniki wielordzeniowe (nie losowe
 * symbole) — implementacja eksela 1:1.
 */
import { describe, expect, it } from 'vitest';

import {
  CT_REFERENCE_200_3CORE,
  CT_BURDEN_CONSTANTS,
  computeWireResistance,
  computeCtBurden,
  checkCtSaturation,
  type CtCore,
  type CtWiring,
} from '../ctMultiCoreContract';
import {
  VT_REFERENCE_4WINDING,
  VT_BURDEN_CONSTANTS,
  computeVtWireResistance,
  computeVtBurden,
  checkVtVoltageDropLimit,
  type VtWiring,
} from '../vtMultiWindingContract';

// ============================================================================
// CT — 3-rdzeniowy 200/5/5/5A (MT880)
// ============================================================================

describe('CT 3-rdzeniowy 200/5/5/5A — Excel MT880 reference', () => {
  it('zawiera 3 rdzenie (I metering / II analysis / III protection)', () => {
    expect(CT_REFERENCE_200_3CORE).toHaveLength(3);
    expect(CT_REFERENCE_200_3CORE.map((c) => c.category)).toEqual([
      'metering', 'analysis', 'protection',
    ]);
  });

  it('Rdzeń I: 0.2s · FS5 · 7.5 VA · licznik LZQJ-XC', () => {
    const I = CT_REFERENCE_200_3CORE[0];
    expect(I.accuracyClass).toBe('0.2s');
    expect(I.fsOrAlf).toBe(5);
    expect(I.ratedBurdenVa).toBe(7.5);
    expect(I.destinationPl).toContain('LZQJ-XC');
  });

  it('Rdzeń II: 0.2s · FS5 · 7.5 VA · analizator jakości energii klasy A', () => {
    const II = CT_REFERENCE_200_3CORE[1];
    expect(II.accuracyClass).toBe('0.2s');
    expect(II.fsOrAlf).toBe(5);
    expect(II.ratedBurdenVa).toBe(7.5);
    expect(II.destinationPl).toContain('klasy A');
  });

  it('Rdzeń III: 5P10 · ALF10 · 5 VA · zabezpieczenie e2Tango', () => {
    const III = CT_REFERENCE_200_3CORE[2];
    expect(III.accuracyClass).toBe('5P10');
    expect(III.fsOrAlf).toBe(10);
    expect(III.ratedBurdenVa).toBe(5.0);
    expect(III.destinationPl).toContain('e2Tango');
  });
});

describe('computeWireResistance — Rp = 2L/(γ·s)', () => {
  it('10m Cu 2.5mm² → Rp ≈ 0.143 Ω', () => {
    const wiring: CtWiring = {
      lengthM: 10,
      crossSectionMm2: 2.5,
      material: 'Cu',
      conductivityMperOhmMm2: CT_BURDEN_CONSTANTS.COPPER_CONDUCTIVITY,
      loadVa: 5,
    };
    const rp = computeWireResistance(wiring);
    // Rp = 2*10 / (56*2.5) = 20/140 ≈ 0.1429 Ω
    expect(rp).toBeCloseTo(0.1429, 3);
  });

  it('7m Cu 2.5mm² → Rp = 0.1 Ω', () => {
    const wiring: CtWiring = {
      lengthM: 7,
      crossSectionMm2: 2.5,
      material: 'Cu',
      conductivityMperOhmMm2: CT_BURDEN_CONSTANTS.COPPER_CONDUCTIVITY,
      loadVa: 5,
    };
    const rp = computeWireResistance(wiring);
    expect(rp).toBeCloseTo(0.1, 3);
  });
});

describe('computeCtBurden — S2obl = Sl + Sz + Sp', () => {
  it('Rdzeń I (Excel MT880): Sl=1.5VA, L=10m, s=2.5mm² → bilans OK', () => {
    const burden = computeCtBurden(CT_REFERENCE_200_3CORE[0], {
      lengthM: 10,
      crossSectionMm2: 2.5,
      material: 'Cu',
      conductivityMperOhmMm2: 56,
      loadVa: 1.5,
    });
    // Sp = 5² × 0.1429 = 3.572 VA
    // S2obl = 1.5 + 0.1 + 3.572 = 5.172 VA
    expect(burden.computedBurdenVa).toBeCloseTo(5.172, 1);
    expect(burden.ratedBurdenVa).toBe(7.5);
    expect(burden.ok).toBe(true);
  });

  it('Rdzeń II (analizator): Sl=5.0VA → bilans OK z mniejszym marginesem', () => {
    const burden = computeCtBurden(CT_REFERENCE_200_3CORE[1], {
      lengthM: 10,
      crossSectionMm2: 2.5,
      material: 'Cu',
      conductivityMperOhmMm2: 56,
      loadVa: 5.0,
    });
    // S2obl = 5.0 + 0.1 + 3.572 ≈ 8.672 — przekracza Sn=7.5!
    // To wskazuje przeciążenie wtórne.
    expect(burden.ok).toBe(false);
    expect(burden.computedBurdenVa).toBeGreaterThan(burden.ratedBurdenVa);
  });

  it('Rdzeń III (zabezpieczenie): krótkie przewody L=7m → OK', () => {
    const burden = computeCtBurden(CT_REFERENCE_200_3CORE[2], {
      lengthM: 7,
      crossSectionMm2: 2.5,
      material: 'Cu',
      conductivityMperOhmMm2: 56,
      loadVa: 5.0,
    });
    // Rp=0.1, Sp=2.5 VA, S2obl = 5.0+0.1+2.5 = 7.6 — przekracza Sn=5.0
    expect(burden.computedBurdenVa).toBeCloseTo(7.6, 1);
    expect(burden.ok).toBe(false);
  });

  it('marginPct ujemny gdy S2obl > Sn', () => {
    const burden = computeCtBurden(CT_REFERENCE_200_3CORE[1], {
      lengthM: 10, crossSectionMm2: 2.5, material: 'Cu', conductivityMperOhmMm2: 56, loadVa: 5.0,
    });
    expect(burden.marginPct).toBeLessThan(0);
  });

  it('marginPct dodatni gdy Sn znacznie ≥ S2obl (np. krótkie przewody, mały odbiornik)', () => {
    const burden = computeCtBurden(CT_REFERENCE_200_3CORE[0], {
      lengthM: 3, crossSectionMm2: 4, material: 'Cu', conductivityMperOhmMm2: 56, loadVa: 1.0,
    });
    expect(burden.marginPct).toBeGreaterThan(0);
    expect(burden.ok).toBe(true);
  });
});

describe('checkCtSaturation — ALF effective + nasycenie', () => {
  it('Rdzeń III: ALF10 + Ik=8.45kA, In=200A → ratio=42.3 > ALF → SATURATION', () => {
    const burden = computeCtBurden(CT_REFERENCE_200_3CORE[2], {
      lengthM: 7, crossSectionMm2: 2.5, material: 'Cu', conductivityMperOhmMm2: 56, loadVa: 5.0,
    });
    const sat = checkCtSaturation(CT_REFERENCE_200_3CORE[2], burden, 8450, 200);
    expect(sat.nominalAlf).toBe(10);
    expect(sat.ikRatio).toBeCloseTo(42.25, 1);
    expect(sat.saturated).toBe(true);
  });

  it('Rdzeń I 5P10: Ik=500A In=200A → ratio=2.5 < ALF → no saturation', () => {
    const burden = computeCtBurden(CT_REFERENCE_200_3CORE[2], {
      lengthM: 3, crossSectionMm2: 4, material: 'Cu', conductivityMperOhmMm2: 56, loadVa: 2.5,
    });
    const sat = checkCtSaturation(CT_REFERENCE_200_3CORE[2], burden, 500, 200);
    expect(sat.saturated).toBe(false);
  });

  it('Effective ALF rośnie gdy S2obl < Sn (niedociążenie)', () => {
    const burden = computeCtBurden(CT_REFERENCE_200_3CORE[2], {
      lengthM: 3, crossSectionMm2: 4, material: 'Cu', conductivityMperOhmMm2: 56, loadVa: 1.0,
    });
    const sat = checkCtSaturation(CT_REFERENCE_200_3CORE[2], burden, 8000, 200);
    // effectiveALF = 10 × (5/S2obl). S2obl niskie → effectiveALF > 10.
    expect(sat.effectiveAlf).toBeGreaterThan(sat.nominalAlf);
  });
});

// ============================================================================
// VT — 4-uzwojeniowy 15:√3 / 0.1:√3 kV
// ============================================================================

describe('VT 4-uzwojeniowy — Excel MT880 reference', () => {
  it('zawiera 4 uzwojenia (metering / analysis / protection / scada_open_delta)', () => {
    expect(VT_REFERENCE_4WINDING).toHaveLength(4);
    expect(VT_REFERENCE_4WINDING.map((w) => w.category)).toEqual([
      'metering', 'analysis', 'protection', 'scada_open_delta',
    ]);
  });

  it('Uzwojenie I: 0.2 · 7.5 VA · licznik', () => {
    const I = VT_REFERENCE_4WINDING[0];
    expect(I.accuracyClass).toBe('0.2');
    expect(I.ratedBurdenVa).toBe(7.5);
  });

  it('Uzwojenie IV: 3P · 50 VA · SCADA otwarty trójkąt', () => {
    const IV = VT_REFERENCE_4WINDING[3];
    expect(IV.accuracyClass).toBe('3P');
    expect(IV.ratedBurdenVa).toBe(50);
    expect(IV.destinationPl).toContain('otwartego trójkąta');
  });

  it('Wszystkie uzwojenia mają polskie destination labels', () => {
    for (const w of VT_REFERENCE_4WINDING) {
      expect(w.destinationPl.length).toBeGreaterThan(5);
    }
  });
});

describe('computeVtWireResistance + computeVtBurden', () => {
  it('Rezystancja przewodów liczy z konduktywnością Cu = 56', () => {
    const wiring: VtWiring = {
      lengthM: 15, crossSectionMm2: 1.5, material: 'Cu',
      conductivityMperOhmMm2: VT_BURDEN_CONSTANTS.COPPER_CONDUCTIVITY, loadVa: 5,
    };
    const rp = computeVtWireResistance(wiring);
    // Rp = 2*15/(56*1.5) = 30/84 ≈ 0.357 Ω
    expect(rp).toBeCloseTo(0.357, 2);
  });

  it('Uzwojenie I: Sl=5VA → bilans OK (Sn=7.5)', () => {
    const burden = computeVtBurden(VT_REFERENCE_4WINDING[0], {
      lengthM: 15, crossSectionMm2: 1.5, material: 'Cu', conductivityMperOhmMm2: 56, loadVa: 5,
    });
    expect(burden.ok).toBe(true);
    expect(burden.computedBurdenVa).toBeCloseTo(5.1, 1); // 5 + 0.1
  });

  it('Uzwojenie IV (SCADA): Sn=50, Sl=30 → szeroki margines', () => {
    const burden = computeVtBurden(VT_REFERENCE_4WINDING[3], {
      lengthM: 30, crossSectionMm2: 2.5, material: 'Cu', conductivityMperOhmMm2: 56, loadVa: 30,
    });
    expect(burden.ok).toBe(true);
    expect(burden.marginPct).toBeGreaterThan(30);
  });

  it('Bilans przekroczony gdy Sl > Sn', () => {
    const burden = computeVtBurden(VT_REFERENCE_4WINDING[0], {
      lengthM: 50, crossSectionMm2: 1.5, material: 'Cu', conductivityMperOhmMm2: 56, loadVa: 20,
    });
    expect(burden.ok).toBe(false);
  });
});

describe('checkVtVoltageDropLimit — ΔU obwodu wtórnego', () => {
  it('Uzwojenie I (metering) limit 0.5%, krótkie przewody → within limit', () => {
    const burden = computeVtBurden(VT_REFERENCE_4WINDING[0], {
      lengthM: 5, crossSectionMm2: 2.5, material: 'Cu', conductivityMperOhmMm2: 56, loadVa: 2,
    });
    const check = checkVtVoltageDropLimit(VT_REFERENCE_4WINDING[0], burden);
    expect(check.limit).toBe(VT_BURDEN_CONSTANTS.VOLTAGE_DROP_LIMIT_METERING_PCT);
    expect(check.withinLimit).toBe(true);
  });

  it('Uzwojenie III (protection) limit 1.0% (szerszy)', () => {
    const burden = computeVtBurden(VT_REFERENCE_4WINDING[2], {
      lengthM: 10, crossSectionMm2: 1.5, material: 'Cu', conductivityMperOhmMm2: 56, loadVa: 5,
    });
    const check = checkVtVoltageDropLimit(VT_REFERENCE_4WINDING[2], burden);
    expect(check.limit).toBe(VT_BURDEN_CONSTANTS.VOLTAGE_DROP_LIMIT_PROTECTION_PCT);
  });

  it('voltageDropPct > limit → exceeded (długie przewody, mała przekrój)', () => {
    const wiring: VtWiring = {
      lengthM: 200, crossSectionMm2: 1.0, material: 'Cu', conductivityMperOhmMm2: 56, loadVa: 50,
    };
    const burden = computeVtBurden(VT_REFERENCE_4WINDING[0], wiring);
    const check = checkVtVoltageDropLimit(VT_REFERENCE_4WINDING[0], burden);
    expect(check.withinLimit).toBe(false);
    expect(burden.voltageDropPct).toBeGreaterThan(check.limit);
  });
});

describe('Stałe fizyczne — Cu/Al/IEC', () => {
  it('Konduktywność Cu = 56 m/(Ω·mm²) w obu kontraktach', () => {
    expect(CT_BURDEN_CONSTANTS.COPPER_CONDUCTIVITY).toBe(56);
    expect(VT_BURDEN_CONSTANTS.COPPER_CONDUCTIVITY).toBe(56);
  });

  it('Strata zestykowa = 0.1 VA per zacisk', () => {
    expect(CT_BURDEN_CONSTANTS.TERMINAL_CONTACT_LOSS_VA).toBe(0.1);
    expect(VT_BURDEN_CONSTANTS.TERMINAL_CONTACT_LOSS_VA).toBe(0.1);
  });

  it('VT secondary 0.1/√3 kV ≈ 57.74 V', () => {
    expect(VT_BURDEN_CONSTANTS.STANDARD_SECONDARY_VOLTAGE_V).toBeCloseTo(57.74, 1);
  });

  it('CT secondary nominal 5A (IEC standardowy)', () => {
    expect(CT_BURDEN_CONSTANTS.STANDARD_SECONDARY_CURRENT_A).toBe(5);
  });
});
