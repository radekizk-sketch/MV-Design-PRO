/**
 * Testy kreatora „Dodaj transformator SN/nN" — realna ścieżka użytkownika,
 * Zero-Debt §5. Mockowane tylko store'y i końcówki API. Migruje intencję
 * retirowanego AddTransformerForm (kontekst stacji, blokada GPZ) do kanonu ui2.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KreatorTransformatoraSnNn } from '../KreatorTransformatoraSnNn';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const navigateToSldMock = vi.fn();
const selectElementMock = vi.fn();
const centerSldOnElementMock = vi.fn();

const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };
let context: Record<string, unknown> = {
  station_ref: 'st-1',
  hv_bus_ref: 'bus-sn',
  lv_bus_ref: 'bus-nn',
  station_name: 'ST-1',
};
const snapshotState = {
  error: null as string | null,
  executeDomainOperation: executeDomainOperationMock,
  snapshot: {
    buses: [
      { ref_id: 'bus-sn', name: 'Szyna SN', voltage_kv: 15 },
      { ref_id: 'bus-nn', name: 'Szyna nN', voltage_kv: 0.4 },
    ],
  },
};

vi.mock('../../../../ui/app-state', () => ({
  useAppStateStore: (selector: (s: typeof appState) => unknown) => selector(appState),
}));

vi.mock('../../../../ui/topology/snapshotStore', () => {
  const useSnapshotStore = (selector: (s: typeof snapshotState) => unknown) => selector(snapshotState);
  useSnapshotStore.getState = () => snapshotState;
  return {
    useSnapshotStore,
    selectBusOptions: (snap: typeof snapshotState.snapshot | null) =>
      (snap?.buses ?? []).map((b) => ({ ref_id: b.ref_id, name: b.name, voltage_kv: b.voltage_kv })),
  };
});

vi.mock('../../../../ui/network-build/networkBuildStore', () => ({
  useNetworkBuildStore: (selector: (s: { closeOperationForm: typeof closeFormMock }) => unknown) =>
    selector({ closeOperationForm: closeFormMock }),
  useActiveOperationContext: () => context,
}));

vi.mock('../../../../ui/navigation/routes', () => ({
  navigateToSld: () => navigateToSldMock(),
}));

vi.mock('../../../../ui/selection', () => ({
  useSelectionStore: (
    selector: (s: {
      selectElement: typeof selectElementMock;
      centerSldOnElement: typeof centerSldOnElementMock;
    }) => unknown,
  ) => selector({ selectElement: selectElementMock, centerSldOnElement: centerSldOnElementMock }),
}));

// `vi.hoisted` + `vi.fn()` (S9-5): pozwala nadpisać implementację per test
// (`mockReturnValueOnce`), żeby symulować katalog W TRAKCIE ładowania.
const TONR_1000 = {
  id: 'energen-tonr-1000-15-04',
  name: 'TONR 1000',
  rated_power_mva: 1.0,
  voltage_hv_kv: 15,
  voltage_lv_kv: 0.4,
  uk_percent: 6,
  pk_kw: 10,
  i0_percent: 0.5,
  p0_kw: 1.2,
  vector_group: 'Dyn5',
  tap_min: -2,
  tap_max: 2,
  tap_step_percent: 2.5,
};
const TONR_630 = { ...TONR_1000, id: 'tonr-630-15-04', name: 'TONR 630', rated_power_mva: 0.63, tap_min: -4, tap_max: 4, tap_step_percent: 1.25 };
const TONR_20 = { ...TONR_1000, id: 'tonr-630-20-04', name: 'TONR 630 20 kV', voltage_hv_kv: 20 };

const { fetchTransformerTypesMock } = vi.hoisted(() => ({
  fetchTransformerTypesMock: vi.fn((): Promise<unknown[]> => Promise.resolve([])),
}));

vi.mock('../../../../ui/catalog/api', () => ({
  getCatalogErrorMessage: () => 'błąd katalogu',
  fetchTransformerTypes: () => fetchTransformerTypesMock(),
  fetchGrupyPolaczen: () => Promise.resolve(['Dyn5', 'Dyn11', 'Yzn5']),
}));

vi.mock('../../../../ui/network-build/forms/transformerRatedCurrentsApi', () => ({
  fetchTransformerRatedCurrents: () =>
    Promise.resolve({ primary_current_a: 38.5, secondary_current_a: 1443.4, formula_ref: 'I=S/(√3U)', assumptions: [] }),
}));

async function pickType() {
  // Czekamy na OPCJĘ typu, nie na samo pole: pole renderuje się, zanim katalog się wczyta,
  // a pod obciążeniem maszyny wybór przed wczytaniem kończył się „Value … not found in options".
  await waitFor(() => {
    const pole = screen.getByTestId('mvd-kreator-transformator-katalog') as HTMLSelectElement;
    expect(Array.from(pole.options).map((o) => o.value)).toContain('energen-tonr-1000-15-04');
  });
  await userEvent.selectOptions(screen.getByTestId('mvd-kreator-transformator-katalog'), 'energen-tonr-1000-15-04');
}

describe('KreatorTransformatoraSnNn — realna ścieżka', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    context = { station_ref: 'st-1', hv_bus_ref: 'bus-sn', lv_bus_ref: 'bus-nn', station_name: 'ST-1' };
    snapshotState.error = null;
    snapshotState.snapshot = {
      buses: [
        { ref_id: 'bus-sn', name: 'Szyna SN', voltage_kv: 15 },
        { ref_id: 'bus-nn', name: 'Szyna nN', voltage_kv: 0.4 },
      ],
    };
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    navigateToSldMock.mockReset();
    selectElementMock.mockReset();
    centerSldOnElementMock.mockReset();
    fetchTransformerTypesMock.mockReset();
    fetchTransformerTypesMock.mockImplementation(() => Promise.resolve([TONR_1000, TONR_630, TONR_20]));
  });

  afterEach(() => cleanup());

  it('grupa połączeń: pokazuje wartość z katalogu i wysyła tylko jawny wybór ze słownika', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null, selection_hint: null });
    render(<KreatorTransformatoraSnNn />);
    const pole = screen.getByTestId('mvd-kreator-transformator-grupa') as HTMLSelectElement;
    expect(pole).toBeDisabled(); // bez typu z katalogu nie ma czego nadpisywać
    await pickType();
    await waitFor(() => expect(pole).not.toBeDisabled());
    await waitFor(() => {
      expect(Array.from(pole.options).map((o) => o.value)).toEqual(['', 'Dyn5', 'Dyn11', 'Yzn5']);
    });
    expect(pole.options[0].textContent).toContain('Dyn5'); // grupa z rekordu katalogu

    await userEvent.selectOptions(pole, 'Yzn5');
    await userEvent.click(screen.getByTestId('mvd-kreator-transformator-zapisz'));
    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_transformer_sn_nn',
        expect.objectContaining({ vector_group: 'Yzn5' }),
      );
    });
  });

  it('tworzy transformator z kontekstem stacji (bez regulacji) i wiąże ze schematem', async () => {
    executeDomainOperationMock.mockResolvedValue({
      error: null,
      selection_hint: { element_id: 'tr-created', element_type: 'transformer', zoom_to: true },
    });
    render(<KreatorTransformatoraSnNn />);
    await pickType();

    await userEvent.click(screen.getByTestId('mvd-kreator-transformator-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_transformer_sn_nn',
        expect.objectContaining({
          hv_bus_ref: 'bus-sn',
          lv_bus_ref: 'bus-nn',
          station_ref: 'st-1',
          catalog_binding: expect.objectContaining({ catalog_namespace: 'TRAFO_SN_NN', catalog_item_id: 'energen-tonr-1000-15-04' }),
        }),
      );
    });
    const payload = executeDomainOperationMock.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('transformer_regulation_type');
    // W5-A: bez jawnego wyboru grupa zostaje z katalogu — payload jej nie niesie.
    expect(payload).not.toHaveProperty('vector_group');
    expect(closeFormMock).toHaveBeenCalled();
    // Wielokierunkowe wiązanie (V12K-073): nowy transformator zaznaczony,
    // SLD wycentrowany, przejście na schemat.
    await waitFor(() => {
      expect(selectElementMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'tr-created', type: 'TransformerBranch' }),
      );
    });
    expect(centerSldOnElementMock).toHaveBeenCalledWith('tr-created');
    expect(navigateToSldMock).toHaveBeenCalled();
  });

  it('konfiguruje OLTC AUTO i wysyła pola TapChanger', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorTransformatoraSnNn />);
    await pickType();

    await userEvent.click(screen.getByTestId('mvd-kreator-transformator-dalej'));
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-transformator-regtyp'), 'OLTC');
    // Zaczepy z tabliczki wybranej pozycji (jedno źródło z kreatorem stacji) stoją w polach.
    expect(screen.getByTestId('mvd-kreator-transformator-tapmin')).toHaveValue(-2);
    expect(screen.getByTestId('mvd-kreator-transformator-tapstep')).toHaveValue(2.5);
    expect(screen.queryByText(/przyjęto/)).toBeNull();
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-transformator-control'), 'AUTOMATIC');
    // Automatyka bez napięcia zadanego: próba zapisu wskazuje pole napięcia zadanego.
    await userEvent.click(screen.getByTestId('mvd-kreator-transformator-zapisz'));
    expect(screen.getByTestId('mvd-kreator-transformator-setpoint')).toHaveFocus();
    expect(screen.getByTestId('mvd-kreator-wskazanie').textContent).toMatch(/^Podaj napięcie zadane regulatora — /);
    const setpoint = screen.getByTestId('mvd-kreator-transformator-setpoint');
    await userEvent.type(setpoint, '15.5');
    await userEvent.click(screen.getByTestId('mvd-kreator-transformator-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_transformer_sn_nn',
        expect.objectContaining({
          transformer_regulation_type: 'OLTC',
          transformer_control_mode: 'AUTOMATIC',
          transformer_voltage_setpoint_kv: 15.5,
          transformer_tap_min_position: -2,
          transformer_tap_max_position: 2,
          transformer_tap_step_percent: 2.5,
          transformer_tap_neutral_position: 0,
          transformer_tap_current_position: 0,
        }),
      );
    });
  });

  it('zaczepy idą za pozycją katalogową: zmiana typu odświeża nieedytowane, edytowanych nie nadpisuje', async () => {
    render(<KreatorTransformatoraSnNn />);
    await pickType();
    await userEvent.click(screen.getByTestId('mvd-kreator-transformator-dalej'));
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-transformator-regtyp'), 'DETC');
    await userEvent.clear(screen.getByTestId('mvd-kreator-transformator-tapcurrent'));
    await userEvent.type(screen.getByTestId('mvd-kreator-transformator-tapcurrent'), '1');
    expect(screen.getByTestId('mvd-kreator-transformator-tapcurrent')).toHaveValue(1);
    await userEvent.click(screen.getByTestId('mvd-kreator-transformator-wstecz'));
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-transformator-katalog'), 'tonr-630-15-04');
    await userEvent.click(screen.getByTestId('mvd-kreator-transformator-dalej'));
    expect((screen.getByTestId('mvd-kreator-transformator-tapmin') as HTMLInputElement).value).toBe('-4');
    expect((screen.getByTestId('mvd-kreator-transformator-tapstep') as HTMLInputElement).value).toBe('1.25');
    expect((screen.getByTestId('mvd-kreator-transformator-tapcurrent') as HTMLInputElement).value).toBe('1');
  });

  it('regulacja bez wybranej pozycji katalogowej: zaczepy puste (bez domyślnych −9…9), zapis wskazuje transformator', async () => {
    render(<KreatorTransformatoraSnNn />);
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-transformator')).toHaveAttribute('data-status', 'gotowy'));
    await userEvent.click(screen.getByTestId('mvd-kreator-transformator-dalej'));
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-transformator-regtyp'), 'DETC');
    expect((screen.getByTestId('mvd-kreator-transformator-tapmin') as HTMLInputElement).value).toBe('');
    await userEvent.click(screen.getByTestId('mvd-kreator-transformator-zapisz'));
    expect(screen.getByTestId('mvd-kreator-transformator-katalog')).toHaveFocus();
    expect(screen.getByTestId('mvd-kreator-wskazanie').textContent).toBe(
      'Wybierz transformator z katalogu — bez tabliczki nie da się policzyć rozpływu ani zwarć.',
    );
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('świeży kreator: szyny z kontekstu stacji stoją w polach, zero alertów i czerwieni', async () => {
    render(<KreatorTransformatoraSnNn />);
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-transformator')).toHaveAttribute('data-status', 'gotowy'));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByTestId('mvd-kreator-transformator-hv')).toHaveValue('bus-sn');
    expect(screen.getByTestId('mvd-kreator-transformator-hv')).toBeEnabled();
    expect(
      screen.getByTestId('mvd-kreator-transformator-gotowosc').querySelector('[data-stan="konflikt"]'),
    ).toBeNull();
  });

  it('konflikt widoczny od razu: tabliczka 20 kV na szynie 15 kV oraz zaczep min ≥ max', async () => {
    render(<KreatorTransformatoraSnNn />);
    await pickType();
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-transformator-katalog'), 'tonr-630-20-04');
    expect(screen.getByRole('alert').textContent).toMatch(/nie pasuje do szyny SN/);
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-transformator-katalog'), 'energen-tonr-1000-15-04');
    await userEvent.click(screen.getByTestId('mvd-kreator-transformator-dalej'));
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-transformator-regtyp'), 'DETC');
    await userEvent.clear(screen.getByTestId('mvd-kreator-transformator-tapmin'));
    await userEvent.type(screen.getByTestId('mvd-kreator-transformator-tapmin'), '5');
    expect(screen.getAllByRole('alert').map((a) => a.textContent)).toContain(
      'Zaczep minimalny musi być mniejszy od maksymalnego.',
    );
  });

  it('jedyny transformator na napięcia szyn stoi w polu i daje się zmienić', async () => {
    fetchTransformerTypesMock.mockImplementation(() => Promise.resolve([TONR_1000, TONR_20]));
    render(<KreatorTransformatoraSnNn />);
    await waitFor(() =>
      expect(screen.getByTestId('mvd-kreator-transformator-katalog')).toHaveValue('energen-tonr-1000-15-04'),
    );
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-transformator-katalog'), '');
    expect(screen.getByTestId('mvd-kreator-transformator-katalog')).toHaveValue('');
  });

  it('panel teorii kroku szyn renderuje wzór impedancji przez KaTeX (math-rendered)', async () => {
    // Zasada wywodów KaTeX (2026-07-22): Z ≈ uk·U²/Sn renderuje KaTeX, nie surowy tekst.
    render(<KreatorTransformatoraSnNn />);
    await pickType();
    const wzory = screen.getAllByTestId('math-rendered');
    expect(wzory.length).toBeGreaterThanOrEqual(1);
    expect(
      wzory.some((w) => (w.getAttribute('data-latex') ?? '').includes('u_k \\cdot U^2 / S_n')),
    ).toBe(true);
    expect(screen.queryByTestId('math-fallback')).toBeNull();
  });

  // Intencja dawnej „uczciwej blokady”: w kontekście bez pary szyn (GPZ) operacja nie
  // rusza — w nowym kanonie przez jedno wskazanie powodu przy próbie zapisu.
  it('kontekst bez pary szyn (GPZ): próba zapisu podaje powód, operacja nie rusza', async () => {
    context = {
      station_ref: 'gpz-1',
      transformer_context_valid: false,
      transformer_block_reason: 'Transformator SN/nN nie należy do układu GPZ ani źródła systemowego.',
    };
    snapshotState.snapshot = { buses: [] };
    render(<KreatorTransformatoraSnNn />);
    await screen.findByRole('option', { name: /TONR 1000/ });
    expect(screen.getByTestId('mvd-kreator-transformator-brak')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('mvd-kreator-transformator-zapisz'));
    expect(screen.getByTestId('mvd-kreator-wskazanie').textContent).toMatch(/nie należy do układu GPZ/);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
    // przywróć snapshot dla kolejnych testów
    snapshotState.snapshot = {
      buses: [
        { ref_id: 'bus-sn', name: 'Szyna SN', voltage_kv: 15 },
        { ref_id: 'bus-nn', name: 'Szyna nN', voltage_kv: 0.4 },
      ],
    };
  });

  it('bez aktywnego przypadku: próba zapisu wskazuje przypadek', async () => {
    appState.activeCaseId = null;
    render(<KreatorTransformatoraSnNn />);
    await pickType();
    await userEvent.click(screen.getByTestId('mvd-kreator-transformator-zapisz'));
    expect(screen.getByTestId('mvd-kreator-wskazanie').textContent).toMatch(/aktywny przypadek/);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  /**
   * S9-5 (`karta_e2e_s95.md`, klasa: bramka enable bez sygnału gotowości) —
   * TEN SAM mechanizm jak w `KreatorMagistralaSn.tsx`, powtórzony w tym pliku:
   * `zapisZablokowany` nie sprawdzał, czy katalog transformatorów już doszedł.
   */
  it('iloczyn cech: katalog jeszcze się ładuje × kontekst stacji dostępny → zapis zablokowany z komunikatem', async () => {
    fetchTransformerTypesMock.mockReturnValueOnce(new Promise(() => {}));
    render(<KreatorTransformatoraSnNn />);

    expect(screen.getByTestId('mvd-kreator-transformator-zapisz')).toBeDisabled();
    expect(screen.getByTestId('mvd-kreator-transformator')).toHaveAttribute('data-status', 'ladowanie');
    expect(screen.getByTestId('mvd-kreator-blokada').textContent).toMatch(/katalogu/);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
    // Słownik grup połączeń dochodzi niezależnie od katalogu — czekamy na niego w act,
    // żeby aktualizacja stanu nie spadła poza test (ostrzeżenie „not wrapped in act”).
    await waitFor(() => {
      expect(screen.getByTestId('mvd-kreator-transformator-grupa').querySelectorAll('option').length).toBeGreaterThan(1);
    });
  });
});
