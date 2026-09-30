/**
 * Stan zerowy sekcji „Zgodność przypadku" (karta AB-1a Pakiet D2 §3) — iloczyn cech
 * przypadek × operator × błąd × ładowanie × wynik (DER objęte / pominięte / brak).
 * Kolejność pierwszeństwa: brak przypadku › brak operatora › błąd › ładowanie › brak DER › gotowe.
 */

import { describe, expect, it } from 'vitest';

import type { ZgodnoscPrzypadkuNcRfg } from '../../ncrfg/typy';
import { nazwaModuluPrzekrojowego, rozwiazStanZgodnosciPrzekrojowej } from '../zgodnoscPrzekrojowaModel';
import { zgodnoscFixture } from './fixtures';

const PUSTY: ZgodnoscPrzypadkuNcRfg = {
  case_id: 'c',
  operator_id: 'enea',
  der_count: 0,
  pominiete: [],
  certyfikaty_odrzucone: [],
  bieg: null,
};
const POMINIETY: ZgodnoscPrzypadkuNcRfg = {
  ...PUSTY,
  pominiete: [{ der_ref: 'fw-1', der_name: 'Farma', powod: 'brak_napiecia', powod_pl: 'brak napięcia szyny' }],
};

describe('rozwiazStanZgodnosciPrzekrojowej', () => {
  const baza = { caseId: 'c', operatorId: 'enea', ladowanie: false, blad: null, wynik: zgodnoscFixture() };
  it.each([
    ['brak przypadku ma pierwszeństwo nad wszystkim', { ...baza, caseId: null, operatorId: null, blad: 'x' }, 'brak_przypadku'],
    ['brak operatora (nie zgadujemy profilu)', { ...baza, operatorId: null, blad: 'x' }, 'brak_operatora'],
    ['błąd ma pierwszeństwo nad ładowaniem i wynikiem', { ...baza, blad: 'x', ladowanie: true }, 'blad'],
    ['ładowanie trwa', { ...baza, ladowanie: true }, 'ladowanie'],
    ['wynik jeszcze nie przyszedł', { ...baza, wynik: null }, 'ladowanie'],
    ['nikt nie objęty i nikt nie pominięty', { ...baza, wynik: PUSTY }, 'brak_der'],
    ['pominięte z powodem to treść, nie stan zerowy', { ...baza, wynik: POMINIETY }, 'gotowe'],
    ['bieg przyszedł', baza, 'gotowe'],
  ] as const)('%s', (_opis, parametry, oczekiwany) => {
    expect(rozwiazStanZgodnosciPrzekrojowej(parametry)).toBe(oczekiwany);
  });
});

describe('nazwaModuluPrzekrojowego', () => {
  it('słownik macierzy › der_name biegu › sam der_ref', () => {
    expect(nazwaModuluPrzekrojowego('pv', 'PV z biegu', { pv: 'PV z macierzy' })).toBe('PV z macierzy');
    expect(nazwaModuluPrzekrojowego('pv', 'PV z biegu', {})).toBe('PV z biegu');
    expect(nazwaModuluPrzekrojowego('pv', null, {})).toBe('pv');
  });
});
