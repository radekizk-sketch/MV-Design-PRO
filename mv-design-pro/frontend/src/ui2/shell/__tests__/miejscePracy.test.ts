/*
 * Mechanizm „nawigacja użytkownika wygrywa z automatyczną" (karta S9-3, W-3).
 *
 * Testy pokrywają ILOCZYN CECH, w którym defekt mógłby się schować, a nie sam
 * przykład z karty:
 *   {przestrzeń bez zmian, przestrzeń zmieniona} × {trasa bez zmian, trasa
 *   zmieniona} × {parametry zapytania bez zmian, parametry zmienione}.
 * Parametry (`?run=`, `?case=`, `?sel=`) zmienia SAM orkiestrator w trakcie
 * biegu — gdyby wchodziły do porównania, automatyczne przejście do wyników
 * przestałoby działać w ogóle (regresja lądowiska V12K-273 zamiast naprawy).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  biezaceMiejscePracy,
  nawigujAutomatycznie,
  toSamoMiejscePracy,
} from '../miejscePracy';
import type { SpaceId } from '../spaces';
import { useShellStore } from '../useShellStore';

function ustawMiejsce(przestrzen: SpaceId, hash: string): void {
  useShellStore.setState({ activeSpace: przestrzen });
  window.location.hash = hash;
}

describe('miejscePracy — jedno źródło prawdy o miejscu pracy projektanta', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    window.location.hash = '';
    useShellStore.setState({ activeSpace: 'schemat' });
  });

  afterEach(() => {
    window.location.hash = '';
  });

  it('odczytuje parę (przestrzeń, trasa) i pomija parametry zapytania', () => {
    ustawMiejsce('wyniki', '#analysis?run=abc&case=def');
    expect(biezaceMiejscePracy()).toEqual({ przestrzen: 'wyniki', trasa: '#analysis' });
  });

  it('to samo miejsce: identyczna przestrzeń i trasa', () => {
    expect(
      toSamoMiejscePracy(
        { przestrzen: 'schemat', trasa: '#sld' },
        { przestrzen: 'schemat', trasa: '#sld' },
      ),
    ).toBe(true);
  });

  it('inne miejsce: sama zmiana przestrzeni wystarcza', () => {
    expect(
      toSamoMiejscePracy(
        { przestrzen: 'schemat', trasa: '#sld' },
        { przestrzen: 'wyniki', trasa: '#sld' },
      ),
    ).toBe(false);
  });

  it('inne miejsce: sama zmiana trasy wystarcza', () => {
    expect(
      toSamoMiejscePracy(
        { przestrzen: 'schemat', trasa: '#sld' },
        { przestrzen: 'schemat', trasa: '#analysis' },
      ),
    ).toBe(false);
  });

  describe('nawigujAutomatycznie', () => {
    it('miejsce pracy bez zmian ⇒ nawigacja wykonana', () => {
      ustawMiejsce('schemat', '#sld');
      const znacznik = biezaceMiejscePracy();
      const nawigacja = vi.fn();

      expect(nawigujAutomatycznie(znacznik, nawigacja)).toBe(true);
      expect(nawigacja).toHaveBeenCalledTimes(1);
    });

    it('zmiana SAMYCH parametrów zapytania nie blokuje (orkiestrator dopisuje ?run=)', () => {
      ustawMiejsce('schemat', '#sld');
      const znacznik = biezaceMiejscePracy();
      window.location.hash = '#sld?run=abc';
      const nawigacja = vi.fn();

      expect(nawigujAutomatycznie(znacznik, nawigacja)).toBe(true);
      expect(nawigacja).toHaveBeenCalledTimes(1);
    });

    it('użytkownik zmienił przestrzeń ⇒ nawigacja odpada', () => {
      ustawMiejsce('obliczenia', '#case-config');
      const znacznik = biezaceMiejscePracy();
      useShellStore.setState({ activeSpace: 'schemat' });
      const nawigacja = vi.fn();

      expect(nawigujAutomatycznie(znacznik, nawigacja)).toBe(false);
      expect(nawigacja).not.toHaveBeenCalled();
    });

    it('użytkownik zmienił trasę ⇒ nawigacja odpada', () => {
      ustawMiejsce('schemat', '#sld');
      const znacznik = biezaceMiejscePracy();
      window.location.hash = '#analysis';
      const nawigacja = vi.fn();

      expect(nawigujAutomatycznie(znacznik, nawigacja)).toBe(false);
      expect(nawigacja).not.toHaveBeenCalled();
    });

    it('użytkownik zmienił OBIE cechy ⇒ nawigacja odpada', () => {
      ustawMiejsce('schemat', '#sld');
      const znacznik = biezaceMiejscePracy();
      ustawMiejsce('wyniki', '#analysis');
      const nawigacja = vi.fn();

      expect(nawigujAutomatycznie(znacznik, nawigacja)).toBe(false);
      expect(nawigacja).not.toHaveBeenCalled();
    });

    it('ten sam znacznik wykonuje skok NAJWYŻEJ RAZ (skok sam zmienia miejsce pracy)', () => {
      ustawMiejsce('schemat', '#sld');
      const znacznik = biezaceMiejscePracy();
      const nawigacja = vi.fn(() => {
        window.location.hash = '#analysis';
      });

      expect(nawigujAutomatycznie(znacznik, nawigacja)).toBe(true);
      expect(nawigujAutomatycznie(znacznik, nawigacja)).toBe(false);
      expect(nawigacja).toHaveBeenCalledTimes(1);
    });
  });
});
