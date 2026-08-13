/*
 * Klient końcówek powierzchni „Diagnoza przebiegu" (karta DIAGNOZA-PRZEBIEGU, D7).
 *
 * Typy odwzorowują 1:1 ZMIERZONY kształt odpowiedzi backendu (mapowanie
 * plik:linia — nie z pamięci, tylko z kodu):
 *
 * - `GET /api/cases/{case_id}/diagnostics/preflight`
 *   `backend/src/api/diagnostics.py::get_preflight` →
 *   `diagnostics/preflight.py::PreflightReport.to_dict` (ready, overall_status,
 *   checks[analysis_type, analysis_label_pl, status, reason_pl, blocking_codes],
 *   blocker_count, warning_count).
 * - `GET /api/cases/{case_id}/diagnostics`
 *   `backend/src/api/diagnostics.py::get_diagnostics` →
 *   `diagnostics/models.py::DiagnosticReport.to_dict` (status, issues[code,
 *   severity, message_pl, affected_refs, hints], analysis_matrix, blocker_count,
 *   warning_count, info_count).
 * - `GET /api/execution/runs/{run_id}/diagnostics`
 *   `backend/src/api/diagnostics.py::get_run_diagnostics` →
 *   `application/analyses/diagnoza_przebiegu.py::zbuduj_diagnoze_przebiegu`.
 *
 * Warstwa PREZENTACJI: wyłącznie odczyt (GET), zero fizyki, zero mutacji modelu.
 * Pola, których ta powierzchnia NIE konsumuje (`analysis_matrix`,
 * `reporting_limitations`, `quality_status`), są w kontrakcie backendu, ale nie
 * ma ich w typach niżej — kontrakt dwustronny brzmi „konsumowane ⊆ wystawiane",
 * nie „równe". `analysis_matrix` pomijamy, bo pre-flight niesie tę samą treść w
 * formie gotowej do tabeli; `reporting_limitations` i `quality_status` — bo
 * powielają werdykt `code` w postaci surowych kodów angielskich, których na
 * ekranie być nie może.
 */

/** Wiersz tabeli kontroli przed obliczeniem (jedna analiza). */
export interface KontrolaPrzedObliczeniem {
  readonly analysis_type: string;
  readonly analysis_label_pl: string;
  /** "AVAILABLE" | "BLOCKED" — etykieta PL w `kodyDiagnozy.etykietaDostepnosci`. */
  readonly status: string;
  /** Zdanie backendu Z WKLEJONYMI kodami — NIE renderujemy go (patrz kodyDiagnozy). */
  readonly reason_pl: string | null;
  /** Kody reguł blokujących — tłumaczone na zdania w `kodyDiagnozy.zdaniaBlokad`. */
  readonly blocking_codes: readonly string[];
}

/** Odpowiedź `GET /api/cases/{case_id}/diagnostics/preflight`. */
export interface PreflightOdpowiedz {
  readonly ready: boolean;
  readonly overall_status: string;
  readonly checks: readonly KontrolaPrzedObliczeniem[];
  readonly blocker_count: number;
  readonly warning_count: number;
}

/** Pojedynczy problem modelu wykryty przez silnik diagnostyczny. */
export interface ProblemModelu {
  readonly code: string;
  /** "BLOCKER" | "WARN" | "INFO". */
  readonly severity: string;
  readonly message_pl: string;
  readonly affected_refs: readonly string[];
  readonly hints: readonly string[];
}

/** Odpowiedź `GET /api/cases/{case_id}/diagnostics`. */
export interface DiagnostykaOdpowiedz {
  readonly status: string;
  readonly issues: readonly ProblemModelu[];
  readonly blocker_count: number;
  readonly warning_count: number;
  readonly info_count: number;
}

/** Jedna iteracja solvera — dowód WHITE BOX przebiegu zbieżności. */
export interface IteracjaPrzebiegu {
  readonly iteracja: number;
  readonly niedopasowanie_pu: number | null;
  readonly norma_niedopasowania_pu: number | null;
  readonly przyczyna_przerwania: string | null;
}

/** Odpowiedź `GET /api/execution/runs/{run_id}/diagnostics`. */
export interface DiagnozaPrzebieguOdpowiedz {
  readonly run_id: string;
  readonly case_id: string;
  readonly analysis_type: string;
  readonly run_status: string;
  readonly iterative: boolean;
  /** Kod diagnozy `PRZ-*` — zdanie w `kodyDiagnozy.zdanieDiagnozy`. */
  readonly code: string;
  readonly converged: boolean | null;
  readonly iterations_count: number | null;
  readonly max_iterations: number | null;
  readonly tolerance: number | null;
  readonly final_mismatch_pu: number | null;
  readonly cause_if_failed: string | null;
  readonly unsolved_node_ids: readonly string[];
  readonly error_message: string | null;
  readonly iteration_history: readonly IteracjaPrzebiegu[];
}

async function pobierzJson<T>(adres: string): Promise<T> {
  const odpowiedz = await fetch(adres);
  if (!odpowiedz.ok) {
    throw new Error(`Request ${adres} failed: ${odpowiedz.status} ${odpowiedz.statusText}`);
  }
  return odpowiedz.json() as Promise<T>;
}

/** Kontrola przed obliczeniem dla przypadku (macierz dostępności analiz). */
export function pobierzPreflight(caseId: string): Promise<PreflightOdpowiedz> {
  return pobierzJson<PreflightOdpowiedz>(
    `/api/cases/${encodeURIComponent(caseId)}/diagnostics/preflight`,
  );
}

/** Problemy modelu wykryte przez silnik diagnostyczny. */
export function pobierzDiagnostykeModelu(caseId: string): Promise<DiagnostykaOdpowiedz> {
  return pobierzJson<DiagnostykaOdpowiedz>(
    `/api/cases/${encodeURIComponent(caseId)}/diagnostics`,
  );
}

/** Diagnoza pojedynczego biegu (zbieżność + dowód liczbowy). */
export function pobierzDiagnozePrzebiegu(runId: string): Promise<DiagnozaPrzebieguOdpowiedz> {
  return pobierzJson<DiagnozaPrzebieguOdpowiedz>(
    `/api/execution/runs/${encodeURIComponent(runId)}/diagnostics`,
  );
}
