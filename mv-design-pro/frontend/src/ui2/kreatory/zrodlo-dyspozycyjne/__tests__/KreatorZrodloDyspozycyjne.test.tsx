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

const resolverState: { busRef: string | null; szyny: Array<{ ref_id: string; name: string; voltage_kv: number }> } = {
  busRef: 'bus-nn',
  szyny: [{ ref_id: 'bus-nn', name: 'Szyna nN', voltage_kv: 0.4 }],
};

vi.mock('../../../../ui/network-build/forms/enmResolvers', () => ({
  resolveStationRef: () => 'st-1',
  stationLabel: () => 'Stacja A',
  resolveBusNnRef: () => resolverState.busRef,
  listNnBusOptions: () => resolverState.szyny,
  listNnSourceFieldOptions: () => [],
}));

// `vi.hoisted` + `vi.fn()` (S9-5): pozwala nadpisać implementację per test
// (`mockReturnValueOnce`), żeby symulować katalog W TRAKCIE ładowania. Katalogu zasilań
// systemowych (GPZ) kreator już nie pobiera — to inna dziedzina niż agregat/UPS.
const { fetchSourceSystemTypesMock, fetchLvApparatusTypesMock } = vi.hoisted(() => ({
  fetchSourceSystemTypesMock: vi.fn(() => Promise.resolve([])),
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
    resolverState.busRef = 'bus-nn';
    resolverState.szyny = [{ ref_id: 'bus-nn', name: 'Szyna nN', voltage_kv: 0.4 }];
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
    // Napięcie nN pola z szyny przyłączenia (topologia) stoi w polu jak zwykła wartość.
    expect(screen.getByTestId('mvd-kreator-zrodlo-dysp-napiecie-nn')).toHaveValue(0.4);
    expect(screen.queryByText(/przyjęto/)).toBeNull();

    // Krok 2: parametry agregatu
    await userEvent.click(screen.getByTestId('mvd-kreator-zrodlo-dysp-dalej'));
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-zrodlo-dysp-moc')).toBeInTheDocument());
    expect(screen.queryByTestId('mvd-kreator-zrodlo-dysp-katalog')).toBeNull();
    await userEvent.type(screen.getByTestId('mvd-kreator-zrodlo-dysp-moc'), '250');
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
          genset_spec: expect.objectContaining({ rated_power_kw: 250, rated_voltage_kv: 0.4, power_factor: 0.8 }),
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

  // Intencja dawnego „walidacja blokuje niekompletny zapis”: operacja nie wychodzi bez
  // danych — w nowym kanonie przez JEDNO wskazanie pierwszego brakującego parametru.
  it('świeży kreator: zero alertów; zapis wskazuje aparat pola, potem moc na kroku parametrów', async () => {
    render(<KreatorZrodloDyspozycyjne />);
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-zrodlo-dysp-zapisz')).toBeEnabled());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByTestId('mvd-kreator-zrodlo-dysp-gotowosc').querySelector('[data-stan="konflikt"]')).toBeNull();
    await userEvent.click(screen.getByTestId('mvd-kreator-zrodlo-dysp-zapisz'));
    expect(screen.getByTestId('mvd-kreator-zrodlo-dysp-aparat')).toHaveFocus();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByTestId('mvd-kreator-wskazanie').textContent).toBe(
      'Wybierz aparat pola przyłączeniowego — odłącza źródło od szyny nN.',
    );
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-zrodlo-dysp-aparat'), 'WYLACZNIK');
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-zrodlo-dysp-stan'), 'ZAMKNIETY');
    await userEvent.click(screen.getByTestId('mvd-kreator-zrodlo-dysp-zapisz'));
    expect(screen.getByTestId('mvd-kreator-krok-parametry')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByTestId('mvd-kreator-zrodlo-dysp-moc')).toHaveFocus();
    expect(screen.getByTestId('mvd-kreator-wskazanie').textContent).toMatch(/^Podaj moc znamionową źródła — /);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('konflikt widoczny od razu przy polu: cos φ > 1', async () => {
    render(<KreatorZrodloDyspozycyjne />);
    await userEvent.click(screen.getByTestId('mvd-kreator-zrodlo-dysp-dalej'));
    await userEvent.type(screen.getByTestId('mvd-kreator-zrodlo-dysp-cosfi'), '1.2');
    expect(screen.getByRole('alert').textContent).toBe('Współczynnik mocy musi leżeć w przedziale (0; 1].');
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-zrodlo-dysp-zapisz')).toBeEnabled());
  });

  it('szyna z kontekstu stoi w polu; projektant zmienia ją na inną, automat nie nadpisuje', async () => {
    resolverState.szyny = [
      { ref_id: 'bus-nn', name: 'Szyna nN', voltage_kv: 0.4 },
      { ref_id: 'bus-nn-2', name: 'Szyna nN II', voltage_kv: 0.4 },
    ];
    render(<KreatorZrodloDyspozycyjne />);
    expect(screen.getByTestId('mvd-kreator-zrodlo-dysp-szyna')).toHaveValue('bus-nn');
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-zrodlo-dysp-szyna'), 'bus-nn-2');
    expect(screen.getByTestId('mvd-kreator-zrodlo-dysp-szyna')).toHaveValue('bus-nn-2');
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-zrodlo-dysp-zapisz')).toBeEnabled());
  });

  it('kilka szyn nN bez wskazania: kreator nie zgaduje pierwszej, zapis wskazuje szynę', async () => {
    resolverState.busRef = null;
    resolverState.szyny = [
      { ref_id: 'bus-nn', name: 'Szyna nN', voltage_kv: 0.4 },
      { ref_id: 'bus-nn-2', name: 'Szyna nN II', voltage_kv: 0.4 },
    ];
    render(<KreatorZrodloDyspozycyjne />);
    expect((screen.getByTestId('mvd-kreator-zrodlo-dysp-szyna') as HTMLSelectElement).value).toBe('');
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-zrodlo-dysp-zapisz')).toBeEnabled());
    await userEvent.click(screen.getByTestId('mvd-kreator-zrodlo-dysp-zapisz'));
    expect(screen.getByTestId('mvd-kreator-zrodlo-dysp-szyna')).toHaveFocus();
    expect(screen.getByTestId('mvd-kreator-wskazanie').textContent).toMatch(/^Wybierz szynę nN przyłączenia — /);
  });

  it('jedyna szyna nN stacji bez wskazania: stoi w polu', async () => {
    resolverState.busRef = null;
    render(<KreatorZrodloDyspozycyjne />);
    expect(screen.getByTestId('mvd-kreator-zrodlo-dysp-szyna')).toHaveValue('bus-nn');
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-zrodlo-dysp-zapisz')).toBeEnabled());
  });

  it('bez aktywnego przypadku: kompletny zapis wskazuje przypadek, operacja nie wychodzi', async () => {
    appState.activeCaseId = null;
    activeForm = { op: 'add_ups_nn', context: {} };
    render(<KreatorZrodloDyspozycyjne />);
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-zrodlo-dysp-aparat'), 'WYLACZNIK');
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-zrodlo-dysp-stan'), 'ZAMKNIETY');
    await userEvent.click(screen.getByTestId('mvd-kreator-zrodlo-dysp-dalej'));
    await userEvent.type(screen.getByTestId('mvd-kreator-zrodlo-dysp-moc'), '100');
    await userEvent.type(screen.getByTestId('mvd-kreator-zrodlo-dysp-backup'), '15');
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-zrodlo-dysp-tryb-ups'), 'ONLINE');
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-zrodlo-dysp-zapisz')).toBeEnabled());
    await userEvent.click(screen.getByTestId('mvd-kreator-zrodlo-dysp-zapisz'));
    expect(screen.getByTestId('mvd-kreator-wskazanie').textContent).toMatch(/aktywny przypadek/);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  /**
   * S9-5 (`karta_e2e_s95.md`, klasa: bramka enable bez sygnału gotowości) —
   * TEN SAM mechanizm jak w `KreatorMagistralaSn.tsx`, powtórzony w tym pliku:
   * `zapisMozliwy` nie sprawdzał, czy katalogi (system źródła + aparat nN)
   * już doszły.
   */
  it('iloczyn cech: katalog aparatów nN jeszcze się ładuje × szyna nN dostępna → zapis wyszarzony z jednym zdaniem', async () => {
    fetchLvApparatusTypesMock.mockReturnValueOnce(new Promise(() => {}));
    render(<KreatorZrodloDyspozycyjne />);

    await waitFor(() => {
      expect(screen.getByTestId('mvd-kreator-zrodlo-dysp')).toHaveAttribute('data-status', 'ladowanie');
    });
    expect(screen.getByTestId('mvd-kreator-zrodlo-dysp-zapisz')).toBeDisabled();
    expect(screen.getByTestId('mvd-kreator-blokada').textContent).toMatch(/Wczytywanie katalogu/);
    expect(fetchSourceSystemTypesMock).not.toHaveBeenCalled();
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

    await userEvent.click(screen.getByTestId('mvd-kreator-zrodlo-dysp-dalej'));
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-zrodlo-dysp-moc')).toBeInTheDocument());
    // UPS nie ma pola napięcia znamionowego agregatu — znacznik dotyczy tylko agregatu.
    expect(screen.queryByTestId('mvd-kreator-zrodlo-dysp-napiecie')).toBeNull();
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
