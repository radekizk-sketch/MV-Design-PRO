/*
 * Prąd zwarcia doziemnego stacji (EN 50522 tab. 1) na ekranie wyniku oceny uziomu
 * (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA, commit 5).
 *
 * Klasa defektu: solver zwraca `prad_uziomowy` (przypadki strony SN i WN wg sposobu pracy
 * punktu neutralnego, uzasadnienie wyboru) i `i_f_ka`, ale ekran ich nie pokazywał — wynik
 * niewidoczny dla projektanta (wyjście bez konsumenta). Teksty solvera niosą symbole jako
 * `$…$`, wzór wielkości miarodajnej jako LaTeX — żaden surowy `$` ani zapis ASCII nie może
 * dotrzeć do ekranu.
 *
 * ILOCZYN CECH: źródło prądu {nadpisanie projektanta (fixtura), wartość z modelu}
 *   × przypadek {policzony, nieoznaczalny z modelu (brak z przyczyną)}
 *   × postać komórki {liczba, wzór LaTeX, zdanie z wzorami}.
 * Ścieżka natywna: klik w kartę, klik „Uruchom”, odpowiedź przez granicę `fetch`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { useAppStateStore } from '../../../../ui/app-state';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { useShellStore } from '../../../shell/useShellStore';
import { EkranAnalizAkademickich } from '../EkranAnalizAkademickich';
import { CASE_ID, ODPOWIEDZI, migawkaSieciZlotej, ustawFetchV126 } from './atrapyV126';

const WYNIK = ODPOWIEDZI.earthing_safety as Record<string, unknown> & {
  prad_uziomowy: {
    przypadki: Array<Record<string, unknown>>;
    uzasadnienie_pl: string;
    rozstrzyga: string;
  };
};

async function uruchomOceneUziomu(wynik: Record<string, unknown>): Promise<void> {
  ustawFetchV126({ potwierdzone: ['earthing_safety'], wynik });
  render(<EkranAnalizAkademickich szczegolyAudytowe />);
  fireEvent.click(await screen.findByTestId('mvd-akad-karta-otworz-earthing_safety'));
  await screen.findByTestId('mvd-akad-uruchomienie');
  await waitFor(() => expect(screen.getByTestId('mvd-akad-uruchom')).toBeEnabled());
  fireEvent.click(screen.getByTestId('mvd-akad-uruchom'));
  await screen.findByTestId('mvd-akad-wyniki');
}

/** Wynik „z modelu”: bez nadpisania projektanta — I_F to prąd miarodajny przypadków. */
function wynikZModelu(przypadki: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    ...WYNIK,
    i_f_ka: 0.015203,
    prad_uziomowy: {
      ...WYNIK.prad_uziomowy,
      rozstrzyga: 'model',
      przypadki,
      uzasadnienie_pl:
        'Prąd z modelu: największy z przypadków stacji ($\\sqrt{I_L^2 + I_{\\mathrm{res}}^2}$ = 15,2032 A).',
    },
  };
}

const PRZYPADEK_WN_BEZ_WYNIKU: Record<string, unknown> = {
  ...WYNIK.prad_uziomowy.przypadki[0],
  strona: 'WN',
  tryb: 'bezposrednie',
  tryb_pl: 'punkt neutralny uziemiony bezpośrednio',
  wielkosc: "I''k1",
  wielkosc_latex: "I''_{k1}",
  opis_pl: 'sieć WN uziemiona bezpośrednio — $I_E = r\\,I\'\'_{k1}$',
  prad_a: null,
  brak_pl: 'Strona WN poza modelem — prąd $I\'\'_{k1}$ nieznany.',
};

function bezSurowychWzorow(element: HTMLElement): void {
  // Każdy `$…$` złożony przez KaTeX; zapis ASCII symbolu nie dociera do ekranu.
  expect(element.textContent ?? '').not.toContain('$');
  expect(element.textContent ?? '').not.toMatch(/I_res|I_L²|\\sqrt|\\mathrm/);
}

/**
 * Budżet czasu ściany testu: każdy test przechodzi PEŁNĄ ścieżkę ekranu (render okna, klik w
 * kartę, klik „Uruchom”, odpowiedź przez `fetch`, skład KaTeX wyniku). Pomiar 2026-10-30: pierwszy
 * test pliku 3,6 s w biegu pojedynczym (rozgrzewka składu wzorów), w puli równoległej `vitest
 * related` (85 plików) 3 testy razem 14,8 s — domyślne 5 s przekroczone przez obciążenie maszyny,
 * nie przez ekran. Budżet jawny zamiast domyślnego; asercje bez zmian.
 */
