/**
 * Reference Networks API client (React Query hooks).
 */

import { useMutation, useQuery, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';

import type {
  NcRfgComplianceResponse,
  ReferenceNetworkDetail,
  ReferenceNetworkSummary,
  RunResponse,
  SimilarityMatchResponse,
  ValidationResponse,
} from './types';

const API_BASE = '/api/v1/reference-networks';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API ${response.status}: ${text}`);
  }
  return (await response.json()) as T;
}

export async function fetchReferenceNetworks(): Promise<ReferenceNetworkSummary[]> {
  return fetchJson<ReferenceNetworkSummary[]>(API_BASE);
}

export async function fetchReferenceNetworkDetail(id: string): Promise<ReferenceNetworkDetail> {
  return fetchJson<ReferenceNetworkDetail>(`${API_BASE}/${id}`);
}

export async function runReferenceNetwork(
  id: string,
  solverKind = 'power_flow_newton',
): Promise<RunResponse> {
  return fetchJson<RunResponse>(`${API_BASE}/${id}/run?solver_kind=${solverKind}`, {
    method: 'POST',
  });
}

export async function validateReferenceNetwork(id: string): Promise<ValidationResponse> {
  return fetchJson<ValidationResponse>(`${API_BASE}/${id}/validate`, { method: 'POST' });
}

export async function fetchNcRfgCompliance(id: string): Promise<NcRfgComplianceResponse> {
  return fetchJson<NcRfgComplianceResponse>(`${API_BASE}/${id}/nc-rfg-compliance`);
}

export async function similarityMatch(payload: {
  bus_count: number;
  branch_count: number;
  voltage_kv_levels: number[];
  has_der: boolean;
  is_unbalanced?: boolean;
}): Promise<SimilarityMatchResponse> {
  return fetchJson<SimilarityMatchResponse>(`${API_BASE}/similarity-match`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// =====================================================================
// React Query hooks
// =====================================================================

export function useReferenceNetworks(): UseQueryResult<ReferenceNetworkSummary[], Error> {
  return useQuery({
    queryKey: ['reference-networks', 'list'],
    queryFn: fetchReferenceNetworks,
  });
}

export function useReferenceNetworkDetail(
  id: string | null,
): UseQueryResult<ReferenceNetworkDetail, Error> {
  return useQuery({
    queryKey: ['reference-networks', 'detail', id],
    queryFn: () => fetchReferenceNetworkDetail(id!),
    enabled: Boolean(id),
  });
}

export function useValidateReferenceNetwork(): UseMutationResult<
  ValidationResponse,
  Error,
  string
> {
  return useMutation({
    mutationFn: (id: string) => validateReferenceNetwork(id),
  });
}

export function useNcRfgCompliance(
  id: string | null,
): UseQueryResult<NcRfgComplianceResponse, Error> {
  return useQuery({
    queryKey: ['reference-networks', 'nc-rfg', id],
    queryFn: () => fetchNcRfgCompliance(id!),
    enabled: Boolean(id),
  });
}
