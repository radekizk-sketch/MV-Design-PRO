import { useEffect, useMemo, useState } from 'react';
import { useAppStateStore } from '../app-state/store';
import { useSnapshotStore } from '../topology/snapshotStore';
import type { ElementProtectionAssignment } from './element-assignment';
import type { ElementDiagnostics, ProtectionSanityCheckResult } from './sanity-types';
import { groupResultsByElement } from './sanity-types';
import type { ProtectionSummary } from '../sld/protection/types';

export interface ProtectionReadModelStatus {
  data_source: 'ENM_PROTECTION_READ_MODEL';
  result_state: 'NONE' | 'FRESH';
  has_protection_data: boolean;
}

export interface ProtectionReadModelSummary {
  total_elements: number;
  total_assignments: number;
  active_assignments: number;
  blocked_assignments: number;
  complete_count: number;
  incomplete_count: number;
  verified_count: number;
  failed_count: number;
  no_data_count: number;
  error_count: number;
  warn_count: number;
  info_count: number;
}

export interface ProtectionReadModelResponse {
  case_id: string;
  enm_revision: number;
  view_status: ProtectionReadModelStatus;
  summary: ProtectionReadModelSummary;
  assignments: ElementProtectionAssignment[];
  diagnostics: ProtectionSanityCheckResult[];
  summaries: ProtectionSummary[];
}

interface ProtectionReadModelState {
  data: ProtectionReadModelResponse;
  isLoading: boolean;
  error: string | null;
}

export interface ProtectionReadModelView extends ProtectionReadModelState {
  assignmentsByElement: Map<string, ElementProtectionAssignment[]>;
  diagnosticsByElement: Map<string, ElementDiagnostics>;
  summariesByElement: Map<string, ProtectionSummary>;
  elementsWithProtection: Set<string>;
  elementsWithDiagnostics: Set<string>;
  viewStatus: ProtectionReadModelStatus;
  summary: ProtectionReadModelSummary;
  statistics: {
    total: number;
    complete: number;
    incomplete: number;
    verified: number;
    failed: number;
    noData: number;
  };
}

export const EMPTY_PROTECTION_READ_MODEL: ProtectionReadModelResponse = {
  case_id: '',
  enm_revision: 0,
  view_status: {
    data_source: 'ENM_PROTECTION_READ_MODEL',
    result_state: 'NONE',
    has_protection_data: false,
  },
  summary: {
    total_elements: 0,
    total_assignments: 0,
    active_assignments: 0,
    blocked_assignments: 0,
    complete_count: 0,
    incomplete_count: 0,
    verified_count: 0,
    failed_count: 0,
    no_data_count: 0,
    error_count: 0,
    warn_count: 0,
    info_count: 0,
  },
  assignments: [],
  diagnostics: [],
  summaries: [],
};

const cache = new Map<string, ProtectionReadModelResponse>();
const pending = new Map<string, Promise<ProtectionReadModelResponse>>();
let lastSuccessfulData: ProtectionReadModelResponse = EMPTY_PROTECTION_READ_MODEL;

function buildCacheKey(caseId: string, revision: number | null): string {
  return `${caseId}:${revision ?? 'live'}`;
}

function normalizeProtectionReadModelResponse(
  payload: Partial<ProtectionReadModelResponse> | null | undefined,
): ProtectionReadModelResponse {
  return {
    ...EMPTY_PROTECTION_READ_MODEL,
    ...payload,
    view_status: {
      ...EMPTY_PROTECTION_READ_MODEL.view_status,
      ...(payload?.view_status ?? {}),
    },
    summary: {
      ...EMPTY_PROTECTION_READ_MODEL.summary,
      ...(payload?.summary ?? {}),
    },
    assignments: Array.isArray(payload?.assignments) ? payload.assignments : [],
    diagnostics: Array.isArray(payload?.diagnostics) ? payload.diagnostics : [],
    summaries: Array.isArray(payload?.summaries) ? payload.summaries : [],
  };
}

async function fetchProtectionReadModel(caseId: string): Promise<ProtectionReadModelResponse> {
  const response = await fetch(`/api/cases/${caseId}/enm/protection-view`);
  if (!response.ok) {
    throw new Error(`Nie udało się pobrać widoku zabezpieczeń: ${response.statusText}`);
  }
  return normalizeProtectionReadModelResponse(
    (await response.json()) as Partial<ProtectionReadModelResponse>,
  );
}

