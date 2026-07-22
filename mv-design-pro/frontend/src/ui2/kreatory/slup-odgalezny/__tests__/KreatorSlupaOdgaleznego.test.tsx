/**
 * Testy kreatora „Słup rozgałęźny SN" — realna ścieżka użytkownika, Zero-Debt §5.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KreatorSlupaOdgaleznego } from '../KreatorSlupaOdgaleznego';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const navigateToSldMock = vi.fn();
const selectElementMock = vi.fn();
const centerMock = vi.fn();

const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };
let context: Record<string, unknown> = { segment_id: 'seg-1', segmentLabel: 'Linia A' };
const snapshot = {
  branches: [{ id: 'seg-1', ref_id: 'seg-1', type: 'line_overhead', name: 'Linia A' }],
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
      { id: 'bp-1', name: 'Słup odczepowy', kind: 'BRANCH_POLE', medium: 'LINE_OVERHEAD', branch_ports_count: 1, switch_device_kind: 'ROZLACZNIK', switch_rated_current_a: 400 },
    ]),
}));

async function pick() {
  await waitFor(() => {
    expect(screen.getByTestId('mvd-kreator-slup-katalog')).toBeInTheDocument();
  });
  await userEvent.selectOptions(screen.getByTestId('mvd-kreator-slup-katalog'), 'bp-1');
}

describe('KreatorSlupaOdgaleznego — realna ścieżka', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    context = { segment_id: 'seg-1', segmentLabel: 'Linia A' };
    snapshotState.error = null;
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    navigateToSldMock.mockReset();
    selectElementMock.mockReset();
    centerMock.mockReset();
  });

  afterEach(() => cleanup());

  it('wstawia słup na linii i wiąże selekcję po operacji', async () => {
    executeDomainOperationMock.mockResolvedValue({
      error: null,
      selection_hint: { element_id: 'bp/9', element_type: 'branch_point' },
    });
    render(<KreatorSlupaOdgaleznego />);
    await pick();

    await userEvent.click(screen.getByTestId('mvd-kreator-slup-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'insert_branch_pole_on_segment_sn',
        expect.objectContaining({
          segment_id: 'seg-1',
          insert_at: { mode: 'RATIO', value: 0.5 },
          catalog_binding: expect.objectContaining({ catalog_namespace: 'mv_branch_points', catalog_item_id: 'bp-1' }),
        }),
      );
    });
    expect(closeFormMock).toHaveBeenCalled();
    expect(selectElementMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'bp/9', type: 'BranchPole' }));
    expect(centerMock).toHaveBeenCalledWith('bp/9');
  });

  it('panel teorii renderuje wzory przez KaTeX (math-rendered)', async () => {
    render(<KreatorSlupaOdgaleznego />);
    await pick();
    const wzory = screen.getAllByTestId('math-rendered');
    expect(wzory.length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByTestId('math-fallback')).toBeNull();
  });

  it('uczciwy stan zerowy: bez odcinka zapis zablokowany', async () => {
    context = {};
    render(<KreatorSlupaOdgaleznego />);
    await screen.findByTestId('mvd-kreator-slup-brak');
    expect(screen.getByTestId('mvd-kreator-slup-zapisz')).toBeDisabled();
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('blokuje wstawienie na kablu (nieprawidłowy tor)', async () => {
    context = { segment_id: 'seg-cable' };
    snapshot.branches = [{ id: 'seg-cable', ref_id: 'seg-cable', type: 'cable', name: 'Kabel B' }];
    render(<KreatorSlupaOdgaleznego />);
    await screen.findByTestId('mvd-kreator-slup-tor');
    expect(screen.getByTestId('mvd-kreator-slup-zapisz')).toBeDisabled();
    snapshot.branches = [{ id: 'seg-1', ref_id: 'seg-1', type: 'line_overhead', name: 'Linia A' }];
  });

  it('blokuje zapis bez aktywnego zakresu obliczeń', async () => {
    appState.activeCaseId = null;
    render(<KreatorSlupaOdgaleznego />);
    await pick();
    expect(screen.getByTestId('mvd-kreator-slup-zapisz')).toBeDisabled();
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });
});
