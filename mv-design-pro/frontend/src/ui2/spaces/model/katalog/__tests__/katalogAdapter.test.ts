import { describe, expect, it } from 'vitest';

import {
  KATEGORIE,
  filtrujPozycje,
  metadanaKategorii,
  poleParametrow,
  producenci,
} from '../adapters/katalogAdapter';
import { definicjaParametru } from '../parametryDefinicje';
import { FIXTURE_FALOWNIKI, FIXTURE_LINIE } from './fixtures';

describe('katalogAdapter — metadane kategorii', () => {
  it('udostępnia 9 kategorii katalogu (SN + przekładniki + osprzęt nN)', () => {
    // L-16 (karta KD-3): cztery przestrzenie były w API katalogu i w moście
    // `CatalogBrowser`, a nie było ich w adapterze ui2 — projektant nie widział
    // w warsztacie modelu przekładników ani osprzętu nN.
    expect(KATEGORIE.map((k) => k.id)).toEqual([
      'LINIA',
      'KABEL',
      'TRANSFORMATOR',
      'APARAT',
      'FALOWNIK',
      'CT',
      'VT',
      'KABEL_NN',
      'APARAT_NN',
    ]);
  });

  it('każde pole parametru każdej kategorii ma definicję w słowniku (zero zgadywania)', () => {
    for (const kat of KATEGORIE) {
      for (const pole of kat.poleParametrow) {
        expect(definicjaParametru(pole), `${kat.id}.${pole}`).not.toBeNull();
      }
    }
  });

  it('metadanaKategorii i poleParametrow zwracają spójne dane', () => {
    expect(poleParametrow('TRANSFORMATOR')).toContain('uk_percent');
    expect(metadanaKategorii('APARAT').poleParametrow).toEqual(['un_kv', 'in_a', 'ik_ka', 'icw_ka']);
  });

  it('każda kategoria ma funkcję pobierającą realny endpoint', () => {
    for (const kat of KATEGORIE) {
      expect(typeof kat.pobierz).toBe('function');
    }
  });
});

describe('katalogAdapter — producenci i filtrowanie', () => {
  it('producenci zwraca unikalną, posortowaną listę bez pustych', () => {
    expect(producenci(FIXTURE_FALOWNIKI)).toEqual(['Huawei', 'SMA']);
  });

  it('filtrujPozycje po frazie dopasowuje nazwę', () => {
    const wynik = filtrujPozycje(FIXTURE_FALOWNIKI, 'magazyn', null);
    expect(wynik).toHaveLength(1);
    expect(wynik[0].id).toBe('bess-inv-1000');
  });

  it('filtrujPozycje po frazie dopasowuje producenta (bez wielkości liter)', () => {
    const wynik = filtrujPozycje(FIXTURE_FALOWNIKI, 'sma', null);
    expect(wynik).toHaveLength(1);
    expect(wynik[0].manufacturer).toBe('SMA');
  });

  it('filtrujPozycje po producencie zwęża listę', () => {
    const wynik = filtrujPozycje(FIXTURE_FALOWNIKI, '', 'Huawei');
    expect(wynik).toHaveLength(1);
    expect(wynik[0].id).toBe('bess-inv-1000');
  });

  it('pusta fraza i brak producenta zwraca wszystkie pozycje', () => {
    expect(filtrujPozycje(FIXTURE_LINIE, '', null)).toHaveLength(FIXTURE_LINIE.length);
  });
});
