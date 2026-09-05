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
import { createRun, executeRun, getRunResults } from '../../study-cases/api';
import type { RunStatus } from '../../study-cases/types';
import {
  deleteStationAudit2Config,
  fetchAudit2CatalogSnapshot,
  generateAudit2ProofPack,
  generateAudit2Report,
  listStationAudit2Configs,
  putStationAudit2Config,
  type AuditCatalogSnapshot,
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

export function useAudit2CatalogSnapshot(): UseQueryResult<AuditCatalogSnapshot, Error> {
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
    queryFn: async () => {
      const configs = await listStationAudit2Configs(projectId!);
      return configs.find((config) => config.station_id === stationId) ?? null;
    },
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

// =============================================================================
// Rozpływ mocy rozszerzony (konfiguracja stacji audytu 2) — karta CV-4.2.
//
// Zastępuje dawny stub `POST /api/cases/audit2-power-flow` (fabrykowany
// PowerFlowInput z `pq=[]` i `slack-stub` — usunięty), biegiem KANONICZNYM:
// `createRun` -> `executeRun` -> `getRunResults` (`ui/study-cases/api.ts`,
// ta sama droga co reszta aplikacji). Konfiguracja stacji trafia do solvera
// przez `solver_input.audit2_project_id`/`audit2_station_id`, które
// `enm/assembler.py::zloz_wejscie_rozplywu` już odczytuje z opcji biegu
// (Phase 41 audit2 extensions) — zero nowej ścieżki fizyki.
// =============================================================================

export interface ExtendedPowerFlowRunArgs {
  readonly caseId: string;
  readonly audit2ProjectId: string;
  readonly audit2StationId: string;
  readonly baseMva?: number;
}

export interface ExtendedPowerFlowRunResult {
  readonly status: RunStatus;
  readonly errorMessage: string | null;
  readonly busCount: number;
  readonly branchCount: number;
  readonly sourceCount: number;
  /** Czy zapisana konfiguracja stacji (zaczepy/statyzm P(f)/impedancja bloku)
   * została faktycznie zastosowana do modelu przed obliczeniem. */
  readonly audit2Applied: boolean;
}

export async function runExtendedPowerFlow(
  args: ExtendedPowerFlowRunArgs,
): Promise<ExtendedPowerFlowRunResult> {
  const created = await createRun(args.caseId, {
    analysis_type: 'LOAD_FLOW',
    solver_input: {
      base_mva: args.baseMva ?? 100.0,
      audit2_project_id: args.audit2ProjectId,
      audit2_station_id: args.audit2StationId,
    },
  });
  const executed = await executeRun(created.id);
  if (executed.status !== 'DONE') {
    return {
      status: executed.status,
      errorMessage: executed.error_message,
      busCount: 0,
      branchCount: 0,
      sourceCount: 0,
      audit2Applied: false,
    };
  }
  const results = await getRunResults(executed.id);
  const countElements = (elementType: string): number =>
    results.element_results.filter((row) => row.element_type === elementType).length;
  return {
    status: executed.status,
    errorMessage: null,
    busCount: countElements('Bus'),
    branchCount: countElements('Branch'),
    sourceCount: countElements('Source'),
    audit2Applied: results.global_results.audit2_applied !== undefined,
  };
}

/**
 * Hook do uruchomienia rozszerzonego rozpływu mocy z konfiguracją stacji
 * audytu 2 (zaczepy, statyzm P(f), impedancja transformatora blokowego).
 * Pełna pętla: bieg kanoniczny -> wynik solvera -> ślad zastosowanej
 * konfiguracji.
 */
export function useRunExtendedPowerFlow() {
  return useMutation<ExtendedPowerFlowRunResult, Error, ExtendedPowerFlowRunArgs>({
    mutationFn: runExtendedPowerFlow,
  });
}
