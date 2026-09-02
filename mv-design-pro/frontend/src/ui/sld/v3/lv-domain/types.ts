/**
 * Kontrakty danych projekcji nN — `LvDomainProjectionV1` w wersji 3.0.0
 * (kanon `docs/sld/PROJEKCJA_SN_NN_PORTAL_V1.md` §3; mandat „profesjonalizacja
 * SLD nN" §5/§6/§10/§14/§32/§34). Mirror 1:1 JSON zwracanego przez backend
 * (snake_case — konwencja tego API, ta sama co `types/enm.ts`): pola TS NIE
 * są przemianowywane na camelCase, żeby uniknąć drugiego mapowania nazw,
 * które rozjechałoby się z backendem przy pierwszej zmianie pola.
 *
 * Backend: `application/analyses/lv_domain/graph_view.py` (graf + role
 * urządzeń + sekcje + pomiary), `energization.py` (stany zacisków/odcinków,
 * wyspy, tory zasilania), `audit.py` (komunikaty walidacji),
 * `upstream_equivalent.py` (kotwica SN), `projection_v1.py` (atomowy odczyt) —
 * końcówka `GET /api/cases/{case_id}/enm/lv-domain/{station_ref}/projection/v1`.
 *
 * ZASADA: renderer CZYTA te pola. Nie liczy energizacji, wysp, ról urządzeń,
 * torów zasilania ani ostrzeżeń z geometrii czy z grafu (zakaz BFS po stronie
 * klienta — guard `scripts/lv_domain_projection_guard.py` R4).
 */

import type { RawOverlayElement } from '../../../sld-overlay/rawResultOverlayStore';
import type { SwzApiResponse } from '../canvas/overlay';

/** Stan energizacji ZACISKU / ODCINKA / WYSPY — jedna zamknięta lista (§5/§6). */
export type LvEnergizationState = 'ENERGIZED' | 'DEENERGIZED' | 'UNKNOWN' | 'CONFLICT' | 'MULTISOURCE';

/** Łączność odcinka — z `Branch.status`, ortogonalna do energizacji (§5). */
export type LvConnectivityState = 'CLOSED' | 'OPEN';

/** Zdolność źródła rozproszonego do utrzymania napięcia w wyspie (§14). */
export type LvDerIslandCapability = 'GRID_FOLLOWING' | 'GRID_FORMING' | 'DUAL_MODE' | 'UNKNOWN';

/** Typ gałęzi ENM = TYP URZĄDZENIA rejestru symboli (§4). */
export type LvDeviceType = 'line_overhead' | 'cable' | 'switch' | 'breaker' | 'bus_coupler' | 'disconnector' | 'fuse';

/** Rola urządzenia rozstrzygnięta w backendzie z topologii (§4/§8). */
export type LvDeviceRole = 'incomer' | 'feeder' | 'coupler' | 'boundary' | 'internal';

/** Zawartość poddrzewa odpływu (backend, `graph_view._feeder_kind`). */
export type LvFeederKind = 'load' | 'der' | 'sub_board' | 'boundary' | 'mixed' | 'none';

export type LvDeviceState = 'OPEN' | 'CLOSED' | 'UNKNOWN';

/** Stan JEDNEGO zacisku (szyny) — pola wspólne szyny i końców odcinka. */
export interface LvTerminalState {
  readonly energization_state: LvEnergizationState;
  /** `true`/`false` albo `null` dla stanu `UNKNOWN`. */
  readonly is_energized: boolean | null;
  /** Kto podaje napięcie NA TĘ SEKCJĘ po zamkniętych gałęziach (transformatory,
   *  źródła nN; w wyspie bez sieci — źródła tworzące napięcie). */
  readonly supply_refs: readonly string[];
  readonly island_ref: string;
  /** `true` wyłącznie dla zasilania z sieci (`Source` osiągalny). */
  readonly grid_energized: boolean;
}

