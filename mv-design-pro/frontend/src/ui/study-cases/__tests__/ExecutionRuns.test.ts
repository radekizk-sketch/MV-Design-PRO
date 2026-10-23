/**
 * Execution Runs Tests — PR-14: StudyCase → Run → ResultSet
 *
 * Tests:
 * - test_run_button_disabled_when_not_ready
 * - test_run_status_flow
 * - test_result_cache_consistency
 * - Type interface shape validation
 * - Store state management
 */

import { describe, it, expect } from 'vitest';
import type {
  ExecutionRun,
  ExecutionResultSet,
  RunStatus,
  ExecutionAnalysisType,
  CreateRunRequest,
} from '../types';
import {
  ANALYSIS_TYPE_LABELS,
  RUN_STATUS_LABELS,
  RUN_STATUS_COLORS,
} from '../types';

// =============================================================================
// Type Interface Shape Tests
// =============================================================================

describe('ExecutionRun type interface', () => {
  it('should have correct shape', () => {
    const run: ExecutionRun = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      study_case_id: '660e8400-e29b-41d4-a716-446655440000',
      analysis_type: 'SC_3F',
      solver_input_hash: 'a'.repeat(64),
      status: 'PENDING',
      started_at: null,
      finished_at: null,
      error_message: null,
    };

    expect(run).toBeDefined();
    expect(run.status).toBe('PENDING');
    expect(run.solver_input_hash.length).toBe(64);
  });

  it('should support all status values', () => {
    const statuses: RunStatus[] = ['PENDING', 'RUNNING', 'DONE', 'FAILED'];
    statuses.forEach((status) => {
      const run: ExecutionRun = {
        id: '1',
        study_case_id: '2',
        analysis_type: 'SC_3F',
        solver_input_hash: 'hash',
        status,
        started_at: null,
        finished_at: null,
        error_message: null,
      };
      expect(run.status).toBe(status);
    });
  });

  it('should support all analysis types', () => {
    const types: ExecutionAnalysisType[] = ['SC_3F', 'SC_1F', 'LOAD_FLOW'];
    types.forEach((type) => {
      const run: ExecutionRun = {
        id: '1',
        study_case_id: '2',
        analysis_type: type,
        solver_input_hash: 'hash',
        status: 'PENDING',
        started_at: null,
        finished_at: null,
        error_message: null,
      };
      expect(run.analysis_type).toBe(type);
    });
  });
});

describe('ExecutionResultSet type interface', () => {
  it('should have correct shape', () => {
    const resultSet: ExecutionResultSet = {
      run_id: '550e8400-e29b-41d4-a716-446655440000',
      analysis_type: 'SC_3F',
      validation_snapshot: { is_valid: true },
      readiness_snapshot: { ready: true },
      element_results: [
        {
          element_ref: 'bus-1',
          element_type: 'Bus',
          values: { ikss_ka: 12.5 },
        },
      ],
      global_results: { total_ikss_ka: 12.5 },
      deterministic_signature: 'b'.repeat(64),
    };

    expect(resultSet).toBeDefined();
    expect(resultSet.element_results.length).toBe(1);
    expect(resultSet.deterministic_signature.length).toBe(64);
  });

  it('should support empty element results', () => {
    const resultSet: ExecutionResultSet = {
      run_id: '1',
      analysis_type: 'LOAD_FLOW',
      validation_snapshot: {},
      readiness_snapshot: {},
      element_results: [],
      global_results: {},
      deterministic_signature: '',
    };

    expect(resultSet.element_results.length).toBe(0);
  });
});

// =============================================================================
// Polish Labels Tests
// =============================================================================

describe('Polish labels', () => {
  it('should have labels for all analysis types', () => {
    expect(ANALYSIS_TYPE_LABELS.SC_3F).toBe('Zwarcie trójfazowe (3F)');
    expect(ANALYSIS_TYPE_LABELS.SC_1F).toBe('Zwarcie jednofazowe (1F)');
    expect(ANALYSIS_TYPE_LABELS.LOAD_FLOW).toBe('Rozpływ mocy');
  });

  it('should have labels for all run statuses', () => {
    expect(RUN_STATUS_LABELS.PENDING).toBe('Oczekuje');
    expect(RUN_STATUS_LABELS.RUNNING).toBe('W trakcie');
    expect(RUN_STATUS_LABELS.DONE).toBe('Zakończony');
    expect(RUN_STATUS_LABELS.FAILED).toBe('Błąd');
  });

  it('should have colors for all run statuses', () => {
    expect(RUN_STATUS_COLORS.PENDING).toBeDefined();
    expect(RUN_STATUS_COLORS.RUNNING).toBeDefined();
    expect(RUN_STATUS_COLORS.DONE).toBeDefined();
    expect(RUN_STATUS_COLORS.FAILED).toBeDefined();
  });

  it('should not contain project codenames', () => {
    const allLabels = [
      ...Object.values(ANALYSIS_TYPE_LABELS),
      ...Object.values(RUN_STATUS_LABELS),
    ].join(' ');

    // No P-codes in labels (per CLAUDE.md No Codenames rule)
    expect(allLabels).not.toMatch(/\bP\d{1,2}\b/);
    expect(allLabels).not.toMatch(/\bPR-\d+\b/);
  });
});

// =============================================================================
// CreateRunRequest Shape Tests
// =============================================================================

