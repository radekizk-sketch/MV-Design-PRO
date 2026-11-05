import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KrokDowodu } from '../KrokDowodu';
import { mapujKroki } from '../dowodModel';
import { DOWOD_STRINGS } from '../strings';
import { subskrybuj } from '../../../events';
import { traceStepsFixture } from './fixtures';

function model() {
  return mapujKroki(traceStepsFixture());
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('KrokDowodu — kanon pięciu pól', () => {
  it('krok pełny renderuje Wzór, Dane wejściowe, Podstawienie, Wynik, Uwagi', () => {
    render(<KrokDowodu krok={model()[0]} szczegolyAudytowe={false} />);
    expect(screen.getByTestId('mvd-dowod-pole-wzor')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-dowod-pole-dane')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-dowod-pole-podstawienie')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-dowod-pole-wynik')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-dowod-pole-uwagi')).toBeInTheDocument();
  });

  it('etykiety pól po polsku (TRACE_FIELD_LABELS)', () => {
    render(<KrokDowodu krok={model()[0]} szczegolyAudytowe={false} />);
    expect(screen.getByText('Wzór')).toBeInTheDocument();
    expect(screen.getByText('Dane wejściowe')).toBeInTheDocument();
    expect(screen.getByText('Podstawienie')).toBeInTheDocument();
    expect(screen.getByText('Wynik')).toBeInTheDocument();
    expect(screen.getByText('Uwagi')).toBeInTheDocument();
  });

  it('wzór trafia do DOM (LaTeX obecny w kontenerze — bez porównania renderu KaTeX)', () => {
    render(<KrokDowodu krok={model()[0]} szczegolyAudytowe={false} />);
    const pole = screen.getByTestId('mvd-dowod-pole-wzor');
    const latex = pole.querySelector('[data-latex]');
    expect(latex).not.toBeNull();
    expect(latex?.getAttribute('data-latex')).toContain('\\sqrt{R^2 + X^2}');
  });

  it('pole nieobecne w kroku → pominięte (zero atrap)', () => {
    // Krok 2: bez wzoru, bez podstawienia, bez uwag.
    render(<KrokDowodu krok={model()[1]} szczegolyAudytowe={false} />);
    expect(screen.queryByTestId('mvd-dowod-pole-wzor')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mvd-dowod-pole-podstawienie')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mvd-dowod-pole-uwagi')).not.toBeInTheDocument();
  });

  it('krok TYLKO z prozą podstawienia (V12.6, bez substitution_latex) — proza renderuje się jako tekst, NIGDY przez MathBlock (karta V12.7 §0.1)', () => {
    render(<KrokDowodu krok={model()[3]} szczegolyAudytowe={false} />);
    // Pole LaTeX (MathBlock) nie renderuje się dla prozy.
    expect(screen.queryByTestId('mvd-dowod-pole-podstawienie')).not.toBeInTheDocument();
    const poleTekst = screen.getByTestId('mvd-dowod-pole-podstawienie-tekst');
    expect(poleTekst).toHaveTextContent('Macierz admitancyjna');
    // Renderowana jako zwykły akapit — brak kontenera KaTeX/`data-latex`.
    expect(poleTekst.querySelector('[data-latex]')).toBeNull();
  });

  it('jednostka renderowana przy wartości', () => {
    render(<KrokDowodu krok={model()[1]} szczegolyAudytowe={false} />);
    const wynik = screen.getByTestId('mvd-dowod-wynik');
    expect(within(wynik).getByText('12,345')).toBeInTheDocument();
    expect(within(wynik).getByText('kA')).toBeInTheDocument();
  });

  it('etykieta znanego klucza po polsku', () => {
    render(<KrokDowodu krok={model()[1]} szczegolyAudytowe={false} />);
    const wynik = screen.getByTestId('mvd-dowod-wynik');
    expect(within(wynik).getByText('Prąd zwarciowy początkowy Ik"')).toBeInTheDocument();
  });
});

