// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { filtrujProblemy, zastosujFiltry } from '../treeFilters';
import type { WezelDrzewa } from '../treeModel';

function wezel(overrides: Partial<WezelDrzewa> & { id: string; etykietaPL: string }): WezelDrzewa {
  return {
    ikona: 'stacja',
    liczniki: { blokady: 0, ostrzezenia: 0 },
    dzieci: [],
    ...overrides,
  };
}

describe('filtrujProblemy', () => {
  it('usuwa gałęzie bez problemów u siebie i u potomków', () => {
    const drzewo = [
      wezel({ id: 'a', etykietaPL: 'A' }),
      wezel({ id: 'b', etykietaPL: 'B', liczniki: { blokady: 1, ostrzezenia: 0 } }),
    ];
    const wynik = filtrujProblemy(drzewo);
    expect(wynik.map((w) => w.id)).toEqual(['b']);
  });

  it('zachowuje przodków dopasowanego węzła głęboko zagnieżdżonego', () => {
    const drzewo: WezelDrzewa[] = [
      wezel({
        id: 'root',
        etykietaPL: 'Root',
        dzieci: [
          wezel({
            id: 'mid',
            etykietaPL: 'Mid',
            dzieci: [wezel({ id: 'leaf', etykietaPL: 'Leaf', liczniki: { blokady: 0, ostrzezenia: 1 } })],
          }),
        ],
      }),
    ];
    const wynik = filtrujProblemy(drzewo);
    expect(wynik).toHaveLength(1);
    expect(wynik[0].id).toBe('root');
    expect(wynik[0].dzieci).toHaveLength(1);
    expect(wynik[0].dzieci[0].id).toBe('mid');
    expect(wynik[0].dzieci[0].dzieci).toHaveLength(1);
    expect(wynik[0].dzieci[0].dzieci[0].id).toBe('leaf');
  });

  it('usuwa rodzeństwo bez problemów, zachowując tylko dopasowaną gałąź', () => {
    const drzewo: WezelDrzewa[] = [
      wezel({
        id: 'root',
        etykietaPL: 'Root',
        dzieci: [
          wezel({ id: 'ok', etykietaPL: 'OK' }),
          wezel({ id: 'zly', etykietaPL: 'Zły', liczniki: { blokady: 2, ostrzezenia: 0 } }),
        ],
      }),
    ];
    const wynik = filtrujProblemy(drzewo);
    expect(wynik[0].dzieci.map((w) => w.id)).toEqual(['zly']);
  });

  it('zwraca [] gdy żaden węzeł nie ma problemu', () => {
    const drzewo = [wezel({ id: 'a', etykietaPL: 'A', dzieci: [wezel({ id: 'a1', etykietaPL: 'A1' })] })];
    expect(filtrujProblemy(drzewo)).toEqual([]);
  });

  it('węzeł z własnym problemem, ale bez pasujących dzieci, zachowuje pustą listę dzieci', () => {
    const drzewo: WezelDrzewa[] = [
      wezel({
        id: 'a',
        etykietaPL: 'A',
        liczniki: { blokady: 1, ostrzezenia: 0 },
        dzieci: [wezel({ id: 'a1', etykietaPL: 'A1' })],
      }),
    ];
    const wynik = filtrujProblemy(drzewo);
    expect(wynik[0].id).toBe('a');
    expect(wynik[0].dzieci).toEqual([]);
  });
});

describe('zastosujFiltry', () => {
  // Karta K1 POWLOKA: filtr „trybu zaawansowania" skasowany razem z trzema
  // trybami (jeden przełącznik „Szczegóły audytowe" nie ukrywa węzłów drzewa —
  // żaden węzeł nie miał innego progu niż podstawowy). Zostaje filtr problemów.
  it('stosuje filtr problemów do całego drzewa', () => {
    const drzewo: WezelDrzewa[] = [
      wezel({ id: 'a', etykietaPL: 'A', liczniki: { blokady: 1, ostrzezenia: 0 } }),
      wezel({ id: 'b', etykietaPL: 'B', liczniki: { blokady: 0, ostrzezenia: 2 } }),
      wezel({ id: 'c', etykietaPL: 'C' }),
    ];
    const wynik = zastosujFiltry(drzewo, { filtrProblemy: true });
    expect(wynik.map((w) => w.id)).toEqual(['a', 'b']);
  });

  it('bez żadnego filtra zwraca drzewo bez zmian', () => {
    const drzewo: WezelDrzewa[] = [wezel({ id: 'a', etykietaPL: 'A' })];
    expect(zastosujFiltry(drzewo, { filtrProblemy: false })).toEqual(drzewo);
  });
});
