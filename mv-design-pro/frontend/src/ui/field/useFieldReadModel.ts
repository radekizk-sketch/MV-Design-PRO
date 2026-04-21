import { useEffect, useMemo, useState } from 'react';
import { useAppStateStore } from '../app-state/store';
import { useSnapshotStore } from '../topology/snapshotStore';
import type { BayCanonicalModel, BayProjectResults } from '../../types/enm';

export interface FieldReadModelStatus {
  data_source: 'ENM_FIELD_READ_MODEL';
  result_state: 'NONE' | 'FRESH';
  has_field_data: boolean;
}

export interface FieldReadModelSummary {
  total_fields: number;
  migrated_count: number;
  requires_completion_count: number;
  source_fields_count: number;
  coupler_fields_count: number;
  fields_with_results_count: number;
}

export interface FieldReadModelItem {
  bay_id: string;
  bay_ref: string;
  bay_name: string;
  canonical_model: BayCanonicalModel;
  project_results?: BayProjectResults | null;
}

export interface FieldReadModelResponse {
  case_id: string;
  enm_revision: number;
  view_status: FieldReadModelStatus;
  summary: FieldReadModelSummary;
  fields: FieldReadModelItem[];
}

interface FieldReadModelState {
  data: FieldReadModelResponse;
  isLoading: boolean;
  error: string | null;
}

export interface FieldReadModelView extends FieldReadModelState {
  itemsByBayRef: Map<string, FieldReadModelItem>;
  itemsByBayId: Map<string, FieldReadModelItem>;
  viewStatus: FieldReadModelStatus;
  summary: FieldReadModelSummary;
}

export const EMPTY_FIELD_READ_MODEL: FieldReadModelResponse = {
  case_id: '',
  enm_revision: 0,
  view_status: {
    data_source: 'ENM_FIELD_READ_MODEL',
    result_state: 'NONE',
    has_field_data: false,
  },
  summary: {
    total_fields: 0,
    migrated_count: 0,
    requires_completion_count: 0,
    source_fields_count: 0,
    coupler_fields_count: 0,
    fields_with_results_count: 0,
  },
  fields: [],
};

const cache = new Map<string, FieldReadModelResponse>();
const pending = new Map<string, Promise<FieldReadModelResponse>>();

function buildCacheKey(caseId: string, revision: number | null): string {
  return `${caseId}:${revision ?? 'live'}`;
}

function normalizeFieldReadModelResponse(
  payload: Partial<FieldReadModelResponse> | null | undefined,
): FieldReadModelResponse {
  return {
    ...EMPTY_FIELD_READ_MODEL,
    ...payload,
    view_status: {
      ...EMPTY_FIELD_READ_MODEL.view_status,
      ...(payload?.view_status ?? {}),
    },
    summary: {
      ...EMPTY_FIELD_READ_MODEL.summary,
      ...(payload?.summary ?? {}),
    },
    fields: Array.isArray(payload?.fields) ? payload.fields : [],
  };
}

async function fetchFieldReadModel(caseId: string): Promise<FieldReadModelResponse> {
  const response = await fetch(`/api/cases/${caseId}/enm/field-view`);
  if (!response.ok) {
    throw new Error(`Nie udało się pobrać widoku pola: ${response.statusText}`);
  }
  return normalizeFieldReadModelResponse(
    (await response.json()) as Partial<FieldReadModelResponse>,
  );
}

function ensureFieldReadModel(
  caseId: string,
  revision: number | null,
): Promise<FieldReadModelResponse> {
  const key = buildCacheKey(caseId, revision);
  const cached = cache.get(key);
  if (cached) return Promise.resolve(cached);

  const activePending = pending.get(key);
  if (activePending) return activePending;

  const request = fetchFieldReadModel(caseId)
    .then((data) => {
      cache.set(key, data);
      return data;
    })
    .finally(() => {
      pending.delete(key);
    });

  pending.set(key, request);
  return request;
}

export function useFieldReadModel(): FieldReadModelView {
  const caseId = useAppStateStore((state) => state.activeCaseId);
  const revision = useSnapshotStore((state) => state.snapshot?.header.revision ?? null);

  const [state, setState] = useState<FieldReadModelState>({
    data: EMPTY_FIELD_READ_MODEL,
    isLoading: false,
    error: null,
  });

  useEffect(() => {
    if (!caseId) {
      setState({
        data: EMPTY_FIELD_READ_MODEL,
        isLoading: false,
        error: null,
      });
      return;
    }

    const key = buildCacheKey(caseId, revision);
    const cached = cache.get(key);
    if (cached) {
      setState({
        data: normalizeFieldReadModelResponse(cached),
        isLoading: false,
        error: null,
      });
      return;
    }

    let cancelled = false;
    setState((current) => ({ ...current, isLoading: true, error: null }));

    ensureFieldReadModel(caseId, revision)
      .then((data) => {
        if (cancelled) return;
        setState({
          data: normalizeFieldReadModelResponse(data),
          isLoading: false,
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          data: EMPTY_FIELD_READ_MODEL,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Nieznany błąd odczytu pola',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [caseId, revision]);

  const itemsByBayRef = useMemo(
    () => new Map(state.data.fields.map((item) => [item.bay_ref, item] as const)),
    [state.data.fields],
  );
  const itemsByBayId = useMemo(
    () => new Map(state.data.fields.map((item) => [item.bay_id, item] as const)),
    [state.data.fields],
  );

  return {
    ...state,
    itemsByBayRef,
    itemsByBayId,
    viewStatus: state.data.view_status,
    summary: state.data.summary,
  };
}
