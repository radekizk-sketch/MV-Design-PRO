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
import type { NazwaObiektu } from '../../wzorzec';
import { widokZgodnosciFixture } from './fixtures';

/** Most nazw modelu (karta #145) — nazwa jawnie różna od referencji. */
const NAZWA: NazwaObiektu = (ref) => `Element ${ref.toLowerCase()}`;

function wiersz(over: Partial<WierszEdytora> = {}): WierszEdytora {
  return { element_ref: 'BUS-1', wielkosc: 'U', wartosc: '15,3', zacisk: null, ...over };
}

describe('zbudujZadanie — serializacja wierszy', () => {
  it('wiersze → lista pomiary z jednostką z wielkości i wartością po przecinku PL', () => {
    const wynik = zbudujZadanie({
      runId: 'run-lf-1',
      tryb: 'wiersze',
      csv: '',
      wiersze: [wiersz({ element_ref: 'BUS-1', wielkosc: 'U', wartosc: '15,3', zacisk: null })],
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
        wiersz({ element_ref: 'BUS-1', wielkosc: 'U', wartosc: '15,3', zacisk: null }),
        { element_ref: '', wielkosc: 'P', wartosc: '', zacisk: null }, // pusty — pomijany
        { element_ref: 'LINE-2', wielkosc: 'P', wartosc: '', zacisk: null }, // błąd: brak wartości
      ],
      tolNapiecie: '5',
      tolMoc: '10',
    });
    expect(wynik.ok).toBe(false);
    if (wynik.ok) return;
    expect(wynik.bledy.some((b) => b.includes('Wiersz 3'))).toBe(true);
  });

  /**
   * Decyzja O-51: zacisk wysyłany WYŁĄCZNIE dla mocy gałęzi i tylko gdy wskazany.
   * Iloczyn: wielkość {U, P, Q} × zacisk {null, od, do}.
   */
  it.each([
    ['U', null, undefined],
    ['U', 'od', undefined],
    ['P', null, undefined],
    ['P', 'od', 'od'],
    ['Q', 'do', 'do'],
    ['Q', null, undefined],
  ] as const)('%s z zaciskiem %s → pole zacisk w żądaniu: %s', (wielkosc, zacisk, oczekiwany) => {
    const wynik = zbudujZadanie({
      runId: 'run-lf-1',
      tryb: 'wiersze',
      csv: '',
      wiersze: [wiersz({ element_ref: 'LINE-2', wielkosc, wartosc: '1', zacisk })],
      tolNapiecie: '5',
      tolMoc: '5',
    });
    expect(wynik.ok).toBe(true);
    if (!wynik.ok) return;
    const pomiar = wynik.zadanie.pomiary?.[0];
    expect(pomiar?.zacisk).toBe(oczekiwany);
    expect('zacisk' in (pomiar ?? {})).toBe(oczekiwany !== undefined);
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
      wiersze: [{ element_ref: 'LINE-2', wielkosc: 'P', wartosc: '4,5', zacisk: null }],
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
      wiersze: [{ element_ref: 'LINE-2', wielkosc: 'P', wartosc: '4,5', zacisk: null }],
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
      wiersze: [{ element_ref: '', wielkosc: 'U', wartosc: '', zacisk: null }],
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
    const poza = mapujWierszZgodnosci(dane.wiersze[1], NAZWA); // LINE-2 / P / poza tolerancją
    expect(poza.odchylka.ostrzezenie).toBe(true);
    expect(poza.element.wartosc).toBe('Element line-2');
    expect(poza[KLUCZ_WIERSZA_ZGODNOSCI].wartosc).toBe('LINE-2::P::od');
    // Miejsce pomiaru — etykieta z nazwą szyny wprost z backendu.
    expect(poza.miejsce.wartosc).toBe('Zacisk początkowy — szyna GPZ SN');

    const brak = mapujWierszZgodnosci(dane.wiersze[2], NAZWA); // NIEZNANY-3 — brak modelu
    expect(brak.model.wartosc).toBe(ODBIOR_STRINGS.kreska);
    expect(brak.odchylka.wartosc).toBe(ODBIOR_STRINGS.kreska);
  });

  it('K3/C1: wartość Z MODELU niesie dowodRef = element_ref; pomiar/tolerancja (wejścia) i odchyłki (ślad na miejscu) bez ref', () => {
    const dane = widokZgodnosciFixture();
    const w = mapujWierszZgodnosci(dane.wiersze[0], NAZWA); // BUS-1 / U — model z przebiegu rozpływu
    expect(w.model.dowodRef).toBe('BUS-1');
    expect(w.pomiar.dowodRef).toBeUndefined();
    expect(w.tolerancja.dowodRef).toBeUndefined();
    expect(w.odchylka.dowodRef).toBeUndefined();
    expect(w.odchylkaPct.dowodRef).toBeUndefined();

    // Brak wartości z modelu (null) → komórka „—" bez dowodu (nie ma liczby, nie ma wywodu).
    const brak = mapujWierszZgodnosci(dane.wiersze[2], NAZWA); // NIEZNANY-3
    expect(brak.model.dowodRef).toBeUndefined();
  });

  it('naWierszeZgodnosci zachowuje kolejność źródłową backendu', () => {
    const dane = widokZgodnosciFixture();
    const wiersze = naWierszeZgodnosci(dane.wiersze, NAZWA);
    expect(wiersze.map((w) => w.element.wartosc)).toEqual([
      'Element bus-1',
      'Element line-2',
      'Element nieznany-3',
      'Element trafo-4',
      'Element trafo-4',
    ]);
  });

  it('klucz wiersza rozróżnia pomiary mocy tej samej gałęzi na obu zaciskach', () => {
    const dane = widokZgodnosciFixture();
    const bazowy = dane.wiersze[1];
    const klucze = naWierszeZgodnosci(
      [
        bazowy,
        { ...bazowy, zacisk: 'do', miejsce_pomiaru_pl: 'Zacisk końcowy — szyna Stacja 1' },
        { ...bazowy, zacisk: null, miejsce_pomiaru_pl: null, werdykt: 'brak miejsca pomiaru' },
      ],
      NAZWA,
    ).map((w) => w[KLUCZ_WIERSZA_ZGODNOSCI].wartosc);
    expect(new Set(klucze).size).toBe(3);
  });

  it('naZalozeniaZgodnosci mapuje wszystkie założenia z backendu', () => {
    const dane = widokZgodnosciFixture();
    const zalozenia = naZalozeniaZgodnosci(dane);
    expect(zalozenia).toHaveLength(dane.zalozenia_pl.length);
    expect(zalozenia[2].wartosc).toContain('na zacisku gałęzi');
    expect(zalozenia[3].wartosc).toContain('wartości bezwzględnej');
  });

  it('istotnoscWerdyktu odwzorowuje kolory tokenów per werdykt', () => {
    expect(istotnoscWerdyktu('w tolerancji')).toBe('ok');
    expect(istotnoscWerdyktu('poza tolerancją')).toBe('err');
    expect(istotnoscWerdyktu('brak wyniku dla elementu')).toBe('warn');
    expect(istotnoscWerdyktu('brak odpowiednika w modelu')).toBe('neutral');
    expect(istotnoscWerdyktu('brak miejsca pomiaru')).toBe('warn');
  });

  it('formatery i parser z przecinkiem dziesiętnym PL', () => {
    expect(fmtWartosc(15.15)).toBe('15,150');
    expect(fmtProcent(12.5)).toBe('12,50');
    expect(parsujLiczbaPL('2,5')).toBe(2.5);
    expect(parsujLiczbaPL('')).toBe('pusto');
    expect(parsujLiczbaPL('abc')).toBe('blad');
  });

  it('wierszPusty rozpoznaje całkowicie pusty wiersz edytora', () => {
    expect(wierszPusty({ element_ref: '', wielkosc: 'U', wartosc: '', zacisk: null })).toBe(true);
    expect(wierszPusty({ element_ref: 'BUS-1', wielkosc: 'U', wartosc: '', zacisk: null })).toBe(false);
  });
});
