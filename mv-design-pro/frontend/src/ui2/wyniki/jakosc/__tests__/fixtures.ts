/*
 * Fixtures 1:1 z realnymi kształtami odpowiedzi końcówek jakości (karta E8.4).
 * Wiarygodność: `ShortCircuitSanityVerdict.to_dict` + identyfikacja węzła
 * (`analysis/sanity_bounds/short_circuit_bounds.py`, `application/analyses/
 * sanity_bounds.py`). Walidacja: `serializer.view_to_dict`
 * (`analysis/energy_validation/serializer.py`, `models.py`).
 */

import type {
  ExecutionRun,
} from '../../../../ui/study-cases/types';
import type { MigotanieResponse, WalidacjaResponse, WiarygodnoscResponse,
  WarunkiPrzylaczeniaResponse,
  WytrzymaloscCieplnaResponse,
} from '../api';

export const WIARYGODNOSC_FIXTURE: WiarygodnoscResponse = {
  analysis_id: '11111111-1111-1111-1111-111111111111',
  context: {
    project_name: 'Sieć testowa',
    case_name: '22222222-2222-2222-2222-222222222222',
    run_timestamp: '2026-07-16T10:00:00+00:00',
    snapshot_id: 'snap-abc',
    trace_id: '11111111-1111-1111-1111-111111111111',
  },
  items: [
    {
      target_id: 'bus-A',
      element_id: 'bus-A',
      target_name: 'Szyna A',
      voltage_kv: 15.0,
      ikss_ka: 12.5,
      voltage_band: 'SN',
      lower_ka: 0.1,
      upper_ka: 50.0,
      in_range: true,
      status: 'zweryfikowany',
      why_pl: "Ik'' = 12.5 kA mieści się w zakresie [0.1; 50.0] kA dla SN (15.0 kV).",
      blocks_osd_package: false,
    },
    {
      target_id: 'bus-B',
      element_id: 'bus-B',
      target_name: 'Szyna B',
      voltage_kv: 15.0,
      ikss_ka: 116.0,
      voltage_band: 'SN',
      lower_ka: 0.1,
      upper_ka: 50.0,
      in_range: false,
      status: 'poza zakresem wiarygodności',
      why_pl:
        "Ik'' = 116.0 kA przekracza górną granicę wiarygodności 50.0 kA dla SN (15.0 kV) — wartość fizycznie wątpliwa. Zablokowane przed wejściem do pakietu OSD.",
      blocks_osd_package: true,
    },
    {
      target_id: 'bus-C',
      element_id: null,
      target_name: 'Szyna C',
      voltage_kv: null,
      ikss_ka: null,
      voltage_band: null,
      lower_ka: null,
      upper_ka: null,
      in_range: false,
      status: 'dane niekompletne',
      why_pl: "Brak poprawnego napięcia lub Ik'' do oceny wiarygodności.",
      blocks_osd_package: false,
    },
  ],
  summary: {
    credible_count: 1,
    out_of_range_count: 1,
    incomplete_count: 1,
    blocks_osd_package_count: 1,
  },
};

