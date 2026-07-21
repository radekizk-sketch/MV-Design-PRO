/**
 * Testy kreatora „Dodaj stację SN/nN" (Audyt D, faza D2) — realna ścieżka
 * użytkownika (Zero-Debt §5): natywne interakcje (klik kroku, wybór typu z
 * katalogu, klik zapisu), a nie syntetyczne zdarzenia. Mockowane wyłącznie
 * store'y i końcówki API; helpery topologii (segment/napięcie SN) działają
 * na realnym snapshotcie. Weryfikuje, że zapis woła właściwą operację domenową
 * z poprawnym payloadem i wiąże nowy element ze schematem (V12K-073).
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KreatorStacjiSnNn } from '../KreatorStacjiSnNn';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const navigateToSldMock = vi.fn();
const selectElementMock = vi.fn();
const centerSldOnElementMock = vi.fn();

const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };
let context: Record<string, unknown> = { segment_id: 'seg-1', position_on_segment: 0.5 };
const snapshotState = {
  error: null as string | null,
  executeDomainOperation: executeDomainOperationMock,
  snapshot: {
    buses: [
      { ref_id: 'bus-sn', name: 'Szyna SN', voltage_kv: 15 },
      { ref_id: 'bus-end', name: 'Terminal', voltage_kv: 15 },
    ],
    branches: [{ ref_id: 'seg-1', from_bus_ref: 'bus-sn', to_bus_ref: 'bus-end' }],
  },
};

vi.mock('../../../../ui/app-state', () => ({
  useAppStateStore: (selector: (s: typeof appState) => unknown) => selector(appState),
}));

vi.mock('../../../../ui/topology/snapshotStore', () => {
  const useSnapshotStore = (selector: (s: typeof snapshotState) => unknown) => selector(snapshotState);
  useSnapshotStore.getState = () => snapshotState;
  return {
    useSnapshotStore,
    selectBusOptions: (snap: typeof snapshotState.snapshot | null) =>
      (snap?.buses ?? []).map((b) => ({ ref_id: b.ref_id, name: b.name, voltage_kv: b.voltage_kv })),
  };
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
  useSelectionStore: (
    selector: (s: {
      selectElement: typeof selectElementMock;
      centerSldOnElement: typeof centerSldOnElementMock;
    }) => unknown,
  ) => selector({ selectElement: selectElementMock, centerSldOnElement: centerSldOnElementMock }),
}));

vi.mock('../../../../ui/catalog/api', () => ({
  getCatalogErrorMessage: () => 'błąd katalogu',
  fetchTransformerTypes: () =>
    Promise.resolve([
      {
        id: 'trafo-630-15-04',
        name: 'TR 630',
        rated_power_mva: 0.63,
        voltage_hv_kv: 15,
        voltage_lv_kv: 0.4,
        uk_percent: 4,
        tap_min: -2,
        tap_max: 2,
        tap_step_percent: 2.5,
      },
    ]),
}));

async function przejdzDoTransformatora() {
  await userEvent.click(screen.getByTestId('mvd-kreator-stacja-dalej'));
  await waitFor(() => {
    expect(screen.getByTestId('mvd-kreator-stacja-katalog')).toBeInTheDocument();
  });
}

async function wybierzTyp() {
  await waitFor(() => {
    const select = screen.getByTestId('mvd-kreator-stacja-katalog') as HTMLSelectElement;
    expect(select.querySelector('option[value="trafo-630-15-04"]')).not.toBeNull();
  });
  await userEvent.selectOptions(screen.getByTestId('mvd-kreator-stacja-katalog'), 'trafo-630-15-04');
}

describe('KreatorStacjiSnNn — realna ścieżka', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    context = { segment_id: 'seg-1', position_on_segment: 0.5 };
    snapshotState.error = null;
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    navigateToSldMock.mockReset();
    selectElementMock.mockReset();
    centerSldOnElementMock.mockReset();
  });

  afterEach(() => cleanup());

  it('świadomy podział: wybór typu → zapis woła insert_station_on_segment_sn i wiąże ze schematem', async () => {
    executeDomainOperationMock.mockResolvedValue({
      error: null,
      selection_hint: { element_id: 'st-created', element_type: 'substation', zoom_to: true },
    });
    render(<KreatorStacjiSnNn />);

    await przejdzDoTransformatora();
    await wybierzTyp();
    await userEvent.click(screen.getByTestId('mvd-kreator-stacja-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'insert_station_on_segment_sn',
        expect.objectContaining({
          station_type: 'branch',
          segment_id: 'seg-1',
          insert_at: { mode: 'RATIO', value: 0.5 },
          transformer: expect.objectContaining({
            create: true,
            transformer_catalog_ref: 'trafo-630-15-04',
            catalog_binding: expect.objectContaining({ catalog_namespace: 'TRAFO_SN_NN', catalog_item_id: 'trafo-630-15-04' }),
          }),
          nn_block: expect.objectContaining({ nn_configuration: 'LOAD_NN', outgoing_feeders_nn_count: 2 }),
        }),
      );
    });
    const payload = executeDomainOperationMock.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('endpoint_bus_ref');
    expect((payload.station as Record<string, unknown>).sn_voltage_kv).toBe(15);

    expect(closeFormMock).toHaveBeenCalled();
    await waitFor(() => {
      expect(selectElementMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'st-created', type: 'Station' }),
      );
    });
    expect(centerSldOnElementMock).toHaveBeenCalledWith('st-created');
    expect(navigateToSldMock).toHaveBeenCalled();
  });

  it('zakończenie odcinka: kontekst ENDPOINT_APPEND → zapis woła append_station_on_endpoint', async () => {
    context = { placement_mode: 'ENDPOINT_APPEND', endpoint_bus_ref: 'bus-end', run_ref: 'run-1' };
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorStacjiSnNn />);

    await przejdzDoTransformatora();
    await wybierzTyp();
    await userEvent.click(screen.getByTestId('mvd-kreator-stacja-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'append_station_on_endpoint',
        expect.objectContaining({
          endpoint_bus_ref: 'bus-end',
          run_ref: 'run-1',
          transformer: expect.objectContaining({ transformer_catalog_ref: 'trafo-630-15-04' }),
        }),
      );
    });
    const payload = executeDomainOperationMock.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('segment_id');
  });

  it('honoruje wybór typu stacji zmieniony natywnie w kroku 1', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorStacjiSnNn />);

    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-stacja-typ'), 'sectional');
    await przejdzDoTransformatora();
    await wybierzTyp();
    await userEvent.click(screen.getByTestId('mvd-kreator-stacja-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'insert_station_on_segment_sn',
        expect.objectContaining({ station_type: 'sectional' }),
      );
    });
  });

  it('uczciwy stan zerowy: brak miejsca osadzenia → blokada zapisu', async () => {
    context = {};
    render(<KreatorStacjiSnNn />);
    expect(screen.getByTestId('mvd-kreator-stacja-brak')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-kreator-stacja-zapisz')).toBeDisabled();
  });

  it('blokuje zapis bez aktywnego zakresu obliczeń', async () => {
    appState.activeCaseId = null;
    render(<KreatorStacjiSnNn />);
    expect(screen.getByTestId('mvd-kreator-stacja-zapisz')).toBeDisabled();
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });
});
