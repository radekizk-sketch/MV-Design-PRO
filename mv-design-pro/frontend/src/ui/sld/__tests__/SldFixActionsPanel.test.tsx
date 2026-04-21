import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SldFixActionsPanel } from '../SldFixActionsPanel';

const refresh = vi.fn();
const selectElement = vi.fn();

const readinessStoreState = {
  issues: [
    {
      code: 'E001',
      severity: 'BLOCKER' as const,
      element_ref: 'source-1',
      element_refs: ['source-1'],
      message_pl: 'Brak źródła zasilania',
      suggested_fix: 'Dodaj źródło zasilania',
      fix_action: null,
    },
  ],
  status: 'FAIL' as const,
  ready: false,
  loading: false,
  error: null as string | null,
  refresh,
};

vi.mock('../../engineering-readiness/readinessLiveStore', () => ({
  useReadinessLiveStore: (
    selector: (state: typeof readinessStoreState) => unknown,
  ) => selector(readinessStoreState),
}));

vi.mock('../../selection/store', () => ({
  useSelectionStore: (selector: (state: { selectElement: typeof selectElement }) => unknown) =>
    selector({ selectElement }),
}));

describe('SldFixActionsPanel', () => {
  it('nie pokazuje surowego kodu błędu ani technicznego identyfikatora elementu', () => {
    render(<SldFixActionsPanel caseId="case-1" />);

    expect(screen.queryByText('E001')).toBeNull();
    expect(screen.queryByText('source-1')).toBeNull();
    expect(screen.getByText('Brak źródła zasilania')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Przejdź' })).toBeInTheDocument();
  });

  it('pokazuje blokadę warsztatową zamiast zielonej gotowości', () => {
    readinessStoreState.issues = [];
    readinessStoreState.status = 'WARN';
    readinessStoreState.ready = false;
    readinessStoreState.error = null;

    render(
      <SldFixActionsPanel
        caseId="case-1"
        workspaceBlockState={{
          reason: 'NO_SOURCE',
          title: 'Brak źródła zasilania',
          description: 'Model nie ma jeszcze GPZ.',
          nextStep: 'Dodaj źródło GPZ.',
        }}
      />,
    );

    expect(screen.getByText('Blokada warsztatowa')).toBeInTheDocument();
    expect(screen.getByText('Brak źródła zasilania')).toBeInTheDocument();
    expect(screen.queryByText('Model gotowy do obliczeń')).toBeNull();
  });

  it('ukrywa błąd readiness i przycisk odświeżenia, gdy blokada warsztatowa już wyjaśnia stan', () => {
    readinessStoreState.issues = [];
    readinessStoreState.status = 'FAIL';
    readinessStoreState.ready = false;
    readinessStoreState.error = 'Readiness fetch failed: Internal Server Error';

    render(
      <SldFixActionsPanel
        caseId="case-1"
        workspaceBlockState={{
          reason: 'NO_SNAPSHOT',
          title: 'Brak aktywnej migawki',
          description: 'Nie wybrano migawki modelu.',
          nextStep: 'Wybierz aktywną migawkę projektu.',
        }}
      />,
    );

    expect(screen.getByText('Blokada warsztatowa')).toBeInTheDocument();
    expect(screen.queryByText(/Internal Server Error/i)).toBeNull();
    expect(screen.queryByTestId('sld-fix-panel-refresh')).toBeNull();
  });
});
