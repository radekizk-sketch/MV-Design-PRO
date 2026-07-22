/**
 * Testy kreatora „Dodaj odbiór nN" — realna ścieżka użytkownika, Zero-Debt §5.
 * Mockowane tylko store'y i końcówki API.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KreatorOdbioruNn } from '../KreatorOdbioruNn';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const navigateToSldMock = vi.fn();

const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };
let context: Record<string, unknown> = { feeder_ref: 'feeder-1', bus_nn_ref: 'bus-nn', bus_voltage_kv: 0.4 };
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
  fetchLoadTypes: () =>
    Promise.resolve([
      { id: 'L1', name: 'Odbiór biurowy', model: 'pq', p_kw: 80, q_kvar: 30, cos_phi: 0.94, cos_phi_mode: 'fixed' },
    ]),
}));

vi.mock('../../../../ui/network-build/forms/cableVoltageDropApi', () => ({
  fetchCableRatedCurrent: () =>
    Promise.resolve({ rated_current_a: 80.2, apparent_power_kva: 55.6, formula_ref: 'I=S/(√3U)', assumptions: [] }),
}));

async function fill() {
  await waitFor(() => {
    expect(screen.getByTestId('mvd-kreator-odbior-moc')).toBeInTheDocument();
  });
}

describe('KreatorOdbioruNn — realna ścieżka', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    context = { feeder_ref: 'feeder-1', bus_nn_ref: 'bus-nn', bus_voltage_kv: 0.4 };
    snapshotState.error = null;
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    navigateToSldMock.mockReset();
  });

  afterEach(() => cleanup());

  it('tworzy odbiór z P + cosφ (Q wyprowadzi backend)', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorOdbioruNn />);
    await fill();

    await userEvent.click(screen.getByTestId('mvd-kreator-odbior-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_nn_load',
        expect.objectContaining({
          feeder_ref: 'feeder-1',
          bus_nn_ref: 'bus-nn',
          active_power_kw: 50,
          cos_phi: 0.93,
          load_kind: 'SKUPIONY',
        }),
      );
    });
    const payload = executeDomainOperationMock.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('reactive_power_kvar');
    expect(closeFormMock).toHaveBeenCalled();
  });

  it('panel teorii renderuje wzory przez KaTeX (math-rendered), bez surowego tekstu', async () => {
    // Zasada wywodów KaTeX (2026-07-22): Q = P·tan(arccos cosφ) w teorii i pod
    // wykresem trójkąta mocy musi renderować KaTeX, nie surowy string.
    render(<KreatorOdbioruNn />);
    await fill();
    const wzory = screen.getAllByTestId('math-rendered');
    expect(wzory.length).toBeGreaterThanOrEqual(2);
    expect(
      wzory.some((w) => (w.getAttribute('data-latex') ?? '').includes('\\tan(\\arccos\\cos\\varphi)')),
    ).toBe(true);
    expect(screen.queryByTestId('math-fallback')).toBeNull();
  });

  it('uczciwy stan zerowy: bez odpływu zapis zablokowany', async () => {
    context = {};
    render(<KreatorOdbioruNn />);
    // Montaż pobiera katalog typów odbioru (mikrotaski) — czekamy na realny
    // stan końcowy UI (opcja typu w selekcie katalogu), żeby aktualizacja
    // stanu domknęła się w act.
    await screen.findByRole('option', { name: /Odbiór biurowy/ });
    expect(screen.getByTestId('mvd-kreator-odbior-brak')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-kreator-odbior-zapisz')).toBeDisabled();
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('blokuje zapis bez aktywnego zakresu obliczeń', async () => {
    appState.activeCaseId = null;
    render(<KreatorOdbioruNn />);
    await fill();
    expect(screen.getByTestId('mvd-kreator-odbior-zapisz')).toBeDisabled();
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });
});
