/**
 * Global Application State Store â€” P12a Data Manager Parity
 *
 * CANONICAL ALIGNMENT:
 * - wizard_screens.md Â§ 1.2: Operating modes (MODEL_EDIT, CASE_CONFIG, RESULT_VIEW)
 * - wizard_screens.md Â§ 1.3: Active case awareness
 * - ui_canonical_parity.md Â§ A: Mode-based gating
 *
 * SINGLE SOURCE OF TRUTH for:
 * - Active project ID
 * - Active case ID and kind
 * - Operating mode (MODEL_EDIT / CASE_CONFIG / RESULT_VIEW)
 * - Active run ID (for RESULT_VIEW)
 *
 * INVARIANTS:
 * - Exactly ONE active case per project
 * - No activeCaseId â†’ [Oblicz] button DISABLED
 * - MODEL_EDIT: model mutable, results invalidated on change
 * - CASE_CONFIG: model read-only, case config mutable
 * - RESULT_VIEW: everything read-only
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { OperatingMode, ResultStatus } from '../types';
import {
  getOperatingModeLabel,
  normalizeOperatingMode,
  type RuntimeOperatingMode,
} from '../operatingMode';
import { useSnapshotStore } from '../topology/snapshotStore';

// =============================================================================
// V12 — Area and Work-mode types
// =============================================================================

/**
 * V12 application area codes.
 * Each area maps to a dedicated left-context panel.
 */
export type AreaCode = 'MO' | 'AN' | 'ZA' | 'OZ' | 'RA' | 'AD' | 'HI';

/**
 * V12 SLD work-mode codes.
 * TE=Edycja, TW=Wyniki, TZ=Zabezpieczenia, TP=Porównanie, TA=Audyt, TN=Operator nocny
 */
export type WorkMode = 'TE' | 'TW' | 'TZ' | 'TP' | 'TA' | 'TN';

/**
 * Case kind (type of calculation case).
 */
export type CaseKind = 'ShortCircuitCase' | 'PowerFlowCase';

/**
 * Analysis type for UI Context.
 * CANONICAL: UI_CORE_ARCHITECTURE.md Â§ 5.2 â€” Analysis type in Context Bar hierarchy
 */
export type AnalysisType = 'SHORT_CIRCUIT' | 'LOAD_FLOW' | 'PROTECTION' | null;

/**
 * Global application state interface.
 * Extended for UI_INTEGRATION_E2E: SnapshotId, AnalysisType per UI_CORE_ARCHITECTURE.md
 */
interface AppState {
  // Project context
  activeProjectId: string | null;
  activeProjectName: string | null;

  // Active case context
  activeCaseId: string | null;
  activeCaseName: string | null;
  activeCaseKind: CaseKind | null;
  activeCaseResultStatus: ResultStatus;

  // UI_INTEGRATION_E2E: Snapshot context
  activeSnapshotId: string | null;

  // Runtime shell mode (controls UI gating)
  activeMode: RuntimeOperatingMode;

  // Results context (only in RESULT_VIEW)
  activeRunId: string | null;

  // UI_INTEGRATION_E2E: Analysis type context
  activeAnalysisType: AnalysisType;

  // V12: Area and work-mode
  activeArea: AreaCode;
  activeWorkMode: WorkMode;
  activeVariantId: string | null;
  activeVariantName: string | null;

  // UI state
  issuePanelOpen: boolean; // P30d: Issue Panel toggle

  // Actions
  setActiveProject: (projectId: string | null, projectName?: string | null) => void;
  setActiveCase: (
    caseId: string | null,
    caseName?: string | null,
    caseKind?: CaseKind | null,
    resultStatus?: ResultStatus
  ) => void;
  setActiveCaseResultStatus: (status: ResultStatus) => void;
  setActiveMode: (mode: OperatingMode | RuntimeOperatingMode) => void;
  setActiveRun: (runId: string | null) => void;
  setActiveSnapshot: (snapshotId: string | null) => void; // UI_INTEGRATION_E2E
  setActiveAnalysisType: (analysisType: AnalysisType) => void; // UI_INTEGRATION_E2E
  toggleIssuePanel: (open?: boolean) => void; // P30d

