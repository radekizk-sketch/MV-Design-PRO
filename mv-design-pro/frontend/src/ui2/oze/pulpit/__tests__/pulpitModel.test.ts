/*
 * Testy czystych adapterów pulpitu instalacji OZE (pulpitModel, karta P47).
 * Weryfikują: listę modułów (przed/po biegu, moduł zablokowany), zgodność
 * (testy niespełnione), dane modułu (odnośniki katalogowe) oraz sekcję pracy
 * magazynu (tylko BESS, tylko gdy dane realnie istnieją).
 */

import { describe, expect, it } from 'vitest';

import { zbudujModuly } from '../../macierz';
import { derFixture, wynikFixture } from '../../macierz/__tests__/fixtures';
import { daneModulu, pracaMagazynu, zbudujPozycje, zgodnoscModulu } from '../pulpitModel';

describe('zbudujPozycje — lista modułów (kryterium 1)', () => {
  it('przed biegiem status to „nieprzeprowadzone"', () => {
    const opisy = zbudujModuly([derFixture({ id: 'pv-1', nominal_power_kw: 500 })]);
    const pozycje = zbudujPozycje(opisy, null);
    expect(pozycje[0].status).toBe('nieprzeprowadzone');
    expect(pozycje[0].przeprowadzono).toBe(false);
    expect(pozycje[0].klasa).toBeNull();
  });

  it('po biegu klasa i status pochodzą z odpowiedzi backendu', () => {
    const opisy = zbudujModuly([
      derFixture({ id: 'pv-1', nominal_power_kw: 500 }),
      derFixture({ id: 'bess-1', der_kind: 'BESS', nominal_power_kw: 800 }),
    ]);
    const pozycje = zbudujPozycje(opisy, wynikFixture());
    const pv = pozycje.find((p) => p.derRef === 'pv-1')!;
    const bess = pozycje.find((p) => p.derRef === 'bess-1')!;
    expect(pv.klasa).toBe('PV');
    expect(pv.status).toBe('zgodny');
    expect(pv.passCount).toBe(2);
    expect(pv.requiredCount).toBe(2);
    expect(bess.status).toBe('niezgodny');
  });

  it('moduł bez napięcia jest zablokowany i ma status „brak danych"', () => {
    const opisy = zbudujModuly([
      derFixture({ id: 'fw-1', der_kind: 'FW', connection_voltage_kv: null, connection_side: 'dedicated_transformer' }),
    ]);
    const pozycje = zbudujPozycje(opisy, wynikFixture());
    expect(pozycje[0].zablokowany).toBe(true);
    expect(pozycje[0].status).toBe('brak_danych');
    expect(pozycje[0].przeprowadzono).toBe(false);
  });
});

describe('zgodnoscModulu — sekcja 2 (kryterium 2)', () => {
  it('przed biegiem oznacza brak przeprowadzenia', () => {
    const opisy = zbudujModuly([derFixture({ id: 'pv-1', nominal_power_kw: 500 })]);
    const z = zgodnoscModulu(opisy[0], null);
    expect(z.przeprowadzono).toBe(false);
    expect(z.niespelnione).toHaveLength(0);
  });

  it('po biegu wybiera wyłącznie testy niespełnione z akcjami naprawczymi', () => {
    const opisy = zbudujModuly([derFixture({ id: 'bess-1', der_kind: 'BESS', nominal_power_kw: 800 })]);
    const z = zgodnoscModulu(opisy[0], wynikFixture());
    expect(z.przeprowadzono).toBe(true);
    expect(z.niespelnione).toHaveLength(1);
    expect(z.niespelnione[0].test_id).toBe('FRT_LVRT');
    expect(z.niespelnione[0].fix_actions.length).toBeGreaterThan(0);
  });
});

describe('daneModulu — sekcja 1', () => {
  it('zbiera obecne odnośniki katalogowe z etykietami PL', () => {
    const der = derFixture({
      id: 'pv-1',
      nominal_power_kw: 500,
      catalogs: { device_catalog_ref: 'inv-1', ptpiree_certificate_ref: 'cert-1' },
    });
    const opis = zbudujModuly([der])[0];
    const dane = daneModulu(opis, der);
    expect(dane.mocKw).toBe(500);
    expect(dane.odnosniki.map((o) => o.etykieta)).toEqual([
      'Urządzenie wytwórcze',
      'Certyfikat PTPiREE',
    ]);
    expect(dane.odnosniki[0].wartosc).toBe('inv-1');
  });
});

describe('pracaMagazynu — sekcja 3 (tylko BESS z danymi)', () => {
  it('BESS z katalogiem baterii zwraca dane magazynu', () => {
    const der = derFixture({
      id: 'bess-1',
      der_kind: 'BESS',
      catalogs: { battery_catalog_ref: 'bat-1' },
    });
    expect(pracaMagazynu(der)?.bateriaRef).toBe('bat-1');
  });

  it('BESS z trybami pracy zwraca dane magazynu', () => {
    const der = derFixture({
      id: 'bess-1',
      der_kind: 'BESS',
      profiles: { bess_operation_mode_refs: ['tryb-a', 'tryb-b'] },
    });
    expect(pracaMagazynu(der)?.trybyPracy).toHaveLength(2);
  });

  it('BESS bez danych magazynu zwraca null (sekcja pominięta)', () => {
    const der = derFixture({ id: 'bess-1', der_kind: 'BESS' });
    expect(pracaMagazynu(der)).toBeNull();
  });

  it('moduł inny niż BESS zwraca null', () => {
    const der = derFixture({ id: 'pv-1', catalogs: { battery_catalog_ref: 'bat-1' } });
    expect(pracaMagazynu(der)).toBeNull();
  });
});
