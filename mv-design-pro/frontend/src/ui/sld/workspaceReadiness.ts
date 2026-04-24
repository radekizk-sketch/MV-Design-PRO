import type { ReadinessWorkspaceBlockState } from '../engineering-readiness/ReadinessLivePanel';
import type { SldEmptyState } from './SldEmptyOverlay';

export interface WorkspaceReadinessInput {
  forceEmptyState?: SldEmptyState;
  hasActiveCase: boolean;
  hasSnapshot: boolean;
  sourceCount: number;
  symbolCount: number;
}

export interface WorkspaceSnapshotLike {
  sources?: Array<unknown>;
  substations?: Array<unknown>;
  transformers?: Array<unknown>;
  generators?: Array<unknown>;
  branches?: Array<{ type?: string | null }>;
}

export function countWorkspaceSymbols(
  snapshot: WorkspaceSnapshotLike | null | undefined,
): number {
  if (!snapshot) {
    return 0;
  }

  const branchCount = (snapshot.branches ?? []).filter(
    (branch) => branch.type === 'line_overhead' || branch.type === 'cable',
  ).length;

  return (
    (snapshot.sources?.length ?? 0) +
    (snapshot.substations?.length ?? 0) +
    (snapshot.transformers?.length ?? 0) +
    (snapshot.generators?.length ?? 0) +
    branchCount
  );
}

export function deriveSldEmptyState({
  forceEmptyState,
  hasActiveCase,
  hasSnapshot,
  sourceCount,
  symbolCount,
}: WorkspaceReadinessInput): SldEmptyState | null {
  if (forceEmptyState) {
    return forceEmptyState;
  }
  if (!hasActiveCase) {
    return 'NO_CASE';
  }
  if (!hasSnapshot) {
    return 'NO_MODEL';
  }
  if (symbolCount === 0 || (sourceCount > 0 && symbolCount <= sourceCount)) {
    return 'NO_MODEL';
  }
  return null;
}

export function resolveOperationalSldEmptyState(
  input: WorkspaceReadinessInput,
): SldEmptyState | null {
  return deriveSldEmptyState(input);
}

export function resolveWorkspaceBlockState({
  forceEmptyState,
  hasActiveCase,
  hasSnapshot,
  sourceCount,
  symbolCount,
}: WorkspaceReadinessInput): ReadinessWorkspaceBlockState | null {
  const emptyState = deriveSldEmptyState({
    forceEmptyState,
    hasActiveCase,
    hasSnapshot,
    sourceCount,
    symbolCount,
  });

  const reason: ReadinessWorkspaceBlockState['reason'] | null = (() => {
    if (forceEmptyState === 'NO_SNAPSHOT') {
      return 'NO_SNAPSHOT';
    }
    if (emptyState === 'NO_CASE') {
      return 'NO_CASE';
    }
    if (emptyState === 'NO_MODEL') {
      return sourceCount > 0 ? 'NO_MODEL' : 'NO_SOURCE';
    }
    if (!hasActiveCase) {
      return 'NO_CASE';
    }
    if (!hasSnapshot) {
      return sourceCount > 0 ? 'NO_MODEL' : 'NO_SOURCE';
    }
    if (sourceCount === 0) {
      return 'NO_SOURCE';
    }
    if (symbolCount === 0 || (sourceCount > 0 && symbolCount <= sourceCount)) {
      return 'NO_MODEL';
    }
    return null;
  })();

  if (!reason) {
    return null;
  }

  const copy: Record<ReadinessWorkspaceBlockState['reason'], ReadinessWorkspaceBlockState> = {
    NO_CASE: {
      reason: 'NO_CASE',
      title: 'Brak aktywnego przypadku obliczeniowego',
      description:
        'Bez aktywnego wariantu pracy panel gotowości pozostaje zablokowany. Wybierz wariant albo utwórz nowy.',
      nextStep: 'Wybierz istniejący wariant w menedżerze wariantów albo utwórz nowy.',
    },
    NO_MODEL: {
      reason: 'NO_MODEL',
      title: 'Pusty schemat jednokreskowy',
      description:
        'Wariant pracy jest aktywny, ale model nie zawiera jeszcze elementów sieci. Dodaj pierwszy odcinek albo stację.',
      nextStep: 'Wstaw pierwszy odcinek, stację lub źródło, aby zbudować topologię.',
    },
    NO_SOURCE: {
      reason: 'NO_SOURCE',
      title: 'Brak źródła zasilania',
      description:
        'Model nie ma jeszcze GPZ ani innego źródła, więc gotowość obliczeniowa nie może przejść do stanu zielonego.',
      nextStep: 'Dodaj źródło GPZ w lewym panelu, a potem podłącz pierwszy odcinek magistrali.',
    },
    NO_SNAPSHOT: {
      reason: 'NO_SNAPSHOT',
      title: 'Brak aktywnej migawki',
      description: 'Nie wybrano migawki modelu. Bez niej nie da się poprawnie ocenić gotowości.',
      nextStep: 'Wybierz aktywną migawkę w drzewie projektu.',
    },
  };

  return copy[reason];
}

export function isAnalysisOnlyWorkspaceBlockState(
  workspaceBlockState: ReadinessWorkspaceBlockState | null | undefined,
): boolean {
  return workspaceBlockState?.reason === 'NO_SNAPSHOT';
}

export function resolveOperationalWorkspaceBlockState(
  input: WorkspaceReadinessInput,
): ReadinessWorkspaceBlockState | null {
  const workspaceBlockState = resolveWorkspaceBlockState(input);
  return isAnalysisOnlyWorkspaceBlockState(workspaceBlockState) ? null : workspaceBlockState;
}
