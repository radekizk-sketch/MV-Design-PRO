/*
 * Testy wspólnego formatera energii magazynu (`formatEnergia`, karta P47a / TODO
 * konsolidacji frontu OZE). Kontrakt: jeden formater PL — kWh dla < 1000 kWh,
 * MWh dla ≥ 1000 kWh, przecinek dziesiętny PL, jednostka po spacji; wartości
 * puste/niepoliczalne → kreska. Testy pokrywają przypadki graniczne progu MWh.
 */

import { describe, expect, it } from 'vitest';

import { formatEnergia } from '../strings';

describe('formatEnergia — wspólny formater energii magazynu (kWh/MWh, PL)', () => {
  it('poniżej 1000 kWh → jednostka kWh z przecinkiem PL i spacją', () => {
    expect(formatEnergia(500)).toBe('500,0 kWh');
    expect(formatEnergia(123.4)).toBe('123,4 kWh');
  });

  it('próg 1000 kWh → przełącza na MWh (granica ≥ 1000)', () => {
    expect(formatEnergia(1000)).toBe('1,000 MWh');
    expect(formatEnergia(999.9)).toBe('999,9 kWh');
  });

  it('powyżej progu → MWh z przecinkiem PL', () => {
    expect(formatEnergia(2500)).toBe('2,500 MWh');
    expect(formatEnergia(1234)).toBe('1,234 MWh');
  });

  it('zero kWh → wartość policzalna w kWh (nie kreska)', () => {
    expect(formatEnergia(0)).toBe('0,0 kWh');
  });

  it('brak wartości / wartość niepoliczalna → kreska', () => {
    expect(formatEnergia(null)).toBe('—');
    expect(formatEnergia(Number.NaN)).toBe('—');
    expect(formatEnergia(Number.POSITIVE_INFINITY)).toBe('—');
  });
});