  // V12 actions
  setActiveArea: (area: AreaCode) => void;
  setActiveWorkMode: (mode: WorkMode) => void;
  setActiveVariant: (variantId: string | null, variantName?: string | null) => void;

  // Computed helpers
  hasActiveCase: () => boolean;
  canCalculate: () => boolean;
  isModelEditable: () => boolean;
  isCaseConfigEditable: () => boolean;
  isReadOnly: () => boolean;

  // Reset
  reset: () => void;
}

/**
 * Initial state values.
 */
const initialState = {
  activeProjectId: null,
  activeProjectName: null,
  activeCaseId: null,
  activeCaseName: null,
  activeCaseKind: null,
  activeCaseResultStatus: 'NONE' as ResultStatus,
  activeSnapshotId: null, // UI_INTEGRATION_E2E
  activeMode: 'MODEL_EDIT' as RuntimeOperatingMode,
  activeRunId: null,
  activeAnalysisType: null as AnalysisType, // UI_INTEGRATION_E2E
  issuePanelOpen: false, // P30d
  // V12
  activeArea: 'MO' as AreaCode,
  activeWorkMode: 'TE' as WorkMode,
  activeVariantId: null as string | null,
  activeVariantName: null as string | null,
};

/**
 * Zustand store for global application state.
 */
export const useAppStateStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...initialState,

      /**
       * Set active project.
       * Clears active case when project changes.
       */
      setActiveProject: (projectId, projectName = null) => {
        const current = get();
        // If project changed, clear case context
        if (current.activeProjectId !== projectId) {
          set({
            activeProjectId: projectId,
            activeProjectName: projectName,
            activeCaseId: null,
            activeCaseName: null,
            activeCaseKind: null,
            activeCaseResultStatus: 'NONE',
            activeSnapshotId: null, // UI_INTEGRATION_E2E
            activeRunId: null,
            activeAnalysisType: null, // UI_INTEGRATION_E2E
          });
        } else {
          set({
            activeProjectId: projectId,
            activeProjectName: projectName,
          });
        }
      },

      /**
       * Set active case.
       */
      setActiveCase: (caseId, caseName = null, caseKind = null, resultStatus = 'NONE') => {
        set({
          activeCaseId: caseId,
          activeCaseName: caseName,
          activeCaseKind: caseKind,
          activeCaseResultStatus: resultStatus,
          // Clear run and snapshot when case changes
          activeRunId: null,
          activeSnapshotId: null, // UI_INTEGRATION_E2E
        });
      },

      /**
       * Update result status for active case.
       */
      setActiveCaseResultStatus: (status) => {
        set({ activeCaseResultStatus: status });
      },

      /**
       * Set operating mode.
       */
      setActiveMode: (mode) => {
        const normalizedMode = normalizeOperatingMode(mode);
        set({ activeMode: normalizedMode });
        // Clear run if exiting RESULT_VIEW
        if (normalizedMode !== 'RESULT_VIEW') {
          set({ activeRunId: null });
        }
      },

      /**
       * Set active run (for RESULT_VIEW mode).
       */
      setActiveRun: (runId) => {
        set({ activeRunId: runId });
      },

      /**
       * UI_INTEGRATION_E2E: Set active snapshot.
       */
      setActiveSnapshot: (snapshotId) => {
        set({ activeSnapshotId: snapshotId });
      },

      /**
       * UI_INTEGRATION_E2E: Set active analysis type.
       */
      setActiveAnalysisType: (analysisType) => {
        set({ activeAnalysisType: analysisType });
      },

      /**
       * P30d: Toggle Issue Panel visibility.
       */
      toggleIssuePanel: (open) => {
        set((state) => ({
          issuePanelOpen: open !== undefined ? open : !state.issuePanelOpen,
        }));
      },

      // V12 actions

      setActiveArea: (area) => {
        set({ activeArea: area });
      },

      setActiveWorkMode: (mode) => {
        set({ activeWorkMode: mode });
        // Sync legacy activeMode
        if (mode === 'TE') {
          set({ activeMode: 'MODEL_EDIT' });
        } else {
          set({ activeMode: 'RESULT_VIEW' });
        }
      },

      setActiveVariant: (variantId, variantName = null) => {
        set({ activeVariantId: variantId, activeVariantName: variantName });
      },

      /**
       * Check if there's an active case.
       */
      hasActiveCase: () => {
        return get().activeCaseId !== null;
      },

      /**
       * Check if calculation can be started.
       * Requires: active case + MODEL_EDIT mode + results not FRESH
       */
      canCalculate: () => {
        const state = get();
        const readiness = useSnapshotStore.getState().readiness;
        return (
          state.activeCaseId !== null &&
          state.activeMode === 'MODEL_EDIT' &&
          (!readiness || readiness.ready) &&
          state.activeCaseResultStatus !== 'FRESH'
        );
      },

      /**
       * Check if model is editable (MODEL_EDIT mode).
       */
      isModelEditable: () => {
        return get().activeMode === 'MODEL_EDIT';
      },

      /**
       * Check if case config is editable (MODEL_EDIT or CASE_CONFIG).
       */
      isCaseConfigEditable: () => {
        return normalizeOperatingMode(get().activeMode) === 'MODEL_EDIT';
      },

      /**
       * Check if in read-only mode (RESULT_VIEW).
       */
      isReadOnly: () => {
        return get().activeMode === 'RESULT_VIEW';
      },

      /**
       * Reset to initial state.
       */
      reset: () => {
        set(initialState);
      },
    }),
    {
      name: 'mv-design-app-state',
      version: 1,
      migrate: (persistedState: unknown, version) => {
        if (version === 1) return persistedState as AppState;
        return persistedState as AppState;
      },
      // Only persist project and case IDs, not transient state
      partialize: (state) => ({
        activeProjectId: state.activeProjectId,
        activeProjectName: state.activeProjectName,
        activeCaseId: state.activeCaseId,
        activeCaseName: state.activeCaseName,
        activeCaseKind: state.activeCaseKind,
        activeSnapshotId: state.activeSnapshotId, // UI_INTEGRATION_E2E
      }),
    }
  )
);

