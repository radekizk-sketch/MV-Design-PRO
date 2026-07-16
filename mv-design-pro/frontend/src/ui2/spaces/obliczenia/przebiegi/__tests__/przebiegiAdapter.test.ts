import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

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
import {
  mapujWiersze,
  useOdswiezaniePrzebiegow,
  useStanPrzebiegow,
} from '../adapters/przebiegiAdapter';
import { PRZEBIEGI_STRINGS as T } from '../strings';
import { runFixture } from './fixtures';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listRuns).mockResolvedValue({ runs: [], count: 0 });
  useExecutionRunsStore.setState({
    activeStudyCaseId: null,
    activeRunId: null,
    runStatus: null,
    runs: [],
    isLoadingRuns: false,
    runError: null,
  });
});

describe('mapujWiersze — projekcja rekordów przebiegów na wiersze (fixture 1:1)', () => {
  it('mapuje pola na etykiety PL z istniejących słowników', () => {
    const [w] = mapujWiersze([runFixture()]);
    expect(w).toMatchObject({
      id: 'run-1',
      przypadekId: 'K1',
      analiza: ANALYSIS_TYPE_LABELS.SC_3F,
      status: 'DONE',
      statusLabel: RUN_STATUS_LABELS.DONE,
      poczatekISO: '2026-07-15T14:32:00Z',
      czasTrwania: '45 s',
    });
    expect(w.odcisk).toBe(runFixture().solver_input_hash);
  });

  it('przebieg w toku (bez finished_at) → czas trwania „w toku"', () => {
    const [w] = mapujWiersze([runFixture({ status: 'RUNNING', finished_at: null })]);
    expect(w.czasTrwania).toBe(T.wToku);
  });

  it('zachowuje kolejność rekordów ze store (bez własnego sortowania)', () => {
    const wiersze = mapujWiersze([runFixture({ id: 'r-b' }), runFixture({ id: 'r-a' })]);
    expect(wiersze.map((w) => w.id)).toEqual(['r-b', 'r-a']);
  });

  it('przenosi komunikat błędu przebiegu', () => {
    const [w] = mapujWiersze([runFixture({ status: 'FAILED', error_message: 'Solver przerwany' })]);
    expect(w.blad).toBe('Solver przerwany');
  });
});

describe('useStanPrzebiegow — stany okna', () => {
  it('brak activeStudyCaseId → brak-przypadku', () => {
    const { result } = renderHook(() => useStanPrzebiegow());
    expect(result.current).toBe('brak-przypadku');
  });

  it('ładowanie przy pustej liście → ladowanie', () => {
    useExecutionRunsStore.setState({ activeStudyCaseId: 'K1', isLoadingRuns: true, runs: [] });
    const { result } = renderHook(() => useStanPrzebiegow());
    expect(result.current).toBe('ladowanie');
  });

  it('odświeżanie przy niepustej liście → nadal lista (bez remountu, karta §3.2)', () => {
    useExecutionRunsStore.setState({
      activeStudyCaseId: 'K1',
      isLoadingRuns: true,
      runs: [runFixture()],
    });
    const { result } = renderHook(() => useStanPrzebiegow());
    expect(result.current).toBe('lista');
  });

  it('błąd przy pustej liście → blad', () => {
    useExecutionRunsStore.setState({
      activeStudyCaseId: 'K1',
      runError: 'Błąd ładowania przebiegów',
      runs: [],
    });
    const { result } = renderHook(() => useStanPrzebiegow());
    expect(result.current).toBe('blad');
  });
});

describe('useOdswiezaniePrzebiegow — reakcja na żywo (magistrala E15.1)', () => {
  it('wyniki-gotowe dla aktywnego przypadku → loadRuns + ogłoszenie', async () => {
    useExecutionRunsStore.setState({ activeStudyCaseId: 'K1' });
    const { result } = renderHook(() => useOdswiezaniePrzebiegow());
    act(() => {
      emituj({ typ: 'wyniki-gotowe', runId: 'run-9', przypadekId: 'K1' });
    });
    await waitFor(() => expect(api.listRuns).toHaveBeenCalledWith('K1'));
    expect(result.current).toBe(T.ariaWynikiGotowe);
  });

  it('wyniki-gotowe dla INNEGO przypadku → ignorowane (zakres activeStudyCaseId)', () => {
    useExecutionRunsStore.setState({ activeStudyCaseId: 'K1' });
    const { result } = renderHook(() => useOdswiezaniePrzebiegow());
    act(() => {
      emituj({ typ: 'wyniki-gotowe', runId: 'run-9', przypadekId: 'K2' });
    });
    expect(api.listRuns).not.toHaveBeenCalled();
    expect(result.current).toBe('');
  });

  it('wyniki-niewazne → ogłoszenie z rewizją, bez ponownego pobrania', () => {
    useExecutionRunsStore.setState({ activeStudyCaseId: 'K1' });
    const { result } = renderHook(() => useOdswiezaniePrzebiegow());
    act(() => {
      emituj({ typ: 'wyniki-niewazne', przyczyna: 'model-zmieniony', rev: 7 });
    });
    expect(api.listRuns).not.toHaveBeenCalled();
    expect(result.current).toBe(T.ariaWynikiNiewazne(7));
  });

  it('odmontowanie hooka odsubskrybowuje magistralę (bez wycieku)', () => {
    useExecutionRunsStore.setState({ activeStudyCaseId: 'K1' });
    const { unmount } = renderHook(() => useOdswiezaniePrzebiegow());
    unmount();
    act(() => {
      emituj({ typ: 'wyniki-gotowe', runId: 'run-9', przypadekId: 'K1' });
    });
    expect(api.listRuns).not.toHaveBeenCalled();
  });
});
