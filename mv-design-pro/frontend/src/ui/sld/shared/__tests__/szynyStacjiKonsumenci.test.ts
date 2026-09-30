/**
 * KARTA SZYNY-STACJI-LUSTRO — konsumenci JEDNEJ reguły przynależności szyny do stacji.
 *
 * Do tej karty rysunek pytał o przynależność dwiema połówkami reguły: agregat odbioru,
 * szuflada i kompletność rysunku znały szyny za aparatami pól nN, ale nie zaciski pól SN;
 * przypisanie odcinka do stacji znało zaciski pól SN, ale nie szyny za aparatami. Model z
 * API (`gpzFeeder`, backend `tests/reference_networks/fikstury_enm_sld.py`) ma OBA rodzaje
 * szyn w każdej stacji, więc każdy konsument jest tu sprawdzany na KAŻDYM rodzaju szyny.
 *
 * ILOCZYN CECH (reguła KLASA §2): rodzaj szyny {szyna główna SN, szyna główna nN, własny
 * zacisk pola SN, zacisk wyłącznika głównego nN (strona dolna transformatora), szyna
 * odpływu nN, szyna odpływu INNEJ stacji, szyna obca, szyna za ŁAŃCUCHEM aparatów
 * podrozdzielnicy (`nnBoardDemo`)} × konsument {przypisanie szyny do
 * stacji (menu, transformator, odbiór, punkt przyłączenia OZE, punkt zwarcia), odbiory
 * szuflady, tabliczka „Odbiór ΣP", kompletność rysunku, pokrycie warstwy wynikowej}.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel, Load, Substation } from '../../../../types/enm';
import { selectLoadSummaries } from '../../../network-build/networkBuildStore';
import { snPointKindForBus } from '../../../network-build/station-der/zModelu';
import { stacjeDlaPunktu } from '../../../../ui2/wyniki/zwarcia/aparatura/model';
import { stacjaSzyn, szynyStacji } from '../../../shared/szynyStacji';
import { buildSldDataFromSnapshot } from '../../v2/canvas/enmToSldAdapter';
import { resultPointsInStationNnBoard } from '../../v3/canvas/resultRefBridge';
import { buildSceneV3 } from '../../v3/scene/buildScene';
import { kompletnoscRysunku } from '../../v3/scene/kompletnoscRysunku';
import { buildStationDetailDrawerData } from '../detailDrawerData';
import { stationRefOfBusOrSource } from '../sldActionExecutor';

const here = dirname(fileURLToPath(import.meta.url));
const enm = (
  JSON.parse(
    readFileSync(resolve(here, '../../v3/scene/__tests__/fixtures/gpzFeeder.enm.json'), 'utf8'),
  ) as { readonly enm: EnergyNetworkModel }
).enm;
const galezie = enm.branches ?? [];
const stacje = (enm.substations ?? []).filter((s) => s.station_type === 'inline') as Substation[];
const [s01, s02] = stacje;
const napiecie = new Map((enm.buses ?? []).map((b) => [b.ref_id, b.voltage_kv]));

function rodzajeSzyn(stacja: Substation) {
  const glowne = stacja.bus_refs ?? [];
  const polaNn = ((stacja.meta as { nn_field_specs?: { field_ref: string }[] }).nn_field_specs ?? []).map((p) => p.field_ref);
  const aparaty = galezie.filter((g) => {
    const pole = (g.meta as { nn_field_migrowany_z?: unknown } | undefined)?.nn_field_migrowany_z;
    return typeof pole === 'string' && polaNn.includes(pole);
  });
  // Strona dolna transformatora stacji leży na zacisku wyłącznika głównego nN (koniec
  // aparatu pola nN spoza `bus_refs`), a nie na szynie nN rozdzielnicy.
  const transformator = (enm.transformers ?? []).find((t) => (stacja.transformer_refs ?? []).includes(t.ref_id))!;
  const zaciskWylacznikaNn = String(transformator.lv_bus_ref);
  return {
    snGlowna: glowne.find((r) => (napiecie.get(r) ?? 0) > 1)!,
    nnGlowna: glowne.find((r) => (napiecie.get(r) ?? 99) <= 1)!,
    zaciskSn: [...szynyStacji(stacja, [])].find((r) => !glowne.includes(r))!,
    zaciskWylacznikaNn,
    odplywNn: String(aparaty.map((g) => g.to_bus_ref).find((r) => r !== zaciskWylacznikaNn)),
  };
}

function zOdbiorem(busRef: string, ref: string): EnergyNetworkModel {
  const wzor = (enm.loads ?? [])[0] as Load;
  return { ...enm, loads: [...(enm.loads ?? []), { ...wzor, id: ref, ref_id: ref, name: ref, bus_ref: busRef }] };
}

describe('kontrola wejścia — model z API niesie oba rodzaje szyn spoza bus_refs w każdej stacji', () => {
  it.each(stacje.map((s) => [s.ref_id, s] as const))('%s', (_ref, stacja) => {
    const r = rodzajeSzyn(stacja);
    for (const szyna of Object.values(r)) expect(szyna).toBeTruthy();
    expect(stacja.bus_refs).not.toContain(r.zaciskSn);
    expect(stacja.bus_refs).not.toContain(r.odplywNn);
    expect(stacja.bus_refs).not.toContain(r.zaciskWylacznikaNn);
  });
});

describe('przypisanie szyny do stacji — każdy konsument × każdy rodzaj szyny', () => {
  const mapa = stacjaSzyn(enm.substations ?? [], galezie);

  it.each(stacje.flatMap((s) => Object.entries(rodzajeSzyn(s)).map(([rodzaj, szyna]) => [s.ref_id, rodzaj, szyna] as const)))(
    '%s · %s',
    (stacjaRef, _rodzaj, szyna) => {
      expect(mapa.get(szyna)).toBe(stacjaRef);
      expect(stationRefOfBusOrSource(enm, szyna)).toBe(stacjaRef);
      expect(snPointKindForBus(enm, szyna)).toBe('station_bus');
      expect(stacjeDlaPunktu(enm, { target_id: szyna, element_id: szyna })).toEqual([stacjaRef]);
      const zOdb = zOdbiorem(szyna, 'load/probny');
      expect(selectLoadSummaries(zOdb).find((l) => l.id === 'load/probny')?.stationRef).toBe(
        (enm.substations ?? []).find((s) => s.ref_id === stacjaRef)?.id,
      );
    },
  );

  it('szyna odpływu INNEJ stacji i szyna obca nie należą do S01', () => {
    expect(szynyStacji(s01, galezie).has(rodzajeSzyn(s02).odplywNn)).toBe(false);
    expect(stationRefOfBusOrSource(enm, 'szyna/obca')).toBeNull();
    expect(stacjeDlaPunktu(enm, { target_id: 'szyna/obca', element_id: 'szyna/obca' })).toEqual([]);
  });

  it('aparat z deklaracją pola TEJ stacji dopisuje OBA końce, także z obcej szyny (deklaracja rozstrzyga — jak backend)', () => {
    const aparat = galezie.find((g) => String(g.to_bus_ref) === rodzajeSzyn(s01).odplywNn)!;
    const zObcej = { ...aparat, from_bus_ref: rodzajeSzyn(s02).nnGlowna };
    const szyny = szynyStacji(s01, [zObcej]);
    expect(szyny.has(String(aparat.to_bus_ref))).toBe(true);
    expect(szyny.has(rodzajeSzyn(s02).nnGlowna)).toBe(true);
  });
});

describe('rysunek — tabliczka, szuflada, kompletność i pokrycie wyników na jednej regule', () => {
  const sldData = buildSldDataFromSnapshot(enm, enm.logical_views ?? null, null);

  it('szuflada S01 wymienia odbiory strony nN stacji (szyny odpływów), a nie odbiory S02', () => {
    const dane = buildStationDetailDrawerData(enm, sldData, null, s01.ref_id);
    const odbiory = dane?.nnSpec?.loads?.map((l) => l.id) ?? [];
    const szynyS01 = szynyStacji(s01, galezie);
    const oczekiwane = (enm.loads ?? []).filter((l) => szynyS01.has(l.bus_ref)).map((l) => l.ref_id);
    expect(oczekiwane.length).toBeGreaterThan(0);
    expect([...odbiory].sort()).toEqual([...oczekiwane].sort());
  });

  it('odbiór na zacisku pola SN należy do stacji, ale NIE do strony nN szuflady (strona z pasma)', () => {
    const { zaciskSn } = rodzajeSzyn(s01);
    const model = zOdbiorem(zaciskSn, 'load/na-zacisku-sn');
    const dane = buildStationDetailDrawerData(model, buildSldDataFromSnapshot(model, model.logical_views ?? null, null), null, s01.ref_id);
    expect(dane?.nnSpec?.loads?.some((l) => l.id === 'load/na-zacisku-sn')).toBe(false);
    const raport = kompletnoscRysunku(buildSceneV3(model, 2), model);
    const pozycja = raport.pozycje.find((p) => p.ref === 'load/na-zacisku-sn');
    expect(pozycja?.kategoria).toBe('agregat-odbioru-stacji');
  });

  it('odbiór na zacisku wyłącznika głównego nN (strona dolna transformatora) liczy się w szufladzie i kompletności', () => {
    const { zaciskWylacznikaNn } = rodzajeSzyn(s01);
    const model = zOdbiorem(zaciskWylacznikaNn, 'load/na-zacisku-nn');
    const dane = buildStationDetailDrawerData(model, buildSldDataFromSnapshot(model, model.logical_views ?? null, null), null, s01.ref_id);
    expect(dane?.nnSpec?.loads?.some((l) => l.id === 'load/na-zacisku-nn')).toBe(true);
    const raport = kompletnoscRysunku(buildSceneV3(model, 2), model);
    expect(raport.pozycje.find((p) => p.ref === 'load/na-zacisku-nn')?.kategoria).toBe('agregat-odbioru-stacji');
  });

  it('odbiór na szynie podrozdzielnicy spoza modelu nie trafia do szuflady S01', () => {
    const model = zOdbiorem('nn/podrozdzielnica/board_bus', 'load/podrozdzielnica');
    const dane = buildStationDetailDrawerData(model, buildSldDataFromSnapshot(model, model.logical_views ?? null, null), null, s01.ref_id);
    expect(dane?.nnSpec?.loads?.some((l) => l.id === 'load/podrozdzielnica')).toBe(false);
  });

  it('tabliczka sceny: każda stacja z odbiorem na szynie odpływu niesie „Odbiór ΣP" i strzałkę odbioru', () => {
    const scena = buildSceneV3(enm, 2);
    const wiersze = scena.labels.filter((l) => l.ownerKind === 'station-name' && l.text.startsWith('Odbiór ΣP'));
    expect(wiersze).toHaveLength(2);
    expect(scena.symbols.filter((s) => s.symbolId === 'loadArrow')).toHaveLength(2);
  });

  it('pokrycie wyników: rozdzielnica nN stacji = strona nN szyn stacji spoza bus_refs; zacisk pola SN — nie', () => {
    const nnBoard = resultPointsInStationNnBoard(enm);
    for (const stacja of stacje) {
      const r = rodzajeSzyn(stacja);
      expect(nnBoard.has(r.odplywNn)).toBe(true);
      expect(nnBoard.has(r.zaciskWylacznikaNn)).toBe(true);
      expect(nnBoard.has(r.zaciskSn)).toBe(false);
      expect(nnBoard.has(r.nnGlowna)).toBe(false);
      expect(nnBoard.has(r.snGlowna)).toBe(false);
    }
  });
});

describe('łańcuch aparatów pól nN podrozdzielnicy (`nnBoardDemo`, osobna `Substation`)', () => {
  const demo = (
    JSON.parse(readFileSync(resolve(here, '../../../../../public/test-fixtures/nnBoardDemo.enm.json'), 'utf8')) as {
      readonly enm: EnergyNetworkModel;
    }
  ).enm;
  const podrozdzielnica = (demo.substations ?? []).find((s) => s.station_type === 'rozdzielnica_nn')!;
  const aparaty = (demo.branches ?? []).filter((g) => {
    const pole = (g.meta as { nn_field_migrowany_z?: unknown } | undefined)?.nn_field_migrowany_z;
    const pola = ((podrozdzielnica.meta as { nn_field_specs?: { field_ref: string }[] }).nn_field_specs ?? []).map((p) => p.field_ref);
    return typeof pole === 'string' && pola.includes(pole);
  });
  const zaSekcja = aparaty.filter((g) => !(podrozdzielnica.bus_refs ?? []).includes(String(g.from_bus_ref)));

  it('kontrola wejścia: odpływy za szyną sekcji (koniec from spoza bus_refs) istnieją', () => {
    expect(zaSekcja.length).toBeGreaterThan(0);
  });

  it('szyny za sekcją należą do podrozdzielnicy w KAŻDEJ kolejności gałęzi i trafiają do rozdzielnicy nN wyników', () => {
    const nnBoard = resultPointsInStationNnBoard(demo);
    for (const galezieKolejnosc of [demo.branches ?? [], [...(demo.branches ?? [])].reverse()]) {
      const mapa = stacjaSzyn(demo.substations ?? [], galezieKolejnosc);
      for (const g of zaSekcja) {
        expect(mapa.get(String(g.from_bus_ref))).toBe(podrozdzielnica.ref_id);
        expect(mapa.get(String(g.to_bus_ref))).toBe(podrozdzielnica.ref_id);
      }
    }
    for (const g of zaSekcja) expect(nnBoard.has(String(g.to_bus_ref))).toBe(true);
  });
});

/**
 * Cel pola liniowego GPZ bez jawnego `outgoing_destination_ref` — wnioskowanie tylko przy
 * JEDNOZNACZNYM celu. Iloczyn: {jeden odcinek z szyny pola, dwa odcinki do dwóch stacji} ×
 * {koniec odcinka na zacisku pola stacji (spoza `bus_refs`)}. Zmierzone: po przejściu na lustro
 * szyn stacji oba pola `gpzProtectionDataPath` (wspólna szyna sekcji) dostawały „→ S01".
 */
