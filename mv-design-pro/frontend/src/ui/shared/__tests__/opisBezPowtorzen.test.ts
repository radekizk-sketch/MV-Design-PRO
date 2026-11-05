/**
 * Opis bez powtórzeń — jedna reguła dla rodzaju, roli i nazwy obiektu nadrzędnego.
 *
 * Iloczyn cech: położenie powtórzenia {brak, początek nazwy, cała nazwa, nazwa nadrzędna
 * w środku, nazwa nadrzędna na końcu} × wielkość liter {zgodna, różna} × granica słowa
 * {jest, brak — „Pole liniowe1”, „Wyłącznikowy”}.
 */
import { describe, expect, it } from 'vitest';

import { nazwaZaczynaSieOpisem, opisBezPowtorzen } from '../opisBezPowtorzen';

describe('nazwaZaczynaSieOpisem', () => {
  it.each([
    ['Pole liniowe wejściowe 1', 'Pole liniowe wejściowe', true],
    ['pole liniowe wejściowe 1', 'Pole liniowe wejściowe', true],
    ['Pole liniowe wejściowe', 'Pole liniowe wejściowe', true],
    ['Pole liniowe wejściowe-2', 'Pole liniowe wejściowe', true],
    ['Pole liniowe wejściowe1', 'Pole liniowe wejściowe', false],
    ['Pole liniowe 01', 'Pole liniowe wejściowe', false],
    ['Wyłącznikowy zestaw', 'Wyłącznik', false],
    ['ŁĄCZNIK sekcyjny', 'Łącznik', true],
    ['', 'Pole', false],
    ['Pole 1', '', false],
  ])('%s zaczyna się „%s” → %s', (nazwa, opis, oczekiwane) => {
    expect(nazwaZaczynaSieOpisem(nazwa, opis)).toBe(oczekiwane);
  });
});

describe('opisBezPowtorzen', () => {
  it.each([
    // [rodzaj, nazwa, nadrzędne, oczekiwany opis]
    ['Wyłącznik', 'Q5', [], 'Wyłącznik · Q5'],
    ['Wyłącznik', 'Wyłącznik pola SN 3', [], 'Wyłącznik pola SN 3'],
    ['Wyłącznik', 'wyłącznik pola SN 3', [], 'wyłącznik pola SN 3'],
    ['Wyłącznik', 'Wyłącznikowy zestaw', [], 'Wyłącznik · Wyłącznikowy zestaw'],
    // Nazwa gałęzi aparatu pochodna nazwy pola — pole nazywa karta, opis zostaje rodzajem.
    ['Wyłącznik', 'Aparat Pole liniowe GPZ 1.1', ['Pole liniowe GPZ 1.1'], 'Wyłącznik'],
    ['Wyłącznik', 'aparat pole liniowe gpz 1.1', ['Pole liniowe GPZ 1.1'], 'Wyłącznik'],
    ['Wyłącznik', 'Pole liniowe GPZ 1.1', ['Pole liniowe GPZ 1.1'], 'Wyłącznik'],
    ['Odłącznik', 'Odłącznik szynowy Pole liniowe GPZ 1.1', ['Pole liniowe GPZ 1.1'], 'Odłącznik szynowy'],
    ['Odłącznik', 'Pole liniowe GPZ 1.1 · Q1', ['Pole liniowe GPZ 1.1'], 'Odłącznik · Q1'],
    // Nazwa nadrzędna bez granicy słowa nie jest zdejmowana.
    ['Wyłącznik', 'Aparat Pole liniowe GPZ 1.10', ['Pole liniowe GPZ 1.1'], 'Wyłącznik · Aparat Pole liniowe GPZ 1.10'],
    // Brak nazwy — sam rodzaj; nadrzędne puste — bez wpływu.
    ['Wyłącznik', null, [null, ''], 'Wyłącznik'],
    ['Wyłącznik', 'Q5', [null], 'Wyłącznik · Q5'],
  ] as const)('%s + „%s” (nadrzędne %j) → „%s”', (rodzaj, nazwa, nadrzedne, oczekiwane) => {
    expect(opisBezPowtorzen({ rodzaj, nazwa, nadrzedne })).toBe(oczekiwane);
  });
});
