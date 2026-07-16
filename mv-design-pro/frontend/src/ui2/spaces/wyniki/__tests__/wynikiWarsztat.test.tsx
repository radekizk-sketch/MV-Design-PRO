/**
 * Testy warsztatu przestrzeni „Wyniki" (scalenia U3 #1–#2): zakładki
 * rozpływ/zwarcia/pozostałe, zakładka startowa wg rodzaju aktywnego
 * przebiegu, slot mostu.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { useAppStateStore } from '../../../../ui/app-state';
import { usePowerFlowResultsStore } from '../../../../ui/power-flow-results/store';
import { useResultsInspectorStore } from '../../../../ui/results-inspector/store';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import type { ShortCircuitResults } from '../../../../ui/results-inspector/types';
import { WynikiWarsztat } from '../WynikiWarsztat';
import { WYNIKI_WARSZTAT_STRINGS as T } from '../strings';
import { przebiegFixture } from './fixtures';

beforeEach(() => {
  usePowerFlowResultsStore.getState().reset();
  usePowerFlowResultsStore.setState({
    selectRun: vi.fn(async () => {}),
    loadResults: vi.fn(async () => {}),
  });
  useResultsInspectorStore.getState().clearRun();
  useResultsInspectorStore.setState({
    selectRun: vi.fn(async () => {}),
    loadShortCircuitResults: vi.fn(async () => {}),
  });
  useExecutionRunsStore.setState({ runs: [], activeRunId: null });
  useAppStateStore.setState({ activeRunId: null });
});

/** Wynik zwarciowy 1:1 z kontraktem `ShortCircuitResults` (types.ts:172-176). */
function wynikZwarciowyFixture(): ShortCircuitResults {
  return {
    run_id: 'run-sc-1',
    rows: [
      {
        target_id: 'bus-1',
        element_id: 'bus-1',
        target_name: 'Szyna GPZ',
        ikss_ka: 12.5,
        ip_ka: 31.2,
        ith_ka: 12.9,
        sk_mva: 325.0,
        fault_type: '3F',
        flags: [],
      },
    ],
  };
}

function props(over: Partial<Parameters<typeof WynikiWarsztat>[0]> = {}) {
  return {
    trybZaawansowania: 'basic' as const,
    onOtworzDowod: vi.fn(),
    pozostale: <div data-testid="most-pozostale">powierzchnia analiz</div>,
    ...over,
  };
}

describe('WynikiWarsztat — zakładki', () => {
  it('renderuje trzy zakładki z etykietami PL', () => {
    render(<WynikiWarsztat {...props()} />);
    expect(screen.getByTestId('mvd-wyniki-zakladka-rozplyw')).toHaveTextContent(T.zakladkaRozplyw);
    expect(screen.getByTestId('mvd-wyniki-zakladka-zwarcia')).toHaveTextContent(T.zakladkaZwarcia);
    expect(screen.getByTestId('mvd-wyniki-zakladka-pozostale')).toHaveTextContent(
      T.zakladkaPozostale,
    );
  });

  it('bez aktywnego przebiegu: startuje na moście (pozostałe analizy)', () => {
    render(<WynikiWarsztat {...props()} />);
    expect(screen.getByTestId('most-pozostale')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-rozplyw-szyny')).not.toBeInTheDocument();
  });

  it('aktywny zakończony rozpływ: startuje na zakładce „Rozpływ mocy"', () => {
    useExecutionRunsStore.setState({ runs: [przebiegFixture({ id: 'run-lf-1' })] });
    useAppStateStore.setState({ activeRunId: 'run-lf-1' });
    render(<WynikiWarsztat {...props()} />);
    expect(screen.getByTestId('mvd-rozplyw-szyny')).toBeInTheDocument();
    expect(screen.queryByTestId('most-pozostale')).not.toBeInTheDocument();
  });

  it('aktywne zakończone zwarcie: startuje na zakładce „Zwarcia" z danymi ze store', () => {
    useExecutionRunsStore.setState({
      runs: [przebiegFixture({ id: 'run-sc-1', analysis_type: 'SC_3F' })],
    });
    useAppStateStore.setState({ activeRunId: 'run-sc-1' });
    useResultsInspectorStore.setState({
      selectedRunId: 'run-sc-1',
      shortCircuitResults: wynikZwarciowyFixture(),
    });
    render(<WynikiWarsztat {...props()} />);
    expect(screen.getByTestId('mvd-zwarcia-ekran')).toBeInTheDocument();
    // Nazwa punktu występuje w tabeli, na osi wykresu i w wyborze wkładów.
    expect(screen.getAllByText('Szyna GPZ').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('most-pozostale')).not.toBeInTheDocument();
  });

  it('klik przełącza zakładki (rozpływ → zwarcia → most)', () => {
    render(<WynikiWarsztat {...props()} />);
    fireEvent.click(screen.getByTestId('mvd-wyniki-zakladka-rozplyw'));
    expect(screen.getByTestId('mvd-rozplyw-szyny')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-wyniki-zakladka-zwarcia'));
    // Bez wyniku w store: uczciwy stan pusty okna E8.2.
    expect(screen.getByTestId('mvd-zwarcia-ekran-pusty')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-wyniki-zakladka-pozostale'));
    expect(screen.getByTestId('most-pozostale')).toBeInTheDocument();
  });

  it('strzałki klawiatury przełączają zakładki (roving tabindex)', () => {
    render(<WynikiWarsztat {...props()} />);
    const pozostale = screen.getByTestId('mvd-wyniki-zakladka-pozostale');
    expect(pozostale).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(pozostale, { key: 'ArrowRight' });
    expect(screen.getByTestId('mvd-wyniki-zakladka-rozplyw')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    fireEvent.keyDown(screen.getByTestId('mvd-wyniki-zakladka-rozplyw'), { key: 'ArrowLeft' });
    expect(screen.getByTestId('mvd-wyniki-zakladka-pozostale')).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('zakładka rozpływu bez wyniku w store: uczciwy stan pusty okna E8.1', () => {
    render(<WynikiWarsztat {...props()} />);
    fireEvent.click(screen.getByTestId('mvd-wyniki-zakladka-rozplyw'));
    expect(screen.getByTestId('mvd-rozplyw-szyny')).toBeInTheDocument();
  });
});
