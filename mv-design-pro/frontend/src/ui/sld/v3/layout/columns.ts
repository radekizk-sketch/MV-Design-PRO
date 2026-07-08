/**
 * SLD V3 — columns (SLD_CAD_SPEC_V3 §5.3, potok measure → bands → columns).
 *
 * Kolumny magistrali: prefix-sum deterministyczny nad `requiredStationWidth`
 * / `requiredSegmentLabelWidth` (measure.ts) ⇒ zero nadlewek z konstrukcji
 * (P1). Kolejność stacji z wejścia jest ZACHOWANA jeden-do-jednego w
 * wyjściu (kolumna `j` odpowiada `stations[j]`).
 *
 * Wyjście zawiera też ZAREZERWOWANE prostokąty slotów etykiet (spec §4):
 * pasmo nazw stacji (pod blokiem stacji) i slot etykiety segmentu
 * wchodzącego (nad osią magistrali, pasmo B1) — pozycje pionowe tych slotów
 * pochodzą z `bands.ts` (B5, B1), przekazywane jako parametr, żeby
 * `columns.ts` pozostał czystą arytmetyką 1D (szerokości) bez duplikowania
 * wiedzy o pasmach.
 *
 * F3 fix r3: normalizacja tekstu segmentu (`''`/whitespace = brak) korzysta
 * teraz z `normalizeSegmentText` (`./segments`) — TA SAMA funkcja, którą
 * używa `bands.ts` do liczenia wysokości B1 (wcześniej: dwie niezależne
 * implementacje tej samej reguły, ryzyko rozjazdu).
 * F3 fix r2: `computeColumns` liczy alternację 2-wierszową (`computeSegmentStagger`,
 * `./segments`) SAMODZIELNIE — ma na wejściu pełne `StationMeasureInput`,
 * więc nie trzeba przekazywać flagi z zewnątrz (w przeciwieństwie do
 * `bands.ts`, które NIE zna kształtu stacji — patrz decyzja architektoniczna
 * F2 udokumentowana tam). `ColumnsResult.segmentLabelTwoRow` eksponuje wynik
 * decyzji, żeby wołający mógł przekazać TĘ SAMĄ flagę do `computeBands` bez
 * liczenia jej po raz drugi.
 */

import { GRID, type V3Rect } from '../core/grid';
import { requiredSegmentLabelWidth, requiredStationWidth, snapUp, type StationMeasureInput } from './measure';
import { computeSegmentStagger, normalizeSegmentText, SEGMENT_LABEL_ROW_HEIGHT } from './segments';

/** Odstęp między kolumnami sąsiednich stacji (spec §5.3: `GAP(3×GRID)`). */
export const COLUMN_GAP = 3 * GRID;

export interface ColumnBandY {
  readonly y: number;
  readonly height: number;
}

export interface ColumnResult {
  readonly stationId: string;
  readonly x: number;
  readonly width: number;
  /** Zarezerwowany slot pasma NAZW (B5) pod blokiem tej stacji. */
  readonly nameSlot: V3Rect;
}

export interface SegmentLabelSlotResult {
  /** Indeks stacji, do której wchodzi ten segment (`stations[index]`). */
  readonly stationIndex: number;
  /** Zarezerwowany slot etykiety segmentu (B1) nad osią magistrali. */
  readonly rect: V3Rect;
}

export interface ColumnsResult {
  readonly columns: readonly ColumnResult[];
  readonly segmentLabelSlots: readonly SegmentLabelSlotResult[];
  readonly totalWidth: number;
  /** r2 (F3 fix): czy B1 wymaga alternacji 2-wierszowej (spec §5.2) — patrz
   *  `computeSegmentStagger` w `./segments`. Wołający przekazuje TĘ SAMĄ
   *  wartość do `computeBands` (drugi parametr), żeby wysokość pasma B1
   *  odpowiadała rozmieszczeniu slotów tu wyliczonemu. */
  readonly segmentLabelTwoRow: boolean;
}

