import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InsertBranchPoleForm } from '../InsertBranchPoleForm';

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
      segment_id: 'seg-oh-1',
      name: 'Słup rozgałęźny 17',
      switch_state: 'open',
    },
  },
  closeOperationForm: closeFormMock,
  openRouteSurface: openRouteSurfaceMock,
};
const snapshotState = {
  snapshot: {
    branches: [{ ref_id: 'seg-oh-1', type: 'line_overhead', length_km: 2.3, name: 'Linia napowietrzna SN 01' }],
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
      <button type="button" data-testid="pick-branch-pole" onClick={() => onSelectType('AFL-SLUP', 'Słup rozgałęźny SN AFL')}>
        Wybierz AFL-SLUP
      </button>
    ) : null,
}));

describe('InsertBranchPoleForm', () => {
  beforeEach(() => {
    closeFormMock.mockReset();
    openRouteSurfaceMock.mockReset();
    executeDomainOperationMock.mockReset();
    fetchBranchPointTypesMock.mockReset();
    selectElementMock.mockReset();
    centerSldOnElementMock.mockReset();
    networkBuildState.activeOperationForm.context = {
      segment_id: 'seg-oh-1',
      name: 'Słup rozgałęźny 17',
      switch_state: 'open',
    };
    snapshotState.snapshot.branches = [
      { ref_id: 'seg-oh-1', type: 'line_overhead', length_km: 2.3, name: 'Linia napowietrzna SN 01' },
    ];
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
    executeDomainOperationMock.mockResolvedValue({
      snapshot: {
        header: { name: 'case-1' },
        branch_points: [
          {
            id: 'bp-1',
            ref_id: 'bp-1',
            branch_point_type: 'branch_pole',
            name: 'Słup rozgałęźny 17',
          },
        ],
      },
      changes: { created_element_ids: ['bp-1'] },
    });

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
    expect(selectElementMock).toHaveBeenCalledWith({
      id: 'bp-1',
      type: 'BranchPole',
      name: 'Słup rozgałęźny 17',
    });
    expect(centerSldOnElementMock).toHaveBeenCalledWith('bp-1');
    expect(openRouteSurfaceMock).toHaveBeenCalledWith(
      'E-15',
      expect.objectContaining({
        entityRef: 'bp-1',
        entityType: 'branch_pole',
        openMode: 'replace_right_panel',
      }),
    );
  });

  it('blokuje próbę wstawienia słupa na odcinku kablowym przed wywołaniem domeny', async () => {
    snapshotState.snapshot.branches = [
      { ref_id: 'seg-oh-1', type: 'cable', length_km: 0.5, name: 'Kabel SN 01' },
    ];

    render(<InsertBranchPoleForm />);

    await waitFor(() => {
      expect(fetchBranchPointTypesMock).toHaveBeenCalledWith('BRANCH_POLE');
    });
    expect(screen.getByTestId('branch-pole-segment-issue')).toHaveTextContent('tylko w torze linii napowietrznej');

    fireEvent.click(screen.getByRole('button', { name: 'Wybierz z katalogu' }));
    fireEvent.click(screen.getByTestId('pick-branch-pole'));

    await waitFor(() => {
      expect(screen.getByTestId('insert-branch-pole-submit')).toBeDisabled();
    });
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('pokazuje powód odrzucenia i nie zamyka formularza po błędzie domenowym', async () => {
    executeDomainOperationMock.mockResolvedValue({
      error: 'Słup rozgałęźny można osadzić wyłącznie na linii napowietrznej.',
      error_code: 'branch_point.invalid_parent_segment_type',
      snapshot: snapshotState.snapshot,
      changes: { created_element_ids: [], updated_element_ids: [], deleted_element_ids: [] },
    });

    render(<InsertBranchPoleForm />);

    await waitFor(() => {
      expect(fetchBranchPointTypesMock).toHaveBeenCalledWith('BRANCH_POLE');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Wybierz z katalogu' }));
    fireEvent.click(screen.getByTestId('pick-branch-pole'));
    fireEvent.click(screen.getByRole('button', { name: 'Wstaw słup' }));

    await waitFor(() => {
      expect(screen.getByText(/wyłącznie na linii napowietrznej/)).toBeInTheDocument();
    });
    expect(closeFormMock).not.toHaveBeenCalled();
  });

  it('nie zamyka formularza, jeśli odpowiedź nie potwierdza utworzenia słupa', async () => {
    executeDomainOperationMock.mockResolvedValue({
      snapshot: { header: { name: 'case-1' }, branch_points: [] },
      changes: { created_element_ids: [], updated_element_ids: [], deleted_element_ids: [] },
    });

    render(<InsertBranchPoleForm />);

    await waitFor(() => {
      expect(fetchBranchPointTypesMock).toHaveBeenCalledWith('BRANCH_POLE');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Wybierz z katalogu' }));
    fireEvent.click(screen.getByTestId('pick-branch-pole'));
    fireEvent.click(screen.getByRole('button', { name: 'Wstaw słup' }));

    await waitFor(() => {
      expect(screen.getByText(/nie utworzyła słupa rozgałęźnego/)).toBeInTheDocument();
    });
    expect(closeFormMock).not.toHaveBeenCalled();
  });

  it('blokuje zapis słupa do czasu wyboru typu katalogowego', async () => {
    render(<InsertBranchPoleForm />);

    await waitFor(() => {
      expect(fetchBranchPointTypesMock).toHaveBeenCalledWith('BRANCH_POLE');
    });

    expect(screen.getByTestId('branch-pole-catalog-required')).toHaveTextContent(/Wybierz typ katalogowy/);
    expect(screen.getByTestId('insert-branch-pole-submit')).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Wybierz z katalogu' }));
    fireEvent.click(screen.getByTestId('pick-branch-pole'));

    await waitFor(() => {
      expect(screen.getByTestId('insert-branch-pole-submit')).toBeEnabled();
    });
  });
});
