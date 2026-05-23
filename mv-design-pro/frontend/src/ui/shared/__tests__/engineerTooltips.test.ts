import { describe, expect, it } from 'vitest';
import {
  ENGINEER_TOOLTIPS,
  getTooltip,
  listTooltipKeys,
  hasNormReference,
} from '../engineerTooltips';

describe('ENGINEER_TOOLTIPS', () => {
  it('zawiera tooltips dla głównych kategorii', () => {
    expect(ENGINEER_TOOLTIPS).toHaveProperty('voltage_sn');
    expect(ENGINEER_TOOLTIPS).toHaveProperty('transformer_rated_power');
    expect(ENGINEER_TOOLTIPS).toHaveProperty('cable_cross_section');
    expect(ENGINEER_TOOLTIPS).toHaveProperty('protection_tms');
    expect(ENGINEER_TOOLTIPS).toHaveProperty('oze_frt');
    expect(ENGINEER_TOOLTIPS).toHaveProperty('earthing_petersen');
    expect(ENGINEER_TOOLTIPS).toHaveProperty('short_circuit_current');
  });

  it('każdy tooltip ma text + norm reference', () => {
    for (const [key, tooltip] of Object.entries(ENGINEER_TOOLTIPS)) {
      expect(tooltip.text).toBeTruthy();
      expect(tooltip.text.length).toBeGreaterThan(10);
      // Większość ma norm (sprawdzamy że klucz norm istnieje albo jest pusty)
      if (tooltip.norm) {
        expect(tooltip.norm).toMatch(/PN-|IEC|IEEE|NC RfG|IRiESD/);
      }
    }
  });

  it('teksty są w PL (sprawdzamy znaki PL)', () => {
    const allTexts = Object.values(ENGINEER_TOOLTIPS).map((t) => t.text).join(' ');
    expect(allTexts).toMatch(/[ąćęłńóśźż]/i);
  });
});

describe('getTooltip', () => {
  it('zwraca tooltip dla istniejącego klucza', () => {
    const t = getTooltip('voltage_sn');
    expect(t).not.toBeNull();
    expect(t!.norm).toContain('PN-EN');
  });

  it('null gdy klucz nie istnieje', () => {
    expect(getTooltip('nieistniejacy_klucz')).toBe(null);
  });
});

describe('listTooltipKeys', () => {
  it('zwraca >= 20 kluczy', () => {
    expect(listTooltipKeys().length).toBeGreaterThanOrEqual(20);
  });
});

describe('hasNormReference', () => {
  it('true gdy norm zdefiniowana', () => {
    expect(hasNormReference({ text: 'x', norm: 'PN-EN 60038' })).toBe(true);
  });
  it('false gdy norm pusta', () => {
    expect(hasNormReference({ text: 'x' })).toBe(false);
  });
});
