import { describe, expect, it } from 'vitest';
import { BRAK_DANYCH_PL, pradKaLubBrakDanych } from '../pradZwarciowyKatalogu';

describe('pradKaLubBrakDanych — zapis prądu zwarciowego pozycji katalogu', () => {
  it.each([
    [25, '25 kA'],
    [12.5, '12.5 kA'],
    [31.5, '31.5 kA'],
  ])('liczba %s → %s', (wartosc, oczekiwany) => {
    expect(pradKaLubBrakDanych(wartosc)).toBe(oczekiwany);
  });

  it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY, '25'])(
    'brak liczby (%s) → „brak danych”, nigdy „0 kA” ani „- kA”',
    (wartosc) => {
      expect(pradKaLubBrakDanych(wartosc)).toBe(BRAK_DANYCH_PL);
    },
  );
});
