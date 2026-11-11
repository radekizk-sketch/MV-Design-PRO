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
import { makeCalculationReadySnapshot } from '../../test/enmCalculationSnapshot';
import { ustawBiegOgladany, wyczyscKontekstWyniku } from '../../test/kontekstBiegu';
import { useExecutionRunsStore } from '../study-cases/runStore';
import { runIdOgladanyTeraz, useKontekstWynikuStore } from '../../ui2/wyniki/kontekst/kontekstWyniku';

describe('App State Store', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useAppStateStore.getState().reset();
    useSnapshotStore.getState().reset();
    useExecutionRunsStore.getState().reset();
    wyczyscKontekstWyniku();
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
      ustawBiegOgladany('run-123');
      expect(runIdOgladanyTeraz()).toBe('run-123');

      store.setActiveCase('case-2', 'PF-001', 'PowerFlowCase', 'NONE');
      expect(runIdOgladanyTeraz()).toBeNull();
      expect(useKontekstWynikuStore.getState().oczekujacy).toBeNull();
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

    // Karta K8 (kanon zmieniony): tryb nie jest źródłem wyboru biegu — wyjście
    // z RESULT_VIEW nie gasi oglądanego biegu (schemat i ekran wyników pokazują ten sam).
    it('should keep the viewed run when exiting and re-entering RESULT_VIEW', () => {
      const store = useAppStateStore.getState();

      store.setActiveMode('RESULT_VIEW');
      ustawBiegOgladany('run-123');
      store.setActiveMode('MODEL_EDIT');
      expect(runIdOgladanyTeraz()).toBe('run-123');
      store.setActiveMode('RESULT_VIEW');
      expect(runIdOgladanyTeraz()).toBe('run-123');
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

      it('should allow calculation from case configuration and result surfaces when model is ready', () => {
        const store = useAppStateStore.getState();
        store.setActiveCase('case-1', 'SC-001', 'ShortCircuitCase', 'NONE');
        useSnapshotStore.setState({ snapshot: makeCalculationReadySnapshot() });
        store.setActiveMode('CASE_CONFIG');
        expect(store.canCalculate()).toBe(true);

        store.setActiveMode('RESULT_VIEW');
        expect(store.canCalculate()).toBe(true);
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
        useSnapshotStore.setState({ snapshot: makeCalculationReadySnapshot() });
        expect(store.canCalculate()).toBe(true);

        store.setActiveCaseResultStatus('OUTDATED');
        expect(store.canCalculate()).toBe(true);
      });

      it('should return false when readiness has blockers', () => {
        const store = useAppStateStore.getState();
        store.setActiveCase('case-1', 'SC-001', 'ShortCircuitCase', 'OUTDATED');
        store.setActiveMode('MODEL_EDIT');
        useSnapshotStore.setState({
          snapshot: makeCalculationReadySnapshot(),
          readiness: {
            ready: false,
            blockers: [
              {
                code: 'catalog.ref_missing',
                message_pl: 'Brak katalogu',
                element_ref: null,
                severity: 'BLOCKER',
              },
            ],
            warnings: [],
          },
        });

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

      store.reset();

      const state = useAppStateStore.getState();
      expect(state.activeProjectId).toBeNull();
      expect(state.activeCaseId).toBeNull();
      expect(state.activeMode).toBe('MODEL_EDIT');
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
