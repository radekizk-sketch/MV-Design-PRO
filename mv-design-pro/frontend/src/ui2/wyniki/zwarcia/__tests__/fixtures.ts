/*
 * Fixture 1:1 realnego kształtu wyniku zwarciowego (karta E8.2 §3): `ShortCircuitRow`
 * z `ui/results-inspector/types.ts:157-167` — WSZYSTKIE pola kontraktu obecne
 * (target_id, element_id?, target_name, ikss_ka, ip_ka, ith_ka, sk_mva, fault_type,
 * flags), w tym wartości `null` i `flags` niepuste. Tabela = `ShortCircuitResults`
 * (`types.ts:172-176`). Wartości `fault_type` zgodne z backendem
 * (`enm/canonical_analysis.py:1664` → short_circuit_type: „3F"/„2F"/„1F").
 */

import type {
  ShortCircuitBranchFlow,
  ShortCircuitResults,
  ShortCircuitRow,
} from '../../../../ui/results-inspector/types';
import type { WkladZwarciowy } from '../zwarciaModel';

export function shortCircuitRowFixture(over: Partial<ShortCircuitRow> = {}): ShortCircuitRow {
  return {
    target_id: 'BUS-GPZ',
    element_id: 'EL-GPZ',
    target_name: 'Szyna GPZ 15 kV',
    ikss_ka: 12.345,
    ip_ka: 31.2,
    ith_ka: 12.5,
    sk_mva: 320.75,
    fault_type: '3F',
    flags: [],
    // Pelny bilans IEC 60909 (ZWARCIA-PRO F1) — ksztalt 1:1 z
    // `build_short_circuit_results` (pola addytywne z FROZEN solvera).
    rk_ohm: 0.0821,
    xk_ohm: 0.7734,
    zk_ohm: 0.7777,
    rx_ratio: 0.1062,
    xr_ratio: 9.4162,
    kappa: 1.7284,
    c_factor: 1.1,
    un_kv: 15.0,
    tk_s: 1.0,
    tb_s: 0.1,
    ib_ka: 12.345,
    ik_ka: 12.345,
    ik_thevenin_ka: 12.1,
    ik_inverters_ka: 0.245,
    i2t_ka2s: 156.25,
    // Rozpływ gałęziowy (karta W-C, F4): domyślnie policzono, brak wkładów
    // falownikowych (pusta lista); wpisy dodaje `rozplywFixture` per test.
    branch_contributions: [],
    ...over,
  };
}

/**
 * Wpisy rozpływu gałęziowego (karta W-C) — kształt 1:1 z projekcji
 * `_sc_rozplyw_galeziowy` (`enm/canonical_analysis.py`): per (źródło, gałąź),
 * A→kA w backendzie, kierunek z solvera.
 */
export function rozplywFixture(): ShortCircuitBranchFlow[] {
  return [
    {
      branch_id: 'BR-KABEL-1',
      branch_name: 'Kabel OZE',
      source_id: 'GEN-PV',
      from_node_id: 'BUS-GPZ',
      from_node_name: 'Szyna GPZ 15 kV',
      to_node_id: 'BUS-OZE',
      to_node_name: 'Szyna OZE',
      i_ka: 0.245,
      direction: 'to_from',
    },
    {
      branch_id: 'BR-LINIA-2',
      branch_name: 'Linia ST1',
      source_id: 'GEN-PV',
      from_node_id: 'BUS-ST1',
      from_node_name: 'Szyna ST1 15 kV',
      to_node_id: 'BUS-GPZ',
      to_node_name: 'Szyna GPZ 15 kV',
      i_ka: 0.061,
      direction: 'from_to',
    },
  ];
}

/**
 * Ślad WHITE BOX podziału prądu zwarciowego Thevenina (TH-1, karta WB-ROZPLYW)
 * — skopiowany BAJT-W-BAJT z `test_branch_flow_trace_is_whitebox`
 * (`backend/tests/test_short_circuit_iec60909.py`), wyprowadzony na
 * `build_slack_radial_graph()` solvera (transformator T1 A→B, linia L1 B→C,
 * zwarcie 3F w C). Kształt REALNY solvera (`WhiteBoxTracer.add`, patrz
 * `dowod/dowodModel.ts` nagłówek): `inputs`/`result` niosą skalar/liczbę
 * zespoloną `{re,im}` WPROST, nie opakowany `TraceValue` — celowo BEZ adnotacji
 * `: TraceStep[]` (żeby nie wymuszać rzutowania na inny kształt niż realny).
 */
