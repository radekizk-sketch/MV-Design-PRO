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
