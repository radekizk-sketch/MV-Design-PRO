/**
 * Fixtura "Stacja C" (karta T5b-2, 18 P0) — jedno TR, incomer JAWNY (QF-TR1
 * między zaciskiem nN transformatora a RGNN-1), TRZY odpływy w pełnym torze
 * BUS→zabezpieczenie→kabel→cel (P0.5): QF-01→kabel→Odbiór-1 (liść), QF-02→
 * kabel→RGN-2 (podrozdzielnica z WŁASNYM odbiorem), QF-03→kabel→PV-terminal
 * (generator PV z WŁASNYM torem: zabezpieczenie+kabel do PCC-LV — P0.7,
 * dowód że kompozytor L2 renderuje PEŁNY tor DER, gdy model GO NIESIE —
 * kontrast z `multiSourceDomain.ts`, gdzie PV siedzi WPROST na sekcji, bez
 * toru, dokumentujący lukę modelu dzisiejszego `add_converter_source`).
 *
 * Kształt wzorowany na `electrical/__tests__/fixtures/stacjaB.ts` (T0/T1,
 * ENM pełne) — TU jako `LvDomainGraphView` bezpośrednio (kształt L2, REST),
 * te same refy/nazwy aparatów dla spójności międzywarstwowej.
 */
import type { LvDomainGraphView, UpstreamEquivalentSnapshot } from '../types';

export const STATION_BOARD_REFS = {
  stationRef: 'stnC',
  lvTerminalBusRef: 'stnC/nn_lv_terminal',
  rgnn1BusRef: 'stnC/RGNN-1',
  qfTr1Ref: 'stnC/QF-TR1',
  qf01Ref: 'stnC/QF-01',
  qf01OutBusRef: 'stnC/QF-01_out',
  odbior1BusRef: 'stnC/odbior1',
  cableQf01Ref: 'stnC/kabel_QF-01',
  qf02Ref: 'stnC/QF-02',
  qf02OutBusRef: 'stnC/QF-02_out',
  rgn2BusRef: 'stnC/RGN-2',
  cableQf02Ref: 'stnC/kabel_QF-02',
  rgn2LoadBusRef: 'stnC/RGN-2_odbior',
  qf03Ref: 'stnC/QF-03',
  qf03OutBusRef: 'stnC/QF-03_out',
  cableQf03Ref: 'stnC/kabel_QF-03',
  pvTerminalBusRef: 'stnC/PV1_pcc',
  pvGeneratorRef: 'stnC/PV1',
} as const;

