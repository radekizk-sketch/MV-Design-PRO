import { describe, it, expect } from 'vitest';
import {
  KLUCZ_GALAZ,
  KLUCZ_ID_GALEZI,
  KLUCZ_ID_SZYNY,
  KLUCZ_OBCIAZENIE,
  KLUCZ_SZYNA,
  KOLUMNY_GALEZI,
  KOLUMNY_SZYN,
  komorkaObciazenia,
  naMapeObciazen,
  naProfilNapiec,
  naSumeStratGalezi,
  naWierszeGalezi,
  naWierszeSzyn,
  naZalozeniaRozplywu,
} from '../adapters/rozplywAdapter';
import { fmtPU, fmtTolerancja, napiecePozaZakresem, ROZPLYW_STRINGS } from '../strings';
import {
  branchResultFixture,
  busResultFixture,
  kryteriaNapieciaFixture,
  powerFlowResultFixture,
  walidacjaItemFixture,
} from './fixtures';

/** Most nazw w testach (karta #145): nazwa z wyniku, a bez niej — prefiks nad referencją. */
const NAZWA = (ref: string, nazwaZWyniku?: string | null): string =>
  nazwaZWyniku ?? `nazwa ${ref}`;

describe('naWierszeSzyn — projekcja PowerFlowBusResult → wiersze wzorca (fixture 1:1)', () => {
  it('mapuje wszystkie pola wiersza szyny z formatem PL (przecinek dziesiętny)', () => {
    const [w] = naWierszeSzyn([busResultFixture()], kryteriaNapieciaFixture(), NAZWA);
    // Karta #145: kolumna główna niesie NAZWĘ z mostu nazw; bus_id jest kluczem wiersza.
    expect(w[KLUCZ_SZYNA]).toEqual({ wartosc: 'nazwa SZ-GPZ' });
    expect(w[KLUCZ_ID_SZYNY]).toEqual({ wartosc: 'SZ-GPZ' });
    expect(w.napiecie).toMatchObject({ wartosc: '1,0000', sortKey: 1.0, ostrzezenie: false });
    expect(w.kat).toEqual({ wartosc: '0,00', sortKey: 0.0, dowodRef: 'SZ-GPZ' });
    expect(w.pCzynna).toEqual({ wartosc: '12,345', sortKey: 12.345, dowodRef: 'SZ-GPZ' });
    expect(w.pBierna).toEqual({ wartosc: '3,210', sortKey: 3.21, dowodRef: 'SZ-GPZ' });
  });

  it('K3/C1: każda wielkość wynikowa szyny niesie dowodRef = bus_id (2× klik → dowód WHITE BOX)', () => {
    const [w] = naWierszeSzyn([busResultFixture({ bus_id: 'SZ-ST7' })], kryteriaNapieciaFixture(), NAZWA);
    for (const klucz of ['napiecie', 'kat', 'pCzynna', 'pBierna'] as const) {
      expect(w[klucz].dowodRef).toBe('SZ-ST7');
    }
    // Kolumna identyfikacyjna (nazwa szyny) nie jest liczbą wyniku — bez dowodu.
    expect(w[KLUCZ_SZYNA].dowodRef).toBeUndefined();
  });

  it('napięcie poniżej 0,95 p.u. → ostrzeżenie (tag), sortKey liczbowy zachowany', () => {
    const [w] = naWierszeSzyn(
      [busResultFixture({ bus_id: 'SZ-ST2', v_pu: 0.941 })],
      kryteriaNapieciaFixture(), NAZWA
    );
    expect(w.napiecie).toMatchObject({ wartosc: '0,9410', ostrzezenie: true, sortKey: 0.941 });
  });

  it('napięcie powyżej 1,05 p.u. → ostrzeżenie', () => {
    const [w] = naWierszeSzyn([busResultFixture({ v_pu: 1.062 })], kryteriaNapieciaFixture(), NAZWA);
    expect(w.napiecie).toMatchObject({ ostrzezenie: true });
  });

  it('karta W3-J: bez kryteriów w wyniku (starszy zapisany bieg) → brak ostrzeżenia, nie domyślny próg', () => {
    // v_pu = 0.941 przekraczałby próg ostrzeżenia GDYBY był dostępny — bez
    // kryteriów adapter NIE MOŻE ocenić, więc uczciwie milczy (false), zamiast
    // fabrykować werdykt z domyślnej liczby.
    const [w] = naWierszeSzyn(
      [busResultFixture({ bus_id: 'SZ-ST2', v_pu: 0.941 })],
      undefined, NAZWA
    );
    expect(w.napiecie).toMatchObject({ ostrzezenie: false });
  });

  it('zachowuje kolejność szyn ze źródła (bez własnego sortowania)', () => {
    const wiersze = naWierszeSzyn(powerFlowResultFixture().bus_results, kryteriaNapieciaFixture(), NAZWA);
    expect(wiersze.map((w) => w[KLUCZ_ID_SZYNY].wartosc)).toEqual(['SZ-GPZ', 'SZ-ST1', 'SZ-ST2']);
  });

  it('jest deterministyczne: to samo wejście → identyczne wyjście', () => {
    const wejscie = powerFlowResultFixture().bus_results;
    const kryteria = kryteriaNapieciaFixture();
    expect(naWierszeSzyn(wejscie, kryteria, NAZWA)).toEqual(naWierszeSzyn(wejscie, kryteria, NAZWA));
  });
});

