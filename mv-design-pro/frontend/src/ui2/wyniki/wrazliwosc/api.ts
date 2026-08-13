/*
 * Klient API okna „Wrażliwość" (karta ROUTERY-4A). Typy TS odwzorowują 1:1
 * kształt odpowiedzi końcówki (mapowanie plik:linia):
 *
 * - `GET /api/insights/sensitivity?run_id=`:
 *   `backend/src/api/analysis_insights.py:get_sensitivity` →
 *   `application/analyses/wrazliwosc_rozplywu.py:build_wrazliwosc_view`
 *   (kształt `analysis_id`/`context`/`lf`/`ogolna`/`wezly`/`pominiete_zrodla_pl`);
 *   `lf` = `analysis/lf_sensitivity/serializer.py:view_to_dict`,
 *   `ogolna` = `analysis/sensitivity/serializer.py:view_to_dict`.
 *
 * Warstwa PREZENTACJI: wyłącznie odczyt (GET), zero fizyki, zero mutacji.
 * Wzór pobierania: `ui2/wyniki/jakosc/api.ts`.
 */

/** Kontekst przebiegu (pochodzenie wyniku) — koperta `zbuduj_kontekst_widoku`. */
export interface KontekstWrazliwosci {
  readonly project_name: string | null;
  readonly case_id: string | null;
  readonly run_timestamp: string | null;
  readonly snapshot_hash: string | null;
  readonly run_id: string | null;
}

/** Czynnik wpływu (driver) wrażliwości profilu napięć (LF). */
export interface CzynnikLf {
  readonly bus_id: string;
  readonly parameter: string;
  readonly perturbation: string;
  readonly delta_delta_pct: number;
  readonly delta_margin_pct: number | null;
  readonly why_pl: string;
}

/** Wpis wrażliwości LF per węzeł profilu napięć. */
export interface WpisLf {
  readonly bus_id: string;
  readonly base_delta_pct: number | null;
  readonly threshold_warn_pct: number | null;
  readonly threshold_fail_pct: number | null;
  readonly drivers: readonly CzynnikLf[];
  readonly missing_data: readonly string[];
}

export interface WidokLf {
  readonly analysis_id: string;
  readonly delta_pct: number;
  readonly entries: readonly WpisLf[];
  readonly summary: { readonly total_entries: number; readonly not_computed_count: number };
  readonly top_drivers: readonly CzynnikLf[];
}

/** Perturbacja ±delta% wielkości obserwowanej (wrażliwość ogólna). */
export interface PerturbacjaOgolna {
  readonly delta_pct: number;
  readonly margin: number | null;
  readonly delta_margin: number | null;
  readonly decision: string;
}

/** Wpis wrażliwości ogólnej (margines kryterium × perturbacje ±). */
export interface WpisOgolny {
  readonly parameter_id: string;
  readonly parameter_label: string;
  readonly target_id: string;
  readonly source: string;
  readonly base_margin: number | null;
  readonly margin_unit: string | null;
  readonly base_decision: string;
  readonly minus: PerturbacjaOgolna;
  readonly plus: PerturbacjaOgolna;
}

export interface WidokOgolny {
  readonly analysis_id: string;
  readonly delta_pct: number;
  readonly entries: readonly WpisOgolny[];
  readonly summary: { readonly total_entries: number; readonly not_computed_count: number };
}

/** Tłumaczenie identyfikatora węzła grafu na nazwę szyny (język projektanta). */
export interface WezelWrazliwosci {
  readonly name: string | null;
  readonly u_nom_kv: number | null;
}

/** Pełna odpowiedź `GET /api/insights/sensitivity`. */
export interface WrazliwoscResponse {
  readonly analysis_id: string;
  readonly context: KontekstWrazliwosci | null;
  readonly lf: WidokLf;
  readonly ogolna: WidokOgolny;
  readonly wezly: Readonly<Record<string, WezelWrazliwosci>>;
  readonly pominiete_zrodla_pl: readonly string[];
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request ${url} failed: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

/** Pobiera wrażliwość (LF + ogólna) dla przebiegu rozpływu (LOAD_FLOW/DONE). */
export function fetchWrazliwosc(runId: string): Promise<WrazliwoscResponse> {
  return getJson<WrazliwoscResponse>(
    `/api/insights/sensitivity?run_id=${encodeURIComponent(runId)}`,
  );
}
