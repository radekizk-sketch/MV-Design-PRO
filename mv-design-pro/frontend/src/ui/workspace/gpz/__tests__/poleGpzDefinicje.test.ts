// @vitest-environment node
/**
 * Rejestr pól rozdzielnicy sekcji GPZ ↔ jedno źródło backendu (karta GPZ-DANE-ANALIZ).
 *
 * Oba testy (ten i `backend/tests/enm/test_rozdzielnica_gpz.py`) chodzą po jednej tablicy
 * `backend/schemas/rozdzielnica_gpz_parytet_v1.json`: backend przypina, że plik jest eksportem
 * opisu pól, a klucze opisu są polami modelu `RozdzielnicaSekcjiGpz` (z granicami pydantic);
 * ten test — że rejestr frontendu jest lustrem pliku. Pole rejestru bez odpowiednika w modelu
 * (fantom) albo pole modelu bez definicji w rejestrze wywraca test.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  OPERACJA_ZAPISU_ROZDZIELNICY,
  POLA_ROZDZIELNICY_GPZ,
  SCIEZKA_ZAPISU_ROZDZIELNICY,
} from '../poleGpzDefinicje';

interface PoleTablicy {
  readonly klucz: string;
  readonly rodzaj: 'liczba' | 'slownik' | 'tekst';
  readonly nazwa_pl: string;
  readonly symbol?: string;
  readonly jednostka?: string;
  readonly od?: number;
  readonly do?: number;
  readonly podstawa_zakresu_pl?: string;
  readonly dozwolone?: readonly string[] | null;
  readonly wzor?: string | null;
  readonly konsumenci: readonly string[];
}

interface Tablica {
  readonly operacja: string;
  readonly sciezka: string;
  readonly kod_bledu: string;
  readonly pola: readonly PoleTablicy[];
}

const SCIEZKA = path.resolve(
  __dirname,
  '../../../../../../backend/schemas/rozdzielnica_gpz_parytet_v1.json',
);
const TABLICA = JSON.parse(readFileSync(SCIEZKA, 'utf-8')) as Tablica;

describe('rejestr pól rozdzielnicy GPZ — lustro jednego opisu backendu', () => {
  it('klucze i kolejność rejestru = klucze i kolejność opisu (zero fantomów, zero braków)', () => {
    expect(POLA_ROZDZIELNICY_GPZ.map((p) => p.klucz)).toEqual(TABLICA.pola.map((p) => p.klucz));
  });

  it('operacja i ścieżka zapisu są pisarzem backendu', () => {
    expect(OPERACJA_ZAPISU_ROZDZIELNICY).toBe(TABLICA.operacja);
    expect(SCIEZKA_ZAPISU_ROZDZIELNICY).toBe(TABLICA.sciezka);
  });

  it.each(TABLICA.pola.map((p) => [p.klucz, p] as const))(
    'pole %s: rodzaj, nazwa, jednostka, zakres z podstawą, słownik i konsumenci z backendu',
    (klucz, zrodlo) => {
      const definicja = POLA_ROZDZIELNICY_GPZ.find((p) => p.klucz === klucz);
      expect(definicja).toBeDefined();
      if (!definicja) return;
      expect(definicja.rodzaj).toBe(zrodlo.rodzaj);
      expect(definicja.etykietaPl).toBe(zrodlo.nazwa_pl);
      expect([...definicja.konsumenci]).toEqual(zrodlo.konsumenci);
      expect(definicja.zrodloWartosciPl.trim().length).toBeGreaterThan(0);
      if (definicja.rodzaj === 'liczba') {
        expect(definicja.symbol).toBe(zrodlo.symbol);
        expect(definicja.jednostka).toBe(zrodlo.jednostka);
        expect(definicja.zakres).toEqual({
          od: zrodlo.od,
          do: zrodlo.do,
          podstawaPl: zrodlo.podstawa_zakresu_pl,
        });
        expect(definicja.zakres.od).toBeLessThan(definicja.zakres.do);
      } else {
        expect(definicja.dozwolone).toEqual(zrodlo.dozwolone ?? null);
        expect(definicja.wzor).toBe(zrodlo.wzor ?? null);
      }
    },
  );
});
