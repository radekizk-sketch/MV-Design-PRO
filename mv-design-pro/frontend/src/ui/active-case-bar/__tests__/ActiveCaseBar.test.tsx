import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActiveCaseBar } from '../ActiveCaseBar';
import { useAppStateStore } from '../../app-state/store';
import { useExecutionRunsStore } from '../../study-cases/runStore';
import { useReadinessLiveStore } from '../../engineering-readiness/readinessLiveStore';
import { useResultsInspectorStore } from '../../results-inspector/store';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useStudyCasesStore } from '../../study-cases/store';

vi.mock('../../history/UndoRedoButtons', () => ({
  UndoRedoButtons: () => <div data-testid="undo-redo-buttons" />,
}));

function setReadySnapshot(): void {
  useSnapshotStore.setState({
    snapshot: {
      sources: [{ ref_id: 'source-1', name: 'GPZ 1' }],
      branches: [{ ref_id: 'branch-1', type: 'cable', name: 'Odcinek 1' }],
    } as never,
  });
  useReadinessLiveStore.setState({
    issues: [],
    status: 'OK',
    ready: true,
    bySeverity: { BLOCKER: 0, IMPORTANT: 0, INFO: 0 },
    loading: false,
    error: null,
  });
}

describe('ActiveCaseBar', () => {
  beforeEach(() => {
    useAppStateStore.getState().reset();
    useExecutionRunsStore.getState().reset();
    useReadinessLiveStore.getState().clear();
    useResultsInspectorStore.getState().reset();
    useSnapshotStore.getState().reset();
    useStudyCasesStore.setState({
      projectId: null,
      cases: [],
      activeCase: null,
      selectedCaseId: null,
      comparisonResult: null,
      comparisonCaseIds: null,
      isLoading: false,
      isCreating: false,
      isDeleting: false,
      isCloning: false,
      isActivating: false,
      isComparing: false,
      error: null,
    });
    setReadySnapshot();
  });

  it('trzyma kanoniczny stan przypadku zamiast przejmować status z oglądanego uruchomienia', () => {
    useAppStateStore
      .getState()
      .setActiveCase('case-1', 'Przypadek 1', 'ShortCircuitCase', 'NONE');
    useExecutionRunsStore.setState({ activeRunId: 'run-42' });
    useResultsInspectorStore.setState({
      selectedRunId: 'run-42',
      resultsIndex: {
        run_header: {
          run_id: 'run-42',
          project_id: 'proj-1',
          case_id: 'case-1',
          snapshot_id: 'snap-1',
          created_at: '2026-04-11T10:00:00Z',
          status: 'DONE',
          result_state: 'VALID',
          solver_kind: 'PF',
          input_hash: 'hash-1',
        },
        tables: [],
      } as never,
    });

    render(<ActiveCaseBar />);

    expect(screen.getByTestId('result-status')).toHaveTextContent('Brak wynikow');
    expect(screen.queryByText('Wyniki aktualne')).toBeNull();
    expect(screen.getByTestId('active-run-id')).toHaveTextContent('Id uruchomienia run-42');
  });

  it('ukrywa sekundarne akcje w menu i zachowuje ich działanie', () => {
    const onConfigureClick = vi.fn();
    const onResultsClick = vi.fn();

    useAppStateStore
      .getState()
      .setActiveCase('case-1', 'Przypadek 1', 'ShortCircuitCase', 'FRESH');
    useResultsInspectorStore.setState({
      selectedRunId: 'run-42',
      resultsIndex: {
        run_header: {
          run_id: 'run-42',
          project_id: 'proj-1',
          case_id: 'case-1',
          snapshot_id: 'snap-1',
          created_at: '2026-04-11T10:00:00Z',
          status: 'DONE',
          result_state: 'VALID',
          solver_kind: 'PF',
          input_hash: 'hash-1',
        },
        tables: [],
      } as never,
    });

    render(
      <ActiveCaseBar
        onConfigureClick={onConfigureClick}
        onResultsClick={onResultsClick}
      />
    );

    expect(screen.getByTestId('btn-calculate')).toHaveTextContent('Oblicz');
    expect(screen.queryByTestId('btn-configure')).toBeNull();
    expect(screen.queryByTestId('btn-results')).toBeNull();

    fireEvent.click(screen.getByTestId('btn-secondary-actions'));

    expect(screen.getByTestId('secondary-actions-menu')).toBeInTheDocument();
    expect(screen.getByTestId('btn-configure')).toHaveTextContent('Parametry analizy');
    expect(screen.getByTestId('btn-results')).toHaveTextContent('Podglad wynikow');

    fireEvent.click(screen.getByTestId('btn-configure'));
    expect(onConfigureClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('secondary-actions-menu')).toBeNull();

    fireEvent.click(screen.getByTestId('btn-secondary-actions'));
    fireEvent.click(screen.getByTestId('btn-results'));
    expect(onResultsClick).toHaveBeenCalledTimes(1);
  });
});
