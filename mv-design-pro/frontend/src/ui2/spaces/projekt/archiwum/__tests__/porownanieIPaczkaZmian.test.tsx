/**
 * Testy okna archiwum — porównanie wersji projektu i paczka zmian.
 *
 * Interakcje przez NATYWNĄ ścieżkę użytkownika (userEvent) — Zero-Debt pkt 5.
 * Asercje idą na REALNY kontrakt backendu (`api/archive_diff.py`,
 * `api/incremental_archive.py`): adres, metoda, pola formularza, nagłówki
 * metryk i kształt odpowiedzi 1:1.
 *
 * ILOCZYN CECH (reguła KLASA, NIE INSTANCJA): operacja {porównanie plików,
 * porównanie projektów, eksport paczki zmian, import paczki zmian} × odpowiedź
 * backendu {wynik poprawny, 422 z nazwanym polem dla: brak klucza głównego, brak
 * klucza zagnieżdżonego, uszkodzony ZIP, niezgodna wersja} — błąd zawsze jako
 * zdanie backendu, wynik zawsze po nazwach elementów; plus zły format pliku
 * (bramka ekranu, zero wołań backendu).
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStateStore } from '../../../../../ui/app-state';
import { EkranArchiwum } from '../EkranArchiwum';
import { ARCHIWUM_STRINGS as T, formatujWartoscPola } from '../strings';

function plik(nazwa: string): File {
  return new File([new Uint8Array([80, 75, 3, 4])], nazwa, { type: 'application/zip' });
}

function przechwycPobranie(): { nazwa: () => string } {
  if (typeof URL.createObjectURL !== 'function') URL.createObjectURL = () => 'blob:shim';
  if (typeof URL.revokeObjectURL !== 'function') URL.revokeObjectURL = () => {};
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const utworz = document.createElement.bind(document);
  let nazwa = '';
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const el = utworz(tag);
    if (tag === 'a') {
      const a = el as HTMLAnchorElement;
      vi.spyOn(a, 'click').mockImplementation(() => {
        nazwa = a.download;
      });
    }
    return el;
  });
  return { nazwa: () => nazwa };
}

/** Odpowiedź `fetch` w kształcie potrzebnym klientowi. */
function odp(status: number, dane: unknown, naglowki: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => dane,
    blob: async () => new Blob(['ZIP'], { type: 'application/zip' }),
    headers: new Headers(naglowki),
  };
}

