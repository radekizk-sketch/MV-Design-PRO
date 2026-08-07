/**
 * Testy sekcji „Pakiet dowodowy" okna dowodu (karta PACK-DOWODY).
 *
 * Kliki NATYWNE (userEvent) — Zero-Debt pkt 5: test ma ćwiczyć tę samą ścieżkę,
 * którą chodzi inżynier, inaczej regresja pobierania byłaby niewykrywalna.
 *
 * Pokrycie jako ILOCZYN CECH (nie jeden przykład z karty):
 * rodzaj biegu (pakiet zwarcia 3F / pakiet zwarć niesymetrycznych / pakiet
 * rozpływu mocy / rodzaj bez pakietu) × liczba punktów (zero — pakiet całej
 * sieci / jeden — bez wyboru / wiele — wybór steruje żądaniem)
 * × stan pobrania (udane / odmowa serwera) × świeżość (aktualne / nieaktualne
 * względem modelu) × brak przebiegu.
 *
 * Dane wyłącznie z kontraktu `pakietApi.ts` (1:1 z odpowiedzią bramy backendu) —
 * sekcja nie zgaduje rodzaju pakietu i niczego nie liczy.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStateStore } from '../../../../ui/app-state';
import { PakietDowodowy } from '../PakietDowodowy';
import type { DostepnoscPakietu } from '../pakietApi';
import { DOWOD_STRINGS as T } from '../strings';

const DOSTEPNY_3F: DostepnoscPakietu = {
  run_id: 'run-1',
  dostepny: true,
  rodzaj: 'SC3F',
  rodzaj_pl: 'Zwarcie trójfazowe (IEC 60909)',
  powod_pl: null,
  punkty: [
    { target_id: 'wezel-a', nazwa: 'Szyna glowna' },
    { target_id: 'wezel-b', nazwa: 'Szyna odbioru' },
  ],
  zawartosc_pl: ['Dowód w postaci danych (proof.json)', 'Źródło dokumentu (proof.tex)'],
};

const DOSTEPNY_NIESYM: DostepnoscPakietu = {
  ...DOSTEPNY_3F,
  rodzaj: 'SC_NIESYMETRYCZNE',
  rodzaj_pl: 'Zwarcia niesymetryczne (1F-Z, 2F, 2F-Z)',
  punkty: [{ target_id: 'wezel-a', nazwa: 'Szyna glowna' }],
};

/**
 * Rodzaj opisujący CAŁĄ sieć (rozpływ mocy, karta PACK-ROZPLYW): pakiet jest
 * dostępny, ale punktów NIE MA — i pusta lista nie oznacza tu braku danych.
 * Ten kształt odpowiedzi bramy pojawił się dopiero z pakietem rozpływu, więc
 * bez tego przypadku nic nie pilnowałoby zachowania sekcji przy `punkty: []`.
 */
const DOSTEPNY_ROZPLYW: DostepnoscPakietu = {
  run_id: 'run-1',
  dostepny: true,
  rodzaj: 'ROZPLYW_MOCY',
  rodzaj_pl: 'Rozpływ mocy (zbieżność, bilans mocy, zakres napięć)',
  powod_pl: null,
  punkty: [],
  zawartosc_pl: ['Dowód w postaci danych (proof.json)', 'Źródło dokumentu (proof.tex)'],
};

const BEZ_PAKIETU: DostepnoscPakietu = {
  run_id: 'run-1',
  dostepny: false,
  rodzaj: null,
  rodzaj_pl: null,
  powod_pl: 'Ten rodzaj obliczenia nie ma jeszcze dedykowanego pakietu dowodowego.',
  punkty: [],
  zawartosc_pl: [],
};

/** Zapamiętane adresy żądań — pin, że wybór punktu realnie steruje pobraniem. */
let zadania: string[] = [];

function zamontujFetch(
  dostepnosc: DostepnoscPakietu,
  opcje: { readonly pakietOdmawia?: boolean } = {},
): void {
  zadania = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      zadania.push(url);
      if (url.includes('/pakiet-dowodowy/dostepnosc')) {
        return new Response(JSON.stringify(dostepnosc), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/pakiet-dowodowy')) {
        if (opcje.pakietOdmawia) {
          return new Response(JSON.stringify({ detail: 'Punkt zwarcia nie występuje' }), {
            status: 422,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(new Blob(['PK']), {
          status: 200,
          headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition': 'attachment; filename="pakiet_dowodowy_zwarcie_3f.zip"',
          },
        });
      }
      throw new Error(`Nieoczekiwane żądanie: ${url}`);
    }),
  );
}

