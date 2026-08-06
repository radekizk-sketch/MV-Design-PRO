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

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { apparatusIdentifierGaps, buildSceneV3, type SceneLod } from '../buildScene';

const here = dirname(fileURLToPath(import.meta.url));
const enm = (
  JSON.parse(readFileSync(resolve(here, 'fixtures', 'stacjaPolePomiarowe.enm.json'), 'utf8')) as {
    readonly enm: EnergyNetworkModel;
  }
).enm;

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

  it('determinizm: dwa wywołania ⇒ identyczny JSON sceny (L2)', () => {
    const a = JSON.stringify(buildSceneV3(enm, 2));
    const b = JSON.stringify(buildSceneV3(enm, 2));
    expect(a).toBe(b);
  });
});
