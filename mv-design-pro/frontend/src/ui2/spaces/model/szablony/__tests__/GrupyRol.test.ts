import { describe, expect, it } from 'vitest';
import {
  KOLEJNOSC_ROL,
  ROLA_LABEL,
  kategorieRoli,
  rolaDlaKategorii,
  zbudujDrzewkoRol,
} from '../GrupyRol';
import { KATEGORIE_FIXTURE } from './fixtures';

describe('rolaDlaKategorii — mapowanie 10 kategorii backendu na role A–E', () => {
  it.each([
    ['typowa_sn_nn', 'B'],
    ['slupowa', 'B'],
    ['zksn_wnetrzowa', 'B'],
    ['przemyslowa', 'C'],
    ['prosument_pv', 'D'],
    ['farma_pv', 'D'],
    ['bess', 'D'],
    ['hybrydowa', 'D'],
    ['wiatrowa', 'D'],
    ['sekcyjna', 'E'],
  ] as const)('%s → rola %s', (kategoria, rola) => {
    expect(rolaDlaKategorii(kategoria)).toBe(rola);
  });

  it('kategoria spoza mapy trafia domyślnie do B (fallback, TODO-KARTA)', () => {
    expect(rolaDlaKategorii('nowa_kategoria_z_przyszlosci')).toBe('B');
  });
});

describe('ROLA_LABEL — etykiety grup (karta §3, brzmienie zamrożone)', () => {
  it('zawiera dokładnie 5 ról w kolejności A–E', () => {
    expect(KOLEJNOSC_ROL).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('etykiety odpowiadają dokładnemu brzmieniu z karty', () => {
    expect(ROLA_LABEL.A).toBe('A. Zasilanie sieci');
    expect(ROLA_LABEL.B).toBe('B. Dystrybucja SN/nn');
    expect(ROLA_LABEL.C).toBe('C. Odbiorcze');
    expect(ROLA_LABEL.D).toBe('D. Źródła i magazyny');
    expect(ROLA_LABEL.E).toBe('E. Specjalne');
  });
});

describe('zbudujDrzewkoRol — drzewko z realnych 10 kategorii /categories', () => {
  const drzewko = zbudujDrzewkoRol(KATEGORIE_FIXTURE);

  it('zwraca dokładnie 5 węzłów ról w kolejności A→E', () => {
    expect(drzewko.map((w) => w.id)).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('rola A (DO DODANIA) ma zero szablonów i zero kategorii — nie gubi się z drzewka', () => {
    const rolaA = drzewko.find((w) => w.id === 'A')!;
    expect(rolaA.liczbaSzablonow).toBe(0);
    expect(rolaA.kategorie).toEqual([]);
  });

  it('rola B agreguje 3 kategorie (typowa_sn_nn, slupowa, zksn_wnetrzowa) = 22 szablony', () => {
    const rolaB = drzewko.find((w) => w.id === 'B')!;
    expect(rolaB.kategorie.map((k) => k.id)).toEqual(['typowa_sn_nn', 'slupowa', 'zksn_wnetrzowa']);
    expect(rolaB.liczbaSzablonow).toBe(10 + 6 + 6);
  });

  it('rola D agreguje 5 kategorii OZE = 27 szablonów', () => {
    const rolaD = drzewko.find((w) => w.id === 'D')!;
    expect(rolaD.kategorie).toHaveLength(5);
    expect(rolaD.liczbaSzablonow).toBe(6 + 6 + 5 + 5 + 4);
  });

  it('rola C zawiera wyłącznie przemyslowa, rola E wyłącznie sekcyjna', () => {
    const rolaC = drzewko.find((w) => w.id === 'C')!;
    const rolaE = drzewko.find((w) => w.id === 'E')!;
    expect(rolaC.kategorie.map((k) => k.id)).toEqual(['przemyslowa']);
    expect(rolaE.kategorie.map((k) => k.id)).toEqual(['sekcyjna']);
  });

  it('etykiety kategorii i liczniki pochodzą wprost z odpowiedzi backendu (zero zgadywania)', () => {
    const rolaB = drzewko.find((w) => w.id === 'B')!;
    const typowe = rolaB.kategorie.find((k) => k.id === 'typowa_sn_nn')!;
    expect(typowe.etykieta).toBe('Typowe stacje SN/nN');
    expect(typowe.liczbaSzablonow).toBe(10);
  });

  it('suma szablonów wszystkich ról odpowiada sumie liczników wejściowych (57)', () => {
    const suma = drzewko.reduce((s, w) => s + w.liczbaSzablonow, 0);
    const sumaWejsciowa = KATEGORIE_FIXTURE.reduce((s, k) => s + k.template_count, 0);
    expect(suma).toBe(sumaWejsciowa);
    expect(suma).toBe(57);
  });
});

describe('kategorieRoli — id kategorii przypisanych do roli (do zapytań listy)', () => {
  const drzewko = zbudujDrzewkoRol(KATEGORIE_FIXTURE);

  it('zwraca id kategorii dla roli D', () => {
    expect(kategorieRoli(drzewko, 'D')).toEqual(['prosument_pv', 'farma_pv', 'bess', 'hybrydowa', 'wiatrowa']);
  });

  it('zwraca pustą tablicę dla roli bez kategorii (A)', () => {
    expect(kategorieRoli(drzewko, 'A')).toEqual([]);
  });
});
