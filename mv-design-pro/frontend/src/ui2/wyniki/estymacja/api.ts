/*
 * Klient API okna „Estymacja stanu (WLS)" (ui2/wyniki/estymacja). Typy TS
 * odwzorowują 1:1 kształt żądania i odpowiedzi końcówek, wyznaczony z kodu
 * źródłowego (mapowanie plik:linia):
 *
 * - Wymagane wejścia — `GET /api/quality/state-estimation/requirements?run_id=`:
 *   `backend/src/api/quality_analysis_runs.py::get_state_estimation_requirements`
 *   → `application/analyses/state_estimation/service.py::build_state_estimation_requirements`
 *   (kształt `analysis_id`/`context`/`base_mva`/`slack_bus_ref`/`n_buses`/`n_states`/
 *   `min_measurements`/`buses`/`measurement_types`/`note_pl`).
 * - Estymacja stanu — `POST /api/quality/state-estimation`:
 *   `quality_analysis_runs.py::post_state_estimation` (model `StanWLSZadanie`) →
 *   `service.py::build_state_estimation_view` → `_serialize_result` (kształt
 *   `status`/`converged`/`iterations`/`objective_j`/`buses`/`measurements`/
 *   `bad_data`/`white_box`). |V|, kąty, rezydua, χ² i detekcja złych danych
 *   pochodzą WYŁĄCZNIE z solvera WLS — ZERO fizyki w UI.
 *
 * Warstwa PREZENTACJI: klient tylko wysyła pomiary i odbiera gotowy widok;
 * niczego nie liczy. Pola pozostają w snake_case, bo to kontrakt API. Klient
 * błędów: wariant z odczytem pola `detail` (wzór `ui2/wyniki/odbior/api.ts`).
 */

// ---------------------------------------------------------------------------
// Wspólny kontekst przebiegu (pochodzenie wyniku) — pola opcjonalne.
// ---------------------------------------------------------------------------

export interface KontekstEstymacji {
  readonly project_name: string | null;
  /** Etykieta wariantu pracy, gdy znana; identyfikator jest w `case_id`. */
  readonly case_name: string | null;
  readonly case_id: string | null;
  readonly run_timestamp: string | null;
  readonly snapshot_hash: string | null;
  /** Identyfikator PRZEBIEGU (dawniej mylnie `trace_id` — patrz V12K-267). */
  readonly run_id: string | null;
}

// ---------------------------------------------------------------------------
// Wymagane wejścia (GET .../requirements)
// ---------------------------------------------------------------------------

/** Kody typów pomiarów obsługiwanych przez estymator (kontrakt backendu). */
export type TypPomiaru =
  | 'V_MAGNITUDE'
  | 'P_INJECTION'
  | 'Q_INJECTION'
  | 'P_FLOW'
  | 'Q_FLOW';

/** Metadana typu pomiaru (etykieta PL + czy wymaga węzła „do" gałęzi). */
export interface MetaTypuPomiaru {
  readonly code: TypPomiaru;
  readonly label_pl: string;
  readonly requires_bus_j: boolean;
}

/** Węzeł grafu w mapie węzeł→indeks (identyfikator, którym posługują się pomiary). */
export interface WezelWymagan {
  readonly bus_ref: string;
  readonly index: number;
  readonly name: string | null;
  readonly voltage_kv: number | null;
  readonly is_slack: boolean;
}

/** Pełna odpowiedź `GET /api/quality/state-estimation/requirements`. */
export interface WymaganiaEstymacji {
  readonly analysis_id: string;
  readonly context: KontekstEstymacji | null;
  readonly base_mva: number;
  readonly slack_bus_ref: string;
  readonly slack_index: number;
  readonly n_buses: number;
  readonly n_states: number;
  readonly min_measurements: number;
  readonly buses: readonly WezelWymagan[];
  readonly measurement_types: readonly MetaTypuPomiaru[];
  readonly note_pl: string;
}

// ---------------------------------------------------------------------------
// Żądanie estymacji (body POST) — model `StanWLSZadanie`
// ---------------------------------------------------------------------------

/** Pojedynczy pomiar telemetryczny (model `PomiarWLS`). Wartości w pu. */
export interface PomiarWejscie {
  readonly meas_type: TypPomiaru;
  readonly bus_ref: string;
  readonly value: number;
  readonly sigma: number;
  readonly bus_j_ref?: string | null;
  readonly label?: string | null;
}

/** Żądanie estymacji stanu WLS (model `StanWLSZadanie`). */
export interface EstymacjaZadanie {
  readonly run_id: string;
  readonly pomiary: readonly PomiarWejscie[];
  readonly alpha: number;
  readonly lnr_threshold: number;
  readonly include_trace: boolean;
}

