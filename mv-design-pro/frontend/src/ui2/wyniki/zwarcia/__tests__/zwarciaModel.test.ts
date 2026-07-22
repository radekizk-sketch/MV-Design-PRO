import { describe, it, expect } from 'vitest';
import {
  KLUCZ_PUNKT,
  KOLUMNY_ZWARC,
  KONFIG_WYKRESU_ZWARC,
  WIELKOSCI_WYKRESU,
  filtrujWierszeWkladow,
  mapujWierszZwarcia,
  naPozycjeSzczegoluWkladu,
  naSlupkiIkss,
  naSlupkiUdzialow,
  naSlupkiWielkosci,
  naWierszeWkladow,
  naWierszeZwarc,
  naZalozeniaZwarc,
} from '../zwarciaModel';
import {
  ZWARCIA_STRINGS,
  fmtCzas,
  fmtKA,
  fmtMVA,
  fmtWspolczynnik,
  rodzajZwarciaPL,
  typMaszynyPL,
  uwagiZwarciaPL,
} from '../strings';
import {
  shortCircuitResultsFixture,
  shortCircuitRowFixture,
  wkladyFixture,
  wkladyZeSzczegolemFixture,
} from './fixtures';

describe('mapujWierszZwarcia — projekcja ShortCircuitRow → wiersz wzorca (fixture 1:1)', () => {
  it('mapuje komplet wielkości z formatem PL (przecinek) i dowodRef = element_id', () => {
    const w = mapujWierszZwarcia(shortCircuitRowFixture());
    expect(w.punkt).toEqual({ wartosc: 'Szyna GPZ 15 kV' });
    expect(w.rodzaj).toEqual({ wartosc: 'zwarcie trójfazowe' });
    expect(w.ikss).toEqual({ wartosc: '12,345', sortKey: 12.345, dowodRef: 'EL-GPZ' });
    expect(w.ip).toEqual({ wartosc: '31,200', sortKey: 31.2, dowodRef: 'EL-GPZ' });
    expect(w.ith).toEqual({ wartosc: '12,500', sortKey: 12.5, dowodRef: 'EL-GPZ' });
    expect(w.sk).toEqual({ wartosc: '320,8', sortKey: 320.75, dowodRef: 'EL-GPZ' });
    expect(w.uwagi).toEqual({ wartosc: ZWARCIA_STRINGS.kreska });
    expect(w[KLUCZ_PUNKT]).toEqual({ wartosc: 'BUS-GPZ' });
  });

  it('wartości null → „—" bez dowodu, z najmniejszym kluczem sortowania', () => {
    const w = mapujWierszZwarcia(
      shortCircuitRowFixture({ ikss_ka: null, ip_ka: null, ith_ka: null, sk_mva: null }),
    );
    for (const klucz of ['ikss', 'ip', 'ith', 'sk'] as const) {
      expect(w[klucz]).toEqual({
        wartosc: ZWARCIA_STRINGS.kreska,
        sortKey: Number.NEGATIVE_INFINITY,
      });
      expect(w[klucz].dowodRef).toBeUndefined();
    }
  });

  it('target_name null → „—"; brak element_id → dowodRef = target_id', () => {
    const w = mapujWierszZwarcia(
      shortCircuitRowFixture({ target_name: null, element_id: undefined, ikss_ka: 5 }),
    );
    expect(w.punkt).toEqual({ wartosc: ZWARCIA_STRINGS.kreska });
    expect(w.ikss.dowodRef).toBe('BUS-GPZ');
  });

  it('flags niepuste → tagi PL (znane tłumaczone, nieznane dosłownie)', () => {
    const w = mapujWierszZwarcia(shortCircuitRowFixture({ flags: ['SLACK', 'NIEZNANA_FLAGA'] }));
    expect(w.uwagi.wartosc).toBe('Węzeł bilansujący, NIEZNANA_FLAGA');
  });

  it('jest deterministyczne: to samo wejście → identyczne wyjście', () => {
    const row = shortCircuitRowFixture();
    expect(mapujWierszZwarcia(row)).toEqual(mapujWierszZwarcia(row));
  });
});

describe('naWierszeZwarc — zachowanie kolejności i kompletność', () => {
  it('wiersz per punkt zwarcia, kolejność źródłowa zachowana', () => {
    const wiersze = naWierszeZwarc(shortCircuitResultsFixture().rows);
    expect(wiersze.map((w) => w[KLUCZ_PUNKT].wartosc)).toEqual(['BUS-GPZ', 'BUS-ST1', 'BUS-ST2']);
  });
});

