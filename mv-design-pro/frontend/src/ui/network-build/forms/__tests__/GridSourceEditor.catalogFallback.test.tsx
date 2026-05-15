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
    solverFetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/catalog/source-system-types')) {
        return {
          ok: true,
          json: async () => ([{
            id: 'source-system-15kv-310mva',
            name: 'System 110/15 kV 310 MVA',
            manufacturer: 'Katalog OSD',
            voltage_rating_kv: 15,
            sk3_mva: 310,
            rx_ratio: 0.12,
            earthing_system: 'resistor_grounded',
          }]),
        } as Response;
      }

      if (url.includes('/api/catalog/mv-apparatus-types')) {
        return {
          ok: true,
          json: async () => ([{
            id: 'mv-breaker-15kv-630a',
            name: 'Wyłącznik SN 15 kV 630 A',
            manufacturer: 'Katalog OSD',
            device_kind: 'BREAKER',
            u_n_kv: 15,
            i_n_a: 630,
            breaking_capacity_ka: 16,
          }]),
        } as Response;
      }

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
    expect(screen.getByText(/Dodanie GPZ do modelu sieci.*15 kV/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('GPZ 1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('GPZ-01')).toBeInTheDocument();
    expect(screen.getByTestId('k3-complexity-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('k3-mode-simplified')).toBeInTheDocument();
    expect(screen.getByTestId('k3-mode-advanced')).toBeInTheDocument();
    expect(screen.getByText('Identyfikacja GPZ')).toBeInTheDocument();
    expect(screen.getByText('Parametry zwarciowe na szynach SN')).toBeInTheDocument();
    // K3 default = 'simplified' → GPZ topology sections not shown
    expect(screen.queryByText('Sekcje szyn GPZ')).not.toBeInTheDocument();
    expect(screen.queryByText('Liczba pól liniowych na sekcję')).not.toBeInTheDocument();
    expect(screen.getByText('Podsumowanie obliczone')).toBeInTheDocument();
    expect(screen.getByText('Gotowość GPZ')).toBeInTheDocument();
    expect(screen.getByText('Ik\'\' (1-faz. maks.)')).toBeInTheDocument();
    expect(screen.getByText('ip (3-faz. maks.)')).toBeInTheDocument();
    expect(screen.getByText('Ith (3-faz., tk)')).toBeInTheDocument();
    expect(screen.getByText('Z0 źródła')).toBeInTheDocument();
    expect(await screen.findByText('Obliczenie IEC 60909 po stronie serwera')).toBeInTheDocument();
    expect(screen.getAllByText(/System 110\/15 kV 310 MVA/).length).toBeGreaterThan(0);
    expect(screen.queryByText('source-system-15kv-310mva')).not.toBeInTheDocument();
    expect(screen.queryByText('IEC 60909 / short_circuit_core')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zapisz GPZ' })).toBeInTheDocument();
    expect(screen.queryByText(/Pozycja katalogowa jest wymagana/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Nazwa GPZ jest wymagana/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Katalog' })).not.toBeInTheDocument();
  });

  it('domyślnie wybiera katalog GPZ i aparaturę pola, aby zapis nie był martwym kliknięciem', async () => {
    const onSubmit = vi.fn();

    render(
      <GridSourceEditor
        isOpen
        mode="create"
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await screen.findByText('Obliczenie IEC 60909 po stronie serwera');

    fireEvent.click(screen.getByRole('button', { name: 'Zapisz GPZ' }));

    // CI fix: explicit timeout 3000ms — default waitFor 1000ms za krótki na
    // slow GitHub Actions runners (catalog async load + state updates).
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      catalog_ref: 'source-system-15kv-310mva',
      gpz_line_field_apparatus_catalog_ref: 'mv-breaker-15kv-630a',
      manual_mode: false,
      sn_voltage_kv: 15,
      sk3_mva: 310,
      rx_ratio: 0.12,
    }));
    expect(screen.queryByText(/Pozycja katalogowa jest wymagana/)).not.toBeInTheDocument();
  });

  it('K3: domyślnie tryb Uproszczony — sekcje GPZ i R0/X0 ukryte', () => {
    render(
      <GridSourceEditor
        isOpen
        mode="create"
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    // Section title unique to "Sekcje szyn GPZ"
    expect(screen.queryByText('Sekcje szyn GPZ')).not.toBeInTheDocument();
    // Unique checkbox label inside "Składowa zerowa" section
    expect(screen.queryByText('Definiuj R0/X0 dla obliczeń doziemnych')).not.toBeInTheDocument();
    expect(screen.getByText('Parametry zwarciowe na szynach SN')).toBeInTheDocument();
  });

  it('K3: przełączenie na Zaawansowany pokazuje sekcje GPZ i R0/X0', () => {
    render(
      <GridSourceEditor
        isOpen
        mode="create"
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.queryByText('Sekcje szyn GPZ')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('k3-mode-advanced'));

    expect(screen.getByText('Sekcje szyn GPZ')).toBeInTheDocument();
    expect(screen.getByText('Definiuj R0/X0 dla obliczeń doziemnych')).toBeInTheDocument();
    expect(screen.getByText('Liczba pól liniowych na sekcję')).toBeInTheDocument();
  });

  it('K3: powrót z Zaawansowany do Uproszczony chowa sekcje GPZ', () => {
    render(
      <GridSourceEditor
        isOpen
        mode="create"
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('k3-mode-advanced'));
    expect(screen.getByText('Sekcje szyn GPZ')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('k3-mode-simplified'));
    expect(screen.queryByText('Sekcje szyn GPZ')).not.toBeInTheDocument();
    expect(screen.queryByText('Definiuj R0/X0 dla obliczeń doziemnych')).not.toBeInTheDocument();
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

  it('w trybie WN/SN wysyĹ‚a moc zwarciowÄ… na szynie 110 kV zamiast udawaÄ‡ dane SN', async () => {
    const onSubmit = vi.fn();

    render(
      <GridSourceEditor
        isOpen
        mode="create"
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /R.*czny/ }));
    fireEvent.click(screen.getByRole('button', { name: /110 kV/ }));

    expect(screen.getByText('Parametry zwarciowe na szynie 110 kV')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Moc zwarciowa.*110 kV/), {
      target: { value: '3000' },
    });

    await waitFor(() => {
      const lastCall = solverFetchMock.mock.calls.at(-1);
      const lastRequest = JSON.parse(String((lastCall?.[1] as RequestInit | undefined)?.body));
      expect(lastRequest).toMatchObject({
        voltage_kv: 110,
        sk3_mva: 3000,
        rx_ratio: 0.12,
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Zapisz GPZ' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      manual_mode: true,
      short_circuit_input_side: 'HV_110',
      hv_voltage_kv: 110,
      sk3_hv_mva: 3000,
      sn_voltage_kv: 15,
    }));
  });
});
