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
import {
  indeksGaleziPolNn,
  indeksStacjiPol,
  stacjaPola,
  szynaGlownaStacji,
  szynyStacji,
} from '../szynyStacji';
import {
  kontekstTransformatorowStacji,
  selectStationDistributionTransformers,
  stationRefOfTransformer,
  transformatoryNalezaceDoStacji,
  type ModelTransformatorow,
} from '../transformatoryStacji';
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

/** Wszystkie odpowiedzi klasy policzone lustrami frontu — w kształcie pliku backendu.
 *  `zIndeksami` — te same pytania z indeksami migawki budowanymi RAZ (ścieżka adaptera SLD,
 *  eksportu i przeglądów, PARTIA-6-FRONT): wynik musi być identyczny z backendem tak samo
 *  jak pojedyncze pytanie bez indeksu. */
function odpowiedziFrontu(model: EnergyNetworkModel, zIndeksami = false): Oczekiwane {
  const galezie = model.branches ?? [];
  const stacje = (model.substations ?? []).filter((s): s is Substation => typeof s?.ref_id === 'string');
  const modelTr: ModelTransformatorow = { ...model, transformers: model.transformers ?? [] };
  const kontekst = zIndeksami ? kontekstTransformatorowStacji(modelTr) : undefined;
  const indeks = zIndeksami ? indeksGaleziPolNn(galezie) : undefined;
  const szyny: Record<string, string[]> = {};
  const glowne: Record<string, Record<string, string | null>> = {};
  const transformatory: Record<string, string[]> = {};
  for (const stacja of stacje) {
    const nalezace = [...szynyStacji(stacja, galezie, indeks)].sort();
    szyny[stacja.ref_id] = nalezace;
    glowne[stacja.ref_id] = Object.fromEntries(
      nalezace.map((s) => [s, szynaGlownaStacji(stacja, galezie, s, indeks)]),
    );
    transformatory[stacja.ref_id] = selectStationDistributionTransformers(modelTr, stacja, kontekst)
      .map((t) => String(t.ref_id)).sort();
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
      const odwrocone = [...(model.branches ?? [])].reverse();
      for (const stacja of model.substations ?? []) {
        expect([...szynyStacji(stacja, odwrocone)].sort()).toEqual(oczekiwane.szyny[String(stacja.ref_id)]);
      }
    }
  });
});

/**
 * PARTIA-6-FRONT × SZYNY-STACJI-LUSTRO (2) — indeksy migawki dla reguł, których backend nie
 * przypina osobnym kluczem parytetu: odwrotność reguły transformatorów stacji, przynależność
 * transformatora bez filtra blokowego i stacja pola. Iloczyn cech: {każdy model fikstur} ×
 * {każdy transformator / każda stacja / każde pole z każdego kanału} × {bez indeksu, z indeksem
 * zbudowanym raz}; plus indeks zbudowany dla innej migawki = wyjątek (nie cichy zły wynik).
 */
