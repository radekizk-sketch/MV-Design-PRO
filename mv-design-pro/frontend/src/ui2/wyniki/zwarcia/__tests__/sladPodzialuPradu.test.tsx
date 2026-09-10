/**
 * Sekcja „Podział prądu zwarciowego — ślad obliczeń" (karta WB-ROZPLYW, TH-1) —
 * ślad WHITE BOX podziału prądu zwarciowego od źródła zastępczego (Thevenin)
 * pod tabelą rozpływu, REUŻYWAJĄCY renderer kroku `KrokDowodu`
 * (`ui2/wyniki/dowod`). Testy pokrywają uczciwe stany karty (W4a-d):
 *  (a) punkt ze śladem → sekcja z N krokami i formułami (fixture REALNEGO
 *      kształtu kroku TH-1, `branchFlowTraceFixture` — kopia bajt-w-bajt
 *      z testu backendu, `test_branch_flow_trace_is_whitebox`),
 *  (b) `trace === null` → stan uczciwy „niedostępny", nie pusta lista,
 *  (c) natywna zmiana punktu (klik wiersza tabeli) → sekcja się przeładowuje,
 *  (d) błąd HTTP dostawcy → komunikat błędu, nie cisza.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { EkranZwarc } from '../EkranZwarc';
import { SladPodzialuPradu } from '../SladPodzialuPradu';
import { ZWARCIA_STRINGS } from '../strings';
import { useResultsInspectorStore } from '../../../../ui/results-inspector/store';
import { branchFlowTraceFixture, shortCircuitResultsFixture, shortCircuitRowFixture } from './fixtures';

function props(over: Partial<Parameters<typeof EkranZwarc>[0]> = {}) {
  return {
    trybZaawansowania: 'expert' as const,
    onOtworzDowod: vi.fn(),
    ...over,
  };
}

/**
 * Fixture TH-1 przez round-trip JSON — TA SAMA droga, którą realne dane
 * przechodzą w produkcji (`fetchRozplywZwarciowy`: `(await response.json())`,
 * kształt nieopakowany, nie `TraceValue`). Zero rzutowań typów (`as unknown as`
 * zakazane kartą) — `JSON.parse` zwraca `any`, jak realny `Response.json()`.
 */
function realnyTrace() {
  return JSON.parse(JSON.stringify(branchFlowTraceFixture()));
}

beforeEach(() => {
  useResultsInspectorStore.getState().reset();
});

