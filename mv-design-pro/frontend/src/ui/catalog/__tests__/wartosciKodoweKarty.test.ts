/**
 * Wartości kodowe kart katalogu — iloczyn: KAŻDE pole kodowe wyroczni × KAŻDA jego wartość
 * wysyłana przez serwer ma nazwę polską albo jest oznaczeniem normowym z uzasadnieniem.
 *
 * Wyrocznia `pola_kart_katalogu.json → wartosci_kodowe` mierzy wartości, które funkcje obsługi
 * `GET /api/catalog/...` wysyłają dziś (`eksport_fixtur_harnessu.py::wartosci_kodowe_kart`).
 * Nowy kod serwera bez nazwy, nowe pole kodowe bez opisu albo opis pola, którego serwer nie
 * wysyła, zapalają czerwień tutaj; fikstura nieaktualna — w `tests/ci/test_fixtury_harnessu.py`.
 */
import { describe, expect, it } from 'vitest';

import wyrocznia from '../../../harness-fixtures/generated/pola_kart_katalogu.json';
import { WZORZEC_STRINGS } from '../../../ui2/wyniki/wzorzec/strings';
import {
  NAZWA_RODZAJU_APARATU_PL,
  POLA_KODOWE_KARTY,
  RODZAJE_APARATU_SN,
  UKLAD_POLACZEN_BATERII_PL,
  jestPolemKodowym,
  nazwaWartosciKodowej,
} from '../wartosciKodoweKarty';

const WARTOSCI = wyrocznia.wartosci_kodowe as Record<string, string[]>;
const ILOCZYN = Object.entries(WARTOSCI).flatMap(([pole, wartosci]) =>
  wartosci.map((wartosc) => [pole, wartosc] as const),
);

describe('POLA_KODOWE_KARTY — rejestr pól kodowych = wyrocznia serwera', () => {
  it('wyrocznia mierzy niepusty zbiór (zapadka na pusty iloczyn)', () => {
    expect(ILOCZYN.length).toBeGreaterThan(50);
  });

  it('każde pole kodowe serwera ma opis, a rejestr nie opisuje pól, których serwer nie wysyła', () => {
    expect(Object.keys(POLA_KODOWE_KARTY).sort()).toEqual(Object.keys(WARTOSCI).sort());
  });

  it.each(ILOCZYN)('%s = %s: nazwa polska albo oznaczenie normowe, nigdy kod ani zdanie braku', (pole, wartosc) => {
    const opis = POLA_KODOWE_KARTY[pole];
    const nazwa = nazwaWartosciKodowej(pole, wartosc);
    expect(nazwa).not.toBe(WZORZEC_STRINGS.wartoscSpozaSlownika);
    if (opis.rodzaj === 'oznaczenie') {
      expect(opis.uzasadnienie).toMatch(/\S/);
      expect(nazwa).toBe(wartosc);
    } else {
      expect(Object.prototype.hasOwnProperty.call(opis.nazwy, wartosc)).toBe(true);
      expect(nazwa).not.toBe(wartosc);
      expect(nazwa).toMatch(/\S/);
    }
  });
});

describe('nazwaWartosciKodowej — wartość spoza słownika', () => {
  const POLA_ZE_SLOWNIKIEM = Object.entries(POLA_KODOWE_KARTY)
    .filter(([, opis]) => opis.rodzaj === 'nazwy')
    .map(([pole]) => pole);

  it.each(POLA_ZE_SLOWNIKIEM)('%s: nieznany kod → jawne zdanie, nie kod', (pole) => {
    expect(nazwaWartosciKodowej(pole, 'NOWY_KOD_SERWERA')).toBe(WZORZEC_STRINGS.wartoscSpozaSlownika);
  });

  it('klucz z prototypu obiektu nie jest nazwą (`toString`, `constructor`)', () => {
    expect(nazwaWartosciKodowej('kind', 'toString')).toBe(WZORZEC_STRINGS.wartoscSpozaSlownika);
    expect(nazwaWartosciKodowej('medium', 'constructor')).toBe(WZORZEC_STRINGS.wartoscSpozaSlownika);
    expect(jestPolemKodowym('toString')).toBe(false);
  });

  it('pole spoza rejestru nie jest kodem — wartość bez zmian', () => {
    expect(jestPolemKodowym('name')).toBe(false);
    expect(nazwaWartosciKodowej('name', 'Kabel YAKXS 3x120')).toBe('Kabel YAKXS 3x120');
  });
});

describe('słowniki ze źródłem w backendzie = backend', () => {
  it('rodzaje aparatu SN = NAZWY_RODZAJOW_APARATU_PL (rodzaje_aparatury.py)', () => {
    for (const [kod, nazwa] of Object.entries(wyrocznia.nazwy_z_backendu.device_kind)) {
      expect(NAZWA_RODZAJU_APARATU_PL[kod]).toBe(nazwa);
    }
  });

  it('rodzaje aparatu SN kreatora pola = dziedzina projekcji łączników backendu (bez aparatów nN)', () => {
    expect([...RODZAJE_APARATU_SN].sort()).toEqual(Object.keys(wyrocznia.nazwy_z_backendu.device_kind).sort());
  });

  it('układ połączeń baterii = NAZWY_UKLADOW_POLACZEN_BATERII_PL (bateria_kondensatorow.py)', () => {
    expect(UKLAD_POLACZEN_BATERII_PL).toEqual(wyrocznia.nazwy_z_backendu.uklad_polaczen);
  });

  it('izolacja kabla w modelu (`Cable.insulation`, dziedzina szersza niż katalog) ma nazwy', () => {
    for (const kod of wyrocznia.nazwy_z_backendu.insulation) {
      expect(nazwaWartosciKodowej('insulation_type', kod)).not.toBe(WZORZEC_STRINGS.wartoscSpozaSlownika);
    }
  });

  it('status katalogu: pełna dziedzina backendu `CatalogStatus` ma nazwy', () => {
    for (const kod of wyrocznia.nazwy_z_backendu.catalog_status) {
      expect(nazwaWartosciKodowej('catalog_status', kod)).not.toBe(WZORZEC_STRINGS.wartoscSpozaSlownika);
    }
  });
});
