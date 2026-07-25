/**
 * Creator Screenshot Harness — render żywych kreatorów ui2 do oceny wizualnej
 * (dyrektywa właściciela #8: zrzuty żywej aplikacji w obu motywach na stałej stronie
 * oceny). Renderuje REALNE komponenty kreatorów z zaszczepionym kontekstem/stanem
 * i podmienionym `fetch` (dane katalogowe), w motywie jasnym/ciemnym.
 *
 * Query: `?creator=pole|oze|transformator|kompensator|magistrala|odbior|zrodlo|arcflash&theme=light|dark`.
 * Sceny dowodowe OZE (karta V-A): `?creator=lom|frt|oltc|macierz` — ekrany z pełnym
 * wywodem akademickim (WHITE BOX/KaTeX) na realnych komponentach.
 * Sceny rundy dowodowej V-B (pełne wywody na żywych ekranach wyników):
 * `kompensacja-wynik|sila-sieci|odbior-zgodnosc|estymacja|ssci|migotanie`
 * (scena „odbior-zgodnosc" = ekran „Zgodność powykonawcza"; nazwa `odbior`
 * pozostaje zajęta przez kreator odbioru nN — kolizja nazw scen).
 * Używany wyłącznie przez: e2e/creator-screenshot.spec.ts (nie część bundla aplikacji).
 */

import { createRoot } from 'react-dom/client';
import './ui2/theme/tokens.css';
// Scena „swiezosc" renderuje CaseBar poza AppShell — style paska ładuje shell.css.
import './ui2/shell/shell.css';

import { KreatorKompensatoraSn } from './ui2/kreatory/kompensator';
import { KreatorMagistralaSn } from './ui2/kreatory/magistrala';
import { KreatorOdbioruNn } from './ui2/kreatory/odbior';
import { KreatorPolaSn } from './ui2/kreatory/pole';
import { KreatorTransformatoraSnNn } from './ui2/kreatory/transformator';
import { KreatorZrodloZasilania } from './ui2/kreatory/zrodlo';
import { KreatorZrodlaOze } from './ui2/kreatory/zrodlo-oze';
// Fala P-4/P-5 — 9 kreatorów ui2 (karta Z-2, dowody wizualne).
import { KreatorZrodloDyspozycyjne } from './ui2/kreatory/zrodlo-dyspozycyjne';
import { KreatorOdgalezienia } from './ui2/kreatory/odgalezienie';
import { KreatorSlupaOdgaleznego } from './ui2/kreatory/slup-odgalezny';
import { KreatorZksn } from './ui2/kreatory/zksn';
import { KreatorPrzekaznika } from './ui2/kreatory/przekaznik';
import { KreatorPomiaru } from './ui2/kreatory/pomiar';
import { KreatorPolaNn } from './ui2/kreatory/pole-nn';
import { KreatorPrzypisaniaKatalogu } from './ui2/kreatory/przypisanie-katalogu';
import { KreatorEdycjiParametrow } from './ui2/kreatory/edycja-parametrow';
import {
  SekcjaArcFlash,
  SekcjaMigotania,
  SekcjaWalidacji,
  SekcjaWytrzymaloscCieplna,
} from './ui2/wyniki/jakosc/EkranJakosci';
import { EkranOdbioru } from './ui2/wyniki/odbior';
import { EkranEstymacji } from './ui2/wyniki/estymacja';
import { EkranSsci } from './ui2/wyniki/ssci';
import { SekcjaSilySieci } from './ui2/oze/pulpit';
import { EkranRozplywu } from './ui2/wyniki/rozplyw';
import { EkranZwarc } from './ui2/wyniki/zwarcia';
import { EkranPorownania } from './ui2/wyniki/porownanie';
import { useResultsInspectorStore } from './ui/results-inspector/store';
import { EkranFrt, EkranKompensacji, EkranLom, MacierzNcRfg } from './ui2/oze';
import { EkranBadanOltc } from './ui2/wyniki/oltc';
import { EkranSkladowych } from './ui2/wyniki/skladowe';
import { EkranZbieznosci } from './ui2/wyniki/zbieznosc';
import { EkranStanuFazowego } from './ui2/wyniki/stan-fazowy';
import { EkranStabilnosci } from './ui2/wyniki/stabilnosc';
import { useShellStore } from './ui2/shell/useShellStore';
import {
  EMPTY_DER_CATALOGS,
  EMPTY_DER_PROFILES,
  EMPTY_DER_READINESS,
  useStationDerStore,
  type StationDerConnection,
} from './ui/network-build/station-der';
import { HubDokumentacji } from './ui2/spaces/dokumentacja';
import { PulpitProjektu } from './ui2/spaces/projekt';
import { EkranCoWymagaUwagi } from './ui2/wyniki/co-wymaga-uwagi';
import { CaseBar } from './ui2/shell/CaseBar';
import { useShellCaseInfo } from './ui2/shell/shellStatus';
import { useAppStateStore } from './ui/app-state';
import { useSnapshotStore } from './ui/topology/snapshotStore';
import { useNetworkBuildStore } from './ui/network-build/networkBuildStore';
import { useExecutionRunsStore } from './ui/study-cases/runStore';
import { useStudyCasesStore } from './ui/study-cases/store';
import { usePowerFlowResultsStore } from './ui/power-flow-results/store';
import type { ExecutionRun } from './ui/study-cases/types';

// --- Motyw ---------------------------------------------------------------
const theme = new URLSearchParams(window.location.search).get('theme') === 'light'
  ? 'light_technical'
  : 'dark_scada';
document.documentElement.setAttribute('data-theme', theme);
document.body.style.background = theme === 'light_technical' ? '#f5f7fa' : '#07111c';

// --- Podmiana fetch: dane katalogowe (bez backendu) ----------------------
const CATALOG_FIXTURES: Record<string, unknown> = {
  '/api/catalog/mv-apparatus-types': [
    { id: 'ap-1', name: 'Wyłącznik próżniowy VD4', device_kind: 'BREAKER', u_n_kv: 17.5, i_n_a: 630, breaking_capacity_ka: 25 },
    { id: 'ap-2', name: 'Rozłącznik LBS', device_kind: 'LOAD_SWITCH', u_n_kv: 17.5, i_n_a: 630, breaking_capacity_ka: 20 },
  ],
  '/api/catalog/switchgear-families': [
    { switchgear_family_ref: 'zpue_rotoblok', family_name: 'Rotoblok SVS', manufacturer_ref: 'ZPUE' },
    { switchgear_family_ref: 'abb_unigear', family_name: 'UniGear ZS1', manufacturer_ref: 'ABB' },
  ],
  '/api/catalog/lv-apparatus-types': [
    { id: 'lv-1', name: 'Wyłącznik nN 630A', u_n_kv: 0.4, i_n_a: 630 },
  ],
  '/api/catalog/pv-inverter-types': [
    { id: 'pv-1', name: 'Falownik PV 900 kVA', manufacturer: 'SMA', un_kv: 0.4, s_n_kva: 1000, p_max_kw: 900, cos_phi_min: 0.9, cos_phi_max: 1.0, ptpiree_status: 'POWIAZANY', ptpiree_certificate_ref: 'WOŚ/2024/PV-900', ptpiree_document_number: 'DOC-PV-900', ptpiree_wos_version: '2.1', ptpiree_source_url: 'https://ptpiree.pl' },
  ],
  '/api/catalog/bess-inverter-types': [
    { id: 'bess-1', name: 'Magazyn 1 MW / 2 MWh', manufacturer: 'Tesla', un_kv: 0.4, s_n_kva: 1100, p_charge_kw: 1000, p_discharge_kw: 1000, e_kwh: 2000, ptpiree_status: 'POWIAZANY', ptpiree_certificate_ref: 'WOŚ/2024/BESS-1M' },
  ],
  '/api/catalog/wind-inverter-types': [
    { id: 'fw-1', name: 'Turbina wiatrowa 2 MW', manufacturer: 'Vestas', kind: 'WIND', un_kv: 0.69, sn_mva: 2.2, pmax_mw: 2.0, qmin_mvar: -0.7, qmax_mvar: 0.7 },
  ],
  '/api/catalog/cable-types': [
    { id: 'kab-120', name: 'XRUHAKXS 1×120', r_ohm_per_km: 0.253, x_ohm_per_km: 0.118, c_nf_per_km: 230, rated_current_a: 255, voltage_rating_kv: 15, cross_section_mm2: 120, conductor_material: 'AL', insulation_type: 'XLPE', standard: 'HD 620 S1', max_temperature_c: 90, number_of_cores: 1, return_conductor_ith_1s_a: 12000 },
    { id: 'kab-240', name: 'XRUHAKXS 1×240', r_ohm_per_km: 0.125, x_ohm_per_km: 0.105, c_nf_per_km: 300, rated_current_a: 400, voltage_rating_kv: 15, cross_section_mm2: 240, conductor_material: 'AL', insulation_type: 'XLPE', standard: 'HD 620 S1', max_temperature_c: 90, number_of_cores: 1, return_conductor_ith_1s_a: 16000 },
  ],
  '/api/catalog/line-types': [
    { id: 'lin-70', name: 'AFL-6 70', r_ohm_per_km: 0.443, x_ohm_per_km: 0.36, b_us_per_km: 2.7, rated_current_a: 290, voltage_rating_kv: 15, cross_section_mm2: 70, conductor_material: 'AFL', standard: 'PN-EN 50182', max_temperature_c: 80 },
    { id: 'lin-120', name: 'AFL-6 120', r_ohm_per_km: 0.258, x_ohm_per_km: 0.35, b_us_per_km: 2.8, rated_current_a: 410, voltage_rating_kv: 15, cross_section_mm2: 120, conductor_material: 'AFL', standard: 'PN-EN 50182', max_temperature_c: 80 },
  ],
  // Fala P-4/P-5 (karta Z-2) — katalogi dla 9 nowych kreatorów ui2.
  '/api/catalog/source-system-types': [
    { id: 'sys-agr-1', name: 'Agregat prądotwórczy 200 kVA', manufacturer: 'SDMO', voltage_rating_kv: 0.4, sk3_mva: 1.2, ik3_ka: 1.73 },
  ],
  '/api/catalog/branch-point-types': [
    { id: 'bp-slup-1', name: 'Słup rozgałęźny SN z rozłącznikiem', kind: 'BRANCH_POLE', medium: 'LINE_OVERHEAD', switch_device_kind: 'ROZLACZNIK', switch_rated_current_a: 400, branch_ports_count: 2 },
    { id: 'bp-zksn-1', name: 'ZKSN 2-polowe', kind: 'ZKSN', medium: 'CABLE', switch_device_kind: 'ROZLACZNIK', switch_rated_current_a: 630, branch_ports_count: 2 },
  ],
  '/api/catalog/protection/device-types': [
    { id: 'rel-1', name_pl: 'Zabezpieczenie nadprądowe uniwersalne', vendor: 'SEL', model: '751A', rated_current_a: 5 },
  ],
  '/api/catalog/ct-types': [
    { id: 'ct-1', name: 'CT 300/5', ratio_primary_a: 300, ratio_secondary_a: 5, accuracy_class: '5P20', burden_va: 15 },
  ],
  '/api/catalog/vt-types': [
    { id: 'vt-1', name: 'VT 15/0,1 kV', ratio_primary_v: 15000, ratio_secondary_v: 100, accuracy_class: '0.5' },
  ],
};

// --- Fixture'y scen dowodowych E-29..E-32 (karta Z-1) ----------------------
// Wartości przepisane 1:1 z kontraktów backendu (te same kształty, co w testach
// jednostkowych modułów). ZERO fizyki w harnessie — liczby pochodzą z solvera/
// śladu/snapshotu; harness jedynie serwuje odpowiedzi zamiast żywego backendu.

// E-29 „Składowe symetryczne i sieć zerowa" (ui2/wyniki/skladowe):
//  short-circuit (bilans F1 + werdykt), trace (krok „Zk" ze składowymi Z1/Z2/Z0),
//  snapshot (uziemienie punktu neutralnego).
const SKLADOWE_WYNIK = {
  run_id: 'run-1f',
  rows: [
    {
      target_id: 'node-1',
      element_id: 'bus/gpz/sn',
      target_name: 'Szyna GPZ',
      // Liczby SPÓJNE ze składowymi śladu (Z1=Z2=0,1+j0,4; Z0=0,3+j0,9):
      // ΣZ = 0,5+j1,7 → |Zk|=1,7720 Ω; Ik1″=√3·c·Un/|ΣZ|=√3·1,1·15000/1,7720=16,128 kA;
      // X/R=1,7/0,5=3,400; κ=1,02+0,98·e^(−3·0,5/1,7)=1,4255; ip=κ·√2·Ik″=32,51 kA.
      ikss_ka: 16.128,
      ip_ka: 32.51,
      ith_ka: 16.2,
      sk_mva: 419.0,
      fault_type: '1F',
      flags: [],
      rk_ohm: 0.5,
      xk_ohm: 1.7,
      zk_ohm: 1.772,
      xr_ratio: 3.4,
      kappa: 1.4255,
      c_factor: 1.1,
      tk_s: 1.0,
      reporting_status: 'reportable',
      reporting_status_pl: 'raportowalny',
      proof_status_pl: 'pelny',
      reporting_limitations: [],
    },
  ],
};

const SKLADOWE_SLAD = {
  run_id: 'run-1f',
  snapshot_id: 'snap-1',
  input_hash: 'hash-1',
  catalog_context: [],
  white_box_trace: [
    {
      key: 'Zk',
      step: 1,
      target_id: 'node-1',
      title: 'Impedancja zastępcza w punkcie zwarcia',
      formula_latex: 'Z_k = Z_1 + Z_2 + Z_0',
      // Pełne podstawienie dyplomowe (wzór → liczby → wynik z jednostką),
      // spójne z wierszem bilansu (|Zk|=1,7720 Ω).
      substitution:
        'Z_k = (0{,}1 + j\\,0{,}4) + (0{,}1 + j\\,0{,}4) + (0{,}3 + j\\,0{,}9) = 0{,}5 + j\\,1{,}7\\ \\Omega,\\quad |Z_k| = 1{,}7720\\ \\Omega',
      inputs: {
        z1_ohm: { re: 0.1, im: 0.4 },
        z2_ohm: { re: 0.1, im: 0.4 },
        z0_ohm: { re: 0.3, im: 0.9 },
      },
    },
  ],
};

const SKLADOWE_SNAPSHOT = {
  run_id: 'run-1f',
  snapshot_id: 'snap-1',
  snapshot: {
    buses: [
      {
        id: 'b1',
        ref_id: 'bus/gpz/sn',
        name: 'Szyna GPZ',
        tags: [],
        meta: {},
        voltage_kv: 15,
        phase_system: '3ph',
        grounding: { type: 'petersen_coil', x_ohm: 120 },
      },
    ],
    transformers: [],
  },
};

// E-30 „Zbieżność rozpływu i zaczepy" (ui2/wyniki/zbieznosc): header + wynik
// rozpływu (summary) + ślad (iteracje + pętla OLTC).
const ZBIEZNOSC_HEADER = {
  id: 'run-lf-1',
  project_id: 'proj-demo',
  study_case_id: 'case-1',
  status: 'FINISHED',
  result_status: 'VALID',
  created_at: '2026-07-20T09:59:00Z',
  finished_at: '2026-07-20T10:00:00Z',
  input_hash: 'hash-1',
  converged: true,
  iterations: 4,
};

const ZBIEZNOSC_WYNIK = {
  result_version: '1.0',
  converged: true,
  iterations_count: 4,
  tolerance_used: 1e-6,
  base_mva: 100,
  slack_bus_id: 'BUS-GPZ',
  bus_results: [],
  branch_results: [],
  summary: {
    total_losses_p_mw: 0.1234,
    total_losses_q_mvar: 0.0456,
    min_v_pu: 0.978,
    max_v_pu: 1.012,
    slack_p_mw: 5.4321,
    slack_q_mvar: 1.2345,
  },
};

const ZBIEZNOSC_SLAD = {
  solver_version: 'load-flow-newton-raphson-v1',
  solver_method: 'newton-raphson',
  input_hash: 'hash-1',
  snapshot_id: 'snap-1',
  case_id: 'case-1',
  run_id: 'run-lf-1',
  init_state: {},
  init_method: 'flat_start',
  tolerance: 1e-6,
  max_iterations: 50,
  base_mva: 100,
  slack_bus_id: 'BUS-GPZ',
  pq_bus_ids: [],
  pv_bus_ids: [],
  // 4 iteracje SPÓJNE z werdyktem („zbieżny w 4 iteracjach") i tolerancją 1e-6
  // (ostatnia norma poniżej tolerancji).
  iterations: [
    { k: 1, norm_mismatch: 0.5, max_mismatch_pu: 0.2 },
    { k: 2, norm_mismatch: 0.012, max_mismatch_pu: 0.005 },
    { k: 3, norm_mismatch: 0.00035, max_mismatch_pu: 0.00011 },
    { k: 4, norm_mismatch: 8.7e-7, max_mismatch_pu: 2.9e-7 },
  ],
  converged: true,
  final_iterations_count: 4,
  oltc_control: {
    regulators: [
      {
        branch_id: 'uuid-tr-1',
        regulated_winding: 'HV',
        controlled_bus_id: 'BUS-SN',
        setpoint_kv: 15.2,
        deadband_kv: 0.2,
        initial_position: 0,
        min_position: -9,
        max_position: 9,
      },
    ],
    converged: true,
    iterations_count: 2,
    switch_counts: { 'uuid-tr-1': 2 },
    total_switch_count: 2,
    final_positions: { 'uuid-tr-1': -2 },
    initial_positions: { 'uuid-tr-1': 0 },
  },
};

const ZBIEZNOSC_SNAPSHOT = {
  header: { revision: 7, hash_sha256: 'abcdef1234567890' },
  buses: [],
  branches: [],
  transformers: [
    {
      ref_id: 'TR-1',
      name: 'TR 110/15',
      hv_bus_ref: 'B1',
      lv_bus_ref: 'B2',
      sn_mva: 16,
      uhv_kv: 110,
      ulv_kv: 15,
      uk_percent: 10,
      pk_kw: 80,
      tap_changer: {
        regulation_type: 'OLTC',
        regulated_winding: 'HV',
        neutral_position: 0,
        current_position: -1,
        min_position: -9,
        max_position: 9,
        step_percent: 1.25,
        control_mode: 'AUTOMATIC',
        voltage_setpoint_kv: 15.2,
        deadband_kv: 0.2,
      },
    },
  ],
  sources: [],
  loads: [],
  generators: [],
  substations: [],
  bays: [],
  junctions: [],
  corridors: [],
  measurements: [],
  protection_assignments: [],
};

// E-31 „Stan fazowy SN" (ui2/wyniki/stan-fazowy): wiersz kanoniczny (napięcia/
// prądy/straty per faza, asymetrie + flagi solvera).
const STAN_FAZOWY_WYNIK = {
  run_id: 'run-ps-1',
  rows: [
    {
      target_id: 'bus-1',
      element_id: 'BUS-SN-01',
      target_name: 'BUS-SN-01',
      ua_kv: 8.66,
      ub_kv: 8.61,
      uc_kv: 8.6,
      ia_a: 101.5,
      ib_a: 99.8,
      ic_a: 100.2,
      phase_losses_kw: { A: 1.031, B: 0.996, C: 1.004 },
      voltage_unbalance_percent: 0.42,
      current_unbalance_percent: 12.7,
      losses_unbalance_percent: 2.1,
      flags: {
        has_fault: false,
        has_open_phase: false,
        faulted_phases: [],
        open_phases: [],
        voltage_unbalance_alert: false,
        current_unbalance_alert: true,
        losses_unbalance_alert: false,
      },
      proof_ref: 'proof-ps-1',
      proof_status: 'complete',
      proof_status_pl: 'pełny',
      reporting_status: 'reportable',
      reporting_status_pl: 'raportowalny',
      dopuszczalnosc_raportowa: true,
      reporting_limitations: [],
    },
  ],
};

// E-32 „Stabilność dynamiczna" (ui2/wyniki/stabilnosc): werdykt STABLE ze
// statusami kryteriów (checks) + ślad automatyki (zdarzenia + efekt topologii).
const STABILNOSC_WYNIK = {
  run_id: 'run-dyn',
  rows: [
    {
      scenario_id: 'dyn-1',
      source_id: 'src/pv/1',
      faulted_element_id: 'line/gpz/1',
      cleared_by_element_ids: ['cb-main'],
      stable: true,
      status: 'STABLE',
      criteria_version: 'dynamic_stability_fault_clear_v1',
      stability_index: 0.812,
      clearing_time_ms: 120,
      max_clearing_time_ms: 150,
      clearing_margin_ms: 30,
      angle_swing_deg: 65,
      post_fault_voltage_pu: 0.97,
      post_fault_frequency_pu: 0.99,
      limiting_factor: 'angle_swing',
      violated_checks: [],
      checks: {
        clearing_time: true,
        angle_swing: true,
        voltage_recovery: true,
        frequency_recovery: true,
      },
      reporting_status_pl: 'raportowalny',
      proof_status_pl: 'pelny',
      reporting_limitations: [],
    },
  ],
};

const STABILNOSC_SLAD = {
  run_id: 'run-dyn',
  topology_effect: { network_state: 'ISLANDED_SECTION', outage_scope: 'SECTION' },
  rows: [
    { event_seq: 2, event_type: 'FAULT_APPLIED', element_id: 'line/gpz/1', detail: 'Fault applied' },
    { event_seq: 1, event_type: 'AUTOMATION_STARTED', element_id: null, detail: 'Start' },
  ],
};

