/**
 * P0.8 nN (H_PLAN_IMPLEMENTACJI_NN §P0.8, seam A8 §9.2.1) — potok PEŁNY
 * ENM→scena dla rozdzielnicy nN z odpływami rzeczywistymi. Wzorzec
 * `buildScene.tr2wBezPola.test.ts`: fixtura REALNA (`openBranch.enm.json` —
 * stacja SN/nN pojedyncza, bez pól pomiarowych z dangling-stubem, żeby
 * geometria nN nie kolidowała z NIEZWIĄZANĄ funkcją innej fixtury), mutowana
 * DETERMINISTYCZNIE (dopisanie gałęzi nN — dokładnie kształt, jaki produkuje
 * `add_nn_switch_device`/`add_nn_cable_segment`, karta P0.1), bez zmyślania
 * kształtu danych.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import {
  allApparatusIdentifiersValid,
  allSceneGeometryOnGrid,
  buildSceneV3,
  noSceneSymbolOverlaps,
  noSymbolWireCollisions,
  type SceneLod,
  type SceneV3,
} from '../buildScene';
import { sceneSignature } from './syntheticNetworks';

const here = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): EnergyNetworkModel {
  const raw = JSON.parse(readFileSync(resolve(here, 'fixtures', name), 'utf8')) as {
    readonly enm: EnergyNetworkModel;
  };
  return raw.enm;
}

const clone = (enm: EnergyNetworkModel): EnergyNetworkModel =>
  JSON.parse(JSON.stringify(enm)) as EnergyNetworkModel;

function stationOf(enm: EnergyNetworkModel): Record<string, any> {
  const station = (enm.substations ?? []).find((s) => s.ref_id.includes('/station'));
  if (!station) throw new Error('fixtura bez stacji SN/nN');
  return station as unknown as Record<string, any>;
}

function nnBusRef(enm: EnergyNetworkModel): string {
  const station = stationOf(enm);
  const busRefs = new Set<string>(station.bus_refs ?? []);
  const bus = (enm.buses ?? []).find(
    (b) => busRefs.has(b.ref_id) && typeof b.voltage_kv === 'number' && b.voltage_kv <= 0.5,
  );
  if (!bus) throw new Error('fixtura bez szyny nN');
  return bus.ref_id;
}

/**
 * Dopisuje ROZDZIELNICĘ nN z ≥3 odpływami (różne aparaty, karta P0.8 §0.7
 * — dowód B-02) do szyny nN stacji fixtury: 1× MCB → odbiór, 1× rozłącznik
 * bezpiecznikowy → odbiór, 1× goły kabel (bez aparatu — przypadek oczekiwany)
 * → podrozdzielnica nN (liść `nnDistributionBoard` bez aparatu w torze —
 * geometria płytsza, unika kolizji z niezwiązaną geometrią SN sąsiedniego
 * pola tej fixtury), 1× aparat NIEROZPOZNANY (dane katalogowe niekompletne)
 * → pusty tor + komunikat błędu. Kształt gałęzi 1:1 z `add_nn_switch_device`/
 * `add_nn_cable_segment` (karta P0.1): `type` + `from_bus_ref`/`to_bus_ref` +
 * `catalog_namespace`/`materialized_params`.
 */
/** `ENMElement.id`/`ref_id` — pole DWUKROTNE, oba WYMAGANE (`types/enm.ts`
 *  `ENMElement`); wzorzec `id: id, ref_id: id` z istniejących fixture'ów
 *  testowych (`enmToSldAdapter.recovery.test.ts` helper `bus()`). */
function withId(ref: string, rest: Record<string, unknown>): Record<string, unknown> {
  return { id: ref, ref_id: ref, tags: [], meta: {}, ...rest };
}