// =============================================================================
// Derived Hooks
// =============================================================================

/**
 * Hook: Get active project ID.
 */
export function useActiveProjectId(): string | null {
  return useAppStateStore((state) => state.activeProjectId);
}

/**
 * Hook: Get active case ID.
 */
export function useActiveCaseId(): string | null {
  return useAppStateStore((state) => state.activeCaseId);
}

/**
 * Hook: Get active case name.
 */
export function useActiveCaseName(): string | null {
  return useAppStateStore((state) => state.activeCaseName);
}

/**
 * Hook: Get active case kind.
 */
export function useActiveCaseKind(): CaseKind | null {
  return useAppStateStore((state) => state.activeCaseKind);
}

/**
 * Hook: Get active mode.
 */
export function useActiveMode(): RuntimeOperatingMode {
  return useAppStateStore((state) => state.activeMode);
}

/**
 * Hook: Get active mode label in Polish.
 */
export function useActiveModeLabel(): string {
  return getOperatingModeLabel(useAppStateStore((state) => state.activeMode));
}

/**
 * Hook: Get case kind label in Polish.
 */
export function useCaseKindLabel(): string | null {
  const kind = useAppStateStore((state) => state.activeCaseKind);
  if (!kind) return null;
  switch (kind) {
    case 'ShortCircuitCase':
      return 'Zakres zwarciowy';
    case 'PowerFlowCase':
      return 'Przypadek rozplywu mocy';
    default:
      return kind;
  }
}

/**
 * Hook: Get result status label in Polish.
 */