describe('KrokDowodu — klucze nieznane a tryb zaawansowania', () => {
  it('tryb podstawowy: wiersz nieznanego klucza (bez etykiety) pominięty', () => {
    render(<KrokDowodu krok={model()[1]} szczegolyAudytowe={false} />);
    const dane = screen.getByTestId('mvd-dowod-dane');
    // 4 wielkości w źródle, ale wspolczynnik_x (nieznany) pominięty → 3 wiersze.
    expect(within(dane).getAllByTestId('mvd-dowod-wielkosc')).toHaveLength(3);
    expect(within(dane).queryByText('wspolczynnik_x')).not.toBeInTheDocument();
  });

  // Karta #145: surowy klucz nie wraca na pierwszy plan nawet w trybie eksperckim —
  // ekspert znajduje go w zwiniętych „Informacjach audytowych" kroku.
  it('tryb ekspercki: klucz nieznany wyłącznie w informacjach audytowych kroku', async () => {
    render(<KrokDowodu krok={model()[1]} szczegolyAudytowe />);
    const dane = screen.getByTestId('mvd-dowod-dane');
    expect(within(dane).getAllByTestId('mvd-dowod-wielkosc')).toHaveLength(3);
    expect(within(dane).queryByText('wspolczynnik_x')).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('mvd-dowod-krok-informacje-audytowe-przelacz'));
    expect(screen.getByTestId('mvd-dowod-krok-informacje-audytowe-lista').textContent).toContain(
      'wspolczynnik_x',
    );
  });
});

describe('KrokDowodu — powiązanie krok → element (magistrala zdarzeń)', () => {
  it('krok z element_id ma przycisk „Pokaż na schemacie" emitujący selekcję ze źródłem „dowod"', () => {
    const handler = vi.fn();
    const odsub = subskrybuj('selekcja', handler);
    render(<KrokDowodu krok={model()[0]} szczegolyAudytowe={false} />);
    fireEvent.click(screen.getByTestId('mvd-dowod-pokaz-na-schemacie'));
    expect(handler).toHaveBeenCalledWith({ typ: 'selekcja', obiektId: 'BUS-GPZ', zrodlo: 'dowod' });
    odsub();
  });

  it('krok bez element_id nie renderuje przycisku selekcji', () => {
    render(<KrokDowodu krok={model()[1]} szczegolyAudytowe={false} />);
    expect(screen.queryByTestId('mvd-dowod-pokaz-na-schemacie')).not.toBeInTheDocument();
  });

  it('przycisk używa etykiety PL', () => {
    render(<KrokDowodu krok={model()[0]} szczegolyAudytowe={false} />);
    expect(
      screen.getByRole('button', { name: DOWOD_STRINGS.pokazNaSchemacie }),
    ).toBeInTheDocument();
  });
});

// Karta PROZA-BEZ-SYMBOLI-ASCII: proza kroku (tytuł, podstawienie prozą, uwagi) niesie symbol
// wielkości jako segment `$…$` — ekran składa go KaTeX-em (`TekstZWzorami`), nigdy nie pokazuje
// zapisu ASCII ani znaku dolara. Iloczyn: {tytuł · podstawienie prozą · uwagi} × {z segmentem
// wzoru · bez segmentu}.
describe('KrokDowodu — proza z symbolami jako wzory', () => {
  const pola = [
    { pole: 'tytul', selektor: '.mvd-dowod-krok-tytul' },
    { pole: 'podstawienieTekst', selektor: '[data-testid="mvd-dowod-pole-podstawienie-tekst"]' },
    { pole: 'uwagi', selektor: '[data-testid="mvd-dowod-pole-uwagi"]' },
  ] as const;
  for (const { pole, selektor } of pola) {
    for (const zWzorem of [true, false]) {
      it(`${pole} × ${zWzorem ? 'z segmentem $…$' : 'bez segmentu'}`, () => {
        const tekst = zWzorem
          ? "Prąd zwarciowy początkowy $I_k''$ w punkcie zwarcia"
          : 'Prąd zwarciowy początkowy w punkcie zwarcia';
        const krok = { ...model()[3], [pole]: tekst };
        const { container } = render(<KrokDowodu krok={krok} szczegolyAudytowe={false} />);
        const wezel = container.querySelector(selektor);
        expect(wezel).not.toBeNull();
        expect(wezel?.textContent).not.toContain('$');
        expect(wezel?.textContent).toContain('Prąd zwarciowy początkowy');
        const wzor = wezel?.querySelector('[data-latex]');
        if (zWzorem) {
          expect(wzor?.getAttribute('data-latex')).toBe("$I_k''$");
        } else {
          expect(wzor).toBeNull();
        }
      });
    }
  }
});
