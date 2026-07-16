/**
 * Testy warsztatu przestrzeni „Wyniki" (scalenie U3 #1): zakładki
 * rozpływ/pozostałe, zakładka startowa wg aktywnego przebiegu, slot mostu.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { useAppStateStore } from '../../../../ui/app-state';
import { usePowerFlowResultsStore } from '../../../../ui/power-flow-results/store';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { WynikiWarsztat } from '../WynikiWarsztat';
import { WYNIKI_WARSZTAT_STRINGS as T } from '../strings';
import { przebiegFixture } from './fixtures';

beforeEach(() => {
  usePowerFlowResultsStore.getState().reset();
  usePowerFlowResultsStore.setState({
    selectRun: vi.fn(async () => {}),
    loadResults: vi.fn(async () => {}),
  });
  useExecutionRunsStore.setState({ runs: [], activeRunId: null });
  useAppStateStore.setState({ activeRunId: null });
});

function props(over: Partial<Parameters<typeof WynikiWarsztat>[0]> = {}) {
  return {
    trybZaawansowania: 'basic' as const,
    onOtworzDowod: vi.fn(),
    pozostale: <div data-testid="most-pozostale">powierzchnia analiz</div>,
    ...over,
  };
}

describe('WynikiWarsztat — zakładki', () => {
  it('renderuje obie zakładki z etykietami PL', () => {
    render(<WynikiWarsztat {...props()} />);
    expect(screen.getByTestId('mvd-wyniki-zakladka-rozplyw')).toHaveTextContent(T.zakladkaRozplyw);
    expect(screen.getByTestId('mvd-wyniki-zakladka-pozostale')).toHaveTextContent(
      T.zakladkaPozostale,
    );
  });

  it('bez aktywnego rozpływu: startuje na moście (pozostałe analizy)', () => {
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

  it('klik przełącza zakładki w obie strony', () => {
    render(<WynikiWarsztat {...props()} />);
    fireEvent.click(screen.getByTestId('mvd-wyniki-zakladka-rozplyw'));
    expect(screen.getByTestId('mvd-rozplyw-szyny')).toBeInTheDocument();
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
  });

  it('zakładka rozpływu bez wyniku w store: uczciwy stan pusty okna E8.1', () => {
    render(<WynikiWarsztat {...props()} />);
    fireEvent.click(screen.getByTestId('mvd-wyniki-zakladka-rozplyw'));
    // Stan pusty pochodzi z TabelaSzyn (kontrakt E8.1) — bez atrap danych.
    expect(screen.getByTestId('mvd-rozplyw-szyny')).toBeInTheDocument();
  });
});
