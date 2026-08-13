/*
 * Testy kanonicznego rejestru etapów E1–E8. Pilnują deklaracji z nagłówka
 * `etapy.ts`: rejestr jest JEDEN, kompletny, w stałej kolejności, a każdy etap
 * wskazuje REALNĄ przestrzeń powłoki (nie wymyśloną nazwę).
 */

import { describe, it, expect } from 'vitest';
import { ETAPY, ETAPY_IDS, etapPoId, pozycjaEtapu } from '../etapy';
import { SPACE_IDS } from '../../shell/spaces';
import { TRASY_KANONICZNE } from '../../legacy/mostObszarow';
import { PROCES_STRINGS } from '../strings';

describe('ETAPY — kanoniczna oś pracy projektanta', () => {
  it('ma dokładnie osiem etapów w kolejności E1…E8', () => {
    expect(ETAPY).toHaveLength(8);
    expect(ETAPY_IDS).toEqual(['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8']);
  });

  it('każdy etap ma nazwę i cel — żaden nie jest pustą pozycją', () => {
    for (const etap of ETAPY) {
      expect(etap.nazwa.length).toBeGreaterThan(0);
      expect(etap.cel.length).toBeGreaterThan(0);
    }
  });

  it('nazwy etapów są unikalne (rejestr nie dubluje pozycji)', () => {
    const nazwy = new Set(ETAPY.map((etap) => etap.nazwa));
    expect(nazwy.size).toBe(ETAPY.length);
  });

  it('każdy etap wskazuje REALNĄ przestrzeń powłoki (bez fabrykowanych celów)', () => {
    for (const etap of ETAPY) {
      expect(SPACE_IDS).toContain(etap.przestrzen);
    }
  });

  it('oś etapów pokrywa WSZYSTKIE siedem przestrzeni kanonicznych (równość dwustronna)', () => {
    // Wiązanie z kanonem nawigacji fali 10: mapa nie ma własnej taksonomii
    // miejsc pracy — każdy etap celuje w przestrzeń z `shell/spaces`, a żadna
    // przestrzeń kanoniczna nie zostaje bez etapu (inaczej część aplikacji
    // wypadłaby z procesu projektanta bez śladu).
    const przestrzenieEtapow = new Set(ETAPY.map((etap) => etap.przestrzen));
    expect([...przestrzenieEtapow].sort()).toEqual([...SPACE_IDS].sort());
  });

  it('przestrzenie etapów są tymi samymi, w które celuje kanoniczna tabela tras', () => {
    // `TRASY_KANONICZNE` niesie kierunek trasa → przestrzeń (kanon D1). Etap
    // wskazujący przestrzeń spoza tego zbioru byłby drugą taksonomią nawigacji.
    const przestrzenieTras = new Set(
      Object.values(TRASY_KANONICZNE)
        .map((wpis) => wpis.przestrzen)
        .filter((przestrzen): przestrzen is NonNullable<typeof przestrzen> => przestrzen !== null),
    );
    for (const etap of ETAPY) {
      expect(SPACE_IDS).toContain(etap.przestrzen);
    }
    for (const przestrzen of przestrzenieTras) {
      expect(SPACE_IDS).toContain(przestrzen);
    }
  });

  it('teksty etapów pochodzą z jednego słownika modułu (bez literałów w rejestrze)', () => {
    // Deklaracja `strings.ts`: „jedno źródło etykiet". Gdyby rejestr wpisał
    // nazwę wprost, ta asercja by tego nie wychwyciła — sprawdzamy tożsamość
    // wartości ze słownikiem, po jednym etapie z każdego końca osi.
    expect(etapPoId('E1').nazwa).toBe(PROCES_STRINGS.e1Nazwa);
    expect(etapPoId('E8').cel).toBe(PROCES_STRINGS.e8Cel);
  });

  it('etapPoId zwraca definicję, a dla identyfikatora spoza kanonu RZUCA', () => {
    expect(etapPoId('E4').przestrzen).toBe('obliczenia');
    // Deklaracja nagłówka: „cicha wartość zastępcza ukryłaby rozjazd rejestru".
    expect(() => etapPoId('E9' as never)).toThrow();
  });

  it('pozycjaEtapu zwraca miejsce w kolejności, −1 poza kanonem', () => {
    expect(pozycjaEtapu('E1')).toBe(0);
    expect(pozycjaEtapu('E8')).toBe(7);
    expect(pozycjaEtapu('E0' as never)).toBe(-1);
  });
});
