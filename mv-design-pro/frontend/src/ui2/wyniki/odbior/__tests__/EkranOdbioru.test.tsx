/*
 * Testy okna „Zgodność powykonawcza" (karta U4 P45). Weryfikują: uczciwy stan bez
 * przebiegu rozpływu (bez wołań API), walidację tolerancji przed wysłaniem
 * (komunikaty PL, bez POST), serializację żądania (wiersze → JSON `pomiary`),
 * render raportu z fixture 1:1 z kontraktem (chipy, tabela, werdykty kolorem,
 * założenia zawsze widoczne), błąd 422 PL z pola `detail`, ślad WHITE BOX w trybie
 * eksperckim oraz edytor wierszy (dodaj/usuń). API mockowane; rejestr przebiegów
 * wstrzykiwany przez store.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import type { ExecutionRun } from '../../../../ui/study-cases/types';
import { EkranOdbioru } from '../EkranOdbioru';
import { widokZgodnosciFixture } from './fixtures';

const post = vi.fn();

vi.mock('../api', () => ({
  postZgodnoscPowykonawcza: (zadanie: unknown) => post(zadanie),
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

/** Wypełnia pierwszy wiersz edytora i tolerancję napięcia (pomiar U). */
function wypelnijPomiarU() {
  fireEvent.change(screen.getByTestId('mvd-odbior-element-0'), { target: { value: 'BUS-1' } });
  fireEvent.change(screen.getByTestId('mvd-odbior-wartosc-0'), { target: { value: '15,3' } });
  fireEvent.change(screen.getByTestId('mvd-odbior-tol-napiecie'), { target: { value: '5' } });
}

beforeEach(() => {
  useExecutionRunsStore.setState({ runs: [], activeRunId: null });
});
afterEach(() => vi.clearAllMocks());

