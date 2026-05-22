import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { InspectorPanel } from '../InspectorPanel';
import { useExecutionRunsStore } from '../../study-cases/runStore';

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
    const proofButton = screen.getAllByRole('button', { name: 'Otwórz wywód obliczeń' }).at(-1);
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
