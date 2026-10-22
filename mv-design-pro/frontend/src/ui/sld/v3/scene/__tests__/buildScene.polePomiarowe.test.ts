/**
 * Pole POMIAROWE na realnej scenie — oznacznik przekładnika napięciowego „TV"
 * (dyrektywa właściciela 2026-08-06; rejestr V12K-329).
 *
 * KONTEKST (audyt sieci pokazowej „wyniki na rysunku"): przekładnik napięciowy
 * pola pomiarowego był rysowany glifem dwóch okręgów BEZ żadnego oznacznika —
 * na prawym skraju stacji czytał się jak drugi, anonimowy transformator mocy
 * („mały TR"). Spec §19.1 nie definiowała konwencji numeracji VT („zero
 * zgadywania"), więc `apparatusIdentifiers` świadomie zwracał `null`;
 * dyrektywa właściciela rozstrzygnęła konwencję: klasa przekładników wg
 * PN-EN 81346-2 (TA = prądowy, TV = napięciowy).
 *
 * Fixtura `stacjaPolePomiarowe.enm.json` wygenerowana REALNYMI operacjami
 * domenowymi backendu (`add_grid_source_sn` + `continue_trunk_segment_sn` +
 * `insert_station_on_segment_sn` z polem MEASUREMENT) — jedna prawda kształtu
 * ENM, zero syntetycznego zgadywania (wzór: fixtury `openTerminal`).
 *
 * Test jest ILOCZYNEM CECH (reguła KLASA): {LOD 1, LOD 2} × {symbol VT na
 * scenie, etykieta TV1 obecna, zero luk wyroczni identyfikatorów}. Wycięcie
 * gałęzi `voltageTransformer` z `apparatusIdentifiers` ⇒ wyrocznia
 * `apparatusIdentifierGaps` zgłasza lukę (aparat uprawniony bez oznacznika)
 * i test jest CZERWONY — deklaracja przypięta, nie deklarowana.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { BayPrimaryDevice, EnergyNetworkModel } from '../../../../../types/enm';
import { rekordyAparatowPola, zRekordamiAparatowPol } from './fixtures/rekordyAparatowPola';
import { apparatusIdentifierGaps, buildSceneV3, type SceneLod } from '../buildScene';

const here = dirname(fileURLToPath(import.meta.url));
const surowa = (
  JSON.parse(readFileSync(resolve(here, 'fixtures', 'stacjaPolePomiarowe.enm.json'), 'utf8')) as {
    readonly enm: EnergyNetworkModel;
  }
).enm;

/**
 * GEOMETRIA-STACJI (§0 pkt 4, kryterium właściciela): aparat pola rysuje się WYŁĄCZNIE
 * z rekordu modelu. Operacja budowy stacji zapisuje w polu pomiarowym tylko gałąź
 * wyłącznika (`equipment_refs`); przekładnik napięciowy dawała dotąd konwencja roli
 * MEASUREMENT — aparat, którego model nie zawiera. Intencja testu (oznacznik „TV" na
 * przekładniku i miejsce pola pomiarowego) dotyczy przekładnika ISTNIEJĄCEGO w modelu,
 * więc fikstura deklaruje go rekordem (wyłącznik powiązany z gałęzią pola + przekładnik),
 * a pozostałe pola stacji — rekordami RMU (`zRekordamiAparatowPol`). Przypadek bez rekordu
 * przekładnika: test niżej (rysunek NIE dorysowuje przekładnika).
 */
const enm = ((): EnergyNetworkModel => {
  const model = zRekordamiAparatowPol(surowa);
  for (const bay of model.bays) {
    if (bay.bay_role !== 'MEASUREMENT') continue;
    const rekordy = rekordyAparatowPola(bay.ref_id, ['CB', 'VT']);
    rekordy[0].linked_ref = bay.equipment_refs[0];
    (bay as { primary_devices?: BayPrimaryDevice[] }).primary_devices = rekordy;
  }
  return model;
})();

describe('pole pomiarowe — przekładnik napięciowy z oznacznikiem TV (V12K-329)', () => {
  for (const lod of [1, 2] as SceneLod[]) {
    it(`L${lod}: scena niesie symbol przekładnika napięciowego pola pomiarowego`, () => {
      const scene = buildSceneV3(enm, lod);
      const vt = scene.symbols.filter((s) => s.symbolId === 'voltageTransformer');
      expect(vt.length).toBeGreaterThan(0);
    });
  }

  // Oznaczniki aparatów żyją WYŁĄCZNIE na pełnym szczególe (kontrakt LOD —
  // na L1 wyrocznia liczy 0 etykiet dla N aparatów uprawnionych i to jest
  // stan projektowany, nie luka; pomiar: `apparatusIdentifierGaps` na L1
  // zgłasza rozjazd licznika dla KAŻDEJ kategorii, także Q/QE/T).
  it('L2: przekładnik ma oznacznik konwencji „TV1" (etykieta aparatu na scenie)', () => {
    const scene = buildSceneV3(enm, 2);
    const tvLabels = scene.labels.filter((l) => l.text === 'TV1');
    expect(tvLabels.length).toBeGreaterThan(0);
  });

  it('L2: wyrocznia identyfikatorów aparatów nie zgłasza luk (VT jest aparatem uprawnionym)', () => {
    const scene = buildSceneV3(enm, 2);
    expect(apparatusIdentifierGaps(scene)).toEqual([]);
  });

  it('pole pomiarowe BEZ rekordu przekładnika (migawka z operacji): wyłącznik z gałęzi pola, zero przekładnika z konwencji', () => {
    const scene = buildSceneV3(surowa, 2);
    const polePomiarowe = surowa.bays.find((b) => b.bay_role === 'MEASUREMENT')!;
    const symbolePola = scene.symbols.filter((s) => s.meta?.ownerRef === polePomiarowe.ref_id);
    expect(symbolePola.map((s) => s.symbolId)).toEqual(['breaker']);
    expect(scene.symbols.some((s) => s.symbolId === 'voltageTransformer')).toBe(false);
  });

  it('determinizm: dwa wywołania ⇒ identyczny JSON sceny (L2)', () => {
    const a = JSON.stringify(buildSceneV3(enm, 2));
    const b = JSON.stringify(buildSceneV3(enm, 2));
    expect(a).toBe(b);
  });

  // V12K-330 (dyrektywa właściciela 2026-08-06 — „pole pomiarowe musi być
  // pierwsze patrząc od kierunku zasilania"): kolejność pól NA RYSUNKU podąża
  // za kolejnością rekordów pól `bays` Z DANYCH. Fixtura deklaruje
  // [LINIA_IN, LINIA_OUT, MEASUREMENT, TRANSFORMATOROWE] — przekładnik pola
  // pomiarowego MUSI leżeć na lewo (bliżej zasilania) od pola TR. Dawny
  // ranking ról (liniowe→TR→…→POMIAROWE) spychał pomiar na koniec szyny —
  // rysunek kłamał o miejscu układu pomiarowego.
  it('L2: pole pomiarowe leży PRZED polem transformatorowym (kolejność z danych, nie z rankingu ról)', () => {
    const scene = buildSceneV3(enm, 2);
    const vt = scene.symbols.find((s) => s.symbolId === 'voltageTransformer');
    const trStacji = scene.symbols.find(
      (s) => s.symbolId === 'transformer2W' && (s.meta?.ownerRef ?? '').startsWith('stn/'),
    );
    expect(vt).toBeDefined();
    expect(trStacji).toBeDefined();
    expect((vt?.x ?? Number.NaN) < (trStacji?.x ?? Number.NaN)).toBe(true);
  });
});
