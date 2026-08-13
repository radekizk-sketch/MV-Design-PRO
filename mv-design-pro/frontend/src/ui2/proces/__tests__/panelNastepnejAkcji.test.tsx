/*
 * Testy panelu następnej najlepszej akcji. Deklaracja z nagłówka komponentu —
 * „Akcja jest ZAWSZE klikalna" — jest tu przypięta dla WSZYSTKICH szczebli
 * drabiny, nie tylko dla przykładu z karty. Klik natywny (`userEvent`).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PanelNastepnejAkcji } from '../PanelNastepnejAkcji';
import { wyznaczNastepnaAkcje } from '../nastepnaAkcja';
import { etapPoId } from '../etapy';
import { PROCES_STRINGS } from '../strings';
import { problem, sygnaly } from './fixtures';

function renderuj(akcja: ReturnType<typeof wyznaczNastepnaAkcje>) {
  const onNawiguj = vi.fn();
  const onNaprawa = vi.fn();
  render(<PanelNastepnejAkcji akcja={akcja} onNawiguj={onNawiguj} onNaprawa={onNaprawa} />);
  return { onNawiguj, onNaprawa };
}

describe('PanelNastepnejAkcji — treść', () => {
  it('pokazuje tytuł, uzasadnienie i etap akcji', () => {
    const akcja = wyznaczNastepnaAkcje(sygnaly({ jestZakonczonyPrzebieg: true, wynikiAktualne: true }));
    renderuj(akcja);
    expect(screen.getByTestId('mvd-nba-tytul')).toHaveTextContent(
      PROCES_STRINGS.nbaPrzejdzDoWynikowTytul,
    );
    expect(screen.getByText(PROCES_STRINGS.nbaPrzejdzDoWynikowOpis)).toBeInTheDocument();
    expect(screen.getByTestId('mvd-nba-etap')).toHaveTextContent(etapPoId('E5').nazwa);
  });

  it('dla blokady pokazuje komunikat backendu jako tytuł (bez kodu technicznego)', () => {
    const blokada = problem({ opisPl: 'Brak źródła zasilania sieciowego (GPZ).' });
    const akcja = wyznaczNastepnaAkcje(sygnaly({ problemy: [blokada] }));
    renderuj(akcja);
    expect(screen.getByTestId('mvd-nba-tytul')).toHaveTextContent(blokada.opisPl);
    expect(screen.getByTestId('mvd-nba')).not.toHaveTextContent(blokada.code);
  });

  it('renderuje DOKŁADNIE jedną akcję (jeden przycisk w panelu)', () => {
    renderuj(wyznaczNastepnaAkcje(sygnaly()));
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});

describe('PanelNastepnejAkcji — akcja jest ZAWSZE klikalna (wszystkie szczeble)', () => {
  const przypadki = [
    { nazwa: 'otwórz projekt', wejscie: sygnaly({ projektOtwarty: false }), przestrzen: 'projekt' },
    {
      nazwa: 'ustal gotowość',
      wejscie: sygnaly({ gotowoscUstalona: false }),
      przestrzen: 'gotowosc',
    },
    { nazwa: 'uruchom obliczenia', wejscie: sygnaly(), przestrzen: 'obliczenia' },
    {
      nazwa: 'przelicz ponownie',
      wejscie: sygnaly({ jestZakonczonyPrzebieg: true, wynikiAktualne: false }),
      przestrzen: 'obliczenia',
    },
    {
      nazwa: 'odczytaj wyniki',
      wejscie: sygnaly({ jestZakonczonyPrzebieg: true, wynikiAktualne: true }),
      przestrzen: 'wyniki',
    },
  ] as const;

  for (const przypadek of przypadki) {
    it(`„${przypadek.nazwa}" — klik nawiguje do przestrzeni etapu`, async () => {
      const uzytkownik = userEvent.setup();
      const akcja = wyznaczNastepnaAkcje(przypadek.wejscie);
      const { onNawiguj, onNaprawa } = renderuj(akcja);

      await uzytkownik.click(screen.getByTestId('mvd-nba-akcja'));

      expect(onNawiguj).toHaveBeenCalledTimes(1);
      expect(onNawiguj).toHaveBeenCalledWith(przypadek.przestrzen);
      expect(onNaprawa).not.toHaveBeenCalled();
    });
  }

  it('„usuń blokadę" — klik uruchamia akcję naprawczą z TYM zgłoszeniem', async () => {
    const uzytkownik = userEvent.setup();
    const blokada = problem({ code: 'source.sk3_invalid', elementRef: 'GPZ-7' });
    const akcja = wyznaczNastepnaAkcje(sygnaly({ problemy: [blokada] }));
    const { onNawiguj, onNaprawa } = renderuj(akcja);

    await uzytkownik.click(screen.getByTestId('mvd-nba-akcja'));

    expect(onNaprawa).toHaveBeenCalledTimes(1);
    expect(onNaprawa).toHaveBeenCalledWith(blokada);
    expect(onNawiguj).not.toHaveBeenCalled();
  });

  it('przycisk jest dostępny z klawiatury (fokus + Enter)', async () => {
    const uzytkownik = userEvent.setup();
    const { onNawiguj } = renderuj(wyznaczNastepnaAkcje(sygnaly()));
    await uzytkownik.tab();
    expect(screen.getByTestId('mvd-nba-akcja')).toHaveFocus();
    await uzytkownik.keyboard('{Enter}');
    expect(onNawiguj).toHaveBeenCalledWith('obliczenia');
  });
});
