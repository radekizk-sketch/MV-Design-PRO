/*
 * Klient API okna „Stan fazowy SN" (ui2/wyniki/stan-fazowy, E-31). Typy TS
 * odwzorowują 1:1 kształt odpowiedzi końcówki kanonicznej (mapowanie plik:linia):
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
