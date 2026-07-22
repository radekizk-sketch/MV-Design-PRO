/**
 * Test rejestru akcji naprawczych (K1 / F-E6.3): mapowanie rodzaj → akcja
 * + fallback (brak rodzaju = akcja generyczna 1:1). Czysty moduł — bez React.
 */
import { describe, it, expect } from 'vitest';

import {
  AKCJA_GENERYCZNA,
  akcjaNaprawcza,
  type RodzajPrzekroczenia,
} from '../akcjeNaprawcze';
import { WZORZEC_STRINGS } from '../strings';

describe('akcjaNaprawcza — rejestr akcji per rodzaj przekroczenia', () => {
  it('fallback: brak rodzaju → akcja generyczna (selekcja + „Schemat"), etykiety wzorca 1:1', () => {
    expect(akcjaNaprawcza()).toBe(AKCJA_GENERYCZNA);
    expect(akcjaNaprawcza(undefined)).toBe(AKCJA_GENERYCZNA);
    expect(AKCJA_GENERYCZNA.cel).toEqual({ rodzaj: 'schemat' });
    expect(AKCJA_GENERYCZNA.etykieta).toBe(WZORZEC_STRINGS.poprawWModelu);
    expect(AKCJA_GENERYCZNA.opis).toBe(WZORZEC_STRINGS.poprawWModeluOpis);
  });

  it.each([
    'napiecie',
    'obciazalnosc-galezi',
    'obciazalnosc-transformatora',
    'migotanie',
  ] as const satisfies readonly RodzajPrzekroczenia[])(
    'rodzaj „%s" → akcja generyczna (brak programowego wejścia w dedykowany konfigurator — dobór w property-gridzie po selekcji)',
    (rodzaj) => {
      expect(akcjaNaprawcza(rodzaj)).toBe(AKCJA_GENERYCZNA);
    },
  );

  it('rodzaj „bilans-biernej" → akcja kontekstowa: okno „Dobór kompensacji" (zakładka przestrzeni „Wyniki")', () => {
    const akcja = akcjaNaprawcza('bilans-biernej');
    expect(akcja.cel).toEqual({ rodzaj: 'wyniki-zakladka', zakladka: 'kompensacja' });
    // §0.5 karty K1: etykieta kontekstowa WYŁĄCZNIE, gdy akcja różni się od generycznej.
    expect(akcja.etykieta).not.toBe(AKCJA_GENERYCZNA.etykieta);
    expect(akcja.etykieta).toBe('Popraw w modelu — dobór kompensacji');
    expect(akcja.opis).not.toBe(AKCJA_GENERYCZNA.opis);
  });
});
