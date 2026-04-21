import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReadinessPanel } from '../ReadinessPanel';

const openOperationForm = vi.fn();
const selectElement = vi.fn();
const snapshotState = {
  snapshot: {
    sources: [],
    buses: [],
    branches: [],
    transformers: [],
    substations: [],
    generators: [],
    loads: [],
    branch_points: [],
    bays: [],
    measurements: [],
    protection_assignments: [],
  },
};

vi.mock('../../app-state', () => ({
  useActiveCaseId: () => 'case-1',
}));

vi.mock('../snapshotStore', () => ({
  useSnapshotStore: (selector: (state: typeof snapshotState) => unknown) =>
    selector(snapshotState),
}));

vi.mock('../../engineering-readiness/readinessLiveStore', () => ({
  useReadinessLiveStore: (
    selector: (state: {
      issues: unknown[];
      status: 'OK' | 'WARN' | 'FAIL';
      ready: boolean;
      loading: boolean;
      error: string | null;
    }) => unknown,
  ) =>
    selector({
      issues: [],
      status: 'OK',
      ready: true,
      loading: false,
      error: null,
    }),
}));

vi.mock('../../network-build/networkBuildStore', () => ({
  useNetworkBuildStore: (selector: (state: { openOperationForm: typeof openOperationForm }) => unknown) =>
    selector({ openOperationForm }),
}));

vi.mock('../../selection', () => ({
  useSelectionStore: (selector: (state: { selectElement: typeof selectElement }) => unknown) =>
    selector({ selectElement }),
}));

describe('ReadinessPanel', () => {
  it('nie pokazuje fałszywej zielonej gotowości dla pustego modelu', () => {
    snapshotState.snapshot = {
      sources: [],
      buses: [],
      branches: [],
      transformers: [],
      substations: [],
      generators: [],
      loads: [],
      branch_points: [],
      bays: [],
      measurements: [],
      protection_assignments: [],
    };

    render(<ReadinessPanel />);

    expect(screen.getByText('Brak źródła zasilania')).toBeInTheDocument();
    expect(screen.queryByText('GOTOWA DO ANALIZY')).not.toBeInTheDocument();
  });

  it('blokuje source-only model jako pusty schemat do czasu zbudowania topologii', () => {
    snapshotState.snapshot = {
      sources: [{ ref_id: 'src-1' }],
      buses: [],
      branches: [],
      transformers: [],
      substations: [],
      generators: [],
      loads: [],
      branch_points: [],
      bays: [],
      measurements: [],
      protection_assignments: [],
    };

    render(<ReadinessPanel />);

    expect(screen.getByText('Pusty schemat jednokreskowy')).toBeInTheDocument();
    expect(screen.queryByText('GOTOWA DO ANALIZY')).not.toBeInTheDocument();
  });
});
