import { describe, expect, it } from 'vitest';
import {
  validateInverterMode,
  describeControlMode,
  describeFrequencyMode,
} from '../inverterModeHelper';

describe('validateInverterMode — cos_phi_const', () => {
  it('valid w zakresie [0.95, 1.0]', () => {
    const r = validateInverterMode({
      controlMode: 'cos_phi_const',
      fixedCosPhi: 0.98,
      frequencyMode: 'normal',
    });
    expect(r.isValid).toBe(true);
  });

  it('issue poza zakresem', () => {
    const r = validateInverterMode({
      controlMode: 'cos_phi_const',
      fixedCosPhi: 0.85,
      frequencyMode: 'normal',
    });
    expect(r.isValid).toBe(false);
    expect(r.issues[0]).toContain('NC RfG');
  });

  it('issue gdy brak fixedCosPhi', () => {
    const r = validateInverterMode({
      controlMode: 'cos_phi_const',
      frequencyMode: 'normal',
    });
    expect(r.isValid).toBe(false);
    expect(r.issues[0]).toContain('wymaga');
  });
});

describe('validateInverterMode — cos_phi_of_p', () => {
  it('valid z 3 punktami', () => {
    const r = validateInverterMode({
      controlMode: 'cos_phi_of_p',
      cosOfPPoints: [
        { pPu: 0.0, cosPhi: 1.0 },
        { pPu: 0.5, cosPhi: 0.95 },
        { pPu: 1.0, cosPhi: 0.90 },
      ],
      frequencyMode: 'normal',
    });
    expect(r.isValid).toBe(true);
  });

  it('issue gdy < 2 punktów', () => {
    const r = validateInverterMode({
      controlMode: 'cos_phi_of_p',
      cosOfPPoints: [{ pPu: 0.5, cosPhi: 0.95 }],
      frequencyMode: 'normal',
    });
    expect(r.isValid).toBe(false);
  });

  it('issue gdy cos φ poza [0.85, 1.0]', () => {
    const r = validateInverterMode({
      controlMode: 'cos_phi_of_p',
      cosOfPPoints: [
        { pPu: 0.0, cosPhi: 1.0 },
        { pPu: 1.0, cosPhi: 0.5 },
      ],
      frequencyMode: 'normal',
    });
    expect(r.isValid).toBe(false);
  });
});

describe('validateInverterMode — q_of_u', () => {
  it('valid z pokryciem [0.9, 1.1]', () => {
    const r = validateInverterMode({
      controlMode: 'q_of_u',
      qOfUPoints: [
        { uPu: 0.9, qPu: 0.4 },
        { uPu: 1.0, qPu: 0.0 },
        { uPu: 1.1, qPu: -0.4 },
      ],
      frequencyMode: 'normal',
    });
    expect(r.isValid).toBe(true);
  });

  it('issue gdy U nie pokrywa pełnego zakresu', () => {
    const r = validateInverterMode({
      controlMode: 'q_of_u',
      qOfUPoints: [
        { uPu: 0.95, qPu: 0.2 },
        { uPu: 1.0, qPu: 0.0 },
        { uPu: 1.05, qPu: -0.2 },
      ],
      frequencyMode: 'normal',
    });
    expect(r.isValid).toBe(false);
  });
});

describe('validateInverterMode — q_const + p_max', () => {
  it('q_const wymaga value', () => {
    const r = validateInverterMode({
      controlMode: 'q_const',
      frequencyMode: 'normal',
    });
    expect(r.isValid).toBe(false);
  });

  it('p_max bez dodatkowych check', () => {
    const r = validateInverterMode({
      controlMode: 'p_max',
      frequencyMode: 'normal',
    });
    expect(r.isValid).toBe(true);
  });
});

describe('describe* helpers', () => {
  it('descriptions PL', () => {
    expect(describeControlMode('cos_phi_of_p')).toContain('NC RfG');
    expect(describeControlMode('q_of_u')).toContain('Volt-Var');
    expect(describeFrequencyMode('lfsm_o')).toContain('Over-frequency');
    expect(describeFrequencyMode('fsm')).toContain('Sensitive');
  });
});
