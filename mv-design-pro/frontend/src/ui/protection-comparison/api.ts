/**
 * P15b — Protection Comparison API Client
 *
 * CANONICAL ALIGNMENT:
 * - Consumes P15b backend protection comparison endpoint
 * - READ-ONLY: No mutations, no physics
 * - Deterministic: Same inputs → same outputs
 *
 * ENDPOINTS (P15b Backend):
 * - POST /protection-comparisons
 * - GET /protection-comparisons/{id}
 * - GET /protection-comparisons/{id}/results
 * - GET /protection-comparisons/{id}/trace
 */

import type {
  ProtectionComparisonResult,
  ProtectionComparisonTrace,
  ProtectionRunItem,
} from './types';

const API_BASE = '/api';

/**
 * Create a protection comparison between two runs.
 *
 * P15b: Calls backend comparison service.
 * READ-ONLY: No physics, just deterministic comparison.
 *
 * @param runAId UUID pierwszego ProtectionRun (baseline)
 * @param runBId UUID drugiego ProtectionRun (porównanie)
 * @returns ProtectionComparisonResult with rows, ranking, and summary
 * @throws Error if runs not compatible (different projects, not FINISHED)
 */
export async function createProtectionComparison(
  runAId: string,
  runBId: string
): Promise<ProtectionComparisonResult> {
  const response = await fetch(`${API_BASE}/protection-comparisons`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      protection_run_id_a: runAId,
      protection_run_id_b: runBId,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.detail || response.statusText;
    throw new Error(`Błąd porównania: ${errorMessage}`);
  }

  return response.json();
}

/**
 * Get protection comparison results.
 *
 * @param comparisonId UUID porównania
 * @returns ProtectionComparisonResult
 */
export async function getProtectionComparisonResults(
  comparisonId: string
): Promise<ProtectionComparisonResult> {
  const response = await fetch(
    `${API_BASE}/protection-comparisons/${comparisonId}/results`
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.detail || response.statusText;
    throw new Error(`Błąd pobierania wyników: ${errorMessage}`);
  }

  return response.json();
}

/**
 * Get protection comparison trace for audit.
 *
 * @param comparisonId UUID porównania
 * @returns ProtectionComparisonTrace
 */
export async function getProtectionComparisonTrace(
  comparisonId: string
): Promise<ProtectionComparisonTrace> {
  const response = await fetch(
    `${API_BASE}/protection-comparisons/${comparisonId}/trace`
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.detail || response.statusText;
    throw new Error(`Błąd pobierania śladu: ${errorMessage}`);
  }

  return response.json();
}

/**
 * Fetch protection runs for a project.
 *
 * Returns list of protection analysis runs, sorted by created_at DESC.
 *
 * @param projectId UUID projektu
 * @returns List of ProtectionRunItem
 */
export async function fetchProtectionRuns(
  projectId: string
): Promise<ProtectionRunItem[]> {
  const response = await fetch(
    `${API_BASE}/projects/${projectId}/protection-runs`
  );

  if (!response.ok) {
    // Obronnie: pusty projekt (brak przypadku/biegów) — endpoint istnieje
    // (`GET /projects/{id}/protection-runs`, karta CV-3.3-B) i normalnie
    // zwraca 200 z pustą listą; 404 tu oznacza brak samego projektu.
    if (response.status === 404) {
      return [];
    }
    throw new Error(
      `Błąd pobierania listy runów zabezpieczeń: ${response.statusText}`
    );
  }

  const data = await response.json();

  // Parse runs and filter FINISHED only
  const runs: ProtectionRunItem[] = (data.runs || data || []).filter(
    (run: ProtectionRunItem) => run.status === 'FINISHED'
  );

  // Sort by created_at DESC (newest first)
  return runs.sort((a, b) => {
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}
