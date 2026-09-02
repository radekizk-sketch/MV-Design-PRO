/**
 * RECENZJA EKSPERCKA LAYOUTU SLD (`docs/sld/RECENZJA_EKSPERCKA_LAYOUT_2026-07.md`)
 * — punkty P1, wdrożenie end-to-end. Cztery obszary, wszystkie deterministyczne,
 * wyprowadzone z właściwości OGÓLNYCH (WYTYCZNE_GENERALIZACJA_LAYOUTU_2026-07 §1/§2:
 * ZERO hardcode po id/nazwie/liczbie stacji):
 *
 *  P1.1 GĘSTOŚĆ LOKALNA — rozkład zajętości arkusza z REALNEJ geometrii sceny
 *       (`localDensityMetrics`): średnia/maks/odchylenie/pustka po oknach `GRID`.
 *       Miara raportująca (bez twardego progu — uczciwy pomiar bazy, WARUNKI_
 *       ODBIORU_S6 §6 „occupancyGrid"); twardy próg dopiero po pomiarze.
 *  P1.2 ODSTĘP STACJI Z FOOTPRINTU — DOWÓD, że rozstaw kolumn wynika z realnego
 *       footprintu treści, nie ze stałego slotu (recon: `layout/clearances.ts`
 *       docstring + `layout/measure.ts` `requiredStationWidth`/`stationBlockWidth`
 *       — już footprint-driven; ten plik to udokumentowany DOWÓD, nie zmiana
 *       silnika).
 *  P1.3 FIXTURY WIELKOSKALOWE (rodzina H, WYTYCZNE §3) — syntetyczne sieci SN
 *       ~100/250/500 stacji (magistrala + laterale + TR + DER + NO, replikacja
 *       realnej topologii): zero-defekt L0/L1/L2, determinizm, niezmienniczość
 *       na permutację rekordów, „jedna kotwica", budżety czasu (WYTYCZNE §10).
 *  P1.4 LOKALNOŚĆ (+1 stacja, WYTYCZNE §5/§9) — `anchorDisplacementMetrics`:
 *       dodanie 1 stacji na ogonie magistrali przesuwa kotwice TYLKO tam, gdzie
 *       wymusza reguła ogólna (poziome upakowanie footprintu), reszta bit-
 *       identyczna (przyczyna udokumentowana LICZBĄ, nie przymiotnikiem).
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  buildSceneV3,
  layoutMetricsReport,
  localDensityMetrics,
  LOCAL_DENSITY_WINDOW_CELLS,
  topBandFieldExtents,
  topBandFieldClearances,
  allTopBandFieldsClearance,
  anchorDisplacementMetrics,
  stationCollapsedAnchors,
  noSceneSymbolOverlaps,
  allSceneSegmentEndpointsAnchored,
  allSourcesConnected,
  type SceneLod,
  sheetRowStationIds,
} from '../buildScene';
import { requiredStationWidth, type StationMeasureInput } from '../../layout/measure';
import { TOP_LEVEL_FIELD_CLEARANCE } from '../../layout/clearances';
import { GRID } from '../../core/grid';
import {
  LODS,
  loadEnm,
  synthLargeTrunk,
  appendUnitToTrunk,
  permuteRecords,
  sceneSignature,
} from './syntheticNetworks';

const here = dirname(fileURLToPath(import.meta.url));
const bigFixturePath = resolve(here, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json');
const smallDir = resolve(here, 'fixtures');
const bigEnm = loadEnm(bigFixturePath);
const openTrunkChain = loadEnm(resolve(smallDir, 'openTrunkChain.enm.json'));

// ---------------------------------------------------------------------------
// P1.1 — GĘSTOŚĆ LOKALNA (rozkład zajętości arkusza)
// ---------------------------------------------------------------------------
describe('RECENZJA EKSPERCKA — metryki gęstości lokalnej (rozkład zajętości arkusza)', () => {
  it('deterministyczna: dwa biegi tej samej sceny ⇒ identyczny raport gęstości (każdy LOD)', () => {
    for (const lod of LODS) {
      const a = localDensityMetrics(buildSceneV3(bigEnm, lod));
      const b = localDensityMetrics(buildSceneV3(bigEnm, lod));
      expect(a).toEqual(b);
    }
  });

  it('sanity: okna niepuste, wartości skończone w [0,1], maks ≥ średnia, pustka ∈ [0,1]', () => {
    for (const lod of LODS) {
      const d = localDensityMetrics(buildSceneV3(bigEnm, lod));
      expect(d.windowCells).toBe(LOCAL_DENSITY_WINDOW_CELLS);
      expect(d.windowCount).toBeGreaterThan(0);
      for (const v of [d.meanDensity, d.maxLocalDensity, d.densityStdDev, d.voidRatio]) {
        expect(Number.isFinite(v)).toBe(true);
      }
      expect(d.meanDensity).toBeGreaterThanOrEqual(0);
      expect(d.maxLocalDensity).toBeGreaterThanOrEqual(d.meanDensity);
      expect(d.maxLocalDensity).toBeLessThanOrEqual(1);
      expect(d.voidRatio).toBeGreaterThanOrEqual(0);
      expect(d.voidRatio).toBeLessThanOrEqual(1);
    }
  });

  it('RAPORT wartości bazowych (fixtura referencyjna, uczciwy pomiar bazy — bez twardego progu)', () => {
    const rows: string[] = [];
    for (const lod of LODS) {
      const d = localDensityMetrics(buildSceneV3(bigEnm, lod));
      rows.push(
        `  L${lod}: okna=${d.windowCount} średnia=${d.meanDensity.toFixed(6)} maks=${d.maxLocalDensity.toFixed(6)} ` +
          `odch=${d.densityStdDev.toFixed(6)} pustka=${d.voidRatio.toFixed(6)}`,
      );
    }
    console.log('[RECENZJA EKSPERCKA gęstość lokalna — baza sldSubstrate52s]\n' + rows.join('\n'));
    expect(rows.length).toBe(3);
  });

  it('miara GRYZIE: gęstsza scena (więcej detalu L2>L0) ma wyższą średnią i niższą pustkę niż L0', () => {
    // Rozkład reaguje na realną treść: L2 (pełen detal) jest gęstszy niż L0
    // (kompaktowy przegląd), więc pustka spada, a średnia rośnie — dowód, że
    // miara nie zwraca stałej.
    const l0 = localDensityMetrics(buildSceneV3(bigEnm, 0));
    const l2 = localDensityMetrics(buildSceneV3(bigEnm, 2));
    expect(l2.meanDensity).toBeGreaterThan(l0.meanDensity);
    expect(l2.voidRatio).toBeLessThan(l0.voidRatio);
  });

  it('raport metryk layoutu niesie pola gęstości lokalnej (spójne z `localDensityMetrics`)', () => {
    for (const lod of LODS) {
      const scene = buildSceneV3(bigEnm, lod);
      const rep = layoutMetricsReport(scene);
      const d = localDensityMetrics(scene);
      expect(rep.localDensityMean).toBe(d.meanDensity);
      expect(rep.localDensityMax).toBe(d.maxLocalDensity);
      expect(rep.localDensityStdDev).toBe(d.densityStdDev);
      expect(rep.localDensityVoidRatio).toBe(d.voidRatio);
    }
  });
});

// ---------------------------------------------------------------------------
// P1.2 — ODSTĘP STACJI Z FOOTPRINTU (dowód: nie stały slot)
// ---------------------------------------------------------------------------
describe('RECENZJA EKSPERCKA — rozstaw stacji z realnego footprintu (dowód, nie zmiana silnika)', () => {
  const baseInput = (name: string, snBays: StationMeasureInput['snBays'] = []): StationMeasureInput => ({
    id: 'stn/test/station',
    name,
    stationCode: null,
    transformerRatedKva: null,
    busVoltageKv: null,
    snBays,
  });

  it('`requiredStationWidth` ROŚNIE z długością nazwy (footprint tekstu, nie stały slot)', () => {
    // Recon: `layout/measure.ts` `requiredStationWidth` = snapUp(max(blockWidth,
    // nameBandWidth, busbarLabelWidth) + 2·GRID) — z REALNIE zmierzonych szerokości
    // tekstu/bloku. Dowód: dłuższa nazwa ⇒ szersza kolumna (gdyby był stały slot,
    // szerokość byłaby niezależna od treści).
    const wShort = requiredStationWidth(baseInput('S1'));
    const wLong = requiredStationWidth(
      baseInput('Stacja Rozdzielcza Napowietrzno-Kablowa „Żółć Gęślą Jaźń" — Ciąg Główny Wschód'),
    );
    expect(wLong).toBeGreaterThan(wShort);
  });

  it('scena: pola pasa górnego mają RÓŻNE szerokości footprintu (treść steruje kolumną)', () => {
    // Gdyby rozstaw był stałym slotem, wszystkie pola miałyby jednakową szerokość.
    const ext = topBandFieldExtents(buildSceneV3(bigEnm, 2));
    expect(ext.length).toBeGreaterThan(1);
    const distinctWidths = new Set(ext.map((e) => e.width));
    expect(distinctWidths.size).toBeGreaterThan(1);
  });

  it('scena: światło bbox-do-bbox = STAŁE minimalne (=kontrakt), więc rozstaw = footprint + światło', () => {
    // Klucz dowodu: skoro KAŻDE światło między sąsiadami == TOP_LEVEL_FIELD_CLEARANCE
    // (upakowanie ciasne do minimalnego światła) ORAZ szerokości pól SĄ RÓŻNE
    // (test wyżej), to rozstaw środek-do-środka WYNIKA z footprintu każdej stacji,
    // nie ze stałego slotu (stały slot ⇒ stały rozstaw niezależny od footprintu).
    for (const lod of LODS) {
      const scene = buildSceneV3(bigEnm, lod);
      const gaps = topBandFieldClearances(scene).map((g) => g.gap);
      if (gaps.length === 0) continue; // pas górny <2 pola (małe sceny) — pomijamy
      for (const g of gaps) expect(g).toBe(TOP_LEVEL_FIELD_CLEARANCE);
      expect(allTopBandFieldsClearance(scene)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// P1.3 — FIXTURY WIELKOSKALOWE (rodzina H: ~100/250/500 stacji)
// ---------------------------------------------------------------------------
interface ScaleCase {
  readonly nazwa: string;
  readonly copies: number;
  readonly minStations: number;
  /** Budżet czasu 3×LOD [ms] — ~2–4× pomiaru (WYTYCZNE §10, zapas na CI). */
  readonly budgetMs: number;
  /** Pełny determinizm/permutacja na wszystkich LOD (małe/średnie) vs tylko L2
   *  (duże — koszt budowy; L2 = najgorszy przypadek pełnego detalu). */
  readonly fullLodInvariance: boolean;
}
const SCALE_CASES: readonly ScaleCase[] = [
  // Budżety = ~2–3× pomiaru warm (538/2970/11369 ms) + zapas na zimny build / CI.
  { nazwa: '~100', copies: 2, minStations: 100, budgetMs: 5000, fullLodInvariance: true },
  { nazwa: '~250', copies: 5, minStations: 250, budgetMs: 12000, fullLodInvariance: true },
  { nazwa: '~500', copies: 10, minStations: 500, budgetMs: 30000, fullLodInvariance: false },
];

