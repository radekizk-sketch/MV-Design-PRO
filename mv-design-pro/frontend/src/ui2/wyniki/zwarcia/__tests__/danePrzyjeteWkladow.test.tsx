/**
 * Dane przyjęte przy wynikach zwarć (ZASADA NR 4 pkt 4, kontrakt werdyktu §3): źródło
 * i założenie stoją w wyjaśnieniu TEGO wyniku, którego dotyczą. Odpowiedź wkładów
 * (`POST /api/proof/sc3f/contributions`) i rozpływ punktu
 * (`GET …/results/short-circuit/rozplyw`) niosą parę `status_danych` + `dane_przyjete`
 * (backend: `_dane_przyjete_wkladow`, `_dane_przyjete_punktu_rozplywu`); sekcje „Wkłady"
 * i „Rozpływ prądu zwarciowego" pokazują ją wspólnym zapisem wzorca
 * (`StanDanychWyniku`, ten sam co dowód karty werdyktu).
 *
 * Realna ścieżka: wynik biegu w store → ekran → hooki dostawców pobierają odpowiedzi
 * (`fetch` zwraca kształt końcówki) → sekcje. Iloczyn cech:
 *   lista {pusta, jeden wpis, trzy źródła naraz} × odpowiedź {wkładów, rozpływu punktu}.
 * Na każdej kombinacji druga odpowiedź ma listę pustą — wpisy nie przeciekają do sekcji,
 * której nie dotyczą. Dodatkowo: stan „dane przyjęte bez walidacji" widoczny tylko przy
 * niepustej liście (także gdy odpowiedź niesie sam status bez listy).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { EkranZwarc } from '../EkranZwarc';
import { naDanePrzyjete } from '../api';
import { StanDanychWyniku, type DanaPrzyjeta, type StanDanych } from '../../wzorzec';
import { renderEkranZwarc } from './renderEkranZwarc';
import { konfiguracjaBieguFixture, shortCircuitResultsFixture, shortCircuitRowFixture } from './fixtures';
import { useResultsInspectorStore } from '../../../../ui/results-inspector/store';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';

/** Wpisy w kształcie odpowiedzi backendu (teksty z realnych biegów, skrócone powody). */
const LINIA_110: DanaPrzyjeta = {
  nazwa_pl: 'położenie przewodów fazowych na słupie (Linia 110 kV A–B)',
  wartosc: null,
  powod_pl:
    'wartość robocza (założenie inżynierskie): standard ENEA Operator linii 110 kV (06.2026) §4.3',
  jakosc: 'ESTIMATED',
};
const TOLERANCJA_NN: DanaPrzyjeta = {
  nazwa_pl: 'tolerancja napięcia sieci nN (punkt zwarcia: Szyna nN)',
  wartosc: { wartosc: 10.0, jednostka: '%' },
  powod_pl: 'wartość robocza tolerancji +10 % (IEC 60909-0:2016 tabela 1)',
  jakosc: 'ESTIMATED',
};
const MASZYNA_XD: DanaPrzyjeta = {
  nazwa_pl: 'reaktancja podprzejściowa nasycona x″d maszyny „Generator synchroniczny”',
  wartosc: { wartosc: 0.15, jednostka: 'p.u. (S_rG, U_rG)' },
  powod_pl: 'wartość robocza (założenie inżynierskie): wartość typowa, IEC 60909-0:2016 pkt 6.3',
  jakosc: 'ESTIMATED',
};

/** Oczekiwany zapis wartości (format PL wzorca, jednostka po spacji; brak → opis). */
const ZAPIS_WARTOSCI = new Map<DanaPrzyjeta, string>([
  [LINIA_110, 'bez wartości liczbowej'],
  [TOLERANCJA_NN, '10 %'],
  [MASZYNA_XD, '0,15 p.u. (S_rG, U_rG)'],
]);