export const WALIDACJA_FIXTURE: WalidacjaResponse = {
  context: {
    project_name: 'Sieć testowa',
    case_name: '22222222-2222-2222-2222-222222222222',
    run_timestamp: '2026-07-16T10:05:00+00:00',
    snapshot_id: 'snap-def',
    trace_id: '33333333-3333-3333-3333-333333333333',
  },
  config: {
    loading_warn_pct: 80.0,
    loading_fail_pct: 100.0,
    voltage_warn_pct: 5.0,
    voltage_fail_pct: 10.0,
    loss_warn_pct: 5.0,
    loss_fail_pct: 10.0,
  },
  items: [
    {
      check_type: 'BRANCH_LOADING',
      target_id: 'line-1',
      target_name: 'Linia 1',
      observed_value: 65.0,
      unit: '%',
      limit_warn: 80.0,
      limit_fail: 100.0,
      margin_pct: 35.0,
      status: 'PASS',
      why_pl: 'Obciążenie gałęzi 65% — poniżej progu ostrzeżenia 80%.',
    },
    {
      check_type: 'TRANSFORMER_LOADING',
      target_id: 'tr-1',
      target_name: 'Transformator 1',
      observed_value: 92.0,
      unit: '%',
      limit_warn: 80.0,
      limit_fail: 100.0,
      margin_pct: 8.0,
      status: 'WARNING',
      why_pl: 'Obciążenie transformatora 92% — powyżej progu ostrzeżenia 80%.',
    },
    {
      check_type: 'VOLTAGE_DEVIATION',
      target_id: 'bus-B',
      target_name: 'Szyna B',
      observed_value: 12.0,
      unit: '%',
      limit_warn: 5.0,
      limit_fail: 10.0,
      margin_pct: -2.0,
      status: 'FAIL',
      why_pl: 'Odchylenie napięcia 12% — powyżej progu przekroczenia 10%.',
      // Ślad WHITE BOX per pozycja (R2-A; struktura R3-D) — kształt 1:1 z buildera.
      white_box: [
        {
          tekst: 'Wzor: odchylenie = |U - U_n| / U_n * 100%',
          latex: '\\delta U = \\frac{|U - U_n|}{U_n} \\cdot 100\\%',
        },
        { tekst: 'Dane: U = 13.2000 kV (wynik PF), U_n = 15.0000 kV', latex: null },
        {
          tekst: 'Wynik: odchylenie = 12.00 %',
          latex:
            '\\delta U = \\frac{|13.2000 - 15.0000|}{15.0000} \\cdot 100\\% = 12.00\\%',
        },
        { tekst: 'Progi: ostrzezenie 5.0 %, przekroczenie 10.0 %', latex: null },
        { tekst: 'Werdykt: PRZEKROCZENIE', latex: null },
      ],
    },
    {
      check_type: 'LOSS_BUDGET',
      target_id: 'siec',
      target_name: 'Sieć',
      observed_value: 3.2,
      unit: '%',
      limit_warn: 5.0,
      limit_fail: 10.0,
      margin_pct: 36.0,
      status: 'PASS',
      why_pl: 'Budżet strat 3.2% — poniżej progu ostrzeżenia 5%.',
    },
    {
      check_type: 'REACTIVE_BALANCE',
      target_id: 'slack',
      target_name: 'Węzeł bilansujący',
      observed_value: null,
      unit: 'cos(phi)',
      limit_warn: null,
      limit_fail: null,
      margin_pct: null,
      status: 'NOT_COMPUTED',
      why_pl: 'Bilans mocy biernej nie został policzony — brak danych wejściowych.',
    },
  ],
  summary: {
    pass_count: 2,
    warning_count: 1,
    fail_count: 1,
    not_computed_count: 1,
    worst_item_target_id: 'bus-B',
    worst_item_margin_pct: -2.0,
  },
};

export const MIGOTANIE_FIXTURE: MigotanieResponse = {
  analysis_id: '44444444-4444-4444-4444-444444444444',
  context: {
    project_name: 'Sieć testowa',
    case_name: '22222222-2222-2222-2222-222222222222',
    run_timestamp: '2026-07-16T10:10:00+00:00',
    snapshot_id: 'snap-ghi',
    trace_id: '44444444-4444-4444-4444-444444444444',
  },
  config: {
    flicker_summation_exponent_m: 3,
    planning_level_pst: 0.9,
    planning_level_plt: 0.7,
    rvc_kmax: 1.0,
  },
  buses: [
    {
      bus_ref: 'bus-oze-1',
      nominal_kv: 15.0,
      sk_mva: 325.0,
      modules: [
        {
          gen_ref: 'gen-pv-1',
          sn_mva: 1.0,
          flicker_c: 0.05,
          pst_i: 0.4,
          included: true,
          info_pl: null,
          white_box: [
            {
              symbol: 'P_{st,i}',
              formula_latex: "P_{st,i} = c_i \\cdot \\dfrac{S_{n,i}}{S_{k}''}",
              substitution_pl: 'P_st_i = 0.05 · 1 / 325 MVA',
              result_pl: 'P_st_i = 0.4',
            },
          ],
        },
        {
          gen_ref: 'gen-pv-2',
          sn_mva: 0.5,
          flicker_c: null,
          pst_i: null,
          included: false,
          info_pl:
            'brak współczynnika emisji migotania w katalogu — moduł pominięty w sumowaniu',
          white_box: [],
        },
      ],
      pst: 0.4,
      plt: 0.4,
      d_percent: 10.0,
      pst_limit: 0.9,
      plt_limit: 0.7,
      verdict_pl: 'w granicach planowania',
      zalozenia_pl: [
        'Emisja pojedynczego źródła: Pst_i = c · Sn / Sk″ (c z certyfikatu urządzenia).',
        'Poziomy planowania dla SN: Pst = 0.9, Plt = 0.7 — wartości orientacyjne.',
      ],
      white_box: [
        {
          symbol: 'P_{st}',
          formula_latex: 'P_{st} = \\left( \\sum_i P_{st,i}^{\\,m} \\right)^{1/m}, \\quad m = 3',
          substitution_pl: 'P_st = (0.4^3)^(1/3)',
          result_pl: 'P_st = 0.4',
        },
      ],
    },
    {
      bus_ref: 'bus-oze-2',
      nominal_kv: 15.0,
      sk_mva: 45.0,
      modules: [
        {
          gen_ref: 'gen-fw-1',
          sn_mva: 8.0,
          flicker_c: 0.06,
          pst_i: 1.2,
          included: true,
          info_pl: null,
          white_box: [],
        },
      ],
      pst: 1.2,
      plt: 1.2,
      d_percent: 30.0,
      pst_limit: 0.9,
      plt_limit: 0.7,
      verdict_pl: 'przekroczenie poziomu planowania',
      zalozenia_pl: [
        'Sumowanie emisji wielu źródeł: Pst = (Σ Pst_i^m)^(1/m), m = 3.',
      ],
      white_box: [],
    },
  ],
  summary: {
    total_buses: 2,
    assessed_count: 2,
    exceeded_count: 1,
    not_assessed_count: 0,
  },
  input_hash: 'mig-hash-xyz',
};