describe('SladPodzialuPradu — renderowanie kroków (component, karta WB-ROZPLYW)', () => {
  it('(W4a) punkt ze śladem TH-1 → sekcja z N krokami solvera, formułami LaTeX (KaTeX), danymi i wynikami', () => {
    const trace = realnyTrace();
    render(
      <SladPodzialuPradu
        punktNazwa="Szyna GPZ 15 kV"
        trace={trace}
        blad={false}
        trybZaawansowania="expert"
      />,
    );
    const sekcja = screen.getByTestId('mvd-zwarcia-slad-rozplywu');
    // Tytuł + nazwa punktu w jednym nagłówku (kilka węzłów tekstu — jak w
    // sekcjach sąsiednich, `rozplywZwarciowy.test.tsx`): dopasowanie substringiem.
    expect(sekcja).toHaveTextContent(ZWARCIA_STRINGS.sladRozplywuTytul);
    expect(within(sekcja).getByText('Szyna GPZ 15 kV')).toBeInTheDocument();

    // Dokładnie N kroków solvera (4: setup, T1, L1, balance) — zero pominięć.
    const kroki = within(sekcja).getAllByTestId('mvd-dowod-krok');
    expect(kroki).toHaveLength(trace.length);
    expect(kroki).toHaveLength(4);

    // Tytuły kroków solvera (z `title`, nie fallback „Krok N").
    expect(within(sekcja).getByText('Podział prądu Thevenina — iniekcja jednostkowa w węźle zwarcia')).toBeInTheDocument();
    expect(within(sekcja).getByText('Prąd zwarciowy Thevenina w gałęzi T1')).toBeInTheDocument();
    expect(within(sekcja).getByText('Prąd zwarciowy Thevenina w gałęzi L1')).toBeInTheDocument();
    expect(within(sekcja).getByText('Suma kontrolna bilansu prądu w węźle zwarcia (KCL)')).toBeInTheDocument();

    // Formuła LaTeX renderowana przez KaTeX (nie fallback surowego tekstu) — co
    // najmniej tyle wzorów, ile kroków niosą `formula_latex` (wszystkie 4 tu).
    const wzory = within(sekcja).getAllByTestId('math-rendered');
    expect(wzory.length).toBeGreaterThanOrEqual(4);

    const trescSekcji = sekcja.textContent ?? '';
    // Skalar WPROST z solvera (bez opakowania {value,unit}) sformatowany, nie
    // kreska — dowód naprawy `dowod/dowodModel.ts::mapujWielkosci` (KLASA NIE
    // INSTANCJA): przed naprawą KAŻDA wartość realnego śladu renderowała się
    // jako „—".
    expect(trescSekcji).toContain('5611,28');
    // Liczba zespolona {re, im} (np. y_series_pu kroku T1) sformatowana R±jX
    // (przecinek PL), nie „[object Object]" i nie kreska.
    expect(trescSekcji).toContain('j2,53');
    expect(trescSekcji).not.toContain('[object Object]');
    // Kierunek przepływu (string wprost z solvera) w wyniku kroku.
    expect(trescSekcji).toContain('from_to');
    // Uwagi kroku widoczne (pole `notes`).
    expect(trescSekcji).toContain('KCL: suma modułów współczynników');
    // Podstawienie (LaTeX) kroku bilansu.
    expect(trescSekcji).toContain('5611.28');
  });

  it('(W4a, tryb podstawowy) klucze spoza słownika etykiet pominięte — zero surowych identyfikatorów w pierwszym planie', () => {
    render(
      <SladPodzialuPradu
        punktNazwa="Szyna GPZ 15 kV"
        trace={realnyTrace()}
        blad={false}
        trybZaawansowania="basic"
      />,
    );
    const sekcja = screen.getByTestId('mvd-zwarcia-slad-rozplywu');
    // Krok nadal renderuje się (tytuł, wzór) — tylko wiersze wielkości o
    // nieznanym kluczu są ukryte poza trybem eksperckim.
    expect(within(sekcja).getAllByTestId('mvd-dowod-krok')).toHaveLength(4);
    expect(within(sekcja).queryByTestId('mvd-dowod-wielkosc')).not.toBeInTheDocument();
  });

  it('(W4b) trace === null → stan uczciwy „niedostępny" (dokładny tekst karty), nie pusta lista', () => {
    render(
      <SladPodzialuPradu
        punktNazwa="Szyna GPZ 15 kV"
        trace={null}
        blad={false}
        trybZaawansowania="basic"
      />,
    );
    const sekcja = screen.getByTestId('mvd-zwarcia-slad-rozplywu');
    expect(within(sekcja).getByTestId('mvd-zwarcia-slad-rozplywu-brak')).toBeInTheDocument();
    expect(
      within(sekcja).getByText(
        'Ślad podziału niedostępny dla tego biegu (bieg sprzed zapisu śladu albo bez wkładów).',
      ),
    ).toBeInTheDocument();
    expect(within(sekcja).queryByTestId('mvd-dowod-krok')).not.toBeInTheDocument();
  });

  it('trace === [] (policzono, brak wkładu Thevenina) → stan uczciwy ODRĘBNY od null', () => {
    render(
      <SladPodzialuPradu punktNazwa="Szyna ST1" trace={[]} blad={false} trybZaawansowania="basic" />,
    );
    const sekcja = screen.getByTestId('mvd-zwarcia-slad-rozplywu');
    expect(within(sekcja).getByTestId('mvd-zwarcia-slad-rozplywu-pusty')).toBeInTheDocument();
    expect(within(sekcja).getByText(ZWARCIA_STRINGS.sladRozplywuPusty)).toBeInTheDocument();
    expect(within(sekcja).queryByTestId('mvd-zwarcia-slad-rozplywu-brak')).not.toBeInTheDocument();
  });

  it('(W4d) blad === true → komunikat błędu, NIE cisza i NIE stan „niedostępny" starszego wyniku', () => {
    render(
      <SladPodzialuPradu
        punktNazwa="Szyna GPZ 15 kV"
        trace={null}
        blad
        trybZaawansowania="basic"
      />,
    );
    const sekcja = screen.getByTestId('mvd-zwarcia-slad-rozplywu');
    expect(within(sekcja).getByTestId('mvd-zwarcia-slad-rozplywu-blad')).toBeInTheDocument();
    expect(within(sekcja).getByText(ZWARCIA_STRINGS.sladRozplywuBlad)).toBeInTheDocument();
    expect(within(sekcja).queryByTestId('mvd-zwarcia-slad-rozplywu-brak')).not.toBeInTheDocument();
  });
});

