/*
 * Testy akcji „Dokument studium" w kreatorze (karta P35b, kryteria §3). Weryfikują:
 * przycisk nieaktywny bez zakończonego biegu (tytuł PL), żądanie 1:1 z parametrów
 * zakończonego biegu, podgląd 1:1 z kontraktem backendu, sekcję błędu wariantu
 * uczciwie, braki twarde 422 jako listę PL, błąd API po polsku oraz pobrania DOCX
 * i PDF (blob przez URL.createObjectURL). API i store'y mockowane; fixtures 1:1.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useAppStateStore } from '../../../../ui/app-state';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { KreatorStudium } from '../KreatorStudium';
import { STUDIUM_STRINGS } from '../strings';
import {
  katalogStudiumFixture,
  przebiegFixture,
  rekordyStudiumFixture,
  snapshotFixture,
  widokDokumentuFixture,
  widokDokumentuZBledemFixture,
  widokObszaruFixture,
  widokPokryciaFixture,
  widokZdolnosciFixture,
} from './fixtures';


/**
 * Jawny wybór operatora (krok 2) — operator studium NIE ma wartości domyślnej, więc realna
 * ścieżka użytkownika przechodzi przez wybór profilu wymagań natywnym `selectOptions`.
 */
async function wybierzOperatoraJawnie(operatorId = 'pse') {
  await userEvent.click(screen.getByTestId('mvd-studium-krok-2'));
  const operator = await screen.findByTestId('mvd-studium-operator');
  await waitFor(() =>
    expect(within(operator).queryByRole('option', { name: /PSE/ })).not.toBeNull(),
  );
  await userEvent.selectOptions(operator, operatorId);
}

const pobierzKonwertery = vi.fn();
const pobierzKatalog = vi.fn();
const pobierzZdolnosc = vi.fn();
const pobierzObszar = vi.fn();
const pobierzPokrycie = vi.fn();
const pobierzDokument = vi.fn();
const pobierzDokumentDocx = vi.fn();
const pobierzDokumentPdf = vi.fn();

import { odpowiedzKlasyfikacji } from '../../ncrfg/__tests__/atrapaKlasyfikacji';
import dokumentStudiumZDowodem from '../../../../harness-fixtures/generated/studium_dokument_scena_macierz.json';
import type { WidokDokumentuStudium } from '../../api';

vi.mock('../../api', () => {
  class DokumentStudiumBrakiError extends Error {
    readonly braki: readonly string[];
    constructor(komunikat: string, braki: readonly string[]) {
      super(komunikat);
      this.name = 'DokumentStudiumBrakiError';
      this.braki = braki;
    }
  }
  return {
    pobierzKonwertery: () => pobierzKonwertery(),
    pobierzZdolnoscPrzylaczeniowa: (z: unknown) => pobierzZdolnosc(z),
    pobierzObszarPQ: (z: unknown) => pobierzObszar(z),
    pobierzPokryciePQ: (z: unknown) => pobierzPokrycie(z),
    // Atrapa przekazuje OBA argumenty (żądanie + wskazanie przypadku). Gdyby
    // gubiła drugi, test nie zobaczyłby braku `case_id`, a bez niego dokument
    // nie niesie dowodu certyfikacji PTPiREE — atrapa maskowałaby defekt.
    pobierzDokumentStudium: (z: unknown, c?: string | null) => pobierzDokument(z, c),
    pobierzDokumentStudiumDocx: (z: unknown, c?: string | null) => pobierzDokumentDocx(z, c),
    pobierzDokumentStudiumPdf: (z: unknown, c?: string | null) => pobierzDokumentPdf(z, c),
    DokumentStudiumBrakiError,
  };
});

// Klasa błędu z zamockowanego modułu (ta sama referencja co w komponencie).
import { DokumentStudiumBrakiError } from '../../api';

