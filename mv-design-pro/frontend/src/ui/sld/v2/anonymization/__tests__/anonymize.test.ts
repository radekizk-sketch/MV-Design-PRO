/**
 * anonymize.ts — pure functions tests (Phase 5).
 *
 * Pokrycie:
 *   1. generatePseudonym determinizm (same input → same output).
 *   2. Different salts → different pseudonyms.
 *   3. Different kinds → different prefiksy.
 *   4. Format: GPZ-LITERA + cyfra dla gpz/feeder/line/cable.
 *   5. Format: PREFIX-NNN dla pozostałych.
 *   6. anonymizeLabel: enabled=false → no-op (raw).
 *   7. anonymizeLabel: preserveTypes=true + DER → raw.
 *   8. anonymizeLabel: hideNames=false → no-op dla station/gpz.
 *   9. anonymizeLabel: hideCadastral=false → no-op dla line/cable.
 *  10. anonymizeNumeric: hidePower → '—' gdy enabled.
 *  11. anonymizeNumeric: hideResults → '—' gdy enabled.
 *  12. shouldAnonymize: zgodne z toggles.
 */
import { describe, expect, it } from 'vitest';

import {
  type AnonymizationConfig,
  DEFAULT_CONFIG,
  DEFAULT_TOGGLES,
  anonymizeLabel,
  anonymizeNumeric,
  generatePseudonym,
  shouldAnonymize,
} from '../anonymize';

const SALT_A = 'salt-a';
const SALT_B = 'salt-b';

function makeConfig(overrides: Partial<AnonymizationConfig> = {}): AnonymizationConfig {
  return {
    ...DEFAULT_CONFIG,
    enabled: true,
    salt: SALT_A,
    toggles: { ...DEFAULT_TOGGLES, ...(overrides.toggles ?? {}) },
    ...overrides,
  };
}

describe('generatePseudonym — determinizm + format', () => {
  it('Same input → same output (deterministic)', () => {
    const p1 = generatePseudonym('GPZ Olsztyn 2', 'gpz', SALT_A);
    const p2 = generatePseudonym('GPZ Olsztyn 2', 'gpz', SALT_A);
    expect(p1).toBe(p2);
  });

  it('Different salts → different pseudonyms', () => {
    const p1 = generatePseudonym('GPZ Olsztyn 2', 'gpz', SALT_A);
    const p2 = generatePseudonym('GPZ Olsztyn 2', 'gpz', SALT_B);
    expect(p1).not.toBe(p2);
  });

  it('Different kinds → different prefiksy nawet z tym samym salt', () => {
    const pStation = generatePseudonym('X', 'station', SALT_A);
    const pSubstation = generatePseudonym('X', 'substation', SALT_A);
    const pBus = generatePseudonym('X', 'bus', SALT_A);
    expect(pStation.startsWith('ST-')).toBe(true);
    expect(pSubstation.startsWith('SUB-')).toBe(true);
    expect(pBus.startsWith('BUS-')).toBe(true);
  });

  it('Krótki format dla gpz/feeder/line/cable: PREFIX-LITERA + cyfra', () => {
    for (const kind of ['gpz', 'feeder', 'line', 'cable'] as const) {
      const p = generatePseudonym('test', kind, SALT_A);
      expect(p).toMatch(/^[A-Z]+-[A-Z]\d$/);
    }
  });

  it('Standardowy format dla station/substation/bus/der/custom: PREFIX-NNN', () => {
    for (const kind of ['station', 'substation', 'bus', 'der', 'custom'] as const) {
      const p = generatePseudonym('test', kind, SALT_A);
      expect(p).toMatch(/^[A-Z]+-\d{3}$/);
    }
  });
});

describe('anonymizeLabel — enabled toggle', () => {
  it('enabled=false → no-op (raw zwracane)', () => {
    const config: AnonymizationConfig = { ...DEFAULT_CONFIG, enabled: false, salt: SALT_A };
    expect(anonymizeLabel('GPZ Olsztyn', 'gpz', config)).toBe('GPZ Olsztyn');
  });

  it('enabled=true + hideNames → pseudonim', () => {
    const config = makeConfig();
    const result = anonymizeLabel('GPZ Olsztyn', 'gpz', config);
    expect(result).not.toBe('GPZ Olsztyn');
    expect(result).toMatch(/^GPZ-/);
  });
});

