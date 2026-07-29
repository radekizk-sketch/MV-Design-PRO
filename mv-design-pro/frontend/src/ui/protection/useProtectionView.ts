/**
 * Audyt E, faza E-5 — hook widoku zabezpieczeń (`protection-view`).
 *
 * Pobiera read model `GET /api/cases/{caseId}/enm/protection-view` dla
 * aktywnego case'u i udostępnia go inspektorowi. Cache jest kluczowany
 * przez (caseId, revision snapshotu) — zmiana modelu unieważnia dane.
 *
 * Wzorzec zgodny z `field/useFieldReadModel` (cache + pending dedup).
 * ZERO fizyki w UI — hook wyłącznie transportuje dane z backendu.
 */

import { useEffect, useState } from 'react';
import { useAppStateStore } from '../app-state/store';
import { useSnapshotStore } from '../topology/snapshotStore';
import {
  EMPTY_PROTECTION_VIEW,
  fetchProtectionView,
  type ProtectionViewResponse,
} from './protection-view';

interface ProtectionViewState {
  data: ProtectionViewResponse;
  isLoading: boolean;
  error: string | null;
}

export interface ProtectionViewHook extends ProtectionViewState {
  viewStatus: ProtectionViewResponse['view_status'];
}

const cache = new Map<string, ProtectionViewResponse>();
const pending = new Map<string, Promise<ProtectionViewResponse>>();

function buildCacheKey(caseId: string, revision: number | null): string {
  return `${caseId}:${revision ?? 'live'}`;
}

function ensureProtectionView(
  caseId: string,
  revision: number | null,
): Promise<ProtectionViewResponse> {
  const key = buildCacheKey(caseId, revision);
  const cached = cache.get(key);
  if (cached) return Promise.resolve(cached);

  const activePending = pending.get(key);
  if (activePending) return activePending;

  const request = fetchProtectionView(caseId)
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

/**
 * Zwraca read model zabezpieczeń dla aktywnego case'u.
 * Bez aktywnego case'u ⇒ pusty widok (uczciwy stan zerowy).
 */
export function useProtectionView(): ProtectionViewHook {
  const caseId = useAppStateStore((state) => state.activeCaseId);
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const revision = snapshot?.header.revision ?? null;

  const [state, setState] = useState<ProtectionViewState>({
    data: EMPTY_PROTECTION_VIEW,
    isLoading: false,
    error: null,
  });

  useEffect(() => {
    if (!caseId) {
      setState({ data: EMPTY_PROTECTION_VIEW, isLoading: false, error: null });
      return;
    }

    const key = buildCacheKey(caseId, revision);
    const cached = cache.get(key);
    if (cached) {
      setState({ data: cached, isLoading: false, error: null });
      return;
    }

    let cancelled = false;
    setState((current) => ({ ...current, isLoading: true, error: null }));

    ensureProtectionView(caseId, revision)
      .then((data) => {
        if (cancelled) return;
        setState({ data, isLoading: false, error: null });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          data: EMPTY_PROTECTION_VIEW,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Nieznany błąd widoku zabezpieczeń',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [caseId, revision]);

  return {
    ...state,
    viewStatus: state.data.view_status,
  };
}
