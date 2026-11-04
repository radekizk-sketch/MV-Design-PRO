import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../types/enm';
import { listNnLoadOptions } from '../../network-build/forms/enmResolvers';
import { nazwaCeluOdejscia } from '../../sld/v2/canvas/enmToSldAdapter';
import { resolveElementNameForFixAction } from '../../workspace/routerFixActionHelpers';
import { mapowanieObiektuInspektora } from '../../../ui2/adapters/inspectorAdapter';
import { obiektyModeluDoIndeksu } from '../../../ui2/search/obiektyModelu';
import { uziemieniaSieci, uziemieniePunktu } from '../../../ui2/wyniki/skladowe/model';
import { naWierszeZaczepowModelu } from '../../../ui2/wyniki/zbieznosc/zbieznoscModel';
import { nazwaStacji } from '../../../ui2/wyniki/zwarcia/aparatura/model';

/**
 * Konsumenci reguły „nazwa albo jawny opis, nigdy identyfikator” — ILOCZYN CECH:
 *
 *   konsument (karta składowych, indeks wyszukiwarki, zaczepy transformatorów, aparatura
 *   zwarciowa, akcja naprawcza, lista odbiorów nN, cel odejścia pola, inspektor ui2)
 *   × rodzaj obiektu (źródło, transformator, odcinek, szyna, odbiór, stacja, źródło wytwórcze)
 *   × nazwa {jest · pusta · brak} (+ referencja spoza modelu tam, gdzie konsument przyjmuje ref).
 *
 * Referencje mają postać z odciskiem (jak w modelu backendu) — niezmiennik: ŻADNA nie pojawia się
 * w tekście wyniku konsumenta.
 */

type Wariant = 'jest' | 'pusta' | 'brak';
const WARIANTY: readonly Wariant[] = ['jest', 'pusta', 'brak'];

const REF = {
  zrodlo: 'src/7f3a9c2e4b1d0a5f6e8c/source',
  trafo1: 'tr/1a2b3c4d5e6f7a8b9c0d/transformer',
  trafo2: 'tr/9f8e7d6c5b4a39281706/transformer',
  odcinek: 'seg/0123456789abcdef0123/branch_segment',
  szynaSn: 'bus/aa11bb22cc33dd44ee55/bus',
  szynaNn: 'bus/ff66ee77dd88cc99bb00/bus',
  odbior: 'load/5e5e5e5e5e5e5e5e5e5e/load',
  stacja: 'stn/4855aa0c1b2d3e4f5a6b/station',
  generator: 'gen/3c3c3c3c3c3c3c3c3c3c/generator',
} as const;

function nazwa(wariant: Wariant, tekst: string): string | undefined {
  if (wariant === 'jest') return tekst;
  if (wariant === 'pusta') return '';
  return undefined;
}

function model(wariant: Wariant): EnergyNetworkModel {
  const n = (tekst: string) => nazwa(wariant, tekst);
  return {
    sources: [{ ref_id: REF.zrodlo, id: REF.zrodlo, name: n('Sieć zasilająca 110 kV'), bus_ref: REF.szynaSn, neutral_grounding: { type: 'isolated' } }],
    transformers: [
      { ref_id: REF.trafo1, id: REF.trafo1, name: n('TR1'), hv_neutral: { type: 'solid' }, lv_neutral: null },
      { ref_id: REF.trafo2, id: REF.trafo2, name: n('TR2'), hv_neutral: null, lv_neutral: { type: 'solid' } },
    ],
    branches: [{ ref_id: REF.odcinek, id: REF.odcinek, name: n('Kabel L-1'), type: 'cable', from_bus_ref: REF.szynaSn, to_bus_ref: REF.szynaNn }],
    buses: [
      { ref_id: REF.szynaSn, id: REF.szynaSn, name: n('Szyna SN'), voltage_kv: 15 },
      { ref_id: REF.szynaNn, id: REF.szynaNn, name: n('Szyna nN'), voltage_kv: 0.4 },
    ],
    loads: [{ ref_id: REF.odbior, id: REF.odbior, name: n('Odbiór O-1'), bus_ref: REF.szynaNn, p_mw: 0.1, q_mvar: 0.02 }],
    substations: [{ ref_id: REF.stacja, id: REF.stacja, name: n('Stacja S-08'), station_type: 'mv_lv', bus_refs: [REF.szynaSn, REF.szynaNn] }],
    generators: [{ ref_id: REF.generator, id: REF.generator, name: n('PV Pole 1'), gen_type: 'pv_inverter', bus_ref: REF.szynaNn }],
    bays: [],
    junctions: [],
    corridors: [],
    measurements: [],
    protection_assignments: [],
  } as unknown as EnergyNetworkModel;
}

function bezIdentyfikatorow(teksty: readonly string[]): void {
  for (const tekst of teksty) for (const ref of Object.values(REF)) expect(tekst).not.toContain(ref);
}

