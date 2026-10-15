/**
 * KARTA W5-B/C — PARYTET lustra reguł pól (`polaStacji.ts`) z backendem `enm/pola.py` na
 * KAŻDYM modelu ENM z fikstur generowanych i na modelu iloczynu cech pól.
 *
 * Oczekiwania wytwarza backend (`tests/reference_networks/szyny_stacji_parytet.py`, sekcja
 * `pola`; test świeżości bajtowej `tests/application/test_szyny_stacji_parytet.py`):
 *  - `stacje.<ref>.sn` / `.nn` — `polaSnStacji` / `polaNnStacji` ↔ `pola_sn_stacji` /
 *    `pola_nn_stacji` (kolejność zapisu);
 *  - `czy_pole_nn` — `czyPoleNn` ↔ `czy_pole_nn` (pasmo napięcia szyny pola);
 *  - `stacja_pola` — `stacjaPola` ↔ `stacja_pola` (stacja musi istnieć w modelu);
 *  - `zksn.<punkt>` — `polaZksn` ↔ `pola_zksn`;
 *  - `wg_szyny` — `polaWgSzyny` ↔ `pola_wg_szyny` (OUT < FEEDER < IN < pozostałe, `ref_id`).
 * Zaciski i punkty przyłączenia pól (`zaciskPola`, `punktPrzylaczeniaPola`) przypina
 * `szynyStacji.parytet.test.ts` (klucze `zaciski_pol`, `punkty_przylaczenia_rekordow_pol`).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../types/enm';
import {
  czyPoleNn,
  pola,
  polaNnStacji,
  polaSnStacji,
  polaWgSzyny,
  polaZksn,
  stacjaPola,
} from '../polaStacji';

const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

interface OczekiwanePol {
  readonly czy_pole_nn: Readonly<Record<string, boolean>>;
  readonly stacja_pola: Readonly<Record<string, string | null>>;
  readonly stacje: Readonly<Record<string, { readonly sn: readonly string[]; readonly nn: readonly string[] }>>;
  readonly wg_szyny: Readonly<Record<string, readonly string[]>>;
  readonly zksn: Readonly<Record<string, readonly string[]>>;
}

interface Parytet {
  readonly iloczyn_pol: { readonly model: unknown; readonly pola: OczekiwanePol };
  readonly pliki: Readonly<Record<string, Readonly<Record<string, { readonly pola: OczekiwanePol }>>>>;
}

const parytet = JSON.parse(
  readFileSync(resolve(FRONTEND, 'src/ui/shared/__tests__/fixtures/szynyStacjiParytet.json'), 'utf8'),
) as Parytet;

function wskaz(dane: unknown, wskaznik: string): unknown {
  let wezel = dane;
  for (const czesc of wskaznik.split('/').slice(1)) {
    const klucz = czesc.replace(/~1/g, '/').replace(/~0/g, '~');
    wezel = Array.isArray(wezel) ? wezel[Number(klucz)] : (wezel as Record<string, unknown>)[klucz];
  }
  return wezel;
}

/** Odpowiedzi lustra frontu w kształcie sekcji `pola` pliku backendu. */
function odpowiedziPolFrontu(model: EnergyNetworkModel): OczekiwanePol {
  const rekordy = pola(model).filter((r) => typeof r.ref_id === 'string' && r.ref_id.trim());
  const stacje = (model.substations ?? []).filter((s) => typeof s?.ref_id === 'string');
  const punkty = (model.branch_points ?? [])
    .map((p) => p?.ref_id)
    .filter((ref): ref is string => typeof ref === 'string')
    .sort();
  return {
    czy_pole_nn: Object.fromEntries(rekordy.map((r) => [r.ref_id, czyPoleNn(model, r)])),
    stacja_pola: Object.fromEntries(rekordy.map((r) => [r.ref_id, stacjaPola(model, r.ref_id)])),
    stacje: Object.fromEntries(
      stacje.map((s) => [
        s.ref_id,
        {
          nn: polaNnStacji(model, s.ref_id).map((r) => String(r.ref_id)),
          sn: polaSnStacji(model, s.ref_id).map((r) => String(r.ref_id)),
        },
      ]),
    ),
    wg_szyny: Object.fromEntries(
      [...polaWgSzyny(model).entries()].map(([szyna, lista]) => [szyna, lista.map((r) => String(r.ref_id))]),
    ),
    zksn: Object.fromEntries(punkty.map((ref) => [ref, polaZksn(model, ref).map((r) => String(r.ref_id))])),
  };
}

const przypadki = Object.entries(parytet.pliki).flatMap(([plik, modele]) => {
  const dane = JSON.parse(readFileSync(resolve(FRONTEND, plik), 'utf8')) as unknown;
  return Object.entries(modele).map(([wskaznik, oczekiwane]) => ({
    nazwa: `${plik}${wskaznik}`,
    model: wskaz(dane, wskaznik) as EnergyNetworkModel,
    oczekiwane: oczekiwane.pola,
  }));
});

describe('polaStacji — parytet z backendem enm/pola.py', () => {
  it('kontrola wejścia: każdy model ma sekcję `pola`; iloczyn obejmuje SN, nN i ZKSN', () => {
    expect(przypadki.length).toBeGreaterThan(0);
    for (const p of przypadki) expect(p.oczekiwane).toBeDefined();
    const { pola: iloczyn } = parytet.iloczyn_pol;
    const flagi = Object.values(iloczyn.czy_pole_nn);
    expect(flagi).toContain(true);
    expect(flagi).toContain(false);
    expect(Object.values(iloczyn.zksn).some((lista) => lista.length > 0)).toBe(true);
  });

  it('model iloczynu cech pól: wszystkie odpowiedzi = backend', () => {
    const model = parytet.iloczyn_pol.model as EnergyNetworkModel;
    expect(odpowiedziPolFrontu(model)).toEqual(parytet.iloczyn_pol.pola);
  });

  it.each(przypadki.map((p) => [p.nazwa, p] as const))('%s — wszystkie odpowiedzi = backend', (_n, { model, oczekiwane }) => {
    expect(odpowiedziPolFrontu(model)).toEqual(oczekiwane);
  });
});
