import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react';

vi.mock('../../../../../ui/study-cases/api', () => ({
  listRuns: vi.fn(),
  getRun: vi.fn(),
  getRunResults: vi.fn(),
  createRun: vi.fn(),
  executeRun: vi.fn(),
}));

import * as api from '../../../../../ui/study-cases/api';
import { useExecutionRunsStore } from '../../../../../ui/study-cases/runStore';
import { RUN_STATUS_LABELS, ANALYSIS_TYPE_LABELS } from '../../../../../ui/study-cases/types';
import { emituj } from '../../../../events/bus';
import { PrzebiegiPanel } from '../PrzebiegiPanel';
import { PRZEBIEGI_STRINGS as T } from '../strings';
import { runFixture } from './fixtures';

const RUNS = [
  runFixture({ id: 'run-1', analysis_type: 'SC_3F', status: 'DONE' }),
  runFixture({
    id: 'run-2',
    analysis_type: 'LOAD_FLOW',
    status: 'RUNNING',
    started_at: '2026-07-15T15:00:00Z',
    finished_at: null,
  }),
];

function props(over: Partial<Parameters<typeof PrzebiegiPanel>[0]> = {}) {
  return {
    trybZaawansowania: 'basic' as const,
    onPokazWyniki: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listRuns).mockResolvedValue({ runs: RUNS, count: RUNS.length });
  useExecutionRunsStore.setState({
    activeStudyCaseId: 'K1',
    activeRunId: null,
    runStatus: null,
    runs: RUNS,
    isLoadingRuns: false,
    runError: null,
  });
});

describe('PrzebiegiPanel — stany okna (karta §3 kryterium 1)', () => {
  it('brak aktywnego przypadku → komunikat zachęty', () => {
    useExecutionRunsStore.setState({ activeStudyCaseId: null, runs: [] });
    render(<PrzebiegiPanel {...props()} />);
    expect(screen.getByTestId('mvd-przebiegi-brak-przypadku')).toHaveTextContent(T.brakPrzypadku);
  });

  it('ładowanie pierwszego pobrania → stan ładowania', () => {
    useExecutionRunsStore.setState({ isLoadingRuns: true, runs: [] });
    render(<PrzebiegiPanel {...props()} />);
    expect(screen.getByTestId('mvd-przebiegi-ladowanie')).toHaveTextContent(T.ladowanie);
  });

  it('błąd pobrania przy pustej liście → stan błędu (role=alert)', () => {
    useExecutionRunsStore.setState({ runError: 'Błąd ładowania przebiegów', runs: [] });
    render(<PrzebiegiPanel {...props()} />);
    expect(screen.getByTestId('mvd-przebiegi-blad')).toHaveTextContent(T.blad);
  });

  it('pusta historia → komunikat o braku przebiegów', () => {
    useExecutionRunsStore.setState({ runs: [] });
    render(<PrzebiegiPanel {...props()} />);
    expect(screen.getByTestId('mvd-przebiegi-lista-pusta')).toHaveTextContent(T.brakPrzebiegow);
  });
});