export const STATION_BOARD_DOMAIN_VIEW: LvDomainGraphView = {
  status: 'OK',
  station_ref: STATION_BOARD_REFS.stationRef,
  station_name: 'Stacja C',
  root_bus_refs: [STATION_BOARD_REFS.lvTerminalBusRef, STATION_BOARD_REFS.rgnn1BusRef],
  buses: [
    { ref_id: STATION_BOARD_REFS.lvTerminalBusRef, name: 'T1 zacisk nN', voltage_kv: 0.4, voltage_level_id: 'kv:0.4', hops_from_root: 0 },
    { ref_id: STATION_BOARD_REFS.rgnn1BusRef, name: 'RGNN-1 (rozdzielnica nN 0,4 kV)', voltage_kv: 0.4, voltage_level_id: 'kv:0.4', hops_from_root: 0 },
    { ref_id: STATION_BOARD_REFS.qf01OutBusRef, name: 'QF-01 zacisk wyjściowy', voltage_kv: 0.4, voltage_level_id: 'kv:0.4', hops_from_root: 1 },
    { ref_id: STATION_BOARD_REFS.odbior1BusRef, name: 'Zacisk Odbiór-1', voltage_kv: 0.4, voltage_level_id: 'kv:0.4', hops_from_root: 2 },
    { ref_id: STATION_BOARD_REFS.qf02OutBusRef, name: 'QF-02 zacisk wyjściowy', voltage_kv: 0.4, voltage_level_id: 'kv:0.4', hops_from_root: 1 },
    { ref_id: STATION_BOARD_REFS.rgn2BusRef, name: 'Szyna RGN-2', voltage_kv: 0.4, voltage_level_id: 'kv:0.4', hops_from_root: 2 },
    { ref_id: STATION_BOARD_REFS.rgn2LoadBusRef, name: 'RGN-2 zacisk odbioru', voltage_kv: 0.4, voltage_level_id: 'kv:0.4', hops_from_root: 3 },
    { ref_id: STATION_BOARD_REFS.qf03OutBusRef, name: 'QF-03 zacisk wyjściowy', voltage_kv: 0.4, voltage_level_id: 'kv:0.4', hops_from_root: 1 },
    { ref_id: STATION_BOARD_REFS.pvTerminalBusRef, name: 'PV1 · zacisk PCC-LV', voltage_kv: 0.4, voltage_level_id: 'kv:0.4', hops_from_root: 2 },
  ],
  branches: [
    {
      ref_id: STATION_BOARD_REFS.qfTr1Ref,
      name: 'QF-TR1 (wyłącznik główny nN)',
      type: 'breaker',
      from_bus_ref: STATION_BOARD_REFS.lvTerminalBusRef,
      to_bus_ref: STATION_BOARD_REFS.rgnn1BusRef,
      status: 'closed',
      catalog_ref: 'APARAT_NN/WYLACZNIK_GLOWNY_1000A',
    },
    {
      ref_id: STATION_BOARD_REFS.qf01Ref,
      name: 'QF-01',
      type: 'switch',
      from_bus_ref: STATION_BOARD_REFS.rgnn1BusRef,
      to_bus_ref: STATION_BOARD_REFS.qf01OutBusRef,
      status: 'closed',
      catalog_ref: 'APARAT_NN_MCB/B25',
    },
    {
      ref_id: STATION_BOARD_REFS.cableQf01Ref,
      name: 'Kabel odpływu QF-01',
      type: 'cable',
      from_bus_ref: STATION_BOARD_REFS.qf01OutBusRef,
      to_bus_ref: STATION_BOARD_REFS.odbior1BusRef,
      status: 'closed',
      catalog_ref: 'KABEL_NN/YKY_4x25',
    },
    {
      ref_id: STATION_BOARD_REFS.qf02Ref,
      name: 'QF-02',
      type: 'switch',
      from_bus_ref: STATION_BOARD_REFS.rgnn1BusRef,
      to_bus_ref: STATION_BOARD_REFS.qf02OutBusRef,
      status: 'closed',
      catalog_ref: 'APARAT_NN_MCB/C40',
    },
    {
      ref_id: STATION_BOARD_REFS.cableQf02Ref,
      name: 'Kabel odpływu QF-02',
      type: 'cable',
      from_bus_ref: STATION_BOARD_REFS.qf02OutBusRef,
      to_bus_ref: STATION_BOARD_REFS.rgn2BusRef,
      status: 'closed',
      catalog_ref: 'KABEL_NN/YKY_4x50',
    },
    {
      ref_id: 'stnC/QF-RGN2-01',
      name: 'QF-RGN2-01',
      type: 'fuse',
      from_bus_ref: STATION_BOARD_REFS.rgn2BusRef,
      to_bus_ref: STATION_BOARD_REFS.rgn2LoadBusRef,
      status: 'closed',
      catalog_ref: 'WKLADKA_NN/gG_20',
    },
    {
      ref_id: STATION_BOARD_REFS.qf03Ref,
      name: 'QF-03 (pole PV)',
      type: 'switch',
      from_bus_ref: STATION_BOARD_REFS.rgnn1BusRef,
      to_bus_ref: STATION_BOARD_REFS.qf03OutBusRef,
      status: 'closed',
      catalog_ref: 'APARAT_NN_MCB/C32',
    },
    {
      ref_id: STATION_BOARD_REFS.cableQf03Ref,
      name: 'Kabel pola PV',
      type: 'cable',
      from_bus_ref: STATION_BOARD_REFS.qf03OutBusRef,
      to_bus_ref: STATION_BOARD_REFS.pvTerminalBusRef,
      status: 'closed',
      catalog_ref: 'KABEL_NN/YKY_4x16',
    },
  ],
  transformers: [
    {
      ref_id: 'stnC/T1',
      name: 'T1',
      hv_bus_ref: 'stnC/sn_bus',
      lv_bus_ref: STATION_BOARD_REFS.lvTerminalBusRef,
      sn_mva: 0.63,
      uhv_kv: 15,
      ulv_kv: 0.4,
      uk_percent: 4,
      vector_group: 'Dyn5',
    },
  ],
  generators: [
    {
      ref_id: STATION_BOARD_REFS.pvGeneratorRef,
      name: 'PV1',
      bus_ref: STATION_BOARD_REFS.pvTerminalBusRef,
      p_mw: 0.08,
      gen_type: 'pv_inverter',
      connection_variant: 'nn_side',
    },
  ],
  loads: [
    { ref_id: 'stnC/odbior1_load', name: 'Odbiór-1', bus_ref: STATION_BOARD_REFS.odbior1BusRef, p_mw: 0.012, q_mvar: 0.0018 },
    { ref_id: 'stnC/rgn2_load', name: 'Odbiór RGN-2', bus_ref: STATION_BOARD_REFS.rgn2LoadBusRef, p_mw: 0.006, q_mvar: 0.0009 },
  ],
  sub_switchboards: [
    { ref_id: 'stnC/RGN-2_station', name: 'RGN-2 (podrozdzielnica)', bus_refs: [STATION_BOARD_REFS.rgn2BusRef], hops_from_root: 2 },
  ],
  boundary_links: [],
  missing_data: [],
};

export const STATION_BOARD_UPSTREAM_EQUIVALENTS: readonly UpstreamEquivalentSnapshot[] = [
  {
    status: 'OK',
    case_id: 'harness-case',
    station_ref: STATION_BOARD_REFS.stationRef,
    station_name: 'Stacja C',
    transformer_ref: 'stnC/T1',
    source_node_id: 'stnC/sn_bus',
    voltage_level_id: 'kv:15',
    voltage_kv: 15,
    uth_kv: 16.5,
    sk_mva: 142.0,
    ikss_ka: 5.47,
    z1_ohm: { r: 0.58, x: 1.42 },
    z0_ohm: { r: 0.71, x: 3.4 },
    rx_ratio: 0.408,
    c_factor: 1.1,
    scenario_id: 'MAX',
    operating_state_id: 'demo-operating-state-t1-stnc',
    calculation_run_id: 'demo-run-t1-stnc',
    model_revision: 1,
    model_hash: 'demo-hash-stnc',
    missing_data: [],
  },
];
