/**
 * Testy kreatora „Aparat nN" (add_nn_switch_device) — realna ścieżka (klik
 * natywny, Zero-Debt §5). Pokrywa iloczyn cech: rodzaj aparatu (switch/fuse) ×
 * zapis, uczciwy stan zerowy brak szyny docelowej, brak punktu startowego.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KreatorAparatuNn } from '../KreatorAparatuNn';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const selectElementMock = vi.fn();
const centerSldOnElementMock = vi.fn();

const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };
let context: Record<string, unknown> = { bus_nn_ref: 'bus-nn-1' };
const snapshotState = {
  error: null as string | null,
  snapshot: { buses: [{ ref_id: 'bus-nn-1', id: 'bus-nn-1', name: 'Szyna nN I', voltage_kv: 0.4 }] },
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
  useActiveOperationForm: () => ({ op: 'add_nn_switch_device', context }),
}));

vi.mock('../../../../ui/selection', () => ({
  useSelectionStore: (selector: (s: { selectElement: typeof selectElementMock; centerSldOnElement: typeof centerSldOnElementMock }) => unknown) =>
    selector({ selectElement: selectElementMock, centerSldOnElement: centerSldOnElementMock }),
}));

const resolveBusNnRefMock = vi.fn(() => 'bus-nn-1' as string | null);
const listAllNnBusOptionsMock = vi.fn(() => [{ ref_id: 'bus-nn-2', name: 'Szyna nN II', voltage_kv: 0.4 }]);
vi.mock('../../../../ui/network-build/forms/enmResolvers', () => ({
  resolveBusNnRef: (...args: unknown[]) => resolveBusNnRefMock(...(args as [])),
  listAllNnBusOptions: (...args: unknown[]) => listAllNnBusOptionsMock(...(args as [])),
}));

vi.mock('../../../../ui/catalog/api', () => ({
  fetchLvApparatusTypes: () =>
    Promise.resolve([
      { id: 'aparat-nn-1', name: 'Wyłącznik nN 63A', device_kind: 'WYLACZNIK_ODPLYWOWY', u_n_kv: 0.4, i_n_a: 63, i_cu_ka: 10 },
    ]),
  getCatalogErrorMessage: (e: unknown) => (e instanceof Error ? e.message : 'Błąd katalogu'),
}));

describe('KreatorAparatuNn — realna ścieżka', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    context = { bus_nn_ref: 'bus-nn-1' };
    snapshotState.error = null;
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    selectElementMock.mockReset();
    centerSldOnElementMock.mockReset();
    resolveBusNnRefMock.mockReset();
    resolveBusNnRefMock.mockReturnValue('bus-nn-1');
    listAllNnBusOptionsMock.mockReset();
    listAllNnBusOptionsMock.mockReturnValue([{ ref_id: 'bus-nn-2', name: 'Szyna nN II', voltage_kv: 0.4 }]);
  });

  afterEach(() => cleanup());

  it('zapisuje wyłącznik/rozłącznik (device_class domyślny "switch")', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null, selection_hint: { element_id: 'aparat-1', element_type: 'switch' } });
    render(<KreatorAparatuNn />);

    await waitFor(() => expect(screen.getByTestId('mvd-kreator-aparat-nn-katalog')).not.toBeDisabled());
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-aparat-nn-szyna-do'), 'bus-nn-2');
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-aparat-nn-katalog'), 'aparat-nn-1');
    await userEvent.click(screen.getByTestId('mvd-kreator-aparat-nn-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_nn_switch_device',
        expect.objectContaining({ from_bus_ref: 'bus-nn-1', to_bus_ref: 'bus-nn-2', device_class: 'switch', catalog_ref: 'aparat-nn-1' }),
      );
    });
    expect(closeFormMock).toHaveBeenCalled();
  });

  it('zapisuje bezpiecznik (device_class "fuse") po przełączeniu rodzaju', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null, selection_hint: null });
    render(<KreatorAparatuNn />);

    await waitFor(() => expect(screen.getByTestId('mvd-kreator-aparat-nn-katalog')).not.toBeDisabled());
    await userEvent.click(screen.getByTestId('mvd-kreator-aparat-nn-rodzaj-przelacznik-fuse'));
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-aparat-nn-szyna-do'), 'bus-nn-2');
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-aparat-nn-katalog'), 'aparat-nn-1');
    await userEvent.click(screen.getByTestId('mvd-kreator-aparat-nn-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_nn_switch_device',
        expect.objectContaining({ device_class: 'fuse' }),
      );
    });
  });

  it('pokazuje uczciwy stan zerowy, gdy brak innej szyny nN do wskazania', async () => {
    listAllNnBusOptionsMock.mockReturnValue([]);
    render(<KreatorAparatuNn />);
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-aparat-nn-katalog')).not.toBeDisabled());
    expect(screen.getByText(/Brak innej szyny nN/)).toBeInTheDocument();
    expect(screen.getByTestId('mvd-kreator-aparat-nn-zapisz')).toBeDisabled();
  });

  it('pokazuje uczciwy stan zerowy bez punktu startowego', async () => {
    context = {};
    resolveBusNnRefMock.mockReturnValue(null);
    render(<KreatorAparatuNn />);
    expect(screen.getByTestId('mvd-kreator-aparat-nn-brak-startu')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-kreator-aparat-nn-zapisz')).toBeDisabled();
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-aparat-nn-katalog')).not.toBeDisabled());
  });
});
