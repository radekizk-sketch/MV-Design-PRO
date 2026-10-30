/**
 * Jeden identyfikator aparatu pola `${bayRef}#${SymbolId}` — konstruktor i parser są
 * swoimi odwrotnościami na CAŁEJ bibliotece symboli × refach pola z `#` w środku, a kod
 * spoza biblioteki (dawne `cable_head`, kompozyty rysunku `#sn-bus`) nie jest aparatem.
 */
import { describe, expect, it } from 'vitest';

import { SYMBOL_DEFS, type SymbolId } from '../../v3/symbols/defs';
import {
  ROLA_SYMBOLU_PL,
  identyfikatorAparatu,
  jestGlowicaKablowa,
  jestSymbolem,
  nazwaAparatuPl,
  rolaAparatuPl,
  rozbierzIdentyfikatorAparatu,
} from '../identyfikatorAparatu';

const SYMBOLE = Object.keys(SYMBOL_DEFS) as SymbolId[];
/** Refy pola: zwykły ENM, ze ścieżką, z `#` w środku (kompozyt) i z samym `#` na końcu
 *  członu — rozbiór tnie na OSTATNIM `#`, więc każdy z nich musi wrócić bez zmian. */
const REFY_POLA = ['bay_ref_1', 'gpz/pole-L1', 'stacja#pole-2', 'a#b#c'] as const;

describe('identyfikator aparatu — konstruktor ∘ parser = tożsamość', () => {
  it('biblioteka symboli nie jest pusta (wyrocznia nad pustym zbiorem nic nie mierzy)', () => {
    expect(SYMBOLE.length).toBeGreaterThan(30);
  });

  for (const bayRef of REFY_POLA) {
    it.each(SYMBOLE)(`%s na polu ${bayRef}`, (symbolId) => {
      const id = identyfikatorAparatu(bayRef, symbolId);
      expect(id).toBe(`${bayRef}#${symbolId}`);
      expect(rozbierzIdentyfikatorAparatu(id)).toEqual({ bayRef, symbolId });
    });
  }
});

describe('identyfikator aparatu — co NIE jest aparatem', () => {
  it.each([
    ['pusty', ''],
    ['null', null],
    ['undefined', undefined],
    ['sam ref pola', 'bay_ref_1'],
    ['dawny kod głowicy', 'bay_ref_1#cable_head'],
    ['dawny kod łącznika szyny', 'bay_ref_1#disconnect_bus'],
    ['kompozyt rysunku szyny', 'stacja-1#sn-bus'],
    ['dawny widok wewnętrzny stacji', 'stacja-1/internal-bay/bay-1/cable_head'],
    ['sam rodzaj bez pola', '#cableHead'],
    ['separator na końcu', 'bay_ref_1#'],
    ['wielkość liter', 'bay_ref_1#CableHead'],
    ['klucz prototypu', 'bay_ref_1#toString'],
  ])('%s → null', (_opis, id) => {
    expect(rozbierzIdentyfikatorAparatu(id)).toBeNull();
  });

  it('jestSymbolem nie przyjmuje kluczy prototypu', () => {
    expect(jestSymbolem('constructor')).toBe(false);
    expect(jestSymbolem('hasOwnProperty')).toBe(false);
  });
});

describe('słownik aparatu — jedna nazwa, jedna rola', () => {
  it.each(SYMBOLE)('%s ma nazwę z biblioteki symboli i niepustą rolę', (symbolId) => {
    expect(nazwaAparatuPl(symbolId)).toBe(SYMBOL_DEFS[symbolId].labelPl);
    expect(rolaAparatuPl(symbolId).trim().length).toBeGreaterThan(10);
    // Rola nie powtarza kodu technicznego ani nazwy (to byłby pusty opis).
    expect(rolaAparatuPl(symbolId)).not.toContain(symbolId);
  });

  it('tabela ról ma dokładnie te klucze co biblioteka symboli', () => {
    expect(Object.keys(ROLA_SYMBOLU_PL).sort()).toEqual([...SYMBOLE].sort());
  });

  it('głowica kablowa to wyłącznie cableHead', () => {
    expect(SYMBOLE.filter((s) => jestGlowicaKablowa(s))).toEqual(['cableHead']);
    expect(jestGlowicaKablowa(undefined)).toBe(false);
    expect(jestGlowicaKablowa(null)).toBe(false);
  });
});
