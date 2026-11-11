/**
 * Testy kreatora „Dodaj ogranicznik przepięć SN" (G-STK-8) — realna ścieżka
 * użytkownika (render → wybór katalogu → natywny zapis → operacja domenowa).
 * Mockowane tylko store'y i końcówka katalogu — nie sam ekran.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ladunekProbyZWywolania, wynikiProby } from '../../rama/__tests__/wynikiProby';

import { KreatorOgranicznikaSn } from '../KreatorOgranicznikaSn';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const navigateToSldMock = vi.fn();
const fetchMock = vi.fn();

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
const { fetchSurgeArresterTypesMock } = vi.hoisted(() => ({
  fetchSurgeArresterTypesMock: vi.fn(() =>
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
  ),
}));

vi.mock('../../../../ui/catalog/api', () => ({
  getCatalogErrorMessage: () => 'błąd katalogu',
  fetchSurgeArresterTypes: () => fetchSurgeArresterTypesMock(),
}));

async function pickType() {
  await waitFor(() =>
    expect(screen.getByTestId('mvd-kreator-ogranicznik-katalog').querySelector('option[value="arrester-abb-polim-d-24kv-10ka"]')).not.toBeNull(),
  );
  await userEvent.selectOptions(
    screen.getByTestId('mvd-kreator-ogranicznik-katalog'),
    'arrester-abb-polim-d-24kv-10ka',
  );
}

const ODMOWA = {
  komunikat: 'U_m ogranicznika 24 kV nie pokrywa napięcia sieci 30 kV.',
  kod: 'spd.voltage_mismatch',
};

describe('KreatorOgranicznikaSn — realna ścieżka', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(wynikiProby(ODMOWA)[0].odpowiedz);
    vi.stubGlobal('fetch', fetchMock);
    appState.activeCaseId = 'case-1';
    context = { field_ref: 'POLE-IN', field_name: 'Pole liniowe' };
    snapshotState.error = null;
    selectionState.selectedElements = [];
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    navigateToSldMock.mockReset();
    fetchSurgeArresterTypesMock.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

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
    expect(screen.getByTestId('mvd-kreator-ogranicznik')).toHaveAttribute('data-status', 'zablokowany');
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
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
    expect(screen.getByTestId('mvd-kreator-walidacja').textContent).toMatch(/[Łł]adowanie katalogu/);
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

  /**
   * Kontrola przed zapisem: zgodność napięcia (i każdą regułę operacji) ocenia WYŁĄCZNIE
   * operacja `add_surge_arrester_sn` próbą `dry_run`; kreator nie ma progu. Iloczyn: odpowiedź próby
   * {przyjęta, odmowa 200, odmowa 422, nieustalona 500} × komunikat kontroli × wiersz gotowości ×
   * ładunek próby = ładunek zapisu.
   */
  it.each(wynikiProby(ODMOWA))('próba $nazwa → werdykt operacji w kreatorze', async (wynik) => {
    fetchMock.mockImplementation(wynik.odpowiedz);
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorOgranicznikaSn />);
    await pickType();

    const proba = await screen.findByTestId('mvd-kreator-ogranicznik-proba');
    await waitFor(() => expect(proba).toHaveAttribute('data-stan', wynik.stan));
    if (wynik.tresc) expect(proba.textContent).toContain(wynik.tresc);
    expect(screen.getByTestId('mvd-kreator-ogranicznik-gotowosc-Kontrola modelu').textContent).toContain(wynik.wiersz);

    await userEvent.click(screen.getByTestId('mvd-kreator-ogranicznik-zapisz'));
    await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalledTimes(1));
    const [, operacja, ladunekZapisu] = executeDomainOperationMock.mock.calls[0];
    expect(operacja).toBe('add_surge_arrester_sn');
    expect(ladunekZapisu).toMatchObject({ field_ref: 'POLE-IN' });
    const ostatniaProba = fetchMock.mock.calls[fetchMock.mock.calls.length - 1][1];
    expect(ladunekProbyZWywolania(ostatniaProba)).toEqual({ ...ladunekZapisu, dry_run: true });
  });

  it('bez wybranego typu → brak próby, wiersz „Nie sprawdzono”', async () => {
    render(<KreatorOgranicznikaSn />);
    await screen.findAllByRole('option');
    await new Promise((r) => setTimeout(r, 400));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('mvd-kreator-ogranicznik-proba')).toBeNull();
    expect(screen.getByTestId('mvd-kreator-ogranicznik-gotowosc-Kontrola modelu').textContent).toContain('Nie sprawdzono');
  });
});