describe('rodzajZwarciaPL — słownik rodzajów zwarcia', () => {
  it('mapuje tokeny backendu 3F/2F/2F+Z/1F na polskie nazwy', () => {
    expect(rodzajZwarciaPL('3F')).toBe('zwarcie trójfazowe');
    expect(rodzajZwarciaPL('2F')).toBe('zwarcie dwufazowe');
    expect(rodzajZwarciaPL('2F+Z')).toBe('zwarcie dwufazowe z ziemią');
    expect(rodzajZwarciaPL('1F')).toBe('zwarcie jednofazowe (doziemne)');
  });

  it('akceptuje warianty SC_3F/sc_3f (normalizacja)', () => {
    expect(rodzajZwarciaPL('SC_3F')).toBe('zwarcie trójfazowe');
    expect(rodzajZwarciaPL('sc_1f')).toBe('zwarcie jednofazowe (doziemne)');
  });

  it('null → „—"; token nieznany → etykieta zastępcza', () => {
    expect(rodzajZwarciaPL(null)).toBe(ZWARCIA_STRINGS.kreska);
    expect(rodzajZwarciaPL('XYZ')).toBe(ZWARCIA_STRINGS.rodzajNieznany);
  });
});

describe('uwagiZwarciaPL — flagi na tekst uwag', () => {
  it('pusta lista → „—"', () => {
    expect(uwagiZwarciaPL([])).toBe(ZWARCIA_STRINGS.kreska);
  });
  it('łączy przetłumaczone etykiety przecinkiem', () => {
    expect(uwagiZwarciaPL(['SYNTHETIC'])).toBe('Węzeł syntetyczny');
  });
});

describe('naZalozeniaZwarc — założenia (metoda IEC 60909, c, czas cieplny)', () => {
  it('metoda jest stałą normatywną; c i czas z propsów gdy podane', () => {
    const zalozenia = naZalozeniaZwarc(1.1, 1.0);
    expect(zalozenia[0]).toEqual({
      etykieta: ZWARCIA_STRINGS.zalMetoda,
      wartosc: 'IEC 60909',
    });
    expect(zalozenia[1]).toMatchObject({
      etykieta: ZWARCIA_STRINGS.zalWspolczynnikC,
      wartosc: fmtWspolczynnik(1.1),
    });
    expect(zalozenia[2]).toMatchObject({
      etykieta: ZWARCIA_STRINGS.zalCzasCieplny,
      wartosc: fmtCzas(1.0),
      jednostka: ZWARCIA_STRINGS.jednS,
    });
  });

  it('brak c/czasu → „—" z uwagą o pochodzeniu (NIE zgaduj)', () => {
    const zalozenia = naZalozeniaZwarc();
    expect(zalozenia[1].wartosc).toBe(ZWARCIA_STRINGS.kreska);
    expect(zalozenia[1].uwaga).toBe(ZWARCIA_STRINGS.zalWartoscZKonfiguracji);
    expect(zalozenia[2].wartosc).toBe(ZWARCIA_STRINGS.kreska);
    expect(zalozenia[2].jednostka).toBeUndefined();
  });
});

describe('naSlupkiIkss — punkty wykresu Ik" (zero losowości)', () => {
  it('pomija wiersze z pustym Ik", zachowuje kolejność źródłową', () => {
    const slupki = naSlupkiIkss(shortCircuitResultsFixture().rows);
    expect(slupki).toEqual([
      { punkt: 'Szyna GPZ 15 kV', ikss: 12.345 },
      { punkt: 'Szyna ST1 15 kV', ikss: 8.4 },
    ]);
  });
});

