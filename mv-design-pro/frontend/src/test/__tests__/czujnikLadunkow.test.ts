/**
 * Czujnik ładunku na makietach wysyłki — rozróżnienie wysyłki od formularza i przyrostowość.
 *
 * Iloczyn: kształt wywołania {(zakres, operacja, ładunek), (operacja, kontekst) — formularz,
 * (funkcja, operacja, kontekst) — formularz zaplanowany, (zakres, operacja, napis),
 * (zakres, nie-operacja, obiekt)} × klucz {w kontrakcie, obcy} × makieta {vi.fn, vi.spyOn}.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  dopuscLadunekSpozaKontraktu,
  ladunekWywolania,
  liczbaMakietTrzymanychSilnie,
  naruszeniaMakiet,
  sprawdzPoTescie,
} from '../czujnikLadunkow';

describe('czujnikLadunkow — kształt wywołania', () => {
  it.each([
    [['case-1', 'delete_element', { element_ref: 'x' }], 'delete_element'],
    [['case-1', 'delete_element', { element_ref: 'x' }, { komunikatSukcesuPl: 'ok' }], 'delete_element'],
  ])('wysyłka operacji: %j', (argumenty, operacja) => {
    expect(ladunekWywolania(argumenty)?.operacja).toBe(operacja);
  });

  it.each([
    [['delete_element', { element_ref: 'x', obcy: 1 }]],
    [[() => undefined, 'delete_element', { obcy: 1 }]],
    [['case-1', 'delete_element', 'napis']],
    [['case-1', 'nie_operacja', { obcy: 1 }]],
    [['refresh_snapshot', 'delete_element', { obcy: 1 }]],
  ])('nie wysyłka (formularz, napis, obca nazwa): %j', (argumenty) => {
    expect(ladunekWywolania(argumenty)).toBeNull();
  });
});

describe('czujnikLadunkow — makiety', () => {
  it.each(['fn', 'spyOn'] as const)('vi.%s: klucz obcy meldowany raz, klucz kontraktu nie', (rodzaj) => {
    const cel = { wyslij: (..._argumenty: unknown[]) => undefined };
    // `vi.spyOn` zwraca `MockInstance` (niewywoływalny w typach) — wywołujemy podmienioną
    // metodę obiektu, a `vi.fn()` wprost; obie drogi rejestrują wywołanie w czujniku.
    let wyslij: (...argumenty: unknown[]) => unknown;
    if (rodzaj === 'fn') {
      wyslij = vi.fn();
    } else {
      vi.spyOn(cel, 'wyslij');
      wyslij = cel.wyslij;
    }
    wyslij('case-1', 'delete_element', { element_ref: 'x' });
    expect(naruszeniaMakiet()).toEqual([]);
    wyslij('case-1', 'delete_element', { element_ref: 'x', action_id: 'menu' });
    expect(naruszeniaMakiet()).toEqual(['delete_element: action_id']);
    // Przyrostowo: to samo wywołanie nie wraca w kolejnym sprawdzeniu.
    expect(naruszeniaMakiet()).toEqual([]);
  });

  it('klucz obcy oblewa test; dopuszczenie jawne zwalnia JEDEN test i wygasa', () => {
    const makieta = vi.fn();
    makieta('case-1', 'delete_element', { element_ref: 'x', klucz_obcy: 1 });
    expect(() => sprawdzPoTescie()).toThrow(/delete_element: klucz_obcy/);

    dopuscLadunekSpozaKontraktu();
    makieta('case-1', 'delete_element', { element_ref: 'x', klucz_obcy: 2 });
    expect(() => sprawdzPoTescie()).not.toThrow();

    makieta('case-1', 'delete_element', { element_ref: 'x', klucz_obcy: 3 });
    expect(() => sprawdzPoTescie()).toThrow(/klucz_obcy/);
  });
});

describe('czujnikLadunkow — pamięć makiet', () => {
  // Makieta modułu: tworzona raz nad testami, wywoływana w kolejnych testach. Czujnik trzyma
  // ją po pierwszym sprawdzeniu SŁABO, a odwołanie modułu utrzymuje ją przy życiu — klucz
  // obcy wysłany w późniejszym teście nadal jest meldowany.
  const makietaModulu = vi.fn();

  it('po sprawdzeniu czujnik nie trzyma silnie żadnej makiety', () => {
    const lokalna = vi.fn();
    lokalna('case-1', 'delete_element', { element_ref: 'x' });
    expect(liczbaMakietTrzymanychSilnie()).toBeGreaterThan(0);
    expect(naruszeniaMakiet()).toEqual([]);
    expect(liczbaMakietTrzymanychSilnie()).toBe(0);
  });

  it('makieta modułu jest sprawdzana także w teście po pierwszym sprawdzeniu', () => {
    makietaModulu('case-1', 'delete_element', { element_ref: 'x' });
    expect(naruszeniaMakiet()).toEqual([]);
    expect(liczbaMakietTrzymanychSilnie()).toBe(0);
    makietaModulu('case-1', 'delete_element', { element_ref: 'x', action_id: 'menu' });
    expect(naruszeniaMakiet()).toEqual(['delete_element: action_id']);
  });
});
