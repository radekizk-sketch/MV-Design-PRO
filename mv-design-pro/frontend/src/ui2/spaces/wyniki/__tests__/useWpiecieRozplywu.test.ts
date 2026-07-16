/**
 * Testy wpięcia store'u rozpływu (scalenie U3 #1): ładowanie wyniku
 * dla przebiegów LOAD_FLOW/DONE — przy montażu i na zdarzenie magistrali
 * `wyniki-gotowe`; przebiegi innych analiz nie dotykają store'u rozpływu.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

import { emituj } from '../../../events';
import { useAppStateStore } from '../../../../ui/app-state';
import { usePowerFlowResultsStore } from '../../../../ui/power-flow-results/store';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { useWpiecieRozplywu } from '../useWpiecieRozplywu';
import { przebiegFixture } from './fixtures';

const selectRun = vi.fn(async () => {});
const loadResults = vi.fn(async () => {});

beforeEach(() => {
  vi.clearAllMocks();
  usePowerFlowResultsStore.getState().reset();
  usePowerFlowResultsStore.setState({ selectRun, loadResults });
  useExecutionRunsStore.setState({ runs: [], activeRunId: null });
  useAppStateStore.setState({ activeRunId: null });
});

describe('useWpiecieRozplywu — montaż', () => {
  it('bez aktywnego przebiegu: store rozpływu nietknięty, aktywnyRozplyw=false', () => {
    const { result } = renderHook(() => useWpiecieRozplywu());
    expect(result.current.aktywnyRozplyw).toBe(false);
    expect(selectRun).not.toHaveBeenCalled();
    expect(loadResults).not.toHaveBeenCalled();
  });

  it('aktywny zakończony rozpływ: selectRun + loadResults, aktywnyRozplyw=true', async () => {
    useExecutionRunsStore.setState({ runs: [przebiegFixture({ id: 'run-lf-1' })] });
    useAppStateStore.setState({ activeRunId: 'run-lf-1' });
    const { result } = renderHook(() => useWpiecieRozplywu());
    expect(result.current.aktywnyRozplyw).toBe(true);
    await waitFor(() => expect(selectRun).toHaveBeenCalledWith('run-lf-1'));
    await waitFor(() => expect(loadResults).toHaveBeenCalledTimes(1));
  });

  it('aktywny przebieg zwarciowy: store rozpływu nietknięty, aktywnyRozplyw=false', () => {
    useExecutionRunsStore.setState({
      runs: [przebiegFixture({ id: 'run-sc-1', analysis_type: 'SC_3F' })],
    });
    useAppStateStore.setState({ activeRunId: 'run-sc-1' });
    const { result } = renderHook(() => useWpiecieRozplywu());
    expect(result.current.aktywnyRozplyw).toBe(false);
    expect(selectRun).not.toHaveBeenCalled();
  });

  it('rozpływ niezakończony (RUNNING): bez ładowania', () => {
    useExecutionRunsStore.setState({
      runs: [przebiegFixture({ id: 'run-lf-2', status: 'RUNNING' })],
    });
    useAppStateStore.setState({ activeRunId: 'run-lf-2' });
    const { result } = renderHook(() => useWpiecieRozplywu());
    expect(result.current.aktywnyRozplyw).toBe(false);
    expect(selectRun).not.toHaveBeenCalled();
  });
});

describe('useWpiecieRozplywu — zdarzenie magistrali wyniki-gotowe', () => {
  it('przebieg LOAD_FLOW/DONE: ładuje wynik wskazanego przebiegu', async () => {
    useExecutionRunsStore.setState({ runs: [przebiegFixture({ id: 'run-lf-9' })] });
    renderHook(() => useWpiecieRozplywu());
    act(() => {
      emituj({ typ: 'wyniki-gotowe', runId: 'run-lf-9', przypadekId: 'case-1' });
    });
    await waitFor(() => expect(selectRun).toHaveBeenCalledWith('run-lf-9'));
  });

  it('przebieg innej analizy: ignoruje zdarzenie', () => {
    useExecutionRunsStore.setState({
      runs: [przebiegFixture({ id: 'run-sc-9', analysis_type: 'SC_3F' })],
    });
    renderHook(() => useWpiecieRozplywu());
    act(() => {
      emituj({ typ: 'wyniki-gotowe', runId: 'run-sc-9', przypadekId: 'case-1' });
    });
    expect(selectRun).not.toHaveBeenCalled();
  });

  it('po odmontowaniu: subskrypcja zwolniona (zero ładowań)', () => {
    useExecutionRunsStore.setState({ runs: [przebiegFixture({ id: 'run-lf-9' })] });
    const { unmount } = renderHook(() => useWpiecieRozplywu());
    unmount();
    act(() => {
      emituj({ typ: 'wyniki-gotowe', runId: 'run-lf-9', przypadekId: 'case-1' });
    });
    expect(selectRun).not.toHaveBeenCalled();
  });

  it('idempotencja: wynik już załadowany dla przebiegu → bez ponownego ładowania', async () => {
    useExecutionRunsStore.setState({ runs: [przebiegFixture({ id: 'run-lf-1' })] });
    usePowerFlowResultsStore.setState({
      selectedRunId: 'run-lf-1',
      results: { converged: true } as never,
    });
    useAppStateStore.setState({ activeRunId: 'run-lf-1' });
    renderHook(() => useWpiecieRozplywu());
    await Promise.resolve();
    expect(selectRun).not.toHaveBeenCalled();
    expect(loadResults).not.toHaveBeenCalled();
  });
});
