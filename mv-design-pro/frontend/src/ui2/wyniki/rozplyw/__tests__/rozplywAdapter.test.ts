import { describe, it, expect } from 'vitest';
import {
  KLUCZ_GALAZ,
  KLUCZ_SZYNA,
  KOLUMNY_GALEZI,
  KOLUMNY_SZYN,
  naProfilNapiec,
  naSumeStratGalezi,
  naWierszeGalezi,
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
import { branchResultFixture, busResultFixture, powerFlowResultFixture } from './fixtures';

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

describe('naWierszeGalezi — projekcja PowerFlowBranchResult → wiersze wzorca (karta E8.3, fixture 1:1)', () => {
  it('mapuje wszystkie pola wiersza gałęzi z formatem PL (przecinek dziesiętny)', () => {
    const [w] = naWierszeGalezi([branchResultFixture()]);
    expect(w[KLUCZ_GALAZ]).toEqual({ wartosc: 'L-1' });
    expect(w.pPoczatek).toEqual({ wartosc: '10,500', sortKey: 10.5 });
    expect(w.qPoczatek).toEqual({ wartosc: '2,400', sortKey: 2.4 });
    expect(w.pKoniec).toEqual({ wartosc: '-10,400', sortKey: -10.4 });
    expect(w.qKoniec).toEqual({ wartosc: '-2,300', sortKey: -2.3 });
  });

  it('straty prezentowane w kW/kvar (skalowanie MW/Mvar ×1000, nie fizyka)', () => {
    const [w] = naWierszeGalezi([branchResultFixture({ losses_p_mw: 0.1, losses_q_mvar: 0.1 })]);
    expect(w.stratyP).toEqual({ wartosc: '100,00', sortKey: 100 });
    expect(w.stratyQ).toEqual({ wartosc: '100,00', sortKey: 100 });
  });

  it('branch_id jako oznaczenie elementu sieci — bez tłumaczenia, wprost z kontraktu', () => {
    const [w] = naWierszeGalezi([branchResultFixture({ branch_id: 'CBL-SN-04' })]);
    expect(w[KLUCZ_GALAZ].wartosc).toBe('CBL-SN-04');
  });

  it('zachowuje kolejność gałęzi ze źródła (bez własnego sortowania)', () => {
    const wiersze = naWierszeGalezi(powerFlowResultFixture().branch_results);
    expect(wiersze.map((w) => w[KLUCZ_GALAZ].wartosc)).toEqual(['L-1', 'L-2']);
  });

  it('jest deterministyczne: to samo wejście → identyczne wyjście', () => {
    const wejscie = powerFlowResultFixture().branch_results;
    expect(naWierszeGalezi(wejscie)).toEqual(naWierszeGalezi(wejscie));
  });

  it('pusta lista gałęzi → pusta lista wierszy (uczciwy stan pusty)', () => {
    expect(naWierszeGalezi([])).toEqual([]);
  });
});

describe('naSumeStratGalezi — podsumowanie strat (arytmetyka prezentacji, karta E8.3)', () => {
  it('sumuje straty czynne i bierne po wszystkich gałęziach, skalując MW/Mvar → kW/kvar', () => {
    const suma = naSumeStratGalezi(powerFlowResultFixture().branch_results);
    // 0,1 MW + 0,08 MW = 0,18 MW = 180,00 kW; 0,1 Mvar + 0,04 Mvar = 0,14 Mvar = 140,00 kvar
    expect(suma).toEqual({ stratyPKw: '180,00', stratyQKvar: '140,00' });
  });

  it('pusta lista gałęzi → suma zerowa (bez zgadywania braku danych)', () => {
    expect(naSumeStratGalezi([])).toEqual({ stratyPKw: '0,00', stratyQKvar: '0,00' });
  });

  it('jest czystą funkcją: to samo wejście → identyczny wynik', () => {
    const wejscie = powerFlowResultFixture().branch_results;
    expect(naSumeStratGalezi(wejscie)).toEqual(naSumeStratGalezi(wejscie));
  });
});

describe('KOLUMNY_GALEZI — deklaratywne kolumny z jednostkami (jednostki zawsze)', () => {
  it('każda kolumna liczbowa jest mono i niesie jednostkę', () => {
    const liczbowe = KOLUMNY_GALEZI.filter((k) => k.klucz !== KLUCZ_GALAZ);
    for (const kol of liczbowe) {
      expect(kol.mono).toBe(true);
      expect(kol.jednostka).toBeTruthy();
    }
  });

  it('kolumna główna (gałąź) niesie etykietę PL i wyrównanie do lewej', () => {
    const kolGalaz = KOLUMNY_GALEZI.find((k) => k.klucz === KLUCZ_GALAZ);
    expect(kolGalaz).toMatchObject({ etykieta: ROZPLYW_STRINGS.kolGalaz, wyrownanie: 'lewo' });
  });

  it('straty wyrażone w kW/kvar w nagłówku kolumny (jednostka prezentacji)', () => {
    const stratyP = KOLUMNY_GALEZI.find((k) => k.klucz === 'stratyP');
    const stratyQ = KOLUMNY_GALEZI.find((k) => k.klucz === 'stratyQ');
    expect(stratyP?.jednostka).toBe(ROZPLYW_STRINGS.jednKW);
    expect(stratyQ?.jednostka).toBe(ROZPLYW_STRINGS.jednKvar);
  });
});
