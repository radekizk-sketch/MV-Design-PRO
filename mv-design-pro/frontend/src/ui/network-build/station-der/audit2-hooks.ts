/**
 * React Query hooks dla audytu 2 (Phase 3 Punkt 3).
 *
 * Cache strategy:
 *  - Catalog snapshot (immutable): staleTime: Infinity.
 *  - Station config (mutable): staleTime: 30s + invalidate on mutations.
 *
 * Optimistic updates: mutacje natychmiast aktualizuja cache, rollback przy bledzie.
 */

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import { audit2QueryKeys } from '../../../query-client';
import {
  deleteStationAudit2Config,
  fetchAudit2CatalogSnapshot,
  generateAudit2ProofPack,
  generateAudit2Report,
  getStationAudit2Config,
  listStationAudit2Configs,
  putStationAudit2Config,
  type Audit2ProofPackRequest,
  type Audit2ProofPackResponse,
  type Audit2ReportRequest,
  type Audit2ReportResponse,
  type StationAudit2ConfigBody,
  type StationAudit2ConfigResponse,
} from './audit2-api';

// =============================================================================
// Catalog snapshot — immutable, cache forever
// =============================================================================

export function useAudit2CatalogSnapshot(): UseQueryResult<unknown, Error> {
  return useQuery({
    queryKey: audit2QueryKeys.catalogSnapshot(),
    queryFn: fetchAudit2CatalogSnapshot,
    staleTime: Infinity, // Katalogi wersjonowane, nigdy stale w trakcie sesji.
    gcTime: 60 * 60_000, // 1h.
  });
}

// =============================================================================
// Station config — stale-while-revalidate
// =============================================================================

export function useStationAudit2Config(
  projectId: string | null,
  stationId: string | null,
): UseQueryResult<StationAudit2ConfigResponse | null, Error> {
  return useQuery({
    queryKey: audit2QueryKeys.stationConfig(projectId ?? '', stationId ?? ''),
    queryFn: () => getStationAudit2Config(projectId!, stationId!),
    enabled: Boolean(projectId && stationId),
    staleTime: 30_000,
  });
}

export function useStationAudit2ConfigList(
  projectId: string | null,
): UseQueryResult<readonly StationAudit2ConfigResponse[], Error> {
  return useQuery({
    queryKey: audit2QueryKeys.stationConfigList(projectId ?? ''),
    queryFn: () => listStationAudit2Configs(projectId!),
    enabled: Boolean(projectId),
    staleTime: 30_000,
  });
}

// =============================================================================
// Mutations — z optimistic update + invalidation
// =============================================================================

export interface UpdateStationAudit2ConfigArgs {
  readonly projectId: string;
  readonly stationId: string;
  readonly body: StationAudit2ConfigBody;
}

/**
 * UPSERT station config + optimistic update.
 *
 * Strategia:
 *  - onMutate: aktualizuj cache (`stationConfig`) optimistycznie + zapisuj poprzedni
 *    stan dla rollback.
 *  - onError: rollback do poprzedniego stanu.
 *  - onSuccess: invalidate `stationConfig` + `stationConfigList` (refetch).
 */
export function useUpdateStationAudit2Config() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: putStationAudit2Config,
    onMutate: async (args: UpdateStationAudit2ConfigArgs) => {
      const queryKey = audit2QueryKeys.stationConfig(args.projectId, args.stationId);
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<StationAudit2ConfigResponse | null>(queryKey);

      // Optimistic update — natychmiast aktualizuj cache.
      const optimistic: StationAudit2ConfigResponse = {
        ...(previous ?? {
          id: 'optimistic',
          project_id: args.projectId,
          station_id: args.stationId,
          created_at: null,
          updated_at: null,
        }),
        ...args.body,
      };
      qc.setQueryData(queryKey, optimistic);
      return { previous };
    },
    onError: (_err, args, context) => {
      const queryKey = audit2QueryKeys.stationConfig(args.projectId, args.stationId);
      if (context?.previous !== undefined) {
        qc.setQueryData(queryKey, context.previous);
      }
    },
    onSuccess: (_data, args) => {
      qc.invalidateQueries({
        queryKey: audit2QueryKeys.stationConfig(args.projectId, args.stationId),
      });
      qc.invalidateQueries({
        queryKey: audit2QueryKeys.stationConfigList(args.projectId),
      });
    },
  });
}

export interface DeleteStationAudit2ConfigArgs {
  readonly projectId: string;
  readonly stationId: string;
}

export function useDeleteStationAudit2Config() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteStationAudit2Config,
    onSuccess: (_data, args: DeleteStationAudit2ConfigArgs) => {
      qc.removeQueries({
        queryKey: audit2QueryKeys.stationConfig(args.projectId, args.stationId),
      });
      qc.invalidateQueries({
        queryKey: audit2QueryKeys.stationConfigList(args.projectId),
      });
    },
  });
}

// =============================================================================
// Phase 10/11: Proof Pack + Report mutations (server-side actions, brak cache).
// =============================================================================

export function useGenerateAudit2ProofPack() {
  return useMutation<Audit2ProofPackResponse, Error, Audit2ProofPackRequest>({
    mutationFn: generateAudit2ProofPack,
  });
}

export function useGenerateAudit2Report() {
  return useMutation<Audit2ReportResponse, Error, Audit2ReportRequest>({
    mutationFn: generateAudit2Report,
  });
}
