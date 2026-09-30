/**
 * KARTA SZYNY-STACJI-LUSTRO — PARYTET lustra `szynyStacji` z backendem `enm.tor_pola.szyny_stacji`
 * na KAŻDEJ stacji KAŻDEGO modelu ENM z fikstur generowanych (substrat 52 stacji, fikstury
 * ENM SLD, DEMO-OZE-SC, harness scen).
 *
 * Oczekiwania wytwarza backend (`tests/reference_networks/szyny_stacji_parytet.py`, test
 * świeżości bajtowej `tests/application/test_szyny_stacji_parytet.py`); ten test czyta TE
 * SAME pliki fikstur, idzie do modelu wskaźnikiem JSON zapisanym przez generator i porównuje
 * zbiory stacja po stacji. Lustro bez zacisków pól SN albo bez aparatów pól nN czerwieni
 * ten test (iniekcje zmierzone w meldunku karty).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { szynyStacji, type GalazDlaSzyn, type StacjaDlaSzyn } from '../szynyStacji';

const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

interface PlikParytetu {
  readonly pliki: Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, readonly string[]>>>>>>;
}

const parytet = JSON.parse(
  readFileSync(resolve(FRONTEND, 'src/ui/shared/__tests__/fixtures/szynyStacjiParytet.json'), 'utf8'),
) as PlikParytetu;

function wskaz(dane: unknown, wskaznik: string): unknown {
  let wezel = dane;
  for (const czesc of wskaznik.split('/').slice(1)) {
    const klucz = czesc.replace(/~1/g, '/').replace(/~0/g, '~');
    wezel = Array.isArray(wezel) ? wezel[Number(klucz)] : (wezel as Record<string, unknown>)[klucz];
  }
  return wezel;
}

const przypadki = Object.entries(parytet.pliki).flatMap(([plik, modele]) => {
  const dane = JSON.parse(readFileSync(resolve(FRONTEND, plik), 'utf8')) as unknown;
  return Object.entries(modele).map(([wskaznik, oczekiwane]) => ({
    plik,
    wskaznik,
    model: wskaz(dane, wskaznik) as {
      readonly substations: readonly StacjaDlaSzyn[];
      readonly branches: readonly GalazDlaSzyn[];
    },
    oczekiwane,
  }));
});

describe('szynyStacji — parytet z backendem na fiksturach generowanych', () => {
  it('kontrola wejścia: plik parytetu obejmuje substrat 52 stacji, fikstury SLD i harness', () => {
    const pliki = przypadki.map((p) => p.plik);
    expect(pliki).toContain('src/ui/sld/v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json');
    expect(pliki.some((p) => p.startsWith('src/ui/sld/v3/scene/__tests__/fixtures/'))).toBe(true);
    expect(pliki.some((p) => p.startsWith('src/harness-fixtures/generated/'))).toBe(true);
    const stacji = przypadki.reduce((suma, p) => suma + Object.keys(p.oczekiwane).length, 0);
    expect(stacji).toBeGreaterThanOrEqual(200);
  });

  it.each(przypadki.map((p) => [`${p.plik}${p.wskaznik}`, p] as const))(
    '%s — każda stacja: zbiór lustra = zbiór backendu',
    (_nazwa, { model, oczekiwane }) => {
      const stacje = new Map(model.substations.map((s) => [String(s.ref_id), s]));
      expect([...stacje.keys()].sort()).toEqual(Object.keys(oczekiwane).sort());
      for (const [ref, szyny] of Object.entries(oczekiwane)) {
        expect({ ref, szyny: [...szynyStacji(stacje.get(ref)!, model.branches)].sort() }).toEqual({
          ref,
          szyny: [...szyny],
        });
      }
    },
  );

  it('niezależność od kolejności gałęzi: odwrócona lista gałęzi daje te same zbiory', () => {
    for (const { model, oczekiwane } of przypadki) {
      const odwrocone = [...model.branches].reverse();
      for (const stacja of model.substations) {
        expect([...szynyStacji(stacja, odwrocone)].sort()).toEqual(oczekiwane[String(stacja.ref_id)]);
      }
    }
  });
});
