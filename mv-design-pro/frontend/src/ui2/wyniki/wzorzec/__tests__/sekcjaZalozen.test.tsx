import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { SekcjaZalozen } from '../SekcjaZalozen';
import { WZORZEC_STRINGS } from '../strings';
import { zalozeniaFixture } from './fixtures';

describe('SekcjaZalozen — założenia są częścią wyniku (W-602)', () => {
  it('domyślnie rozwinięta: pokazuje tytuł, opis i listę założeń', () => {
    render(<SekcjaZalozen zalozenia={zalozeniaFixture} />);
    expect(screen.getByText(WZORZEC_STRINGS.zalozeniaTytul)).toBeInTheDocument();
    expect(screen.getByText(WZORZEC_STRINGS.zalozeniaOpis)).toBeInTheDocument();
    expect(screen.getByTestId('mvd-wyn-zalozenia-lista')).toBeInTheDocument();
    expect(screen.getAllByTestId('mvd-wyn-zalozenie')).toHaveLength(2);
  });

  it('renderuje wartość z jednostką i uwagę w dymku (title)', () => {
    render(<SekcjaZalozen zalozenia={zalozeniaFixture} />);
    const wiersze = screen.getAllByTestId('mvd-wyn-zalozenie');
    expect(within(wiersze[0]).getByText('MVA')).toBeInTheDocument();
    expect(wiersze[1]).toHaveAttribute('title', 'Parametr przebiegu');
  });

  it('zwijanie: aria-expanded przełącza i ukrywa listę', () => {
    render(<SekcjaZalozen zalozenia={zalozeniaFixture} />);
    const naglowek = screen.getByRole('button', { name: /Założenia/ });
    expect(naglowek).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(naglowek);
    expect(naglowek).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('mvd-wyn-zalozenia-lista')).not.toBeInTheDocument();
  });

  it('brak założeń: komunikat zamiast listy', () => {
    render(<SekcjaZalozen zalozenia={[]} />);
    expect(screen.getByText(WZORZEC_STRINGS.brakZalozen)).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-wyn-zalozenia-lista')).not.toBeInTheDocument();
  });

  it('wartość tekstowa łamie się w wierszu, liczba zostaje w jednej linii', () => {
    // Zrzut „po” ekranu zwarć: długi komunikat założenia z backendu w `nowrap` wychodził poza
    // sekcję i nachodził na sąsiedni wiersz. Tekst dostaje modyfikator łamania, liczba nie.
    render(
      <SekcjaZalozen
        zalozenia={[
          { etykieta: 'Czas cieplny', wartosc: 1, jednostka: 's' },
          { etykieta: 'Źródło', wartosc: 'ZAREJESTROWANE ZAŁOŻENIE: długi opis z backendu' },
        ]}
      />,
    );
    const tekst = screen.getByText('ZAREJESTROWANE ZAŁOŻENIE: długi opis z backendu');
    expect(tekst.closest('.mvd-wyn-zalozenie-wartosc')).toHaveClass(
      'mvd-wyn-zalozenie-wartosc--tekst',
    );
    const liczba = screen.getByText('Czas cieplny').parentElement?.querySelector(
      '.mvd-wyn-zalozenie-wartosc',
    );
    expect(liczba).not.toHaveClass('mvd-wyn-zalozenie-wartosc--tekst');
  });
});
