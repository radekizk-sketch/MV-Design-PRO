/*
 * Model i adaptery okna „Stabilność SSCI" (ui2/wyniki/ssci). Wyłącznie MAPOWANIE
 * gotowego werdyktu backendu na model prezentacji (chip werdyktu, wiersze metryk),
 * ZERO fizyki i ZERO ocen lokalnych — werdykt, metryki, flagi i istotność pochodzą
 * z pól obliczonych przez builder warstwy analizy. Kolory (istotność) to czysta
 * prezentacja wyprowadzona z FLAG backendu (przecięcie modułów, okrążenia,
 * rezystancja ujemna) — nie z ponownego liczenia kryterium.
 *
 * Formatery (przecinek PL) należą do `strings.ts`; tu tylko dobór etykiet, kolejność
 * i istotność. Helpery są czyste (wejście→wyjście) i pokryte testem `model.test.ts`.
 */

import type { WerdyktKod, WerdyktSsci } from './api';
import { SSCI_STRINGS as S, fmtGain, fmtHz, fmtStopnie, type IstotnoscStanu } from './strings';

// ---------------------------------------------------------------------------
// Werdykt → istotność (kolor chipu) i etykieta PL
// ---------------------------------------------------------------------------

/** Istotność chipu werdyktu (dobór koloru — wyłącznie prezentacja). */
export function istotnoscWerdyktu(verdict: WerdyktKod): IstotnoscStanu {
  switch (verdict) {
    case 'stabilny':
      return 'ok';
    case 'ryzyko SSCI':
      return 'warn';
    case 'niestabilny':
      return 'err';
    case 'brak danych':
    default:
      return 'neutral';
  }
}

/** Etykieta PL werdyktu (kod backendu → tekst UI). */
export function etykietaWerdyktu(verdict: WerdyktKod): string {
  switch (verdict) {
    case 'stabilny':
      return S.werdyktStabilny;
    case 'ryzyko SSCI':
      return S.werdyktRyzyko;
    case 'niestabilny':
      return S.werdyktNiestabilny;
    case 'brak danych':
    default:
      return S.werdyktBrakDanych;
  }
}

// ---------------------------------------------------------------------------
// Wiersze metryk kryterium impedancyjnego (grid)
// ---------------------------------------------------------------------------

/** Pojedynczy wiersz metryki (etykieta + wartość PL + opcjonalny opis/istotność). */
export interface WierszMetryki {
  readonly klucz: string;
  readonly etykieta: string;
  readonly wartosc: string;
  readonly opis?: string;
  readonly istotnosc: IstotnoscStanu;
}

/** Formatuje częstotliwość [Hz] lub kreskę, gdy brak (null). */
function fmtCzest(f: number | null): string {
  return f === null ? S.kreska : `${fmtHz(f)} ${S.jednHz}`;
}

/**
 * Mapuje werdykt na wiersze metryk (kolejność stała, deterministyczna). Wartości
 * i flagi pochodzą z backendu; istotność koloru wyprowadzona z FLAG (przecięcie
 * modułów, liczba okrążeń, obecność rezystancji ujemnej) — nie z liczenia fizyki.
 * Przy „brak danych" metryki liczbowe są puste (null) → renderowane jako „—".
 */
export function naMetryki(werdykt: WerdyktSsci): WierszMetryki[] {
  const margines =
    werdykt.worst_phase_margin_deg === null
      ? S.kreska
      : `${fmtStopnie(werdykt.worst_phase_margin_deg)} ${S.jednStopnie}`;
  const odleglosc =
    werdykt.nearest_to_minus_one === null
      ? S.kreska
      : fmtGain(werdykt.nearest_to_minus_one.distance_to_minus_one);
  const rezystancja = werdykt.negative_resistance_present
    ? werdykt.negative_resistance_f_hz === null
      ? S.metrRezystancjaObecna
      : `${S.metrRezystancjaObecna} (${S.metrPrzyF} ${fmtHz(werdykt.negative_resistance_f_hz)} ${S.jednHz})`
    : S.metrRezystancjaBrak;

  return [
    {
      klucz: 'max-gain',
      etykieta: S.metrMaxGain,
      opis: S.metrMaxGainOpis,
      wartosc: werdykt.max_minor_loop_gain === null ? S.kreska : fmtGain(werdykt.max_minor_loop_gain),
      istotnosc: werdykt.has_magnitude_crossover ? 'warn' : 'ok',
    },
    {
      klucz: 'margines',
      etykieta: S.metrMargines,
      opis: S.metrMarginesOpis,
      wartosc: margines,
      istotnosc: 'neutral',
    },
    {
      klucz: 'czest-winna',
      etykieta: S.metrCzestWinna,
      opis: S.metrCzestWinnaOpis,
      wartosc: fmtCzest(werdykt.offending_frequency_hz),
      istotnosc: werdykt.offending_frequency_hz === null ? 'neutral' : 'warn',
    },
    {
      klucz: 'odleglosc',
      etykieta: S.metrOdlegloscMinusJeden,
      opis: S.metrOdlegloscOpis,
      wartosc: odleglosc,
      istotnosc: 'neutral',
    },
    {
      klucz: 'okrazenia',
      etykieta: S.metrOkrazenia,
      wartosc: String(werdykt.encirclement_count),
      istotnosc: werdykt.encirclement_count >= 1 ? 'err' : 'ok',
    },
    {
      klucz: 'rezystancja-ujemna',
      etykieta: S.metrRezystancjaUjemna,
      wartosc: rezystancja,
      istotnosc: werdykt.negative_resistance_present ? 'warn' : 'ok',
    },
  ];
}

/** Identyfikacja przekształtnika/węzła werdyktu (etykieta chipu) — może być pusta. */
export function etykietaPrzekształtnika(werdykt: WerdyktSsci): string | null {
  return werdykt.converter_ref ?? null;
}