/** Buduje przebieg wykonawczy (rejestr) o zadanym rodzaju/statusie. */
export function przebiegTestowy(
  id: string,
  analysisType: ExecutionRun['analysis_type'],
  status: ExecutionRun['status'] = 'DONE',
): ExecutionRun {
  return {
    id,
    study_case_id: 'case-1',
    analysis_type: analysisType,
    solver_input_hash: 'hash',
    status,
    started_at: null,
    finished_at: null,
    error_message: null,
  };
}

/**
 * Ocena warunków przyłączenia OSD (karta F-K2) — moc w limicie, cosφ dotrzymany.
 * Wartości spójne rachunkowo: P = -4,5 MW, Q = 0,64 Mvar → S = 4,545 MVA,
 * cosφ = 4,5/4,545 = 0,990.
 */
export const WARUNKI_FIXTURE: WarunkiPrzylaczeniaResponse = {
  run_id: 'pf-1',
  case_id: 'case-1',
  analysis_type: 'PF',
  ocena: {
    punkt_przylaczenia: 'BUS-GPZ-SN',
    p_mw: -4.5,
    q_mvar: 0.64,
    s_mva: 4.545262,
    cos_phi: 0.990047,
    kierunek: 'oddawanie',
    status_ogolny: 'PASS',
    pozycje: [
      {
        kryterium: 'moc_w_punkcie_przylaczenia',
        status: 'PASS',
        wartosc: 4.5,
        wymagana: 5,
        jednostka: 'MW',
        opis_pl: 'Moc oddawana do sieci 4.500 MW wobec limitu 5.000 MW (dotrzymany).',
        readiness_codes: [],
      },
      {
        kryterium: 'cos_phi_w_punkcie_przylaczenia',
        status: 'PASS',
        wartosc: 0.990047,
        wymagana: 0.95,
        jednostka: '-',
        opis_pl: 'cosfi w punkcie 0.9900 wobec wymaganego 0.9500 (dotrzymany).',
        readiness_codes: [],
      },
    ],
    readiness_codes: [],
    formula_ref: 'cosφ = |P| / √(P² + Q²);  kryterium mocy: |P| ≤ P_limit',
    zalozenia: [],
  },
};

/**
 * Ocena wytrzymałości cieplnej przewodów (karta F-K1) — jedna gałąź spełniająca.
 * Rachunek: Jth 94 A/mm² × 120 mm² = 11 280 A; przy t = 0,25 s I_dop = 22 560 A.
 */
export const CIEPLNA_FIXTURE: WytrzymaloscCieplnaResponse = {
  run_id: 'sc-1',
  case_id: 'case-1',
  analysis_type: 'short_circuit_sn',
  fault_node_id: 'BUS-02',
  tk_s: 0.25,
  ocena: {
    items: [
      {
        branch_id: 'cable_A',
        branch_name: 'Magistrala L-01',
        status: 'PASS',
        i_fault_a: 15000,
        i_permissible_a: 22560,
        utilization: 0.665,
        s_min_mm2: 79.8,
        applied_cross_section_mm2: 120,
        missing_codes: [],
        uzasadnienie_pl: null,
      },
    ],
    summary: { pass_count: 1, fail_count: 0, unavailable_count: 0 },
  },
};
