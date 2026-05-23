import { describe, expect, it } from 'vitest';
import {
  validateEquipmentProof,
  describeProofVerdict,
  type EquipmentProofInput,
} from '../equipmentProofValidator';

const baseInput: EquipmentProofInput = {
  equipmentKind: 'breaker',
  ratings: {
    ratedShortTimeCurrentKa: 25,
    ratedShortTimeDurationS: 1,
    ratedPeakWithstandKa: 63,
    ratedCurrentA: 1250,
  },
  faultData: {
    initialSymKa: 12,
    peakKa: 30,
    thermalEquivalentKa: 12,
    faultDurationS: 0.5,
    steadyStateKa: 10,
  },
  loadCurrentA: 800,
};

describe('validateEquipmentProof', () => {
  it('PASS gdy wszystkie marginesy > 20%', () => {
    const r = validateEquipmentProof(baseInput);
    expect(r.verdict).toBe('pass');
    expect(r.thermalCheckPass).toBe(true);
    expect(r.dynamicCheckPass).toBe(true);
    expect(r.loadCheckPass).toBe(true);
  });

  it('FAIL gdy I_th za niskie', () => {
    const r = validateEquipmentProof({
      ...baseInput,
      ratings: { ...baseInput.ratings, ratedShortTimeCurrentKa: 5 },
    });
    expect(r.verdict).toBe('fail');
    expect(r.thermalCheckPass).toBe(false);
    expect(r.failures[0]).toContain('termiczna');
  });

  it('FAIL gdy I_dyn za niskie', () => {
    const r = validateEquipmentProof({
      ...baseInput,
      ratings: { ...baseInput.ratings, ratedPeakWithstandKa: 20 },
    });
    expect(r.verdict).toBe('fail');
    expect(r.dynamicCheckPass).toBe(false);
    expect(r.failures[0]).toContain('dynamiczna');
  });

  it('FAIL gdy I_n za niskie', () => {
    const r = validateEquipmentProof({
      ...baseInput,
      ratings: { ...baseInput.ratings, ratedCurrentA: 500 },
    });
    expect(r.verdict).toBe('fail');
    expect(r.loadCheckPass).toBe(false);
  });

  it('WARNING gdy margines I_n < 20%', () => {
    const r = validateEquipmentProof({
      ...baseInput,
      ratings: { ...baseInput.ratings, ratedCurrentA: 900 },
    });
    // 900 vs 800 → margin = 11.1% < 20%
    expect(r.verdict).toBe('warning');
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('marginesy w %', () => {
    const r = validateEquipmentProof(baseInput);
    expect(r.thermalMarginPercent).toBeGreaterThan(0);
    expect(r.dynamicMarginPercent).toBeGreaterThan(0);
    expect(r.loadMarginPercent).toBeGreaterThan(0);
  });
});

describe('describeProofVerdict', () => {
  it('pass / warning / fail descriptions PL', () => {
    expect(describeProofVerdict('pass')).toContain('PASS');
    expect(describeProofVerdict('warning')).toContain('niski');
    expect(describeProofVerdict('fail')).toContain('wymiana');
  });
});
