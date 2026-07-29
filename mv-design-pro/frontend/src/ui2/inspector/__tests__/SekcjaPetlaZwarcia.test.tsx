/*
 * Testy sekcji inspektora „Pętla zwarcia u źródła (nN)" (G-STK-4). Ćwiczą realną
 * ścieżkę: mount → fetch endpointu z modelu → render policzonych Z_s/Ik / uczciwe
 * stany (nie dotyczy dla IT/TT, brak danych). ZERO fizyki w UI — liczby z backendu.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };
vi.mock('../../../ui/app-state', () => ({
  useAppStateStore: (selector: (s: typeof appState) => unknown) => selector(appState),
}));

import { SekcjaPetlaZwarcia } from '../SekcjaPetlaZwarcia';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mockFetch(dane: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(dane) } as Response)),
  );
}

describe('SekcjaPetlaZwarcia', () => {
  it('OK → pokazuje Z_s, Ik i impedancję transformatora z backendu', async () => {
    mockFetch({
      status: 'OK',
      network_system: 'TN-C-S',
      transformer_impedance_ohm: { r: 0.0026, x: 0.0098 },
      fault_loop: {
        z_loop_ohm: { magnitude: 0.01016 },
        ik_min_a: 21596.5,
        ik_max_a: 23869.8,
        components: [],
      },
      note_pl: 'Impedancja pętli u źródła.',
    });
    render(<SekcjaPetlaZwarcia stationRef="stn-1" />);
    await waitFor(() => expect(screen.getByTestId('mvd-insp-petla')).toBeInTheDocument());
    expect(screen.getByTestId('mvd-insp-petla')).toHaveTextContent('TN-C-S');
    // Ik prezentowane w kA (przecinek PL) — wartości z solvera, nie liczone w UI.
    expect(screen.getByTestId('mvd-insp-petla')).toHaveTextContent('23,87 kA');
    expect(screen.getByTestId('mvd-insp-petla')).toHaveTextContent('0,0102 Ω');
  });

  it('układ IT → uczciwy stan „nie dotyczy" (bez liczb pętli)', async () => {
    mockFetch({
      status: 'nie dotyczy',
      network_system: 'IT',
      reason_pl: 'Układ IT: ochrona nie opiera się na samoczynnym wyłączeniu z pętli TN.',
    });
    render(<SekcjaPetlaZwarcia stationRef="stn-1" />);
    await waitFor(() =>
      expect(screen.getByTestId('mvd-insp-petla-niedotyczy')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('mvd-insp-petla-niedotyczy')).toHaveTextContent('IT');
  });

  it('brak danych transformatora → uczciwy komunikat z listą braków', async () => {
    mockFetch({ status: 'brak danych', network_system: 'TN-S', missing_data: ['uk_percent'] });
    render(<SekcjaPetlaZwarcia stationRef="stn-1" />);
    await waitFor(() => expect(screen.getByTestId('mvd-insp-petla-brak')).toBeInTheDocument());
    expect(screen.getByTestId('mvd-insp-petla-brak')).toHaveTextContent('uk_percent');
  });
});
