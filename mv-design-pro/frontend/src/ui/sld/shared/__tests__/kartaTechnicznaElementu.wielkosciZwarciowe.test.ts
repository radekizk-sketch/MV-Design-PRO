// @vitest-environment node
/**
 * Karta techniczna aparatu — wielkości zwarciowe: „nie dotyczy” (rodzaj) odróżnione od
 * „brak danych” (wielkość właściwa rodzajowi, karta/model jej nie podaje).
 *
 * Iloczyn cech:
 *  - rodzaj aparatu: wyłącznik, rozłącznik, odłącznik, uziemnik, bezpiecznik;
 *  - źródło rodzaju: pozycja katalogu APARAT_SN (`device_kind`) albo — bez pozycji — rodzaj
 *    urządzenia pola w modelu;
 *  - dane: liczba w katalogu albo `null`.
 *
 * Oczekiwanie wpisane tu NIEZALEŻNIE od modułu (norma: zdolności wyłączania zwarć nie mają
 * rozłącznik, odłącznik i uziemnik; prądu krótkotrwałego — bezpiecznik, IEC 62271-105).
 * Dawniej „nie dotyczy” znał tylko odłącznik i uziemnik (z dopiskiem „odłącznik” także dla
 * uziemnika), rozłącznik bez liczby pokazywał „brak danych”, a brak I_th znikał z karty.
 */
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../types/enm';
import type { DaneElementuKanwy } from '../daneElementuKanwy';
import { buildKartaTechniczna, type KatalogiKarty, type WierszKarty } from '../kartaTechnicznaElementu';

type RodzajUrzadzenia = 'CB' | 'LOAD_SWITCH' | 'DS' | 'ES' | 'FUSE';

const RODZAJ_APARATU_SN: Record<RodzajUrzadzenia, string> = {
  CB: 'WYLACZNIK',
  LOAD_SWITCH: 'ROZLACZNIK',
  DS: 'ODLACZNIK',
  ES: 'UZIEMNIK',
  FUSE: 'ROZLACZNIK_BEZPIECZNIKOWY',
};

/** Oczekiwany zapis (Ik wyłączalny, Iₜₕ) przy braku liczb — `null` = „brak danych”. */
const BEZ_LICZB: Record<RodzajUrzadzenia, [string | null, string | null]> = {
  CB: [null, null],
  LOAD_SWITCH: ['nie dotyczy (rozłącznik)', null],
  DS: ['nie dotyczy (odłącznik)', null],
  ES: ['nie dotyczy (uziemnik)', null],
  FUSE: [null, 'nie dotyczy (bezpiecznik)'],
};

function model(rodzaj: RodzajUrzadzenia, zKatalogiem: boolean): EnergyNetworkModel {
  const szyna = (ref_id: string) => ({ id: ref_id, ref_id, name: ref_id, voltage_kv: 15, tags: [], meta: {} });
  return {
    header: { name: 'wielkości zwarciowe aparatu' },
    buses: [szyna('bus-sn'), szyna('bus-z')],
    substations: [
      {
        id: 'st-1',
        ref_id: 'st-1',
        name: 'Stacja',
        station_type: 'mv_lv',
        bus_refs: ['bus-sn'],
        transformer_refs: [],
        tags: [],
        meta: {},
      },
    ],
    bays: [
      {
        id: 'pole-1',
        ref_id: 'pole-1',
        name: 'Pole 01',
        bay_role: 'OUT',
        substation_ref: 'st-1',
        bus_ref: 'bus-sn',
        terminal_bus_ref: 'bus-z',
        equipment_refs: [],
        primary_devices: [
          { device_ref: 'aparat-1', kind: rodzaj, ...(zKatalogiem ? { catalog_ref: 'poz-1' } : {}) },
        ],
        tags: [],
        meta: {},
      },
    ],
    branches: [],
    transformers: [],
    sources: [],
    loads: [],
    generators: [],
  } as unknown as EnergyNetworkModel;
}

function katalogi(rodzaj: RodzajUrzadzenia, ik: number | null, ith: number | null): KatalogiKarty {
  return {
    aparatySn: new Map([
      [
        'poz-1',
        {
          id: 'poz-1',
          name: 'Pozycja testowa',
          device_kind: RODZAJ_APARATU_SN[rodzaj],
          u_n_kv: 12,
          i_n_a: 630,
          breaking_capacity_ka: ik,
          i_th_ka: ith,
          i_th_duration_s: ith === null ? null : 1,
        } as never,
      ],
    ]),
    transformatory: new Map(),
  };
}

function wiersze(rodzaj: RodzajUrzadzenia, zKatalogiem: boolean, ik: number | null, ith: number | null) {
  const karta = buildKartaTechniczna(
    model(rodzaj, zKatalogiem),
    { kind: 'apparatus', elementId: 'aparat-1' } as DaneElementuKanwy,
    zKatalogiem ? katalogi(rodzaj, ik, ith) : undefined,
  );
  expect(karta).not.toBeNull();
  return new Map<string, WierszKarty>(karta!.sekcje.flatMap((s) => s.wiersze.map((w) => [w.klucz, w] as const)));
}

const RODZAJE = Object.keys(RODZAJ_APARATU_SN) as RodzajUrzadzenia[];

describe('karta aparatu — „nie dotyczy” (rodzaj) vs „brak danych”', () => {
  it.each(RODZAJE.flatMap((r) => [[r, true] as const, [r, false] as const]))(
    '%s (rodzaj z katalogu: %s) bez liczb',
    (rodzaj, zKatalogiem) => {
      const w = wiersze(rodzaj, zKatalogiem, null, null);
      const [ik, ith] = BEZ_LICZB[rodzaj];
      expect(w.get('ik_wyl')?.wartosc).toBe(ik);
      // Wiersz prądu cieplnego jest na karcie zawsze — brak danej nie znika z ekranu.
      expect(w.has('ith')).toBe(true);
      expect(w.get('ith')?.wartosc).toBe(ith);
    },
  );

  it.each(RODZAJE)('%s z liczbami katalogu: liczba zawsze widoczna, nigdy „0 kA”', (rodzaj) => {
    const w = wiersze(rodzaj, true, 25, 20);
    expect(w.get('ik_wyl')?.wartosc).toBe('25 kA');
    expect(w.get('ith')?.wartosc).toBe('20 kA / 1 s');
  });
});
