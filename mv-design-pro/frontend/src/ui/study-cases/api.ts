/**
 * Study Cases API Client — P10 FULL MAX
 *
 * API functions for study case management.
 */

import type {
  StudyCase,
  StudyCaseListItem,
  StudyCaseComparison,
  CreateStudyCaseRequest,
  UpdateStudyCaseRequest,
  ExecutionRun,
  ExecutionResultSet,
  CreateRunRequest,
  BatchJob,
  CreateBatchRequest,
} from './types';
import { STANY_KONCOWE_SERII, czyStanKoncowyBiegu } from './types';
import { bladOdpowiedzi } from '../../ui2/shared/bladZapytania';

const API_BASE = '/api/study-cases';
const EXECUTION_BASE = '/api/execution';

function buildCreateRunBody(request: CreateRunRequest): CreateRunRequest {
  const body: CreateRunRequest = {
    analysis_type: request.analysis_type,
  };
  if (request.solver_input !== undefined) {
    body.solver_input = request.solver_input;
  }
  if (request.scenario_id !== undefined) {
    body.scenario_id = request.scenario_id;
  }
  if (request.readiness !== undefined) {
    body.readiness = request.readiness;
  }
  if (request.eligibility !== undefined) {
    body.eligibility = request.eligibility;
  }
  return body;
}

/**
 * Handle API response errors.
 */
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw await bladOdpowiedzi(response);
  }
  return response.json();
}

/**
 * Create a new study case.
 */
export async function createStudyCase(request: CreateStudyCaseRequest): Promise<StudyCase> {
  const response = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return handleResponse<StudyCase>(response);
}

/**
 * Get a study case by ID.
 */
export async function getStudyCase(caseId: string): Promise<StudyCase> {
  const response = await fetch(`${API_BASE}/${caseId}`);
  return handleResponse<StudyCase>(response);
}

/**
 * List all study cases for a project.
 */
export async function listStudyCases(projectId: string): Promise<StudyCaseListItem[]> {
  const response = await fetch(`${API_BASE}/project/${projectId}`);
  return handleResponse<StudyCaseListItem[]>(response);
}

/**
 * Update a study case.
 */
export async function updateStudyCase(
  caseId: string,
  request: UpdateStudyCaseRequest
): Promise<StudyCase> {
  const response = await fetch(`${API_BASE}/${caseId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return handleResponse<StudyCase>(response);
}

/**
 * Delete a study case.
 */
export async function deleteStudyCase(caseId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/${caseId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw await bladOdpowiedzi(response);
  }
}

/**
 * Clone a study case.
 */
export async function cloneStudyCase(
  caseId: string,
  newName?: string
): Promise<StudyCase> {
  const response = await fetch(`${API_BASE}/${caseId}/clone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_name: newName }),
  });
  return handleResponse<StudyCase>(response);
}

/**
 * Get the active study case for a project.
 */
export async function getActiveStudyCase(projectId: string): Promise<StudyCase | null> {
  const response = await fetch(`${API_BASE}/project/${projectId}/active`);
  if (response.status === 204 || response.status === 404) {
    return null;
  }
  return handleResponse<StudyCase | null>(response);
}

/**
 * Set a study case as active.
 */
export async function setActiveStudyCase(
  projectId: string,
  caseId: string
): Promise<StudyCase> {
  const response = await fetch(`${API_BASE}/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: projectId, case_id: caseId }),
  });
  return handleResponse<StudyCase>(response);
}

/**
 * Compare two study cases.
 */
export async function compareStudyCases(
  caseAId: string,
  caseBId: string
): Promise<StudyCaseComparison> {
  const response = await fetch(`${API_BASE}/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ case_a_id: caseAId, case_b_id: caseBId }),
  });
  return handleResponse<StudyCaseComparison>(response);
}

/**
 * Check if a case can be calculated.
 */
export async function canCalculateCase(
  caseId: string
): Promise<{ can_calculate: boolean; error: string | null }> {
  const response = await fetch(`${API_BASE}/${caseId}/can-calculate`);
  return handleResponse<{ can_calculate: boolean; error: string | null }>(response);
}

/**
 * Count study cases in a project.
 */
export async function countStudyCases(projectId: string): Promise<{ count: number }> {
  const response = await fetch(`${API_BASE}/project/${projectId}/count`);
  return handleResponse<{ count: number }>(response);
}

// =============================================================================
// PR-14: Execution Runs API
// =============================================================================

/**
 * Create a new execution run for a study case.
 */
