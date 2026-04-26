import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchPowerFlowRunHeader } from '../api';

describe('power-flow results api', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it('maps analysis_case_context from canonical run header', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'run-1',
          project_id: 'project-1',
          study_case_id: 'case-1',
          status: 'FINISHED',
          result_status: 'VALID',
          created_at: '2026-04-20T08:00:00Z',
          finished_at: '2026-04-20T08:03:00Z',
          input_hash: 'hash-1',
          converged: true,
          iterations: 4,
          analysis_case_context: {
            case_ref: 'case-1',
            rodzaj_przypadku: 'ROZPLYW_MAX_OBC',
            snapshot_ref: 'snapshot-1',
            run_ref: 'run-1',
            proof_pack_ref: 'proof-pack:run-1',
            quality_gate: 'G4',
            applicability_scope: ['PF', 'REPORT'],
            completeness: 'complete',
            missing_prerequisites: [],
            reproducibility: {
              solver_family: 'power_flow_newton',
              solver_version: '1.0.0',
              results_contract_version: 'V12.5',
            },
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    const header = await fetchPowerFlowRunHeader('run-1');

    expect(global.fetch).toHaveBeenCalledWith('/api/power-flow-runs/run-1');
    expect(header.analysis_case_context?.proof_pack_ref).toBe('proof-pack:run-1');
    expect(header.analysis_case_context?.reproducibility.results_contract_version).toBe('V12.5');
  });
});

