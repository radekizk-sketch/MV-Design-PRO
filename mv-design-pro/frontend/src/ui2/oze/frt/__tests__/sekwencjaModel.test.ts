/*
 * Testy jednostkowe modelu sekcji „Sekwencja zapadów" (P43): serializacja edytora
 * do parametru API (KROPKA dziesiętna), odznaka werdyktu sekwencji (kolor z tekstu
 * backendu) oraz adaptery tabeli zapadów. Czyste funkcje — bez API, bez losowości.
 */

import { describe, it, expect } from 'vitest';

import { serializujSekwencjeFrt } from '../../api';
import { werdyktSekwencji, wierszeTabeliSekwencji } from '../sekwencjaModel';
import {
  widokSekwencjiNiezaliczonaFixture,
  widokSekwencjiZaliczonaFixture,
} from './fixtures';

describe('serializujSekwencjeFrt — kontrakt parametru sekwencja', () => {
  it('serializuje pary głębokość:czas z KROPKĄ dziesiętną, rozdzielone przecinkiem', () => {
    expect(
      serializujSekwencjeFrt([
        { glebokoscPu: 0.05, czasS: 0.15 },
        { glebokoscPu: 0.3, czasS: 0.2 },
      ]),
    ).toBe('0.05:0.15,0.3:0.2');
  });

  it('pojedynczy zapad → jedna para bez przecinka', () => {
    expect(serializujSekwencjeFrt([{ glebokoscPu: 0.1, czasS: 0.5 }])).toBe('0.1:0.5');
  });
});

describe('werdyktSekwencji — odznaka z tekstu backendu', () => {
  it('„sekwencja w obwiedni" → istotność ok, tekst dosłownie', () => {
    const w = werdyktSekwencji(widokSekwencjiZaliczonaFixture());
    expect(w.istotnosc).toBe('ok');
    expect(w.tekst).toBe('sekwencja w obwiedni');
  });

  it('werdykt niezaliczony → istotność err, tekst dosłownie z backendu', () => {
    const w = werdyktSekwencji(widokSekwencjiNiezaliczonaFixture());
    expect(w.istotnosc).toBe('err');
    expect(w.tekst).toBe('sekwencja niezaliczona — zapad 2');
  });
});

describe('wierszeTabeliSekwencji — adapter tabeli zapadów', () => {
  it('mapuje każdy zapad na wiersz z werdyktem i tagiem utrzymania pracy', () => {
    const wiersze = wierszeTabeliSekwencji(widokSekwencjiNiezaliczonaFixture());
    expect(wiersze).toHaveLength(2);
    expect(wiersze[0].werdykt.wartosc).toBe('w obwiedni');
    // Drugi zapad: moduł wypadł → tag ostrzegawczy utrzymania pracy.
    expect(wiersze[1].utrzymanie.ostrzezenie).toBe(true);
    expect(wiersze[1].glebokosc.wartosc).toBe('0,020');
  });
});
