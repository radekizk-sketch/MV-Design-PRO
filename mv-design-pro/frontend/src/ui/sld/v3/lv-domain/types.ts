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

/** Nakładka wyników przełączalna na L2 (werdykt: "przełączalne OVERLAYE
 *  inżynierskie ... nie 10 liczb naraz; domyślny SLD czysty"). ZERO PHANTOM:
 *  klucz obecny w tym rejestrze WYŁĄCZNIE gdy ISTNIEJE realny dostawca danych
 *  (kanał/endpoint już wpięty) — `LvDomainOverlayId` jest zamknięta na
 *  kluczach z realnym dostawcą (patrz `LvDomainView.tsx` — zero przełącznika
 *  bez treści, "Termika/Selektywność" NIE są tu wpisane, bo żaden istniejący
 *  kanał nN dziś ich nie dostarcza per-odpływ na tym poziomie granulacji).
 */
export type LvDomainOverlayId = 'loads' | 'voltageDrop' | 'shortCircuit' | 'swz';
