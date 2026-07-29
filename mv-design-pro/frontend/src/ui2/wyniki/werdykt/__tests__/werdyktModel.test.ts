/**
 * Adapter prezentacyjny werdyktu projektowego (karta F-K3) — czyste mapowanie.
 *
 * Pilnuje trzech rzeczy, których nie wolno zgubić w prezentacji:
 * 1. każdy stan ma WŁASNĄ etykietę (żaden nie zlewa się z innym),
 * 2. typ elementu dla pętli decyzji wynika z semantyki DOMENY, a nie z nazwy,
 * 3. rodzaj przekroczenia mapowany jest TYLKO tam, gdzie rejestr akcji ma realny
 *    cel nawigacji (zero fabrykacji celu).
 */

import { describe, expect, it } from 'vitest';

import type { PozycjaWerdyktu } from '../api';
import {
  klasaStanu,
  przyczynaPL,
  rodzajPrzekroczeniaKryterium,
  stanPL,
  stanZrodlaPL,
  typElementuKryterium,
  zakresOcenyPL,
} from '../werdyktModel';
import { WERDYKT_STRINGS as T } from '../strings';

function pozycja(over: Partial<PozycjaWerdyktu> = {}): PozycjaWerdyktu {
  return {
    kryterium_id: 'galaz.obciazenie_dlugotrwale',
    etap: 'E5',
    nazwa_pl: 'Obciazenie dlugotrwale galezi',
    warunek_pl: 'I_rob <= obciazalnosc',
    norma_pl: 'Obciazalnosc katalogowa',
    zrodlo: 'PF',
    element_rodzaj: 'galaz_liniowa',
    stan: 'NARUSZONE',
    liczba_ocenionych: 3,
    liczba_naruszen: 1,
    liczba_niesprawdzonych: 2,
    liczba_ostrzezen: 0,
    wiodacy_element_id: 'L1',
    wiodacy_opis_pl: 'Galaz L1 przeciazona.',
    powod_kod: null,
    powod_pl: null,
    run_id: 'pf-1',
    ...over,
  };
}

describe('stany kryterium', () => {
  it('każdy stan ma własną, rozróżnialną etykietę', () => {
    const etykiety = [
      stanPL('SPELNIONE'),
      stanPL('NARUSZONE'),
      stanPL('NIESPRAWDZONE'),
      stanPL('NIE_DOTYCZY'),
    ];
    expect(new Set(etykiety).size).toBe(4);
    expect(stanPL('NIESPRAWDZONE')).not.toBe(stanPL('SPELNIONE'));
  });

  it('każdy stan ma własną klasę wiersza', () => {
    const klasy = [
      klasaStanu('SPELNIONE'),
      klasaStanu('NARUSZONE'),
      klasaStanu('NIESPRAWDZONE'),
      klasaStanu('NIE_DOTYCZY'),
    ];
    expect(new Set(klasy).size).toBe(4);
  });
});

describe('pętla decyzji', () => {
  it('semantyka domeny mapuje się na typ elementu interfejsu', () => {
    expect(typElementuKryterium(pozycja({ element_rodzaj: 'szyna' }))).toBe('Bus');
    expect(typElementuKryterium(pozycja({ element_rodzaj: 'galaz_liniowa' }))).toBe('LineBranch');
    expect(typElementuKryterium(pozycja({ element_rodzaj: 'transformator' }))).toBe(
      'TransformerBranch',
    );
  });

  it('brak elementu wiodącego lub semantyki → brak celu nawigacji', () => {
    expect(typElementuKryterium(pozycja({ wiodacy_element_id: null }))).toBeNull();
    expect(typElementuKryterium(pozycja({ element_rodzaj: null }))).toBeNull();
  });

  it('rodzaj przekroczenia tylko dla kryteriów z realnym celem akcji', () => {
    expect(rodzajPrzekroczeniaKryterium(pozycja({ kryterium_id: 'napiecie.odchylenie' }))).toBe(
      'napiecie',
    );
    expect(
      rodzajPrzekroczeniaKryterium(pozycja({ kryterium_id: 'moc_bierna.bilans' })),
    ).toBe('bilans-biernej');
    // Kryterium cieplne przewodu nie ma kontekstowego celu — akcja generyczna.
    expect(
      rodzajPrzekroczeniaKryterium(pozycja({ kryterium_id: 'przewod.wytrzymalosc_zwarciowa' })),
    ).toBeUndefined();
  });
});

describe('opisy', () => {
  it('zakres oceny pokazuje ocenione, naruszone i bez danych', () => {
    const opis = zakresOcenyPL(pozycja());
    expect(opis).toContain('3');
    expect(opis).toContain('1');
    expect(opis).toContain('2');
  });

  it('ostrzeżenia są widoczne osobno, nie jako naruszenia', () => {
    const opis = zakresOcenyPL(pozycja({ liczba_ostrzezen: 4 }));
    expect(opis).toContain(T.ostrzezenia(4));
  });

  it('przyczyna bierze opis elementu, a bez niego powód braku oceny', () => {
    expect(przyczynaPL(pozycja())).toBe('Galaz L1 przeciazona.');
    expect(
      przyczynaPL(
        pozycja({ wiodacy_opis_pl: null, powod_pl: 'Brak zakonczonego biegu rozplywu.' }),
      ),
    ).toBe('Brak zakonczonego biegu rozplywu.');
    expect(przyczynaPL(pozycja({ wiodacy_opis_pl: null, powod_pl: null }))).toBe('');
  });

  it('niedostępne źródło pokazuje własny powód, a nie ogólnik', () => {
    expect(
      stanZrodlaPL({
        rodzaj: 'PF',
        run_id: null,
        wykonano: null,
        snapshot_hash: null,
        aktualny: false,
        dostepny: false,
        powod_pl: 'Brak zakonczonego biegu rozplywu mocy dla tego przypadku.',
      }),
    ).toBe('Brak zakonczonego biegu rozplywu mocy dla tego przypadku.');
    expect(
      stanZrodlaPL({
        rodzaj: 'PF',
        run_id: 'pf-1',
        wykonano: null,
        snapshot_hash: 'a',
        aktualny: false,
        dostepny: false,
        powod_pl: null,
      }),
    ).toBe(T.zrodloNieaktualny);
  });
});
