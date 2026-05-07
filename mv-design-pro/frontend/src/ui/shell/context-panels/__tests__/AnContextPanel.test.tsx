import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStateStore } from '../../../app-state/store';
import { useStudyCasesStore } from '../../../study-cases/store';
import type { StudyCase } from '../../../study-cases/types';
import { AnContextPanel } from '../AnContextPanel';

const createdCase: StudyCase = {
  id: 'case-1',
  project_id: 'project-1',
  name: 'Zakres podstawowy',
  description: '',
  config: {
    c_factor_max: 1.1,
    c_factor_min: 0.95,
    base_mva: 100,
    max_iterations: 50,
    tolerance: 0.000001,
    include_motor_contribution: true,
    include_inverter_contribution: true,
    thermal_time_seconds: 1,
  },
  result_status: 'NONE',
  results_valid: false,
  is_active: true,
  result_refs: [],
  revision: 1,
  created_at: '2026-05-07T00:00:00Z',
  updated_at: '2026-05-07T00:00:00Z',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('AnContextPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAppStateStore.getState().reset();
    useAppStateStore.getState().setActiveProject('project-1', 'Projekt testowy');
    useStudyCasesStore.setState({
      projectId: null,
      cases: [],
      activeCase: null,
      selectedCaseId: null,
      comparisonResult: null,
      comparisonCaseIds: null,
      isLoading: false,
      isCreating: false,
      isDeleting: false,
      isCloning: false,
      isActivating: false,
      isComparing: false,
      error: null,
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url === '/api/study-cases/project/project-1' && method === 'GET') {
          return jsonResponse([]);
        }
        if (url === '/api/study-cases/project/project-1/active' && method === 'GET') {
          return new Response(null, { status: 404 });
        }
        if (url === '/api/study-cases' && method === 'POST') {
          return jsonResponse(createdCase);
        }
        return jsonResponse({ detail: `Nieobsłużone żądanie testowe: ${method} ${url}` }, 500);
      }),
    );
  });

  it('tworzy aktywny zakres z panelu AN i aktualizuje globalny kontekst obliczeń', async () => {
    render(<AnContextPanel />);

    const createButton = await screen.findByRole('button', { name: '+ Nowy' });
    fireEvent.click(createButton);

    expect(screen.getByRole('heading', { name: 'Nowy zakres obliczeń' })).toBeInTheDocument();
    const nameInput = screen.getByTestId('study-case-name');
    fireEvent.change(nameInput, { target: { value: 'Zakres podstawowy' } });
    fireEvent.click(screen.getByTestId('study-case-submit'));

    await waitFor(() => {
      expect(useAppStateStore.getState().activeCaseId).toBe('case-1');
    });
    expect(useAppStateStore.getState().activeCaseName).toBe('Zakres podstawowy');
    expect(useStudyCasesStore.getState().activeCase?.id).toBe('case-1');
    expect(fetch).toHaveBeenCalledWith(
      '/api/study-cases',
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });
});
