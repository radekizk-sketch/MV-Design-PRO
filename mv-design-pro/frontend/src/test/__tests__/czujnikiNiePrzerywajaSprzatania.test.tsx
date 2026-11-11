/**
 * Haki czujników po teście nie przerywają sprzątania Testing Library.
 *
 * Vitest 1 woła haki `afterEach` jednego zakresu w `hooks.map((hak) => hak(...))` (kolejność
 * `parallel`). Hak rzucający SYNCHRONICZNIE przerywa mapę: haki zarejestrowane po nim — w tym
 * `cleanup` Testing Library — nie są wołane, więc kolejne testy pliku widzą DOM poprzedniego
 * i kaskadowo oblewają „Found multiple elements” (pomiar 2026-10-30: 359 czerwonych testów
 * w 55 plikach, z czego większość była kaskadą jednego naruszenia czujnika na plik).
 *
 * Iloczyn cech: {czujnik surowych wzorów, czujnik ładunków operacji} × {naruszenie, czysto}.
 * Test odtwarza wywołanie haków przez `map` i sprawdza, że hak sprzątający po czujniku JEST
 * wołany, a naruszenie wraca jako odrzucona obietnica (test nadal oblewa).
 */
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { hakLadunkowPoTescie } from '../czujnikLadunkow';
import { hakSurowychWzorowPoTescie } from '../czujnikSurowychWzorow';

type Hak = () => unknown;

/** Wywołanie haków tak jak Vitest 1 (`sequence.hooks: 'parallel'`). */
function wywolajJakVitest(haki: Hak[]): Promise<unknown[]> {
  return Promise.all(haki.map((hak) => hak()));
}

const NARUSZENIA: Record<string, { hak: Hak; wywolaj: () => void; komunikat: RegExp }> = {
  'czujnik surowych wzorów': {
    hak: hakSurowychWzorowPoTescie,
    wywolaj: () => {
      render(<p>{'Prąd cieplny $I_{th}$'}</p>);
    },
    komunikat: /surowy zapis wzoru/,
  },
  'czujnik ładunków operacji': {
    hak: hakLadunkowPoTescie,
    wywolaj: () => {
      const makieta = vi.fn();
      makieta('case-1', 'delete_element', { element_ref: 'x', klucz_obcy: 1 });
    },
    komunikat: /klucz_obcy/,
  },
};

describe('haki czujników po teście — sprzątanie nie jest pomijane', () => {
  it.each(Object.keys(NARUSZENIA))('%s: naruszenie → odrzucona obietnica, sprzątanie wołane', async (nazwa) => {
    const { hak, wywolaj, komunikat } = NARUSZENIA[nazwa];
    wywolaj();
    const sprzatanie = vi.fn();
    const wynik = wywolajJakVitest([hak, sprzatanie]);
    expect(sprzatanie).toHaveBeenCalledTimes(1);
    await expect(wynik).rejects.toThrow(komunikat);
  });

  it.each(Object.keys(NARUSZENIA))('%s: bez naruszenia → obietnica spełniona, sprzątanie wołane', async (nazwa) => {
    const { hak } = NARUSZENIA[nazwa];
    const sprzatanie = vi.fn();
    const wynik = wywolajJakVitest([hak, sprzatanie]);
    expect(sprzatanie).toHaveBeenCalledTimes(1);
    await expect(wynik).resolves.toHaveLength(2);
  });
});
