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
              'Wzor: odchylenie = |U - U_n| / U_n * 100%',
              'Dane: U = 13.2000 kV (wynik PF), U_n = 15.0000 kV',
              'Wynik: odchylenie = 12.00 %',
              'Progi: ostrzezenie 5.0 %, przekroczenie 10.0 %',
              'Werdykt: PRZEKROCZENIE',
            ],
          },
          {
            check_type: 'BRANCH_LOADING', target_id: 'L-14', target_name: 'Odcinek L-14',
            observed_value: 90.0, unit: '%', limit_warn: 80.0, limit_fail: 100.0, margin_pct: -10.0,
            status: 'WARNING', why_pl: 'Obciazenie 90.00 % powyzej progu ostrzegawczego 80.0 %.',
            white_box: [
              'Wzor: obciazenie = |I| / I_n * 100%',
              'Dane: |I| = 0.2295 kA (wynik PF), I_n = 0.2550 kA (dane galezi)',
              'Wynik: obciazenie = 90.00 %',
              'Progi: ostrzezenie 80.0 %, przekroczenie 100.0 %',
              'Werdykt: OSTRZEZENIE',
            ],
          },
        ],
        summary: { pass_count: 6, warning_count: 1, fail_count: 1, not_computed_count: 0, worst_item_target_id: 'SZ-ST7', worst_item_margin_pct: 2.0 },
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