describe('naZalozeniaRozplywu — założenia z parametrów przebiegu (W-602)', () => {
  it('buduje komplet założeń z pól skalarnych PowerFlowResultV1', () => {
    const zalozenia = naZalozeniaRozplywu(powerFlowResultFixture(), NAZWA);
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
    expect(zalozenia[2].wartosc).toBe('nazwa SZ-GPZ');
    expect(zalozenia[3].wartosc).toBe(4);
    expect(zalozenia[4].wartosc).toBe(ROZPLYW_STRINGS.zbieznoscTak);
  });

  it('brak zbieżności → „Nie"', () => {
    const zalozenia = naZalozeniaRozplywu(powerFlowResultFixture({ converged: false }), NAZWA);
    expect(zalozenia[4].wartosc).toBe(ROZPLYW_STRINGS.zbieznoscNie);
  });

  it('normatywny przedział napięcia jawnie ujawniony (WHITE BOX) WPROST z kryteriów biegu', () => {
    const kryteria = kryteriaNapieciaFixture();
    const zalozenia = naZalozeniaRozplywu(powerFlowResultFixture({ kryteria_napiecia: kryteria }), NAZWA);
    const przedzial = zalozenia[5];
    expect(przedzial.wartosc).toBe(`${fmtPU(kryteria.ostrzezenie_min_pu)}–${fmtPU(kryteria.ostrzezenie_max_pu)}`);
    expect(przedzial.jednostka).toBe(ROZPLYW_STRINGS.jednPU);
    expect(przedzial.uwaga).toBe(kryteria.podstawa_ostrzezenie_pl);
  });

  it('karta W3-J: bez kryteriów w wyniku (starszy zapisany bieg) → uczciwy stan „kryterium niedostępne", nie domyślna liczba', () => {
    const zalozenia = naZalozeniaRozplywu(
      powerFlowResultFixture({ kryteria_napiecia: undefined }), NAZWA
    );
    const przedzial = zalozenia[5];
    expect(przedzial.etykieta).toBe(ROZPLYW_STRINGS.zalPrzedzialNapiecia);
    expect(przedzial.wartosc).toBe(ROZPLYW_STRINGS.kreska);
    expect(przedzial.jednostka).toBeUndefined();
    expect(przedzial.uwaga).toBe(ROZPLYW_STRINGS.zalPrzedzialNapieciaNiedostepne);
  });
});

