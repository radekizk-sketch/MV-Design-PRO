/*
 * Fixtury widoku stabilności SSCI — kształt 1:1 z `analysis/ssci_stability/
 * serializer.py::view_to_dict` PO uczciwości natychmiastowej (2026-09-23): pole
 * werdyktu ma jedyną wartość „nie oceniono", `is_risk` = null, a rekord `ocena`
 * (status `NIE_OCENIONO`) niesie powód — Z_grid(f) liczone bez przekładni
 * transformatora (dla szyny 0,4 kV około 1400 razy za duże), brak wyroczni. Metryki
 * kryterium impedancyjnego są materiałem audytowym; wskaźnik strefy ujemnej
 * rezystancji przekształtnika (Re_min, częstotliwość) zależy tylko od modelu
 * przekształtnika i zostaje informacją. Teksty oceny 1:1 ze stałych backendu
 * — rekordy oceny generuje backend (`rekordyOceny.json`). Liczby metryk ILUSTRACYJNE —
 * testy liczb są po stronie backendu.
 */

import type { RekordOcenySsci, WidokStabilnosciSsci } from '../api';
import rekordyOceny from './rekordyOceny.json';

/** Rekordy oceny wygenerowane przez backend (`generuj_fixtury_ocen_fe.py`). */
const REKORDY = rekordyOceny as unknown as {
  readonly komplet_tablic: RekordOcenySsci;
  readonly brak_danych: RekordOcenySsci;
};

/** Nagłówek sekcji audytowej — 1:1 z `analysis/ssci_stability/models.py::SEKCJA_AUDYTOWA_SSCI_PL`. */
export const SEKCJA_AUDYTOWA_SSCI =
  'Metryki kryterium impedancyjnego z Z_grid(f) liczonego bez przekładni transformatora — materiał audytowy, nie jest wynikiem inżynierskim';

/** Rekord `NIE_OCENIONO` przy komplecie tablic — z `ocena_ssci_niewykonana(INV1, CONV)`. */
export function ocenaSsciFixture(): RekordOcenySsci {
  return REKORDY.komplet_tablic;
}

/** Rekord `NIE_OCENIONO` przy brakach karty — z `ocena_ssci_niewykonana(braki_karty=…)`. */
export function ocenaSsciBrakDanychFixture(): RekordOcenySsci {
  return REKORDY.brak_danych;
}

/** Widok z kompletem tablic: metryki audytowe + strefa ujemnej rezystancji obecna. */
export function widokZMetrykamiFixture(): WidokStabilnosciSsci {
  return {
    analysis_id: 'ssci-analysis-01',
    context: {
      project_name: 'Projekt SN',
      case_name: null,
      case_id: 'c-ssci',
      run_timestamp: '2026-09-23T10:00:00Z',
      snapshot_hash: 'snap-1',
      run_id: 'run-ssci-1',
    },
    gain_crossover_mag: 1.0,
    verdict: {
      converter_ref: 'INV1',
      bus_ref: 'CONV',
      verdict: 'nie oceniono',
      is_risk: null,
      why_pl: ocenaSsciFixture().wyjasnienie.zdanie_pl,
      ocena: ocenaSsciFixture(),
      max_minor_loop_gain: 1.42,
      has_magnitude_crossover: true,
      gain_crossover: { f_hz: 34.5, phase_l_deg: -178.0, phase_margin_deg: 2.0 },
      worst_phase_margin_deg: -3.5,
      worst_phase_margin_f_hz: 34.5,
      offending_frequency_hz: 34.5,
      nearest_to_minus_one: { f_hz: 34.5, mag: 1.42, phase_deg: -178.0, distance_to_minus_one: 0.42 },
      encirclement_count: 1,
      negative_resistance_present: true,
      negative_resistance_f_hz: 28.0,
      negative_resistance_re_min_ohm: -0.0125,
      provenance: {
        worst_quality: 'ESTIMATED',
        worst_quality_label_pl: 'oszacowane',
        is_estimated: true,
        consumed_fields: ['current_loop_bandwidth_hz', 'pll_bandwidth_hz', 'filter_l_pu'],
        tag_pl: 'metryki oparte na oszacowanych pasmach regulatora',
      },
      missing_data: [],
      white_box: [
        {
          symbol: 'max|L|',
          formula_latex: '\\max_f |L(j\\omega)|',
          substitution_pl: 'maksimum modułu wzmocnienia pętli po częstotliwościach',
          result_pl: '1,42',
          unit_check_pl: '[-] (bezwymiarowe)',
        },
      ],
    },
    ocena: ocenaSsciFixture(),
    sekcja_audytowa_pl: SEKCJA_AUDYTOWA_SSCI,
  };
}

/** Widok z kompletem tablic bez strefy ujemnej rezystancji (informacja „brak"). */
export function widokBezRezystancjiUjemnejFixture(): WidokStabilnosciSsci {
  const bazowy = widokZMetrykamiFixture();
  return {
    ...bazowy,
    analysis_id: 'ssci-analysis-02',
    verdict: {
      ...bazowy.verdict,
      max_minor_loop_gain: 0.31,
      has_magnitude_crossover: false,
      gain_crossover: null,
      worst_phase_margin_deg: null,
      worst_phase_margin_f_hz: null,
      offending_frequency_hz: null,
      encirclement_count: 0,
      negative_resistance_present: false,
      negative_resistance_f_hz: null,
      negative_resistance_re_min_ohm: null,
    },
  };
}

/** Brak tablic impedancji (brak przekształtnika/DER) → ocena niewykonana z brakami karty. */
export function widokBrakDanychFixture(): WidokStabilnosciSsci {
  return {
    analysis_id: 'ssci-analysis-nodata-01',
    context: null,
    gain_crossover_mag: 1.0,
    verdict: {
      converter_ref: null,
      bus_ref: null,
      verdict: 'nie oceniono',
      is_risk: null,
      why_pl: ocenaSsciBrakDanychFixture().wyjasnienie.zdanie_pl,
      ocena: ocenaSsciBrakDanychFixture(),
      max_minor_loop_gain: null,
      has_magnitude_crossover: false,
      gain_crossover: null,
      worst_phase_margin_deg: null,
      worst_phase_margin_f_hz: null,
      offending_frequency_hz: null,
      nearest_to_minus_one: null,
      encirclement_count: 0,
      negative_resistance_present: false,
      negative_resistance_f_hz: null,
      negative_resistance_re_min_ohm: null,
      provenance: null,
      missing_data: ['dane niekompletne'],
      white_box: [],
    },
    ocena: ocenaSsciBrakDanychFixture(),
    sekcja_audytowa_pl: SEKCJA_AUDYTOWA_SSCI,
  };
}
