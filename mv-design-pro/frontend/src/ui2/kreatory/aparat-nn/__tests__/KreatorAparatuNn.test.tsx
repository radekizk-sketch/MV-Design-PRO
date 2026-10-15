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

// Nazwa obiektu w kreatorze idzie przez REALNY `selectElementName` (to samo źródło nazw co
// schemat, `nazwaObiektuZMigawki`) — atrapa podmienia wyłącznie store migawki.
vi.mock('../../../../ui/topology/snapshotStore', async (importOriginal) => {
  const oryginal = await importOriginal<typeof import('../../../../ui/topology/snapshotStore')>();
  const useSnapshotStore = (selector: (s: typeof snapshotState) => unknown) => selector(snapshotState);
  useSnapshotStore.getState = () => snapshotState;
  return { useSnapshotStore, selectElementName: oryginal.selectElementName };
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
      { id: 'aparat-nn-fuse', name: 'Rozłącznik bezpiecznikowy NH00', device_kind: 'ROZLACZNIK_BEZPIECZNIKOWY', u_n_kv: 0.4, i_n_a: 160, i_cu_ka: 120 },
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

  it('zapisuje wyłącznik: rodzaj przyjęty z pozycji katalogowej, jedyna szyna docelowa przyjęta', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null, selection_hint: { element_id: 'aparat-1', element_type: 'switch' } });
    render(<KreatorAparatuNn />);

    await waitFor(() => expect(screen.getByTestId('mvd-kreator-aparat-nn-katalog')).not.toBeDisabled());
    // Jedyna inna szyna nN — dobrana automatycznie, stoi w polu jak zwykła, edytowalna wartość.
    expect(screen.getByTestId('mvd-kreator-aparat-nn-szyna-do')).toHaveValue('bus-nn-2');
    expect(screen.getByTestId('mvd-kreator-aparat-nn-szyna-do')).toBeEnabled();
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-aparat-nn-katalog'), 'aparat-nn-1');
    // Rodzaj z pozycji katalogowej: przełącznik wskazuje wyłącznik/rozłącznik.
    expect(screen.getByTestId('mvd-kreator-aparat-nn-rodzaj-przelacznik-switch')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText(/przyjęto/)).toBeNull();
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

  it('zapisuje bezpiecznik: rozłącznik bezpiecznikowy z katalogu przyjmuje rodzaj „fuse”', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null, selection_hint: null });
    render(<KreatorAparatuNn />);

    await waitFor(() => expect(screen.getByTestId('mvd-kreator-aparat-nn-katalog')).not.toBeDisabled());
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-aparat-nn-katalog'), 'aparat-nn-fuse');
    await userEvent.click(screen.getByTestId('mvd-kreator-aparat-nn-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_nn_switch_device',
        expect.objectContaining({ device_class: 'fuse' }),
      );
    });
  });

  it('konflikt widoczny od razu: rodzaj „bezpiecznik” przy wyłączniku z katalogu', async () => {
    render(<KreatorAparatuNn />);
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-aparat-nn-katalog')).not.toBeDisabled());
    await userEvent.click(screen.getByTestId('mvd-kreator-aparat-nn-rodzaj-przelacznik-fuse'));
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-aparat-nn-katalog'), 'aparat-nn-1');
    expect(screen.getByRole('alert').textContent).toMatch(/różni się od rodzaju wybranej pozycji/);
    await userEvent.click(screen.getByTestId('mvd-kreator-aparat-nn-zapisz'));
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  // Intencja dawnych „uczciwych stanów zerowych”: bez szyny docelowej i bez startu operacja
  // nie rusza — w nowym kanonie przez jedno wskazanie przy próbie zapisu.
  it('brak innej szyny nN: informacja w sekcji, zapis wskazuje szynę docelową', async () => {
    listAllNnBusOptionsMock.mockReturnValue([]);
    render(<KreatorAparatuNn />);
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-aparat-nn-katalog')).not.toBeDisabled());
    expect(screen.getByText(/Brak innej szyny nN/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    await userEvent.click(screen.getByTestId('mvd-kreator-aparat-nn-zapisz'));
    expect(screen.getByTestId('mvd-kreator-aparat-nn-szyna-do')).toHaveFocus();
    expect(screen.getByTestId('mvd-kreator-wskazanie').textContent).toMatch(/^Wybierz szynę docelową — /);
  });

  it('bez punktu startowego: zapis nazywa brak startu', async () => {
    context = {};
    resolveBusNnRefMock.mockReturnValue(null);
    render(<KreatorAparatuNn />);
    expect(screen.getByTestId('mvd-kreator-aparat-nn-brak-startu')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-aparat-nn-katalog')).not.toBeDisabled());
    await userEvent.click(screen.getByTestId('mvd-kreator-aparat-nn-zapisz'));
    expect(screen.getByTestId('mvd-kreator-wskazanie').textContent).toMatch(/Wskaż szynę nN/);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });
});
