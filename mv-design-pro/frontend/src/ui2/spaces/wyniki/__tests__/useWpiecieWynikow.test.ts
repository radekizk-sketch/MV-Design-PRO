/**
 * Testy wpięcia store'ów wyników (scalenia U3 #1–#2): ładowanie wyniku
 * dla przebiegów zakończonych — rozpływ (LOAD_FLOW) do store'u rozpływu,
 * zwarcia (SC_*) do store'u inspektora wyników; przy montażu i na zdarzenie
 * magistrali `wyniki-gotowe`. Inne analizy nie dotykają store'ów.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

import { emituj } from '../../../events';
import { useAppStateStore } from '../../../../ui/app-state';
import { usePowerFlowResultsStore } from '../../../../ui/power-flow-results/store';
import { useResultsInspectorStore } from '../../../../ui/results-inspector/store';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { useWpiecieWynikow } from '../useWpiecieWynikow';
import { przebiegFixture } from './fixtures';

const selectRunPf = vi.fn(async () => {});
const loadResults = vi.fn(async () => {});
const selectRunSc = vi.fn(async () => {});
const loadShortCircuitResults = vi.fn(async () => {});

beforeEach(() => {
  vi.clearAllMocks();
  usePowerFlowResultsStore.getState().reset();
  usePowerFlowResultsStore.setState({ selectRun: selectRunPf, loadResults });
  useResultsInspectorStore.getState().clearRun();
  useResultsInspectorStore.setState({ selectRun: selectRunSc, loadShortCircuitResults });
  useExecutionRunsStore.setState({ runs: [], activeRunId: null });
  useAppStateStore.setState({ activeRunId: null });
});

describe('useWpiecieWynikow — montaż', () => {
  it('bez aktywnego przebiegu: store nietknięte, aktywnyRodzaj=null', () => {
    const { result } = renderHook(() => useWpiecieWynikow());
    expect(result.current.aktywnyRodzaj).toBeNull();
    expect(selectRunPf).not.toHaveBeenCalled();
    expect(selectRunSc).not.toHaveBeenCalled();
  });

  it('aktywny zakończony rozpływ: selectRun+loadResults rozpływu, rodzaj=rozplyw', async () => {
    useExecutionRunsStore.setState({ runs: [przebiegFixture({ id: 'run-lf-1' })] });
    useAppStateStore.setState({ activeRunId: 'run-lf-1' });
    const { result } = renderHook(() => useWpiecieWynikow());
    expect(result.current.aktywnyRodzaj).toBe('rozplyw');
    await waitFor(() => expect(selectRunPf).toHaveBeenCalledWith('run-lf-1'));
    await waitFor(() => expect(loadResults).toHaveBeenCalledTimes(1));
    expect(selectRunSc).not.toHaveBeenCalled();
  });

  it('aktywne zakończone zwarcie: selectRun+loadShortCircuitResults, rodzaj=zwarcie', async () => {
    useExecutionRunsStore.setState({
      runs: [przebiegFixture({ id: 'run-sc-1', analysis_type: 'SC_3F' })],
    });
    useAppStateStore.setState({ activeRunId: 'run-sc-1' });
    const { result } = renderHook(() => useWpiecieWynikow());
    expect(result.current.aktywnyRodzaj).toBe('zwarcie');
    await waitFor(() => expect(selectRunSc).toHaveBeenCalledWith('run-sc-1'));
    await waitFor(() => expect(loadShortCircuitResults).toHaveBeenCalledTimes(1));
    expect(selectRunPf).not.toHaveBeenCalled();
  });

  it('zwarcie jednofazowe (SC_1F) również ładowane jako zwarcie', async () => {
    useExecutionRunsStore.setState({
      runs: [przebiegFixture({ id: 'run-sc-2', analysis_type: 'SC_1F' })],
    });
    useAppStateStore.setState({ activeRunId: 'run-sc-2' });
    const { result } = renderHook(() => useWpiecieWynikow());
    expect(result.current.aktywnyRodzaj).toBe('zwarcie');
    await waitFor(() => expect(selectRunSc).toHaveBeenCalledWith('run-sc-2'));
  });

  it('analiza bez okna w nowej powłoce (SOURCE_COMPLIANCE): rodzaj=null, bez ładowań', () => {
    useExecutionRunsStore.setState({
      runs: [przebiegFixture({ id: 'run-x', analysis_type: 'SOURCE_COMPLIANCE' })],
    });
    useAppStateStore.setState({ activeRunId: 'run-x' });
    const { result } = renderHook(() => useWpiecieWynikow());
    expect(result.current.aktywnyRodzaj).toBeNull();
    expect(selectRunPf).not.toHaveBeenCalled();
    expect(selectRunSc).not.toHaveBeenCalled();
  });

  it('przebieg niezakończony (RUNNING): bez ładowania', () => {
    useExecutionRunsStore.setState({
      runs: [przebiegFixture({ id: 'run-lf-2', status: 'RUNNING' })],
    });
    useAppStateStore.setState({ activeRunId: 'run-lf-2' });
    const { result } = renderHook(() => useWpiecieWynikow());
    expect(result.current.aktywnyRodzaj).toBeNull();
    expect(selectRunPf).not.toHaveBeenCalled();
  });
});

describe('useWpiecieWynikow — zdarzenie magistrali wyniki-gotowe', () => {
  it('przebieg LOAD_FLOW/DONE: ładuje wynik rozpływu', async () => {
    useExecutionRunsStore.setState({ runs: [przebiegFixture({ id: 'run-lf-9' })] });
    renderHook(() => useWpiecieWynikow());
    act(() => {
      emituj({ typ: 'wyniki-gotowe', runId: 'run-lf-9', przypadekId: 'case-1' });
    });
    await waitFor(() => expect(selectRunPf).toHaveBeenCalledWith('run-lf-9'));
  });

  it('przebieg SC_3F/DONE: ładuje wynik zwarciowy', async () => {
    useExecutionRunsStore.setState({
      runs: [przebiegFixture({ id: 'run-sc-9', analysis_type: 'SC_3F' })],
    });
    renderHook(() => useWpiecieWynikow());
    act(() => {
      emituj({ typ: 'wyniki-gotowe', runId: 'run-sc-9', przypadekId: 'case-1' });
    });
    await waitFor(() => expect(selectRunSc).toHaveBeenCalledWith('run-sc-9'));
    expect(selectRunPf).not.toHaveBeenCalled();
  });

  it('po odmontowaniu: subskrypcja zwolniona (zero ładowań)', () => {
    useExecutionRunsStore.setState({ runs: [przebiegFixture({ id: 'run-lf-9' })] });
    const { unmount } = renderHook(() => useWpiecieWynikow());
    unmount();
    act(() => {
      emituj({ typ: 'wyniki-gotowe', runId: 'run-lf-9', przypadekId: 'case-1' });
    });
    expect(selectRunPf).not.toHaveBeenCalled();
  });

  it('idempotencja rozpływu: wynik już załadowany → bez ponownego ładowania', async () => {
    useExecutionRunsStore.setState({ runs: [przebiegFixture({ id: 'run-lf-1' })] });
    usePowerFlowResultsStore.setState({
      selectedRunId: 'run-lf-1',
      results: { converged: true } as never,
    });
    useAppStateStore.setState({ activeRunId: 'run-lf-1' });
    renderHook(() => useWpiecieWynikow());
    await Promise.resolve();
    expect(selectRunPf).not.toHaveBeenCalled();
    expect(loadResults).not.toHaveBeenCalled();
  });

  it('idempotencja zwarć: wynik już załadowany → bez ponownego ładowania', async () => {
    useExecutionRunsStore.setState({
      runs: [przebiegFixture({ id: 'run-sc-1', analysis_type: 'SC_3F' })],
    });
    useResultsInspectorStore.setState({
      selectedRunId: 'run-sc-1',
      shortCircuitResults: { run_id: 'run-sc-1', rows: [] } as never,
    });
    useAppStateStore.setState({ activeRunId: 'run-sc-1' });
    renderHook(() => useWpiecieWynikow());
    await Promise.resolve();
    expect(selectRunSc).not.toHaveBeenCalled();
    expect(loadShortCircuitResults).not.toHaveBeenCalled();
  });
});
