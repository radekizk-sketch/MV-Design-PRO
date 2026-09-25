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
  PasmaRozplywuResponse,
  WarunkiPrzylaczeniaResponse,
  WytrzymaloscCieplnaResponse,
} from '../api';

export const WIARYGODNOSC_FIXTURE: WiarygodnoscResponse = {
  analysis_id: '11111111-1111-1111-1111-111111111111',
  context: {
    project_name: 'Sieć testowa',
    case_name: null,
    case_id: '22222222-2222-2222-2222-222222222222',
    run_timestamp: '2026-07-16T10:00:00+00:00',
    snapshot_hash: 'snap-abc',
    run_id: '11111111-1111-1111-1111-111111111111',
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
      status: 'w paśmie wiarygodności',
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
    case_name: null,
    case_id: '22222222-2222-2222-2222-222222222222',
    run_timestamp: '2026-07-16T10:05:00+00:00',
    snapshot_hash: 'snap-def',
    run_id: '33333333-3333-3333-3333-333333333333',
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
    case_name: null,
    case_id: '22222222-2222-2222-2222-222222222222',
    run_timestamp: '2026-07-16T10:10:00+00:00',
    snapshot_hash: 'snap-ghi',
    run_id: '44444444-4444-4444-4444-444444444444',
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
      bus_name: 'Szyna OZE 1',
      nominal_kv: 15.0,
      sk_mva: 325.0,
      modules: [
        {
          gen_ref: 'gen-pv-1',
          gen_name: 'Falownik PV 1',
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
          gen_name: 'Falownik PV 2',
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
      bus_name: 'Szyna OZE 2',
      nominal_kv: 15.0,
      sk_mva: 45.0,
      modules: [
        {
          gen_ref: 'gen-fw-1',
          gen_name: 'Turbina FW 1',
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

/**
 * Pasma zdrowego rozsądku rozpływu (karta W3-G2) — kształt 1:1 z
 * `analysis/sanity_bounds/power_flow_bounds.py` + `application/analyses/
 * sanity_bounds.py::build_power_flow_sanity_bounds_view`. Iloczyn cech w
 * jednej fixturze: napięcie w paśmie (bus-A) / poza pasmem (bus-B); In
 * katalogu obecne (line-1) / brak (cable-2); straty w progu.
 */
export const PASMA_ROZPLYWU_FIXTURE: PasmaRozplywuResponse = {
  analysis_id: '55555555-5555-5555-5555-555555555555',
  context: {
    project_name: 'Sieć testowa',
    case_name: null,
    case_id: '22222222-2222-2222-2222-222222222222',
    run_timestamp: '2026-07-16T10:15:00+00:00',
    snapshot_hash: 'snap-jkl',
    run_id: '55555555-5555-5555-5555-555555555555',
  },
  converged: true,
  napiecia: {
    items: [
      {
        target_id: 'bus-A',
        target_name: 'Szyna A',
        nominal_kv: 15.0,
        actual_kv: 15.2,
        lower_kv: 13.5,
        upper_kv: 16.5,
        deviation_pct: 1.3333,
        in_range: true,
        status: 'w paśmie wiarygodności',
        why_pl: 'U = 15.2 kV mieści się w paśmie [13.500; 16.500] kV (Un = 15.0 kV ± 10 %).',
      },
      {
        target_id: 'bus-B',
        target_name: 'Szyna B',
        nominal_kv: 15.0,
        actual_kv: 20.0,
        lower_kv: 13.5,
        upper_kv: 16.5,
        deviation_pct: 33.3333,
        in_range: false,
        status: 'poza zakresem wiarygodności',
        why_pl:
          'U = 20.0 kV jest poza pasmem [13.500; 16.500] kV (Un = 15.0 kV ± 10 %, odchylenie '
          + '33.33 %) — wynik fizycznie wątpliwy (błąd modelu/jednostek?).',
      },
    ],
    norm_ref:
      'PN-EN 50160 (Parametry napięcia zasilającego w publicznych sieciach elektroenergetycznych) '
      + '— zmiany napięcia zasilającego w warunkach normalnej pracy: Un ± 10 %.',
    band_pct: 10.0,
    summary: { credible_count: 1, out_of_range_count: 1, incomplete_count: 0 },
  },
  obciazenia: {
    items: [
      {
        target_id: 'line-1',
        target_name: 'Linia 1',
        current_ka: 0.1,
        rated_current_a: 400.0,
        loading_pct: 25.0,
        in_range: true,
        status: 'w paśmie wiarygodności',
        why_pl: 'I = 0.1000 kA nie przekracza In = 0.4000 kA (obciążenie 25.0 %).',
      },
      {
        target_id: 'cable-2',
        target_name: 'Kabel 2',
        current_ka: 0.05,
        rated_current_a: null,
        loading_pct: null,
        in_range: false,
        status: 'dane niekompletne',
        why_pl: 'Brak danych katalogowych o prądzie znamionowym (In) gałęzi.',
      },
    ],
    summary: { credible_count: 1, out_of_range_count: 0, incomplete_count: 1 },
  },
  straty: {
    losses_active_mw: 0.05,
    load_active_total_mw: 5.0,
    losses_pct_of_load: 1.0,
    threshold_pct: 10.0,
    threshold_why_pl:
      'Typowe straty czynne sieci SN wynoszą ok. 2-6 % mocy dostarczonej do odbiorów (dane '
      + 'eksploatacyjne OSD). 10 % to górna granica WIARYGODNOŚCI wyniku solvera (nie granica '
      + 'projektowa) — powyżej niej wynik prawdopodobnie sygnalizuje błąd modelu (zawyżona '
      + 'impedancja gałęzi, błędna topologia), a nie rzeczywistą fizykę sieci.',
    in_range: true,
    status: 'w paśmie wiarygodności',
    why_pl:
      'Straty czynne 0.0500 MW = 1.00 % sumy mocy czynnej odbiorów (5.0000 MW) — poniżej progu '
      + 'wiarygodności 10.0 %.',
  },
};

/** Bieg NIEZBIEŻNY: wszystkie pozycje „dane niekompletne" z nazwanym powodem
 * (nigdy fabrykowany werdykt) — Un/In (dane modelu/katalogu) zostają widoczne. */
export const PASMA_ROZPLYWU_NIEZBIEZNY_FIXTURE: PasmaRozplywuResponse = {
  ...PASMA_ROZPLYWU_FIXTURE,
  converged: false,
  napiecia: {
    items: PASMA_ROZPLYWU_FIXTURE.napiecia.items.map((it) => ({
      ...it,
      actual_kv: null,
      lower_kv: null,
      upper_kv: null,
      deviation_pct: null,
      in_range: false,
      status: 'dane niekompletne',
      why_pl:
        'Bieg rozpływu nie osiągnął zbieżności — napięcia, prądy gałęzi i straty z tego '
        + 'przebiegu nie są fizycznie wiarygodne (brak zbieżnego rozwiązania Newtona-Raphsona).',
    })),
    norm_ref: PASMA_ROZPLYWU_FIXTURE.napiecia.norm_ref,
    band_pct: PASMA_ROZPLYWU_FIXTURE.napiecia.band_pct,
    summary: { credible_count: 0, out_of_range_count: 0, incomplete_count: 2 },
  },
  obciazenia: {
    items: PASMA_ROZPLYWU_FIXTURE.obciazenia.items.map((it) => ({
      ...it,
      current_ka: null,
      loading_pct: null,
      in_range: false,
      status: 'dane niekompletne',
      why_pl:
        'Bieg rozpływu nie osiągnął zbieżności — napięcia, prądy gałęzi i straty z tego '
        + 'przebiegu nie są fizycznie wiarygodne (brak zbieżnego rozwiązania Newtona-Raphsona).',
    })),
    summary: { credible_count: 0, out_of_range_count: 0, incomplete_count: 2 },
  },
  straty: {
    losses_active_mw: null,
    load_active_total_mw: null,
    losses_pct_of_load: null,
    threshold_pct: 10.0,
    threshold_why_pl: PASMA_ROZPLYWU_FIXTURE.straty.threshold_why_pl,
    in_range: false,
    status: 'dane niekompletne',
    why_pl:
      'Bieg rozpływu nie osiągnął zbieżności — napięcia, prądy gałęzi i straty z tego '
      + 'przebiegu nie są fizycznie wiarygodne (brak zbieżnego rozwiązania Newtona-Raphsona).',
  },
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
  czasy_wylaczenia: { z_nastawy: 1, z_zalozenia: 0, razem: 1 },
  // Podstawa normowa z punktem — 1:1 z `STANDARD_REFS` solvera
  // (`network_model/solvers/conductor_thermal_withstand.py`).
  normy: [
    {
      norma: 'PN-HD 60364-4-43',
      punkt: '§ 434.5.2',
      tresc_pl: 'Warunek adiabatyczny doboru przekroju ze względu na zwarcie: S ≥ √(I²·t) / k.',
    },
    {
      norma: 'IEC 60949',
      punkt: '§ 3, § 4',
      tresc_pl:
        'Obliczanie dopuszczalnych prądów zwarciowych kabli z uwzględnieniem nagrzewania nieadiabatycznego; podstawa wartości k dla par materiał żyły / izolacja.',
    },
  ],
  aktualnosc: {
    aktualny: true,
    powod_pl: 'Wynik policzony dla bieżącej wersji modelu.',
    model_hash: 'model-hash-1',
    snapshot_hash: 'model-hash-1',
  },
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
        // Karta F-K1 faza 5: czas z ROZWIAZANEJ nastawy (nie z zalozenia przypadku).
        czas_wylaczenia: {
          tk_s: 0.25,
          zrodlo: 'nastawa_zabezpieczenia',
          powod_pl: 'Czas z charakterystyki IEC_SI zabezpieczenia pola przy prądzie gałęzi.',
          urzadzenie_ref: 'CB1',
          urzadzenie_nazwa: 'Wyłącznik pola liniowego',
          funkcja: 'overcurrent_51',
          prad_galezi_a: 15000,
          prad_rozruchowy_a: 600,
          krzywa: 'IEC_SI',
          tms: 0.2,
        },
        // Treść fizyczna kryterium (ten sam rachunek co w komentarzu fixtury):
        // I²·t = 15 000² × 0,25 s = 56,25·10⁶ A²·s; k²·S² = (94 × 120)² = 127,24·10⁶ A²·s.
        i2t_a2s: 56250000,
        i2t_dopuszczalne_a2s: 127238400,
        margines_procent: 55.8,
        kryteria: [
          {
            kod: 'i2t',
            nazwa_pl: 'Energia cieplna zwarcia',
            warunek_pl: 'I²·t ≤ k²·S²',
            wartosc: 56250000,
            granica: 127238400,
            jednostka: 'A²·s',
            status: 'PASS',
          },
          {
            kod: 'przekroj_minimalny',
            nazwa_pl: 'Przekrój minimalny żyły',
            warunek_pl: 'S ≥ S_min',
            wartosc: 120,
            granica: 79.8,
            jednostka: 'mm²',
            status: 'PASS',
          },
        ],
        powod_decyzji_pl: 'I²·t = 56,25·10⁶ A²·s ≤ k²·S² = 127,24·10⁶ A²·s — zapas 55,8 %.',
        zalecenia: [],
        wrazliwosc: [],
        uzasadnienie_k: null,
      },
    ],
    summary: { pass_count: 1, fail_count: 0, unavailable_count: 0 },
  },
};
