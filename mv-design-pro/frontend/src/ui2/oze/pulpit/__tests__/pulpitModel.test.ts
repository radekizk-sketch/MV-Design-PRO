/**
 * Model pulpitu OZE na kontrakcie V2 (karta AB-1a Pakiet D2 §6): pozycja modułu = dane
 * warsztatu wytwórców + wynik modułu, rekordy wymagań, odrzucenie tabliczki i pominięcie
 * WYŁĄCZNIE z oceny zatwierdzonego modelu (bez statusu i liczników; o objęciu modułu oceną
 * rozstrzyga most modelu — klient nie powtarza reguły brak mocy / napięcia, luka §5.3);
 * sekcje danych modułu i pracy magazynu wyłącznie z realnego kształtu `StationDerConnection`.
 */

import { describe, expect, it } from 'vitest';

import { opisyModulow } from '../../macierz';
import { derFixture, deryScenyMacierz, zgodnoscFixture } from '../../macierz/__tests__/fixtures';
import type { ZgodnoscPrzypadkuNcRfg } from '../../ncrfg/typy';
import { daneModulu, pracaMagazynu, zbudujPozycje } from '../pulpitModel';

describe('zbudujPozycje — dane modelu + ocena zatwierdzonego modelu', () => {
  const opisy = [
    ...opisyModulow(deryScenyMacierz()),
    ...opisyModulow([derFixture({ id: 'zz-fw', der_kind: 'FW', connection_voltage_kv: null })]),
  ];
  const KLUCZE = ['derRef', 'nazwa', 'ocena', 'odrzucony', 'pominietyPowodPl', 'rodzaj', 'wynik'];

  it('bez oceny: bez wyniku, rekordów, odrzucenia i pominięcia — żadnego powodu liczonego po stronie klienta', () => {
    const pozycje = zbudujPozycje(opisy, null);
    expect(pozycje.map((p) => [p.wynik, p.ocena, p.odrzucony, p.pominietyPowodPl])).toEqual([
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
    ]);
    for (const pozycja of pozycje) expect(Object.keys(pozycja).sort()).toEqual(KLUCZE);
  });

  it('z oceną: wynik modułu i rekordy W z oceny (te same obiekty); moduł spoza oceny bez wyniku', () => {
    const ocena = zgodnoscFixture();
    const pozycje = zbudujPozycje(opisy, ocena);
    expect(pozycje[0].wynik).toBe(ocena.bieg!.modules[0]);
    expect(pozycje[1].ocena).toBe(ocena.bieg!.ocena_wymagan[1]);
    expect(pozycje[2].wynik).toBeNull();
    expect(pozycje[2].ocena).toBeNull();
    for (const pozycja of pozycje) expect(Object.keys(pozycja).sort()).toEqual(KLUCZE);
  });

  it('odrzucenie tabliczki i pominięcie przypisane po referencji modułu (rekordy serwera)', () => {
    const [bess, pv] = deryScenyMacierz();
    const ocena: ZgodnoscPrzypadkuNcRfg = {
      ...zgodnoscFixture(),
      certyfikaty_odrzucone: [{ der_ref: bess.id, rekord_ref: 'rekord-x', powod_pl: 'odrzucona' }],
      pominiete: [{ der_ref: 'zz-fw', der_name: null, powod: 'brak_napiecia', powod_pl: 'pominięty' }],
    };
    const pozycje = zbudujPozycje(opisy, ocena);
    expect(pozycje[0].derRef).toBe(bess.id);
    expect(pozycje[0].odrzucony).toBe(ocena.certyfikaty_odrzucone[0]);
    expect(pozycje[1].derRef).toBe(pv.id);
    expect(pozycje[1].odrzucony).toBeNull();
    expect(pozycje[2].pominietyPowodPl).toBe('pominięty');
    expect(pozycje[0].pominietyPowodPl).toBeNull();
  });

  it('serwer jest autorytetem: moduł z brakiem danych w warsztacie, a z wynikiem w ocenie, pokazuje wynik', () => {
    const ocena = zgodnoscFixture();
    const [bess] = deryScenyMacierz();
    const opisyBezNapiecia = opisyModulow([{ ...bess, connection_voltage_kv: null }]);
    const [pozycja] = zbudujPozycje(opisyBezNapiecia, ocena);
    expect(opisyBezNapiecia[0].napiecieKv).toBeNull();
    expect(pozycja.wynik).toBe(ocena.bieg!.modules[0]);
  });
});

describe('daneModulu — sekcja 1', () => {
  it('odnośniki katalogowe obecne na module z etykietami PL (identyfikator certyfikatu jako dana)', () => {
    const der = derFixture({
      id: 'pv-1',
      nominal_power_kw: 500,
      catalogs: { device_catalog_ref: 'inv-1', ptpiree_certificate_ref: 'cert-1' },
    });
    const dane = daneModulu(opisyModulow([der])[0], der);
    expect(dane.mocKw).toBe(500);
    expect(dane.odnosniki).toEqual([
      { etykieta: 'Urządzenie wytwórcze', wartosc: 'inv-1' },
      { etykieta: 'Certyfikat PTPiREE', wartosc: 'cert-1' },
    ]);
  });
});

describe('pracaMagazynu — sekcja 3 (tylko BESS z danymi)', () => {
  it.each([
    ['BESS z katalogiem baterii', { der_kind: 'BESS', catalogs: { battery_catalog_ref: 'bat-1' } }, { bateriaRef: 'bat-1', trybyPracy: [] }],
    ['BESS z trybami pracy', { der_kind: 'BESS', profiles: { bess_operation_mode_refs: ['a', 'b'] } }, { bateriaRef: null, trybyPracy: ['a', 'b'] }],
    ['BESS bez danych', { der_kind: 'BESS' }, null],
    ['PV z referencją baterii', { catalogs: { battery_catalog_ref: 'bat-1' } }, null],
  ] as const)('%s', (_opis, nadpisanie, oczekiwane) => {
    expect(pracaMagazynu(derFixture({ id: 'x', ...(nadpisanie as object) }))).toEqual(oczekiwane);
  });
});
