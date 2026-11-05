// @vitest-environment node
/**
 * Jedna mechanika wartości projektanta dla każdej rodziny rejestru (aparat SN, maszyna wirująca).
 * Iloczyn cech: {rodzina aparatu, rodzina maszyny} × {wartość nowa, niezmieniona, zmieniona,
 * wyczyszczona, nieliczbowa, przecinek dziesiętny} × {uzasadnienie podane, puste} oraz klucze
 * innej rodziny w `overrides` (nie wchodzą do formularza; w porównaniu liczą się jako zmiana —
 * zapis listy z formularza je usuwa, co jest akcją naprawczą blokady walidatora E011).
 */

import { describe, expect, it } from 'vitest';

import type { ParameterOverride } from '../../../../types/enm';
import {
  formularzZNadpisanRejestru,
  nadpisaniaZFormularzaRejestru,
  nadpisaniaZmienioneRejestru,
} from '../wartosciRoboczeWspolne';

const RODZINY = {
  aparat: ['break_time_s', 'i_th_ka', 'i_th_duration_s', 'i_dyn_ka'],
  maszyna: ['pole_pairs', 'i_lr_ratio', 'cos_phi', 'efficiency'],
} as const;

describe.each(Object.entries(RODZINY))('rodzina %s', (_, parametry) => {
  const [p0, p1, p2] = parametry;
  const POPRZEDNIE: ParameterOverride[] = [
    { key: p1, value: 4, reason: 'tabliczka' },
    { key: 'klucz_innej_rodziny', value: 7, reason: null },
  ];

  it('formularz z overrides: wyłącznie parametry rodziny, liczba jako tekst, reszta pusta', () => {
    const formularz = formularzZNadpisanRejestru(parametry, [
      ...POPRZEDNIE,
      { key: p2, value: 'tekst', reason: null },
    ]);
    expect(Object.keys(formularz)).toEqual([...parametry]);
    expect(formularz[p1]).toBe('4');
    expect(formularz[p0]).toBe('');
    expect(formularz[p2]).toBe('');
    expect(formularz).not.toHaveProperty('klucz_innej_rodziny');
  });

  it('nowa wartość (przecinek) → lista w kolejności rejestru; niezmieniona zachowuje uzasadnienie', () => {
    const wynik = nadpisaniaZFormularzaRejestru(
      parametry,
      { ...formularzZNadpisanRejestru(parametry, POPRZEDNIE), [p0]: ' 2,5 ' },
      POPRZEDNIE,
      'karta producenta',
    );
    expect(wynik).toEqual({
      rodzaj: 'lista',
      nadpisania: [
        { key: p0, value: 2.5, reason: 'karta producenta' },
        { key: p1, value: 4, reason: 'tabliczka' },
      ],
    });
  });

  it('zmieniona wartość dostaje nowe uzasadnienie; puste uzasadnienie → null', () => {
    const wynik = nadpisaniaZFormularzaRejestru(parametry, { [p1]: '6' }, POPRZEDNIE, '   ');
    expect(wynik).toEqual({ rodzaj: 'lista', nadpisania: [{ key: p1, value: 6, reason: null }] });
  });

  it('wyczyszczenie wszystkich pól → pusta lista', () => {
    expect(nadpisaniaZFormularzaRejestru(parametry, {}, POPRZEDNIE, 'x')).toEqual({ rodzaj: 'lista', nadpisania: [] });
  });

  it('tekst nieliczbowy → błąd nazwanego parametru (pierwszego w kolejności rejestru)', () => {
    expect(nadpisaniaZFormularzaRejestru(parametry, { [p2]: 'dużo', [p1]: 'abc' }, [], '')).toEqual({
      rodzaj: 'blad',
      parametr: p1,
    });
  });

  it('zmiana wykrywana na całej liście elementu — wpis spoza rodziny usuwa zapis (naprawa E011)', () => {
    const rodzinne: ParameterOverride[] = [{ key: p1, value: 4, reason: 'tabliczka' }];
    const bezZmian = [{ key: p1, value: 4, reason: 'inne uzasadnienie' }];
    expect(nadpisaniaZmienioneRejestru(bezZmian, rodzinne)).toBe(false);
    expect(nadpisaniaZmienioneRejestru([{ key: p1, value: 5, reason: null }], rodzinne)).toBe(true);
    expect(nadpisaniaZmienioneRejestru([], rodzinne)).toBe(true);
    expect(nadpisaniaZmienioneRejestru([], null)).toBe(false);
    expect(nadpisaniaZmienioneRejestru([...bezZmian, { key: p0, value: 1, reason: null }], rodzinne)).toBe(
      true,
    );
    // Model sprzed bramy: klucz innej rodziny (POPRZEDNIE) albo wartość nieliczbowa parametru
    // rodziny — formularz ich nie pokazuje, a zapis listy z formularza je usuwa: to zmiana.
    expect(nadpisaniaZmienioneRejestru(bezZmian, POPRZEDNIE)).toBe(true);
    expect(nadpisaniaZmienioneRejestru([], [{ key: p2, value: '0,9', reason: null }])).toBe(true);
  });
});
