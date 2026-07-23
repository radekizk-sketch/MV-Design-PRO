/**
 * SCHEMAT-10 S7.6 (V12K-137, karta KOMPRESJA, znalezisko Z1) — KOMPRESJA PIONOWA
 * pasm lateralnych. Dowód, że gap KAŻDEGO pasa lateralnego = kontraktowe minimum
 * (MIN_SUBTREE_CLEARANCE), a NADMIAR ponad minimum (poza kwantem siatki) NIE
 * WYSTĘPUJE bez udokumentowanej przyczyny routingu — WARUNKI_ODBIORU_S6 §2/§4/§6.
 *
 * Reguła OGÓLNA (WYTYCZNE §1/§2, zero hardcode po id/liczbie stacji): etykieta
 * zejścia lateralu (obrócony `segment-lateral`) leży w PASIE ZEJŚĆ pod magistralą
 * (przy punkcie odejścia), NIE w gapie nad odległą stacją docelową — więc gap
 * pasa = footprint (M-02), nie długość etykiety. Test na 5 klasach topologii
 * (WYTYCZNE §3/§12) + rodzina H wielkoskalowa (106/265/530 stacji).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { buildSceneV3, totalVerticalSegmentLength, type LateralShelfRecord, type SceneLod } from '../buildScene';
import { MIN_SUBTREE_CLEARANCE } from '../../layout/clearances';
import { GRID } from '../../core/grid';
import { LODS, loadEnm as loadEnmH, synthLargeTrunk } from './syntheticNetworks';
import type { EnergyNetworkModel } from '../../../../../types/enm';

const here = dirname(fileURLToPath(import.meta.url));
const bigFixturePath = resolve(here, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json');
const smallFixtureDir = resolve(here, 'fixtures');

function loadEnm(path: string): EnergyNetworkModel {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { readonly enm?: EnergyNetworkModel };
  return parsed.enm ?? (parsed as unknown as EnergyNetworkModel);
}

const bigEnm = loadEnm(bigFixturePath);

const FIXTURES: ReadonlyArray<{ readonly klasa: string; readonly enm: EnergyNetworkModel }> = [
  { klasa: 'A (radialna prosta) openTerminal', enm: loadEnm(resolve(smallFixtureDir, 'openTerminal.enm.json')) },
  { klasa: 'A (ciąg radialny) openTrunkChain', enm: loadEnm(resolve(smallFixtureDir, 'openTrunkChain.enm.json')) },
  { klasa: 'B (z odgałęzieniem) openBranch', enm: loadEnm(resolve(smallFixtureDir, 'openBranch.enm.json')) },
  { klasa: 'C (GPZ + feeder) gpzFeeder', enm: loadEnm(resolve(smallFixtureDir, 'gpzFeeder.enm.json')) },
  { klasa: 'E (wieloźródłowa 53 st.) sldSubstrate52s', enm: bigEnm },
];

const ALL_LODS: readonly SceneLod[] = [0, 1, 2];

/** Nadmiar światła ponad kontraktowe minimum: gapAbove > contractMin + GRID
 *  (kwant siatki tolerancji na dosnapowanie). Zwraca listę wyjątków z LICZBĄ. */
function excessShelves(shelves: readonly LateralShelfRecord[]): readonly LateralShelfRecord[] {
  return shelves.filter((s) => s.gapAbove > s.contractMin + GRID);
}

