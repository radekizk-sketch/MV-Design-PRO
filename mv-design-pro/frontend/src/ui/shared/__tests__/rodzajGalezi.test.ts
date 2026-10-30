/**
 * Rodzaje gałęzi modelu — jedno źródło listy (`types/rodzajeGalezi.ts`) i jeden słownik nazw
 * (`ui/shared/rodzajGalezi.ts`) w parytecie z backendem.
 *
 * Wyrocznia: `harness-fixtures/generated/rodzaje_wielkosci_zwarciowych_aparatury.json`
 * (`rodzaje_galezi` z `enm.models`: `SwitchBranch.type`, `FuseBranch.type`, `OverheadLine`,
 * `Cable`; `nazwy_galezi` z `enm.slownik_komunikatow.NAZWY_RODZAJOW_GALEZI_PL`), generowana
 * przez `backend/scripts/eksport_fixtur_harnessu.py`. Zmiana listy albo nazwy po jednej
 * stronie bez drugiej zapala czerwień.
 *
 * Iloczyn cech predykatów: {każdy rodzaj gałęzi modelu, rodzaj spoza modelu, wartość
 * niebędąca tekstem, brak} × {lista aparatów, lista łączników, predykat rekordu, predykat
 * gałęzi}.
 */
import { describe, expect, it } from 'vitest';

import wyrocznia from '../../../harness-fixtures/generated/rodzaje_wielkosci_zwarciowych_aparatury.json';
import { isApparatusBranch, isFuseBranch, isSwitchBranch, type Branch } from '../../../types/enm';
import {
  RODZAJE_GALEZI,
  RODZAJE_GALEZI_APARATU,
  RODZAJE_GALEZI_LACZNIKA,
  jestRodzajemGalezi,
  jestRodzajemGaleziAparatu,
  jestRodzajemGaleziLacznika,
} from '../../../types/rodzajeGalezi';
import { RODZAJ_GALEZI_PL } from '../rodzajGalezi';

const posortowane = (lista: readonly string[]): string[] => [...lista].sort();

function galaz(type: Branch['type']): Branch {
  return {
    id: `id-${type}`,
    ref_id: `ref-${type}`,
    name: type,
    tags: [],
    meta: {},
    from_bus_ref: 'a',
    to_bus_ref: 'b',
    status: 'closed',
    type,
  } as unknown as Branch;
}

describe('Rodzaje gałęzi — parytet z backendem', () => {
  it('lista łączników = SwitchBranch.type backendu', () => {
    expect(posortowane(RODZAJE_GALEZI_LACZNIKA)).toEqual(wyrocznia.rodzaje_galezi.lacznik);
  });

  it('lista aparatów = łączniki i bezpiecznik backendu; bezpiecznik jest na liście', () => {
    expect(posortowane(RODZAJE_GALEZI_APARATU)).toEqual(wyrocznia.rodzaje_galezi.aparat);
    expect(RODZAJE_GALEZI_APARATU).toContain('fuse');
    expect(RODZAJE_GALEZI_APARATU).toContain('bus_coupler');
  });

  it('wszystkie rodzaje = odcinki i aparaty backendu, bez części wspólnej', () => {
    const { odcinek, aparat } = wyrocznia.rodzaje_galezi;
    expect(posortowane(RODZAJE_GALEZI)).toEqual(posortowane([...odcinek, ...aparat]));
    expect(odcinek.filter((r) => aparat.includes(r))).toEqual([]);
  });

  it('słownik nazw ma każdy rodzaj i tę samą nazwę co backend (wielka litera na początku)', () => {
    expect(posortowane(Object.keys(RODZAJ_GALEZI_PL))).toEqual(
      posortowane(Object.keys(wyrocznia.nazwy_galezi)),
    );
    for (const [rodzaj, nazwa] of Object.entries(wyrocznia.nazwy_galezi)) {
      const nazwaFrontu = RODZAJ_GALEZI_PL[rodzaj as Branch['type']];
      expect(nazwaFrontu.charAt(0)).toBe(nazwa.charAt(0).toUpperCase());
      expect(nazwaFrontu.slice(1)).toBe(nazwa.slice(1));
    }
  });
});

describe('Rodzaje gałęzi — predykaty z jednego źródła', () => {
  it.each(RODZAJE_GALEZI.map((rodzaj) => [rodzaj] as const))('rodzaj „%s”', (rodzaj) => {
    const aparat = wyrocznia.rodzaje_galezi.aparat.includes(rodzaj);
    const lacznik = wyrocznia.rodzaje_galezi.lacznik.includes(rodzaj);
    expect(jestRodzajemGalezi(rodzaj)).toBe(true);
    expect(jestRodzajemGaleziAparatu(rodzaj)).toBe(aparat);
    expect(jestRodzajemGaleziLacznika(rodzaj)).toBe(lacznik);
    expect(isApparatusBranch(galaz(rodzaj))).toBe(aparat);
    expect(isSwitchBranch(galaz(rodzaj))).toBe(lacznik);
    expect(isFuseBranch(galaz(rodzaj))).toBe(rodzaj === 'fuse');
    expect(RODZAJE_GALEZI_APARATU.includes(rodzaj as never)).toBe(aparat);
    expect(RODZAJE_GALEZI_LACZNIKA.includes(rodzaj as never)).toBe(lacznik);
  });

  it.each([
    ['rodzaj spoza modelu', 'transformer'],
    ['kod wielkimi literami', 'BREAKER'],
    ['tekst pusty', ''],
    ['klucz prototypu', 'toString'],
    ['liczba', 3],
    ['null', null],
    ['brak', undefined],
  ] as const)('%s nie jest rodzajem gałęzi', (_opis, wartosc) => {
    expect(jestRodzajemGalezi(wartosc)).toBe(false);
    expect(jestRodzajemGaleziAparatu(wartosc)).toBe(false);
    expect(jestRodzajemGaleziLacznika(wartosc)).toBe(false);
  });
});