// ---------------------------------------------------------------------------
// Odpowiedź estymacji (POST) — `_serialize_result`
// ---------------------------------------------------------------------------

/** Estymowany stan pojedynczego węzła (|V|, kąt). */
export interface WezelStanu {
  readonly bus_ref: string;
  readonly index: number;
  readonly name: string | null;
  readonly voltage_kv: number | null;
  readonly is_slack: boolean;
  readonly v_magnitude_pu: number;
  readonly v_angle_rad: number;
  readonly v_angle_deg: number;
}

/** Rezyduum pojedynczego pomiaru (r = z − h(x̂)) + flaga podejrzenia. */
export interface RezyduumPomiaru {
  readonly meas_type: TypPomiaru;
  readonly bus_ref: string;
  readonly bus_j_ref: string | null;
  readonly value: number;
  readonly sigma: number;
  readonly label: string | null;
  readonly index: number;
  readonly normalized_residual: number | null;
  readonly residual: number | null;
  readonly suspect: boolean;
}

/** Wskazanie podejrzanego pomiaru (LNR) — dołączane przez serwis. */
export interface PodejrzanyPomiar {
  readonly index: number;
  readonly meas_type: TypPomiaru;
  readonly bus_ref: string;
  readonly bus_j_ref: string | null;
  readonly label: string | null;
}

/** Raport detekcji złych danych (χ² + LNR) — `BadDataReport.to_dict` + rozszerzenie. */
export interface RaportZlychDanych {
  readonly chi_square_value: number;
  readonly chi_square_threshold: number;
  readonly degrees_of_freedom: number;
  readonly alpha: number;
  readonly chi_square_flag: boolean;
  readonly largest_normalized_residual: number;
  readonly lnr_measurement_index: number | null;
  readonly lnr_threshold: number;
  readonly lnr_flag: boolean;
  readonly normalized_residuals: readonly number[];
  readonly lnr_measurement: PodejrzanyPomiar | null;
}

/** Pozycja braku danych (węzły bez pomiaru) — uczciwe pokrycie. */
export interface BrakDanych {
  readonly code: string;
  readonly bus_refs: readonly string[];
}

/** Iteracja śladu WHITE BOX (skalary + macierze audytowalne). */
export interface KrokSladu {
  readonly iteration: number;
  readonly objective_j: number;
  readonly max_abs_residual: number;
  readonly step_norm: number;
  readonly h_jacobian: readonly (readonly number[])[];
  readonly gain_matrix_g: readonly (readonly number[])[];
  readonly residual_r: readonly number[];
  readonly delta_x: readonly number[];
  readonly state_x: readonly number[];
}

/** Pełna odpowiedź `POST /api/quality/state-estimation`. */
export interface WidokEstymacji {
  readonly analysis_id: string;
  readonly context: KontekstEstymacji | null;
  readonly status: string;
  readonly status_pl: string;
  readonly missing_data: readonly BrakDanych[];
  readonly solver_version: string;
  readonly validation_status: string;
  readonly estimate_id: string;
  readonly base_mva: number;
  readonly slack_bus_ref: string;
  readonly slack_index: number;
  readonly converged: boolean;
  readonly iterations: number;
  readonly n_states: number;
  readonly m_measurements: number;
  readonly degrees_of_freedom: number;
  readonly objective_j: number;
  readonly note: string | null;
  readonly buses: readonly WezelStanu[];
  readonly measurements: readonly RezyduumPomiaru[];
  readonly bad_data: RaportZlychDanych;
  readonly white_box?: readonly KrokSladu[];
}

// ---------------------------------------------------------------------------
// Pobieranie (GET) / wysyłanie (POST) — z odczytem pola `detail` (422 PL)
// ---------------------------------------------------------------------------

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

async function postJsonZDetalem<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
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

/** Pobiera wymagane wejścia estymacji (mapa węzeł→indeks) dla przebiegu rozpływu. */
export function fetchWymaganiaEstymacji(runId: string): Promise<WymaganiaEstymacji> {
  return getJsonZDetalem<WymaganiaEstymacji>(
    `/api/quality/state-estimation/requirements?run_id=${encodeURIComponent(runId)}`,
  );
}

/** Wykonuje estymację stanu WLS dla przebiegu rozpływu i podanych pomiarów. */
export function postEstymacjaStanu(zadanie: EstymacjaZadanie): Promise<WidokEstymacji> {
  return postJsonZDetalem<WidokEstymacji>('/api/quality/state-estimation', zadanie);
}
