import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GridSourceEditor } from '../shared/GridSourceEditor';

const baseSolverPreview = {
  sk_mva: 310,
  ik3_ka: 11.93,
  ik1_ka: 4.21,
  ip_ka: 30.82,
  ith_ka: 11.93,
  kappa: 1.826,
  z1_ohm: { r_ohm: 0.086, x_ohm: 0.7206 },
  z0_ohm: { r_ohm: 0.276, x_ohm: 2.306 },
  formula_ref: 'IEC 60909 / short_circuit_core',
};

let solverFetchMock: ReturnType<typeof vi.fn>;

describe('GridSourceEditor E-03B', () => {
  beforeEach(() => {
    solverFetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { sk3_mva?: number | null };
      const isReducedSource = body.sk3_mva === 155;

      return {
        ok: true,
        json: async () => ({
          ...baseSolverPreview,
          sk_mva: body.sk3_mva ?? baseSolverPreview.sk_mva,
          ik3_ka: isReducedSource ? 5.97 : baseSolverPreview.ik3_ka,
          ik1_ka: isReducedSource ? 2.1 : baseSolverPreview.ik1_ka,
          ip_ka: isReducedSource ? 15.41 : baseSolverPreview.ip_ka,
          ith_ka: isReducedSource ? 5.97 : baseSolverPreview.ith_ka,
        }),
      } as Response;
    });
    vi.stubGlobal('fetch', solverFetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('startuje jako jednoznaczny ciemny formularz GPZ z domyślnymi danymi', async () => {
    render(
      <GridSourceEditor
        isOpen
        mode="create"
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByTestId('grid-source-editor-dialog')).toHaveClass('bg-[#050810]');
    expect(screen.getByText('Ekran E-03B · Karta GPZ zaawansowana · 15 kV')).toBeInTheDocument();
    expect(screen.getByDisplayValue('GPZ 1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('GPZ-01')).toBeInTheDocument();
    expect(screen.getByText('Identyfikacja GPZ')).toBeInTheDocument();
    expect(screen.getByText('Parametry zwarciowe na szynach SN')).toBeInTheDocument();
    expect(screen.getByText('Sekcje szyn GPZ')).toBeInTheDocument();
    expect(screen.getByText('Liczba pól liniowych na sekcję')).toBeInTheDocument();
    expect(screen.getByText('każde pole ma osobny zacisk wyjściowy')).toBeInTheDocument();
    expect(screen.queryByText('Pola odpływowe - Sekcja A')).not.toBeInTheDocument();
    expect(screen.queryByText('Pola odpływowe - Sekcja B')).not.toBeInTheDocument();
    expect(screen.getByText('Podsumowanie obliczone')).toBeInTheDocument();
    expect(screen.getByText('Gotowość GPZ')).toBeInTheDocument();
    expect(screen.getByText('Ik\'\' (1-faz. maks.)')).toBeInTheDocument();
    expect(screen.getByText('ip (3-faz. maks.)')).toBeInTheDocument();
    expect(screen.getByText('Ith (3-faz., tk)')).toBeInTheDocument();
    expect(screen.getByText('Z0 źródła')).toBeInTheDocument();
    expect(await screen.findByText('IEC 60909 / short_circuit_core')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zapisz GPZ' })).toBeInTheDocument();
    expect(screen.queryByText(/Pozycja katalogowa jest wymagana/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Nazwa GPZ jest wymagana/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Katalog' })).not.toBeInTheDocument();
  });

  it('wysyła nowe dane wejściowe do backendu i pokazuje zwrócone podsumowanie', async () => {
    render(
      <GridSourceEditor
        isOpen
        mode="create"
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(await screen.findByText('310.0 MVA')).toBeInTheDocument();
    expect(screen.getAllByText('11.93 kA').length).toBeGreaterThan(0);

    fireEvent.change(screen.getByDisplayValue('310'), { target: { value: '155' } });

    await waitFor(() => expect(screen.getByText('155.0 MVA')).toBeInTheDocument());
    expect(screen.getAllByText('5.97 kA').length).toBeGreaterThan(0);

    const lastCall = solverFetchMock.mock.calls.at(-1);
    const lastRequest = JSON.parse(String((lastCall?.[1] as RequestInit | undefined)?.body));
    expect(lastRequest).toMatchObject({
      voltage_kv: 15,
      short_circuit_mode: 'SHORT_CIRCUIT_POWER',
      sk3_mva: 155,
      rx_ratio: 0.12,
      zero_sequence_enabled: true,
      z0_z1_ratio: 3.2,
    });
  });
});
