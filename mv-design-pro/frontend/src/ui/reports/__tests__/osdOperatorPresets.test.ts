import { describe, expect, it } from 'vitest';
import {
  OSD_OPERATOR_PRESETS,
  getOperatorPreset,
  getRequiredAttachments,
  listOperators,
  validatePowerCompatibility,
} from '../osdOperatorPresets';

describe('OSD_OPERATOR_PRESETS', () => {
  it('zawiera 5 operatorów PSE + 4 OSD', () => {
    const operators = listOperators();
    expect(operators).toHaveLength(5);
    expect(operators).toEqual(['PSE', 'ENERGA', 'TAURON', 'ENEA', 'PGE']);
  });

  it('każdy preset ma kompletne dane', () => {
    for (const op of listOperators()) {
      const preset = OSD_OPERATOR_PRESETS[op];
      expect(preset.name).toBeTruthy();
      expect(preset.fullName).toBeTruthy();
      expect(preset.area).toBeTruthy();
      expect(preset.contactEmail).toMatch(/@/);
      expect(preset.attachmentTemplate.length).toBeGreaterThan(0);
      expect(preset.technicalRequirements.voltageLevelsKv.length).toBeGreaterThan(0);
    }
  });

  it('PSE wymaga IEC 61850 SCD', () => {
    const pse = getOperatorPreset('PSE');
    expect(pse.attachmentTemplate.some((a) => a.id === 'iec_61850')).toBe(true);
  });

  it('Tauron wymaga cos φ + Q(U)', () => {
    const t = getOperatorPreset('TAURON');
    expect(t.attachmentTemplate.some((a) => a.id === 'cos_phi_profile')).toBe(true);
    expect(t.attachmentTemplate.some((a) => a.id === 'qu_profile')).toBe(true);
  });

  it('Enea wymaga certyfikatu PTPIREE', () => {
    const enea = getOperatorPreset('ENEA');
    expect(enea.attachmentTemplate.some((a) => a.id === 'ptpireee_cert')).toBe(true);
  });
});

describe('getRequiredAttachments', () => {
  it('zwraca tylko required=true', () => {
    const reqs = getRequiredAttachments('PSE');
    expect(reqs.every((a) => a.required)).toBe(true);
  });

  it('PSE ma więcej wymaganych niż Energa (typ A)', () => {
    expect(getRequiredAttachments('PSE').length).toBeGreaterThan(
      getRequiredAttachments('ENERGA').length,
    );
  });
});

describe('validatePowerCompatibility', () => {
  it('PSE wymaga ≥ 1 MVA', () => {
    expect(validatePowerCompatibility('PSE', 500).isCompatible).toBe(false);
    expect(validatePowerCompatibility('PSE', 1500).isCompatible).toBe(true);
  });

  it('Energa max 10 MVA', () => {
    expect(validatePowerCompatibility('ENERGA', 5000).isCompatible).toBe(true);
    expect(validatePowerCompatibility('ENERGA', 20000).isCompatible).toBe(false);
  });

  it('Tauron 1 kVA - 50 MVA', () => {
    expect(validatePowerCompatibility('TAURON', 10).isCompatible).toBe(true);
    expect(validatePowerCompatibility('TAURON', 30000).isCompatible).toBe(true);
  });

  it('reason w PL gdy niezgodne', () => {
    const r = validatePowerCompatibility('PSE', 500);
    expect(r.reason).toContain('poniżej');
    expect(r.reason).toContain('PSE');
  });
});

describe('voltage levels per operator', () => {
  it('PSE: WN/NN (110/220/400 kV)', () => {
    const levels = getOperatorPreset('PSE').technicalRequirements.voltageLevelsKv;
    expect(levels).toContain(110);
    expect(levels).toContain(220);
    expect(levels).toContain(400);
  });

  it('OSD-y mają nN (0.4 kV) + SN', () => {
    for (const op of ['ENERGA', 'TAURON', 'ENEA', 'PGE'] as const) {
      const levels = getOperatorPreset(op).technicalRequirements.voltageLevelsKv;
      expect(levels).toContain(0.4);
    }
  });
});