export function useResultStatusLabel(): string {
  const status = useAppStateStore((state) => state.activeCaseResultStatus);
  switch (status) {
    case 'NONE':
      return 'Brak wynikow';
    case 'FRESH':
      return 'Wyniki aktualne';
    case 'OUTDATED':
      return 'Wyniki nieaktualne';
    default:
      return status;
  }
}

/**
 * Hook: Check if there's an active case.
 */
export function useHasActiveCase(): boolean {
  return useAppStateStore((state) => state.activeCaseId !== null);
}

/**
 * Hook: Check if calculation is allowed.
 */
export function useCanCalculate(): { allowed: boolean; reason: string | null } {
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const activeMode = useAppStateStore((state) => state.activeMode);
  const resultStatus = useAppStateStore((state) => state.activeCaseResultStatus);
  const readiness = useSnapshotStore((state) => state.readiness);

  if (!activeCaseId) {
    return { allowed: false, reason: 'Wybierz aktywny zakres obliczen' };
  }

  if (activeMode !== 'MODEL_EDIT') {
    return {
      allowed: false,
      reason: 'Obliczenia sa dozwolone tylko w trybie Model sieci',
    };
  }

  if (readiness && !readiness.ready) {
    const blocker = readiness.blockers?.[0];
    return {
      allowed: false,
      reason: blocker?.message_pl ?? 'Model nie jest gotowy do analizy - usun blokery',
    };
  }

  if (resultStatus === 'FRESH') {
    return {
      allowed: false,
      reason: 'Wyniki sa aktualne - brak potrzeby ponownego uruchomienia obliczen',
    };
  }

  return { allowed: true, reason: null };
}

/**
 * Hook: Check if Issue Panel is open.
 * P30d: Issue Panel toggle
 */
export function useIssuePanelOpen(): boolean {
  return useAppStateStore((state) => state.issuePanelOpen);
}

// =============================================================================
// UI_INTEGRATION_E2E: Additional Context Hooks
// =============================================================================

/**
 * Hook: Get active snapshot ID.
 * UI_INTEGRATION_E2E: Single source of truth for snapshot context.
 */
export function useActiveSnapshotId(): string | null {
  return useAppStateStore((state) => state.activeSnapshotId);
}

/**
 * Hook: Get active analysis type.
 * UI_INTEGRATION_E2E: Single source of truth for analysis context.
 */
export function useActiveAnalysisType(): AnalysisType {
  return useAppStateStore((state) => state.activeAnalysisType);
}

/**
 * Hook: Get active analysis type label in Polish.
 * CANONICAL: PROOF_UI_ARCHITECTURE.md Â§ 7.6 â€” Polish terminology in UI
 */
export function useActiveAnalysisTypeLabel(): string | null {
  const analysisType = useAppStateStore((state) => state.activeAnalysisType);
  if (!analysisType) return null;
  switch (analysisType) {
    case 'SHORT_CIRCUIT':
      return 'Analiza zwarciowa';
    case 'LOAD_FLOW':
      return 'RozpĹ‚yw mocy';
    case 'PROTECTION':
      return 'Koordynacja zabezpieczeĹ„';
    default:
      return analysisType;
  }
}

/**
 * Hook: Get active run ID.
 */
export function useActiveRunId(): string | null {
  return useAppStateStore((state) => state.activeRunId);
}

/**
 * Hook: Get complete UI context for Context Bar.
 * UI_INTEGRATION_E2E: Single source of truth per UI_CORE_ARCHITECTURE.md Â§ 5.2
 */
export function useUIContext() {
  return useAppStateStore((state) => ({
    projectId: state.activeProjectId,
    projectName: state.activeProjectName,
    caseId: state.activeCaseId,
    caseName: state.activeCaseName,
    snapshotId: state.activeSnapshotId,
    runId: state.activeRunId,
    analysisType: state.activeAnalysisType,
    mode: state.activeMode,
    resultStatus: state.activeCaseResultStatus,
  }));
}