describe('indeksy migawki reguł SZYNY-STACJI-LUSTRO — ta sama odpowiedź co pojedyncze pytanie', () => {
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
    const indeksPol = indeksStacjiPol(model);
    const pola = new Set<string>();
    for (const bay of model.bays ?? []) if (typeof bay?.ref_id === 'string') pola.add(bay.ref_id);
    for (const stacja of stacje) {
      const meta = (stacja.meta ?? {}) as { field_specs?: unknown; nn_field_specs?: unknown };
      for (const lista of [meta.field_specs, meta.nn_field_specs]) {
        for (const spec of Array.isArray(lista) ? lista : []) {
          const ref = (spec as { field_ref?: unknown })?.field_ref;
          if (typeof ref === 'string') pola.add(ref);
        }
      }
    }
    pola.add('pole-spoza-modelu');
    for (const pole of pola) expect(stacjaPola(model, pole, indeksPol)).toBe(stacjaPola(model, pole));
  });

  it('stacja pola: rekord bays wygrywa z deklaracją (także bays bez stacji), potem PIERWSZA stacja deklarująca', () => {
    const model = {
      bays: [
        { ref_id: 'pole-a', substation_ref: 'st-bays' },
        { ref_id: 'pole-b', substation_ref: null },
        { ref_id: 'pole-a', substation_ref: 'st-druga-bays' },
      ],
      substations: [
        { ref_id: 'st-1', meta: { field_specs: [{ field_ref: 'pole-a' }, { field_ref: 'pole-b' }, { field_ref: 'pole-c' }] } },
        { ref_id: 'st-2', meta: { nn_field_specs: [{ field_ref: 'pole-c' }, { field_ref: 'pole-d' }] } },
        { ref_id: 'st-3', meta: { field_specs: [{ field_ref: 'pole-d' }] } },
      ],
    };
    for (const indeks of [undefined, indeksStacjiPol(model)]) {
      expect(stacjaPola(model, 'pole-a', indeks)).toBe('st-bays');
      expect(stacjaPola(model, 'pole-b', indeks)).toBeNull();
      expect(stacjaPola(model, 'pole-c', indeks)).toBe('st-1');
      expect(stacjaPola(model, ' pole-d ', indeks)).toBe('st-2');
      expect(stacjaPola(model, 'pole-e', indeks)).toBeNull();
      expect(stacjaPola(model, '', indeks)).toBeNull();
    }
  });

  it('pole nN z KILKOMA aparatami (łańcuch gałęzi o tym samym znaczniku pola): każda gałąź w szynach, z indeksem i bez', () => {
    // Lustro backendu `_aparaty_pol_nn_stacji` zwraca WSZYSTKIE gałęzie ze znacznikiem pola —
    // indeks gałęzi pól nN musi nieść listę, nie pierwszą gałąź (kształt spoza fikstur).
    const stacja = {
      ref_id: 'st-1',
      bus_refs: ['szyna-nn'],
      meta: { nn_field_specs: [{ field_ref: 'pole-nn-1' }, { field_ref: 'pole-nn-2' }] },
    } as unknown as Substation;
    const galezie = [
      { ref_id: 'obca', from_bus_ref: 'x', to_bus_ref: 'y', meta: {} },
      { ref_id: 'ap-2', from_bus_ref: 'szyna-nn', to_bus_ref: 'odplyw-2', meta: { nn_field_migrowany_z: 'pole-nn-2' } },
      { ref_id: 'ap-1a', from_bus_ref: 'szyna-nn', to_bus_ref: 'posrednia-1', meta: { nn_field_migrowany_z: 'pole-nn-1' } },
      { ref_id: 'ap-1b', from_bus_ref: 'posrednia-1', to_bus_ref: 'odplyw-1', meta: { nn_field_migrowany_z: 'pole-nn-1' } },
    ];
    const oczekiwane = ['szyna-nn', 'odplyw-2', 'posrednia-1', 'odplyw-1'];
    for (const indeks of [undefined, indeksGaleziPolNn(galezie)]) {
      expect([...szynyStacji(stacja, galezie, indeks)]).toEqual(oczekiwane);
      expect(szynaGlownaStacji(stacja, galezie, 'posrednia-1', indeks)).toBe('szyna-nn');
      expect(szynaGlownaStacji(stacja, galezie, 'odplyw-2', indeks)).toBe('szyna-nn');
      // Za łańcuchem aparatów (początek aparatu nie jest szyną główną) — `null` jak backend.
      expect(szynaGlownaStacji(stacja, galezie, 'odplyw-1', indeks)).toBeNull();
    }
  });

  it('indeks zbudowany dla innej migawki: wyjątek w każdej regule, nie cichy zły wynik', () => {
    const [{ model }] = przypadki.filter((p) => (p.model.substations ?? []).length > 0);
    const modelTr: ModelTransformatorow = { ...model, transformers: model.transformers ?? [] };
    const innyTr: ModelTransformatorow = { ...modelTr };
    const stacja = (model.substations ?? [])[0] as Substation;
    const obcyKontekst = kontekstTransformatorowStacji(innyTr);
    expect(() => selectStationDistributionTransformers(modelTr, stacja, obcyKontekst)).toThrow();
    expect(() => transformatoryNalezaceDoStacji(modelTr, stacja, obcyKontekst)).toThrow();
    const tr = modelTr.transformers[0];
    if (tr) expect(() => stationRefOfTransformer(modelTr, tr.ref_id, obcyKontekst)).toThrow();
    expect(() => stacjaPola(model, 'x', indeksStacjiPol({ ...model }))).toThrow();
    // Indeks gałęzi pól nN sprawdzany tam, gdzie reguła go czyta: stacja z polami nN.
    const maPolaNn = (s: Substation): boolean => {
      const specs = (s.meta as { nn_field_specs?: unknown } | undefined)?.nn_field_specs;
      return Array.isArray(specs) && specs.length > 0;
    };
    const zNn = przypadki
      .flatMap((p) => (p.model.substations ?? []).filter(maPolaNn).map((s) => ({ s, galezie: p.model.branches ?? [] })))[0];
    expect(zNn).toBeDefined();
    const obcyIndeks = indeksGaleziPolNn([...zNn.galezie]);
    expect(() => szynyStacji(zNn.s, zNn.galezie, obcyIndeks)).toThrow();
    expect(() => szynaGlownaStacji(zNn.s, zNn.galezie, 'szyna-spoza-stacji', obcyIndeks)).toThrow();
  });
});
