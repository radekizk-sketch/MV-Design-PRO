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
    for (const tooltip of Object.values(ENGINEER_TOOLTIPS)) {
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

// Decyzja właściciela 2026-10-15 (V12K-352): podpowiedź nie podaje uniwersalnej liczby jako
// faktu o urządzeniu, nastawie ani kryterium projektu — mówi, skąd wartość wziąć.
describe('ENGINEER_TOOLTIPS — bez uniwersalnych liczb podanych jako fakt', () => {
  it('żaden tekst nie przybliża wartości urządzenia/nastawy („~", „typowo", „zwykle")', () => {
    for (const [klucz, tooltip] of Object.entries(ENGINEER_TOOLTIPS)) {
      expect(tooltip.text, klucz).not.toMatch(/~|\btypowo\b|\bzwykle\b|\bok\.\s*\d/i);
    }
  });

  it('prąd załączania: zależność od konstrukcji i warunków, wartość od producenta, bez krotności', () => {
    const tekst = ENGINEER_TOOLTIPS.transformer_inrush.text;
    expect(tekst).toMatch(/konstrukcji transformatora/);
    expect(tekst).toMatch(/warunków załączenia/);
    expect(tekst).toMatch(/producent/);
    expect(tekst).toMatch(/nie ma wartości uniwersalnej/);
    expect(tekst).not.toMatch(/\d\s*[×x]\s*I/);
    expect(tekst).not.toMatch(/\d+\s*[-–]\s*\d+/);
  });

  it('każdy powołany dokument normatywny jest właściwy dziedzinie (bez norm nN dla kabli SN i normy OZE dla rozpływu)', () => {
    expect(ENGINEER_TOOLTIPS.cable_length.norm).toBeUndefined();
    expect(ENGINEER_TOOLTIPS.power_flow_tolerance.norm).toBeUndefined();
    expect(ENGINEER_TOOLTIPS.voltage_wn.text).toMatch(/110 kV \(sieć dystrybucyjna/);
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
