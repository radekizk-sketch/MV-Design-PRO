/**
 * Testy panelu biegu solvera sieci referencyjnej (ROUTERY-4A — zdolność S6).
 *
 * Ścieżka realna: natywny klik przycisku → klient `runReferenceNetwork`
 * (dotąd BEZ konsumenta) → `POST /{id}/run` z rodzajem solvera sieci →
 * tabela napięć węzłów. Iloczyn cech: sieć niesymetryczna (BFS) × symetryczna
 * (NR) × błąd biegu × brak zbieżności.
 */

import { describe, expect, it, vi, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';

import { ReferenceNetworkRunPanel } from '../ReferenceNetworkRunPanel';
import type { ReferenceNetworkDetail, RunResponse } from '../types';

function detail(over: Partial<ReferenceNetworkDetail> = {}): ReferenceNetworkDetail {
  return {
    id: 'ieee-13bus',
    name_pl: 'IEEE 13-bus distribution feeder',
    description_pl: 'Unbalanced radial feeder',
    source: 'Kersting 2001',
    voltage_kv: 4.16,
    has_der: false,
    is_unbalanced: true,
    supported_solvers: ['power_flow_unbalanced_bfs'],
    bus_count: 13,
    branch_count: 12,
    has_pf_expected: true,
    has_sc_expected: false,
    has_dynamic_expected: false,
    expected_pf_count: 13,
    expected_sc_count: 0,
    ...over,
  };
}

function runOdpowiedz(over: Partial<RunResponse> = {}): RunResponse {
  return {
    network_id: 'ieee-13bus',
    solver_kind: 'power_flow_unbalanced_bfs',
    success: true,
    result: {
      buses: {
        bus_650: { v_pu: 1.0, angle_deg: 0.0 },
        bus_632: { v_pu: 0.9821, angle_deg: -2.31 },
      },
      branches: {},
      short_circuit: {},
      trace: [],
      converged: true,
      iterations: 7,
    },
    error: null,
    ...over,
  };
}

function mockFetch(det: ReferenceNetworkDetail, run: RunResponse) {
  const spy = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
    const adres = String(url);
    if (adres.includes('/run') && init?.method === 'POST') {
      return Promise.resolve({ ok: true, json: async () => run } as Response);
    }
    return Promise.resolve({ ok: true, json: async () => det } as Response);
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

function renderPanel(networkId = 'ieee-13bus') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ReferenceNetworkRunPanel networkId={networkId} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ReferenceNetworkRunPanel — sieć niesymetryczna (S6)', () => {
  it('klik „Uruchom rozpływ" woła solver BFS sieci i pokazuje napięcia węzłów', async () => {
    const spy = mockFetch(detail(), runOdpowiedz());
    renderPanel();
    // Odznaka sieci niesymetrycznej + etykieta solvera BFS po polsku.
    await waitFor(() =>
      expect(screen.getByTestId('run-panel-unbalanced-badge')).toBeInTheDocument(),
    );
    expect(screen.getByText(/Rozpływ niesymetryczny \(BFS, per faza\)/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('run-solver-button'));
    await waitFor(() => expect(screen.getByTestId('run-panel-result')).toBeInTheDocument());

    // Klient wołał końcówkę biegu z rodzajem solvera sieci (nie domyślnym NR).
    const wolanieBiegu = spy.mock.calls.find((c) => String(c[0]).includes('/run'));
    expect(String(wolanieBiegu?.[0])).toContain(
      '/api/v1/reference-networks/ieee-13bus/run?solver_kind=power_flow_unbalanced_bfs',
    );

    // Wynik liczbowy wprost z backendu (v_pu, kąt, iteracje, zbieżność).
    expect(screen.getByTestId('run-panel-converged')).toHaveTextContent('osiągnięta');
    expect(screen.getByTestId('run-panel-bus-bus_632')).toHaveTextContent('0.9821');
    expect(screen.getByTestId('run-panel-bus-bus_632')).toHaveTextContent('-2.31');
  });

  it('brak zbieżności: uczciwy komunikat PL (bez udawania wyniku)', async () => {
    mockFetch(
      detail(),
      runOdpowiedz({
        result: {
          buses: {},
          branches: {},
          short_circuit: {},
          trace: [],
          converged: false,
          iterations: 0,
        },
      }),
    );
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('run-solver-button')).toBeEnabled());
    fireEvent.click(screen.getByTestId('run-solver-button'));
    await waitFor(() =>
      expect(screen.getByTestId('run-panel-converged')).toHaveTextContent('brak zbieżności'),
    );
    expect(screen.getByTestId('run-panel-empty')).toBeInTheDocument();
  });
});

describe('ReferenceNetworkRunPanel — sieć symetryczna i błędy', () => {
  it('sieć symetryczna: solver Newton-Raphson, bez odznaki niesymetrii', async () => {
    const spy = mockFetch(
      detail({
        id: 'ieee-9bus',
        is_unbalanced: false,
        supported_solvers: ['power_flow_newton'],
      }),
      runOdpowiedz({ network_id: 'ieee-9bus', solver_kind: 'power_flow_newton' }),
    );
    renderPanel('ieee-9bus');
    // Uwaga: etykieta NR jest też wartością zastępczą przed załadowaniem
    // szczegółów — o gotowości panelu świadczy AKTYWNY przycisk (detail.data).
    await waitFor(() => expect(screen.getByTestId('run-solver-button')).toBeEnabled());
    expect(screen.getByText(/Rozpływ mocy \(Newton-Raphson\)/)).toBeInTheDocument();
    expect(screen.queryByTestId('run-panel-unbalanced-badge')).toBeNull();

    fireEvent.click(screen.getByTestId('run-solver-button'));
    await waitFor(() => expect(screen.getByTestId('run-panel-result')).toBeInTheDocument());
    const wolanieBiegu = spy.mock.calls.find((c) => String(c[0]).includes('/run'));
    expect(String(wolanieBiegu?.[0])).toContain('solver_kind=power_flow_newton');
  });

  it('odpowiedź bez pól zbieżności: uczciwe „—" (absencja danych to nie porażka)', async () => {
    const bezZbieznosci = runOdpowiedz();
    delete (bezZbieznosci.result as { converged?: boolean }).converged;
    delete (bezZbieznosci.result as { iterations?: number }).iterations;
    mockFetch(detail(), bezZbieznosci);
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('run-solver-button')).toBeEnabled());
    fireEvent.click(screen.getByTestId('run-solver-button'));
    await waitFor(() => expect(screen.getByTestId('run-panel-result')).toBeInTheDocument());
    expect(screen.getByTestId('run-panel-converged')).toHaveTextContent('—');
    expect(screen.queryByText('brak zbieżności')).toBeNull();
  });

  it('błąd biegu (success=false): komunikat błędu z backendu', async () => {
    mockFetch(
      detail(),
      runOdpowiedz({ success: false, error: 'Solver zgłosił błąd danych wejściowych.' }),
    );
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('run-solver-button')).toBeEnabled());
    fireEvent.click(screen.getByTestId('run-solver-button'));
    await waitFor(() =>
      expect(screen.getByTestId('run-panel-error')).toHaveTextContent(
        'Solver zgłosił błąd danych wejściowych.',
      ),
    );
    expect(screen.queryByTestId('run-panel-result')).toBeNull();
  });
});
