/**
 * Testy generatora raportu w powłoce ui2 (karta KD-4, luka L-15).
 *
 * INTENCJA: każda kontrolka składu ma REALNIE trafiać do wywołania eksportu
 * (phantom rule). Testy sprawdzają URL żądania — czyli to, co backend
 * faktycznie dostaje — a nie napis na ekranie. Interakcje przez natywną
 * ścieżkę użytkownika (userEvent), Zero-Debt pkt 5.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useExecutionRunsStore } from '../../../../../ui/study-cases/runStore';
import { useShellStore } from '../../../../shell/useShellStore';
import { GeneratorRaportu } from '../GeneratorRaportu';
import {
  domyslnyPrzebieg,
  etykietaPrzebiegu,
  przebiegiDoRaportu,
} from '../model';
import { ustawBiegOgladany, wyczyscKontekstWyniku } from '../../../../../test/kontekstBiegu';

type Run = ReturnType<typeof useExecutionRunsStore.getState>['runs'][number];

function przebieg(id: string, analysisType: string, finishedAt: string, status = 'DONE'): Run {
  return {
    id,
    study_case_id: 'case-1',
    analysis_type: analysisType,
    solver_input_hash: 'h',
    status,
    started_at: finishedAt,
    finished_at: finishedAt,
    error_message: null,
  } as unknown as Run;
}

/** Odpowiedź bramy eksportu wywodu (`…/export/proof/dostepnosc`) — wszystkie formaty dostępne. */
function odpowiedzBramyWywodu(url: string, niedostepne: Record<string, string> = {}): Response {
  const runId = decodeURIComponent(url.split('/analysis-runs/')[1]?.split('/')[0] ?? '');
  return new Response(
    JSON.stringify({
      run_id: runId,
      formaty: ['json', 'latex', 'pdf'].map((format) => ({
        format,
        dostepny: !(format in niedostepne),
        powod_pl: niedostepne[format] ?? null,
      })),
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

/** Zbiera URL-e żądań eksportu (fetch) — dowód, co backend dostaje. */
function przechwycFetch(niedostepne: Record<string, string> = {}): string[] {
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (url.includes('/export/proof/dostepnosc')) return odpowiedzBramyWywodu(url, niedostepne);
      if (url.includes('/results/index')) {
        return new Response(
          JSON.stringify({ tables: [{ table_id: 'short_circuit', label_pl: 'Zwarcia', row_count: 7 }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('x', { status: 200 });
    }),
  );
  return urls;
}

describe('GeneratorRaportu — okno składania raportu (ui2)', () => {
  beforeEach(() => {
    wyczyscKontekstWyniku();
    useExecutionRunsStore.setState({ runs: [] });
    useShellStore.setState({ activeSpace: 'dokumentacja' });
    // jsdom nie ma createObjectURL — pobranie pliku jest efektem ubocznym klienta.
    Object.defineProperty(window.URL, 'createObjectURL', { value: () => 'blob:x', writable: true });
    Object.defineProperty(window.URL, 'revokeObjectURL', { value: () => undefined, writable: true });
    // jsdom nie implementuje nawigacji kotwicy pobrania (`a[download].click()`): klik przechwycony
    // na granicy przeglądarki, bez szumu „Not implemented: navigation".
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('UCZCIWY STAN ZEROWY: brak zakończonego przebiegu → komunikat + akcja do obliczeń', async () => {
    const user = userEvent.setup();
    useExecutionRunsStore.setState({ runs: [przebieg('r1', 'SC_3F', '2026-07-30T10:00:00Z', 'RUNNING')] });

    render(<GeneratorRaportu />);
    expect(screen.getByTestId('mvd-generator-pusty')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Przejdź do obliczeń' }));
    expect(useShellStore.getState().activeSpace).toBe('obliczenia');
  });

  it('SKŁAD JEDZIE DO BACKENDU: profil, poziom, zakres, sekcje i tabela w URL eksportu', async () => {
    const user = userEvent.setup();
    const urls = przechwycFetch();
    useExecutionRunsStore.setState({ runs: [przebieg('run-a', 'SC_3F', '2026-07-30T10:00:00Z')] });

    render(<GeneratorRaportu />);

    // Tabela wiodąca pochodzi z REALNEJ odpowiedzi backendu (results/index).
    await waitFor(() => expect(screen.getByRole('option', { name: 'Zwarcia (7)' })).toBeTruthy());

    await user.selectOptions(screen.getByTestId('mvd-generator-profil'), 'audytowy');
    await user.selectOptions(screen.getByTestId('mvd-generator-poziom'), 'pelny');
    await user.selectOptions(screen.getByTestId('mvd-generator-zakres'), 'active_table');
    await user.selectOptions(screen.getByTestId('mvd-generator-tabela'), 'short_circuit');
    await user.click(screen.getByTestId('mvd-generator-sekcja-summary'));
    await user.click(screen.getByTestId('mvd-generator-sekcja-trace'));

    await user.click(screen.getByTestId('mvd-generator-raport-pdf'));

    await waitFor(() => {
      const eksport = urls.find((u) => u.includes('/export/report/pdf'));
      expect(eksport).toBeTruthy();
      expect(eksport).toContain('profile=audytowy');
      expect(eksport).toContain('detail_level=pelny');
      expect(eksport).toContain('scope=active_table');
      expect(eksport).toContain('focus_table=short_circuit');
      expect(eksport).toContain('sections=summary');
      expect(eksport).toContain('sections=trace');
      // Zapis do magazynu jest domyślnie włączony (dokument trafia na listę).
      expect(eksport).toContain('zapisz_do_magazynu=true');
    });
  });

  it('PAKIET DOWODOWY nie dostaje kompozycji (backend jej dla niego nie przyjmuje)', async () => {
    const user = userEvent.setup();
    const urls = przechwycFetch();
    useExecutionRunsStore.setState({ runs: [przebieg('run-b', 'LOAD_FLOW', '2026-07-30T11:00:00Z')] });

    render(<GeneratorRaportu />);
    await user.selectOptions(screen.getByTestId('mvd-generator-profil'), 'wykonawczy');
    await user.click(screen.getByTestId('mvd-generator-dowod-latex'));

    await waitFor(() => {
      const eksport = urls.find((u) => u.includes('/export/proof/latex'));
      expect(eksport).toBeTruthy();
      expect(eksport).not.toContain('profile=');
      expect(eksport).toContain('zapisz_do_magazynu=true');
    });
  });

  it('WYŁĄCZONY zapis do magazynu → brak parametru (nic nie ląduje na liście)', async () => {
    const user = userEvent.setup();
    const urls = przechwycFetch();
    useExecutionRunsStore.setState({ runs: [przebieg('run-c', 'SC_3F', '2026-07-30T12:00:00Z')] });

    render(<GeneratorRaportu />);
    await user.click(screen.getByTestId('mvd-generator-magazyn'));
    await user.click(screen.getByTestId('mvd-generator-raport-json'));

    await waitFor(() => {
      const eksport = urls.find((u) => u.includes('/export/report/json'));
      expect(eksport).toBeTruthy();
      expect(eksport).not.toContain('zapisz_do_magazynu');
    });
  });

  it('WYBÓR PRZEBIEGU: eksport idzie do wskazanego biegu, nie do aktywnego', async () => {
    const user = userEvent.setup();
    const urls = przechwycFetch();
    ustawBiegOgladany('run-nowszy');
    useExecutionRunsStore.setState({
      runs: [
        przebieg('run-nowszy', 'SC_3F', '2026-07-30T12:00:00Z'),
        przebieg('run-starszy', 'LOAD_FLOW', '2026-07-29T09:00:00Z'),
      ],
    });

    render(<GeneratorRaportu />);
    await user.selectOptions(screen.getByTestId('mvd-generator-przebieg'), 'run-starszy');
    await user.click(screen.getByTestId('mvd-generator-raport-docx'));

    await waitFor(() => {
      expect(urls.some((u) => u.includes('/analysis-runs/run-starszy/export/report/docx'))).toBe(true);
    });
  });
});

describe('model generatora — czyste selektory', () => {
  it('bierze wyłącznie zakończone przebiegi, najnowszy pierwszy', () => {
    const runs = [
      przebieg('a', 'SC_3F', '2026-07-28T10:00:00Z'),
      przebieg('b', 'LOAD_FLOW', '2026-07-30T10:00:00Z'),
      przebieg('c', 'SC_3F', '2026-07-31T10:00:00Z', 'FAILED'),
    ];
    expect(przebiegiDoRaportu(runs).map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('domyślnie wskazuje aktywny przebieg, gdy jest zakończony', () => {
    const runs = przebiegiDoRaportu([
      przebieg('a', 'SC_3F', '2026-07-28T10:00:00Z'),
      przebieg('b', 'LOAD_FLOW', '2026-07-30T10:00:00Z'),
    ]);
    expect(domyslnyPrzebieg(runs, 'a')).toBe('a');
    // Aktywny bieg spoza listy (np. nieukończony) nie może wygrać.
    expect(domyslnyPrzebieg(runs, 'nieistniejacy')).toBe('b');
    expect(domyslnyPrzebieg([], 'a')).toBeNull();
  });

  it('etykieta przebiegu podaje rodzaj analizy po polsku i datę', () => {
    expect(etykietaPrzebiegu(przebieg('a', 'SC_3F', '2026-07-28T10:00:00Z'))).toBe(
      'Zwarcie trójfazowe (3F) · 2026-07-28 10:00',
    );
  });
});

/**
 * KOMPLETNOSC-POLA-TR §0 pkt 2 — brama dokumentacji wykonawczej w generatorze.
 *
 * Ekran nie ocenia modelu: pyta backend o werdykt (ten sam, którym backend
 * odmawia eksportu) i POKAZUJE go przed kliknięciem. Test jedzie realną ścieżką
 * użytkownika i sprawdza SKUTEK (czy żądanie eksportu poszło), nie sam napis.
 */
describe('GeneratorRaportu — brama dokumentacji wykonawczej', () => {
  /** Fetch z werdyktem bramy: model z luką pola transformatorowego SN. */
  function przechwycFetchZBrama(gotowy: boolean): string[] {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        urls.push(url);
        if (url.includes('/export/proof/dostepnosc')) return odpowiedzBramyWywodu(url);
        if (url.includes('/gotowosc-dokumentacji-wykonawczej')) {
          return new Response(
            JSON.stringify({
              gotowy,
              blokady: gotowy
                ? []
                : [
                    {
                      code: 'transformer.bay_missing',
                      message_pl:
                        "Transformator 'tr-1' jest połączony elektrycznie z szyną SN, "
                        + 'lecz nie posiada kompletnej konfiguracji pola transformatorowego '
                        + 'po stronie SN.',
                      element_refs: ['tr-1', 'stn-1'],
                    },
                  ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (url.includes('/results/index')) {
          return new Response(JSON.stringify({ tables: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response('x', { status: 200 });
      }),
    );
    return urls;
  }

  beforeEach(() => {
    wyczyscKontekstWyniku();
    useExecutionRunsStore.setState({ runs: [] });
    useShellStore.setState({ activeSpace: 'dokumentacja' });
    Object.defineProperty(window.URL, 'createObjectURL', { value: () => 'blob:x', writable: true });
    Object.defineProperty(window.URL, 'revokeObjectURL', { value: () => undefined, writable: true });
    // jsdom nie implementuje nawigacji kotwicy pobrania (`a[download].click()`): klik przechwycony
    // na granicy przeglądarki, bez szumu „Not implemented: navigation".
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('model z luką pola TR: profil „Wykonawczy" → powód widoczny, eksport niedostępny', async () => {
    const user = userEvent.setup();
    const urls = przechwycFetchZBrama(false);
    useExecutionRunsStore.setState({ runs: [przebieg('run-pw', 'PF', '2026-08-01T10:00:00Z')] });

    render(<GeneratorRaportu />);

    // Domyślny profil (OSD) NIE jest bramkowany — nic nie zasłania ekranu.
    await waitFor(() =>
      expect(urls.some((u) => u.includes('/gotowosc-dokumentacji-wykonawczej'))).toBe(true),
    );
    expect(screen.queryByTestId('mvd-generator-brama-pw')).toBeNull();
    expect(screen.getByTestId('mvd-generator-raport-pdf')).not.toBeDisabled();

    await user.selectOptions(screen.getByTestId('mvd-generator-profil'), 'wykonawczy');

    const brama = await screen.findByTestId('mvd-generator-brama-pw');
    expect(brama.textContent).toMatch(/pola transformatorowego/);
    // Przycisk nieaktywny — i realnie nie wysyła żądania (martwy klik byłby
    // gorszy niż brak przycisku).
    const przycisk = screen.getByTestId('mvd-generator-raport-pdf');
    expect(przycisk).toBeDisabled();
    await user.click(przycisk);
    expect(urls.some((u) => u.includes('/export/report/'))).toBe(false);
  });

  it('model kompletny: profil „Wykonawczy" przechodzi bez przeszkód', async () => {
    const user = userEvent.setup();
    const urls = przechwycFetchZBrama(true);
    useExecutionRunsStore.setState({ runs: [przebieg('run-ok', 'PF', '2026-08-01T10:00:00Z')] });

    render(<GeneratorRaportu />);
    await waitFor(() =>
      expect(urls.some((u) => u.includes('/gotowosc-dokumentacji-wykonawczej'))).toBe(true),
    );

    await user.selectOptions(screen.getByTestId('mvd-generator-profil'), 'wykonawczy');
    expect(screen.queryByTestId('mvd-generator-brama-pw')).toBeNull();

    await user.click(screen.getByTestId('mvd-generator-raport-pdf'));
    await waitFor(() => {
      const eksport = urls.find((u) => u.includes('/export/report/pdf'));
      expect(eksport).toBeTruthy();
      expect(eksport).toContain('profile=wykonawczy');
    });
  });

  it('pakiet dowodowy NIE jest bramkowany — brama dotyczy dokumentacji wykonawczej', async () => {
    const user = userEvent.setup();
    const urls = przechwycFetchZBrama(false);
    useExecutionRunsStore.setState({ runs: [przebieg('run-pw2', 'PF', '2026-08-01T10:00:00Z')] });

    render(<GeneratorRaportu />);
    await user.selectOptions(screen.getByTestId('mvd-generator-profil'), 'wykonawczy');
    await screen.findByTestId('mvd-generator-brama-pw');

    await waitFor(() =>
      expect((screen.getByTestId('mvd-generator-dowod-json') as HTMLButtonElement).disabled).toBe(false),
    );
    await user.click(screen.getByTestId('mvd-generator-dowod-json'));
    await waitFor(() => {
      expect(urls.some((u) => u.includes('/export/proof/json'))).toBe(true);
    });
  });
});

/**
 * Karta UI-02 PANEL-DOLNY — brama eksportu wywodu. Dostępność formatu (i przyczynę
 * braku) podaje serwer funkcją, którą buduje eksport; ekran nie liczy własnego
 * predykatu. Iloczyn: format niedostępny × format dostępny × błąd bramy — skutek
 * (czy żądanie eksportu poszło), nie tylko napis.
 */
describe('GeneratorRaportu — brama eksportu wywodu', () => {
  beforeEach(() => {
    wyczyscKontekstWyniku();
    useExecutionRunsStore.setState({ runs: [] });
    useShellStore.setState({ activeSpace: 'dokumentacja' });
    Object.defineProperty(window.URL, 'createObjectURL', { value: () => 'blob:x', writable: true });
    Object.defineProperty(window.URL, 'revokeObjectURL', { value: () => undefined, writable: true });
    // jsdom nie implementuje nawigacji kotwicy pobrania (`a[download].click()`): klik przechwycony
    // na granicy przeglądarki, bez szumu „Not implemented: navigation".
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('format niedostępny jest nieaktywny z przyczyną serwera; dostępny działa', async () => {
    const user = userEvent.setup();
    const powod = 'Eksport PDF wymaga biblioteki reportlab, której nie ma na serwerze.';
    const urls = przechwycFetch({ pdf: powod });
    useExecutionRunsStore.setState({ runs: [przebieg('run-g1', 'SC_3F', '2026-08-02T10:00:00Z')] });

    render(<GeneratorRaportu />);
    await waitFor(() =>
      expect((screen.getByTestId('mvd-generator-dowod-json') as HTMLButtonElement).disabled).toBe(false),
    );
    const pdf = screen.getByTestId('mvd-generator-dowod-pdf') as HTMLButtonElement;
    expect(pdf.disabled).toBe(true);
    expect(pdf.title).toBe(powod);
    expect(screen.getByTestId('mvd-generator-dowod-powod').textContent).toContain(powod);
    expect(urls.some((u) => u.includes('/analysis-runs/run-g1/export/proof/dostepnosc'))).toBe(true);

    await user.click(pdf);
    expect(urls.some((u) => u.includes('/export/proof/pdf'))).toBe(false);

    await user.click(screen.getByTestId('mvd-generator-dowod-json'));
    await waitFor(() => expect(urls.some((u) => u.includes('/export/proof/json'))).toBe(true));
  });

  it('wszystkie formaty niedostępne (bieg bez śladu) → wszystkie nieaktywne, jedna przyczyna', async () => {
    const powod = 'Przebieg nie ma śladu obliczeń — wywodu nie da się zbudować.';
    przechwycFetch({ json: powod, latex: powod, pdf: powod });
    useExecutionRunsStore.setState({ runs: [przebieg('run-g2', 'PHASE_STATE_SN', '2026-08-02T11:00:00Z')] });

    render(<GeneratorRaportu />);
    await waitFor(() => expect(screen.getByTestId('mvd-generator-dowod-powod')).toBeTruthy());
    for (const format of ['pdf', 'latex', 'json']) {
      const przycisk = screen.getByTestId(`mvd-generator-dowod-${format}`) as HTMLButtonElement;
      expect(przycisk.disabled).toBe(true);
      expect(przycisk.title).toBe(powod);
    }
    expect(screen.getByTestId('mvd-generator-dowod-powod').textContent).toBe(
      `Eksport wywodu niedostępny: ${powod}`,
    );
  });

  it('błąd bramy → polecenia nieaktywne z przyczyną (serwer niczego nie potwierdził)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/export/proof/dostepnosc')) {
          return new Response(JSON.stringify({ detail: 'Przebieg nie istnieje.' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ tables: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    useExecutionRunsStore.setState({ runs: [przebieg('run-g3', 'LOAD_FLOW', '2026-08-02T12:00:00Z')] });

    render(<GeneratorRaportu />);
    await waitFor(() =>
      expect(screen.getByTestId('mvd-generator-dowod-powod').textContent).toContain('Przebieg nie istnieje.'),
    );
    expect((screen.getByTestId('mvd-generator-dowod-latex') as HTMLButtonElement).disabled).toBe(true);
  });
});
