import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchResultsIndex } from '../api';

describe('results-inspector analysis_case_context API', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it('normalizes analysis_case_context between top-level payload and run_header', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          run_header: {
            run_id: 'run-1',
            project_id: 'project-1',
            case_id: 'case-1',
            snapshot_id: 'snapshot-run-header',
            created_at: '2026-04-20T10:00:00Z',
            status: 'DONE',
            result_state: 'VALID',
            solver_kind: 'short_circuit_sn',
            input_hash: 'hash-1',
            analysis_case_context: {
              case_ref: 'case-1',
              snapshot_ref: 'snapshot-run-header',
              run_ref: 'run-1',
              proof_pack_ref: 'proof-pack:run-1',
              quality_gate: 'G4',
              applicability_scope: ['results'],
              completeness: 'complete',
              missing_prerequisites: [],
              reproducibility: {
                solver_family: 'short_circuit_iec60909',
              },
            },
          },
          tables: [],
          analysis_case_context: {
            case_ref: 'case-1',
            rodzaj_przypadku: 'ZWARCIOWY_MAKS',
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
            generated_at: '2026-04-20T10:00:00Z',
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
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    const resultsIndex = await fetchResultsIndex('run-1');

    expect(global.fetch).toHaveBeenCalledWith('/api/analysis-runs/run-1/results/index');
    expect(resultsIndex.analysis_case_context?.rodzaj_przypadku).toBe('ZWARCIOWY_MAKS');
    expect(resultsIndex.run_header.analysis_case_context?.snapshot_ref).toBe('snapshot-run-header');
    expect(resultsIndex.run_header.analysis_case_context?.reproducibility?.results_contract_version).toBe(
      'V12.5',
    );
    expect(resultsIndex.run_header.analysis_case_context?.reproducibility?.solver_family).toBe(
      'short_circuit_iec60909',
    );
    expect(resultsIndex.proof_pack_ref).toBe('proof-pack:run-1');
    expect(resultsIndex.export_artifact?.export_kind).toBe('json');
    expect(resultsIndex.export_policy?.carries_proof_pack_ref).toBe(true);
  });
});
