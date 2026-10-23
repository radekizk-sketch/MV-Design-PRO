/**
 * Wspólne narzędzie testów iloczynu cech zapisu danych przyjętych (kontrakt werdyktu §3,
 * ZASADA NR 4 pkt 4): {miejsce z inwentarza} × {lista pusta / jeden wpis / wiele źródeł} ×
 * {zwinięty / rozwinięty}. Każdy plik testów miejsca podaje własną realną ścieżkę (dostawca
 * danych → ekran) i wywołuje `sprawdzDanePrzyjete` na kontenerze wyniku, którego dane dotyczą.
 *
 * Rozwinięcie wyłącznie natywnym klikiem (`userEvent`) — test ćwiczy ścieżkę użytkownika.
 */
import { expect } from 'vitest';
import { within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { DanaPrzyjeta } from '../werdykt';
import type { ParaDanychPrzyjetych } from '../danePrzyjete';

/** Wpisy w kształcie odpowiedzi backendu (różne źródła: profil, norma, założenie). */
export const DANA_PROFIL: DanaPrzyjeta = {
  nazwa_pl: 'reaktancja podprzejściowa x″d (Generator G1)',
  wartosc: { wartosc: 0.2, jednostka: 'p.u.' },
  powod_pl: 'wartość robocza z profilu urządzenia: falownik PV klasy B, karta katalogowa typowa',
  jakosc: 'ESTIMATED',
};
export const DANA_NORMA: DanaPrzyjeta = {
  nazwa_pl: 'współczynnik napięciowy c_max (Szyna SN)',
  wartosc: { wartosc: 1.1, jednostka: '' },
  powod_pl: 'wartość robocza z normy: IEC 60909-0:2016 tabela 1',
  jakosc: 'ESTIMATED',
};
export const DANA_ZALOZENIE: DanaPrzyjeta = {
  nazwa_pl: 'położenie przewodów fazowych na słupie (Linia 110 kV)',
  wartosc: null,
  powod_pl: 'wartość robocza (założenie inżynierskie): słup typowy linii 110 kV',
  jakosc: 'ESTIMATED',
};

export interface WariantListy {
  readonly nazwa: string;
  readonly dane: readonly DanaPrzyjeta[];
}

/** Trzy warianty listy — oś iloczynu cech wspólna dla wszystkich miejsc inwentarza. */
export const WARIANTY_LISTY: readonly WariantListy[] = [
  { nazwa: 'lista pusta', dane: [] },
  { nazwa: 'jeden wpis', dane: [DANA_PROFIL] },
  { nazwa: 'wiele źródeł', dane: [DANA_NORMA, DANA_PROFIL, DANA_ZALOZENIE] },
];

/**
 * Para w kształcie emiterów backendu (`pola_danych_przyjetych_biegu/_wiersza`): niepusta lista →
 * oba pola ze stanem UNVALIDATED_INPUT; pusta → żadnego pola (pola addytywne, `exclude_none`).
 */
export function paraDanych(dane: readonly DanaPrzyjeta[]): ParaDanychPrzyjetych {
  return dane.length > 0 ? { status_danych: 'UNVALIDATED_INPUT', dane_przyjete: dane } : {};
}

const LINIA_STANU: Record<number, string> = {
  1: 'dane przyjęte bez walidacji · 1 wartość robocza',
  3: 'dane przyjęte bez walidacji · 3 wartości robocze',
};

/**
 * Sprawdza zapis danych przyjętych `testId` w `kontener` dla danego wariantu listy:
 * pusta → nic (ani blok, ani linia stanu); niepusta → linia stanu, wiersze zwinięte (nazwa,
 * wartość, jakość; bez uzasadnienia), po natywnym kliku uzasadnienie przy TYM wierszu,
 * ponowny klik zwija.
 */
export async function sprawdzDanePrzyjete(
  kontener: HTMLElement,
  testId: string,
  dane: readonly DanaPrzyjeta[],
): Promise<void> {
  if (dane.length === 0) {
    expect(within(kontener).queryByTestId(`${testId}-dane`)).not.toBeInTheDocument();
    // Żaden zapis danych przyjętych w kontenerze (linia stanu wspólnego zapisu).
    expect(kontener.querySelector('.mvd-dane-przyjete')).toBeNull();
    expect(kontener.querySelector('[data-testid$="-dane-podsumowanie"]')).toBeNull();
    return;
  }
  const blok = within(kontener).getByTestId(`${testId}-dane`);
  expect(within(blok).getByTestId(`${testId}-dane-podsumowanie`)).toHaveTextContent(
    LINIA_STANU[dane.length],
  );
  expect(within(blok).queryByRole('alert')).not.toBeInTheDocument();
  const wiersze = within(within(blok).getByTestId(`${testId}-dane-przyjete`)).getAllByRole(
    'listitem',
  );
  expect(wiersze).toHaveLength(dane.length);
  const uzytkownik = userEvent.setup();
  for (const [i, dana] of dane.entries()) {
    const wiersz = wiersze[i];
    const tekst = wiersz.textContent ?? '';
    expect(tekst).toContain(dana.nazwa_pl);
    expect(tekst).toContain('oszacowane');
    expect(tekst).not.toContain(dana.powod_pl);
    const przelacz = within(wiersz).getByRole('button');
    expect(przelacz).toHaveAttribute('aria-expanded', 'false');
    await uzytkownik.click(przelacz);
    expect(przelacz).toHaveAttribute('aria-expanded', 'true');
    expect(within(wiersz).getByTestId(`${testId}-dane-przyjete-${i}-szczegoly`)).toHaveTextContent(
      dana.powod_pl,
    );
    await uzytkownik.click(przelacz);
    expect(przelacz).toHaveAttribute('aria-expanded', 'false');
    expect(wiersz.textContent ?? '').not.toContain(dana.powod_pl);
  }
}
