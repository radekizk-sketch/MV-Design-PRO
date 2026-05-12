/**
 * App State Store Tests
 *
 * Tests for the global application state Zustand store.
 * Validates:
 * - Initial state values
 * - Project and case lifecycle
 * - Operating mode transitions and side effects
 * - Computed helpers (hasActiveCase, canCalculate, isModelEditable, etc.)
 * - Case Manager and Issue Panel toggles
 * - Reset behavior
 * - Context clearing when project/case changes
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStateStore } from '../store';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { makeCalculationReadySnapshot } from '../../../test/enmCalculationSnapshot';

describe('useAppStateStore', () => {
  beforeEach(() => {
    // Reset to initial state before each test
    useAppStateStore.getState().reset();
    useSnapshotStore.getState().reset();
  });

  // ===========================================================================
  // Initial State
  // ===========================================================================

  describe('initial state', () => {
    it('should start with null project and case', () => {
      const state = useAppStateStore.getState();
      expect(state.activeProjectId).toBeNull();
      expect(state.activeProjectName).toBeNull();
      expect(state.activeCaseId).toBeNull();
      expect(state.activeCaseName).toBeNull();
      expect(state.activeCaseKind).toBeNull();
    });

    it('should start in MODEL_EDIT mode', () => {
      expect(useAppStateStore.getState().activeMode).toBe('MODEL_EDIT');
    });

    it('should start with NONE result status', () => {
      expect(useAppStateStore.getState().activeCaseResultStatus).toBe('NONE');
    });

    it('should start with no active run', () => {
      expect(useAppStateStore.getState().activeRunId).toBeNull();
    });

    it('should start with no active snapshot', () => {
      expect(useAppStateStore.getState().activeSnapshotId).toBeNull();
    });

    it('should start with no active analysis type', () => {
      expect(useAppStateStore.getState().activeAnalysisType).toBeNull();
    });

    it('should start with issue panel closed', () => {
      expect(useAppStateStore.getState().issuePanelOpen).toBe(false);
    });
  });

  // ===========================================================================
  // setActiveProject
  // ===========================================================================

  describe('setActiveProject', () => {
    it('should set project ID and name', () => {
      useAppStateStore.getState().setActiveProject('proj-1', 'Test Project');
      const state = useAppStateStore.getState();
      expect(state.activeProjectId).toBe('proj-1');
      expect(state.activeProjectName).toBe('Test Project');
    });

    it('should clear case context when project changes', () => {
      // First set a project and case
      useAppStateStore.getState().setActiveProject('proj-1', 'Project 1');
      useAppStateStore.getState().setActiveCase('case-1', 'Case 1', 'ShortCircuitCase', 'FRESH');
      useAppStateStore.getState().setActiveSnapshot('snap-1');
      useAppStateStore.getState().setActiveAnalysisType('SHORT_CIRCUIT');
      useSnapshotStore.setState({ snapshot: makeCalculationReadySnapshot() });

      // Change project
      useAppStateStore.getState().setActiveProject('proj-2', 'Project 2');

      const state = useAppStateStore.getState();
      expect(state.activeProjectId).toBe('proj-2');
      expect(state.activeCaseId).toBeNull();
      expect(state.activeCaseName).toBeNull();
      expect(state.activeCaseKind).toBeNull();
      expect(state.activeCaseResultStatus).toBe('NONE');
      expect(state.activeSnapshotId).toBeNull();
      expect(state.activeRunId).toBeNull();
      expect(state.activeAnalysisType).toBeNull();
      expect(useSnapshotStore.getState().snapshot).toBeNull();
    });

    it('should NOT clear case context when same project is re-set', () => {
      useAppStateStore.getState().setActiveProject('proj-1', 'Project 1');
      useAppStateStore.getState().setActiveCase('case-1', 'Case 1', 'ShortCircuitCase', 'FRESH');

      // Re-set same project with updated name
      useAppStateStore.getState().setActiveProject('proj-1', 'Project 1 (renamed)');

      const state = useAppStateStore.getState();
      expect(state.activeProjectId).toBe('proj-1');
      expect(state.activeProjectName).toBe('Project 1 (renamed)');
      expect(state.activeCaseId).toBe('case-1'); // Preserved
    });

    it('should set null project name by default', () => {
      useAppStateStore.getState().setActiveProject('proj-1');
      expect(useAppStateStore.getState().activeProjectName).toBeNull();
    });
  });

  // ===========================================================================
  // setActiveCase
  // ===========================================================================

  describe('setActiveCase', () => {
    it('should set all case properties', () => {
      useAppStateStore.getState().setActiveCase('case-1', 'SC-001', 'ShortCircuitCase', 'FRESH');
      const state = useAppStateStore.getState();
      expect(state.activeCaseId).toBe('case-1');
      expect(state.activeCaseName).toBe('SC-001');
      expect(state.activeCaseKind).toBe('ShortCircuitCase');
      expect(state.activeCaseResultStatus).toBe('FRESH');
    });

    it('should clear run and snapshot when case changes', () => {
      useAppStateStore.getState().setActiveRun('run-1');
      useAppStateStore.getState().setActiveSnapshot('snap-1');

      useAppStateStore.getState().setActiveCase('case-2', 'PF-001', 'PowerFlowCase');

      expect(useAppStateStore.getState().activeRunId).toBeNull();
      expect(useAppStateStore.getState().activeSnapshotId).toBeNull();
    });

    it('should use defaults for optional params', () => {
      useAppStateStore.getState().setActiveCase('case-1');
      const state = useAppStateStore.getState();
      expect(state.activeCaseName).toBeNull();
      expect(state.activeCaseKind).toBeNull();
      expect(state.activeCaseResultStatus).toBe('NONE');
    });

    it('should support PowerFlowCase kind', () => {
      useAppStateStore.getState().setActiveCase('case-pf', 'PF-001', 'PowerFlowCase', 'OUTDATED');
      expect(useAppStateStore.getState().activeCaseKind).toBe('PowerFlowCase');
      expect(useAppStateStore.getState().activeCaseResultStatus).toBe('OUTDATED');
    });
  });

  // ===========================================================================
  // setActiveCaseResultStatus
  // ===========================================================================

  describe('setActiveCaseResultStatus', () => {
    it('should update result status independently', () => {
      useAppStateStore.getState().setActiveCase('case-1', 'SC-001', 'ShortCircuitCase', 'NONE');
      useAppStateStore.getState().setActiveCaseResultStatus('FRESH');
      expect(useAppStateStore.getState().activeCaseResultStatus).toBe('FRESH');
    });

    it('should support transitioning through all statuses', () => {
      useAppStateStore.getState().setActiveCaseResultStatus('NONE');
      expect(useAppStateStore.getState().activeCaseResultStatus).toBe('NONE');

      useAppStateStore.getState().setActiveCaseResultStatus('FRESH');
      expect(useAppStateStore.getState().activeCaseResultStatus).toBe('FRESH');

      useAppStateStore.getState().setActiveCaseResultStatus('OUTDATED');
      expect(useAppStateStore.getState().activeCaseResultStatus).toBe('OUTDATED');
    });
  });

  // ===========================================================================
  // setActiveMode
  // ===========================================================================

  describe('setActiveMode', () => {
    it('should normalize legacy CASE_CONFIG into MODEL_EDIT', () => {
      useAppStateStore.getState().setActiveMode('CASE_CONFIG');
      expect(useAppStateStore.getState().activeMode).toBe('MODEL_EDIT');
    });

    it('should clear activeRunId when exiting RESULT_VIEW', () => {
      useAppStateStore.getState().setActiveMode('RESULT_VIEW');
      useAppStateStore.getState().setActiveRun('run-1');
      expect(useAppStateStore.getState().activeRunId).toBe('run-1');

      // Exit RESULT_VIEW
      useAppStateStore.getState().setActiveMode('MODEL_EDIT');
      expect(useAppStateStore.getState().activeRunId).toBeNull();
    });

    it('should NOT clear activeRunId when staying in RESULT_VIEW', () => {
      useAppStateStore.getState().setActiveRun('run-1');
      useAppStateStore.getState().setActiveMode('RESULT_VIEW');
      // Run is preserved when entering RESULT_VIEW (cleared only when exiting)
      expect(useAppStateStore.getState().activeRunId).toBe('run-1');
    });

    it('should support writable and read-only shell states', () => {
      useAppStateStore.getState().setActiveMode('MODEL_EDIT');
      expect(useAppStateStore.getState().activeMode).toBe('MODEL_EDIT');

      useAppStateStore.getState().setActiveMode('RESULT_VIEW');
      expect(useAppStateStore.getState().activeMode).toBe('RESULT_VIEW');
    });
  });

  // ===========================================================================
  // Computed Helpers
  // ===========================================================================

  describe('computed helpers', () => {
    describe('hasActiveCase', () => {
      it('should return false when no case is active', () => {
        expect(useAppStateStore.getState().hasActiveCase()).toBe(false);
      });

      it('should return true when a case is active', () => {
        useAppStateStore.getState().setActiveCase('case-1');
        expect(useAppStateStore.getState().hasActiveCase()).toBe(true);
      });
    });

    describe('canCalculate', () => {
      it('should return false when no case is active', () => {
        useAppStateStore.getState().setActiveMode('MODEL_EDIT');
        expect(useAppStateStore.getState().canCalculate()).toBe(false);
      });

      it('should return false when in RESULT_VIEW mode', () => {
        useAppStateStore.getState().setActiveCase('case-1', 'Case', 'ShortCircuitCase', 'NONE');
        useAppStateStore.getState().setActiveMode('RESULT_VIEW');
        expect(useAppStateStore.getState().canCalculate()).toBe(false);
      });

      it('should return false when results are FRESH', () => {
        useAppStateStore.getState().setActiveCase('case-1', 'Case', 'ShortCircuitCase', 'FRESH');
        useAppStateStore.getState().setActiveMode('MODEL_EDIT');
        expect(useAppStateStore.getState().canCalculate()).toBe(false);
      });

      it('should return true with active case + MODEL_EDIT + NONE results', () => {
        useAppStateStore.getState().setActiveCase('case-1', 'Case', 'ShortCircuitCase', 'NONE');
        useAppStateStore.getState().setActiveMode('MODEL_EDIT');
        useSnapshotStore.setState({ snapshot: makeCalculationReadySnapshot() });
        expect(useAppStateStore.getState().canCalculate()).toBe(true);
      });

      it('should return true with active case + MODEL_EDIT + OUTDATED results', () => {
        useAppStateStore.getState().setActiveCase('case-1', 'Case', 'ShortCircuitCase', 'OUTDATED');
        useAppStateStore.getState().setActiveMode('MODEL_EDIT');
        useSnapshotStore.setState({ snapshot: makeCalculationReadySnapshot() });
        expect(useAppStateStore.getState().canCalculate()).toBe(true);
      });

      it('should return false when readiness has blocker', () => {
        useAppStateStore.getState().setActiveCase('case-1', 'Case', 'ShortCircuitCase', 'OUTDATED');
        useAppStateStore.getState().setActiveMode('MODEL_EDIT');
        useSnapshotStore.setState({
          snapshot: makeCalculationReadySnapshot(),
          readiness: {
            ready: false,
            blockers: [{ code: 'catalog.ref_missing', message_pl: 'Brak katalogu' }],
            warnings: [],
            summary: { blocker_count: 1, warning_count: 0 },
            checked_at: '2026-01-01T00:00:00Z',
          },
        });

        expect(useAppStateStore.getState().canCalculate()).toBe(false);
      });
    });

    describe('isModelEditable', () => {
      it('should return true in MODEL_EDIT mode', () => {
        useAppStateStore.getState().setActiveMode('MODEL_EDIT');
        expect(useAppStateStore.getState().isModelEditable()).toBe(true);
      });

      it('should normalize CASE_CONFIG to writable shell state', () => {
        useAppStateStore.getState().setActiveMode('CASE_CONFIG');
        expect(useAppStateStore.getState().isModelEditable()).toBe(true);
      });

      it('should return false in RESULT_VIEW mode', () => {
        useAppStateStore.getState().setActiveMode('RESULT_VIEW');
        expect(useAppStateStore.getState().isModelEditable()).toBe(false);
      });
    });

    describe('isCaseConfigEditable', () => {
      it('should return true in MODEL_EDIT mode', () => {
        useAppStateStore.getState().setActiveMode('MODEL_EDIT');
        expect(useAppStateStore.getState().isCaseConfigEditable()).toBe(true);
      });

      it('should remain editable for compatibility alias CASE_CONFIG', () => {
        useAppStateStore.getState().setActiveMode('CASE_CONFIG');
        expect(useAppStateStore.getState().isCaseConfigEditable()).toBe(true);
      });

      it('should return false in RESULT_VIEW mode', () => {
        useAppStateStore.getState().setActiveMode('RESULT_VIEW');
        expect(useAppStateStore.getState().isCaseConfigEditable()).toBe(false);
      });
    });

    describe('isReadOnly', () => {
      it('should return true only in RESULT_VIEW mode', () => {
        useAppStateStore.getState().setActiveMode('RESULT_VIEW');
        expect(useAppStateStore.getState().isReadOnly()).toBe(true);

        useAppStateStore.getState().setActiveMode('MODEL_EDIT');
        expect(useAppStateStore.getState().isReadOnly()).toBe(false);

        useAppStateStore.getState().setActiveMode('CASE_CONFIG');
        expect(useAppStateStore.getState().isReadOnly()).toBe(false);
      });
    });
  });

  describe('toggleIssuePanel', () => {
    it('should toggle issue panel', () => {
      expect(useAppStateStore.getState().issuePanelOpen).toBe(false);

      useAppStateStore.getState().toggleIssuePanel();
      expect(useAppStateStore.getState().issuePanelOpen).toBe(true);

      useAppStateStore.getState().toggleIssuePanel();
      expect(useAppStateStore.getState().issuePanelOpen).toBe(false);
    });

    it('should accept explicit open parameter', () => {
      useAppStateStore.getState().toggleIssuePanel(true);
      expect(useAppStateStore.getState().issuePanelOpen).toBe(true);

      useAppStateStore.getState().toggleIssuePanel(false);
      expect(useAppStateStore.getState().issuePanelOpen).toBe(false);
    });
  });

  // ===========================================================================
  // Snapshot and Analysis Type
  // ===========================================================================

  describe('setActiveSnapshot', () => {
    it('should set active snapshot ID', () => {
      useAppStateStore.getState().setActiveSnapshot('snap-123');
      expect(useAppStateStore.getState().activeSnapshotId).toBe('snap-123');
    });

    it('should allow clearing snapshot', () => {
      useAppStateStore.getState().setActiveSnapshot('snap-123');
      useAppStateStore.getState().setActiveSnapshot(null);
      expect(useAppStateStore.getState().activeSnapshotId).toBeNull();
    });
  });

  describe('setActiveAnalysisType', () => {
    it('should set analysis type', () => {
      useAppStateStore.getState().setActiveAnalysisType('SHORT_CIRCUIT');
      expect(useAppStateStore.getState().activeAnalysisType).toBe('SHORT_CIRCUIT');
    });

    it('should support all analysis types', () => {
      for (const type of ['SHORT_CIRCUIT', 'LOAD_FLOW', 'PROTECTION'] as const) {
        useAppStateStore.getState().setActiveAnalysisType(type);
        expect(useAppStateStore.getState().activeAnalysisType).toBe(type);
      }
    });

    it('should allow clearing analysis type', () => {
      useAppStateStore.getState().setActiveAnalysisType('SHORT_CIRCUIT');
      useAppStateStore.getState().setActiveAnalysisType(null);
      expect(useAppStateStore.getState().activeAnalysisType).toBeNull();
    });
  });

  // ===========================================================================
  // Reset
  // ===========================================================================

  describe('reset', () => {
    it('should restore all fields to initial state', () => {
      // Set non-default values
      useAppStateStore.getState().setActiveProject('proj-1', 'Project 1');
      useAppStateStore.getState().setActiveCase('case-1', 'Case 1', 'ShortCircuitCase', 'FRESH');
      useAppStateStore.getState().setActiveMode('RESULT_VIEW');
      useAppStateStore.getState().setActiveRun('run-1');
      useAppStateStore.getState().setActiveSnapshot('snap-1');
      useAppStateStore.getState().setActiveAnalysisType('SHORT_CIRCUIT');
      useAppStateStore.getState().toggleIssuePanel(true);

      // Reset
      useAppStateStore.getState().reset();

      const state = useAppStateStore.getState();
      expect(state.activeProjectId).toBeNull();
      expect(state.activeProjectName).toBeNull();
      expect(state.activeCaseId).toBeNull();
      expect(state.activeCaseName).toBeNull();
      expect(state.activeCaseKind).toBeNull();
      expect(state.activeCaseResultStatus).toBe('NONE');
      expect(state.activeSnapshotId).toBeNull();
      expect(state.activeMode).toBe('MODEL_EDIT');
      expect(state.activeRunId).toBeNull();
      expect(state.activeAnalysisType).toBeNull();
      expect(state.issuePanelOpen).toBe(false);
    });
  });
});