export async function createRun(
  caseId: string,
  request: CreateRunRequest
): Promise<ExecutionRun> {
  const response = await fetch(`${EXECUTION_BASE}/study-cases/${caseId}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildCreateRunBody(request)),
  });
  return handleResponse<ExecutionRun>(response);
}

/**
 * List runs for a study case.
 */
export async function listRuns(
  caseId: string
): Promise<{ runs: ExecutionRun[]; count: number }> {
  const response = await fetch(`${EXECUTION_BASE}/study-cases/${caseId}/runs`);
  return handleResponse<{ runs: ExecutionRun[]; count: number }>(response);
}

/**
 * Zleć bieg wykonawcy w tle (karta DYNAMIKA-W-TLE): backend odpowiada 202 ze stanem
 * `QUEUED` (albo stanem bieżącym, gdy bieg był już zlecony) i wraca natychmiast —
 * wynik jest dostępny dopiero po dojściu stanu do DONE/FAILED/CANCELLED
 * (`executeRunAndWait`, `getRun`).
 */
export async function executeRun(runId: string): Promise<ExecutionRun> {
  const response = await fetch(`${EXECUTION_BASE}/runs/${runId}/execute`, {
    method: 'POST',
  });
  return handleResponse<ExecutionRun>(response);
}

/**
 * Anuluj bieg: w kolejce — natychmiast (CANCELLED); w toku — w najbliższym punkcie
 * przerwania wykonawcy (odpowiedź niesie stan bieżący, odpytuj do CANCELLED).
 * Bieg zakończony albo w toku bez punktów przerwania → 409 z nazwanym powodem.
 */
export async function cancelRun(runId: string): Promise<ExecutionRun> {
  const response = await fetch(`${EXECUTION_BASE}/runs/${runId}/cancel`, {
    method: 'POST',
  });
  return handleResponse<ExecutionRun>(response);
}

/** Odstęp odpytywania stanu biegu w tle [ms] — jedna wartość dla całego frontu. */
export const ODSTEP_ODPYTYWANIA_BIEGU_MS = 750;

export interface OpcjeOczekiwaniaNaBieg {
  /** Wołane po każdym odczycie stanu (postęp, stan kolejki). */
  onStan?: (bieg: ExecutionRun) => void;
  /** Wstrzykiwalne oczekiwanie (testy bez zegara rzeczywistego). */
  czekaj?: (ms: number) => Promise<void>;
}

const czekajDomyslnie = (ms: number): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, ms));

/**
 * Odpytuj stan biegu do stanu końcowego (DONE/FAILED/CANCELLED). Bez limitu prób:
 * wykonawca w tle gwarantuje stan końcowy (zakończenie, odmowa, anulowanie albo
 * zamknięcie biegu osieroconego po restarcie procesu), a błąd sieci przerywa pętlę
 * wyjątkiem.
 */
export async function waitForRunTerminalState(
  poczatkowy: ExecutionRun,
  opcje: OpcjeOczekiwaniaNaBieg = {},
): Promise<ExecutionRun> {
  const czekaj = opcje.czekaj ?? czekajDomyslnie;
  let biezacy = poczatkowy;
  opcje.onStan?.(biezacy);
  while (!czyStanKoncowyBiegu(biezacy.status)) {
    await czekaj(ODSTEP_ODPYTYWANIA_BIEGU_MS);
    biezacy = await getRun(biezacy.id);
    opcje.onStan?.(biezacy);
  }
  return biezacy;
}

/** Zleć bieg (202) i odpytuj do stanu końcowego — JEDNA ścieżka dla każdego klienta. */
export async function executeRunAndWait(
  runId: string,
  opcje: OpcjeOczekiwaniaNaBieg = {},
): Promise<ExecutionRun> {
  return waitForRunTerminalState(await executeRun(runId), opcje);
}

/**
 * Get run details.
 */
export async function getRun(runId: string): Promise<ExecutionRun> {
  const response = await fetch(`${EXECUTION_BASE}/runs/${runId}`);
  return handleResponse<ExecutionRun>(response);
}

/**
 * Get result set for a run.
 */
export async function getRunResults(runId: string): Promise<ExecutionResultSet> {
  const response = await fetch(`${EXECUTION_BASE}/runs/${runId}/results`);
  return handleResponse<ExecutionResultSet>(response);
}

// =============================================================================
// Serie przebiegów (wsad) — karta BATCH-ROUTER
// =============================================================================

/**
 * Utwórz serię przebiegów nad scenariuszami zwarciowymi przypadku.
 */
export async function createBatch(
  caseId: string,
  request: CreateBatchRequest
): Promise<BatchJob> {
  const response = await fetch(`${EXECUTION_BASE}/study-cases/${caseId}/batches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return handleResponse<BatchJob>(response);
}

/** Szczegóły serii (stan, pozycje ze świeżością) — odpytywanie serii w tle. */
export async function getBatch(batchId: string): Promise<BatchJob> {
  const response = await fetch(`${EXECUTION_BASE}/batches/${batchId}`);
  return handleResponse<BatchJob>(response);
}

/**
 * Anuluj serię: z kolejki natychmiast, w toku — po bieżącej pozycji.
 */
export async function cancelBatch(batchId: string): Promise<BatchJob> {
  const response = await fetch(`${EXECUTION_BASE}/batches/${batchId}/cancel`, {
    method: 'POST',
  });
  return handleResponse<BatchJob>(response);
}

/** Zleć serię (202, QUEUED) i odpytuj `getBatch` do stanu końcowego serii. */
export async function executeBatchAndWait(
  batchId: string,
  opcje: { onStan?: (seria: BatchJob) => void; czekaj?: (ms: number) => Promise<void> } = {},
): Promise<BatchJob> {
  const czekaj = opcje.czekaj ?? czekajDomyslnie;
  let biezaca = await executeBatch(batchId);
  opcje.onStan?.(biezaca);
  while (!STANY_KONCOWE_SERII.has(biezaca.status)) {
    await czekaj(ODSTEP_ODPYTYWANIA_BIEGU_MS);
    biezaca = await getBatch(batchId);
    opcje.onStan?.(biezaca);
  }
  return biezaca;
}

/**
 * Zleć serię przebiegów wykonawcy w tle (202, stan QUEUED; sekwencyjnie, torem kanonicznym).
 */
export async function executeBatch(batchId: string): Promise<BatchJob> {
  const response = await fetch(`${EXECUTION_BASE}/batches/${batchId}/execute`, {
    method: 'POST',
  });
  return handleResponse<BatchJob>(response);
}

/**
 * Lista serii przebiegów przypadku (najnowsze pierwsze).
 */
export async function listBatches(
  caseId: string
): Promise<{ batches: BatchJob[]; count: number }> {
  const response = await fetch(`${EXECUTION_BASE}/study-cases/${caseId}/batches`);
  return handleResponse<{ batches: BatchJob[]; count: number }>(response);
}
