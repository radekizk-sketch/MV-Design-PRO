/**
 * SLD-SUBSTRAT — odbiory stacji na szynach odpływów nN promowanych do modelu.
 *
 * Od automigracji promocji pól nN (backend `enm/migrations/nn_field_specs_promocja.py`)
 * odbiór stacji zbudowanej operacjami domenowymi wisi na SZYNIE ODPŁYWU (za aparatem
 * pola nN), a nie na szynie nN stacji; szyna odpływu nie trafia do `Substation.bus_refs`.
 * Tabliczka „Odbiór ΣP", strzałka odbioru, moc odbioru stacji i lista odbiorów szuflady
 * czytały wyłącznie `bus_refs` — na modelu z API odbiór znikał z rysunku (ujawnione
 * regeneracją `gpzFeeder` z realnego API: „Odbiór ΣP" 2 → 0).
 *
 * ILOCZYN CECH (reguła KLASA §2): położenie odbioru {szyna nN stacji, szyna odpływu TEJ
 * stacji, szyna odpływu INNEJ stacji, szyna podrozdzielnicy} × konsument {predykat szyn
 * stacji, szuflada szczegółów stacji, tabliczka sceny}. Dane: fikstura `gpzFeeder`
 * wygenerowana z realnego API (backend `tests/reference_networks/fikstury_enm_sld.py`).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel, Load, Substation } from '../../../../types/enm';
import { buildSldDataFromSnapshot } from '../../v2/canvas/enmToSldAdapter';
import { buildSceneV3 } from '../../v3/scene/buildScene';
import { buildStationDetailDrawerData } from '../detailDrawerData';
import { stationLoadBusRefs } from '../stationBusResolution';

const here = dirname(fileURLToPath(import.meta.url));
const enm = (
  JSON.parse(
    readFileSync(resolve(here, '../../v3/scene/__tests__/fixtures/gpzFeeder.enm.json'), 'utf8'),
  ) as { readonly enm: EnergyNetworkModel }
).enm;

const stacje = (enm.substations ?? []).filter((s) => s.station_type === 'inline') as Substation[];
const [s01, s02] = stacje;
const szynaNn = (stacja: Substation): string =>
  (stacja.bus_refs ?? []).find((ref) => ref.endsWith('/nn_bus'))!;
const szynyOdplywow = (stacja: Substation): string[] =>
  [...stationLoadBusRefs(stacja, enm.branches ?? [])].filter((ref) => !(stacja.bus_refs ?? []).includes(ref));

function zOdbiorem(busRef: string, ref: string): EnergyNetworkModel {
  const wzor = (enm.loads ?? [])[0] as Load;
  return { ...enm, loads: [...(enm.loads ?? []), { ...wzor, id: ref, ref_id: ref, name: ref, bus_ref: busRef }] };
}

describe('stationLoadBusRefs — przynależność szyn odbiorów do stacji', () => {
  it('kontrola wejścia: model z API niesie promowane odpływy nN, a odbiory stoją na szynach odpływów', () => {
    expect(stacje).toHaveLength(2);
    for (const stacja of stacje) expect(szynyOdplywow(stacja).length).toBeGreaterThan(0);
    const szynyOdbiorow = new Set((enm.loads ?? []).map((l) => l.bus_ref));
    for (const stacja of stacje) {
      expect(szynyOdbiorow.has(szynaNn(stacja))).toBe(false);
      expect(szynyOdplywow(stacja).some((ref) => szynyOdbiorow.has(ref))).toBe(true);
    }
  });

  it('szyny stacji = bus_refs ∪ szyny JEJ odpływów; szyny odpływów INNEJ stacji nie wchodzą', () => {
    const a = stationLoadBusRefs(s01, enm.branches ?? []);
    const b = stationLoadBusRefs(s02, enm.branches ?? []);
    for (const ref of s01.bus_refs ?? []) expect(a.has(ref)).toBe(true);
    for (const ref of szynyOdplywow(s02)) expect(a.has(ref)).toBe(false);
    for (const ref of szynyOdplywow(s01)) expect(b.has(ref)).toBe(false);
  });

  it('gałąź z polem TEJ stacji, ale wychodząca z obcej szyny, nie dopisuje szyny (deklaracja musi być spójna)', () => {
    const galaz = (enm.branches ?? []).find((g) => szynyOdplywow(s01).includes(String(g.to_bus_ref)))!;
    const zepsuta = { ...galaz, from_bus_ref: szynaNn(s02) };
    const szyny = stationLoadBusRefs(s01, [zepsuta]);
    expect(szyny.has(String(galaz.to_bus_ref))).toBe(false);
  });

  it('stacja bez nn_field_specs: wynik = dokładnie bus_refs (model sprzed promocji, np. substrat 52 stacji)', () => {
    const bezPol = { ...s01, meta: {} } as Substation;
    expect([...stationLoadBusRefs(bezPol, enm.branches ?? [])].sort()).toEqual([...(s01.bus_refs ?? [])].sort());
  });
});

describe('konsumenci predykatu — szuflada stacji i tabliczka sceny', () => {
  const sldData = buildSldDataFromSnapshot(enm, enm.logical_views ?? null, null);

  it('szuflada S01 wymienia odbiór z szyny odpływu, a nie odbiór stacji S02', () => {
    const dane = buildStationDetailDrawerData(enm, sldData, null, s01.ref_id);
    const odbiory = dane?.nnSpec?.loads?.map((l) => l.id) ?? [];
    const odbioryS01 = (enm.loads ?? [])
      .filter((l) => szynyOdplywow(s01).includes(l.bus_ref))
      .map((l) => l.ref_id);
    expect(odbioryS01.length).toBeGreaterThan(0);
    expect([...odbiory].sort()).toEqual([...odbioryS01].sort());
  });

  it('odbiór na szynie podrozdzielnicy (obca stacja) nie trafia do szuflady ani tabliczki S01', () => {
    const zPodrozdzielnica = zOdbiorem('nn/podrozdzielnica/board_bus', 'load/podrozdzielnica');
    const dane = buildStationDetailDrawerData(
      zPodrozdzielnica,
      buildSldDataFromSnapshot(zPodrozdzielnica, zPodrozdzielnica.logical_views ?? null, null),
      null,
      s01.ref_id,
    );
    expect(dane?.nnSpec?.loads?.some((l) => l.id === 'load/podrozdzielnica')).toBe(false);
  });

  it('odbiór WPROST na szynie nN stacji nadal się liczy (model sprzed promocji)', () => {
    const zOdbioremNaSzynie = zOdbiorem(szynaNn(s01), 'load/na-szynie-nn');
    const dane = buildStationDetailDrawerData(
      zOdbioremNaSzynie,
      buildSldDataFromSnapshot(zOdbioremNaSzynie, zOdbioremNaSzynie.logical_views ?? null, null),
      null,
      s01.ref_id,
    );
    expect(dane?.nnSpec?.loads?.some((l) => l.id === 'load/na-szynie-nn')).toBe(true);
  });

  it('tabliczka sceny: każda stacja z odbiorem na szynie odpływu niesie wiersz „Odbiór ΣP" i strzałkę odbioru', () => {
    const scena = buildSceneV3(enm, 2);
    const wiersze = scena.labels
      .filter((l) => l.ownerKind === 'station-name' && l.text.startsWith('Odbiór ΣP'))
      .map((l) => l.text);
    expect(wiersze).toHaveLength(2);
    expect(scena.symbols.filter((s) => s.symbolId === 'loadArrow')).toHaveLength(2);
  });
});