/** Odpowiedź `ArchiveDiffResponse` z backendu (dodana szyna, zmieniona szyna, element bez nazwy). */
const WYNIK_ROZNICE = {
  archive_hash_a: 'a'.repeat(64),
  archive_hash_b: 'b'.repeat(64),
  overall_status: 'MODIFIED',
  section_diffs: [
    {
      section_name: 'enm',
      section_label_pl: 'Model sieci',
      status: 'MODIFIED',
      hash_a: 'x',
      hash_b: 'y',
      elements_added: 1,
      elements_removed: 0,
      elements_modified: 3,
      element_diffs: [
        {
          element_id: 'bus-uuid-nn-2',
          element_name: 'Szyna nN stacji',
          element_type: 'buses',
          element_type_label_pl: 'Szyny',
          status: 'ADDED',
          field_changes: [],
        },
        {
          element_id: 'bus-uuid-sn-1',
          element_name: 'Szyna SN GPZ',
          element_type: 'buses',
          element_type_label_pl: 'Szyny',
          status: 'MODIFIED',
          field_changes: [
            {
              field_name: 'voltage_kv',
              old_value: 15,
              new_value: 20,
              label_pl: 'Napięcie znamionowe [kV]',
              old_value_pl: null,
              new_value_pl: null,
            },
          ],
        },
        {
          element_id: 'load-uuid-1',
          element_name: 'Odbiór zakładu',
          element_type: 'loads',
          element_type_label_pl: 'Odbiory',
          status: 'MODIFIED',
          field_changes: [
            {
              field_name: 'bus_ref',
              old_value: 'bus-uuid-sn-1',
              new_value: 'bus-uuid-nn-2',
              label_pl: 'Szyna przyłączenia',
              old_value_pl: 'Szyna SN GPZ',
              new_value_pl: 'Szyna nN stacji',
            },
          ],
        },
        {
          element_id: 'header',
          element_name: null,
          element_type: 'header',
          element_type_label_pl: 'Nagłówek modelu sieci',
          status: 'MODIFIED',
          field_changes: [
            {
              field_name: 'revision',
              old_value: 2,
              new_value: 4,
              label_pl: 'Rewizja',
              old_value_pl: null,
              new_value_pl: null,
            },
          ],
        },
      ],
    },
    {
      section_name: 'runs',
      section_label_pl: 'Wykonania analiz',
      status: 'MODIFIED',
      hash_a: 'x',
      hash_b: 'y',
      elements_added: 1,
      elements_removed: 0,
      elements_modified: 0,
      element_diffs: [
        {
          element_id: 'run-7',
          element_name: null,
          element_type: 'canonical_runs',
          element_type_label_pl: 'Przebiegi obliczeń',
          status: 'ADDED',
          field_changes: [],
        },
      ],
    },
    {
      section_name: 'cases',
      section_label_pl: 'Przypadki obliczeniowe',
      status: 'IDENTICAL',
      hash_a: 'z',
      hash_b: 'z',
      elements_added: 0,
      elements_removed: 0,
      elements_modified: 0,
      element_diffs: [],
    },
  ],
  summary: {
    sections_total: 3,
    sections_identical: 1,
    sections_modified: 2,
    total_elements_added: 2,
    total_elements_removed: 0,
    total_elements_modified: 3,
  },
  deterministic_signature: 's',
  report_pl: '',
};

/** Komunikaty 422 backendu dla czterech rodzajów uszkodzenia (brzmienie z `domain/project_archive.py`). */
const BLEDY_422: ReadonlyArray<readonly [string, string]> = [
  ['brak klucza głównego', 'Archiwum B: Błąd struktury archiwum: Brak wymaganej sekcji: cases'],
  [
    'brak klucza zagnieżdżonego',
    'Archiwum A: Błąd struktury archiwum: Brak wymaganego pola: project_meta.name',
  ],
  ['uszkodzony ZIP', 'Archiwum A: Nieprawidłowy format archiwum ZIP'],
  [
    'niezgodna wersja',
    'Archiwum B: Nieobsługiwana wersja schematu archiwum: oczekiwano 3.0.0, otrzymano 9.0.0',
  ],
];

