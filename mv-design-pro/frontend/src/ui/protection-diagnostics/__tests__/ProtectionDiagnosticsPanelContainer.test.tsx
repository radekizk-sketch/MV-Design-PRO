import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProtectionDiagnosticsPanelContainer } from '../ProtectionDiagnosticsPanelContainer';

const toggleSeverityFilter = vi.fn();

vi.mock('../../protection', () => ({
  useProtectionReadModel: () => ({
    data: {
      diagnostics: [
        {
          severity: 'ERROR',
          code: 'OC_MISSING_IN',
          message_pl: 'Brak wartości In dla nastawy prądowej',
          element_id: 'LINE_001',
          element_type: 'LineBranch',
          function_ansi: '50',
        },
      ],
    },
    isLoading: false,
    error: null,
  }),
}));

vi.mock('../store', () => ({
  useProtectionDiagnosticsStore: (selector: (state: { toggleSeverityFilter: typeof toggleSeverityFilter }) => unknown) =>
    selector({ toggleSeverityFilter }),
  useSeverityFilter: () => [],
}));

describe('ProtectionDiagnosticsPanelContainer', () => {
  it('renderuje panel na podstawie kanonicznego read modelu ochrony', () => {
    render(<ProtectionDiagnosticsPanelContainer />);

    expect(screen.getByTestId('protection-diagnostics-panel')).toBeInTheDocument();
    expect(
      screen.getByTestId('protection-diagnostics-row-LINE_001-OC_MISSING_IN'),
    ).toBeInTheDocument();
    expect(screen.getByText('Brak wartości In dla nastawy prądowej')).toBeInTheDocument();
  });
});
