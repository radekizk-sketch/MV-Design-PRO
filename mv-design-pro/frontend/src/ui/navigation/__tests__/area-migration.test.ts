import { describe, expect, it } from 'vitest';

import { normalizeAreaId } from '../areaRegistry';

describe('area-migration - normalizacja starych kodów', () => {
  it('mapuje stare kody do kanonicznych identyfikatorów', () => {
    expect(normalizeAreaId('MO')).toBe('MODEL_SIECI');
    expect(normalizeAreaId('TE')).toBe('SCHEMAT_TOPOLOGIA');
    expect(normalizeAreaId('AN')).toBe('STUDIA_OBLICZENIOWE');
    expect(normalizeAreaId('ZA')).toBe('ZABEZPIECZENIA_AUTOMATYKA');
    expect(normalizeAreaId('OZ')).toBe('ZRODLA_PRZYLACZENIA');
    expect(normalizeAreaId('AD')).toBe('KATALOGI_TECHNICZNE');
    expect(normalizeAreaId('RA')).toBe('RAPORTY_UZASADNIENIA');
    expect(normalizeAreaId('HI')).toBe('HISTORIA_AUDYT');
  });

  it('akceptuje identyfikatory kanoniczne i bezpiecznie wraca do budowy sieci', () => {
    expect(normalizeAreaId('WYNIKI_ANALIZY')).toBe('WYNIKI_ANALIZY');
    expect(normalizeAreaId('nieznany')).toBe('MODEL_SIECI');
    expect(normalizeAreaId(null)).toBe('MODEL_SIECI');
  });
});