const LISTY = [
  { nazwa: 'lista pusta', dane: [] as DanaPrzyjeta[] },
  { nazwa: 'jeden wpis', dane: [LINIA_110] },
  { nazwa: 'trzy źródła naraz', dane: [TOLERANCJA_NN, LINIA_110, MASZYNA_XD] },
];
const ODPOWIEDZI = [
  { nazwa: 'odpowiedź wkładów', klucz: 'wklady' as const, sekcja: 'mvd-zwarcia-wklady' },
  { nazwa: 'rozpływ punktu', klucz: 'rozplyw' as const, sekcja: 'mvd-zwarcia-rozplyw' },
];
const PRZYPADKI = LISTY.flatMap((lista) => ODPOWIEDZI.map((odp) => ({ lista, odp })));

type Para = { status_danych?: StanDanych; dane_przyjete?: DanaPrzyjeta[] };

/**
 * Para w kształcie końcówek (`_dane_przyjete_wkladow`, `_dane_przyjete_punktu_rozplywu`):
 * niepusta lista → oba pola, status UNVALIDATED_INPUT (kontrakt §3); pusta → żadnego pola.
 */
function para(dane: DanaPrzyjeta[]): Para {
  return dane.length > 0 ? { status_danych: 'UNVALIDATED_INPUT', dane_przyjete: dane } : {};
}

function json(tresc: unknown): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(tresc), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

