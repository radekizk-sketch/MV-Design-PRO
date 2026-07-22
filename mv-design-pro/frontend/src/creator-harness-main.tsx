/**
 * Creator Screenshot Harness — render żywych kreatorów ui2 do oceny wizualnej
 * (dyrektywa właściciela #8: zrzuty żywej aplikacji w obu motywach na stałej stronie
 * oceny). Renderuje REALNE komponenty kreatorów z zaszczepionym kontekstem/stanem
 * i podmienionym `fetch` (dane katalogowe), w motywie jasnym/ciemnym.
 *
 * Query: `?creator=pole|oze|transformator|kompensator|magistrala|odbior|zrodlo|arcflash&theme=light|dark`.
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
import { SekcjaArcFlash, SekcjaWalidacji } from './ui2/wyniki/jakosc/EkranJakosci';
import { EkranRozplywu } from './ui2/wyniki/rozplyw';
import { EkranZwarc } from './ui2/wyniki/zwarcia';
import { EkranPorownania } from './ui2/wyniki/porownanie';
import { useResultsInspectorStore } from './ui/results-inspector/store';
import { EkranKompensacji } from './ui2/oze';
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
};

const originalFetch = window.fetch.bind(window);
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
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
          { source_id: 'gen-pv-1', source_name: 'Falownik PV 4 MW', ikss_partial_a: 1730 },
          { source_id: 'gen-bess-1', source_name: 'Magazyn BESS 2 MW', ikss_partial_a: 1130 },
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
  if (url.includes('/api/catalog/complete-bay-templates')) {
    return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (url.includes('/api/quality/arc-flash')) {
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
            conductor_gap_mm: 152, working_distance_mm: 455, i_arc_ka: 11.8, incident_energy_cal_cm2: 8.42,
            incident_energy_joule_cm2: 35.2, arc_flash_boundary_mm: 1320, ppe_category: '2', ppe_table_provenance: null,
            provenance: 'ARC_FLASH_OPEN_SOURCE_PROVENANCE', provenance_caveat_pl: 'Wynik na współczynnikach open-source — wymaga weryfikacji z licencjonowaną normą IEEE 1584.',
            why_pl: 'Energia incydentu wyznaczona wg IEEE 1584-2018.', missing_data: [], white_box: [],
          },
          {
            bus_ref: 'Szyna SN-2', status: 'COMPUTED_IEEE_1584_OPEN_SOURCE', status_label_pl: 'obliczony (IEEE 1584 open-source)',
            method: 'IEEE_1584_2018', electrode_config: 'VCB', i_bf_ka: 8.1, voltage_kv: 15.0, arc_time_s: 0.2,
            conductor_gap_mm: 152, working_distance_mm: 455, i_arc_ka: 7.7, incident_energy_cal_cm2: 4.15,
            incident_energy_joule_cm2: 17.4, arc_flash_boundary_mm: 890, ppe_category: '1', ppe_table_provenance: null,
            provenance: 'ARC_FLASH_OPEN_SOURCE_PROVENANCE', provenance_caveat_pl: null,
            why_pl: 'Energia incydentu wyznaczona wg IEEE 1584-2018.', missing_data: [], white_box: [],
          },
        ],
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
} else if (creator === 'kompensacja') {
  // „Dobor kompensacji" z pre-selekcja wezla z deep-linku (R2-B/V12K-106):
  // wezly z realnego snapshot store, preselekcja przez props ekranu.
  // Ekran wymaga zakonczonego przebiegu rozplywu (uczciwa blokada) — zasiew.
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
        { target_id: 'SZ-GPZ', element_id: 'SZ-GPZ', target_name: 'Szyna GPZ 15 kV', ikss_ka: 12.48, ip_ka: 31.2, ith_ka: 12.9, sk_mva: 324.2, fault_type: '3F', flags: [] },
        { target_id: 'SZ-ST7', element_id: 'SZ-ST7', target_name: 'Szyna ST-7', ikss_ka: 6.05, ip_ka: 13.9, ith_ka: 6.2, sk_mva: 157.2, fault_type: '3F', flags: [] },
        { target_id: 'SZ-PV2', element_id: 'SZ-PV2', target_name: 'Szyna PV-2', ikss_ka: 7.31, ip_ka: 17.4, ith_ka: 7.5, sk_mva: 189.9, fault_type: '3F', flags: [] },
      ],
    },
    selectedRunId: 'run-sc-2',
  } as never);
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
  else if (creator === 'oze') node = <KreatorZrodlaOze />;
  else if (creator === 'transformator') node = <KreatorTransformatoraSnNn />;
  else if (creator === 'kompensator') node = <KreatorKompensatoraSn />;
  else if (creator === 'magistrala') node = <KreatorMagistralaSn />;
  else if (creator === 'odbior') node = <KreatorOdbioruNn />;
  else if (creator === 'zrodlo') node = <KreatorZrodloZasilania />;
  else if (creator === 'arcflash') {
    node = (
      <SekcjaArcFlash
        przebieg={{ id: 'run-sc-1', analysis_type: 'SC_3F', status: 'DONE' } as unknown as ExecutionRun}
        trybZaawansowania="expert"
        onOtworzDowod={() => undefined}
      />
    );
  } else node = <KreatorPolaSn />;

  return (
    <div
      data-testid="creator-harness-root"
      data-status="ready"
      data-creator={creator}
      data-theme={theme}
      style={{
        width: creator === 'arcflash' ? 1180 : 1180,
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
