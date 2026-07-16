import { describe, it, expect } from 'vitest';
import {
  KLUCZ_SZYNA,
  KOLUMNY_SZYN,
  naProfilNapiec,
  naWierszeSzyn,
  naZalozeniaRozplywu,
} from '../adapters/rozplywAdapter';
import {
  fmtPU,
  fmtTolerancja,
  napiecePozaZakresem,
  NAPIECIE_MAX_PU,
  NAPIECIE_MIN_PU,
  ROZPLYW_STRINGS,
} from '../strings';
import { busResultFixture, powerFlowResultFixture } from './fixtures';

describe('naWierszeSzyn — projekcja PowerFlowBusResult → wiersze wzorca (fixture 1:1)', () => {
  it('mapuje wszystkie pola wiersza szyny z formatem PL (przecinek dziesiętny)', () => {
    const [w] = naWierszeSzyn([busResultFixture()]);
    expect(w[KLUCZ_SZYNA]).toEqual({ wartosc: 'SZ-GPZ' });
    expect(w.napiecie).toMatchObject({ wartosc: '1,0000', sortKey: 1.0, ostrzezenie: false });
    expect(w.kat).toEqual({ wartosc: '0,00', sortKey: 0.0 });
    expect(w.pCzynna).toEqual({ wartosc: '12,345', sortKey: 12.345 });
    expect(w.pBierna).toEqual({ wartosc: '3,210', sortKey: 3.21 });
  });

  it('napięcie poniżej 0,95 p.u. → ostrzeżenie (tag), sortKey liczbowy zachowany', () => {
    const [w] = naWierszeSzyn([busResultFixture({ bus_id: 'SZ-ST2', v_pu: 0.941 })]);
    expect(w.napiecie).toMatchObject({ wartosc: '0,9410', ostrzezenie: true, sortKey: 0.941 });
  });

  it('napięcie powyżej 1,05 p.u. → ostrzeżenie', () => {
    const [w] = naWierszeSzyn([busResultFixture({ v_pu: 1.062 })]);
    expect(w.napiecie).toMatchObject({ ostrzezenie: true });
  });

  it('zachowuje kolejność szyn ze źródła (bez własnego sortowania)', () => {
    const wiersze = naWierszeSzyn(powerFlowResultFixture().bus_results);
    expect(wiersze.map((w) => w[KLUCZ_SZYNA].wartosc)).toEqual(['SZ-GPZ', 'SZ-ST1', 'SZ-ST2']);
  });

  it('jest deterministyczne: to samo wejście → identyczne wyjście', () => {
    const wejscie = powerFlowResultFixture().bus_results;
    expect(naWierszeSzyn(wejscie)).toEqual(naWierszeSzyn(wejscie));
  });
});

describe('naZalozeniaRozplywu — założenia z parametrów przebiegu (W-602)', () => {
  it('buduje komplet założeń z pól skalarnych PowerFlowResultV1', () => {
    const zalozenia = naZalozeniaRozplywu(powerFlowResultFixture());
    const etykiety = zalozenia.map((z) => z.etykieta);
    expect(etykiety).toEqual([
      ROZPLYW_STRINGS.zalMocBazowa,
      ROZPLYW_STRINGS.zalTolerancja,
      ROZPLYW_STRINGS.zalSzynaBilansujaca,
      ROZPLYW_STRINGS.zalLiczbaIteracji,
      ROZPLYW_STRINGS.zalZbieznosc,
      ROZPLYW_STRINGS.zalPrzedzialNapiecia,
    ]);
    expect(zalozenia[0]).toMatchObject({ wartosc: '100,0', jednostka: ROZPLYW_STRINGS.jednMVA });
    expect(zalozenia[1].wartosc).toBe(fmtTolerancja(1e-6));
    expect(zalozenia[2].wartosc).toBe('SZ-GPZ');
    expect(zalozenia[3].wartosc).toBe(4);
    expect(zalozenia[4].wartosc).toBe(ROZPLYW_STRINGS.zbieznoscTak);
  });

  it('brak zbieżności → „Nie"', () => {
    const zalozenia = naZalozeniaRozplywu(powerFlowResultFixture({ converged: false }));
    expect(zalozenia[4].wartosc).toBe(ROZPLYW_STRINGS.zbieznoscNie);
  });

  it('normatywny przedział napięcia jawnie ujawniony (WHITE BOX) z uwagą o normie', () => {
    const zalozenia = naZalozeniaRozplywu(powerFlowResultFixture());
    const przedzial = zalozenia[5];
    expect(przedzial.wartosc).toBe(`${fmtPU(NAPIECIE_MIN_PU)}–${fmtPU(NAPIECIE_MAX_PU)}`);
    expect(przedzial.jednostka).toBe(ROZPLYW_STRINGS.jednPU);
    expect(przedzial.uwaga).toBe(ROZPLYW_STRINGS.zalPrzedzialNapieciaUwaga);
  });
});

describe('naProfilNapiec — punkty wykresu wprost z danych (zero losowości)', () => {
  it('mapuje szyny na punkty profilu w kolejności źródłowej', () => {
    const punkty = naProfilNapiec(powerFlowResultFixture().bus_results);
    expect(punkty).toEqual([
      { szyna: 'SZ-GPZ', napiecie: 1.0 },
      { szyna: 'SZ-ST1', napiecie: 0.982 },
      { szyna: 'SZ-ST2', napiecie: 0.941 },
    ]);
  });
});

describe('KOLUMNY_SZYN — deklaratywne kolumny z jednostkami (jednostki zawsze)', () => {
  it('każda kolumna liczbowa jest mono i niesie jednostkę', () => {
    const liczbowe = KOLUMNY_SZYN.filter((k) => k.klucz !== KLUCZ_SZYNA);
    for (const kol of liczbowe) {
      expect(kol.mono).toBe(true);
      expect(kol.jednostka).toBeTruthy();
    }
  });

  it('progi normatywne są spójne z helperem napiecePozaZakresem', () => {
    expect(napiecePozaZakresem(NAPIECIE_MIN_PU)).toBe(false);
    expect(napiecePozaZakresem(NAPIECIE_MAX_PU)).toBe(false);
    expect(napiecePozaZakresem(0.9499)).toBe(true);
    expect(napiecePozaZakresem(1.0501)).toBe(true);
  });
});
