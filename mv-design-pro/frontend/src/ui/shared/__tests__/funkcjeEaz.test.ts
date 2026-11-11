/**
 * Słownik funkcji EAZ i blok przekaźnika układu powiązań pola GPZ (odbiór B-02 właściciela
 * 2026-11-04, korekta wiążąca: „WSZYSTKIE kody funkcji … bez ukrywania żadnej, bez licznika”;
 * korekta v2 tego dnia: blok to ramka bez okręgu przekaźnika, kody w dwóch kolumnach wewnątrz).
 *
 * Wyrocznia niezależna od kodu produkcyjnego: jawna tabela rodzajów kodów użytych w teście
 * (zapis ze standardu ENEA / IEEE C37.2), sprawdzona z surowym słownikiem backendu
 * (`slownikFunkcjiEaz.json`, parytet `backend/tests/ci/test_parytet_slownika_funkcji_eaz.py`).
 *
 * Iloczyn cech: liczba kodów zabezpieczeń {0, 1, 2, 4, 5, 6} × funkcje nie-zabezpieczeniowe
 * {brak, automatyka, blokada, technologiczne, wszystkie trzy} × położenie nie-zabezpieczenia
 * {na początku listy, na końcu} × kod spoza słownika {brak, obecny} — kolumny bloku
 * niosą KAŻDY kod pola w kolejności danych, bez znacznika „+N”.
 */
import { describe, expect, it } from 'vitest';

import slownik from '../slownikFunkcjiEaz.json';
import { funkcjaEaz } from '../funkcjeEaz';
import { kolumnyKodowBloku } from '../../sld/v3/compose/protectionMarking';

const ZABEZPIECZENIA = ['51', '50', '51N', '67N', 'ZS', '50BF'] as const;
const INNE: Readonly<Record<string, readonly string[]>> = {
  brak: [],
  automatyka: ['79', 'SCO'],
  blokada: ['25'],
  technologiczne: ['63'],
  'wszystkie trzy': ['79', '25', '63'],
};

/** Wyrocznia: rodzaj z jawnej tabeli testu. */
const RODZAJ_WYROCZNI: Readonly<Record<string, string>> = {
  '51': 'ZABEZPIECZENIE',
  '50': 'ZABEZPIECZENIE',
  '51N': 'ZABEZPIECZENIE',
  '67N': 'ZABEZPIECZENIE',
  ZS: 'ZABEZPIECZENIE',
  '50BF': 'ZABEZPIECZENIE',
  '79': 'AUTOMATYKA',
  SCO: 'AUTOMATYKA',
  '25': 'BLOKADA',
  '63': 'TECHNOLOGICZNE',
};

describe('słownik funkcji EAZ — lustro backendu', () => {
  it('tabela wyroczni zgodna z surowym słownikiem backendu', () => {
    const funkcje = slownik.funkcje as Record<string, { rodzaj: string }>;
    for (const [kod, rodzaj] of Object.entries(RODZAJ_WYROCZNI)) expect(funkcje[kod]?.rodzaj, kod).toBe(rodzaj);
  });

  it('każdy wpis odczytany z nazwą, zapisem i rodzajem; kod spoza słownika — null', () => {
    for (const kod of Object.keys(slownik.funkcje)) {
      const f = funkcjaEaz(kod)!;
      expect(f.kod).toBe(kod);
      expect(f.nazwaPl.length).toBeGreaterThan(0);
      expect(f.oznaczeniePl.length).toBeGreaterThan(0);
    }
    expect(funkcjaEaz('XYZ')).toBeNull();
  });
});

describe('blok zabezpieczeń: wszystkie kody pola w dwóch kolumnach ramki, bez „+N" (iloczyn cech)', () => {
  for (const n of [0, 1, 2, 4, 5, 6]) {
    for (const [nazwaInnych, inne] of Object.entries(INNE)) {
      for (const polozenie of ['na początku', 'na końcu'] as const) {
        for (const obcy of [false, true]) {
          const zab = [...ZABEZPIECZENIA.slice(0, n), ...(obcy ? ['XYZ'] : [])];
          const kody = polozenie === 'na początku' ? [...inne, ...zab] : [...zab, ...inne];
          if (kody.length === 0) continue;
          it(`${n} zabezpieczeń${obcy ? ' + kod spoza słownika' : ''} × ${nazwaInnych} ${polozenie}`, () => {
            const [lewa, prawa] = kolumnyKodowBloku(kody);
            // Kolumny wypełniane kolumnami: lewa ⌈n/2⌉, prawa reszta, kolejność danych.
            expect([...lewa, ...prawa]).toEqual(kody);
            expect(lewa.length).toBe(Math.ceil(kody.length / 2));
            expect([...lewa, ...prawa].some((k) => k.startsWith('+'))).toBe(false);
            // Każdy rodzaj funkcji (także automatyka, blokady, technologiczne) stoi w bloku.
            for (const k of inne) expect([...lewa, ...prawa]).toContain(k);
          });
        }
      }
    }
  }
});
