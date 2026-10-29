// @vitest-environment node
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
 *  - `zaciski_pol` — `zaciskPola` ↔ `enm.pola.zacisk_pola` (rekordy `bays` stacji modelu);
 *  - `punkty_przylaczenia_rekordow_pol` — `punktPrzylaczeniaPola` ↔
 *    `enm.pola.punkt_przylaczenia_pola` (każdy rekord `bays`).
 * Karta W5-B: pola czytane wyłącznie z rekordów `bays`; akcesory pól przypina osobno
 * `polaStacji.parytet.test.ts` (sekcja `pola` tego samego pliku).
 * Iniekcje zmierzone w meldunku karty.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel, Substation } from '../../../types/enm';
import { szynaGlownaStacji, szynyStacji } from '../szynyStacji';
import {
  kontekstTransformatorowStacji,
  selectStationDistributionTransformers,
  stationRefOfTransformer,
  transformatoryNalezaceDoStacji,
  type ModelTransformatorow,
} from '../transformatoryStacji';
import { punktPrzylaczeniaPola, zaciskPola } from '../polaStacji';

const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

interface Oczekiwane {
  readonly szyny: Readonly<Record<string, readonly string[]>>;
  readonly szyny_glowne: Readonly<Record<string, Readonly<Record<string, string | null>>>>;
  readonly transformatory: Readonly<Record<string, readonly string[]>>;
  readonly zaciski_pol: Readonly<Record<string, string | null>>;
  readonly punkty_przylaczenia_rekordow_pol: Readonly<Record<string, string | null>>;
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

/** Wszystkie odpowiedzi klasy policzone lustrami frontu — w kształcie pliku backendu.
 *  `zIndeksami` — te same pytania z kontekstem transformatorów stacji budowanym RAZ na migawkę
 *  (ścieżka adaptera SLD, eksportu i przeglądów, PARTIA-6-FRONT): wynik musi być identyczny
 *  z backendem tak samo jak pojedyncze pytanie bez kontekstu. Indeksy pól i gałęzi lustra szyn
 *  (`polaStacji.ts`, `szynyStacji.ts`) są pamięcią migawki — obie ścieżki je dzielą. */
function odpowiedziFrontu(model: EnergyNetworkModel, zIndeksami = false): Oczekiwane {
  const stacje = (model.substations ?? []).filter((s): s is Substation => typeof s?.ref_id === 'string');
  const modelTr: ModelTransformatorow = { ...model, transformers: model.transformers ?? [] };
  const kontekst = zIndeksami ? kontekstTransformatorowStacji(modelTr) : undefined;
  const szyny: Record<string, string[]> = {};
  const glowne: Record<string, Record<string, string | null>> = {};
  const transformatory: Record<string, string[]> = {};
  for (const stacja of stacje) {
    const nalezace = [...szynyStacji(model, stacja)].sort();
    szyny[stacja.ref_id] = nalezace;
    glowne[stacja.ref_id] = Object.fromEntries(nalezace.map((s) => [s, szynaGlownaStacji(model, stacja, s)]));
    transformatory[stacja.ref_id] = selectStationDistributionTransformers(modelTr, stacja, kontekst)
      .map((t) => String(t.ref_id)).sort();
  }
  const refyStacji = new Set(stacje.map((s) => s.ref_id));
  const zaciski: Record<string, string | null> = {};
  const punkty: Record<string, string | null> = {};
  for (const bay of model.bays ?? []) {
    if (typeof bay?.ref_id !== 'string') continue;
    punkty[bay.ref_id] = punktPrzylaczeniaPola(bay);
    if (bay.ref_id.trim() && bay.substation_ref && refyStacji.has(bay.substation_ref)) {
      zaciski[bay.ref_id] = zaciskPola(bay);
    }
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

  it.each(
    przypadki.flatMap((p) => [
      [p.nazwa, 'pojedyncze pytania', p, false],
      [p.nazwa, 'indeksy migawki', p, true],
    ] as const),
  )('%s (%s) — wszystkie odpowiedzi = backend', (_n, _tryb, { model, oczekiwane }, zIndeksami) => {
    const front = odpowiedziFrontu(model, zIndeksami);
    expect(front.szyny).toEqual(oczekiwane.szyny);
    expect(front.szyny_glowne).toEqual(oczekiwane.szyny_glowne);
    expect(front.transformatory).toEqual(oczekiwane.transformatory);
    expect(front.zaciski_pol).toEqual(oczekiwane.zaciski_pol);
    expect(front.punkty_przylaczenia_rekordow_pol).toEqual(oczekiwane.punkty_przylaczenia_rekordow_pol);
  });

  it('niezależność od kolejności gałęzi: odwrócona lista gałęzi daje te same zbiory szyn', () => {
    for (const { model, oczekiwane } of przypadki) {
      const odwrocone = { ...model, branches: [...(model.branches ?? [])].reverse() };
      for (const stacja of model.substations ?? []) {
        expect([...szynyStacji(odwrocone, stacja)].sort()).toEqual(oczekiwane.szyny[String(stacja.ref_id)]);
      }
    }
  });
});

/**
 * PARTIA-6-FRONT × SZYNY-STACJI-LUSTRO (2) × W5-B — kontekst migawki reguły transformatorów
 * stacji i pamięć indeksów lustra szyn. Iloczyn cech: {każdy model fikstur} × {każdy
 * transformator / każda stacja} × {bez kontekstu, z kontekstem zbudowanym raz}; pole nN
 * z kilkoma aparatami × {kolejność gałęzi prosta, odwrócona}; pamięć indeksu × dopisanie gałęzi
 * do tej samej tablicy; kontekst zbudowany dla innej migawki = wyjątek (nie cichy zły wynik).
 */
describe('kontekst migawki reguł SZYNY-STACJI-LUSTRO — ta sama odpowiedź co pojedyncze pytanie', () => {
  it.each(przypadki.map((p) => [p.nazwa, p] as const))('%s', (_n, { model }) => {
    const modelTr: ModelTransformatorow = { ...model, transformers: model.transformers ?? [] };
    const kontekst = kontekstTransformatorowStacji(modelTr);
    for (const transformer of modelTr.transformers) {
      expect(stationRefOfTransformer(modelTr, transformer.ref_id, kontekst))
        .toBe(stationRefOfTransformer(modelTr, transformer.ref_id));
    }
    const stacje = (model.substations ?? []).filter((s): s is Substation => typeof s?.ref_id === 'string');
    for (const stacja of stacje) {
      expect(transformatoryNalezaceDoStacji(modelTr, stacja, kontekst))
        .toEqual(transformatoryNalezaceDoStacji(modelTr, stacja));
    }
  });

  /** Stacja z dwoma polami nN (rekordy `bays` na szynie 0,4 kV); pole 1 ma łańcuch DWÓCH
   *  aparatów w `equipment_refs`. */
  function modelPolaNnZLancuchem(galezie: EnergyNetworkModel['branches']): EnergyNetworkModel {
    return {
      buses: [{ ref_id: 'szyna-nn', voltage_kv: 0.4 }],
      substations: [{ ref_id: 'st-1', bus_refs: ['szyna-nn'] }],
      bays: [
        { ref_id: 'pole-nn-1', bus_ref: 'szyna-nn', bay_role: 'FEEDER', substation_ref: 'st-1', equipment_refs: ['ap-1a', 'ap-1b'] },
        { ref_id: 'pole-nn-2', bus_ref: 'szyna-nn', bay_role: 'FEEDER', substation_ref: 'st-1', equipment_refs: ['ap-2'] },
      ],
      branches: galezie,
    } as unknown as EnergyNetworkModel;
  }

  const GALEZIE_NN = [
    { ref_id: 'obca', from_bus_ref: 'x', to_bus_ref: 'y' },
    { ref_id: 'ap-2', from_bus_ref: 'szyna-nn', to_bus_ref: 'odplyw-2' },
    { ref_id: 'ap-1a', from_bus_ref: 'szyna-nn', to_bus_ref: 'posrednia-1' },
    { ref_id: 'ap-1b', from_bus_ref: 'posrednia-1', to_bus_ref: 'odplyw-1' },
  ] as unknown as EnergyNetworkModel['branches'];

  it.each([
    ['prosta', GALEZIE_NN, ['szyna-nn', 'odplyw-2', 'posrednia-1', 'odplyw-1']],
    ['odwrócona', [...(GALEZIE_NN ?? [])].reverse(), ['szyna-nn', 'posrednia-1', 'odplyw-1', 'odplyw-2']],
  ] as const)('pole nN z KILKOMA aparatami, kolejność gałęzi %s: każda gałąź w szynach, w kolejności tablicy', (_n, galezie, oczekiwane) => {
    // Lustro backendu `_aparaty_pol_nn_stacji` zwraca WSZYSTKIE aparaty z `equipment_refs`
    // pól nN — indeks gałęzi niesie listę pozycji, nie pierwszą gałąź (kształt spoza fikstur).
    const model = modelPolaNnZLancuchem([...galezie]);
    const stacja = (model.substations ?? [])[0] as Substation;
    expect([...szynyStacji(model, stacja)]).toEqual(oczekiwane);
    expect(szynaGlownaStacji(model, stacja, 'posrednia-1')).toBe('szyna-nn');
    expect(szynaGlownaStacji(model, stacja, 'odplyw-2')).toBe('szyna-nn');
    // Za łańcuchem aparatów (początek aparatu nie jest szyną główną) — `null` jak backend.
    expect(szynaGlownaStacji(model, stacja, 'odplyw-1')).toBeNull();
  });

  it('pamięć indeksu gałęzi: dopisanie aparatu do TEJ SAMEJ tablicy jest widoczne (indeks unieważniony)', () => {
    const galezie = [...(GALEZIE_NN ?? [])].filter((g) => g.ref_id !== 'ap-2');
    const model = modelPolaNnZLancuchem(galezie);
    const stacja = (model.substations ?? [])[0] as Substation;
    expect(szynyStacji(model, stacja).has('odplyw-2')).toBe(false);
    galezie.push({ ref_id: 'ap-2', from_bus_ref: 'szyna-nn', to_bus_ref: 'odplyw-2' } as never);
    expect(szynyStacji(model, stacja).has('odplyw-2')).toBe(true);
  });

  it('kontekst zbudowany dla innej migawki: wyjątek w każdej regule, nie cichy zły wynik', () => {
    const [{ model }] = przypadki.filter((p) => (p.model.substations ?? []).length > 0);
    const modelTr: ModelTransformatorow = { ...model, transformers: model.transformers ?? [] };
    const innyTr: ModelTransformatorow = { ...modelTr };
    const stacja = (model.substations ?? [])[0] as Substation;
    const obcyKontekst = kontekstTransformatorowStacji(innyTr);
    expect(() => selectStationDistributionTransformers(modelTr, stacja, obcyKontekst)).toThrow();
    expect(() => transformatoryNalezaceDoStacji(modelTr, stacja, obcyKontekst)).toThrow();
    const tr = modelTr.transformers[0];
    if (tr) expect(() => stationRefOfTransformer(modelTr, tr.ref_id, obcyKontekst)).toThrow();
  });
});
