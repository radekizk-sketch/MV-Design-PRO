/**
 * Testy kreatora „Źródło dyspozycyjne nN (agregat / UPS)" — realna ścieżka, Zero-Debt §5.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KreatorZrodloDyspozycyjne } from '../KreatorZrodloDyspozycyjne';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const navigateToSldMock = vi.fn();
const selectElementMock = vi.fn();
const centerMock = vi.fn();

const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };
let activeForm: { op: string; context: Record<string, unknown> } | null = { op: 'add_genset_nn', context: {} };
const snapshotState = { error: null as string | null, executeDomainOperation: executeDomainOperationMock, snapshot: {} };

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
  useActiveOperationForm: () => activeForm,
}));

vi.mock('../../../../ui/navigation/routes', () => ({
  navigateToSld: () => navigateToSldMock(),
}));

vi.mock('../../../../ui/selection', () => ({
  useSelectionStore: (selector: (s: { selectElement: typeof selectElementMock; centerSldOnElement: typeof centerMock }) => unknown) =>
    selector({ selectElement: selectElementMock, centerSldOnElement: centerMock }),
}));

vi.mock('../../../../ui/network-build/forms/enmResolvers', () => ({
  resolveStationRef: () => 'st-1',
  stationLabel: () => 'Stacja A',
  resolveBusNnRef: () => 'bus-nn',
  listNnBusOptions: () => [{ ref_id: 'bus-nn', name: 'Szyna nN', voltage_kv: 0.4 }],
  listNnSourceFieldOptions: () => [],
}));

// `vi.hoisted` + `vi.fn()` (S9-5): pozwala nadpisać implementację per test
// (`mockReturnValueOnce`), żeby symulować katalog W TRAKCIE ładowania.
const { fetchSourceSystemTypesMock, fetchLvApparatusTypesMock } = vi.hoisted(() => ({
  fetchSourceSystemTypesMock: vi.fn(() =>
    Promise.resolve([{ id: 'gs-1', name: 'Agregat 250 kVA', voltage_rating_kv: 0.4, sk3_mva: 2 }]),
  ),
  fetchLvApparatusTypesMock: vi.fn(() =>
    Promise.resolve([{ id: 'lv-1', name: 'Wyłącznik nN', u_n_kv: 0.4, i_n_a: 400, device_kind: 'WYLACZNIK' }]),
  ),
}));

vi.mock('../../../../ui/catalog/api', () => ({
  getCatalogErrorMessage: () => 'błąd katalogu',
  fetchSourceSystemTypes: () => fetchSourceSystemTypesMock(),
  fetchLvApparatusTypes: () => fetchLvApparatusTypesMock(),
}));

describe('KreatorZrodloDyspozycyjne — realna ścieżka (agregat)', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    activeForm = { op: 'add_genset_nn', context: {} };
    snapshotState.error = null;
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    navigateToSldMock.mockReset();
    selectElementMock.mockReset();
    centerMock.mockReset();
    fetchSourceSystemTypesMock.mockClear();
    fetchLvApparatusTypesMock.mockClear();
  });

  afterEach(() => cleanup());

  it('dodaje agregat: nowe pole + genset_spec i wiąże selekcję (klik Dalej + zapis)', async () => {
    executeDomainOperationMock.mockResolvedValue({
      error: null,
      selection_hint: { element_id: 'gen/3', element_type: 'generator' },
    });
    render(<KreatorZrodloDyspozycyjne />);

    // Krok 1: pole przyłączeniowe (nowe)
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-zrodlo-dysp-aparat')).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-zrodlo-dysp-aparat'), 'WYLACZNIK');
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-zrodlo-dysp-stan'), 'ZAMKNIETY');
    await userEvent.type(screen.getByTestId('mvd-kreator-zrodlo-dysp-napiecie-nn'), '0.4');

    // Krok 2: parametry agregatu
    await userEvent.click(screen.getByTestId('mvd-kreator-zrodlo-dysp-dalej'));
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-zrodlo-dysp-katalog')).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-zrodlo-dysp-katalog'), 'gs-1');
    await userEvent.type(screen.getByTestId('mvd-kreator-zrodlo-dysp-moc'), '250');
    await userEvent.type(screen.getByTestId('mvd-kreator-zrodlo-dysp-napiecie'), '0.4');
    await userEvent.type(screen.getByTestId('mvd-kreator-zrodlo-dysp-cosfi'), '0.8');
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-zrodlo-dysp-tryb-genset'), 'PRACA_AWARYJNA');

    await userEvent.click(screen.getByTestId('mvd-kreator-zrodlo-dysp-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_genset_nn',
        expect.objectContaining({
          bus_nn_ref: 'bus-nn',
          station_ref: 'st-1',
          placement: 'NEW_FIELD',
          genset_spec: expect.objectContaining({ catalog_item_id: 'gs-1', rated_power_kw: 250, power_factor: 0.8 }),
        }),
      );
    });
    expect(closeFormMock).toHaveBeenCalled();
    expect(selectElementMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'gen/3', type: 'Generator' }));
  });

  it('panel teorii (wkład zwarciowy maszyny synchronicznej) renderuje wzory przez KaTeX', async () => {
    render(<KreatorZrodloDyspozycyjne />);
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-zrodlo-dysp-aparat')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('mvd-kreator-zrodlo-dysp-dalej'));
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-zrodlo-dysp-teoria')).toBeInTheDocument());
    const wzory = screen.getAllByTestId('math-rendered');
    expect(wzory.length).toBeGreaterThanOrEqual(2);
    const latexy = wzory.map((w) => w.getAttribute('data-latex') ?? '');
    expect(latexy.some((l) => l.includes("X_d''") || l.includes("I_k''"))).toBe(true);
    expect(screen.queryByTestId('math-fallback')).toBeNull();
  });

  it('walidacja blokuje niekompletny zapis (brak katalogu/mocy)', async () => {
    render(<KreatorZrodloDyspozycyjne />);
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-zrodlo-dysp-aparat')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('mvd-kreator-zrodlo-dysp-zapisz'));
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
    expect((await screen.findAllByText(/Uzupełnij wymagane pola, aby zapisać źródło\./)).length).toBeGreaterThan(0);
  });

  /**
   * S9-5 (`karta_e2e_s95.md`, klasa: bramka enable bez sygnału gotowości) —
   * TEN SAM mechanizm jak w `KreatorMagistralaSn.tsx`, powtórzony w tym pliku:
   * `zapisMozliwy` nie sprawdzał, czy katalogi (system źródła + aparat nN)
   * już doszły.
   */
  it('iloczyn cech: katalog jeszcze się ładuje × szyna nN dostępna → zapis zablokowany z komunikatem', async () => {
    fetchSourceSystemTypesMock.mockReturnValueOnce(new Promise(() => {}));
    fetchLvApparatusTypesMock.mockReturnValueOnce(new Promise(() => {}));
    render(<KreatorZrodloDyspozycyjne />);

    await waitFor(() => {
      expect(screen.getByTestId('mvd-kreator-zrodlo-dysp')).toHaveAttribute('data-status', 'ladowanie');
    });
    expect(screen.getByTestId('mvd-kreator-zrodlo-dysp-zapisz')).toBeDisabled();
    expect(screen.getByTestId('mvd-kreator-walidacja').textContent).toMatch(/[Łł]adowanie katalogu/);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });
});