describe('EkranOdbioru — stany wejściowe', () => {
  it('bez przebiegu rozpływu → uczciwa instrukcja, bez wołań API', () => {
    render(<EkranOdbioru trybZaawansowania="basic" />);
    expect(screen.getByTestId('mvd-odbior-brak-przebiegu')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-odbior-oblicz')).not.toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('walidacja tolerancji przed wysłaniem → błędy PL, bez POST', () => {
    ustawPrzebieg();
    render(<EkranOdbioru trybZaawansowania="basic" />);
    // Wiersz z napięciem U bez tolerancji napięcia.
    fireEvent.change(screen.getByTestId('mvd-odbior-element-0'), { target: { value: 'BUS-1' } });
    fireEvent.change(screen.getByTestId('mvd-odbior-wartosc-0'), { target: { value: '15,3' } });
    fireEvent.click(screen.getByTestId('mvd-odbior-oblicz'));
    expect(screen.getByTestId('mvd-odbior-bledy')).toHaveTextContent('tolerancję napięcia');
    expect(post).not.toHaveBeenCalled();
  });
});

describe('EkranOdbioru — serializacja i raport', () => {
  it('serializuje wiersze do JSON pomiary i wywołuje POST', () => {
    ustawPrzebieg();
    post.mockReturnValue(new Promise(() => {})); // bieg trwa — asercja tylko na wywołaniu
    render(<EkranOdbioru trybZaawansowania="basic" />);
    wypelnijPomiarU();
    fireEvent.click(screen.getByTestId('mvd-odbior-oblicz'));
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith({
      run_id: 'run-lf-1',
      pomiary: [{ element_ref: 'BUS-1', wielkosc: 'U', wartosc: 15.3, jednostka: 'kV' }],
      tolerancje: { napiecie_pct: 5 },
    });
  });

  it('render raportu: chipy, werdykty w tabeli, założenia zawsze widoczne', async () => {
    ustawPrzebieg();
    post.mockResolvedValue(widokZgodnosciFixture());
    render(<EkranOdbioru trybZaawansowania="basic" />);
    wypelnijPomiarU();
    fireEvent.click(screen.getByTestId('mvd-odbior-oblicz'));

    await screen.findByTestId('mvd-odbior-wynik');
    expect(screen.getAllByTestId('mvd-odbior-chip')).toHaveLength(4);
    const tabela = screen.getByTestId('mvd-wyn-tabela');
    expect(tabela).toHaveTextContent('w tolerancji');
    expect(tabela).toHaveTextContent('poza tolerancją');
    // Sekcja założeń zawsze widoczna z uwagą V12K-027 (Q po |wartości|).
    expect(screen.getByTestId('mvd-wyn-zalozenia')).toHaveTextContent('V12K-027');
    // Największa odchyłka z podsumowania (przecinek PL).
    expect(screen.getByTestId('mvd-odbior-najwieksza')).toHaveTextContent('12,50');
    expect(screen.getByTestId('mvd-odbior-najwieksza')).toHaveTextContent('LINE-2');
  });

  it('werdykt prezentowany kolorem tokenów w panelu szczegółu (wybór wiersza)', async () => {
    ustawPrzebieg();
    post.mockResolvedValue(widokZgodnosciFixture());
    render(<EkranOdbioru trybZaawansowania="basic" />);
    wypelnijPomiarU();
    fireEvent.click(screen.getByTestId('mvd-odbior-oblicz'));
    await screen.findByTestId('mvd-odbior-wynik');

    // Drugi wiersz źródłowy = LINE-2 / P / poza tolerancją.
    fireEvent.click(screen.getAllByTestId('mvd-wyn-wiersz')[1]);
    const tag = screen.getByTestId('mvd-odbior-tag');
    expect(tag).toHaveTextContent('poza tolerancją');
    expect(tag.className).toContain('mvd-odbior-tag--err');
  });

  it('ślad WHITE BOX per wiersz tylko w trybie eksperckim', async () => {
    ustawPrzebieg();
    post.mockResolvedValue(widokZgodnosciFixture());
    render(<EkranOdbioru trybZaawansowania="expert" />);
    wypelnijPomiarU();
    fireEvent.click(screen.getByTestId('mvd-odbior-oblicz'));
    await screen.findByTestId('mvd-odbior-wynik');

    fireEvent.click(screen.getAllByTestId('mvd-wyn-wiersz')[0]); // BUS-1 / U
    fireEvent.click(screen.getByTestId('mvd-odbior-slad-otworz'));
    expect(screen.getByTestId('mvd-odbior-slad')).toHaveTextContent('Werdykt: w tolerancji');
    // Hash wejścia widoczny w trybie eksperckim.
    expect(screen.getByTestId('mvd-odbior-eksp')).toHaveTextContent('zgodnosc-hash-abc');
  });

  it('błąd 422 z backendu → jawny stan błędu z komunikatem PL (detail)', async () => {
    ustawPrzebieg();
    post.mockRejectedValue(
      new Error('Brak jawnej tolerancji napięcia (tolerancje.napiecie_pct).'),
    );
    render(<EkranOdbioru trybZaawansowania="basic" />);
    wypelnijPomiarU();
    fireEvent.click(screen.getByTestId('mvd-odbior-oblicz'));
    expect(await screen.findByTestId('mvd-odbior-blad')).toHaveTextContent(
      'Brak jawnej tolerancji napięcia',
    );
  });
});

describe('EkranOdbioru — edytor wierszy i tryb CSV', () => {
  it('dodaje i usuwa wiersze edytora', () => {
    ustawPrzebieg();
    render(<EkranOdbioru trybZaawansowania="basic" />);
    expect(screen.getAllByTestId('mvd-odbior-wiersz')).toHaveLength(1);
    fireEvent.click(screen.getByTestId('mvd-odbior-dodaj'));
    expect(screen.getAllByTestId('mvd-odbior-wiersz')).toHaveLength(2);
    fireEvent.click(screen.getByTestId('mvd-odbior-usun-1'));
    expect(screen.getAllByTestId('mvd-odbior-wiersz')).toHaveLength(1);
  });

  it('tryb CSV: pole tekstowe przekazuje surowe dane, POST z polem csv', () => {
    ustawPrzebieg();
    post.mockReturnValue(new Promise(() => {})); // bieg trwa — asercja tylko na wywołaniu
    render(<EkranOdbioru trybZaawansowania="basic" />);
    fireEvent.click(screen.getByTestId('mvd-odbior-tryb-csv'));
    fireEvent.change(screen.getByTestId('mvd-odbior-csv'), {
      target: { value: 'element_ref;wielkosc;wartosc;jednostka\nBUS-1;U;15,3;kV' },
    });
    fireEvent.change(screen.getByTestId('mvd-odbior-tol-napiecie'), { target: { value: '5' } });
    fireEvent.click(screen.getByTestId('mvd-odbior-oblicz'));
    expect(post).toHaveBeenCalledWith({
      run_id: 'run-lf-1',
      csv: 'element_ref;wielkosc;wartosc;jednostka\nBUS-1;U;15,3;kV',
      tolerancje: { napiecie_pct: 5 },
    });
  });
});
