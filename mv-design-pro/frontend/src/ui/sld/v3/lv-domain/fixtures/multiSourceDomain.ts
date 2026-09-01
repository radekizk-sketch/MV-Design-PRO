/**
 * Fixtura domeny nN wieloźródłowej (karta T5b, §0 rozstrzygnięcie 4 — test
 * wieloźródłowości OBOWIĄZKOWY): 2×TR + sprzęgło sekcji + PV, podrozdzielnica
 * (wchłonięta) i boundary_link do OBCEJ stacji. Kształt IDENTYCZNY z fixturą
 * backendu (`tests/application/analyses/lv_domain/test_graph_view.py::
 * _multi_source_with_boundary_fixture`) — te same refy, ta sama topologia —
 * żeby dowód wieloźródłowości był SPÓJNY między warstwami (dwa niezależne
 * dowody tej samej topologii, nie dwie różne fikstury udające to samo).
 */
import type { LvDomainBus, LvDomainGraphView, LvDomainIsland, UpstreamEquivalentSnapshot } from '../types';
import { buildLvDomainProjectionFixture } from './projectionFixture';

/**
 * Energizacja i wyspy dla ZADANEGO stanu sprzęgła — kształt DOKŁADNIE taki,
 * jaki backend (`lv_domain/energization.py`) zwraca dla tej topologii:
 *  · sprzęgło ZAMKNIĘTE: obie sekcje w jednej składowej po zamkniętych
 *    gałęziach ⇒ `supply_refs` każdej sekcji = [tr1, tr2] (zasilanie
 *    wielostronne); jedna wyspa;
 *  · sprzęgło OTWARTE: sekcja A zasilana z tr1, sekcja B (i podrozdzielnica)
 *    z tr2; nadal JEDNA wyspa energetyczna (obie sekcje wiszą na tej samej
 *    sieci SN przez swoje transformatory — wyspa to składowa z
 *    transformatorami, nie sekcja rozdzielnicy).
 * Frontend tych faktów NIE liczy (zero BFS po stronie klienta) — fixtura
 * niesie prawdę backendu dla obu stanów, żeby testy sprzęgła miały dane.
 */
function multiSourceEnergization(coupler: 'open' | 'closed'): {
  readonly buses: readonly LvDomainBus[];
  readonly islands: readonly LvDomainIsland[];
} {
  const supplyA = coupler === 'closed' ? ['tr1', 'tr2'] : ['tr1'];
  const supplyB = coupler === 'closed' ? ['tr1', 'tr2'] : ['tr2'];
  return {
    buses: [
      { ref_id: 'nn_a', name: 'RGnN-A', voltage_kv: 0.4, voltage_level_id: 'kv:0.4', hops_from_root: 0, energized: true, supply_refs: supplyA, der_only: false },
      { ref_id: 'nn_b', name: 'RGnN-B', voltage_kv: 0.4, voltage_level_id: 'kv:0.4', hops_from_root: 0, energized: true, supply_refs: supplyB, der_only: false },
      { ref_id: 'sub_bus', name: 'Podrozdzielnica', voltage_kv: 0.4, voltage_level_id: 'kv:0.4', hops_from_root: 1, energized: true, supply_refs: supplyB, der_only: false },
    ],
    islands: [
      { island_ref: 'island-1', bus_refs: ['nn_a', 'nn_b', 'sub_bus'], energized: true, supply_refs: ['tr1', 'tr2'], der_only: false },
    ],
  };
}

