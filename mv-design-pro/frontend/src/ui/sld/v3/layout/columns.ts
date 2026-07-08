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
 */

import { GRID, type V3Rect } from '../core/grid';
import { requiredSegmentLabelWidth, requiredStationWidth, snapUp, type StationMeasureInput } from './measure';

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

  const columns: ColumnResult[] = [];
  const segmentLabelSlots: SegmentLabelSlotResult[] = [];
  let x = 0;

  stations.forEach((station, index) => {
    const stationWidth = requiredStationWidth(station);
    // FIX-4 (recenzja F2): pusty/whitespace string ≠ realny tekst segmentu —
    // traktujemy go jak brak, żeby nie rezerwować slotu ani szerokości pod
    // etykietę, która nigdy nie zostanie narysowana.
    const rawSegmentText = incomingSegmentLabelTexts[index];
    const segmentText = rawSegmentText?.trim() ? rawSegmentText : null;
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
      segmentLabelSlots.push({
        stationIndex: index,
        rect: { x, y: segmentSlotBand.y, width, height: segmentSlotBand.height },
      });
    }

    x += width + COLUMN_GAP;
  });

  const totalWidth = columns.length > 0 ? x - COLUMN_GAP : 0;
  return { columns, segmentLabelSlots, totalWidth };
}

/** Wyrocznia pomocnicza: wszystkie x kolumn i szerokości na siatce (spec §11.2). */
export function allColumnsOnGrid(result: ColumnsResult): boolean {
  return result.columns.every((c) => c.x % GRID === 0 && c.width % GRID === 0);
}
