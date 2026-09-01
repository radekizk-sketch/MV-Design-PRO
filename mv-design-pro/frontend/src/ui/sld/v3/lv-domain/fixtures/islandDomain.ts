/**
 * Fixtura ENERGIZACJI I WYSP domeny nN — dowód, że projekcja pokazuje STAN
 * ZASILANIA, a nie tylko topologię (kontrakt: `LvDomainBus.energized/
 * supply_refs/der_only` + `LvDomainGraphView.islands`).
 *
 * Kształt celowo dobrany tak, żeby wystąpiły OBA stany brzegowe naraz —
 * jedna fixtura na jeden fakt byłaby dowodem wybiórczym (reguła KLASA):
 *  - DWA transformatory (TA/TB) z JAWNYMI incomerami i sprzęgłem sekcji
 *    QBC w stanie OTWARTYM (dwa niezależne obszary zasilania);
 *  - podrozdzielnica „C" odcięta OTWARTYM łącznikiem odpływu QF-B1 —
 *    szyna BEZ NAPIĘCIA razem ze swoim odbiorem;
 *  - podrozdzielnica „D" odcięta OTWARTYM odłącznikiem QS-D, ale z własnym
 *    źródłem PV — WYSPA zasilana wyłącznie z DER (stan groźny ruchowo:
 *    „odcięte" nie znaczy „bezpieczne");
 *  - sekcja A z normalnym odpływem w pełnym torze (aparat → zacisk → kabel →
 *    odbiór), żeby stany brzegowe miały tło porównawcze.
 *
 * SPÓJNOŚĆ DANYCH (pin w `__tests__/energizacjaWyspy.test.ts`): pola na
 * szynach i wyspy opisują TEN SAM fakt, a podział na wyspy pokrywa się z
 * podziałem na komponenty elektryczne policzone z grafu
 * (`computeElectricalComponents`) — fixtura, w której te trzy źródła by się
 * rozjechały, dowodziłaby czegoś, czego w sieci nie ma.
 */
import type { LvDomainGraphView, UpstreamEquivalentSnapshot } from '../types';
import { buildLvDomainProjectionFixture } from './projectionFixture';

export const ISLAND_DOMAIN_REFS = {
  stationRef: 'stnW',
  taTerminalBusRef: 'stnW/TA_zacisk',
  tbTerminalBusRef: 'stnW/TB_zacisk',
  sekcjaABusRef: 'stnW/RGNN-A',
  sekcjaBBusRef: 'stnW/RGNN-B',
  qfTaRef: 'stnW/QF-TA',
  qfTbRef: 'stnW/QF-TB',
  couplerRef: 'stnW/QBC',
  qfA1Ref: 'stnW/QF-A1',
  qfA1OutBusRef: 'stnW/QF-A1_zacisk',
  kabelA1Ref: 'stnW/kabel_QF-A1',
  odbiorABusRef: 'stnW/odbior_A_zacisk',
  qfB1Ref: 'stnW/QF-B1',
  podrozdzielniaCBusRef: 'stnW/RGN-C',
  qsDRef: 'stnW/QS-D',
  podrozdzielniaDBusRef: 'stnW/RGN-D',
  pvDRef: 'stnW/PV-D',
  trARef: 'stnW/TA',
  trBRef: 'stnW/TB',
} as const;

const refs = ISLAND_DOMAIN_REFS;

