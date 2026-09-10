/**
 * Testy okna „Archiwum projektu (ZIP)" (przestrzeń „Projekt").
 *
 * Interakcje przez NATYWNĄ ścieżkę użytkownika (userEvent) — Zero-Debt pkt 5.
 * Asercje idą na REALNY kontrakt backendu (`api/project_archive.py`): adres
 * końcówki, metoda, parametr zapisu do magazynu dokumentów, pola formularza
 * importu i pełny kształt odpowiedzi (łącznie z bramką katalogową).
 *
 * Iloczyn cech pokryty testami (reguła KLASA, NIE INSTANCJA): eksport ×
 * {projekt otwarty, brak projektu, błąd końcówki} oraz import ×
 * {SUCCESS, FAILED, wymagane mapowanie katalogu, zły format pliku, podgląd}.
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStateStore } from '../../../../../ui/app-state';
import { EkranArchiwum } from '../EkranArchiwum';
import { ARCHIWUM_STRINGS as T } from '../strings';

/** Plik archiwum do wysyłki (jsdom `File`). */
function plikArchiwum(nazwa = 'projekt.mvdp.zip'): File {
  return new File([new Uint8Array([80, 75, 3, 4])], nazwa, { type: 'application/zip' });
}

/** Shim pobierania pliku (jsdom nie implementuje `URL.createObjectURL`). */
function przechwycPobranie(): { nazwa: () => string } {
  if (typeof URL.createObjectURL !== 'function') URL.createObjectURL = () => 'blob:shim';
  if (typeof URL.revokeObjectURL !== 'function') URL.revokeObjectURL = () => {};
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const utworzOryginal = document.createElement.bind(document);
  let nazwa = '';
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const el = utworzOryginal(tag);
    if (tag === 'a') {
      const kotwica = el as HTMLAnchorElement;
      vi.spyOn(kotwica, 'click').mockImplementation(() => {
        nazwa = kotwica.download;
      });
    }
    return el;
  });
  return { nazwa: () => nazwa };
}

const WYNIK_SUKCES = {
  status: 'SUCCESS',
  project_id: 'proj-nowy',
  warnings: ['Pominięto 2 nieznane pozycje układu graficznego.'],
  errors: [],
  migrated_from_version: '1.2',
  elements_without_catalog: [],
  catalog_mapping_required: false,
};

beforeEach(() => {
  useAppStateStore.setState({ activeProjectId: 'proj-1', activeProjectName: 'Sieć Wschód' });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('EkranArchiwum — spakowanie projektu', () => {
  it('cel ekranu i obie ścieżki są nazwane wprost', () => {
    render(<EkranArchiwum onZamknij={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 2, name: T.tytul })).toBeTruthy();
    expect(screen.getByText(T.cel)).toBeTruthy();
    expect(screen.getByText(T.eksportOpis)).toBeTruthy();
    expect(screen.getByText(T.importOpis)).toBeTruthy();
  });

  it('klik „Pobierz paczkę" woła końcówkę eksportu z zapisem do magazynu i zapisuje plik', async () => {
    const user = userEvent.setup();
    const blob = new Blob(['ZIP'], { type: 'application/zip' });
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, blob: async () => blob }));
    vi.stubGlobal('fetch', fetchMock);
    const pobranie = przechwycPobranie();

    render(<EkranArchiwum onZamknij={vi.fn()} />);
    await user.click(screen.getByTestId('mvd-arch-eksport'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/projects/proj-1/export?zapisz_do_magazynu=true');
    expect(init.method).toBe('POST');
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(pobranie.nazwa()).toMatch(/^archiwum-siec-wschod-\d{4}-\d{2}-\d{2}\.mvdp\.zip$/);
    expect(await screen.findByTestId('mvd-arch-eksport-ok')).toHaveTextContent(T.eksportGotowe);
  });

  it('brak otwartego projektu → uczciwy stan zerowy zamiast przycisku eksportu', () => {
    useAppStateStore.setState({ activeProjectId: null, activeProjectName: null });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<EkranArchiwum onZamknij={vi.fn()} />);
    expect(screen.getByTestId('mvd-arch-eksport-brak-projektu')).toHaveTextContent(
      T.eksportBrakProjektu,
    );
    expect(screen.queryByTestId('mvd-arch-eksport')).toBeNull();
    // Ścieżka odtworzenia z paczki działa również bez otwartego projektu.
    expect(screen.getByTestId('mvd-arch-plik')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('błąd końcówki eksportu → komunikat backendu, bez pobrania', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 404,
        json: async () => ({ detail: 'Projekt nie istnieje' }),
      })),
    );
    render(<EkranArchiwum onZamknij={vi.fn()} />);
    await user.click(screen.getByTestId('mvd-arch-eksport'));

    expect(await screen.findByTestId('mvd-arch-eksport-blad')).toHaveTextContent(
      'Projekt nie istnieje',
    );
    expect(screen.queryByTestId('mvd-arch-eksport-ok')).toBeNull();
  });
});

