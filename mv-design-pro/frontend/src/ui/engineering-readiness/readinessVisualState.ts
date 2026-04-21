import type { ReadinessIssue } from '../types';
import type { ReadinessWorkspaceBlockState } from './ReadinessLivePanel';

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
