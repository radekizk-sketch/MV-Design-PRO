/**
 * Karta PODSTAWA-Q (zasada nr 4): dobór parametrów maszyny wirującej generatora z rejestru
 * backendu i podpowiedź „co obliczenie przyjmie bez wartości projektanta".
 * Iloczyn cech: {synchroniczna, asynchroniczna klatkowa, dwustronnie zasilana, falownik, brak
 * rodzaju} × {rejestr dostępny, brak rejestru, odpowiedź innego kształtu} oraz
 * {dana tabliczki liczbowa, tekst, NaN, brak tabliczki} × {rodzina synchroniczna, asynchroniczna}.
 */

import { describe, expect, it } from 'vitest';

import {
  czyRejestrMaszyn,
  parametryMaszynyGeneratora,
  zrodloParametruMaszyny,
} from '../wartosciRoboczeMaszyny';
import { REJESTR_MASZYN } from './rejestrMaszynFixture';

describe('parametryMaszynyGeneratora', () => {
  it.each([
    ['synchronous', ['xd_subtransient_pu', 'cos_phi']],
    ['fw_scig', ['pole_pairs', 'i_lr_ratio', 'cos_phi', 'efficiency']],
    ['fw_dfig', ['pole_pairs', 'i_lr_ratio', 'cos_phi', 'efficiency']],
  ])('%s → parametry rodziny w kolejności rejestru', (genType, klucze) => {
    expect(parametryMaszynyGeneratora(REJESTR_MASZYN, genType)?.map((p) => p.parametr)).toEqual(klucze);
  });

  it.each(['pv_inverter', 'bess', 'wind_inverter', 'fw_pmsg', '', null, undefined])(
    'rodzaj spoza rejestru (%s) → null (generator bez modelu maszyny wirującej)',
    (genType) => {
      expect(parametryMaszynyGeneratora(REJESTR_MASZYN, genType)).toBeNull();
    },
  );

  it('rejestr nieobecny → null dla każdego rodzaju', () => {
    expect(parametryMaszynyGeneratora(null, 'synchronous')).toBeNull();
    expect(parametryMaszynyGeneratora(null, 'fw_scig')).toBeNull();
  });

  it('rodzaj wskazuje rodzinę nieobecną w słowniku rodzin → null (bez zgadywania)', () => {
    const okrojony = { ...REJESTR_MASZYN, rodziny: { MASZYNA_SYNCHRONICZNA: REJESTR_MASZYN.rodziny.MASZYNA_SYNCHRONICZNA } };
    expect(parametryMaszynyGeneratora(okrojony as typeof REJESTR_MASZYN, 'fw_scig')).toBeNull();
  });
});

describe('czyRejestrMaszyn', () => {
  it('odpowiedź w kształcie kontraktu → rejestr', () => {
    expect(czyRejestrMaszyn(REJESTR_MASZYN)).toBe(true);
  });

  it.each([
    ['null', null],
    ['tablica', []],
    ['napis', 'rejestr'],
    ['brak rodzajów', { rodziny: REJESTR_MASZYN.rodziny }],
    ['brak rodzin', { rodzaj_generatora: REJESTR_MASZYN.rodzaj_generatora }],
    ['rodzaje jako tablica', { rodzaj_generatora: [], rodziny: REJESTR_MASZYN.rodziny }],
    ['rodzina nie jest listą', { rodzaj_generatora: REJESTR_MASZYN.rodzaj_generatora, rodziny: { MASZYNA_SYNCHRONICZNA: {} } }],
  ])('%s → nie rejestr (rejestr niedostępny, bez zgadywania rodziny)', (_, odpowiedz) => {
    expect(czyRejestrMaszyn(odpowiedz)).toBe(false);
  });
});

describe('zrodloParametruMaszyny', () => {
  const [XD, COS_SYNC] = REJESTR_MASZYN.rodziny.MASZYNA_SYNCHRONICZNA;
  const [PARY, , COS_ASYNC] = REJESTR_MASZYN.rodziny.MASZYNA_ASYNCHRONICZNA;

  it.each([
    ['x″d synchronicznej', XD, { xd_subtransient_pu: 0.18 }, 0.18],
    ['p asynchronicznej', PARY, { pole_pairs: 3 }, 3],
    ['cos φ asynchronicznej', COS_ASYNC, { cos_phi: 0.88 }, 0.88],
  ])('%s: liczba z tabliczki → dana tabliczki', (_, opis, tabliczka, wartosc) => {
    expect(zrodloParametruMaszyny(tabliczka, opis)).toEqual({ rodzaj: 'tabliczka', wartosc });
  });

  it.each([
    ['brak tabliczki', null],
    ['tabliczka bez klucza', { inny: 1 }],
    ['tekst zamiast liczby', { cos_phi: '0,9' }],
    ['NaN', { cos_phi: Number.NaN }],
    ['nieskończoność', { cos_phi: Number.POSITIVE_INFINITY }],
  ])('%s → propozycja rejestru z rodzajem źródła (rodzina synchroniczna i asynchroniczna)', (_, tabliczka) => {
    expect(zrodloParametruMaszyny(tabliczka, COS_SYNC)).toEqual({
      rodzaj: 'propozycja',
      wartosc: 0.8,
      rodzajZrodla: 'ZALOZENIE_INZYNIERSKIE',
    });
    expect(zrodloParametruMaszyny(tabliczka, COS_ASYNC)).toEqual({
      rodzaj: 'propozycja',
      wartosc: 0.85,
      rodzajZrodla: 'ZALOZENIE_INZYNIERSKIE',
    });
  });
});
