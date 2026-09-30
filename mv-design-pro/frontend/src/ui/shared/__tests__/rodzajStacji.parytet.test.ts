/**
 * KARTA ETYKIETA-STACJI-PRZELOTOWEJ — PARYTET lustra `rodzajStacji` z backendem
 * `enm.rodzaj_stacji` na KAŻDEJ stacji KAŻDEGO modelu ENM z fikstur generowanych (substrat
 * 52 stacji, fikstury ENM SLD, DEMO-OZE-SC, harness scen), na modelu ILOCZYNU CECH (źródło
 * roli pola × liczba pól liniowych × sprzęgło × połączenia wyprowadzeń × deklaracja) i na
 * składach pól stacji nieosadzonej (kreator, szablon).
 *
 * Oczekiwania wytwarza backend (`tests/reference_networks/rodzaj_stacji_parytet.py`, test
 * świeżości bajtowej `tests/application/test_rodzaj_stacji_parytet.py`); ten test czyta TE
 * SAME pliki fikstur, idzie do modelu wskaźnikiem JSON zapisanym przez generator i porównuje
 * rodzaj stacja po stacji — wraz z liczbą pól liniowych, sprzęgłem, połączonymi
 * wyprowadzeniami, deklaracją, polami nierozpoznanymi i zdaniem przyczyny.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  rodzajeStacji,
  rodzajZeSkladuPol,
  type ModelDlaRodzaju,
  type RodzajStacjiWynik,
} from '../rodzajStacji';

const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

interface RekordOczekiwany {
  readonly rodzaj: string;
  readonly pola_liniowe: number;
  readonly sprzeglo: boolean;
  readonly wyprowadzenia_polaczone: number;
  readonly deklaracja: string | null;
  readonly zgodny_z_deklaracja: boolean;
  readonly pola_nierozpoznane: readonly string[];
  readonly przyczyna_pl: string;
}

type StacjeOczekiwane = Readonly<Record<string, RekordOczekiwany>>;

interface PlikParytetu {
  readonly iloczyn: { readonly model: ModelDlaRodzaju; readonly stacje: StacjeOczekiwane };
  readonly sklady: readonly { readonly role: readonly string[]; readonly polaczone_wyprowadzenia: number; readonly rodzaj: string }[];
  readonly pliki: Readonly<Record<string, Readonly<Record<string, StacjeOczekiwane>>>>;
}

const parytet = JSON.parse(
  readFileSync(resolve(FRONTEND, 'src/ui/shared/__tests__/fixtures/rodzajStacjiParytet.json'), 'utf8'),
) as PlikParytetu;

function wskaz(dane: unknown, wskaznik: string): unknown {
  let wezel = dane;
  for (const czesc of wskaznik.split('/').slice(1)) {
    const klucz = czesc.replace(/~1/g, '/').replace(/~0/g, '~');
    wezel = Array.isArray(wezel) ? wezel[Number(klucz)] : (wezel as Record<string, unknown>)[klucz];
  }
  return wezel;
}

function rekord(wynik: RodzajStacjiWynik): RekordOczekiwany {
  return {
    rodzaj: wynik.rodzaj,
    pola_liniowe: wynik.polaLiniowe,
    sprzeglo: wynik.sprzeglo,
    wyprowadzenia_polaczone: wynik.wyprowadzeniaPolaczone,
    deklaracja: wynik.deklaracja,
    zgodny_z_deklaracja: wynik.zgodnyZDeklaracja,
    pola_nierozpoznane: [...wynik.polaNierozpoznane],
    przyczyna_pl: wynik.przyczynaPl,
  };
}

function porownaj(model: ModelDlaRodzaju, oczekiwane: StacjeOczekiwane): void {
  const wynik = rodzajeStacji(model);
  expect([...wynik.keys()].sort()).toEqual(Object.keys(oczekiwane).sort());
  for (const [ref, oczekiwany] of Object.entries(oczekiwane)) {
    expect({ ref, ...rekord(wynik.get(ref)!) }).toEqual({ ref, ...oczekiwany });
  }
}

const przypadki = Object.entries(parytet.pliki).flatMap(([plik, modele]) => {
  const dane = JSON.parse(readFileSync(resolve(FRONTEND, plik), 'utf8')) as unknown;
  return Object.entries(modele).map(([wskaznik, oczekiwane]) => ({
    plik,
    wskaznik,
    model: wskaz(dane, wskaznik) as ModelDlaRodzaju,
    oczekiwane,
  }));
});

describe('rodzajStacji — parytet z backendem', () => {
  it('kontrola wejścia: plik obejmuje substrat 52 stacji, fikstury SLD, harness i wszystkie rodzaje', () => {
    const pliki = przypadki.map((p) => p.plik);
    expect(pliki).toContain('src/ui/sld/v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json');
    expect(pliki.some((p) => p.startsWith('src/ui/sld/v3/canvas/__tests__/fixtures/'))).toBe(true);
    expect(pliki.some((p) => p.startsWith('src/harness-fixtures/generated/'))).toBe(true);
    const rekordy = [
      ...przypadki.flatMap((p) => Object.values(p.oczekiwane)),
      ...Object.values(parytet.iloczyn.stacje),
    ];
    expect(rekordy.length).toBeGreaterThanOrEqual(200);
    // Iloczyn cech ćwiczy każdy rodzaj, obie odpowiedzi zgodności i pola nierozpoznane.
    expect(new Set(rekordy.map((r) => r.rodzaj))).toEqual(new Set(['terminal', 'inline', 'branch', 'sectional']));
    expect(new Set(rekordy.map((r) => r.zgodny_z_deklaracja))).toEqual(new Set([true, false]));
    expect(rekordy.some((r) => r.pola_nierozpoznane.length > 0)).toBe(true);
    expect(rekordy.some((r) => r.pola_liniowe === 2 && r.rodzaj === 'terminal')).toBe(true);
  });

  it('model iloczynu cech: każda stacja jak w backendzie', () => {
    porownaj(parytet.iloczyn.model, parytet.iloczyn.stacje);
  });

  it.each(przypadki.map((p) => [`${p.plik}${p.wskaznik}`, p] as const))(
    '%s — każda stacja: rodzaj lustra = rodzaj backendu',
    (_nazwa, { model, oczekiwane }) => {
      porownaj(model, oczekiwane);
    },
  );

  it('skład pól stacji nieosadzonej: ta sama reguła co backend', () => {
    for (const sklad of parytet.sklady) {
      expect({ ...sklad, rodzaj: rodzajZeSkladuPol(sklad.role, sklad.polaczone_wyprowadzenia) }).toEqual(sklad);
    }
  });

  it('niezależność od kolejności gałęzi: odwrócona lista gałęzi daje te same rodzaje', () => {
    for (const { model, oczekiwane } of przypadki) {
      porownaj({ ...model, branches: [...(model.branches ?? [])].reverse() }, oczekiwane);
    }
  });
});
