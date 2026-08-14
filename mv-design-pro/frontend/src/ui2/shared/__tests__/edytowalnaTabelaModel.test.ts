import { describe, expect, it } from 'vitest';

import {
  kluczSortKolumny,
  obliczOknoWirtualizacji,
  posortujWiersze,
  PROG_WIRTUALIZACJI_TABELI,
  type KolumnaEdytowalna,
} from '../edytowalnaTabelaModel';

interface Wiersz {
  id: string;
  dlugosc: number;
}

const kolumny: KolumnaEdytowalna<Wiersz>[] = [
  { klucz: 'id', etykieta: 'ID', odczyt: (w) => w.id },
  { klucz: 'dlugosc', etykieta: 'Długość', odczyt: (w) => `${w.dlugosc} m`, sortKey: (w) => w.dlugosc },
];

describe('edytowalnaTabelaModel', () => {
  it('kluczSortKolumny używa sortKey, gdy podany', () => {
    expect(kluczSortKolumny(kolumny[1], { id: 'a', dlugosc: 42 })).toBe(42);
  });

  it('kluczSortKolumny spada na odczyt sformatowany, gdy brak sortKey', () => {
    expect(kluczSortKolumny(kolumny[0], { id: 'a', dlugosc: 42 })).toBe('a');
  });

  it('posortujWiersze sortuje rosnąco/malejąco/bez zmian (trzeci klik)', () => {
    const wiersze: Wiersz[] = [
      { id: 'K3', dlugosc: 30 },
      { id: 'K1', dlugosc: 10 },
      { id: 'K2', dlugosc: 20 },
    ];
    expect(posortujWiersze(kolumny, wiersze, { klucz: 'dlugosc', kierunek: 'rosnaco' }).map((w) => w.id)).toEqual(['K1', 'K2', 'K3']);
    expect(posortujWiersze(kolumny, wiersze, { klucz: 'dlugosc', kierunek: 'malejaco' }).map((w) => w.id)).toEqual(['K3', 'K2', 'K1']);
    expect(posortujWiersze(kolumny, wiersze, null).map((w) => w.id)).toEqual(['K3', 'K1', 'K2']);
  });

  it('posortujWiersze nie mutuje wejścia', () => {
    const wiersze: Wiersz[] = [{ id: 'K2', dlugosc: 20 }, { id: 'K1', dlugosc: 10 }];
    const oryginal = [...wiersze];
    posortujWiersze(kolumny, wiersze, { klucz: 'dlugosc', kierunek: 'rosnaco' });
    expect(wiersze).toEqual(oryginal);
  });

  it('posortujWiersze przy remisie zachowuje stabilność (kolejność źródłowa)', () => {
    const wiersze: Wiersz[] = [
      { id: 'A', dlugosc: 10 },
      { id: 'B', dlugosc: 10 },
      { id: 'C', dlugosc: 10 },
    ];
    expect(posortujWiersze(kolumny, wiersze, { klucz: 'dlugosc', kierunek: 'rosnaco' }).map((w) => w.id)).toEqual(['A', 'B', 'C']);
  });

  it('obliczOknoWirtualizacji zwraca pełen zakres poniżej progu', () => {
    expect(obliczOknoWirtualizacji(10, 0)).toEqual({ pierwszy: 0, ostatni: 10, wysGora: 0, wysDol: 0 });
  });

  it('obliczOknoWirtualizacji okrawa zakres powyżej progu wg przewinięcia', () => {
    const liczbaWierszy = PROG_WIRTUALIZACJI_TABELI + 200;
    const okno = obliczOknoWirtualizacji(liczbaWierszy, 3600); // 100 wierszy w dół (36px/wiersz)
    expect(okno.ostatni).toBeLessThan(liczbaWierszy);
    expect(okno.pierwszy).toBeGreaterThan(0);
    expect(okno.wysGora).toBeGreaterThan(0);
    expect(okno.wysDol).toBeGreaterThan(0);
  });
});