export const ISLAND_DOMAIN_VIEW: LvDomainGraphView = {
  status: 'OK',
  station_ref: refs.stationRef,
  station_name: 'Stacja WYSPA',
  root_bus_refs: [refs.sekcjaABusRef, refs.sekcjaBBusRef],
  buses: [
    {
      ref_id: refs.taTerminalBusRef,
      name: 'TA zacisk nN',
      voltage_kv: 0.4,
      voltage_level_id: 'kv:0.4',
      hops_from_root: 0,
      energized: true,
      supply_refs: [refs.trARef],
      der_only: false,
    },
    {
      ref_id: refs.sekcjaABusRef,
      name: 'RGnN-A',
      voltage_kv: 0.4,
      voltage_level_id: 'kv:0.4',
      hops_from_root: 0,
      energized: true,
      supply_refs: [refs.trARef],
      der_only: false,
    },
    {
      ref_id: refs.tbTerminalBusRef,
      name: 'TB zacisk nN',
      voltage_kv: 0.4,
      voltage_level_id: 'kv:0.4',
      hops_from_root: 0,
      energized: true,
      supply_refs: [refs.trBRef],
      der_only: false,
    },
    {
      ref_id: refs.sekcjaBBusRef,
      name: 'RGnN-B',
      voltage_kv: 0.4,
      voltage_level_id: 'kv:0.4',
      hops_from_root: 0,
      energized: true,
      supply_refs: [refs.trBRef],
      der_only: false,
    },
    {
      ref_id: refs.qfA1OutBusRef,
      name: 'QF-A1 zacisk wyjściowy',
      voltage_kv: 0.4,
      voltage_level_id: 'kv:0.4',
      hops_from_root: 1,
      energized: true,
      supply_refs: [refs.trARef],
      der_only: false,
    },
    {
      ref_id: refs.odbiorABusRef,
      name: 'Zacisk odbioru A',
      voltage_kv: 0.4,
      voltage_level_id: 'kv:0.4',
      hops_from_root: 2,
      energized: true,
      supply_refs: [refs.trARef],
      der_only: false,
    },
    {
      ref_id: refs.podrozdzielniaCBusRef,
      name: 'Podrozdzielnica C',
      voltage_kv: 0.4,
      voltage_level_id: 'kv:0.4',
      hops_from_root: 1,
      energized: false,
      supply_refs: [],
      der_only: false,
    },
    {
      ref_id: refs.podrozdzielniaDBusRef,
      name: 'Podrozdzielnica D',
      voltage_kv: 0.4,
      voltage_level_id: 'kv:0.4',
      hops_from_root: 1,
      energized: true,
      supply_refs: [refs.pvDRef],
      der_only: true,
    },
  ],
  branches: [
    {
      ref_id: refs.qfTaRef,
      name: 'QF-TA',
      type: 'breaker',
      from_bus_ref: refs.taTerminalBusRef,
      to_bus_ref: refs.sekcjaABusRef,
      status: 'closed',
      catalog_ref: 'APARAT_NN/WYLACZNIK_GLOWNY_1000A',
    },
    {
      ref_id: refs.qfTbRef,
      name: 'QF-TB',
      type: 'breaker',
      from_bus_ref: refs.tbTerminalBusRef,
      to_bus_ref: refs.sekcjaBBusRef,
      status: 'closed',
      catalog_ref: 'APARAT_NN/WYLACZNIK_GLOWNY_1000A',
    },
    {
      ref_id: refs.couplerRef,
      name: 'QBC',
      type: 'bus_coupler',
      from_bus_ref: refs.sekcjaABusRef,
      to_bus_ref: refs.sekcjaBBusRef,
      status: 'open',
      catalog_ref: 'APARAT_NN/SPRZEGLO_800A',
    },
    {
      ref_id: refs.qfA1Ref,
      name: 'QF-A1',
      type: 'switch',
      from_bus_ref: refs.sekcjaABusRef,
      to_bus_ref: refs.qfA1OutBusRef,
      status: 'closed',
      catalog_ref: 'APARAT_NN_MCB/C40',
    },
    {
      ref_id: refs.kabelA1Ref,
      name: 'Kabel odpływu QF-A1',
      type: 'cable',
      from_bus_ref: refs.qfA1OutBusRef,
      to_bus_ref: refs.odbiorABusRef,
      status: 'closed',
      catalog_ref: 'KABEL_NN/YKY_4x35',
    },
    {
      ref_id: refs.qfB1Ref,
      name: 'QF-B1',
      type: 'switch',
      from_bus_ref: refs.sekcjaBBusRef,
      to_bus_ref: refs.podrozdzielniaCBusRef,
      status: 'open',
      catalog_ref: 'APARAT_NN_MCB/C63',
    },
    {
      ref_id: refs.qsDRef,
      name: 'QS-D',
      type: 'disconnector',
      from_bus_ref: refs.sekcjaABusRef,
      to_bus_ref: refs.podrozdzielniaDBusRef,
      status: 'open',
      catalog_ref: 'APARAT_NN/ODLACZNIK_250A',
    },
  ],
  transformers: [
    {
      ref_id: refs.trARef,
      name: 'TA',
      hv_bus_ref: 'stnW/sn_bus',
      lv_bus_ref: refs.taTerminalBusRef,
      sn_mva: 0.4,
      uhv_kv: 15,
      ulv_kv: 0.4,
      uk_percent: 4,
      vector_group: 'Dyn5',
    },
    {
      ref_id: refs.trBRef,
      name: 'TB',
      hv_bus_ref: 'stnW/sn_bus',
      lv_bus_ref: refs.tbTerminalBusRef,
      sn_mva: 0.4,
      uhv_kv: 15,
      ulv_kv: 0.4,
      uk_percent: 4,
      vector_group: 'Dyn5',
    },
  ],
  generators: [
    {
      ref_id: refs.pvDRef,
      name: 'PV-D',
      bus_ref: refs.podrozdzielniaDBusRef,
      p_mw: 0.03,
      gen_type: 'pv_inverter',
      connection_variant: 'nn_side',
    },
  ],
  loads: [
    { ref_id: 'stnW/odbior_A', name: 'Odbiór A', bus_ref: refs.odbiorABusRef, p_mw: 0.02, q_mvar: 0.004 },
    { ref_id: 'stnW/odbior_C', name: 'Odbiór C', bus_ref: refs.podrozdzielniaCBusRef, p_mw: 0.01, q_mvar: 0.002 },
    { ref_id: 'stnW/odbior_D', name: 'Odbiór D', bus_ref: refs.podrozdzielniaDBusRef, p_mw: 0.008, q_mvar: 0.0015 },
  ],
  sub_switchboards: [
    { ref_id: 'stnW/RGN-C_station', name: 'Podrozdzielnica C', bus_refs: [refs.podrozdzielniaCBusRef], hops_from_root: 1 },
    { ref_id: 'stnW/RGN-D_station', name: 'Podrozdzielnica D', bus_refs: [refs.podrozdzielniaDBusRef], hops_from_root: 1 },
  ],
  boundary_links: [],
  islands: [
    {
      island_ref: 'stnW/wyspa_A',
      bus_refs: [refs.taTerminalBusRef, refs.sekcjaABusRef, refs.qfA1OutBusRef, refs.odbiorABusRef],
      energized: true,
      supply_refs: [refs.trARef],
      der_only: false,
    },
    {
      island_ref: 'stnW/wyspa_B',
      bus_refs: [refs.tbTerminalBusRef, refs.sekcjaBBusRef],
      energized: true,
      supply_refs: [refs.trBRef],
      der_only: false,
    },
    {
      island_ref: 'stnW/wyspa_C',
      bus_refs: [refs.podrozdzielniaCBusRef],
      energized: false,
      supply_refs: [],
      der_only: false,
    },
    {
      island_ref: 'stnW/wyspa_D',
      bus_refs: [refs.podrozdzielniaDBusRef],
      energized: true,
      supply_refs: [refs.pvDRef],
      der_only: true,
    },
  ],
  missing_data: [],
};

