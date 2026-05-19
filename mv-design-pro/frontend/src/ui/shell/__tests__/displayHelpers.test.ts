import { describe, expect, it } from 'vitest';

import {
  looksLikeTechnicalId,
  projectDisplayName,
  formatDisplayId,
  sanitizeDisplayValue,
} from '../displayHelpers';

describe('looksLikeTechnicalId — detekcja UUID/SHA/hex', () => {
  it.each([
    ['12345678-1234-1234-1234-123456789012', true],
    ['abcdef01-2345-6789-abcd-ef0123456789', true],
    ['E2E_test-flow', true],
    ['E2E-flow', true],
    ['0123456789abcdef', true],
    ['0123456789abcdef0123456789abcdef', true],
    ['Stacja Włoszczowa', false],
    ['GPZ Demo', false],
    ['Pole Liniowe 1', false],
    ['', false],
    [null, false],
    [undefined, false],
    ['ABC', false],
    ['Pole-1', false],
  ])('looksLikeTechnicalId("%s") → %s', (input, expected) => {
    expect(looksLikeTechnicalId(input as string | null | undefined)).toBe(expected);
  });
});

describe('projectDisplayName — nazwa projektu', () => {
  it('Zwraca nazwę gdy nie jest technical ID', () => {
    expect(projectDisplayName('Sieć SN Włoszczowa 2026', 'p-123')).toBe('Sieć SN Włoszczowa 2026');
  });

  it('Nazwa technical + ID → "Projekt bez nazwy"', () => {
    expect(projectDisplayName('12345678-1234-1234-1234-123456789012', 'id-abc')).toBe(
      'Projekt bez nazwy',
    );
  });

  it('Brak nazwy + brak ID → "—"', () => {
    expect(projectDisplayName(null, null)).toBe('—');
    expect(projectDisplayName('', '')).toBe('—');
    expect(projectDisplayName(undefined, undefined)).toBe('—');
  });

  it('Brak nazwy + istnieje ID → "Projekt bez nazwy"', () => {
    expect(projectDisplayName(null, 'p-123')).toBe('Projekt bez nazwy');
  });
});

describe('formatDisplayId — format ID dla Inspector', () => {
  it('Zwraca nazwę gdy human-readable', () => {
    expect(formatDisplayId('elem-uuid-xxxxxxxx', 'Pole Liniowe L1')).toBe('Pole Liniowe L1');
  });

  it('Technical name → "Element #ABCD1234"', () => {
    expect(formatDisplayId('abcd1234-5678-1234-5678-abcdef012345', 'abcd1234-5678-1234-5678-abcdef012345'))
      .toBe('Element #ABCD1234');
  });

  it('Brak nazwy + technical ID → "Element #XXXXXXXX"', () => {
    expect(formatDisplayId('deadbeef-1234-5678-9012-345678901234', null))
      .toBe('Element #DEADBEEF');
  });

  it('Brak obu → fallback "—"', () => {
    expect(formatDisplayId(null, null)).toBe('—');
  });

  it('Custom fallback', () => {
    expect(formatDisplayId(null, null, 'Brak danych')).toBe('Brak danych');
  });

  it('ID z różnymi separatorami → consistent 8-char head', () => {
    expect(formatDisplayId('abcd1234567890ef', null)).toBe('Element #ABCD1234');
  });
});

describe('sanitizeDisplayValue — filtrowanie wartości', () => {
  it('Zwraca wartość human-readable bez zmian', () => {
    expect(sanitizeDisplayValue('Pole Liniowe SN')).toBe('Pole Liniowe SN');
  });

  it('Technical ID → format "Element #..."', () => {
    expect(sanitizeDisplayValue('abc12345-1234-1234-1234-abcdef012345'))
      .toMatch(/^Element #[A-F0-9]{8}$/);
  });

  it('Empty/null → fallback', () => {
    expect(sanitizeDisplayValue(null)).toBe('—');
    expect(sanitizeDisplayValue('')).toBe('—');
    expect(sanitizeDisplayValue('   ')).toBe('—');
  });

  it('Custom fallback', () => {
    expect(sanitizeDisplayValue(null, { fallback: 'Brak' })).toBe('Brak');
  });

  it('hideTechnicalIds=false → przepuszcza technical ID', () => {
    const raw = 'abc12345-1234-1234-1234-abcdef012345';
    expect(sanitizeDisplayValue(raw, { hideTechnicalIds: false })).toBe(raw);
  });

  it('Trim white space', () => {
    expect(sanitizeDisplayValue('  Stacja  ')).toBe('Stacja');
  });
});
