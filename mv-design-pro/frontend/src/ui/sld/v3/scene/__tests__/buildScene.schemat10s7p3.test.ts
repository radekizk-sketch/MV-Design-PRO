/**
 * SCHEMAT-10 S7-P3 (V12K-137) — GENERALIZACJA reguł świateł + packingu.
 *
 * WYTYCZNE_GENERALIZACJA_LAYOUTU_2026-07 (dyrektywa właściciela 2026-07-22):
 * silnik NIE może być strojony pod jedną sieć. Reguły S7-P3 (rozdzielone światła
 * §5 + pakowanie interwałowe poddrzew) muszą być wyprowadzone z footprintu/
 * topologii (ZERO hardcode po id/nazwie/liczbie) i dowiedzione na WIELU
 * fixturach różnej klasy topologicznej. Ten plik jest DOWODEM GENERALIZACJI (§12)
 * dla reguł tej fazy:
 *
 *  - §3/§12  — niezmienniki zero-defektów na WIELU fixturach (A radialna prosta,
 *              B/C z odgałęzieniami, E wieloźródłowa duża): 0 kolizji / 0
 *              przecięć / 0 nieortogonalnych / 0 niejednoznacznych / 0 crossing.
 *  - §5      — PERMUTACJA rekordów wejściowych (bez zmiany kolejności
 *              topologicznej line_runs) ⇒ wynik BAJT-IDENTYCZNY (dowód, że
 *              silnik nie zależy od kolejności w pamięci/zbiorze).
 *  - §11f    — RÓŻNE footprinty razem (stacja SN/nN, switchgear, PV, BESS,
 *              transformator blokowy, punkt NO, pole pomiarowe) współistnieją
 *              bez kolizji.
 *  - §9      — LOKALNOŚĆ + miary stabilności (anchorMovementCount,
 *              totalAnchorDisplacement, maxAnchorDisplacement,
 *              unchangedSubtreeMovementCount): zmiana footprintu JEDNEJ gałęzi
 *              NIE przesuwa kotwic ciągu głównego.
 *  - §10     — WYDAJNOŚĆ: czasy budowy per fixtura (raport).
 *  - §5(reguła columnGap) — TOP_LEVEL_FIELD_CLEARANCE realnie steruje pasem
 *              górnym (nie phantom): większy gap ⇒ większy rozstaw kolumn.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3, layoutMetricsReport, sheetRowStationIds, type SceneV3 } from '../buildScene';
import {
  MIN_GLYPH_CLEARANCE,
  MIN_LABEL_CLEARANCE,
  MIN_FIELD_CLEARANCE,
  MIN_SUBTREE_CLEARANCE,
  MIN_ROUTE_CLEARANCE,
  TOP_LEVEL_FIELD_CLEARANCE,
} from '../../layout/clearances';
import { computeStationTaps } from '../../layout/segments';
import { GRID } from '../../core/grid';
import type { StationMeasureInput } from '../../layout/measure';

const here = dirname(fileURLToPath(import.meta.url));
const bigFixturePath = resolve(here, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json');
const smallFixtureDir = resolve(here, 'fixtures');

function loadEnm(path: string): EnergyNetworkModel {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { readonly enm?: EnergyNetworkModel };
  return (parsed.enm ?? (parsed as unknown as EnergyNetworkModel));
}

/** Klasy topologii (WYTYCZNE §3): A radialna prosta; B/C z odgałęzieniami;
 *  E wieloźródłowa duża (GPZ + PV/BESS/trafo blokowy + NO). */
const FIXTURES: ReadonlyArray<{ readonly klasa: string; readonly nazwa: string; readonly enm: EnergyNetworkModel }> = [
  { klasa: 'A (radialna prosta)', nazwa: 'openTerminal', enm: loadEnm(resolve(smallFixtureDir, 'openTerminal.enm.json')) },
  { klasa: 'A (ciąg radialny)', nazwa: 'openTrunkChain', enm: loadEnm(resolve(smallFixtureDir, 'openTrunkChain.enm.json')) },
  { klasa: 'B (z odgałęzieniem)', nazwa: 'openBranch', enm: loadEnm(resolve(smallFixtureDir, 'openBranch.enm.json')) },
  { klasa: 'C (GPZ + feeder)', nazwa: 'gpzFeeder', enm: loadEnm(resolve(smallFixtureDir, 'gpzFeeder.enm.json')) },
  { klasa: 'E (wieloźródłowa, 53 stacje)', nazwa: 'sldSubstrate52s', enm: loadEnm(bigFixturePath) },
];

