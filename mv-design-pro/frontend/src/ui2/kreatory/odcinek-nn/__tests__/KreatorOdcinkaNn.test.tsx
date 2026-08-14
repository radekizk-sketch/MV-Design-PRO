/**
 * Testy kreatora „Odcinek nN" (add_nn_cable_segment) — realna ścieżka (klik
 * natywny `userEvent`, Zero-Debt §5). Pokrywa iloczyn cech: tryb ułożenia
 * (katalogowe/własne) × zapis, brak zakresu obliczeń, brak punktu startowego.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KreatorOdcinkaNn } from '../KreatorOdcinkaNn';

const closeFormMock = vi.fn();
const openOperationFormMock = vi.fn();
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
  useNetworkBuildStore: (selector: (s: { closeOperationForm: typeof closeFormMock; openOperationForm: typeof openOperationFormMock }) => unknown) =>
    selector({ closeOperationForm: closeFormMock, openOperationForm: openOperationFormMock }),
  useActiveOperationForm: () => ({ op: 'add_nn_cable_segment', context }),
}));

vi.mock('../../../../ui/selection', () => ({
  useSelectionStore: (selector: (s: { selectElement: typeof selectElementMock; centerSldOnElement: typeof centerSldOnElementMock }) => unknown) =>
    selector({ selectElement: selectElementMock, centerSldOnElement: centerSldOnElementMock }),
}));

const resolveBusNnRefMock = vi.fn(() => 'bus-nn-1' as string | null);
vi.mock('../../../../ui/network-build/forms/enmResolvers', () => ({
  resolveBusNnRef: (...args: unknown[]) => resolveBusNnRefMock(...(args as [])),
}));

vi.mock('../../../../ui/catalog/api', () => ({
  fetchLvCableTypes: () =>
    Promise.resolve([
      { id: 'kabel-nn-1', name: 'YKY 4x25', u_n_kv: 0.4, r_ohm_per_km: 0.727, x_ohm_per_km: 0.08, i_max_a: 96, cross_section_mm2: 25, number_of_cores: 4, conductor_material: 'Al' },
    ]),
  getCatalogErrorMessage: (e: unknown) => (e instanceof Error ? e.message : 'Błąd katalogu'),
}));

vi.mock('../../../../ui/network-build/forms/cableVoltageDropApi', () => ({
  fetchCableVoltageDrop: () =>
    Promise.resolve({ delta_u_v: 2.1, delta_u_pct: 0.9, r_total_ohm: 0.1, x_total_ohm: 0.01, delta_u_resistive_v: 2, delta_u_reactive_v: 0.1, formula_ref: 'EQ', assumptions: [] }),
}));

describe('KreatorOdcinkaNn — realna ścieżka', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    context = { bus_nn_ref: 'bus-nn-1' };
    snapshotState.error = null;
    closeFormMock.mockReset();
    openOperationFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    selectElementMock.mockReset();
    centerSldOnElementMock.mockReset();
    resolveBusNnRefMock.mockReset();
    resolveBusNnRefMock.mockReturnValue('bus-nn-1');
  });

  afterEach(() => cleanup());

  it('zapisuje odcinek z warunkami katalogowymi (bez klucza cable_laying_conditions)', async () => {
    executeDomainOperationMock.mockResolvedValue({
      error: null,
      changes: { created_element_ids: ['bus-nn-2', 'cbl-1'] },
      selection_hint: { element_id: 'cbl-1', element_type: 'branch' },
    });
    render(<KreatorOdcinkaNn />);

    await waitFor(() => expect(screen.getByTestId('mvd-kreator-odcinek-nn-kabel')).not.toBeDisabled());
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-odcinek-nn-kabel'), 'kabel-nn-1');
    await userEvent.type(screen.getByTestId('mvd-kreator-odcinek-nn-dlugosc'), '50');
    await userEvent.click(screen.getByTestId('mvd-kreator-odcinek-nn-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_nn_cable_segment',
        expect.objectContaining({ from_bus_ref: 'bus-nn-1', length_m: 50, catalog_ref: 'kabel-nn-1', n_parallel: 1 }),
      );
    });
    const payload = executeDomainOperationMock.mock.calls[0][2] as Record<string, unknown>;
    expect(payload.cable_laying_conditions).toBeUndefined();
  });

  it('zapisuje odcinek z własnymi warunkami ułożenia (obiekt opisu)', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null, changes: { created_element_ids: [] }, selection_hint: null });
    render(<KreatorOdcinkaNn />);

    await waitFor(() => expect(screen.getByTestId('mvd-kreator-odcinek-nn-kabel')).not.toBeDisabled());
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-odcinek-nn-kabel'), 'kabel-nn-1');
    await userEvent.type(screen.getByTestId('mvd-kreator-odcinek-nn-dlugosc'), '30');
    await userEvent.click(screen.getByTestId('mvd-kreator-odcinek-nn-tryb-ulozenia-wlasne'));
    await userEvent.type(screen.getByTestId('mvd-kreator-odcinek-nn-temperatura'), '25');
    await userEvent.click(screen.getByTestId('mvd-kreator-odcinek-nn-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_nn_cable_segment',
        expect.objectContaining({
          cable_laying_conditions: expect.objectContaining({ environment: 'powietrze', insulation: 'PVC' }),
        }),
      );
    });
  });

  it('builder zostaje otwarty po zapisie „Dodaj i kontynuuj" (bez nawigacji do #sld)', async () => {
    executeDomainOperationMock.mockResolvedValue({
      error: null,
      changes: { created_element_ids: ['bus-nn-2', 'cbl-1'] },
      selection_hint: { element_id: 'cbl-1', element_type: 'branch' },
    });
    render(<KreatorOdcinkaNn />);
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-odcinek-nn-kabel')).not.toBeDisabled());
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-odcinek-nn-kabel'), 'kabel-nn-1');
    await userEvent.type(screen.getByTestId('mvd-kreator-odcinek-nn-dlugosc'), '50');
    await userEvent.click(screen.getByTestId('mvd-kreator-odcinek-nn-zapisz'));

    await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalled());
    // Kreator NIE zamyka się (builder) — formularz zostaje w DOM, gotowy na kolejny odcinek.
    expect(closeFormMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('mvd-kreator-odcinek-nn')).toBeInTheDocument();
  });

  it('pokazuje uczciwy stan zerowy bez punktu startowego', async () => {
    context = {};
    resolveBusNnRefMock.mockReturnValue(null);
    render(<KreatorOdcinkaNn />);
    expect(screen.getByTestId('mvd-kreator-odcinek-nn-brak-startu')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-kreator-odcinek-nn-zapisz')).toBeDisabled();
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-odcinek-nn-kabel')).not.toBeDisabled());
  });

  it('blokuje zapis bez aktywnego zakresu obliczeń', async () => {
    appState.activeCaseId = null;
    render(<KreatorOdcinkaNn />);
    expect(screen.getByTestId('mvd-kreator-odcinek-nn-zapisz')).toBeDisabled();
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-odcinek-nn-kabel')).not.toBeDisabled());
  });
});
