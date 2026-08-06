/**
 * P20b — Power Flow Results Inspector API Client
 *
 * CANONICAL ALIGNMENT:
 * - Consumes P20a/P20b backend endpoints
 * - READ-ONLY: No mutations, no physics
 * - Deterministic: Same inputs → same outputs
 *
 * ENDPOINTS (kanon `/api` — karta PREFIKSY):
 * - GET /api/projects/{project_id}/power-flow-runs (list)
 * - GET /api/power-flow-runs/{run_id} (metadata)
 * - GET /api/power-flow-runs/{run_id}/results (PowerFlowResultV1)
 * - GET /api/power-flow-runs/{run_id}/trace (PowerFlowTrace)
 * - GET /api/power-flow-runs/{run_id}/interpretation (PowerFlowInterpretation)
 *
 * Klient wolal te adresy z prefiksem `/api` juz wczesniej, ale router stal poza
 * `/api` — kazde wejscie w wyniki rozplywu konczylo sie 404. Przeniesienie
 * routera pod kanon (`api/main.py`) zlikwidowalo rozjazd u zrodla.
 */

import type {
  PowerFlowRunListResponse,
  PowerFlowRunHeader,
  PowerFlowResultV1,
  PowerFlowTrace,
  PowerFlowInterpretation,
} from './types';
import { mergeAnalysisCaseContexts } from '../results-inspector/analysisCaseContextView';

const API_BASE = '/api';

type LegacyPowerFlowRunHeader = Omit<PowerFlowRunHeader, 'study_case_id'> & {
  study_case_id?: string;
};

function normalizePowerFlowRunHeader(payload: LegacyPowerFlowRunHeader): PowerFlowRunHeader {
  const analysisCaseContext = mergeAnalysisCaseContexts(
    payload.analysis_case_context,
    payload.input_metadata?.analysis_case_context,
  );
  if (!payload.study_case_id) {
    throw new Error('Brak `study_case_id` w kanonicznym nagłówku uruchomienia.');
  }

  return {
    ...payload,
    study_case_id: payload.study_case_id,
    analysis_case_context: analysisCaseContext,
    input_metadata: payload.input_metadata
      ? {
          ...payload.input_metadata,
          analysis_case_context: analysisCaseContext,
        }
      : payload.input_metadata,
  };
}

/**
 * Fetch list of power flow runs for a project.
 *
 * Results are deterministically sorted by created_at DESC.
 */
export async function fetchPowerFlowRuns(
  projectId: string,
  status?: string
): Promise<PowerFlowRunListResponse> {
  const params = new URLSearchParams();
  if (status) {
    params.set('status', status);
  }
  const queryString = params.toString();
  const url = `${API_BASE}/projects/${projectId}/power-flow-runs${queryString ? `?${queryString}` : ''}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Blad pobierania listy rozpywow: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Fetch power flow run metadata.
 */
export async function fetchPowerFlowRunHeader(runId: string): Promise<PowerFlowRunHeader> {
  const response = await fetch(`${API_BASE}/power-flow-runs/${runId}`);
  if (!response.ok) {
    throw new Error(`Blad pobierania metadanych run: ${response.statusText}`);
  }
  return normalizePowerFlowRunHeader(await response.json());
}

/**
 * Fetch power flow results (PowerFlowResultV1).
 *
 * Results are deterministically sorted by bus_id/branch_id.
 */
export async function fetchPowerFlowResults(runId: string): Promise<PowerFlowResultV1> {
  const response = await fetch(`${API_BASE}/power-flow-runs/${runId}/results`);
  if (!response.ok) {
    throw new Error(`Blad pobierania wynikow rozpywu: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Fetch power flow trace (PowerFlowTrace).
 *
 * Returns white-box trace with per-iteration details.
 */
export async function fetchPowerFlowTrace(runId: string): Promise<PowerFlowTrace> {
  const response = await fetch(`${API_BASE}/power-flow-runs/${runId}/trace`);
  if (!response.ok) {
    throw new Error(`Blad pobierania sladu obliczen: ${response.statusText}`);
  }
  return response.json();
}

/**
 * P22: Fetch power flow interpretation.
 *
 * Returns interpretation with voltage/branch findings, summary, and trace.
 * DETERMINISTIC: Same run -> identical interpretation.
 * CACHED: Backend caches 1 run -> 1 interpretation.
 */
export async function fetchPowerFlowInterpretation(runId: string): Promise<PowerFlowInterpretation> {
  const response = await fetch(`${API_BASE}/power-flow-runs/${runId}/interpretation`);
  if (!response.ok) {
    throw new Error(`Blad pobierania interpretacji: ${response.statusText}`);
  }
  return response.json();
}
