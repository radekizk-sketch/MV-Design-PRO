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
import { useSelectionStore } from '../../../../ui/selection/store';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { useShellStore } from '../../../shell/useShellStore';
import { EkranOdbioru } from '../EkranOdbioru';
import { OPCJA_ELEMENTU_SPOZA_MODELU } from '../odbiorModel';
import { widokZgodnosciFixture } from './fixtures';

const post = vi.fn();
const pobierzZaciski = vi.fn();

vi.mock('../api', () => ({
  postZgodnoscPowykonawcza: (zadanie: unknown) => post(zadanie),
  fetchZaciskiGalezi: (runId: string) => pobierzZaciski(runId),
}));

/** Odpowiedź `GET …/zaciski-galezi` (kształt `zaciski_galezi_migawki` 1:1). */
const ZACISKI_BIEGU = {
  run_id: 'run-lf-1',
  zaciski: {
    'LINE-2': {
      od: { szyna_ref: 'BUS-GPZ', etykieta_pl: 'Zacisk początkowy — szyna GPZ SN' },
      do: { szyna_ref: 'BUS-1', etykieta_pl: 'Zacisk końcowy — szyna Stacja 1' },
    },
  },
};

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

/**
 * Migawka modelu (karta #145): projektant wybiera element pomiaru z listy po NAZWIE,
 * a raport nazywa elementy nazwami z modelu. `LINE-9` to gałąź modelu spoza gałęzi
 * przebiegu (np. dodana po obliczeniu) — ścieżka „element spoza gałęzi przebiegu".
 */
function zasiejModel(): void {
  useSnapshotStore.setState({
    snapshot: {
      buses: [
        { ref_id: 'BUS-1', id: 'b1', name: 'Szyna Stacja 1', voltage_kv: 15 },
        { ref_id: 'BUS-GPZ', id: 'b0', name: 'Szyna GPZ SN', voltage_kv: 15 },
      ],
      branches: [
        { ref_id: 'LINE-2', id: 'l2', name: 'Linia GPZ – Stacja 1', type: 'line_overhead' },
        { ref_id: 'LINE-9', id: 'l9', name: 'Linia rezerwowa', type: 'cable' },
      ],
      transformers: [{ ref_id: 'TRAFO-4', id: 't4', name: 'Transformator Stacja 1' }],
    },
  } as never);
}

beforeEach(() => {
  useExecutionRunsStore.setState({ runs: [], activeRunId: null });
  pobierzZaciski.mockResolvedValue(ZACISKI_BIEGU);
  zasiejModel();
});
afterEach(() => {
  vi.clearAllMocks();
  useSnapshotStore.setState({ snapshot: null } as never);
});

