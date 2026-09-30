import type { ReadinessIssue } from '../types';

/**
 * Stan blokady przestrzeni roboczej (brak przypadku / modelu / źródła / migawki).
 * Typ mieszkał w `ReadinessLivePanel.tsx` — panel skasowany w karcie AB-1a
 * Pakiet L (LEGACY_USUNAC E25: brak konsumenta produkcyjnego), typ ma żywego
 * czytelnika (`resolveReadinessVisualState` ← `networkBuildStore`), więc zostaje tu.
 */
export interface ReadinessWorkspaceBlockState {
  reason: 'NO_CASE' | 'NO_MODEL' | 'NO_SOURCE' | 'NO_SNAPSHOT';
  title: string;
  description: string;
  nextStep: string;
}

export type ReadinessVisualState =
  | 'loading'
  | 'error'
  | 'blocked'
  | 'ready'
  | 'pending'
  | 'issues';

export interface ReadinessVisualStateInput {
  issues: ReadinessIssue[];
  status: 'OK' | 'WARN' | 'FAIL';
  ready?: boolean;
  loading: boolean;
  error?: string | null;
  workspaceBlockState?: ReadinessWorkspaceBlockState | null;
}

export function resolveReadinessVisualState({
  issues,
  status,
  ready = false,
  loading,
  error = null,
  workspaceBlockState = null,
}: ReadinessVisualStateInput): ReadinessVisualState {
  if (workspaceBlockState) {
    return 'blocked';
  }

  if (error) {
    return 'error';
  }

  if (loading && issues.length === 0) {
    return 'loading';
  }

  if (issues.length === 0 && workspaceBlockState === null && status === 'OK' && ready) {
    return 'ready';
  }

  if (issues.length === 0) {
    return 'pending';
  }

  return 'issues';
}
