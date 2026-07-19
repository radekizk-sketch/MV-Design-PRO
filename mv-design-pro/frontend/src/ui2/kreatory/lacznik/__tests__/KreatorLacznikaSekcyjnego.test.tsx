/**
 * Testy kreatora „Łącznik sekcyjny SN" — realna ścieżka użytkownika, Zero-Debt §5.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KreatorLacznikaSekcyjnego } from '../KreatorLacznikaSekcyjnego';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const navigateToSldMock = vi.fn();

const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };
let context: Record<string, unknown> = { segment_id: 'seg-1', segmentLabel: 'Odcinek A' };
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
  fetchMvApparatusTypes: () =>
    Promise.resolve([
      { id: 'app-1', name: 'Rozłącznik SN', device_kind: 'ROZLACZNIK', u_n_kv: 17.5, i_n_a: 630, breaking_capacity_ka: 20 },
    ]),
}));

async function pick() {
  await waitFor(() => {
    expect(screen.getByTestId('mvd-kreator-lacznik-katalog')).toBeInTheDocument();
  });
  await userEvent.selectOptions(screen.getByTestId('mvd-kreator-lacznik-katalog'), 'app-1');
}

describe('KreatorLacznikaSekcyjnego — realna ścieżka', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    context = { segment_id: 'seg-1', segmentLabel: 'Odcinek A' };
    snapshotState.error = null;
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    navigateToSldMock.mockReset();
  });

  afterEach(() => cleanup());

  it('wstawia łącznik na odcinku (operacja domenowa, insert_at RATIO)', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorLacznikaSekcyjnego />);
    await pick();

    await userEvent.click(screen.getByTestId('mvd-kreator-lacznik-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'insert_section_switch_sn',
        expect.objectContaining({
          segment_id: 'seg-1',
          insert_at: { mode: 'RATIO', value: 0.5 },
          normal_state: 'closed',
          catalog_binding: expect.objectContaining({ catalog_namespace: 'APARAT_SN', catalog_item_id: 'app-1' }),
        }),
      );
    });
    expect(closeFormMock).toHaveBeenCalled();
  });

  it('ustawia stan otwarty (NOP) i wysyła go w payloadzie', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorLacznikaSekcyjnego />);
    await pick();
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-lacznik-stan'), 'open');
    await userEvent.click(screen.getByTestId('mvd-kreator-lacznik-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'insert_section_switch_sn',
        expect.objectContaining({ normal_state: 'open' }),
      );
    });
  });

  it('uczciwy stan zerowy: bez odcinka zapis zablokowany', async () => {
    context = {};
    render(<KreatorLacznikaSekcyjnego />);
    expect(screen.getByTestId('mvd-kreator-lacznik-brak')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-kreator-lacznik-zapisz')).toBeDisabled();
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('blokuje zapis bez aktywnego zakresu obliczeń', async () => {
    appState.activeCaseId = null;
    render(<KreatorLacznikaSekcyjnego />);
    await pick();
    expect(screen.getByTestId('mvd-kreator-lacznik-zapisz')).toBeDisabled();
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });
});
