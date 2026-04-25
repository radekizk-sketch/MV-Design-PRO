import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRun } from '../api';
import type { CreateRunRequest } from '../types';

describe('study-cases api - izolacja draftu ENM', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('createRun nie wysyla snapshotu ani danych ENM do backendu', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'run-1',
        study_case_id: 'case-1',
        analysis_type: 'SC_3F',
        solver_input_hash: 'hash-1',
        status: 'PENDING',
        started_at: null,
        finished_at: null,
        error_message: null,
      }),
    });

    const unsafeRequest = {
      analysis_type: 'SC_3F',
      snapshot: { header: { name: 'Niezapisany draft' }, buses: [] },
      enm: { buses: [], sources: [] },
      buses: [],
      branches: [],
    } as unknown as CreateRunRequest;

    await createRun('case-1', unsafeRequest);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;

    expect(body).toEqual({ analysis_type: 'SC_3F' });
    expect(body).not.toHaveProperty('snapshot');
    expect(body).not.toHaveProperty('enm');
    expect(body).not.toHaveProperty('buses');
    expect(body).not.toHaveProperty('branches');
  });
});

