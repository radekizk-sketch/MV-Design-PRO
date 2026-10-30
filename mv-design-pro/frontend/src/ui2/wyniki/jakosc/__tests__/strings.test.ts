// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as STRINGS from '../strings';
import { RODZAJ_KONTROLI_PL, fmtKA, fmtKV, fmtProcent, fmtWartosc, rodzajKontroliPL } from '../strings';
import type { RodzajKontroli } from '../api';

describe('słowniki PL', () => {
  it('pokrywa pełny zbiór rodzajów kontroli energetycznej', () => {
    const kody: RodzajKontroli[] = [
      'BRANCH_LOADING',
      'TRANSFORMER_LOADING',
      'VOLTAGE_DEVIATION',
      'LOSS_BUDGET',
      'REACTIVE_BALANCE',
    ];
    for (const kod of kody) {
      expect(RODZAJ_KONTROLI_PL[kod]).toBeTruthy();
      expect(rodzajKontroliPL(kod)).toBe(RODZAJ_KONTROLI_PL[kod]);
    }
    expect(Object.keys(RODZAJ_KONTROLI_PL)).toHaveLength(5);
  });

  // Karta WERDYKT-MIGRACJA-190: statusy walidacji, warunków i pasm wiarygodności NIE mają
  // już słowników w interfejsie — etykietę i kolor niesie rekord werdyktu z backendu.
  // Strażnik werdyktu wyjaśnialnego (kat. 3a/6c) pilnuje kodu; ten test pilnuje eksportu.
  it('nie eksportuje map „status → tekst/kolor" (etykieta wyłącznie z rekordu)', () => {
    for (const nazwa of [
      'STATUS_WALIDACJI_PL',
      'statusWalidacjiPL',
      'istotnoscWalidacji',
      'STATUS_WIARYGODNOSCI',
      'istotnoscWiarygodnosci',
    ]) {
      expect(nazwa in STRINGS, nazwa).toBe(false);
    }
    for (const klucz of ['ocenaSpelnione', 'ocenaNaruszone', 'ocenaNiesprawdzone']) {
      expect(klucz in STRINGS.JAKOSC_STRINGS, klucz).toBe(false);
    }
  });
});

describe('formatery PL (deterministyczne, przecinek dziesiętny)', () => {
  it('formatuje kA/kV/%/wartość z przecinkiem', () => {
    expect(fmtKA(12.5)).toBe('12,500');
    expect(fmtKV(15)).toBe('15,000');
    expect(fmtProcent(80)).toBe('80,0');
    expect(fmtWartosc(65)).toBe('65,00');
  });

  it('są czyste (te same wejścia → te same wyjścia)', () => {
    expect(fmtKA(0.1)).toBe(fmtKA(0.1));
    expect(fmtWartosc(3.2)).toBe('3,20');
  });
});
