/**
 * P11c — Results Comparison API Client
 *
 * CANONICAL ALIGNMENT:
 * - Consumes P10b backend comparison endpoint
 * - READ-ONLY: No mutations, no physics
 * - Deterministic: Same inputs → same outputs
 *
 * ENDPOINTS (P10b Backend):
 * - POST /api/comparison/runs
 * - GET /api/analysis-runs (list runs for project/case)
 */

import type { RunComparisonResult, RunHistoryItem } from './types';
import { bladOdpowiedzi, bladZapytania } from '../../ui2/shared/bladZapytania';

const API_BASE = '/api';

/**
 * Compare two study runs.
 *
 * P10b: Calls backend comparison service to compute deltas.
 * READ-ONLY: No physics, just arithmetic comparison.
 *
 * @param runAId UUID pierwszego Run (baseline)
 * @param runBId UUID drugiego Run (porównanie)
 * @returns RunComparisonResult with all computed deltas
 * @throws Error if runs not compatible (different projects/analysis types)
 */
export async function compareRuns(
  runAId: string,
  runBId: string
): Promise<RunComparisonResult> {
  const response = await fetch(`${API_BASE}/comparison/runs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      run_a_id: runAId,
      run_b_id: runBId,
    }),
  });

  if (!response.ok) {
    throw await bladOdpowiedzi(response, 'Błąd porównania przebiegów');
  }

  return response.json();
}

/**
 * Fetch run history for a project.
 *
 * Returns list of all runs for the project, sorted by created_at DESC (newest first).
 * Used for Results Browser tree and comparison selectors.
 *
 * @param projectId UUID projektu
 * @returns List of RunHistoryItem
 */
export async function fetchRunHistory(projectId: string): Promise<RunHistoryItem[]> {
  const response = await fetch(`${API_BASE}/projects/${projectId}/runs`);

  if (!response.ok) {
    throw bladZapytania(response, 'Błąd pobierania historii przebiegów');
  }

  const data = await response.json();

  // Backend should return runs sorted by created_at DESC
  // If not, we sort here for determinism
  const runs = data.runs || data || [];
  return runs.sort((a: RunHistoryItem, b: RunHistoryItem) => {
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

/**
 * Fetch run history for a specific case.
 *
 * Returns list of runs for the case, sorted by created_at DESC (newest first).
 *
 * @param caseId UUID przypadku
 * @returns List of RunHistoryItem
 */
export async function fetchCaseRunHistory(caseId: string): Promise<RunHistoryItem[]> {
  const response = await fetch(`${API_BASE}/study-cases/${caseId}/runs`);

  if (!response.ok) {
    throw bladZapytania(response, 'Błąd pobierania historii przebiegów dla przypadku');
  }

  const data = await response.json();

  const runs = data.runs || data || [];
  return runs.sort((a: RunHistoryItem, b: RunHistoryItem) => {
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}
