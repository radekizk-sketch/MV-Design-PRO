import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { InspectorPanel } from '../InspectorPanel';
import { useExecutionRunsStore } from '../../study-cases/runStore';
import { at } from '../../../test/arrayAt';

describe('InspectorPanel', () => {
  const selectedRow = {
    type: 'short_circuit' as const,
    data: {
      target_id: 'bus_sc_001',
      target_name: 'Szyna SC-01',
      fault_type: '3F',
      ikss_ka: 12.4,
      ip_ka: 24.1,
      ith_ka: 11.3,
      sk_mva: 322.4,
    },
  };

  beforeEach(() => {
    useExecutionRunsStore.setState({ activeRunId: null });
    window.location.hash = '';
  });

  it('shows explicit unavailable state instead of fake contributions and fake proof data', () => {
    render(<InspectorPanel selectedRow={selectedRow} />);

    expect(screen.getByText('Identyfikator węzła')).toBeInTheDocument();
    expect(screen.queryByText('ID węzła')).toBeNull();

    fireEvent.click(screen.getByTestId('tab-contributions'));
    expect(screen.getByText('Szczegółowe wkłady nie są dostępne w tym widoku.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Otwórz wywód obliczeń' })).toBeNull();
    expect(screen.queryByText('Źródło #1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('tab-proof'));
    expect(screen.getByText('Niedostępny w tym widoku')).toBeInTheDocument();
    expect(
      screen.getByText('Wywód obliczeń jest dostępny w dedykowanej zakładce „Wywód”.'),
    ).toBeInTheDocument();
    expect(screen.getByText('pakietu wywodu', { exact: false })).toBeInTheDocument();
    const proofButton = at(screen.getAllByRole('button', { name: 'Otwórz wywód obliczeń' }), -1);
    expect(proofButton).toBeDefined();
    expect(proofButton).toBeDisabled();
    expect(screen.getByTestId('open-proof-trace-blocked-proof')).toHaveTextContent(
      'Nie wybrano przebiegu obliczeń.',
    );
    fireEvent.click(proofButton!);
    expect(window.location.hash).toBe('');
    expect(screen.queryByText('COMPLIANT')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('tab-limits'));
    expect(screen.queryByText('31,500')).not.toBeInTheDocument();
    expect(screen.getByText('Limity do wyliczenia')).toBeInTheDocument();
  });

  it('renders Polish status labels in limits tab', () => {
    render(
      <InspectorPanel
        selectedRow={{
          type: 'branch',
          data: {
            branch_id: 'branch_1',
            name: 'Linia 1',
            from_bus: 'bus_a',
            to_bus: 'bus_b',
            i_a: 320,
            p_mw: 2.5,
            q_mvar: 0.7,
            s_mva: 2.6,
            loading_pct: 108,
            flags: ['OVERLOAD'],
          },
        }}
      />,
    );

    expect(screen.getByTestId('tab-proof')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tab-limits'));
    expect(screen.getByText('Przekroczenie')).toBeInTheDocument();
    expect(screen.queryByText('VIOLATION')).not.toBeInTheDocument();
  });

  it('karta W3-J: zakładka Limity szyny klasyfikuje napięcie WYŁĄCZNIE wobec kryteriów z biegu', () => {
    render(
      <InspectorPanel
        selectedRow={{
          type: 'bus',
          data: {
            bus_id: 'bus_1',
            name: 'Szyna 1',
            un_kv: 15,
            u_kv: 15.75,
            u_pu: 1.05,
            angle_deg: -1.2,
            flags: [],
            kryteria_napiecia: {
              ostrzezenie_pct: 5,
              przekroczenie_pct: 10,
              ostrzezenie_min_pu: 0.95,
              ostrzezenie_max_pu: 1.05,
              przekroczenie_min_pu: 0.9,
              przekroczenie_max_pu: 1.1,
              podstawa_ostrzezenie_pl: 'Praktyka projektowa SN / IRiESD.',
              podstawa_przekroczenie_pl: 'PN-EN 50160.',
              pasmo_wiarygodnosci_pct: 10,
            },
          },
        }}
      />,
    );

    fireEvent.click(screen.getByTestId('tab-limits'));
    // Na granicy pasma ostrzeżenia (dokładnie ostrzezenie_max_pu) -> W normie.
    expect(screen.getByText('W normie')).toBeInTheDocument();
    expect(screen.getByText('0,90 pu')).toBeInTheDocument();
    expect(screen.getByText('1,10 pu')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('tab-parameters'));
    expect(screen.getByText('Limit dolny napięcia')).toBeInTheDocument();
    expect(screen.getAllByText('0,90 pu').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1,10 pu').length).toBeGreaterThan(0);
  });

  it('karta W3-J: bez kryteriów w wyniku zakładka Limity pokazuje uczciwy stan, nie domyślną liczbę', () => {
    render(
      <InspectorPanel
        selectedRow={{
          type: 'bus',
          data: {
            bus_id: 'bus_2',
            name: 'Szyna 2',
            un_kv: 15,
            u_kv: 12.0,
            u_pu: 0.8,
            angle_deg: -3.4,
            flags: [],
          },
        }}
      />,
    );

    fireEvent.click(screen.getByTestId('tab-limits'));
    expect(screen.getByText('Kryterium niedostępne')).toBeInTheDocument();
    // Zero fabrykacji: żaden domyślny limit (0,90/1,10) nie jest renderowany.
    expect(screen.queryByText('0,90 pu')).not.toBeInTheDocument();
    expect(screen.queryByText('1,10 pu')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('tab-parameters'));
    expect(screen.getByText('Limit dolny napięcia')).toBeInTheDocument();
    expect(screen.queryByText('0,90 pu')).not.toBeInTheDocument();
    expect(screen.queryByText('1,10 pu')).not.toBeInTheDocument();
  });

  it('nawiguje do wywodu aktywnego uruchomienia, gdy run jest dostępny', () => {
    useExecutionRunsStore.setState({ activeRunId: 'run-42' });

    render(<InspectorPanel selectedRow={selectedRow} />);

    fireEvent.click(screen.getByTestId('tab-proof'));

    const proofButton = screen.getByTestId('open-proof-trace-proof');
    expect(proofButton).not.toBeDisabled();
    expect(screen.queryByTestId('open-proof-trace-blocked-proof')).not.toBeInTheDocument();

    fireEvent.click(proofButton);
    expect(window.location.hash).toBe('#proof?run=run-42');
  });
});