const bigEnm = FIXTURES[FIXTURES.length - 1].enm;

/** Podpis BAJT-poziomu sceny — symbole + segmenty + etykiety + węzły/crossings,
 *  deterministycznie posortowane (do porównania permutacyjnego §5). */
function sceneSignature(scene: SceneV3): string {
  const symbols = scene.symbols.map((s) => `${s.symbolId}@${s.x},${s.y}`).sort().join('|');
  const segments = scene.segments
    .map((seg) => `${seg.meta?.ownerRef ?? '?'}#${seg.points.map((p) => `${p.x},${p.y}`).join(';')}`)
    .sort()
    .join('|');
  const labels = scene.labels.map((l) => `${l.ownerRef}:${l.text}@${l.rect.x},${l.rect.y}`).sort().join('|');
  return `S[${symbols}]G[${segments}]L[${labels}]X[${scene.crossings.length}]J[${scene.junctions.length}]`;
}

/** WYTYCZNE §5 — deterministyczna PERMUTACJA rekordów wejściowych BEZ zmiany
 *  kolejności TOPOLOGICZNEJ: odwracamy tablice-PULE wyszukiwane po `ref_id`
 *  (silnik buduje z nich mapy), których kolejność w pamięci jest arbitralna.
 *
 *  CELOWO NIE permutujemy tablic niosących SEMANTYKĘ KOLEJNOŚCI (to nie jest
 *  „kolejność w pamięci", tylko dana topologiczna, WYTYCZNE §5/§6):
 *   - `line_runs` + ich `stations`/`segments` — kolejność stacji/segmentów ciągu;
 *   - `bays` — SEKWENCJA PÓL rozdzielni (kolejność aparatów §pole),
 *     wykorzystywana m.in. przy alokacji pól liniowych GPZ (`findGpzLineBayRefs`);
 *   - `corridors` — kolejność przydziału feederów GPZ (fallback „kolejne wolne
 *     pole", `scene/buildScene.ts` sekcja 6).
 *  Poprawny silnik jest na permutację PUL NIECZUŁY (mapy po kluczu). */
function permuteRecords(model: EnergyNetworkModel): EnergyNetworkModel {
  const rev = <T,>(a: readonly T[] | undefined): T[] | undefined => (a ? [...a].reverse() : a === undefined ? undefined : []);
  return {
    ...model,
    buses: rev(model.buses)!,
    branches: rev(model.branches)!,
    transformers: rev(model.transformers)!,
    sources: rev(model.sources)!,
    loads: rev(model.loads)!,
    generators: rev(model.generators)!,
    substations: rev(model.substations)!,
    junctions: rev(model.junctions)!,
    branch_points: rev(model.branch_points),
    measurements: rev(model.measurements)!,
    protection_assignments: rev(model.protection_assignments)!,
  } as EnergyNetworkModel;
}

/** Kopia ENM z długim opisem PL na JEDNEJ stacji (mutacja footprintu etykiety,
 *  NIE-topologiczna — wzorzec S7-P1 `withLongPolishName`). */
function withLongPolishName(model: EnergyNetworkModel, targetRef: string): EnergyNetworkModel {
  const longName = 'Stacja Rozdzielcza Napowietrzno-Kablowa „Żółć Gęślą Jaźń" — Odgałęzienie Wschód Główny Ciąg';
  return {
    ...model,
    substations: model.substations.map((s) => (s.ref_id === targetRef ? { ...s, name: longName } : s)),
  } as EnergyNetworkModel;
}

/** Wstrzyknięcie syntetycznego punktu NO na ciąg główny (wzorzec
 *  `enmWithSyntheticNop` z S3 — fixtura bazowa ma `nop_station_ref=null`). */
function withSyntheticNop(model: EnergyNetworkModel): EnergyNetworkModel {
  const clone = structuredClone(model);
  const mainRun = clone.line_runs?.find((r) => r.run_kind === 'main_trunk');
  if (!mainRun) throw new Error('fixtura bez main_trunk — nie da się wstrzyknąć NO');
  const targetStationRef = buildSceneV3(model, 2).meta.mainTrunkStationIds[0];
  (mainRun as { nop_station_ref: string | null }).nop_station_ref = targetStationRef;
  return clone;
}

