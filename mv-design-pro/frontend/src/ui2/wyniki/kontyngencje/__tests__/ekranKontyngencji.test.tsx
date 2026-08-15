/*
 * Testy okna „Kontyngencje N-1" (karta EKRAN-N1, decyzja D8).
 *
 * Iloczyn cech, na którym defekt mógłby się schować:
 *   stan { brak przebiegu · zapowiedź zakresu · po biegu · błąd }
 *   × zakres { pełny · zawężony · pusty }
 *   × kontyngencja { policzona · niezbieżna · wykluczona }
 *   × przypadek bazowy { czysty · Z NARUSZENIAMI }
 *   × tryb { podstawowy · ekspercki }.
 *
 * ŚCIEŻKA NATYWNA: interakcje idą przez `userEvent` (realny klik, realna zmiana
 * pola wyboru), a klient `api.ts` jest ćwiczony NAPRAWDĘ na globalnym `fetch` —
 * bez mockowania modułu. Test, który wymuszałby stan wewnętrzny albo strzelał
 * syntetycznym zdarzeniem, maskowałby defekt realnej drogi użytkownika.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EkranKontyngencji } from '../EkranKontyngencji';
import { KONTYNGENCJE_STRINGS as T } from '../strings';
import { MACIERZ, MACIERZ_Z_NARUSZENIEM_BAZOWYM, ZAKRES } from './fixtures';
import { useAppStateStore } from '../../../../ui/app-state/store';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import type { ExecutionRun } from '../../../../ui/study-cases/types';

function przebieg(
  id: string,
  analysisType: ExecutionRun['analysis_type'],
  status: ExecutionRun['status'] = 'DONE',
): ExecutionRun {
  return {
    id,
    study_case_id: 'case-1',
    analysis_type: analysisType,
    solver_input_hash: 'hash',
    status,
    started_at: null,
    finished_at: null,
    error_message: null,
  };
}

/** Trasowanie po PEŁNEJ ścieżce z separatorem — `startsWith` bez `?`/`scope?`
 *  dopasowałby też zepsuty adres, więc test maskowałby defekt klienta. */
