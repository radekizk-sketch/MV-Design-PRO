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
      {
        id: 'L2',
        name: 'Odbiór impedancyjny',
        model: 'zip',
        p_kw: 40,
        cos_phi: 0.9,
        cos_phi_mode: 'fixed',
        a_p: 1,
        b_p: 0,
        c_p: 0,
        a_q: 1,
        b_q: 0,
        c_q: 0,
      },
    ]),
}));

/**
 * Atrapa podglądu STEROWALNA per test (V12K-260). Wcześniej zwracała wyłącznie sukces,
 * więc gałąź błędu nie była ćwiczona ani razu — a to w niej siedział defekt: ekran
 * przy awarii usługi pokazywał polecenie podania mocy i cosφ, które były już podane.
 */
let podgladOdpowiada = true;
vi.mock('../../../../ui/network-build/forms/cableVoltageDropApi', () => ({
  fetchCableRatedCurrent: () =>
    podgladOdpowiada
      ? Promise.resolve({ rated_current_a: 80.2, apparent_power_kva: 55.6, formula_ref: 'I=S/(√3U)', assumptions: [] })
      : Promise.reject(new Error('usługa nie odpowiada')),
}));

async function fill() {
  await waitFor(() => {
    expect(screen.getByTestId('mvd-kreator-odbior-moc')).toBeInTheDocument();
  });
}

describe('KreatorOdbioruNn — realna ścieżka', () => {
  beforeEach(() => {
    podgladOdpowiada = true;
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

  it('awaria usługi podglądu NIE każe podawać danych, które są podane', async () => {
    // Sedno V12K-260: dwa różne stany były zgniecione w jeden widok. Ekran pokazywał
    // baner „nie udało się" i POD NIM polecenie „Podaj moc i cosφ" — przy mocy 50 kW
    // i cosφ 0,93 widocznych obok. Projektant szukał brakującego pola, którego nie
    // brakowało, zamiast ponowić albo sprawdzić połączenie.
    podgladOdpowiada = false;
    render(<KreatorOdbioruNn />);
    await fill();

    await waitFor(() => {
      expect(screen.getByText(/usługa obliczeń nie odpowiedziała/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Podaj moc i cosφ/i)).toBeNull();
    // Komunikat mówi, CO ZROBIĆ — baner bez następnego kroku jest ślepym zaułkiem.
    expect(screen.getByText(/spróbuj ponownie/i)).toBeInTheDocument();
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

  it('pokazuje sekcję modelu obciążenia (ZIP) ze stałą mocą jako domyślną', async () => {
    render(<KreatorOdbioruNn />);
    await fill();
    expect(screen.getByTestId('mvd-kreator-odbior-zip')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-kreator-odbior-zip-cp')).toHaveValue(1);
    expect(screen.getByTestId('mvd-kreator-odbior-zip-ap')).toHaveValue(0);
    expect(screen.getByTestId('mvd-kreator-odbior-zip-kpf')).toHaveValue(0);
    expect(screen.getByText('Stała moc (c = 1)')).toBeInTheDocument();
  });

  it('model ZIP ustawiony przez projektanta jedzie w payloadzie operacji', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorOdbioruNn />);
    await fill();

    // Odbiór stałoimpedancyjny: a = 1, c = 0 dla P i dla Q.
    await userEvent.clear(screen.getByTestId('mvd-kreator-odbior-zip-cp'));
    await userEvent.type(screen.getByTestId('mvd-kreator-odbior-zip-cp'), '0');
    await userEvent.clear(screen.getByTestId('mvd-kreator-odbior-zip-ap'));
    await userEvent.type(screen.getByTestId('mvd-kreator-odbior-zip-ap'), '1');
    await userEvent.clear(screen.getByTestId('mvd-kreator-odbior-zip-cq'));
    await userEvent.type(screen.getByTestId('mvd-kreator-odbior-zip-cq'), '0');
    await userEvent.clear(screen.getByTestId('mvd-kreator-odbior-zip-aq'));
    await userEvent.type(screen.getByTestId('mvd-kreator-odbior-zip-aq'), '1');

    await userEvent.click(screen.getByTestId('mvd-kreator-odbior-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_nn_load',
        expect.objectContaining({ a_p: 1, c_p: 0, a_q: 1, c_q: 0, k_pf: 0, k_qf: 0 }),
      );
    });
    expect(closeFormMock).toHaveBeenCalled();
  });

  it('rozjechana suma udziałów blokuje zapis i mówi po polsku, ile wynosi', async () => {
    render(<KreatorOdbioruNn />);
    await fill();

    // Sam udział stałoimpedancyjny podniesiony do 1 przy c = 1 ⇒ suma 2.
    await userEvent.clear(screen.getByTestId('mvd-kreator-odbior-zip-ap'));
    await userEvent.type(screen.getByTestId('mvd-kreator-odbior-zip-ap'), '1');

    await userEvent.click(screen.getByTestId('mvd-kreator-odbior-zapisz'));

    const komunikat = await screen.findByText(/Suma udziałów a\+b\+c dla mocy czynnej P/);
    expect(komunikat).toHaveTextContent('2.000');
    expect(komunikat).toHaveTextContent('musi wynosić 1');
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('wybór typu z katalogu wypełnia model ZIP pozycji', async () => {
    render(<KreatorOdbioruNn />);
    await fill();
    await userEvent.selectOptions(
      screen.getByTestId('mvd-kreator-odbior-katalog'),
      'L2',
    );
    await waitFor(() => {
      expect(screen.getByTestId('mvd-kreator-odbior-zip-ap')).toHaveValue(1);
    });
    expect(screen.getByTestId('mvd-kreator-odbior-zip-cp')).toHaveValue(0);
    expect(screen.getByText('Własny model ZIP')).toBeInTheDocument();
  });

  it('blokuje zapis bez aktywnego zakresu obliczeń', async () => {
    appState.activeCaseId = null;
    render(<KreatorOdbioruNn />);
    await fill();
    expect(screen.getByTestId('mvd-kreator-odbior-zapisz')).toBeDisabled();
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });
});
