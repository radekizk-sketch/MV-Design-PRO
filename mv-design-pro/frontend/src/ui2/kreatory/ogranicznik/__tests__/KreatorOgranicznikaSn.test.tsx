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

// `vi.hoisted` + `vi.fn()` (S9-5): pozwala nadpisać implementację per test
// (`mockReturnValueOnce`), żeby symulować katalog W TRAKCIE ładowania.
const OGR_24 = {
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
};
const OGR_12 = { ...OGR_24, id: 'arrester-12kv', name: 'Ogranicznik 12 kV', u_m_kv: 12, mcov_kv: 10, bil_protected_kv: 75 };

const { fetchSurgeArresterTypesMock } = vi.hoisted(() => ({
  fetchSurgeArresterTypesMock: vi.fn(),
}));

vi.mock('../../../../ui/catalog/api', () => ({
  getCatalogErrorMessage: () => 'błąd katalogu',
  fetchSurgeArresterTypes: () => fetchSurgeArresterTypesMock(),
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
    fetchSurgeArresterTypesMock.mockReset();
    fetchSurgeArresterTypesMock.mockImplementation(() => Promise.resolve([OGR_24, OGR_12]));
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

  // Intencja dawnego „uczciwego stanu zerowego”: bez miejsca operacja nie rusza — teraz
  // przez jedno wskazanie przy próbie zapisu (kontrakt prowadzenia projektanta).
  it('bez pola/szyny: próba zapisu nazywa brak miejsca, operacja nie rusza', async () => {
    context = {};
    render(<KreatorOgranicznikaSn />);
    await screen.findByRole('option', { name: /ABB POLIM-D/ });
    expect(screen.getByTestId('mvd-kreator-ogranicznik-brak-miejsca')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('mvd-kreator-ogranicznik-zapisz'));
    expect(screen.getByTestId('mvd-kreator-wskazanie').textContent).toMatch(/Zaznacz na schemacie pole SN/);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('świeży kreator: bez alertu i bez czerwieni; próba zapisu wskazuje typ z celem', async () => {
    render(<KreatorOgranicznikaSn />);
    await screen.findByRole('option', { name: /ABB POLIM-D/ });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByTestId('mvd-kreator-ogranicznik-gotowosc').querySelector('[data-stan="konflikt"]')).toBeNull();
    await userEvent.click(screen.getByTestId('mvd-kreator-ogranicznik-zapisz'));
    expect(screen.getByTestId('mvd-kreator-ogranicznik-katalog')).toHaveFocus();
    expect(screen.getByTestId('mvd-kreator-wskazanie').textContent).toMatch(/^Wybierz typ ogranicznika przepięć z katalogu — /);
  });

  it('szyna 15 kV: jedyny ogranicznik o U_m ≥ 15 kV stoi w polu i daje się zmienić', async () => {
    context = { bus_ref: 'B1', bus_name: 'Szyna SN', bus_voltage_kv: 15 };
    render(<KreatorOgranicznikaSn />);
    await waitFor(() =>
      expect(screen.getByTestId('mvd-kreator-ogranicznik-katalog')).toHaveValue('arrester-abb-polim-d-24kv-10ka'),
    );
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-ogranicznik-katalog'), '');
    expect(screen.getByTestId('mvd-kreator-ogranicznik-katalog')).toHaveValue('');
  });

  it('konflikt widoczny od razu: U_m 12 kV na szynie 15 kV', async () => {
    context = { bus_ref: 'B1', bus_name: 'Szyna SN', bus_voltage_kv: 15 };
    render(<KreatorOgranicznikaSn />);
    await screen.findByRole('option', { name: /Ogranicznik 12 kV/ });
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-ogranicznik-katalog'), 'arrester-12kv');
    expect(screen.getByRole('alert').textContent).toMatch(/U_m ogranicznika jest niższe/);
    expect(
      screen.getByTestId('mvd-kreator-ogranicznik-gotowosc').querySelector('[data-stan="konflikt"]'),
    ).not.toBeNull();
  });

  /**
   * S9-5 (`karta_e2e_s95.md`, klasa: bramka enable bez sygnału gotowości) —
   * TEN SAM mechanizm jak w `KreatorMagistralaSn.tsx`, powtórzony w tym pliku:
   * `zapisZablokowany` nie sprawdzał, czy katalog ograniczników już doszedł.
   */
  it('iloczyn cech: katalog jeszcze się ładuje × miejsce dostępne → zapis zablokowany z komunikatem', async () => {
    fetchSurgeArresterTypesMock.mockReturnValueOnce(new Promise(() => {}));
    render(<KreatorOgranicznikaSn />);

    expect(screen.getByTestId('mvd-kreator-ogranicznik-zapisz')).toBeDisabled();
    expect(screen.getByTestId('mvd-kreator-ogranicznik')).toHaveAttribute('data-status', 'ladowanie');
    expect(screen.getByTestId('mvd-kreator-blokada').textContent).toMatch(/katalogu/);
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