describe('naSlupkiWielkosci — przełącznik wielkości wykresu (karta W-A F2)', () => {
  it('wybiera pole wiersza wg wielkości i pomija wiersze bez wartości', () => {
    const rows = shortCircuitResultsFixture().rows;
    expect(naSlupkiWielkosci(rows, 'sk')).toEqual([
      { punkt: 'Szyna GPZ 15 kV', ikss: 320.75 },
      { punkt: 'Szyna ST1 15 kV', ikss: 218.1 },
    ]);
    expect(naSlupkiWielkosci(rows, 'ip')).toEqual([
      { punkt: 'Szyna GPZ 15 kV', ikss: 31.2 },
      { punkt: 'Szyna ST1 15 kV', ikss: 21.0 },
    ]);
  });

  it("wielkość 'ikss' daje wynik identyczny z naSlupkiIkss (kontrakt 1:1)", () => {
    const rows = shortCircuitResultsFixture().rows;
    expect(naSlupkiWielkosci(rows, 'ikss')).toEqual(naSlupkiIkss(rows));
  });

  it('starszy wynik bez pola addytywnego (I²t) → pusta lista (uczciwy stan)', () => {
    const rows = [
      shortCircuitRowFixture({ i2t_ka2s: null }),
      shortCircuitRowFixture({ target_id: 'BUS-X', i2t_ka2s: undefined }),
    ];
    expect(naSlupkiWielkosci(rows, 'i2t')).toEqual([]);
  });
});

describe('KONFIG_WYKRESU_ZWARC — deklaratywna konfiguracja wielkości', () => {
  it('każda wielkość ma przycisk, tytuł, nazwę, jednostkę i format', () => {
    expect(WIELKOSCI_WYKRESU).toEqual(['ikss', 'ip', 'ith', 'sk', 'i2t']);
    for (const wielkosc of WIELKOSCI_WYKRESU) {
      const konfig = KONFIG_WYKRESU_ZWARC[wielkosc];
      expect(konfig.przycisk).toBeTruthy();
      expect(konfig.tytul).toBeTruthy();
      expect(konfig.nazwaWielkosci).toBeTruthy();
      expect(konfig.jednostka).toBeTruthy();
      expect(typeof konfig.format(1.5)).toBe('string');
    }
    // Domyślna wielkość zachowuje dzisiejszy podpis wykresu (kontrakt 1:1).
    expect(KONFIG_WYKRESU_ZWARC.ikss.tytul).toBe(ZWARCIA_STRINGS.wykresTytul);
  });
});

describe('filtrujWierszeWkladow — filtr tekstowy po źródle (karta W-A F2)', () => {
  const wiersze = naWierszeWkladow(wkladyFixture());

  it('filtruje po nazwie źródła bez rozróżniania wielkości liter', () => {
    const wynik = filtrujWierszeWkladow(wiersze, 'falownik');
    expect(wynik).toHaveLength(1);
    expect(wynik[0].zrodlo.wartosc).toBe('Falownik PV');
  });

  it('fraza pusta / białe znaki → wejście 1:1; brak trafień → pusta lista', () => {
    expect(filtrujWierszeWkladow(wiersze, '')).toEqual(wiersze);
    expect(filtrujWierszeWkladow(wiersze, '   ')).toEqual(wiersze);
    expect(filtrujWierszeWkladow(wiersze, 'nie-ma-takiego')).toEqual([]);
  });

  it('udział [%] liczony PRZED filtrem — filtrowanie nie zmienia udziałów', () => {
    const wynik = filtrujWierszeWkladow(wiersze, 'falownik');
    expect(wynik[0].udzial.wartosc).toBe('25,0'); // 3/12 z pełnego zbioru, nie 100
  });
});

describe('naSlupkiUdzialow — udziały procentowe wkładów (karta W-A F2)', () => {
  it('ta sama arytmetyka prezentacji co kolumna Udział (suma = 100)', () => {
    const slupki = naSlupkiUdzialow(wkladyFixture());
    expect(slupki).toEqual([
      { zrodlo: 'Sieć zasilająca 110 kV', udzial: 75 },
      { zrodlo: 'Falownik PV', udzial: 25 },
    ]);
  });

  it('suma zerowa → pusta lista (bez dzielenia przez zero)', () => {
    expect(naSlupkiUdzialow([{ id: 'S', zrodlo: 'Źródło', pradKA: 0 }])).toEqual([]);
  });
});