function ensureProtectionReadModel(
  caseId: string,
  revision: number | null,
): Promise<ProtectionReadModelResponse> {
  const key = buildCacheKey(caseId, revision);
  const cached = cache.get(key);
  if (cached) {
    return Promise.resolve(cached);
  }

  const activePending = pending.get(key);
  if (activePending) {
    return activePending;
  }

  const request = fetchProtectionReadModel(caseId)
    .then((data) => {
      cache.set(key, data);
      lastSuccessfulData = data;
      return data;
    })
    .finally(() => {
      pending.delete(key);
    });

  pending.set(key, request);
  return request;
}

function createAssignmentMap(
  assignments: ElementProtectionAssignment[],
): Map<string, ElementProtectionAssignment[]> {
  const map = new Map<string, ElementProtectionAssignment[]>();
  for (const assignment of assignments) {
    const existing = map.get(assignment.element_id);
    if (existing) {
      existing.push(assignment);
      continue;
    }
    map.set(assignment.element_id, [assignment]);
  }
  return map;
}

function createSummaryMap(summaries: ProtectionSummary[]): Map<string, ProtectionSummary> {
  return new Map(summaries.map((summary) => [summary.element_id, summary] as const));
}

function buildStatistics(summary: ProtectionReadModelSummary) {
  const safeSummary = summary ?? EMPTY_PROTECTION_READ_MODEL.summary;
  return {
    total: safeSummary.total_elements,
    complete: safeSummary.complete_count,
    incomplete: safeSummary.incomplete_count,
    verified: safeSummary.verified_count,
    failed: safeSummary.failed_count,
    noData: safeSummary.no_data_count,
  };
}

export function useProtectionReadModel(): ProtectionReadModelView {
  const caseId = useAppStateStore((state) => state.activeCaseId);
  const revision = useSnapshotStore((state) => state.snapshot?.header.revision ?? null);

  const [state, setState] = useState<ProtectionReadModelState>(() => ({
    data: EMPTY_PROTECTION_READ_MODEL,
    isLoading: false,
    error: null,
  }));

  useEffect(() => {
    if (!caseId) {
      setState({
        data: EMPTY_PROTECTION_READ_MODEL,
        isLoading: false,
        error: null,
      });
      return;
    }

    const key = buildCacheKey(caseId, revision);
    const cached = cache.get(key);
    if (cached) {
      const normalizedCached = normalizeProtectionReadModelResponse(cached);
      lastSuccessfulData = normalizedCached;
      setState({
        data: normalizedCached,
        isLoading: false,
        error: null,
      });
      return;
    }

    let cancelled = false;
    setState((current) => ({
      data: current.data.case_id === caseId ? current.data : EMPTY_PROTECTION_READ_MODEL,
      isLoading: true,
      error: null,
    }));

    ensureProtectionReadModel(caseId, revision)
      .then((data) => {
        if (cancelled) {
          return;
        }
        const normalizedData = normalizeProtectionReadModelResponse(data);
        setState({
          data: normalizedData,
          isLoading: false,
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setState({
          data: EMPTY_PROTECTION_READ_MODEL,
          isLoading: false,
          error:
            error instanceof Error
              ? error.message
              : 'Nie udało się pobrać widoku zabezpieczeń.',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [caseId, revision]);

  const assignmentsByElement = useMemo(
    () => createAssignmentMap(state.data.assignments),
    [state.data.assignments],
  );
  const diagnosticsByElement = useMemo(
    () => groupResultsByElement(state.data.diagnostics),
    [state.data.diagnostics],
  );
  const summariesByElement = useMemo(
    () => createSummaryMap(state.data.summaries),
    [state.data.summaries],
  );
  const statistics = useMemo(() => buildStatistics(state.data.summary), [state.data.summary]);
  const elementsWithProtection = useMemo(
    () => new Set(assignmentsByElement.keys()),
    [assignmentsByElement],
  );
  const elementsWithDiagnostics = useMemo(
    () => new Set(diagnosticsByElement.keys()),
    [diagnosticsByElement],
  );

  return {
    ...state,
    assignmentsByElement,
    diagnosticsByElement,
    summariesByElement,
    elementsWithProtection,
    elementsWithDiagnostics,
    viewStatus: state.data.view_status,
    summary: state.data.summary,
    statistics,
  };
}

export function clearProtectionReadModelCache(): void {
  cache.clear();
  pending.clear();
  lastSuccessfulData = EMPTY_PROTECTION_READ_MODEL;
}

export function getCachedProtectionReadModelSnapshot(): ProtectionReadModelResponse {
  return lastSuccessfulData;
}
