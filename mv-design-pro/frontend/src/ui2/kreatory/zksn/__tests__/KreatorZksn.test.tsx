/**
 * Testy kreatora „Złącze kablowe SN (ZKSN)" — realna ścieżka użytkownika, Zero-Debt §5.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KreatorZksn } from '../KreatorZksn';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const navigateToSldMock = vi.fn();
const selectElementMock = vi.fn();
const centerMock = vi.fn();

const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };
let context: Record<string, unknown> = { segment_id: 'seg-1', segmentLabel: 'Kabel A' };
const snapshot = {
  branches: [{ id: 'seg-1', ref_id: 'seg-1', type: 'cable', name: 'Kabel A' }],
};
const snapshotState = { error: null as string | null, executeDomainOperation: executeDomainOperationMock, snapshot };

vi.mock('../../../../ui/app-state', () => ({
  useAppStateStore: (selector: (s: typeof appState) => unknown) => selector(appState),
}));

vi.mock('../../../../ui/topology/snapshotStore', () => {
  const useSnapshotStore = (selector: (s: typeof snapshotState) => unknown) => selector(snapshotState);
  useSnapshotStore.getState = () => snapshotState;
  return { useSnapshotStore };
});

vi.mock('../../../../ui/network-build/networkBuildStore', () => ({
  useNetworkBuildStore: (selector: (s: { closeOperationForm: typeof closeFormMock }) => unknown) =>
    selector({ closeOperationForm: closeFormMock }),
  useActiveOperationContext: () => context,
}));

vi.mock('../../../../ui/navigation/routes', () => ({
  navigateToSld: () => navigateToSldMock(),
}));

vi.mock('../../../../ui/selection', () => ({
  useSelectionStore: (selector: (s: { selectElement: typeof selectElementMock; centerSldOnElement: typeof centerMock }) => unknown) =>
    selector({ selectElement: selectElementMock, centerSldOnElement: centerMock }),
}));

vi.mock('../../../../ui/catalog/api', () => ({
  fetchBranchPointTypes: () =>
    Promise.resolve([
      { id: 'zk-1', name: 'ZK przelotowe', kind: 'ZKSN', medium: 'CABLE', branch_ports_count: 1, switch_device_kind: 'ROZLACZNIK' },
      { id: 'zk-2', name: 'ZK odgałęźne', kind: 'ZKSN', medium: 'CABLE', branch_ports_count: 2, switch_device_kind: 'ROZLACZNIK' },
    ]),
}));

async function pick(id = 'zk-2') {
  await waitFor(() => {
    expect(screen.getByTestId('mvd-kreator-zksn-katalog')).toBeInTheDocument();
  });
  await userEvent.selectOptions(screen.getByTestId('mvd-kreator-zksn-katalog'), id);
}

describe('KreatorZksn — realna ścieżka', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    context = { segment_id: 'seg-1', segmentLabel: 'Kabel A' };
    snapshotState.error = null;
    snapshot.branches = [{ id: 'seg-1', ref_id: 'seg-1', type: 'cable', name: 'Kabel A' }];
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    navigateToSldMock.mockReset();
    selectElementMock.mockReset();
    centerMock.mockReset();
  });

  afterEach(() => cleanup());

  it('wstawia ZKSN na kablu, przenosi liczbę portów z wariantu i wiąże selekcję', async () => {
    executeDomainOperationMock.mockResolvedValue({
      error: null,
      selection_hint: { element_id: 'zk/7', element_type: 'branch_point' },
    });
    render(<KreatorZksn />);
    await pick('zk-2');

    await userEvent.click(screen.getByTestId('mvd-kreator-zksn-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'insert_zksn_on_segment_sn',
        expect.objectContaining({
          segment_id: 'seg-1',
          branch_ports_count: 2,
          insert_at: { mode: 'RATIO', value: 0.5 },
          catalog_binding: expect.objectContaining({ catalog_namespace: 'mv_branch_points', catalog_item_id: 'zk-2' }),
        }),
      );
    });
    expect(closeFormMock).toHaveBeenCalled();
    expect(selectElementMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'zk/7', type: 'BranchPole' }));
  });

  it('panel teorii renderuje wzory przez KaTeX (math-rendered)', async () => {
    render(<KreatorZksn />);
    await pick();
    const wzory = screen.getAllByTestId('math-rendered');
    expect(wzory.length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByTestId('math-fallback')).toBeNull();
  });

  it('blokuje wstawienie na linii napowietrznej (nieprawidłowy tor)', async () => {
    context = { segment_id: 'seg-line' };
    snapshot.branches = [{ id: 'seg-line', ref_id: 'seg-line', type: 'line_overhead', name: 'Linia B' }];
    render(<KreatorZksn />);
    await screen.findByTestId('mvd-kreator-zksn-tor');
    expect(screen.getByTestId('mvd-kreator-zksn-zapisz')).toBeDisabled();
  });

  it('uczciwy stan zerowy: bez odcinka zapis zablokowany', async () => {
    context = {};
    render(<KreatorZksn />);
    await screen.findByTestId('mvd-kreator-zksn-brak');
    expect(screen.getByTestId('mvd-kreator-zksn-zapisz')).toBeDisabled();
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });
});