function mockFetch(macierz: unknown = MACIERZ) {
  const spy = vi.fn((url: RequestInfo | URL) => {
    const adres = String(url);
    if (adres.startsWith('/api/insights/n-1-contingency/scope?')) {
      return Promise.resolve({ ok: true, json: async () => ZAKRES } as Response);
    }
    if (adres.startsWith('/api/insights/n-1-contingency?')) {
      return Promise.resolve({ ok: true, json: async () => macierz } as Response);
    }
    return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' } as Response);
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

/** Adresy wywołań biegu macierzy (bez zapowiedzi zakresu i świeżości). */
function wywolaniaBiegu(spy: ReturnType<typeof mockFetch>): string[] {
  return spy.mock.calls
    .map((c) => String(c[0]))
    .filter((adres) => adres.startsWith('/api/insights/n-1-contingency?'));
}

async function zakresGotowy() {
  await waitFor(() => expect(screen.getByTestId('mvd-n1-zakres')).toBeInTheDocument());
}

beforeEach(() => {
  useAppStateStore.setState({ activeRunId: null });
  useExecutionRunsStore.setState({ runs: [], activeRunId: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('EkranKontyngencji — stan zerowy', () => {
  it('bez przebiegu rozpływu: uczciwy stan zerowy z akcją, bez wołania końcówek', () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    useExecutionRunsStore.setState({ runs: [przebieg('sc-1', 'SC_3F')], activeRunId: null });

    render(<EkranKontyngencji trybZaawansowania="basic" />);

    expect(screen.getByTestId('mvd-n1-brak-przebiegu')).toHaveTextContent(T.brakPrzebiegu);
    expect(
      spy.mock.calls.filter((c) => String(c[0]).includes('/api/insights/')),
    ).toHaveLength(0);
  });

  it('błąd zapowiedzi zakresu: komunikat PL z treścią błędu, bez przycisku biegu', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({ ok: false, status: 422, statusText: 'Unprocessable' } as Response),
      ),
    );
    useExecutionRunsStore.setState({ runs: [przebieg('pf-1', 'LOAD_FLOW')], activeRunId: 'pf-1' });

    render(<EkranKontyngencji trybZaawansowania="basic" />);

    await waitFor(() => expect(screen.getByTestId('mvd-n1-zakres-blad')).toBeInTheDocument());
    expect(screen.getByTestId('mvd-n1-zakres-blad')).toHaveTextContent('422');
    expect(screen.queryByTestId('mvd-n1-policz')).not.toBeInTheDocument();
  });
});

describe('EkranKontyngencji — zakres i koszt przed biegiem', () => {
  beforeEach(() => {
    useExecutionRunsStore.setState({ runs: [przebieg('pf-1', 'LOAD_FLOW')], activeRunId: 'pf-1' });
  });

  it('zapowiedź podaje koszt biegu pełnego LICZBAMI z backendu', async () => {
    mockFetch();

    render(<EkranKontyngencji trybZaawansowania="basic" />);
    await zakresGotowy();

    expect(screen.getByTestId('mvd-n1-koszt-kontyngencji')).toHaveTextContent('4');
    expect(screen.getByTestId('mvd-n1-koszt-biegow')).toHaveTextContent('3');
    expect(screen.getByTestId('mvd-n1-koszt-wykluczonych')).toHaveTextContent('1');
  });

  it('koszt NIE jest wyrażony czasem (zakaz liczby zmyślonej)', async () => {
    mockFetch();

    render(<EkranKontyngencji trybZaawansowania="basic" />);
    await zakresGotowy();

    // Sedno: pomiar 2,64 s pochodzi z innego substratu — okno nie ma prawa go
    // przeliczać na tę sieć. Widoczna jest za to jawna nota, DLACZEGO czasu nie ma.
    const koszt = screen.getByTestId('mvd-n1-koszt').textContent ?? '';
    expect(koszt).not.toMatch(/sekund|minut|\bs\b|min\b/i);
    expect(screen.getByTestId('mvd-n1-bez-czasu')).toHaveTextContent('zmyśloną');
  });

  it('bieg NIE startuje sam — dopóki nie ma kliku, końcówka macierzy nie jest wołana', async () => {
    const spy = mockFetch();

    render(<EkranKontyngencji trybZaawansowania="basic" />);
    await zakresGotowy();

    expect(wywolaniaBiegu(spy)).toHaveLength(0);
  });

  it('bieg pełny (klik natywny) POMIJA parametr zakresu', async () => {
    const uzytkownik = userEvent.setup();
    const spy = mockFetch();

    render(<EkranKontyngencji trybZaawansowania="basic" />);
    await zakresGotowy();
    await uzytkownik.click(screen.getByTestId('mvd-n1-policz'));

    await waitFor(() => expect(wywolaniaBiegu(spy)).toHaveLength(1));
    expect(wywolaniaBiegu(spy)[0]).toBe('/api/insights/n-1-contingency?run_id=pf-1');
  });

  it('zawężenie zakresu: wybór elementów natywnym klikiem trafia do wywołania', async () => {
    const uzytkownik = userEvent.setup();
    const spy = mockFetch();

    render(<EkranKontyngencji trybZaawansowania="basic" />);
    await zakresGotowy();
    await uzytkownik.click(screen.getByTestId('mvd-n1-tryb-wybrane'));
    await uzytkownik.click(screen.getByTestId('mvd-n1-element-tr_sn_nn'));
    await uzytkownik.click(screen.getByTestId('mvd-n1-element-ka_magistrala'));
    await uzytkownik.click(screen.getByTestId('mvd-n1-policz'));

    await waitFor(() => expect(wywolaniaBiegu(spy)).toHaveLength(1));
    const adres = wywolaniaBiegu(spy)[0];
    expect(adres).toContain('element_refs=ka_magistrala');
    expect(adres).toContain('element_refs=tr_sn_nn');
    // Elementy NIEzaznaczone nie jadą do biegu (zawężenie jest zawężeniem).
    expect(adres).not.toContain('ln_odg');
  });

  it('lista wyboru pokazuje elementy WYKLUCZONE z uzasadnieniem backendu', async () => {
    const uzytkownik = userEvent.setup();
    mockFetch();

    render(<EkranKontyngencji trybZaawansowania="basic" />);
    await zakresGotowy();
    await uzytkownik.click(screen.getByTestId('mvd-n1-tryb-wybrane'));

    const wykluczony = screen.getByTestId('mvd-n1-element-ln_wyl');
    expect(wykluczony).toHaveTextContent(T.wykluczonyZnacznik);
    expect(wykluczony).toHaveAttribute('title', expect.stringContaining('już wyłączony'));
  });

  it('PUSTY zakres blokuje start i NIE wysyła żądania (nie zamienia się w bieg pełny)', async () => {
    const uzytkownik = userEvent.setup();
    const spy = mockFetch();

    render(<EkranKontyngencji trybZaawansowania="basic" />);
    await zakresGotowy();
    await uzytkownik.click(screen.getByTestId('mvd-n1-tryb-wybrane'));

    const przycisk = screen.getByTestId('mvd-n1-policz');
    expect(przycisk).toBeDisabled();
    expect(screen.getByTestId('mvd-n1-pusty-zakres')).toHaveTextContent(T.policzPustyZakres);
    await uzytkownik.click(przycisk);
    expect(wywolaniaBiegu(spy)).toHaveLength(0);
  });

  it('„Zaznacz wszystkie" bierze KOMPLET elementów zapowiedzi (bez własnego filtra)', async () => {
    const uzytkownik = userEvent.setup();
    const spy = mockFetch();

    render(<EkranKontyngencji trybZaawansowania="basic" />);
    await zakresGotowy();
    await uzytkownik.click(screen.getByTestId('mvd-n1-tryb-wybrane'));
    await uzytkownik.click(screen.getByTestId('mvd-n1-zaznacz-wszystkie'));
    await uzytkownik.click(screen.getByTestId('mvd-n1-policz'));

    await waitFor(() => expect(wywolaniaBiegu(spy)).toHaveLength(1));
    const adres = wywolaniaBiegu(spy)[0];
    // Zakaz skracania listy heurystyką: zaznaczenie kompletu wysyła KOMPLET,
    // łącznie z elementem wykluczonym (o jego statusie rozstrzyga backend).
    for (const ref of ZAKRES.elementy.map((e) => e.element_ref)) {
      expect(adres).toContain(`element_refs=${ref}`);
    }
  });

  it('„Odznacz wszystkie" wraca do stanu pustego zakresu (blokada startu)', async () => {
    const uzytkownik = userEvent.setup();
    mockFetch();

    render(<EkranKontyngencji trybZaawansowania="basic" />);
    await zakresGotowy();
    await uzytkownik.click(screen.getByTestId('mvd-n1-tryb-wybrane'));
    await uzytkownik.click(screen.getByTestId('mvd-n1-zaznacz-wszystkie'));
    expect(screen.getByTestId('mvd-n1-policz')).toBeEnabled();

    await uzytkownik.click(screen.getByTestId('mvd-n1-odznacz-wszystkie'));

    expect(screen.getByTestId('mvd-n1-policz')).toBeDisabled();
  });
});

describe('EkranKontyngencji — odczyt macierzy', () => {
  beforeEach(() => {
    useExecutionRunsStore.setState({ runs: [przebieg('pf-1', 'LOAD_FLOW')], activeRunId: 'pf-1' });
  });

  async function policz(macierz: unknown = MACIERZ, tryb: 'basic' | 'expert' = 'basic') {
    const uzytkownik = userEvent.setup();
    mockFetch(macierz);
    render(<EkranKontyngencji trybZaawansowania={tryb} />);
    await zakresGotowy();
    await uzytkownik.click(screen.getByTestId('mvd-n1-policz'));
    await waitFor(() => expect(screen.getByTestId('mvd-n1-bazowy')).toBeInTheDocument());
    return uzytkownik;
  }

  it('przypadek bazowy N-0 jest widoczny ZAWSZE i stoi NAD rankingiem', async () => {
    await policz();

    const bazowy = screen.getByTestId('mvd-n1-bazowy');
    const ranking = screen.getByTestId('mvd-n1-ranking');
    expect(bazowy).toBeInTheDocument();
    // Kolejność w drzewie: N-0 przed rankingiem (DOCUMENT_POSITION_FOLLOWING = 4).
    expect(bazowy.compareDocumentPosition(ranking)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByTestId('mvd-n1-bazowy-przeciazenia')).toHaveTextContent('0');
  });

  it('N-0 Z NARUSZENIAMI pokazuje je uczciwie (substrat bywa przeciążony bez wyłączeń)', async () => {
    await policz(MACIERZ_Z_NARUSZENIEM_BAZOWYM);

    expect(screen.getByTestId('mvd-n1-bazowy-przeciazenia')).toHaveTextContent('1');
    const lista = screen.getByTestId('mvd-n1-bazowy-lista-przeciazen');
    expect(lista).toHaveTextContent('Linia GPZ-B');
    expect(lista).toHaveTextContent('134,74');
    // Powód z backendu, nie własna interpretacja okna.
    expect(lista).toHaveTextContent('przekracza limit');
  });

  it('ranking pokazuje liczniki kategorii w kolejności z backendu', async () => {
    await policz();

    const ranking = screen.getByTestId('mvd-n1-ranking');
    expect(ranking).toHaveTextContent('TR 15/0,4');
    expect(ranking).toHaveTextContent('Kabel magistralny');
    // Pozycja 1 = kontyngencja odcinająca odbiory (kolejność kategorii backendu).
    const wiersze = ranking.querySelectorAll('tbody tr');
    expect(wiersze[0]).toHaveTextContent('TR 15/0,4');
    expect(wiersze[1]).toHaveTextContent('Kabel magistralny');
  });

  it('klik w kontyngencję (ścieżka natywna) otwiera szczegóły: co bez zasilania i ślad', async () => {
    const uzytkownik = await policz();

    expect(screen.getByTestId('mvd-n1-szczegoly-wskaz')).toBeInTheDocument();
    await uzytkownik.click(screen.getByText('TR 15/0,4'));

    const szczegoly = await screen.findByTestId('mvd-n1-szczegoly');
    expect(szczegoly).toHaveTextContent('TR 15/0,4');
    expect(screen.getByTestId('mvd-n1-szczegoly-odbiory')).toHaveTextContent('Odbior nN');
    expect(screen.getByTestId('mvd-n1-szczegoly-szyny')).toHaveTextContent('b_nn');
    expect(screen.getByTestId('mvd-n1-szczegoly-slad')).toHaveTextContent('newton-raphson');
    expect(screen.getByTestId('mvd-n1-szczegoly-slad')).toHaveTextContent('nietknięty');
  });

  it('szczegóły pokazują kryteria POMINIĘTE jawnie (brak danej nie udaje wyniku)', async () => {
    const uzytkownik = await policz();
    await uzytkownik.click(screen.getByText('TR 15/0,4'));

    const pominiete = await screen.findByTestId('mvd-n1-szczegoly-pominiete');
    expect(pominiete).toHaveTextContent(T.sekcjaPominiete);
    expect(pominiete).toHaveTextContent('Obciążenie gałęzi');
    expect(pominiete).toHaveTextContent('Brak pradu galezi');
  });

  it('szczegóły kontyngencji z przeciążeniem podają wartość i próg z backendu', async () => {
    const uzytkownik = await policz();
    await uzytkownik.click(screen.getByText('Kabel magistralny'));

    const przeciazenia = await screen.findByTestId('mvd-n1-szczegoly-przeciazenia');
    expect(przeciazenia).toHaveTextContent('Linia GPZ-B');
    expect(przeciazenia).toHaveTextContent('134,74');
    expect(przeciazenia).toHaveTextContent('%');
  });

  it('nierozstrzygnięte stoją OSOBNO, z powodem PL i poza rankingiem', async () => {
    await policz();

    const sekcja = screen.getByTestId('mvd-n1-nierozstrzygniete');
    expect(sekcja).toHaveTextContent('Linia odgalezienia');
    expect(sekcja).toHaveTextContent('Linia rezerwowa (wylaczona)');
    expect(screen.getByTestId('mvd-n1-nier-ln_odg')).toHaveTextContent('Bieg niezbieżny');
    expect(screen.getByTestId('mvd-n1-nier-ln_wyl')).toHaveTextContent('Wykluczona');
    expect(screen.getByTestId('mvd-n1-nier-ln_wyl')).toHaveTextContent('już wyłączony');
    // Żadna z nich nie może stać w rankingu (nie ma czego porównywać).
    const ranking = screen.getByTestId('mvd-n1-ranking');
    expect(ranking).not.toHaveTextContent('Linia odgalezienia');
    expect(ranking).not.toHaveTextContent('Linia rezerwowa');
  });

  it('błąd biegu macierzy: komunikat PL, zapowiedź zakresu zostaje na ekranie', async () => {
    const uzytkownik = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn((url: RequestInfo | URL) => {
        const adres = String(url);
        if (adres.startsWith('/api/insights/n-1-contingency/scope?')) {
          return Promise.resolve({ ok: true, json: async () => ZAKRES } as Response);
        }
        return Promise.resolve({ ok: false, status: 500, statusText: 'Server Error' } as Response);
      }),
    );

    render(<EkranKontyngencji trybZaawansowania="basic" />);
    await zakresGotowy();
    await uzytkownik.click(screen.getByTestId('mvd-n1-policz'));

    await waitFor(() => expect(screen.getByTestId('mvd-n1-macierz-blad')).toBeInTheDocument());
    expect(screen.getByTestId('mvd-n1-macierz-blad')).toHaveTextContent('500');
    expect(screen.getByTestId('mvd-n1-zakres')).toBeInTheDocument();
  });

  it('tryb ekspercki dokłada identyfikatory, podstawowy ich nie pokazuje', async () => {
    const uzytkownik = await policz(MACIERZ, 'expert');
    await uzytkownik.click(screen.getByText('TR 15/0,4'));

    expect(screen.getByTestId('mvd-n1-szczegoly-slad')).toHaveTextContent(T.sladWezelBilansujacy);
  });

  it('tryb podstawowy NIE pokazuje węzła bilansującego (identyfikator modelu)', async () => {
    const uzytkownik = await policz(MACIERZ, 'basic');
    await uzytkownik.click(screen.getByText('TR 15/0,4'));

    await screen.findByTestId('mvd-n1-szczegoly-slad');
    expect(screen.getByTestId('mvd-n1-szczegoly-slad')).not.toHaveTextContent(
      T.sladWezelBilansujacy,
    );
  });
});
