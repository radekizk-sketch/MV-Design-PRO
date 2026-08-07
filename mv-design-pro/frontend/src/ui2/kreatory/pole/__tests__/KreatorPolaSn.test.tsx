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

const fetchBayTemplatesMock = vi.fn();

vi.mock('../../../../ui/catalog/api', () => ({
  getCatalogErrorMessage: () => 'błąd katalogu',
  fetchMvApparatusTypes: () =>
    Promise.resolve([
      { id: 'app-1', name: 'Wyłącznik SN', device_kind: 'BREAKER', u_n_kv: 17.5, i_n_a: 630, breaking_capacity_ka: 20 },
    ]),
  fetchSwitchgearFamilies: () =>
    Promise.resolve([
      { switchgear_family_ref: 'fam-1', family_name: 'Rotoblok SVS', manufacturer_ref: 'ZPUE' },
    ]),
  fetchCompleteBayTemplates: (manufacturerRef?: string | null, bayKind?: string | null) =>
    fetchBayTemplatesMock(manufacturerRef, bayKind),
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
    fetchBayTemplatesMock.mockReset();
    fetchBayTemplatesMock.mockResolvedValue([]);
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

  it('wiąże pole z szablonem producenta (rodzina → BayKind roli → szablon)', async () => {
    fetchBayTemplatesMock.mockResolvedValue([
      {
        template_ref: 'tmpl-tr-1',
        manufacturer_ref: 'ZPUE',
        switchgear_family_ref: 'fam-1',
        notes_pl: 'Pole transformatorowe 630A',
      },
    ]);
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorPolaSn />);
    await pick();
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-pole-rola'), 'TR');
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-pole-rodzina'), 'fam-1');

    // BayKind wyprowadzony z roli TR = transformatorowe.
    await waitFor(() => {
      expect(fetchBayTemplatesMock).toHaveBeenCalledWith('ZPUE', 'transformatorowe');
    });
    await waitFor(() => {
      expect(screen.getByTestId('mvd-kreator-pole-szablon-wybor')).toBeInTheDocument();
    });
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-pole-szablon-wybor'), 'tmpl-tr-1');

    await userEvent.click(screen.getByTestId('mvd-kreator-pole-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_sn_bay',
        expect.objectContaining({
          bay_role: 'TR',
          switchgear_family_ref: 'fam-1',
          manufacturer_ref: 'ZPUE',
          bay_template_ref: 'tmpl-tr-1',
        }),
      );
    });
  });

  it('pole pomiarowe: wybór rodzaju pomiaru trafia do payloadu add_sn_bay', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorPolaSn />);
    await pick();
    // Wybór rodzaju widoczny dopiero dla roli pomiarowej (realna ścieżka).
    expect(screen.queryByTestId('mvd-kreator-pole-rodzaj-pomiaru')).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-pole-rola'), 'MEASUREMENT');
    await userEvent.selectOptions(
      screen.getByTestId('mvd-kreator-pole-rodzaj-pomiaru'),
      'ROZLICZENIOWY',
    );

    await userEvent.click(screen.getByTestId('mvd-kreator-pole-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_sn_bay',
        expect.objectContaining({
          bay_role: 'MEASUREMENT',
          rodzaj_pomiaru: 'ROZLICZENIOWY',
        }),
      );
    });
  });

  it('rola niepomiarowa nie wysyła rodzaju pomiaru (zero fantomów)', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorPolaSn />);
    await pick();
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-pole-rola'), 'OUT');
    await userEvent.click(screen.getByTestId('mvd-kreator-pole-zapisz'));
    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalled();
    });
    const payload = executeDomainOperationMock.mock.calls[0][2] as Record<string, unknown>;
    expect(payload.rodzaj_pomiaru).toBeUndefined();
  });

  it('uczciwy stan zerowy: bez szyny/stacji zapis zablokowany', async () => {
    resolved.station = null;
    resolved.bus = null;
    render(<KreatorPolaSn />);
    // Montaż pobiera katalogi (aparaty + rodziny rozdzielnic) — czekamy na
    // realny stan końcowy UI (opcja aparatu w selekcie katalogu), żeby
    // aktualizacje stanu domknęły się w act.
    await screen.findByRole('option', { name: /Wyłącznik SN/ });
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