beforeEach(() => {
  // Zapis pliku: przeglądarka testowa nie ma prawdziwego pobierania.
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:pakiet'),
    revokeObjectURL: vi.fn(),
  });
  useAppStateStore.setState({ activeCaseResultStatus: 'FRESH' });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PakietDowodowy — dostępność wynika z odpowiedzi serwera', () => {
  it('bez przebiegu sekcja milczy (brak podstawy, zero atrap)', () => {
    zamontujFetch(DOSTEPNY_3F);
    const { container } = render(<PakietDowodowy runId={null} />);
    expect(container).toBeEmptyDOMElement();
    expect(zadania).toHaveLength(0);
  });

  it('rodzaj z pakietem: nazwa rodzaju i zawartość prosto z odpowiedzi', async () => {
    zamontujFetch(DOSTEPNY_3F);
    render(<PakietDowodowy runId="run-1" />);

    await waitFor(() => expect(screen.getByTestId('mvd-dowod-pakiet')).toBeInTheDocument());
    expect(screen.getByTestId('mvd-dowod-pakiet-rodzaj')).toHaveTextContent(
      'Zwarcie trójfazowe (IEC 60909)',
    );
    const zawartosc = screen.getByTestId('mvd-dowod-pakiet-zawartosc');
    expect(zawartosc).toHaveTextContent('proof.json');
    expect(zawartosc).toHaveTextContent('proof.tex');
  });

  it('zwarcia niesymetryczne: inny rodzaj pakietu na tej samej powierzchni', async () => {
    zamontujFetch(DOSTEPNY_NIESYM);
    render(<PakietDowodowy runId="run-1" />);

    await waitFor(() => expect(screen.getByTestId('mvd-dowod-pakiet')).toBeInTheDocument());
    expect(screen.getByTestId('mvd-dowod-pakiet-rodzaj')).toHaveTextContent(
      'Zwarcia niesymetryczne (1F-Z, 2F, 2F-Z)',
    );
  });

  it('rodzaj bez pakietu: POWÓD z serwera + akcja wyjścia (uczciwy stan zerowy)', async () => {
    zamontujFetch(BEZ_PAKIETU);
    const onKlik = vi.fn();
    render(
      <PakietDowodowy
        runId="run-1"
        akcjaBrak={{ etykieta: 'Uruchom obliczenie zwarciowe', onKlik }}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('mvd-dowod-pakiet-brak')).toBeInTheDocument());
    expect(screen.getByTestId('mvd-dowod-pakiet-powod')).toHaveTextContent(
      'nie ma jeszcze dedykowanego pakietu dowodowego',
    );
    expect(screen.queryByTestId('mvd-dowod-pakiet-pobierz')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Uruchom obliczenie zwarciowe' }));
    expect(onKlik).toHaveBeenCalledTimes(1);
  });
});

