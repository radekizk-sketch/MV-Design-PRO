/**
 * Creator Screenshot Harness — render żywych kreatorów ui2 do oceny wizualnej
 * (dyrektywa właściciela #8: zrzuty żywej aplikacji w obu motywach na stałej stronie
 * oceny). Renderuje REALNE komponenty kreatorów z zaszczepionym kontekstem/stanem
 * i podmienionym `fetch` (dane katalogowe), w motywie jasnym/ciemnym.
 *
 * Query: `?creator=pole|oze|transformator|kompensator|magistrala|odbior|zrodlo|arcflash&theme=light|dark`.
 * Sceny dowodowe OZE (karta V-A): `?creator=lom|frt|oltc|macierz` — ekrany z pełnym
 * wywodem akademickim (WHITE BOX/KaTeX) na realnych komponentach.
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
import { EkranFrt, EkranKompensacji, EkranLom, MacierzNcRfg } from './ui2/oze';
import { EkranBadanOltc } from './ui2/wyniki/oltc';
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
        // Pelny bilans IEC 60909 (ZWARCIA-PRO F1) — pola 1:1 z build_short_circuit_results.
        { target_id: 'SZ-GPZ', element_id: 'SZ-GPZ', target_name: 'Szyna GPZ 15 kV', ikss_ka: 12.48, ip_ka: 31.2, ith_ka: 12.9, sk_mva: 324.2, fault_type: '3F', flags: [], rk_ohm: 0.0821, xk_ohm: 0.7734, zk_ohm: 0.7777, rx_ratio: 0.1062, xr_ratio: 9.4162, kappa: 1.7284, c_factor: 1.1, un_kv: 15.0, tk_s: 1.0, tb_s: 0.1, ib_ka: 12.31, ik_ka: 12.48, ik_thevenin_ka: 12.1, ik_inverters_ka: 0.38, i2t_ka2s: 166.41 },
        { target_id: 'SZ-ST7', element_id: 'SZ-ST7', target_name: 'Szyna ST-7', ikss_ka: 6.05, ip_ka: 13.9, ith_ka: 6.2, sk_mva: 157.2, fault_type: '3F', flags: [], rk_ohm: 0.3105, xk_ohm: 1.5721, zk_ohm: 1.6025, rx_ratio: 0.1975, xr_ratio: 5.0633, kappa: 1.5602, c_factor: 1.1, un_kv: 15.0, tk_s: 1.0, tb_s: 0.1, ib_ka: 6.01, ik_ka: 6.05, ik_thevenin_ka: 5.9, ik_inverters_ka: 0.15, i2t_ka2s: 38.44 },
        { target_id: 'SZ-PV2', element_id: 'SZ-PV2', target_name: 'Szyna PV-2', ikss_ka: 7.31, ip_ka: 17.4, ith_ka: 7.5, sk_mva: 189.9, fault_type: '3F', flags: [], rk_ohm: 0.221, xk_ohm: 1.3067, zk_ohm: 1.3253, rx_ratio: 0.1691, xr_ratio: 5.9136, kappa: 1.6014, c_factor: 1.1, un_kv: 15.0, tk_s: 1.0, tb_s: 0.1, ib_ka: 7.24, ik_ka: 7.31, ik_thevenin_ka: 7.05, ik_inverters_ka: 0.26, i2t_ka2s: 56.25 },
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
  else if (creator === 'lom') node = <EkranLom trybZaawansowania="expert" />;
  else if (creator === 'frt') node = <EkranFrt trybZaawansowania="expert" />;
  else if (creator === 'oltc') node = <EkranBadanOltc />;
  else if (creator === 'macierz') node = <MacierzNcRfg trybZaawansowania="expert" />;
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
