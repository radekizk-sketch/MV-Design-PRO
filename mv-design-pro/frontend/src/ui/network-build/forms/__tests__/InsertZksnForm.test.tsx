import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InsertZksnForm } from '../InsertZksnForm';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const fetchBranchPointTypesMock = vi.fn();

const appState = { activeCaseId: 'case-1' };
const networkBuildState = {
  activeOperationForm: {
    context: {
      segment_id: 'seg-cable-1',
      name: 'ZKSN-01',
      branch_ports_count: 1,
      switch_state: 'closed',
    },
  },
  closeOperationForm: closeFormMock,
};
const snapshotState = {
  snapshot: {
    branches: [{ ref_id: 'seg-cable-1', type: 'cable', length_km: 1.2 }],
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
      <button type="button" data-testid="pick-zksn-2p" onClick={() => onSelectType('RSN-12', 'ZKSN odgałęźny RSN-12')}>
        Wybierz RSN-12
      </button>
    ) : null,
}));

describe('InsertZksnForm', () => {
  beforeEach(() => {
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    fetchBranchPointTypesMock.mockReset();
    fetchBranchPointTypesMock.mockResolvedValue([
      {
        id: 'RSN-6',
        name: 'ZKSN przelotowy RSN-6',
        manufacturer: 'MV-DESIGN-PRO',
        series: 'RSN',
        kind: 'ZKSN',
        medium: 'CABLE',
        switch_device_kind: 'ROZLACZNIK',
        switch_rated_current_a: 630,
        branch_ports_count: 1,
      },
      {
        id: 'RSN-12',
        name: 'ZKSN odgałęźny RSN-12',
        manufacturer: 'MV-DESIGN-PRO',
        series: 'RSN',
        kind: 'ZKSN',
        medium: 'CABLE',
        switch_device_kind: 'ROZLACZNIK',
        switch_rated_current_a: 630,
        branch_ports_count: 2,
      },
    ]);
  });

  it('buduje payload ZKSN z katalogiem i wariantem zgodnym z wybranym rekordem', async () => {
    executeDomainOperationMock.mockResolvedValue({ snapshot: { header: { name: 'case-1' } } });

    render(<InsertZksnForm />);

    await waitFor(() => {
      expect(fetchBranchPointTypesMock).toHaveBeenCalledWith('ZKSN');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Wybierz z katalogu' }));
    fireEvent.click(screen.getByTestId('pick-zksn-2p'));

    await waitFor(() => {
      expect(screen.getByTestId('zksn-catalog-summary')).toHaveTextContent('ZKSN odgałęźny RSN-12');
      expect(screen.getByDisplayValue('Odgałęźny 2-portowy')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Wstaw ZKSN' }));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'insert_zksn_on_segment_sn',
        expect.objectContaining({
          segment_id: 'seg-cable-1',
          branch_ports_count: 2,
          switch_state: 'closed',
          catalog_binding: expect.objectContaining({
            catalog_namespace: 'mv_branch_points',
            catalog_item_id: 'RSN-12',
          }),
        }),
      );
    });

    expect(closeFormMock).toHaveBeenCalledTimes(1);
  });
});
