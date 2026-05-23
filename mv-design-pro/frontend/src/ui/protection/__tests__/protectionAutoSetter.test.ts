import { describe, expect, it } from 'vitest';
import {
  recommendProtection,
  totalProtectionFunctions,
  listAnsiCodes,
  type ProtectionAutoSettingInput,
} from '../protectionAutoSetter';

const baseInput: ProtectionAutoSettingInput = {
  bayRole: 'LINIA_OUT',
  ratedLoadCurrentA: 200,
  shortCircuitKa: 10,
  systemVoltageKv: 15,
};

describe('recommendProtection — LINIA_OUT', () => {
  it('zwraca 51 + 50 + 67', () => {
    const r = recommendProtection(baseInput);
    expect(r.map((s) => s.function)).toEqual(expect.arrayContaining(['51', '50', '67']));
  });

  it('51 pickup ≈ 1.3 × I_load', () => {
    const r = recommendProtection(baseInput);
    const f51 = r.find((s) => s.function === '51');
    expect(f51?.pickupValue).toBe(260); // 1.3 × 200
  });

  it('50 pickup ≈ 0.8 × I_k', () => {
    const r = recommendProtection(baseInput);
    const f50 = r.find((s) => s.function === '50');
    expect(f50?.pickupValue).toBe(8000); // 0.8 × 10000 (10 kA in A)
  });

  it('TMS uwzględnia downstream + CTI', () => {
    const r = recommendProtection({ ...baseInput, downstreamTms: 0.2, ctiSeconds: 0.3 });
    const f51 = r.find((s) => s.function === '51');
    // upstream = 0.2 + 0.3 = 0.5
    expect(f51?.tms).toBeCloseTo(0.5, 2);
  });
});

describe('recommendProtection — LINIA_IN', () => {
  it('VI curve dla wyższego priorytetu', () => {
    const r = recommendProtection({ ...baseInput, bayRole: 'LINIA_IN' });
    const f51 = r.find((s) => s.function === '51');
    expect(f51?.curve).toBe('VI');
  });
});

describe('recommendProtection — TRANSFORMATOROWE', () => {
  it('zawiera 87T (differential)', () => {
    const r = recommendProtection({ ...baseInput, bayRole: 'TRANSFORMATOROWE' });
    expect(r.some((s) => s.function === '87T')).toBe(true);
  });

  it('87T pickup = 0.3 p.u.', () => {
    const r = recommendProtection({ ...baseInput, bayRole: 'TRANSFORMATOROWE' });
    const f87 = r.find((s) => s.function === '87T');
    expect(f87?.pickupValue).toBe(0.3);
    expect(f87?.pickupUnit).toBe('p.u.');
  });
});

describe('recommendProtection — OZE (NC RfG)', () => {
  it('zawiera 27/59/81U/81O/81R', () => {
    const r = recommendProtection({ ...baseInput, bayRole: 'OZE' });
    const ansi = listAnsiCodes(r);
    expect(ansi).toContain('27');
    expect(ansi).toContain('59');
    expect(ansi).toContain('81U');
    expect(ansi).toContain('81O');
    expect(ansi).toContain('81R');
  });

  it('27 pickup 0.85 p.u., 200ms', () => {
    const r = recommendProtection({ ...baseInput, bayRole: 'OZE' });
    const f27 = r.find((s) => s.function === '27');
    expect(f27?.pickupValue).toBe(0.85);
    expect(f27?.delaySeconds).toBe(0.2);
  });

  it('ROCOF 2.5 Hz/s, 100ms', () => {
    const r = recommendProtection({ ...baseInput, bayRole: 'OZE' });
    const f81r = r.find((s) => s.function === '81R');
    expect(f81r?.pickupValue).toBe(2.5);
    expect(f81r?.delaySeconds).toBe(0.1);
  });
});

describe('recommendProtection — SPRZEGLO i POMIAROWE', () => {
  it('SPRZEGLO ma 1 nastawę z najwyższym TMS', () => {
    const r = recommendProtection({ ...baseInput, bayRole: 'SPRZEGLO', downstreamTms: 0.5, ctiSeconds: 0.3 });
    expect(r).toHaveLength(1);
    expect(r[0].tms).toBeGreaterThanOrEqual(0.5);
  });

  it('POMIAROWE pole bez zabezpieczeń', () => {
    const r = recommendProtection({ ...baseInput, bayRole: 'POMIAROWE' });
    expect(r).toHaveLength(0);
  });
});

describe('totalProtectionFunctions + listAnsiCodes', () => {
  it('zlicza i listuje funkcje', () => {
    const r = recommendProtection(baseInput);
    expect(totalProtectionFunctions(r)).toBe(3);
    expect(listAnsiCodes(r)).toBe('51/50/67');
  });
});