describe('PrzebiegiPanel — tabela z realnych typów (karta §3 kryterium 1)', () => {
  it('renderuje wiersze: analiza PL, status PL tagiem, początek, czas trwania', () => {
    render(<PrzebiegiPanel {...props()} />);
    const w1 = screen.getByTestId('mvd-przebieg-wiersz-run-1');
    expect(w1).toHaveTextContent(ANALYSIS_TYPE_LABELS.SC_3F);
    expect(within(w1).getByTestId('mvd-przebieg-status-run-1')).toHaveTextContent(
      RUN_STATUS_LABELS.DONE,
    );
    expect(w1).toHaveTextContent('2026-07-15 14:32');
    expect(w1).toHaveTextContent('45 s');

    const w2 = screen.getByTestId('mvd-przebieg-wiersz-run-2');
    expect(w2).toHaveTextContent(ANALYSIS_TYPE_LABELS.LOAD_FLOW);
    expect(within(w2).getByTestId('mvd-przebieg-status-run-2')).toHaveTextContent(
      RUN_STATUS_LABELS.RUNNING,
    );
    expect(w2).toHaveTextContent(T.wToku);
  });

  it('kolumna „Rewizja modelu" uczciwie „wkrótce" (brak pola w rekordzie przebiegu)', () => {
    render(<PrzebiegiPanel {...props()} />);
    expect(screen.getByText(T.kolRewizja)).toBeInTheDocument();
    expect(screen.getByTestId('mvd-przebieg-rewizja-run-1')).toHaveTextContent(T.brakWartosci);
  });

  it('klik wiersza = selekcja + szczegóły przebiegu (gramatyka §2)', () => {
    render(<PrzebiegiPanel {...props()} />);
    expect(screen.getByTestId('mvd-przebieg-brak-wyboru')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-przebieg-wiersz-run-1'));
    expect(screen.getByTestId('mvd-przebieg-wiersz-run-1')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('mvd-przebieg-szczegoly')).toHaveTextContent(
      ANALYSIS_TYPE_LABELS.SC_3F,
    );
  });
});

describe('PrzebiegiPanel — reakcja na żywo (karta §3 kryterium 2)', () => {
  it('wyniki-gotowe → lista odświeżona przez loadRuns BEZ remountu panelu', async () => {
    const nowe = [
      ...RUNS,
      runFixture({
        id: 'run-3',
        analysis_type: 'SC_1F',
        started_at: '2026-07-15T16:00:00Z',
        finished_at: '2026-07-15T16:00:30Z',
      }),
    ];
    vi.mocked(api.listRuns).mockResolvedValue({ runs: nowe, count: nowe.length });

    render(<PrzebiegiPanel {...props()} />);
    const panelPrzed = screen.getByTestId('mvd-przebiegi');
    expect(screen.queryByTestId('mvd-przebieg-wiersz-run-3')).not.toBeInTheDocument();

    await act(async () => {
      emituj({ typ: 'wyniki-gotowe', runId: 'run-3', przypadekId: 'K1' });
    });

    await waitFor(() =>
      expect(screen.getByTestId('mvd-przebieg-wiersz-run-3')).toBeInTheDocument(),
    );
    expect(api.listRuns).toHaveBeenCalledWith('K1');
    // Ten sam węzeł DOM -> odświeżenie bez remountu.
    expect(screen.getByTestId('mvd-przebiegi')).toBe(panelPrzed);
    expect(screen.getByTestId('mvd-przebiegi-live')).toHaveTextContent(T.ariaWynikiGotowe);
  });

  it('wyniki-gotowe zachowuje lokalną selekcję wiersza', async () => {
    vi.mocked(api.listRuns).mockResolvedValue({ runs: RUNS, count: RUNS.length });
    render(<PrzebiegiPanel {...props()} />);
    fireEvent.click(screen.getByTestId('mvd-przebieg-wiersz-run-1'));

    await act(async () => {
      emituj({ typ: 'wyniki-gotowe', runId: 'run-1', przypadekId: 'K1' });
    });

    expect(screen.getByTestId('mvd-przebieg-wiersz-run-1')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('mvd-przebieg-szczegoly')).toBeInTheDocument();
  });

  it('wyniki-gotowe innego przypadku → bez odświeżenia', async () => {
    render(<PrzebiegiPanel {...props()} />);
    await act(async () => {
      emituj({ typ: 'wyniki-gotowe', runId: 'run-x', przypadekId: 'K9' });
    });
    expect(api.listRuns).not.toHaveBeenCalled();
  });

  it('wyniki-niewazne → ogłoszenie ARIA-live z rewizją modelu', async () => {
    render(<PrzebiegiPanel {...props()} />);
    await act(async () => {
      emituj({ typ: 'wyniki-niewazne', przyczyna: 'model-zmieniony', rev: 4 });
    });
    expect(screen.getByTestId('mvd-przebiegi-live')).toHaveTextContent(T.ariaWynikiNiewazne(4));
  });
});

describe('PrzebiegiPanel — przejście do wyników (karta §3 kryterium 3)', () => {
  it('„Pokaż wyniki" → callback onPokazWyniki(runId)', () => {
    const onPokazWyniki = vi.fn();
    render(<PrzebiegiPanel {...props({ onPokazWyniki })} />);
    fireEvent.click(screen.getByTestId('mvd-przebieg-wiersz-run-1'));
    fireEvent.click(screen.getByTestId('mvd-przebieg-pokaz-wyniki'));
    expect(onPokazWyniki).toHaveBeenCalledTimes(1);
    expect(onPokazWyniki).toHaveBeenCalledWith('run-1');
  });
});

describe('PrzebiegiPanel — identyfikatory tylko w trybie eksperckim (§2.7)', () => {
  it('tryb podstawowy: brak sekcji technicznej; ekspercki: identyfikatory widoczne', () => {
    const { rerender } = render(<PrzebiegiPanel {...props()} />);
    fireEvent.click(screen.getByTestId('mvd-przebieg-wiersz-run-1'));
    expect(screen.queryByTestId('mvd-przebieg-techniczne')).not.toBeInTheDocument();

    rerender(<PrzebiegiPanel {...props({ trybZaawansowania: 'expert' })} />);
    fireEvent.click(screen.getByTestId('mvd-przebieg-wiersz-run-1'));
    expect(screen.getByTestId('mvd-przebieg-techniczne')).toHaveTextContent('run-1');
  });
});
