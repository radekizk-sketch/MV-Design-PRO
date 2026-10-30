// @vitest-environment node
/*
 * Uczciwość natychmiastowa (2026-09-23) — etykieta kontroli pasma wiarygodności.
 * Backend (`analysis/sanity_bounds/oceny.py::CREDIBLE`, wspólna stała pasm zwarciowych
 * i napięciowych) zwraca „w paśmie wiarygodności" zamiast „zweryfikowany": kontrola
 * sprawdza WYŁĄCZNIE, czy liczba leży w paśmie fizycznie możliwym — nie jest weryfikacją
 * wyrocznią ani pomiarem.
 *
 * Karta WERDYKT-MIGRACJA-190: interfejs nie liczy już koloru ani tekstu od kodu statusu —
 * etykieta i semantyka koloru przychodzą w rekordzie werdyktu (`ocena.etykieta`). Test
 * pilnuje intencji na fiksturze WYGENEROWANEJ backendem: dawna etykieta nie wraca, a stan
 * „w paśmie" na danych roboczych ma dowód niepełny (nie udaje pełnej weryfikacji).
 */

import { describe, expect, it } from 'vitest';

import * as STRINGS from '../strings';
import { R } from './fixtures';

const SCENY_PASM = [
  R.pasmo_zwarcia_spelnia,
  R.pasmo_zwarcia_poza,
  R.pasmo_zwarcia_brak_danych,
  R.pasmo_zwarcia_robocza,
  R.pasmo_napiecia_spelnia,
  R.pasmo_napiecia_poza,
  R.pasmo_strat_spelnia,
  R.pasmo_strat_brak_danych,
];

describe('status pasma wiarygodności z backendu', () => {
  it('dawna etykieta „zweryfikowany" nie wraca ani w kodzie, ani w rekordzie', () => {
    for (const scena of SCENY_PASM) {
      expect(scena.status).not.toBe('zweryfikowany');
      expect(scena.ocena.etykieta.etykieta_pl.toLowerCase()).not.toContain('zweryfikowan');
      expect(scena.ocena.wyjasnienie.zdanie_pl.toLowerCase()).not.toContain('zweryfikowany');
    }
  });

  it('interfejs nie ma własnej mapy „status → kolor/tekst" pasma wiarygodności', () => {
    expect('istotnoscWiarygodnosci' in STRINGS).toBe(false);
    expect('STATUS_WIARYGODNOSCI' in STRINGS).toBe(false);
  });

  it('w paśmie na wartości roboczej: rekord spełniony, ale dowód NIEPELNY z daną ESTIMATED', () => {
    const ocena = R.pasmo_zwarcia_robocza.ocena;
    expect(ocena.status_maszynowy).toBe('SPELNIA');
    expect(ocena.kompletnosc_dowodu).toBe('NIEPELNY');
    expect(
      ocena.dowod.status_danych.dane_przyjete.some((d) => d.jakosc === 'ESTIMATED'),
    ).toBe(true);
  });
});