const CZAS_TESTU_MS = 20_000;

beforeEach(() => {
  useAppStateStore.setState({ activeCaseId: CASE_ID, activeCaseResultStatus: 'NONE' });
  useShellStore.setState({ wynikiTab: null });
  useSnapshotStore.setState({ snapshot: migawkaSieciZlotej() as never });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  useSnapshotStore.getState().reset();
});

describe('Ocena uziomu — prąd zwarcia doziemnego stacji na ekranie wyniku', () => {
  it('nadpisanie projektanta (fixtura solvera): I_F, uzasadnienie z prądem modelu i przypadek z wzorem', async () => {
    expect(WYNIK.prad_uziomowy.rozstrzyga).toBe('nadpisanie projektanta');
    await uruchomOceneUziomu(WYNIK);

    const wielkosci = screen.getByTestId('mvd-akad-wielkosci');
    expect(wielkosci).toHaveTextContent('Prąd zwarcia doziemnego stacji przed redukcją');
    expect(wielkosci).toHaveTextContent('8 kA');
    expect(wielkosci).toHaveTextContent('Podstawa prądu zwarcia doziemnego');
    expect(wielkosci).toHaveTextContent('prąd z modelu 0,015203 kA');
    bezSurowychWzorow(wielkosci);

    const tabela = screen.getByTestId('mvd-akad-obiekty-prad_uziomowy.przypadki');
    const wiersze = within(tabela).getAllByRole('row').slice(1);
    expect(wiersze).toHaveLength(1);
    expect(wiersze[0]).toHaveTextContent('SN');
    expect(wiersze[0]).toHaveTextContent('punkt neutralny kompensowany (dławik gaszący)');
    expect(wiersze[0]).toHaveTextContent('15,2');
    // Wzór wielkości miarodajnej i reguła z wzorem — złożone przez KaTeX.
    expect(wiersze[0].querySelectorAll('.katex').length).toBeGreaterThanOrEqual(2);
    bezSurowychWzorow(tabela);
  }, CZAS_TESTU_MS);

  it('wartość z modelu × przypadek policzony + przypadek nieoznaczalny: brak z przyczyną, bez fabrykowanej liczby', async () => {
    await uruchomOceneUziomu(
      wynikZModelu([WYNIK.prad_uziomowy.przypadki[0], PRZYPADEK_WN_BEZ_WYNIKU]),
    );

    const wielkosci = screen.getByTestId('mvd-akad-wielkosci');
    expect(wielkosci).toHaveTextContent('0,015203 kA');
    expect(wielkosci).toHaveTextContent('15,2032 A');
    expect(wielkosci.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(1);
    bezSurowychWzorow(wielkosci);

    const tabela = screen.getByTestId('mvd-akad-obiekty-prad_uziomowy.przypadki');
    const wiersze = within(tabela).getAllByRole('row').slice(1);
    expect(wiersze).toHaveLength(2);
    expect(wiersze[1]).toHaveTextContent('WN');
    expect(wiersze[1]).toHaveTextContent('punkt neutralny uziemiony bezpośrednio');
    expect(wiersze[1]).toHaveTextContent('Strona WN poza modelem');
    // Komórka prądu nieoznaczalnego — kreska, nie zero.
    const komorki = within(wiersze[1]).getAllByRole('cell');
    expect(komorki[4]).toHaveTextContent('—');
    // Wzór wielkości, reguła i przyczyna braku — trzy segmenty KaTeX.
    expect(wiersze[1].querySelectorAll('.katex').length).toBeGreaterThanOrEqual(3);
    // Wiersz policzony: kolumna braku pusta (kreska), nie surowe `null`.
    expect(within(wiersze[0]).getAllByRole('cell')[6]).toHaveTextContent('—');
    bezSurowychWzorow(tabela);
  }, CZAS_TESTU_MS);

  it('wynik bez prądu uziomowego (bieg odmówiony przed wyznaczeniem prądu): tabela przypadków nie powstaje', async () => {
    const { prad_uziomowy: _pominiety, i_f_ka: _bezPradu, ...bezPradu } = WYNIK;
    await uruchomOceneUziomu(bezPradu);
    expect(screen.queryByTestId('mvd-akad-obiekty-prad_uziomowy.przypadki')).not.toBeInTheDocument();
    expect(screen.getByTestId('mvd-akad-wielkosci')).not.toHaveTextContent(
      'Podstawa prądu zwarcia doziemnego',
    );
  }, CZAS_TESTU_MS);
});
