import { describe, expect, it } from 'vitest';

import {
  RODZAJ_OBIEKTU_PL,
  jestNazwa,
  miejsceWKolekcji,
  nazwaObiektuPl,
  nazwaPoReferencjiPl,
  nazwaZRodzajemPl,
  pierwszaNazwa,
  type MiejsceObiektu,
  type RodzajObiektuNazwy,
} from '../nazwaObiektu';

/**
 * Nazwa obiektu na ekranie — iloczyn cech: KAŻDY rodzaj obiektu × nazwa (jest / z białymi
 * znakami / pusta / same spacje / null / undefined / referencja z odciskiem / UUID / długi
 * skrót) × miejsce (numer w kolekcji / rodzic z nazwą / rodzic będący identyfikatorem / rodzic
 * pusty / spoza modelu / spoza katalogu / brak). Oczekiwanie wypisane wprost (tabela opisów),
 * nie wyliczone tą samą funkcją; niezmiennik: wynik NIGDY nie zawiera identyfikatora.
 */

const REF = 'stn/4855aa0c1b2d3e4f5a6b7c8d/station';
const UUID = '0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
const SKROT = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b';

const RODZAJE = Object.keys(RODZAJ_OBIEKTU_PL) as RodzajObiektuNazwy[];

const NAZWY: ReadonlyArray<readonly [string, string | null | undefined, string | null]> = [
  ['jest', 'GPZ Północ', 'GPZ Północ'],
  ['z białymi znakami', '  Odcinek L-3  ', 'Odcinek L-3'],
  ['pusta', '', null],
  ['same spacje', '   ', null],
  ['null', null, null],
  ['undefined', undefined, null],
  ['referencja z odciskiem', REF, null],
  ['UUID', UUID, null],
  ['skrót SHA', SKROT, null],
];

const MIEJSCA: ReadonlyArray<readonly [string, MiejsceObiektu | null | undefined, (rodzajPl: string) => string]> = [
  ['numer w kolekcji', { numer: 3, liczba: 12 }, (r) => `${r} bez nazwy (3 z 12)`],
  ['rodzic z nazwą', { rodzic: ' Stacja S-08 ' }, (r) => `${r} bez nazwy (Stacja S-08)`],
  ['rodzic będący identyfikatorem', { rodzic: REF }, (r) => `${r} bez nazwy`],
  ['rodzic pusty', { rodzic: '' }, (r) => `${r} bez nazwy`],
  ['spoza modelu', { spozaModelu: true }, (r) => `${r} spoza modelu`],
  ['spoza katalogu', { spozaKatalogu: true }, (r) => `${r} spoza katalogu`],
  ['brak miejsca (null)', null, (r) => `${r} bez nazwy`],
  ['brak miejsca (undefined)', undefined, (r) => `${r} bez nazwy`],
];

const OPISY_RODZAJOW: Readonly<Record<RodzajObiektuNazwy, string>> = {
  szyna: 'Szyna',
  odcinek: 'Odcinek',
  transformator: 'Transformator',
  zrodlo: 'Źródło',
  generator: 'Źródło wytwórcze',
  stacja: 'Stacja',
  pole: 'Pole',
  odbior: 'Odbiór',
  lacznik: 'Łącznik',
  przekladnik: 'Przekładnik',
  wylacznik_roznicowopradowy: 'Wyłącznik różnicowoprądowy',
  sekcja: 'Sekcja szyn',
  punkt_podzialu: 'Punkt podziału',
  przypadek: 'Przypadek obliczeniowy',
  pozycja_katalogu: 'Pozycja katalogu',
  gniazdo: 'Gniazdo',
  ciag: 'Ciąg',
  producent: 'Producent',
  element: 'Element modelu',
};

describe('nazwaObiektuPl — rodzaj × nazwa × miejsce', () => {
  it('słownik rodzajów jest kompletny i po polsku (każdy rodzaj ma opis z tabeli)', () => {
    expect(RODZAJ_OBIEKTU_PL).toEqual(OPISY_RODZAJOW);
  });

  for (const rodzaj of RODZAJE) {
    for (const [opisNazwy, nazwa, oczekiwanaNazwa] of NAZWY) {
      for (const [opisMiejsca, miejsce, opisBraku] of MIEJSCA) {
        it(`${rodzaj} × nazwa ${opisNazwy} × ${opisMiejsca}`, () => {
          const wynik = nazwaObiektuPl(nazwa, rodzaj, miejsce);
          expect(wynik).toBe(oczekiwanaNazwa ?? opisBraku(OPISY_RODZAJOW[rodzaj]));
          for (const identyfikator of [REF, UUID, SKROT]) expect(wynik).not.toContain(identyfikator);
          expect(wynik.trim()).toBe(wynik);
          expect(wynik).not.toBe('');
        });
      }
    }
  }
});