function atrapaKoncowek(wklady: Para, rozplyw: Para) {
  const fetchMock = vi.fn((url: RequestInfo | URL) => {
    const adres = String(url);
    if (adres.includes('/api/proof/sc3f/contributions'))
      return json({
        contributions: [{ source_id: 'gen1', source_name: 'Agregat', ikss_partial_a: 1234.5 }],
        ...wklady,
      });
    if (adres.includes('/results/short-circuit/rozplyw'))
      return json({
        branch_contributions: [],
        branch_flow_trace: [],
        wklady_pominiete: [],
        prog_wkladu_pominietego_a: 1.0,
        ...rozplyw,
      });
    return Promise.resolve(new Response('brak', { status: 404 }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function renderujPoPobraniu() {
  await renderEkranZwarc(<EkranZwarc szczegolyAudytowe={false} onOtworzDowod={() => undefined} />);
  // Obie odpowiedzi doszły: tabela wkładów ma źródło, rozpływ pokazuje stan pusty listy gałęzi.
  const wklady = await screen.findByTestId('mvd-zwarcia-wklady');
  expect(await within(wklady).findByText('Agregat', { selector: 'td *, td' })).toBeInTheDocument();
  await screen.findByTestId('mvd-zwarcia-rozplyw-pusty');
}

beforeEach(() => {
  useResultsInspectorStore.getState().reset();
  const wynik = shortCircuitResultsFixture({ konfiguracja_biegu: konfiguracjaBieguFixture() });
  // Rozpływ na żądanie (V12K-281): wiersz bez pola, z flagą dostępności → hook pobiera punkt.
  wynik.rows[0] = shortCircuitRowFixture({
    branch_contributions: null,
    branch_contributions_available: true,
  });
  useResultsInspectorStore.setState({ shortCircuitResults: wynik, selectedRunId: 'sc-run-1' });
  useSnapshotStore.setState({
    snapshot: {
      header: { name: 'Siec testowa' },
      buses: [],
      branches: [],
      transformers: [],
      sources: [],
      loads: [],
      generators: [],
      substations: [],
      bays: [],
    },
  } as never);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Dane przyjęte przy wkładach i rozpływie punktu — iloczyn lista × odpowiedź', () => {
  it.each(PRZYPADKI)('$lista.nazwa × $odp.nazwa', async ({ lista, odp }) => {
    const badana = para(lista.dane);
    const pusta = para([]);
    atrapaKoncowek(
      odp.klucz === 'wklady' ? badana : pusta,
      odp.klucz === 'rozplyw' ? badana : pusta,
    );
    await renderujPoPobraniu();

    const inna = ODPOWIEDZI.find((o) => o.klucz !== odp.klucz)!;
    // Druga sekcja (lista pusta) nie pokazuje niczego — także stanu danych.
    expect(screen.queryByTestId(`${inna.sekcja}-dane`)).not.toBeInTheDocument();

    if (lista.dane.length === 0) {
      expect(screen.queryByTestId(`${odp.sekcja}-dane`)).not.toBeInTheDocument();
      expect(screen.queryByText('dane przyjęte bez walidacji')).not.toBeInTheDocument();
      return;
    }

    // Blok danych przyjętych leży WEWNĄTRZ sekcji wyniku, którego dotyczy.
    const sekcja = screen.getByTestId(odp.sekcja);
    const blok = within(sekcja).getByTestId(`${odp.sekcja}-dane`);
    expect(within(blok).getByTestId(`${odp.sekcja}-stan-danych`)).toHaveTextContent(
      'dane przyjęte bez walidacji',
    );
    const pozycje = within(within(blok).getByTestId(`${odp.sekcja}-dane-przyjete`)).getAllByRole(
      'listitem',
    );
    expect(pozycje).toHaveLength(lista.dane.length);
    lista.dane.forEach((dana, i) => {
      const tekst = pozycje[i].textContent ?? '';
      expect(tekst).toContain(dana.nazwa_pl);
      expect(tekst).toContain(ZAPIS_WARTOSCI.get(dana)!);
      expect(tekst).toContain('jakość danej: oszacowane');
      expect(tekst).toContain(dana.powod_pl);
    });
    // Dyskretnie: zapis danych przyjętych nie jest ostrzeżeniem ani alertem.
    expect(within(blok).queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each(ODPOWIEDZI)(
    '$nazwa: status UNVALIDATED_INPUT bez listy wpisów → stan danych niewidoczny',
    async (odp) => {
      const samStatus: Para = { status_danych: 'UNVALIDATED_INPUT', dane_przyjete: [] };
      const pusta = para([]);
      atrapaKoncowek(
        odp.klucz === 'wklady' ? samStatus : pusta,
        odp.klucz === 'rozplyw' ? samStatus : pusta,
      );
      await renderujPoPobraniu();
      expect(screen.queryByTestId(`${odp.sekcja}-dane`)).not.toBeInTheDocument();
      expect(screen.queryByTestId(`${odp.sekcja}-stan-danych`)).not.toBeInTheDocument();
      expect(screen.queryByText('dane przyjęte bez walidacji')).not.toBeInTheDocument();
    },
  );
});

describe('naDanePrzyjete — projekcja pary z odpowiedzi', () => {
  it('lista niepusta ze statusem → para dla sekcji', () => {
    expect(naDanePrzyjete(para([LINIA_110]))).toEqual({
      stan: 'UNVALIDATED_INPUT',
      dane: [LINIA_110],
    });
  });

  it('lista niepusta bez statusu → wpisy zostają, stanu frontend nie dopowiada', () => {
    expect(naDanePrzyjete({ dane_przyjete: [TOLERANCJA_NN, MASZYNA_XD] })).toEqual({
      stan: null,
      dane: [TOLERANCJA_NN, MASZYNA_XD],
    });
  });

  it.each([
    ['brak obu pól (kształt końcówki bez danych przyjętych)', para([])],
    ['lista pusta, status zwalidowany', { status_danych: 'ZWALIDOWANE' as const, dane_przyjete: [] }],
    [
      'lista pusta, status UNVALIDATED_INPUT',
      { status_danych: 'UNVALIDATED_INPUT' as const, dane_przyjete: [] },
    ],
    ['sam status bez listy', { status_danych: 'UNVALIDATED_INPUT' as const }],
  ])('%s → null (nic się nie pokazuje)', (_n, odpowiedz) => {
    expect(naDanePrzyjete(odpowiedz)).toBeNull();
  });
});

describe('StanDanychWyniku — zapis bez stanu z odpowiedzi', () => {
  it('stan null → lista wpisów widoczna, wiersza stanu danych brak (nic nie dopowiedziane)', () => {
    render(<StanDanychWyniku stan={null} dane={[LINIA_110]} testId="t" />);
    expect(screen.getByTestId('t-dane-przyjete')).toHaveTextContent(LINIA_110.nazwa_pl);
    expect(screen.queryByTestId('t-stan-danych')).not.toBeInTheDocument();
  });
});