export function branchFlowTraceFixture() {
  return [
    {
      key: 'thevenin_flow_setup',
      title: 'Podział prądu Thevenina — iniekcja jednostkowa w węźle zwarcia',
      formula_latex:
        '\\underline{V} = \\underline{Z}_{bus} \\cdot \\underline{i}_{inj},\\quad \\underline{i}_{inj,k} = -1',
      inputs: {
        fault_node_id: 'C',
        fault_index: 2,
        ik_thevenin_a: 5611.281490619905,
        n_nodes: 3,
      },
      substitution: 'i_inj[2] = -1 (pu); V = Z_bus @ i_inj',
      substitution_latex: '\\underline{i}_{inj,2} = -1',
      result: {
        v_nodes_pu: [
          { re: -0.000001, im: 6.358554899650295e-23 },
          { re: -0.01893053694727093, im: -0.3939107821975983 },
          { re: -0.14393053694727095, im: -0.49391078219759826 },
        ],
      },
      notes:
        'Napięcia węzłowe ze zwarcia z macierzy Z-bus sieci zgodnej (build_zbus, ta sama macierz co tor superpozycji falownikowej).',
    },
    {
      key: 'thevenin_flow_T1',
      title: 'Prąd zwarciowy Thevenina w gałęzi T1',
      formula_latex:
        "I_{ga\\l} = \\left| (\\underline{V}_i - \\underline{V}_j)\\,\\underline{y}_{ij} \\right| \\cdot I_k''^{(Th)}",
      inputs: {
        branch_id: 'T1',
        from_node_id: 'A',
        to_node_id: 'B',
        v_from_pu: { re: -0.000001, im: 6.358554899650295e-23 },
        v_to_pu: { re: -0.01893053694727093, im: -0.3939107821975983 },
        y_series_pu: { re: 0.12171454623628124, im: -2.5327968796231715 },
        ik_thevenin_a: 5611.281490619905,
      },
      substitution:
        '|(-1e-06+j6.35855e-23 - -0.0189305-j0.393911) * 0.121715-j2.5328| * 5611.28',
      substitution_latex:
        '\\left| \\left(\\left(-1e-06 + j 6.35855e-23\\right) - \\left(-0.0189305 - j 0.393911\\right)\\right) \\cdot \\left(0.121715 - j 2.5328\\right)\\right| \\cdot 5611.28',
      result: {
        fraction: 0.9999999999999997,
        i_contrib_a: 5611.281490619903,
        direction: 'from_to',
      },
      notes: null,
    },
    {
      key: 'thevenin_flow_L1',
      title: 'Prąd zwarciowy Thevenina w gałęzi L1',
      formula_latex:
        "I_{ga\\l} = \\left| (\\underline{V}_i - \\underline{V}_j)\\,\\underline{y}_{ij} \\right| \\cdot I_k''^{(Th)}",
      inputs: {
        branch_id: 'L1',
        from_node_id: 'B',
        to_node_id: 'C',
        v_from_pu: { re: -0.01893053694727093, im: -0.3939107821975983 },
        v_to_pu: { re: -0.14393053694727095, im: -0.49391078219759826 },
        y_series_pu: { re: 4.878048780487805, im: -3.902439024390244 },
        ik_thevenin_a: 5611.281490619905,
      },
      substitution:
        '|(-0.0189305-j0.393911 - -0.143931-j0.493911) * 4.87805-j3.90244| * 5611.28',
      substitution_latex:
        '\\left| \\left(\\left(-0.0189305 - j 0.393911\\right) - \\left(-0.143931 - j 0.493911\\right)\\right) \\cdot \\left(4.87805 - j 3.90244\\right)\\right| \\cdot 5611.28',
      result: {
        fraction: 1.0,
        i_contrib_a: 5611.281490619905,
        direction: 'from_to',
      },
      notes: null,
    },
    {
      key: 'thevenin_flow_balance',
      title: 'Suma kontrolna bilansu prądu w węźle zwarcia (KCL)',
      formula_latex: '\\sum_{ga\\l \\to k} I_{ga\\l} = I_k\'\'^{(Th)}',
      inputs: {
        fault_node_id: 'C',
        ik_thevenin_a: 5611.281490619905,
      },
      substitution: 'Σ = 5611.28 ≈ 5611.28',
      substitution_latex: '\\sum = 5611.28 \\approx 5611.28',
      result: {
        sum_into_fault_a: 5611.281490619905,
        fraction_sum: 1.0,
      },
      notes:
        'KCL: suma modułów współczynników gałęzi wchodzących do węzła zwarcia = 1, więc Σ prądów gałęziowych = Ik\'\'(Thevenin).',
    },
  ];
}

