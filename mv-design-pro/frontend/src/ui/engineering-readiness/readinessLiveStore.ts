/**
 * Readiness Live Store — §3 UX 10/10
 *
 * Zustand store for live readiness tracking.
 * Subscribes to snapshot changes and auto-refreshes readiness data.
 *
 * INVARIANTS:
 * - Diff-based re-render (only updates when issues change)
 * - Deterministic issue list
 * - No model mutations
 * - Collapsed group state persisted
 */

import { create } from 'zustand';
import type {
  EngineeringReadinessResponse,
  ReadinessIssue,
  ReadinessSeverity,
} from '../types';
import type { ReadinessGroup } from './ReadinessLivePanel';
import { normalizeEngineeringReadinessResponse } from '../shared/fixActionSurfaceNormalizer';

// =============================================================================
// API Client
// =============================================================================

async function fetchReadinessLive(
  caseId: string,
): Promise<EngineeringReadinessResponse> {
  const response = await fetch(`/api/cases/${caseId}/engineering-readiness`);
  if (!response.ok) {
    throw new Error(`Readiness fetch failed: ${response.statusText}`);
  }
  return normalizeEngineeringReadinessResponse(await response.json());
}

// =============================================================================
// Store Interface
// =============================================================================

interface ReadinessLiveState {
  // Data
  issues: ReadinessIssue[];
  status: 'OK' | 'WARN' | 'FAIL';
  ready: boolean;
  bySeverity: Record<ReadinessSeverity, number>;
  loading: boolean;
  error: string | null;
  lastRevision: number | null;

  // UI state
  collapsedGroups: ReadinessGroup[];
  autoRefreshEnabled: boolean;

  // Actions
  refresh: (caseId: string) => Promise<void>;
  clear: () => void;
  toggleGroup: (group: ReadinessGroup) => void;
  setAutoRefresh: (enabled: boolean) => void;

  // Snapshot subscription
  onSnapshotChange: (caseId: string, enmRevision: number) => Promise<void>;
}

// =============================================================================
// Store
// =============================================================================

export const useReadinessLiveStore = create<ReadinessLiveState>()((set, get) => ({
  // Initial state
  issues: [],
  status: 'OK',
  ready: true,
  bySeverity: { BLOCKER: 0, IMPORTANT: 0, INFO: 0 },
  loading: false,
  error: null,
  lastRevision: null,
  collapsedGroups: [],
  autoRefreshEnabled: true,

  refresh: async (caseId: string) => {
    set({ loading: true, error: null });
    try {
      const data = await fetchReadinessLive(caseId);
      set({
        issues: data.issues,
        status: data.status,
        ready: data.ready,
        bySeverity: data.by_severity,
        lastRevision: data.enm_revision,
        loading: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Nieznany błąd',
        loading: false,
      });
    }
  },

  clear: () => {
    set({
      issues: [],
      status: 'OK',
      ready: true,
      bySeverity: { BLOCKER: 0, IMPORTANT: 0, INFO: 0 },
      loading: false,
      error: null,
      lastRevision: null,
    });
  },

  toggleGroup: (group: ReadinessGroup) => {
    const { collapsedGroups } = get();
    if (collapsedGroups.includes(group)) {
      set({ collapsedGroups: collapsedGroups.filter((g) => g !== group) });
    } else {
      set({ collapsedGroups: [...collapsedGroups, group] });
    }
  },

  setAutoRefresh: (enabled: boolean) => {
    set({ autoRefreshEnabled: enabled });
  },

  /**
   * Called after any snapshot change.
   * Only refreshes if ENM revision changed (diff-based).
   */
  onSnapshotChange: async (caseId: string, enmRevision: number) => {
    const { lastRevision, autoRefreshEnabled } = get();
    if (!autoRefreshEnabled) return;
    if (lastRevision === enmRevision) return;
    await get().refresh(caseId);
  },
}));

// =============================================================================
// Derived Selectors
// =============================================================================

/** Number of unresolved blockers */
export function useReadinessBlockerCount(): number {
  return useReadinessLiveStore((s) => s.bySeverity.BLOCKER);
}

/** Whether any blockers exist */
export function useHasReadinessBlockers(): boolean {
  return useReadinessLiveStore((s) => s.bySeverity.BLOCKER > 0);
}

/** All issues for a specific element */
export function useIssuesForElement(elementId: string): ReadinessIssue[] {
  return useReadinessLiveStore((s) =>
    s.issues.filter(
      (i) =>
        i.element_ref === elementId || i.element_refs.includes(elementId),
    ),
  );
}
