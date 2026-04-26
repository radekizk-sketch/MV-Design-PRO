import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchRunsForComparison, fetchViolations } from '../api';

describe('results-browser api', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it('builds violations from canonical power-flow results without probing a dead endpoint', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          slack_bus_id: 'bus-1',
          bus_results: [
            {
              bus_id: 'bus-1',
              v_pu: 1.0,
              angle_deg: 0.0,
              p_injected_mw: 0.0,
              q_injected_mvar: 0.0,
            },
            {
              bus_id: 'bus-2',
              v_pu: 0.92,
              angle_deg: -1.2,
              p_injected_mw: 1.2,
              q_injected_mvar: 0.3,
            },
          ],
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    const rows = await fetchViolations('run-1');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith('/api/power-flow-runs/run-1/results');
    expect(rows).toHaveLength(1);
    expect(rows[0].element_id).toBe('bus-2');
    expect(rows[0].violation_type).toBe('UNDERVOLTAGE');
    expect(rows[0].severity).toBe('WARN');
  });

  it('requires study_case_id in the canonical run list', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          runs: [
            {
              id: 'run-1',
              created_at: '2026-04-25T10:00:00Z',
              status: 'FINISHED',
              converged: true,
            },
          ],
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    await expect(fetchRunsForComparison('project-1')).rejects.toThrow('study_case_id');
  });
});
