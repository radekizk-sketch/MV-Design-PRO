/**
 * Karta GPZ-H5 (wpis 7 koordynacji wątków, pkt 1) — parytet roli łącznika backend × front.
 *
 * Tablica `backend/schemas/role_lacznikow_parytet_v1.json` powstaje w backendzie
 * (`tests/enm/test_role_lacznikow_parytet.py`) z migawek zbudowanych operacjami domenowymi:
 * iloczyn {łącznik szyn 110 kV GPZ, łącznik szyn SN GPZ, łącznik sekcyjny magistrali,
 * sprzęgło stacji sekcyjnej w pierścieniu, sprzęgło rozdzielnicy nN, łącznik pola
 * transformatorowego, łącznik pola liniowego 110 kV} × pozycja normalna {open, closed, niezadeklarowana}. Ten plik
 * sprawdza, że lustro `roleLacznikow` i czytelnicy (`punktyPodzialu`,
 * `kandydaciNaPunktPodzialu`, `czyPunktPodzialu`, `etykietaPozycjiNormalnej`) dają na tych
 * samych migawkach to samo, co `enm.topology.role_lacznikow` i `punkty_podzialu`.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../types/enm';
import {
  czyPunktPodzialu,
  etykietaPozycjiNormalnej,
  kandydaciNaPunktPodzialu,
  pozycjaNormalna,
  punktyPodzialu,
  rolaLacznika,
  roleLacznikow,
  sekcjeSnTransformatorowGpz,
  toryZasilaniaSekcjiWnGpz,
} from '../stanLacznika';

interface Przypadek {
  readonly nazwa: string;
  readonly rodzaj: string;
  readonly stan: 'open' | 'closed' | null;
  readonly lacznik: string;
  readonly migawka: EnergyNetworkModel;
  readonly role: Readonly<Record<string, string>>;
  readonly punkty_podzialu: readonly string[];
  readonly kandydaci: readonly string[];
  readonly sekcje_sn_transformatorow: Readonly<
    Record<string, { readonly szyna_sekcji: string; readonly wylacznik_ref: string | null }>
  >;
  readonly tory_zasilania_wn: Readonly<
    Record<string, readonly { readonly zrodlo_ref: string; readonly wylacznik_ref: string | null }[]>
  >;
}

const TABLICA = path.resolve(__dirname, '../../../../../backend/schemas/role_lacznikow_parytet_v1.json');

type DrogiZacisku = Pick<Przypadek, 'nazwa' | 'migawka' | 'sekcje_sn_transformatorow' | 'tory_zasilania_wn'>;

const DANE = JSON.parse(readFileSync(TABLICA, 'utf-8')) as {
  przypadki: readonly Przypadek[];
  drogi_zacisku_pol: readonly DrogiZacisku[];
};
const PRZYPADKI = DANE.przypadki;

/** Droga „zacisk pola → sekcja” z lustra w postaci tablicy backendu. */
function drogiZLustra(migawka: EnergyNetworkModel): Pick<DrogiZacisku, 'sekcje_sn_transformatorow' | 'tory_zasilania_wn'> {
  return {
    sekcje_sn_transformatorow: Object.fromEntries(
      [...sekcjeSnTransformatorowGpz(migawka)].map(([tr, s]) => [
        tr,
        { szyna_sekcji: s.szynaSekcji, wylacznik_ref: s.wylacznikRef },
      ]),
    ),
    tory_zasilania_wn: Object.fromEntries(
      [...toryZasilaniaSekcjiWnGpz(migawka)].map(([szyna, tory]) => [
        szyna,
        tory.map((t) => ({ zrodlo_ref: t.zrodloRef, wylacznik_ref: t.wylacznikRef })),
      ]),
    ),
  };
}

/** Kolejność kluczy = kolejność backendu (`toEqual` jej nie sprawdza). */
function klucze(d: Pick<DrogiZacisku, 'sekcje_sn_transformatorow' | 'tory_zasilania_wn'>): string[][] {
  return [Object.keys(d.sekcje_sn_transformatorow), Object.keys(d.tory_zasilania_wn)];
}

