/*
 * Testy modelu okna „Zgodność powykonawcza" (karta U4 P45): serializacja żądania
 * (wiersze → JSON `pomiary`, CSV → tekst surowy), walidacja tolerancji przed
 * wysłaniem (komunikaty PL), adaptery tabeli (werdykty/„—" z backendu) oraz
 * formatery z przecinkiem dziesiętnym PL.
 */

import { describe, it, expect } from 'vitest';

import {
  fmtProcent,
  fmtWartosc,
  parsujLiczbaPL,
  ODBIOR_STRINGS,
  istotnoscWerdyktu,
} from '../strings';
import {
  KLUCZ_WIERSZA_ZGODNOSCI,
  mapujWierszZgodnosci,
  naWierszeZgodnosci,
  naZalozeniaZgodnosci,
  wierszPusty,
  zbudujZadanie,
  type WierszEdytora,
} from '../odbiorModel';
import { widokZgodnosciFixture } from './fixtures';

function wiersz(over: Partial<WierszEdytora> = {}): WierszEdytora {
  return { element_ref: 'BUS-1', wielkosc: 'U', wartosc: '15,3', ...over };
}

describe('zbudujZadanie — serializacja wierszy', () => {
  it('wiersze → lista pomiary z jednostką z wielkości i wartością po przecinku PL', () => {
    const wynik = zbudujZadanie({
      runId: 'run-lf-1',
      tryb: 'wiersze',
      csv: '',
      wiersze: [wiersz({ element_ref: 'BUS-1', wielkosc: 'U', wartosc: '15,3' })],
      tolNapiecie: '5',
      tolMoc: '',
    });
    expect(wynik.ok).toBe(true);
    if (!wynik.ok) return;
    expect(wynik.zadanie.run_id).toBe('run-lf-1');
    expect(wynik.zadanie.csv).toBeUndefined();
    expect(wynik.zadanie.pomiary).toEqual([
      { element_ref: 'BUS-1', wielkosc: 'U', wartosc: 15.3, jednostka: 'kV' },
    ]);
    expect(wynik.zadanie.tolerancje).toEqual({ napiecie_pct: 5 });
  });

  it('pomija wiersze puste, ale zgłasza wiersz z brakującą wartością', () => {
    const wynik = zbudujZadanie({
      runId: 'run-lf-1',
      tryb: 'wiersze',
      csv: '',
      wiersze: [
        wiersz({ element_ref: 'BUS-1', wielkosc: 'U', wartosc: '15,3' }),
        { element_ref: '', wielkosc: 'P', wartosc: '' }, // pusty — pomijany
        { element_ref: 'LINE-2', wielkosc: 'P', wartosc: '' }, // błąd: brak wartości
      ],
      tolNapiecie: '5',
      tolMoc: '10',
    });
    expect(wynik.ok).toBe(false);
    if (wynik.ok) return;
    expect(wynik.bledy.some((b) => b.includes('Wiersz 3'))).toBe(true);
  });

  it('wartość nieliczbowa → błąd PL z numerem wiersza', () => {
    const wynik = zbudujZadanie({
      runId: 'run-lf-1',
      tryb: 'wiersze',
      csv: '',
      wiersze: [wiersz({ wartosc: 'abc' })],
      tolNapiecie: '5',
      tolMoc: '',
    });
    expect(wynik.ok).toBe(false);
    if (wynik.ok) return;
    expect(wynik.bledy.some((b) => b.includes('nie jest liczbą'))).toBe(true);
  });
});

describe('zbudujZadanie — tryb CSV', () => {
  it('CSV przechodzi surowy jako pole csv (bez pomiary)', () => {
    const tekst = 'element_ref;wielkosc;wartosc;jednostka\nBUS-1;U;15,3;kV';
    const wynik = zbudujZadanie({
      runId: 'run-lf-1',
      tryb: 'csv',
      csv: tekst,
      wiersze: [],
      tolNapiecie: '5',
      tolMoc: '',
    });
    expect(wynik.ok).toBe(true);
    if (!wynik.ok) return;
    expect(wynik.zadanie.csv).toBe(tekst);
    expect(wynik.zadanie.pomiary).toBeUndefined();
    expect(wynik.zadanie.tolerancje).toEqual({ napiecie_pct: 5 });
  });

  it('CSV pusty + brak tolerancji → dwa błędy PL', () => {
    const wynik = zbudujZadanie({
      runId: 'run-lf-1',
      tryb: 'csv',
      csv: '   ',
      wiersze: [],
      tolNapiecie: '',
      tolMoc: '',
    });
    expect(wynik.ok).toBe(false);
    if (wynik.ok) return;
    expect(wynik.bledy).toContain(ODBIOR_STRINGS.bladBrakCsv);
    expect(wynik.bledy).toContain(ODBIOR_STRINGS.bladBrakTolerancji);
  });
});