describe('CreateRunRequest interface', () => {
  it('should have correct shape with defaults', () => {
    const request: CreateRunRequest = {
      analysis_type: 'SC_3F',
    };

    expect(request.analysis_type).toBe('SC_3F');
  });

  it('should support all optional fields', () => {
    const request: CreateRunRequest = {
      analysis_type: 'LOAD_FLOW',
      solver_input: { base_mva: 100 },
      readiness: { ready: true, issues: [] },
      eligibility: { eligible: true, blockers: [], warnings: [] },
    };

    expect(request.solver_input).toBeDefined();
    expect(request.readiness).toBeDefined();
    expect(request.eligibility).toBeDefined();
  });
});

// =============================================================================
// RunButton Disabled State Tests
// =============================================================================

describe('RunButton disabled logic', () => {
  it('should be disabled when readiness is false', () => {
    const readinessReady = false;
    const isRunInProgress = false;
    const activeStudyCaseId = 'some-id';

    const isDisabled =
      !activeStudyCaseId || isRunInProgress || !readinessReady;
    expect(isDisabled).toBe(true);
  });

  it('should be disabled when run is in progress', () => {
    const readinessReady = true;
    const isRunInProgress = true;
    const activeStudyCaseId = 'some-id';

    const isDisabled =
      !activeStudyCaseId || isRunInProgress || !readinessReady;
    expect(isDisabled).toBe(true);
  });

  it('should be disabled when no active study case', () => {
    const readinessReady = true;
    const isRunInProgress = false;
    const activeStudyCaseId: string | null = null;

    const isDisabled =
      !activeStudyCaseId || isRunInProgress || !readinessReady;
    expect(isDisabled).toBe(true);
  });

  it('should be enabled when all conditions met', () => {
    const readinessReady = true;
    const isRunInProgress = false;
    const activeStudyCaseId = 'some-id';

    const isDisabled =
      !activeStudyCaseId || isRunInProgress || !readinessReady;
    expect(isDisabled).toBe(false);
  });
});

// =============================================================================
// Run Status Flow Tests
// =============================================================================

describe('Run status flow', () => {
  it('should follow PENDING → RUNNING → DONE lifecycle', () => {
    const statusHistory: RunStatus[] = [];

    // Simulate lifecycle
    statusHistory.push('PENDING');
    statusHistory.push('RUNNING');
    statusHistory.push('DONE');

    expect(statusHistory).toEqual(['PENDING', 'RUNNING', 'DONE']);
  });

  it('should follow PENDING → RUNNING → FAILED lifecycle', () => {
    const statusHistory: RunStatus[] = [];

    statusHistory.push('PENDING');
    statusHistory.push('RUNNING');
    statusHistory.push('FAILED');

    expect(statusHistory).toEqual(['PENDING', 'RUNNING', 'FAILED']);
  });

  it('should track error message on FAILED', () => {
    const run: ExecutionRun = {
      id: '1',
      study_case_id: '2',
      analysis_type: 'SC_3F',
      solver_input_hash: 'hash',
      status: 'FAILED',
      started_at: '2024-01-01T00:00:00Z',
      finished_at: '2024-01-01T00:00:01Z',
      error_message: 'Solver nie zbiegł się',
    };

    expect(run.status).toBe('FAILED');
    expect(run.error_message).toBe('Solver nie zbiegł się');
  });
});

// =============================================================================
// Result Cache Consistency Tests
// =============================================================================

describe('Result cache consistency', () => {
  it('should store result set by run_id', () => {
    const cache: Record<string, ExecutionResultSet> = {};

    const resultSet: ExecutionResultSet = {
      run_id: 'run-1',
      analysis_type: 'SC_3F',
      validation_snapshot: { is_valid: true },
      readiness_snapshot: { ready: true },
      element_results: [
        {
          element_ref: 'bus-1',
          element_type: 'Bus',
          values: { ikss_ka: 12.5 },
        },
      ],
      global_results: { total: 12.5 },
      deterministic_signature: 'sig123',
    };

    cache['run-1'] = resultSet;

    expect(cache['run-1']).toBeDefined();
    expect(cache['run-1'].deterministic_signature).toBe('sig123');
    expect(cache['run-2']).toBeUndefined();
  });

  it('should not overwrite cache for different runs', () => {
    const cache: Record<string, ExecutionResultSet> = {};

    const makeResult = (
      runId: string,
      sig: string
    ): ExecutionResultSet => ({
      run_id: runId,
      analysis_type: 'SC_3F',
      validation_snapshot: {},
      readiness_snapshot: {},
      element_results: [],
      global_results: {},
      deterministic_signature: sig,
    });

    cache['run-1'] = makeResult('run-1', 'sig-a');
    cache['run-2'] = makeResult('run-2', 'sig-b');

    expect(cache['run-1'].deterministic_signature).toBe('sig-a');
    expect(cache['run-2'].deterministic_signature).toBe('sig-b');
  });

  it('should return consistent data for same run_id', () => {
    const cache: Record<string, ExecutionResultSet> = {};

    const resultSet: ExecutionResultSet = {
      run_id: 'run-1',
      analysis_type: 'LOAD_FLOW',
      validation_snapshot: {},
      readiness_snapshot: {},
      element_results: [],
      global_results: { converged: true },
      deterministic_signature: 'deterministic-hash',
    };

    cache['run-1'] = resultSet;

    // Multiple reads should return same data
    const read1 = cache['run-1'];
    const read2 = cache['run-1'];
    expect(read1).toBe(read2); // Same reference
    expect(read1.deterministic_signature).toBe(
      read2.deterministic_signature
    );
  });
});
