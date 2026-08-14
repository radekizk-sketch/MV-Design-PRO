import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EdytowalnaTabela } from '../EdytowalnaTabela';
import type { KolumnaEdytowalna } from '../edytowalnaTabelaModel';

interface Wiersz {
  ref: string;
  dlugosc: number;
  ulozenie: string;
  kabel: string;
}

const kolumny: KolumnaEdytowalna<Wiersz>[] = [
  { klucz: 'ref', etykieta: 'ID', odczyt: (w) => w.ref },
  {
    klucz: 'dlugosc',
    etykieta: 'Długość',
    jednostka: 'm',
    mono: true,
    odczyt: (w) => `${w.dlugosc}`,
    sortKey: (w) => w.dlugosc,
    wartoscEdycji: (w) => w.dlugosc,
    edytor: { rodzaj: 'liczba', min: 0 },
  },
  {
    klucz: 'ulozenie',
    etykieta: 'Ułożenie',
    odczyt: (w) => w.ulozenie,
    wartoscEdycji: (w) => w.ulozenie,
    edytor: { rodzaj: 'wybor', opcje: [{ id: 'powietrze', etykieta: 'Powietrze' }, { id: 'grunt', etykieta: 'Grunt' }] },
  },
  {
    klucz: 'kabel',
    etykieta: 'Kabel',
    odczyt: (w) => w.kabel,
    edytor: { rodzaj: 'akcja', etykietaAkcji: 'Zmień' },
  },
];

const wiersze: Wiersz[] = [
  { ref: 'K1', dlugosc: 50, ulozenie: 'powietrze', kabel: 'YKY 4x25' },
  { ref: 'K2', dlugosc: 30, ulozenie: 'grunt', kabel: 'YKY 4x16' },
];

describe('EdytowalnaTabela', () => {
  afterEach(() => cleanup());

  it('pokazuje uczciwy stan pusty bez wierszy', () => {
    render(
      <EdytowalnaTabela
        kolumny={kolumny}
        wiersze={[]}
        kluczWiersza={(w) => w.ref}
        onEdytuj={vi.fn()}
        tekstPusty="Brak odcinków."
        testid="mvd-test-tabela"
      />,
    );
    expect(screen.getByTestId('mvd-test-tabela-pusta')).toHaveTextContent('Brak odcinków.');
  });

  it('renderuje wiersze i kolumny tylko do odczytu', () => {
    render(
      <EdytowalnaTabela
        kolumny={kolumny}
        wiersze={wiersze}
        kluczWiersza={(w) => w.ref}
        onEdytuj={vi.fn()}
        tekstPusty="Brak"
        testid="mvd-test-tabela"
      />,
    );
    expect(screen.getAllByTestId('mvd-test-tabela-wiersz')).toHaveLength(2);
    expect(screen.getByTestId('mvd-test-tabela-komorka-ref-K1')).toHaveTextContent('K1');
  });

  it('commituje edycję liczbową PO utracie fokusu (onBlur), z realną wartością', async () => {
    const onEdytuj = vi.fn();
    render(
      <EdytowalnaTabela
        kolumny={kolumny}
        wiersze={wiersze}
        kluczWiersza={(w) => w.ref}
        onEdytuj={onEdytuj}
        tekstPusty="Brak"
        testid="mvd-test-tabela"
      />,
    );
    const input = screen.getByTestId('mvd-test-tabela-komorka-dlugosc-K1-input');
    await userEvent.clear(input);
    await userEvent.type(input, '75');
    await userEvent.tab(); // natywna utrata fokusu — wyzwala onBlur

    expect(onEdytuj).toHaveBeenCalledWith(wiersze[0], 'dlugosc', 75);
  });

  it('commituje wybór z listy natychmiast (onChange)', async () => {
    const onEdytuj = vi.fn();
    render(
      <EdytowalnaTabela
        kolumny={kolumny}
        wiersze={wiersze}
        kluczWiersza={(w) => w.ref}
        onEdytuj={onEdytuj}
        tekstPusty="Brak"
        testid="mvd-test-tabela"
      />,
    );
    const select = screen.getByTestId('mvd-test-tabela-komorka-ulozenie-K1-select');
    await userEvent.selectOptions(select, 'grunt');
    expect(onEdytuj).toHaveBeenCalledWith(wiersze[0], 'ulozenie', 'grunt');
  });

  it('woła onAkcja przy kliknięciu kolumny typu akcja (np. zmiana kabla → picker katalogu)', async () => {
    const onAkcja = vi.fn();
    render(
      <EdytowalnaTabela
        kolumny={kolumny}
        wiersze={wiersze}
        kluczWiersza={(w) => w.ref}
        onEdytuj={vi.fn()}
        onAkcja={onAkcja}
        tekstPusty="Brak"
        testid="mvd-test-tabela"
      />,
    );
    await userEvent.click(screen.getByTestId('mvd-test-tabela-komorka-kabel-K1-akcja'));
    expect(onAkcja).toHaveBeenCalledWith(wiersze[0], 'kabel');
  });

  it('sortuje po kliknięciu nagłówka kolumny (rosnąco → malejąco → bez sortowania)', async () => {
    render(
      <EdytowalnaTabela
        kolumny={kolumny}
        wiersze={wiersze}
        kluczWiersza={(w) => w.ref}
        onEdytuj={vi.fn()}
        tekstPusty="Brak"
        testid="mvd-test-tabela"
      />,
    );
    const naglowek = screen.getByTestId('mvd-test-tabela-th-dlugosc');
    // Kolejność źródłowa: K1 (50), K2 (30).
    expect(screen.getAllByTestId('mvd-test-tabela-wiersz')[0]).toHaveTextContent('K1');

    await userEvent.click(naglowek.querySelector('button')!);
    expect(screen.getAllByTestId('mvd-test-tabela-wiersz')[0]).toHaveTextContent('K2'); // rosnąco: 30 przed 50

    await userEvent.click(naglowek.querySelector('button')!);
    expect(screen.getAllByTestId('mvd-test-tabela-wiersz')[0]).toHaveTextContent('K1'); // malejąco: 50 przed 30
  });

  it('2× klik na wierszu woła onOtworzWiersz', async () => {
    const onOtworzWiersz = vi.fn();
    render(
      <EdytowalnaTabela
        kolumny={kolumny}
        wiersze={wiersze}
        kluczWiersza={(w) => w.ref}
        onEdytuj={vi.fn()}
        onOtworzWiersz={onOtworzWiersz}
        tekstPusty="Brak"
        testid="mvd-test-tabela"
      />,
    );
    await userEvent.dblClick(screen.getAllByTestId('mvd-test-tabela-wiersz')[0]);
    expect(onOtworzWiersz).toHaveBeenCalledWith(wiersze[0]);
  });

  it('pokazuje stan zapisywania i błędu komórki gdy wołający je zgłasza', () => {
    render(
      <EdytowalnaTabela
        kolumny={kolumny}
        wiersze={wiersze}
        kluczWiersza={(w) => w.ref}
        onEdytuj={vi.fn()}
        stanKomorki={(w, klucz) => (w.ref === 'K1' && klucz === 'dlugosc' ? 'blad' : w.ref === 'K2' && klucz === 'dlugosc' ? 'zapisywanie' : undefined)}
        tekstPusty="Brak"
        testid="mvd-test-tabela"
      />,
    );
    expect(screen.getByTestId('mvd-test-tabela-komorka-dlugosc-K1')).toHaveTextContent('Błąd zapisu');
    expect(screen.getByTestId('mvd-test-tabela-komorka-dlugosc-K2')).toHaveTextContent('Zapisywanie…');
  });
});