describe('nazwaZRodzajemPl — rodzaj podany po polsku', () => {
  it('etykieta typu inspektora jako rodzaj; pusty rodzaj → „Element modelu”', () => {
    expect(nazwaZRodzajemPl(null, 'Gałąź', { numer: 2, liczba: 5 })).toBe('Gałąź bez nazwy (2 z 5)');
    expect(nazwaZRodzajemPl('', 'Projekt')).toBe('Projekt bez nazwy');
    expect(nazwaZRodzajemPl(REF, '  ')).toBe('Element modelu bez nazwy');
    expect(nazwaZRodzajemPl('Kabel L-1', 'Gałąź')).toBe('Kabel L-1');
  });
});

describe('miejsceWKolekcji', () => {
  const kolekcja = [
    { ref_id: 'bus/a', id: 'u-1' },
    { ref_id: 'bus/b', id: 'u-2' },
    { ref_id: null, id: 'u-3' },
  ];

  it('po tożsamości, po ref_id i po id → numer od 1 i liczebność kolekcji', () => {
    expect(miejsceWKolekcji(kolekcja, kolekcja[1])).toEqual({ numer: 2, liczba: 3 });
    expect(miejsceWKolekcji(kolekcja, 'bus/a')).toEqual({ numer: 1, liczba: 3 });
    expect(miejsceWKolekcji(kolekcja, 'u-3')).toEqual({ numer: 3, liczba: 3 });
    expect(miejsceWKolekcji(kolekcja, { id: 'u-3' })).toEqual({ numer: 3, liczba: 3 });
  });

  it('obiekt spoza kolekcji, brak kolekcji, brak obiektu → null (bez zgadywania numeru)', () => {
    expect(miejsceWKolekcji(kolekcja, 'bus/zz')).toBeNull();
    expect(miejsceWKolekcji(null, 'bus/a')).toBeNull();
    expect(miejsceWKolekcji(undefined, 'bus/a')).toBeNull();
    expect(miejsceWKolekcji(kolekcja, null)).toBeNull();
    expect(miejsceWKolekcji(kolekcja, undefined)).toBeNull();
    expect(miejsceWKolekcji([], 'bus/a')).toBeNull();
  });
});

describe('nazwaPoReferencjiPl — referencja × obiekt w modelu × nazwa', () => {
  const szyny = [
    { ref_id: 'bus/a', id: 'u-1', name: 'Szyna SN 1' },
    { ref_id: 'bus/b', id: 'u-2', name: '' },
    { ref_id: 'bus/c', id: 'u-3', name: null },
    { ref_id: 'bus/d', id: 'u-4', name: REF },
  ];

  it('brak referencji → zdanie zapasowe wołającego (domyślnie kreska)', () => {
    expect(nazwaPoReferencjiPl(szyny, null, 'szyna')).toBe('—');
    expect(nazwaPoReferencjiPl(szyny, '', 'szyna')).toBe('—');
    expect(nazwaPoReferencjiPl(szyny, undefined, 'szyna', 'Szyna nieprzypisana')).toBe('Szyna nieprzypisana');
  });

  it('referencja spoza modelu → „spoza modelu”, nigdy referencja', () => {
    expect(nazwaPoReferencjiPl(szyny, 'bus/zz', 'szyna')).toBe('Szyna spoza modelu');
    expect(nazwaPoReferencjiPl(null, 'bus/a', 'szyna')).toBe('Szyna spoza modelu');
  });

  it('obiekt z nazwą → nazwa; bez nazwy (pusta / null / identyfikator) → numer w kolekcji', () => {
    expect(nazwaPoReferencjiPl(szyny, 'bus/a', 'szyna')).toBe('Szyna SN 1');
    expect(nazwaPoReferencjiPl(szyny, 'u-1', 'szyna')).toBe('Szyna SN 1');
    expect(nazwaPoReferencjiPl(szyny, 'bus/b', 'szyna')).toBe('Szyna bez nazwy (2 z 4)');
    expect(nazwaPoReferencjiPl(szyny, 'bus/c', 'szyna')).toBe('Szyna bez nazwy (3 z 4)');
    expect(nazwaPoReferencjiPl(szyny, 'bus/d', 'szyna')).toBe('Szyna bez nazwy (4 z 4)');
  });
});

describe('pierwszaNazwa i jestNazwa', () => {
  it('pierwsza wartość nadająca się na nazwę; liczby, puste i identyfikatory pomijane', () => {
    expect(pierwszaNazwa(undefined, '', '  ', 42, REF, ' YAKXS 3x240 ', 'drugi')).toBe('YAKXS 3x240');
    expect(pierwszaNazwa(null, undefined, UUID)).toBeNull();
    expect(pierwszaNazwa()).toBeNull();
  });

  it('jestNazwa: tekst niepusty i niebędący identyfikatorem', () => {
    expect(jestNazwa('Pole L-1')).toBe(true);
    expect(jestNazwa('')).toBe(false);
    expect(jestNazwa('  ')).toBe(false);
    expect(jestNazwa(null)).toBe(false);
    expect(jestNazwa(7)).toBe(false);
    expect(jestNazwa(SKROT)).toBe(false);
  });
});
