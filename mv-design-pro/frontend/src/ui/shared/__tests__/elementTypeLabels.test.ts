/**
 * Etykiety rodzajów elementów (karta UI-02 PANEL-DOLNY): komplet polskich etykiet bez
 * angielskiego zapasu. Kompletność unii pilnuje typ `Record<ElementType, string>`; test
 * pilnuje treści (brak kodu maszynowego) i zachowania dla rodzaju spoza unii.
 */
import { describe, expect, it } from 'vitest';

import { ELEMENT_TYPE_LABELS_PL, RODZAJ_NIEZNANY_PL, formatElementTypeLabelPl } from '../elementTypeLabels';

describe('formatElementTypeLabelPl', () => {
  it('każdy rodzaj ma polską etykietę różną od kodu (bez wielbłądziego zapisu i podkreśleń)', () => {
    for (const [kod, etykieta] of Object.entries(ELEMENT_TYPE_LABELS_PL)) {
      expect(etykieta.trim().length, kod).toBeGreaterThan(0);
      if (kod !== 'UPS') expect(etykieta, kod).not.toBe(kod);
      expect(etykieta, kod).not.toMatch(/[a-z][A-Z][a-z]/);
      expect(etykieta, kod).not.toContain('_');
    }
  });

  it('element opisowy ma polską etykietę (dawniej „Descriptive Element")', () => {
    expect(formatElementTypeLabelPl('DescriptiveElement')).toBe('Element opisowy');
  });

  it('rodzaj spoza unii → jawny opis, nie surowy kod; brak rodzaju → kreska', () => {
    expect(formatElementTypeLabelPl('NowyRodzajZBackendu')).toBe(RODZAJ_NIEZNANY_PL);
    expect(formatElementTypeLabelPl('toString')).toBe(RODZAJ_NIEZNANY_PL);
    expect(formatElementTypeLabelPl(null)).toBe('—');
  });
});
