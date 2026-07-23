/**
 * SCHEMAT-10 S7-P4 (V12K-137) — WYMAGANIA P0 recenzji właściciela (§9 GAP-doc
 * `docs/sld/S7_GAP_CROSSING_ZERO_2026-07.md`). S6/S7 NIEODEBRANE do ich spełnienia.
 *
 *  P0 pkt 1 — ŚWIATŁO GÓRNEGO PASA BBOX-DO-BBOX: odstęp = prawy bbox CAŁEGO
 *  pola N (z opisami+aparaturą) → lewy bbox pola N+1 ≥ TOP_LEVEL_FIELD_CLEARANCE.
 *  Wyrocznia `topBandFieldClearances` mierzy REALNE obrysy pól (nie kotwice),
 *  na WIELU klasach topologii (WYTYCZNE §12). Stała podniesiona 3×GRID→4×GRID
 *  (+33,3%, widełki §5), wyprowadzona OGÓLNIE (najmniejszy `k×GRID` w paśmie).
 *
 * Pozostałe punkty P0 (audyt pionów, czytelność L0) — kolejne podetapy S7-P4.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import {
  buildSceneV3,
  topBandFieldClearances,
  topBandClearanceViolations,
  allTopBandFieldsClearance,
  type SceneLod,
} from '../buildScene';
import { TOP_LEVEL_FIELD_CLEARANCE } from '../../layout/clearances';
import { GRID } from '../../core/grid';

const here = dirname(fileURLToPath(import.meta.url));
const bigFixturePath = resolve(here, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json');
const smallFixtureDir = resolve(here, 'fixtures');

function loadEnm(path: string): EnergyNetworkModel {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { readonly enm?: EnergyNetworkModel };
  return parsed.enm ?? (parsed as unknown as EnergyNetworkModel);
}

const FIXTURES: ReadonlyArray<{ readonly klasa: string; readonly nazwa: string; readonly enm: EnergyNetworkModel }> = [
  { klasa: 'A (radialna prosta)', nazwa: 'openTerminal', enm: loadEnm(resolve(smallFixtureDir, 'openTerminal.enm.json')) },
  { klasa: 'A (ciąg radialny)', nazwa: 'openTrunkChain', enm: loadEnm(resolve(smallFixtureDir, 'openTrunkChain.enm.json')) },
  { klasa: 'B (z odgałęzieniem)', nazwa: 'openBranch', enm: loadEnm(resolve(smallFixtureDir, 'openBranch.enm.json')) },
  { klasa: 'C (GPZ + feeder)', nazwa: 'gpzFeeder', enm: loadEnm(resolve(smallFixtureDir, 'gpzFeeder.enm.json')) },
  { klasa: 'E (wieloźródłowa, 53 stacje)', nazwa: 'sldSubstrate52s', enm: loadEnm(bigFixturePath) },
];

const LODS: readonly SceneLod[] = [0, 1, 2];

describe('SCHEMAT-10 S7 etap 4 §9 P0 pkt 1 — światło górnego pasa bbox-do-bbox', () => {
  it('TOP_LEVEL_FIELD_CLEARANCE = 4×GRID (+33,3% od 3×GRID, widełki §5 „+20–35%")', () => {
    expect(TOP_LEVEL_FIELD_CLEARANCE).toBe(4 * GRID);
    // Wyprowadzenie OGÓLNE: najmniejszy k×GRID w paśmie +20–35% od 3×GRID.
    const base = 3 * GRID;
    expect(TOP_LEVEL_FIELD_CLEARANCE).toBeGreaterThanOrEqual(base * 1.2);
    expect(TOP_LEVEL_FIELD_CLEARANCE).toBeLessThanOrEqual(base * 1.35);
    expect(TOP_LEVEL_FIELD_CLEARANCE % GRID).toBe(0);
  });

  for (const fx of FIXTURES) {
    for (const lod of LODS) {
      it(`${fx.nazwa} LOD${lod}: każde światło pasa górnego bbox-do-bbox ≥ kontrakt (opisy+aparatura, nie kotwice)`, () => {
        const scene = buildSceneV3(fx.enm, lod);
        const gaps = topBandFieldClearances(scene);
        // Miara jest na REALNYCH obrysach: gdy pas górny ma ≥2 pola, mamy ≥1 światło.
        for (const g of gaps) {
          expect(
            g.gap,
            `światło ${g.leftStationId} → ${g.rightStationId} = ${g.gap} < ${TOP_LEVEL_FIELD_CLEARANCE}`,
          ).toBeGreaterThanOrEqual(TOP_LEVEL_FIELD_CLEARANCE);
        }
        expect(allTopBandFieldsClearance(scene)).toBe(true);
        expect(topBandClearanceViolations(scene)).toHaveLength(0);
      });
    }
  }

  it('sldSubstrate52s: pas górny ma wiele pól i ≥1 zmierzone światło (dowód, że miara nie jest pusta)', () => {
    const scene = buildSceneV3(FIXTURES[FIXTURES.length - 1].enm, 2);
    expect(scene.meta.mainTrunkStationIds.length).toBeGreaterThan(1);
    expect(topBandFieldClearances(scene).length).toBeGreaterThan(0);
  });

  it('wyrocznia GRYZIE: próg > największego zmierzonego światła daje naruszenie (nie martwa)', () => {
    const scene = buildSceneV3(FIXTURES[FIXTURES.length - 1].enm, 2);
    const gaps = topBandFieldClearances(scene).map((g) => g.gap);
    const maxGap = Math.max(...gaps);
    expect(topBandClearanceViolations(scene, maxGap + 1).length).toBeGreaterThan(0);
    expect(allTopBandFieldsClearance(scene, maxGap + 1)).toBe(false);
  });

  it('miara jest bbox-do-bbox (nie kotwic): światło = 32 px = 4×GRID na fixturze referencyjnej, wszystkie LOD', () => {
    // Podniesienie 24→32 jest WIDOCZNE w mierze realnych obrysów pól — dowód, że
    // stała steruje pasem górnym i miara nie odczytuje kotwic (stały krok).
    for (const lod of LODS) {
      const scene = buildSceneV3(FIXTURES[FIXTURES.length - 1].enm, lod);
      const gaps = topBandFieldClearances(scene).map((g) => g.gap);
      expect(Math.min(...gaps)).toBe(4 * GRID);
    }
  });

  it('światło rośnie ze stałą (nie phantom): większy kontrakt-próg wykrywa mniejsze realne światło', () => {
    // Dowód reużywalny: przy progu 3×GRID (stara wartość) fixtura MUSI mieć zero
    // naruszeń (32 ≥ 24), a przy progu 5×GRID (40) MUSI mieć naruszenia (32 < 40)
    // — miara reaguje na realne obrysy, nie zwraca stałej.
    const scene = buildSceneV3(FIXTURES[FIXTURES.length - 1].enm, 2);
    expect(allTopBandFieldsClearance(scene, 3 * GRID)).toBe(true);
    expect(allTopBandFieldsClearance(scene, 5 * GRID)).toBe(false);
  });
});
