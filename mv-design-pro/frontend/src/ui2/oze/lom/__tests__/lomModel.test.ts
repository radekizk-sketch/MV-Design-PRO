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
import { fmtNastawaLom, fmtOknoLom, istotnoscLom } from '../strings';
import { poleWidoku, widokOchronyLomFixture } from './fixtures';

describe('mapujWierszLom / naWierszeLom', () => {
  // Intencja zachowana: wiersz niesie nazwę, szynę, liczbę modułów i status PL z backendu.
  // Zmiana kanonu (2026-09-23): status to etykieta rekordu pola, tag ostrzegawczy wynika z jej
  // semantyki (słownik „Ostrzeżenie/Informacja" modułu skasowany).
  it('mapuje pole na wiersz z nazwą, szyną, liczbą modułów i etykietą rekordu', () => {
    const pole = poleWidoku(widokOchronyLomFixture(), 'Pole BESS B');
    const wiersz = mapujWierszLom(pole);
    expect(wiersz.pole.wartosc).toBe('Pole BESS B');
    expect(wiersz.szyna.wartosc).toBe('bus-oze-2');
    expect(wiersz.moduly.wartosc).toBe(1);
    expect(wiersz.status.wartosc).toBe(pole.ocena.etykieta.etykieta_pl);
    expect(wiersz[KLUCZ_WIERSZA_LOM].wartosc).toBe('bay-bess-b');
  });

  it('znacznik „Poza zakresem" wyłącznie dla semantyki negatywnej rekordu (naruszenie)', () => {
    const widok = widokOchronyLomFixture();
    // Brak podstawy wymagania (ostrzegawcza) nie jest przekroczeniem — nazywa go etykieta.
    const bezLom = poleWidoku(widok, 'Pole PV A');
    expect(bezLom.ocena.etykieta.semantyka).toBe('ostrzegawcza');
    expect(mapujWierszLom(bezLom).status.ostrzezenie).toBe(false);
    const fw = poleWidoku(widok, 'Pole FW C'); // rekord NIE_OCENIONO — neutralna
    expect(fw.ocena.etykieta.semantyka).toBe('neutralna');
    expect(mapujWierszLom(fw).status.ostrzezenie).toBe(false);
    // Rekord naruszenia (semantyka negatywna) — ten sam adapter, etykieta z rekordu.
    const naruszenie = {
      ...fw,
      ocena: { ...fw.ocena, etykieta: { etykieta_pl: 'Wymaganie naruszone', semantyka: 'negatywna' as const } },
    };
    expect(mapujWierszLom(naruszenie).status.ostrzezenie).toBe(true);
    expect(mapujWierszLom(naruszenie).status.wartosc).toBe('Wymaganie naruszone');
  });

  it('mapuje wszystkie pola zachowując kolejność źródłową', () => {
    const widok = widokOchronyLomFixture();
    const wiersze = naWierszeLom(widok.fields);
    expect(wiersze.map((w) => w.pole.wartosc)).toEqual(widok.fields.map((p) => p.bay_name));
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
  // Intencja zachowana: kolor tagu wynika wprost z danych backendu, bez oceny w UI.
  // Zmiana kanonu (uczciwość natychmiastowa 2026-09-23): etykietę statusu niesie rekord
  // backendu (`etykieta.etykieta_pl`), a kolor wynika z jego semantyki — mapa
  // „kod statusu → etykieta" w interfejsie zniknęła (`statusLomPL`).
  it('istotnoscLom mapuje semantykę etykiety z backendu na kolor tagu', () => {
    const etykieta = (semantyka: 'pozytywna' | 'negatywna' | 'ostrzegawcza' | 'neutralna') => ({
      etykieta_pl: 'etykieta z rekordu',
      semantyka,
    });
    expect(istotnoscLom(etykieta('negatywna'))).toBe('err');
    expect(istotnoscLom(etykieta('ostrzegawcza'))).toBe('warn');
    expect(istotnoscLom(etykieta('neutralna'))).toBe('neutral');
    expect(istotnoscLom(etykieta('pozytywna'))).toBe('ok');
  });

  it('fmtNastawaLom formatuje z jednostką i przecinkiem PL, null → kreska', () => {
    expect(fmtNastawaLom(1.0, 'Hz/s')).toBe('1,000 Hz/s');
    expect(fmtNastawaLom(null, 'Hz/s')).toBe('—');
  });

  it('fmtOknoLom: string wprost, obiekt SPZ z oboma null → kreska', () => {
    expect(fmtOknoLom('df/dt ≥ 2.0 Hz/s')).toBe('df/dt ≥ 2.0 Hz/s');
    expect(fmtOknoLom(null)).toBe('—');
    expect(fmtOknoLom({ spz_fast_time_s: null, spz_slow_time_s: null })).toBe('—');
    expect(fmtOknoLom({ spz_fast_time_s: 0.3, spz_slow_time_s: null })).toContain('SPZ szybkie');
  });
});