beforeEach(() => {
  useAppStateStore.setState({ activeProjectId: 'proj-1', activeProjectName: 'Sieć Wschód' });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Porównanie dwóch paczek', () => {
  it('dwa pliki → końcówka porównania, wynik po nazwach elementów i etykietach PL', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => odp(200, WYNIK_ROZNICE));
    vi.stubGlobal('fetch', fetchMock);

    render(<EkranArchiwum onZamknij={vi.fn()} />);
    expect(screen.getByTestId('mvd-arch-por-pliki')).toBeDisabled();
    await user.upload(screen.getByTestId('mvd-arch-por-plik-a'), plik('przed.mvdp.zip'));
    await user.upload(screen.getByTestId('mvd-arch-por-plik-b'), plik('po.mvdp.zip'));
    await user.click(screen.getByTestId('mvd-arch-por-pliki'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/archives/diff');
    expect(init.method).toBe('POST');
    const dane = init.body as FormData;
    expect((dane.get('file_a') as File).name).toBe('przed.mvdp.zip');
    expect((dane.get('file_b') as File).name).toBe('po.mvdp.zip');

    const wynik = await screen.findByTestId('mvd-arch-por-wynik');
    expect(within(wynik).getByText(T.wynikRoznice)).toBeTruthy();
    const siec = screen.getByTestId('mvd-arch-por-sekcja-enm');
    expect(within(siec).getByText('Model sieci')).toBeTruthy();
    expect(within(siec).getAllByText('Szyna nN stacji')).toHaveLength(2);
    expect(within(siec).getAllByText('Szyna SN GPZ')).toHaveLength(2);
    expect(within(siec).getAllByText('Szyny')).toHaveLength(2);
    // Pole-odwołanie (szyna przyłączenia odbioru) po NAZWACH szyn z backendu
    // (`old_value_pl`/`new_value_pl`), surowe identyfikatory niewidoczne.
    const odbior = within(siec).getByText('Odbiór zakładu').closest('li') as HTMLElement;
    const wierszSzyny = within(odbior).getByText('Szyna przyłączenia').closest('tr') as HTMLElement;
    expect(within(wierszSzyny).getByText('Szyna SN GPZ')).toBeTruthy();
    expect(within(wierszSzyny).getByText('Szyna nN stacji')).toBeTruthy();
    expect(within(wynik).queryByText('bus-uuid-sn-1')).toBeNull();
    expect(within(siec).getByText('Napięcie znamionowe [kV]')).toBeTruthy();
    expect(within(siec).getByText('15')).toBeTruthy();
    expect(within(siec).getByText('20')).toBeTruthy();
    // Identyfikator elementu NIE jest pokazywany, gdy element ma nazwę.
    expect(within(wynik).queryByText('bus-uuid-nn-2')).toBeNull();
    // Element bez nazwy — identyfikator jest jedyną tożsamością, jaką backend niesie.
    const przebiegi = screen.getByTestId('mvd-arch-por-sekcja-runs');
    expect(within(przebiegi).getByText('run-7')).toBeTruthy();
    expect(within(przebiegi).getByText('Przebiegi obliczeń')).toBeTruthy();
    // Obiekt porównywany pole po polu (identyfikator = rodzaj) — sama etykieta PL,
    // bez powtórzenia surowego klucza „header".
    expect(within(siec).getByText('Nagłówek modelu sieci')).toBeTruthy();
    expect(within(siec).queryByText('header')).toBeNull();
    expect(within(siec).getByText('Rewizja')).toBeTruthy();
    expect(screen.getByTestId('mvd-arch-por-bez-zmian')).toHaveTextContent(
      'Przypadki obliczeniowe',
    );
  });

  it('archiwa identyczne → jedno zdanie werdyktu', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        odp(200, { ...WYNIK_ROZNICE, overall_status: 'IDENTICAL', section_diffs: [] }),
      ),
    );
    render(<EkranArchiwum onZamknij={vi.fn()} />);
    await user.upload(screen.getByTestId('mvd-arch-por-plik-a'), plik('a.zip'));
    await user.upload(screen.getByTestId('mvd-arch-por-plik-b'), plik('b.zip'));
    await user.click(screen.getByTestId('mvd-arch-por-pliki'));
    expect(await screen.findByTestId('mvd-arch-por-wynik')).toHaveTextContent(T.wynikIdentyczne);
  });

  it.each(BLEDY_422)('422 (%s) → zdanie backendu z nazwanym plikiem i polem', async (_r, detail) => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(async () => odp(422, { detail })));
    render(<EkranArchiwum onZamknij={vi.fn()} />);
    await user.upload(screen.getByTestId('mvd-arch-por-plik-a'), plik('a.zip'));
    await user.upload(screen.getByTestId('mvd-arch-por-plik-b'), plik('b.zip'));
    await user.click(screen.getByTestId('mvd-arch-por-pliki'));
    expect(await screen.findByTestId('mvd-arch-por-blad')).toHaveTextContent(detail);
    expect(screen.queryByTestId('mvd-arch-por-wynik')).toBeNull();
  });

  it('plik o innym rozszerzeniu → komunikat po polsku, zero wołań backendu', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<EkranArchiwum onZamknij={vi.fn()} />);
    // ZDARZENIE SYNTETYCZNE — UZASADNIENIE: `userEvent.upload` respektuje `accept`
    // i nie dostarczy pliku o innym rozszerzeniu; przeglądarka pozwala przełączyć
    // filtr na „wszystkie pliki" — wtedy działa bramka komponentu.
    const pole = screen.getByTestId('mvd-arch-por-plik-a') as HTMLInputElement;
    Object.defineProperty(pole, 'files', {
      value: [new File(['x'], 'siec.xlsx')],
      configurable: true,
    });
    fireEvent.change(pole);
    expect(await screen.findByTestId('mvd-arch-por-blad')).toHaveTextContent(T.importZlyFormat);
    expect(screen.getByTestId('mvd-arch-por-pliki')).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('Porównanie otwartego projektu z innym projektem', () => {
  it('lista projektów na żądanie → końcówka porównania projektów (A = otwarty)', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (wejscie: RequestInfo | URL) => {
      const url = String(wejscie);
      if (url === '/api/projects') {
        return odp(200, {
          projects: [
            { id: 'proj-1', name: 'Sieć Wschód' },
            { id: 'proj-2', name: 'Sieć Wschód — wariant B' },
          ],
          total: 2,
        });
      }
      return odp(200, WYNIK_ROZNICE);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<EkranArchiwum onZamknij={vi.fn()} />);
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(screen.getByTestId('mvd-arch-por-zaladuj'));
    const wybor = await screen.findByTestId('mvd-arch-por-projekt');
    // Otwarty projekt nie jest kandydatem do porównania z samym sobą.
    expect(within(wybor).queryByText('Sieć Wschód')).toBeNull();
    await user.selectOptions(wybor, 'proj-2');
    await user.click(screen.getByTestId('mvd-arch-por-projekty'));

    await screen.findByTestId('mvd-arch-por-wynik');
    const urls = fetchMock.mock.calls.map((c) => String((c as unknown as [string])[0]));
    expect(urls).toEqual(['/api/projects', '/api/archives/diff/projects/proj-1/proj-2']);
    expect((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].method).toBe('POST');
  });

  it('brak projektu otwartego → brak porównania projektów, porównanie plików dostępne', () => {
    useAppStateStore.setState({ activeProjectId: null, activeProjectName: null });
    render(<EkranArchiwum onZamknij={vi.fn()} />);
    expect(screen.queryByTestId('mvd-arch-por-zaladuj')).toBeNull();
    expect(screen.getByTestId('mvd-arch-por-plik-a')).toBeTruthy();
  });

  it('404 projektu → zdanie backendu', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (wejscie: RequestInfo | URL) =>
        String(wejscie) === '/api/projects'
          ? odp(200, { projects: [{ id: 'proj-2', name: 'Inny' }], total: 1 })
          : odp(404, { detail: 'Projekt B: Projekt o ID proj-2 nie istnieje' }),
      ),
    );
    render(<EkranArchiwum onZamknij={vi.fn()} />);
    await user.click(screen.getByTestId('mvd-arch-por-zaladuj'));
    await user.selectOptions(await screen.findByTestId('mvd-arch-por-projekt'), 'proj-2');
    await user.click(screen.getByTestId('mvd-arch-por-projekty'));
    expect(await screen.findByTestId('mvd-arch-por-blad')).toHaveTextContent(
      'Projekt B: Projekt o ID proj-2 nie istnieje',
    );
  });
});