function zOdplywamiNn(enm: EnergyNetworkModel): EnergyNetworkModel {
  const out = clone(enm);
  const busRef = nnBusRef(out);
  const buses = [...(out.buses ?? [])];
  const branches = [...(out.branches ?? [])];
  const loads = [...(out.loads ?? [])];
  const substations = [...(out.substations ?? [])];

  buses.push(
    withId('stn/test/nn/f1_bus', { name: 'Odpływ 1', voltage_kv: 0.4, phase_system: '3ph' }) as any,
    withId('stn/test/nn/f2_bus', { name: 'Odpływ 2', voltage_kv: 0.4, phase_system: '3ph' }) as any,
    withId('stn/test/nn/f3_bus', { name: 'Odpływ 3', voltage_kv: 0.4, phase_system: '3ph' }) as any,
    withId('stn/test/nn/f4_bus', { name: 'Odpływ 4', voltage_kv: 0.4, phase_system: '3ph' }) as any,
  );

  branches.push(
    // Odpływ 1: MCB → odbiór.
    withId('stn/test/nn/f1_mcb', {
      name: 'MCB odpływu 1', type: 'switch',
      from_bus_ref: busRef, to_bus_ref: 'stn/test/nn/f1_bus', status: 'closed',
      catalog_namespace: 'APARAT_NN_MCB',
      materialized_params: { curve_class: 'B', in_a: 16 },
    }) as any,
    // Odpływ 2: rozłącznik bezpiecznikowy → odbiór.
    withId('stn/test/nn/f2_fuse', {
      name: 'Rozłącznik bezp. odpływu 2', type: 'fuse',
      from_bus_ref: busRef, to_bus_ref: 'stn/test/nn/f2_bus', status: 'closed',
      materialized_params: { fuse_class: 'gG', size: 'NH00' },
    }) as any,
    // Odpływ 3: goły kabel (BEZ aparatu — przypadek oczekiwany) → podrozdzielnica
    // nN (liść `nnDistributionBoard` BEZ aparatu w torze — geometria płytsza,
    // wzorzec DER-row: kolumna niesie WYŁĄCZNIE tyle wysokości, ile faktycznie
    // rysuje, karta P0.8 §0 pkt 4 „żadnych reguł pozycyjnych zamiast elektrycznych").
    withId('stn/test/nn/f3_cable', {
      name: 'Kabel odpływu 3', type: 'cable',
      from_bus_ref: busRef, to_bus_ref: 'stn/test/nn/f3_bus', status: 'closed',
      length_km: 0.05, r_ohm_per_km: 0.5, x_ohm_per_km: 0.08,
    }) as any,
    // Odpływ 4: aparat NIEROZPOZNANY (dane katalogowe niekompletne) — pusty
    // tor + komunikat błędu, NIE wyłącznik domyślny (karta P0.8 §0.2).
    withId('stn/test/nn/f4_unresolved', {
      name: 'Aparat odpływu 4', type: 'switch',
      from_bus_ref: busRef, to_bus_ref: 'stn/test/nn/f4_bus', status: 'closed',
      materialized_params: {},
    }) as any,
  );

  loads.push(
    withId('stn/test/nn/f1_load', { name: 'Odbiór 1', bus_ref: 'stn/test/nn/f1_bus', p_mw: 0.01, q_mvar: 0.003, model: 'pq' }) as any,
    withId('stn/test/nn/f2_load', { name: 'Odbiór 2', bus_ref: 'stn/test/nn/f2_bus', p_mw: 0.007, q_mvar: 0.002, model: 'pq' }) as any,
    withId('stn/test/nn/f4_load', { name: 'Odbiór 4', bus_ref: 'stn/test/nn/f4_bus', p_mw: 0.006, q_mvar: 0.001, model: 'pq' }) as any,
  );

  substations.push(
    withId('stn/test/nn/rgnn2', {
      name: 'RGnN-2 (podrozdzielnica)', station_type: 'rozdzielnica_nn',
      bus_refs: ['stn/test/nn/f3_bus'], transformer_refs: [],
    }) as any,
  );

  (out as any).buses = buses;
  (out as any).branches = branches;
  (out as any).loads = loads;
  (out as any).substations = substations;
  return out;
}

const enmZOdplywami = zOdplywamiNn(loadFixture('openBranch.enm.json'));
const enmBazowy = loadFixture('openBranch.enm.json');

const nnFeederSymbols = (scene: SceneV3): SceneV3['symbols'] =>
  scene.symbols.filter((s) => s.symbolId === 'nnBreaker' || s.symbolId === 'nnFuseSwitch' || s.symbolId === 'nnDistributionBoard');