export interface LvDomainBus extends LvTerminalState {
  readonly ref_id: string;
  readonly name: string;
  readonly voltage_kv: number;
  readonly voltage_level_id: string;
  readonly hops_from_root: number;
  /** Szyna ROZDZIELNICY (sekcja korzeniowa / podrozdzielnica) vs zacisk toru. */
  readonly is_board: boolean;
}

export interface LvNeutralReference {
  readonly system: string | null;
  readonly source_ref: string | null;
  readonly status: 'OK' | 'brak_ukladu' | 'brak_zrodla';
  readonly status_pl: string;
  readonly swz_evaluable: boolean;
}

export interface LvPowerBalance {
  readonly p_generation_mw: number;
  readonly p_load_mw: number;
  readonly state: 'z_sieci' | 'nadwyzka' | 'deficyt' | 'zrownowazony' | 'brak_danych';
  readonly basis_pl: string;
}

export interface LvDomainValidationMessage {
  readonly code: string;
  readonly severity: 'BLOCKER' | 'IMPORTANT' | 'INFO' | string;
  readonly message_pl: string;
  readonly element_refs: readonly string[];
}

/**
 * Wyspa = spójna składowa ENERGETYCZNA (zamknięte gałęzie + transformatory)
 * zawężona do szyn domeny — JEDYNE źródło „komponentu elektrycznego" sceny nN.
 * Przy 2×TR i sprzęgle OTWARTYM obie sekcje są w JEDNEJ wyspie (wiszą na tej
 * samej sieci SN); rozdziela je dopiero brak drogi do wspólnego źródła (§14).
 */
export interface LvDomainIsland {
  readonly island_ref: string;
  readonly bus_refs: readonly string[];
  readonly energization_state: LvEnergizationState;
  readonly is_energized: boolean | null;
  readonly is_islanded: boolean;
  readonly grid_source_refs: readonly string[];
  readonly transformer_refs: readonly string[];
  readonly energizing_source_ids: readonly string[];
  readonly der_refs: readonly string[];
  readonly has_grid_forming_source: boolean;
  readonly frequency_reference_source_id: string | null;
  readonly voltage_reference_source_id: string | null;
  readonly upstream_system_ids: readonly string[];
  readonly neutral_reference: LvNeutralReference;
  readonly power_balance: LvPowerBalance;
  readonly island_operation_allowed: boolean | null;
  readonly validation_messages: readonly LvDomainValidationMessage[];
}

export interface LvDomainBranch {
  readonly ref_id: string;
  readonly name: string;
  readonly type: LvDeviceType;
  readonly from_bus_ref: string;
  readonly to_bus_ref: string;
  readonly status: 'closed' | 'open';
  readonly catalog_ref?: string | null;
  readonly catalog_namespace?: string | null;
  /** Klasa funkcjonalna wyrobu z katalogu (`materialized_params.device_kind`,
   *  np. WYLACZNIK / ROZLACZNIK / ROZLACZNIK_BEZPIECZNIKOWY / ODLACZNIK);
   *  `null` = katalog nie klasyfikuje aparatu. Pole addytywne (R2 §6/§8). */
  readonly device_kind?: string | null;
}

/** Urządzenie = gałąź domeny z ROLĄ z topologii (§4/§8) — mirror `graph.devices[]`. */
export interface LvDomainDevice {
  readonly ref_id: string;
  readonly device_type: LvDeviceType;
  /** Klasa funkcjonalna wyrobu z katalogu (patrz `LvDomainBranch.device_kind`);
   *  rozstrzyga symbol CAD sprzęgła/rozłącznika bezpiecznikowego (R2 §6/§8). */
  readonly device_kind: string | null;
  /** Przestrzeń katalogu wyrobu (lustro `LvDomainBranch.catalog_namespace`):
   *  breaker z `APARAT_NN_MCB` = wyłącznik instalacyjny (symbol z wyzwalaczami,
   *  R2.1), breaker z `APARAT_NN` = wyłącznik mocy (krzyżyk). Pole addytywne. */
  readonly catalog_namespace?: string | null;
  readonly designation_class: 'QF' | 'QS' | 'FU' | 'QBC' | 'W' | 'Q';
  readonly device_role: LvDeviceRole;
  readonly feeder_kind: LvFeederKind | null;
  readonly transformer_ref: string | null;
  readonly board_bus_ref: string | null;
  readonly parent_bus_ref: string;
  readonly child_bus_ref: string;
  readonly terminal_a: string;
  readonly terminal_b: string;
  readonly device_state: LvDeviceState;
}