const NAGLOWKI_PACZKI = {
  'X-Sections-Changed': '2',
  'X-Sections-Unchanged': '5',
  'X-Size-Full': '20480',
  'X-Size-Delta': '2048',
  'X-Savings-Percent': '90.0',
};

describe('Paczka zmian — eksport', () => {
  it('paczka bazowa → końcówka eksportu przyrostowego, pobranie i metryki z nagłówków', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => odp(200, null, NAGLOWKI_PACZKI));
    vi.stubGlobal('fetch', fetchMock);
    const pobranie = przechwycPobranie();

    render(<EkranArchiwum onZamknij={vi.fn()} />);
    expect(screen.getByTestId('mvd-arch-paczka-eksport')).toBeDisabled();
    await user.upload(screen.getByTestId('mvd-arch-paczka-eksport-baza'), plik('baza.mvdp.zip'));
    await user.click(screen.getByTestId('mvd-arch-paczka-eksport'));

    const metryki = await screen.findByTestId('mvd-arch-paczka-metryki');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/projects/proj-1/export/incremental');
    expect(init.method).toBe('POST');
    expect(((init.body as FormData).get('base_file') as File).name).toBe('baza.mvdp.zip');
    expect(pobranie.nazwa()).toMatch(/^zmiany-siec-wschod-\d{4}-\d{2}-\d{2}\.mvdp-delta\.zip$/);
    expect(metryki).toHaveTextContent('2');
    expect(metryki).toHaveTextContent('5');
    expect(metryki).toHaveTextContent('2.0 KiB / 20.0 KiB');
    expect(metryki).toHaveTextContent('90 %');
  });

  it('odpowiedź bez nagłówka metryk → nazwany błąd kontraktu, nie ciche zero', async () => {
    const user = userEvent.setup();
    const { 'X-Size-Delta': _pominiety, ...bezRozmiaru } = NAGLOWKI_PACZKI;
    vi.stubGlobal('fetch', vi.fn(async () => odp(200, null, bezRozmiaru)));
    render(<EkranArchiwum onZamknij={vi.fn()} />);
    await user.upload(screen.getByTestId('mvd-arch-paczka-eksport-baza'), plik('baza.zip'));
    await user.click(screen.getByTestId('mvd-arch-paczka-eksport'));
    expect(await screen.findByTestId('mvd-arch-paczka-eksport-blad')).toHaveTextContent(
      'X-Size-Delta',
    );
    expect(screen.queryByTestId('mvd-arch-paczka-metryki')).toBeNull();
  });

  it.each(BLEDY_422.map(([r, d]) => [r, d.replace(/^Archiwum [AB]: /, 'Archiwum bazowe: ')]))(
    '422 (%s) → zdanie backendu',
    async (_r, detail) => {
      const user = userEvent.setup();
      vi.stubGlobal('fetch', vi.fn(async () => odp(422, { detail })));
      render(<EkranArchiwum onZamknij={vi.fn()} />);
      await user.upload(screen.getByTestId('mvd-arch-paczka-eksport-baza'), plik('baza.zip'));
      await user.click(screen.getByTestId('mvd-arch-paczka-eksport'));
      expect(await screen.findByTestId('mvd-arch-paczka-eksport-blad')).toHaveTextContent(detail);
    },
  );

  it('brak otwartego projektu → uczciwy stan zerowy eksportu, import paczki dostępny', () => {
    useAppStateStore.setState({ activeProjectId: null, activeProjectName: null });
    render(<EkranArchiwum onZamknij={vi.fn()} />);
    expect(screen.getByTestId('mvd-arch-paczka-brak-projektu')).toHaveTextContent(
      T.paczkaEksportBrakProjektu,
    );
    expect(screen.queryByTestId('mvd-arch-paczka-eksport')).toBeNull();
    expect(screen.getByTestId('mvd-arch-paczka-import-plik')).toBeTruthy();
  });
});