export interface ComputeColumnsInput {
  readonly stations: readonly StationMeasureInput[];
  /** Tekst etykiety segmentu WCHODZĄCEGO do stacji o tym samym indeksie
   *  (pierwszy segment — od GPZ). `null` gdy stacja nie ma segmentu
   *  wejściowego (nie powinno się zdarzyć w praktyce, ale funkcja jest
   *  czystą arytmetyką i nie waliduje topologii — to zakres warstwy wyżej). */
  readonly incomingSegmentLabelTexts: readonly (string | null)[];
  /** Pasmo B5 (pasmo nazw) z `computeBands` — pozycja pionowa slotu nazw. */
  readonly nameSlotBand: ColumnBandY;
  /** Pasmo B1 (etykiety segmentów) z `computeBands` — pozycja slotu segmentu. */
  readonly segmentSlotBand: ColumnBandY;
}

/**
 * Kolumna stacji `j`: `width_j = max(requiredStationWidth_j,
 * requiredSegmentLabelWidth(segment wejściowy j))`, `x_j = x_{j-1} +
 * width_{j-1} + GAP`. Prefix-sum — deterministyczne, ta sama kolejność
 * wejścia daje tę samą kolejność i te same wartości wyjścia (§5.3, §7 P7).
 */
export function computeColumns(input: ComputeColumnsInput): ColumnsResult {
  const { stations, incomingSegmentLabelTexts, nameSlotBand, segmentSlotBand } = input;
  if (incomingSegmentLabelTexts.length !== stations.length) {
    throw new Error(
      'incomingSegmentLabelTexts musi mieć tę samą długość co stations (jeden segment wejściowy na stację, spec §5.3)',
    );
  }

  // r2 (F3 fix): decyzja alternacji 2-wierszowej — POLICZONA RAZ z tych
  // samych wejść (`stations`, `incomingSegmentLabelTexts`), współdzielona
  // przez normalizację (r3) z `bands.ts` (patrz `./segments`).
  const stagger = computeSegmentStagger(stations, incomingSegmentLabelTexts);

  const columns: ColumnResult[] = [];
  const segmentLabelSlots: SegmentLabelSlotResult[] = [];
  let x = 0;

  stations.forEach((station, index) => {
    const stationWidth = requiredStationWidth(station);
    // FIX-4 (recenzja F2) + r3: pusty/whitespace string ≠ realny tekst
    // segmentu — `normalizeSegmentText` (współdzielone z `bands.ts`) traktuje
    // go jak brak, żeby nie rezerwować slotu ani szerokości pod etykietę,
    // która nigdy nie zostanie narysowana.
    const segmentText = normalizeSegmentText(incomingSegmentLabelTexts[index]);
    const segmentWidth = segmentText != null ? requiredSegmentLabelWidth(segmentText) : 0;
    // snapUp na wyjściu z max(...) — measure.ts już zwraca requiredStationWidth
    // na siatce, ale requiredSegmentLabelWidth (celowo, spec §5.1) nie jest
    // przycinane w measure.ts; kolumna musi być na siatce (grid_probe §11.2).
    const width = snapUp(Math.max(stationWidth, segmentWidth));

    columns.push({
      stationId: station.id,
      x,
      width,
      nameSlot: { x, y: nameSlotBand.y, width, height: nameSlotBand.height },
    });

    if (segmentText != null) {
      // r2: w trybie 2-wierszowym każdy slot zajmuje JEDEN wiersz (nie całe
      // podwojone pasmo B1), przesunięty naprzemiennie góra/dół po
      // parzystości indeksu (`stagger.rowOf`) — sąsiednie stacje trafiają w
      // RÓŻNE wiersze, więc nawet szerokie etykiety wykraczające poza własną
      // kolumnę nie kolidują wizualnie z sąsiadem.
      const rect = stagger.twoRow
        ? {
            x,
            y: segmentSlotBand.y + stagger.rowOf[index] * SEGMENT_LABEL_ROW_HEIGHT,
            width,
            height: SEGMENT_LABEL_ROW_HEIGHT,
          }
        : { x, y: segmentSlotBand.y, width, height: segmentSlotBand.height };
      segmentLabelSlots.push({ stationIndex: index, rect });
    }

    x += width + COLUMN_GAP;
  });

  const totalWidth = columns.length > 0 ? x - COLUMN_GAP : 0;
  return { columns, segmentLabelSlots, totalWidth, segmentLabelTwoRow: stagger.twoRow };
}

/** Wyrocznia pomocnicza: wszystkie x kolumn i szerokości na siatce (spec §11.2). */
export function allColumnsOnGrid(result: ColumnsResult): boolean {
  return result.columns.every((c) => c.x % GRID === 0 && c.width % GRID === 0);
}