describe('zbudujZadanie — walidacja tolerancji', () => {
  it('mierzysz U bez tolerancji napięcia → błąd wymaganej tolerancji', () => {
    const wynik = zbudujZadanie({
      runId: 'run-lf-1',
      tryb: 'wiersze',
      csv: '',
      wiersze: [wiersz({ wielkosc: 'U', wartosc: '15,3' })],
      tolNapiecie: '',
      tolMoc: '10',
    });
    expect(wynik.ok).toBe(false);
    if (wynik.ok) return;
    expect(wynik.bledy).toContain(ODBIOR_STRINGS.bladWymaganaTolNapiecie);
  });

  it('mierzysz P bez tolerancji mocy → błąd wymaganej tolerancji', () => {
    const wynik = zbudujZadanie({
      runId: 'run-lf-1',
      tryb: 'wiersze',
      csv: '',
      wiersze: [{ element_ref: 'LINE-2', wielkosc: 'P', wartosc: '4,5' }],
      tolNapiecie: '5',
      tolMoc: '',
    });
    expect(wynik.ok).toBe(false);
    if (wynik.ok) return;
    expect(wynik.bledy).toContain(ODBIOR_STRINGS.bladWymaganaTolMoc);
  });

  it('tolerancja nieliczbowa → błąd PL', () => {
    const wynik = zbudujZadanie({
      runId: 'run-lf-1',
      tryb: 'wiersze',
      csv: '',
      wiersze: [wiersz()],
      tolNapiecie: 'x',
      tolMoc: '',
    });
    expect(wynik.ok).toBe(false);
    if (wynik.ok) return;
    expect(wynik.bledy).toContain(ODBIOR_STRINGS.bladTolNapiecieLiczba);
  });

  it('tolerancja ujemna → błąd PL', () => {
    const wynik = zbudujZadanie({
      runId: 'run-lf-1',
      tryb: 'wiersze',
      csv: '',
      wiersze: [{ element_ref: 'LINE-2', wielkosc: 'P', wartosc: '4,5' }],
      tolNapiecie: '',
      tolMoc: '-3',
    });
    expect(wynik.ok).toBe(false);
    if (wynik.ok) return;
    expect(wynik.bledy).toContain(ODBIOR_STRINGS.bladTolMocUjemna);
  });

  it('brak jakiegokolwiek pomiaru w trybie wierszy → błąd PL', () => {
    const wynik = zbudujZadanie({
      runId: 'run-lf-1',
      tryb: 'wiersze',
      csv: '',
      wiersze: [{ element_ref: '', wielkosc: 'U', wartosc: '' }],
      tolNapiecie: '5',
      tolMoc: '',
    });
    expect(wynik.ok).toBe(false);
    if (wynik.ok) return;
    expect(wynik.bledy).toContain(ODBIOR_STRINGS.bladBrakWierszy);
  });
});

describe('adaptery tabeli i formatery', () => {
  it('mapujWierszZgodnosci: null model → „—"; poza tolerancją → ostrzeżenie na odchyłce', () => {
    const dane = widokZgodnosciFixture();
    const poza = mapujWierszZgodnosci(dane.wiersze[1]); // LINE-2 / P / poza tolerancją
    expect(poza.odchylka.ostrzezenie).toBe(true);
    expect(poza.element.wartosc).toBe('LINE-2');
    expect(poza[KLUCZ_WIERSZA_ZGODNOSCI].wartosc).toBe('LINE-2::P');

    const brak = mapujWierszZgodnosci(dane.wiersze[2]); // NIEZNANY-3 — brak modelu
    expect(brak.model.wartosc).toBe(ODBIOR_STRINGS.kreska);
    expect(brak.odchylka.wartosc).toBe(ODBIOR_STRINGS.kreska);
  });

  it('naWierszeZgodnosci zachowuje kolejność źródłową backendu', () => {
    const dane = widokZgodnosciFixture();
    const wiersze = naWierszeZgodnosci(dane.wiersze);
    expect(wiersze.map((w) => w.element.wartosc)).toEqual([
      'BUS-1',
      'LINE-2',
      'NIEZNANY-3',
      'TRAFO-4',
    ]);
  });

  it('naZalozeniaZgodnosci mapuje wszystkie założenia z backendu', () => {
    const dane = widokZgodnosciFixture();
    const zalozenia = naZalozeniaZgodnosci(dane);
    expect(zalozenia).toHaveLength(dane.zalozenia_pl.length);
    expect(zalozenia[3].wartosc).toContain('V12K-040');
  });

  it('istotnoscWerdyktu odwzorowuje kolory tokenów per werdykt', () => {
    expect(istotnoscWerdyktu('w tolerancji')).toBe('ok');
    expect(istotnoscWerdyktu('poza tolerancją')).toBe('err');
    expect(istotnoscWerdyktu('brak wyniku dla elementu')).toBe('warn');
    expect(istotnoscWerdyktu('brak odpowiednika w modelu')).toBe('neutral');
  });

  it('formatery i parser z przecinkiem dziesiętnym PL', () => {
    expect(fmtWartosc(15.15)).toBe('15,150');
    expect(fmtProcent(12.5)).toBe('12,50');
    expect(parsujLiczbaPL('2,5')).toBe(2.5);
    expect(parsujLiczbaPL('')).toBe('pusto');
    expect(parsujLiczbaPL('abc')).toBe('blad');
  });

  it('wierszPusty rozpoznaje całkowicie pusty wiersz edytora', () => {
    expect(wierszPusty({ element_ref: '', wielkosc: 'U', wartosc: '' })).toBe(true);
    expect(wierszPusty({ element_ref: 'BUS-1', wielkosc: 'U', wartosc: '' })).toBe(false);
  });
});