const WYNIK_PACZKI = {
  status: 'SUCCESS',
  project_id: 'proj-z-paczki',
  warnings: [],
  errors: [],
  migrated_from_version: null,
  elements_without_catalog: [],
  catalog_mapping_required: false,
  sections_applied: 2,
};

describe('Paczka zmian — import', () => {
  it('baza + paczka + nazwa → końcówka importu przyrostowego, raport i otwarcie projektu', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (wejscie: RequestInfo | URL) => {
      const url = String(wejscie);
      if (url === '/api/study-cases/project/proj-z-paczki/active') {
        return odp(200, { id: 'case-z-paczki', name: 'Wariant', result_status: 'NONE' });
      }
      return odp(200, WYNIK_PACZKI);
    });
    vi.stubGlobal('fetch', fetchMock);
    const onZamknij = vi.fn();

    render(<EkranArchiwum onZamknij={onZamknij} />);
    expect(screen.getByTestId('mvd-arch-paczka-import')).toBeDisabled();
    await user.upload(screen.getByTestId('mvd-arch-paczka-import-baza'), plik('baza.mvdp.zip'));
    await user.upload(
      screen.getByTestId('mvd-arch-paczka-import-plik'),
      plik('zmiany.mvdp-delta.zip'),
    );
    await user.type(screen.getByTestId('mvd-arch-paczka-import-nazwa'), 'Sieć po zmianach');
    await user.click(screen.getByTestId('mvd-arch-paczka-import'));

    const raport = await screen.findByTestId('mvd-arch-paczka-raport');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/projects/import/incremental');
    const dane = init.body as FormData;
    expect((dane.get('base_file') as File).name).toBe('baza.mvdp.zip');
    expect((dane.get('delta_file') as File).name).toBe('zmiany.mvdp-delta.zip');
    expect(dane.get('new_name')).toBe('Sieć po zmianach');
    expect(within(raport).getByText(T.raportSukces)).toBeTruthy();
    expect(within(raport).getByText(T.paczkaImportZastosowane).closest('.mvd-arch-kv')).toHaveTextContent('2');

    await user.click(screen.getByTestId('mvd-arch-paczka-otworz'));
    await waitFor(() => expect(onZamknij).toHaveBeenCalledTimes(1));
    expect(useAppStateStore.getState().activeProjectId).toBe('proj-z-paczki');
    expect(useAppStateStore.getState().activeProjectName).toBe('Sieć po zmianach');
    expect(useAppStateStore.getState().activeCaseId).toBe('case-z-paczki');
  });

  it('otwarcie bez podanej nazwy → nazwa projektu czytana z backendu, nie zgadywana', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (wejscie: RequestInfo | URL) => {
        const url = String(wejscie);
        if (url === '/api/projects/proj-z-paczki') {
          return odp(200, { id: 'proj-z-paczki', name: 'Sieć Wschód (z archiwum)' });
        }
        if (url === '/api/study-cases/project/proj-z-paczki/active') return odp(200, null);
        return odp(200, WYNIK_PACZKI);
      }),
    );
    render(<EkranArchiwum onZamknij={vi.fn()} />);
    await user.upload(screen.getByTestId('mvd-arch-paczka-import-baza'), plik('baza.zip'));
    await user.upload(screen.getByTestId('mvd-arch-paczka-import-plik'), plik('zmiany.zip'));
    await user.click(screen.getByTestId('mvd-arch-paczka-import'));
    await user.click(await screen.findByTestId('mvd-arch-paczka-otworz'));
    await waitFor(() =>
      expect(useAppStateStore.getState().activeProjectName).toBe('Sieć Wschód (z archiwum)'),
    );
  });

  it.each([
    ['odczyt nazwy projektu', '/api/projects/proj-z-paczki'],
    ['odczyt aktywnego wariantu', '/api/study-cases/project/proj-z-paczki/active'],
  ])(
    'błąd przy otwieraniu (%s) → projekt i tak otwarty, okno zamknięte, zero zgadywanej nazwy',
    async (_opis, zawodzacyUrl) => {
      // Gałąź `catch` w `EkranArchiwum.otworzProjekt`: projekt już istnieje na
      // serwerze, więc błąd odczytu nazwy albo wariantu nie blokuje otwarcia —
      // nazwa nieznana zostaje pusta (nie jest zgadywana), wariant nieustawiony.
      useAppStateStore.setState({ activeCaseId: null });
      const user = userEvent.setup();
      vi.stubGlobal(
        'fetch',
        vi.fn(async (wejscie: RequestInfo | URL) => {
          const url = String(wejscie);
          if (url === zawodzacyUrl) return odp(500, { detail: 'awaria serwera' });
          if (url === '/api/projects/proj-z-paczki') {
            return odp(200, { id: 'proj-z-paczki', name: 'Sieć Wschód (z archiwum)' });
          }
          return odp(200, WYNIK_PACZKI);
        }),
      );
      const onZamknij = vi.fn();
      render(<EkranArchiwum onZamknij={onZamknij} />);
      await user.upload(screen.getByTestId('mvd-arch-paczka-import-baza'), plik('baza.zip'));
      await user.upload(screen.getByTestId('mvd-arch-paczka-import-plik'), plik('zmiany.zip'));
      await user.click(screen.getByTestId('mvd-arch-paczka-import'));
      await user.click(await screen.findByTestId('mvd-arch-paczka-otworz'));

      await waitFor(() => expect(onZamknij).toHaveBeenCalledTimes(1));
      const stan = useAppStateStore.getState();
      expect(stan.activeProjectId).toBe('proj-z-paczki');
      expect(stan.activeCaseId).toBeNull();
      expect(stan.activeProjectName).toBe(
        zawodzacyUrl === '/api/projects/proj-z-paczki' ? null : 'Sieć Wschód (z archiwum)',
      );
    },
  );

  it.each([
    ...BLEDY_422.map(([r, d]) => [`baza: ${r}`, d.replace(/^Archiwum [AB]: /, 'Archiwum bazowe: ')]),
    [
      'paczka: brak klucza zagnieżdżonego',
      'Paczka zmian: Błąd struktury archiwum przyrostowego: Brak wymaganego pola: deltas[0].status',
    ],
    [
      'paczka: niezgodna wersja',
      'Paczka zmian: Nieobsługiwana wersja schematu przyrostowego: oczekiwano 1.0.0, otrzymano 2.0.0',
    ],
  ])('422 (%s) → zdanie backendu, bez raportu', async (_r, detail) => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(async () => odp(422, { detail })));
    render(<EkranArchiwum onZamknij={vi.fn()} />);
    await user.upload(screen.getByTestId('mvd-arch-paczka-import-baza'), plik('baza.zip'));
    await user.upload(screen.getByTestId('mvd-arch-paczka-import-plik'), plik('zmiany.zip'));
    await user.click(screen.getByTestId('mvd-arch-paczka-import'));
    expect(await screen.findByTestId('mvd-arch-paczka-import-blad')).toHaveTextContent(detail);
    expect(screen.queryByTestId('mvd-arch-paczka-raport')).toBeNull();
  });

  it('409 (paczka innej bazy) → zdanie backendu', async () => {
    const user = userEvent.setup();
    const detail = 'Paczka zmian powstała względem innego archiwum bazowego niż wskazane: …';
    vi.stubGlobal('fetch', vi.fn(async () => odp(409, { detail })));
    render(<EkranArchiwum onZamknij={vi.fn()} />);
    await user.upload(screen.getByTestId('mvd-arch-paczka-import-baza'), plik('baza.zip'));
    await user.upload(screen.getByTestId('mvd-arch-paczka-import-plik'), plik('zmiany.zip'));
    await user.click(screen.getByTestId('mvd-arch-paczka-import'));
    expect(await screen.findByTestId('mvd-arch-paczka-import-blad')).toHaveTextContent(detail);
  });

  it('„Wybierz inną paczkę" czyści raport i oba pliki', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(async () => odp(200, WYNIK_PACZKI)));
    render(<EkranArchiwum onZamknij={vi.fn()} />);
    await user.upload(screen.getByTestId('mvd-arch-paczka-import-baza'), plik('baza.zip'));
    await user.upload(screen.getByTestId('mvd-arch-paczka-import-plik'), plik('zmiany.zip'));
    await user.click(screen.getByTestId('mvd-arch-paczka-import'));
    await user.click(await screen.findByTestId('mvd-arch-paczka-ponow'));
    expect(screen.queryByTestId('mvd-arch-paczka-raport')).toBeNull();
    expect(screen.getByTestId('mvd-arch-paczka-import')).toBeDisabled();
  });
});

describe('formatujWartoscPola', () => {
  it.each([
    [null, '—'],
    [undefined, '—'],
    ['', '—'],
    ['Szyna', 'Szyna'],
    [15.5, '15.5'],
    [true, 'tak'],
    [false, 'nie'],
    [{ a: 1 }, '{"a":1}'],
  ])('%j → %s', (wartosc, oczekiwane) => {
    expect(formatujWartoscPola(wartosc)).toBe(oczekiwane);
  });
});