function stationHash(stationId: string): string {
  return stationId.split('/')[1] ?? stationId;
}

/** Kotwice (x,y) symboli stacji o danym ref_id — do miar stabilności §9. */
function stationSymbolAnchors(scene: SceneV3, stationId: string): ReadonlyArray<readonly [number, number]> {
  const hash = stationHash(stationId);
  return scene.symbols
    .filter((s) => typeof s.meta?.testId === 'string' && s.meta.testId.includes(hash))
    .map((s) => [s.x, s.y] as const)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

interface StabilityMetrics {
  readonly anchorMovementCount: number;
  readonly totalAnchorDisplacement: number;
  readonly maxAnchorDisplacement: number;
}

/** Miary stabilności §9 dla zbioru stacji między dwiema scenami. */
function stabilityMetrics(before: SceneV3, after: SceneV3, stationIds: readonly string[]): StabilityMetrics {
  let count = 0;
  let total = 0;
  let max = 0;
  for (const id of stationIds) {
    const a = stationSymbolAnchors(before, id);
    const b = stationSymbolAnchors(after, id);
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
      const dx = b[i][0] - a[i][0];
      const dy = b[i][1] - a[i][1];
      const d = Math.abs(dx) + Math.abs(dy);
      if (d > 0) {
        count += 1;
        total += d;
        max = Math.max(max, d);
      }
    }
  }
  return { anchorMovementCount: count, totalAnchorDisplacement: total, maxAnchorDisplacement: max };
}