describe('anonymizeLabel — sub-toggles', () => {
  it('preserveTypes=true + kind=der → raw zachowany', () => {
    const config = makeConfig({ toggles: { ...DEFAULT_TOGGLES, preserveTypes: true } });
    expect(anonymizeLabel('PV Farma 1', 'der', config)).toBe('PV Farma 1');
  });

  it('preserveTypes=false + kind=der → pseudonim', () => {
    const config = makeConfig({ toggles: { ...DEFAULT_TOGGLES, preserveTypes: false, hideNames: true } });
    const result = anonymizeLabel('PV Farma 1', 'der', config);
    expect(result).not.toBe('PV Farma 1');
  });

  it('hideNames=false → station/gpz/bus zachowane', () => {
    const config = makeConfig({ toggles: { ...DEFAULT_TOGGLES, hideNames: false } });
    expect(anonymizeLabel('Stacja A', 'station', config)).toBe('Stacja A');
    expect(anonymizeLabel('GPZ X', 'gpz', config)).toBe('GPZ X');
    expect(anonymizeLabel('BUS-15', 'bus', config)).toBe('BUS-15');
  });

  it('hideCadastral=false → line/cable zachowane', () => {
    const config = makeConfig({ toggles: { ...DEFAULT_TOGGLES, hideCadastral: false } });
    expect(anonymizeLabel('LINIA-001', 'line', config)).toBe('LINIA-001');
    expect(anonymizeLabel('KAB-A1', 'cable', config)).toBe('KAB-A1');
  });

  it('hideCadastral=true (default) → line/cable anonimizowane', () => {
    const config = makeConfig();
    const result = anonymizeLabel('LINIA-001', 'line', config);
    expect(result).not.toBe('LINIA-001');
    expect(result).toMatch(/^LIN-/);
  });
});

describe('anonymizeNumeric — hidePower / hideResults', () => {
  it('enabled=false → wartość zachowana', () => {
    const config: AnonymizationConfig = { ...DEFAULT_CONFIG, enabled: false, salt: SALT_A };
    expect(anonymizeNumeric(100, 'power', config)).toBe(100);
  });

  it('enabled + hidePower=true + kind=power → "—"', () => {
    const config = makeConfig({ toggles: { ...DEFAULT_TOGGLES, hidePower: true } });
    expect(anonymizeNumeric(100, 'power', config)).toBe('—');
  });

  it('enabled + hidePower=false + kind=power → wartość', () => {
    const config = makeConfig({ toggles: { ...DEFAULT_TOGGLES, hidePower: false } });
    expect(anonymizeNumeric(100, 'power', config)).toBe(100);
  });

  it('enabled + hideResults=true + kind=result → "—"', () => {
    const config = makeConfig({ toggles: { ...DEFAULT_TOGGLES, hideResults: true } });
    expect(anonymizeNumeric(15.0, 'result', config)).toBe('—');
  });

  it('hideResults=true ale kind=power → wartość zachowana', () => {
    const config = makeConfig({ toggles: { ...DEFAULT_TOGGLES, hideResults: true, hidePower: false } });
    expect(anonymizeNumeric(100, 'power', config)).toBe(100);
  });

  it('null → null', () => {
    const config = makeConfig();
    expect(anonymizeNumeric(null, 'power', config)).toBe(null);
  });
});

describe('shouldAnonymize — predicate', () => {
  it('enabled=false → zawsze false', () => {
    const config: AnonymizationConfig = { ...DEFAULT_CONFIG, enabled: false, salt: SALT_A };
    for (const kind of ['gpz', 'station', 'der', 'line'] as const) {
      expect(shouldAnonymize(kind, config)).toBe(false);
    }
  });

  it('preserveTypes=true + der → false', () => {
    const config = makeConfig({ toggles: { ...DEFAULT_TOGGLES, preserveTypes: true } });
    expect(shouldAnonymize('der', config)).toBe(false);
  });

  it('hideNames=true → station/gpz/substation/feeder/bus → true', () => {
    const config = makeConfig({ toggles: { ...DEFAULT_TOGGLES, hideNames: true } });
    expect(shouldAnonymize('station', config)).toBe(true);
    expect(shouldAnonymize('gpz', config)).toBe(true);
    expect(shouldAnonymize('substation', config)).toBe(true);
    expect(shouldAnonymize('feeder', config)).toBe(true);
    expect(shouldAnonymize('bus', config)).toBe(true);
  });

  it('hideCadastral=true → line/cable → true', () => {
    const config = makeConfig({ toggles: { ...DEFAULT_TOGGLES, hideCadastral: true } });
    expect(shouldAnonymize('line', config)).toBe(true);
    expect(shouldAnonymize('cable', config)).toBe(true);
  });

  it('custom kind → zawsze true gdy enabled', () => {
    const config = makeConfig();
    expect(shouldAnonymize('custom', config)).toBe(true);
  });
});

describe('Stable pseudonim invariants', () => {
  it('Sama lista 100 etykiet → 100 reruny → identyczne pseudonimy', () => {
    const labels = Array.from({ length: 100 }, (_, i) => `Stacja-${i}`);
    const config = makeConfig();
    const reference = labels.map((l) => anonymizeLabel(l, 'station', config));
    for (let run = 0; run < 5; run++) {
      const next = labels.map((l) => anonymizeLabel(l, 'station', config));
      expect(next).toEqual(reference);
    }
  });

  it('Salt rotation → wszystkie pseudonimy zmienione', () => {
    const labels = ['GPZ A', 'GPZ B', 'GPZ C'];
    const c1 = makeConfig({ salt: 'rotation-1' });
    const c2 = makeConfig({ salt: 'rotation-2' });
    const set1 = labels.map((l) => anonymizeLabel(l, 'gpz', c1));
    const set2 = labels.map((l) => anonymizeLabel(l, 'gpz', c2));
    for (let i = 0; i < labels.length; i++) {
      expect(set1[i]).not.toBe(set2[i]);
    }
  });
});
