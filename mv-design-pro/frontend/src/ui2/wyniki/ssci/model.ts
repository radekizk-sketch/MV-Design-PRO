/*
 * Model i adaptery okna „Stabilność SSCI" (ui2/wyniki/ssci). Wyłącznie MAPOWANIE
 * widoku backendu na model prezentacji — ZERO fizyki i ZERO ocen lokalnych.
 *
 * UCZCIWOŚĆ (2026-09-23): werdyktu SSCI nie ma — Z_grid(f) solvera liczone jest bez
 * przekładni transformatora (dla szyny 0,4 kV około 1400 razy za duże), więc każdy
 * wniosek z L = Z_grid/Z_conv jest niewiarygodny. Dawne mapy „werdykt → kolor /
 * etykieta" skasowane; metryki kryterium impedancyjnego to materiał audytowy BEZ
 * koloru (kolor z flag byłby oceną). Wskaźnik strefy ujemnej rezystancji
 * przekształtnika (Re_min, częstotliwość) zależy wyłącznie od modelu przekształtnika
 * i zostaje informacją na pierwszym planie.
 *
 * Formatery (przecinek PL) należą do `strings.ts`; helpery są czyste
 * (wejście→wyjście) i pokryte testem `model.test.ts`.
 */

import type { WerdyktSsci } from './api';
import { SSCI_STRINGS as S, fmtGain, fmtHz, fmtOhm, fmtStopnie } from './strings';

// ---------------------------------------------------------------------------
// Metryki kryterium impedancyjnego (materiał audytowy, bez koloru)
// ---------------------------------------------------------------------------

/** Pojedynczy wiersz metryki (etykieta + wartość PL + opcjonalny opis). */
export interface WierszMetryki {
  readonly klucz: string;
  readonly etykieta: string;
  readonly wartosc: string;
  readonly opis?: string;
}

/** Formatuje częstotliwość [Hz] lub kreskę, gdy brak (null). */
function fmtCzest(f: number | null): string {
  return f === null ? S.kreska : `${fmtHz(f)} ${S.jednHz}`;
}

/**
 * Mapuje wynik na wiersze metryk audytowych (kolejność stała, deterministyczna).
 * Wartości WPROST z backendu; przy braku tablic metryki są puste (null) → „—".
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
  return [
    {
      klucz: 'max-gain',
      etykieta: S.metrMaxGain,
      opis: S.metrMaxGainOpis,
      wartosc: werdykt.max_minor_loop_gain === null ? S.kreska : fmtGain(werdykt.max_minor_loop_gain),
    },
    {
      klucz: 'margines',
      etykieta: S.metrMargines,
      opis: S.metrMarginesOpis,
      wartosc: margines,
    },
    {
      klucz: 'czest-winna',
      etykieta: S.metrCzestWinna,
      opis: S.metrCzestWinnaOpis,
      wartosc: fmtCzest(werdykt.offending_frequency_hz),
    },
    {
      klucz: 'odleglosc',
      etykieta: S.metrOdlegloscMinusJeden,
      opis: S.metrOdlegloscOpis,
      wartosc: odleglosc,
    },
    {
      klucz: 'okrazenia',
      etykieta: S.metrOkrazenia,
      wartosc: String(werdykt.encirclement_count),
    },
  ];
}

// ---------------------------------------------------------------------------
// Wskaźnik strefy ujemnej rezystancji przekształtnika (pierwszy plan, informacja)
// ---------------------------------------------------------------------------

/**
 * Opis strefy ujemnej rezystancji Re(Z_conv) < 0 — WPROST z pól backendu: obecność,
 * częstotliwość i najmniejsza wartość Re(Z_conv). Informacja o modelu przekształtnika,
 * nie ocena interakcji z siecią.
 */
export function opisRezystancjiUjemnej(werdykt: WerdyktSsci): string {
  if (!werdykt.negative_resistance_present) return S.metrRezystancjaBrak;
  const czesci: string[] = [];
  if (werdykt.negative_resistance_f_hz !== null) {
    czesci.push(`${S.metrPrzyF} ${fmtHz(werdykt.negative_resistance_f_hz)} ${S.jednHz}`);
  }
  if (werdykt.negative_resistance_re_min_ohm !== null) {
    czesci.push(`${S.metrReMin} ${fmtOhm(werdykt.negative_resistance_re_min_ohm)} ${S.jednOhm}`);
  }
  return czesci.length > 0
    ? `${S.metrRezystancjaObecna} (${czesci.join(', ')})`
    : S.metrRezystancjaObecna;
}

/** Identyfikacja przekształtnika wyniku — może być pusta. */
export function etykietaPrzekształtnika(werdykt: WerdyktSsci): string | null {
  return werdykt.converter_ref ?? null;
}
