/**
 * Kontrakty danych `LvDomainView` (karta T5b, `docs/nn/KONCEPCJA_LOD_NN_2026-08.md`
 * werdykt właściciela). Mirror 1:1 JSON zwracanego przez backend (snake_case —
 * konwencja tego API, ta sama co `types/enm.ts` dla ENM: pola TS NIE są
 * przemianowywane na camelCase, żeby uniknąć drugiego mapowania nazw, które
 * mogłoby się rozjechać z backendem przy pierwszej zmianie pola).
 *
 * Backend: `application/analyses/lv_domain/graph_view.py::build_lv_domain_view`
 * (kontrakt `LvDomainGraphView`) i
 * `application/analyses/lv_domain/upstream_equivalent.py::build_upstream_equivalent_snapshot`
 * (kontrakt `UpstreamEquivalentSnapshot`) — endpointy
 * `GET /api/cases/{case_id}/enm/lv-domain/{station_ref}` i
 * `.../upstream-equivalent`.
 */

import type { RawOverlayElement } from '../../../sld-overlay/rawResultOverlayStore';
import type { SwzApiResponse } from '../canvas/overlay';

export interface LvDomainBus {
  readonly ref_id: string;
  readonly name: string;
  readonly voltage_kv: number;
  readonly voltage_level_id: string;
  readonly hops_from_root: number;
}

export interface LvDomainBranch {
  readonly ref_id: string;
  readonly name: string;
  readonly type: 'line_overhead' | 'cable' | 'switch' | 'breaker' | 'bus_coupler' | 'disconnector' | 'fuse';
  readonly from_bus_ref: string;
  readonly to_bus_ref: string;
  readonly status: 'closed' | 'open';
  readonly catalog_ref?: string | null;
  readonly catalog_namespace?: string | null;
}

export interface LvDomainTransformer {
  readonly ref_id: string;
  readonly name: string;
  readonly hv_bus_ref: string;
  readonly lv_bus_ref: string;
  readonly sn_mva: number;
  readonly uhv_kv: number;
  readonly ulv_kv: number;
  readonly uk_percent: number;
  readonly vector_group?: string | null;
}

export interface LvDomainGenerator {
  readonly ref_id: string;
  readonly name: string;
  readonly bus_ref: string;
  readonly p_mw: number;
  readonly q_mvar?: number | null;
  readonly gen_type?: string | null;
  readonly connection_variant?: string | null;
}

export interface LvDomainLoad {
  readonly ref_id: string;
  readonly name: string;
  readonly bus_ref: string;
  readonly p_mw: number;
  readonly q_mvar: number;
}

export interface LvDomainSubSwitchboard {
  readonly ref_id: string;
  readonly name: string;
  readonly bus_refs: readonly string[];
  readonly hops_from_root: number;
}

export interface LvDomainBoundaryLink {
  readonly branch_ref: string;
  readonly from_bus_ref: string;
  readonly to_bus_ref: string;
  readonly target_station_ref: string;
  readonly target_station_name: string;
}

/** Odpowiedź `GET .../enm/lv-domain/{station_ref}` — graf domeny nN (L2). */
export interface LvDomainGraphView {
  readonly status: 'OK' | 'brak danych';
  readonly station_ref: string;
  readonly station_name?: string;
  readonly root_bus_refs?: readonly string[];
  readonly buses: readonly LvDomainBus[];
  readonly branches: readonly LvDomainBranch[];
  readonly transformers: readonly LvDomainTransformer[];
  readonly generators: readonly LvDomainGenerator[];
  readonly loads: readonly LvDomainLoad[];
  readonly sub_switchboards: readonly LvDomainSubSwitchboard[];
  readonly boundary_links: readonly LvDomainBoundaryLink[];
  readonly missing_data: readonly string[];
  readonly reason_pl?: string;
}

/** Odpowiedź `GET .../enm/lv-domain/{station_ref}/upstream-equivalent` —
 *  kotwica SN (werdykt: sourceNodeId/voltageLevelId/Uth/Sk″/Z1(R1/X1)/Z0/
 *  R×X/scenarioId/operatingStateId/calculationRunId/modelRevision+hash). */
