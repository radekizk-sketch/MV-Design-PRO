/**
 * Testy kreatora „Dodaj źródło OZE/DER" — realna ścieżka użytkownika (Zero-Debt §5).
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KreatorZrodlaOze } from '../KreatorZrodlaOze';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const navigateToSldMock = vi.fn();

const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };
const resolved: { station: string | null; bus: string | null } = { station: 'st-1', bus: 'bus-nn-1' };
const snapshotState = {
  error: null as string | null,
  snapshot: { substations: [], transformers: [] },
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
  resolveBusNnRef: () => resolved.bus,
  stationLabel: () => 'Rozdzielnia ST-1',
}));

vi.mock('../../../../ui/navigation/routes', () => ({
  navigateToSld: () => navigateToSldMock(),
}));

vi.mock('../../../../ui/catalog/api', () => ({
  getCatalogErrorMessage: () => 'błąd katalogu',
  fetchConverterTypes: () =>
    Promise.resolve([
      {
        id: 'conv-pv-1',
        name: 'Falownik PV 1',
        manufacturer: 'ACME',
        kind: 'PV',
        un_kv: 0.4,
        sn_mva: 1.0,
        pmax_mw: 0.9,
        qmin_mvar: -0.3,
        qmax_mvar: 0.3,
        ptpiree_certificate_ref: 'CERT-1',
      },
    ]),
  fetchLvApparatusTypes: () =>
    Promise.resolve([{ id: 'apar-1', name: 'Wyłącznik nN', u_n_kv: 0.4, i_n_a: 630 }]),
}));

describe('KreatorZrodlaOze — realna ścieżka', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    resolved.station = 'st-1';
    resolved.bus = 'bus-nn-1';
    snapshotState.error = null;
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    navigateToSldMock.mockReset();
  });

  afterEach(() => cleanup());

  it('dodaje źródło PV (nn_side, nowe pole) operacją add_converter_source', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorZrodlaOze />);
    // Krok 2: wybór falownika z katalogu.
    await userEvent.click(screen.getByTestId('mvd-kreator-oze-dalej'));
    await waitFor(() => {
      expect(screen.getByTestId('mvd-kreator-oze-konwerter')).toBeInTheDocument();
    });
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-oze-konwerter'), 'conv-pv-1');
    // Aparat nowego pola (krok 1 był domyślnie NEW_FIELD) — wróć i uzupełnij.
    await userEvent.click(screen.getByTestId('mvd-kreator-oze-wstecz'));
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-oze-aparat'), 'apar-1');

    await userEvent.click(screen.getByTestId('mvd-kreator-oze-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_converter_source',
        expect.objectContaining({
          source_technology: 'PV',
          connection_variant: 'nn_side',
          station_ref: 'st-1',
          bus_nn_ref: 'bus-nn-1',
          control_mode: 'STALY_COS_PHI',
          catalog_binding: expect.objectContaining({ catalog_namespace: 'ZRODLO_NN_PV', catalog_item_id: 'conv-pv-1' }),
        }),
      );
    });
    expect(closeFormMock).toHaveBeenCalled();
  });

  it('krok regulacji: cosφ dla stałego cosφ, nachylenie Q(U) po zmianie trybu (G-OZE-B3)', async () => {
    render(<KreatorZrodlaOze />);
    // Przejdź do kroku 3 (regulacja): tech → katalog → regulacja.
    await userEvent.click(screen.getByTestId('mvd-kreator-oze-dalej'));
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-oze-konwerter')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('mvd-kreator-oze-dalej'));
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-oze-tryb')).toBeInTheDocument());

    // Domyślnie STALY_COS_PHI → pole cosφ widoczne, brak pola nachylenia Q(U).
    expect(screen.getByTestId('mvd-kreator-oze-cosphi')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-kreator-oze-qu-slope')).not.toBeInTheDocument();

    // Zmiana trybu na Q(U) → pole nachylenia + napięciowe pasmo nieczułości, znika pole cosφ.
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-oze-tryb'), 'Q_OD_U');
    expect(screen.getByTestId('mvd-kreator-oze-qu-slope')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-kreator-oze-qu-db-low')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-kreator-oze-qu-db-high')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-kreator-oze-cosphi')).not.toBeInTheDocument();

    // Pasmo nieczułości P(f) pojawia się dopiero po podaniu statyzmu.
    expect(screen.queryByTestId('mvd-kreator-oze-deadband')).not.toBeInTheDocument();
    await userEvent.type(screen.getByTestId('mvd-kreator-oze-statyzm'), '5');
    expect(screen.getByTestId('mvd-kreator-oze-deadband')).toBeInTheDocument();
  });

  it('uczciwy stan zerowy: bez rozdzielni zapis zablokowany', async () => {
    resolved.station = null;
    resolved.bus = null;
    render(<KreatorZrodlaOze />);
    expect(screen.getByTestId('mvd-kreator-oze-brak')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-kreator-oze-zapisz')).toBeDisabled();
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('blokuje zapis bez aktywnego zakresu obliczeń', async () => {
    appState.activeCaseId = null;
    render(<KreatorZrodlaOze />);
    expect(screen.getByTestId('mvd-kreator-oze-zapisz')).toBeDisabled();
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });
});
