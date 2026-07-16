import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
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
    render(<KrokDowodu krok={model()[0]} trybZaawansowania="basic" />);
    expect(screen.getByTestId('mvd-dowod-pole-wzor')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-dowod-pole-dane')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-dowod-pole-podstawienie')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-dowod-pole-wynik')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-dowod-pole-uwagi')).toBeInTheDocument();
  });

  it('etykiety pól po polsku (TRACE_FIELD_LABELS)', () => {
    render(<KrokDowodu krok={model()[0]} trybZaawansowania="basic" />);
    expect(screen.getByText('Wzór')).toBeInTheDocument();
    expect(screen.getByText('Dane wejściowe')).toBeInTheDocument();
    expect(screen.getByText('Podstawienie')).toBeInTheDocument();
    expect(screen.getByText('Wynik')).toBeInTheDocument();
    expect(screen.getByText('Uwagi')).toBeInTheDocument();
  });

  it('wzór trafia do DOM (LaTeX obecny w kontenerze — bez porównania renderu KaTeX)', () => {
    render(<KrokDowodu krok={model()[0]} trybZaawansowania="basic" />);
    const pole = screen.getByTestId('mvd-dowod-pole-wzor');
    const latex = pole.querySelector('[data-latex]');
    expect(latex).not.toBeNull();
    expect(latex?.getAttribute('data-latex')).toContain('\\sqrt{R^2 + X^2}');
  });

  it('pole nieobecne w kroku → pominięte (zero atrap)', () => {
    // Krok 2: bez wzoru, bez podstawienia, bez uwag.
    render(<KrokDowodu krok={model()[1]} trybZaawansowania="basic" />);
    expect(screen.queryByTestId('mvd-dowod-pole-wzor')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mvd-dowod-pole-podstawienie')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mvd-dowod-pole-uwagi')).not.toBeInTheDocument();
  });

  it('jednostka renderowana przy wartości', () => {
    render(<KrokDowodu krok={model()[1]} trybZaawansowania="basic" />);
    const wynik = screen.getByTestId('mvd-dowod-wynik');
    expect(within(wynik).getByText('12,345')).toBeInTheDocument();
    expect(within(wynik).getByText('kA')).toBeInTheDocument();
  });

  it('etykieta znanego klucza po polsku', () => {
    render(<KrokDowodu krok={model()[1]} trybZaawansowania="basic" />);
    const wynik = screen.getByTestId('mvd-dowod-wynik');
    expect(within(wynik).getByText('Prąd zwarciowy początkowy Ik"')).toBeInTheDocument();
  });
});

describe('KrokDowodu — klucze nieznane a tryb zaawansowania', () => {
  it('tryb podstawowy: wiersz nieznanego klucza (bez etykiety) pominięty', () => {
    render(<KrokDowodu krok={model()[1]} trybZaawansowania="basic" />);
    const dane = screen.getByTestId('mvd-dowod-dane');
    // 4 wielkości w źródle, ale wspolczynnik_x (nieznany) pominięty → 3 wiersze.
    expect(within(dane).getAllByTestId('mvd-dowod-wielkosc')).toHaveLength(3);
    expect(within(dane).queryByText('wspolczynnik_x')).not.toBeInTheDocument();
  });

  it('tryb ekspercki: surowy klucz nieznany pokazany', () => {
    render(<KrokDowodu krok={model()[1]} trybZaawansowania="expert" />);
    const dane = screen.getByTestId('mvd-dowod-dane');
    expect(within(dane).getAllByTestId('mvd-dowod-wielkosc')).toHaveLength(4);
    expect(within(dane).getByText('wspolczynnik_x')).toBeInTheDocument();
  });
});

describe('KrokDowodu — powiązanie krok → element (magistrala zdarzeń)', () => {
  it('krok z element_id ma przycisk „Pokaż na schemacie" emitujący selekcję ze źródłem „dowod"', () => {
    const handler = vi.fn();
    const odsub = subskrybuj('selekcja', handler);
    render(<KrokDowodu krok={model()[0]} trybZaawansowania="basic" />);
    fireEvent.click(screen.getByTestId('mvd-dowod-pokaz-na-schemacie'));
    expect(handler).toHaveBeenCalledWith({ typ: 'selekcja', obiektId: 'BUS-GPZ', zrodlo: 'dowod' });
    odsub();
  });

  it('krok bez element_id nie renderuje przycisku selekcji', () => {
    render(<KrokDowodu krok={model()[1]} trybZaawansowania="basic" />);
    expect(screen.queryByTestId('mvd-dowod-pokaz-na-schemacie')).not.toBeInTheDocument();
  });

  it('przycisk używa etykiety PL', () => {
    render(<KrokDowodu krok={model()[0]} trybZaawansowania="basic" />);
    expect(
      screen.getByRole('button', { name: DOWOD_STRINGS.pokazNaSchemacie }),
    ).toBeInTheDocument();
  });
});
