/**
 * SLD V3 F2 — wyrocznie potoku measure → bands → columns (SLD_CAD_SPEC_V3
 * §5.1–§5.3, §11). Wszystkie testy na SYNTETYKACH enumerowanych (pętle po
 * siatce parametrów) — zero losowości, zgodnie z P7 (determinizm).
 */
import { describe, expect, it } from 'vitest';

import { GRID, rectsOverlap, snapUp as snapUpFromGrid, type V3Rect } from '../../core/grid';
import { measureLabelWidth } from '../../core/text';
import { SYMBOL_DEFS } from '../../symbols/defs';
import { FIELD_ROLE, type FieldRole } from '../../../v2/domain/apparatusContracts';
import type { MiniBlockBayDescriptor } from '../../../v2/renderer/MiniBlockRmuRenderer';
import {
  requiredSegmentLabelWidth,
  requiredStationWidth,
  snapUp,
  stationBlockHeight,
  stationNameBandHeight,
  stationPortCaptionHeight,
  type StationMeasureInput,
} from '../measure';
import { BUS_AXIS_BAND_HEIGHT, computeBands, noBandsOverlap, type StationBandHeights } from '../bands';
import { allColumnsOnGrid, computeColumns, type ComputeColumnsInput } from '../columns';
import { computeSegmentStagger, normalizeSegmentText, SEGMENT_LABEL_ROW_HEIGHT } from '../segments';

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

// F3 fix r3: przekazujemy SUROWY tekst (nie gotową wysokość) — normalizacja
// pustości/whitespace dzieje się WEWNĄTRZ `computeBands` (przez
// `normalizeSegmentText`, `../segments`), tą samą funkcją co w
// `computeColumns`. Wcześniej ten helper liczył `!= null` (bez trim), co
// dawało wysokość w bands dla `''`, a `columns.ts` (FIX-4) poprawnie
// pomijał slot — rozjazd, który r3 usuwa u ŹRÓDŁA.
function bandHeightsFor(station: StationMeasureInput, incomingSegmentLabelText: string | null): StationBandHeights {
  return {
    incomingSegmentLabelText,
    portCaptionHeight: stationPortCaptionHeight(station),
    stationBlockHeight: stationBlockHeight(station),
    nameBandHeight: stationNameBandHeight(station),
  };
}

