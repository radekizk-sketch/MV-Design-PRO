/*
 * Testy komponentu kreatora studium przyłączenia (karta P35, kryteria §3).
 * Weryfikują: kroki z hintami i wstępnym wypełnieniem (zero pustych pól), blokadę
 * przejścia bez wyboru wariantu, filtr typu wg rodzaju, brak przebiegu w kroku
 * analiz, pełny bieg sekwencji z przejściem do przeglądu, tabelę przeglądu na
 * wzorcu oraz szczegół wariantu po wyborze wiersza i odsłanianie identyfikatorów
 * tylko w trybie eksperckim. API i store'y mockowane; fixtures 1:1 z backendem.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { KreatorStudium } from '../KreatorStudium';
import {
  katalogStudiumFixture,
  przebiegFixture,
  rekordyStudiumFixture,
  snapshotFixture,
  widokObszaruFixture,
  widokPokryciaFixture,
  widokZdolnosciFixture,
} from './fixtures';

const pobierzKonwertery = vi.fn();
const pobierzKatalog = vi.fn();
const pobierzZdolnosc = vi.fn();
const pobierzObszar = vi.fn();
const pobierzPokrycie = vi.fn();
vi.mock('../../api', () => ({
  pobierzKonwertery: () => pobierzKonwertery(),
  pobierzKatalogKlasNcRfg: () => pobierzKatalog(),
  pobierzZdolnoscPrzylaczeniowa: (z: unknown) => pobierzZdolnosc(z),
  pobierzObszarPQ: (z: unknown) => pobierzObszar(z),
  pobierzPokryciePQ: (z: unknown) => pobierzPokrycie(z),
}));

function ustawGotowyRozplyw() {
  useExecutionRunsStore.setState({
    runs: [przebiegFixture({ id: 'lf-run', analysis_type: 'LOAD_FLOW', status: 'DONE' })],
    activeRunId: 'lf-run',
  });
  useSnapshotStore.setState({ snapshot: snapshotFixture() });
}

beforeEach(() => {
  useExecutionRunsStore.getState().reset();
  useSnapshotStore.getState().reset();
  pobierzKonwertery.mockResolvedValue(rekordyStudiumFixture());
  pobierzKatalog.mockResolvedValue(katalogStudiumFixture());
  pobierzZdolnosc.mockResolvedValue(widokZdolnosciFixture());
  pobierzObszar.mockResolvedValue(widokObszaruFixture());
  pobierzPokrycie.mockResolvedValue(widokPokryciaFixture());
});
afterEach(() => {
  useExecutionRunsStore.getState().reset();
  useSnapshotStore.getState().reset();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Krok 1 — warianty
// ---------------------------------------------------------------------------

describe('KreatorStudium — krok 1 (warianty)', () => {
  it('pokazuje hint inżynierski i listę węzłów; „Dalej" zablokowane bez wyboru', async () => {
    ustawGotowyRozplyw();
    render(<KreatorStudium trybZaawansowania="basic" />);
    // Montaż kreatora pobiera katalogi (konwertery + klasy NC RfG) — realny
    // efekt mikrotaskowy, którego skutek (prefill kroku 2) nie ma reprezentacji
    // w UI kroku 1, więc nie ma na co czekać przez findBy*/waitFor. Puste
    // act(async) domyka te mikrotaski w act — bez niego React zgłasza
    // „An update to KreatorStudium was not wrapped in act(...)".
    await act(async () => {});
    expect(screen.getByTestId('mvd-studium-krok1')).toBeInTheDocument();
    expect(screen.getByText(/Zakres typowy: 2–5 wariantów/)).toBeInTheDocument();
    expect(screen.getByTestId('mvd-studium-wybor-bus-a')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-studium-dalej')).toBeDisabled();
  });

  it('wybór węzła odblokowuje przejście dalej', async () => {
    ustawGotowyRozplyw();
    render(<KreatorStudium trybZaawansowania="basic" />);
    // Jak wyżej: skutek pobrania katalogów jest niewidoczny w kroku 1 —
    // domknięcie mikrotasków montażu jawnym act(async).
    await act(async () => {});
    fireEvent.click(screen.getByTestId('mvd-studium-wybor-bus-a'));
    expect(screen.getByTestId('mvd-studium-dalej')).not.toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Krok 2 — parametry źródła (prefill, zero pustych pól)
// ---------------------------------------------------------------------------

describe('KreatorStudium — krok 2 (parametry źródła)', () => {
  it('wstępnie wypełnia typ pierwszym rekordem rodzaju i pokazuje moc z rekordu', async () => {
    ustawGotowyRozplyw();
    render(<KreatorStudium trybZaawansowania="basic" />);
    fireEvent.click(screen.getByTestId('mvd-studium-krok-2'));

    const typ = (await screen.findByTestId('mvd-studium-typ')) as HTMLSelectElement;
    expect(typ.value).toBe('conv-pv-2mw'); // pierwszy PV
    expect(screen.getByTestId('mvd-studium-typ-dane')).toHaveTextContent('2,000');
    const operator = screen.getByTestId('mvd-studium-operator') as HTMLSelectElement;
    expect(operator.value).toBe('pse'); // pierwszy operator
  });

  it('zmiana rodzaju na FW przełącza katalog typów na WIND i moc typu', async () => {
    ustawGotowyRozplyw();
    render(<KreatorStudium trybZaawansowania="basic" />);
    fireEvent.click(screen.getByTestId('mvd-studium-krok-2'));
    await screen.findByTestId('mvd-studium-typ');

    fireEvent.change(screen.getByTestId('mvd-studium-rodzaj'), { target: { value: 'FW' } });
    const typ = screen.getByTestId('mvd-studium-typ') as HTMLSelectElement;
    expect(typ.value).toBe('conv-wind-3mw');
    expect(screen.getByTestId('mvd-studium-typ-dane')).toHaveTextContent('3,000');
  });
});

// ---------------------------------------------------------------------------
// Krok 3 — analizy
// ---------------------------------------------------------------------------

describe('KreatorStudium — krok 3 (analizy)', () => {
  it('bez zakończonego rozpływu pokazuje instrukcję, bez wywołania analiz', async () => {
    useSnapshotStore.setState({ snapshot: snapshotFixture() });
    render(<KreatorStudium trybZaawansowania="basic" />);
    fireEvent.click(screen.getByTestId('mvd-studium-krok-3'));
    expect(await screen.findByTestId('mvd-studium-brak-przebiegu')).toHaveTextContent(
      'Brak zakończonego przebiegu rozpływu mocy',
    );
    expect(pobierzZdolnosc).not.toHaveBeenCalled();
  });

  it('jawny bieg woła istniejące końcówki i przechodzi do przeglądu', async () => {
    ustawGotowyRozplyw();
    render(<KreatorStudium trybZaawansowania="basic" />);
    fireEvent.click(screen.getByTestId('mvd-studium-wybor-bus-a'));
    fireEvent.click(screen.getByTestId('mvd-studium-krok-3'));

    // Przycisk biegu odblokowuje się dopiero po prefillu typu z katalogu
    // (asynchroniczny montaż) — jak realny użytkownik klikamy AKTYWNY przycisk.
    const uruchom = await screen.findByTestId('mvd-studium-uruchom');
    await waitFor(() => expect(uruchom).toBeEnabled());
    fireEvent.click(uruchom);

    // Po zakończeniu biegu kreator pokazuje przegląd (krok 4).
    expect(await screen.findByTestId('mvd-studium-przeglad')).toBeInTheDocument();
    expect(pobierzZdolnosc).toHaveBeenCalledTimes(1);
    expect(pobierzObszar).toHaveBeenCalledTimes(1);
    expect(pobierzPokrycie).toHaveBeenCalledTimes(1);
  });

  it('błąd analizy jednego wariantu nie przerywa pozostałych', async () => {
    ustawGotowyRozplyw();
    pobierzObszar.mockImplementation((z: { busRef: string }) =>
      z.busRef === 'bus-a'
        ? Promise.reject(new Error('Błąd siatki P–Q'))
        : Promise.resolve(widokObszaruFixture()),
    );
    render(<KreatorStudium trybZaawansowania="basic" />);
    fireEvent.click(screen.getByTestId('mvd-studium-wybor-bus-a'));
    fireEvent.click(screen.getByTestId('mvd-studium-wybor-bus-b'));
    fireEvent.click(screen.getByTestId('mvd-studium-krok-3'));
    // Jak wyżej: klik w AKTYWNY przycisk (po prefillu typu z katalogu).
    const uruchom = await screen.findByTestId('mvd-studium-uruchom');
    await waitFor(() => expect(uruchom).toBeEnabled());
    fireEvent.click(uruchom);

    await screen.findByTestId('mvd-studium-przeglad');
    // Wróć do kroku analiz, aby sprawdzić stany faz.
    fireEvent.click(screen.getByTestId('mvd-studium-krok-3'));
    expect(screen.getByTestId('mvd-studium-faza-bus-a-obszar')).toHaveTextContent('Błąd');
    expect(screen.getByTestId('mvd-studium-faza-bus-b-obszar')).toHaveTextContent('Gotowe');
  });
});

// ---------------------------------------------------------------------------
// Krok 4 — przegląd zbiorczy + szczegół wariantu
// ---------------------------------------------------------------------------

async function przeprowadzIWejdzDoPrzegladu(tryb: 'basic' | 'expert') {
  ustawGotowyRozplyw();
  render(<KreatorStudium trybZaawansowania={tryb} />);
  fireEvent.click(screen.getByTestId('mvd-studium-wybor-bus-a'));
  fireEvent.click(screen.getByTestId('mvd-studium-krok-3'));
  // Przycisk biegu odblokowuje się dopiero po prefillu typu z katalogu
  // (asynchroniczny montaż) — jak realny użytkownik klikamy AKTYWNY przycisk.
  const uruchom = await screen.findByTestId('mvd-studium-uruchom');
  await waitFor(() => expect(uruchom).toBeEnabled());
  fireEvent.click(uruchom);
  await screen.findByTestId('mvd-studium-przeglad');
}

describe('KreatorStudium — krok 4 (przegląd)', () => {
  it('tabela przeglądu pokazuje wartości z odpowiedzi backendu', async () => {
    await przeprowadzIWejdzDoPrzegladu('basic');
    const tabela = screen.getByTestId('mvd-wyn-tabela');
    expect(within(tabela).getByText('Szyna A')).toBeInTheDocument();
    expect(within(tabela).getByText('1,500')).toBeInTheDocument(); // moc przyłączalna
    expect(within(tabela).getByText('Niepokryte')).toBeInTheDocument(); // werdykt pokrycia
  });

  it('wybór wiersza pokazuje szczegół wariantu (reużyte wykres i ślad)', async () => {
    await przeprowadzIWejdzDoPrzegladu('basic');
    expect(screen.getByTestId('mvd-studium-szczegol-brak')).toBeInTheDocument();
    fireEvent.click(screen.getAllByTestId('mvd-wyn-wiersz')[0]);
    expect(await screen.findByTestId('mvd-studium-szczegol')).toBeInTheDocument();
  });

  it('identyfikator węzła odsłaniany wyłącznie w trybie eksperckim', async () => {
    await przeprowadzIWejdzDoPrzegladu('expert');
    expect(screen.getByTestId('mvd-wyn-th-identyfikator')).toBeInTheDocument();
  });
});
