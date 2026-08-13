/**
 * Testy okna „Import sieci z arkusza (XLSX)" (przestrzeń „Projekt", etap E1).
 *
 * Interakcje przez NATYWNĄ ścieżkę użytkownika (userEvent — wybór pliku przez
 * realny `input[type=file]`, natywne kliki), Zero-Debt pkt 5. Asercje idą na
 * REALNY kontrakt backendu (`api/xlsx_import.py`): adresy końcówek, metoda,
 * pola multipart i pełny kształt odpowiedzi (podsumowanie, zastrzeżenia per
 * wiersz, bramka katalogowa).
 *
 * Iloczyn cech (reguła KLASA, NIE INSTANCJA):
 * {plik poprawny × plik z zastrzeżeniami wierszy × plik pustego arkusza ×
 *  plik złego formatu} × {podgląd, import} oraz {brak projektu / projekt otwarty}
 * na wejściu do ekranu.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStateStore } from '../../../../../ui/app-state';
import { EkranImportuArkusza } from '../EkranImportuArkusza';
import { ARKUSZ_STRINGS as T } from '../strings';

/** Plik arkusza do wysyłki (jsdom `File`; sygnatura ZIP jak w prawdziwym XLSX). */
function plikArkusza(nazwa = 'siec-wschod.xlsx'): File {
  return new File([new Uint8Array([80, 75, 3, 4])], nazwa, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

const PODSUMOWANIE = { szyny: 12, odcinki: 11, transformatory: 3, zrodla: 1, odbiory: 8 };

const PODGLAD_OK = {
  poprawny: true,
  podsumowanie: PODSUMOWANIE,
  bledy: [],
  ostrzezenia: ['Wymagane domapowanie typu katalogowego dla 11 odcinków.'],
  elementy_bez_katalogu: ['L1', 'L2'],
  mapowanie_katalogowe_wymagane: true,
};

const PODGLAD_Z_ZASTRZEZENIAMI = {
  poprawny: false,
  podsumowanie: null,
  bledy: [
    {
      arkusz: 'Linie',
      wiersz: 3,
      kolumna: 'długość_km',
      komunikat: "Nieprawidłowa wartość 'abc' — oczekiwano: liczba",
    },
    {
      arkusz: 'Szyny',
      wiersz: 5,
      kolumna: 'napięcie_kV',
      komunikat: 'Napięcie znamionowe musi być większe od zera',
    },
  ],
  ostrzezenia: [],
  elementy_bez_katalogu: [],
  mapowanie_katalogowe_wymagane: false,
};

const PODGLAD_PUSTY_ARKUSZ = {
  poprawny: false,
  podsumowanie: null,
  bledy: [
    {
      arkusz: 'Szyny',
      wiersz: null,
      kolumna: null,
      komunikat: 'Arkusz nie zawiera żadnego wiersza danych (sam nagłówek)',
    },
  ],
  ostrzezenia: [],
  elementy_bez_katalogu: [],
  mapowanie_katalogowe_wymagane: false,
};

const IMPORT_OK = {
  status: 'ZAIMPORTOWANO',
  project_id: 'proj-z-arkusza',
  snapshot_id: 'snap-1',
  odcisk_migawki: 'abcdef0123456789aaaa',
  podsumowanie: PODSUMOWANIE,
  bledy: [],
  ostrzezenia: [],
  elementy_bez_katalogu: [],
  mapowanie_katalogowe_wymagane: false,
};

const IMPORT_BRAMKA = {
  ...IMPORT_OK,
  status: 'WYMAGA_MAPOWANIA_KATALOGU',
  elementy_bez_katalogu: ['L1', 'L2'],
  mapowanie_katalogowe_wymagane: true,
  ostrzezenia: ['Wymagane domapowanie typu katalogowego dla 2 odcinków.'],
};

function odpowiedz(dane: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => dane };
}

beforeEach(() => {
  useAppStateStore.setState({ activeProjectId: null, activeProjectName: null });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('EkranImportuArkusza — stan zerowy i format arkusza', () => {
  it('cel ekranu i wymagania arkusza są nazwane wprost', () => {
    render(<EkranImportuArkusza onZamknij={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 2, name: T.tytul })).toBeTruthy();
    expect(screen.getByText(T.cel)).toBeTruthy();
    expect(screen.getByText(T.formatOpis)).toBeTruthy();
  });

  it('bez wybranego pliku pokazuje uczciwy stan zerowy zamiast martwych przycisków', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<EkranImportuArkusza onZamknij={vi.fn()} />);

    expect(screen.getByTestId('mvd-ark-brak-pliku')).toHaveTextContent(T.brakPliku);
    expect(screen.queryByTestId('mvd-ark-import')).toBeNull();
    expect(screen.queryByTestId('mvd-ark-podglad-akcja')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('plik innego formatu odrzucony w oknie — bez wysyłki na serwer', async () => {
    // `applyAccept: false` odwzorowuje realną sytuację, w której plik omija filtr
    // okna wyboru (przeciągnięcie pliku albo wybór „wszystkie pliki") — dopiero
    // wtedy działa walidacja w oknie. Zdarzenie zmiany jest nadal natywne.
    const user = userEvent.setup({ applyAccept: false });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<EkranImportuArkusza onZamknij={vi.fn()} />);

    await user.upload(
      screen.getByTestId('mvd-ark-plik') as HTMLInputElement,
      new File(['a,b,c'], 'siec.csv', { type: 'text/csv' }),
    );

    expect(await screen.findByTestId('mvd-ark-blad')).toHaveTextContent(T.zlyFormat);
    expect(screen.queryByTestId('mvd-ark-import')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('EkranImportuArkusza — podgląd zawartości', () => {
  it('wybór arkusza → podgląd liczb Z BACKENDU (bez parsowania w przeglądarce)', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => odpowiedz(PODGLAD_OK));
    vi.stubGlobal('fetch', fetchMock);

    render(<EkranImportuArkusza onZamknij={vi.fn()} />);
    await user.upload(screen.getByTestId('mvd-ark-plik') as HTMLInputElement, plikArkusza());
    await user.click(screen.getByTestId('mvd-ark-podglad-akcja'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/import/xlsx/preview');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('file')).toBeInstanceOf(File);

    const liczby = await screen.findByTestId('mvd-ark-podglad-liczby');
    expect(liczby).toHaveTextContent('12');
    expect(liczby).toHaveTextContent('11');
    expect(liczby).toHaveTextContent('3');
    expect(screen.getByTestId('mvd-ark-bez-katalogu')).toHaveTextContent('L1');
  });

  it('arkusz z błędami wierszy → adres każdego zastrzeżenia (arkusz · wiersz · kolumna)', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => odpowiedz(PODGLAD_Z_ZASTRZEZENIAMI)),
    );

    render(<EkranImportuArkusza onZamknij={vi.fn()} />);
    await user.upload(screen.getByTestId('mvd-ark-plik') as HTMLInputElement, plikArkusza());
    await user.click(screen.getByTestId('mvd-ark-podglad-akcja'));

    const lista = await screen.findByTestId('mvd-ark-zastrzezenia');
    expect(lista).toHaveTextContent('Arkusz „Linie"');
    expect(lista).toHaveTextContent('Wiersz 3');
    expect(lista).toHaveTextContent('Kolumna „długość_km"');
    expect(lista).toHaveTextContent("Nieprawidłowa wartość 'abc' — oczekiwano: liczba");
    expect(lista).toHaveTextContent('Arkusz „Szyny"');
    expect(lista).toHaveTextContent('Wiersz 5');
    expect(screen.getByTestId('mvd-ark-podglad-niepoprawny')).toHaveTextContent(T.podgladNiepoprawny);
    expect(screen.queryByTestId('mvd-ark-podglad-liczby')).toBeNull();
  });

  it('pusty arkusz → zastrzeżenie do CAŁEGO arkusza, nie do wiersza', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => odpowiedz(PODGLAD_PUSTY_ARKUSZ)),
    );

    render(<EkranImportuArkusza onZamknij={vi.fn()} />);
    await user.upload(screen.getByTestId('mvd-ark-plik') as HTMLInputElement, plikArkusza());
    await user.click(screen.getByTestId('mvd-ark-podglad-akcja'));

    const lista = await screen.findByTestId('mvd-ark-zastrzezenia');
    expect(lista).toHaveTextContent(T.zastrzezenieCalyArkusz);
    expect(lista).toHaveTextContent('sam nagłówek');
  });
});

describe('EkranImportuArkusza — import do modelu', () => {
  it('import poprawnego arkusza → nowy projekt, odcisk modelu i jawny następny krok', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => odpowiedz(IMPORT_OK));
    vi.stubGlobal('fetch', fetchMock);

    render(<EkranImportuArkusza onZamknij={vi.fn()} />);
    await user.upload(screen.getByTestId('mvd-ark-plik') as HTMLInputElement, plikArkusza());
    await user.click(screen.getByTestId('mvd-ark-import'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/import/xlsx');
    const formularz = init.body as FormData;
    expect(formularz.get('nazwa_projektu')).toBe('siec-wschod');

    const raport = await screen.findByTestId('mvd-ark-raport');
    expect(raport).toHaveTextContent(T.raportZaimportowano);
    expect(screen.getByTestId('mvd-ark-raport-liczby')).toHaveTextContent('12');
    expect(raport).toHaveTextContent('abcdef0123456789');
    expect(screen.getByTestId('mvd-ark-nastepny-krok')).toHaveTextContent(T.raportNastepnyKrok);
  });

  it('nazwa projektu podana przez projektanta trafia do wysyłki', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => odpowiedz(IMPORT_OK));
    vi.stubGlobal('fetch', fetchMock);

    render(<EkranImportuArkusza onZamknij={vi.fn()} />);
    await user.upload(screen.getByTestId('mvd-ark-plik') as HTMLInputElement, plikArkusza());
    const pole = screen.getByTestId('mvd-ark-nazwa') as HTMLInputElement;
    await user.clear(pole);
    await user.type(pole, 'GPZ Wschód 15 kV');
    await user.click(screen.getByTestId('mvd-ark-import'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.body as FormData).get('nazwa_projektu')).toBe('GPZ Wschód 15 kV');
  });

  it('bramka katalogowa → następny krok prowadzi do uzupełnienia typów', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => odpowiedz(IMPORT_BRAMKA)),
    );

    render(<EkranImportuArkusza onZamknij={vi.fn()} />);
    await user.upload(screen.getByTestId('mvd-ark-plik') as HTMLInputElement, plikArkusza());
    await user.click(screen.getByTestId('mvd-ark-import'));

    const raport = await screen.findByTestId('mvd-ark-raport');
    expect(raport).toHaveTextContent(T.raportBramkaKatalogu);
    expect(raport.getAttribute('data-wariant')).toBe('warn');
    expect(screen.getByTestId('mvd-ark-raport-bez-katalogu')).toHaveTextContent('L1');
    expect(screen.getByTestId('mvd-ark-nastepny-krok')).toHaveTextContent(
      T.raportNastepnyKrokKatalog,
    );
  });

  it('odrzucenie arkusza przez backend (422) → zastrzeżenia per wiersz, bez raportu sukcesu', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        odpowiedz(
          {
            detail: {
              message: 'Arkusz nie przeszedł walidacji — model nie został zmieniony',
              bledy: PODGLAD_Z_ZASTRZEZENIAMI.bledy,
            },
          },
          false,
          422,
        ),
      ),
    );

    render(<EkranImportuArkusza onZamknij={vi.fn()} />);
    await user.upload(screen.getByTestId('mvd-ark-plik') as HTMLInputElement, plikArkusza());
    await user.click(screen.getByTestId('mvd-ark-import'));

    const lista = await screen.findByTestId('mvd-ark-zastrzezenia');
    expect(lista).toHaveTextContent('Wiersz 3');
    expect(screen.getByTestId('mvd-ark-blad')).toHaveTextContent(T.raportOdrzucono);
    expect(screen.queryByTestId('mvd-ark-raport')).toBeNull();
    expect(screen.queryByTestId('mvd-ark-otworz')).toBeNull();
  });

  it('otwarcie zaimportowanego projektu ustawia kontekst aplikacji i zamyka okno', async () => {
    const user = userEvent.setup();
    const zamknij = vi.fn();
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/import/xlsx') return odpowiedz(IMPORT_OK);
      return odpowiedz({ id: 'case-1', name: 'Wariant bazowy', result_status: 'NONE' });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<EkranImportuArkusza onZamknij={zamknij} />);
    await user.upload(screen.getByTestId('mvd-ark-plik') as HTMLInputElement, plikArkusza());
    await user.click(screen.getByTestId('mvd-ark-import'));
    await user.click(await screen.findByTestId('mvd-ark-otworz'));

    await waitFor(() => expect(zamknij).toHaveBeenCalledTimes(1));
    expect(useAppStateStore.getState().activeProjectId).toBe('proj-z-arkusza');
    expect(useAppStateStore.getState().activeCaseId).toBe('case-1');
  });

  it('„Wczytaj inny arkusz" czyści raport i wraca do stanu zerowego', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => odpowiedz(IMPORT_OK)),
    );

    render(<EkranImportuArkusza onZamknij={vi.fn()} />);
    await user.upload(screen.getByTestId('mvd-ark-plik') as HTMLInputElement, plikArkusza());
    await user.click(screen.getByTestId('mvd-ark-import'));
    await user.click(await screen.findByTestId('mvd-ark-ponow'));

    expect(screen.queryByTestId('mvd-ark-raport')).toBeNull();
    expect(screen.getByTestId('mvd-ark-brak-pliku')).toHaveTextContent(T.brakPliku);
  });

  it('import działa także przy JUŻ otwartym projekcie — kontekst nie zmienia się bez decyzji', async () => {
    useAppStateStore.setState({ activeProjectId: 'proj-stary', activeProjectName: 'Sieć Zachód' });
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => odpowiedz(IMPORT_OK)),
    );

    render(<EkranImportuArkusza onZamknij={vi.fn()} />);
    await user.upload(screen.getByTestId('mvd-ark-plik') as HTMLInputElement, plikArkusza());
    await user.click(screen.getByTestId('mvd-ark-import'));

    await screen.findByTestId('mvd-ark-raport');
    // Kontekst zmienia się DOPIERO po jawnym kliknięciu „Otwórz zaimportowany projekt".
    expect(useAppStateStore.getState().activeProjectId).toBe('proj-stary');
    expect(screen.getByTestId('mvd-ark-otworz')).toBeTruthy();
  });
});