describe('cel pola liniowego GPZ — przynależność końca odcinka z lustra, bez zgadywania', () => {
  const siec = (
    JSON.parse(
      readFileSync(resolve(here, '../../v3/scene/__tests__/fixtures/gpzProtectionDataPath.enm.json'), 'utf8'),
    ) as { readonly enm: EnergyNetworkModel }
  ).enm;
  const polaLiniowe = (model: EnergyNetworkModel) => {
    const gpz = buildSldDataFromSnapshot(model, model.logical_views ?? null, null).gpzs[0];
    if (gpz === undefined) throw new Error('sieć testowa bez GPZ — fikstura niezgodna z testem');
    return (gpz.sections ?? []).flatMap((s) => s.bays).filter((b) => b.fieldRole === 'LINE_OUT');
  };

  it('dwa odcinki z tej samej szyny sekcji do DWÓCH stacji ⇒ żadne pole nie dostaje celu', () => {
    const pola = polaLiniowe(siec);
    expect(pola).toHaveLength(2);
    for (const pole of pola) expect(pole.outgoingFeeder).toBeUndefined();
  });

  it('jeden odcinek do stacji (koniec na zacisku pola stacji) ⇒ cel = ta stacja i dane TEGO odcinka', () => {
    const s02 = (siec.substations ?? []).find((s) => s.name === 'Stacja S02 (typ B)')!;
    const szynyS02 = szynyStacji(s02, siec.branches ?? []);
    const bezS02 = {
      ...siec,
      branches: (siec.branches ?? []).filter((g) => !szynyS02.has(String(g.to_bus_ref)) || g.type !== 'cable'),
    } as EnergyNetworkModel;
    const pola = polaLiniowe(bezS02);
    expect(pola.length).toBeGreaterThan(0);
    for (const pole of pola) {
      expect(pole.outgoingFeeder?.destination).toBe('→ Stacja S01 (typ B)');
      expect(pole.outgoingFeeder?.segmentTypeLabel).toBe('Kabel SN');
    }
  });
});