/** Mapa energizacji ODCINKÓW (§6) — stan przewodnika i OBU jego zacisków. */
export interface LvDomainSegment {
  readonly segment_id: string;
  readonly from_bus_ref: string;
  readonly to_bus_ref: string;
  readonly connectivity_state: LvConnectivityState;
  readonly from_terminal: LvTerminalState;
  readonly to_terminal: LvTerminalState;
  /** Stan PRZEWODNIKA: przy `CLOSED` wspólny stan zacisków; przy `OPEN`
   *  `DEENERGIZED` (odcinek nie prowadzi prądu) — stan każdej strony niosą
   *  `from_terminal`/`to_terminal`. */
  readonly energization_state: LvEnergizationState;
  readonly source_ids: readonly string[];
  readonly island_ref: string | null;
  readonly voltage_level_id: string;
}

/** Tor zasilania JEDNEJ szyny od JEDNEGO źródła (§37/§38) — lista gałęzi po kolei. */
export interface LvDomainSupplyPath {
  readonly bus_ref: string;
  readonly source_ref: string;
  readonly source_bus_ref: string;
  readonly branch_refs: readonly string[];
}

/** Sekcja rozdzielnicy (korzeniowa `main` / podrozdzielnica `sub`) — §8/§22. */
export interface LvDomainSection {
  readonly section_id: string;
  readonly bus_ref: string;
  readonly order: number;
  readonly tier: 'main' | 'sub';
  readonly station_ref: string;
  readonly coupler_refs: readonly string[];
  readonly incomer_refs: readonly string[];
  readonly transformer_refs: readonly string[];
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
  /** Punkt neutralny strony nN (dana modelu; `null` = niezadeklarowany) — §16. */
  readonly lv_neutral: Readonly<Record<string, unknown>> | null;
  /** System SN transformatora (składowa sieci bez szyn domeny) — §10/§11. */
  readonly upstream_system_id: string | null;
}

export interface LvDomainGenerator {
  readonly ref_id: string;
  readonly name: string;
  readonly bus_ref: string;
  readonly p_mw: number;
  readonly q_mvar?: number | null;
  readonly gen_type?: string | null;
  readonly connection_variant?: string | null;
  readonly island_capability: LvDerIslandCapability;
  readonly capability_source_pl: string;
  readonly island_operation_capable: boolean;
}

export interface LvDomainLoad {
  readonly ref_id: string;
  readonly name: string;
  readonly bus_ref: string;
  readonly p_mw: number;
  readonly q_mvar: number;
}

export interface LvDomainMeasurement {
  readonly ref_id: string;
  readonly name: string;
  readonly measurement_type: 'CT' | 'VT';
  readonly bus_ref: string;
  readonly bay_ref: string | null;
  readonly purpose: 'protection' | 'metering' | 'combined';
  readonly ratio_primary: number;
  readonly ratio_secondary: number;
  /** Tabliczka przekładnika TEKSTEM obok symbolu (R2 §9); brak danych = null. */
  readonly accuracy_class: string | null;
  readonly burden_va: number | null;
  readonly ct_cores: number | null;
  readonly ct_arrangement: '3xCT' | 'ferranti' | null;
}