export function shortCircuitResultsFixture(
  over: Partial<ShortCircuitResults> = {},
): ShortCircuitResults {
  return {
    run_id: 'sc-run-1',
    rows: [
      shortCircuitRowFixture(),
      shortCircuitRowFixture({
        target_id: 'BUS-ST1',
        element_id: 'EL-ST1',
        target_name: 'Szyna ST1 15 kV',
        ikss_ka: 8.4,
        ip_ka: 21.0,
        ith_ka: 8.5,
        sk_mva: 218.1,
        fault_type: '1F',
        flags: ['SYNTHETIC'],
      }),
      shortCircuitRowFixture({
        target_id: 'BUS-ST2',
        element_id: undefined,
        target_name: null,
        ikss_ka: null,
        ip_ka: null,
        ith_ka: null,
        sk_mva: null,
        fault_type: null,
        flags: ['SLACK', 'NIEZNANA_FLAGA'],
        // Starszy wynik bez bilansu (kontrakt addytywny) — uczciwe kreski.
        rk_ohm: null,
        xk_ohm: null,
        zk_ohm: null,
        rx_ratio: null,
        xr_ratio: null,
        kappa: null,
        c_factor: null,
        un_kv: null,
        tk_s: null,
        tb_s: null,
        ib_ka: null,
        ik_ka: null,
        ik_thevenin_ka: null,
        ik_inverters_ka: null,
        i2t_ka2s: null,
        branch_contributions: null,
      }),
    ],
    ...over,
  };
}

/** Wkłady źródeł dla punktu (projekcja prezentacyjna — dane przez props). */
export function wkladyFixture(): WkladZwarciowy[] {
  return [
    { id: 'SRC-GRID', zrodlo: 'Sieć zasilająca 110 kV', pradKA: 9.0, dowodRef: 'SRC-GRID' },
    { id: 'SRC-INV', zrodlo: 'Falownik PV', pradKA: 3.0 },
  ];
}

/**
 * Wkłady ze szczegółem maszynowym (karta W-A F2) — kształt 1:1 z projekcji
 * `naWklady` odpowiedzi endpointu rozbicia maszynowego (machine_type, Ir,
 * Ik"/Ir, μ, q, Ib + wywód dyplomowy maszyny).
 */
export function wkladyZeSzczegolemFixture(): WkladZwarciowy[] {
  return [
    {
      id: 'GEN-1',
      zrodlo: 'Agregat biogazowni',
      pradKA: 1.234,
      szczegol: {
        typMaszyny: 'SYNCHRONOUS',
        irKA: 0.412,
        stosunekIkIr: 2.995,
        mu: 0.813,
        q: 1.0,
        ibKA: 1.003,
        wywod: [
          { tekst: 'Wzor pradu czesciowego maszyny', latex: "I''_{k,m} = \\frac{c \\cdot U_n}{\\sqrt{3} \\cdot Z''_m}" },
          { tekst: 'I_b = mu * q * Ik = 1,003 kA', latex: "I_b = \\mu \\cdot q \\cdot I''_k" },
        ],
      },
    },
    // Wkład bez szczegółu (starsza odpowiedź) — uczciwy stan po rozwinięciu.
    { id: 'SRC-GRID', zrodlo: 'Sieć zasilająca 110 kV', pradKA: 9.0 },
  ];
}
