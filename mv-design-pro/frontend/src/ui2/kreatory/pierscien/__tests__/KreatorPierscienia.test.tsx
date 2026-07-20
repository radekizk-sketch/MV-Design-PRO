/**
 * Testy kreatora „Domknięcie pierścienia SN + NOP" — realna ścieżka, Zero-Debt §5.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KreatorPierscienia } from '../KreatorPierscienia';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const navigateToSldMock = vi.fn();

const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };
let context: Record<string, unknown> = {
  terminalA_id: 'bus-a',
  terminalA_label: 'Szyna A',
  terminalB_id: 'bus-b',
  terminalB_label: 'Szyna B',
  nop_candidates: [{ id: 'sw-1', label: 'Ł1', elementType: 'switch' }],
};
const snapshotState = { error: null as string | null, executeDomainOperation: executeDomainOperationMock };

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

vi.mock('../../../../ui/catalog/api', () => ({
  getCatalogErrorMessage: () => 'błąd katalogu',
  fetchCableTypes: () =>
    Promise.resolve([
      { id: 'cab-1', name: 'Kabel 3x120', cross_section_mm2: 120, rated_current_a: 280 },
    ]),
  fetchLineTypes: () => Promise.resolve([{ id: 'ln-1', name: 'AFL 70', rated_current_a: 320 }]),
}));

async function pickCable() {
  await waitFor(() => {
    expect(screen.getByTestId('mvd-kreator-pierscien-katalog')).toBeInTheDocument();
  });
  await userEvent.selectOptions(screen.getByTestId('mvd-kreator-pierscien-katalog'), 'cab-1');
}

describe('KreatorPierscienia — realna ścieżka', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    context = {
      terminalA_id: 'bus-a',
      terminalA_label: 'Szyna A',
      terminalB_id: 'bus-b',
      terminalB_label: 'Szyna B',
      nop_candidates: [{ id: 'sw-1', label: 'Ł1', elementType: 'switch' }],
    };
    snapshotState.error = null;
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    navigateToSldMock.mockReset();
  });

  afterEach(() => cleanup());

  it('domyka pierścień i ustawia NOP (dwie operacje domenowe)', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorPierscienia />);
    await pickCable();

    await userEvent.click(screen.getByTestId('mvd-kreator-pierscien-domknij'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'connect_secondary_ring_sn',
        expect.objectContaining({
          from_bus_ref: 'bus-a',
          to_bus_ref: 'bus-b',
          segment: expect.objectContaining({ rodzaj: 'KABEL' }),
        }),
      );
    });

    // Krok 2: wybór NOP i zapis.
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-pierscien-nop-wybor'), 'sw-1');
    await userEvent.click(screen.getByTestId('mvd-kreator-pierscien-zapisz-nop'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'set_normal_open_point',
        { switch_ref: 'sw-1' },
      );
    });
    expect(closeFormMock).toHaveBeenCalled();
  });

  it('uczciwy stan zerowy: bez zacisków domknięcie zablokowane', async () => {
    context = { nop_candidates: [] };
    render(<KreatorPierscienia />);
    expect(screen.getByTestId('mvd-kreator-pierscien-brak')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-kreator-pierscien-domknij')).toBeDisabled();
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('blokuje domknięcie bez aktywnego zakresu obliczeń', async () => {
    appState.activeCaseId = null;
    render(<KreatorPierscienia />);
    await pickCable();
    expect(screen.getByTestId('mvd-kreator-pierscien-domknij')).toBeDisabled();
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });
});
