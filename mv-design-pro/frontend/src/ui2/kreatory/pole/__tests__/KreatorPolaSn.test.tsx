/**
 * Testy kreatora „Dodaj pole SN" — realna ścieżka użytkownika, Zero-Debt §5.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KreatorPolaSn } from '../KreatorPolaSn';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const navigateToSldMock = vi.fn();

const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };
const resolved: { station: string | null; bus: string | null } = { station: 'st-1', bus: 'bus-1' };
const snapshotState = {
  error: null as string | null,
  snapshot: {},
  executeDomainOperation: executeDomainOperationMock,
};

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
  useActiveOperationContext: () => ({}),
}));

vi.mock('../../../../ui/network-build/forms/enmResolvers', () => ({
  resolveStationRef: () => resolved.station,
  resolveBusSnRef: () => resolved.bus,
  stationLabel: () => 'Rozdzielnia ST-1',
}));

vi.mock('../../../../ui/navigation/routes', () => ({
  navigateToSld: () => navigateToSldMock(),
}));

vi.mock('../../../../ui/catalog/api', () => ({
  getCatalogErrorMessage: () => 'błąd katalogu',
  fetchMvApparatusTypes: () =>
    Promise.resolve([
      { id: 'app-1', name: 'Wyłącznik SN', device_kind: 'BREAKER', u_n_kv: 17.5, i_n_a: 630, breaking_capacity_ka: 20 },
    ]),
}));

async function pick() {
  await waitFor(() => {
    expect(screen.getByTestId('mvd-kreator-pole-katalog')).toBeInTheDocument();
  });
  await userEvent.selectOptions(screen.getByTestId('mvd-kreator-pole-katalog'), 'app-1');
}

describe('KreatorPolaSn — realna ścieżka', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    resolved.station = 'st-1';
    resolved.bus = 'bus-1';
    snapshotState.error = null;
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    navigateToSldMock.mockReset();
  });

  afterEach(() => cleanup());

  it('dodaje pole SN z rolą, aparatem i katalogiem (operacja domenowa)', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorPolaSn />);
    await pick();
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-pole-rola'), 'TR');

    await userEvent.click(screen.getByTestId('mvd-kreator-pole-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_sn_bay',
        expect.objectContaining({
          bus_ref: 'bus-1',
          station_ref: 'st-1',
          bay_role: 'TR',
          catalog_binding: expect.objectContaining({ catalog_namespace: 'APARAT_SN', catalog_item_id: 'app-1' }),
        }),
      );
    });
    expect(closeFormMock).toHaveBeenCalled();
  });

  it('uczciwy stan zerowy: bez szyny/stacji zapis zablokowany', async () => {
    resolved.station = null;
    resolved.bus = null;
    render(<KreatorPolaSn />);
    expect(screen.getByTestId('mvd-kreator-pole-brak')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-kreator-pole-zapisz')).toBeDisabled();
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('blokuje zapis bez aktywnego zakresu obliczeń', async () => {
    appState.activeCaseId = null;
    render(<KreatorPolaSn />);
    await pick();
    expect(screen.getByTestId('mvd-kreator-pole-zapisz')).toBeDisabled();
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });
});
