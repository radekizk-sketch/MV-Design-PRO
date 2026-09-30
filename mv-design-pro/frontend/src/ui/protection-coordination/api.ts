/**
 * FIX-12 — Protection Coordination API Client
 *
 * API client for protection coordination analysis endpoints.
 */

import type {
  RunCoordinationRequest,
  CoordinationSummaryResponse,
  CoordinationResult,
  TCCCurve,
  FaultMarker,
  TraceStep,
  SensitivityCheck,
  SelectivityCheck,
  OverloadCheck,
} from './types';

const API_BASE = '/api/protection-coordination';

/**
 * Run protection coordination analysis.
 */
export async function runCoordinationAnalysis(
  projectId: string,
  request: RunCoordinationRequest
): Promise<CoordinationSummaryResponse> {
  const response = await fetch(`${API_BASE}/projects/${projectId}/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { detail?: unknown } | null;
    throw new Error(komunikatOdmowyAnalizy(error?.detail, response.status));
  }

  return response.json();
}

/**
 * Treść odmowy `POST …/run` — backend zwraca `detail` jako tekst (bramka 400) albo
 * rekord: `{powod, komunikat_pl, niezgodnosci?}` (autorytet biegów, 422) lub
 * `{powod, blokady: [{komunikat_pl}]}` (wejście niemiarodajne, 422). Rekord
 * przekazany wprost do `new Error` dawał komunikat „[object Object]".
 */
export function komunikatOdmowyAnalizy(detail: unknown, status: number): string {
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (typeof detail === 'object' && detail !== null && !Array.isArray(detail)) {
    const rekord = detail as {
      komunikat_pl?: unknown;
      niezgodnosci?: unknown;
      blokady?: unknown;
    };
    const czesci: string[] = [];
    if (typeof rekord.komunikat_pl === 'string') czesci.push(rekord.komunikat_pl);
    if (Array.isArray(rekord.niezgodnosci)) {
      czesci.push(...rekord.niezgodnosci.filter((n): n is string => typeof n === 'string'));
    }
    if (Array.isArray(rekord.blokady)) {
      for (const blokada of rekord.blokady) {
        const tekst = (blokada as { komunikat_pl?: unknown } | null)?.komunikat_pl;
        if (typeof tekst === 'string') czesci.push(tekst);
      }
    }
    if (czesci.length > 0) return czesci.join(' ');
  }
  return `Analiza koordynacji odrzucona (HTTP ${status}).`;
}

/**
 * Kolekcje wyniku koordynacji, których ekran używa BEZ warunku (liczniki zakładek,
 * tabele werdyktów, krzywe). Brak którejkolwiek w odpowiedzi wywracał CAŁĄ stronę
 * białym ekranem — `result?.trace_steps.length` chroniło tylko przed `result === null`,
 * a nie przed brakującym polem (V12K-262; ta sama klasa awarii co V12K-252
 * w `nastawyApi`). Lepiej nazwać rozjazd wersji API niż stracić ekran.
 */
const KOLEKCJE_WYNIKU: readonly string[] = [
  'sensitivity_checks',
  'selectivity_checks',
  'overload_checks',
  'tcc_curves',
  'fault_markers',
  'trace_steps',
];

function maKompletneKolekcje(payload: unknown): payload is CoordinationResult {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return false;
  const rekord = payload as Record<string, unknown>;
  return KOLEKCJE_WYNIKU.every((klucz) => Array.isArray(rekord[klucz]));
}

/**
 * Get full coordination analysis result.
 */
export async function getCoordinationResult(
  runId: string
): Promise<CoordinationResult> {
  const response = await fetch(`${API_BASE}/${runId}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Not found' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  const payload: unknown = await response.json();
  if (!maKompletneKolekcje(payload)) {
    const brakujace = KOLEKCJE_WYNIKU.filter(
      (klucz) => !Array.isArray((payload as Record<string, unknown>)?.[klucz]),
    );
    throw new Error(
      'Wynik koordynacji ma niepełny kształt — brak kolekcji: '
      + `${brakujace.join(', ')}. Sprawdź wersję API zabezpieczeń.`,
    );
  }
  return payload;
}

/**
 * Get TCC data for visualization.
 */
export async function getTCCData(
  runId: string
): Promise<{ curves: TCCCurve[]; fault_markers: FaultMarker[] }> {
  const response = await fetch(`${API_BASE}/${runId}/tcc`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Not found' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Get WHITE BOX trace.
 */
export async function getCoordinationTrace(
  runId: string
): Promise<{ run_id: string; trace_steps: TraceStep[]; created_at: string }> {
  const response = await fetch(`${API_BASE}/${runId}/trace`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Not found' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Get sensitivity checks.
 */
export async function getSensitivityChecks(
  runId: string
): Promise<SensitivityCheck[]> {
  const response = await fetch(`${API_BASE}/${runId}/checks/sensitivity`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Not found' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Get selectivity checks.
 */
export async function getSelectivityChecks(
  runId: string
): Promise<SelectivityCheck[]> {
  const response = await fetch(`${API_BASE}/${runId}/checks/selectivity`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Not found' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Get overload checks.
 */
export async function getOverloadChecks(
  runId: string
): Promise<OverloadCheck[]> {
  const response = await fetch(`${API_BASE}/${runId}/checks/overload`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Not found' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Export coordination result to PDF.
 */
export function getExportPdfUrl(runId: string): string {
  return `${API_BASE}/${runId}/export/pdf`;
}

/**
 * Export coordination result to DOCX.
 */
export function getExportDocxUrl(runId: string): string {
  return `${API_BASE}/${runId}/export/docx`;
}
