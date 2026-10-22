/*
 * Testy czystych adapterów P47a: dokładne dopasowanie magazynu (BESS) do rekordu
 * katalogu konwerterów (wskazanie przebiegu zwarciowego/rozpływu przeszło do magazynu
 * kontekstu wyniku, karta K8 — testy w `ui2/wyniki/kontekst`). Bez zgadywania:
 * brak dopasowania/przebiegu → null.
 */

import { describe, expect, it } from 'vitest';

import { derFixture } from '../../macierz/__tests__/fixtures';
import { dopasujMagazyn } from '../pulpitModel';
import { konwerteryBessFixture } from './analizyFixtures';

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
