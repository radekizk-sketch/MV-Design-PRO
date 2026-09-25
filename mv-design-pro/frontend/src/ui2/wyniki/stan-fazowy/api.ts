/*
 * Klient API okna „Stan fazowy SN" (ui2/wyniki/stan-fazowy, E-31). Typy TS
 * odwzorowują 1:1 kształt odpowiedzi końcówek kanonicznych (mapowanie plik:linia).
 *
 * DWA ŹRÓDŁA wyniku fazowego (karta W5-D):
 *
 * - Rozpływ niesymetryczny — `GET /api/analysis-runs/{run_id}/results/rozplyw-niesymetryczny`
 *   (`backend/src/api/analysis_runs.py::get_power_flow_unbalanced_results`
 *   → `api/canonical_run_views.py::build_power_flow_unbalanced_results_response`
 *   → `enm/canonical_analysis.py::build_power_flow_unbalanced_results`; kontrakt
 *   `domain/result_contract_power_flow_unbalanced_v1.py`): szyny per faza (U p.u.,
 *   U kV faza–N, kąt), VUF wg składowych symetrycznych (IEC 61000-4-30) z solvera
 *   FROZEN `network_model/solvers/power_flow_unbalanced.py`, gałęzie per faza
 *   (P/Q/I), straty, wyspy, ZAŁOŻENIA biegu (kody kanonu gotowości), statusy.
 *   Bieg innego rodzaju = `buses: []`, `summary: null`.
 *
 * - Wyniki stanu fazowego — `GET /api/analysis-runs/{run_id}/results/phase-state`:
 *   `backend/src/api/analysis_runs.py:393-395::get_phase_state_results`
 *   → `api/canonical_run_views.py:406-409::build_phase_state_results_response`
 *   → `enm/canonical_analysis.py:1995-2035::build_phase_state_results`
 *   (wiersz: target_id/element_id/target_name, ua/ub/uc_kv, ia/ib/ic_a,
 *   phase_losses_kw {A,B,C}, voltage/current/losses_unbalance_percent,
 *   flags — `network_model/solvers/phase_state_sn.py:104-123` (PhaseStateSNFlags),
 *   proof_ref/proof_status(_pl), reporting_status(_pl),
 *   dopuszczalnosc_raportowa, reporting_limitations).
 *
 * Wartości fazowe, wskaźniki asymetrii i FLAGI ALARMÓW liczy WYŁĄCZNIE solver
 * `phase_state_sn` (próg alarmu `unbalance_alert_percent` jest wejściem solvera —
 * `phase_state_sn.py:223-225`); UI tylko renderuje. ZERO fizyki, zero progów w UI.
 * Pola w snake_case, bo to kontrakt API. Klient błędów: wariant z odczytem pola
 * `detail` (wzór `ui2/wyniki/estymacja/api.ts`).
 */

/** Flagi stanu i alarmów solvera (1:1 `PhaseStateSNFlags.to_dict`). */
export interface FlagiStanuFazowego {
  readonly has_fault: boolean;
  readonly has_open_phase: boolean;
  readonly faulted_phases: readonly string[];
  readonly open_phases: readonly string[];
  readonly voltage_unbalance_alert: boolean;
  readonly current_unbalance_alert: boolean;
  readonly losses_unbalance_alert: boolean;
}

/** Straty czynne per faza [kW] (1:1 `PhaseValues.to_dict` — klucze A/B/C). */
export interface StratyFazowe {
  readonly A?: number;
  readonly B?: number;
  readonly C?: number;
}

/** Jeden wiersz wyników stanu fazowego (1:1 `build_phase_state_results`). */
export interface WierszStanuFazowego {
  readonly target_id: string;
  readonly element_id: string;
  readonly target_name: string;
  readonly ua_kv: number | null;
  readonly ub_kv: number | null;
  readonly uc_kv: number | null;
  readonly ia_a: number | null;
  readonly ib_a: number | null;
  readonly ic_a: number | null;
  readonly phase_losses_kw: StratyFazowe;
  readonly voltage_unbalance_percent: number | null;
  readonly current_unbalance_percent: number | null;
  readonly losses_unbalance_percent: number | null;
  readonly flags: Partial<FlagiStanuFazowego>;
  readonly proof_ref: string | null;
  readonly proof_status: string | null;
  readonly proof_status_pl: string | null;
  readonly reporting_status: string | null;
  readonly reporting_status_pl: string | null;
  readonly dopuszczalnosc_raportowa: boolean;
  readonly reporting_limitations: readonly string[];
  /** Ograniczenia raportowe po polsku (karta #145) — na ekranie wyłącznie te zdania. */
  readonly reporting_limitations_pl: readonly string[];
}

/** Pełna odpowiedź końcówki wyników stanu fazowego. */
export interface WynikiStanuFazowego {
  readonly run_id: string;
  readonly rows: readonly WierszStanuFazowego[];
}

async function getJsonZDetalem<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    let komunikat = `Zapytanie ${url} nie powiodło się: ${response.status} ${response.statusText}`;
    try {
      const tresc = (await response.json()) as { detail?: unknown };
      if (typeof tresc?.detail === 'string' && tresc.detail.trim()) komunikat = tresc.detail;
    } catch {
      // Brak treści JSON — pozostaje komunikat ze statusem HTTP.
    }
    throw new Error(komunikat);
  }
  return response.json() as Promise<T>;
}

