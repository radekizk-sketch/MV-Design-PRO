/**
 * KARTA SZYNY-STACJI-LUSTRO — PARYTET luster frontu z backendem na KAŻDYM modelu ENM z fikstur
 * generowanych (substrat 52 stacji, fikstury ENM SLD, DEMO-OZE-SC, harness scen).
 *
 * Oczekiwania wytwarza backend (`tests/reference_networks/szyny_stacji_parytet.py`, test
 * świeżości bajtowej `tests/application/test_szyny_stacji_parytet.py`). Klucze = odpowiedzi
 * jednej klasy „stacja i jej szyny”:
 *  - `szyny` — `szynyStacji` ↔ `enm.tor_pola.szyny_stacji`;
 *  - `szyny_glowne` — `szynaGlownaStacji` ↔ `enm.tor_pola.szyna_glowna_stacji`;
 *  - `transformatory` — `selectStationDistributionTransformers` ↔
 *    `enm.pole_transformatorowe.transformatory_stacji`;
 *  - `zaciski_pol` — `zaciskPola` ↔ `enm.zajetosc_pol.zacisk_pola`;
 *  - `punkty_przylaczenia_rekordow_pol` — `zaciskRekorduPola(bay) ?? bay.bus_ref` ↔
 *    `application.field_read_model.punkt_przylaczenia_pola`.
 * Iniekcje zmierzone w meldunku karty.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel, Substation } from '../../../types/enm';
import { szynaGlownaStacji, szynyStacji } from '../szynyStacji';
import { selectStationDistributionTransformers } from '../transformatoryStacji';
import { zaciskPola, zaciskRekorduPola } from '../zaciskPola';

const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

interface Oczekiwane {
  readonly szyny: Readonly<Record<string, readonly string[]>>;
  readonly szyny_glowne: Readonly<Record<string, Readonly<Record<string, string | null>>>>;
  readonly transformatory: Readonly<Record<string, readonly string[]>>;
  readonly zaciski_pol: Readonly<Record<string, string | null>>;
  readonly punkty_przylaczenia_rekordow_pol: Readonly<Record<string, string>>;
}

const parytet = JSON.parse(
  readFileSync(resolve(FRONTEND, 'src/ui/shared/__tests__/fixtures/szynyStacjiParytet.json'), 'utf8'),
) as { readonly pliki: Readonly<Record<string, Readonly<Record<string, Oczekiwane>>>> };

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
    nazwa: `${plik}${wskaznik}`,
    model: wskaz(dane, wskaznik) as EnergyNetworkModel,
    oczekiwane,
  }));
});

/** Wszystkie odpowiedzi klasy policzone lustrami frontu — w kształcie pliku backendu. */
function odpowiedziFrontu(model: EnergyNetworkModel): Oczekiwane {
  const galezie = model.branches ?? [];
  const stacje = (model.substations ?? []).filter((s): s is Substation => typeof s?.ref_id === 'string');
  const szyny: Record<string, string[]> = {};
  const glowne: Record<string, Record<string, string | null>> = {};
  const transformatory: Record<string, string[]> = {};
  for (const stacja of stacje) {
    const nalezace = [...szynyStacji(stacja, galezie)].sort();
    szyny[stacja.ref_id] = nalezace;
    glowne[stacja.ref_id] = Object.fromEntries(nalezace.map((s) => [s, szynaGlownaStacji(stacja, galezie, s)]));
    transformatory[stacja.ref_id] = selectStationDistributionTransformers(
      { ...model, transformers: model.transformers ?? [] },
      stacja,
    ).map((t) => String(t.ref_id)).sort();
  }
  const zaciski: Record<string, string | null> = {};
  for (const stacja of stacje) {
    const specs = (stacja.meta as { field_specs?: unknown } | undefined)?.field_specs;
    for (const spec of Array.isArray(specs) ? specs : []) {
      const ref = (spec as { field_ref?: unknown })?.field_ref;
      if (typeof ref === 'string' && ref.trim()) zaciski[ref] = zaciskPola(spec as Record<string, unknown>);
    }
  }
  const punkty: Record<string, string> = {};
  for (const bay of model.bays ?? []) {
    if (typeof bay?.ref_id !== 'string') continue;
    punkty[bay.ref_id] = zaciskRekorduPola(bay as unknown as Record<string, unknown>) ?? String(bay.bus_ref);
  }
  return {
    szyny,
    szyny_glowne: glowne,
    transformatory,
    zaciski_pol: zaciski,
    punkty_przylaczenia_rekordow_pol: punkty,
  };
}

describe('lustra klasy „stacja i jej szyny” — parytet z backendem na fiksturach generowanych', () => {
  it('kontrola wejścia: substrat 52 stacji, fikstury SLD i harness; każda odpowiedź ma dane', () => {
    const nazwy = przypadki.map((p) => p.nazwa);
    expect(nazwy).toContain('src/ui/sld/v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json/enm');
    expect(nazwy.some((p) => p.startsWith('src/ui/sld/v3/scene/__tests__/fixtures/'))).toBe(true);
    expect(nazwy.some((p) => p.startsWith('src/harness-fixtures/generated/'))).toBe(true);
    const stacji = przypadki.reduce((suma, p) => suma + Object.keys(p.oczekiwane.szyny).length, 0);
    expect(stacji).toBeGreaterThanOrEqual(200);
    const transformatorow = przypadki.reduce(
      (suma, p) => suma + Object.values(p.oczekiwane.transformatory).reduce((a, t) => a + t.length, 0),
      0,
    );
    expect(transformatorow).toBeGreaterThan(0);
  });

  it.each(przypadki.map((p) => [p.nazwa, p] as const))('%s — wszystkie odpowiedzi = backend', (_n, { model, oczekiwane }) => {
    const front = odpowiedziFrontu(model);
    expect(front.szyny).toEqual(oczekiwane.szyny);
    expect(front.szyny_glowne).toEqual(oczekiwane.szyny_glowne);
    expect(front.transformatory).toEqual(oczekiwane.transformatory);
    expect(front.zaciski_pol).toEqual(oczekiwane.zaciski_pol);
    expect(front.punkty_przylaczenia_rekordow_pol).toEqual(oczekiwane.punkty_przylaczenia_rekordow_pol);
  });

  it('niezależność od kolejności gałęzi: odwrócona lista gałęzi daje te same zbiory szyn', () => {
    for (const { model, oczekiwane } of przypadki) {
      const odwrocone = [...(model.branches ?? [])].reverse();
      for (const stacja of model.substations ?? []) {
        expect([...szynyStacji(stacja, odwrocone)].sort()).toEqual(oczekiwane.szyny[String(stacja.ref_id)]);
      }
    }
  });
});