export interface LvDomainProtectionAssignment {
  readonly ref_id: string;
  readonly name: string;
  readonly breaker_ref: string;
  readonly device_type: string;
  readonly ct_ref: string | null;
  readonly vt_ref: string | null;
  readonly is_enabled: boolean;
  readonly function_codes: readonly string[];
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

/** Graf domeny nN + stany (kontrakt 3.0.0). */
export interface LvDomainGraphView {
  readonly status: 'OK' | 'brak danych';
  readonly station_ref: string;
  readonly station_name?: string;
  readonly earthing_system?: string | null;
  readonly root_bus_refs?: readonly string[];
  readonly buses: readonly LvDomainBus[];
  readonly islands: readonly LvDomainIsland[];
  readonly branches: readonly LvDomainBranch[];
  readonly devices: readonly LvDomainDevice[];
  readonly segments: readonly LvDomainSegment[];
  readonly supply_paths: readonly LvDomainSupplyPath[];
  readonly sections: readonly LvDomainSection[];
  readonly transformers: readonly LvDomainTransformer[];
  readonly generators: readonly LvDomainGenerator[];
  readonly loads: readonly LvDomainLoad[];
  readonly measurements: readonly LvDomainMeasurement[];
  readonly protection_assignments: readonly LvDomainProtectionAssignment[];
  readonly sub_switchboards: readonly LvDomainSubSwitchboard[];
  readonly boundary_links: readonly LvDomainBoundaryLink[];
  /** §17: pomiary obecności napięcia per szyna — ENM ich dziś nie niesie
   *  (pusta mapa); stany w tej odpowiedzi są TOPOLOGICZNE. */
  readonly measured_voltage_states: Readonly<Record<string, string>>;
  readonly energization_basis_pl?: string;
  readonly missing_data: readonly string[];
  readonly reason_pl?: string;
}

/** Kotwica SN (werdykt: sourceNodeId/voltageLevelId/Uth/Sk″/Z1/Z0/R×X/…) +
 *  tożsamość zasilania §10/§11. */
export interface UpstreamEquivalentSnapshot {
  readonly status: 'OK' | 'brak danych';
  readonly case_id: string;
  readonly station_ref: string;
  readonly station_name?: string;
  readonly transformer_ref?: string;
  readonly source_node_id?: string;
  /** Szyna SN (ref ENM), na której wisi transformator — §10. */
  readonly upstream_node_id?: string;
  /** Tożsamość równoważnika (per węzeł SN × scenariusz × stan) — ten sam u
   *  dwóch transformatorów = JEDNA kotwica (§11). */
  readonly equivalent_id?: string;
  /** System SN (składowa sieci bez szyn domeny); `null` gdy nieznany. */
  readonly upstream_system_id?: string | null;
  readonly upstream_source_ids?: readonly string[];
  /** Nazwy źródeł systemu SN (do etykiety kotwicy; refy — do tożsamości). */
  readonly upstream_source_names?: readonly string[];
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

/** Tożsamość odpowiedzi: klient porównuje `case_id`/`station_ref`/`scenario_id`
 *  z tym, o co PROSIŁ (`projectionApi.ts`). `run_snapshot_hash` = odcisk
 *  modelu ZAPISANY PRZY BIEGU (`null`, gdy bieg nie wskazany). */
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

/** Zasilanie odpływu — stwierdzenie TOPOLOGICZNE backendu. `wielostronne` ⇒
 *  `supply_assumption_pl` nazywa założenie zachowawcze. */
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

/** Wersja ładunku przypięta wprost — inna wersja = odrzucenie (`projectionApi.ts`). */
export const LV_DOMAIN_PROJECTION_CONTRACT_VERSION = '3.0.0' as const;

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
  /** §34/§40: audyt topologii + komunikaty wysp + świeżość wyniku — JEDNA lista. */
  readonly validation_messages: readonly LvDomainValidationMessage[];
  readonly projection_hash: string;
}

/** Nakładka wyników przełączalna na L2. ZERO PHANTOM: klucz obecny w tym
 *  rejestrze WYŁĄCZNIE gdy ISTNIEJE realny dostawca danych w projekcji. */
export type LvDomainOverlayId = 'loads' | 'voltageDrop' | 'shortCircuit' | 'swz';
