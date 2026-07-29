/*
 * Fixtury werdyktu stabilności SSCI — kształt 1:1 z `analysis/ssci_stability/
 * serializer.py::view_to_dict`. Liczby ILUSTRACYJNE (nie z solvera) — służą do
 * ćwiczenia mapowania i renderu; testy API/kontraktu liczb są po stronie backendu
 * (`tests/api/test_v126_ssci_stability_api.py`).
 */

import type { WidokStabilnosciSsci } from '../api';

/** Werdykt „niestabilny": przecięcie modułów, częstotliwość winna, okrążenie −1. */
export function widokNiestabilnyFixture(): WidokStabilnosciSsci {
  return {
    analysis_id: 'ssci-analysis-unstable-01',
    context: {
      project_name: 'Projekt SN',
      case_name: null,
      case_id: 'c-ssci',
      run_timestamp: '2026-07-20T10:00:00Z',
      snapshot_hash: 'snap-1',
      run_id: 'run-ssci-1',
    },
    gain_crossover_mag: 1.0,
    pm_risk_deg: 30.0,
    pm_unstable_deg: 0.0,
    verdict: {
      converter_ref: 'INV1',
      bus_ref: 'CONV',
      verdict: 'niestabilny',
      is_risk: true,
      why_pl: 'Przebieg L(jω) okrąża punkt −1 w paśmie przecięcia modułów — niestabilność SSCI.',
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
      provenance: {
        worst_quality: 'ESTIMATED',
        worst_quality_label_pl: 'oszacowane',
        is_estimated: true,
        consumed_fields: ['current_loop_bandwidth_hz', 'pll_bandwidth_hz', 'filter_l_pu'],
        tag_pl: 'Werdykt oparty na oszacowanych polach karty falownika.',
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
        {
          symbol: 'Δφ',
          formula_latex: '180^\\circ - |\\angle L|',
          substitution_pl: '180° − |∠L| w paśmie |L| ≥ 1',
          result_pl: '-3,50°',
          unit_check_pl: '[°]',
        },
      ],
    },
  };
}

/** Werdykt „stabilny": brak przecięcia modułów (silna sieć), brak częstotliwości winnej. */
export function widokStabilnyFixture(): WidokStabilnosciSsci {
  return {
    analysis_id: 'ssci-analysis-stable-01',
    context: null,
    gain_crossover_mag: 1.0,
    pm_risk_deg: 30.0,
    pm_unstable_deg: 0.0,
    verdict: {
      converter_ref: 'INV1',
      bus_ref: 'CONV',
      verdict: 'stabilny',
      is_risk: false,
      why_pl: 'Brak przecięcia modułów (max|L| < 1) — układ stabilny bezwarunkowo (silna sieć).',
      max_minor_loop_gain: 0.31,
      has_magnitude_crossover: false,
      gain_crossover: null,
      worst_phase_margin_deg: null,
      worst_phase_margin_f_hz: null,
      offending_frequency_hz: null,
      nearest_to_minus_one: { f_hz: 40.0, mag: 0.31, phase_deg: -120.0, distance_to_minus_one: 1.2 },
      encirclement_count: 0,
      negative_resistance_present: false,
      negative_resistance_f_hz: null,
      provenance: {
        worst_quality: 'DATASHEET',
        worst_quality_label_pl: 'z karty katalogowej',
        is_estimated: false,
        consumed_fields: ['current_loop_bandwidth_hz', 'pll_bandwidth_hz', 'filter_l_pu'],
        tag_pl: 'Werdykt oparty na polach z karty katalogowej.',
      },
      missing_data: [],
      white_box: [
        {
          symbol: 'max|L|',
          formula_latex: '\\max_f |L(j\\omega)|',
          substitution_pl: 'maksimum modułu wzmocnienia pętli po częstotliwościach',
          result_pl: '0,31',
          unit_check_pl: '[-] (bezwymiarowe)',
        },
      ],
    },
  };
}

/** Werdykt „brak danych": brak przekształtnika/DER → solver „dane niekompletne". */
export function widokBrakDanychFixture(): WidokStabilnosciSsci {
  return {
    analysis_id: 'ssci-analysis-nodata-01',
    context: null,
    gain_crossover_mag: 1.0,
    pm_risk_deg: 30.0,
    pm_unstable_deg: 0.0,
    verdict: {
      converter_ref: null,
      bus_ref: null,
      verdict: 'brak danych',
      is_risk: false,
      why_pl: 'Brak werdyktu — solver SSCI zwrócił status „dane niekompletne".',
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
      provenance: null,
      missing_data: ['dane niekompletne'],
      white_box: [],
    },
  };
}
