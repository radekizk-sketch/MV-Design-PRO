import { describe, expect, it } from 'vitest';
import {
  validateTransformerSizing,
  describeVectorGroup,
  type TransformerSizingInput,
} from '../transformerSizingValidator';

const baseInput: TransformerSizingInput = {
  ratedPowerMva: 0.63,
  primaryVoltageKv: 15,
  secondaryVoltageKv: 0.4,
  loadActivePowerMva: 0.4,
  vectorGroup: 'Dyn11',
  cooling: 'ONAN',
  hasOltc: false,
};

describe('validateTransformerSizing — obciążenie', () => {
  it('TR 0.63 MVA z S_load=0.4 MVA → β≈63% → OK', () => {
    const r = validateTransformerSizing(baseInput);
    expect(r.verdict).toBe('ok');
    expect(r.utilizationPercent).toBeGreaterThan(60);
    expect(r.utilizationPercent).toBeLessThan(70);
  });

  it('TR 0.63 MVA z S_load=0.7 MVA → przeciążenie → error', () => {
    const r = validateTransformerSizing({ ...baseInput, loadActivePowerMva: 0.7 });
    expect(r.verdict).toBe('error');
    expect(r.recommendation).toContain('Zwiększ moc');
    expect(r.suggestedRatedPowerMva).toBeGreaterThan(0.63);
  });

  it('TR 0.63 MVA z S_load=0.55 MVA → warning >85%', () => {
    const r = validateTransformerSizing({ ...baseInput, loadActivePowerMva: 0.55 });
    expect(r.verdict).toBe('warning');
  });

  it('TR 1.6 MVA z S_load=0.2 MVA → β<30% → oversized', () => {
    const r = validateTransformerSizing({
      ...baseInput,
      ratedPowerMva: 1.6,
      loadActivePowerMva: 0.2,
    });
    expect(r.verdict).toBe('oversized');
    expect(r.recommendation).toContain('mniejszy');
  });
});

describe('validateTransformerSizing — napięcia', () => {
  it('napięcie wtórne nietypowe → warning', () => {
    const r = validateTransformerSizing({
      ...baseInput,
      secondaryVoltageKv: 0.42,
    });
    expect(r.issues.some((i) => i.includes('nietypowe'))).toBe(true);
  });

  it('napięcie wtórne 0.4 kV → standard, brak warning', () => {
    const r = validateTransformerSizing(baseInput);
    expect(r.issues.some((i) => i.includes('nietypowe'))).toBe(false);
  });
});

describe('validateTransformerSizing — vector + cooling + OLTC', () => {
  it('OFAF na TR 1 MVA → warning ekonomiczny', () => {
    const r = validateTransformerSizing({
      ...baseInput,
      ratedPowerMva: 1.0,
      cooling: 'OFAF',
    });
    expect(r.issues.some((i) => i.includes('OFAF'))).toBe(true);
  });

  it('OLTC na TR 0.25 MVA → warning', () => {
    const r = validateTransformerSizing({
      ...baseInput,
      ratedPowerMva: 0.25,
      loadActivePowerMva: 0.16,
      hasOltc: true,
    });
    expect(r.issues.some((i) => i.includes('OLTC'))).toBe(true);
  });
});

describe('validateTransformerSizing — edge cases', () => {
  it('error gdy ratedPowerMva <= 0', () => {
    const r = validateTransformerSizing({ ...baseInput, ratedPowerMva: 0 });
    expect(r.verdict).toBe('error');
  });
});

describe('describeVectorGroup', () => {
  it('zwraca opis PL dla każdej grupy', () => {
    expect(describeVectorGroup('Dyn11')).toContain('330°');
    expect(describeVectorGroup('YNyn0')).toContain('blokowe');
    expect(describeVectorGroup('Dyn5')).toContain('150°');
    expect(describeVectorGroup('YNd11')).toContain('generatorowe');
  });
});
