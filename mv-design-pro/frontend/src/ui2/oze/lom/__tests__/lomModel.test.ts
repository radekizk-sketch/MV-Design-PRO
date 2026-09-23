/*
 * Testy jednostkowe modelu i formaterów okna „Praca wyspowa" (P46): mapowanie pola
 * na wiersz wzorca (status + tag ostrzegawczy z backendu), sekcja założeń, oraz
 * formatery PL (nastawa z jednostką, okno normatywne string/SPZ/kreska). Czyste
 * funkcje — bez API, bez losowości.
 */

import { describe, it, expect } from 'vitest';

import {
  KLUCZ_WIERSZA_LOM,
  mapujWierszLom,
  naWierszeLom,
  naZalozeniaLom,
} from '../lomModel';
import { fmtNastawaLom, fmtWymaganieLom, fmtZapasLom, istotnoscLom, statusLomPL } from '../strings';
import { widokOchronyLomFixture } from './fixtures';

describe('mapujWierszLom / naWierszeLom', () => {
  it('mapuje pole na wiersz z nazwą, szyną, liczbą modułów i statusem PL', () => {
    const pole = widokOchronyLomFixture().fields[1]; // Pole BESS B (WARN)
    const wiersz = mapujWierszLom(pole);
    expect(wiersz.pole.wartosc).toBe('Pole BESS B');
    expect(wiersz.szyna.wartosc).toBe('bus-oze-2');
    expect(wiersz.moduly.wartosc).toBe(1);
    expect(wiersz.status.wartosc).toBe('Ostrzeżenie');
    expect(wiersz.status.ostrzezenie).toBe(true);
    expect(wiersz[KLUCZ_WIERSZA_LOM].wartosc).toBe('bay-bess-b');
  });

  it('status OK/INFO nie ustawia tagu ostrzegawczego', () => {
    const poleInfo = widokOchronyLomFixture().fields[2]; // Pole FW C (INFO)
    expect(mapujWierszLom(poleInfo).status.ostrzezenie).toBe(false);
  });

  it('mapuje wszystkie pola zachowując kolejność źródłową', () => {
    const wiersze = naWierszeLom(widokOchronyLomFixture().fields);
    expect(wiersze.map((w) => w.pole.wartosc)).toEqual(['Pole PV A', 'Pole BESS B', 'Pole FW C']);
  });
});

describe('naZalozeniaLom', () => {
  it('buduje wiersz założenia per pozycja listy backendu', () => {
    const zal = naZalozeniaLom(['Założenie A', 'Założenie B']);
    expect(zal).toHaveLength(2);
    expect(zal[0]).toEqual({ etykieta: '1', wartosc: 'Założenie A' });
  });
});

describe('formatery PL', () => {
  it('statusLomPL i istotnoscLom mapują kody na etykiety i kolory', () => {
    expect(statusLomPL('ERROR')).toBe('Błąd');
    expect(istotnoscLom('ERROR')).toBe('err');
    expect(istotnoscLom('INFO')).toBe('neutral');
    expect(istotnoscLom('OK')).toBe('ok');
  });

  it('fmtNastawaLom formatuje z jednostką i przecinkiem PL, null → kreska', () => {
    expect(fmtNastawaLom(1.0, 'Hz/s')).toBe('1,000 Hz/s');
    expect(fmtNastawaLom(null, 'Hz/s')).toBe('—');
  });

  it('fmtWymaganieLom: krawędź okna z backendu (≥ / ≤ / < SPZ), brak krawędzi → kreska', () => {
    // INTENCJA dawnego testu fmtOknoLom (okno jako tekst albo kreska) zachowana na
    // kształcie OcenaNastawyLom (karta AB-1a D7): krawędź przychodzi liczbą z backendu.
    const pola = widokOchronyLomFixture().fields;
    const rocof = pola[1].checks[0];
    const u81 = pola[2].checks[0];
    const spz = pola[1].checks[1];
    expect(fmtWymaganieLom(rocof)).toBe('≥ 2,000 Hz/s');
    expect(fmtWymaganieLom(u81)).toBe('≤ 47,500 Hz');
    expect(fmtWymaganieLom(spz)).toBe('—');
    expect(fmtWymaganieLom({ ...spz, odniesienie_gorne: 0.3 })).toBe('< 0,300 s');
    expect(fmtWymaganieLom(pola[0].checks[0])).toBe('—');
  });

  it('fmtZapasLom: znak i jednostka zapasu, brak zapasu → kreska', () => {
    const pola = widokOchronyLomFixture().fields;
    expect(fmtZapasLom(pola[1].checks[0])).toBe('−1,000 Hz/s');
    expect(fmtZapasLom(pola[2].checks[0])).toBe('0,000 Hz');
    expect(fmtZapasLom({ ...pola[2].checks[0], margines: 0.25 })).toBe('+0,250 Hz');
    expect(fmtZapasLom(pola[1].checks[1])).toBe('—');
  });
});
