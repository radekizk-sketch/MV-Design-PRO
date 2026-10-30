/**
 * Schemat panelu ogólnego karty katalogu = serializacja serwera (jedno źródło).
 *
 * Wyrocznia `harness-fixtures/generated/pola_kart_katalogu.json` mierzy klucze pozycji, które
 * wysyłają funkcje obsługi `GET /api/catalog/...` (`backend/scripts/eksport_fixtur_harnessu.py`).
 * Nowe pole w serializacji backendu bez lustra we froncie (albo pole frontu, którego serwer nie
 * wysyła) zapala czerwień tutaj — fikstura nieaktualna zapala ją w `tests/ci/
 * test_fixtury_harnessu.py`.
 */
import { describe, expect, it } from 'vitest';

import wyrocznia from '../../../harness-fixtures/generated/pola_kart_katalogu.json';
import { ETYKIETY_KATEGORII_TYPOW } from '../etykietyKategoriiTypow';
import { ETYKIETY_POL_KARTY, KOLEJNOSC_POL_KARTY } from '../etykietyPolKarty';
import {
  KATEGORIE_Z_BUDOWNICZYM_WIERSZY,
  KLUCZE_PARAMETROW_PUNKTU_ROZGALEZIENIA,
  KLUCZE_TYPOW_POZYCJI,
  POLA_KARTY_KATEGORII,
  POLA_POZA_PANELEM_OGOLNYM,
  maBudowniczegoWierszy,
  type KategoriaPaneluOgolnego,
} from '../polaKartyKatalogu';
import type { TypeCategory } from '../types';
import { NAZWA_JAKOSCI_DANEJ_PL } from '../../../ui2/wyniki/wzorzec/werdykt';

const WSZYSTKIE = Object.keys(ETYKIETY_KATEGORII_TYPOW) as TypeCategory[];

describe('POLA_KARTY_KATEGORII', () => {
  it('obejmuje dokładnie kategorie bez dedykowanego budowniczego wierszy', () => {
    const oczekiwane = WSZYSTKIE.filter((k) => !maBudowniczegoWierszy(k)).sort();
    expect(Object.keys(POLA_KARTY_KATEGORII).sort()).toEqual(oczekiwane);
    for (const k of KATEGORIE_Z_BUDOWNICZYM_WIERSZY) expect(maBudowniczegoWierszy(k)).toBe(true);
  });

  it.each(Object.keys(wyrocznia.kategorie))('kategoria %s = klucze serwera', (kategoria) => {
    const serwer = (wyrocznia.kategorie as Record<string, string[]>)[kategoria];
    expect([...POLA_KARTY_KATEGORII[kategoria as KategoriaPaneluOgolnego]].sort()).toEqual(serwer);
  });

  it('wyrocznia mierzy każdą kategorię z serwera; urządzenia zabezpieczeniowe mapuje front', () => {
    const zSerwera = Object.keys(POLA_KARTY_KATEGORII).filter((k) => k !== 'PROTECTION_DEVICE');
    expect(Object.keys(wyrocznia.kategorie).sort()).toEqual(zSerwera.sort());
    expect(POLA_KARTY_KATEGORII.PROTECTION_DEVICE).toContain('functions_supported');
    expect(POLA_KARTY_KATEGORII.PROTECTION_DEVICE).not.toContain('name_pl');
  });
});

/**
 * Typy TS pozycji katalogu = serializacja serwera. Każdy klucz typu (`KluczeTypu<T>` w
 * `polaKartyKatalogu.ts` — tsc wymusza równość z interfejsem) musi być kluczem rekordu
 * serwera i odwrotnie: pole fantomowe (deklarowane, nigdy niewysyłane) i pole niewidoczne
 * dla typów (wysyłane, nieopisane) zapalają czerwień.
 */
describe('typy pozycji katalogu (ui/catalog/types.ts) = rekordy serwera', () => {
  it.each(Object.keys(wyrocznia.typy_pozycji))('typ %s = klucze serwera', (typ) => {
    const serwer = (wyrocznia.typy_pozycji as Record<string, string[]>)[typ];
    expect([...(KLUCZE_TYPOW_POZYCJI[typ] ?? [])].sort()).toEqual(serwer);
  });

  it('rejestr typów obejmuje dokładnie typy zmierzone przez wyrocznię', () => {
    expect(Object.keys(KLUCZE_TYPOW_POZYCJI).sort()).toEqual(
      Object.keys(wyrocznia.typy_pozycji).sort(),
    );
  });

  it.each(Object.keys(wyrocznia.parametry_punktu_rozgalezienia))(
    'punkt rozgałęzienia: %s = klucze serwera',
    (czesc) => {
      const serwer = (wyrocznia.parametry_punktu_rozgalezienia as Record<string, string[]>)[czesc];
      expect([...(KLUCZE_PARAMETROW_PUNKTU_ROZGALEZIENIA[czesc] ?? [])].sort()).toEqual(serwer);
    },
  );

  it('rejestr punktu rozgałęzienia obejmuje dokładnie części zmierzone przez wyrocznię', () => {
    expect(Object.keys(KLUCZE_PARAMETROW_PUNKTU_ROZGALEZIENIA).sort()).toEqual(
      Object.keys(wyrocznia.parametry_punktu_rozgalezienia).sort(),
    );
  });
});

/** Klucze, które panel ogólny pokazuje jako etykietę: pola schematu poza nagłówkiem karty
 *  i klucze wewnątrz wartości złożonych (`card_field_status`, `params`). */
const KLUCZE_Z_ETYKIETA = new Set([
  ...Object.values(POLA_KARTY_KATEGORII)
    .flat()
    .filter((k) => !POLA_POZA_PANELEM_OGOLNYM.has(k)),
  ...wyrocznia.klucze_wartosci_zlozonych,
]);

describe('ETYKIETY_POL_KARTY — nazwa polska każdego pola karty', () => {
  it.each([...KLUCZE_Z_ETYKIETA].sort())('pole %s ma polską etykietę', (klucz) => {
    expect(ETYKIETY_POL_KARTY[klucz]).toMatch(/\S/);
  });

  it('słownik nie ma wpisów martwych (każdy klucz pokazuje panel)', () => {
    expect(Object.keys(ETYKIETY_POL_KARTY).filter((k) => !KLUCZE_Z_ETYKIETA.has(k))).toEqual([]);
  });

  it('kolejność pól zawiera wyłącznie pola schematu panelu', () => {
    expect(KOLEJNOSC_POL_KARTY.filter((k) => !KLUCZE_Z_ETYKIETA.has(k))).toEqual([]);
  });

  it('nazwy jakości danej = FieldQuality.label_pl backendu', () => {
    expect(NAZWA_JAKOSCI_DANEJ_PL).toEqual(wyrocznia.nazwy_jakosci_danej);
  });
});