describe('naProfilNapiec — punkty wykresu wprost z danych (zero losowości)', () => {
  it('mapuje szyny na punkty profilu w kolejności źródłowej', () => {
    const punkty = naProfilNapiec(powerFlowResultFixture().bus_results, NAZWA);
    expect(punkty).toEqual([
      { szyna: 'nazwa SZ-GPZ', napiecie: 1.0 },
      { szyna: 'nazwa SZ-ST1', napiecie: 0.982 },
      { szyna: 'nazwa SZ-ST2', napiecie: 0.941 },
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

  it('progi normatywne (z odpowiedzi biegu) są spójne z helperem napiecePozaZakresem', () => {
    const kryteria = kryteriaNapieciaFixture();
    expect(napiecePozaZakresem(kryteria.ostrzezenie_min_pu, kryteria)).toBe(false);
    expect(napiecePozaZakresem(kryteria.ostrzezenie_max_pu, kryteria)).toBe(false);
    expect(napiecePozaZakresem(0.9499, kryteria)).toBe(true);
    expect(napiecePozaZakresem(1.0501, kryteria)).toBe(true);
  });

  it('karta W3-J: bez kryteriów napiecePozaZakresem zawsze zwraca false (uczciwe „nie da się ocenić")', () => {
    expect(napiecePozaZakresem(0.5, undefined)).toBe(false);
    expect(napiecePozaZakresem(1.5, undefined)).toBe(false);
  });
});

describe('naWierszeGalezi — projekcja PowerFlowBranchResult → wiersze wzorca (karta E8.3, fixture 1:1)', () => {
  it('mapuje wszystkie pola wiersza gałęzi z formatem PL (przecinek dziesiętny)', () => {
    const [w] = naWierszeGalezi([branchResultFixture()], NAZWA);
    expect(w[KLUCZ_GALAZ]).toEqual({ wartosc: 'nazwa L-1' });
    expect(w[KLUCZ_ID_GALEZI]).toEqual({ wartosc: 'L-1' });
    expect(w.pPoczatek).toEqual({ wartosc: '10,500', sortKey: 10.5, dowodRef: 'L-1' });
    expect(w.qPoczatek).toEqual({ wartosc: '2,400', sortKey: 2.4, dowodRef: 'L-1' });
    expect(w.pKoniec).toEqual({ wartosc: '-10,400', sortKey: -10.4, dowodRef: 'L-1' });
    expect(w.qKoniec).toEqual({ wartosc: '-2,300', sortKey: -2.3, dowodRef: 'L-1' });
  });

  it('straty prezentowane w kW/kvar (skalowanie MW/Mvar ×1000, nie fizyka)', () => {
    const [w] = naWierszeGalezi([branchResultFixture({ losses_p_mw: 0.1, losses_q_mvar: 0.1 })], NAZWA);
    expect(w.stratyP).toEqual({ wartosc: '100,00', sortKey: 100, dowodRef: 'L-1' });
    expect(w.stratyQ).toEqual({ wartosc: '100,00', sortKey: 100, dowodRef: 'L-1' });
  });

  it('K3/C1: każda wielkość wynikowa gałęzi niesie dowodRef = branch_id (2× klik → dowód WHITE BOX)', () => {
    const [w] = naWierszeGalezi([branchResultFixture({ branch_id: 'CBL-SN-09' })], NAZWA);
    const liczbowe = ['pPoczatek', 'qPoczatek', 'pKoniec', 'qKoniec', 'stratyP', 'stratyQ'] as const;
    for (const klucz of liczbowe) {
      expect(w[klucz].dowodRef).toBe('CBL-SN-09');
    }
    expect(w[KLUCZ_GALAZ].dowodRef).toBeUndefined();
  });

  it('karta #145: gałąź nazwana mostem nazw, branch_id zostaje kluczem wiersza (nie tekstem)', () => {
    const [w] = naWierszeGalezi([branchResultFixture({ branch_id: 'CBL-SN-04' })], NAZWA);
    expect(w[KLUCZ_GALAZ].wartosc).toBe('nazwa CBL-SN-04');
    expect(w[KLUCZ_ID_GALEZI].wartosc).toBe('CBL-SN-04');
  });

  it('zachowuje kolejność gałęzi ze źródła (bez własnego sortowania)', () => {
    const wiersze = naWierszeGalezi(powerFlowResultFixture().branch_results, NAZWA);
    expect(wiersze.map((w) => w[KLUCZ_ID_GALEZI].wartosc)).toEqual(['L-1', 'L-2']);
  });

  it('jest deterministyczne: to samo wejście → identyczne wyjście', () => {
    const wejscie = powerFlowResultFixture().branch_results;
    expect(naWierszeGalezi(wejscie, NAZWA)).toEqual(naWierszeGalezi(wejscie, NAZWA));
  });

  it('pusta lista gałęzi → pusta lista wierszy (uczciwy stan pusty)', () => {
    expect(naWierszeGalezi([], NAZWA)).toEqual([]);
  });
});

describe('naMapeObciazen — pozycje walidacji → mapa branch_id → obciążalność (R3-A / K1-G2)', () => {
  it('kluczuje pozycje obciążalności po target_id (= branch_id z backendu)', () => {
    const mapa = naMapeObciazen([
      walidacjaItemFixture(),
      walidacjaItemFixture({ target_id: 'T-1', check_type: 'TRANSFORMER_LOADING', observed_value: 104.0, status: 'FAIL' }),
    ]);
    expect(mapa.get('L-1')).toEqual({ checkType: 'BRANCH_LOADING', observedValue: 92.0, status: 'WARNING' });
    expect(mapa.get('T-1')).toEqual({ checkType: 'TRANSFORMER_LOADING', observedValue: 104.0, status: 'FAIL' });
  });

  it('filtruje wyłącznie kontrole obciążalności — pozostałe rodzaje pominięte', () => {
    const mapa = naMapeObciazen([
      walidacjaItemFixture({ target_id: 'bus-B', check_type: 'VOLTAGE_DEVIATION' }),
      walidacjaItemFixture({ target_id: 'network', check_type: 'LOSS_BUDGET' }),
      walidacjaItemFixture({ target_id: 'slack', check_type: 'REACTIVE_BALANCE' }),
    ]);
    expect(mapa.size).toBe(0);
  });

  it('duplikat target_id → wygrywa pierwsza pozycja (deterministycznie)', () => {
    const mapa = naMapeObciazen([
      walidacjaItemFixture({ observed_value: 92.0 }),
      walidacjaItemFixture({ observed_value: 50.0, status: 'PASS' }),
    ]);
    expect(mapa.get('L-1')).toMatchObject({ observedValue: 92.0, status: 'WARNING' });
  });

  it('jest deterministyczne: to samo wejście → identyczna mapa', () => {
    const wejscie = [walidacjaItemFixture(), walidacjaItemFixture({ target_id: 'L-2', status: 'PASS' })];
    expect(naMapeObciazen(wejscie)).toEqual(naMapeObciazen(wejscie));
  });
});

describe('komorkaObciazenia — pozycja walidacji → komórka „Obciążenie [%]" (R3-A)', () => {
  it('brak pozycji dla gałęzi → kreska bez werdyktu i bez sortKey (uczciwie)', () => {
    expect(komorkaObciazenia(undefined)).toEqual({ wartosc: ROZPLYW_STRINGS.kreska });
  });

  it('PASS → wartość PL (przecinek, 1 miejsce) + sortKey liczbowy, bez ostrzeżenia', () => {
    expect(
      komorkaObciazenia({ checkType: 'BRANCH_LOADING', observedValue: 65.0, status: 'PASS' }),
    ).toEqual({ wartosc: '65,0', sortKey: 65.0 });
  });

  it('WARNING i FAIL → tag ostrzeżenia WYŁĄCZNIE z werdyktu backendu', () => {
    expect(
      komorkaObciazenia({ checkType: 'BRANCH_LOADING', observedValue: 92.0, status: 'WARNING' }),
    ).toEqual({ wartosc: '92,0', sortKey: 92.0, ostrzezenie: true });
    expect(
      komorkaObciazenia({ checkType: 'TRANSFORMER_LOADING', observedValue: 104.0, status: 'FAIL' }),
    ).toEqual({ wartosc: '104,0', sortKey: 104.0, ostrzezenie: true });
  });

  it('pozycja bez wartości (NOT_COMPUTED) → kreska bez werdyktu', () => {
    expect(
      komorkaObciazenia({ checkType: 'BRANCH_LOADING', observedValue: null, status: 'NOT_COMPUTED' }),
    ).toEqual({ wartosc: ROZPLYW_STRINGS.kreska });
  });

  it('pozycja bez wartości z werdyktem FAIL → kreska Z werdyktem (werdykt backendu zachowany)', () => {
    expect(
      komorkaObciazenia({ checkType: 'BRANCH_LOADING', observedValue: null, status: 'FAIL' }),
    ).toEqual({ wartosc: ROZPLYW_STRINGS.kreska, ostrzezenie: true });
  });
});

describe('naWierszeGalezi + obciążenia — kolumna werdyktu obciążalności (R3-A)', () => {
  it('bez mapy walidacji: komórka obciążenia = kreska (tabela działa jak dotąd)', () => {
    const [w] = naWierszeGalezi([branchResultFixture()], NAZWA);
    expect(w[KLUCZ_OBCIAZENIE]).toEqual({ wartosc: ROZPLYW_STRINGS.kreska });
    const [w2] = naWierszeGalezi([branchResultFixture()], NAZWA, null);
    expect(w2[KLUCZ_OBCIAZENIE]).toEqual({ wartosc: ROZPLYW_STRINGS.kreska });
  });

  it('z mapą walidacji: wartość PL, sortKey liczbowy i werdykt z backendu', () => {
    const mapa = naMapeObciazen([walidacjaItemFixture()]);
    const [w] = naWierszeGalezi([branchResultFixture()], NAZWA, mapa);
    expect(w[KLUCZ_OBCIAZENIE]).toEqual({ wartosc: '92,0', sortKey: 92.0, ostrzezenie: true });
  });

  it('gałąź bez pozycji walidacji w mapie → kreska bez werdyktu', () => {
    const mapa = naMapeObciazen([walidacjaItemFixture()]); // tylko L-1
    const wiersze = naWierszeGalezi(powerFlowResultFixture().branch_results, NAZWA, mapa);
    expect(wiersze[1][KLUCZ_OBCIAZENIE]).toEqual({ wartosc: ROZPLYW_STRINGS.kreska });
  });

  it('komórka obciążenia NIE niesie dowodRef (wartość buildera walidacji, nie śladu solvera — K3/R2-A)', () => {
    const mapa = naMapeObciazen([walidacjaItemFixture()]);
    const [w] = naWierszeGalezi([branchResultFixture()], NAZWA, mapa);
    expect(w[KLUCZ_OBCIAZENIE].dowodRef).toBeUndefined();
  });

  it('jest deterministyczne z mapą: to samo wejście → identyczne wyjście', () => {
    const wejscie = powerFlowResultFixture().branch_results;
    const mapa = naMapeObciazen([walidacjaItemFixture(), walidacjaItemFixture({ target_id: 'L-2', status: 'PASS', observed_value: 65.0 })]);
    expect(naWierszeGalezi(wejscie, NAZWA, mapa)).toEqual(naWierszeGalezi(wejscie, NAZWA, mapa));
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
