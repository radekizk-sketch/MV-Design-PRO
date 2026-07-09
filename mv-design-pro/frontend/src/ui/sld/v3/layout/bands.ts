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
 *
 * F3 fix r1: B2 (oś magistrali + porty) była stałą 32px niezależną od
 * treści; podpisy kierunku pola (t3, spec §9) muszą się w niej zmieścić —
 * B2 = stała geometria osi/portu (`BUS_AXIS_BAND_HEIGHT`) + wiersz t3 TYLKO
 * gdy którakolwiek stacja ma podpis (pole `portCaptionHeight`, patrz
 * `measure.ts` `stationPortCaptionHeight`).
 * F3 fix r2/r3: `incomingSegmentLabelHeight` (liczba) zastąpione przez
 * `incomingSegmentLabelText` (surowy tekst) — normalizacja pustości/
 * whitespace odbywa się TU, przez `normalizeSegmentText` (`./segments`),
 * tą samą funkcją co w `columns.ts` (wcześniej `''` dawał wysokość w bands,
 * a nie dawał slotu w columns — rozjazd, patrz `segments.ts`). Wielowierszowość
 * B1 (r2) to zewnętrzna decyzja (r9: `colorSegmentLabelRows`, `./segments`)
 * przekazana jako liczba `segmentLabelRowCount` — bands.ts pozostaje
 * nieświadome kształtu `StationMeasureInput` (decyzja architektoniczna F2
 * zachowana).
 */

import { GRID, rectsOverlap, type V3Rect } from '../core/grid';
import { snapUp } from './measure';
import { normalizeSegmentText, SEGMENT_LABEL_ROW_HEIGHT } from './segments';

export type BandId = 'B1' | 'B2' | 'B3' | 'B4' | 'B5' | 'B6';

export const BAND_ORDER: readonly BandId[] = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6'];

/**
 * Moduł stały pasma B2 (oś magistrali + porty WE/WY/ODG) — geometria osi i
 * wyprowadzenia portu NIE zależy od treści (to sam rysunek osi/kreski
 * portu); podpisy portów (t3) DOLICZANE są osobno z treści (r1, patrz nagłówek).
 */
export const BUS_AXIS_BAND_HEIGHT = 4 * GRID;

/**
 * Wysokości zawartości JEDNEJ stacji/kolumny — wejście `computeBands` (spec
 * §5.2: "wejście = per-stacja wysokości zawartości"). Liczby/teksty pochodzą
 * z `measure.ts` (np. `stationBlockHeight`, `stationNameBandHeight`) — bands
 * nie zna kształtu danych stacji, tylko wynik pomiaru.
 */
export interface StationBandHeights {
  /** B1: tekst etykiety segmentu WCHODZĄCEGO do tej stacji (surowy, przed
   *  normalizacją — `null`/pusty/whitespace = brak, spójnie z `columns.ts`,
   *  r3). Wysokość: `segmentLabelRowCount` wierszy t2 (r9, §5.2). */
  readonly incomingSegmentLabelText: string | null;
  /** B2: wysokość podpisu kierunku pola (t3, spec §9) tej stacji — 0/brak
   *  gdy żadne pole nie ma podpisu (r1; patrz `measure.ts`
   *  `stationPortCaptionHeight`). */
  readonly portCaptionHeight?: number;
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
 *
 * @param segmentLabelRowCount r2 (F3 fix; r9: liczba zamiast boolean —
 *   patrz `colorSegmentLabelRows`, `./segments`): liczba wierszy B1
 *   faktycznie potrzebnych (kolorowanie grafu przedziałów slotów etykiet
 *   segmentów, spec §5.2). Domyślnie `0`; gdy JAKAKOLWIEK stacja ma segment
 *   wejściowy, wysokość jest wymuszona na CO NAJMNIEJ 1 wiersz niezależnie od
 *   wartości parametru (obrona przed niespójnym wywołaniem — `bands.ts` i tak
 *   widzi `incomingSegmentLabelText` każdej stacji).
 */
export function computeBands(
  stations: readonly StationBandHeights[],
  segmentLabelRowCount = 0,
): BandsResult {
  const hasAnySegment = stations.some((s) => normalizeSegmentText(s.incomingSegmentLabelText) != null);
  const effectiveRowCount = hasAnySegment ? Math.max(segmentLabelRowCount, 1) : 0;
  const rawHeights: Record<BandId, number> = {
    B1: SEGMENT_LABEL_ROW_HEIGHT * effectiveRowCount,
    B2: BUS_AXIS_BAND_HEIGHT + maxOf(stations.map((s) => s.portCaptionHeight ?? 0), 0),
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
