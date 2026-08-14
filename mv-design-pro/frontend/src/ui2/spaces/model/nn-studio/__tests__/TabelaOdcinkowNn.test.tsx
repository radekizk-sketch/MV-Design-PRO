/**
 * Testy zakładki ODCINKI (tabela edytowalna nN, karta P0.9). Realna ścieżka
 * (klik/edycja natywna). Iloczyn cech: kolumna edytowalna (długość/n_torów) ×
 * zapis, stan pusty, akcja „Zmień kabel" → picker katalogu.
 */
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TabelaOdcinkowNn } from '../TabelaOdcinkowNn';
import type { OdcinekNnWiersz } from '../../../../nav/adapters/nnStudioTreeAdapter';

const wiersze: OdcinekNnWiersz[] = [
  {
    ref: 'cbl-1', nazwa: 'Kabel nN 1', fromBusRef: 'bus-tr-lv', fromBusName: 'Szyna nN TR1',
    toBusRef: 'bus-mid', toBusName: 'Szyna nN pośrednia', catalogRef: 'kabel-nn-1',
    crossSectionMm2: 25, conductorMaterial: 'Al', numberOfCores: 4, lengthM: 50, nParallel: 1,
    layingConditions: null, ratedAmpacityA: 96, status: 'closed',
  },
];

let odcinkiZwracane = wiersze;
vi.mock('../../../../nav/adapters/nnStudioTreeAdapter', () => ({
  useOdcinkiKablowNn: () => odcinkiZwracane,
}));

vi.mock('../../../../../ui/catalog/api', () => ({
  fetchLvCableTypes: () => Promise.resolve([{ id: 'kabel-nn-1', name: 'YKY 4x25', u_n_kv: 0.4, r_ohm_per_km: 0.727, x_ohm_per_km: 0.08, i_max_a: 96, cross_section_mm2: 25, number_of_cores: 4 }]),
  getCatalogErrorMessage: (e: unknown) => (e instanceof Error ? e.message : 'Błąd katalogu'),
}));

const appState = { activeCaseId: 'case-1' as string | null };
vi.mock('../../../../../ui/app-state', () => ({
  useAppStateStore: (selector: (s: typeof appState) => unknown) => selector(appState),
}));

const executeDomainOperationMock = vi.fn();
vi.mock('../../../../../ui/topology/snapshotStore', () => ({
  useSnapshotStore: (selector: (s: { executeDomainOperation: typeof executeDomainOperationMock }) => unknown) =>
    selector({ executeDomainOperation: executeDomainOperationMock }),
}));

const openOperationFormMock = vi.fn();
vi.mock('../../../../../ui/network-build/networkBuildStore', () => ({
  useNetworkBuildStore: (selector: (s: { openOperationForm: typeof openOperationFormMock }) => unknown) =>
    selector({ openOperationForm: openOperationFormMock }),
}));

describe('TabelaOdcinkowNn — realna ścieżka', () => {
  beforeEach(() => {
    odcinkiZwracane = wiersze;
    executeDomainOperationMock.mockReset();
    executeDomainOperationMock.mockResolvedValue({ error: null });
    openOperationFormMock.mockReset();
  });

  afterEach(() => cleanup());

  it('pokazuje uczciwy stan pusty bez odcinków', async () => {
    odcinkiZwracane = [];
    render(<TabelaOdcinkowNn stationRef="st-tr" />);
    expect(screen.getByTestId('mvd-nn-studio-tabela-odcinkow-pusta')).toBeInTheDocument();
    await act(async () => {
      await Promise.resolve();
    });
  });

  it('renderuje wiersz z nazwą kabla dołączoną z katalogu', async () => {
    render(<TabelaOdcinkowNn stationRef="st-tr" />);
    await waitFor(() => expect(screen.getByTestId('mvd-nn-studio-tabela-odcinkow-komorka-kabel-cbl-1-akcja')).toHaveTextContent('YKY 4x25'));
  });

  it('edytuje długość odcinka → update_element_parameters z length_km', async () => {
    render(<TabelaOdcinkowNn stationRef="st-tr" />);
    const input = screen.getByTestId('mvd-nn-studio-tabela-odcinkow-komorka-dlugosc-cbl-1-input');
    await userEvent.clear(input);
    await userEvent.type(input, '75');
    await userEvent.tab();

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith('case-1', 'update_element_parameters', {
        element_ref: 'cbl-1',
        parameters: { length_km: 0.075 },
      });
    });
  });

  it('edytuje liczbę torów równoległych → update_element_parameters z n_parallel', async () => {
    render(<TabelaOdcinkowNn stationRef="st-tr" />);
    const input = screen.getByTestId('mvd-nn-studio-tabela-odcinkow-komorka-nTorow-cbl-1-input');
    await userEvent.clear(input);
    await userEvent.type(input, '2');
    await userEvent.tab();

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith('case-1', 'update_element_parameters', {
        element_ref: 'cbl-1',
        parameters: { n_parallel: 2 },
      });
    });
  });

  it('otwiera picker katalogu po kliknięciu „Zmień" kabla', async () => {
    render(<TabelaOdcinkowNn stationRef="st-tr" />);
    await waitFor(() => expect(screen.getByTestId('mvd-nn-studio-tabela-odcinkow-komorka-kabel-cbl-1-akcja')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('mvd-nn-studio-tabela-odcinkow-komorka-kabel-cbl-1-akcja'));
    expect(openOperationFormMock).toHaveBeenCalledWith('assign_catalog_to_element', expect.objectContaining({ element_ref: 'cbl-1' }));
  });

  it('nie mnoży Iz katalogowego przez n_torów (zero fizyki w UI — pokazuje wartość na tor)', async () => {
    render(<TabelaOdcinkowNn stationRef="st-tr" />);
    await waitFor(() => expect(screen.getByTestId('mvd-nn-studio-tabela-odcinkow-komorka-izKatalogowe-cbl-1')).toHaveTextContent('96'));
  });
});
