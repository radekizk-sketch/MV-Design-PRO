import type { ResultsInspectorTab } from './types';
import { adresZTrasaIParametrami, getCurrentHashRoute, getCurrentSearchParams } from '../navigation/urlState';

export type ResultsSnapshotMode = 'RUN_SNAPSHOT' | 'CURRENT_MODEL';

const RESULTS_SNAPSHOT_PARAM = 'snapshot';

export function encodeResultsSnapshotMode(mode: ResultsSnapshotMode): string {
  return mode === 'CURRENT_MODEL' ? 'current' : 'run';
}

export function resolveResultsRunId(
  routeRunId: string | null | undefined,
  runIdOgladany: string | null | undefined,
): string | null {
  return routeRunId ?? runIdOgladany ?? null;
}

export function resolveResultsSnapshotMode(
  routeValue: string | null | undefined,
  hasCurrentModelSnapshot: boolean,
): ResultsSnapshotMode {
  if (routeValue === 'current' && hasCurrentModelSnapshot) {
    return 'CURRENT_MODEL';
  }
  return 'RUN_SNAPSHOT';
}

export function hasSnapshotDrift(
  runSnapshotId: string | null | undefined,
  currentSnapshotId: string | null | undefined,
): boolean {
  return Boolean(
    runSnapshotId &&
      currentSnapshotId &&
      runSnapshotId.trim() !== '' &&
      currentSnapshotId.trim() !== '' &&
      runSnapshotId !== currentSnapshotId,
  );
}

export function updateResultsSnapshotMode(mode: ResultsSnapshotMode): void {
  if (typeof window === 'undefined') {
    return;
  }

  const currentHash = getCurrentHashRoute();
  const params = getCurrentSearchParams();
  params.set(RESULTS_SNAPSHOT_PARAM, encodeResultsSnapshotMode(mode));

  window.history.replaceState(null, '', adresZTrasaIParametrami(currentHash, params));
}

export function resolveAvailableResultsTabs(
  forcedTab: ResultsInspectorTab | undefined,
  hasShortCircuit: boolean,
): ResultsInspectorTab[] {
  if (forcedTab) {
    return [forcedTab];
  }

  const tabs: ResultsInspectorTab[] = ['BUSES', 'BRANCHES'];
  if (hasShortCircuit) {
    tabs.push('SHORT_CIRCUIT');
  }
  tabs.push('TRACE');
  return tabs;
}