describe('EkranOdbioru — stany wejściowe', () => {
  it('bez przebiegu rozpływu → uczciwa instrukcja, bez wołań API', () => {
    render(<EkranOdbioru trybZaawansowania="basic" onOtworzDowod={() => undefined} />);
    expect(screen.getByTestId('mvd-odbior-brak-przebiegu')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-odbior-oblicz')).not.toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('walidacja tolerancji przed wysłaniem → błędy PL, bez POST', () => {
    ustawPrzebieg();
    render(<EkranOdbioru trybZaawansowania="basic" onOtworzDowod={() => undefined} />);
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
    render(<EkranOdbioru trybZaawansowania="basic" onOtworzDowod={() => undefined} />);
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
    render(<EkranOdbioru trybZaawansowania="basic" onOtworzDowod={() => undefined} />);
    wypelnijPomiarU();
    fireEvent.click(screen.getByTestId('mvd-odbior-oblicz'));

    await screen.findByTestId('mvd-odbior-wynik');
    expect(screen.getAllByTestId('mvd-odbior-chip')).toHaveLength(5);
    const tabela = screen.getByTestId('mvd-wyn-tabela');
    expect(tabela).toHaveTextContent('w tolerancji');
    expect(tabela).toHaveTextContent('poza tolerancją');
    // Sekcja założeń zawsze widoczna: Q po |wartości| i moc na WSKAZANYM zacisku.
    expect(screen.getByTestId('mvd-wyn-zalozenia')).toHaveTextContent('wartości bezwzględnej');
    expect(screen.getByTestId('mvd-wyn-zalozenia')).toHaveTextContent('na zacisku gałęzi');
    // Pomiar mocy bez zacisku: werdykt nazwany, miejsce pomiaru z etykietą backendu.
    expect(tabela).toHaveTextContent('brak miejsca pomiaru');
    expect(tabela).toHaveTextContent('Zacisk początkowy — szyna GPZ SN');
    // Największa odchyłka z podsumowania (przecinek PL).
    expect(screen.getByTestId('mvd-odbior-najwieksza')).toHaveTextContent('12,50');
    // Karta #145: element nazwany z modelu, nigdy referencją.
    expect(screen.getByTestId('mvd-odbior-najwieksza')).toHaveTextContent('Linia GPZ – Stacja 1');
    expect(screen.getByTestId('mvd-odbior-najwieksza')).not.toHaveTextContent('LINE-2');
    expect(tabela).toHaveTextContent('Szyna Stacja 1');
    expect(tabela).not.toHaveTextContent('BUS-1');
  });

  it('pomiar P poza tolerancją NIE dostaje przycisku „Popraw" (typ elementu niejednoznaczny — F-E6.2)', async () => {
    ustawPrzebieg();
    // Domyślna fixtura: jedyne przekroczenie to LINE-2 / P (moc). Typ elementu dla
    // P/Q nie jest jednoznaczny w kontrakcie → uczciwie brak akcji (zero zgadywania).
    post.mockResolvedValue(widokZgodnosciFixture());
    render(<EkranOdbioru trybZaawansowania="basic" onOtworzDowod={() => undefined} />);
    wypelnijPomiarU();
    fireEvent.click(screen.getByTestId('mvd-odbior-oblicz'));
    await screen.findByTestId('mvd-odbior-wynik');
    expect(screen.queryByTestId('mvd-wyn-popraw')).toBeNull();
  });

  it('pomiar U poza tolerancją → „Popraw" zaznacza węzeł (Bus) i przechodzi do „Schemat"', async () => {
    ustawPrzebieg();
    useSelectionStore.setState({ selectedElement: null, sldCenterOnElement: null } as never);
    useShellStore.setState({ activeSpace: 'wyniki' });
    const bazowy = widokZgodnosciFixture();
    // Wariant: napięcie na BUS-1 poza tolerancją (werdykt steruje ostrzeżeniem adaptera).
    post.mockResolvedValue({
      ...bazowy,
      wiersze: [{ ...bazowy.wiersze[0], werdykt: 'poza tolerancją' }],
    });
    render(<EkranOdbioru trybZaawansowania="basic" onOtworzDowod={() => undefined} />);
    wypelnijPomiarU();
    fireEvent.click(screen.getByTestId('mvd-odbior-oblicz'));
    await screen.findByTestId('mvd-odbior-wynik');

    fireEvent.click(screen.getByTestId('mvd-wyn-popraw'));
    const sel = useSelectionStore.getState();
    expect(sel.selectedElement).toMatchObject({ id: 'BUS-1', type: 'Bus' });
    expect(sel.sldCenterOnElement).toBe('BUS-1');
    expect(useShellStore.getState().activeSpace).toBe('schemat');
  });

  it('werdykt prezentowany kolorem tokenów w panelu szczegółu (wybór wiersza)', async () => {
    ustawPrzebieg();
    post.mockResolvedValue(widokZgodnosciFixture());
    render(<EkranOdbioru trybZaawansowania="basic" onOtworzDowod={() => undefined} />);
    wypelnijPomiarU();
    fireEvent.click(screen.getByTestId('mvd-odbior-oblicz'));
    await screen.findByTestId('mvd-odbior-wynik');

    // Drugi wiersz źródłowy = LINE-2 / P / poza tolerancją.
    fireEvent.click(screen.getAllByTestId('mvd-wyn-wiersz')[1]);
    expect(screen.getByTestId('mvd-odbior-szczegol')).toHaveTextContent('Linia GPZ – Stacja 1');
    const tag = screen.getByTestId('mvd-odbior-tag');
    expect(tag).toHaveTextContent('poza tolerancją');
    expect(tag.className).toContain('mvd-odbior-tag--err');
  });

  it('ślad WHITE BOX per wiersz tylko w trybie eksperckim', async () => {
    ustawPrzebieg();
    post.mockResolvedValue(widokZgodnosciFixture());
    render(<EkranOdbioru trybZaawansowania="expert" onOtworzDowod={() => undefined} />);
    wypelnijPomiarU();
    fireEvent.click(screen.getByTestId('mvd-odbior-oblicz'));
    await screen.findByTestId('mvd-odbior-wynik');

    fireEvent.click(screen.getAllByTestId('mvd-wyn-wiersz')[0]); // BUS-1 / U
    fireEvent.click(screen.getByTestId('mvd-odbior-slad-otworz'));
    expect(screen.getByTestId('mvd-odbior-slad')).toHaveTextContent('Werdykt: w tolerancji');
    // Identyfikator wejścia wyłącznie w „Informacjach audytowych" trybu eksperckiego (#145).
    fireEvent.click(screen.getByTestId('mvd-odbior-eksp-przelacz'));
    expect(screen.getByTestId('mvd-odbior-eksp-lista')).toHaveTextContent('zgodnosc-hash-abc');
  });

  it('K3/C1 realna ścieżka: 2× klik na wartości z modelu → onOtworzDowod(element_ref)', async () => {
    ustawPrzebieg();
    post.mockResolvedValue(widokZgodnosciFixture());
    const onOtworzDowod = vi.fn();
    render(<EkranOdbioru trybZaawansowania="basic" onOtworzDowod={onOtworzDowod} />);
    wypelnijPomiarU();
    fireEvent.click(screen.getByTestId('mvd-odbior-oblicz'));
    await screen.findByTestId('mvd-odbior-wynik');

    // Wartość z modelu BUS-1 (15,150 kV) renderuje się jako przycisk dowodu wzorca.
    const przycisk = screen.getByText('15,150').closest('button');
    expect(przycisk).not.toBeNull();
    fireEvent.doubleClick(przycisk!);
    expect(onOtworzDowod).toHaveBeenCalledWith('BUS-1');
  });

  it('błąd 422 z backendu → jawny stan błędu z komunikatem PL (detail)', async () => {
    ustawPrzebieg();
    post.mockRejectedValue(
      new Error('Brak jawnej tolerancji napięcia (tolerancje.napiecie_pct).'),
    );
    render(<EkranOdbioru trybZaawansowania="basic" onOtworzDowod={() => undefined} />);
    wypelnijPomiarU();
    fireEvent.click(screen.getByTestId('mvd-odbior-oblicz'));
    expect(await screen.findByTestId('mvd-odbior-blad')).toHaveTextContent(
      'Brak jawnej tolerancji napięcia',
    );
  });
});

/**
 * Karta #145 — dobór elementu pomiaru po nazwie z modelu. Iloczyn cech: wielkość {U, P}
 * × pochodzenie opcji {szyny, gałęzie i transformatory} × element bieżący {pasuje do
 * wielkości, nie pasuje po zmianie wielkości}.
 */
describe('EkranOdbioru — wybór elementu pomiaru z modelu', () => {
  /** Opcje elementów modelu (bez pustej zachęty i bez „Element spoza modelu"). */
  function opcje(): { value: string; text: string }[] {
    return opcjeWiersza0().filter((o) => o.value !== OPCJA_ELEMENTU_SPOZA_MODELU);
  }

  it('U → same szyny, P → gałęzie i transformatory; opcje pokazują nazwy, nie referencje', () => {
    ustawPrzebieg();
    render(<EkranOdbioru trybZaawansowania="basic" onOtworzDowod={() => undefined} />);
    const u = opcje().filter((o) => o.value !== '');
    expect(u.map((o) => o.value).sort()).toEqual(['BUS-1', 'BUS-GPZ']);
    expect(u.map((o) => o.text)).toEqual(['Szyna GPZ SN', 'Szyna Stacja 1']);

    fireEvent.change(screen.getByTestId('mvd-odbior-wielkosc-0'), { target: { value: 'P' } });
    const p = opcje().filter((o) => o.value !== '');
    expect(p.map((o) => o.value).sort()).toEqual(['LINE-2', 'LINE-9', 'TRAFO-4']);
    p.forEach((o) => expect(o.text).not.toBe(o.value));
  });

  it('element wybrany dla P zostaje na liście po zmianie wielkości na U (bez cichej utraty)', () => {
    ustawPrzebieg();
    render(<EkranOdbioru trybZaawansowania="basic" onOtworzDowod={() => undefined} />);
    fireEvent.change(screen.getByTestId('mvd-odbior-wielkosc-0'), { target: { value: 'P' } });
    fireEvent.change(screen.getByTestId('mvd-odbior-element-0'), { target: { value: 'LINE-2' } });
    fireEvent.change(screen.getByTestId('mvd-odbior-wielkosc-0'), { target: { value: 'U' } });
    const pole = screen.getByTestId('mvd-odbior-element-0') as HTMLSelectElement;
    expect(pole.value).toBe('LINE-2');
    expect(pole.selectedOptions[0].textContent).toBe('Linia GPZ – Stacja 1');
  });

  it('element spoza modelu: oznaczenie z protokołu trafia do żądania, bez podpowiedzi z listy', () => {
    ustawPrzebieg();
    post.mockReturnValue(new Promise(() => {}));
    render(<EkranOdbioru trybZaawansowania="basic" onOtworzDowod={() => undefined} />);
    expect(screen.queryByTestId('mvd-odbior-element-protokol-0')).toBeNull();
    fireEvent.change(screen.getByTestId('mvd-odbior-element-0'), {
      target: { value: OPCJA_ELEMENTU_SPOZA_MODELU },
    });
    fireEvent.change(screen.getByTestId('mvd-odbior-element-protokol-0'), {
      target: { value: 'POLE-REZERWOWE-12' },
    });
    // Wpisane oznaczenie nie staje się opcją listy elementów modelu.
    expect(
      opcjeWiersza0().some((o) => o.value === 'POLE-REZERWOWE-12'),
    ).toBe(false);
    fireEvent.change(screen.getByTestId('mvd-odbior-wartosc-0'), { target: { value: '15,3' } });
    fireEvent.change(screen.getByTestId('mvd-odbior-tol-napiecie'), { target: { value: '5' } });
    fireEvent.click(screen.getByTestId('mvd-odbior-oblicz'));
    expect(post).toHaveBeenCalledWith({
      run_id: 'run-lf-1',
      pomiary: [{ element_ref: 'POLE-REZERWOWE-12', wielkosc: 'U', wartosc: 15.3, jednostka: 'kV' }],
      tolerancje: { napiecie_pct: 5 },
    });

    // Powrót do elementu z modelu chowa pole protokołu.
    fireEvent.change(screen.getByTestId('mvd-odbior-element-0'), { target: { value: 'BUS-1' } });
    expect(screen.queryByTestId('mvd-odbior-element-protokol-0')).toBeNull();
  });
});

function opcjeWiersza0(): { value: string; text: string }[] {
  const pole = screen.getByTestId('mvd-odbior-element-0') as HTMLSelectElement;
  return [...pole.options].map((o) => ({ value: o.value, text: o.textContent ?? '' }));
}

describe('EkranOdbioru — edytor wierszy i tryb CSV', () => {
  it('dodaje i usuwa wiersze edytora', () => {
    ustawPrzebieg();
    render(<EkranOdbioru trybZaawansowania="basic" onOtworzDowod={() => undefined} />);
    expect(screen.getAllByTestId('mvd-odbior-wiersz')).toHaveLength(1);
    fireEvent.click(screen.getByTestId('mvd-odbior-dodaj'));
    expect(screen.getAllByTestId('mvd-odbior-wiersz')).toHaveLength(2);
    fireEvent.click(screen.getByTestId('mvd-odbior-usun-1'));
    expect(screen.getAllByTestId('mvd-odbior-wiersz')).toHaveLength(1);
  });

  it('tryb CSV: pole tekstowe przekazuje surowe dane, POST z polem csv', () => {
    ustawPrzebieg();
    post.mockReturnValue(new Promise(() => {})); // bieg trwa — asercja tylko na wywołaniu
    render(<EkranOdbioru trybZaawansowania="basic" onOtworzDowod={() => undefined} />);
    fireEvent.click(screen.getByTestId('mvd-odbior-tryb-csv'));
    fireEvent.change(screen.getByTestId('mvd-odbior-csv'), {
      target: { value: 'element_ref;wielkosc;wartosc;jednostka;zacisk\nBUS-1;U;15,3;kV;' },
    });
    fireEvent.change(screen.getByTestId('mvd-odbior-tol-napiecie'), { target: { value: '5' } });
    fireEvent.click(screen.getByTestId('mvd-odbior-oblicz'));
    expect(post).toHaveBeenCalledWith({
      run_id: 'run-lf-1',
      csv: 'element_ref;wielkosc;wartosc;jednostka;zacisk\nBUS-1;U;15,3;kV;',
      tolerancje: { napiecie_pct: 5 },
    });
  });
});

/**
 * Miejsce pomiaru mocy gałęzi (decyzja O-51, klasa P9 miejsce 12). Iloczyn cech: wielkość
 * {U, P, Q} × element {gałąź przebiegu, spoza gałęzi} × wskazanie {brak, od, do}; etykiety
 * z backendu, brak zaznaczenia domyślnego, kliki natywne.
 */
describe('EkranOdbioru — zacisk pomiaru mocy gałęzi', () => {
  function wiersz0(element: string, wielkosc: 'U' | 'P' | 'Q', wartosc: string) {
    // Najpierw wielkość: lista elementów zależy od wielkości (szyny dla U, gałęzie dla P/Q).
    fireEvent.change(screen.getByTestId('mvd-odbior-wielkosc-0'), { target: { value: wielkosc } });
    fireEvent.change(screen.getByTestId('mvd-odbior-element-0'), { target: { value: element } });
    fireEvent.change(screen.getByTestId('mvd-odbior-wartosc-0'), { target: { value: wartosc } });
  }

  it.each(['P', 'Q'] as const)(
    '%s na gałęzi: etykiety zacisków z backendu, bez domyślnego; klik → zacisk w żądaniu',
    async (wielkosc) => {
      ustawPrzebieg();
      post.mockReturnValue(new Promise(() => {}));
      render(<EkranOdbioru trybZaawansowania="basic" onOtworzDowod={() => undefined} />);
      wiersz0('LINE-2', wielkosc, '4,5');
      fireEvent.change(screen.getByTestId('mvd-odbior-tol-moc'), { target: { value: '10' } });

      const od = (await screen.findByTestId('mvd-odbior-zacisk-0-od')) as HTMLInputElement;
      const doZ = screen.getByTestId('mvd-odbior-zacisk-0-do') as HTMLInputElement;
      expect(pobierzZaciski).toHaveBeenCalledWith('run-lf-1');
      expect(od.checked || doZ.checked).toBe(false);
      const pole = screen.getByTestId('mvd-odbior-zacisk-0');
      expect(pole).toHaveTextContent('Zacisk początkowy — szyna GPZ SN');
      expect(pole).toHaveTextContent('Zacisk końcowy — szyna Stacja 1');
      expect(screen.getByTestId('mvd-odbior-zacisk-brak-0')).toBeInTheDocument();

      fireEvent.click(doZ);
      expect(doZ.checked).toBe(true);
      expect(screen.queryByTestId('mvd-odbior-zacisk-brak-0')).toBeNull();
      fireEvent.click(screen.getByTestId('mvd-odbior-oblicz'));
      expect(post).toHaveBeenCalledWith({
        run_id: 'run-lf-1',
        pomiary: [
          {
            element_ref: 'LINE-2',
            wielkosc,
            wartosc: 4.5,
            jednostka: wielkosc === 'P' ? 'MW' : 'Mvar',
            zacisk: 'do',
          },
        ],
        tolerancje: { moc_pct: 10 },
      });
    },
  );

  it('P bez wskazania: żądanie BEZ zacisku (odmowę nazywa backend), nie z domyślnym końcem', async () => {
    ustawPrzebieg();
    post.mockReturnValue(new Promise(() => {}));
    render(<EkranOdbioru trybZaawansowania="basic" onOtworzDowod={() => undefined} />);
    wiersz0('LINE-2', 'P', '4,5');
    fireEvent.change(screen.getByTestId('mvd-odbior-tol-moc'), { target: { value: '10' } });
    await screen.findByTestId('mvd-odbior-zacisk-0-od');
    fireEvent.click(screen.getByTestId('mvd-odbior-oblicz'));
    expect(post).toHaveBeenCalledWith({
      run_id: 'run-lf-1',
      pomiary: [{ element_ref: 'LINE-2', wielkosc: 'P', wartosc: 4.5, jednostka: 'MW' }],
      tolerancje: { moc_pct: 10 },
    });
  });

  it('zmiana elementu albo przejście na U kasuje wskazany zacisk; U nie ma wyboru zacisku', async () => {
    ustawPrzebieg();
    render(<EkranOdbioru trybZaawansowania="basic" onOtworzDowod={() => undefined} />);
    wiersz0('LINE-2', 'P', '4,5');
    fireEvent.click(await screen.findByTestId('mvd-odbior-zacisk-0-od'));
    expect((screen.getByTestId('mvd-odbior-zacisk-0-od') as HTMLInputElement).checked).toBe(true);

    fireEvent.change(screen.getByTestId('mvd-odbior-wielkosc-0'), { target: { value: 'U' } });
    expect(screen.queryByTestId('mvd-odbior-zacisk-0')).toBeNull();
    fireEvent.change(screen.getByTestId('mvd-odbior-wielkosc-0'), { target: { value: 'P' } });
    expect((screen.getByTestId('mvd-odbior-zacisk-0-od') as HTMLInputElement).checked).toBe(false);

    fireEvent.click(screen.getByTestId('mvd-odbior-zacisk-0-do'));
    fireEvent.change(screen.getByTestId('mvd-odbior-element-0'), { target: { value: 'LINE-9' } });
    fireEvent.change(screen.getByTestId('mvd-odbior-element-0'), { target: { value: 'LINE-2' } });
    expect((screen.getByTestId('mvd-odbior-zacisk-0-do') as HTMLInputElement).checked).toBe(false);
  });

  it('element spoza gałęzi przebiegu: jawna informacja, bez przycisków wyboru', async () => {
    ustawPrzebieg();
    render(<EkranOdbioru trybZaawansowania="basic" onOtworzDowod={() => undefined} />);
    wiersz0('LINE-9', 'P', '1');
    expect(await screen.findByTestId('mvd-odbior-zacisk-nie-galaz-0')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-odbior-zacisk-0-od')).toBeNull();
  });

  it('błąd pobrania etykiet: komunikat, bez wyboru zacisku z domysłu', async () => {
    ustawPrzebieg();
    pobierzZaciski.mockRejectedValue(new Error('404'));
    render(<EkranOdbioru trybZaawansowania="basic" onOtworzDowod={() => undefined} />);
    wiersz0('LINE-2', 'P', '1');
    expect(await screen.findByTestId('mvd-odbior-zacisk-blad-0')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-odbior-zacisk-0-od')).toBeNull();
  });
});
