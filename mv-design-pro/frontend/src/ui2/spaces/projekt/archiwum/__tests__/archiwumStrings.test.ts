/**
 * Testy czystych pomocników okna archiwum: nazwa pobieranego pliku (musi być
 * deterministyczna — ta sama data i nazwa dają ten sam plik), rozpoznanie
 * rozszerzenia paczki i format daty z archiwum.
 */

import { describe, expect, it } from 'vitest';

import { formatujDateArchiwum, jestPlikiemArchiwum, nazwaPlikuArchiwum } from '../strings';

const DATA = new Date(2026, 7, 5); // 2026-08-05 (lokalna, bez strefy)

describe('nazwaPlikuArchiwum — deterministyczna nazwa pobrania', () => {
  it('nazwa projektu sprowadzona do bezpiecznych znaków, bez znaków diakrytycznych', () => {
    expect(nazwaPlikuArchiwum('Sieć Wschód', DATA)).toBe('archiwum-siec-wschod-2026-08-05.mvdp.zip');
  });

  it('to samo wejście → ten sam wynik (powtarzalność)', () => {
    expect(nazwaPlikuArchiwum('GPZ Południe 15 kV', DATA)).toBe(
      nazwaPlikuArchiwum('GPZ Południe 15 kV', DATA),
    );
  });

  it('brak nazwy projektu → sam znacznik daty (bez pustego łącznika)', () => {
    expect(nazwaPlikuArchiwum(null, DATA)).toBe('archiwum-2026-08-05.mvdp.zip');
    expect(nazwaPlikuArchiwum('   ', DATA)).toBe('archiwum-2026-08-05.mvdp.zip');
  });

  it('miesiąc i dzień dopełnione do dwóch cyfr', () => {
    expect(nazwaPlikuArchiwum('A', new Date(2026, 0, 9))).toBe('archiwum-a-2026-01-09.mvdp.zip');
  });
});

describe('jestPlikiemArchiwum — rozszerzenia przyjmowane przez backend', () => {
  it('przyjmuje .zip i .mvdp.zip, także w wersji z wielkich liter', () => {
    expect(jestPlikiemArchiwum('projekt.zip')).toBe(true);
    expect(jestPlikiemArchiwum('projekt.mvdp.zip')).toBe(true);
    expect(jestPlikiemArchiwum('PROJEKT.ZIP')).toBe(true);
  });

  it('odrzuca inne rozszerzenia', () => {
    expect(jestPlikiemArchiwum('model.xlsx')).toBe(false);
    expect(jestPlikiemArchiwum('archiwum.zip.txt')).toBe(false);
  });
});

describe('formatujDateArchiwum', () => {
  it('sygnatura z backendu → „RRRR-MM-DD GG:MM"', () => {
    expect(formatujDateArchiwum('2026-07-30T08:15:23Z')).toBe('2026-07-30 08:15');
  });

  it('brak daty → myślnik', () => {
    expect(formatujDateArchiwum(null)).toBe('—');
    expect(formatujDateArchiwum(undefined)).toBe('—');
  });
});