describe('PakietDowodowy — pobranie realną ścieżką', () => {
  it('klik pobiera pakiet i pokazuje nazwę pliku z serwera', async () => {
    zamontujFetch(DOSTEPNY_3F);
    render(<PakietDowodowy runId="run-1" />);
    await waitFor(() => expect(screen.getByTestId('mvd-dowod-pakiet')).toBeInTheDocument());

    await userEvent.click(screen.getByTestId('mvd-dowod-pakiet-pobierz'));

    await waitFor(() =>
      expect(screen.getByTestId('mvd-dowod-pakiet-pobrano')).toHaveTextContent(
        'pakiet_dowodowy_zwarcie_3f.zip',
      ),
    );
  });

  it('wybór punktu steruje ŻĄDANIEM (nie tylko etykietą)', async () => {
    zamontujFetch(DOSTEPNY_3F);
    render(<PakietDowodowy runId="run-1" />);
    await waitFor(() => expect(screen.getByTestId('mvd-dowod-pakiet')).toBeInTheDocument());

    await userEvent.selectOptions(screen.getByTestId('mvd-dowod-pakiet-punkt'), 'wezel-b');
    await userEvent.click(screen.getByTestId('mvd-dowod-pakiet-pobierz'));

    await waitFor(() => expect(zadania.some((u) => u.includes('punkt=wezel-b'))).toBe(true));
  });

  it('jeden punkt: bez wyboru, ale żądanie i tak wskazuje punkt jednoznacznie', async () => {
    // INTENCJA: przy jednym punkcie użytkownik nie ma czego wybierać, więc
    // selektor się nie pokazuje. Żądanie mimo to niesie ten punkt WPROST —
    // pakiet nie zależy wtedy od tego, który punkt serwer uzna za domyślny.
    zamontujFetch(DOSTEPNY_NIESYM);
    render(<PakietDowodowy runId="run-1" />);
    await waitFor(() => expect(screen.getByTestId('mvd-dowod-pakiet')).toBeInTheDocument());

    expect(screen.queryByTestId('mvd-dowod-pakiet-punkt')).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('mvd-dowod-pakiet-pobierz'));

    await waitFor(() => {
      const pobranie = zadania.find((u) => u.includes('/pakiet-dowodowy') && !u.includes('dostep'));
      expect(pobranie).toBeDefined();
      expect(pobranie).toContain('punkt=wezel-a');
    });
  });

  it('pakiet całej sieci: bez wyboru punktu, a żądanie NIE niesie punktu', async () => {
    // INTENCJA: pakiet rozpływu dokumentuje całą sieć. Serwer ODMAWIA żądania z
    // punktem dla takiego rodzaju, więc doklejenie parametru „na wszelki wypadek"
    // zamieniłoby działający przycisk w błąd 422 u projektanta.
    zamontujFetch(DOSTEPNY_ROZPLYW);
    render(<PakietDowodowy runId="run-1" />);
    await waitFor(() => expect(screen.getByTestId('mvd-dowod-pakiet')).toBeInTheDocument());

    expect(screen.getByTestId('mvd-dowod-pakiet-rodzaj')).toHaveTextContent('Rozpływ mocy');
    expect(screen.queryByTestId('mvd-dowod-pakiet-punkt')).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('mvd-dowod-pakiet-pobierz'));

    await waitFor(() => {
      const pobranie = zadania.find((u) => u.includes('/pakiet-dowodowy') && !u.includes('dostep'));
      expect(pobranie).toBeDefined();
      expect(pobranie).not.toContain('punkt=');
    });
  });

  it('odmowa serwera: komunikat błędu zamiast cichego niepowodzenia', async () => {
    zamontujFetch(DOSTEPNY_NIESYM, { pakietOdmawia: true });
    render(<PakietDowodowy runId="run-1" />);
    await waitFor(() => expect(screen.getByTestId('mvd-dowod-pakiet')).toBeInTheDocument());

    await userEvent.click(screen.getByTestId('mvd-dowod-pakiet-pobierz'));

    await waitFor(() =>
      expect(screen.getByTestId('mvd-dowod-pakiet-pobierz-blad')).toHaveTextContent(
        'Punkt zwarcia nie występuje',
      ),
    );
    expect(screen.queryByTestId('mvd-dowod-pakiet-pobrano')).not.toBeInTheDocument();
  });
});

describe('PakietDowodowy — świeżość z jednego źródła', () => {
  it('wyniki aktualne: brak znacznika nieaktualności', async () => {
    useAppStateStore.setState({ activeCaseResultStatus: 'FRESH' });
    zamontujFetch(DOSTEPNY_3F);
    render(<PakietDowodowy runId="run-1" />);

    await waitFor(() => expect(screen.getByTestId('mvd-dowod-pakiet')).toBeInTheDocument());
    expect(screen.queryByTestId('mvd-dowod-pakiet-swiezosc')).not.toBeInTheDocument();
  });

  it('wyniki nieaktualne: znacznik z kontraktu świeżości (nie własny rachunek)', async () => {
    // Świeżość bierze się z `useSwiezoscWynikow` (ui2/freshness) — sekcja NIE
    // liczy jej osobno, więc pin ustawia dokładnie to źródło.
    useAppStateStore.setState({ activeCaseResultStatus: 'OUTDATED' });
    zamontujFetch(DOSTEPNY_3F);
    render(<PakietDowodowy runId="run-1" />);

    await waitFor(() => expect(screen.getByTestId('mvd-dowod-pakiet')).toBeInTheDocument());
    expect(screen.getByTestId('mvd-dowod-pakiet-swiezosc')).toHaveTextContent(
      T.pakietNieaktualne,
    );
    // Pakiet NADAL da się pobrać — dokumentuje stan sprzed zmiany modelu.
    expect(screen.getByTestId('mvd-dowod-pakiet-pobierz')).toBeEnabled();
  });
});
