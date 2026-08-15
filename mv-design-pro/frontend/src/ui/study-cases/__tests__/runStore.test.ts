/**
 * Execution Runs Store Tests
 *
 * Tests for the execution runs Zustand store.
 * Validates:
 * - Initial state values
 * - setActiveStudyCaseId: clears context, triggers load
 * - setActiveRun: sets run and syncs status
 * - clearRunError: clears error state
 * - reset: restores initial state
 * - loadRuns: success and error handling
 * - loadRunResults: caching behavior
 * - createAndExecuteRun: state transitions
 * - pollRunStatus: status updates
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useExecutionRunsStore } from '../runStore';
import type { ExecutionRun, ExecutionResultSet } from '../types';

// Mock the API module
vi.mock('../api', () => ({
  createRun: vi.fn(),
  executeRun: vi.fn(),
  listRuns: vi.fn(),
  getRunResults: vi.fn(),
  getRun: vi.fn(),
}));

import * as api from '../api';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const MOCK_RUN: ExecutionRun = {
  id: 'run-001',
  study_case_id: 'case-001',
  analysis_type: 'SC_3F',
  solver_input_hash: 'hash123',
  status: 'PENDING',
  started_at: null,
  finished_at: null,
  error_message: null,
};

const MOCK_RUN_DONE: ExecutionRun = {
  ...MOCK_RUN,
  id: 'run-002',
  status: 'DONE',
  started_at: '2025-01-15T10:00:00Z',
  finished_at: '2025-01-15T10:00:05Z',
};

const MOCK_RESULT_SET: ExecutionResultSet = {
  run_id: 'run-002',
  analysis_type: 'SC_3F',
  validation_snapshot: {},
  readiness_snapshot: {},
  element_results: [
    {
      element_ref: 'bus-1',
      element_type: 'Bus',
      values: { ik_3f_ka: 12.5 },
    },
  ],
  global_results: {},
  deterministic_signature: 'sig-abc',
};

describe('useExecutionRunsStore', () => {
  beforeEach(() => {
    useExecutionRunsStore.getState().reset();
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Initial State
  // ===========================================================================

  describe('initial state', () => {
    it('should have null active study case ID', () => {
      expect(useExecutionRunsStore.getState().activeStudyCaseId).toBeNull();
    });

    it('should have null active run ID', () => {
      expect(useExecutionRunsStore.getState().activeRunId).toBeNull();
    });

    it('should have null run status', () => {
      expect(useExecutionRunsStore.getState().runStatus).toBeNull();
    });

    it('should have empty runs array', () => {
      expect(useExecutionRunsStore.getState().runs).toEqual([]);
    });

    it('should have empty results cache', () => {
      expect(useExecutionRunsStore.getState().runResultsCache).toEqual({});
    });

    it('should not be in any loading state', () => {
      const state = useExecutionRunsStore.getState();
      expect(state.isCreatingRun).toBe(false);
      expect(state.isExecutingRun).toBe(false);
      expect(state.isLoadingRuns).toBe(false);
      expect(state.isLoadingResults).toBe(false);
    });

    it('should have no error', () => {
      expect(useExecutionRunsStore.getState().runError).toBeNull();
    });
  });

  // ===========================================================================
  // setActiveStudyCaseId
  // ===========================================================================

  describe('setActiveStudyCaseId', () => {
    it('should set active study case ID', () => {
      vi.mocked(api.listRuns).mockResolvedValue({ runs: [], count: 0 });

      useExecutionRunsStore.getState().setActiveStudyCaseId('case-001');

      expect(useExecutionRunsStore.getState().activeStudyCaseId).toBe('case-001');
    });

    it('should clear previous run context', () => {
      useExecutionRunsStore.setState({
        activeRunId: 'run-old',
        runStatus: 'DONE',
        runs: [MOCK_RUN],
      });

      vi.mocked(api.listRuns).mockResolvedValue({ runs: [], count: 0 });

      useExecutionRunsStore.getState().setActiveStudyCaseId('case-002');

      const state = useExecutionRunsStore.getState();
      expect(state.activeRunId).toBeNull();
      expect(state.runStatus).toBeNull();
      expect(state.runs).toEqual([]);
    });

    it('should trigger loadRuns when case ID is not null', () => {
      vi.mocked(api.listRuns).mockResolvedValue({ runs: [], count: 0 });

      useExecutionRunsStore.getState().setActiveStudyCaseId('case-001');

      expect(api.listRuns).toHaveBeenCalledWith('case-001');
    });

    it('should NOT trigger loadRuns when case ID is null', () => {
      useExecutionRunsStore.getState().setActiveStudyCaseId(null);

      expect(api.listRuns).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // setActiveRun
  // ===========================================================================

  describe('setActiveRun', () => {
    it('should set active run ID', () => {
      useExecutionRunsStore.getState().setActiveRun('run-001');
      expect(useExecutionRunsStore.getState().activeRunId).toBe('run-001');
    });

    it('should sync run status from runs list', () => {
      useExecutionRunsStore.setState({ runs: [MOCK_RUN, MOCK_RUN_DONE] });

      useExecutionRunsStore.getState().setActiveRun('run-002');

      expect(useExecutionRunsStore.getState().runStatus).toBe('DONE');
    });

    it('should clear run status when set to null', () => {
      useExecutionRunsStore.setState({ runStatus: 'DONE' });

      useExecutionRunsStore.getState().setActiveRun(null);

      expect(useExecutionRunsStore.getState().activeRunId).toBeNull();
      expect(useExecutionRunsStore.getState().runStatus).toBeNull();
    });
  });

  // ===========================================================================
  // loadRuns
  // ===========================================================================

  describe('loadRuns', () => {
    it('should load runs from API and store them', async () => {
      vi.mocked(api.listRuns).mockResolvedValue({
        runs: [MOCK_RUN, MOCK_RUN_DONE],
        count: 2,
      });

      await useExecutionRunsStore.getState().loadRuns('case-001');

      const state = useExecutionRunsStore.getState();
      expect(state.runs).toHaveLength(2);
      expect(state.isLoadingRuns).toBe(false);
    });

    it('should handle API errors with Polish message', async () => {
      vi.mocked(api.listRuns).mockRejectedValue(
        new Error('Blad sieciowy')
      );

      await useExecutionRunsStore.getState().loadRuns('case-001');

      const state = useExecutionRunsStore.getState();
      expect(state.runError).toBe('Blad sieciowy');
      expect(state.isLoadingRuns).toBe(false);
    });

    it('nie zatruwa store odpowiedzią bez tablicy runs (błąd protokołu → runError, runs bez zmian)', async () => {
      // Defekt K4: payload {} (np. atrapa API bez tego endpointu) ustawiał
      // runs=undefined i wywracał konsumentów iterujących („runs is not
      // iterable" w drzewie przebiegów powłoki). Kontrakt pola: ExecutionRun[].
      vi.mocked(api.listRuns).mockResolvedValue(
        {} as unknown as Awaited<ReturnType<typeof api.listRuns>>,
      );

      await useExecutionRunsStore.getState().loadRuns('case-001');

      const state = useExecutionRunsStore.getState();
      expect(state.runs).toEqual([]);
      expect(state.runError).toBe('Niepoprawna odpowiedź listy przebiegów (brak pola runs)');
      expect(state.isLoadingRuns).toBe(false);
    });

    it('should set loading state during API call', async () => {
      let resolvePromise: (value: unknown) => void;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      vi.mocked(api.listRuns).mockReturnValue(promise as ReturnType<typeof api.listRuns>);

      // Start loading
      const loadPromise = useExecutionRunsStore.getState().loadRuns('case-001');
      expect(useExecutionRunsStore.getState().isLoadingRuns).toBe(true);

      // Complete loading
      resolvePromise!({ runs: [], count: 0 });
      await loadPromise;
      expect(useExecutionRunsStore.getState().isLoadingRuns).toBe(false);
    });
  });

  // ===========================================================================
  // loadRunResults (with caching)
  // ===========================================================================

  describe('loadRunResults', () => {
    it('should fetch results from API', async () => {
      vi.mocked(api.getRunResults).mockResolvedValue(MOCK_RESULT_SET);

      const result = await useExecutionRunsStore.getState().loadRunResults('run-002');

      expect(result).toEqual(MOCK_RESULT_SET);
      expect(api.getRunResults).toHaveBeenCalledWith('run-002');
    });

    it('should cache results after first fetch', async () => {
      vi.mocked(api.getRunResults).mockResolvedValue(MOCK_RESULT_SET);

      await useExecutionRunsStore.getState().loadRunResults('run-002');
      const cachedResult = await useExecutionRunsStore.getState().loadRunResults('run-002');

      // Should only call API once (second call uses cache)
      expect(api.getRunResults).toHaveBeenCalledTimes(1);
      expect(cachedResult).toEqual(MOCK_RESULT_SET);
    });

    it('should store results in cache under run_id', async () => {
      vi.mocked(api.getRunResults).mockResolvedValue(MOCK_RESULT_SET);

      await useExecutionRunsStore.getState().loadRunResults('run-002');

      const cache = useExecutionRunsStore.getState().runResultsCache;
      expect(cache['run-002']).toEqual(MOCK_RESULT_SET);
    });

    it('should handle API errors', async () => {
      vi.mocked(api.getRunResults).mockRejectedValue(
        new Error('Blad ladowania wynikow')
      );

      await expect(
        useExecutionRunsStore.getState().loadRunResults('run-bad')
      ).rejects.toThrow('Blad ladowania wynikow');

      expect(useExecutionRunsStore.getState().runError).toBe('Blad ladowania wynikow');
    });
  });

  // ===========================================================================
  // pollRunStatus
  // ===========================================================================

  describe('pollRunStatus', () => {
    it('should update run status from API', async () => {
      useExecutionRunsStore.setState({ runs: [MOCK_RUN] });

      const updatedRun: ExecutionRun = { ...MOCK_RUN, status: 'RUNNING' };
      vi.mocked(api.getRun).mockResolvedValue(updatedRun);

      const result = await useExecutionRunsStore.getState().pollRunStatus('run-001');

      expect(result.status).toBe('RUNNING');
      expect(useExecutionRunsStore.getState().runStatus).toBe('RUNNING');
    });

    it('should update run in runs list', async () => {
      useExecutionRunsStore.setState({ runs: [MOCK_RUN] });

      const updatedRun: ExecutionRun = { ...MOCK_RUN, status: 'DONE' };
      vi.mocked(api.getRun).mockResolvedValue(updatedRun);

      await useExecutionRunsStore.getState().pollRunStatus('run-001');

      const runs = useExecutionRunsStore.getState().runs;
      expect(runs[0].status).toBe('DONE');
    });

    it('should handle poll errors', async () => {
      vi.mocked(api.getRun).mockRejectedValue(
        new Error('Timeout')
      );

      await expect(
        useExecutionRunsStore.getState().pollRunStatus('run-001')
      ).rejects.toThrow('Timeout');

      expect(useExecutionRunsStore.getState().runError).toBe('Timeout');
    });
  });

  // ===========================================================================
  // clearRunError
  // ===========================================================================

  describe('clearRunError', () => {
    it('should clear error state', () => {
      useExecutionRunsStore.setState({ runError: 'Some error' });

      useExecutionRunsStore.getState().clearRunError();

      expect(useExecutionRunsStore.getState().runError).toBeNull();
    });
  });

  // ===========================================================================
  // reset
  // ===========================================================================

  describe('reset', () => {
    it('should restore all fields to initial state', () => {
      // Set non-default values
      useExecutionRunsStore.setState({
        activeStudyCaseId: 'case-001',
        activeRunId: 'run-001',
        runStatus: 'DONE',
        runs: [MOCK_RUN],
        runResultsCache: { 'run-001': MOCK_RESULT_SET },
        isCreatingRun: true,
        isExecutingRun: true,
        isLoadingRuns: true,
        isLoadingResults: true,
        runError: 'Some error',
      });

      useExecutionRunsStore.getState().reset();

      const state = useExecutionRunsStore.getState();
      expect(state.activeStudyCaseId).toBeNull();
      expect(state.activeRunId).toBeNull();
      expect(state.runStatus).toBeNull();
      expect(state.runs).toEqual([]);
      expect(state.runResultsCache).toEqual({});
      expect(state.isCreatingRun).toBe(false);
      expect(state.isExecutingRun).toBe(false);
      expect(state.isLoadingRuns).toBe(false);
      expect(state.isLoadingResults).toBe(false);
      expect(state.runError).toBeNull();
    });
  });

  // ===========================================================================
  // createAndExecuteRun
  // ===========================================================================

  describe('createAndExecuteRun', () => {
    it('should create and execute a run through API', async () => {
      const createdRun: ExecutionRun = { ...MOCK_RUN, status: 'PENDING' };
      const executedRun: ExecutionRun = { ...MOCK_RUN, status: 'RUNNING' };

      vi.mocked(api.createRun).mockResolvedValue(createdRun);
      vi.mocked(api.executeRun).mockResolvedValue(executedRun);
      vi.mocked(api.listRuns).mockResolvedValue({ runs: [executedRun], count: 1 });

      const result = await useExecutionRunsStore.getState().createAndExecuteRun(
        'case-001',
        { analysis_type: 'SC_3F' },
      );

      expect(result.status).toBe('RUNNING');
      expect(api.createRun).toHaveBeenCalledWith('case-001', { analysis_type: 'SC_3F' });
      expect(api.executeRun).toHaveBeenCalledWith('run-001');
    });

    it('should set active run ID after creation', async () => {
      const createdRun: ExecutionRun = { ...MOCK_RUN, status: 'PENDING' };
      const executedRun: ExecutionRun = { ...MOCK_RUN, status: 'RUNNING' };

      vi.mocked(api.createRun).mockResolvedValue(createdRun);
      vi.mocked(api.executeRun).mockResolvedValue(executedRun);
      vi.mocked(api.listRuns).mockResolvedValue({ runs: [executedRun], count: 1 });

      await useExecutionRunsStore.getState().createAndExecuteRun(
        'case-001',
        { analysis_type: 'SC_3F' },
      );

      expect(useExecutionRunsStore.getState().activeRunId).toBe('run-001');
    });

    it('should handle creation errors', async () => {
      vi.mocked(api.createRun).mockRejectedValue(
        new Error('Blad tworzenia przebiegu')
      );

      await expect(
        useExecutionRunsStore.getState().createAndExecuteRun(
          'case-001',
          { analysis_type: 'SC_3F' },
        )
      ).rejects.toThrow('Blad tworzenia przebiegu');

      const state = useExecutionRunsStore.getState();
      expect(state.runError).toBe('Blad tworzenia przebiegu');
      expect(state.isCreatingRun).toBe(false);
      expect(state.isExecutingRun).toBe(false);
    });

    it('should clear loading flags after successful execution', async () => {
      const createdRun: ExecutionRun = { ...MOCK_RUN, status: 'PENDING' };
      const executedRun: ExecutionRun = { ...MOCK_RUN, status: 'RUNNING' };

      vi.mocked(api.createRun).mockResolvedValue(createdRun);
      vi.mocked(api.executeRun).mockResolvedValue(executedRun);
      vi.mocked(api.listRuns).mockResolvedValue({ runs: [executedRun], count: 1 });

      await useExecutionRunsStore.getState().createAndExecuteRun(
        'case-001',
        { analysis_type: 'SC_3F' },
      );

      const state = useExecutionRunsStore.getState();
      expect(state.isCreatingRun).toBe(false);
      expect(state.isExecutingRun).toBe(false);
    });
  });
});
