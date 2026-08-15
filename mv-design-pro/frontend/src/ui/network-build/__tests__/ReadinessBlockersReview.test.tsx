import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ReadinessBlockersReview } from '../mass-review/ReadinessBlockersReview';
import { readinessZListy } from '../../../test/gotowoscTestUtils';

const openOperationForm = vi.fn();
const selectElement = vi.fn();

vi.mock('../../app-state', () => ({
  useActiveCaseId: () => 'case-1',
}));

// JEDNA prawda gotowości (KD-1 / V12K-286): przegląd blokad czyta problemy
// przez `gotowoscAdapter` z `useSnapshotStore.readiness` — scena zasila TO pole
// (dawna atrapa `readinessLiveStore` była osobnym, nigdy nieodświeżanym źródłem).
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
      readiness: readinessZListy([
        {
          code: 'warn.catalog.review',
          severity: 'IMPORTANT',
          message_pl: 'Sprawdź dobór katalogu.',
          element_ref: 'seg-1',
        },
      ]),
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
