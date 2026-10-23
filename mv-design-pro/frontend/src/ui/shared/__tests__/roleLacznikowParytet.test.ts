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
}

const TABLICA = path.resolve(__dirname, '../../../../../backend/schemas/role_lacznikow_parytet_v1.json');

const PRZYPADKI = (JSON.parse(readFileSync(TABLICA, 'utf-8')) as { przypadki: readonly Przypadek[] })
  .przypadki;

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
