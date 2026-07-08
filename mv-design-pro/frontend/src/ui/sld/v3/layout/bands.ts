/**
 * SLD V3 — bands (SLD_CAD_SPEC_V3 §5.2, potok measure → bands → columns).
 *
 * Pasma poziome widoku sieci, od góry: B1 etykiety segmentów magistrali,
 * B2 oś magistrali + porty, B3 DER przy magistrali, B4 blok stacji, B5
 * pasmo nazw stacji, B6 korytarz lateralu pionowego. Czysta arytmetyka —
 * WEJŚCIEM są już policzone wysokości treści (z `measure.ts`), nie surowe
 * obiekty stacji; `bands.ts` tylko je składa w pasma, które się STYKAJĄ
 * (bez odstępu) i NIGDY nie nachodzą. Wszystkie y na siatce (P1/P7).
 *
 * DECYZJA/LUKA SPEC (patrz raport końcowy): B6 "korytarz lateralu (pionowy)"
 * jest w tabeli §5.2 wymieniony razem z pasmami POZIOMYMI, choć opisuje
 * szerokość kolumny (rozszerzenie w pionie sieci o kolejny wiersz stacji
 * odgałęzienia), nie wysokość samego wiersza bieżącej magistrali. Tu
 * modelujemy B6 jako dodatkowe pasmo na DOLE stosu (miejsce na ewentualny
 * pierwszy odcinek lateralu schodzącego w dół od stacji) — realne
 * rozmieszczenie całego lateralu (rekurencyjny stos pasm B1..B6 dla
 * kolejnego wiersza) to zakres F3 (routing) / F5 (kompozycja).
 */

import { GRID, rectsOverlap, type V3Rect } from '../core/grid';
import { snapUp } from './measure';

export type BandId = 'B1' | 'B2' | 'B3' | 'B4' | 'B5' | 'B6';

export const BAND_ORDER: readonly BandId[] = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6'];

/**
 * Moduł stały pasma B2 (oś magistrali + porty WE/WY/ODG + podpisy t3) —
 * nie zależy od treści stacji, tylko od stałej geometrii osi/portów, więc
 * jest stałą, a nie polem wejściowym per stacja.
 */
export const BUS_AXIS_BAND_HEIGHT = 4 * GRID;

/**
 * Wysokości zawartości JEDNEJ stacji/kolumny — wejście `computeBands` (spec
 * §5.2: "wejście = per-stacja wysokości zawartości"). Liczby pochodzą z
 * `measure.ts` (np. `stationBlockHeight`, `stationNameBandHeight`) — bands
 * nie zna kształtu danych stacji, tylko wynik pomiaru.
 */
export interface StationBandHeights {
  /** B1: wysokość etykiety segmentu WCHODZĄCEGO do tej stacji (1 wiersz t2;
   *  2 wiersze gdy segment za krótki na etykietę w jednej linii — §5.2). */
  readonly incomingSegmentLabelHeight: number;
  /** B3: symbol DER + etykieta mocy przy magistrali; 0 gdy brak DER na SN. */
  readonly derBandHeight?: number;
  /** B4: blok stacji (szyna SN + kolumny pól + TR + szyna nN). */
  readonly stationBlockHeight: number;
  /** B5: pasmo nazw (suma wierszy nazwa/kod/kVA/typ obecnych). */
  readonly nameBandHeight: number;
  /** B6: korytarz lateralu pionowego pod stacją; 0 gdy stacja bez
   *  odgałęzienia schodzącego w dół (patrz DECYZJA w nagłówku pliku). */
  readonly lateralCorridorHeight?: number;
}

export interface BandsResult {
  readonly bands: Readonly<Record<BandId, { readonly y: number; readonly height: number }>>;
  readonly totalHeight: number;
}

function maxOf(values: readonly number[], fallback: number): number {
  if (values.length === 0) return fallback;
  return Math.max(fallback, ...values);
}

/**
 * Składa pasma B1..B6 z wysokości treści wszystkich stacji wiersza.
 * Wysokość KAŻDEGO pasma = max po wszystkich stacjach (spec §5.2:
 * "Wysokości pasm = max po wszystkich stacjach wiersza"). Pasma się STYKAJĄ
 * (y_next = y_prev + height_prev) — brak odstępu, brak nachodzenia.
 */
export function computeBands(stations: readonly StationBandHeights[]): BandsResult {
  const rawHeights: Record<BandId, number> = {
    B1: maxOf(stations.map((s) => s.incomingSegmentLabelHeight), 0),
    B2: BUS_AXIS_BAND_HEIGHT,
    B3: maxOf(stations.map((s) => s.derBandHeight ?? 0), 0),
    B4: maxOf(stations.map((s) => s.stationBlockHeight), 0),
    B5: maxOf(stations.map((s) => s.nameBandHeight), 0),
    B6: maxOf(stations.map((s) => s.lateralCorridorHeight ?? 0), 0),
  };

  const bands = {} as Record<BandId, { y: number; height: number }>;
  let cursor = 0;
  for (const id of BAND_ORDER) {
    const height = snapUp(rawHeights[id]);
    bands[id] = { y: cursor, height };
    cursor += height;
  }
  return { bands, totalHeight: cursor };
}

/** Wyrocznia pomocnicza (testy/consumers): żadna para pasm z wyniku
 *  `computeBands` się nie przecina (spec §11: kolizje = 0 z konstrukcji). */
export function bandsAsRects(result: BandsResult, x: number, width: number): readonly V3Rect[] {
  return BAND_ORDER.map((id) => ({ x, y: result.bands[id].y, width, height: result.bands[id].height }));
}

export function noBandsOverlap(result: BandsResult, x: number, width: number): boolean {
  const rects = bandsAsRects(result, x, width);
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (rectsOverlap(rects[i], rects[j])) return false;
    }
  }
  return true;
}
