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
  klasyfikacjaFrtDowodowa,
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
  it('„sekwencja w obwiedni" ze zdolności NIEPRZYDATNEJ DOWODOWO → ostrzeżenie, nie sukces', () => {
    // To jest stan FAKTYCZNY produktu: `frt_hvrt.trajectory` jest w rejestrze
    // proweniencji modelem bez ustalonej poprawności fizycznej. Poprzednia
    // wersja tego testu asertowała zielone `ok` — czyli pinowała defekt.
    const w = werdyktSekwencji(widokSekwencjiZaliczonaFixture());
    expect(w.istotnosc).toBe('warn');
    expect(w.tekst).toContain('sekwencja w obwiedni');
    expect(w.tekst).toContain('NIE stanowi dowodu');
  });

  it('„sekwencja w obwiedni" ze zdolności PRZYDATNEJ DOWODOWO → istotność ok, tekst dosłownie', () => {
    const w = werdyktSekwencji({
      ...widokSekwencjiZaliczonaFixture(),
      evidence: klasyfikacjaFrtDowodowa(),
    });
    expect(w.istotnosc).toBe('ok');
    expect(w.tekst).toBe('sekwencja w obwiedni');
  });

  it('brak pola evidence (starsza odpowiedź) → ostrzeżenie, nigdy cichy sukces', () => {
    const { evidence: _pominiete, ...bezDowodu } = widokSekwencjiZaliczonaFixture();
    const w = werdyktSekwencji(bezDowodu);
    expect(w.istotnosc).toBe('warn');
  });

  it('werdykt NEGATYWNY nie jest zmiękczany przez ostrzeżenie dowodowe', () => {
    const w = werdyktSekwencji(widokSekwencjiNiezaliczonaFixture());
    expect(w.istotnosc).toBe('err');
    expect(w.tekst).not.toContain('NIE stanowi dowodu');
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
