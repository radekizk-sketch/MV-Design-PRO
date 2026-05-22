import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ReadinessBlockersReview } from '../mass-review/ReadinessBlockersReview';

const openOperationForm = vi.fn();
const selectElement = vi.fn();

vi.mock('../../app-state', () => ({
  useActiveCaseId: () => 'case-1',
}));

vi.mock('../../topology/snapshotStore', () => ({
  useSnapshotStore: (
    selector: (state: { snapshot: unknown; fixActions: [] }) => unknown,
  ) =>
    selector({
      snapshot: {
        sources: [{ ref_id: 'src-1' }],
        branches: [{ type: 'cable' }],
        substations: [],
        transformers: [],
        generators: [],
      },
      fixActions: [],
    }),
}));

vi.mock('../../engineering-readiness/readinessLiveStore', () => ({
  useReadinessLiveStore: (
    selector: (state: {
      issues: Array<{
        code: string;
        severity: 'IMPORTANT';
        message_pl: string;
        element_ref: string | null;
        element_refs: string[];
        wizard_step_hint: string;
      }>;
    }) => unknown,
  ) =>
    selector({
      issues: [
        {
          code: 'warn.catalog.review',
          severity: 'IMPORTANT',
          message_pl: 'Sprawdź dobór katalogu.',
          element_ref: 'seg-1',
          element_refs: [],
          wizard_step_hint: 'KATALOG',
        },
      ],
    }),
}));

vi.mock('../../selection', () => ({
  useSelectionStore: (
    selector: (state: { selectElement: typeof selectElement }) => unknown,
  ) => selector({ selectElement }),
}));

vi.mock('../networkBuildStore', () => ({
  useNetworkBuildStore: (
    selector: (state: { openOperationForm: typeof openOperationForm }) => unknown,
  ) => selector({ openOperationForm }),
}));

describe('ReadinessBlockersReview', () => {
  it('nie komunikuje pełnej gotowości, gdy zostały tylko ostrzeżenia', () => {
    render(<ReadinessBlockersReview />);

    expect(screen.getByText('Kontrola konfiguracji bez zagadnień krytycznych')).toBeInTheDocument();
    expect(screen.getByText('Pozostało 1 ostrzeżenie.')).toBeInTheDocument();
    expect(screen.queryByText(/gotowa do analizy/i)).toBeNull();
  });
});
