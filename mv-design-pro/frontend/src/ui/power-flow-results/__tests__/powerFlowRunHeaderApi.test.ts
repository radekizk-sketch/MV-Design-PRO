import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchPowerFlowRunHeader } from '../api';

describe('power-flow-results run header API', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it('preserves input_metadata and merges analysis_case_context from V12.5 header payload', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'run-1',
          project_id: 'project-1',
          study_case_id: 'case-1',
          status: 'DONE',
          result_status: 'VALID',
          created_at: '2026-04-20T12:00:00Z',
          finished_at: '2026-04-20T12:01:00Z',
          input_hash: 'hash-1',
          converged: true,
          iterations: 5,
          analysis_case_context: {
            case_ref: 'case-1',
            rodzaj_przypadku: 'ROZPLYW_MAX_OBC',
            snapshot_ref: null,
            run_ref: 'run-1',
            proof_pack_ref: 'proof-pack:run-1',
            quality_gate: 'G4',
            applicability_scope: ['results'],
            completeness: 'complete',
            missing_prerequisites: [],
            reproducibility: {
              results_contract_version: 'V12.5',
            },
          },
          proof_pack_ref: 'proof-pack:run-1',
          export_artifact: {
            export_ref: 'export-1',
            export_kind: 'json',
            analysis_case_ref: 'case-1',
            proof_pack_ref: 'proof-pack:run-1',
            result_hash: 'result-hash-1',
            input_hash: 'hash-1',
            generated_at: '2026-04-20T12:01:00Z',
            generated_by_version: 'v12_5_export_artifact/1.0',
            completeness_status: 'complete',
          },
          export_policy: {
            export_kind: 'json',
            allows_partial: true,
            requires_confirmation: false,
            carries_analysis_case_context: true,
            carries_proof_pack_ref: true,
            carries_result_hash: true,
            carries_input_hash: true,
            carries_generated_at: true,
            carries_generated_by_version: true,
            null_rendering: 'null',
            not_applicable_rendering: 'label',
            partial_rendering: 'status_field',
          },
          input_metadata: {
            snapshot_hash: 'snapshot-1',
            analysis_case_context: {
              case_ref: 'case-1',
              snapshot_ref: 'snapshot-1',
              run_ref: 'run-1',
              proof_pack_ref: 'proof-pack:run-1',
              quality_gate: 'G4',
              applicability_scope: ['results'],
              completeness: 'complete',
              missing_prerequisites: [],
              reproducibility: {
                solver_family: 'power_flow_newton',
              },
            },
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    const runHeader = await fetchPowerFlowRunHeader('run-1');

    expect(global.fetch).toHaveBeenCalledWith('/api/power-flow-runs/run-1');
    expect(runHeader.input_metadata?.snapshot_hash).toBe('snapshot-1');
    expect(runHeader.analysis_case_context?.snapshot_ref).toBe('snapshot-1');
    expect(runHeader.analysis_case_context?.rodzaj_przypadku).toBe('ROZPLYW_MAX_OBC');
    expect(runHeader.analysis_case_context?.reproducibility?.results_contract_version).toBe(
      'V12.5',
    );
    expect(runHeader.analysis_case_context?.reproducibility?.solver_family).toBe(
      'power_flow_newton',
    );
    expect(runHeader.input_metadata?.analysis_case_context?.snapshot_ref).toBe('snapshot-1');
    expect(runHeader.proof_pack_ref).toBe('proof-pack:run-1');
    expect(runHeader.export_artifact?.export_kind).toBe('json');
    expect(runHeader.export_policy?.carries_generated_by_version).toBe(true);
  });
});

