import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InsertBranchPoleForm } from '../InsertBranchPoleForm';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const fetchBranchPointTypesMock = vi.fn();

const appState = { activeCaseId: 'case-1' };
const networkBuildState = {
  activeOperationForm: {
    context: {
      segment_id: 'seg-oh-1',
      name: 'Słup rozgałęźny 17',
      switch_state: 'open',
    },
  },
  closeOperationForm: closeFormMock,
};
const snapshotState = {
  snapshot: {
    branches: [{ ref_id: 'seg-oh-1', type: 'line_overhead', length_km: 2.3 }],
  },
  executeDomainOperation: executeDomainOperationMock,
};

vi.mock('../../../app-state', () => ({
  useAppStateStore: (selector: (state: typeof appState) => unknown) => selector(appState),
}));

vi.mock('../../../topology/snapshotStore', () => ({
  useSnapshotStore: (
    selector: (state: {
      snapshot: typeof snapshotState.snapshot;
      executeDomainOperation: typeof executeDomainOperationMock;
    }) => unknown,
  ) =>
    selector({
      snapshot: snapshotState.snapshot,
      executeDomainOperation: executeDomainOperationMock,
    }),
}));

vi.mock('../../networkBuildStore', () => ({
  useNetworkBuildStore: (
    selector: (state: {
      activeOperationForm: { context: Record<string, unknown> };
      closeOperationForm: typeof closeFormMock;
    }) => unknown,
  ) => selector(networkBuildState),
  useActiveOperationForm: () => networkBuildState.activeOperationForm,
  useActiveOperationContext: () => networkBuildState.activeOperationForm.context,
}));

vi.mock('../../../catalog/api', () => ({
  fetchBranchPointTypes: (...args: unknown[]) => fetchBranchPointTypesMock(...args),
}));

vi.mock('../../../catalog/TypePicker', () => ({
  TypePicker: ({
    isOpen,
    onSelectType,
  }: {
    isOpen: boolean;
    onSelectType: (typeId: string, typeName: string) => void;
  }) =>
    isOpen ? (
      <button type="button" data-testid="pick-branch-pole" onClick={() => onSelectType('AFL-SLUP', 'Słup rozgałęźny SN AFL')}>
        Wybierz AFL-SLUP
      </button>
    ) : null,
}));

describe('InsertBranchPoleForm', () => {
  beforeEach(() => {
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    fetchBranchPointTypesMock.mockReset();
    fetchBranchPointTypesMock.mockResolvedValue([
      {
        id: 'AFL-SLUP',
        name: 'Słup rozgałęźny SN AFL',
        manufacturer: 'MV-DESIGN-PRO',
        series: 'Słup rozgałęźny SN',
        kind: 'BRANCH_POLE',
        medium: 'LINE_OVERHEAD',
        switch_device_kind: 'ODLACZNIK',
        switch_rated_current_a: 400,
        branch_ports_count: 1,
      },
    ]);
  });

  it('buduje payload słupa rozgałęźnego z katalogiem i stanem aparatu', async () => {
    executeDomainOperationMock.mockResolvedValue({ snapshot: { header: { name: 'case-1' } } });

    render(<InsertBranchPoleForm />);

    await waitFor(() => {
      expect(fetchBranchPointTypesMock).toHaveBeenCalledWith('BRANCH_POLE');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Wybierz z katalogu' }));
    fireEvent.click(screen.getByTestId('pick-branch-pole'));

    await waitFor(() => {
      expect(screen.getByTestId('branch-pole-catalog-summary')).toHaveTextContent('Słup rozgałęźny SN AFL');
      expect(screen.getByTestId('branch-pole-catalog-summary')).toHaveTextContent('Odłącznik / 400 A');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Wstaw słup' }));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'insert_branch_pole_on_segment_sn',
        expect.objectContaining({
          segment_id: 'seg-oh-1',
          switch_state: 'open',
          catalog_binding: expect.objectContaining({
            catalog_namespace: 'mv_branch_points',
            catalog_item_id: 'AFL-SLUP',
          }),
        }),
      );
    });

    expect(closeFormMock).toHaveBeenCalledTimes(1);
  });
});