describe('EkranArchiwum — odtworzenie projektu z paczki', () => {
  it('wybór paczki → podgląd zawartości z REALNEJ końcówki podglądu', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        valid: true,
        schema_version: '2.0',
        project_name: 'Sieć Zachód',
        exported_at: '2026-07-30T08:15:00Z',
        archive_hash: 'abcdef0123456789ff',
        summary: {
          nodes_count: 12,
          branches_count: 11,
          sources_count: 1,
          loads_count: 6,
          snapshots_count: 2,
          sld_diagrams_count: 1,
          study_cases_count: 3,
          operating_cases_count: 1,
          analysis_runs_count: 4,
          study_runs_count: 0,
          results_count: 4,
          proofs_count: 2,
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(<EkranArchiwum onZamknij={vi.fn()} />);
    await user.upload(screen.getByTestId('mvd-arch-plik'), plikArchiwum());
    await user.click(screen.getByTestId('mvd-arch-podglad-akcja'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('/api/projects/import/preview');
    const podglad = await screen.findByTestId('mvd-arch-podglad');
    expect(within(podglad).getByText('Sieć Zachód')).toBeTruthy();
    expect(within(podglad).getByText('2026-07-30 08:15')).toBeTruthy();
    const zawartosc = screen.getByTestId('mvd-arch-podglad-zawartosc');
    /** Wartość wiersza podglądu po etykiecie (kilka wierszy ma tę samą liczbę). */
    const wartosc = (etykieta: string): string =>
      within(zawartosc).getByText(etykieta).closest('.mvd-arch-kv')!.textContent!.replace(
        etykieta,
        '',
      );
    expect(wartosc(T.podgladWezly)).toBe('12');
    expect(wartosc(T.podgladOdbiory)).toBe('6');
    // Warianty = przypadki obliczeniowe + warianty pracy (3 + 1).
    expect(wartosc(T.podgladWarianty)).toBe('4');
    // Przebiegi = przebiegi analiz + przebiegi studium (4 + 0).
    expect(wartosc(T.podgladPrzebiegi)).toBe('4');
    expect(wartosc(T.podgladDowody)).toBe('2');
  });

  it('import paczki → końcówka importu z polami formularza i raport wyniku', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => WYNIK_SUKCES,
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(<EkranArchiwum onZamknij={vi.fn()} />);
    await user.upload(screen.getByTestId('mvd-arch-plik'), plikArchiwum());
    await user.type(screen.getByTestId('mvd-arch-nazwa'), 'Kopia odbiorowa');
    await user.click(screen.getByTestId('mvd-arch-import'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/projects/import');
    expect(init.method).toBe('POST');
    const dane = init.body as FormData;
    expect((dane.get('file') as File).name).toBe('projekt.mvdp.zip');
    expect(dane.get('new_name')).toBe('Kopia odbiorowa');
    expect(dane.get('verify_integrity')).toBe('true');

    const raport = await screen.findByTestId('mvd-arch-raport');
    expect(raport.getAttribute('data-wariant')).toBe('ok');
    expect(within(raport).getByText(T.raportSukces)).toBeTruthy();
    expect(within(raport).getByText('1.2')).toBeTruthy();
    expect(
      within(screen.getByTestId('mvd-arch-ostrzezenia')).getByText(WYNIK_SUKCES.warnings[0]),
    ).toBeTruthy();
  });

  it('po udanym imporcie akcja otwiera odtworzony projekt razem z jego wariantem obliczeniowym', async () => {
    const user = userEvent.setup();
    // Atrapa rozróżnia końcówki: import archiwum i odczyt aktywnego wariantu
    // odtworzonego projektu (ten sam tor, co ekran „Nowy / otwórz projekt").
    vi.stubGlobal(
      'fetch',
      vi.fn(async (wejscie: RequestInfo | URL) => {
        const url = String(wejscie);
        if (url === '/api/study-cases/project/proj-nowy/active') {
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: 'case-odtworzony', name: 'Wariant bazowy', result_status: 'FRESH' }),
          };
        }
        return { ok: true, status: 200, json: async () => WYNIK_SUKCES };
      }),
    );
    const onZamknij = vi.fn();

    render(<EkranArchiwum onZamknij={onZamknij} />);
    await user.upload(screen.getByTestId('mvd-arch-plik'), plikArchiwum());
    await user.type(screen.getByTestId('mvd-arch-nazwa'), 'Kopia odbiorowa');
    await user.click(screen.getByTestId('mvd-arch-import'));
    await user.click(await screen.findByTestId('mvd-arch-otworz'));

    await waitFor(() => expect(onZamknij).toHaveBeenCalledTimes(1));
    expect(useAppStateStore.getState().activeProjectId).toBe('proj-nowy');
    expect(useAppStateStore.getState().activeProjectName).toBe('Kopia odbiorowa');
    expect(useAppStateStore.getState().activeCaseId).toBe('case-odtworzony');
  });

  it('odmowa importu (błędy backendu) → lista błędów, bez akcji otwarcia projektu', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'FAILED',
          project_id: null,
          warnings: [],
          errors: ['Suma kontrolna archiwum nie zgadza się z zapisaną.'],
          migrated_from_version: null,
        }),
      })),
    );

    render(<EkranArchiwum onZamknij={vi.fn()} />);
    await user.upload(screen.getByTestId('mvd-arch-plik'), plikArchiwum());
    await user.click(screen.getByTestId('mvd-arch-import'));

    const raport = await screen.findByTestId('mvd-arch-raport');
    expect(raport.getAttribute('data-wariant')).toBe('err');
    expect(within(raport).getByText(T.raportNiepowodzenie)).toBeTruthy();
    expect(
      within(screen.getByTestId('mvd-arch-bledy')).getByText(
        'Suma kontrolna archiwum nie zgadza się z zapisaną.',
      ),
    ).toBeTruthy();
    expect(screen.queryByTestId('mvd-arch-otworz')).toBeNull();
  });

  it('wymagane wskazanie typów katalogowych → werdykt i lista elementów z backendu', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'CATALOG_MAPPING_REQUIRED',
          project_id: 'proj-katalog',
          warnings: [],
          errors: [],
          migrated_from_version: null,
          elements_without_catalog: ['Linia L-12', 'Transformator T-2'],
          catalog_mapping_required: true,
        }),
      })),
    );

    render(<EkranArchiwum onZamknij={vi.fn()} />);
    await user.upload(screen.getByTestId('mvd-arch-plik'), plikArchiwum());
    await user.click(screen.getByTestId('mvd-arch-import'));

    const raport = await screen.findByTestId('mvd-arch-raport');
    expect(raport.getAttribute('data-wariant')).toBe('warn');
    expect(within(raport).getByText(T.raportBramkaKatalogu)).toBeTruthy();
    const braki = screen.getByTestId('mvd-arch-bez-katalogu');
    expect(within(braki).getByText('Linia L-12')).toBeTruthy();
    expect(within(braki).getByText('Transformator T-2')).toBeTruthy();
  });

  it('plik o innym rozszerzeniu → komunikat po polsku, zero wołań backendu', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<EkranArchiwum onZamknij={vi.fn()} />);
    // ZDARZENIE SYNTETYCZNE — UZASADNIENIE: `userEvent.upload` respektuje atrybut
    // `accept` i po prostu NIE dostarczyłby pliku o innym rozszerzeniu, więc nie
    // da się nim odtworzyć sytuacji, która w prawdziwej przeglądarce zachodzi
    // (okno wyboru pliku pozwala przełączyć filtr na „wszystkie pliki"). Własna
    // bramka komponentu musi zadziałać właśnie wtedy — tu jest sprawdzana.
    const pole = screen.getByTestId('mvd-arch-plik') as HTMLInputElement;
    const zly = new File(['x'], 'model.xlsx', { type: 'application/vnd.ms-excel' });
    Object.defineProperty(pole, 'files', { value: [zly], configurable: true });
    fireEvent.change(pole);

    expect(await screen.findByTestId('mvd-arch-import-blad')).toHaveTextContent(T.importZlyFormat);
    expect(screen.queryByTestId('mvd-arch-import')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('„Wybierz inną paczkę" czyści raport i wybrany plik', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => WYNIK_SUKCES })),
    );

    render(<EkranArchiwum onZamknij={vi.fn()} />);
    await user.upload(screen.getByTestId('mvd-arch-plik'), plikArchiwum());
    await user.click(screen.getByTestId('mvd-arch-import'));
    await user.click(await screen.findByTestId('mvd-arch-ponow'));

    expect(screen.queryByTestId('mvd-arch-raport')).toBeNull();
    expect(screen.getByTestId('mvd-arch-brak-pliku')).toBeTruthy();
  });

  it('powrót zamyka okno bez zmiany kontekstu projektu', async () => {
    const user = userEvent.setup();
    const onZamknij = vi.fn();
    render(<EkranArchiwum onZamknij={onZamknij} />);
    await user.click(screen.getByTestId('mvd-arch-powrot'));
    expect(onZamknij).toHaveBeenCalledTimes(1);
    expect(useAppStateStore.getState().activeProjectId).toBe('proj-1');
  });
});
