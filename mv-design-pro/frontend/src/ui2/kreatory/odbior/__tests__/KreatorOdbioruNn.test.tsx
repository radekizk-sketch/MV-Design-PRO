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

// `vi.hoisted` + `vi.fn()` (S9-5): pozwala nadpisać implementację per test
// (`mockReturnValueOnce`), żeby symulować katalog W TRAKCIE ładowania.
const { fetchLoadTypesMock } = vi.hoisted(() => ({
  fetchLoadTypesMock: vi.fn(() =>
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
  ),
}));

vi.mock('../../../../ui/catalog/api', () => ({
  getCatalogErrorMessage: () => 'błąd katalogu',
  fetchLoadTypes: () => fetchLoadTypesMock(),
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

/** Moc i cosφ podane przez projektanta (tryb ręczny nie ma pozycji katalogowej). */
async function podajMocICos(p = '50', cos = '0.93') {
  await userEvent.type(screen.getByTestId('mvd-kreator-odbior-moc'), p);
  await userEvent.type(screen.getByTestId('mvd-kreator-odbior-cosphi'), cos);
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
    fetchLoadTypesMock.mockClear();
  });

  afterEach(() => cleanup());

  it('domyślna ścieżka (katalog-first): świeży kreator milczy, zapis bez typu wskazuje katalog', async () => {
    // Karta D4: katalog-first pozostaje domyślne — kreator nie wysyła żądania
    // bez pozycji katalogowej ANI bez jawnej deklaracji trybu eksperckiego.
    // Kontrakt prowadzenia: w trakcie pracy cisza, przy zapisie JEDNO wskazanie z fokusem.
    render(<KreatorOdbioruNn />);
    await fill();
    expect(screen.queryByRole('alert')).toBeNull();
    // Moc i cosφ bez wartości startowych (dawniej 50 kW / 0,93).
    expect(screen.getByTestId('mvd-kreator-odbior-moc')).toHaveValue(null);
    expect(screen.getByTestId('mvd-kreator-odbior-cosphi')).toHaveValue(null);

    await userEvent.click(screen.getByTestId('mvd-kreator-odbior-zapisz'));

    expect(screen.getByTestId('mvd-kreator-odbior-katalog')).toHaveFocus();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByTestId('mvd-kreator-wskazanie').textContent).toMatch(/^Wybierz typ odbioru z katalogu — /);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('tryb ręczny bez mocy: zapis wskazuje moc, potem cosφ', async () => {
    render(<KreatorOdbioruNn />);
    await fill();
    await userEvent.click(screen.getByTestId('mvd-kreator-odbior-tryb-przel-reczny'));
    await userEvent.click(screen.getByTestId('mvd-kreator-odbior-zapisz'));
    expect(screen.getByTestId('mvd-kreator-odbior-moc')).toHaveFocus();
    expect(screen.getByTestId('mvd-kreator-wskazanie').textContent).toMatch(/^Podaj moc czynną odbioru — /);
    await userEvent.type(screen.getByTestId('mvd-kreator-odbior-moc'), '20');
    await userEvent.click(screen.getByTestId('mvd-kreator-odbior-zapisz'));
    expect(screen.getByTestId('mvd-kreator-odbior-cosphi')).toHaveFocus();
    expect(screen.getByTestId('mvd-kreator-wskazanie').textContent).toMatch(/^Podaj cosφ odbioru — /);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('konflikt widoczny od razu przy polu: cosφ > 1', async () => {
    render(<KreatorOdbioruNn />);
    await fill();
    await userEvent.type(screen.getByTestId('mvd-kreator-odbior-cosphi'), '1.2');
    expect(screen.getByRole('alert').textContent).toBe('Współczynnik mocy cosφ musi być w zakresie (0, 1].');
  });

  it('wybór typu z katalogu wpisuje moc i cosφ do pól (edytowalne)', async () => {
    render(<KreatorOdbioruNn />);
    await fill();
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-odbior-katalog'), 'L1');
    expect(screen.getByTestId('mvd-kreator-odbior-moc')).toHaveValue(80);
    expect(screen.getByTestId('mvd-kreator-odbior-cosphi')).toHaveValue(0.94);
    await userEvent.clear(screen.getByTestId('mvd-kreator-odbior-moc'));
    await userEvent.type(screen.getByTestId('mvd-kreator-odbior-moc'), '70');
    expect(screen.getByTestId('mvd-kreator-odbior-moc')).toHaveValue(70);
  });

  it('domyślna ścieżka (katalog-first): wybór typu z katalogu wysyła catalog_binding, bez source_mode', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorOdbioruNn />);
    await fill();

    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-odbior-katalog'), 'L1');
    await userEvent.click(screen.getByTestId('mvd-kreator-odbior-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_nn_load',
        expect.objectContaining({
          feeder_ref: 'feeder-1',
          bus_nn_ref: 'bus-nn',
          load_kind: 'SKUPIONY',
          catalog_binding: expect.objectContaining({ catalog_item_id: 'L1' }),
        }),
      );
    });
    const payload = executeDomainOperationMock.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('source_mode');
    expect(closeFormMock).toHaveBeenCalled();
  });

  it('tryb ręczny (ekspercki): przełącznik wysyła source_mode EKSPERCKI_RECZNY, bez katalogu', async () => {
    // Ścieżka ekspercka JAWNIE dostępna przez przełącznik (karta D4) — nie przez
    // ciche pozostawienie pola katalogu pustym. Ten sam wyróżnik, którym operacja
    // domenowa add_nn_load i bramka API rozpoznają tryb bez pozycji katalogowej.
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorOdbioruNn />);
    await fill();

    await userEvent.click(screen.getByTestId('mvd-kreator-odbior-tryb-przel-reczny'));
    expect(screen.getByText(/Tryb ekspercki/i)).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-kreator-odbior-katalog')).toBeNull();
    await podajMocICos();

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
          source_mode: 'EKSPERCKI_RECZNY',
        }),
      );
    });
    const payload = executeDomainOperationMock.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('reactive_power_kvar');
    expect(payload).not.toHaveProperty('catalog_binding');
    expect(closeFormMock).toHaveBeenCalled();
  });

  it('panel teorii renderuje wzory przez KaTeX (math-rendered), bez surowego tekstu', async () => {
    // Zasada wywodów KaTeX (2026-07-22): Q = P·tan(arccos cosφ) w teorii i pod
    // wykresem trójkąta mocy musi renderować KaTeX, nie surowy string.
    render(<KreatorOdbioruNn />);
    await fill();
    // Wykres trójkąta mocy rysuje się dopiero przy podanym cosφ (bez zgadniętego 0,93).
    await userEvent.type(screen.getByTestId('mvd-kreator-odbior-cosphi'), '0.93');
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
    await podajMocICos();

    await waitFor(() => {
      expect(screen.getByText(/usługa obliczeń nie odpowiedziała/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Podaj moc i cosφ/i)).toBeNull();
    // Komunikat mówi, CO ZROBIĆ — baner bez następnego kroku jest ślepym zaułkiem.
    expect(screen.getByText(/spróbuj ponownie/i)).toBeInTheDocument();
  });

  // Intencja dawnego „bez odpływu zapis zablokowany”: operacja nie wychodzi bez odpływu —
  // w nowym kanonie zapis jest klikalny, a próba nazywa brak (jedno zdanie, co i po co).
  it('uczciwy stan zerowy: bez odpływu próba zapisu nazywa brak odpływu', async () => {
    context = {};
    render(<KreatorOdbioruNn />);
    // Montaż pobiera katalog typów odbioru (mikrotaski) — czekamy na realny
    // stan końcowy UI (opcja typu w selekcie katalogu), żeby aktualizacja
    // stanu domknęła się w act.
    await screen.findByRole('option', { name: /Odbiór biurowy/ });
    expect(screen.getByTestId('mvd-kreator-odbior-brak')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('mvd-kreator-odbior-zapisz'));
    expect(screen.getByTestId('mvd-kreator-wskazanie').textContent).toMatch(/^Otwórz kreator z odpływu nN/);
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
    // Test dotyczy modelu ZIP, nie doboru katalogu — tryb ręczny omija wymóg
    // katalogu (karta D4), żeby test pozostał skupiony na jednej rzeczy.
    await userEvent.click(screen.getByTestId('mvd-kreator-odbior-tryb-przel-reczny'));
    await podajMocICos();

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

  it('rozjechana suma udziałów: konflikt widoczny od razu, zapis wraca do modelu ZIP', async () => {
    render(<KreatorOdbioruNn />);
    await fill();

    // Sam udział stałoimpedancyjny podniesiony do 1 przy c = 1 ⇒ suma 2.
    await userEvent.clear(screen.getByTestId('mvd-kreator-odbior-zip-ap'));
    await userEvent.type(screen.getByTestId('mvd-kreator-odbior-zip-ap'), '1');

    // KONFLIKT_TECHNICZNY widoczny od razu — bez klikania „Zapisz”.
    const komunikat = screen.getByRole('alert');
    expect(komunikat).toHaveTextContent(/Suma udziałów a\+b\+c dla mocy czynnej P/);
    expect(komunikat).toHaveTextContent('2.000');
    expect(komunikat).toHaveTextContent('musi wynosić 1');

    await userEvent.click(screen.getByTestId('mvd-kreator-odbior-zapisz'));
    expect(screen.getByTestId('mvd-kreator-wskazanie').textContent).toMatch(/^Suma udziałów a\+b\+c dla mocy czynnej P/);
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

  it('bez aktywnego przypadku: kompletny zapis wskazuje przypadek, operacja nie wychodzi', async () => {
    appState.activeCaseId = null;
    render(<KreatorOdbioruNn />);
    await fill();
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-odbior-katalog'), 'L1');
    await userEvent.click(screen.getByTestId('mvd-kreator-odbior-zapisz'));
    expect(screen.getByTestId('mvd-kreator-wskazanie').textContent).toMatch(/aktywny przypadek/);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  /**
   * S9-5 (`karta_e2e_s95.md`, klasa: bramka enable bez sygnału gotowości) —
   * TEN SAM mechanizm jak w `KreatorMagistralaSn.tsx`, powtórzony w tym pliku:
   * zapis nie sprawdzał, czy katalog odbiorów już doszedł (ścieżka katalogowa).
   */
  it('iloczyn cech: katalog jeszcze się ładuje × odpływ dostępny (tryb katalogowy) → zapis wyszarzony z jednym zdaniem', async () => {
    fetchLoadTypesMock.mockReturnValueOnce(new Promise(() => {}));
    render(<KreatorOdbioruNn />);

    expect(screen.getByTestId('mvd-kreator-odbior-zapisz')).toBeDisabled();
    expect(screen.getByTestId('mvd-kreator-odbior')).toHaveAttribute('data-status', 'ladowanie');
    expect(screen.getByTestId('mvd-kreator-blokada').textContent).toMatch(/Wczytywanie katalogu/);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  /**
   * S9-5 — PREDYKATY PARAMI (KLASA NIE INSTANCJA): odbiór ma DWIE ścieżki
   * pochodzenia (katalog ALBO `manual_mode`); bramka ładowania katalogu MUSI
   * pomijać tryb ręczny, inaczej user, który świadomie NIE używa katalogu,
   * czekałby na zasób, którego nie potrzebuje.
   */
  it('iloczyn cech: katalog jeszcze się ładuje × tryb ręczny → zapis NIE jest blokowany przez katalog', async () => {
    fetchLoadTypesMock.mockReturnValueOnce(new Promise(() => {}));
    render(<KreatorOdbioruNn />);
    await userEvent.click(screen.getByTestId('mvd-kreator-odbior-tryb-przel-reczny'));

    expect(screen.getByTestId('mvd-kreator-odbior')).toHaveAttribute('data-status', 'gotowy');
    expect(screen.getByTestId('mvd-kreator-odbior-zapisz')).toBeEnabled();
  });

  // W5-D: fazy przyłączenia — pole `Load.phases` modelu czytane przez rozpływ
  // niesymetryczny. Natywny wybór w selektorze (Zero-Debt §5), payload z faz.
  it('fazy (W5-D): selektor startuje bez wskazania, a zapis bez wyboru NIE wysyła `phases`', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorOdbioruNn />);
    await fill();
    const selektor = screen.getByTestId('mvd-kreator-odbior-fazy') as HTMLSelectElement;
    expect(selektor.value).toBe('');
    expect(Array.from(selektor.options).map((o) => o.value)).toEqual([
      '', 'ABC', 'A', 'B', 'C', 'AB', 'BC', 'CA',
    ]);
    // Wiersz kontroli mówi wprost, jak odbiór bez wskazania zostanie policzony.
    expect(screen.getByTestId('mvd-kreator-odbior-gotowosc')).toHaveTextContent(
      'nie wskazano — trójfazowy symetryczny',
    );

    await userEvent.click(screen.getByTestId('mvd-kreator-odbior-tryb-przel-reczny'));
    await podajMocICos();
    await userEvent.click(screen.getByTestId('mvd-kreator-odbior-zapisz'));
    await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalledTimes(1));
    const payload = executeDomainOperationMock.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('phases');
    expect(payload.connection_type).toBe('TROJFAZOWY');
  });

  it('fazy (W5-D): natywny wybór fazy A jedzie w payloadzie jako `phases`, connection_type jednofazowy', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorOdbioruNn />);
    await fill();
    await userEvent.click(screen.getByTestId('mvd-kreator-odbior-tryb-przel-reczny'));
    await podajMocICos();
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-odbior-fazy'), 'A');
    expect(screen.getByTestId('mvd-kreator-odbior-gotowosc')).toHaveTextContent('Jednofazowy L1 (faza A)');

    await userEvent.click(screen.getByTestId('mvd-kreator-odbior-zapisz'));
    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_nn_load',
        expect.objectContaining({ phases: 'A', connection_type: 'JEDNOFAZOWY' }),
      );
    });
    expect(closeFormMock).toHaveBeenCalled();
  });
});
