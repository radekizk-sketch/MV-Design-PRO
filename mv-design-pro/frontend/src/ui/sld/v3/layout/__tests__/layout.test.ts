/**
 * SLD V3 F2 — wyrocznie potoku measure → bands → columns (SLD_CAD_SPEC_V3
 * §5.1–§5.3, §11). Wszystkie testy na SYNTETYKACH enumerowanych (pętle po
 * siatce parametrów) — zero losowości, zgodnie z P7 (determinizm).
 */
import { describe, expect, it } from 'vitest';

import { GRID, rectsOverlap, snapUp as snapUpFromGrid, type V3Rect } from '../../core/grid';
import { labelLineHeight, measureLabelWidth } from '../../core/text';
import { SYMBOL_DEFS } from '../../symbols/defs';
import { FIELD_ROLE, type FieldRole } from '../../../v2/domain/apparatusContracts';
import type { MiniBlockBayDescriptor } from '../../../v2/renderer/MiniBlockRmuRenderer';
import {
  requiredSegmentLabelWidth,
  requiredStationWidth,
  snapUp,
  stationBlockHeight,
  stationNameBandHeight,
  type StationMeasureInput,
} from '../measure';
import { computeBands, noBandsOverlap, type StationBandHeights } from '../bands';
import { allColumnsOnGrid, computeColumns, type ComputeColumnsInput } from '../columns';

function makeBay(fieldRole: FieldRole, index: number): MiniBlockBayDescriptor {
  return {
    bayRef: `bay-${index}`,
    fieldRole,
    designation: `Pole ${index}`,
    hasMissingRequiredDevice: false,
  };
}

/** Stacja syntetyczna: `bayCount - 1` pól liniowych + 1 pole transformatorowe. */
function makeStation(id: string, nameLength: number, bayCount: number): StationMeasureInput {
  const bays: MiniBlockBayDescriptor[] = [];
  for (let i = 0; i < bayCount - 1; i++) bays.push(makeBay(FIELD_ROLE.RMU_LINE, i));
  bays.push(makeBay(FIELD_ROLE.RMU_TRANSFORMER, bayCount - 1));
  return {
    id,
    name: 'A'.repeat(Math.max(nameLength, 1)),
    stationCode: `S${String(1).padStart(2, '0')}`,
    transformerRatedKva: 630,
    stationTypeLabel: 'stacja przelotowa',
    snBays: bays,
  };
}

function bandHeightsFor(station: StationMeasureInput, incomingSegmentLabelText: string | null): StationBandHeights {
  return {
    incomingSegmentLabelHeight: incomingSegmentLabelText != null ? labelLineHeight('t2') : 0,
    stationBlockHeight: stationBlockHeight(station),
    nameBandHeight: stationNameBandHeight(station),
  };
}

function buildColumnsForStations(
  stations: readonly StationMeasureInput[],
  incomingSegmentLabelTexts: readonly (string | null)[],
) {
  const bandsResult = computeBands(stations.map((s, i) => bandHeightsFor(s, incomingSegmentLabelTexts[i])));
  const input: ComputeColumnsInput = {
    stations,
    incomingSegmentLabelTexts,
    nameSlotBand: bandsResult.bands.B5,
    segmentSlotBand: bandsResult.bands.B1,
  };
  const columnsResult = computeColumns(input);
  return { bandsResult, columnsResult };
}

describe('V3 layout — measure (spec §5.1)', () => {
  it('requiredStationWidth i requiredSegmentLabelWidth są na siatce po snapUp', () => {
    const station = makeStation('s1', 10, 3);
    expect(requiredStationWidth(station) % GRID).toBe(0);
    expect(snapUp(requiredSegmentLabelWidth('YAKXS 3×120/16 · 90 m')) % GRID).toBe(0);
  });

  it('requiredStationWidth rośnie z liczbą pól', () => {
    const small = makeStation('s1', 4, 2);
    const big = makeStation('s1', 4, 5);
    expect(requiredStationWidth(big)).toBeGreaterThan(requiredStationWidth(small));
  });
});

