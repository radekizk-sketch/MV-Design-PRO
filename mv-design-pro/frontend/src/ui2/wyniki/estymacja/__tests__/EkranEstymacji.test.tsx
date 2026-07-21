/*
 * Testy okna „Estymacja stanu (WLS)" (ui2/wyniki/estymacja). Ćwiczą REALNĄ ścieżkę
 * natywną użytkownika (`fireEvent` na realnych kontrolkach JSX — bez syntetycznych
 * `dispatchEvent`): uczciwy stan bez przebiegu (bez API), wczytanie wymaganych
 * wejść, wpis pomiarów w edytorze → „Estymuj" → serializacja żądania i render
 * widoku (tabela |V|, chip χ², flaga podejrzenia LNR), walidację braku pomiarów
 * (bez POST), błąd 422 PL z pola `detail`, dodawanie/usuwanie wierszy oraz
 * determinizm renderu. API mockowane na granicy fetch; rejestr przebiegów w store.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import type { ExecutionRun } from '../../../../ui/study-cases/types';
import { EkranEstymacji } from '../EkranEstymacji';
import { widokEstymacjiFixture, wymaganiaFixture } from './fixtures';

const wym = vi.fn();
const post = vi.fn();

vi.mock('../api', () => ({
  fetchWymaganiaEstymacji: (id: string) => wym(id),
  postEstymacjaStanu: (z: unknown) => post(z),
}));

function przebiegRozplywuFixture(): ExecutionRun {
  return {
    id: 'run-lf-1',
    study_case_id: 'case-1',
    analysis_type: 'LOAD_FLOW',
    solver_input_hash: 'hash-abc',
    status: 'DONE',
    started_at: '2026-07-16T08:00:00Z',
    finished_at: '2026-07-16T08:00:05Z',
    error_message: null,
  };
}

function ustawPrzebieg() {
  useExecutionRunsStore.setState({ runs: [przebiegRozplywuFixture()], activeRunId: 'run-lf-1' });
}

/** Wypełnia pierwszy wiersz edytora pomiarem |V| na węźle BUS-2 (ścieżka natywna). */
function wpiszPomiarV() {
  fireEvent.change(screen.getByTestId('mvd-est-wezel-0'), { target: { value: 'BUS-2' } });
  fireEvent.change(screen.getByTestId('mvd-est-wartosc-0'), { target: { value: '1,0' } });
  fireEvent.change(screen.getByTestId('mvd-est-sigma-0'), { target: { value: '0,004' } });
}

beforeEach(() => {
  useExecutionRunsStore.setState({ runs: [], activeRunId: null });
  wym.mockResolvedValue(wymaganiaFixture());
});
afterEach(() => vi.clearAllMocks());

describe('EkranEstymacji — stany wejściowe', () => {
  it('bez przebiegu rozpływu → uczciwa instrukcja, bez wołań API', () => {
    render(<EkranEstymacji trybZaawansowania="basic" onOtworzDowod={() => undefined} />);
    expect(screen.getByTestId('mvd-est-brak-przebiegu')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-est-estymuj')).not.toBeInTheDocument();
    expect(wym).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it('przebieg rozpływu → wczytuje wymagane wejścia (mapa węzeł→indeks)', async () => {
    ustawPrzebieg();
    render(<EkranEstymacji trybZaawansowania="basic" onOtworzDowod={() => undefined} />);
    await screen.findByTestId('mvd-est-edytor');
    expect(wym).toHaveBeenCalledWith('run-lf-1');
    expect(screen.getByTestId('mvd-est-min-pomiarow')).toHaveTextContent('5');
    expect(screen.getByTestId('mvd-est-wymagania')).toBeInTheDocument();
  });
});

describe('EkranEstymacji — estymacja i wynik', () => {
  it('wpis pomiaru → „Estymuj" → serializuje żądanie i wywołuje POST', async () => {
    ustawPrzebieg();
    post.mockReturnValue(new Promise(() => {})); // bieg trwa — asercja tylko na wywołaniu
    render(<EkranEstymacji trybZaawansowania="basic" onOtworzDowod={() => undefined} />);
    await screen.findByTestId('mvd-est-edytor');
    wpiszPomiarV();
    fireEvent.click(screen.getByTestId('mvd-est-estymuj'));
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith({
      run_id: 'run-lf-1',
      pomiary: [{ meas_type: 'V_MAGNITUDE', bus_ref: 'BUS-2', value: 1, sigma: 0.004 }],
      alpha: 0.01,
      lnr_threshold: 3,
      include_trace: false,
    });
  });

  it('render widoku: chip χ², tabela |V| węzłów i flaga podejrzenia (LNR)', async () => {
    ustawPrzebieg();
    post.mockResolvedValue(widokEstymacjiFixture());
    render(<EkranEstymacji trybZaawansowania="basic" onOtworzDowod={() => undefined} />);
    await screen.findByTestId('mvd-est-edytor');
    wpiszPomiarV();
    fireEvent.click(screen.getByTestId('mvd-est-estymuj'));

    await screen.findByTestId('mvd-est-wynik');
    // χ² wykryty → chip z klasą err.
    const chipChi = screen.getByTestId('mvd-est-chip-chi');
    expect(chipChi.className).toContain('mvd-est-chip--err');
    // Tabela estymowanego stanu węzłów zawiera |V| (przecinek PL).
    const tabele = screen.getAllByTestId('mvd-wyn-tabela');
    expect(tabele[0]).toHaveTextContent('0,9912');
    // Tabela rezyduów pomiarów zawiera flagę podejrzenia.
    expect(tabele[1]).toHaveTextContent('podejrzany');
    // Panel detekcji wskazuje podejrzany pomiar.
    expect(screen.getByTestId('mvd-est-podejrzany')).toHaveTextContent('BUS-1');
    // Uczciwy brak: węzeł bez pomiaru.
    expect(screen.getByTestId('mvd-est-braki')).toHaveTextContent('BUS-3');
  });

  it('render jest deterministyczny dla tego samego wejścia', async () => {
    ustawPrzebieg();
    post.mockResolvedValue(widokEstymacjiFixture());
    const { container, unmount } = render(
      <EkranEstymacji trybZaawansowania="basic" onOtworzDowod={() => undefined} />,
    );
    await screen.findByTestId('mvd-est-edytor');
    wpiszPomiarV();
    fireEvent.click(screen.getByTestId('mvd-est-estymuj'));
    await screen.findByTestId('mvd-est-wynik');
    const pierwszy = container.querySelector('[data-testid="mvd-est-wynik"]')?.innerHTML;
    unmount();

    render(<EkranEstymacji trybZaawansowania="basic" onOtworzDowod={() => undefined} />);
    await screen.findByTestId('mvd-est-edytor');
    wpiszPomiarV();
    fireEvent.click(screen.getByTestId('mvd-est-estymuj'));
    await screen.findByTestId('mvd-est-wynik');
    const drugi = screen
      .getByTestId('mvd-est-wynik')
      .innerHTML;
    expect(drugi).toBe(pierwszy);
  });

  it('ślad WHITE BOX i metadane widoczne wyłącznie w trybie eksperckim', async () => {
    ustawPrzebieg();
    post.mockResolvedValue(widokEstymacjiFixture());
    render(<EkranEstymacji trybZaawansowania="expert" onOtworzDowod={() => undefined} />);
    await screen.findByTestId('mvd-est-edytor');
    wpiszPomiarV();
    fireEvent.click(screen.getByTestId('mvd-est-estymuj'));
    await screen.findByTestId('mvd-est-wynik');

    fireEvent.click(screen.getByTestId('mvd-est-slad-otworz'));
    expect(screen.getByTestId('mvd-est-slad')).toBeInTheDocument();
    // Identyfikator estymaty w trybie eksperckim.
    expect(screen.getByTestId('mvd-est-eksp')).toHaveTextContent('estymata-hash-abc');
    // include_trace wysłane jako true (ślad pobierany do audytu).
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ include_trace: true }));
  });
});

