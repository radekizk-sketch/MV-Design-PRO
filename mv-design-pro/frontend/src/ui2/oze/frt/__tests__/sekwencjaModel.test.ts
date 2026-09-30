/*
 * Testy jednostkowe modelu sekcji „Sekwencja zapadów": serializacja edytora do
 * parametru API (KROPKA dziesiętna) oraz adaptery tabeli zapadów (pierwszy plan:
 * echo + etykieta oceny; audyt: pola solvera bez tagów). Czyste funkcje.
 *
 * Zmiana kanonu (uczciwość natychmiastowa 2026-09-23): odznaka „werdyktu sekwencji"
 * skasowana — brak eksportu pilnuje `uczciwosc.test.tsx`.
 */

import { describe, it, expect } from 'vitest';

import { serializujSekwencjeFrt } from '../../api';
import {
  kolumnyAudytuSekwencji,
  wierszeAudytuSekwencji,
  wierszeTabeliSekwencji,
} from '../sekwencjaModel';
import { widokSekwencjiZKontekstemFixture } from './fixtures';

describe('serializujSekwencjeFrt — kontrakt parametru sekwencja', () => {
  it('serializuje pary głębokość:czas z KROPKĄ dziesiętną, rozdzielone przecinkiem', () => {
    expect(
      serializujSekwencjeFrt([
        { glebokoscPu: 0.05, czasS: 0.15 },
        { glebokoscPu: 0.3, czasS: 0.2 },
      ]),
    ).toBe('0.05:0.15,0.3:0.2');
  });

  it('pojedynczy zapad → jedna para bez przecinka', () => {
    expect(serializujSekwencjeFrt([{ glebokoscPu: 0.1, czasS: 0.5 }])).toBe('0.1:0.5');
  });
});

describe('wierszeTabeliSekwencji — adapter tabeli zapadów (pierwszy plan)', () => {
  it('mapuje każdy zapad na wiersz z echem wejścia i etykietą z rekordu oceny', () => {
    const wiersze = wierszeTabeliSekwencji(widokSekwencjiZKontekstemFixture());
    expect(wiersze).toHaveLength(2);
    expect(wiersze[0].ocena.wartosc).toBe('Ocena niewykonana');
    expect(wiersze[1].glebokosc.wartosc).toBe('0,020');
    expect(wiersze[1].czas.wartosc).toBe('0,500');
    expect(Object.keys(wiersze[1])).not.toContain('utrzymanie');
  });
});

describe('wierszeAudytuSekwencji — pola solvera w sekcji audytowej', () => {
  it('numer zapadu zamiast identyfikatora scenariusza; meldunek odłączenia bez tagu', () => {
    expect(kolumnyAudytuSekwencji().map((k) => k.klucz)).toEqual([
      'zapad',
      'status',
      'utrzymanie',
      'margines_s',
      'margines_pu',
      'odzysk',
    ]);
    const wiersze = wierszeAudytuSekwencji(widokSekwencjiZKontekstemFixture());
    expect(wiersze[1].zapad.wartosc).toBe('2');
    expect(wiersze[1].utrzymanie.wartosc).toBe('Nie');
    expect(wiersze[1].utrzymanie.ostrzezenie).toBeUndefined();
  });
});