describe('naPozycjeSzczegoluWkladu — szczegół maszynowy wkładu (karta W-A F2)', () => {
  it('mapuje typ PL, Ir, Ik"/Ir, μ, q, Ib z formatami PL', () => {
    const szczegol = wkladyZeSzczegolemFixture()[0].szczegol!;
    const pozycje = naPozycjeSzczegoluWkladu(szczegol);
    expect(pozycje).toEqual([
      { etykieta: ZWARCIA_STRINGS.wkladTypMaszyny, wartosc: 'maszyna synchroniczna', jednostka: null },
      { etykieta: ZWARCIA_STRINGS.wkladIr, wartosc: '0,412', jednostka: ZWARCIA_STRINGS.jednKA },
      { etykieta: ZWARCIA_STRINGS.wkladIkIr, wartosc: '2,995', jednostka: null },
      { etykieta: ZWARCIA_STRINGS.wkladMu, wartosc: '0,813', jednostka: null },
      { etykieta: ZWARCIA_STRINGS.wkladQ, wartosc: '1,000', jednostka: null },
      { etykieta: ZWARCIA_STRINGS.wkladIb, wartosc: '1,003', jednostka: ZWARCIA_STRINGS.jednKA },
    ]);
  });

  it('wartości null → uczciwa kreska (zero fabrykacji)', () => {
    const pozycje = naPozycjeSzczegoluWkladu({
      typMaszyny: 'DFIG',
      irKA: null,
      stosunekIkIr: null,
      mu: null,
      q: null,
      ibKA: null,
      wywod: [],
    });
    for (const p of pozycje.slice(1)) {
      expect(p.wartosc).toBe(ZWARCIA_STRINGS.kreska);
    }
  });
});

describe('typMaszynyPL — słownik typów maszyn', () => {
  it('mapuje tokeny backendu; nieznany token pokazywany dosłownie (dane)', () => {
    expect(typMaszynyPL('SYNCHRONOUS')).toBe('maszyna synchroniczna');
    expect(typMaszynyPL('ASYNCHRONOUS')).toBe('maszyna asynchroniczna');
    expect(typMaszynyPL('DFIG')).toBe('generator asynchroniczny dwustronnie zasilany (DFIG)');
    expect(typMaszynyPL('NOWY_TYP')).toBe('NOWY_TYP');
  });
});

describe('naWierszeWkladow — udział [%] liczony prezentacyjnie', () => {
  it('udział = prąd / suma prądów × 100 (arytmetyka prezentacji)', () => {
    const wiersze = naWierszeWkladow(wkladyFixture());
    expect(wiersze[0].prad).toMatchObject({ wartosc: fmtKA(9.0), dowodRef: 'SRC-GRID' });
    expect(wiersze[0].udzial.wartosc).toBe('75,0'); // 9 / 12 * 100
    expect(wiersze[1].udzial.wartosc).toBe('25,0'); // 3 / 12 * 100
  });

  it('suma zerowa → udział „—" (bez dzielenia przez zero)', () => {
    const wiersze = naWierszeWkladow([{ id: 'SRC', zrodlo: 'Źródło', pradKA: 0 }]);
    expect(wiersze[0].udzial.wartosc).toBe(ZWARCIA_STRINGS.kreska);
  });
});

describe('KOLUMNY_ZWARC — deklaratywne kolumny (jednostki zawsze, Ik"/ip/Ith/Sk" razem)', () => {
  it('wielkości liczbowe są mono; podstawowe niosą jednostkę (F1: + kolumny impedancyjne)', () => {
    // Intencja testu bez zmian: kazda wielkosc liczbowa jest mono, a wielkosci
    // mianowane niosa jednostke. Po ZWARCIA-PRO F1 doszly kolumny impedancyjne
    // (rk/xk/zk z jednostka; xr i kappa sa bezwymiarowe) — tylko-eksperckie.
    const liczbowe = KOLUMNY_ZWARC.filter((k) => k.mono && k.klucz !== KLUCZ_PUNKT);
    expect(liczbowe.map((k) => k.klucz)).toEqual([
      'ikss',
      'ip',
      'ith',
      'sk',
      'rk',
      'xk',
      'zk',
      'xr',
      'kappa',
    ]);
    for (const kol of liczbowe.filter((k) => !['xr', 'kappa'].includes(k.klucz))) {
      expect(kol.jednostka).toBeTruthy();
    }
    for (const kol of liczbowe.filter((k) => ['rk', 'xk', 'zk', 'xr', 'kappa'].includes(k.klucz))) {
      expect(kol.tylkoEkspercki).toBe(true);
    }
  });

  it('kolumna identyfikatora punktu jest tylko-ekspercka', () => {
    const id = KOLUMNY_ZWARC.find((k) => k.klucz === KLUCZ_PUNKT);
    expect(id?.tylkoEkspercki).toBe(true);
  });
});

describe('formatery — przecinek dziesiętny (determinizm)', () => {
  it('fmtKA/fmtMVA deterministyczne z przecinkiem PL', () => {
    expect(fmtKA(12.3456)).toBe('12,346');
    expect(fmtMVA(320.75)).toBe('320,8');
  });
});
