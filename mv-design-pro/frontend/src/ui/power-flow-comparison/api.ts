/**
 * P20c — Power Flow Comparison API Client
 *
 * CANONICAL ALIGNMENT:
 * - Consumes P20c backend power flow comparison endpoint
 * - READ-ONLY: No mutations, no physics
 * - Deterministic: Same inputs → same outputs
 *
 * ENDPOINTS (P20c Backend):
 * - POST /power-flow-comparisons
 * - GET /power-flow-comparisons/{id}
 * - GET /power-flow-comparisons/{id}/results
 * - GET /power-flow-comparisons/{id}/trace
 */

import type {
  PowerFlowComparisonResult,
  PowerFlowComparisonTrace,
  PowerFlowRunItem,
} from './types';
import { bladOdpowiedzi, bladZapytania } from '../../ui2/shared/bladZapytania';

const API_BASE = '/api';

/**
 * Create a power flow comparison between two runs.
 *
 * P20c: Calls backend comparison service.
 * READ-ONLY: No physics, just deterministic comparison.
 *
 * @param runAId UUID pierwszego PowerFlowRun (baseline)
 * @param runBId UUID drugiego PowerFlowRun (porownanie)
 * @returns PowerFlowComparisonResult with bus_diffs, branch_diffs, ranking, and summary
 * @throws Error if runs not compatible (different projects, not FINISHED)
 */
export async function createPowerFlowComparison(
  runAId: string,
  runBId: string
): Promise<PowerFlowComparisonResult> {
  const response = await fetch(`${API_BASE}/power-flow-comparisons`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      power_flow_run_id_a: runAId,
      power_flow_run_id_b: runBId,
    }),
  });

  if (!response.ok) {
    throw await bladOdpowiedzi(response, 'Błąd porównania');
  }

  return response.json();
}

/**
 * Get power flow comparison results.
 *
 * @param comparisonId UUID porownania
 * @returns PowerFlowComparisonResult
 */
export async function getPowerFlowComparisonResults(
  comparisonId: string
): Promise<PowerFlowComparisonResult> {
  const response = await fetch(
    `${API_BASE}/power-flow-comparisons/${comparisonId}/results`
  );

  if (!response.ok) {
    throw await bladOdpowiedzi(response, 'Błąd pobierania wyników');
  }

  return response.json();
}

/**
 * Get power flow comparison trace for audit.
 *
 * @param comparisonId UUID porownania
 * @returns PowerFlowComparisonTrace
 */
export async function getPowerFlowComparisonTrace(
  comparisonId: string
): Promise<PowerFlowComparisonTrace> {
  const response = await fetch(
    `${API_BASE}/power-flow-comparisons/${comparisonId}/trace`
  );

  if (!response.ok) {
    throw await bladOdpowiedzi(response, 'Błąd pobierania śladu');
  }

  return response.json();
}

/**
 * Fetch power flow runs for a project.
 *
 * Returns list of power flow analysis runs, sorted by created_at DESC.
 *
 * @param projectId UUID projektu
 * @returns List of PowerFlowRunItem
 */
export async function fetchPowerFlowRuns(
  projectId: string
): Promise<PowerFlowRunItem[]> {
  const response = await fetch(
    `${API_BASE}/projects/${projectId}/power-flow-runs`
  );

  if (!response.ok) {
    // If endpoint doesn't exist, return empty list
    if (response.status === 404) {
      return [];
    }
    throw bladZapytania(response, 'Błąd pobierania listy przebiegów rozpływu mocy');
  }

  const data = await response.json();

  // Parse runs and filter FINISHED only
  const runs: PowerFlowRunItem[] = (data.runs || data || []).filter(
    (run: PowerFlowRunItem) => run.status === 'FINISHED'
  );

  // Sort by created_at DESC (newest first)
  return runs.sort((a, b) => {
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}