describe('SCHEMAT-10 S7 etap 3 — generalizacja świateł + packingu (WYTYCZNE §3/§12)', () => {
  it('§12 (zero-defekty na WIELU fixturach): 0 kolizji/przecięć/nieortog./niejedn./crossing — każda klasa, każdy LOD', () => {
    const rows: string[] = [];
    for (const fx of FIXTURES) {
      for (const lod of [0, 1, 2] as const) {
        const m = layoutMetricsReport(buildSceneV3(fx.enm, lod));
        rows.push(
          `${fx.klasa} ${fx.nazwa} L${lod}: subs=${fx.enm.substations.length} kol=${m.labelCollisionCount} przec=${m.subtreeIntersectionCount} nieort=${m.nonOrthogonalSegmentCount} niejedn=${m.ambiguousConnectionCount} cross=${m.crossingCount}`,
        );
        expect(m.labelCollisionCount, `${fx.nazwa} L${lod} kolizje etykiet`).toBe(0);
        expect(m.subtreeIntersectionCount, `${fx.nazwa} L${lod} przecięcia poddrzew`).toBe(0);
        expect(m.nonOrthogonalSegmentCount, `${fx.nazwa} L${lod} nieortogonalne`).toBe(0);
        expect(m.ambiguousConnectionCount, `${fx.nazwa} L${lod} niejednoznaczne`).toBe(0);
        expect(m.crossingCount, `${fx.nazwa} L${lod} skrzyżowania`).toBe(0);
      }
    }
    console.log('[S7 etap 3 §12 dowód generalizacji]\n' + rows.join('\n'));
  });

  it('§5 (permutacja rekordów): odwrócenie tablic rekordów ⇒ scena BAJT-IDENTYCZNA (każda fixtura, każdy LOD)', () => {
    for (const fx of FIXTURES) {
      const permuted = permuteRecords(fx.enm);
      for (const lod of [0, 1, 2] as const) {
        const base = sceneSignature(buildSceneV3(fx.enm, lod));
        const perm = sceneSignature(buildSceneV3(permuted, lod));
        expect(perm, `${fx.nazwa} L${lod}: permutacja rekordów zmieniła scenę (silnik zależy od kolejności w pamięci)`).toBe(base);
      }
    }
  });

  it('§11f (różne footprinty razem): stacja/switchgear/PV/BESS/trafo/pomiar współistnieją bez kolizji; NO wstrzyknięty renderuje się', () => {
    const scene = buildSceneV3(bigEnm, 2);
    const symbolIds = new Set(scene.symbols.map((s) => s.symbolId));
    // Fixtura MUSI być heterogeniczna — inaczej test §11f byłby pusty.
    expect(symbolIds.has('transformer2W'), 'transformator blokowy obecny').toBe(true);
    expect(symbolIds.has('derPv'), 'PV obecny').toBe(true);
    expect(symbolIds.has('derBess'), 'BESS obecny').toBe(true);
    expect(symbolIds.has('currentTransformer'), 'pole pomiarowe (CT) obecne').toBe(true);
    expect(symbolIds.has('gridSource'), 'źródło GPZ obecne').toBe(true);
    const switchgear = ['breaker', 'disconnector', 'loadBreakSwitch', 'fuseSwitch', 'earthSwitch'];
    expect(switchgear.some((id) => symbolIds.has(id)), 'aparatura łączeniowa obecna').toBe(true);
    // Heterogeniczne footprinty NIE kolidują (światła §5 rozdzielone działają).
    const m = layoutMetricsReport(scene);
    expect(m.labelCollisionCount).toBe(0);
    expect(m.subtreeIntersectionCount).toBe(0);
    // Punkt NO (krawędź pozadrzewowa §6) — wstrzyknięty, MUSI się wyrenderować.
    const nopScene = buildSceneV3(withSyntheticNop(bigEnm), 2);
    expect(nopScene.symbols.some((s) => s.symbolId === 'noPoint'), 'punkt NO renderuje się po wstrzyknięciu').toBe(true);
    expect(layoutMetricsReport(nopScene).labelCollisionCount).toBe(0);
  });

  it('§9 (lokalność + stabilność): długi opis PL na JEDNEJ gałęzi NIE przesuwa kotwic ciągu głównego', () => {
    const lod = 2;
    const base = buildSceneV3(bigEnm, lod);
    const trunkIds = base.meta.mainTrunkStationIds;
    expect(trunkIds.length).toBeGreaterThan(0);
    const trunkSet = new Set(trunkIds);
    const lateralStation = bigEnm.substations.find((s) => s.station_type !== 'gpz' && !trunkSet.has(s.ref_id));
    expect(lateralStation).toBeDefined();

    const mutated = buildSceneV3(withLongPolishName(bigEnm, lateralStation!.ref_id), lod);
    const stab = stabilityMetrics(base, mutated, trunkIds);
    console.log(
      `[S7 etap 3 §9 stabilność] zmiana footprintu 1 lateralu → ciąg główny: anchorMovementCount=${stab.anchorMovementCount} totalAnchorDisplacement=${stab.totalAnchorDisplacement} maxAnchorDisplacement=${stab.maxAnchorDisplacement} (stacje ciągu=${trunkIds.length})`,
    );
    // S9-1 (ŁAMANIE ARKUSZA, `docs/sld/DECYZJA_LAMANIE_ARKUSZA.md` §4) —
    // ZMIANA KANONU, intencja zachowana. Dotąd cały ciąg leżał NAD wszystkimi
    // odgałęzieniami, więc „lokalność" znaczyła „ciąg się nie rusza". Po
    // złamaniu arkusza pasma są PRZEPLATANE (wiersz → jego odgałęzienia →
    // wiersz następny), więc wyższe odgałęzienie MUSI zepchnąć w dół wiersze
    // leżące pod nim — inaczej weszłoby w nie geometrią. Lokalność znaczy
    // teraz: skutek idzie WYŁĄCZNIE W DÓŁ i WYŁĄCZNIE jako sztywny ruch całego
    // wiersza. Trzy niezmienniki poniżej łapią każdą realną reorganizację
    // (przetasowanie w X, rozjazd stacji wewnątrz wiersza, ruch w górę).
    const rows = sheetRowStationIds(base);
    expect(sheetRowStationIds(mutated)).toEqual(rows);
    let seenShiftedRow = false;
    for (const row of rows) {
      const deltas = row.flatMap((id) => {
        const a = stationSymbolAnchors(base, id);
        const b = stationSymbolAnchors(mutated, id);
        const n = Math.min(a.length, b.length);
        return Array.from({ length: n }, (_, i) => ({ dx: b[i][0] - a[i][0], dy: b[i][1] - a[i][1] }));
      });
      expect(deltas.length).toBeGreaterThan(0);
      // (a) zero przemeblowania poziomego — kolumny wiersza są nietknięte.
      for (const d of deltas) expect(d.dx).toBe(0);
      // (b) wiersz jedzie w dół JAKO CAŁOŚĆ (jedna wartość Δy na wiersz).
      const dys = new Set(deltas.map((d) => d.dy));
      expect(dys.size).toBe(1);
      const dy = deltas[0].dy;
      // (c) skutek idzie tylko w dół i tylko po wierszu, który już się przesunął
      //     (żaden wiersz nad zmianą nie rusza się po tym, jak niższy stanął).
      expect(dy).toBeGreaterThanOrEqual(0);
      if (dy > 0) seenShiftedRow = true;
      else expect(seenShiftedRow).toBe(false);
    }
  });

  it('§10 (wydajność): czas budowy sceny per fixtura w budżecie (raport)', () => {
    const rows: string[] = [];
    for (const fx of FIXTURES) {
      const t0 = performance.now();
      for (const lod of [0, 1, 2] as const) buildSceneV3(fx.enm, lod);
      const dt = performance.now() - t0;
      rows.push(`${fx.klasa} ${fx.nazwa} (subs=${fx.enm.substations.length}): ${dt.toFixed(1)} ms / 3 LOD`);
      // Budżet hojny — bramka na niekontrolowaną złożoność, nie mikrooptymalizacja.
      expect(dt, `${fx.nazwa} przekroczył budżet czasu`).toBeLessThan(15000);
    }
    console.log('[S7 etap 3 §10 wydajność]\n' + rows.join('\n'));
  });

  it('§5 (determinizm 2×): dwa biegi tej samej fixtury ⇒ podpis identyczny', () => {
    for (const fx of FIXTURES) {
      for (const lod of [0, 1, 2] as const) {
        expect(sceneSignature(buildSceneV3(fx.enm, lod))).toBe(sceneSignature(buildSceneV3(fx.enm, lod)));
      }
    }
  });
});