const originalFetch = window.fetch.bind(window);
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

  // --- Sceny dowodowe E-29..E-32 (karta Z-1) ---------------------------------
  // Kształty odpowiedzi 1:1 z kontraktami backendu (te same fixture'y, których
  // używają testy jednostkowe modułów). Gate po `creator`, bo endpointy
  // rozpływu kolidują z szeroką regułą `/power-flow-runs` sceny „porownanie".
  const jsonOK = (body: unknown): Response =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

  if (creator === 'wyniki-skladowe') {
    if (url.endsWith('/results/short-circuit')) return jsonOK(SKLADOWE_WYNIK);
    if (url.endsWith('/results/trace')) return jsonOK(SKLADOWE_SLAD);
    if (url.endsWith('/snapshot')) return jsonOK(SKLADOWE_SNAPSHOT);
  } else if (creator === 'wyniki-zbieznosc') {
    if (url.includes('/power-flow-runs/') && url.endsWith('/results')) return jsonOK(ZBIEZNOSC_WYNIK);
    if (url.includes('/power-flow-runs/') && url.endsWith('/trace')) return jsonOK(ZBIEZNOSC_SLAD);
    if (url.includes('/power-flow-runs/')) return jsonOK(ZBIEZNOSC_HEADER);
  } else if (creator === 'wyniki-stan-fazowy') {
    if (url.includes('/results/phase-state')) return jsonOK(STAN_FAZOWY_WYNIK);
  } else if (creator === 'wyniki-stabilnosc') {
    if (url.endsWith('/results/dynamic-stability')) return jsonOK(STABILNOSC_WYNIK);
    if (url.endsWith('/results/automation-trace')) return jsonOK(STABILNOSC_SLAD);
  }

  for (const [key, body] of Object.entries(CATALOG_FIXTURES)) {
    if (url.includes(key)) {
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  }
  if (url.includes('/api/quality/energy-validation')) {
    // Scena „walidacja" (R2-D): odpowiedz 1:1 z kontraktem backendu, w tym
    // slad WHITE BOX per pozycja (R2-A) — ksztalt jak builder energy_validation.
    return new Response(
      JSON.stringify({
        context: null,
        config: { loading_warn_pct: 80, loading_fail_pct: 100, voltage_warn_pct: 5, voltage_fail_pct: 10, loss_warn_pct: 5, loss_fail_pct: 10 },
        items: [
          {
            check_type: 'VOLTAGE_DEVIATION', target_id: 'SZ-ST7', target_name: 'Szyna ST-7',
            observed_value: 12.0, unit: '%', limit_warn: 5.0, limit_fail: 10.0, margin_pct: 2.0,
            status: 'FAIL', why_pl: 'Odchylenie napieciowe 12.00 % przekracza limit 10.0 %.',
            white_box: [
              {
                tekst: 'Wzor: odchylenie = |U - U_n| / U_n * 100%',
                latex: '\\delta U = \\frac{|U - U_n|}{U_n} \\cdot 100\\%',
              },
              { tekst: 'Dane: U = 13.2000 kV (wynik PF), U_n = 15.0000 kV', latex: null },
              {
                tekst: 'Wynik: odchylenie = 12.00 %',
                latex: '\\delta U = \\frac{|13.2000 - 15.0000|}{15.0000} \\cdot 100\\% = 12.00\\%',
              },
              { tekst: 'Progi: ostrzezenie 5.0 %, przekroczenie 10.0 %', latex: null },
              { tekst: 'Werdykt: PRZEKROCZENIE', latex: null },
            ],
          },
          {
            // Scena "rozplyw" (R3-A): werdykt FAIL transformatora w kolumnie obciazalnosci.
            check_type: 'TRANSFORMER_LOADING', target_id: 'TR-1', target_name: 'Transformator TR-1',
            observed_value: 104.0, unit: '%', limit_warn: 80.0, limit_fail: 100.0, margin_pct: -4.0,
            status: 'FAIL', why_pl: 'Obciazenie transformatora 104.00 % przekracza limit 100.0 %.',
            white_box: [
              {
                tekst: 'Wzor: obciazenie = max(|S_gora|, |S_dol|) / S_n * 100%',
                latex: '\\varepsilon = \\frac{\\max(|S_{\\text{gora}}|, |S_{\\text{dol}}|)}{S_n} \\cdot 100\\%',
              },
              { tekst: 'Dane: |S_gora| = 1.6640 MVA, |S_dol| = 1.6380 MVA (wynik PF), S_n = 1.6000 MVA', latex: null },
              {
                tekst: 'Wynik: obciazenie = 104.00 %',
                latex: '\\varepsilon = \\frac{1.6640}{1.6000} \\cdot 100\\% = 104.00\\%',
              },
              { tekst: 'Progi: ostrzezenie 80.0 %, przekroczenie 100.0 %', latex: null },
              { tekst: 'Werdykt: PRZEKROCZENIE', latex: null },
            ],
          },
          {
            check_type: 'BRANCH_LOADING', target_id: 'L-14', target_name: 'Odcinek L-14',
            observed_value: 90.0, unit: '%', limit_warn: 80.0, limit_fail: 100.0, margin_pct: -10.0,
            status: 'WARNING', why_pl: 'Obciazenie 90.00 % powyzej progu ostrzegawczego 80.0 %.',
            white_box: [
              {
                tekst: 'Wzor: obciazenie = |I| / I_n * 100%',
                latex: '\\varepsilon = \\frac{|I|}{I_n} \\cdot 100\\%',
              },
              { tekst: 'Dane: |I| = 0.2295 kA (wynik PF), I_n = 0.2550 kA (dane galezi)', latex: null },
              {
                tekst: 'Wynik: obciazenie = 90.00 %',
                latex: '\\varepsilon = \\frac{0.2295}{0.2550} \\cdot 100\\% = 90.00\\%',
              },
              { tekst: 'Progi: ostrzezenie 80.0 %, przekroczenie 100.0 %', latex: null },
              { tekst: 'Werdykt: OSTRZEZENIE', latex: null },
            ],
          },
        ],
        summary: { pass_count: 5, warning_count: 1, fail_count: 2, not_computed_count: 0, worst_item_target_id: 'SZ-ST7', worst_item_margin_pct: 2.0 },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (url.includes('/api/proof/sc3f/contributions')) {
    // Scena "zwarcia" (R3-B): rozbicie maszynowe — ksztalt 1:1 z
    // `MachineShortCircuitResult.to_dict()` (pola konsumowane przez `naWklady`).
    return new Response(
      JSON.stringify({
        contributions: [
          { source_id: 'src-gpz', source_name: 'System (GPZ 110/15)', ikss_partial_a: 9620 },
          {
            source_id: 'gen-pv-1', source_name: 'Falownik PV 4 MW', ikss_partial_a: 1730,
            machine_type: 'ASYNCHRONOUS', ir_a: 333, ratio_ik_ir: 5.2, mu: 0.756, q: 0.65, ib_a: 850,
            wywod: [
              {
                tekst: 'Wspolczynnik zaniku mu (krzywa t_min = 0.10 s, par. 6.6.1): mu = 0.756',
                latex: "\\mu = 0.62 + 0.72\\,e^{-0.32\\,I''_k/I_r} = 0.62 + 0.72\\,e^{-0.32 \\cdot 5.20} = 0.756",
              },
              {
                tekst: 'Prad wylaczeniowy symetryczny: Ib = 0.850 kA',
                latex: "I_b = \\mu \\cdot q \\cdot I''_{k,m} = 0.756 \\cdot 0.650 \\cdot 1.730\\;\\mathrm{kA} = 0.850\\;\\mathrm{kA}",
              },
            ],
          },
          { source_id: 'gen-bess-1', source_name: 'Magazyn BESS 2 MW', ikss_partial_a: 1130 },
        ],
        // Wywod DYPLOMOWY {tekst, latex} — ksztalt 1:1 z `_wywod_wkladow`
        // (api/proof_pack.py) + `wywod_maszyny` solvera (kazdy krok: wzor
        // ogolny -> podstawienie liczbowe -> wynik; zasada KaTeX 2026-07-22).
        wywod: [
          { tekst: 'Model: IEC 60909-0:2016 par. 6.6 — prady czesciowe maszyn + zanik (mu, q)', latex: null },
          { tekst: "Punkt zwarcia: I''k (calkowity, z Z-bus) = 12.480 kA, c = 1.10, t_min = 0.10 s", latex: null },
          { tekst: '— Falownik PV 4 MW (ASYNCHRONOUS) —', latex: null },
          {
            tekst: "Impedancja zastepcza maszyny: Z''m = 0.1150 + j1.1420 ohm",
            latex: "Z''_m = 0.1150 + j\\,1.1420\\;\\Omega,\\qquad |Z''_m| = 1.1478\\;\\Omega",
          },
          {
            tekst: 'Prad czesciowy maszyny (superpozycja Z-bus; przy zwarciu na zaciskach rownowazne c*Un/(sqrt(3)*Z\'\'))',
            latex:
              "I''_{k,m} = \\frac{c\\,|Z_{mk}|}{|Z_{kk}|\\,|Z_m|}\\,I_{\\mathrm{base}} = \\frac{1.10 \\cdot 0.0086}{0.0402 \\cdot 0.5102} \\cdot 3849\\;\\mathrm{A} = 1.730\\;\\mathrm{kA}",
          },
          {
            tekst: "Krotnosc pradu znamionowego: I''k/Ir = 5.20",
            latex: "\\frac{I''_{k,m}}{I_{r,m}} = \\frac{1.730}{0.333} = 5.20",
          },
          {
            tekst: 'Wspolczynnik zaniku mu (krzywa t_min = 0.10 s, par. 6.6.1): mu = 0.756',
            latex: "\\mu = 0.62 + 0.72\\,e^{-0.32\\,I''_k/I_r} = 0.62 + 0.72\\,e^{-0.32 \\cdot 5.20} = 0.756",
          },
          {
            tekst: 'Wspolczynnik q silnika asynchronicznego (m = 1.950 MW/pare biegunow, par. 6.6.3): q = 0.650',
            latex: 'q = 0.57 + 0.12\\,\\ln m = 0.57 + 0.12\\,\\ln(1.950) = 0.650',
          },
          {
            tekst: 'Prad wylaczeniowy symetryczny: Ib = 0.850 kA',
            latex:
              "I_b = \\mu \\cdot q \\cdot I''_{k,m} = 0.756 \\cdot 0.650 \\cdot 1.730\\;\\mathrm{kA} = 0.850\\;\\mathrm{kA}",
          },
          {
            tekst: "Suma wkladow maszyn: I''k,M = 2.860 kA, I_b,M = 2.107 kA",
            latex: "I''_{k,M} = \\sum_m I''_{k,m}, \\qquad I_{b,M} = \\sum_m I_{b,m}",
          },
          {
            tekst: "Regula malych silnikow (par. 6.6): pomijalne gdy suma I''k,M <= 0.05 * I''k — NIESPELNIONA",
            latex: null,
          },
        ],
        // ZWARCIA-PRO F3: wywod sekcyjny (akordeon z norma) + checklista walidacji IEC.
        wywod_sekcje: [
          {
            tytul: 'Dane wejsciowe i model',
            norma: 'IEC 60909-0:2016',
            kroki: [
              { tekst: 'Model: IEC 60909-0:2016 par. 6.6 — prady czesciowe maszyn + zanik (mu, q)', latex: null },
              { tekst: "Punkt zwarcia: I''k (calkowity, z Z-bus) = 12.480 kA, c = 1.10, t_min = 0.10 s", latex: null },
            ],
          },
          {
            tytul: 'Wklad: Falownik PV 4 MW',
            norma: 'IEC 60909-0:2016 §6.6',
            kroki: [
              {
                tekst: 'Prad czesciowy maszyny (superpozycja Z-bus)',
                latex: "I''_{k,m} = \\frac{c\\,|Z_{mk}|}{|Z_{kk}|\\,|Z_m|}\\,I_{\\mathrm{base}} = \\frac{1.10 \\cdot 0.0086}{0.0402 \\cdot 0.5102} \\cdot 3849\\;\\mathrm{A} = 1.730\\;\\mathrm{kA}",
              },
              {
                tekst: 'Wspolczynnik zaniku mu (krzywa t_min = 0.10 s): mu = 0.756',
                latex: "\\mu = 0.62 + 0.72\\,e^{-0.32 \\cdot 5.20} = 0.756",
              },
              {
                tekst: 'Prad wylaczeniowy symetryczny: Ib = 0.850 kA',
                latex: "I_b = 0.756 \\cdot 0.650 \\cdot 1.730\\;\\mathrm{kA} = 0.850\\;\\mathrm{kA}",
              },
            ],
          },
          {
            tytul: 'Suma wkladow i reguly',
            norma: 'IEC 60909-0:2016 §6.6',
            kroki: [
              {
                tekst: "Suma wkladow maszyn: I''k,M = 2.860 kA, I_b,M = 2.107 kA",
                latex: "I''_{k,M} = \\sum_m I''_{k,m}, \\qquad I_{b,M} = \\sum_m I_{b,m}",
              },
              {
                tekst: "Regula malych silnikow (par. 6.6): wymaganie suma I''k,M <= 0.05 * I''k; prog 0.624 kA; obliczone 2.860 kA -> NIESPELNIONA (silniki niepomijalne w Ib)",
                latex: "\\sum_m I''_{k,M} = 2.860\\;\\mathrm{kA} \\; > \\; 0.05 \\cdot 12.480\\;\\mathrm{kA} = 0.624\\;\\mathrm{kA} \\Rightarrow \\text{NIESPELNIONA}",
              },
            ],
          },
        ],
        walidacja_iec: [
          { pozycja_pl: 'Norma bazowa metody', wartosc_pl: 'IEC 60909-0:2016', status: 'INFO' },
          { pozycja_pl: 'Wspolczynnik napieciowy c', wartosc_pl: 'c = 1.10 (z tego przebiegu)', status: 'INFO' },
          { pozycja_pl: 'Metoda obliczenia wkladow', wartosc_pl: 'superpozycja Z-bus (prady czesciowe maszyn)', status: 'INFO' },
          { pozycja_pl: 'Maszyny asynchroniczne', wartosc_pl: 'uwzglednione: 1 szt.', status: 'PASS' },
          { pozycja_pl: 'Regula malych silnikow (5%)', wartosc_pl: 'NIESPELNIONA — silniki niepomijalne w Ib (2.860 > 0.624 kA)', status: 'FAIL' },
          { pozycja_pl: 'Determinizm kontraktu (input_hash)', wartosc_pl: 'obecny: a1b2c3d4e5f6...', status: 'PASS' },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (url.includes('/power-flow-runs')) {
    // Scena "porownanie": lista zakonczonych przebiegow rozplywu projektu.
    return new Response(
      JSON.stringify({
        runs: [
          { id: 'run-a', project_id: 'proj-demo', study_case_id: 'K1', status: 'FINISHED', result_status: 'FRESH', created_at: '2026-07-21T10:00:00Z', finished_at: '2026-07-21T10:00:04Z', input_hash: 'hash-a', converged: true, iterations: 5 },
          { id: 'run-b', project_id: 'proj-demo', study_case_id: 'K2', status: 'FINISHED', result_status: 'FRESH', created_at: '2026-07-21T11:00:00Z', finished_at: '2026-07-21T11:00:05Z', input_hash: 'hash-b', converged: true, iterations: 6 },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (url.includes('/api/power-flow-comparisons')) {
    // Scena "porownanie" (R3-C): wynik porownania A/B — ksztalt 1:1 z
    // `PowerFlowComparisonResult` (delty i ranking WYLACZNIE z backendu).
    return new Response(
      JSON.stringify({
        comparison_id: 'cmp-demo-1', run_a_id: 'run-a', run_b_id: 'run-b', project_id: 'proj-demo',
        bus_diffs: [
          { bus_id: 'SZ-GPZ', v_pu_a: 1.0, v_pu_b: 1.0, angle_deg_a: 0, angle_deg_b: 0, p_injected_mw_a: 6.4, p_injected_mw_b: 5.1, q_injected_mvar_a: 1.9, q_injected_mvar_b: 1.4, delta_v_pu: 0, delta_angle_deg: 0, delta_p_mw: -1.3, delta_q_mvar: -0.5 },
          { bus_id: 'SZ-ST7', v_pu_a: 0.941, v_pu_b: 0.972, angle_deg_a: -2.9, angle_deg_b: -2.1, p_injected_mw_a: -1.2, p_injected_mw_b: -1.2, q_injected_mvar_a: -0.4, q_injected_mvar_b: -0.1, delta_v_pu: 0.031, delta_angle_deg: 0.8, delta_p_mw: 0, delta_q_mvar: 0.3 },
          { bus_id: 'SZ-PV2', v_pu_a: 1.062, v_pu_b: 1.038, angle_deg_a: 1.4, angle_deg_b: 1.1, p_injected_mw_a: 3.9, p_injected_mw_b: 2.6, q_injected_mvar_a: 0.2, q_injected_mvar_b: 0.4, delta_v_pu: -0.024, delta_angle_deg: -0.3, delta_p_mw: -1.3, delta_q_mvar: 0.2 },
        ],
        branch_diffs: [
          { branch_id: 'L-14', p_from_mw_a: 2.31, p_from_mw_b: 1.62, q_from_mvar_a: 0.72, q_from_mvar_b: 0.48, p_to_mw_a: -2.28, p_to_mw_b: -1.6, q_to_mvar_a: -0.7, q_to_mvar_b: -0.47, losses_p_mw_a: 0.031, losses_p_mw_b: 0.015, losses_q_mvar_a: 0.018, losses_q_mvar_b: 0.009, delta_p_from_mw: -0.69, delta_q_from_mvar: -0.24, delta_p_to_mw: 0.68, delta_q_to_mvar: 0.23, delta_losses_p_mw: -0.016, delta_losses_q_mvar: -0.009 },
          { branch_id: 'TR-1', p_from_mw_a: 1.66, p_from_mw_b: 1.31, q_from_mvar_a: 0.5, q_from_mvar_b: 0.38, p_to_mw_a: -1.64, p_to_mw_b: -1.3, q_to_mvar_a: -0.48, q_to_mvar_b: -0.37, losses_p_mw_a: 0.021, losses_p_mw_b: 0.013, losses_q_mvar_a: 0.02, losses_q_mvar_b: 0.012, delta_p_from_mw: -0.35, delta_q_from_mvar: -0.12, delta_p_to_mw: 0.34, delta_q_to_mvar: 0.11, delta_losses_p_mw: -0.008, delta_losses_q_mvar: -0.008 },
        ],
        ranking: [
          { issue_code: 'VOLTAGE_DELTA_HIGH', severity: 4, element_ref: 'SZ-ST7', description_pl: 'Napiecie na szynie ST-7 rosnie o 0.031 pu po zalaczeniu kompensacji.', evidence_ref: 1 },
          { issue_code: 'LOSSES_DECREASED', severity: 2, element_ref: 'L-14', description_pl: 'Straty czynne odcinka L-14 spadaja o 16 kW.', evidence_ref: 2 },
        ],
        summary: { total_buses: 3, total_branches: 2, converged_a: true, converged_b: true, total_losses_p_mw_a: 0.052, total_losses_p_mw_b: 0.028, delta_total_losses_p_mw: -0.024, max_delta_v_pu: 0.031, max_delta_angle_deg: 0.8, total_issues: 2, critical_issues: 0, major_issues: 1, moderate_issues: 0, minor_issues: 1 },
        input_hash: 'hash-cmp-demo', created_at: '2026-07-22T09:00:00Z',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (url.includes('/api/oze-analysis/grid-strength')) {
    // Scena "sila-sieci" (V-B): sila sieci SCR/WSCR — ksztalt 1:1 z
    // `analysis/grid_strength/serializer.py::view_to_dict`; kroki WHITE BOX
    // DOKLADNIE jak builder (SCR -> werdykt; WSCR z licznikiem/mianownikiem),
    // liczby spojne: 189.9/8.0=23.7375; 45.0/20.0=2.25; WSCR=2419.2/784=3.0857.
    return new Response(
      JSON.stringify({
        analysis_id: 'gs-demo-1',
        context: {
          project_name: 'Przyłączenie farmy PV 8 MW', case_name: 'Stan normalny',
          run_timestamp: '2026-07-22T08:30:00Z', snapshot_id: 'snap-demo', trace_id: 'run-sc-4',
        },
        weak_threshold: 3.0,
        very_weak_threshold: 2.0,
        entries: [
          {
            bus_ref: 'SZ-PV2', nominal_kv: 15.0, s_sc_mva: 189.9, s_installed_mva: 8.0,
            scr: 23.7375, verdict: 'mocna', is_weak: false,
            why_pl: 'SCR = 23.7375 ≥ 3.0 — sieć mocna w węźle; klasyczne założenia pracy źródła falownikowego pozostają ważne.',
            missing_data: [],
            white_box: [
              {
                symbol: 'SCR',
                formula_latex: "\\mathrm{SCR} = \\dfrac{S_{sc}''}{S_n}",
                substitution_pl: 'SCR = 189.9 MVA / 8.0 MVA',
                result_pl: 'SCR = 23.7375 (–)',
              },
              {
                symbol: 'werdykt',
                formula_latex: '\\mathrm{SCR} \\; \\geq \\; 3.0',
                substitution_pl: 'próg słaby = 3.0; próg bardzo słaby = 2.0',
                result_pl: 'sieć mocna',
              },
            ],
            modules: [{ ref: 'gen-pv-1', name: 'Farma PV 8 MW', sn_mva: 8.0 }],
          },
          {
            bus_ref: 'SZ-FW1', nominal_kv: 15.0, s_sc_mva: 45.0, s_installed_mva: 20.0,
            scr: 2.25, verdict: 'słaba', is_weak: true,
            why_pl: 'SCR = 2.25 (przedział [2.0; 3.0)) — sieć słaba w węźle. Wymagana ostrożność: weryfikacja stabilności impedancyjnej i interakcji regulatorów.',
            missing_data: [],
            white_box: [
              {
                symbol: 'SCR',
                formula_latex: "\\mathrm{SCR} = \\dfrac{S_{sc}''}{S_n}",
                substitution_pl: 'SCR = 45.0 MVA / 20.0 MVA',
                result_pl: 'SCR = 2.25 (–)',
              },
              {
                symbol: 'werdykt',
                formula_latex: '\\mathrm{SCR} \\; \\lt \\; 3.0',
                substitution_pl: 'próg słaby = 3.0; próg bardzo słaby = 2.0',
                result_pl: 'sieć słaba',
              },
            ],
            modules: [{ ref: 'gen-fw-1', name: 'Park wiatrowy 20 MVA', sn_mva: 20.0 }],
          },
          {
            bus_ref: 'SZ-BS1', nominal_kv: null, s_sc_mva: null, s_installed_mva: 2.2,
            scr: null, verdict: 'brak danych', is_weak: false,
            why_pl: 'Brak mocy zwarciowej — SCR nieobliczony.',
            missing_data: ['s_sc_mva'], white_box: [],
            modules: [{ ref: 'gen-bess-1', name: 'Magazyn BESS 2 MW', sn_mva: 2.2 }],
          },
        ],
        summary: {
          total_buses: 3, weak_bus_count: 1, not_computed_count: 1,
          wscr: 3.0857, wscr_verdict: 'mocna',
          wscr_why_pl: 'WSCR = 3.0857 dla 2 źródeł — sieć mocna. WSCR ujmuje wzajemne oddziaływanie źródeł falownikowych w pobliżu (metodyka ERCOT).',
          wscr_white_box: [
            {
              symbol: 'WSCR',
              formula_latex: "\\mathrm{WSCR} = \\dfrac{\\sum_i S_{sc,i}'' \\cdot S_{n,i}}{\\left(\\sum_i S_{n,i}\\right)^2}",
              substitution_pl: 'licznik Σ(S_sc·S_n) = 2419.2 MVA²; (Σ S_n)² = 784.0 MVA²',
              result_pl: 'WSCR = 3.0857 (–), n = 2',
            },
          ],
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (url.includes('/api/oze-analysis/compensation-sizing')) {
    // Scena "kompensacja-wynik" (V-B): dobor kompensacji PO obliczeniu — ksztalt
    // 1:1 z `application/analyses/dobor_kompensacji.py::build_compensation_sizing_view`.
    // Liczby spojne (P=1.2 MW, Q_load=0.84 Mvar, V=0.98 pu -> V²=0.96):
    // baseline cosφ = 1.2/√(1.44+0.7056) = 0.82; kandydat 0.6 Mvar: Q_cap_eff =
    // 0.6·0.96 = 0.58 -> Q_netto = 0.26 -> cosφ punktu = 0.98 ≥ 0.95 (DOBOR).
    return new Response(
      JSON.stringify({
        analysis: 'compensation_sizing',
        context: { trace_id: 'run-lf-3', snapshot_id: 'snap-demo', case_name: 'Stan normalny' },
        parameters: {
          bus_ref: 'SZ-ST7', bus_name: 'Szyna ST-7', bus_voltage_kv: 15,
          cos_phi_min: 0.95, uwzglednij_noc: false,
        },
        input_hash: 'komp-hash-a1b2c3',
        baseline: {
          cosfi_przekroju_dzien: 0.82, cosfi_przekroju_noc: null,
          cosfi_punktu_dzien: 0.82, cosfi_punktu_noc: null,
        },
        candidates: [
          {
            catalog_ref: 'cap-0v3', name: 'Bateria SN 0,3 Mvar / 15 kV', rated_mvar: 0.3, rated_kv: 15,
            cosfi_przekroju_dzien: 0.73, cosfi_przekroju_noc: null,
            cosfi_punktu_dzien: 0.91, cosfi_punktu_noc: null,
            p_point_day_mw: 1.2, q_przekroju_dzien_mvar: 1.13,
            q_cap_eff_dzien_mvar: 0.29, q_netto_punktu_dzien_mvar: 0.55,
            p_point_night_mw: null, q_przekroju_noc_mvar: null,
            q_cap_eff_noc_mvar: null, q_netto_punktu_noc_mvar: null,
            spelnia_dzien: false, spelnia_noc: null, spelnia: false,
          },
          {
            catalog_ref: 'cap-0v6', name: 'Bateria SN 0,6 Mvar / 15 kV', rated_mvar: 0.6, rated_kv: 15,
            // cosφ przekroju NISKIE (0.65 < 0.95), a kandydat SPELNIA — dobor
            // sterowany cosφ PUNKTU (0.98 ≥ 0.95); wymog wlasciciela V12K-040 B.
            cosfi_przekroju_dzien: 0.65, cosfi_przekroju_noc: null,
            cosfi_punktu_dzien: 0.98, cosfi_punktu_noc: null,
            p_point_day_mw: 1.2, q_przekroju_dzien_mvar: 1.42,
            q_cap_eff_dzien_mvar: 0.58, q_netto_punktu_dzien_mvar: 0.26,
            p_point_night_mw: null, q_przekroju_noc_mvar: null,
            q_cap_eff_noc_mvar: null, q_netto_punktu_noc_mvar: null,
            spelnia_dzien: true, spelnia_noc: null, spelnia: true,
          },
          {
            catalog_ref: 'cap-0v9', name: 'Bateria SN 0,9 Mvar / 15 kV', rated_mvar: 0.9, rated_kv: 15,
            cosfi_przekroju_dzien: 0.58, cosfi_przekroju_noc: null,
            cosfi_punktu_dzien: 1.0, cosfi_punktu_noc: null,
            p_point_day_mw: 1.2, q_przekroju_dzien_mvar: 1.7,
            q_cap_eff_dzien_mvar: 0.86, q_netto_punktu_dzien_mvar: -0.02,
            p_point_night_mw: null, q_przekroju_noc_mvar: null,
            q_cap_eff_noc_mvar: null, q_netto_punktu_noc_mvar: null,
            spelnia_dzien: true, spelnia_noc: null, spelnia: true,
          },
        ],
        dobor: {
          catalog_ref: 'cap-0v6', name: 'Bateria SN 0,6 Mvar / 15 kV', rated_mvar: 0.6, rated_kv: 15,
          cosfi_punktu_dzien: 0.98, cosfi_punktu_noc: null,
          cosfi_przekroju_dzien: 0.65, cosfi_przekroju_noc: null,
        },
        powod_braku: null,
        whitebox: {
          pq_source:
            'wypadkowy przepływ gałęzi zasilających punkt z branch_results solvera '
            + '(koniec przy punkcie, suma po gałęziach incydentnych) przełożony na znak '
            + 'kanoniczny przez adapter konwencji (application/analyses/konwencja_mocy.py)',
          cosfi_przekroju:
            'cosφ przepływu w przekroju sieciowym = |P| / √(P² + Q_przekroju²); '
            + 'opisuje przekrój sieci, NIE stopień skompensowania odbioru',
          cosfi_punktu:
            'cosφ punktu kompensowanego = |P| / √(P² + Q_netto²), Q_netto = Q_load − Q_cap_eff, '
            + 'Q_cap_eff = Σ(rated_mvar) · V² (model kondensatora z katalogu, nie fizyka pola); '
            + 'PODSTAWA DOBORU',
          konwencja_kanoniczna: 'P>0 pobór czynnej, Q>0 pobór indukcyjnej, Q<0 pojemnościowa',
          decyzja: 'V12K-040 opcja B — PowerFlowResult FROZEN, adapter interpretacyjny',
          candidate_count: 3,
          night_scenario: null,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (url.includes('/api/quality/flicker')) {
    // Scena "migotanie" (V-B): ocena Pst/Plt/d — ksztalt 1:1 z
    // `application/analyses/migotanie.py::build_migotanie_view` (kroki `_step`
    // z `formula_latex` KaTeX). Liczby spojne miedzy krokami:
    //   SZ-PV2 (Sk″=189.9): 19.5·4/189.9=0.4107; 13·5/189.9=0.3423;
    //     Pst=(0.4107³+0.3423³)^(1/3)=0.4782; d=1·9.5/189.9·100=5.0026 %.
    //   SZ-FW1 (Sk″=45): 6.8·8/45=1.2089 > 0.9 -> przekroczenie.
    return new Response(
      JSON.stringify({
        analysis_id: 'mig-demo-1',
        context: {
          project_name: 'Przyłączenie farmy PV 8 MW', case_name: 'Stan normalny',
          run_timestamp: '2026-07-22T08:40:00Z', snapshot_id: 'snap-demo', trace_id: 'run-sc-5',
        },
        config: {
          flicker_summation_exponent_m: 3,
          planning_level_pst: 0.9,
          planning_level_plt: 0.7,
          rvc_kmax: 1.0,
        },
        buses: [
          {
            bus_ref: 'SZ-PV2', nominal_kv: 15.0, sk_mva: 189.9,
            modules: [
              {
                gen_ref: 'gen-pv-1', sn_mva: 4.0, flicker_c: 19.5, pst_i: 0.4107,
                included: true, info_pl: null,
                white_box: [
                  {
                    symbol: 'P_{st,i}',
                    formula_latex: "P_{st,i} = c_i \\cdot \\dfrac{S_{n,i}}{S_{k}''}",
                    substitution_pl: 'P_st_i = 19.5 · 4 / 189.9 MVA',
                    result_pl: 'P_st_i = 0.4107',
                  },
                ],
              },
              {
                gen_ref: 'gen-pv-2', sn_mva: 0.5, flicker_c: null, pst_i: null,
                included: false,
                info_pl: 'brak współczynnika emisji migotania w katalogu — moduł pominięty w sumowaniu',
                white_box: [],
              },
              {
                gen_ref: 'gen-fw-3', sn_mva: 5.0, flicker_c: 13.0, pst_i: 0.3423,
                included: true, info_pl: null,
                white_box: [
                  {
                    symbol: 'P_{st,i}',
                    formula_latex: "P_{st,i} = c_i \\cdot \\dfrac{S_{n,i}}{S_{k}''}",
                    substitution_pl: 'P_st_i = 13 · 5 / 189.9 MVA',
                    result_pl: 'P_st_i = 0.3423',
                  },
                ],
              },
            ],
            pst: 0.4782, plt: 0.4782, d_percent: 5.0026,
            pst_limit: 0.9, plt_limit: 0.7,
            verdict_pl: 'w granicach planowania',
            zalozenia_pl: [
              "Emisja pojedynczego źródła: Pst_i = c · Sn / Sk'' (c — współczynnik emisji "
              + 'migotania z certyfikatu urządzenia; metodyka IEC 61400-21-1).',
              'Sumowanie emisji wielu źródeł w węźle: Pst = (Σ Pst_i^m)^(1/m), wykładnik '
              + 'm = 3 (sumowanie sześcienne wg IEC/TR 61000-3-7:2008, §5.2).',
              'Plt = Pst — założenie konserwatywne dla ciągłej, ustalonej emisji źródeł OZE '
              + '(równe wartości Pst w oknie 2 h dają Plt = Pst z definicji Plt).',
              'Poziomy planowania dla SN: Pst = 0.9, Plt = 0.7 — wartości orientacyjne wg '
              + 'IEC/TR 61000-3-7:2008, Tablica 1. Wiążące wymaganie ustala OSD.',
              'Szybka zmiana napięcia d = kmax · Sn / Sk\'\' · 100, kmax = 1 (założenie '
              + 'konserwatywne — załączenie pełnej mocy zainstalowanej w węźle; '
              + 'IEC/TR 61000-3-7:2008, §5.5).',
            ],
            white_box: [
              {
                symbol: 'P_{st}',
                formula_latex: 'P_{st} = \\left( \\sum_i P_{st,i}^{\\,m} \\right)^{1/m}, \\quad m = 3',
                substitution_pl: 'P_st = (0.4107^3 + 0.3423^3)^(1/3)',
                result_pl: 'P_st = 0.4782',
              },
              {
                symbol: 'P_{lt}',
                formula_latex: 'P_{lt} = P_{st}',
                substitution_pl: 'P_lt = P_st = 0.4782 (emisja ciągła, założenie konserwatywne)',
                result_pl: 'P_lt = 0.4782',
              },
              {
                symbol: 'd',
                formula_latex: "d = k_{max} \\cdot \\dfrac{S_{n}}{S_{k}''} \\cdot 100\\%",
                substitution_pl: 'd = 1 · 9.5 / 189.9 · 100 %',
                result_pl: 'd = 5.0026 %',
              },
            ],
          },
          {
            bus_ref: 'SZ-FW1', nominal_kv: 15.0, sk_mva: 45.0,
            modules: [
              {
                gen_ref: 'gen-fw-1', sn_mva: 8.0, flicker_c: 6.8, pst_i: 1.2089,
                included: true, info_pl: null,
                white_box: [
                  {
                    symbol: 'P_{st,i}',
                    formula_latex: "P_{st,i} = c_i \\cdot \\dfrac{S_{n,i}}{S_{k}''}",
                    substitution_pl: 'P_st_i = 6.8 · 8 / 45 MVA',
                    result_pl: 'P_st_i = 1.2089',
                  },
                ],
              },
            ],
            pst: 1.2089, plt: 1.2089, d_percent: 17.7778,
            pst_limit: 0.9, plt_limit: 0.7,
            verdict_pl: 'przekroczenie poziomu planowania',
            zalozenia_pl: [
              'Sumowanie emisji wielu źródeł w węźle: Pst = (Σ Pst_i^m)^(1/m), wykładnik '
              + 'm = 3 (sumowanie sześcienne wg IEC/TR 61000-3-7:2008, §5.2).',
              'Poziomy planowania dla SN: Pst = 0.9, Plt = 0.7 — wartości orientacyjne wg '
              + 'IEC/TR 61000-3-7:2008, Tablica 1. Wiążące wymaganie ustala OSD.',
            ],
            white_box: [
              {
                symbol: 'P_{st}',
                formula_latex: 'P_{st} = \\left( \\sum_i P_{st,i}^{\\,m} \\right)^{1/m}, \\quad m = 3',
                substitution_pl: 'P_st = (1.2089^3)^(1/3)',
                result_pl: 'P_st = 1.2089',
              },
              {
                symbol: 'P_{lt}',
                formula_latex: 'P_{lt} = P_{st}',
                substitution_pl: 'P_lt = P_st = 1.2089 (emisja ciągła, założenie konserwatywne)',
                result_pl: 'P_lt = 1.2089',
              },
              {
                symbol: 'd',
                formula_latex: "d = k_{max} \\cdot \\dfrac{S_{n}}{S_{k}''} \\cdot 100\\%",
                substitution_pl: 'd = 1 · 8 / 45 · 100 %',
                result_pl: 'd = 17.7778 %',
              },
            ],
          },
        ],
        summary: { total_buses: 2, assessed_count: 2, exceeded_count: 1, not_assessed_count: 0 },
        input_hash: 'mig-hash-demo',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (url.includes('/api/quality/as-built-compliance')) {
    // Scena "odbior-zgodnosc" (V-B): raport zgodnosci powykonawczej — ksztalt
    // 1:1 z `application/analyses/zgodnosc_powykonawcza.py::build_zgodnosc_
    // powykonawcza_view`; slad_pl per wiersz (model -> pomiar -> odchylka ->
    // tolerancja -> werdykt); echo pomiarow wpisanych w edytorze speca.
    return new Response(
      JSON.stringify({
        analysis_id: 'run-lf-5',
        input_hash: 'zgodnosc-hash-demo',
        tolerancje: { napiecie_pct: 5, moc_pct: 10 },
        zrodlo_tolerancji: { napiecie_pct: 'jawna (żądanie)', moc_pct: 'jawna (żądanie)' },
        zalozenia_pl: [
          'Porównanie 1:1 pomiar–model (wynik rozpływu FROZEN); bez estymacji stanu '
          + '(solver WLS istnieje, ale nie jest używany) i bez korekt modelu.',
          'Napięcie U przeliczane na kV z u_pu przez napięcie znamionowe węzła (U = u_pu · U_n).',
          'Moce P/Q odczytywane z gałęzi w kierunku „from" (p_from_mw / q_from_mvar).',
          'Konwencja znaku Q nierozstrzygnięta (V12K-040): Q porównywane po wartości '
          + 'bezwzględnej |Q|; znak odchyłki nie jest interpretowany.',
          'Tolerancje wyłącznie jawne (z żądania); brak udokumentowanego źródła '
          + 'normatywnego dla wartości domyślnych, więc domyślnych nie przyjęto.',
        ],
        podsumowanie: {
          liczba_punktow: 4, w_tolerancji: 1, poza_tolerancja: 1,
          brak_odpowiednika: 1, brak_wyniku: 1,
          najwieksza_odchylka_pct: 12.5,
          najwieksza_odchylka_element_ref: 'LINE-2',
          najwieksza_odchylka_wielkosc: 'P',
        },
        wiersze: [
          {
            element_ref: 'BUS-1', wielkosc: 'U', jednostka: 'kV',
            wartosc_pomiar: 15.3, wartosc_model: 15.15,
            odchylka_bezwzgledna: 0.15, odchylka_pct: 0.99, tolerancja_pct: 5,
            werdykt: 'w tolerancji',
            slad_pl: [
              'Model U = u_pu × U_n = 1.010000 × 15.000000 = 15.150000 kV',
              'Pomiar U = 15.300000 kV',
              'Odchyłka = pomiar − model = 0.150000 kV (0.990099%)',
              'Tolerancja = ±5.000000%',
              'Werdykt: w tolerancji',
            ],
          },
          {
            element_ref: 'LINE-2', wielkosc: 'P', jednostka: 'MW',
            wartosc_pomiar: 4.5, wartosc_model: 4.0,
            odchylka_bezwzgledna: 0.5, odchylka_pct: 12.5, tolerancja_pct: 10,
            werdykt: 'poza tolerancją',
            slad_pl: [
              'Model P_from = 4.000000 MW',
              'Pomiar P = 4.500000 MW',
              'Odchyłka = pomiar − model = 0.500000 MW (12.500000%)',
              'Tolerancja = ±10.000000%',
              'Werdykt: poza tolerancją',
            ],
          },
          {
            element_ref: 'NIEZNANY-3', wielkosc: 'U', jednostka: 'kV',
            wartosc_pomiar: 10.0, wartosc_model: null,
            odchylka_bezwzgledna: null, odchylka_pct: null, tolerancja_pct: null,
            werdykt: 'brak odpowiednika w modelu',
            slad_pl: ['Element „NIEZNANY-3" nie występuje jako węzeł w wyniku rozpływu.'],
          },
          {
            element_ref: 'TRAFO-4', wielkosc: 'Q', jednostka: 'Mvar',
            wartosc_pomiar: 1.2, wartosc_model: null,
            odchylka_bezwzgledna: null, odchylka_pct: null, tolerancja_pct: null,
            werdykt: 'brak wyniku dla elementu',
            slad_pl: ['Brak wyniku Q (kierunek „from") dla gałęzi „TRAFO-4".'],
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (url.includes('/api/quality/state-estimation/requirements')) {
    // Scena "estymacja" (V-B): wymagane wejscia WLS — ksztalt 1:1 z
    // `application/analyses/state_estimation/service.py` (requirements).
    return new Response(
      JSON.stringify({
        analysis_id: 'run-lf-6',
        context: {
          project_name: 'Przyłączenie farmy PV 8 MW', case_name: 'Stan normalny',
          run_timestamp: '2026-07-22T08:50:00Z', snapshot_id: 'snap-demo', trace_id: 'run-lf-6',
        },
        base_mva: 100.0,
        slack_bus_ref: 'BUS-1',
        slack_index: 0,
        n_buses: 3,
        n_states: 5,
        min_measurements: 5,
        buses: [
          { bus_ref: 'BUS-1', index: 0, name: 'Szyna GPZ', voltage_kv: 110.0, is_slack: true },
          { bus_ref: 'BUS-2', index: 1, name: 'Szyna SN', voltage_kv: 15.0, is_slack: false },
          { bus_ref: 'BUS-3', index: 2, name: null, voltage_kv: 15.0, is_slack: false },
        ],
        measurement_types: [
          { code: 'V_MAGNITUDE', label_pl: 'Moduł napięcia węzła |V| [pu]', requires_bus_j: false },
          { code: 'P_INJECTION', label_pl: 'Iniekcja mocy czynnej w węźle P [pu]', requires_bus_j: false },
          { code: 'Q_INJECTION', label_pl: 'Iniekcja mocy biernej w węźle Q [pu]', requires_bus_j: false },
          { code: 'P_FLOW', label_pl: 'Przepływ mocy czynnej w gałęzi P_ij [pu]', requires_bus_j: true },
          { code: 'Q_FLOW', label_pl: 'Przepływ mocy biernej w gałęzi Q_ij [pu]', requires_bus_j: true },
        ],
        note_pl:
          'Pomiary muszą być w jednostkach względnych (pu) na tej samej bazie mocy '
          + '(base_mva) co macierz Y-bus.',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (url.includes('/api/quality/state-estimation')) {
    // Scena "estymacja" (V-B): wynik WLS — ksztalt 1:1 z `_serialize_result`.
    // Liczby spojne: 6 pomiarow (echo edytora speca), n=5 stanow, dof=1;
    // chi² = 27.8 > prog 6.635 (alfa 0.01, dof 1); LNR 5.2 > 3.0 na pomiarze
    // |V| BUS-1 (pomiar 1.05 vs estymata 1.029 -> rezyduum 0.021 = 5.25·sigma).
    return new Response(
      JSON.stringify({
        analysis_id: 'run-lf-6',
        context: {
          project_name: 'Przyłączenie farmy PV 8 MW', case_name: 'Stan normalny',
          run_timestamp: '2026-07-22T08:50:00Z', snapshot_id: 'snap-demo', trace_id: 'run-lf-6',
        },
        status: 'OK',
        status_pl: 'zbieżny',
        missing_data: [{ code: 'wezly_bez_pomiaru', bus_refs: ['BUS-3'] }],
        solver_version: 'state_estimation_wls@1.0.0',
        validation_status: 'SYNTETYCZNY (walidacja płaskim stanem, nie SCADA/PMU)',
        estimate_id: 'estymata-hash-demo',
        base_mva: 100.0,
        slack_bus_ref: 'BUS-1',
        slack_index: 0,
        converged: true,
        iterations: 3,
        n_states: 5,
        m_measurements: 6,
        degrees_of_freedom: 1,
        objective_j: 27.8,
        note: null,
        buses: [
          { bus_ref: 'BUS-1', index: 0, name: 'Szyna GPZ', voltage_kv: 110.0, is_slack: true, v_magnitude_pu: 1.029, v_angle_rad: 0.0, v_angle_deg: 0.0 },
          { bus_ref: 'BUS-2', index: 1, name: 'Szyna SN', voltage_kv: 15.0, is_slack: false, v_magnitude_pu: 0.9912, v_angle_rad: -0.0262, v_angle_deg: -1.5 },
          { bus_ref: 'BUS-3', index: 2, name: null, voltage_kv: 15.0, is_slack: false, v_magnitude_pu: 1.0103, v_angle_rad: 0.014, v_angle_deg: 0.8 },
        ],
        measurements: [
          { meas_type: 'V_MAGNITUDE', bus_ref: 'BUS-1', bus_j_ref: null, value: 1.05, sigma: 0.004, label: null, index: 0, normalized_residual: 5.2, residual: 0.021, suspect: true },
          { meas_type: 'V_MAGNITUDE', bus_ref: 'BUS-2', bus_j_ref: null, value: 0.99, sigma: 0.004, label: null, index: 1, normalized_residual: 0.3, residual: -0.0012, suspect: false },
          { meas_type: 'P_INJECTION', bus_ref: 'BUS-2', bus_j_ref: null, value: -0.35, sigma: 0.008, label: null, index: 2, normalized_residual: 0.4, residual: 0.002, suspect: false },
          { meas_type: 'Q_INJECTION', bus_ref: 'BUS-2', bus_j_ref: null, value: -0.12, sigma: 0.008, label: null, index: 3, normalized_residual: 0.2, residual: 0.001, suspect: false },
          { meas_type: 'P_FLOW', bus_ref: 'BUS-1', bus_j_ref: 'BUS-2', value: 0.36, sigma: 0.008, label: null, index: 4, normalized_residual: 0.5, residual: 0.003, suspect: false },
          { meas_type: 'Q_FLOW', bus_ref: 'BUS-1', bus_j_ref: 'BUS-2', value: 0.13, sigma: 0.008, label: null, index: 5, normalized_residual: 0.3, residual: -0.002, suspect: false },
        ],
        bad_data: {
          chi_square_value: 27.8,
          chi_square_threshold: 6.635,
          degrees_of_freedom: 1,
          alpha: 0.01,
          chi_square_flag: true,
          largest_normalized_residual: 5.2,
          lnr_measurement_index: 0,
          lnr_threshold: 3.0,
          lnr_flag: true,
          normalized_residuals: [5.2, 0.3, 0.4, 0.2, 0.5, 0.3],
          lnr_measurement: { index: 0, meas_type: 'V_MAGNITUDE', bus_ref: 'BUS-1', bus_j_ref: null, label: null },
        },
        white_box: [
          { iteration: 0, objective_j: 41.2, max_abs_residual: 0.062, step_norm: 0.031, h_jacobian: [[1, 0]], gain_matrix_g: [[2, 0]], residual_r: [0.062, 0.002], delta_x: [0.028, 0.001], state_x: [1.0, 0.0] },
          { iteration: 1, objective_j: 27.9, max_abs_residual: 0.021, step_norm: 0.0009, h_jacobian: [[1, 0]], gain_matrix_g: [[2, 0]], residual_r: [0.021, 0.002], delta_x: [0.0009, 0.0], state_x: [1.029, -0.026] },
          { iteration: 2, objective_j: 27.8, max_abs_residual: 0.021, step_norm: 0.00001, h_jacobian: [[1, 0]], gain_matrix_g: [[2, 0]], residual_r: [0.021, 0.002], delta_x: [0.0, 0.0], state_x: [1.029, -0.0262] },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (url.includes('/runs/v126/ssci_impedance')) {
    // Scena "ssci" (V-B): utworzenie przebiegu SSCI (koperta V126RunResponse).
    return new Response(
      JSON.stringify({ run_id: 'run-ssci-1', status: 'DONE', deterministic_hash: 'ssci-hash-demo' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (url.includes('/results/v126/ssci_impedance/stability')) {
    // Scena "ssci" (V-B): werdykt stabilnosci SSCI — ksztalt 1:1 z
    // `analysis/ssci_stability/serializer.py::view_to_dict` (kryterium
    // impedancyjne Nyquista; white_box: max|L| i margines fazy).
    return new Response(
      JSON.stringify({
        analysis_id: 'ssci-analysis-demo-01',
        context: {
          project_name: 'Przyłączenie farmy PV 8 MW', case_name: 'Stan normalny',
          run_timestamp: '2026-07-22T09:00:00Z', snapshot_id: 'snap-demo', trace_id: 'run-ssci-1',
        },
        gain_crossover_mag: 1.0,
        pm_risk_deg: 30.0,
        pm_unstable_deg: 0.0,
        verdict: {
          converter_ref: 'INV1',
          bus_ref: 'SZ-PV2',
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
              substitution_pl: '180° − |∠L| w paśmie |L| ≥ 1: 180° − 183,5°',
              result_pl: '-3,50°',
              unit_check_pl: '[°]',
            },
          ],
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (url.includes('/api/catalog/complete-bay-templates')) {
    return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (url.includes('/api/quality/conductor-thermal-withstand/proof')) {
    // Scena "cieplna" (karta F-K1 faza 5): dowod kryterium dla galezi Z NASTAWA.
    // Kroki 1:1 z solverem `conductor_thermal_withstand.py::_build_white_box_trace`
    // i `wytrzymalosc_cieplna_przewodow.py::_krok_czasu`; liczby WYLICZONE tym
    // solverem (nie wpisane recznie): I=15000 A, Is=600 A, TMS=0,2, krzywa SI ->
    // t = 0,421085 s; I_dop = 13800/sqrt(0,421085) = 21266,4 A; 15000/21266,4 =
    // 0,705338; S_min = 15000*sqrt(0,421085)/115 = 84,64 mm2.
    return new Response(
      JSON.stringify({
        run_id: 'run-sc-7',
        branch_id: 'kabel-magistrala-1',
        branch_name: 'Magistrala L-01 (120 mm²)',
        status: 'PASS',
        kroki: [
          {
            step: 1,
            key: 'conductor_thermal_time_source',
            title: 'Czas trwania zwarcia z nastawy zabezpieczenia',
            formula_latex: '$$t_k = \\mathrm{TMS} \\cdot \\frac{A}{(I/I_s)^{B} - 1}$$',
            inputs: {
              i_galezi_a: { value: 15000, unit: 'A', label: 'Prąd zwarciowy gałęzi' },
              i_rozruchowy_a: { value: 600, unit: 'A', label: 'Próg rozruchowy zabezpieczenia' },
              tms: { value: 0.2, unit: '-', label: 'Mnożnik czasowy nastawy' },
            },
            substitution:
              '$$t_k = 0{,}2 \\cdot \\frac{0{,}14}{\\left(\\frac{15000}{600}\\right)^{0{,}02} - 1} = 0{,}421085\\ \\mathrm{s}$$',
            result: { tk_s: { value: 0.421085, unit: 's', label: 'Czas trwania zwarcia' } },
            notes:
              'Czas z charakterystyki IEC_SI zabezpieczenia pola L-01 przy prądzie gałęzi 15000.0 A.',
          },
          {
            step: 2,
            key: 'conductor_thermal_admissible',
            title: 'Prąd dopuszczalny przewodu przy czasie trwania zwarcia',
            formula_latex: '$$I_{dop}(t) = I_{th(1s)} \\cdot \\sqrt{\\frac{1\\,\\mathrm{s}}{t}}$$',
            inputs: {
              ith_1s_a: { value: 13800, unit: 'A', label: 'Wytrzymałość cieplna żyły dla 1 s' },
              tk_s: { value: 0.421085, unit: 's', label: 'Czas trwania zwarcia' },
            },
            substitution: '$$I_{dop} = \\frac{13800}{\\sqrt{0{,}421}} = 21266{,}4\\ \\mathrm{A}$$',
            result: { i_dop_a: { value: 21266.410898, unit: 'A', label: 'Prąd dopuszczalny przy czasie t' } },
            notes:
              'Nagrzewanie zwarciowe przyjmuje się za adiabatyczne, więc obowiązuje równoważna energia cieplna I²·t = const (IEC 60949).',
          },
          {
            step: 3,
            key: 'conductor_thermal_criterion',
            title: 'Sprawdzenie kryterium cieplnego',
            formula_latex: '$$I_{th} \\le I_{dop}(t)$$',
            inputs: {
              ith_a: { value: 15000, unit: 'A', label: 'Prąd zwarciowy ekwiwalentny cieplnie gałęzi' },
              i_dop_a: { value: 21266.410898, unit: 'A', label: 'Prąd dopuszczalny przy czasie t' },
            },
            substitution:
              '$$15000\\ \\mathrm{A} \\le 21266{,}4\\ \\mathrm{A} \\quad\\Rightarrow\\quad 70{,}534\\ \\%$$',
            result: {
              utilization: { value: 0.705338, unit: '-', label: 'Wykorzystanie wytrzymałości cieplnej' },
              margin_a: { value: 6266.410898, unit: 'A', label: 'Zapas do prądu dopuszczalnego' },
            },
            notes: 'Kryterium spełnione — przekrój wytrzyma zwarcie przez ten czas.',
          },
          {
            step: 4,
            key: 'conductor_thermal_min_section',
            title: 'Minimalny przekrój żyły z warunku cieplnego',
            formula_latex: '$$S_{min} = \\frac{I_{th} \\cdot \\sqrt{t}}{J_{th(1s)}}$$',
            inputs: {
              ith_a: { value: 15000, unit: 'A', label: 'Prąd zwarciowy ekwiwalentny cieplnie gałęzi' },
              tk_s: { value: 0.421085, unit: 's', label: 'Czas trwania zwarcia' },
              jth_1s_a_per_mm2: { value: 115, unit: 'A/mm²', label: 'Gęstość prądu cieplnego dla 1 s' },
              cross_section_mm2: { value: 120, unit: 'mm²', label: 'Przekrój zastosowany' },
            },
            substitution:
              '$$S_{min} = \\frac{15000 \\cdot \\sqrt{0{,}421}}{115} = 84{,}641\\ \\mathrm{mm^2} \\quad ; \\quad S = 120\\ \\mathrm{mm^2} \\ge S_{min}$$',
            result: { s_min_mm2: { value: 84.640516, unit: 'mm²', label: 'Minimalny wymagany przekrój' } },
            notes: 'Zapis równoważny kryterium prądowemu — mówi wprost, jaki przekrój usunie naruszenie.',
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (url.includes('/api/quality/conductor-thermal-withstand')) {
    // Scena "cieplna": ocena per galaz — ksztalt 1:1 z
    // `wytrzymalosc_cieplna_przewodow.py::build_wytrzymalosc_cieplna_view`.
    // Galaz 1 ma czas Z NASTAWY (0,421085 s), galaz 2 — z ZALOZENIA przypadku
    // (1,0 s), bo jej aparat nie ma czynnego zabezpieczenia. Liczby wyliczone
    // solverem: L-01 PASS (15000 <= 21266,4; S_min 84,64 mm2 < 120 mm2);
    // L-02 FAIL (9200 > 8050 = 8050/sqrt(1); S_min 80 mm2 > 70 mm2).
    return new Response(
      JSON.stringify({
        run_id: 'run-sc-7',
        case_id: 'case-demo',
        analysis_type: 'short_circuit_sn',
        fault_node_id: 'SZ-ST7',
        tk_s: 1.0,
        czasy_wylaczenia: { z_nastawy: 1, z_zalozenia: 1, razem: 2 },
        aktualnosc: {
          aktualny: true,
          powod_pl: 'Wynik policzony dla biezacej wersji modelu.',
          model_hash: 'h-demo',
          snapshot_hash: 'h-demo',
        },
        normy: [
          {
            norma: 'PN-HD 60364-4-43',
            punkt: '§ 434.5.2',
            tresc_pl:
              'Warunek adiabatyczny doboru przekroju ze wzgledu na zwarcie: S ≥ √(I²·t) / k.',
          },
          {
            norma: 'IEC 60949',
            punkt: '§ 3, § 4',
            tresc_pl:
              'Obliczanie dopuszczalnych pradow zwarciowych kabli; podstawa wartosci k dla par material zyly / izolacja.',
          },
          {
            norma: 'IEC 60909-0',
            punkt: '§ 12',
            tresc_pl: 'Prad ekwiwalentny cieplnie I_th = I″k·√(m+n) — to jego uzywa kryterium.',
          },
        ],
        ocena: {
          items: [
            {
              branch_id: 'kabel-magistrala-1',
              branch_name: 'Magistrala L-01 (120 mm²)',
              status: 'PASS',
              i_fault_a: 15000,
              i_permissible_a: 21266.410898,
              utilization: 0.705338,
              s_min_mm2: 84.640516,
              applied_cross_section_mm2: 120,
              missing_codes: [],
              uzasadnienie_pl: null,
              i2t_a2s: 94744125,
              i2t_dopuszczalne_a2s: 190440000,
              margines_procent: 29.4662,
              kryteria: [
                {
                  kod: 'prad_dopuszczalny',
                  nazwa_pl: 'Prąd zwarciowy wobec dopuszczalnego dla czasu t',
                  warunek_pl: 'I_th ≤ I_dop(t) = I_th(1s)/√t',
                  wartosc: 15000,
                  granica: 21266.410898,
                  jednostka: 'A',
                  status: 'PASS',
                },
                {
                  kod: 'energia_cieplna',
                  nazwa_pl: 'Energia zwarcia wobec wytrzymałości żyły',
                  warunek_pl: 'I²·t ≤ k²·S²',
                  wartosc: 94744125,
                  granica: 190440000,
                  jednostka: 'A²·s',
                  status: 'PASS',
                },
                {
                  kod: 'przekroj_minimalny',
                  nazwa_pl: 'Przekrój zastosowany wobec minimalnego z warunku cieplnego',
                  warunek_pl: 'S ≥ S_min = √(I²·t)/k',
                  wartosc: 120,
                  granica: 84.640516,
                  jednostka: 'mm²',
                  status: 'PASS',
                },
              ],
              powod_decyzji_pl: 'Wykorzystanie wytrzymałości cieplnej 70,5 % (zapas 29,5 %).',
              zalecenia: [],
              wrazliwosc: [
                { parametr: 'czas_wylaczenia', nazwa_pl: 'Czas wyłączenia', mnoznik: 0.5, wartosc: 0.2105, jednostka: 's', wykorzystanie: 0.498749 },
                { parametr: 'czas_wylaczenia', nazwa_pl: 'Czas wyłączenia', mnoznik: 1.0, wartosc: 0.4211, jednostka: 's', wykorzystanie: 0.705338 },
                { parametr: 'czas_wylaczenia', nazwa_pl: 'Czas wyłączenia', mnoznik: 2.0, wartosc: 0.8422, jednostka: 's', wykorzystanie: 0.997496 },
                { parametr: 'prad_zwarciowy', nazwa_pl: 'Prąd zwarciowy', mnoznik: 1.5, wartosc: 22500, jednostka: 'A', wykorzystanie: 1.058007 },
                { parametr: 'przekroj', nazwa_pl: 'Przekrój żyły', mnoznik: 0.5, wartosc: 60, jednostka: 'mm²', wykorzystanie: 1.410677 },
              ],
              uzasadnienie_k: {
                k_a_s05_per_mm2: 115,
                tozsamosc_pl:
                  'k = Jth(1 s) — gęstość prądu zwarciowego dla 1 s z karty katalogowej (prąd na 1 mm² przekroju wytrzymywany przez 1 s).',
                material_zyly: 'CU',
                izolacja: 'XLPE',
                temp_poczatkowa_c: 90,
                temp_koncowa_c: 250,
                zrodlo_pl: 'IEC 60502-2 / IEC 60949',
                braki_pl: [],
                kompletne: true,
              },
              czas_wylaczenia: {
                tk_s: 0.421085,
                zrodlo: 'nastawa_zabezpieczenia',
                powod_pl:
                  'Czas z charakterystyki IEC_SI zabezpieczenia pola L-01 przy prądzie gałęzi 15000.0 A.',
                urzadzenie_ref: 'CB-L01',
                urzadzenie_nazwa: 'Wyłącznik pola L-01',
                funkcja: 'overcurrent_51',
                prad_galezi_a: 15000,
                prad_rozruchowy_a: 600,
                krzywa: 'IEC_SI',
                tms: 0.2,
              },
            },
            {
              branch_id: 'kabel-odgalezienie-2',
              branch_name: 'Odgałęzienie L-02 (70 mm²)',
              status: 'FAIL',
              i_fault_a: 9200,
              i_permissible_a: 8050,
              utilization: 1.142857,
              s_min_mm2: 80,
              applied_cross_section_mm2: 70,
              missing_codes: [],
              uzasadnienie_pl: null,
              i2t_a2s: 84640000,
              i2t_dopuszczalne_a2s: 64802500,
              margines_procent: -14.2857,
              kryteria: [
                {
                  kod: 'prad_dopuszczalny',
                  nazwa_pl: 'Prąd zwarciowy wobec dopuszczalnego dla czasu t',
                  warunek_pl: 'I_th ≤ I_dop(t) = I_th(1s)/√t',
                  wartosc: 9200,
                  granica: 8050,
                  jednostka: 'A',
                  status: 'FAIL',
                },
                {
                  kod: 'energia_cieplna',
                  nazwa_pl: 'Energia zwarcia wobec wytrzymałości żyły',
                  warunek_pl: 'I²·t ≤ k²·S²',
                  wartosc: 84640000,
                  granica: 64802500,
                  jednostka: 'A²·s',
                  status: 'FAIL',
                },
                {
                  kod: 'przekroj_minimalny',
                  nazwa_pl: 'Przekrój zastosowany wobec minimalnego z warunku cieplnego',
                  warunek_pl: 'S ≥ S_min = √(I²·t)/k',
                  wartosc: 70,
                  granica: 80,
                  jednostka: 'mm²',
                  status: 'FAIL',
                },
              ],
              powod_decyzji_pl:
                'Przekrój 70 mm² jest mniejszy od wymaganego 80,0 mm² z warunku cieplnego.',
              zalecenia: [
                {
                  kod: 'zwieksz_przekroj',
                  dzialanie_pl: 'Zwiększ przekrój żyły',
                  wzor: 'S ≥ I·√t / k',
                  wartosc_docelowa: 80,
                  jednostka: 'mm²',
                  wartosc_obecna: 70,
                  skutek_pl:
                    'Przekrój 80,0 mm² sprowadza wykorzystanie wytrzymałości do 100 %; typoszereg powyżej daje zapas.',
                },
                {
                  kod: 'skroc_czas',
                  dzialanie_pl: 'Skróć czas wyłączenia zwarcia (nastawa zabezpieczenia)',
                  wzor: 't ≤ (k·S / I)²',
                  wartosc_docelowa: 0.7656,
                  jednostka: 's',
                  wartosc_obecna: 1.0,
                  skutek_pl:
                    'Czas 0,766 s zamiast 1,000 s wystarczy, żeby obecny przekrój spełnił kryterium bez wymiany kabla.',
                },
                {
                  kod: 'ogranicz_prad',
                  dzialanie_pl: 'Ogranicz prąd zwarciowy w tym miejscu sieci',
                  wzor: 'I ≤ k·S / √t',
                  wartosc_docelowa: 8050,
                  jednostka: 'A',
                  wartosc_obecna: 9200,
                  skutek_pl:
                    'Prąd do 8050 A (np. dławik zwarciowy, podział sieci, inny punkt pracy) mieści się w wytrzymałości obecnego przekroju.',
                },
              ],
              wrazliwosc: [
                { parametr: 'czas_wylaczenia', nazwa_pl: 'Czas wyłączenia', mnoznik: 0.5, wartosc: 0.5, jednostka: 's', wykorzystanie: 0.808122 },
                { parametr: 'czas_wylaczenia', nazwa_pl: 'Czas wyłączenia', mnoznik: 1.0, wartosc: 1.0, jednostka: 's', wykorzystanie: 1.142857 },
                { parametr: 'prad_zwarciowy', nazwa_pl: 'Prąd zwarciowy', mnoznik: 0.75, wartosc: 6900, jednostka: 'A', wykorzystanie: 0.857143 },
                { parametr: 'przekroj', nazwa_pl: 'Przekrój żyły', mnoznik: 1.5, wartosc: 105, jednostka: 'mm²', wykorzystanie: 0.761905 },
              ],
              uzasadnienie_k: {
                k_a_s05_per_mm2: 115,
                tozsamosc_pl:
                  'k = Jth(1 s) — gęstość prądu zwarciowego dla 1 s z karty katalogowej (prąd na 1 mm² przekroju wytrzymywany przez 1 s).',
                material_zyly: 'AL',
                izolacja: 'XLPE',
                temp_poczatkowa_c: 90,
                temp_koncowa_c: 250,
                zrodlo_pl: 'IEC 60502-2 / IEC 60949',
                braki_pl: [],
                kompletne: true,
              },
              czas_wylaczenia: {
                tk_s: 1.0,
                zrodlo: 'zalozenie_przypadku',
                powod_pl:
                  'Aparat Rozłącznik odgałęzienia nie ma przypisanego czynnego zabezpieczenia, więc czas zadziałania jest niewyznaczalny. Przyjęto założony czas przypadku obliczeniowego 1 s.',
                urzadzenie_ref: null,
                urzadzenie_nazwa: null,
                funkcja: null,
                prad_galezi_a: 9200,
                prad_rozruchowy_a: null,
                krzywa: null,
                tms: null,
              },
            },
          ],
          summary: { pass_count: 1, fail_count: 1, unavailable_count: 0 },
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (url.includes('/api/quality/arc-flash')) {
    // Scena "arcflash" (wzbogacona w rundzie dowodowej V-B): kroki WHITE BOX
    // 1:1 z builderem `analysis/arc_flash/builder.py::_ieee_1584_result`
    // (KrokArcFlash: symbol/formula_latex/substitution_pl/result_pl/
    // unit_check_pl/table_ref). Liczby spojne z wynikami wierszy:
    //   SN-1: I_bf=12.5 kA -> I_arc=11.8 kA; E=35.2 J/cm² = 8.413 cal/cm²
    //         (35.2/4.184); AFB=1320 mm; SOI kat. 3 (8 < E ≤ 25 cal/cm²).
    //   SN-2: I_bf=8.1 kA -> I_arc=7.7 kA; E=17.4 J/cm² = 4.1587 cal/cm²;
    //         AFB=890 mm; SOI kat. 2 (4 < E ≤ 8 cal/cm²).
    return new Response(
      JSON.stringify({
        analysis_id: 'af-demo',
        context: null,
        status: 'COMPUTED_IEEE_1584_OPEN_SOURCE',
        status_label_pl: 'obliczony (IEEE 1584 open-source)',
        results: [
          {
            bus_ref: 'Szyna SN-1', status: 'COMPUTED_IEEE_1584_OPEN_SOURCE', status_label_pl: 'obliczony (IEEE 1584 open-source)',
            method: 'IEEE_1584_2018', electrode_config: 'VCB', i_bf_ka: 12.5, voltage_kv: 15.0, arc_time_s: 0.2,
            conductor_gap_mm: 152, working_distance_mm: 455, i_arc_ka: 11.8, incident_energy_cal_cm2: 8.413,
            incident_energy_joule_cm2: 35.2, arc_flash_boundary_mm: 1320, ppe_category: '3', ppe_table_provenance: 'norma_NFPA_70E',
            provenance: 'ARC_FLASH_OPEN_SOURCE_PROVENANCE', provenance_caveat_pl: 'Wynik na współczynnikach open-source — wymaga weryfikacji z licencjonowaną normą IEEE 1584.',
            why_pl: 'Arc Flash (konfiguracja VCB, IEEE 1584-2018): prąd łuku I_arc ≈ 11.8 kA (I_arc_min ≈ 10.34 kA), energia incydentu E ≈ 8.41 cal/cm² na odległości roboczej, granica łuku AFB ≈ 1320.0 mm, kategoria ŚOI = 3.',
            missing_data: [],
            white_box: [
              {
                symbol: 'I_arc',
                formula_latex: "I_{arc,kotwa} = 10^{k_1+k_2\\lg I_{bf}+k_3\\lg G}\\cdot\\sum_{i} k_{i}\\,I_{bf}^{\\,p_i}\\;;\\quad I_{arc}=\\mathrm{interp}_{U}(\\cdot)\\;;\\quad I_{arc,min}=I_{arc}(1-0{,}5\\,\\mathrm{VarCf})",
                substitution_pl: 'I_bf=12.5 kA, G=152.0 mm, U=15.0 kV [VCB]; kotwy: V14300=11.75 kA, V2700=10.9 kA, V600=8.7 kA; VarCf=0.247',
                result_pl: 'I_arc = 11.8 kA, I_arc_min = 10.3427 kA (IEEE 1584-2018, współczynniki open-source)',
                unit_check_pl: 'I_bf,I_arc w kA; G w mm; VarCf bezwymiarowe; interpolacja po U [kV].',
                table_ref: 'I_arc[VCB, kotwy 600/2700/14300 V] (Tab.1) + VarCf[VCB] (Tab.2) = open_source_IEEE_1584',
              },
              {
                symbol: 'CF',
                formula_latex: 'CF = b_1\\,EES^2 + b_2\\,EES + b_3 \\quad(CF=1 \\text{ w otwartym powietrzu; } CF=1/x \\text{ obudowa płytka})',
                substitution_pl: 'konfiguracja VCB (w obudowie Typical)',
                result_pl: 'CF = 1.0841',
                unit_check_pl: 'CF bezwymiarowe; EES w calach; mnożnik energii dla obudowy.',
                table_ref: 'CF[Typical,VCB] (Tab.7) = open_source_IEEE_1584',
              },
              {
                symbol: 'E',
                formula_latex: "E_{kotwa} = \\tfrac{12{,}552}{50}\\,t\\cdot 10^{\\,x_2+x_3+x_4+x_5}\\;;\\quad x_4 = k_{11}\\lg I_{bf}+k_{13}\\lg I_{arc}+\\lg(1/CF)\\;;\\quad x_5 = k_{12}\\lg D\\;;\\quad E=\\mathrm{interp}_U(\\cdot)\\;[\\mathrm{J/cm^2}]",
                substitution_pl: 'I_bf=12.5 kA, G=152.0 mm, t=200.0 ms, D=455.0 mm, CF=1.0841; kotwy: V14300=35.05 J/cm², V2700=32.6 J/cm², V600=27.6 J/cm²',
                result_pl: 'E = 35.2 J/cm² = 8.413 cal/cm² (IEEE 1584-2018, współczynniki open-source)',
                unit_check_pl: 'E w J/cm² (t w ms, D w mm); 1/4,184 J/cm²→cal/cm²; interpolacja po U.',
                table_ref: 'E[VCB, kotwy 600/2700/14300 V] (Tab.3/4/5) = open_source_IEEE_1584',
              },
              {
                symbol: 'AFB',
                formula_latex: "D_{AFB,kotwa} = \\left(\\frac{5{,}0208}{E/D^{k_{12}}}\\right)^{1/k_{12}}\\quad(\\mathrm{interp}_U);\\quad 5{,}0208\\,\\mathrm{J/cm^2}=1{,}2\\,\\mathrm{cal/cm^2}",
                substitution_pl: 'E_próg = 1.2 cal/cm² = 5.0208 J/cm²; U=15.0 kV, D=455.0 mm',
                result_pl: 'AFB = 1320.0 mm (IEEE 1584-2018, współczynniki open-source)',
                unit_check_pl: 'D_AFB w mm; odległość, na której E spada do 1,2 cal/cm².',
                table_ref: 'E[VCB] (odwrócone wzgl. D) (Tab.3/4/5) = open_source_IEEE_1584; próg 1,2 cal/cm² publiczny',
              },
              {
                symbol: 'ŚOI',
                formula_latex: '\\text{kategoria} = f_{NFPA\\,70E}(E)',
                substitution_pl: 'E = 8.413 cal/cm²; tablica progów NFPA 70E: wypełniona',
                result_pl: 'kategoria ŚOI = 3',
                unit_check_pl: 'E w cal/cm² → kategoria (klasyfikacja jakościowa NFPA 70E).',
                table_ref: 'progi ŚOI = norma_NFPA_70E',
              },
            ],
          },
          {
            bus_ref: 'Szyna SN-2', status: 'COMPUTED_IEEE_1584_OPEN_SOURCE', status_label_pl: 'obliczony (IEEE 1584 open-source)',
            method: 'IEEE_1584_2018', electrode_config: 'VCB', i_bf_ka: 8.1, voltage_kv: 15.0, arc_time_s: 0.2,
            conductor_gap_mm: 152, working_distance_mm: 455, i_arc_ka: 7.7, incident_energy_cal_cm2: 4.1587,
            incident_energy_joule_cm2: 17.4, arc_flash_boundary_mm: 890, ppe_category: '2', ppe_table_provenance: 'norma_NFPA_70E',
            provenance: 'ARC_FLASH_OPEN_SOURCE_PROVENANCE', provenance_caveat_pl: null,
            why_pl: 'Arc Flash (konfiguracja VCB, IEEE 1584-2018): prąd łuku I_arc ≈ 7.7 kA (I_arc_min ≈ 6.75 kA), energia incydentu E ≈ 4.16 cal/cm² na odległości roboczej, granica łuku AFB ≈ 890.0 mm, kategoria ŚOI = 2.',
            missing_data: [],
            white_box: [
              {
                symbol: 'I_arc',
                formula_latex: "I_{arc,kotwa} = 10^{k_1+k_2\\lg I_{bf}+k_3\\lg G}\\cdot\\sum_{i} k_{i}\\,I_{bf}^{\\,p_i}\\;;\\quad I_{arc}=\\mathrm{interp}_{U}(\\cdot)\\;;\\quad I_{arc,min}=I_{arc}(1-0{,}5\\,\\mathrm{VarCf})",
                substitution_pl: 'I_bf=8.1 kA, G=152.0 mm, U=15.0 kV [VCB]; kotwy: V14300=7.66 kA, V2700=7.05 kA, V600=5.9 kA; VarCf=0.247',
                result_pl: 'I_arc = 7.7 kA, I_arc_min = 6.7491 kA (IEEE 1584-2018, współczynniki open-source)',
                unit_check_pl: 'I_bf,I_arc w kA; G w mm; VarCf bezwymiarowe; interpolacja po U [kV].',
                table_ref: 'I_arc[VCB, kotwy 600/2700/14300 V] (Tab.1) + VarCf[VCB] (Tab.2) = open_source_IEEE_1584',
              },
              {
                symbol: 'CF',
                formula_latex: 'CF = b_1\\,EES^2 + b_2\\,EES + b_3 \\quad(CF=1 \\text{ w otwartym powietrzu; } CF=1/x \\text{ obudowa płytka})',
                substitution_pl: 'konfiguracja VCB (w obudowie Typical)',
                result_pl: 'CF = 1.0841',
                unit_check_pl: 'CF bezwymiarowe; EES w calach; mnożnik energii dla obudowy.',
                table_ref: 'CF[Typical,VCB] (Tab.7) = open_source_IEEE_1584',
              },
              {
                symbol: 'E',
                formula_latex: "E_{kotwa} = \\tfrac{12{,}552}{50}\\,t\\cdot 10^{\\,x_2+x_3+x_4+x_5}\\;;\\quad x_4 = k_{11}\\lg I_{bf}+k_{13}\\lg I_{arc}+\\lg(1/CF)\\;;\\quad x_5 = k_{12}\\lg D\\;;\\quad E=\\mathrm{interp}_U(\\cdot)\\;[\\mathrm{J/cm^2}]",
                substitution_pl: 'I_bf=8.1 kA, G=152.0 mm, t=200.0 ms, D=455.0 mm, CF=1.0841; kotwy: V14300=17.32 J/cm², V2700=16.1 J/cm², V600=13.8 J/cm²',
                result_pl: 'E = 17.4 J/cm² = 4.1587 cal/cm² (IEEE 1584-2018, współczynniki open-source)',
                unit_check_pl: 'E w J/cm² (t w ms, D w mm); 1/4,184 J/cm²→cal/cm²; interpolacja po U.',
                table_ref: 'E[VCB, kotwy 600/2700/14300 V] (Tab.3/4/5) = open_source_IEEE_1584',
              },
              {
                symbol: 'AFB',
                formula_latex: "D_{AFB,kotwa} = \\left(\\frac{5{,}0208}{E/D^{k_{12}}}\\right)^{1/k_{12}}\\quad(\\mathrm{interp}_U);\\quad 5{,}0208\\,\\mathrm{J/cm^2}=1{,}2\\,\\mathrm{cal/cm^2}",
                substitution_pl: 'E_próg = 1.2 cal/cm² = 5.0208 J/cm²; U=15.0 kV, D=455.0 mm',
                result_pl: 'AFB = 890.0 mm (IEEE 1584-2018, współczynniki open-source)',
                unit_check_pl: 'D_AFB w mm; odległość, na której E spada do 1,2 cal/cm².',
                table_ref: 'E[VCB] (odwrócone wzgl. D) (Tab.3/4/5) = open_source_IEEE_1584; próg 1,2 cal/cm² publiczny',
              },
              {
                symbol: 'ŚOI',
                formula_latex: '\\text{kategoria} = f_{NFPA\\,70E}(E)',
                substitution_pl: 'E = 4.1587 cal/cm²; tablica progów NFPA 70E: wypełniona',
                result_pl: 'kategoria ŚOI = 2',
                unit_check_pl: 'E w cal/cm² → kategoria (klasyfikacja jakościowa NFPA 70E).',
                table_ref: 'progi ŚOI = norma_NFPA_70E',
              },
            ],
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (url.includes('/api/ncrfg-tests/catalog')) {
    // Sceny "frt"/"macierz": katalog wymogow NC RfG — ksztalt 1:1 z
    // `api/ncrfg_ptpiree_tests.py::get_ncrfg_test_catalog` (operators z progami
    // klas `NcRfgModuleType` + testy z `TEST_CATALOG` silnika ncrfg_ptpiree).
    const modulTypy = [
      { id: 'A', threshold_kw_min: 0.8, threshold_kw_max: 200, voltage_kv_max: 110, description_pl: 'Modul typu A (0,8 kW - 200 kW)' },
      { id: 'B', threshold_kw_min: 200, threshold_kw_max: 10000, voltage_kv_max: 110, description_pl: 'Modul typu B (200 kW - 10 MW)' },
      { id: 'C', threshold_kw_min: 10000, threshold_kw_max: 75000, voltage_kv_max: 110, description_pl: 'Modul typu C (10 MW - 75 MW)' },
      { id: 'D', threshold_kw_min: 75000, threshold_kw_max: null, voltage_kv_max: null, description_pl: 'Modul typu D (>= 75 MW lub >= 110 kV)' },
    ];
    return new Response(
      JSON.stringify({
        procedure_version: 'PTPiREE Procedura testowania v3.0',
        source_ref: 'https://ptpiree.pl/kodeksy-sieci/procedura-testowania/',
        operators: [
          { operator_id: 'enea', operator_name_pl: 'Enea Operator', last_revision: '2024-01', module_types: modulTypy },
          { operator_id: 'pse', operator_name_pl: 'PSE — Polskie Sieci Elektroenergetyczne', last_revision: '2024-03', module_types: modulTypy },
        ],
        tests: [
          { test_id: 'T05', ability_pl: 'Możliwość regulacji mocy czynnej', procedure_basis_pl: 'Program ramowy testów PPM oraz sprawdzenia dodatkowe dla regulacji P.', default_for_modules: ['B', 'C', 'D'], conditional_pl: null },
          { test_id: 'T09', ability_pl: 'Zdolność do generacji mocy biernej', procedure_basis_pl: 'Zakres testów zgodności PPM typu B, C i D.', default_for_modules: ['B', 'C', 'D'], conditional_pl: null },
          { test_id: 'T10', ability_pl: 'Potwierdzenie mocy maksymalnej PMAX', procedure_basis_pl: 'Sprawdzenia dodatkowe procedury PTPiREE dla typu B, C i D.', default_for_modules: ['B', 'C', 'D'], conditional_pl: null },
          { test_id: 'T14', ability_pl: 'LVRT - pozostanie w pracy przy zapadzie napięcia', procedure_basis_pl: 'Test FRT dla modułów B/C/D oraz profili operatora.', default_for_modules: ['B', 'C', 'D'], conditional_pl: null },
          { test_id: 'T16', ability_pl: 'Odbudowa mocy czynnej po zakłóceniu', procedure_basis_pl: 'Wymaganie profilu operatora dla modułów B/C/D.', default_for_modules: ['B', 'C', 'D'], conditional_pl: null },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (url.includes('/api/ncrfg-tests/run')) {
    // Scena "macierz": wynik biegu zgodnosci — ksztalt 1:1 z
    // `NcRfgPtpireeSolver.run` (engine.py): moduly (kolejnosc = selectAllDers,
    // sort po id: bess-1, pv-1), werdykty z `_ok_fail`/`_missing`, slad
    // `TraceBuilder.add` (Wzor -> Dane -> Podstawienie -> Wynik -> jednostki).
    // Liczby spojne miedzy krokami: T16 BESS 1.800 s > 1.000 s -> fail.
    // Podsumowania testow 1:1 z formatami silnika: `_active_power_control`,
    // `_reactive_voltage_test`, `_pmax_pmin_test`, `_p_recovery_test` — liczby
    // wyliczone z mocy modulu (Pn 500/800 kW, ramp 10 %/min, zakres Q ±33% Pn).
    const testyBazowe = (pMaxKw: number) => [
      { test_id: 'T05', ability_pl: 'Możliwość regulacji mocy czynnej', required: true, required_reason_pl: 'Wymagany dla modułu typu B.', verdict: 'pass', summary_pl: 'Regulacja P do 50% PMAX: czas ustalenia 5.0 min.', metrics: { settling_time_min: 5.0 }, trace_refs: [], fix_actions: [] },
      { test_id: 'T09', ability_pl: 'Zdolność do generacji mocy biernej', required: true, required_reason_pl: 'Wymagany dla modułu typu B.', verdict: 'pass', summary_pl: `Zakres Q: ${(-0.33 * pMaxKw).toFixed(1)} do ${(0.33 * pMaxKw).toFixed(1)} kvar.`, metrics: { q_min_kvar: -0.33 * pMaxKw, q_max_kvar: 0.33 * pMaxKw }, trace_refs: [], fix_actions: [] },
      { test_id: 'T10', ability_pl: 'Potwierdzenie mocy maksymalnej PMAX', required: true, required_reason_pl: 'Wymagany dla modułu typu B.', verdict: 'pass', summary_pl: `PMAX potwierdzone z danych katalogowych/deklaracji: ${pMaxKw.toFixed(1)} kW.`, metrics: { pmax_kw: pMaxKw }, trace_refs: [], fix_actions: [] },
    ];
    return new Response(
      JSON.stringify({
        contract: 'NcRfgPtpireeTestResultV1',
        procedure_version: 'PTPiREE Procedura testowania v3.0',
        solver_version: 'ncrfg-ptpiree-1.0.0',
        input_hash: 'ncrfg-in-4f2a9c1d',
        deterministic_hash: 'ncrfg-det-7b3e5a90',
        modules: [
          {
            der_ref: 'bess-1', der_name: 'Magazyn energii 0,8 MW', operator_id: 'enea',
            operator_name_pl: 'Enea Operator', module_type: 'B', module_family: 'PPM',
            p_max_kw: 800, voltage_kv: 0.4,
            required_count: 5, pass_count: 3, fail_count: 1, no_data_count: 1,
            not_required_count: 0, overall_status: 'niezgodny',
            tests: [
              ...testyBazowe(800),
              {
                test_id: 'T14', ability_pl: 'LVRT - pozostanie w pracy przy zapadzie napięcia',
                required: true, required_reason_pl: 'Wymagany dla modułu typu B.', verdict: 'no_data',
                summary_pl: 'Brak krzywej FRT/HVRT, profilu operatora albo modelu dynamicznego.',
                metrics: {}, trace_refs: [],
                fix_actions: ['Brak krzywej FRT/HVRT, profilu operatora albo modelu dynamicznego.'],
              },
              {
                test_id: 'T16', ability_pl: 'Odbudowa mocy czynnej po zakłóceniu', required: true,
                required_reason_pl: 'Wymagany dla modułu typu B.', verdict: 'fail',
                summary_pl: 'Odbudowa P po zakłóceniu: 1.800s.',
                metrics: { p_recovery_time_s: 1.8 },
                trace_refs: ['proof:ncrfg-ptpiree:T16:active_power_recovery:2'],
                fix_actions: ['Uzupełnij nastawy odbudowy P po FRT lub model dynamiczny.'],
              },
            ],
          },
          {
            der_ref: 'pv-1', der_name: 'Instalacja PV 0,5 MW', operator_id: 'enea',
            operator_name_pl: 'Enea Operator', module_type: 'B', module_family: 'PPM',
            p_max_kw: 500, voltage_kv: 0.4,
            required_count: 5, pass_count: 5, fail_count: 0, no_data_count: 0,
            not_required_count: 0, overall_status: 'zgodny',
            tests: [
              ...testyBazowe(500),
              { test_id: 'T14', ability_pl: 'LVRT - pozostanie w pracy przy zapadzie napięcia', required: true, required_reason_pl: 'Wymagany dla modułu typu B.', verdict: 'pass', summary_pl: 'LVRT: margines 0.0 p.u. w punkcie 0.15s.', metrics: { margin_pu: 0.0, critical_time_s: 0.15 }, trace_refs: [], fix_actions: [] },
              {
                test_id: 'T16', ability_pl: 'Odbudowa mocy czynnej po zakłóceniu', required: true,
                required_reason_pl: 'Wymagany dla modułu typu B.', verdict: 'pass',
                summary_pl: 'Odbudowa P po zakłóceniu: 0.310s.',
                metrics: { p_recovery_time_s: 0.31 },
                trace_refs: ['proof:ncrfg-ptpiree:T16:active_power_recovery:1'], fix_actions: [],
              },
            ],
          },
        ],
        test_catalog: [
          { test_id: 'T05', ability_pl: 'Możliwość regulacji mocy czynnej', procedure_basis_pl: 'Program ramowy testów PPM oraz sprawdzenia dodatkowe dla regulacji P.', default_for_modules: ['B', 'C', 'D'], conditional_pl: null },
          { test_id: 'T09', ability_pl: 'Zdolność do generacji mocy biernej', procedure_basis_pl: 'Zakres testów zgodności PPM typu B, C i D.', default_for_modules: ['B', 'C', 'D'], conditional_pl: null },
          { test_id: 'T10', ability_pl: 'Potwierdzenie mocy maksymalnej PMAX', procedure_basis_pl: 'Sprawdzenia dodatkowe procedury PTPiREE dla typu B, C i D.', default_for_modules: ['B', 'C', 'D'], conditional_pl: null },
          { test_id: 'T14', ability_pl: 'LVRT - pozostanie w pracy przy zapadzie napięcia', procedure_basis_pl: 'Test FRT dla modułów B/C/D oraz profili operatora.', default_for_modules: ['B', 'C', 'D'], conditional_pl: null },
          { test_id: 'T16', ability_pl: 'Odbudowa mocy czynnej po zakłóceniu', procedure_basis_pl: 'Wymaganie profilu operatora dla modułów B/C/D.', default_for_modules: ['B', 'C', 'D'], conditional_pl: null },
        ],
        // Slad WHITE BOX 1:1 z `TraceBuilder.add` (`_p_recovery_test`):
        // formula ASCII, dane, podstawienie, wynik, weryfikacja jednostek.
        white_box_trace: [
          {
            step: 1, test_id: 'T16', key: 'active_power_recovery',
            formula: 't_recovery,module <= t_recovery,profile',
            data: { module_s: 0.31, profile_s: 1.0 },
            substitution: '0.310 <= 1.000',
            result: { ok: true, margin_s: 0.69 },
            unit_check: 's - s = s.',
            proof_ref: 'proof:ncrfg-ptpiree:T16:active_power_recovery:1',
          },
          {
            step: 2, test_id: 'T16', key: 'active_power_recovery',
            formula: 't_recovery,module <= t_recovery,profile',
            data: { module_s: 1.8, profile_s: 1.0 },
            substitution: '1.800 <= 1.000',
            result: { ok: false, margin_s: -0.8 },
            unit_check: 's - s = s.',
            proof_ref: 'proof:ncrfg-ptpiree:T16:active_power_recovery:2',
          },
        ],
        report_pl: 'Raport zgodności NC RfG (PTPiREE Procedura testowania v3.0): 1 moduł zgodny, 1 moduł niezgodny.',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (url.includes('/api/oze-analysis/lom-protection')) {
    // Scena "lom": ocena ochrony od pracy wyspowej — ksztalt 1:1 z
    // `application/analyses/ochrona_lom.py::build_ochrona_lom_view`; wywody
    // per porownanie 1:1 z `_wywod_okna` (kroki {tekst, latex}, zasada KaTeX).
    const zrodloRocof =
      'Rozporządzenie Komisji (UE) 2016/631 (NC RfG), Art. 13 ust. 1 lit. b '
      + '(zdolność pracy przy zmianach częstotliwości — ROCOF withstand); wartość krajowa PTPiREE 2 Hz/s';
    const zrodloFreq =
      'Rozporządzenie Komisji (UE) 2016/631 (NC RfG), Art. 13 ust. 1 lit. a '
      + '(pasmo częstotliwości pracy Europy kontynentalnej 47,5–51,5 Hz)';
    const zrodloSpz = 'SpzState.fast_time_s / slow_time_s jednostek nadrzędnych (BayProtectionControlUnit)';
    const komunikat81R =
      'Nastawa df/dt (1.0 Hz/s) poniżej dolnego okna (2.0 Hz/s) — ryzyko zbędnych '
      + 'wyłączeń (fałszywe wykrycie wyspy).';
    const komunikat81U = 'Próg 81U (47.5 Hz) w oknie normatywnym (≤ 47.5 Hz).';
    const komunikatSpz =
      'Brak danych o przerwie SPZ jednostek nadrzędnych (SpzState nieosiągalny w ENM) '
      + '— porównanie niemożliwe.';
    return new Response(
      JSON.stringify({
        analysis: 'ochrona_lom',
        context: { enm_name: 'Przyłączenie farmy PV 8 MW', enm_hash: 'enm-3c1d9f7b52a80e46' },
        input_hash: 'lom-9a4b7c2e6d1f0835',
        zalozenia_pl: [
          'Ocena LoM to interpretacja normatywna (porównania), nie symulacja fizyki wyspy.',
          'Moduł wytwórczy = generator w ENM; pole przyłączeniowe = pole (bay) na szynie '
          + 'modułu lub o roli OZE z przypisaniem zabezpieczeń.',
          'Okna normatywne pochodzą wyłącznie z cytowanych źródeł (NC RfG / PTPiREE); '
          + 'brak źródła → okno None + INFO, bez zmyślonych liczb.',
          'Czasy przerwy SPZ pochodzą z SpzState jednostek nadrzędnych; gdy nieosiągalne '
          + 'w ENM — uczciwy INFO.',
        ],
        normative_sources: {
          rocof_81R: { window_pl: 'df/dt ≥ 2.0 Hz/s', source_pl: zrodloRocof },
          vector_shift_78: { window_pl: null, source_pl: null },
          underfrequency_81U: { window_pl: 'próg f ≤ 47.5 Hz', source_pl: zrodloFreq },
          overfrequency_81O: { window_pl: 'próg f ≥ 51.5 Hz', source_pl: zrodloFreq },
        },
        fields: [
          {
            bay_ref: 'bay-pv-a', bay_name: 'Pole PV A', substation_ref: 'gpz-1',
            bus_ref: 'bus-oze-1', generating_module_refs: ['gen-pv-1'], status: 'ERROR',
            checks: [
              {
                kind: 'obecnosc', function_ansi: null, function_label_pl: null, severity: 'ERROR',
                message_pl:
                  'Pole modułu wytwórczego bez jakiejkolwiek funkcji ochrony od pracy '
                  + 'wyspowej (LoM: 81R / 78 / 81U / 81O).',
                value: null, unit: null, window: null, source_pl: null, wywod: [],
              },
            ],
          },
          {
            bay_ref: 'bay-bess-b', bay_name: 'Pole BESS B', substation_ref: 'gpz-1',
            bus_ref: 'bus-oze-2', generating_module_refs: ['gen-bess-1'], status: 'WARN',
            checks: [
              {
                kind: 'okno_normatywne', function_ansi: '81R',
                function_label_pl: 'Szybkość zmian częstotliwości (df/dt)', severity: 'WARN',
                message_pl: komunikat81R,
                value: 1.0, unit: 'Hz/s', window: 'df/dt ≥ 2.0 Hz/s', source_pl: zrodloRocof,
                // Wywod 1:1 z `_wywod_okna('rocof_81R', 1.0, WARN)`.
                wywod: [
                  {
                    tekst: 'Wzor: warunek okna normatywnego funkcji 81R (nastawa nie nizsza niz krawedz okna)',
                    latex: '\\left(\\tfrac{df}{dt}\\right)_{nast} \\ge 2.0\\ \\tfrac{\\text{Hz}}{\\text{s}}',
                  },
                  {
                    tekst: 'Dane: nastawa = 1.0000 (przekaznik pola), krawedz okna = 2.0 — dolna krawedz okna (NC RfG Art. 13(1)(b), PTPiREE 2 Hz/s).',
                    latex: null,
                  },
                  {
                    tekst: 'Podstawienie: 1.0000 >= 2.0 NIESPELNIONE',
                    latex: '1.0000 < 2.0\\ \\tfrac{\\text{Hz}}{\\text{s}}',
                  },
                  { tekst: `Werdykt: WARN — ${komunikat81R}`, latex: null },
                ],
              },
              {
                kind: 'koordynacja_spz', function_ansi: null,
                function_label_pl: 'Koordynacja czasowa z SPZ', severity: 'INFO',
                message_pl: komunikatSpz,
                value: 0.3, unit: 's',
                window: { spz_fast_time_s: null, spz_slow_time_s: null }, source_pl: zrodloSpz,
                wywod: [],
              },
            ],
          },
          {
            bay_ref: 'bay-fw-c', bay_name: 'Pole FW C', substation_ref: 'gpz-2',
            bus_ref: 'bus-oze-3', generating_module_refs: ['gen-fw-1', 'gen-fw-2'], status: 'INFO',
            checks: [
              {
                kind: 'okno_normatywne', function_ansi: '81U',
                function_label_pl: 'Podczęstotliwościowa (f<)', severity: 'OK',
                message_pl: komunikat81U,
                value: 47.5, unit: 'Hz', window: 'próg f ≤ 47.5 Hz', source_pl: zrodloFreq,
                // Wywod 1:1 z `_wywod_okna('underfrequency_81U', 47.5, OK)`.
                wywod: [
                  {
                    tekst: 'Wzor: warunek okna normatywnego funkcji 81U (nastawa nie wyzsza niz krawedz okna)',
                    latex: 'f_{81U} \\le 47.5\\ \\text{Hz}',
                  },
                  {
                    tekst: 'Dane: nastawa = 47.5000 (przekaznik pola), krawedz okna = 47.5 — gorna krawedz okna (NC RfG Art. 13(1)(a), pasmo 47,5-51,5 Hz).',
                    latex: null,
                  },
                  {
                    tekst: 'Podstawienie: 47.5000 <= 47.5 SPELNIONE',
                    latex: '47.5000 \\le 47.5\\ \\text{Hz}',
                  },
                  { tekst: `Werdykt: OK — ${komunikat81U}`, latex: null },
                ],
              },
              {
                kind: 'koordynacja_spz', function_ansi: null,
                function_label_pl: 'Koordynacja czasowa z SPZ', severity: 'INFO',
                message_pl: komunikatSpz,
                value: null, unit: 's',
                window: { spz_fast_time_s: null, spz_slow_time_s: null }, source_pl: zrodloSpz,
                wywod: [],
              },
            ],
          },
        ],
        modules_without_field: ['gen-pv-4'],
        summary: {
          fields_total: 3,
          generating_modules_total: 5,
          by_status: { OK: 0, INFO: 1, WARN: 1, ERROR: 1 },
          overall_status: 'ERROR',
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (url.includes('/api/oze-analysis/frt-trajectories')) {
    // Scena "frt" (T-C): trajektorie LVRT z wywodem marginesu — ksztalt 1:1 z
    // `application/analyses/frt_trajektorie.py::build_frt_trajectories_view`
    // (wywod z `_wywod_scenariusza`: wzor -> dane -> podstawienie -> werdykt).
    const trajektoria = [
      { czas_s: 0.0, napiecie_pu: 1.0, iq_bierny_pu: 0.0, p_czynna_pu: 1.0 },
      { czas_s: 0.3, napiecie_pu: 1.0, iq_bierny_pu: 0.0, p_czynna_pu: 1.0 },
      { czas_s: 0.5, napiecie_pu: 0.05, iq_bierny_pu: 0.153, p_czynna_pu: 0.95 },
      { czas_s: 0.6, napiecie_pu: 0.05, iq_bierny_pu: 0.982, p_czynna_pu: 0.104 },
      { czas_s: 0.65, napiecie_pu: 0.05, iq_bierny_pu: 1.0, p_czynna_pu: 0.05 },
      { czas_s: 0.7, napiecie_pu: 0.525, iq_bierny_pu: 0.612, p_czynna_pu: 0.352 },
      { czas_s: 0.75, napiecie_pu: 1.0, iq_bierny_pu: 0.048, p_czynna_pu: 0.601 },
      { czas_s: 1.0, napiecie_pu: 1.0, iq_bierny_pu: 0.0, p_czynna_pu: 0.907 },
      { czas_s: 1.5, napiecie_pu: 1.0, iq_bierny_pu: 0.0, p_czynna_pu: 0.982 },
      { czas_s: 2.0, napiecie_pu: 1.0, iq_bierny_pu: 0.0, p_czynna_pu: 1.0 },
    ];
    return new Response(
      JSON.stringify({
        modul_der: { id: 'conv-pv-1mw-15kv', nazwa: 'Farma PV 1 MW / 15 kV', kind: 'PV', pmax_mw: 1.0, un_kv: 15.0 },
        operator: { id: 'pse', nazwa: 'PSE — Polskie Sieci Elektroenergetyczne' },
        test_kind: 'lvrt',
        status_solvera: 'ok',
        obwiednia_profilu: {
          rodzaj: 'lvrt',
          opis: 'Krzywa LVRT operatora: dozwolony przebieg napięcia (czas→napięcie) wg profilu NC RfG.',
          punkty: [
            { czas_s: 0.0, napiecie_pu: 0.05 },
            { czas_s: 0.15, napiecie_pu: 0.05 },
            { czas_s: 0.7, napiecie_pu: 0.5 },
            { czas_s: 1.5, napiecie_pu: 0.85 },
            { czas_s: 3.0, napiecie_pu: 0.9 },
          ],
        },
        scenariusze: [
          {
            scenario_id: 'lvrt_conv-pv-1mw-15kv',
            status: 'ok',
            stayed_connected: true,
            margin_to_curve_s: null,
            margin_to_curve_pu: 0.0,
            p_recovery_time_s: 0.31,
            werdykt_pl: 'w obwiedni',
            liczba_punktow_trajektorii: 10,
            // Wywod 1:1 z `_wywod_scenariusza` (liczby spojne: m_U = 0.000000,
            // 10 punktow trajektorii, t_odz = 0.310000 s).
            wywod: [
              {
                tekst:
                  'Scenariusz lvrt_conv-pv-1mw-15kv (LVRT): napiecie zaklocenia 0.0500 p.u. '
                  + 'przez 0.1500 s (wejscie solvera FROZEN frt_hvrt).',
                latex: null,
              },
              {
                tekst:
                  'Wzor: margines napieciowy trajektorii wzgledem krzywej minimalnej '
                  + '(minimum roznicy napiecia trajektorii i krzywej od poczatku zaklocenia)',
                latex: 'm_{U} = \\min_{t \\ge t_{z}}\\bigl(u(t) - u_{kr}(t)\\bigr)',
              },
              {
                tekst:
                  'Dane: margines z solvera m_U = 0.000000 p.u. '
                  + '(FrtScenarioResult.margin_to_curve_pu), liczba punktow trajektorii: 10.',
                latex: null,
              },
              {
                tekst: 'Podstawienie: warunek utrzymania w obwiedni m_U >= 0: 0.000000 >= 0 SPELNIONE',
                latex: 'm_{U} = 0.000000\\ \\text{p.u.} \\ge 0',
              },
              {
                tekst: 'Dane: czas odzysku mocy czynnej po zakloceniu t_odz = 0.310000 s (pole wyniku solvera).',
                latex: null,
              },
              { tekst: 'Werdykt: w obwiedni.', latex: null },
            ],
            trajektoria,
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (url.includes('/api/oze-analysis/frt-sequence')) {
    // Scena "frt" (T-B): sekwencja zapadow z kontekstem sily sieci — ksztalt 1:1
    // z `application/analyses/frt_sekwencja.py::build_frt_sekwencja_view`;
    // `kontekst_sily_sieci` = wiersz SCR z widoku sily sieci (D1) ze sladem
    // WHITE BOX (`KrokSladuSily`). Liczby spojne: SCR = 45,0 / 20,0 = 2,25.
    const wejscie = (glebokosc: number, czas: number) => ({
      test_kind: 'lvrt',
      voltage_dip_depth_pu: glebokosc,
      fault_duration_s: czas,
      target_der_ref: 'conv-pv-1mw-15kv',
    });
    return new Response(
      JSON.stringify({
        modul_der: { id: 'conv-pv-1mw-15kv', nazwa: 'Farma PV 1 MW / 15 kV', kind: 'PV', pmax_mw: 1.0, un_kv: 15.0 },
        operator: { id: 'pse', nazwa: 'PSE — Polskie Sieci Elektroenergetyczne' },
        status_solvera: 'der_dropped',
        obwiednia_profilu: {
          rodzaj: 'lvrt',
          opis: 'Krzywa LVRT operatora: dozwolony przebieg napięcia (czas→napięcie) wg profilu NC RfG.',
          punkty: [
            { czas_s: 0.0, napiecie_pu: 0.05 },
            { czas_s: 0.15, napiecie_pu: 0.05 },
            { czas_s: 0.7, napiecie_pu: 0.5 },
            { czas_s: 1.5, napiecie_pu: 0.85 },
            { czas_s: 3.0, napiecie_pu: 0.9 },
          ],
        },
        liczba_zapadow: 2,
        zapady: [
          {
            scenario_id: 'seq_0_conv-pv-1mw-15kv', glebokosc_pu: 0.05, czas_s: 0.15,
            status: 'ok', stayed_connected: true, margin_to_curve_pu: 0.0,
            margin_to_curve_s: null, p_recovery_time_s: 0.31, werdykt_pl: 'w obwiedni',
            wejscie_solvera: wejscie(0.05, 0.15),
          },
          {
            scenario_id: 'seq_1_conv-pv-1mw-15kv', glebokosc_pu: 0.02, czas_s: 0.5,
            status: 'der_dropped', stayed_connected: false, margin_to_curve_pu: -0.03,
            margin_to_curve_s: null, p_recovery_time_s: null, werdykt_pl: 'moduł wypadł',
            wejscie_solvera: wejscie(0.02, 0.5),
          },
        ],
        werdykt_sekwencji_pl: 'sekwencja niezaliczona — zapad 2',
        zalozenia_pl:
          'Stan modułu MIĘDZY zapadami (nagrzewanie, niepełny odzysk) nie jest modelowany: '
          + 'każdy zapad liczony od stanu ustalonego i oceniany niezależnie. Werdykt sekwencji '
          + 'to koniunkcja werdyktów poszczególnych zapadów — kompozycja wyników solvera, '
          + 'nie nowa fizyka.',
        kontekst_sily_sieci: {
          bus_ref: 'bus-oze-1',
          nominal_kv: 15.0,
          s_sc_mva: 45.0,
          s_installed_mva: 20.0,
          scr: 2.25,
          verdict: 'sieć słaba',
          is_weak: true,
          why_pl: 'SCR = 2,25 poniżej progu sieci słabej (3,0).',
          missing_data: [],
          white_box: [
            {
              symbol: 'SCR',
              formula_latex: 'SCR = S_sc / S_n',
              substitution_pl: 'SCR = 45,0 / 20,0',
              result_pl: 'SCR = 2,25',
            },
          ],
          modules: [
            { ref: 'gen-fw-karnice', name: 'Farma wiatrowa Karnice', sn_mva: 18.9 },
            { ref: 'der-pv-1', name: 'Farma PV 1 MW', sn_mva: 1.1 },
          ],
        },
        kontekst_sily_sieci_powod_pl: null,
        input_hash: 'frt-seq-2b8d4e6f9a1c0357',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (url.includes('/api/execution/study-cases/') && url.endsWith('/runs')) {
    // Scena "oltc": utworzenie przebiegu LF z opcja badania OLTC (kontrakt H1).
    return new Response(
      JSON.stringify({
        id: 'run-oltc-1', study_case_id: 'case-demo', analysis_type: 'LOAD_FLOW',
        solver_input_hash: 'oltc-in-5d7f2a91', status: 'PENDING',
        started_at: null, finished_at: null, error_message: null,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (url.includes('/api/execution/runs/') && url.endsWith('/execute')) {
    return new Response(
      JSON.stringify({
        id: 'run-oltc-1', study_case_id: 'case-demo', analysis_type: 'LOAD_FLOW',
        solver_input_hash: 'oltc-in-5d7f2a91', status: 'DONE',
        started_at: '2026-07-22T10:00:00Z', finished_at: '2026-07-22T10:00:03Z',
        error_message: null,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (url.includes('/api/execution/runs/') && url.endsWith('/results')) {
    // Scena "oltc": wynik badania sweep — ksztalt 1:1 z
    // `power_flow_oltc_studies.py::TapSweepResult.to_dict()` w
    // `global_results.oltc_sweep`; wywod 1:1 z `_wywod_sweep` (liczby spojne
    // miedzy tabela punktow a krokami: t(n) = 1 + (n - 0) * 1.2500 / 100).
    const punkty = [
      { position: -2, tap_ratio: 0.975, controlled_bus_kv: 15.303, losses_mw: 0.2131, min_bus_kv: 14.883, max_bus_kv: 15.303 },
      { position: -1, tap_ratio: 0.9875, controlled_bus_kv: 15.109, losses_mw: 0.2094, min_bus_kv: 14.689, max_bus_kv: 15.109 },
      { position: 0, tap_ratio: 1.0, controlled_bus_kv: 14.92, losses_mw: 0.2067, min_bus_kv: 14.5, max_bus_kv: 14.92 },
      { position: 1, tap_ratio: 1.0125, controlled_bus_kv: 14.736, losses_mw: 0.2052, min_bus_kv: 14.316, max_bus_kv: 14.736 },
      { position: 2, tap_ratio: 1.025, controlled_bus_kv: 14.556, losses_mw: 0.2049, min_bus_kv: 14.136, max_bus_kv: 14.556 },
    ];
    return new Response(
      JSON.stringify({
        run_id: 'run-oltc-1', analysis_type: 'LOAD_FLOW',
        validation_snapshot: {}, readiness_snapshot: {}, element_results: [],
        global_results: {
          oltc_sweep: {
            branch_id: 'TR-1',
            controlled_bus_id: 'SZ-SN',
            points: punkty.map((p) => ({ ...p, converged: true })),
            wywod: [
              {
                tekst:
                  'Badanie: przeglad pozycji zaczepow (sweep) — rozplyw liczony solverem '
                  + 'FROZEN dla kazdej ustalonej pozycji zaczepu.',
                latex: null,
              },
              {
                tekst:
                  'Zakres pozycji: n = -2..2 (liczba punktow: 5); transformator TR-1, '
                  + 'szyna regulowana: SZ-SN.',
                latex: null,
              },
              {
                tekst: 'Wzor: przekladnia zaczepu t(n) = 1 + (n - n0) * du / 100',
                latex: 't(n) = 1 + \\frac{(n - n_{0}) \\cdot \\Delta u}{100}',
              },
              { tekst: 'Dane: krok zaczepu du = 1.2500 %, pozycja neutralna n0 = 0.', latex: null },
              ...punkty.map((p) => ({
                tekst:
                  `Pozycja n = ${p.position}: t = ${p.tap_ratio.toFixed(6)}, `
                  + `U szyny regulowanej = ${p.controlled_bus_kv.toFixed(3)} kV, `
                  + `straty = ${p.losses_mw.toFixed(6)} MW, zbiezny = TAK.`,
                latex:
                  `t(${p.position}) = 1 + \\frac{(${p.position} - 0) \\cdot 1.2500}{100}`
                  + ` = ${p.tap_ratio.toFixed(6)}`,
              })),
              {
                tekst:
                  'Kryterium odczytu: napiecie szyny regulowanej i straty czynne '
                  + 'pochodza z rozwiazania rozplywu (bez ocen w tej warstwie).',
                latex: null,
              },
            ],
          },
        },
        deterministic_signature: 'oltc-sweep-sig-8c3e1f5a',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (url.includes('/enm/field-view')) {
    // Sceny "przekaznik"/"pomiar" (karta Z-2): pusty widok pola z backendu —
    // useFieldReadModel spada wtedy na syntezę z bays snapshotu (fallback
    // udokumentowany w useFieldReadModel.ts), więc pole zasiane w snapshot
    // store staje się źródłem opcji formularza. Zero fabrykacji: kształt
    // odpowiedzi 1:1 z `FieldReadModelResponse` (pusty widok = uczciwy stan).
    return new Response(
      JSON.stringify({
        case_id: 'case-demo',
        enm_revision: 1,
        view_status: { data_source: 'ENM_FIELD_READ_MODEL', result_state: 'NONE', has_field_data: false },
        summary: {
          total_fields: 0, migrated_count: 0, requires_completion_count: 0,
          source_fields_count: 0, coupler_fields_count: 0, fields_with_results_count: 0,
        },
        fields: [],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  return originalFetch(input as RequestInfo, init);
}) as typeof window.fetch;

// --- Zaszczepienie stanu store ------------------------------------------
useAppStateStore.setState({ activeCaseId: 'case-demo' } as never);
useSnapshotStore.setState({
  snapshot: {
    header: { name: 'Projekt demonstracyjny' },
    substations: [{ ref_id: 'st-demo', name: 'Rozdzielnia GPZ-01', bus_refs: ['bus-sn-demo', 'bus-nn-demo'] }],
    transformers: [],
    buses: [
      { ref_id: 'bus-sn-demo', name: 'Szyna SN', voltage_kv: 15 },
      { ref_id: 'bus-nn-demo', name: 'Szyna nN', voltage_kv: 0.4 },
    ],
    sources: [],
    loads: [],
    bays: [],
  },
} as never);

const creator = new URLSearchParams(window.location.search).get('creator') ?? 'pole';

/**
 * Rekord przyłączenia DER do zasiewu `useStationDerStore` (sceny dowodowe OZE:
 * frt/macierz). Pełny kształt `StationDerConnection` — wartości domyślne to
 * kompletne przyłączenie nN 0,4 kV w stacji demo (nadpisywane per scena).
 */
function derDemo(
  over: Partial<StationDerConnection> & Pick<StationDerConnection, 'id' | 'der_kind' | 'name'>,
): StationDerConnection {
  return {
    project_id: 'proj-demo',
    station_id: 'st-demo',
    connection_side: 'nN',
    pcc_ref: 'st-demo__szyna-nn__0.4',
    bay_ref: null,
    transformer_ref: null,
    lv_busbar_ref: 'szyna-nn',
    connection_node_ref: null,
    internal_cable_ref: null,
    voltage_level_ref: 'lv_0_4kV',
    catalogs: EMPTY_DER_CATALOGS,
    profiles: EMPTY_DER_PROFILES,
    nominal_power_kw: null,
    completeness: 'complete',
    readiness: EMPTY_DER_READINESS,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...over,
  };
}

if (creator === 'arcflash') {
  const run: ExecutionRun = { id: 'run-sc-1', analysis_type: 'SC_3F', status: 'DONE' } as unknown as ExecutionRun;
  useExecutionRunsStore.setState({ runs: [run], activeRunId: 'run-sc-1' } as never);
} else if (creator === 'dokumentacja') {
  // Hub „Dokumentacja" (F-E8.1): pełny kontekst toru pracy — projekt, wariant,
  // wersja układu (rewizja + hash) i ZAKOŃCZONY przebieg → karty odblokowane
  // („można wytworzyć"), tabliczka pokazuje realne wartości (nie stan zerowy).
  useAppStateStore.setState({
    activeProjectName: 'Przyłączenie farmy PV 8 MW',
    activeCaseName: 'Wariant zimowy',
  } as never);
  const szyna = (v: number, i: number) => ({ ref_id: `bus-${v}-${i}`, name: `Szyna ${v} kV`, voltage_kv: v });
  useSnapshotStore.setState({
    snapshot: {
      header: { name: 'Projekt demonstracyjny', revision: 7, hash_sha256: 'a1b2c3d4e5f60718' },
      substations: [{ ref_id: 'st-demo', name: 'GPZ-01', bus_refs: ['bus-110-0', 'bus-15-0'] }],
      // Realistyczna mała sieć SN — panel „Analizowany model" pokazuje realne liczby.
      buses: [szyna(110, 0), szyna(15, 0), szyna(15, 1), szyna(15, 2), szyna(0.4, 0), szyna(0.4, 1)],
      branches: [{ ref_id: 'l1' }, { ref_id: 'l2' }, { ref_id: 'l3' }, { ref_id: 'l4' }, { ref_id: 'l5' }, { ref_id: 'l6' }, { ref_id: 'l7' }, { ref_id: 'l8' }],
      transformers: [{ ref_id: 't1' }, { ref_id: 't2' }],
      sources: [{ ref_id: 's1' }],
      generators: [{ ref_id: 'g1' }, { ref_id: 'g2' }],
      loads: [{ ref_id: 'o1' }, { ref_id: 'o2' }, { ref_id: 'o3' }, { ref_id: 'o4' }, { ref_id: 'o5' }],
      bays: [],
    },
  } as never);
  const run: ExecutionRun = {
    id: 'run-lf-1', analysis_type: 'LOAD_FLOW', status: 'DONE',
    started_at: '2026-07-21T10:30:00Z', finished_at: '2026-07-21T10:30:00Z',
  } as unknown as ExecutionRun;
  useExecutionRunsStore.setState({ runs: [run], activeRunId: 'run-lf-1' } as never);
} else if (creator === 'pulpit') {
  // Pulpit projektu (E1 — K2/V12K-103): kafel „Warunki przyłączenia" z warunkami
  // OSD z nagłówka + werdykt bilansu (generacja 6,2 MW > limit 5,0 MW).
  useSnapshotStore.setState({
    snapshot: {
      header: {
        name: 'Przyłączenie farmy PV 8 MW', revision: 9, hash_sha256: 'f00dfacecafe0123',
        connection_conditions: { moc_przylaczeniowa_mw: 5.0, wymagany_cos_phi: 0.95, tryb_pracy: 'praca równoległa z siecią' },
      },
      substations: [{ ref_id: 'st-1', name: 'GPZ-01', bus_refs: ['b110', 'b15'] }],
      buses: [
        { ref_id: 'b110', name: 'Szyna 110 kV', voltage_kv: 110 },
        { ref_id: 'b15', name: 'Szyna 15 kV', voltage_kv: 15 },
      ],
      branches: [{ ref_id: 'l1' }, { ref_id: 'l2' }, { ref_id: 'l3' }],
      transformers: [{ ref_id: 't1' }],
      sources: [{ ref_id: 's1', name: 'GPZ 110/15', bus_ref: 'b15', sk3_mva: 250, ik3_ka: 9.62 }],
      generators: [
        { ref_id: 'g1', bus_ref: 'b15', p_mw: 4.0 },
        { ref_id: 'g2', bus_ref: 'b15', p_mw: 2.2 },
      ],
      loads: [{ ref_id: 'o1', bus_ref: 'b15', p_mw: 1.4 }],
      bays: [], junctions: [], corridors: [], measurements: [], protection_assignments: [],
    },
    readiness: { ready: true, blockers: [], warnings: [] },
  } as never);
  useStudyCasesStore.setState({
    cases: [
      { id: 'K1', name: 'Stan normalny', description: 'Konfiguracja bazowa', result_status: 'FRESH', results_valid: true, is_active: true, updated_at: '2026-07-21T10:00:00Z' },
      { id: 'K2', name: 'Zwarcia maks.', description: 'c_max, pełna generacja', result_status: 'OUTDATED', results_valid: false, is_active: false, updated_at: '2026-07-20T09:00:00Z' },
    ],
    activeCase: { id: 'K1', name: 'Stan normalny', result_status: 'FRESH', results_valid: true } as never,
  } as never);
  const run: ExecutionRun = {
    id: 'run-lf-2', analysis_type: 'LOAD_FLOW', status: 'DONE',
    started_at: '2026-07-21T18:05:00Z', finished_at: '2026-07-21T18:05:04Z',
  } as unknown as ExecutionRun;
  useExecutionRunsStore.setState({ runs: [run], activeStudyCaseId: 'K1' } as never);
} else if (creator === 'uwaga') {
  // Rejestr „Co wymaga uwagi" (A1/V12K-098 + kontekstowe akcje K1/V12K-101):
  // dwa realne przekroczenia napięcia z wyniku rozpływu.
  usePowerFlowResultsStore.setState({
    results: {
      result_version: '1.0', converged: true, iterations_count: 5, tolerance_used: 1e-6,
      base_mva: 100, slack_bus_id: 'SZ-GPZ',
      bus_results: [
        { bus_id: 'SZ-GPZ', v_pu: 1.0, angle_deg: 0, p_injected_mw: 6.4, q_injected_mvar: 1.9 },
        { bus_id: 'SZ-ST7', v_pu: 0.941, angle_deg: -2.9, p_injected_mw: -1.2, q_injected_mvar: -0.4 },
        { bus_id: 'SZ-PV2', v_pu: 1.062, angle_deg: 1.4, p_injected_mw: 3.9, q_injected_mvar: 0.2 },
      ],
      branch_results: [], summary: { total_losses_p_mw: 0.11, total_losses_q_mvar: 0.08, min_v_pu: 0.941, max_v_pu: 1.062, slack_p_mw: 6.4, slack_q_mvar: 1.9 },
    },
    runHeader: { id: 'run-lf-2' },
  } as never);
} else if (creator === 'walidacja') {
  // Walidacja energetyczna ze sladem WHITE BOX per pozycja (R2-A/V12K-105);
  // dane z podmienionego fetch (ksztalt 1:1 z builderem backendu).
} else if (creator === 'kompensacja' || creator === 'kompensacja-wynik') {
  // „Dobor kompensacji" z pre-selekcja wezla z deep-linku (R2-B/V12K-106):
  // wezly z realnego snapshot store, preselekcja przez props ekranu.
  // Ekran wymaga zakonczonego przebiegu rozplywu (uczciwa blokada) — zasiew.
  // Scena "kompensacja-wynik" (V-B) reuzywa ten sam zasiew: spec wybiera wezel
  // i klika „Oblicz" natywnie (bez preselekcji), wynik z podmienionego fetch.
  const runKomp: ExecutionRun = {
    id: 'run-lf-3', analysis_type: 'LOAD_FLOW', status: 'DONE',
    started_at: '2026-07-22T08:00:00Z', finished_at: '2026-07-22T08:00:04Z',
  } as unknown as ExecutionRun;
  useExecutionRunsStore.setState({ runs: [runKomp], activeRunId: 'run-lf-3' } as never);
  useSnapshotStore.setState({
    snapshot: {
      header: { name: 'Projekt demonstracyjny' },
      substations: [], transformers: [], sources: [], loads: [], bays: [],
      buses: [
        { ref_id: 'SZ-GPZ', name: 'Szyna GPZ 15 kV', voltage_kv: 15 },
        { ref_id: 'SZ-ST7', name: 'Szyna ST-7', voltage_kv: 15 },
        { ref_id: 'SZ-PV2', name: 'Szyna PV-2', voltage_kv: 15 },
      ],
    },
  } as never);
} else if (creator === 'rozplyw') {
  // Rozplyw z kolumna obciazalnosci (R3-A/V12K-110): wynik PF read-only +
  // werdykty z podmienionego endpointu walidacji (target_id = branch_id).
  usePowerFlowResultsStore.setState({
    results: {
      result_version: '1.0', converged: true, iterations_count: 5, tolerance_used: 1e-6,
      base_mva: 100, slack_bus_id: 'SZ-GPZ',
      bus_results: [
        { bus_id: 'SZ-GPZ', v_pu: 1.0, angle_deg: 0, p_injected_mw: 6.4, q_injected_mvar: 1.9 },
        { bus_id: 'SZ-ST7', v_pu: 0.941, angle_deg: -2.9, p_injected_mw: -1.2, q_injected_mvar: -0.4 },
        { bus_id: 'SZ-PV2', v_pu: 1.062, angle_deg: 1.4, p_injected_mw: 3.9, q_injected_mvar: 0.2 },
      ],
      branch_results: [
        { branch_id: 'L-14', from_bus_id: 'SZ-GPZ', to_bus_id: 'SZ-ST7', p_from_mw: 2.31, q_from_mvar: 0.72, p_to_mw: -2.28, q_to_mvar: -0.7, losses_p_mw: 0.031, losses_q_mvar: 0.018 },
        { branch_id: 'TR-1', from_bus_id: 'SZ-ST7', to_bus_id: 'SZ-NN1', p_from_mw: 1.66, q_from_mvar: 0.5, p_to_mw: -1.64, q_to_mvar: -0.48, losses_p_mw: 0.021, losses_q_mvar: 0.02 },
        { branch_id: 'L-2', from_bus_id: 'SZ-GPZ', to_bus_id: 'SZ-PV2', p_from_mw: -3.88, q_from_mvar: -0.19, p_to_mw: 3.9, q_to_mvar: 0.2, losses_p_mw: 0.019, losses_q_mvar: 0.011 },
      ],
      summary: { total_losses_p_mw: 0.071, total_losses_q_mvar: 0.049, min_v_pu: 0.941, max_v_pu: 1.062, slack_p_mw: 6.4, slack_q_mvar: 1.9 },
    },
    runHeader: { id: 'run-lf-1' },
  } as never);
} else if (creator === 'zwarcia') {
  // Wyniki zwarciowe z wkladami zrodel (R3-B/V12K-109): tabela punktow ze
  // store'u read-only, wklady z podmienionego endpointu SC3F contributions.
  useResultsInspectorStore.setState({
    shortCircuitResults: {
      run_id: 'run-sc-2',
      rows: [
        // Pelny bilans IEC 60909 (ZWARCIA-PRO F1) — pola 1:1 z build_short_circuit_results.
        { target_id: 'SZ-GPZ', element_id: 'SZ-GPZ', target_name: 'Szyna GPZ 15 kV', ikss_ka: 12.48, ip_ka: 31.2, ith_ka: 12.9, sk_mva: 324.2, fault_type: '3F', flags: [], rk_ohm: 0.0821, xk_ohm: 0.7734, zk_ohm: 0.7777, rx_ratio: 0.1062, xr_ratio: 9.4162, kappa: 1.7284, c_factor: 1.1, un_kv: 15.0, tk_s: 1.0, tb_s: 0.1, ib_ka: 12.31, ik_ka: 12.48, ik_thevenin_ka: 12.1, ik_inverters_ka: 0.38, i2t_ka2s: 166.41 },
        { target_id: 'SZ-ST7', element_id: 'SZ-ST7', target_name: 'Szyna ST-7', ikss_ka: 6.05, ip_ka: 13.9, ith_ka: 6.2, sk_mva: 157.2, fault_type: '3F', flags: [], rk_ohm: 0.3105, xk_ohm: 1.5721, zk_ohm: 1.6025, rx_ratio: 0.1975, xr_ratio: 5.0633, kappa: 1.5602, c_factor: 1.1, un_kv: 15.0, tk_s: 1.0, tb_s: 0.1, ib_ka: 6.01, ik_ka: 6.05, ik_thevenin_ka: 5.9, ik_inverters_ka: 0.15, i2t_ka2s: 38.44 },
        { target_id: 'SZ-PV2', element_id: 'SZ-PV2', target_name: 'Szyna PV-2', ikss_ka: 7.31, ip_ka: 17.4, ith_ka: 7.5, sk_mva: 189.9, fault_type: '3F', flags: [], rk_ohm: 0.221, xk_ohm: 1.3067, zk_ohm: 1.3253, rx_ratio: 0.1691, xr_ratio: 5.9136, kappa: 1.6014, c_factor: 1.1, un_kv: 15.0, tk_s: 1.0, tb_s: 0.1, ib_ka: 7.24, ik_ka: 7.31, ik_thevenin_ka: 7.05, ik_inverters_ka: 0.26, i2t_ka2s: 56.25 },
      ],
    },
    selectedRunId: 'run-sc-2',
  } as never);
} else if (creator === 'zwarcia-rozplyw') {
  // Karta Z-3 (dowody wizualne pkt 7 karty właściciela): sekcja „Rozpływ
  // prądu zwarciowego" (RozplywZwarciowy) — tor Thevenina (sieć nadrzędna)
  // + tor maszyny (falownik) RAZEM w `branch_contributions`, liczby [kA]
  // przepisane 1:1 z realnego wyniku IEC 60909 solvera na fixturze testu
  // TH-1 (`build_slack_radial_graph` + falownik `INV-B`, fault_node_id="C",
  // `backend/tests/test_short_circuit_iec60909.py::
  // test_thevenin_addition_preserves_inverter_entries_byte_for_byte`).
  // Spójność liczb: suma wpisów Thevenina WCHODZĄCYCH do węzła zwarcia
  // (jedyny wpis — gałąź L1) = ik_thevenin_ka (5,552132022553349 ≈
  // 5,552132022553348 — różnica 1e-15, KCL do precyzji maszynowej solvera,
  // jak w asercji backendu `pytest.approx(rel=1e-9, abs=1e-6)`).
  useResultsInspectorStore.setState({
    shortCircuitResults: {
      run_id: 'run-sc-th1-demo',
      rows: [
        {
          target_id: 'BUS-OZE', element_id: 'EL-OZE', target_name: 'Szyna OZE 20 kV',
          ikss_ka: 5.648132022553348, ip_ka: 11.440063189333824, ith_ka: 5.648132022553348,
          sk_mva: 195.65703261838325, fault_type: '3F', flags: [],
          rk_ohm: 0.5768040000000003, xk_ohm: 1.9981557370919767, zk_ohm: 2.079742581207968,
          rx_ratio: 0.28866819001778815, xr_ratio: 3.4641849520668644, kappa: 1.4322162134453085,
          c_factor: 1.0, un_kv: 20.0, tk_s: 1.0, tb_s: 0.1, ib_ka: 5.64813202955557,
          ik_thevenin_ka: 5.552132022553348, ik_inverters_ka: 0.096, i2t_ka2s: 31.901395344192572,
          branch_contributions: [
            {
              branch_id: 'BR-L1', branch_name: 'Linia OZE', source_id: 'THEVENIN_GRID',
              from_node_id: 'BUS-GPZ', from_node_name: 'Szyna GPZ 20 kV',
              to_node_id: 'BUS-OZE', to_node_name: 'Szyna OZE 20 kV',
              i_ka: 5.552132022553349, direction: 'from_to',
            },
            {
              branch_id: 'BR-L1', branch_name: 'Linia OZE', source_id: 'INV-B',
              from_node_id: 'BUS-GPZ', from_node_name: 'Szyna GPZ 20 kV',
              to_node_id: 'BUS-OZE', to_node_name: 'Szyna OZE 20 kV',
              i_ka: 0.024, direction: 'to_from',
            },
          ],
        },
      ],
    },
    selectedRunId: 'run-sc-th1-demo',
  } as never);
} else if (creator === 'sila-sieci') {
  // Runda dowodowa V-B: sekcja sily sieci (SCR/WSCR) pulpitu OZE — wymaga
  // zakonczonego przebiegu zwarciowego; wywod white_box z grid-strength.
  const runSc: ExecutionRun = {
    id: 'run-sc-4', analysis_type: 'SC_3F', status: 'DONE',
  } as unknown as ExecutionRun;
  useExecutionRunsStore.setState({ runs: [runSc], activeRunId: 'run-sc-4' } as never);
} else if (creator === 'odbior-zgodnosc') {
  // Runda dowodowa V-B: „Zgodnosc powykonawcza" — wymaga zakonczonego
  // przebiegu rozplywu (slad_pl per wiersz z podmienionego fetch).
  const runLf5: ExecutionRun = {
    id: 'run-lf-5', analysis_type: 'LOAD_FLOW', status: 'DONE',
  } as unknown as ExecutionRun;
  useExecutionRunsStore.setState({ runs: [runLf5], activeRunId: 'run-lf-5' } as never);
} else if (creator === 'estymacja') {
  // Runda dowodowa V-B: „Estymacja stanu (WLS)" — wymaga zakonczonego
  // przebiegu rozplywu (zrodlo Y-bus); wymagania + wynik z podmienionego fetch.
  const runLf6: ExecutionRun = {
    id: 'run-lf-6', analysis_type: 'LOAD_FLOW', status: 'DONE',
  } as unknown as ExecutionRun;
  useExecutionRunsStore.setState({ runs: [runLf6], activeRunId: 'run-lf-6' } as never);
} else if (creator === 'ssci' || creator === 'migotanie') {
  // Runda dowodowa V-B: ssci — aktywny przypadek 'case-demo' zasiany globalnie;
  // migotanie — przebieg zwarciowy podawany propem sekcji. Pusta galaz chroni
  // przed otwarciem formularza operacji kreatora w galezi domyslnej.
} else if (creator === 'porownanie') {
  // Porownanie przebiegow A/B (R3-C/V12K-111): lista przebiegow i wynik
  // porownania z podmienionego fetch; nazwy przypadkow ze store'u.
  useStudyCasesStore.setState({
    cases: [
      { id: 'K1', name: 'Stan normalny' },
      { id: 'K2', name: 'Wariant z kompensacja' },
    ],
  } as never);
} else if (creator === 'swiezosc') {
  // Pasek aktywnego przypadku (K4/V12K-102): wyniki NIEAKTUALNE → klikalny znacznik.
  // Chip wyników renderuje się wyłącznie przy obecnym projekcie (projectPresent).
  useAppStateStore.setState({
    activeProjectId: 'proj-demo',
    activeProjectName: 'Przyłączenie farmy PV 8 MW',
    activeCaseId: 'K1',
    activeCaseName: 'Stan normalny',
  } as never);
  useStudyCasesStore.setState({
    activeCase: { id: 'K1', name: 'Stan normalny', result_status: 'OUTDATED', results_valid: false } as never,
  } as never);
} else if (creator === 'lom') {
  // Scena „lom" (V-A): EkranLom czyta case_id z AKTYWNEGO przypadku (store
  // study-cases) — zasiew; ocena z podmienionego endpointu lom-protection.
  useStudyCasesStore.setState({
    activeCase: { id: 'case-demo', name: 'Stan normalny', result_status: 'FRESH', results_valid: true } as never,
  } as never);
} else if (creator === 'frt') {
  // Scena „frt" (V-A): moduł DER z typem przekształtnika (selectAllDers) +
  // zakończony przebieg zwarciowy do doboru kontekstu siły sieci (T-B).
  useStationDerStore.setState({
    ders: {
      'der-pv-1': derDemo({
        id: 'der-pv-1',
        der_kind: 'PV',
        name: 'Farma PV 1 MW',
        connection_side: 'SN',
        pcc_ref: 'st-demo__szyna-sn__15',
        lv_busbar_ref: null,
        voltage_level_ref: null,
        nominal_power_kw: 1000,
        catalogs: {
          ...EMPTY_DER_CATALOGS,
          device_catalog_ref: 'conv-pv-1mw-15kv',
          dynamic_model_ref: 'dyn-grid-following-pv',
        },
        profiles: { ...EMPTY_DER_PROFILES, nc_rfg_profile_ref: 'pse', lvrt_curve_ref: 'lvrt-pse' },
      }),
    },
  } as never);
  const runSc: ExecutionRun = {
    id: 'run-sc-9', analysis_type: 'SC_3F', status: 'DONE',
    started_at: '2026-07-22T09:15:00Z', finished_at: '2026-07-22T09:15:04Z',
  } as unknown as ExecutionRun;
  useExecutionRunsStore.setState({ runs: [runSc] } as never);
} else if (creator === 'macierz') {
  // Scena „macierz" (V-A): dwa moduły DER (kolejność selectAllDers: bess-1,
  // pv-1) z mocą katalogową i poziomem napięcia — gotowe do biegu NC RfG.
  useAppStateStore.setState({
    activeProjectName: 'Przyłączenie farmy PV 8 MW',
    activeCaseName: 'Stan normalny',
  } as never);
  useStationDerStore.setState({
    ders: {
      'bess-1': derDemo({
        id: 'bess-1',
        der_kind: 'BESS',
        name: 'Magazyn energii 0,8 MW',
        nominal_power_kw: 800,
        catalogs: {
          ...EMPTY_DER_CATALOGS,
          device_catalog_ref: 'bess-pcs-800',
          battery_catalog_ref: 'bess-bat-1600',
        },
        profiles: { ...EMPTY_DER_PROFILES, nc_rfg_profile_ref: 'enea' },
      }),
      'pv-1': derDemo({
        id: 'pv-1',
        der_kind: 'PV',
        name: 'Instalacja PV 0,5 MW',
        nominal_power_kw: 500,
        catalogs: {
          ...EMPTY_DER_CATALOGS,
          device_catalog_ref: 'pv-falownik-500-ptpiree',
          ptpiree_certificate_ref: 'WOŚ/2024/PV-500',
          dynamic_model_ref: 'dyn-grid-following-pv',
        },
        profiles: {
          ...EMPTY_DER_PROFILES,
          nc_rfg_profile_ref: 'enea',
          lvrt_curve_ref: 'lvrt-enea',
          regulation_profile_ref: 'qu-enea',
        },
      }),
    },
  } as never);
} else if (creator === 'oltc') {
  // Scena „oltc" (V-A): aktywny przypadek `case-demo` z zasiewu globalnego
  // (useAppStateStore) — bieg badania przez podmienione końcówki execution.
} else if (creator === 'wyniki-skladowe') {
  // Scena E-29 (karta Z-1): przebieg zwarcia NIESYMETRYCZNEGO (SC_1F) → ekran
  // wybiera go automatycznie; dane spływają z podmienionych końcówek wyników.
  useShellStore.setState({ advancementMode: 'expert' });
  useExecutionRunsStore.setState({
    runs: [
      {
        id: 'run-1f',
        analysis_type: 'SC_1F',
        status: 'DONE',
        finished_at: '2026-07-21T10:00:00Z',
        started_at: '2026-07-21T09:59:00Z',
      } as unknown as ExecutionRun,
    ],
  } as never);
} else if (creator === 'wyniki-zbieznosc') {
  // Scena E-30 (karta Z-1): zakończony rozpływ (LOAD_FLOW) + snapshot z
  // transformatorem OLTC (założenia zaczepów modelu).
  useShellStore.setState({ advancementMode: 'expert' });
  useAppStateStore.getState().setActiveProject('proj-demo', 'Przyłączenie farmy PV 8 MW');
  useSnapshotStore.setState({ snapshot: ZBIEZNOSC_SNAPSHOT } as never);
  useExecutionRunsStore.setState({
    runs: [
      {
        id: 'run-lf-1',
        analysis_type: 'LOAD_FLOW',
        status: 'DONE',
        finished_at: '2026-07-20T10:00:00Z',
        started_at: '2026-07-20T09:59:00Z',
      } as unknown as ExecutionRun,
    ],
  } as never);
} else if (creator === 'wyniki-stan-fazowy') {
  // Scena E-31 (karta Z-1): zakończony przebieg stanu fazowego (PHASE_STATE_SN).
  useShellStore.setState({ advancementMode: 'expert' });
  useAppStateStore.getState().setActiveProject('proj-demo', 'Przyłączenie farmy PV 8 MW');
  useExecutionRunsStore.setState({
    runs: [
      {
        id: 'run-ps-1',
        analysis_type: 'PHASE_STATE_SN',
        status: 'DONE',
        finished_at: '2026-07-20T11:00:00Z',
        started_at: '2026-07-20T10:59:00Z',
      } as unknown as ExecutionRun,
    ],
  } as never);
} else if (creator === 'wyniki-stabilnosc') {
  // Scena E-32 (karta Z-1): zakończony przebieg stabilności (DYNAMIC_STABILITY).
  useShellStore.setState({ advancementMode: 'expert' });
  useExecutionRunsStore.setState({
    runs: [
      {
        id: 'run-dyn',
        analysis_type: 'DYNAMIC_STABILITY',
        status: 'DONE',
        finished_at: '2026-07-21T10:00:00Z',
        started_at: '2026-07-21T09:59:00Z',
      } as unknown as ExecutionRun,
    ],
  } as never);
} else if (creator === 'zrodlo-dyspozycyjne') {
  // Karta Z-2 (fala P-4/P-5): kreator agregatu/UPS nN — kontekst szyny nN
  // stacji demo (op=add_genset_nn wybiera wariant „agregat"; snapshot globalny
  // z zasiewu wyżej ma już szynę nN stacji demo).
  useNetworkBuildStore.getState().openOperationForm('add_genset_nn' as never, {
    station_ref: 'st-demo',
    bus_nn_ref: 'bus-nn-demo',
    bus_name: 'Szyna nN',
    voltage_kv: 0.4,
    station_label: 'Rozdzielnia GPZ-01',
  });
} else if (creator === 'odgalezienie') {
  // Karta Z-2: kreator odgałęzienia SN startuje nowy ciąg od jawnego zacisku
  // źródła (szyna SN stacji demo) — kontekst z jawnymi etykietami źródła.
  useNetworkBuildStore.getState().openOperationForm('start_branch_segment_sn' as never, {
    from_ref: 'bus-sn-demo',
    source_type_label: 'Szyna SN',
    source_name: 'Szyna GPZ SN',
  });
} else if (creator === 'slup-odgalezny' || creator === 'zksn') {
  // Karta Z-2: słup rozgałęźny / ZKSN wstawiają węzeł na ISTNIEJĄCYM odcinku —
  // snapshot z jawnym odcinkiem SN właściwego toru (linia napowietrzna / kabel).
  const segmentType = creator === 'slup-odgalezny' ? 'line_overhead' : 'cable';
  const segmentId = creator === 'slup-odgalezny' ? 'odc-linia-7' : 'odc-kabel-3';
  const segmentName = creator === 'slup-odgalezny' ? 'Linia napowietrzna L-7' : 'Kabel SN K-3';
  useSnapshotStore.setState({
    snapshot: {
      header: { name: 'Projekt demonstracyjny' },
      substations: [{ ref_id: 'st-demo', name: 'Rozdzielnia GPZ-01', bus_refs: ['bus-sn-demo', 'bus-nn-demo'] }],
      buses: [
        { ref_id: 'bus-sn-demo', name: 'Szyna SN', voltage_kv: 15 },
        { ref_id: 'bus-nn-demo', name: 'Szyna nN', voltage_kv: 0.4 },
      ],
      transformers: [], sources: [], loads: [], generators: [], bays: [],
      branches: [{ id: segmentId, ref_id: segmentId, name: segmentName, type: segmentType, tags: [], meta: {} }],
      junctions: [], corridors: [], measurements: [], protection_assignments: [],
    },
  } as never);
  useNetworkBuildStore.getState().openOperationForm(
    (creator === 'slup-odgalezny' ? 'insert_branch_pole_on_segment_sn' : 'insert_zksn_on_segment_sn') as never,
    { segment_id: segmentId },
  );
} else if (creator === 'przekaznik' || creator === 'pomiar') {
  // Karta Z-2: kreatory zabezpieczenia/pomiaru pola SN czytają opcje pola z
  // useFieldReadModel — endpoint field-view zwraca pusty widok (zasiew wyżej),
  // więc hak spada na syntezę z `snapshot.bays` (fallback udokumentowany w
  // useFieldReadModel.ts): pole odpływowe SN stacji demo z pełnym kontraktem Bay.
  useSnapshotStore.setState({
    snapshot: {
      header: { name: 'Projekt demonstracyjny' },
      substations: [{ ref_id: 'st-demo', name: 'Rozdzielnia GPZ-01', bus_refs: ['bus-sn-demo', 'bus-nn-demo'] }],
      buses: [
        { ref_id: 'bus-sn-demo', name: 'Szyna SN', voltage_kv: 15 },
        { ref_id: 'bus-nn-demo', name: 'Szyna nN', voltage_kv: 0.4 },
      ],
      transformers: [], sources: [], loads: [], generators: [],
      bays: [{
        id: 'bay-odplyw-1', ref_id: 'bay-odplyw-1', name: 'Pole odpływowe L-1',
        tags: [], meta: {}, bay_role: 'OUT', substation_ref: 'st-demo', bus_ref: 'bus-sn-demo',
        gpz_section_id: null, equipment_refs: [], protection_ref: null,
      }],
      branches: [], junctions: [], corridors: [], measurements: [], protection_assignments: [],
    },
  } as never);
  useNetworkBuildStore.getState().openOperationForm(
    (creator === 'przekaznik' ? 'add_relay' : 'add_ct') as never,
    {},
  );
} else if (creator === 'pole-nn') {
  // Karta Z-2: pole odpływowe nN — jedyny publiczny write-path pola nN.
  useNetworkBuildStore.getState().openOperationForm('add_nn_outgoing_field' as never, {
    station_ref: 'st-demo',
    bus_nn_ref: 'bus-nn-demo',
  });
} else if (creator === 'przypisanie-katalogu') {
  // Karta Z-2: przypisanie typu katalogowego do istniejącego elementu (transformator demo).
  useNetworkBuildStore.getState().openOperationForm('assign_catalog_to_element' as never, {
    element_ref: 'TR-1',
    catalog_namespace: 'TRAFO_SN_NN',
    catalog_item_id: 'trafo-630-15-04',
  });
} else if (creator === 'edycja-parametrow') {
  // Karta Z-2: ekspercki override parametru istniejącego elementu (transformator demo).
  useNetworkBuildStore.getState().openOperationForm('update_element_parameters' as never, {
    element_ref: 'TR-1',
    parameter_source: 'KATALOG',
    field: 'r_pct',
    value: '0.55',
  });
} else {
  // Kontekst operacji (szyna/stacja) dla kreatorów pole/OZE/transformator.
  const op =
    creator === 'oze'
      ? 'add_converter_source'
      : creator === 'transformator'
      ? 'add_transformer_sn_nn'
      : creator === 'kompensator'
      ? 'add_shunt_compensator_sn'
      : creator === 'magistrala'
      ? 'continue_trunk_segment_sn'
      : creator === 'odbior'
      ? 'add_nn_load'
      : creator === 'zrodlo'
      ? 'add_grid_source_sn'
      : 'add_sn_bay';
  useNetworkBuildStore.getState().openOperationForm(op as never, {
    station_ref: 'st-demo',
    bus_ref: 'bus-sn-demo',
    bus_nn_ref: 'bus-nn-demo',
    bus_name: 'Szyna SN',
    voltage_kv: 15,
    length_m: 2500,
    from_terminal_id: 'term-demo',
    terminalId: 'term-demo',
    terminal_voltage_label: '15 kV',
    feeder_ref: 'feeder-demo',
    bus_voltage_kv: 0.4,
    station_label: 'Rozdzielnia GPZ-01',
  });
}

/** Pasek przypadku ze znacznikiem świeżości (K4) — info z realnego hooka powłoki. */
function SwiezoscScena() {
  const info = useShellCaseInfo();
  return <CaseBar info={info} onPrzejdzDoObliczen={() => undefined} />;
}

function Harness() {
  let node: React.ReactNode;
  if (creator === 'dokumentacja') node = <HubDokumentacji />;
  else if (creator === 'pulpit')
    node = (
      <PulpitProjektu
        onNawiguj={() => undefined}
        onOtworzProjekt={() => undefined}
        onZaznaczPrzypadek={() => undefined}
        onOtworzPrzypadek={() => undefined}
      />
    );
  else if (creator === 'uwaga') node = <EkranCoWymagaUwagi />;
  else if (creator === 'swiezosc') node = <SwiezoscScena />;
  else if (creator === 'walidacja')
    node = (
      <SekcjaWalidacji
        przebieg={{ id: 'run-lf-1', analysis_type: 'LOAD_FLOW', status: 'DONE' } as unknown as ExecutionRun}
        trybZaawansowania="expert"
        onOtworzDowod={() => undefined}
      />
    );
  else if (creator === 'rozplyw')
    node = <EkranRozplywu trybZaawansowania="expert" onOtworzDowod={() => undefined} />;
  else if (creator === 'zwarcia')
    node = (
      <EkranZwarc
        trybZaawansowania="expert"
        onOtworzDowod={() => undefined}
        wspolczynnikC={1.1}
        czasCieplnyS={1.0}
      />
    );
  else if (creator === 'zwarcia-rozplyw')
    // Karta Z-3: tryb ekspercki — kolumna „źródło" widoczna (rozróżnienie
    // „sieć nadrzędna" vs identyfikator falownika w sekcji RozplywZwarciowy).
    node = (
      <EkranZwarc
        trybZaawansowania="expert"
        onOtworzDowod={() => undefined}
        wspolczynnikC={1.0}
        czasCieplnyS={1.0}
      />
    );
  else if (creator === 'porownanie')
    node = <EkranPorownania projektId="proj-demo" trybZaawansowania="expert" />;
  else if (creator === 'kompensacja')
    node = (
      <EkranKompensacji
        trybZaawansowania="expert"
        preselekcjaWezla="SZ-ST7"
        onPreselekcjaSkonsumowana={() => undefined}
      />
    );
  else if (creator === 'lom') node = <EkranLom trybZaawansowania="expert" />;
  else if (creator === 'frt') node = <EkranFrt trybZaawansowania="expert" />;
  else if (creator === 'oltc') node = <EkranBadanOltc />;
  else if (creator === 'macierz') node = <MacierzNcRfg trybZaawansowania="expert" />;
  else if (creator === 'wyniki-skladowe') node = <EkranSkladowych />;
  else if (creator === 'wyniki-zbieznosc') node = <EkranZbieznosci />;
  else if (creator === 'wyniki-stan-fazowy') node = <EkranStanuFazowego />;
  else if (creator === 'wyniki-stabilnosc') node = <EkranStabilnosci />;
  else if (creator === 'kompensacja-wynik')
    // V-B: bez preselekcji — spec wybiera wezel i klika „Oblicz" natywnie.
    node = <EkranKompensacji trybZaawansowania="expert" />;
  else if (creator === 'sila-sieci') node = <SekcjaSilySieci trybEkspercki />;
  else if (creator === 'odbior-zgodnosc')
    node = <EkranOdbioru trybZaawansowania="expert" onOtworzDowod={() => undefined} />;
  else if (creator === 'estymacja')
    node = <EkranEstymacji trybZaawansowania="expert" onOtworzDowod={() => undefined} />;
  else if (creator === 'ssci') node = <EkranSsci trybZaawansowania="expert" />;
  else if (creator === 'migotanie')
    node = (
      <SekcjaMigotania
        przebieg={{ id: 'run-sc-5', analysis_type: 'SC_3F', status: 'DONE' } as unknown as ExecutionRun}
        trybZaawansowania="expert"
        onOtworzDowod={() => undefined}
      />
    );
  else if (creator === 'oze') node = <KreatorZrodlaOze />;
  else if (creator === 'transformator') node = <KreatorTransformatoraSnNn />;
  else if (creator === 'kompensator') node = <KreatorKompensatoraSn />;
  else if (creator === 'magistrala') node = <KreatorMagistralaSn />;
  else if (creator === 'odbior') node = <KreatorOdbioruNn />;
  else if (creator === 'zrodlo') node = <KreatorZrodloZasilania />;
  else if (creator === 'cieplna')
    node = (
      <SekcjaWytrzymaloscCieplna
        przebieg={{ id: 'run-sc-7', analysis_type: 'SC_3F', status: 'DONE' } as unknown as ExecutionRun}
        trybZaawansowania="expert"
        onOtworzDowod={() => undefined}
      />
    );
  else if (creator === 'arcflash') {
    node = (
      <SekcjaArcFlash
        przebieg={{ id: 'run-sc-1', analysis_type: 'SC_3F', status: 'DONE' } as unknown as ExecutionRun}
        trybZaawansowania="expert"
        onOtworzDowod={() => undefined}
      />
    );
  }
  // Karta Z-2 (fala P-4/P-5): 9 kreatorów ui2 nowe w tej fali.
  else if (creator === 'zrodlo-dyspozycyjne') node = <KreatorZrodloDyspozycyjne />;
  else if (creator === 'odgalezienie') node = <KreatorOdgalezienia />;
  else if (creator === 'slup-odgalezny') node = <KreatorSlupaOdgaleznego />;
  else if (creator === 'zksn') node = <KreatorZksn />;
  else if (creator === 'przekaznik') node = <KreatorPrzekaznika />;
  else if (creator === 'pomiar') node = <KreatorPomiaru />;
  else if (creator === 'pole-nn') node = <KreatorPolaNn />;
  else if (creator === 'przypisanie-katalogu') node = <KreatorPrzypisaniaKatalogu />;
  else if (creator === 'edycja-parametrow') node = <KreatorEdycjiParametrow />;
  else node = <KreatorPolaSn />;

  return (
    <div
      data-testid="creator-harness-root"
      data-status="ready"
      data-creator={creator}
      data-theme={theme}
      style={{
        // Sceny rundy dowodowej V-B mają szerokie tabele (kolumny decyzyjne +
        // informacyjne + werdykt) — szerszy kadr eliminuje przycięcie z prawej.
        width: [
          'kompensacja-wynik', 'sila-sieci', 'odbior-zgodnosc', 'estymacja', 'ssci', 'migotanie', 'cieplna',
          'wyniki-skladowe', 'wyniki-zbieznosc', 'wyniki-stan-fazowy', 'wyniki-stabilnosc',
        ].includes(creator)
          ? 1400
          : 1180,
        minHeight: 800,
        padding: 16,
        background: 'var(--mvd-bg, #07111c)',
        color: 'var(--mvd-ink, #e5eef6)',
      }}
    >
      {node}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