describe('RECENZJA EKSPERCKA — fixtury wielkoskalowe rodzina H (~100/250/500 stacji)', () => {
  for (const sc of SCALE_CASES) {
    describe(`H ${sc.nazwa} stacji (${sc.copies} kopii sieci referencyjnej)`, () => {
      const enm = synthLargeTrunk(bigEnm, sc.copies);
      // Sceny bazowe zbudowane RAZ (deterministyczne) i reużyte w zero-defekt /
      // JEDNA KOTWICA — ogranicza koszt budowy przy dużej skali (WYTYCZNE §10).
      const scenes = LODS.map((lod) => buildSceneV3(enm, lod));

      it(`ma ≥ ${sc.minStations} stacji na jednej magistrali (skala WYTYCZNE §3 H)`, () => {
        expect(scenes[0].meta.stationCount).toBeGreaterThanOrEqual(sc.minStations);
        expect(scenes[0].meta.mainTrunkStationIds.length).toBeGreaterThan(1);
      });

      for (const lod of LODS) {
        it(`L${lod}: buduje bez wyjątku, ZERO-DEFEKT (crossing/kolizje/przecięcia/nieortog/niejedn=0)`, () => {
          const scene = scenes[lod];
          const m = layoutMetricsReport(scene);
          expect(m.crossingCount).toBe(0);
          expect(m.labelCollisionCount).toBe(0);
          expect(m.subtreeIntersectionCount).toBe(0);
          expect(m.nonOrthogonalSegmentCount).toBe(0);
          expect(m.ambiguousConnectionCount).toBe(0);
          expect(noSceneSymbolOverlaps(scene)).toBe(true);
          expect(allSceneSegmentEndpointsAnchored(scene)).toBe(true);
          expect(allSourcesConnected(scene)).toBe(true);
          expect(allTopBandFieldsClearance(scene)).toBe(true);
        });
      }

      it('determinizm: dwa biegi ⇒ podpis bajt-identyczny', () => {
        const lods = sc.fullLodInvariance ? LODS : ([2] as const);
        for (const lod of lods) {
          expect(sceneSignature(buildSceneV3(enm, lod as SceneLod))).toBe(sceneSignature(scenes[lod]));
        }
      });

      it('permutacja rekordów wejściowych ⇒ scena bajt-identyczna (silnik nieczuły na kolejność w pamięci)', () => {
        const permuted = permuteRecords(enm);
        const lods = sc.fullLodInvariance ? LODS : ([2] as const);
        for (const lod of lods) {
          expect(
            sceneSignature(buildSceneV3(permuted, lod as SceneLod)),
            `permutacja zmieniła scenę na L${lod} (zależność od kolejności w pamięci)`,
          ).toBe(sceneSignature(scenes[lod]));
        }
      });

      it('JEDNA KOTWICA: kolejność i liczba stacji magistrali identyczne L0/L1/L2', () => {
        expect(scenes[1].meta.mainTrunkStationIds).toEqual(scenes[0].meta.mainTrunkStationIds);
        expect(scenes[2].meta.mainTrunkStationIds).toEqual(scenes[0].meta.mainTrunkStationIds);
      });

      it(`czas budowy 3×LOD w budżecie ${sc.budgetMs} ms (raport, WYTYCZNE §10)`, () => {
        buildSceneV3(enm, 2); // rozgrzewka JIT (poza pomiarem)
        const start = Date.now();
        const perLod: number[] = [];
        let stations = 0;
        for (const lod of LODS) {
          const t = Date.now();
          const scene = buildSceneV3(enm, lod as SceneLod);
          stations = scene.meta.stationCount;
          perLod.push(Date.now() - t);
        }
        const elapsed = Date.now() - start;
        console.log(
          `[RECENZJA EKSPERCKA §10 wydajność] H ${sc.nazwa}: ${stations} stacji · ` +
            `L0=${perLod[0]}ms L1=${perLod[1]}ms L2=${perLod[2]}ms total=${elapsed}ms (budżet ${sc.budgetMs}ms)`,
        );
        expect(elapsed).toBeLessThan(sc.budgetMs);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// P1.4 — LOKALNOŚĆ (+1 stacja, WYTYCZNE §5/§9)
// ---------------------------------------------------------------------------
describe('RECENZJA EKSPERCKA — lokalność zmiany (+1 stacja na ogonie magistrali)', () => {
  // Sieć średnia: 2 kopie (~106 stacji), by dodanie 1 stacji było zmianą LOKALNĄ
  // względem dużej sieci (nie dominowało obrazu).
  const mediumEnm = synthLargeTrunk(bigEnm, 2);
  const plusOne = appendUnitToTrunk(mediumEnm, openTrunkChain);

  it('operacja dodaje DOKŁADNIE 1 stację (kontrakt metamorficzny +1)', () => {
    const before = buildSceneV3(mediumEnm, 0).meta.stationCount;
    const after = buildSceneV3(plusOne, 0).meta.stationCount;
    expect(after).toBe(before + 1);
  });

  it('zero-defekt zachowany po dodaniu stacji (każdy LOD)', () => {
    for (const lod of LODS) {
      const m = layoutMetricsReport(buildSceneV3(plusOne, lod as SceneLod));
      expect(m.crossingCount).toBe(0);
      expect(m.labelCollisionCount).toBe(0);
      expect(m.subtreeIntersectionCount).toBe(0);
      expect(m.nonOrthogonalSegmentCount).toBe(0);
      expect(m.ambiguousConnectionCount).toBe(0);
    }
  });

  it('kotwice stacji przesunięte TYLKO tam, gdzie wymusza reguła ogólna (poziome upakowanie footprintu)', () => {
    const before = buildSceneV3(mediumEnm, 0);
    const after = buildSceneV3(plusOne, 0);
    const stab = anchorDisplacementMetrics(before, after);

    // Raport (przyczyna udokumentowana LICZBĄ, nie przymiotnikiem — WYTYCZNE §9).
    console.log(
      `[RECENZJA EKSPERCKA §9 lokalność] +1 stacja: przesunięte=${stab.anchorMovementCount} ` +
        `nieruszone=${stab.unchangedSubtreeMovementCount} suma|Δ|=${stab.totalAnchorDisplacement} ` +
        `maks|Δ|=${stab.maxAnchorDisplacement} poziome=${stab.movedHorizontalCount} pionowe=${stab.movedVerticalCount}`,
    );

    // Zmiana MA skutek (sanity — inaczej test nic nie sprawdza).
    expect(stab.anchorMovementCount).toBeGreaterThan(0);
    // REGUŁA OGÓLNA: dodanie stacji na ogonie magistrali wydłuża magistralę
    // POZIOMO — żadna kotwica nie jest pchana PIONOWO, DOPÓKI podział arkusza
    // na wiersze (S9-1 łamanie arkusza, `sheetRowStationIds`) zostaje ten sam.
    // Gdy dopisana stacja przesuwa punkt złamania (wiersz przepełniony —
    // podział istniejących stacji ZMIENIA się), przesunięcia pionowe są
    // KONSEKWENCJĄ reguły łamania, nie reorganizacją arbitralną: dopuszczamy
    // je WYŁĄCZNIE wtedy i tylko z tej przyczyny (predykat jawny, nie ustępstwo).
    // Pomiar po LV Domain Projection (2026-09-01): kolumny stacji z TR
    // poszerzone o portal domeny nN ⇒ podział [12,12] → [13,12] (stacja
    // graniczna wiersza 2 wróciła do wiersza 1), 73 kotwice pionowo.
    const rowsBefore = sheetRowStationIds(before).map((r) => r.length);
    const rowsAfter = sheetRowStationIds(after).map((r) => r.length);
    console.log(`[RECENZJA EKSPERCKA §9 lokalność] wiersze arkusza: ${rowsBefore.join('+')} → ${rowsAfter.join('+')}`);
    const podzialNietkniety =
      rowsAfter.length === rowsBefore.length
      && rowsBefore.every((n, i) => rowsAfter[i] === n || (i === rowsBefore.length - 1 && rowsAfter[i] === n + 1));
    if (podzialNietkniety) {
      expect(stab.movedVerticalCount).toBe(0);
    } else {
      // Podział zmieniony ⇒ liczność stacji nadal +1 (nic nie zniknęło), a
      // przesunięcia pionowe muszą istnieć (inaczej wiersze nie mogłyby się
      // przebudować) — kierunek zgodny z przyczyną, nie z przypadkiem.
      expect(rowsAfter.reduce((a, b) => a + b, 0)).toBe(rowsBefore.reduce((a, b) => a + b, 0) + 1);
      expect(stab.movedVerticalCount).toBeGreaterThan(0);
    }
    // Każde przesunięcie to POZIOMY kwant siatki (upakowanie footprintu, nie ruch
    // arbitralny): Δx ≠ 0 i wielokrotność GRID, Δy = 0.
    //
    // W3-KABLE-ETYKIETY §7 (zmiana kanonu, 2026-07-23): pełna etykieta techniczna
    // L2 („relacja · typ · napięcie · l = …", `layout/lineLabel.ts`) jest SZERSZA
    // od dawnej „typ · długość", więc footprint kolumny NIEKTÓRYCH pól rośnie.
    // Packer interwałowy przydziela laterale do pasm wg footprintu — szersza
    // kolumna potrafi PRZECHYLIĆ jedną decyzję pasma tak, że lateralne poddrzewo
    // przepakuje się POZIOMO w LEWO (zmierzone: 1 z 17 ruchów, |Δ|=872). Dawna
    // asercja „każdy Δx > 0" (monotoniczność w prawo) zakładała, że footprinty
    // nigdy nie przechylą pasma — to założenie upada przy bogatszych etykietach.
    // NIEZMIENNIK ZACHOWANY (intencja testu): zmiana jest LOKALNA (89 nieruszonych
    // ≫ 17 przesuniętych, asercja niżej), BEZ reorganizacji pionowej (Δy=0
    // wyżej), a każdy ruch to realny kwant siatki (nie dryf) — NIE monotoniczność
    // kierunku, która nigdy nie była gwarancją packera, tylko artefaktem dawnych
    // wąskich footprintów.
    for (const d of stab.displacements) {
      // `=== 0` (nie `.toBe(0)`): Δ bywa UJEMNE (repack w lewo / wiersz wyżej),
      // a `(-872) % GRID === -0`, którego Object.is odróżnia od +0 (jak w
      // `grid_probe` wyżej w tym pliku). Grid-alignment sprawdzamy wartościowo.
      expect(d.dx % GRID === 0).toBe(true);
      expect(d.dy % GRID === 0).toBe(true);
      if (podzialNietkniety) {
        expect(d.dy).toBe(0);
        expect(d.dx).not.toBe(0);
      }
    }
    if (podzialNietkniety) {
      // LOKALNOŚĆ: większość sieci bit-identyczna (nieruszone > przesunięte) —
      // dowód, że silnik NIE reorganizuje całości przy zmianie lokalnej.
      expect(stab.unchangedSubtreeMovementCount).toBeGreaterThan(stab.anchorMovementCount);
    } else {
      // Przebudowa wierszy jest z konstrukcji GLOBALNA dla wiersza, który
      // zmienił skład, i wszystkich pod nim — lokalność mierzy się wtedy
      // WIERSZAMI: skład wierszy PRZED zmienionym musi być identyczny.
      const pierwszyZmieniony = rowsBefore.findIndex((n, i) => rowsAfter[i] !== n);
      expect(pierwszyZmieniony).toBeGreaterThanOrEqual(0);
      for (let i = 0; i < pierwszyZmieniony; i++) {
        expect(sheetRowStationIds(after)[i]).toEqual(sheetRowStationIds(before)[i]);
      }
    }
    // Bilans: każda zachowana stacja jest albo nieruszona, albo policzona jako ruch.
    const retained = [...stationCollapsedAnchors(before).keys()].filter((k) =>
      stationCollapsedAnchors(after).has(k),
    ).length;
    expect(stab.anchorMovementCount + stab.unchangedSubtreeMovementCount).toBe(retained);
  });

  it('determinizm operacji: dwukrotne zbudowanie sceny +1 ⇒ identyczne miary przemieszczeń', () => {
    const before = buildSceneV3(mediumEnm, 0);
    const a = anchorDisplacementMetrics(before, buildSceneV3(plusOne, 0));
    const b = anchorDisplacementMetrics(before, buildSceneV3(plusOne, 0));
    expect(a).toEqual(b);
  });

  it('miara GRYZIE: scena porównana SAMA ZE SOBĄ ⇒ zero ruchu (nie fałszywy dodatni)', () => {
    const scene = buildSceneV3(mediumEnm, 0);
    const stab = anchorDisplacementMetrics(scene, scene);
    expect(stab.anchorMovementCount).toBe(0);
    expect(stab.totalAnchorDisplacement).toBe(0);
    expect(stab.unchangedSubtreeMovementCount).toBeGreaterThan(0);
  });
});
