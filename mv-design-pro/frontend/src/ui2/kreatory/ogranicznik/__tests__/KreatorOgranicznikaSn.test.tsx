/**
 * Testy kreatora „Dodaj ogranicznik przepięć SN" (G-STK-8) — realna ścieżka
 * użytkownika (render → wybór katalogu → natywny zapis → operacja domenowa).
 * Mockowane tylko store'y i końcówka katalogu — nie sam ekran.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KreatorOgranicznikaSn } from '../KreatorOgranicznikaSn';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const navigateToSldMock = vi.fn();

const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };
let context: Record<string, unknown> = { field_ref: 'POLE-IN', field_name: 'Pole liniowe' };
const snapshotState = { error: null as string | null, executeDomainOperation: executeDomainOperationMock };
const selectionState = { selectedElements: [] as unknown[], selectElement: vi.fn() };

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

vi.mock('../../../../ui/selection', () => ({
  useSelectionStore: (selector: (s: typeof selectionState) => unknown) => selector(selectionState),
}));

vi.mock('../../../../ui/navigation/routes', () => ({
  navigateToSld: () => navigateToSldMock(),
}));

vi.mock('../../../../ui/catalog/api', () => ({
  getCatalogErrorMessage: () => 'błąd katalogu',
  fetchSurgeArresterTypes: () =>
    Promise.resolve([
      {
        id: 'arrester-abb-polim-d-24kv-10ka',
        name: 'ABB POLIM-D 24 kV 10 kA',
        u_m_kv: 24,
        mcov_kv: 20.4,
        u_rated_kv: 24,
        u_residual_at_10ka_kv: 75,
        tov_10s_kv: 28.8,
        energy_class: 2,
        energy_absorption_kj_per_kv: 4,
        bil_protected_kv: 125,
      },
    ]),
}));

async function pickType() {
  await waitFor(() => {
    expect(screen.getByTestId('mvd-kreator-ogranicznik-katalog')).toBeInTheDocument();
  });
  await userEvent.selectOptions(
    screen.getByTestId('mvd-kreator-ogranicznik-katalog'),
    'arrester-abb-polim-d-24kv-10ka',
  );
}

describe('KreatorOgranicznikaSn — realna ścieżka', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    context = { field_ref: 'POLE-IN', field_name: 'Pole liniowe' };
    snapshotState.error = null;
    selectionState.selectedElements = [];
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    navigateToSldMock.mockReset();
  });

  afterEach(() => cleanup());

  it('stawia ogranicznik w polu SN z katalogu (operacja domenowa)', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorOgranicznikaSn />);
    await pickType();

    await userEvent.click(screen.getByTestId('mvd-kreator-ogranicznik-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_surge_arrester_sn',
        expect.objectContaining({
          field_ref: 'POLE-IN',
          catalog_binding: expect.objectContaining({
            catalog_namespace: 'OGRANICZNIK_SN',
            catalog_item_id: 'arrester-abb-polim-d-24kv-10ka',
          }),
        }),
      );
    });
    expect(closeFormMock).toHaveBeenCalled();
  });

  it('panel teorii renderuje margines koordynacji BIL ≥ U_res przez KaTeX (math-rendered)', async () => {
    // Zasada wywodów KaTeX (2026-07-22): relacja symboliczna w wymogu teorii
    // renderuje KaTeX, nie surowy tekst.
    render(<KreatorOgranicznikaSn />);
    await pickType();
    const wzory = screen.getAllByTestId('math-rendered');
    expect(wzory.length).toBeGreaterThanOrEqual(1);
    expect(
      wzory.some((w) => (w.getAttribute('data-latex') ?? '').includes('\\mathrm{BIL} \\ge U_{\\mathrm{res}}')),
    ).toBe(true);
    expect(screen.queryByTestId('math-fallback')).toBeNull();
  });

  it('uczciwy stan zerowy: bez pola/szyny zapis jest zablokowany', async () => {
    context = {};
    render(<KreatorOgranicznikaSn />);
    // Montaż pobiera katalog ograniczników (mikrotaski) — czekamy na realny
    // stan końcowy UI (opcja typu w selekcie katalogu), żeby aktualizacja
    // stanu domknęła się w act.
    await screen.findByRole('option', { name: /ABB POLIM-D/ });
    expect(screen.getByTestId('mvd-kreator-ogranicznik-brak-miejsca')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-kreator-ogranicznik-zapisz')).toBeDisabled();
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('rozwiązuje pole z selekcji (BaySN), gdy kontekst pusty', async () => {
    context = {};
    selectionState.selectedElements = [{ id: 'POLE-SEL', type: 'BaySN', name: 'Pole z selekcji' }];
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorOgranicznikaSn />);
    await pickType();

    await userEvent.click(screen.getByTestId('mvd-kreator-ogranicznik-zapisz'));
    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_surge_arrester_sn',
        expect.objectContaining({ field_ref: 'POLE-SEL' }),
      );
    });
  });
});