// Katalog NC RfG (operatorzy) i klasyfikacja modułu idą PRODUKCYJNYM klientem `ncrfg/api.ts`
// — atrapa wyłącznie na granicy `fetch` (klasyfikacja: klucze z OpenAPI, progi z katalogu
// policzonego backendem).
function atrapaNcRfg(url: string): Response {
  const klasyfikacja = odpowiedzKlasyfikacji(url);
  if (klasyfikacja) return klasyfikacja;
  if (new URL(url, 'http://localhost').pathname === '/api/ncrfg-tests/catalog') {
    return new Response(JSON.stringify(pobierzKatalog()), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  throw new Error(`atrapa studium: nieoczekiwane zapytanie ${url}`);
}

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
  useAppStateStore.setState({ activeProjectName: 'Projekt testowy', activeCaseName: 'Wariant bazowy' });
  pobierzKonwertery.mockResolvedValue(rekordyStudiumFixture());
  pobierzKatalog.mockReturnValue(katalogStudiumFixture());
  vi.stubGlobal('fetch', vi.fn(async (url: string) => atrapaNcRfg(url)));
  pobierzZdolnosc.mockResolvedValue(widokZdolnosciFixture());
  pobierzObszar.mockResolvedValue(widokObszaruFixture());
  pobierzPokrycie.mockResolvedValue(widokPokryciaFixture());
  pobierzDokument.mockResolvedValue(widokDokumentuFixture());
  pobierzDokumentDocx.mockResolvedValue(new Blob(['docx'], { type: 'application/octet-stream' }));
  pobierzDokumentPdf.mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }));
});
afterEach(() => {
  useExecutionRunsStore.getState().reset();
  useSnapshotStore.getState().reset();
  useAppStateStore.setState({
    activeProjectName: null,
    activeCaseName: null,
    activeCaseId: null,
  } as never);
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Przeprowadź pełny bieg studium dla węzła bus-a i wejdź w przegląd (krok 4). */
async function przeprowadzBieg() {
  ustawGotowyRozplyw();
  render(<KreatorStudium trybZaawansowania="basic" onOtworzDowod={vi.fn()} />);
  fireEvent.click(screen.getByTestId('mvd-studium-wybor-bus-a'));
  await wybierzOperatoraJawnie();
  fireEvent.click(screen.getByTestId('mvd-studium-krok-3'));
  // Przycisk biegu odblokowuje się dopiero po prefillu typu z katalogu
  // (asynchroniczny montaż) — jak realny użytkownik klikamy AKTYWNY przycisk;
  // klik w zablokowany nie uruchamia biegu i przegląd nigdy by nie nadszedł.
  const uruchom = await screen.findByTestId('mvd-studium-uruchom');
  await waitFor(() => expect(uruchom).toBeEnabled());
  fireEvent.click(uruchom);
  await screen.findByTestId('mvd-studium-przeglad');
}

describe('KreatorStudium — dokument studium (przycisk i dostępność)', () => {
  it('przycisk nieaktywny bez zakończonego biegu, z tytułem PL', async () => {
    ustawGotowyRozplyw();
    render(<KreatorStudium trybZaawansowania="basic" onOtworzDowod={vi.fn()} />);
    // Montaż kreatora pobiera katalogi (konwertery + operatorzy NC RfG) — realny
    // efekt mikrotaskowy, którego skutek (prefill kroku 2) nie ma reprezentacji
    // w UI kroku 4, więc nie ma na co czekać przez findBy*/waitFor. Puste
    // act(async) domyka te mikrotaski w act — bez niego React zgłasza
    // „An update to KreatorStudium was not wrapped in act(...)".
    await act(async () => {});
    fireEvent.click(screen.getByTestId('mvd-studium-krok-4'));
    const przycisk = screen.getByTestId('mvd-studium-dok-przycisk');
    expect(przycisk).toBeDisabled();
    expect(przycisk).toHaveAttribute('title', STUDIUM_STRINGS.dokTytulNieaktywny);
    expect(przycisk).toHaveTextContent('Dokument studium');
  });

  it('po zakończonym biegu przycisk jest aktywny', async () => {
    await przeprowadzBieg();
    const przycisk = screen.getByTestId('mvd-studium-dok-przycisk');
    expect(przycisk).not.toBeDisabled();
    expect(przycisk).toHaveAttribute('title', STUDIUM_STRINGS.dokTytulAktywny);
  });
});

describe('KreatorStudium — dokument studium (żądanie i podgląd)', () => {
  it('żądanie 1:1 z parametrów zakończonego biegu (run/typ/operator/warianty/identyfikacja)', async () => {
    await przeprowadzBieg();
    fireEvent.click(screen.getByTestId('mvd-studium-dok-przycisk'));
    await waitFor(() => expect(pobierzDokument).toHaveBeenCalledTimes(1));
    expect(pobierzDokument).toHaveBeenCalledWith(
      {
        nazwa_projektu: 'Projekt testowy',
        nazwa_przypadku: 'Wariant bazowy',
        run_id: 'lf-run',
        catalog_item_id: 'conv-pv-2mw',
        operator_id: 'pse',
        warianty: ['bus-a'],
      },
      null,
    );
  });

  it('żądania dokumentu niosą aktywny przypadek (bez niego nie ma dowodu PTPiREE)', async () => {
    useAppStateStore.setState({ activeCaseId: 'case-oze-1' } as never);
    if (typeof URL.createObjectURL !== 'function') URL.createObjectURL = () => 'blob:shim';
    if (typeof URL.revokeObjectURL !== 'function') URL.revokeObjectURL = () => {};
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    await przeprowadzBieg();
    fireEvent.click(screen.getByTestId('mvd-studium-dok-przycisk'));
    await waitFor(() => expect(pobierzDokument).toHaveBeenCalledTimes(1));
    expect(pobierzDokument.mock.calls[0][1]).toBe('case-oze-1');

    fireEvent.click(await screen.findByTestId('mvd-studium-dok-pobierz-docx'));
    await waitFor(() => expect(pobierzDokumentDocx).toHaveBeenCalledTimes(1));
    expect(pobierzDokumentDocx.mock.calls[0][1]).toBe('case-oze-1');

    fireEvent.click(screen.getByTestId('mvd-studium-dok-pobierz-pdf'));
    await waitFor(() => expect(pobierzDokumentPdf).toHaveBeenCalledTimes(1));
    expect(pobierzDokumentPdf.mock.calls[0][1]).toBe('case-oze-1');
  });

  it('brak nazwy projektu w aplikacji → nazwa_projektu ma polski zastępnik', async () => {
    useAppStateStore.setState({ activeProjectName: null, activeCaseName: null });
    await przeprowadzBieg();
    fireEvent.click(screen.getByTestId('mvd-studium-dok-przycisk'));
    await waitFor(() => expect(pobierzDokument).toHaveBeenCalledTimes(1));
    expect(pobierzDokument.mock.calls[0][0]).toMatchObject({
      nazwa_projektu: STUDIUM_STRINGS.dokProjektBezNazwy,
      nazwa_przypadku: null,
    });
  });

  it('podgląd 1:1 z kontraktem: identyfikacja, założenia i tabela wariantów', async () => {
    await przeprowadzBieg();
    fireEvent.click(screen.getByTestId('mvd-studium-dok-przycisk'));
    const widok = await screen.findByTestId('mvd-studium-dok-widok');
    expect(within(widok).getByText('Projekt testowy')).toBeInTheDocument();
    expect(within(widok).getByText('Falownik PV 2 MW / 0.69 kV')).toBeInTheDocument();
    expect(within(widok).getByText('PSE — Polskie Sieci Elektroenergetyczne')).toBeInTheDocument();

    const tabela = screen.getByTestId('mvd-studium-dok-podsumowanie');
    expect(within(tabela).getByText('Szyna A')).toBeInTheDocument();
    expect(within(tabela).getByText('1,500 MW')).toBeInTheDocument();
    // Ocena pokrycia P–Q wariantu = etykieta rekordu `ocena` (tekst z rekordu backendu).
    expect(
      within(tabela).getByText(widokDokumentuFixture().podsumowanie[0].pokrycie_pl),
    ).toBeInTheDocument();
    // Typ modułu wariantu 1:1 z `podsumowanie[].klasa` backendu (klasyfikacja WOS: 1,5 MW
    // przy 15 kV → B) — interfejs nie przelicza klasy.
    expect(within(tabela).getByText('B')).toBeInTheDocument();
  });

  it('brak błędów wariantów → uczciwy komunikat, bez sekcji błędów', async () => {
    await przeprowadzBieg();
    fireEvent.click(screen.getByTestId('mvd-studium-dok-przycisk'));
    await screen.findByTestId('mvd-studium-dok-widok');
    expect(screen.getByTestId('mvd-studium-dok-bez-bledow')).toHaveTextContent(
      STUDIUM_STRINGS.dokBezBledow,
    );
    expect(screen.queryByTestId('mvd-studium-dok-bledy')).not.toBeInTheDocument();
  });

  it('sekcja błędu wariantu pokazuje uczciwie fazę i komunikat', async () => {
    pobierzDokument.mockResolvedValue(widokDokumentuZBledemFixture());
    await przeprowadzBieg();
    fireEvent.click(screen.getByTestId('mvd-studium-dok-przycisk'));
    const bledy = await screen.findByTestId('mvd-studium-dok-bledy');
    expect(within(bledy).getByText(/Obszar pracy P–Q/)).toBeInTheDocument();
    expect(within(bledy).getByText(/Węzeł spoza wyników rozpływu mocy\./)).toBeInTheDocument();
  });

  it('sekcja dowodu certyfikatu: urządzenia typu z rekordem wykazu PTPiREE policzonym backendem', async () => {
    // Dokument z żądania z `case_id` policzony backendem (`studium_dokument_scena_macierz`):
    // urządzenia modelu o typie katalogowym dokumentu z dowodem z wykazu i wierszami bloku.
    const dokument = dokumentStudiumZDowodem as unknown as WidokDokumentuStudium;
    pobierzDokument.mockResolvedValue(dokument);
    await przeprowadzBieg();
    fireEvent.click(screen.getByTestId('mvd-studium-dok-przycisk'));
    const sekcja = await screen.findByTestId('mvd-studium-dok-dowod');
    const urzadzenia = dokument.zalozenia.dowod_certyfikatu?.urzadzenia ?? [];
    expect(urzadzenia.length).toBeGreaterThan(0);
    for (const urzadzenie of urzadzenia) {
      const pozycja = within(sekcja).getByTestId(`mvd-studium-dok-dowod-${urzadzenie.der_ref}`);
      expect(pozycja).toHaveAttribute(
        'data-stan',
        urzadzenie.dowod ? 'dowod' : urzadzenie.odrzucony ? 'odrzucony' : 'brak',
      );
      // Wiersze 1:1 z blokiem backendu (te same zdania co DOCX/PDF) — bez przeformułowania.
      for (const wiersz of urzadzenie.wiersze) {
        expect(within(pozycja).getByText(wiersz.etykieta_pl)).toBeInTheDocument();
        expect(within(pozycja).getByText(wiersz.tresc_pl)).toBeInTheDocument();
      }
    }
    const zDowodem = urzadzenia.find((u) => u.dowod !== null);
    expect(zDowodem, 'scena musi mieć urządzenie z rekordem wykazu').toBeDefined();
    expect(
      within(sekcja).getByTestId(`mvd-studium-dok-dowod-${zDowodem!.der_ref}`),
    ).toHaveTextContent(zDowodem!.dowod!.numer_dokumentu);
    expect(screen.queryByTestId('mvd-studium-dok-dowod-brak')).not.toBeInTheDocument();
  });

  it('sekcja dowodu: brak urządzeń typu w modelu → stan zerowy z rekordu, bez listy', async () => {
    const dokument = dokumentStudiumZDowodem as unknown as WidokDokumentuStudium;
    const stanZerowy = 'Stan zerowy przekazany przez backend (stan_pl)';
    pobierzDokument.mockResolvedValue({
      ...dokument,
      zalozenia: {
        ...dokument.zalozenia,
        dowod_certyfikatu: {
          ...dokument.zalozenia.dowod_certyfikatu!,
          urzadzenia: [],
          stan_pl: stanZerowy,
        },
      },
    });
    await przeprowadzBieg();
    fireEvent.click(screen.getByTestId('mvd-studium-dok-przycisk'));
    expect(await screen.findByTestId('mvd-studium-dok-dowod-brak')).toHaveTextContent(stanZerowy);
    expect(screen.queryByTestId('mvd-studium-dok-dowod')).not.toBeInTheDocument();
  });

  it('dokument bez wskazanego przypadku nie ma sekcji dowodu (klucza brak w kontrakcie)', async () => {
    await przeprowadzBieg();
    fireEvent.click(screen.getByTestId('mvd-studium-dok-przycisk'));
    await screen.findByTestId('mvd-studium-dok-widok');
    expect(screen.queryByText(STUDIUM_STRINGS.dokDowodTytul)).not.toBeInTheDocument();
    expect(screen.queryByTestId('mvd-studium-dok-dowod')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mvd-studium-dok-dowod-brak')).not.toBeInTheDocument();
  });
});

describe('KreatorStudium — dokument studium (błędy)', () => {
  it('braki twarde 422 → lista po polsku, bez podglądu', async () => {
    pobierzDokument.mockRejectedValue(
      new DokumentStudiumBrakiError('Dokument studium nie może powstać — dane niekompletne.', [
        'Warianty: nie wskazano żadnego wariantu (węzła przyłączenia).',
      ]),
    );
    await przeprowadzBieg();
    fireEvent.click(screen.getByTestId('mvd-studium-dok-przycisk'));
    const braki = await screen.findByTestId('mvd-studium-dok-braki');
    expect(within(braki).getByText(STUDIUM_STRINGS.dokBrakiTytul)).toBeInTheDocument();
    expect(
      within(braki).getByText('Warianty: nie wskazano żadnego wariantu (węzła przyłączenia).'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-studium-dok-widok')).not.toBeInTheDocument();
  });

  it('błąd API pokazuje komunikat po polsku', async () => {
    pobierzDokument.mockRejectedValue(new Error('Awaria serwera dokumentu.'));
    await przeprowadzBieg();
    fireEvent.click(screen.getByTestId('mvd-studium-dok-przycisk'));
    const blad = await screen.findByTestId('mvd-studium-dok-blad');
    expect(blad).toHaveTextContent('Awaria serwera dokumentu.');
  });
});

describe('KreatorStudium — dokument studium (pobrania plików)', () => {
  function przechwycPobranie() {
    if (typeof URL.createObjectURL !== 'function') URL.createObjectURL = () => 'blob:shim';
    if (typeof URL.revokeObjectURL !== 'function') URL.revokeObjectURL = () => {};
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const originalCreate = document.createElement.bind(document);
    const stan = { nazwa: '' };
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreate(tag);
      if (tag === 'a') {
        const anchor = el as HTMLAnchorElement;
        vi.spyOn(anchor, 'click').mockImplementation(() => {
          stan.nazwa = anchor.download;
        });
      }
      return el;
    });
    return { createObjectURL, stan };
  }

  it('pobranie DOCX → blob zapisany, nazwa pliku studium-<data>.docx', async () => {
    const { createObjectURL, stan } = przechwycPobranie();
    await przeprowadzBieg();
    fireEvent.click(screen.getByTestId('mvd-studium-dok-przycisk'));
    await screen.findByTestId('mvd-studium-dok-widok');
    fireEvent.click(screen.getByTestId('mvd-studium-dok-pobierz-docx'));
    await waitFor(() => expect(pobierzDokumentDocx).toHaveBeenCalledTimes(1));
    expect(createObjectURL).toHaveBeenCalled();
    expect(stan.nazwa).toMatch(/^studium-\d{4}-\d{2}-\d{2}\.docx$/);
  });

  it('pobranie PDF → blob zapisany, nazwa pliku studium-<data>.pdf', async () => {
    const { createObjectURL, stan } = przechwycPobranie();
    await przeprowadzBieg();
    fireEvent.click(screen.getByTestId('mvd-studium-dok-przycisk'));
    await screen.findByTestId('mvd-studium-dok-widok');
    fireEvent.click(screen.getByTestId('mvd-studium-dok-pobierz-pdf'));
    await waitFor(() => expect(pobierzDokumentPdf).toHaveBeenCalledTimes(1));
    expect(createObjectURL).toHaveBeenCalled();
    expect(stan.nazwa).toMatch(/^studium-\d{4}-\d{2}-\d{2}\.pdf$/);
  });
});

describe('KreatorStudium — dokument studium (etykiety PL i zamknięcie)', () => {
  it('nagłówek i przyciski pobrań mają etykiety po polsku', async () => {
    await przeprowadzBieg();
    fireEvent.click(screen.getByTestId('mvd-studium-dok-przycisk'));
    await screen.findByTestId('mvd-studium-dok-widok');
    expect(screen.getByText(STUDIUM_STRINGS.dokNaglowek)).toBeInTheDocument();
    expect(screen.getByTestId('mvd-studium-dok-pobierz-docx')).toHaveTextContent('Pobierz DOCX');
    expect(screen.getByTestId('mvd-studium-dok-pobierz-pdf')).toHaveTextContent('Pobierz PDF');
  });

  it('zamknięcie podglądu chowa panel dokumentu', async () => {
    await przeprowadzBieg();
    fireEvent.click(screen.getByTestId('mvd-studium-dok-przycisk'));
    await screen.findByTestId('mvd-studium-dokument');
    fireEvent.click(screen.getByTestId('mvd-studium-dok-zamknij'));
    expect(screen.queryByTestId('mvd-studium-dokument')).not.toBeInTheDocument();
  });
});
