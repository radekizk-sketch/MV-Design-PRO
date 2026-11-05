/**
 * Karta PRZEGLAD-SIECI-JEDNA-KOMPOZYCJA — PARYTET lustra `konceOtwarte` z backendem
 * (`enm.odcinki_bez_odbioru.konce_otwarte`, emiter gotowości W065/W066) na KAŻDYM modelu ENM
 * z fikstur generowanych i na modelu iloczynu cech (każdy rodzaj przyłączenia szyny końcowej,
 * pomiar, łącznik i bezpiecznik, wyspa, pętla, białe znaki, odcinek bez `ref_id`).
 *
 * Oczekiwania wytwarza backend (`tests/reference_networks/odcinki_bez_odbioru_parytet.py`, test
 * świeżości bajtowej `tests/application/test_odcinki_bez_odbioru_parytet.py`).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { konceOtwarte, odcinkiBezOdbioru } from '../odcinkiBezOdbioru';

const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

const parytet = JSON.parse(
  readFileSync(resolve(FRONTEND, 'src/ui/shared/__tests__/fixtures/odcinkiBezOdbioruParytet.json'), 'utf8'),
) as {
  readonly iloczyn: { readonly model: unknown; readonly konce: readonly (readonly [string, string])[] };
  readonly pliki: Readonly<Record<string, Readonly<Record<string, readonly (readonly [string, string])[]>>>>;
};

function wskaz(dane: unknown, wskaznik: string): unknown {
  let wezel = dane;
  for (const czesc of wskaznik.split('/').slice(1)) {
    const klucz = czesc.replace(/~1/g, '/').replace(/~0/g, '~');
    wezel = Array.isArray(wezel) ? wezel[Number(klucz)] : (wezel as Record<string, unknown>)[klucz];
  }
  return wezel;
}

const pary = (model: unknown) => konceOtwarte(model).map((k) => [k.odcinekRef, k.szynaRef]);

describe('odcinkiBezOdbioru — parytet z backendem', () => {
  it('model iloczynu cech: te same końce co backend', () => {
    expect(pary(parytet.iloczyn.model)).toEqual(parytet.iloczyn.konce);
  });

  const przypadki = Object.entries(parytet.pliki).flatMap(([plik, modele]) => {
    const dane = JSON.parse(readFileSync(resolve(FRONTEND, plik), 'utf8')) as unknown;
    return Object.entries(modele).map(([wskaznik, konce]) => ({ plik, wskaznik, model: wskaz(dane, wskaznik), konce }));
  });

  it('obejmuje fikstury SLD z końcami otwartymi', () => {
    expect(przypadki.some((p) => p.konce.length > 0)).toBe(true);
  });

  it.each(przypadki.map((p) => [`${p.plik}${p.wskaznik}`, p] as const))('%s', (_n, p) => {
    expect(pary(p.model)).toEqual(p.konce);
  });

  it('zbiór odcinków = odcinki z co najmniej jednym końcem otwartym', () => {
    expect([...odcinkiBezOdbioru(parytet.iloczyn.model)].sort()).toEqual(
      [...new Set(parytet.iloczyn.konce.map(([o]) => o))].sort(),
    );
  });
});