describe('V3 layout — measure (spec §5.1, FIX-3: rezerwacja etykiet WŁASNYCH aparatów/portów)', () => {
  const baseFields = {
    id: 's1',
    name: 'St',
    stationCode: null,
    transformerRatedKva: null,
    stationTypeLabel: null,
  } as const;

  it('dłuższy bay.designation (oznacznik aparatu) poszerza requiredStationWidth', () => {
    const shortDesignation: MiniBlockBayDescriptor = {
      bayRef: 'b1',
      fieldRole: FIELD_ROLE.RMU_LINE,
      designation: 'A',
      hasMissingRequiredDevice: false,
    };
    const longDesignation: MiniBlockBayDescriptor = {
      ...shortDesignation,
      designation: 'kier. GPZ Południowy-Wschód (odcinek magistralny)',
    };
    const withShort: StationMeasureInput = { ...baseFields, snBays: [shortDesignation] };
    const withLong: StationMeasureInput = { ...baseFields, snBays: [longDesignation] };
    expect(requiredStationWidth(withLong)).toBeGreaterThan(requiredStationWidth(withShort));
  });

  it('bayDirectionCaptions z długim podpisem kierunku poszerza requiredStationWidth', () => {
    const bay: MiniBlockBayDescriptor = {
      bayRef: 'b1',
      fieldRole: FIELD_ROLE.RMU_LINE,
      designation: '',
      hasMissingRequiredDevice: false,
    };
    const withoutCaption: StationMeasureInput = { ...baseFields, snBays: [bay] };
    const withCaption: StationMeasureInput = {
      ...baseFields,
      snBays: [bay],
      bayDirectionCaptions: ['kier. GPZ Południe (bardzo długi opis kierunku zasilania)'],
    };
    expect(requiredStationWidth(withCaption)).toBeGreaterThan(requiredStationWidth(withoutCaption));
  });

  it('brak designation i brak bayDirectionCaptions ⇒ szerokość kolumny = tylko footprint aparatu (bez regresji)', () => {
    const bay: MiniBlockBayDescriptor = {
      bayRef: 'b1',
      fieldRole: FIELD_ROLE.RMU_LINE,
      designation: '',
      hasMissingRequiredDevice: false,
    };
    const station: StationMeasureInput = { ...baseFields, name: 'A', snBays: [bay] };
    const expectedFootprintWidth = Math.max(SYMBOL_DEFS.disconnector.width, SYMBOL_DEFS.breaker.width);
    const expectedNameWidth = measureLabelWidth('A', 't1');
    expect(requiredStationWidth(station)).toBe(
      snapUp(Math.max(expectedFootprintWidth, expectedNameWidth) + 2 * GRID),
    );
  });

  it('designation złożony wyłącznie z białych znaków traktowany jak brak (spójnie z FIX-4)', () => {
    const emptyDesignation: MiniBlockBayDescriptor = {
      bayRef: 'b1',
      fieldRole: FIELD_ROLE.RMU_LINE,
      designation: '',
      hasMissingRequiredDevice: false,
    };
    const whitespaceDesignation: MiniBlockBayDescriptor = { ...emptyDesignation, designation: '   ' };
    const withEmpty: StationMeasureInput = { ...baseFields, snBays: [emptyDesignation] };
    const withWhitespace: StationMeasureInput = { ...baseFields, snBays: [whitespaceDesignation] };
    expect(requiredStationWidth(withWhitespace)).toBe(requiredStationWidth(withEmpty));
  });
});

describe('V3 core/grid — snapUp (FIX-5: przeniesione z measure.ts, re-eksport zachowany)', () => {
  it('zaokrągla W GÓRĘ do wielokrotności GRID (ceil)', () => {
    expect(snapUpFromGrid(1)).toBe(8);
    expect(snapUpFromGrid(8)).toBe(8);
    expect(snapUpFromGrid(9)).toBe(16);
  });

  it('re-eksport z measure.ts jest tą samą funkcją co core/grid.ts', () => {
    expect(snapUp).toBe(snapUpFromGrid);
  });
});

