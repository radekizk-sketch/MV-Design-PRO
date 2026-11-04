/**
 * Podział funkcji EAZ pola na blok przekaźnika i „+N" (karta UX-04/POLE-LINIOWE-WZORZEC:
 * „≤ 4 kody funkcji zabezpieczeń (ANSI) + »+N«, automatyka poza kanwą").
 *
 * Wyrocznia niezależna od kodu produkcyjnego: jawna tabela rodzajów kodów użytych w teście
 * (zapis ze standardu ENEA / IEEE C37.2), sprawdzona z surowym słownikiem backendu
 * (`slownikFunkcjiEaz.json`, parytet `backend/tests/ci/test_parytet_slownika_funkcji_eaz.py`).
 *
 * Iloczyn cech: liczba kodów zabezpieczeń {0, 1, 2, 4, 5, 6} × funkcje nie-zabezpieczeniowe
 * {brak, automatyka, blokada, technologiczne, wszystkie trzy} × położenie nie-zabezpieczenia
 * {na początku listy, na końcu} × kod spoza słownika {brak, obecny}.
 */
import { describe, expect, it } from 'vitest';

import slownik from '../slownikFunkcjiEaz.json';
import {
  czyFunkcjaNaSchemacie,
  funkcjaEaz,
  MAKS_KODOW_ZABEZPIECZEN_NA_SCHEMACIE,
  podzialFunkcjiNaSchemacie,
} from '../funkcjeEaz';
import { kodyBlokuPrzekaznika, kodyWOkreguBlokuPrzekaznika } from '../../sld/v3/compose/protectionMarking';

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

function oczekiwanyBlok(kody: readonly string[]): string[] {
  const naSchemacie = kody.filter((k) => (RODZAJ_WYROCZNI[k] ?? 'ZABEZPIECZENIE') === 'ZABEZPIECZENIE').slice(0, 4);
  const reszta = kody.length - naSchemacie.length;
  return reszta > 0 ? [...naSchemacie, `+${reszta}`] : naSchemacie;
}

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
    expect(czyFunkcjaNaSchemacie('XYZ')).toBe(true);
  });

  it('limit kodów na schemacie wynosi 4', () => {
    expect(MAKS_KODOW_ZABEZPIECZEN_NA_SCHEMACIE).toBe(4);
  });
});

describe('blok przekaźnika: ≤ 4 kody zabezpieczeń i „+N" (iloczyn cech)', () => {
  for (const n of [0, 1, 2, 4, 5, 6]) {
    for (const [nazwaInnych, inne] of Object.entries(INNE)) {
      for (const polozenie of ['na początku', 'na końcu'] as const) {
        for (const obcy of [false, true]) {
          const zab = [...ZABEZPIECZENIA.slice(0, n), ...(obcy ? ['XYZ'] : [])];
          const kody = polozenie === 'na początku' ? [...inne, ...zab] : [...zab, ...inne];
          if (kody.length === 0) continue;
          it(`${n} zabezpieczeń${obcy ? ' + kod spoza słownika' : ''} × ${nazwaInnych} ${polozenie}`, () => {
            const blok = kodyBlokuPrzekaznika(kody);
            expect(blok).toEqual(oczekiwanyBlok(kody));
            // Para predykatów z jednego źródła: każdy kod pola jest ALBO w bloku, ALBO liczony w „+N".
            const { naSchemacie, pozaSchematem } = podzialFunkcjiNaSchemacie(kody);
            expect([...naSchemacie, ...pozaSchematem].sort()).toEqual([...kody].sort());
            expect(naSchemacie.length).toBeLessThanOrEqual(4);
            expect(naSchemacie.every((k) => czyFunkcjaNaSchemacie(k))).toBe(true);
            // Okrąg niesie prefiks bloku (nie pełnej listy) — automatyka nigdy w okręgu.
            const okrag = kodyWOkreguBlokuPrzekaznika(kody);
            expect(okrag).toEqual(blok.slice(0, okrag.length));
            expect(okrag.some((k) => RODZAJ_WYROCZNI[k] === 'AUTOMATYKA')).toBe(false);
          });
        }
      }
    }
  }

  it('iniekcja: podział bez filtra rodzaju (stan przed kartą) — wyrocznia czerwona', () => {
    const kody = ['79', '51', '50', 'SCO'];
    const bezFiltra = kody.slice(0, 4);
    expect(bezFiltra).not.toEqual(oczekiwanyBlok(kody));
  });
});