describe('P0.8 nN — buildSceneV3: rozdzielnica nN z ≥3 odpływami (aparaty różne, dowód B-02)', () => {
  for (const lod of [1, 2] as SceneLod[]) {
    it(`L${lod}: cztery odpływy — MCB, rozłącznik bezp., goły kabel→podrozdzielnica, aparat nierozpoznany`, () => {
      const scene = buildSceneV3(enmZOdplywami, lod);
      expect(scene.symbols.some((s) => s.symbolId === 'nnBreaker' && s.meta?.ownerRef === 'stn/test/nn/f1_mcb')).toBe(true);
      expect(scene.symbols.some((s) => s.symbolId === 'nnFuseSwitch' && s.meta?.ownerRef === 'stn/test/nn/f2_fuse')).toBe(true);
      expect(scene.symbols.some((s) => s.symbolId === 'nnDistributionBoard' && s.meta?.ownerRef === 'stn/test/nn/rgnn2')).toBe(true);
      // Goły kabel: ZERO symbolu aparatu dla ten odpływ (branch f3_cable nie
      // jest ownerRef żadnego nnBreaker/nnFuseSwitch).
      expect(nnFeederSymbols(scene).some((s) => s.meta?.ownerRef === 'stn/test/nn/f3_cable')).toBe(false);
      // Aparat nierozpoznany: TEŻ zero symbolu (nie podstawiony wyłącznik).
      expect(nnFeederSymbols(scene).some((s) => s.meta?.ownerRef === 'stn/test/nn/f4_unresolved')).toBe(false);
      // ALE tor (segment) każdego z czterech odpływów jest widoczny.
      for (const ref of ['stn/test/nn/f1_mcb', 'stn/test/nn/f2_fuse', 'stn/test/nn/f3_cable', 'stn/test/nn/f4_unresolved']) {
        expect(scene.segments.some((s) => s.meta?.ownerRef === ref)).toBe(true);
      }
      // Komunikat błędu odpływu 4 w stopNotes (WHITE BOX, widoczny w audycie).
      expect(scene.meta.stopNotes.some((n) => n.includes('stn/test/nn/f4_unresolved') && n.includes('katalog'))).toBe(true);
    });

    it(`L${lod}: wyrocznie geometrii ZIELONE (siatka, zero nachodzeń, zero kolizji tor↔symbol)`, () => {
      const scene = buildSceneV3(enmZOdplywami, lod);
      expect(allSceneGeometryOnGrid(scene)).toBe(true);
      expect(noSceneSymbolOverlaps(scene)).toBe(true);
      expect(noSymbolWireCollisions(scene)).toBe(true);
      // `allApparatusIdentifiersValid` sprawdzana WYŁĄCZNIE na L2 (wzorzec
      // `buildScene.tr2wBezPola.test.ts:370` — etykiety identyfikatora Q/QE/T
      // to szczegół L2, nieobecny z konstrukcji na L1, `includeCableAndPorts`).
      if (lod === 2) expect(allApparatusIdentifiersValid(scene)).toBe(true);
    });
  }

  it('klik na aparat odpływu → ownerRef = REALNY ref ENM (karta P0.8 §0.2 „klik otwiera rekord")', () => {
    const scene = buildSceneV3(enmZOdplywami, 2);
    const mcb = scene.symbols.find((s) => s.symbolId === 'nnBreaker');
    expect(mcb?.meta?.ownerRef).toBe('stn/test/nn/f1_mcb');
    const board = scene.symbols.find((s) => s.symbolId === 'nnDistributionBoard');
    expect(board?.meta?.ownerRef).toBe('stn/test/nn/rgnn2');
  });

  it('determinizm SHA: dwa biegi identycznego wejścia dają identyczny odcisk sceny', () => {
    const shaOf = (scene: SceneV3): string =>
      createHash('sha256').update(sceneSignature(scene)).digest('hex');
    const a = shaOf(buildSceneV3(enmZOdplywami, 2));
    const b = shaOf(buildSceneV3(clone(enmZOdplywami), 2));
    expect(a).toBe(b);
    // Pełny podpis JSON też identyczny (silniejszy dowód niż sam sceneSignature).
    expect(JSON.stringify(buildSceneV3(enmZOdplywami, 2))).toBe(
      JSON.stringify(buildSceneV3(clone(enmZOdplywami), 2)),
    );
  });
});

describe('P0.8 nN — substrat: stacja BEZ odpływów strukturalnych (fixtura BAZOWA, sprzed karty)', () => {
  it('ZERO symboli nN P0.8 na fixturze bazowej (brak gałęzi nN — dana niedostarczona)', () => {
    const scene = buildSceneV3(enmBazowy, 2);
    expect(nnFeederSymbols(scene)).toHaveLength(0);
  });

  it('podpis sceny fixtury BAZOWEJ (SHA) — kotwica regresji: MUSI pozostać identyczny między biegami', () => {
    const shaOf = (scene: SceneV3): string =>
      createHash('sha256').update(JSON.stringify(scene)).digest('hex');
    const a = shaOf(buildSceneV3(enmBazowy, 2));
    const b = shaOf(buildSceneV3(clone(enmBazowy), 2));
    expect(a).toBe(b);
  });
});