describe('V3 layout — columns (spec §5.3): kolumna szersza przy dłuższej etykiecie segmentu', () => {
  it('krótka nazwa stacji + długa etykieta segmentu wejściowego → szerokość zdominowana przez etykietę', () => {
    const station = makeStation('s1', 3, 1);
    const shortLabel = 'a';
    const longLabel = 'YAKXS 3×120/16 · 90 m — bardzo długi opis odcinka SN';

    const short = buildColumnsForStations([station], [shortLabel]);
    const long = buildColumnsForStations([station], [longLabel]);

    expect(long.columnsResult.columns[0].width).toBeGreaterThan(short.columnsResult.columns[0].width);
  });

  it('etykieta segmentu krótsza niż wymagania stacji NIE zwęża kolumny poniżej requiredStationWidth', () => {
    const station = makeStation('s1', 20, 4);
    const tiny = buildColumnsForStations([station], ['x']);
    expect(tiny.columnsResult.columns[0].width).toBeGreaterThanOrEqual(requiredStationWidth(station));
  });
});

describe('V3 layout — columns (spec §5.3, FIX-4): pusty/whitespace segmentText ≠ slot', () => {
  it('"" nie tworzy wpisu w segmentLabelSlots ani nie poszerza kolumny', () => {
    const station = makeStation('s1', 20, 4);
    const withNull = buildColumnsForStations([station], [null]);
    const withEmpty = buildColumnsForStations([station], ['']);
    expect(withEmpty.columnsResult.segmentLabelSlots).toHaveLength(0);
    expect(withEmpty.columnsResult.columns[0].width).toBe(withNull.columnsResult.columns[0].width);
  });

  it('"   " (same białe znaki) nie tworzy wpisu w segmentLabelSlots ani nie poszerza kolumny', () => {
    const station = makeStation('s1', 20, 4);
    const withNull = buildColumnsForStations([station], [null]);
    const withWhitespace = buildColumnsForStations([station], ['   ']);
    expect(withWhitespace.columnsResult.segmentLabelSlots).toHaveLength(0);
    expect(withWhitespace.columnsResult.columns[0].width).toBe(withNull.columnsResult.columns[0].width);
  });
});

describe('V3 layout — bands (spec §5.2): pasma stykają się, nigdy nie nachodzą', () => {
  const stations = [makeStation('s1', 5, 2), makeStation('s2', 25, 5), makeStation('s3', 2, 3)];
  const bandsResult = computeBands(stations.map((s) => bandHeightsFor(s, 'seg')));

  it('suma wysokości pasm = pozycja końca (totalHeight)', () => {
    const order: Array<keyof typeof bandsResult.bands> = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6'];
    const sum = order.reduce((acc, id) => acc + bandsResult.bands[id].height, 0);
    expect(sum).toBe(bandsResult.totalHeight);
  });

  it('żadna para pasm się nie przecina (rectsOverlap)', () => {
    expect(noBandsOverlap(bandsResult, 0, 800)).toBe(true);
  });

  it('wszystkie y pasm są na siatce', () => {
    for (const id of ['B1', 'B2', 'B3', 'B4', 'B5', 'B6'] as const) {
      expect(bandsResult.bands[id].y % GRID).toBe(0);
      expect(bandsResult.bands[id].height % GRID).toBe(0);
    }
  });

  it('wysokość pasma = max po wszystkich stacjach wiersza (nie suma)', () => {
    // B4 (blok stacji) największy dla s2 (5 pól) — pasmo B4 = dokładnie ta wartość.
    const b4Heights = stations.map((s) => stationBlockHeight(s));
    expect(bandsResult.bands.B4.height).toBe(snapUpForTest(Math.max(...b4Heights)));
  });
});

function snapUpForTest(value: number): number {
  return Math.ceil(value / GRID) * GRID;
}

