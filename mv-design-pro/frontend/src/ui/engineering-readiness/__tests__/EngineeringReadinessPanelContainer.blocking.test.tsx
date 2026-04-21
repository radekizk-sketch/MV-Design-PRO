import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EngineeringReadinessPanelContainer } from '../EngineeringReadinessPanelContainer';

const {
  readinessContainerState,
  snapshotState,
  sldStoreState,
  selectionStoreState,
} = vi.hoisted(() => ({
  readinessContainerState: {
    data: null,
    loading: false,
    error: 'Failed to fetch engineering readiness: Internal Server Error',
    load: vi.fn(async () => {}),
    clear: vi.fn(),
  },
  snapshotState: {
    snapshot: null,
  },
  sldStoreState: {
    highlightSymbols: vi.fn(),
  },
  selectionStoreState: {
    selectElement: vi.fn(),
    centerSldOnElement: vi.fn(),
  },
}));

vi.mock('../EngineeringReadinessPanel', () => ({
  EngineeringReadinessPanel: ({
    workspaceBlockState,
  }: {
    workspaceBlockState?: { reason?: string } | null;
  }) => (
    <div
      data-testid="engineering-readiness-panel-stub"
      data-reason={workspaceBlockState?.reason ?? 'none'}
    />
  ),
}));

vi.mock('../store', () => ({
  useEngineeringReadinessStore: (
    selector?: (state: typeof readinessContainerState) => unknown,
  ) => (selector ? selector(readinessContainerState) : readinessContainerState),
}));

vi.mock('../../topology/snapshotStore', () => ({
  useSnapshotStore: (selector: (state: typeof snapshotState) => unknown) => selector(snapshotState),
}));

vi.mock('../../sld-editor/SldEditorStore', () => ({
  useSldEditorStore: () => sldStoreState,
}));

vi.mock('../../selection/store', () => ({
  useSelectionStore: () => selectionStoreState,
}));

describe('EngineeringReadinessPanelContainer', () => {
  it('pomija backend readiness dla braku aktywnej migawki i renderuje blokadę warsztatową', async () => {
    readinessContainerState.data = null;
    readinessContainerState.loading = false;
    readinessContainerState.error = 'Failed to fetch engineering readiness: Internal Server Error';
    readinessContainerState.load.mockClear();
    readinessContainerState.clear.mockClear();
    snapshotState.snapshot = null;

    render(<EngineeringReadinessPanelContainer caseId="case-1" />);

    await waitFor(() => {
      expect(readinessContainerState.clear).toHaveBeenCalled();
    });

    expect(readinessContainerState.load).not.toHaveBeenCalled();
    expect(screen.getByTestId('engineering-readiness-panel-stub')).toHaveAttribute(
      'data-reason',
      'NO_SOURCE',
    );
  });
});
