/*
 * Testy sekcji adekwatności mocy biernej (P47a §1.3): brak zakończonego rozpływu →
 * instrukcja „Przeprowadź rozpływ mocy"; z przebiegiem LOAD_FLOW/DONE → rezerwy Q
 * per źródło + nasycenie + naruszenia + werdykt + proweniencja. API i store mockowane.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { SekcjaAdekwatnosciQ } from '../SekcjaAdekwatnosciQ';
import { adekwatnoscQFixture, przebiegFixture } from './analizyFixtures';

const pobierzAdekwatnoscQ = vi.fn();
vi.mock('../../api', () => ({
  pobierzAdekwatnoscQ: (runId: string) => pobierzAdekwatnoscQ(runId),
}));

beforeEach(() => {
  useExecutionRunsStore.getState().reset();
});
afterEach(() => {
  useExecutionRunsStore.getState().reset();
  vi.clearAllMocks();
});

describe('SekcjaAdekwatnosciQ — brak przebiegu (kryterium 4)', () => {
  it('bez zakończonego rozpływu pokazuje instrukcję', () => {
    render(<SekcjaAdekwatnosciQ trybEkspercki={false} />);
    expect(screen.getByTestId('mvd-oze-adekw-brak-przebiegu')).toHaveTextContent(
      'Przeprowadź rozpływ mocy',
    );
    expect(pobierzAdekwatnoscQ).not.toHaveBeenCalled();
  });

  it('przebieg zwarciowy nie aktywuje adekwatności (tylko LOAD_FLOW)', () => {
    useExecutionRunsStore.setState({
      runs: [przebiegFixture({ id: 'sc', analysis_type: 'SC_3F', status: 'DONE' })],
    });
    render(<SekcjaAdekwatnosciQ trybEkspercki={false} />);
    expect(screen.getByTestId('mvd-oze-adekw-brak-przebiegu')).toBeInTheDocument();
  });
});

describe('SekcjaAdekwatnosciQ — wynik z rozpływu (kryterium 3)', () => {
  beforeEach(() => {
    useExecutionRunsStore.setState({
      runs: [przebiegFixture({ id: 'lf-run', analysis_type: 'LOAD_FLOW', status: 'DONE' })],
      activeRunId: 'lf-run',
    });
  });

  it('renderuje werdykt, rezerwy źródeł, nasycenie i naruszenia z backendu', async () => {
    pobierzAdekwatnoscQ.mockResolvedValue(adekwatnoscQFixture());
    render(<SekcjaAdekwatnosciQ trybEkspercki={false} />);
    expect(await screen.findByTestId('mvd-oze-adekw-wynik')).toBeInTheDocument();
    expect(pobierzAdekwatnoscQ).toHaveBeenCalledWith('lf-run');
    expect(screen.getByTestId('mvd-oze-adekw-werdykt')).toHaveTextContent('wystarczajaca rezerwa Q');
    expect(screen.getByTestId('mvd-oze-adekw-nasycenie-src-2')).toHaveTextContent('przy granicy');
    expect(screen.getByTestId('mvd-oze-adekw-naruszenie-bus-pcc-2')).toBeInTheDocument();
  });

  it('pokazuje proweniencję werdyktu (jakość pól Q-granic)', async () => {
    pobierzAdekwatnoscQ.mockResolvedValue(adekwatnoscQFixture());
    render(<SekcjaAdekwatnosciQ trybEkspercki={false} />);
    expect(await screen.findByTestId('mvd-oze-adekw-proweniencja')).toHaveTextContent(
      'z karty katalogowej',
    );
  });

  it('błąd końcówki → jawny stan błędu', async () => {
    pobierzAdekwatnoscQ.mockRejectedValue(new Error('422 brak rozpływu'));
    render(<SekcjaAdekwatnosciQ trybEkspercki={false} />);
    expect(await screen.findByTestId('mvd-oze-adekw-blad')).toHaveTextContent('422 brak rozpływu');
  });
});