describe('V3 layout — columns (spec §5.3, determinizm): prefix-sum deterministyczny', () => {
  const stations = [makeStation('s1', 5, 2), makeStation('s2', 12, 4), makeStation('s3', 30, 3)];
  const labels = ['15 kV', null, 'YAKXS 3×120/16 · 40 m'];

  it('to samo wejście ⇒ identyczny wynik (dwukrotne wywołanie, głęboka równość)', () => {
    const first = buildColumnsForStations(stations, labels);
    const second = buildColumnsForStations(stations, labels);
    expect(second.columnsResult).toEqual(first.columnsResult);
    expect(second.bandsResult).toEqual(first.bandsResult);
  });

  it('kolejność stacji jest zachowana (kolumna j ↔ stations[j])', () => {
    const { columnsResult } = buildColumnsForStations(stations, labels);
    expect(columnsResult.columns.map((c) => c.stationId)).toEqual(['s1', 's2', 's3']);
  });

  it('x rośnie monotonicznie (prefix-sum) i x_0 = 0', () => {
    const { columnsResult } = buildColumnsForStations(stations, labels);
    expect(columnsResult.columns[0].x).toBe(0);
    for (let i = 1; i < columnsResult.columns.length; i++) {
      expect(columnsResult.columns[i].x).toBeGreaterThan(columnsResult.columns[i - 1].x);
    }
  });

  it('wszystkie x kolumn i szerokości są na siatce (grid_probe)', () => {
    const { columnsResult } = buildColumnsForStations(stations, labels);
    expect(allColumnsOnGrid(columnsResult)).toBe(true);
    for (const c of columnsResult.columns) {
      expect(c.x % GRID).toBe(0);
      expect(c.width % GRID).toBe(0);
    }
  });
});

describe('V3 layout — property: żadne dwa zarezerwowane sloty się nie przecinają (spec §11.1 z konstrukcji)', () => {
  // Enumeracja syntetyczna (bez losowości): 3 długości nazw × 3 długości
  // etykiet segmentu × 4 liczby pól (2..5) — dwie stacje sąsiadujące per
  // kombinacja, sprawdzamy WSZYSTKIE pary zarezerwowanych prostokątów
  // (sloty nazw, sloty etykiet segmentów, bboxy bloków stacji B4).
  const nameLengths = [2, 12, 30];
  const labelLengths = [0, 8, 45];
  const bayCounts = [2, 3, 4, 5];

  for (const nameLen of nameLengths) {
    for (const labelLen of labelLengths) {
      for (const bayCount of bayCounts) {
        it(`nazwa=${nameLen}zn, etykieta=${labelLen}zn, pola=${bayCount}: zero kolizji slotów`, () => {
          const stationA = makeStation('a', nameLen, bayCount);
          // Stacja B ma odwrotne parametry, żeby wymusić różne szerokości kolumn.
          const stationB = makeStation('b', nameLengths[nameLengths.length - 1 - nameLengths.indexOf(nameLen)], bayCounts[bayCounts.length - 1 - bayCounts.indexOf(bayCount)]);
          const labelText = labelLen > 0 ? 'X'.repeat(labelLen) : null;
          const { bandsResult, columnsResult } = buildColumnsForStations(
            [stationA, stationB],
            [labelText, labelText],
          );

          const reservedRects: V3Rect[] = [];
          for (const col of columnsResult.columns) {
            reservedRects.push(col.nameSlot);
            reservedRects.push({ x: col.x, y: bandsResult.bands.B4.y, width: col.width, height: bandsResult.bands.B4.height });
          }
          for (const slot of columnsResult.segmentLabelSlots) {
            reservedRects.push(slot.rect);
          }

          for (let i = 0; i < reservedRects.length; i++) {
            for (let j = i + 1; j < reservedRects.length; j++) {
              expect(
                rectsOverlap(reservedRects[i], reservedRects[j]),
                `rect[${i}]=${JSON.stringify(reservedRects[i])} vs rect[${j}]=${JSON.stringify(reservedRects[j])}`,
              ).toBe(false);
            }
          }
        });
      }
    }
  }
});