describe('EkranZwarc — integracja sekcji śladu podziału (karta WB-ROZPLYW)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function ustawWynikDwaPunktyZeSladem() {
    const wynik = shortCircuitResultsFixture();
    wynik.rows[0] = shortCircuitRowFixture({
      branch_contributions: null,
      branch_contributions_available: true,
    });
    wynik.rows[1] = shortCircuitRowFixture({
      target_id: 'BUS-ST1',
      element_id: 'EL-ST1',
      target_name: 'Szyna ST1 15 kV',
      branch_contributions: null,
      branch_contributions_available: true,
    });
    useResultsInspectorStore.setState({ shortCircuitResults: wynik, selectedRunId: 'sc-run-1' });
    return wynik;
  }

  it('(W4c) natywny klik innego wiersza punktu → sekcja śladu przeładowuje się na jego kroki', async () => {
    ustawWynikDwaPunktyZeSladem();
    fetchMock.mockImplementation((url: RequestInfo | URL) => {
      const naStacji1 = String(url).includes('BUS-ST1');
      return Promise.resolve(
        new Response(
          JSON.stringify({
            run_id: 'sc-run-1',
            target_id: naStacji1 ? 'BUS-ST1' : 'BUS-GPZ',
            branch_contributions: [],
            branch_flow_trace: naStacji1 ? [] : branchFlowTraceFixture(),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    });
    render(<EkranZwarc {...props()} />);
    const sekcja = () => screen.getByTestId('mvd-zwarcia-slad-rozplywu');

    // Punkt 1 (BUS-GPZ, aktywny domyślnie): ślad z 4 kroków.
    await screen.findAllByTestId('mvd-dowod-krok');
    expect(within(sekcja()).getAllByTestId('mvd-dowod-krok')).toHaveLength(4);

    // Natywny klik wiersza BUS-ST1 (TABELA wyników, nie dispatchEvent syntetyczny).
    const wiersze = screen.getAllByTestId('mvd-wyn-wiersz');
    fireEvent.click(wiersze[1]);

    // Sekcja PRZEŁADOWANA na kroki (a raczej brak kroków — punkt 2 bez wkładu
    // Thevenina) — stan pusty ODRĘBNY, nie stare kroki punktu 1 zostawione.
    await screen.findByTestId('mvd-zwarcia-slad-rozplywu-pusty');
    expect(within(sekcja()).queryByTestId('mvd-dowod-krok')).not.toBeInTheDocument();
    expect(within(sekcja()).getByText('Szyna ST1 15 kV')).toBeInTheDocument();
  });

  it('(W4d integracja) błąd HTTP dostawcy → sekcja pokazuje komunikat błędu, nie stan „niedostępny" domyślny', async () => {
    const wynik = shortCircuitResultsFixture();
    wynik.rows[0] = shortCircuitRowFixture({
      branch_contributions: null,
      branch_contributions_available: true,
    });
    useResultsInspectorStore.setState({ shortCircuitResults: wynik, selectedRunId: 'sc-run-1' });
    fetchMock.mockResolvedValue(new Response('awaria serwera', { status: 500 }));
    render(<EkranZwarc {...props()} />);
    const sekcja = await screen.findByTestId('mvd-zwarcia-slad-rozplywu-blad');
    expect(within(sekcja).getByText(ZWARCIA_STRINGS.sladRozplywuBlad)).toBeInTheDocument();
  });
});
