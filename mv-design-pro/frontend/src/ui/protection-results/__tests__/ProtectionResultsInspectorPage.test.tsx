import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ProtectionResultsInspectorPage } from '../ProtectionResultsInspectorPage';

const mockUseAppStateStore = vi.fn();
const mockUseProtectionReadModel = vi.fn();

vi.mock('../../app-state/store', () => ({
  useAppStateStore: (selector: (state: { activeCaseId: string | null }) => unknown) =>
    mockUseAppStateStore(selector),
}));

vi.mock('../../protection/useProtectionReadModel', () => ({
  useProtectionReadModel: () => mockUseProtectionReadModel(),
}));

vi.mock('../../protection-diagnostics', () => ({
  ProtectionDiagnosticsPanelContainer: () => <div data-testid="canonical-protection-diagnostics" />,
}));

describe('ProtectionResultsInspectorPage', () => {
  beforeEach(() => {
    window.location.hash = '';
    mockUseAppStateStore.mockImplementation(
      (selector: (state: { activeCaseId: string | null }) => unknown) =>
        selector({ activeCaseId: 'case-1' }),
    );
    mockUseProtectionReadModel.mockReturnValue({
      data: {
        summaries: [
          {
            element_id: 'LINE_001',
            element_type: 'LineBranch',
            element_name: 'Linia 001',
            verification_status: 'SPELNIONE',
            verification_reason: 'Spełniono kryteria weryfikacji',
            margin_pct: 12.4,
          },
        ],
      },
      assignmentsByElement: new Map([
        [
          'LINE_001',
          [
            {
              element_id: 'LINE_001',
              element_type: 'LineBranch',
              device_id: 'relay-1',
              device_name_pl: 'Przekaźnik nadprądowy',
              device_kind: 'RELAY_OVERCURRENT',
              status: 'ACTIVE',
            },
          ],
        ],
      ]),
      isLoading: false,
      error: null,
      summary: {
        total_elements: 6,
        total_assignments: 8,
        active_assignments: 7,
        blocked_assignments: 1,
        complete_count: 5,
        incomplete_count: 1,
        verified_count: 4,
        failed_count: 1,
        no_data_count: 1,
        error_count: 2,
        warn_count: 3,
        info_count: 0,
      },
      viewStatus: {
        data_source: 'ENM_PROTECTION_READ_MODEL' as const,
        result_state: 'FRESH' as const,
        has_protection_data: true,
      },
    });
  });

  it('shows explicit guidance when no active case is selected', () => {
    mockUseAppStateStore.mockImplementation(
      (selector: (state: { activeCaseId: string | null }) => unknown) =>
        selector({ activeCaseId: null }),
    );

    render(<ProtectionResultsInspectorPage />);

    expect(
      screen.getByText('Wybierz aktywny przypadek obliczeniowy, aby zobaczyć wyniki ochrony.'),
    ).toBeInTheDocument();
  });

  it('shows canonical ENM status and summary in summary tab', () => {
    render(<ProtectionResultsInspectorPage runId="run-12345678" />);

    expect(screen.getByText('Źródło danych:')).toBeInTheDocument();
    expect(screen.getByText('Bieżący widok ochrony ENM')).toBeInTheDocument();
    expect(screen.getByText('Uruchomienie referencyjne:')).toBeInTheDocument();
    expect(screen.getByText('Elementy z ochroną')).toBeInTheDocument();
    expect(screen.getByText(/Przypisania aktywne:/)).toBeInTheDocument();
    expect(screen.getByText('Weryfikacja i diagnostyka')).toBeInTheDocument();
    expect(screen.getByText('Zablokowane')).toBeInTheDocument();
    expect(screen.getByText('Błędy')).toBeInTheDocument();
    expect(screen.getByText('Ostrzeżenia')).toBeInTheDocument();
  });

  it('shows empty state when canonical protection view has no data', () => {
    mockUseProtectionReadModel.mockReturnValue({
      data: { summaries: [] },
      assignmentsByElement: new Map(),
      isLoading: false,
      error: null,
      summary: {
        total_elements: 0,
        total_assignments: 0,
        active_assignments: 0,
        blocked_assignments: 0,
        complete_count: 0,
        incomplete_count: 0,
        verified_count: 0,
        failed_count: 0,
        no_data_count: 0,
        error_count: 0,
        warn_count: 0,
        info_count: 0,
      },
      viewStatus: {
        data_source: 'ENM_PROTECTION_READ_MODEL' as const,
        result_state: 'NONE' as const,
        has_protection_data: false,
      },
    });

    render(<ProtectionResultsInspectorPage />);

    expect(screen.getByText('Brak danych ochrony w bieżącym modelu ENM.')).toBeInTheDocument();
  });

  it('renders canonical diagnostics container in diagnostics tab', async () => {
    render(<ProtectionResultsInspectorPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Diagnostyka' }));

    expect(await screen.findByTestId('canonical-protection-diagnostics')).toBeInTheDocument();
  });

  it('shows explicit trace guidance and opens proof trace view', async () => {
    render(<ProtectionResultsInspectorPage runId="run-12345678" />);

    fireEvent.click(screen.getByRole('button', { name: 'Wywód' }));

    expect(
      await screen.findByText('Wywód ochrony nie jest dostępny w tym widoku.'),
    ).toBeInTheDocument();
    const traceButton = screen.getByRole('button', { name: 'Otwórz wywód obliczeń' });
    fireEvent.click(traceButton);
    expect(window.location.hash).toBe('#proof?run=run-12345678');
  });

  it('maps raw element types to Polish labels in evaluations tab', async () => {
    render(<ProtectionResultsInspectorPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Oceny' }));

    expect(await screen.findByText('Odcinek liniowy')).toBeInTheDocument();
    expect(screen.queryByText('LineBranch')).not.toBeInTheDocument();
  });
});