export const MULTI_SOURCE_DOMAIN_VIEW: LvDomainGraphView = {
  status: 'OK',
  station_ref: 'root',
  station_name: 'Stacja ROOT',
  root_bus_refs: ['nn_a', 'nn_b'],
  buses: multiSourceEnergization('closed').buses,
  islands: multiSourceEnergization('closed').islands,
  branches: [
    {
      ref_id: 'coupler',
      name: 'coupler',
      type: 'bus_coupler',
      from_bus_ref: 'nn_a',
      to_bus_ref: 'nn_b',
      status: 'closed',
    },
    {
      ref_id: 'cable_sub',
      name: 'cable_sub',
      type: 'cable',
      from_bus_ref: 'nn_b',
      to_bus_ref: 'sub_bus',
      status: 'closed',
    },
    // `tie_to_other` NIE jest tu wpisany celowo (naprawiony rozjazd z
    // backendem, karta T5b-2 zero-debt): `build_lv_domain_view` (backend)
    // `continue`-uje PRZED dopisaniem gałęzi granicznej do `domain_branches`
    // (patrz `graph_view.py` — stacja docelowa ma WŁASNY transformator, więc
    // to `boundary_link`, nie zwykła gałąź domeny) — realna odpowiedź API
    // NIGDY nie niesie tej gałęzi w `branches`, WYŁĄCZNIE w `boundary_links`
    // (dowód: `backend/tests/application/analyses/lv_domain/test_graph_view.py`
    // `test_coupler_and_both_sections_in_domain` sprawdza `branch_refs`==
    // {"coupler"} bez `tie_to_other`). Poprzednia wersja tej fikstury
    // dublowała ją w OBU tablicach jednocześnie — myląco sugerowało, że L2
    // zawsze zna `type`/aparat gałęzi granicznej, czego realny kontrakt NIE
    // gwarantuje (`LvDomainBoundaryLink` nie niesie `type` — luka modelu,
    // patrz raport karty T5b-2 P0.6/P0.8). Kompozytor L2 renderuje boundary
    // honestly BEZ znanego aparatu w tym kształcie danych.
  ],
  transformers: [
    {
      ref_id: 'tr1',
      name: 'TR1',
      hv_bus_ref: 'sn',
      lv_bus_ref: 'nn_a',
      sn_mva: 0.63,
      uhv_kv: 15,
      ulv_kv: 0.4,
      uk_percent: 4,
      vector_group: 'Dyn11',
    },
    {
      ref_id: 'tr2',
      name: 'TR2',
      hv_bus_ref: 'sn',
      lv_bus_ref: 'nn_b',
      sn_mva: 0.63,
      uhv_kv: 15,
      ulv_kv: 0.4,
      uk_percent: 4,
      vector_group: 'Dyn11',
    },
  ],
  generators: [
    {
      ref_id: 'pv1',
      name: 'PV1',
      bus_ref: 'nn_a',
      p_mw: 0.1,
      gen_type: 'pv_inverter',
      connection_variant: 'nn_side',
    },
  ],
  loads: [
    { ref_id: 'load_a', name: 'Odbiór A', bus_ref: 'nn_a', p_mw: 0.05, q_mvar: 0.01 },
    { ref_id: 'load_sub', name: 'Odbiór podrozdzielnicy', bus_ref: 'sub_bus', p_mw: 0.02, q_mvar: 0.005 },
  ],
  sub_switchboards: [{ ref_id: 'sub_station', name: 'Podrozdzielnica', bus_refs: ['sub_bus'], hops_from_root: 1 }],
  boundary_links: [
    {
      branch_ref: 'tie_to_other',
      from_bus_ref: 'nn_b',
      to_bus_ref: 'nn_other',
      target_station_ref: 'other_station',
      target_station_name: 'Stacja OBCA',
    },
  ],
  missing_data: [],
};

/** Ta sama domena z zadanym stanem sprzęgła — status gałęzi ORAZ energizacja/
 *  wyspy zmieniają się RAZEM (jak w odpowiedzi backendu dla tego stanu). */
export function multiSourceDomainViewWithCoupler(status: 'open' | 'closed'): LvDomainGraphView {
  const energization = multiSourceEnergization(status);
  return {
    ...MULTI_SOURCE_DOMAIN_VIEW,
    buses: energization.buses,
    islands: energization.islands,
    branches: MULTI_SOURCE_DOMAIN_VIEW.branches.map((b) => (b.ref_id === 'coupler' ? { ...b, status } : b)),
  };
}

export const MULTI_SOURCE_UPSTREAM_EQUIVALENTS: readonly UpstreamEquivalentSnapshot[] = [
  {
    status: 'OK',
    case_id: 'harness-case',
    station_ref: 'root',
    station_name: 'Stacja ROOT',
    transformer_ref: 'tr1',
    source_node_id: 'sn',
    voltage_level_id: 'kv:15',
    voltage_kv: 15,
    uth_kv: 16.5,
    sk_mva: 187.4,
    ikss_ka: 7.21,
    z1_ohm: { r: 0.42, x: 1.18 },
    z0_ohm: { r: 0.55, x: 3.02 },
    rx_ratio: 0.356,
    c_factor: 1.1,
    scenario_id: 'MAX',
    operating_state_id: 'demo-operating-state-tr1',
    calculation_run_id: 'demo-run-tr1',
    model_revision: 1,
    model_hash: 'demo-hash',
    missing_data: [],
  },
  {
    status: 'OK',
    case_id: 'harness-case',
    station_ref: 'root',
    station_name: 'Stacja ROOT',
    transformer_ref: 'tr2',
    source_node_id: 'sn',
    voltage_level_id: 'kv:15',
    voltage_kv: 15,
    uth_kv: 16.5,
    sk_mva: 187.4,
    ikss_ka: 7.21,
    z1_ohm: { r: 0.42, x: 1.18 },
    z0_ohm: { r: 0.55, x: 3.02 },
    rx_ratio: 0.356,
    c_factor: 1.1,
    scenario_id: 'MAX',
    operating_state_id: 'demo-operating-state-tr2',
    calculation_run_id: 'demo-run-tr2',
    model_revision: 1,
    model_hash: 'demo-hash',
    missing_data: [],
  },
];

export const MULTI_SOURCE_PROJECTION = buildLvDomainProjectionFixture({
  graph: MULTI_SOURCE_DOMAIN_VIEW,
  upstreamEquivalents: MULTI_SOURCE_UPSTREAM_EQUIVALENTS,
});