/** Pobiera kanoniczne wyniki stanu fazowego SN dla wskazanego przebiegu. */
export function fetchWynikiStanuFazowego(runId: string): Promise<WynikiStanuFazowego> {
  return getJsonZDetalem<WynikiStanuFazowego>(
    `/api/analysis-runs/${encodeURIComponent(runId)}/results/phase-state`,
  );
}

// ---------------------------------------------------------------------------
// Rozpływ niesymetryczny (W5-D) — drugie źródło ekranu E-31
// ---------------------------------------------------------------------------

/** Napięcie jednej fazy szyny (1:1 `FazaSzynyV1.to_dict`). */
export interface FazaSzynyNiesymetrycznej {
  readonly u_pu: number;
  /** Napięcie faza–N [kV]. */
  readonly u_kv: number;
  readonly angle_deg: number;
}

/** Szyna wyniku rozpływu niesymetrycznego (1:1 `BusResultUnbalancedV1.to_dict`). */
export interface SzynaNiesymetryczna {
  readonly bus_id: string;
  readonly element_id: string;
  readonly name: string;
  /** Napięcie znamionowe międzyprzewodowe [kV]. */
  readonly un_kv: number;
  /** `false` = szyna poza wyspą zasiloną (fazy `null`) — jawny brak, nie liczba. */
  readonly solved: boolean;
  readonly zrodlo_ref: string | null;
  readonly faza_a: FazaSzynyNiesymetrycznej | null;
  readonly faza_b: FazaSzynyNiesymetrycznej | null;
  readonly faza_c: FazaSzynyNiesymetrycznej | null;
  /** VUF [%] wg składowych symetrycznych — liczy solver; `null` gdy nierozwiązana. */
  readonly voltage_unbalance_factor_pct: number | null;
}

/** Przepływ jednej fazy gałęzi (1:1 `FazaGaleziV1.to_dict`). */
export interface FazaGaleziNiesymetrycznej {
  readonly p_mw: number;
  readonly q_mvar: number;
  readonly i_a: number;
}

/** Gałąź wyniku rozpływu niesymetrycznego (1:1 `BranchResultUnbalancedV1.to_dict`). */
export interface GalazNiesymetryczna {
  readonly branch_id: string;
  readonly element_id: string;
  readonly name: string;
  readonly element_type: string;
  readonly from_bus_id: string;
  readonly to_bus_id: string;
  readonly faza_a: FazaGaleziNiesymetrycznej;
  readonly faza_b: FazaGaleziNiesymetrycznej;
  readonly faza_c: FazaGaleziNiesymetrycznej;
  readonly losses_p_mw: number;
  readonly losses_q_mvar: number;
  /** Prąd znamionowy [A] z IR; `null` = brak danej (łącznik, transformator, linia bez katalogu). */
  readonly rated_current_a: number | null;
}

/** Wyspa zasilona rozwiązana przez solver (1:1 `WyspaWynikuUnbalancedV1.to_dict`). */
export interface WyspaNiesymetryczna {
  readonly slack_bus_id: string;
  readonly zrodlo_ref: string;
  readonly base_kv_ll: number;
  readonly converged: boolean;
  readonly iterations: number;
  readonly max_voltage_mismatch_pu: number;
  readonly bus_count: number;
  readonly branch_count: number;
}

/** Podsumowanie biegu (1:1 `ResultSetPowerFlowUnbalancedV1.to_dict()["summary"]`). */
export interface PodsumowanieNiesymetrii {
  readonly bus_count: number;
  readonly branch_count: number;
  readonly solved_bus_count: number;
  readonly total_losses_p_mw: number;
  readonly total_losses_q_mvar: number;
  readonly max_voltage_unbalance_factor_pct: number | null;
  readonly max_voltage_unbalance_bus_id: string | null;
  readonly unsolved_bus_ids: readonly string[];
}

/** Założenie biegu nazwane kodem kanonu gotowości (`enm/assembler.py::_zalozenie`). */
export interface ZalozenieBiegu {
  readonly kod: string;
  readonly elementy: readonly string[];
  readonly opis: string;
}

/** Pełna odpowiedź końcówki wyników rozpływu niesymetrycznego. */
export interface WynikiRozplywuNiesymetrycznego {
  readonly run_id: string;
  readonly analysis_type?: string;
  readonly solver_version?: string | null;
  readonly converged?: boolean | null;
  readonly wyspy?: readonly WyspaNiesymetryczna[];
  readonly buses: readonly SzynaNiesymetryczna[];
  readonly branches: readonly GalazNiesymetryczna[];
  readonly summary: PodsumowanieNiesymetrii | null;
  readonly zalozenia?: readonly ZalozenieBiegu[];
  readonly proof_ref?: string | null;
  readonly proof_status?: string | null;
  readonly proof_status_pl?: string | null;
  readonly reporting_status?: string | null;
  readonly reporting_status_pl?: string | null;
  readonly quality_status?: string | null;
  readonly dopuszczalnosc_raportowa?: boolean;
  readonly reporting_limitations?: readonly string[];
  /** Ograniczenia raportowe po polsku (karta #145). */
  readonly reporting_limitations_pl?: readonly string[];
}

/** Pobiera kanoniczne wyniki rozpływu niesymetrycznego dla wskazanego przebiegu. */
export function fetchWynikiRozplywuNiesymetrycznego(
  runId: string,
): Promise<WynikiRozplywuNiesymetrycznego> {
  return getJsonZDetalem<WynikiRozplywuNiesymetrycznego>(
    `/api/analysis-runs/${encodeURIComponent(runId)}/results/rozplyw-niesymetryczny`,
  );
}
