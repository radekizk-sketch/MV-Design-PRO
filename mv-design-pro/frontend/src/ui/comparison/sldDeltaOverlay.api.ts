/**
 * SC Comparison API Client -- PR-21
 *
 * API functions for SC comparison and delta overlay operations.
 * Uses fetch API. Polish error messages from backend.
 */

import type {
  SCComparison,
  ComparisonListResponse,
  CreateComparisonRequest,
  DeltaOverlayPayload,
} from './sldDeltaOverlay.types';

const API_BASE = '/api/execution';

/**
 * Handle API response errors.
 */
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.detail || `Blad HTTP: ${response.status}`
    );
  }
  return response.json();
}

/**
 * Create a new comparison between two SC runs.
 */
export async function createComparison(
  studyCaseId: string,
  request: CreateComparisonRequest
): Promise<SCComparison> {
  const response = await fetch(
    `${API_BASE}/study-cases/${studyCaseId}/comparisons`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    }
  );
  return handleResponse<SCComparison>(response);
}

/**
 * Get comparison details by ID.
 */
export async function getComparison(
  comparisonId: string
): Promise<SCComparison> {
  const response = await fetch(
    `${API_BASE}/comparisons/${comparisonId}`
  );
  return handleResponse<SCComparison>(response);
}

/**
 * List all comparisons for a study case.
 */
export async function listComparisons(
  studyCaseId: string
): Promise<ComparisonListResponse> {
  const response = await fetch(
    `${API_BASE}/study-cases/${studyCaseId}/comparisons`
  );
  return handleResponse<ComparisonListResponse>(response);
}

/**
 * Fetch the SLD delta overlay for a comparison.
 * Returns OverlayPayloadV1 compatible payload.
 */
export async function fetchDeltaOverlay(
  comparisonId: string
): Promise<DeltaOverlayPayload> {
  const response = await fetch(
    `${API_BASE}/comparisons/${comparisonId}/sld-delta-overlay`
  );
  return handleResponse<DeltaOverlayPayload>(response);
}