describe('KreatorZrodloDyspozycyjne — UPS', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    activeForm = { op: 'add_ups_nn', context: {} };
    executeDomainOperationMock.mockReset();
    closeFormMock.mockReset();
  });
  afterEach(() => cleanup());

  it('dodaje UPS: ups_spec z czasem podtrzymania i trybem', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorZrodloDyspozycyjne />);
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-zrodlo-dysp-aparat')).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-zrodlo-dysp-aparat'), 'WYLACZNIK');
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-zrodlo-dysp-stan'), 'ZAMKNIETY');
    await userEvent.type(screen.getByTestId('mvd-kreator-zrodlo-dysp-napiecie-nn'), '0.4');

    await userEvent.click(screen.getByTestId('mvd-kreator-zrodlo-dysp-dalej'));
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-zrodlo-dysp-katalog')).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-zrodlo-dysp-katalog'), 'gs-1');
    await userEvent.type(screen.getByTestId('mvd-kreator-zrodlo-dysp-moc'), '100');
    await userEvent.type(screen.getByTestId('mvd-kreator-zrodlo-dysp-backup'), '15');
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-zrodlo-dysp-tryb-ups'), 'ONLINE');

    await userEvent.click(screen.getByTestId('mvd-kreator-zrodlo-dysp-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_ups_nn',
        expect.objectContaining({
          ups_spec: expect.objectContaining({ backup_time_min: 15, operation_mode: 'ONLINE' }),
        }),
      );
    });
  });
});