describe('EkranEstymacji — uczciwe stany i edytor', () => {
  it('brak pomiarów → błąd walidacji PL, bez POST', async () => {
    ustawPrzebieg();
    render(<EkranEstymacji trybZaawansowania="basic" onOtworzDowod={() => undefined} />);
    await screen.findByTestId('mvd-est-edytor');
    fireEvent.click(screen.getByTestId('mvd-est-estymuj'));
    expect(screen.getByTestId('mvd-est-bledy')).toHaveTextContent('wymaga pomiarów telemetrycznych');
    expect(post).not.toHaveBeenCalled();
  });

  it('błąd 422 z backendu (układ niedookreślony) → jawny stan błędu z detailem PL', async () => {
    ustawPrzebieg();
    post.mockRejectedValue(
      new Error('Układ nieobserwowalny: liczba pomiarów mniejsza niż liczba stanów (niedookreślony).'),
    );
    render(<EkranEstymacji trybZaawansowania="basic" onOtworzDowod={() => undefined} />);
    await screen.findByTestId('mvd-est-edytor');
    wpiszPomiarV();
    fireEvent.click(screen.getByTestId('mvd-est-estymuj'));
    expect(await screen.findByTestId('mvd-est-blad')).toHaveTextContent('niedookreślony');
    expect(screen.queryByTestId('mvd-est-wynik')).not.toBeInTheDocument();
  });

  it('dodaje i usuwa wiersze pomiarów', async () => {
    ustawPrzebieg();
    render(<EkranEstymacji trybZaawansowania="basic" onOtworzDowod={() => undefined} />);
    await screen.findByTestId('mvd-est-edytor');
    expect(screen.getAllByTestId('mvd-est-wiersz')).toHaveLength(1);
    fireEvent.click(screen.getByTestId('mvd-est-dodaj'));
    expect(screen.getAllByTestId('mvd-est-wiersz')).toHaveLength(2);
    fireEvent.click(screen.getByTestId('mvd-est-usun-1'));
    expect(screen.getAllByTestId('mvd-est-wiersz')).toHaveLength(1);
  });

  it('pomiar przepływu (P_FLOW) odblokowuje węzeł „do" gałęzi', async () => {
    ustawPrzebieg();
    render(<EkranEstymacji trybZaawansowania="basic" onOtworzDowod={() => undefined} />);
    await screen.findByTestId('mvd-est-edytor');
    const wezelJ = screen.getByTestId('mvd-est-wezelj-0') as HTMLSelectElement;
    expect(wezelJ.disabled).toBe(true);
    fireEvent.change(screen.getByTestId('mvd-est-typ-0'), { target: { value: 'P_FLOW' } });
    const wezelJpo = screen.getByTestId('mvd-est-wezelj-0') as HTMLSelectElement;
    expect(wezelJpo.disabled).toBe(false);
    // Węzły dostępne jako opcje „do".
    expect(within(wezelJpo).getAllByRole('option').length).toBeGreaterThan(1);
  });
});
