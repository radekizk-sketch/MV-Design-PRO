/*
 * Testy okna „Ranking punktów przyłączenia" (kryteria karty §3). Weryfikują:
 * stan braku przebiegu, jawny bieg z parametrami i wyborem węzłów, SORTOWALNĄ tabelę
 * wzorca z domyślnym rankingiem malejącym po mocy, kolumnę klasy NC RfG (mapowanie
 * słownikowe), przyrost strat i skrajne napięcia (z „—" przy braku granicy), wybór
 * wiersza → szczegół węzła ze śladem scenariuszy, tryb ekspercki i stan błędu.
 * API i store'y mockowane/ustawiane; fixtures 1:1 z backendem (pola D3a).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { EkranRankingu } from '../EkranRankingu';
import { katalogFixture, przebiegFixture, snapshotFixture, widokRankinguFixture } from './fixtures';

const pobierz = vi.fn();
const pobierzKatalog = vi.fn();
vi.mock('../../api', () => ({
  pobierzZdolnoscPrzylaczeniowa: (zapytanie: unknown) => pobierz(zapytanie),
  pobierzKatalogKlasNcRfg: () => pobierzKatalog(),
}));

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
  pobierzKatalog.mockResolvedValue(katalogFixture());
});
afterEach(() => {
  useExecutionRunsStore.getState().reset();
  useSnapshotStore.getState().reset();
  vi.clearAllMocks();
});

describe('EkranRankingu — brak przebiegu rozpływu (kryterium 1)', () => {
  it('bez zakończonego rozpływu pokazuje instrukcję, bez formularza i bez wywołania API', async () => {
    render(<EkranRankingu trybZaawansowania="basic" />);
    // Montaż pobiera katalog klas NC RfG (mikrotaski), ale bez przebiegu
    // formularz (a z nim select operatora) nie jest renderowany — skutek fetchu
    // nie ma reprezentacji w UI, więc nie ma na co czekać przez findBy*/waitFor.
    // Puste act(async) domyka te mikrotaski w act — bez niego React zgłasza
    // „An update to EkranRankingu was not wrapped in act(...)".
    await act(async () => {});
    expect(screen.getByTestId('mvd-rank-brak-przebiegu')).toHaveTextContent(
      'Brak zakończonego przebiegu rozpływu mocy',
    );
    expect(screen.queryByTestId('mvd-rank-parametry')).not.toBeInTheDocument();
    expect(pobierz).not.toHaveBeenCalled();
  });
});

describe('EkranRankingu — jawny bieg (kryterium 1)', () => {
  beforeEach(ustawGotowyRozplyw);

  it('z przebiegiem pokazuje formularz i stan „uruchom", nie woła zdolności przed kliknięciem', async () => {
    render(<EkranRankingu trybZaawansowania="basic" />);
    // Realny stan końcowy montażu: katalog klas NC RfG wczytany → opcja
    // operatora w selekcie formularza (domyka aktualizację stanu w act).
    await screen.findByRole('option', { name: 'ENEA Operator' });
    expect(screen.getByTestId('mvd-rank-parametry')).toBeInTheDocument();
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

describe('EkranRankingu — klasa NC RfG (kryterium 4)', () => {
  beforeEach(ustawGotowyRozplyw);

  it('kolumna klasy pokazuje mapowanie słownikowe (B, A) oraz „—" bez mocy', async () => {
    await zbudujRanking();
    const wiersze = await screen.findAllByTestId('mvd-wyn-wiersz');
    expect(await within(wiersze[0]).findByText('B')).toBeInTheDocument();
    expect(await within(wiersze[1]).findByText('A')).toBeInTheDocument();
    expect(within(wiersze[2]).getAllByText('—').length).toBeGreaterThanOrEqual(3);
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
