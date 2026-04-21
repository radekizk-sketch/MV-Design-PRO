import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useAppStateStore } from '../../app-state/store';
import { useResultsInspectorStore } from '../../results-inspector/store';
import { useStudyCasesStore } from '../../study-cases/store';
import { StatusBar } from '../StatusBar';

describe('StatusBar', () => {
  beforeEach(() => {
    useAppStateStore.getState().reset();
    useResultsInspectorStore.getState().reset();
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
  });

  it('zachowuje nieaktualny stan przypadku nawet wtedy, gdy oglądane uruchomienie ma poprawne wyniki historyczne', () => {
    useAppStateStore.getState().setActiveProject('proj-1', 'Projekt 1');
    useAppStateStore
      .getState()
      .setActiveCase('case-1', 'Przypadek 1', 'PowerFlowCase', 'NONE');
    useStudyCasesStore.setState({
      activeCase: {
        id: 'case-1',
        name: 'Przypadek 1',
        case_type: 'PowerFlowCase',
        project_id: 'proj-1',
        is_active: true,
        result_status: 'OUTDATED',
        results_valid: false,
      } as never,
    });
    useResultsInspectorStore.setState({
      selectedRunId: 'run-11',
      resultsIndex: {
        run_header: {
          run_id: 'run-11',
          project_id: 'proj-1',
          case_id: 'case-1',
          snapshot_id: 'snap-11',
          created_at: '2026-04-11T10:00:00Z',
          status: 'DONE',
          result_state: 'VALID',
          solver_kind: 'PF',
          input_hash: 'hash-11',
        },
        tables: [],
      } as never,
    });

    render(<StatusBar />);

    expect(screen.getByTestId('status-bar-result-status')).toHaveTextContent('Wyniki nieaktualne');
    expect(screen.queryByText('Brak wyników')).toBeNull();
  });
});
