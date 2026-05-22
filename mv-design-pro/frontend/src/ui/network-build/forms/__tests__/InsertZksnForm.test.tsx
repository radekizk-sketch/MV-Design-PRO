import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InsertZksnForm } from '../InsertZksnForm';

const closeFormMock = vi.fn();
const openRouteSurfaceMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const fetchBranchPointTypesMock = vi.fn();
const selectElementMock = vi.fn();
const centerSldOnElementMock = vi.fn();

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
  openRouteSurface: openRouteSurfaceMock,
};
const snapshotState = {
  snapshot: {
    branches: [{ ref_id: 'seg-cable-1', type: 'cable', length_km: 1.2, name: 'Kabel SN 01' }],
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
      openRouteSurface: typeof openRouteSurfaceMock;
    }) => unknown,
  ) => selector(networkBuildState),
  useActiveOperationForm: () => networkBuildState.activeOperationForm,
  useActiveOperationContext: () => networkBuildState.activeOperationForm.context,
}));

vi.mock('../../../selection/store', () => ({
  useSelectionStore: (
    selector: (state: {
      selectElement: typeof selectElementMock;
      centerSldOnElement: typeof centerSldOnElementMock;
    }) => unknown,
  ) => selector({
    selectElement: selectElementMock,
    centerSldOnElement: centerSldOnElementMock,
  }),
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
    openRouteSurfaceMock.mockReset();
    executeDomainOperationMock.mockReset();
    fetchBranchPointTypesMock.mockReset();
    selectElementMock.mockReset();
    centerSldOnElementMock.mockReset();
    networkBuildState.activeOperationForm.context = {
      segment_id: 'seg-cable-1',
      name: 'ZKSN-01',
      branch_ports_count: 1,
      switch_state: 'closed',
    };
    snapshotState.snapshot.branches = [
      { ref_id: 'seg-cable-1', type: 'cable', length_km: 1.2, name: 'Kabel SN 01' },
    ];
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

  it('dobiera domyslny kompletny wariant katalogowy ZKSN dla toru kablowego', async () => {
    render(<InsertZksnForm />);

    await waitFor(() => {
      expect(fetchBranchPointTypesMock).toHaveBeenCalledWith('ZKSN');
    });

    await waitFor(() => {
      expect(screen.getByTestId('zksn-catalog-summary')).toHaveTextContent('ZKSN przelotowy RSN-6');
      expect(screen.getByTestId('insert-zksn-submit')).toBeEnabled();
    });
    expect(screen.queryByTestId('zksn-catalog-required')).not.toBeInTheDocument();
  });

  it('blokuje próbę wstawienia ZKSN na linii napowietrznej przed wywołaniem domeny', async () => {
    snapshotState.snapshot.branches = [
      { ref_id: 'seg-cable-1', type: 'line_overhead', length_km: 0.7, name: 'Linia napowietrzna SN 01' },
    ];

    render(<InsertZksnForm />);

    await waitFor(() => {
      expect(fetchBranchPointTypesMock).toHaveBeenCalledWith('ZKSN');
    });
    expect(screen.getByTestId('zksn-segment-issue')).toHaveTextContent('tylko w torze kablowym SN');
    await waitFor(() => {
      expect(screen.getByTestId('zksn-catalog-summary')).toHaveTextContent('ZKSN przelotowy RSN-6');
      expect(screen.getByTestId('insert-zksn-submit')).toBeDisabled();
    });
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('buduje payload ZKSN z katalogiem i wariantem zgodnym z wybranym rekordem', async () => {
    executeDomainOperationMock.mockResolvedValue({
      snapshot: {
        header: { name: 'case-1' },
        branch_points: [
          {
            id: 'bp-zksn-1',
            ref_id: 'bp-zksn-1',
            branch_point_type: 'zksn',
            name: 'ZKSN-01',
          },
        ],
      },
      changes: { created_element_ids: ['bp-zksn-1'] },
    });

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
    expect(selectElementMock).toHaveBeenCalledWith({
      id: 'bp-zksn-1',
      type: 'ZKSN',
      name: 'ZKSN-01',
    });
    expect(centerSldOnElementMock).toHaveBeenCalledWith('bp-zksn-1');
    expect(openRouteSurfaceMock).toHaveBeenCalledWith(
      'E-14',
      expect.objectContaining({
        entityRef: 'bp-zksn-1',
        entityType: 'zksn',
        openMode: 'replace_right_panel',
      }),
    );
  });

  it('respektuje tryb zakończenia odcinka i wstawia ZKSN na końcu trasy', async () => {
    networkBuildState.activeOperationForm.context = {
      segment_id: 'seg-cable-1',
      name: 'ZKSN-koniec',
      branch_ports_count: 1,
      switch_state: 'closed',
      placement_mode: 'ENDPOINT_APPEND',
      position_on_segment: 1,
    };
    executeDomainOperationMock.mockResolvedValue({
      snapshot: {
        header: { name: 'case-1' },
        branch_points: [
          {
            id: 'bp-zksn-end',
            ref_id: 'bp-zksn-end',
            branch_point_type: 'zksn',
            name: 'ZKSN-koniec',
          },
        ],
      },
      changes: { created_element_ids: ['bp-zksn-end'] },
    });

    render(<InsertZksnForm />);

    await waitFor(() => {
      expect(fetchBranchPointTypesMock).toHaveBeenCalledWith('ZKSN');
    });
    expect(screen.getByDisplayValue('1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Wstaw ZKSN' }));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'insert_zksn_on_segment_sn',
        expect.objectContaining({
          insert_at: { mode: 'RATIO', value: 1 },
        }),
      );
    });
  });
});
