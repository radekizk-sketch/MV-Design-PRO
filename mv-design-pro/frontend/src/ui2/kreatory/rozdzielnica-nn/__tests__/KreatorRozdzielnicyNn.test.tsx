/**
 * Testy kreatora „Rozdzielnica nN" — DWA TRYBY na dwóch operacjach domenowych
 * (realna ścieżka, klik natywny, Zero-Debt §5): nowa rozdzielnica
 * (add_nn_distribution_board, z zasileniem i bez) oraz nowa sekcja + sprzęgło
 * w ISTNIEJĄCEJ rozdzielnicy (add_nn_section_coupler). Iloczyn cech: tryb ×
 * zasilenie włączone/wyłączone, tryb × zapis.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KreatorRozdzielnicyNn } from '../KreatorRozdzielnicyNn';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const selectElementMock = vi.fn();
const centerSldOnElementMock = vi.fn();

const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };
let context: Record<string, unknown> = {};
let stationRefMockValue: string | null = null;
let stationMockValue: { ref_id: string; id: string; name: string; station_type: string } | null = null;

const snapshotState = {
  error: null as string | null,
  snapshot: {
    buses: [{ ref_id: 'bus-nn-1', id: 'bus-nn-1', name: 'Szyna nN I', voltage_kv: 0.4 }],
    substations: [] as unknown[],
  },
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
  useActiveOperationForm: () => ({ op: 'add_nn_distribution_board', context }),
}));

vi.mock('../../../../ui/selection', () => ({
  useSelectionStore: (selector: (s: { selectElement: typeof selectElementMock; centerSldOnElement: typeof centerSldOnElementMock }) => unknown) =>
    selector({ selectElement: selectElementMock, centerSldOnElement: centerSldOnElementMock }),
}));

vi.mock('../../../../ui/network-build/forms/enmResolvers', () => ({
  resolveStationRef: () => stationRefMockValue,
  resolveBusNnRef: () => 'bus-nn-1',
  stationLabel: () => stationMockValue?.name ?? '-',
}));

vi.mock('../../../../ui/catalog/api', () => ({
  fetchLvCableTypes: () =>
    Promise.resolve([{ id: 'kabel-nn-1', name: 'YKY 4x25', u_n_kv: 0.4, r_ohm_per_km: 0.727, x_ohm_per_km: 0.08, i_max_a: 96, cross_section_mm2: 25, number_of_cores: 4 }]),
  fetchLvApparatusTypes: () =>
    Promise.resolve([{ id: 'aparat-nn-1', name: 'Sprzęgło nN 250A', device_kind: 'WYLACZNIK_GLOWNY', u_n_kv: 0.4, i_n_a: 250 }]),
  getCatalogErrorMessage: (e: unknown) => (e instanceof Error ? e.message : 'Błąd katalogu'),
}));

describe('KreatorRozdzielnicyNn — realna ścieżka', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    context = {};
    stationRefMockValue = null;
    stationMockValue = null;
    snapshotState.error = null;
    snapshotState.snapshot.substations = [];
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    selectElementMock.mockReset();
    centerSldOnElementMock.mockReset();
  });

  afterEach(() => cleanup());

  describe('tryb: nowa rozdzielnica (add_nn_distribution_board)', () => {
    it('zapisuje rozdzielnicę BEZ zasilenia (supply pominięty)', async () => {
      executeDomainOperationMock.mockResolvedValue({ error: null, selection_hint: { element_id: 'st-1', element_type: 'substation' } });
      render(<KreatorRozdzielnicyNn />);

      await userEvent.clear(screen.getByTestId('mvd-kreator-rozdzielnica-nn-napiecie'));
      await userEvent.type(screen.getByTestId('mvd-kreator-rozdzielnica-nn-napiecie'), '0.4');
      await userEvent.click(screen.getByTestId('mvd-kreator-rozdzielnica-nn-zapisz'));

      await waitFor(() => {
        expect(executeDomainOperationMock).toHaveBeenCalledWith(
          'case-1',
          'add_nn_distribution_board',
          expect.objectContaining({ voltage_kv: 0.4 }),
        );
      });
      const payload = executeDomainOperationMock.mock.calls[0][2] as Record<string, unknown>;
      expect(payload.supply).toBeUndefined();
      expect(closeFormMock).toHaveBeenCalled();
    });

    it('zapisuje rozdzielnicę Z zasileniem (supply skompletowany)', async () => {
      executeDomainOperationMock.mockResolvedValue({ error: null, selection_hint: null });
      render(<KreatorRozdzielnicyNn />);

      await userEvent.click(screen.getByTestId('mvd-kreator-rozdzielnica-nn-zasil-przelacznik'));
      await waitFor(() => expect(screen.getByTestId('mvd-kreator-rozdzielnica-nn-kabel')).not.toBeDisabled());
      await userEvent.selectOptions(screen.getByTestId('mvd-kreator-rozdzielnica-nn-kabel'), 'kabel-nn-1');
      await userEvent.type(screen.getByTestId('mvd-kreator-rozdzielnica-nn-dlugosc'), '20');
      await userEvent.click(screen.getByTestId('mvd-kreator-rozdzielnica-nn-zapisz'));

      await waitFor(() => {
        expect(executeDomainOperationMock).toHaveBeenCalledWith(
          'case-1',
          'add_nn_distribution_board',
          expect.objectContaining({
            supply: expect.objectContaining({ from_bus_ref: 'bus-nn-1', length_m: 20, catalog_ref: 'kabel-nn-1' }),
          }),
        );
      });
    });

    it('blokuje zapis, gdy zasilenie włączone, ale kabel nie wybrany', async () => {
      render(<KreatorRozdzielnicyNn />);
      await userEvent.click(screen.getByTestId('mvd-kreator-rozdzielnica-nn-zasil-przelacznik'));
      expect(screen.getByTestId('mvd-kreator-rozdzielnica-nn-zapisz')).toBeDisabled();
      await waitFor(() => expect(screen.getByTestId('mvd-kreator-rozdzielnica-nn-kabel')).not.toBeDisabled());
    });
  });

  describe('tryb: nowa sekcja + sprzęgło (add_nn_section_coupler)', () => {
    beforeEach(() => {
      stationRefMockValue = 'st-rgnn';
      stationMockValue = { ref_id: 'st-rgnn', id: 'st-rgnn', name: 'RGnN Hala A', station_type: 'rozdzielnica_nn' };
      snapshotState.snapshot.substations = [stationMockValue];
      context = { station_ref: 'st-rgnn' };
    });

    it('zapisuje sekcję + sprzęgło dla istniejącej rozdzielnicy nN', async () => {
      executeDomainOperationMock.mockResolvedValue({ error: null, selection_hint: { element_id: 'bus-sec-2', element_type: 'bus' } });
      render(<KreatorRozdzielnicyNn />);

      await waitFor(() => expect(screen.getByTestId('mvd-kreator-rozdzielnica-nn-sprzeglo')).not.toBeDisabled());
      await userEvent.selectOptions(screen.getByTestId('mvd-kreator-rozdzielnica-nn-sprzeglo'), 'aparat-nn-1');
      await userEvent.click(screen.getByTestId('mvd-kreator-rozdzielnica-nn-zapisz'));

      await waitFor(() => {
        expect(executeDomainOperationMock).toHaveBeenCalledWith(
          'case-1',
          'add_nn_section_coupler',
          expect.objectContaining({ station_ref: 'st-rgnn', catalog_ref: 'aparat-nn-1' }),
        );
      });
      expect(closeFormMock).toHaveBeenCalled();
    });

    it('nie pokazuje pól rozdzielnicy (napięcie/nazwa) w trybie sekcji', async () => {
      render(<KreatorRozdzielnicyNn />);
      expect(screen.queryByTestId('mvd-kreator-rozdzielnica-nn-napiecie')).not.toBeInTheDocument();
      await waitFor(() => expect(screen.getByTestId('mvd-kreator-rozdzielnica-nn-sprzeglo')).not.toBeDisabled());
    });
  });
});
