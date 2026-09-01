/**
 * Kontrakty danych `LvDomainView` (kanon `docs/sld/PROJEKCJA_SN_NN_PORTAL_V1.md`
 * §3 — projekcja nN). Mirror 1:1 JSON zwracanego przez backend (snake_case —
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
  /**
   * ENERGIZACJA (kontrakt 2.0.0, backend `lv_domain/energization.py` —
   * czysta topologia stanów łączników, ta sama definicja źródła energizacji
   * co reguła walidatora E060). Renderer NIE MA PRAWA wyprowadzać tych
   * wartości z topologii — czyta je; zero BFS po stronie klienta.
   *
   * `energized` — szyna w spójnej składowej (zamknięte gałęzie +
   *   transformatory) zawierającej `Source` sieci.
   * `supply_refs` — transformatory/źródła podające napięcie NA TĘ SEKCJĘ
   *   (składowa po samych zamkniętych gałęziach, bez transformatorów).
   * `der_only` — nie z sieci, ale w składowej jest generator (wyspa DER).
   */
  readonly energized: boolean;
  readonly supply_refs: readonly string[];
  readonly der_only: boolean;
}

/**
 * Wyspa = spójna składowa ENERGETYCZNA (zamknięte gałęzie + transformatory)
 * zawężona do szyn domeny — JEDYNE źródło „komponentu elektrycznego" sceny nN
 * (`meta.islandRef`); przy 2×TR i sprzęgle OTWARTYM obie sekcje są w JEDNEJ
 * wyspie (wiszą na tej samej sieci SN), rozdziela je dopiero brak drogi do
 * wspólnego źródła. Każda szyna domeny należy do dokładnie jednej wyspy.
 */
export interface LvDomainIsland {
  readonly island_ref: string;
  readonly bus_refs: readonly string[];
  readonly energized: boolean;
  readonly supply_refs: readonly string[];
  readonly der_only: boolean;
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
  /** Wyspy zasilania domeny (kontrakt 2.0.0) — patrz `LvDomainIsland`. */
  readonly islands: readonly LvDomainIsland[];
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

/** Tożsamość odpowiedzi (kontrakt 2.0.0): klient porównuje `case_id`/
 *  `station_ref`/`scenario_id` z tym, o co PROSIŁ (`projectionApi.ts`) —
 *  bez tego nie da się odróżnić odpowiedzi na własne żądanie od odpowiedzi
 *  z pamięci podręcznej dla innej stacji/scenariusza. `run_snapshot_hash` =
 *  odcisk modelu ZAPISANY PRZY BIEGU (`null`, gdy bieg nie wskazany). */
export interface LvDomainModelSnapshotV1 {
  readonly revision: number;
  readonly model_hash: string;
  readonly operating_state_id: string;
  readonly case_id: string;
  readonly station_ref: string;
  readonly scenario_id: 'MAX' | 'MIN';
  readonly run_snapshot_hash: string | null;
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

/** Zasilanie odpływu — stwierdzenie TOPOLOGICZNE backendu (z ilu
 *  transformatorów stacji szyny odpływu są osiągalne po zamkniętych
 *  gałęziach). `wielostronne` ⇒ `supply_assumption_pl` nazywa założenie
 *  zachowawcze (pętla liczona od transformatora WŁASNEJ sekcji). */
export type LvDomainFeederSupply = 'jednostronne' | 'wielostronne';

export interface LvDomainSwzFeederV1 {
  readonly feeder_root_branch_ref: string;
  readonly worst_point_bus_ref: string | null;
  readonly points: readonly LvDomainFaultLoopPointV1[];
  readonly supply: LvDomainFeederSupply | null;
  readonly supply_assumption_pl: string | null;
  readonly swz: LvDomainSwzResponseV1;
}

export interface LvDomainSwzResponseV1 extends SwzApiResponse {
  readonly transformer_ref?: string | null;
  readonly reason_pl?: string | null;
  readonly missing_data?: readonly string[];
  readonly fault_loop_min_scenario?: Readonly<Record<string, unknown>>;
}

/** Pętle zwarcia i SWZ JEDNEGO transformatora stacji (kontrakt 2.0.0):
 *  odpływy, których korzeniem jest szyna nN TEGO transformatora, liczone od
 *  niego. Transformator nieobliczalny ZOSTAJE w liście z własnym `status`/
 *  `missing_data` (cicha nieobecność byłaby kłamstwem przez pominięcie). */
export interface LvDomainSwzTransformerV1 {
  readonly transformer_ref: string;
  readonly nn_bus_ref: string;
  readonly status: 'OK' | 'brak danych' | 'nie dotyczy';
  readonly missing_data: readonly string[];
  readonly feeders: readonly LvDomainSwzFeederV1[];
}

export interface LvDomainSwzSnapshotV1 {
  readonly status: 'OK' | 'brak danych' | 'nie dotyczy';
  readonly reason_pl?: string | null;
  readonly missing_data: readonly string[];
  readonly network_system?: string | null;
  readonly transformers: readonly LvDomainSwzTransformerV1[];
}

/** Atomowy kontrakt portalu SN -> nN (`docs/sld/PROJEKCJA_SN_NN_PORTAL_V1.md`
 *  §3; backend `lv_domain/projection_v1.py`, `LV_DOMAIN_PROJECTION_VERSION`).
 *  Wszystkie podprojekcje odnoszą się do jednego `model_snapshot`; klient nie
 *  scala osobnych odpowiedzi REST. Wersja 2.0.0: `swz_snapshot.transformers[]`
 *  zamiast płaskiej listy odpływów, energizacja szyn + `islands` w grafie,
 *  tożsamość żądania w `model_snapshot`. */
export const LV_DOMAIN_PROJECTION_CONTRACT_VERSION = '2.0.0' as const;

export interface LvDomainProjectionV1 {
  readonly contract: 'LvDomainProjectionV1';
  readonly contract_version: typeof LV_DOMAIN_PROJECTION_CONTRACT_VERSION;
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
