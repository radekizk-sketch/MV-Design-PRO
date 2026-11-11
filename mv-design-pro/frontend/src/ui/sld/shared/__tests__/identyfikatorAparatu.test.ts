// @vitest-environment node
/**
 * Jeden identyfikator aparatu pola `${bayRef}#${SymbolId}` — konstruktor i parser są
 * swoimi odwrotnościami na CAŁEJ bibliotece symboli × refach pola z `#` w środku, a kod
 * spoza biblioteki (dawne `cable_head`, kompozyty rysunku `#sn-bus`) nie jest aparatem.
 */
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../types/enm';
import { SYMBOL_DEFS, type SymbolId } from '../../v3/symbols/defs';
import {
  ROLA_SYMBOLU_PL,
  identyfikatorAparatu,
  jestPunktemWyprowadzeniaCiagu,
  jestSymbolem,
  nazwaAparatuPl,
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
    expect(ROLA_SYMBOLU_PL[symbolId].trim().length).toBeGreaterThan(10);
    // Rola nie powtarza kodu technicznego ani nazwy (to byłby pusty opis).
    expect(ROLA_SYMBOLU_PL[symbolId]).not.toContain(symbolId);
  });

  it('tabela ról ma dokładnie te klucze co biblioteka symboli', () => {
    expect(Object.keys(ROLA_SYMBOLU_PL).sort()).toEqual([...SYMBOLE].sort());
  });

});

/**
 * Punkt wyprowadzenia ciągu: iloczyn CAŁEJ biblioteki symboli × rekord pola z głowicą /
 * bez głowicy / pole nieznane w modelu × brak migawki. Punktem jest głowica (zawsze) i
 * zakończenie pola `bayReserve` wyłącznie przy rekordzie głowicy (kanon pola wolnego nie
 * rysuje głowicy, model ją ma). Żaden inny symbol nie jest punktem w żadnym stanie rekordu.
 */
describe('punkt wyprowadzenia ciągu głównego — symbol × rekord głowicy pola', () => {
  const POLE = 'gpz/pole-L1';
  const model = (urzadzenia: readonly string[]): EnergyNetworkModel =>
    ({
      bays: [
        {
          id: POLE,
          ref_id: POLE,
          primary_devices: urzadzenia.map((kind, i) => ({ device_ref: `${POLE}::${i}`, kind })),
        },
      ],
    }) as unknown as EnergyNetworkModel;
  const STANY = [
    { nazwa: 'rekord z głowicą', snapshot: model(['DS', 'CB', 'CABLE_HEAD']), punkty: ['cableHead', 'bayReserve'] },
    { nazwa: 'rekord bez głowicy', snapshot: model(['DS', 'CB', 'ES']), punkty: ['cableHead'] },
    { nazwa: 'pole spoza modelu', snapshot: { bays: [] } as unknown as EnergyNetworkModel, punkty: ['cableHead'] },
    { nazwa: 'brak migawki', snapshot: null, punkty: ['cableHead'] },
  ] as const;

  it.each(STANY)('$nazwa', ({ snapshot, punkty }) => {
    const wynik = SYMBOLE.filter((s) =>
      jestPunktemWyprowadzeniaCiagu(snapshot, { bayRef: POLE, symbolId: s }),
    );
    expect([...wynik].sort()).toEqual([...punkty].sort());
  });

  it('brak aparatu (ref spoza biblioteki symboli) nie jest punktem', () => {
    expect(jestPunktemWyprowadzeniaCiagu(model(['CABLE_HEAD']), null)).toBe(false);
    expect(
      jestPunktemWyprowadzeniaCiagu(model(['CABLE_HEAD']), rozbierzIdentyfikatorAparatu(`${POLE}#cable_head`)),
    ).toBe(false);
  });
});