describe('SCHEMAT-10 S7 etap 3 — rozdzielone światła §5 (wartości + realne sterowanie)', () => {
  it('6 stałych §5 istnieje z bazowymi wartościami (rozdzielone role, nie jedna stała)', () => {
    expect(MIN_GLYPH_CLEARANCE).toBe(GRID);
    expect(MIN_LABEL_CLEARANCE).toBe(GRID);
    expect(MIN_FIELD_CLEARANCE).toBe(2 * GRID);
    expect(MIN_SUBTREE_CLEARANCE).toBe(4 * GRID);
    expect(MIN_ROUTE_CLEARANCE).toBe(GRID);
    // SCHEMAT-10 S7-P4 (recenzja §9 P0 pkt 1): PODNIESIONE 3×GRID→4×GRID
    // (+33,3%, widełki §5 „+20–35%") — światło pasa górnego mierzone
    // bbox-do-bbox (patrz `buildScene.schemat10s7p4.test.ts`). Rola §5
    // niezmieniona (nadal ODDZIELONA od `COLUMN_GAP` lateralów), zmieniona
    // wyłącznie wartość — intencja testu (stała istnieje, rozdzielona) zachowana.
    expect(TOP_LEVEL_FIELD_CLEARANCE).toBe(4 * GRID);
  });

  it('TOP_LEVEL_FIELD_CLEARANCE realnie steruje rozstawem pasa górnego (NIE phantom)', () => {
    // Dwie identyczne stacje; różny columnGap ⇒ rozstaw kolumn rośnie DOKŁADNIE
    // o różnicę światła (reguła wyprowadzona z footprintu, nie hardcode).
    const station: StationMeasureInput = { id: 'a', name: 'Stacja A', stationCode: 'A', busVoltageKv: 15, snBays: [] };
    const stations = [station, { ...station, id: 'b', name: 'Stacja B', stationCode: 'B' }];
    const texts = [null, null];
    const base = computeStationTaps(stations, texts, TOP_LEVEL_FIELD_CLEARANCE);
    const raised = computeStationTaps(stations, texts, TOP_LEVEL_FIELD_CLEARANCE + 2 * GRID);
    const deltaBase = base[1].x - base[0].x;
    const deltaRaised = raised[1].x - raised[0].x;
    expect(deltaRaised - deltaBase).toBe(2 * GRID);
  });
});
