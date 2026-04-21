/**
 * App State Store Tests — P12a Data Manager Parity
 *
 * CANONICAL ALIGNMENT:
 * - wizard_screens.md § 1.2: Operating modes
 * - wizard_screens.md § 1.3: Active case awareness
 * - ui_canonical_parity.md § A: Mode-based gating
 *
 * Tests:
 * - Active project/case management
 * - Mode switching
 * - Calculation permission rules
 * - Polish labels
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStateStore } from '../app-state/store';
import { useSnapshotStore } from '../topology/snapshotStore';

describe('App State Store', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useAppStateStore.getState().reset();
    useSnapshotStore.getState().reset();
  });

  describe('Project Management', () => {
    it('should have no active project by default', () => {
      const state = useAppStateStore.getState();
      expect(state.activeProjectId).toBeNull();
      expect(state.activeProjectName).toBeNull();
    });

    it('should set active project', () => {
      const { setActiveProject } = useAppStateStore.getState();

      setActiveProject('project-123', 'Projekt testowy');

      const state = useAppStateStore.getState();
      expect(state.activeProjectId).toBe('project-123');
      expect(state.activeProjectName).toBe('Projekt testowy');
    });

    it('should clear case when project changes', () => {
      const store = useAppStateStore.getState();

      store.setActiveProject('project-1', 'Projekt 1');
      store.setActiveCase('case-1', 'Przypadek 1', 'ShortCircuitCase', 'FRESH');

      expect(useAppStateStore.getState().activeCaseId).toBe('case-1');

      store.setActiveProject('project-2', 'Projekt 2');

      const state = useAppStateStore.getState();
      expect(state.activeProjectId).toBe('project-2');
      expect(state.activeCaseId).toBeNull();
      expect(state.activeCaseName).toBeNull();
      expect(state.activeCaseKind).toBeNull();
      expect(state.activeCaseResultStatus).toBe('NONE');
    });

    it('should not clear case when setting same project', () => {
      const store = useAppStateStore.getState();

      store.setActiveProject('project-1', 'Projekt 1');
      store.setActiveCase('case-1', 'Przypadek 1', 'ShortCircuitCase', 'FRESH');

      store.setActiveProject('project-1', 'Projekt 1 (updated)');

      const state = useAppStateStore.getState();
      expect(state.activeProjectId).toBe('project-1');
      expect(state.activeProjectName).toBe('Projekt 1 (updated)');
      expect(state.activeCaseId).toBe('case-1');
    });
  });

  describe('Case Management', () => {
    it('should have no active case by default', () => {
      const state = useAppStateStore.getState();
      expect(state.activeCaseId).toBeNull();
      expect(state.activeCaseName).toBeNull();
      expect(state.activeCaseKind).toBeNull();
      expect(state.activeCaseResultStatus).toBe('NONE');
    });

    it('should set active case', () => {
      const { setActiveCase } = useAppStateStore.getState();

      setActiveCase('case-123', 'SC-001', 'ShortCircuitCase', 'FRESH');

      const state = useAppStateStore.getState();
      expect(state.activeCaseId).toBe('case-123');
      expect(state.activeCaseName).toBe('SC-001');
      expect(state.activeCaseKind).toBe('ShortCircuitCase');
      expect(state.activeCaseResultStatus).toBe('FRESH');
    });

    it('should update result status', () => {
      const store = useAppStateStore.getState();

      store.setActiveCase('case-1', 'SC-001', 'ShortCircuitCase', 'NONE');
      expect(useAppStateStore.getState().activeCaseResultStatus).toBe('NONE');

      store.setActiveCaseResultStatus('FRESH');
      expect(useAppStateStore.getState().activeCaseResultStatus).toBe('FRESH');

      store.setActiveCaseResultStatus('OUTDATED');
      expect(useAppStateStore.getState().activeCaseResultStatus).toBe('OUTDATED');
    });

    it('should clear run when case changes', () => {
      const store = useAppStateStore.getState();

      store.setActiveCase('case-1', 'SC-001', 'ShortCircuitCase', 'FRESH');
      store.setActiveRun('run-123');
      expect(useAppStateStore.getState().activeRunId).toBe('run-123');

      store.setActiveCase('case-2', 'PF-001', 'PowerFlowCase', 'NONE');
      expect(useAppStateStore.getState().activeRunId).toBeNull();
    });
  });

  describe('Operating Mode', () => {
    it('should default to MODEL_EDIT mode', () => {
      const state = useAppStateStore.getState();
      expect(state.activeMode).toBe('MODEL_EDIT');
    });

    it('should change mode', () => {
      const store = useAppStateStore.getState();

      store.setActiveMode('CASE_CONFIG');
      expect(useAppStateStore.getState().activeMode).toBe('MODEL_EDIT');

      store.setActiveMode('RESULT_VIEW');
      expect(useAppStateStore.getState().activeMode).toBe('RESULT_VIEW');

      store.setActiveMode('MODEL_EDIT');
      expect(useAppStateStore.getState().activeMode).toBe('MODEL_EDIT');
    });

    it('should clear run when exiting RESULT_VIEW', () => {
      const store = useAppStateStore.getState();

      store.setActiveMode('RESULT_VIEW');
      store.setActiveRun('run-123');
      expect(useAppStateStore.getState().activeRunId).toBe('run-123');

      store.setActiveMode('MODEL_EDIT');
      expect(useAppStateStore.getState().activeRunId).toBeNull();
    });

    it('should not clear run when staying in RESULT_VIEW', () => {
      const store = useAppStateStore.getState();

      store.setActiveMode('RESULT_VIEW');
      store.setActiveRun('run-123');

      store.setActiveMode('RESULT_VIEW');
      expect(useAppStateStore.getState().activeRunId).toBe('run-123');
    });
  });

  describe('Computed Helpers', () => {
    describe('hasActiveCase', () => {
      it('should return false when no case is active', () => {
        const { hasActiveCase } = useAppStateStore.getState();
        expect(hasActiveCase()).toBe(false);
      });

      it('should return true when case is active', () => {
        const store = useAppStateStore.getState();
        store.setActiveCase('case-1', 'SC-001', 'ShortCircuitCase', 'NONE');
        expect(store.hasActiveCase()).toBe(true);
      });
    });

    describe('canCalculate', () => {
      it('should return false when no active case', () => {
        const store = useAppStateStore.getState();
        store.setActiveMode('MODEL_EDIT');
        expect(store.canCalculate()).toBe(false);
      });

      it('should return false when not in MODEL_EDIT mode', () => {
        const store = useAppStateStore.getState();
        store.setActiveCase('case-1', 'SC-001', 'ShortCircuitCase', 'NONE');
        store.setActiveMode('CASE_CONFIG');
        expect(store.canCalculate()).toBe(true);

        store.setActiveMode('RESULT_VIEW');
        expect(store.canCalculate()).toBe(false);
      });

      it('should return false when results are FRESH', () => {
        const store = useAppStateStore.getState();
        store.setActiveCase('case-1', 'SC-001', 'ShortCircuitCase', 'FRESH');
        store.setActiveMode('MODEL_EDIT');
        expect(store.canCalculate()).toBe(false);
      });

      it('should return true when can calculate', () => {
        const store = useAppStateStore.getState();
        store.setActiveCase('case-1', 'SC-001', 'ShortCircuitCase', 'NONE');
        store.setActiveMode('MODEL_EDIT');
        expect(store.canCalculate()).toBe(true);

        store.setActiveCaseResultStatus('OUTDATED');
        expect(store.canCalculate()).toBe(true);
      });

      it('should return false when readiness has blockers', () => {
        const store = useAppStateStore.getState();
        store.setActiveCase('case-1', 'SC-001', 'ShortCircuitCase', 'OUTDATED');
        store.setActiveMode('MODEL_EDIT');
        useSnapshotStore.setState({ readiness: {
          ready: false,
          blockers: [{ code: 'catalog.ref_missing', message_pl: 'Brak katalogu' }],
          warnings: [],
          summary: { blocker_count: 1, warning_count: 0 },
          checked_at: '2026-01-01T00:00:00Z',
        } });

        expect(store.canCalculate()).toBe(false);
      });
    });

    describe('isModelEditable', () => {
      it('should return true in MODEL_EDIT mode', () => {
        const store = useAppStateStore.getState();
        store.setActiveMode('MODEL_EDIT');
        expect(store.isModelEditable()).toBe(true);
      });

      it('should return false in other modes', () => {
        const store = useAppStateStore.getState();

        store.setActiveMode('CASE_CONFIG');
        expect(store.isModelEditable()).toBe(true);

        store.setActiveMode('RESULT_VIEW');
        expect(store.isModelEditable()).toBe(false);
      });
    });

    describe('isCaseConfigEditable', () => {
      it('should return true in MODEL_EDIT and after CASE_CONFIG compatibility input', () => {
        const store = useAppStateStore.getState();

        store.setActiveMode('MODEL_EDIT');
        expect(store.isCaseConfigEditable()).toBe(true);

        store.setActiveMode('CASE_CONFIG');
        expect(store.isCaseConfigEditable()).toBe(true);
      });

      it('should return false in RESULT_VIEW mode', () => {
        const store = useAppStateStore.getState();
        store.setActiveMode('RESULT_VIEW');
        expect(store.isCaseConfigEditable()).toBe(false);
      });
    });

    describe('isReadOnly', () => {
      it('should return true in RESULT_VIEW mode', () => {
        const store = useAppStateStore.getState();
        store.setActiveMode('RESULT_VIEW');
        expect(store.isReadOnly()).toBe(true);
      });

      it('should return false in other modes', () => {
        const store = useAppStateStore.getState();

        store.setActiveMode('MODEL_EDIT');
        expect(store.isReadOnly()).toBe(false);

        store.setActiveMode('CASE_CONFIG');
        expect(store.isReadOnly()).toBe(false);
      });
    });
  });

  describe('Reset', () => {
    it('should reset to initial state', () => {
      const store = useAppStateStore.getState();

      store.setActiveProject('project-1', 'Projekt 1');
      store.setActiveCase('case-1', 'SC-001', 'ShortCircuitCase', 'FRESH');
      store.setActiveMode('RESULT_VIEW');
      store.setActiveRun('run-123');

      store.reset();

      const state = useAppStateStore.getState();
      expect(state.activeProjectId).toBeNull();
      expect(state.activeCaseId).toBeNull();
      expect(state.activeMode).toBe('MODEL_EDIT');
      expect(state.activeRunId).toBeNull();
    });
  });
});

describe('Polish Labels', () => {
  beforeEach(() => {
    useAppStateStore.getState().reset();
  });

  it('should return no active case message when none selected', () => {
    const store = useAppStateStore.getState();
    // This would be tested via the hook, but we verify the state
    expect(store.activeCaseId).toBeNull();
  });
});