function buildColumnsForStations(
  stations: readonly StationMeasureInput[],
  incomingSegmentLabelTexts: readonly (string | null)[],
) {
  // r2 (F3 fix): stagger liczony RAZ z tych samych wejść, współdzielony
  // przez bands (flaga `segmentLabelTwoRow`) i columns (liczy sam, bo ma
  // pełne `StationMeasureInput`).
  const stagger = computeSegmentStagger(stations, incomingSegmentLabelTexts);
  const bandsResult = computeBands(
    stations.map((s, i) => bandHeightsFor(s, incomingSegmentLabelTexts[i])),
    stagger.twoRow,
  );
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

describe('V3 layout — bands (spec §5.2, F3 fix r1): B2 rośnie z treści (podpis kierunku pola)', () => {
  it('B2 = BUS_AXIS_BAND_HEIGHT + wiersz t3 gdy stacja ma podpis kierunku; bez podpisu — stała geometryczna (bez regresji)', () => {
    const station = makeStation('s1', 5, 2);
    const withoutCaption = bandHeightsFor(station, null);
    const stationWithCaption: StationMeasureInput = {
      ...station,
      bayDirectionCaptions: ['kier. GPZ Południe', null],
    };
    const withCaption = bandHeightsFor(stationWithCaption, null);

    const bandsWithout = computeBands([withoutCaption]);
    const bandsWith = computeBands([withCaption]);

    expect(bandsWithout.bands.B2.height).toBe(BUS_AXIS_BAND_HEIGHT);
    expect(bandsWith.bands.B2.height).toBeGreaterThan(bandsWithout.bands.B2.height);
  });

  it('dłuższy podpis kierunku vs krótszy: wysokość B2 zależy od OBECNOŚCI podpisu (jeden wiersz t3), nie od jego długości znakowej (bez zawijania linii — spec nie definiuje wielowierszowych podpisów t3)', () => {
    const station = makeStation('s1', 5, 2);
    const shortCaption: StationMeasureInput = { ...station, bayDirectionCaptions: ['kier. S03'] };
    const longCaption: StationMeasureInput = {
      ...station,
      bayDirectionCaptions: ['kier. GPZ Południowy-Wschód (bardzo długi opis kierunku)'],
    };
    const bandsShort = computeBands([bandHeightsFor(shortCaption, null)]);
    const bandsLong = computeBands([bandHeightsFor(longCaption, null)]);
    // Rośnie względem BRAKU podpisu (test powyżej); dla obu obecnych podpisów
    // wysokość identyczna — długość znakowa wpływa na SZEROKOŚĆ (measure.ts),
    // nie na wysokość wiersza t3 (bez zawijania, jedna prawda typografii).
    expect(bandsShort.bands.B2.height).toBe(bandsLong.bands.B2.height);
    expect(bandsShort.bands.B2.height).toBeGreaterThan(BUS_AXIS_BAND_HEIGHT);
  });
});

describe('V3 layout — bands/columns (spec §5.2, F3 fix r2): alternacja 2-wierszowa B1', () => {
  it('dwie sąsiednie WĄSKIE stacje z etykietą segmentu szerszą niż ich naturalny gabaryt → B1 dwuwierszowe, sloty naprzemienne (górny/dolny), zero nakładania', () => {
    // Stacje maksymalnie wąskie (1-znakowa nazwa, 1 pole transformatorowe) —
    // naturalny gabaryt mały; etykieta bardzo długa ⇒ z konstrukcji
    // wymagany warunek stagger (`requiredSegmentLabelWidth > requiredStationWidth`,
    // patrz DECYZJA w `segments.ts`).
    const stationA = makeStation('a', 1, 1);
    const stationB = makeStation('b', 1, 1);
    const wideLabel = 'YAKXS 3×120/16 · 90 m — bardzo długi opis odcinka magistrali SN';

    const stagger = computeSegmentStagger([stationA, stationB], [wideLabel, wideLabel]);
    expect(stagger.twoRow).toBe(true);

    const { bandsResult, columnsResult } = buildColumnsForStations([stationA, stationB], [wideLabel, wideLabel]);

    expect(bandsResult.bands.B1.height).toBe(snapUp(2 * SEGMENT_LABEL_ROW_HEIGHT));
    expect(columnsResult.segmentLabelSlots).toHaveLength(2);

    const [slotA, slotB] = columnsResult.segmentLabelSlots;
    expect(slotA.rect.y).not.toBe(slotB.rect.y); // naprzemiennie: różne wiersze
    expect(slotA.rect.height).toBe(SEGMENT_LABEL_ROW_HEIGHT); // jeden wiersz per slot, nie całe podwojone B1
    expect(slotB.rect.height).toBe(SEGMENT_LABEL_ROW_HEIGHT);
    expect(rectsOverlap(slotA.rect, slotB.rect)).toBe(false);
    // oba sloty mieszczą się WEWNĄTRZ pasma B1 (spójność geometrii pasmo↔slot)
    for (const slot of [slotA, slotB]) {
      expect(slot.rect.y).toBeGreaterThanOrEqual(bandsResult.bands.B1.y);
      expect(slot.rect.y + slot.rect.height).toBeLessThanOrEqual(bandsResult.bands.B1.y + bandsResult.bands.B1.height);
    }
  });

  it('gdy TYLKO JEDNA sąsiadująca stacja ma zbyt szeroką etykietę (druga bez segmentu) → B1 pozostaje jednowierszowe', () => {
    const stationA = makeStation('a', 1, 1);
    const stationB = makeStation('b', 30, 5);
    const wideLabel = 'YAKXS 3×120/16 · 90 m — bardzo długi opis odcinka magistrali SN';

    const stagger = computeSegmentStagger([stationA, stationB], [wideLabel, null]);
    expect(stagger.twoRow).toBe(false);

    const { bandsResult } = buildColumnsForStations([stationA, stationB], [wideLabel, null]);
    expect(bandsResult.bands.B1.height).toBe(snapUp(SEGMENT_LABEL_ROW_HEIGHT));
  });
});

describe('V3 layout — bands/columns (F3 fix r3): "" nie rezerwuje NIGDZIE (jedno wejście, spójna normalizacja)', () => {
  it('normalizeSegmentText: pusty/whitespace/null ⇒ null; realny tekst ⇒ niezmieniony (jedna prawda dla bands I columns)', () => {
    expect(normalizeSegmentText(null)).toBeNull();
    expect(normalizeSegmentText(undefined)).toBeNull();
    expect(normalizeSegmentText('')).toBeNull();
    expect(normalizeSegmentText('   ')).toBeNull();
    expect(normalizeSegmentText('15 kV')).toBe('15 kV');
  });

  it('"" i "   " dają IDENTYCZNY wynik co null zarówno w bands (B1) jak i w columns (segmentLabelSlots) — przed r3 "" dawał wysokość w bands bez slotu w columns', () => {
    const station = makeStation('s1', 10, 3);
    const withNull = buildColumnsForStations([station], [null]);
    const withEmpty = buildColumnsForStations([station], ['']);
    const withWhitespace = buildColumnsForStations([station], ['   ']);

    for (const variant of [withEmpty, withWhitespace]) {
      expect(variant.bandsResult.bands.B1.height).toBe(withNull.bandsResult.bands.B1.height);
      expect(variant.bandsResult.bands.B1.height).toBe(0); // brak segmentu ⇒ zero rezerwacji, nigdzie
      expect(variant.columnsResult.segmentLabelSlots).toHaveLength(0);
      expect(variant.columnsResult.columns[0].width).toBe(withNull.columnsResult.columns[0].width);
    }
  });
});

// ---------------------------------------------------------------------------
// r7b (F5a): ColumnResult.tapX + rezerwacja SegmentLabelSlotResult.rect
// wyśrodkowana na przęśle TAP-DO-TAP (nie na krawędziach kolumny).
// ---------------------------------------------------------------------------

describe('V3 layout — columns (r7b): tapX = zaczep magistrali (środek BLOKU, nie kolumny)', () => {
  it('tapX jest na siatce dla każdej kolumny', () => {
    const stations = [makeStation('s1', 5, 2), makeStation('s2', 25, 5), makeStation('s3', 2, 3)];
    const { columnsResult } = buildColumnsForStations(stations, [null, '15 kV', null]);
    for (const c of columnsResult.columns) {
      expect(c.tapX % GRID).toBe(0);
    }
  });

  it('tapX ≠ środek kolumny, gdy kolumna jest poszerzona przez etykietę segmentu (blok jest węższy niż kolumna)', () => {
    // Stacja z 1 polem TR (blok wąski) + bardzo długa etykieta segmentu
    // wejściowego (poszerza KOLUMNĘ znacznie ponad blok).
    const station = makeStation('s1', 1, 1);
    const wideLabel = 'YAKXS 3×120/16 · 90 m — bardzo długi opis odcinka magistrali SN';
    const { columnsResult } = buildColumnsForStations([station], [wideLabel]);
    const column = columnsResult.columns[0];
    const columnCenter = column.x + column.width / 2;
    expect(column.tapX).not.toBe(columnCenter);
    // tapX leży w LEWEJ części (bliżej x=0+GRID) kolumny poszerzonej w prawo
    // przez etykietę segmentu (blok zakotwiczony lewym marginesem GRID).
    expect(column.tapX).toBeLessThan(columnCenter);
  });

  it('pierwsza kolumna: tapX = GRID + blockWidth/2 (lewa krawędź świata = 0)', () => {
    const station = makeStation('s1', 3, 2);
    const { columnsResult } = buildColumnsForStations([station], [null]);
    expect(columnsResult.columns[0].x).toBe(0);
    expect(columnsResult.columns[0].tapX).toBeGreaterThan(0);
    expect(columnsResult.columns[0].tapX).toBeLessThan(columnsResult.columns[0].width);
  });
});

describe('V3 layout — columns (r7b): rezerwacja etykiety segmentu wyśrodkowana na przęśle tap-do-tap', () => {
  it('segmentLabelSlots[j].rect jest wyśrodkowany na [tapX_{j-1} lub 0, tapX_j], nie na krawędziach kolumny', () => {
    const stations = [makeStation('s1', 5, 2), makeStation('s2', 12, 4)];
    const labels = ['15 kV', 'YAKXS 3×70/16 · 45 m'];
    const { columnsResult } = buildColumnsForStations(stations, labels);

    columnsResult.segmentLabelSlots.forEach((slot) => {
      const spanStart = slot.stationIndex > 0 ? columnsResult.columns[slot.stationIndex - 1].tapX : 0;
      const spanEnd = columnsResult.columns[slot.stationIndex].tapX;
      const spanCenter = (spanStart + spanEnd) / 2;
      const rectCenter = slot.rect.x + slot.rect.width / 2;
      expect(Math.abs(rectCenter - spanCenter)).toBeLessThan(GRID);
      expect(slot.rect.width % GRID).toBe(0);
      expect(slot.rect.x % GRID).toBe(0);
    });
  });

  it('szerokość rezerwacji = snapUp(requiredSegmentLabelWidth(text)) — NIEZALEŻNA od szerokości kolumny (r7b)', () => {
    const station = makeStation('s1', 30, 5); // kolumna szeroka (duża stacja)
    const shortLabel = '15 kV';
    const { columnsResult } = buildColumnsForStations([station], [shortLabel]);
    const slot = columnsResult.segmentLabelSlots[0];
    expect(slot.rect.width).toBe(snapUp(requiredSegmentLabelWidth(shortLabel)));
    // Rezerwacja jest WĘŻSZA niż cała (szeroka) kolumna — dowód, że rect już
    // nie jest przypięty do krawędzi/szerokości kolumny (przed r7b: rect.width
    // === column.width zawsze).
    expect(slot.rect.width).toBeLessThan(columnsResult.columns[0].width);
  });
});

// ---------------------------------------------------------------------------
// r7b: computeSegmentStagger — dowód poprawki (dawny warunek, oparty o
// `requiredStationWidth`, NIE wykrywał realnego ryzyka nachodzenia na wąskim
// przęśle tap-do-tap pierwszej stacji; nowy warunek — oparty o `spanWidth`
// z `computeStationTaps` — wykrywa je poprawnie).
// ---------------------------------------------------------------------------

describe('V3 layout — computeSegmentStagger (r7b): dokładny warunek span > dawne przybliżenie kolumnowe', () => {
  it('etykieta zbyt szeroka na WĄSKIE przęsło (blisko krawędzi świata) pierwszej stacji, ale WĘŻSZA niż requiredStationWidth ⇒ dawny warunek (kolumnowy) NIE wykryłby ryzyka, nowy (span) wykrywa', () => {
    // Stacja bardzo wąska (1-polowa, TR-only) blisko x=0 ⇒ jej WŁASNY tap-span
    // (0..tapX_0) jest z natury mały (~połowa wąskiego bloku). Etykieta
    // umiarkowanej długości mieści się w `requiredStationWidth` (dawny
    // warunek: "OK"), ale NIE mieści się w realnym, wąskim przęśle 0..tapX_0.
    const stationA = makeStation('a', 1, 1);
    const stationB = makeStation('b', 1, 1);
    const moderateLabel = '15 kV AB'; // umyślnie krótsza niż WIDE_CABLE_LABEL

    const requiredStationWidthA = requiredStationWidth(stationA);
    const requiredLabelWidth = requiredSegmentLabelWidth(moderateLabel);
    // Sanity wejścia scenariusza: dawny warunek kolumnowy NIE oznaczyłby tej
    // etykiety jako "zbyt szerokiej" (mieści się w całej kolumnie stacji).
    expect(requiredLabelWidth).toBeLessThan(requiredStationWidthA);

    const stagger = computeSegmentStagger([stationA, stationB], [moderateLabel, moderateLabel]);
    // Nowy (span-aware) warunek WYKRYWA ryzyko mimo że dawny by go pominął.
    expect(stagger.twoRow).toBe(true);

    // Dowód praktyczny: z alternacją, finalne rezerwacje faktycznie się NIE
    // przecinają (gdyby stagger.twoRow było (błędnie) `false`, poniższe by
    // się nie powiodło — patrz analiza w segments.ts).
    const { columnsResult } = buildColumnsForStations([stationA, stationB], [moderateLabel, moderateLabel]);
    const [slotA, slotB] = columnsResult.segmentLabelSlots;
    expect(rectsOverlap(slotA.rect, slotB.rect)).toBe(false);
    expect(slotA.rect.y).not.toBe(slotB.rect.y);
  });

  it('gdy OBIE stacje mieszczą etykietę na WŁASNYM przęśle (spanWidth) ⇒ jeden wiersz wystarcza, zero kolizji', () => {
    const stations = [makeStation('a', 20, 4), makeStation('b', 20, 4)];
    const shortLabel = '15 kV';
    const stagger = computeSegmentStagger(stations, [shortLabel, shortLabel]);
    expect(stagger.twoRow).toBe(false);

    const { columnsResult } = buildColumnsForStations(stations, [shortLabel, shortLabel]);
    const [slotA, slotB] = columnsResult.segmentLabelSlots;
    expect(rectsOverlap(slotA.rect, slotB.rect)).toBe(false);
  });
});
