/**
 * SCHEMAT-10 S6 (V12K-137) — testy KOMPLETU 18 metryk layoutu
 * (`layoutMetricsReport` i składowe), WARUNKI_ODBIORU_S6 §3/§6/§11.
 *
 * Zakres:
 *  A. Poprawność metryk na syntetycznych, ręcznie policzalnych scenach
 *     (piony/poziomy/załamania/nieortogonalność/światło).
 *  B. §11(c) idempotencja: dwa biegi na fixturze referencyjnej ⇒ IDENTYCZNY
 *     komplet metryk (determinizm P7 rozszerzony na warstwę pomiarową).
 *  C. §3 twarde metryki jakości na fixturze referencyjnej: 0 kolizji etykiet,
 *     0 przecięć poddrzew (M-02), 0 odcinków nie-ortogonalnych, 0
 *     niejednoznacznych połączeń — dowód, że baza jest „czysta" i regresja
 *     tych liczb (przyszła kompaktyzacja S7) będzie wykryta.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import type { SceneV3 } from '../buildScene';
import {
  buildSceneV3,
  layoutMetricsReport,
  totalHorizontalSegmentLength,
  totalVerticalSegmentLength,
  orthogonalBendCount,
  nonOrthogonalSegmentCount,
  minimumClearance,
} from '../buildScene';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here,
  '..',
  '..',
  '..',
  'v2',
  'geometry',
  '__tests__',
  'fixtures',
  'sldSubstrate52s.enm.json',
);
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

/** Minimalna scena testowa — tylko pola używane przez metryki. */
function makeScene(partial: {
  symbols?: SceneV3['symbols'];
  segments?: SceneV3['segments'];
  crossings?: SceneV3['crossings'];
  bbox?: SceneV3['bbox'];
}): SceneV3 {
  return {
    symbols: partial.symbols ?? [],
    segments: partial.segments ?? [],
    labels: [],
    junctions: [],
    crossings: partial.crossings ?? [],
    bbox: partial.bbox ?? { x: 0, y: 0, width: 0, height: 0 },
    meta: {
      lod: 2,
      stationCount: 0,
      gpzId: null,
      parityKeys: [],
      missingData: [],
      sections: [],
      transformers: [],
      mainTrunkStationIds: [],
      lateralRunIds: [],
      stopNotes: [],
      sources: [],
      gpzZone: null,
    },
  } as SceneV3;
}

describe('S6 — poprawność metryk funkcji kosztu (§3)', () => {
  it('piony i poziomy z prostokątnej polilinii L-kształtnej', () => {
    // (0,0)→(0,100) pion 100; (0,100)→(80,100) poziom 80.
    const scene = makeScene({
      segments: [
        {
          points: [
            { x: 0, y: 0 },
            { x: 0, y: 100 },
            { x: 80, y: 100 },
          ],
          meta: { kind: 'sn', elementKind: 'segment' },
        },
      ],
    });
    expect(totalVerticalSegmentLength(scene)).toBe(100);
    expect(totalHorizontalSegmentLength(scene)).toBe(80);
    // Jedno załamanie (pion→poziom) w wierzchołku środkowym.
    expect(orthogonalBendCount(scene)).toBe(1);
    expect(nonOrthogonalSegmentCount(scene)).toBe(0);
  });

  it('wierzchołek współliniowy NIE jest załamaniem', () => {
    const scene = makeScene({
      segments: [
        {
          points: [
            { x: 0, y: 0 },
            { x: 0, y: 50 },
            { x: 0, y: 100 },
          ],
          meta: { kind: 'sn', elementKind: 'segment' },
        },
      ],
    });
    expect(orthogonalBendCount(scene)).toBe(0);
    expect(totalVerticalSegmentLength(scene)).toBe(100);
  });

  it('pododcinek ukośny liczony jako nie-ortogonalny', () => {
    const scene = makeScene({
      segments: [
        {
          points: [
            { x: 0, y: 0 },
            { x: 40, y: 40 },
          ],
          meta: { kind: 'sn', elementKind: 'segment' },
        },
      ],
    });
    expect(nonOrthogonalSegmentCount(scene)).toBe(1);
    // Ukośny nie jest ani pionem, ani poziomem — nie wchodzi do długości.
    expect(totalVerticalSegmentLength(scene)).toBe(0);
    expect(totalHorizontalSegmentLength(scene)).toBe(0);
  });

  it('minimumClearance = L∞-odstęp między najbliższymi gabarytami symboli', () => {
    // noPoint 16×16 (SYMBOL_DEFS.noPoint) w (0,0) i (40,0): odstęp poziomy 40-16=24.
    const scene = makeScene({
      symbols: [
        { symbolId: 'noPoint', x: 0, y: 0, meta: { elementKind: 'apparatus' } },
        { symbolId: 'noPoint', x: 40, y: 0, meta: { elementKind: 'apparatus' } },
      ],
    });
    expect(minimumClearance(scene)).toBe(24);
  });
});

describe('S6 — §11(c) idempotencja kompletu metryk na fixturze referencyjnej', () => {
  for (const lod of [0, 1, 2] as const) {
    it(`LOD ${lod}: dwa biegi ⇒ identyczny raport metryk`, () => {
      const a = layoutMetricsReport(buildSceneV3(enm, lod));
      const b = layoutMetricsReport(buildSceneV3(enm, lod));
      expect(a).toEqual(b);
    });
  }
});

describe('S6 — §3 twarde metryki jakości na fixturze referencyjnej = 0 (baza czysta)', () => {
  for (const lod of [0, 1, 2] as const) {
    it(`LOD ${lod}: 0 kolizji etykiet / 0 przecięć poddrzew / 0 nie-ortogonalnych / 0 niejednoznacznych`, () => {
      const m = layoutMetricsReport(buildSceneV3(enm, lod));
      expect(m.labelCollisionCount).toBe(0);
      expect(m.subtreeIntersectionCount).toBe(0);
      expect(m.nonOrthogonalSegmentCount).toBe(0);
      expect(m.ambiguousConnectionCount).toBe(0);
      // Światło ≥ kontraktowe minimum (GRID = 8 px) — brak sklejeń gabarytów.
      expect(m.minimumClearance).toBeGreaterThanOrEqual(8);
    });
  }
});
