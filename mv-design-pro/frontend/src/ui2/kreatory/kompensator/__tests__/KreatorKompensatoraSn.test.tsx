/**
 * Testy kreatora „Dodaj baterię kondensatorów SN" — realna ścieżka użytkownika
 * (render → wybór katalogu → natywny zapis → operacja domenowa), Zero-Debt §5.
 * Mockowane są tylko store'y i końcówki API — nie sam ekran.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KreatorKompensatoraSn } from '../KreatorKompensatoraSn';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const navigateToSldMock = vi.fn();

const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };
let context: Record<string, unknown> = {
  bus_ref: 'bus-sn-1',
  bus_name: 'Szyna SN GPZ',
  bus_voltage_kv: 15,
};
const snapshotState = { error: null as string | null, executeDomainOperation: executeDomainOperationMock };
const selectionState = { selectedElements: [] as unknown[] };

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
const { fetchShuntCapacitorTypesMock } = vi.hoisted(() => ({
  fetchShuntCapacitorTypesMock: vi.fn(() =>
    Promise.resolve([
      { id: 'KOMP_SN_1V2_15KV', name: 'Bateria 1,2 Mvar 15 kV', rated_mvar: 1.2, rated_kv: 15, loss_kw: 0.6 },
    ]),
  ),
}));

vi.mock('../../../../ui/catalog/api', () => ({
  getCatalogErrorMessage: () => 'błąd katalogu',
  fetchShuntCapacitorTypes: () => fetchShuntCapacitorTypesMock(),
}));

vi.mock('../../../../ui/network-build/forms/shuntCompensatorPreviewApi', () => ({
  fetchShuntCompensatorPreview: () =>
    Promise.resolve({
      rated_mvar: 1.2,
      rated_kv: 15,
      reactive_power_var: 1_200_000,
      susceptance_siemens: 0.00533,
      rated_current_a: 46.2,
      formula_ref: 'B = Q/U²',
    }),
}));

async function pickType() {
  await waitFor(() => {
    expect(screen.getByTestId('mvd-kreator-kompensator-katalog')).toBeInTheDocument();
  });
  await userEvent.selectOptions(screen.getByTestId('mvd-kreator-kompensator-katalog'), 'KOMP_SN_1V2_15KV');
}

describe('KreatorKompensatoraSn — realna ścieżka', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    context = { bus_ref: 'bus-sn-1', bus_name: 'Szyna SN GPZ', bus_voltage_kv: 15 };
    snapshotState.error = null;
    selectionState.selectedElements = [];
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    navigateToSldMock.mockReset();
    fetchShuntCapacitorTypesMock.mockClear();
  });

  afterEach(() => cleanup());

  it('tworzy baterię na szynie SN z katalogu (operacja domenowa)', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorKompensatoraSn />);
    await pickType();

    await userEvent.click(screen.getByTestId('mvd-kreator-kompensator-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_shunt_compensator_sn',
        expect.objectContaining({
          bus_ref: 'bus-sn-1',
          status: 'closed',
          catalog_binding: expect.objectContaining({
            catalog_namespace: 'KOMPENSATOR_SN',
            catalog_item_id: 'KOMP_SN_1V2_15KV',
          }),
        }),
      );
    });
    expect(closeFormMock).toHaveBeenCalled();
  });

  it('panel teorii renderuje wzory Q(U) przez KaTeX (math-rendered)', async () => {
    // Zasada wywodów KaTeX (2026-07-22): Q = U²·2πf·C oraz Q ∝ U² w teorii
    // renderuje KaTeX, nie surowy tekst.
    render(<KreatorKompensatoraSn />);
    await pickType();
    const wzory = screen.getAllByTestId('math-rendered');
    expect(wzory.length).toBeGreaterThanOrEqual(2);
    expect(wzory.some((w) => (w.getAttribute('data-latex') ?? '').includes('\\propto U^2'))).toBe(true);
    expect(screen.queryByTestId('math-fallback')).toBeNull();
  });

  it('uczciwy stan zerowy: bez szyny zapis jest zablokowany', async () => {
    context = {};
    render(<KreatorKompensatoraSn />);
    // Montaż pobiera katalog baterii (mikrotaski) — czekamy na realny stan
    // końcowy UI (opcja typu w selekcie katalogu), żeby aktualizacja stanu
    // domknęła się w act.
    await screen.findByRole('option', { name: /Bateria 1,2 Mvar 15 kV/ });
    expect(screen.getByTestId('mvd-kreator-kompensator-brak-szyny')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-kreator-kompensator-zapisz')).toBeDisabled();
    expect(screen.getByTestId('mvd-kreator-kompensator')).toHaveAttribute('data-status', 'zablokowany');
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('blokuje zapis bez aktywnego zakresu obliczeń', async () => {
    appState.activeCaseId = null;
    render(<KreatorKompensatoraSn />);
    await pickType();
    expect(screen.getByTestId('mvd-kreator-kompensator-zapisz')).toBeDisabled();
    expect(screen.getByTestId('mvd-kreator-kompensator')).toHaveAttribute('data-status', 'zablokowany');
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  /**
   * S9-5 (`karta_e2e_s95.md`, klasa: bramka enable bez sygnału gotowości) —
   * TEN SAM mechanizm jak w `KreatorMagistralaSn.tsx`, powtórzony w tym pliku:
   * `zapisZablokowany` nie sprawdzał, czy katalog baterii już doszedł.
   */
  it('iloczyn cech: katalog jeszcze się ładuje × szyna dostępna → zapis zablokowany z komunikatem', async () => {
    fetchShuntCapacitorTypesMock.mockReturnValueOnce(new Promise(() => {}));
    render(<KreatorKompensatoraSn />);

    expect(screen.getByTestId('mvd-kreator-kompensator-zapisz')).toBeDisabled();
    expect(screen.getByTestId('mvd-kreator-kompensator')).toHaveAttribute('data-status', 'ladowanie');
    expect(screen.getByTestId('mvd-kreator-walidacja').textContent).toMatch(/[Łł]adowanie katalogu/);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('rozwiązuje szynę z selekcji, gdy kontekst operacji jest pusty', async () => {
    context = {};
    selectionState.selectedElements = [{ id: 'bus-sel-9', type: 'Bus', name: 'Szyna z selekcji' }];
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorKompensatoraSn />);
    await pickType();

    await userEvent.click(screen.getByTestId('mvd-kreator-kompensator-zapisz'));
    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_shunt_compensator_sn',
        expect.objectContaining({ bus_ref: 'bus-sel-9' }),
      );
    });
  });
});
