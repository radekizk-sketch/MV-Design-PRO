/*
 * Testy sekcji siły sieci (P47a §1.2): brak zakończonego przebiegu zwarciowego →
 * instrukcja „Przeprowadź analizę zwarciową"; z przebiegiem SC/DONE → SCR per
 * węzeł + werdykt + WSCR + ślad WHITE BOX inline. API i store mockowane.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { SekcjaSilySieci } from '../SekcjaSilySieci';
import { przebiegFixture, silaSieciFixture } from './analizyFixtures';

const pobierzSileSieci = vi.fn();
vi.mock('../../api', () => ({
  pobierzSileSieci: (runId: string) => pobierzSileSieci(runId),
}));

beforeEach(() => {
  useExecutionRunsStore.getState().reset();
});
afterEach(() => {
  useExecutionRunsStore.getState().reset();
  vi.clearAllMocks();
});

describe('SekcjaSilySieci — brak przebiegu (kryterium 4)', () => {
  it('bez zakończonego zwarcia pokazuje instrukcję zamiast pustki', () => {
    render(<SekcjaSilySieci trybEkspercki={false} />);
    expect(screen.getByTestId('mvd-oze-sila-brak-przebiegu')).toHaveTextContent(
      'Przeprowadź analizę zwarciową',
    );
    expect(pobierzSileSieci).not.toHaveBeenCalled();
  });
});

describe('SekcjaSilySieci — wynik z przebiegu SC (kryterium 2)', () => {
  beforeEach(() => {
    useExecutionRunsStore.setState({
      runs: [przebiegFixture({ id: 'sc-run', analysis_type: 'SC_3F', status: 'DONE' })],
      activeRunId: 'sc-run',
    });
  });

  it('renderuje WSCR, werdykt i SCR per węzeł z backendu', async () => {
    pobierzSileSieci.mockResolvedValue(silaSieciFixture());
    render(<SekcjaSilySieci trybEkspercki={false} />);
    expect(await screen.findByTestId('mvd-oze-sila-wynik')).toBeInTheDocument();
    expect(pobierzSileSieci).toHaveBeenCalledWith('sc-run');
    expect(screen.getByTestId('mvd-oze-sila-wscr')).toHaveTextContent('4,5');
    expect(screen.getByTestId('mvd-oze-sila-werdykt-bus-pcc-1')).toHaveTextContent('mocna');
    expect(screen.getByTestId('mvd-oze-sila-werdykt-bus-pcc-2')).toHaveTextContent('bardzo słaba');
  });

  it('rozwija ślad WHITE BOX węzła inline (wzór ASCII)', async () => {
    pobierzSileSieci.mockResolvedValue(silaSieciFixture());
    render(<SekcjaSilySieci trybEkspercki={false} />);
    await screen.findByTestId('mvd-oze-sila-wynik');
    expect(screen.queryByTestId('mvd-oze-slad-kroki')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-oze-sila-slad-otworz-bus-pcc-1'));
    expect(screen.getByText('SCR = 120,0 / 20,0')).toBeInTheDocument();
  });

  it('błąd końcówki → jawny stan błędu', async () => {
    pobierzSileSieci.mockRejectedValue(new Error('422 brak zwarcia'));
    render(<SekcjaSilySieci trybEkspercki={false} />);
    expect(await screen.findByTestId('mvd-oze-sila-blad')).toHaveTextContent('422 brak zwarcia');
  });
});
