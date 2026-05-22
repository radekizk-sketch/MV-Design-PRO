import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../MissingCatalogReview', () => ({
  MissingCatalogReview: () => <div>Katalogi techniczne</div>,
}));

vi.mock('../TransformerReview', () => ({
  TransformerReview: () => <div>Transformatory</div>,
}));

vi.mock('../SwitchReview', () => ({
  SwitchReview: () => <div>Łączniki</div>,
}));

vi.mock('../OzeReview', () => ({
  OzeReview: () => <div>OZE</div>,
}));

vi.mock('../ReadinessBlockersReview', () => ({
  ReadinessBlockersReview: () => <div>Kontrola konfiguracji</div>,
}));

vi.mock('../IncompleteStationsReview', () => ({
  IncompleteStationsReview: () => <div>Stacje SN/nN</div>,
}));

vi.mock('../../../topology/snapshotStore', () => ({
  useSnapshotStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      snapshot: {
        branches: [],
        transformers: [],
        generators: [],
        loads: [],
        substations: [
          { station_type: 'gpz' },
          { station_type: 'indoor' },
          { station_type: 'outdoor' },
        ],
      },
      readiness: { blockers: [] },
    }),
}));

import { MassReviewPanel } from '../MassReviewPanel';

describe('MassReviewPanel', () => {
  it('pokazuje kontrolę techniczną i liczy tylko stacje SN/nN', () => {
    render(<MassReviewPanel isOpen onClose={() => undefined} />);

    expect(screen.getByRole('dialog', { name: 'Kontrola techniczna układu' })).toBeInTheDocument();
    expect(screen.getByText('Kontrola techniczna układu')).toBeInTheDocument();
    expect(screen.queryByText(/Przeglądy masowe|Przegląd i korekta/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Stacje\s*2/ })).toBeInTheDocument();
  });
});
