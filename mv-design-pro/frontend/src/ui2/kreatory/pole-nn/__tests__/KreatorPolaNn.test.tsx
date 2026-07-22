/**
 * Testy kreatora „Pole odpływowe nN" (add_nn_outgoing_field) — realna ścieżka, Zero-Debt §5.
 * Weryfikuje payload FEEDER/SOURCE i BRAK pickera katalogu (usunięty phantom).
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KreatorPolaNn } from '../KreatorPolaNn';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const navigateToSldMock = vi.fn();
const selectElementMock = vi.fn();
const centerSldOnElementMock = vi.fn();

const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };
let context: Record<string, unknown> = {};
const snapshotState = { error: null as string | null, snapshot: {}, executeDomainOperation: executeDomainOperationMock };

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
  useActiveOperationForm: () => ({ op: 'add_nn_outgoing_field', context }),
}));

vi.mock('../../../../ui/navigation/routes', () => ({ navigateToSld: () => navigateToSldMock() }));

vi.mock('../../../../ui/selection', () => ({
  useSelectionStore: (selector: (s: { selectElement: typeof selectElementMock; centerSldOnElement: typeof centerSldOnElementMock }) => unknown) =>
    selector({ selectElement: selectElementMock, centerSldOnElement: centerSldOnElementMock }),
}));

vi.mock('../../../../ui/network-build/forms/enmResolvers', () => ({
  resolveStationRef: () => 'st-1',
  listNnBusOptions: () => [{ ref_id: 'bus-nn-1', name: 'Szyna nN I', voltage_kv: 0.4 }],
  resolveBusNnRef: () => 'bus-nn-1',
  stationLabel: () => 'Stacja SN/nN A',
}));

describe('KreatorPolaNn — realna ścieżka', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    context = {};
    snapshotState.error = null;
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    selectElementMock.mockReset();
    centerSldOnElementMock.mockReset();
  });

  afterEach(() => cleanup());

  it('dodaje odpływ nN (FEEDER) bez pickera katalogu', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null, selection_hint: { element_id: 'nn-x', element_type: 'bay' } });
    render(<KreatorPolaNn />);

    await userEvent.click(screen.getByTestId('mvd-kreator-pole-nn-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_nn_outgoing_field',
        expect.objectContaining({ station_ref: 'st-1', bus_nn_ref: 'bus-nn-1', field_role: 'FEEDER' }),
      );
    });
    // Zero fabrykacji: żaden picker/pole katalogu w tym kreatorze.
    expect(screen.queryByText(/katalog/i)).not.toBeInTheDocument();
    const payload = executeDomainOperationMock.mock.calls[0][2] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('catalog_binding');
    expect(closeFormMock).toHaveBeenCalled();
  });

  it('wariant SOURCE przekazuje field_role SOURCE i source_field_kind', async () => {
    context = { field_role: 'SOURCE', source_field_kind: 'PV' };
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorPolaNn />);
    await userEvent.click(screen.getByTestId('mvd-kreator-pole-nn-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_nn_outgoing_field',
        expect.objectContaining({ field_role: 'SOURCE', source_field_kind: 'PV' }),
      );
    });
  });

  it('blokuje zapis bez aktywnego zakresu obliczeń', async () => {
    appState.activeCaseId = null;
    render(<KreatorPolaNn />);
    expect(screen.getByTestId('mvd-kreator-pole-nn-zapisz')).toBeDisabled();
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });
});