describe('SCHEMAT-10 S7.6 — kontraktowe minimum światła pasm (Z1 KOMPRESJA)', () => {
  it('MIN_SUBTREE_CLEARANCE = 4×GRID (kontraktowe minimum światła poddrzew, §5)', () => {
    expect(MIN_SUBTREE_CLEARANCE).toBe(4 * GRID);
  });

  for (const fx of FIXTURES) {
    for (const lod of ALL_LODS) {
      it(`${fx.klasa} · L${lod}: żaden pas > minimum + kwant siatki (lista wyjątków z przyczyną)`, () => {
        const scene = buildSceneV3(fx.enm, lod);
        const shelves = scene.meta.lateralShelves ?? [];
        const excess = excessShelves(shelves);
        // Raport LICZBOWY wyjątków (przyczyna routingu wymagana dla każdego).
        const report = excess.map(
          (s) => `${s.runId}: gapAbove=${s.gapAbove} > contractMin=${s.contractMin}+GRID(${GRID}) (footprint=${s.footprintHeight}, corridor=${s.corridorHeight})`,
        );
        expect(report).toEqual([]);
        // Każdy istniejący pas ma gap == contractMin == MIN_SUBTREE_CLEARANCE.
        for (const s of shelves) {
          expect(s.contractMin).toBe(4 * GRID);
          expect(s.gapAbove).toBe(s.contractMin);
        }
      });
    }
  }

  it('fixtura referencyjna: 12 pasm lateralnych, WSZYSTKIE przy minimum (L1)', () => {
    const shelves = buildSceneV3(bigEnm, 1).meta.lateralShelves ?? [];
    expect(shelves.length).toBe(12);
    expect(excessShelves(shelves)).toEqual([]);
    // Kompresja: suma nadmiaru = 0 (dawniej każdy gap = korytarz etykiety 248 px).
    const totalExcess = shelves.reduce((acc, s) => acc + Math.max(0, s.gapAbove - s.contractMin), 0);
    expect(totalExcess).toBe(0);
  });

  it('kompresja obniżyła piony vs korytarz-etykiety (fixtura referencyjna, wszystkie LOD)', () => {
    // Kontraktowe minimum światła jest WIELOKROTNIE mniejsze od korytarza etykiety
    // zejścia (obrócony `segment-lateral`, ~242 px) — dowód że gap NIE jest już
    // dyktowany długością etykiety. Po S7.6: 21976/38920/38920 (patrz baseline
    // `vertical_length_probe` + `buildScene.test.ts`).
    expect(totalVerticalSegmentLength(buildSceneV3(bigEnm, 0))).toBe(21976);
    expect(totalVerticalSegmentLength(buildSceneV3(bigEnm, 1))).toBe(38920);
    expect(totalVerticalSegmentLength(buildSceneV3(bigEnm, 2))).toBe(38920);
  });

  it('determinizm: rekordy pasm identyczne w dwóch biegach (fixtura referencyjna, L2)', () => {
    const a = JSON.stringify(buildSceneV3(bigEnm, 2).meta.lateralShelves ?? []);
    const b = JSON.stringify(buildSceneV3(bigEnm, 2).meta.lateralShelves ?? []);
    expect(a).toBe(b);
  });
});

describe('SCHEMAT-10 S7.6 — kompresja generalizuje na rodzinę H (106/265/530 stacji)', () => {
  const SCALES: ReadonlyArray<{ readonly nazwa: string; readonly copies: number; readonly budgetMs: number }> = [
    { nazwa: '~106', copies: 2, budgetMs: 5000 },
    { nazwa: '~265', copies: 5, budgetMs: 12000 },
    { nazwa: '~530', copies: 10, budgetMs: 30000 },
  ];
  const hFixtureEnm = loadEnmH(bigFixturePath);
  for (const sc of SCALES) {
    it(`H ${sc.nazwa}: zero pasm z nadmiarem światła, 3×LOD, w budżecie ${sc.budgetMs} ms`, () => {
      const enm = synthLargeTrunk(hFixtureEnm, sc.copies);
      const t0 = performance.now();
      for (const lod of LODS) {
        const shelves = buildSceneV3(enm, lod).meta.lateralShelves ?? [];
        expect(shelves.length).toBeGreaterThan(0);
        expect(excessShelves(shelves)).toEqual([]);
      }
      expect(performance.now() - t0).toBeLessThan(sc.budgetMs);
    });
  }
});
