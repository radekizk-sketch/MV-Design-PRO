/*
 * Testy okna „Ranking punktów przyłączenia" (kryteria karty §3). Weryfikują:
 * stan braku przebiegu, jawny bieg z parametrami i wyborem węzłów, SORTOWALNĄ tabelę
 * wzorca z domyślnym rankingiem malejącym po mocy, kolumnę typu modułu NC RfG z klasyfikacji
 * BACKENDU (`GET /api/ncrfg-tests/modul` — jedno zapytanie na unikalną parę moc × napięcie,
 * atrapa na granicy `fetch` ze sprawdzeniem kluczy OpenAPI), przyrost strat i skrajne
 * napięcia (z „—" przy braku granicy), wybór wiersza → szczegół węzła ze śladem scenariuszy
 * i klasyfikacją, tryb ekspercki i stan błędu. Klient zdolności mockowany na granicy modułu.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { odpowiedzKlasyfikacji } from '../../ncrfg/__tests__/atrapaKlasyfikacji';
import { EkranRankingu } from '../EkranRankingu';
import { przebiegFixture, snapshotFixture, widokRankinguFixture } from './fixtures';

const pobierz = vi.fn();
vi.mock('../../api', () => ({
  pobierzZdolnoscPrzylaczeniowa: (zapytanie: unknown) => pobierz(zapytanie),
}));

const fetchKlasyfikacji = vi.fn(async (url: string) => {
  const odpowiedz = odpowiedzKlasyfikacji(url);
  if (!odpowiedz) throw new Error(`atrapa rankingu: nieoczekiwane zapytanie ${url}`);
  return odpowiedz;
});

function ustawGotowyRozplyw() {
  useExecutionRunsStore.setState({
    runs: [przebiegFixture({ id: 'lf-run', analysis_type: 'LOAD_FLOW', status: 'DONE' })],
    activeRunId: 'lf-run',
  });
  useSnapshotStore.setState({ snapshot: snapshotFixture() });
}

async function zbudujRanking(tryb: 'basic' | 'expert' = 'basic') {
  pobierz.mockResolvedValue(widokRankinguFixture());
  render(<EkranRankingu trybZaawansowania={tryb} />);
  fireEvent.click(screen.getByTestId('mvd-rank-oblicz'));
  await screen.findByTestId('mvd-rank-wynik');
}

beforeEach(() => {
  useExecutionRunsStore.getState().reset();
  useSnapshotStore.getState().reset();
  vi.stubGlobal('fetch', fetchKlasyfikacji);
});
afterEach(() => {
  useExecutionRunsStore.getState().reset();
  useSnapshotStore.getState().reset();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('EkranRankingu — brak przebiegu rozpływu (kryterium 1)', () => {
  it('bez zakończonego rozpływu pokazuje instrukcję, bez formularza i bez wywołania API', async () => {
    render(<EkranRankingu trybZaawansowania="basic" />);
    // Bez przebiegu nie ma wyniku, więc nie ma też zapytań o klasyfikację modułu.
    await act(async () => {});
    expect(screen.getByTestId('mvd-rank-brak-przebiegu')).toHaveTextContent(
      'Brak zakończonego przebiegu rozpływu mocy',
    );
    expect(screen.queryByTestId('mvd-rank-parametry')).not.toBeInTheDocument();
    expect(pobierz).not.toHaveBeenCalled();
    expect(fetchKlasyfikacji).not.toHaveBeenCalled();
  });
});

describe('EkranRankingu — jawny bieg (kryterium 1)', () => {
  beforeEach(ustawGotowyRozplyw);

  it('z przebiegiem pokazuje formularz i stan „uruchom", nie woła zdolności przed kliknięciem', async () => {
    render(<EkranRankingu trybZaawansowania="basic" />);
    expect(screen.getByTestId('mvd-rank-parametry')).toBeInTheDocument();
    // Operator nie jest parametrem rankingu: klasyfikacja art. 5 nie zależy od profilu
    // operatora, a zdolność przyłączeniowa go nie przyjmuje (zero kontrolki-fantomu).
    expect(screen.queryByTestId('mvd-rank-operator')).toBeNull();
    expect(screen.getByTestId('mvd-rank-idle')).toBeInTheDocument();
    expect(pobierz).not.toHaveBeenCalled();
  });

  it('kliknięcie „Zbuduj ranking" woła zdolność z przebiegiem i domyślnymi parametrami', async () => {
    await zbudujRanking();
    expect(pobierz).toHaveBeenCalledWith({
      runId: 'lf-run',
      candidateBusRefs: undefined,
      stepMw: 0.5,
      maxSteps: 40,
    });
  });

  it('wybór węzłów przekazuje candidate_bus_refs do zapytania', async () => {
    pobierz.mockResolvedValue(widokRankinguFixture());
    render(<EkranRankingu trybZaawansowania="basic" />);
    fireEvent.click(screen.getByTestId('mvd-rank-wybor-bus-a'));
    fireEvent.click(screen.getByTestId('mvd-rank-oblicz'));
    await screen.findByTestId('mvd-rank-wynik');
    expect(pobierz.mock.calls[0][0].candidateBusRefs).toEqual(['bus-a']);
  });

  it('błąd końcówki → jawny stan błędu z komunikatem', async () => {
    pobierz.mockRejectedValue(new Error('422 zły przebieg'));
    render(<EkranRankingu trybZaawansowania="basic" />);
    fireEvent.click(screen.getByTestId('mvd-rank-oblicz'));
    expect(await screen.findByTestId('mvd-rank-blad')).toHaveTextContent('422 zły przebieg');
  });
});

describe('EkranRankingu — tabela sortowalna (kryteria 2, 3)', () => {
  beforeEach(ustawGotowyRozplyw);

  it('domyślny ranking malejąco po mocy przyłączalnej (Szyna B → A → C)', async () => {
    await zbudujRanking();
    const wiersze = screen.getAllByTestId('mvd-wyn-wiersz');
    expect(within(wiersze[0]).getByText('Szyna B')).toBeInTheDocument();
    expect(within(wiersze[1]).getByText('Szyna A')).toBeInTheDocument();
    expect(within(wiersze[2]).getByText('Szyna C')).toBeInTheDocument();
    expect(within(wiersze[0]).getByText('1,500')).toBeInTheDocument();
  });

  it('kliknięcie nagłówka mocy sortuje rosnąco (odwraca kolejność na C → A → B)', async () => {
    await zbudujRanking();
    fireEvent.click(within(screen.getByTestId('mvd-wyn-th-moc')).getByRole('button'));
    const wiersze = screen.getAllByTestId('mvd-wyn-wiersz');
    expect(within(wiersze[0]).getByText('Szyna C')).toBeInTheDocument();
    expect(within(wiersze[2]).getByText('Szyna B')).toBeInTheDocument();
  });

  it('przyrost strat [kW] i skrajne napięcia [p.u.]; brak granicy → „—"', async () => {
    await zbudujRanking();
    const wiersze = screen.getAllByTestId('mvd-wyn-wiersz');
    expect(within(wiersze[0]).getByText('150,000')).toBeInTheDocument();
    expect(within(wiersze[0]).getByText('0,960 / 1,030')).toBeInTheDocument();
    // Węzeł C (ostatni) bez granicy: przyrost strat i napięcia jako „—".
    expect(within(wiersze[2]).getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });
});

describe('EkranRankingu — typ modułu NC RfG z klasyfikacji backendu (kryterium 4)', () => {
  beforeEach(ustawGotowyRozplyw);

  it('kolumna typu z odpowiedzi /modul (B, B), „—" bez mocy; jedno zapytanie na unikalną parę, w kW', async () => {
    await zbudujRanking();
    const wiersze = await screen.findAllByTestId('mvd-wyn-wiersz');
    await waitFor(() => expect(within(wiersze[0]).getByText('B')).toBeInTheDocument());
    expect(within(wiersze[1]).getByText('B')).toBeInTheDocument();
    expect(within(wiersze[2]).getAllByText('—').length).toBeGreaterThanOrEqual(3);
    // Tylko zapytania klasyfikacji — nagłówek świeżości ekranu czyta osobno przebieg
    // (`/api/analysis-runs/{id}`), co nie jest przedmiotem tego kryterium.
    const adresy = fetchKlasyfikacji.mock.calls
      .map(([url]) => new URL(url, 'http://localhost'))
      .filter((a) => a.pathname === '/api/ncrfg-tests/modul');
    expect(adresy.map((a) => a.searchParams.get('p_max_kw')).sort()).toEqual(['1500', '500']);
    for (const adres of adresy) expect([...adres.searchParams.keys()].sort()).toEqual(['napiecie_kv', 'p_max_kw']);
  });
});

describe('EkranRankingu — szczegół węzła ze śladem scenariuszy (kryterium 5)', () => {
  beforeEach(ustawGotowyRozplyw);

  it('bez wyboru wiersza pokazuje podpowiedź, po wyborze — szczegół i ślad scenariuszy', async () => {
    await zbudujRanking();
    expect(screen.getByTestId('mvd-rank-brak-wyboru')).toBeInTheDocument();
    const wiersze = screen.getAllByTestId('mvd-wyn-wiersz');
    fireEvent.click(wiersze[1]); // Szyna A
    const szczegol = await screen.findByTestId('mvd-rank-szczegol');
    expect(szczegol).toHaveTextContent('Szyna A');
    await waitFor(() =>
      expect(within(szczegol).getByTestId('mvd-rank-szczegol-klasa')).toHaveAttribute('data-stan', 'gotowe'),
    );
    const slad = within(szczegol).getByTestId('mvd-rank-slad');
    expect(slad).toHaveTextContent('Dopuszczalny');
    expect(slad).toHaveTextContent('Niedopuszczalny');
  });
});

describe('EkranRankingu — tryb ekspercki (identyfikatory)', () => {
  beforeEach(ustawGotowyRozplyw);

  it('tryb podstawowy ukrywa kolumnę identyfikatora i identyfikator przebiegu', async () => {
    await zbudujRanking('basic');
    expect(screen.queryByTestId('mvd-wyn-th-identyfikator')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mvd-wyn-run-id')).not.toBeInTheDocument();
  });

  it('tryb ekspercki odsłania kolumnę identyfikatora i identyfikator przebiegu', async () => {
    await zbudujRanking('expert');
    expect(screen.getByTestId('mvd-wyn-th-identyfikator')).toBeInTheDocument();
    // Intencja BEZ ZMIAN: w trybie eksperckim widać identyfikator przebiegu.
    // Zmieniło się ŹRÓDŁO (V12K-265): dawniej `context.trace_id` z odpowiedzi
    // (fixture: 'run-lf-1'), dziś ten sam identyfikator, którym pytaliśmy o wynik
    // (fixture: 'lf-run', patrz asercja zapytania wyżej). Nazwa `trace_id` w
    // odpowiedzi kłamie — niesie `str(run.id)`, a nie skrót treści śladu — więc
    // ekran nie może na niej stać. Zgodność nagłówka z zapytaniem jest tu
    // mocniejszą asercją niż poprzednia.
    expect(screen.getByTestId('mvd-wyn-run-id')).toHaveTextContent('lf-run');
  });
});