describe('rola łącznika — parytet z enm.topology.role_lacznikow', () => {
  it('tablica obejmuje iloczyn rodzaj × pozycja normalna', () => {
    const rodzaje = new Set(PRZYPADKI.map((p) => p.rodzaj));
    expect([...rodzaje].sort()).toEqual(
      [
        'LS_110',
        'LS_SN',
        'MAGISTRALA',
        'POLE_TR',
        'POLE_ZASILAJACE_WN',
        'SPRZEGLO_NN',
        'STACJA_SEKCYJNA',
      ].sort(),
    );
    for (const rodzaj of rodzaje) {
      const stany = new Set(PRZYPADKI.filter((p) => p.rodzaj === rodzaj).map((p) => p.stan));
      expect(stany.has('open') && stany.has('closed')).toBe(true);
    }
  });

  it.each(PRZYPADKI.map((p) => [p.nazwa, p] as const))('%s', (_nazwa, p) => {
    const role = Object.fromEntries([...roleLacznikow(p.migawka)].sort(([a], [b]) => (a < b ? -1 : 1)));
    expect(role).toEqual(p.role);
    expect(punktyPodzialu(p.migawka).map((g) => g.ref_id)).toEqual(p.punkty_podzialu);
    expect(kandydaciNaPunktPodzialu(p.migawka).map((g) => g.ref_id)).toEqual(p.kandydaci);
    // Karta GPZ-H5-SCALENIE-APARATURY: droga „zacisk pola → sekcja” (strona SN transformatora
    // 110/SN i tor zasilania 110 kV) — lustro `sekcje_sn_transformatorow_gpz` /
    // `tory_zasilania_sekcji_wn_gpz`, kolejność kluczy jak w backendzie.
    const drogi = drogiZLustra(p.migawka);
    expect(drogi).toEqual({ sekcje_sn_transformatorow: p.sekcje_sn_transformatorow, tory_zasilania_wn: p.tory_zasilania_wn });
    expect(klucze(drogi)).toEqual(klucze(p));

    const galaz = p.migawka.branches.find((g) => g.ref_id === p.lacznik) ?? null;
    expect(galaz).not.toBeNull();
    const rola = rolaLacznika(p.migawka, galaz);
    expect(rola).toBe(p.role[p.lacznik] ?? null);
    expect(czyPunktPodzialu(p.migawka, galaz)).toBe(p.punkty_podzialu.includes(p.lacznik));
    // Etykieta pozycji normalnej: „punkt podziału” wyłącznie przy roli punktu podziału.
    const etykieta = etykietaPozycjiNormalnej(pozycjaNormalna(galaz), rola);
    if (p.stan === 'open') {
      expect(etykieta.includes('punkt podziału')).toBe(rola === 'PUNKT_PODZIALU');
    } else {
      expect(etykieta.includes('punkt podziału')).toBe(false);
    }
  });
});

describe('droga „zacisk pola → sekcja” — parytet z enm.topology', () => {
  it('tablica obejmuje warianty drogi: przez łącznik pola, wprost, dwa łączniki zacisku', () => {
    expect(DANE.drogi_zacisku_pol.map((d) => d.nazwa)).toEqual([
      'przez_lacznik_pola',
      'wprost_na_szynie_sekcji',
      'dwa_laczniki_zacisku',
    ]);
  });

  it.each(DANE.drogi_zacisku_pol.map((d) => [d.nazwa, d] as const))('%s', (_nazwa, d) => {
    const drogi = drogiZLustra(d.migawka);
    expect(drogi).toEqual({ sekcje_sn_transformatorow: d.sekcje_sn_transformatorow, tory_zasilania_wn: d.tory_zasilania_wn });
    expect(klucze(drogi)).toEqual(klucze(d));
  });
});
