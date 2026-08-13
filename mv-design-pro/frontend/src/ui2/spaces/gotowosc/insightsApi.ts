/*
 * Klient końcówek widoków interpretacji dla przestrzeni „Gotowość"
 * (karta ROUTERY-4A). Typy TS odwzorowują 1:1 kształt odpowiedzi
 * (mapowanie plik:linia):
 *
 * - `GET /api/insights/analysis-coverage?case_id=`:
 *   `backend/src/api/analysis_insights.py:get_analysis_coverage` →
 *   `application/analyses/pokrycie_analiz.py:build_pokrycie_view`
 *   (`case_id`/`run_id`/`pokrycie`), `pokrycie` =
 *   `analysis/coverage_score/serializer.py:view_to_dict`.
 * - `GET /api/insights/network-boundary?case_id=`:
 *   `backend/src/api/analysis_insights.py:get_network_boundary` →
 *   `application/analyses/granice_sieci.py:build_granice_view`.
 *
 * Warstwa PREZENTACJI: wyłącznie odczyt (GET), zero fizyki, zero mutacji.
 */

/** Widok punktacji pokrycia (serializacja `CoverageScoreView`). */
export interface PokrycieWidok {
  readonly analysis_id: string;
  readonly total_score: number;
  readonly missing_items: readonly string[];
  readonly critical_gaps: readonly string[];
}

/** Pełna odpowiedź `GET /api/insights/analysis-coverage`. */
export interface PokrycieResponse {
  readonly case_id: string;
  /** Przebieg rozpływu, z którego policzono widoki (null = przypadek bez biegu). */
  readonly run_id: string | null;
  readonly pokrycie: PokrycieWidok;
}

/** Szyna wskazana jako węzeł przyłączenia. */
export interface SzynaGranicy {
  readonly ref_id: string;
  readonly name: string;
  readonly voltage_kv: number;
}

/** Wpis diagnostyki granicy (kod modułu analizy + opis PL). */
export interface DiagnostykaGranicy {
  readonly kod: string;
  readonly opis_pl: string;
}

/** Pełna odpowiedź `GET /api/insights/network-boundary`. */
export interface GranicaResponse {
  readonly case_id: string;
  readonly model_hash: string | null;
  readonly znaleziono: boolean;
  readonly wezel_przylaczenia: SzynaGranicy | null;
  readonly node_id: string | null;
  readonly metoda: string | null;
  readonly metoda_pl: string | null;
  readonly ufnosc: number;
  readonly diagnostyka: readonly DiagnostykaGranicy[];
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request ${url} failed: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

/** Pobiera pokrycie analizami przypadku obliczeniowego. */
export function fetchPokrycieAnaliz(caseId: string): Promise<PokrycieResponse> {
  return getJson<PokrycieResponse>(
    `/api/insights/analysis-coverage?case_id=${encodeURIComponent(caseId)}`,
  );
}

/** Pobiera granicę sieci (węzeł przyłączenia) z bieżącego modelu przypadku. */
export function fetchGranicaSieci(caseId: string): Promise<GranicaResponse> {
  return getJson<GranicaResponse>(
    `/api/insights/network-boundary?case_id=${encodeURIComponent(caseId)}`,
  );
}