export interface UpstreamEquivalentSnapshot {
  readonly status: 'OK' | 'brak danych';
  readonly case_id: string;
  readonly station_ref: string;
  readonly station_name?: string;
  readonly transformer_ref?: string;
  readonly source_node_id?: string;
  readonly voltage_level_id?: string;
  readonly voltage_kv?: number;
  readonly uth_kv?: number;
  readonly sk_mva?: number;
  readonly ikss_ka?: number;
  readonly z1_ohm?: { readonly r: number; readonly x: number };
  readonly z0_ohm?: { readonly r: number; readonly x: number } | null;
  readonly z0_missing_reason_pl?: string | null;
  readonly rx_ratio?: number | null;
  readonly c_factor?: number;
  readonly scenario_id?: 'MAX' | 'MIN';
  readonly operating_state_id?: string;
  readonly calculation_run_id?: string;
  readonly model_revision?: number;
  readonly model_hash?: string;
  readonly missing_data: readonly string[];
  readonly note_pl?: string;
}

export interface LvDomainModelSnapshotV1 {
  readonly revision: number;
  readonly model_hash: string;
  readonly operating_state_id: string;
}

export interface LvDomainVoltageProfileRow {
  readonly bus_id: string;
  readonly delta_pct: number | null;
  readonly [key: string]: unknown;
}

export interface LvDomainResultSnapshotV1 {
  readonly status: 'NONE' | 'FRESH' | 'OUTDATED';
  readonly reason: string;
  readonly reason_pl: string;
  readonly run_id: string | null;
  readonly analysis_type: string | null;
  readonly run_model_hash: string | null;
  readonly run_finished_at: string | null;
  readonly result_contract_version: string | null;
  readonly result_signature: string | null;
  readonly overlay_payload: {
    readonly elements: Readonly<Record<string, RawOverlayElement>>;
    readonly legend: unknown;
    readonly warnings: readonly unknown[];
  } | null;
  readonly voltage_profile: {
    readonly rows: readonly LvDomainVoltageProfileRow[];
    readonly [key: string]: unknown;
  } | null;
}

export interface LvDomainFaultLoopPointV1 {
  readonly bus_ref: string;
  readonly hop_count: number;
  readonly status: 'OK' | 'brak danych';
  readonly fault_loop?: Readonly<Record<string, unknown>> | null;
  readonly reason_pl?: string | null;
}

export interface LvDomainSwzFeederV1 {
  readonly feeder_root_branch_ref: string;
  readonly worst_point_bus_ref: string | null;
  readonly points: readonly LvDomainFaultLoopPointV1[];
  readonly swz: LvDomainSwzResponseV1;
}

export interface LvDomainSwzResponseV1 extends SwzApiResponse {
  readonly reason_pl?: string | null;
  readonly missing_data?: readonly string[];
  readonly fault_loop_min_scenario?: Readonly<Record<string, unknown>>;
}

export interface LvDomainSwzSnapshotV1 {
  readonly status: 'OK' | 'brak danych' | 'nie dotyczy';
  readonly reason_pl?: string | null;
  readonly missing_data: readonly string[];
  readonly network_system?: string | null;
  readonly transformer_ref?: string | null;
  readonly nn_bus_ref?: string | null;
  readonly feeders: readonly LvDomainSwzFeederV1[];
}

/** Atomowy kontrakt portalu SN -> nN. Wszystkie podprojekcje odnoszą się do
 *  jednego `model_snapshot`; klient nie scala osobnych odpowiedzi REST. */
export interface LvDomainProjectionV1 {
  readonly contract: 'LvDomainProjectionV1';
  readonly contract_version: '1.0.0';
  readonly case_id: string;
  readonly station_ref: string;
  readonly scenario_id: 'MAX' | 'MIN';
  readonly status: 'OK' | 'brak danych';
  readonly completeness: 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE';
  readonly missing_data: readonly string[];
  readonly model_snapshot: LvDomainModelSnapshotV1;
  readonly graph: LvDomainGraphView;
  readonly upstream_equivalents: readonly UpstreamEquivalentSnapshot[];
  readonly result_snapshot: LvDomainResultSnapshotV1;
  readonly swz_snapshot: LvDomainSwzSnapshotV1;
  readonly projection_hash: string;
}

/** Nakładka wyników przełączalna na L2 (werdykt: "przełączalne OVERLAYE
 *  inżynierskie ... nie 10 liczb naraz; domyślny SLD czysty"). ZERO PHANTOM:
 *  klucz obecny w tym rejestrze WYŁĄCZNIE gdy ISTNIEJE realny dostawca danych
 *  (kanał/endpoint już wpięty) — `LvDomainOverlayId` jest zamknięta na
 *  kluczach z realnym dostawcą (patrz `LvDomainView.tsx` — zero przełącznika
 *  bez treści, "Termika/Selektywność" NIE są tu wpisane, bo żaden istniejący
 *  kanał nN dziś ich nie dostarcza per-odpływ na tym poziomie granulacji).
 */
export type LvDomainOverlayId = 'loads' | 'voltageDrop' | 'shortCircuit' | 'swz';
