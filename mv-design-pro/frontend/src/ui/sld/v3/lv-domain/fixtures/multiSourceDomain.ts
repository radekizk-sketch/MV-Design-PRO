/**
 * Fixtura domeny nN wieloźródłowej (karta T5b, §0 rozstrzygnięcie 4 — test
 * wieloźródłowości OBOWIĄZKOWY): 2×TR + sprzęgło sekcji + PV, podrozdzielnica
 * (wchłonięta) i boundary_link do OBCEJ stacji. Kształt IDENTYCZNY z fixturą
 * backendu (`tests/application/analyses/lv_domain/test_graph_view.py::
 * _multi_source_with_boundary_fixture`) — te same refy, ta sama topologia —
 * żeby dowód wieloźródłowości był SPÓJNY między warstwami (dwa niezależne
 * dowody tej samej topologii, nie dwie różne fikstury udające to samo).
 */
import type { LvDomainGraphView, UpstreamEquivalentSnapshot } from '../types';

export const MULTI_SOURCE_DOMAIN_VIEW: LvDomainGraphView = {
  status: 'OK',
  station_ref: 'root',
  station_name: 'Stacja ROOT',
  root_bus_refs: ['nn_a', 'nn_b'],
  buses: [
    { ref_id: 'nn_a', name: 'RGnN-A', voltage_kv: 0.4, voltage_level_id: 'kv:0.4', hops_from_root: 0 },
    { ref_id: 'nn_b', name: 'RGnN-B', voltage_kv: 0.4, voltage_level_id: 'kv:0.4', hops_from_root: 0 },
    { ref_id: 'sub_bus', name: 'Podrozdzielnica', voltage_kv: 0.4, voltage_level_id: 'kv:0.4', hops_from_root: 1 },
  ],
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
    {
      ref_id: 'tie_to_other',
      name: 'tie_to_other',
      type: 'disconnector',
      from_bus_ref: 'nn_b',
      to_bus_ref: 'nn_other',
      status: 'open',
    },
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