export const ISLAND_DOMAIN_UPSTREAM_EQUIVALENTS: readonly UpstreamEquivalentSnapshot[] = [
  {
    status: 'OK',
    case_id: 'harness-case',
    station_ref: refs.stationRef,
    station_name: 'Stacja WYSPA',
    transformer_ref: refs.trARef,
    source_node_id: 'stnW/sn_bus',
    voltage_level_id: 'kv:15',
    voltage_kv: 15,
    uth_kv: 16.5,
    sk_mva: 121.5,
    ikss_ka: 4.68,
    z1_ohm: { r: 0.66, x: 1.64 },
    z0_ohm: { r: 0.81, x: 3.9 },
    rx_ratio: 0.402,
    c_factor: 1.1,
    scenario_id: 'MAX',
    operating_state_id: 'demo-operating-state-ta',
    calculation_run_id: 'demo-run-ta',
    model_revision: 1,
    model_hash: 'demo-hash-wyspa',
    missing_data: [],
  },
  {
    status: 'OK',
    case_id: 'harness-case',
    station_ref: refs.stationRef,
    station_name: 'Stacja WYSPA',
    transformer_ref: refs.trBRef,
    source_node_id: 'stnW/sn_bus',
    voltage_level_id: 'kv:15',
    voltage_kv: 15,
    uth_kv: 16.5,
    sk_mva: 121.5,
    ikss_ka: 4.68,
    z1_ohm: { r: 0.66, x: 1.64 },
    z0_ohm: { r: 0.81, x: 3.9 },
    rx_ratio: 0.402,
    c_factor: 1.1,
    scenario_id: 'MAX',
    operating_state_id: 'demo-operating-state-tb',
    calculation_run_id: 'demo-run-tb',
    model_revision: 1,
    model_hash: 'demo-hash-wyspa',
    missing_data: [],
  },
];

export const ISLAND_DOMAIN_PROJECTION = buildLvDomainProjectionFixture({
  graph: ISLAND_DOMAIN_VIEW,
  upstreamEquivalents: ISLAND_DOMAIN_UPSTREAM_EQUIVALENTS,
});