describe.each(WARIANTY)('konsumenci nazwy obiektu × nazwa %s', (wariant) => {
  const m = model(wariant);
  const opis = (tekst: string, zapas: string) => (wariant === 'jest' ? tekst : zapas);

  it('karta składowych: uziemienia źródeł i stron transformatorów (źródło, transformator)', () => {
    const elementy = uziemieniaSieci(m).map((w) => w.element);
    expect(elementy).toEqual([
      opis('Sieć zasilająca 110 kV', 'Źródło bez nazwy (1 z 1)'),
      opis('TR1', 'Transformator bez nazwy (1 z 2)'),
      opis('TR2', 'Transformator bez nazwy (2 z 2)'),
    ]);
    bezIdentyfikatorow(elementy);
  });

  it('karta składowych: uziemienie źródła na szynie wybranego punktu', () => {
    expect(uziemieniePunktu(m, REF.szynaSn)?.element).toBe(opis('Sieć zasilająca 110 kV', 'Źródło bez nazwy (1 z 1)'));
    expect(uziemieniePunktu(m, REF.szynaNn)).toBeNull();
  });

  it('indeks wyszukiwarki: każdy rodzaj obiektu modelu', () => {
    const nazwy = Object.fromEntries(obiektyModeluDoIndeksu(m).map((o) => [o.id, o.nazwa]));
    expect(nazwy).toEqual({
      [REF.zrodlo]: opis('Sieć zasilająca 110 kV', 'Źródło bez nazwy (1 z 1)'),
      [REF.stacja]: opis('Stacja S-08', 'Stacja bez nazwy (1 z 1)'),
      [REF.trafo1]: opis('TR1', 'Transformator bez nazwy (1 z 2)'),
      [REF.trafo2]: opis('TR2', 'Transformator bez nazwy (2 z 2)'),
      [REF.odcinek]: opis('Kabel L-1', 'Odcinek bez nazwy (1 z 1)'),
      [REF.generator]: opis('PV Pole 1', 'Źródło wytwórcze bez nazwy (1 z 1)'),
      [REF.odbior]: opis('Odbiór O-1', 'Odbiór bez nazwy (1 z 1)'),
      [REF.szynaSn]: opis('Szyna SN', 'Szyna bez nazwy (1 z 2)'),
      [REF.szynaNn]: opis('Szyna nN', 'Szyna bez nazwy (2 z 2)'),
    });
    bezIdentyfikatorow(Object.values(nazwy));
  });

  it('zaczepy transformatorów: numer w kolejności wierszy (po referencji)', () => {
    const nazwy = naWierszeZaczepowModelu(m).map((w) => w.nazwa);
    expect(nazwy).toEqual([opis('TR1', 'Transformator bez nazwy (1 z 2)'), opis('TR2', 'Transformator bez nazwy (2 z 2)')]);
  });

  it('aparatura zwarciowa i cel odejścia pola: stacja w modelu oraz referencja spoza modelu', () => {
    expect(nazwaStacji(m, REF.stacja)).toBe(opis('Stacja S-08', 'Stacja bez nazwy (1 z 1)'));
    expect(nazwaStacji(m, 'stn/0000000000000000dead/station')).toBe('Stacja spoza modelu');
    expect(nazwaCeluOdejscia(m, REF.stacja)).toBe(opis('Stacja S-08', 'Stacja bez nazwy (1 z 1)'));
    expect(nazwaCeluOdejscia(m, 'stn/0000000000000000dead/station')).toBe('Stacja spoza modelu');
  });

  it('akcja naprawcza: rodzaj z kolekcji, w której obiekt leży; referencja spoza modelu', () => {
    expect(resolveElementNameForFixAction(m, REF.generator)).toBe(opis('PV Pole 1', 'Źródło wytwórcze bez nazwy (1 z 1)'));
    expect(resolveElementNameForFixAction(m, REF.szynaNn)).toBe(opis('Szyna nN', 'Szyna bez nazwy (2 z 2)'));
    expect(resolveElementNameForFixAction(m, REF.odbior)).toBe(opis('Odbiór O-1', 'Odbiór bez nazwy (1 z 1)'));
    expect(resolveElementNameForFixAction(m, 'bus/0000000000000000dead/bus')).toBe('Element modelu spoza modelu');
    expect(resolveElementNameForFixAction(null, REF.szynaNn)).toBe('Element modelu spoza modelu');
  });

  it('lista odbiorów nN kreatora wyłącznika różnicowoprądowego: odbiór i jego szyna', () => {
    const [opcja] = listNnLoadOptions(m);
    expect(opcja.name).toBe(opis('Odbiór O-1', 'Odbiór bez nazwy (1 z 1)'));
    expect(opcja.bus_name).toBe(opis('Szyna nN', 'Szyna bez nazwy (2 z 2)'));
    bezIdentyfikatorow([opcja.name, opcja.bus_name]);
  });

  it('inspektor ui2: nagłówek i wiersz „Nazwa” z etykietą typu elementu', () => {
    const obiekt = mapowanieObiektuInspektora(m, REF.szynaSn);
    expect(obiekt?.nazwa).toBe(opis('Szyna SN', 'Szyna bez nazwy'));
    const wierszNazwy = obiekt?.wlasciwosci[0].wiersze.find((w) => w.etykieta === 'Nazwa');
    expect(wierszNazwy?.wartosc.wartosc).toBe(obiekt?.nazwa);
  });
});
