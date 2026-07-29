/*
 * Testy czystych adapterów P47a: dokładne dopasowanie magazynu (BESS) do rekordu
 * katalogu konwerterów oraz wskazanie przebiegu zwarciowego/rozpływu. Bez zgadywania:
 * brak dopasowania/przebiegu → null.
 */

import { describe, expect, it } from 'vitest';

import { derFixture } from '../../macierz/__tests__/fixtures';
import {
  dopasujMagazyn,
  wybierzPrzebiegRozplywu,
  wybierzPrzebiegZwarciowy,
} from '../pulpitModel';
import { konwerteryBessFixture, przebiegFixture } from './analizyFixtures';

describe('dopasujMagazyn — dokładne dopasowanie po referencji (kryterium 1)', () => {
  it('dopasowuje po device_catalog_ref = id rekordu (conv-bess-*)', () => {
    const der = derFixture({
      id: 'bess-1',
      der_kind: 'BESS',
      catalogs: { device_catalog_ref: 'conv-bess-nn-1mw-0p4kv' },
    });
    const dop = dopasujMagazyn(der, konwerteryBessFixture());
    expect(dop).not.toBeNull();
    expect(dop!.rekord.id).toBe('conv-bess-nn-1mw-0p4kv');
    expect(dop!.rekord.e_kwh).toBe(2000);
    expect(dop!.dopasowanoPo).toBe('device_catalog_ref');
  });

  it('battery_catalog_ref ma pierwszeństwo przed device_catalog_ref', () => {
    const der = derFixture({
      id: 'bess-1',
      der_kind: 'BESS',
      catalogs: {
        battery_catalog_ref: 'conv-bess-nn-2mw-0p4kv',
        device_catalog_ref: 'conv-bess-nn-1mw-0p4kv',
      },
    });
    const dop = dopasujMagazyn(der, konwerteryBessFixture());
    expect(dop!.rekord.id).toBe('conv-bess-nn-2mw-0p4kv');
    expect(dop!.dopasowanoPo).toBe('battery_catalog_ref');
  });

  it('brak rekordu o zgodnym id → null (pozycja nieodnaleziona, bez zgadywania)', () => {
    const der = derFixture({
      id: 'bess-1',
      der_kind: 'BESS',
      catalogs: { battery_catalog_ref: 'bess_bat_byd_2880' },
    });
    expect(dopasujMagazyn(der, konwerteryBessFixture())).toBeNull();
  });

  it('BESS bez żadnej referencji → null', () => {
    const der = derFixture({ id: 'bess-1', der_kind: 'BESS' });
    expect(dopasujMagazyn(der, konwerteryBessFixture())).toBeNull();
  });

  it('moduł nie-BESS → null (sekcja nie dotyczy)', () => {
    const der = derFixture({
      id: 'pv-1',
      der_kind: 'PV',
      catalogs: { device_catalog_ref: 'conv-bess-nn-1mw-0p4kv' },
    });
    expect(dopasujMagazyn(der, konwerteryBessFixture())).toBeNull();
  });
});

describe('wybierzPrzebiegZwarciowy — wskazanie przebiegu SC (kryterium 2)', () => {
  it('bierze ostatni zakończony przebieg zwarciowy', () => {
    const runs = [
      przebiegFixture({ id: 'r1', analysis_type: 'SC_3F', status: 'DONE' }),
      przebiegFixture({ id: 'r2', analysis_type: 'SC_1F', status: 'DONE' }),
    ];
    expect(wybierzPrzebiegZwarciowy(runs, null)).toBe('r2');
  });

  it('preferuje aktywny przebieg, gdy jest zakończonym zwarciem', () => {
    const runs = [
      przebiegFixture({ id: 'r1', analysis_type: 'SC_3F', status: 'DONE' }),
      przebiegFixture({ id: 'r2', analysis_type: 'SC_2F', status: 'DONE' }),
    ];
    expect(wybierzPrzebiegZwarciowy(runs, 'r1')).toBe('r1');
  });

  it('pomija przebiegi niezakończone i nie-zwarciowe', () => {
    const runs = [
      przebiegFixture({ id: 'r1', analysis_type: 'SC_3F', status: 'RUNNING' }),
      przebiegFixture({ id: 'r2', analysis_type: 'LOAD_FLOW', status: 'DONE' }),
    ];
    expect(wybierzPrzebiegZwarciowy(runs, null)).toBeNull();
  });

  it('brak zakończonego zwarcia → null', () => {
    expect(wybierzPrzebiegZwarciowy([], null)).toBeNull();
  });
});

describe('wybierzPrzebiegRozplywu — wskazanie przebiegu rozpływu (kryterium 3)', () => {
  it('bierze zakończony przebieg LOAD_FLOW', () => {
    const runs = [
      przebiegFixture({ id: 'r1', analysis_type: 'SC_3F', status: 'DONE' }),
      przebiegFixture({ id: 'r2', analysis_type: 'LOAD_FLOW', status: 'DONE' }),
    ];
    expect(wybierzPrzebiegRozplywu(runs, null)).toBe('r2');
  });

  it('pomija przebiegi zwarciowe', () => {
    const runs = [przebiegFixture({ id: 'r1', analysis_type: 'SC_3F', status: 'DONE' })];
    expect(wybierzPrzebiegRozplywu(runs, null)).toBeNull();
  });

  it('preferuje aktywny rozpływ, gdy zakończony', () => {
    const runs = [
      przebiegFixture({ id: 'r1', analysis_type: 'LOAD_FLOW', status: 'DONE' }),
      przebiegFixture({ id: 'r2', analysis_type: 'LOAD_FLOW', status: 'DONE' }),
    ];
    expect(wybierzPrzebiegRozplywu(runs, 'r1')).toBe('r1');
  });
});
