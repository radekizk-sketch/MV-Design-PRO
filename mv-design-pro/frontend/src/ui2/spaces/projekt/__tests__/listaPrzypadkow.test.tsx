import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ListaPrzypadkow } from '../ListaPrzypadkow';
import { PULPIT_STRINGS } from '../strings';
import type { PrzypadekWiersz } from '../pulpitAdapter';

function wiersze(): PrzypadekWiersz[] {
  return [
    {
      id: 'K1',
      nazwa: 'Stan normalny',
      konfiguracja: 'PV 100%',
      statusWynikow: 'FRESH',
      ostatniPrzebiegISO: '2026-07-15T11:05:00Z',
      aktywny: false,
    },
    {
      id: 'K2',
      nazwa: 'Zwarcia maks.',
      konfiguracja: 'IEC 60909',
      statusWynikow: 'OUTDATED',
      ostatniPrzebiegISO: '2026-07-15T14:32:00Z',
      aktywny: true,
    },
    {
      id: 'K4',
      nazwa: 'Wariant awaryjny',
      konfiguracja: '—',
      statusWynikow: 'NONE',
      ostatniPrzebiegISO: null,
      aktywny: false,
    },
  ];
}

describe('ListaPrzypadkow — tabela przypadków obliczeniowych', () => {
  it('renderuje wiersze z nazwami i konfiguracją', () => {
    render(
      <ListaPrzypadkow
        wiersze={wiersze()}
        onZaznaczPrzypadek={() => {}}
        onOtworzPrzypadek={() => {}}
      />,
    );
    expect(screen.getByText('Stan normalny')).toBeInTheDocument();
    expect(screen.getByText('Zwarcia maks.')).toBeInTheDocument();
    expect(screen.getByText('PV 100%')).toBeInTheDocument();
    expect(screen.getByText(PULPIT_STRINGS.przypadkiTytul)).toBeInTheDocument();
  });

  it('renderuje statusy wyników jako tagi PL', () => {
    render(
      <ListaPrzypadkow
        wiersze={wiersze()}
        onZaznaczPrzypadek={() => {}}
        onOtworzPrzypadek={() => {}}
      />,
    );
    expect(screen.getByText('aktualne')).toBeInTheDocument();
    expect(screen.getByText('nieaktualne')).toBeInTheDocument();
    expect(screen.getByText('brak')).toBeInTheDocument();
  });

  it('formatuje czas ostatniego przebiegu, „—" gdy brak', () => {
    render(
      <ListaPrzypadkow
        wiersze={wiersze()}
        onZaznaczPrzypadek={() => {}}
        onOtworzPrzypadek={() => {}}
      />,
    );
    expect(screen.getByText('2026-07-15 11:05')).toBeInTheDocument();
    expect(screen.getByText('2026-07-15 14:32')).toBeInTheDocument();
    // K4: brak przebiegu → „—" w kolumnie czasu (oraz „—" w konfiguracji) = 2 wystąpienia.
    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it('oznacza aktywny przypadek', () => {
    render(
      <ListaPrzypadkow
        wiersze={wiersze()}
        onZaznaczPrzypadek={() => {}}
        onOtworzPrzypadek={() => {}}
      />,
    );
    expect(screen.getByText(PULPIT_STRINGS.aktywny)).toBeInTheDocument();
  });

  it('klik wiersza = selekcja (onZaznaczPrzypadek z id)', () => {
    const onZaznacz = vi.fn();
    render(
      <ListaPrzypadkow
        wiersze={wiersze()}
        onZaznaczPrzypadek={onZaznacz}
        onOtworzPrzypadek={() => {}}
      />,
    );
    fireEvent.click(screen.getByText('Stan normalny'));
    expect(onZaznacz).toHaveBeenCalledWith('K1');
  });

  it('2× klik wiersza = otwarcie (onOtworzPrzypadek z id)', () => {
    const onOtworz = vi.fn();
    render(
      <ListaPrzypadkow
        wiersze={wiersze()}
        onZaznaczPrzypadek={() => {}}
        onOtworzPrzypadek={onOtworz}
      />,
    );
    fireEvent.doubleClick(screen.getByText('Zwarcia maks.'));
    expect(onOtworz).toHaveBeenCalledWith('K2');
  });

  it('wiersz zaznaczony ma aria-selected', () => {
    render(
      <ListaPrzypadkow
        wiersze={wiersze()}
        zaznaczonyId="K2"
        onZaznaczPrzypadek={() => {}}
        onOtworzPrzypadek={() => {}}
      />,
    );
    const wiersz = screen.getByText('Zwarcia maks.').closest('tr');
    expect(wiersz).toHaveAttribute('aria-selected', 'true');
  });

  it('pusta lista → komunikat „Brak przypadków obliczeniowych"', () => {
    render(
      <ListaPrzypadkow
        wiersze={[]}
        onZaznaczPrzypadek={() => {}}
        onOtworzPrzypadek={() => {}}
      />,
    );
    expect(screen.getByText(PULPIT_STRINGS.brakPrzypadkow)).toBeInTheDocument();
  });
});
