/**
 * SCHEMAT-10 S7-P1 (V12K-137, GAP `S7_GAP_CROSSING_ZERO` §S7-P1) — testy
 * pakowania interwałowego Rodziny B (kompaktyzacja pionowa + piony
 * proporcjonalne), WARUNKI_ODBIORU_S6 §11.
 *
 * Zakres (wymagany kartą S7-P1):
 *  (a) LOKALNOŚĆ (§11a): zmiana footprintu JEDNEJ gałęzi lateralnej (długi
 *      opis PL na stacji lateralu) NIE przesuwa kotwic ciągu głównego ani
 *      gałęzi PŁYTSZYCH (pakowanie sekwencyjne w dół — pas wyżej niezależny od
 *      zmiany niżej). Raport liczby zmienionych kotwic ciągu głównego = 0.
 *  (c) IDEMPOTENCJA (§11c): dwa biegi ⇒ identyczne kotwice lateralów
 *      (determinizm packera, P7).
 *  (e) DŁUGIE OPISY PL (§11e): stacja z długą nazwą z polskimi znakami NIE
 *      wprowadza kolizji etykiet/przecięć poddrzew (footprint uwzględnia budżet
 *      etykiety PRZED pakowaniem).
 *  (g) PIONY PROPORCJONALNE (§11g, WARUNKI_ODBIORU_S6 §2): piony zejść
 *      lateralnych NIE są wyrównane do wspólnej rzędnej — mają RÓŻNE długości
 *      wynikające z pozycji pasa (footprint-driven), nie z globalnego
 *      wyrównania do najdłuższego.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3, layoutMetricsReport, type SceneV3 } from '../buildScene';

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

/** Hash stacji z ref_id (`stn/<hash>/station` → `<hash>`) — jak w
 *  `sld_v3_acceptance.mjs`/`buildScene.test.ts` sekcja E. */
function stationHash(stationId: string): string {
  const parts = stationId.split('/');
  return parts[1] ?? stationId;
}

/** Kotwice (posortowane x,y symboli) stacji o danym ref_id — do porównania
 *  między scenami (lokalność/idempotencja). */
function stationAnchors(scene: SceneV3, stationId: string): string {
  const hash = stationHash(stationId);
  return scene.symbols
    .filter((s) => typeof s.meta?.testId === 'string' && s.meta.testId.includes(hash))
    .map((s) => `${s.x},${s.y}`)
    .sort()
    .join('|');
}

/** Długości PIONOWYCH odcinków zejść lateralnych (`…/branch_segment_L`) — to
 *  są piony grzebienia (v=branch_segment_L w interiorCrossings). */
function lateralDescentLengths(scene: SceneV3): number[] {
  const lengths: number[] = [];
  for (const seg of scene.segments) {
    if (!(seg.meta?.ownerRef ?? '').includes('branch_segment_L')) continue;
    for (let i = 0; i + 1 < seg.points.length; i++) {
      const a = seg.points[i];
      const b = seg.points[i + 1];
      if (a.x === b.x && a.y !== b.y) lengths.push(Math.abs(b.y - a.y));
    }
  }
  return lengths;
}

/** Kopia ENM z podmienioną nazwą JEDNEJ stacji lateralu (poza ciągiem
 *  głównym) na długi opis z polskimi znakami — mutacja NIE-topologiczna
 *  (zmienia wyłącznie footprint etykiety). */
function withLongPolishName(model: EnergyNetworkModel, targetRef: string): EnergyNetworkModel {
  const longName = 'Stacja Rozdzielcza Napowietrzno-Kablowa „Żółć Gęślą Jaźń" — Odgałęzienie Wschód';
  return {
    ...model,
    substations: model.substations.map((s) =>
      s.ref_id === targetRef ? { ...s, name: longName } : s,
    ),
  } as EnergyNetworkModel;
}

describe('SCHEMAT-10 S7 etap 1 — pakowanie interwałowe Rodziny B (§11 a/c/e/g)', () => {
  it('(§11c) idempotencja: dwa biegi ⇒ identyczne kotwice ciągu głównego i lateralów', () => {
    for (const lod of [0, 1, 2] as const) {
      const a = buildSceneV3(enm, lod);
      const b = buildSceneV3(enm, lod);
      const anchorsA = a.symbols.map((s) => `${s.symbolId}:${s.x},${s.y}`).sort().join('|');
      const anchorsB = b.symbols.map((s) => `${s.symbolId}:${s.x},${s.y}`).sort().join('|');
      expect(anchorsA).toBe(anchorsB);
    }
  });

  it('(§11a) lokalność: długi opis PL na stacji lateralu NIE przesuwa kotwic ciągu głównego', () => {
    const lod = 2;
    const base = buildSceneV3(enm, lod);
    const trunkIds = base.meta.mainTrunkStationIds;
    expect(trunkIds.length).toBeGreaterThan(0);

    // Cel mutacji: stacja SPOZA ciągu głównego (gałąź lateralna).
    const trunkSet = new Set(trunkIds);
    const lateralStation = enm.substations.find(
      (s) => s.station_type !== 'gpz' && !trunkSet.has(s.ref_id),
    );
    expect(lateralStation).toBeDefined();

    const mutated = buildSceneV3(withLongPolishName(enm, lateralStation!.ref_id), lod);

    // Kotwice KAŻDEJ stacji ciągu głównego niezmienione (ciąg główny leży NAD
    // wszystkimi lateralami — pakowanie w dół nie może go poruszyć).
    let changedTrunk = 0;
    for (const id of trunkIds) {
      if (stationAnchors(base, id) !== stationAnchors(mutated, id)) changedTrunk += 1;
    }
    expect(changedTrunk).toBe(0); // raport liczby zmienionych kotwic ciągu głównego
  });

  it('(§11e) długie opisy PL: stacja z długą nazwą PL nie wprowadza kolizji ani przecięć poddrzew', () => {
    const trunkSet = new Set(buildSceneV3(enm, 2).meta.mainTrunkStationIds);
    const lateralStation = enm.substations.find(
      (s) => s.station_type !== 'gpz' && !trunkSet.has(s.ref_id),
    );
    for (const lod of [0, 1, 2] as const) {
      const m = layoutMetricsReport(buildSceneV3(withLongPolishName(enm, lateralStation!.ref_id), lod));
      expect(m.labelCollisionCount).toBe(0);
      expect(m.subtreeIntersectionCount).toBe(0);
      expect(m.nonOrthogonalSegmentCount).toBe(0);
      expect(m.ambiguousConnectionCount).toBe(0);
    }
  });

  it('(§11g) piony proporcjonalne: zejścia lateralne mają RÓŻNE długości (brak wspólnej rzędnej)', () => {
    for (const lod of [1, 2] as const) {
      const scene = buildSceneV3(enm, lod);
      const lengths = lateralDescentLengths(scene);
      expect(lengths.length).toBeGreaterThan(1);
      const distinct = new Set(lengths);
      // Gdyby piony były wyrównane do wspólnej rzędnej, wszystkie byłyby równe.
      expect(distinct.size).toBeGreaterThan(1);
      // Najkrótszy pion istotnie krótszy od najdłuższego (proporcjonalność do
      // pozycji pasa, nie globalne wyrównanie do najdłuższego).
      expect(Math.min(...lengths)).toBeLessThan(Math.max(...lengths));
    }
  });
});
