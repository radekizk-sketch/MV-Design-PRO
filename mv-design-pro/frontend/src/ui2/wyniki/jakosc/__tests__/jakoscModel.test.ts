import { describe, expect, it } from 'vitest';
import {
  KLUCZ_WIARYGODNOSCI_WEZEL,
  KLUCZ_WIERSZA_WALIDACJI,
  KOLUMNY_WALIDACJI,
  KOLUMNY_WIARYGODNOSCI,
  jestPrzebiegiemZwarciowym,
  kluczWalidacji,
  mapujWierszWiarygodnosci,
  naWierszeArcFlash,
  naWierszeMigotania,
  naWierszeWalidacji,
  naWierszeWiarygodnosci,
  naZalozeniaWalidacji,
  naZalozeniaWiarygodnosci,
  przebiegRozplywu,
  przebiegZwarciowy,
  rodzajPrzekroczeniaWalidacji,
  typElementuWalidacji,
} from '../jakoscModel';
import type { WynikArcFlash } from '../api';
import { MIGOTANIE_FIXTURE, WALIDACJA_FIXTURE, WIARYGODNOSC_FIXTURE, przebiegTestowy } from './fixtures';

describe('wybór przebiegu z rejestru', () => {
  it('rozpoznaje wszystkie rodzaje zwarcia jako SC', () => {
    for (const t of ['SC_3F', 'SC_1F', 'SC_2F', 'SC_2F_G']) {
      expect(jestPrzebiegiemZwarciowym(t)).toBe(true);
    }
    expect(jestPrzebiegiemZwarciowym('LOAD_FLOW')).toBe(false);
  });

  it('przebiegZwarciowy: ostatni zakończony SC gdy brak dopasowania aktywnego', () => {
    const runs = [
      przebiegTestowy('sc-1', 'SC_3F'),
      przebiegTestowy('pf-1', 'LOAD_FLOW'),
      przebiegTestowy('sc-2', 'SC_1F'),
    ];
    expect(przebiegZwarciowy(runs, null)?.id).toBe('sc-2');
  });

  it('przebiegZwarciowy: preferuje aktywny przebieg gdy pasuje i DONE', () => {
    const runs = [przebiegTestowy('sc-1', 'SC_3F'), przebiegTestowy('sc-2', 'SC_1F')];
    expect(przebiegZwarciowy(runs, 'sc-1')?.id).toBe('sc-1');
  });

  it('przebiegZwarciowy: pomija przebiegi niezakończone', () => {
    const runs = [przebiegTestowy('sc-1', 'SC_3F', 'RUNNING')];
    expect(przebiegZwarciowy(runs, 'sc-1')).toBeNull();
  });

  it('przebiegRozplywu: wybiera LOAD_FLOW/DONE, ignoruje SC', () => {
    const runs = [przebiegTestowy('sc-1', 'SC_3F'), przebiegTestowy('pf-1', 'LOAD_FLOW')];
    expect(przebiegRozplywu(runs, null)?.id).toBe('pf-1');
  });

  it('brak dopasowania → null', () => {
    expect(przebiegRozplywu([przebiegTestowy('sc-1', 'SC_3F')], null)).toBeNull();
    expect(przebiegZwarciowy([], null)).toBeNull();
  });
});

describe('adapter wiarygodności', () => {
  const wiersze = naWierszeWiarygodnosci(WIARYGODNOSC_FIXTURE.items);

  it('mapuje wiersze 1:1 (liczba i kolejność źródłowa)', () => {
    expect(wiersze).toHaveLength(3);
    expect(wiersze[0].wezel.wartosc).toBe('Szyna A');
    expect(wiersze[1].wezel.wartosc).toBe('Szyna B');
  });

  it('status pochodzi wprost z backendu (tekst polski, bez oceny lokalnej)', () => {
    expect(wiersze[0].status.wartosc).toBe('zweryfikowany');
    expect(wiersze[1].status.wartosc).toBe('poza zakresem wiarygodności');
    expect(wiersze[2].status.wartosc).toBe('dane niekompletne');
  });

  it('tag ostrzeżenia na Ik" wynika z flagi in_range backendu', () => {
    expect(wiersze[0].ikss.ostrzezenie).toBe(false);
    expect(wiersze[1].ikss.ostrzezenie).toBe(true);
  });

  it('kolumna blokady OSD: Tak/Nie z pola backendu', () => {
    expect(wiersze[0].blokada.wartosc).toBe('Nie');
    expect(wiersze[1].blokada.wartosc).toBe('Tak');
  });

  it('wartości puste → „—" z najniższym kluczem sortowania', () => {
    expect(wiersze[2].napiecie.wartosc).toBe('—');
    expect(wiersze[2].ikss.sortKey).toBe(Number.NEGATIVE_INFINITY);
  });

  it('formatuje liczby przecinkiem dziesiętnym PL', () => {
    expect(wiersze[0].ikss.wartosc).toBe('12,500');
    expect(wiersze[0].napiecie.wartosc).toBe('15,000');
  });

  it('identyfikator węzła = target_id (kolumna ekspercka)', () => {
    expect(wiersze[0][KLUCZ_WIARYGODNOSCI_WEZEL].wartosc).toBe('bus-A');
    const kolId = KOLUMNY_WIARYGODNOSCI.find((k) => k.klucz === KLUCZ_WIARYGODNOSCI_WEZEL);
    expect(kolId?.tylkoEkspercki).toBe(true);
  });

  it('założenia: metoda + pasma napięciowe', () => {
    const zal = naZalozeniaWiarygodnosci();
    expect(zal).toHaveLength(2);
    expect(zal[1].wartosc).toContain('nN');
  });

  // K3/C1: Ik" pochodzi wprost z przebiegu zwarciowego → dowodRef (element_id ?? target_id);
  // napięcie (dana modelu) i granice pasm (konfiguracja normatywna) to wejścia — bez dowodu.
  it('K3/C1: Ik" niesie dowodRef = element_id (2× klik → dowód WHITE BOX przebiegu)', () => {
    expect(wiersze[0].ikss.dowodRef).toBe('bus-A');
    expect(wiersze[0].napiecie.dowodRef).toBeUndefined();
    expect(wiersze[0].dolna.dowodRef).toBeUndefined();
    expect(wiersze[0].gorna.dowodRef).toBeUndefined();
  });

  it('K3/C1: brak element_id → dowodRef spada na target_id (wzorzec zwarciowy)', () => {
    const w = mapujWierszWiarygodnosci({
      ...WIARYGODNOSC_FIXTURE.items[1],
      element_id: null,
    });
    expect(w.ikss.dowodRef).toBe('bus-B');
  });

  it('K3/C1: pusta wartość Ik" (null) → komórka „—" bez dowodu (nie ma liczby, nie ma wywodu)', () => {
    expect(wiersze[2].ikss.dowodRef).toBeUndefined();
  });
});

describe('adapter walidacji energetycznej', () => {
  const wiersze = naWierszeWalidacji(WALIDACJA_FIXTURE.items);

  it('mapuje WSZYSTKIE rodzaje kontroli na polskie etykiety', () => {
    expect(wiersze.map((w) => w.rodzaj.wartosc)).toEqual([
      'Obciążenie gałęzi',
      'Obciążenie transformatora',
      'Odchylenie napięcia',
      'Budżet strat',
      'Bilans mocy biernej',
    ]);
  });

  it('status mapowany na polski (statusy wyłącznie z backendu)', () => {
    expect(wiersze[0].status.wartosc).toBe('Zgodny');
    expect(wiersze[1].status.wartosc).toBe('Ostrzeżenie');
    expect(wiersze[2].status.wartosc).toBe('Przekroczenie');
    expect(wiersze[4].status.wartosc).toBe('Nie obliczono');
  });

  it('tag ostrzeżenia tylko dla WARNING/FAIL, nie dla PASS/NOT_COMPUTED', () => {
    expect(wiersze[0].wartosc.ostrzezenie).toBeFalsy(); // PASS
    expect(wiersze[1].wartosc.ostrzezenie).toBe(true); // WARNING
    expect(wiersze[2].wartosc.ostrzezenie).toBe(true); // FAIL
    expect(wiersze[4].wartosc.ostrzezenie).toBeFalsy(); // NOT_COMPUTED (wartość null → brak tagu)
  });

  it('wartość obserwowana z jednostką z pola backendu', () => {
    expect(wiersze[0].wartosc.wartosc).toBe('65,00');
    expect(wiersze[0].wartosc.jednostka).toBe('%');
    expect(wiersze[4].wartosc.wartosc).toBe('—');
  });

  it('progi warn/fail przenoszone z jednostką pozycji', () => {
    expect(wiersze[1].progOstrz.wartosc).toBe('80,00');
    expect(wiersze[1].progPrzekr.wartosc).toBe('100,00');
    expect(wiersze[1].progOstrz.jednostka).toBe('%');
  });

  it('klucz wiersza jest unikatowy (kompozyt rodzaj::obiekt::indeks)', () => {
    const klucze = wiersze.map((w) => w[KLUCZ_WIERSZA_WALIDACJI].wartosc);
    expect(new Set(klucze).size).toBe(klucze.length);
    expect(wiersze[0][KLUCZ_WIERSZA_WALIDACJI].wartosc).toBe(
      kluczWalidacji(WALIDACJA_FIXTURE.items[0], 0),
    );
  });

  it('kolumna identyfikatora obiektu jest ekspercka', () => {
    const kolId = KOLUMNY_WALIDACJI.find((k) => k.klucz === 'identyfikator');
    expect(kolId?.tylkoEkspercki).toBe(true);
  });

  it('założenia: 6 progów z konfiguracji backendu, w procentach', () => {
    const zal = naZalozeniaWalidacji(WALIDACJA_FIXTURE.config);
    expect(zal).toHaveLength(6);
    expect(zal[0].wartosc).toBe('80,0');
    expect(zal[0].jednostka).toBe('%');
    expect(zal[3].wartosc).toBe('10,0');
  });

  // K3/C1 (GAP zarejestrowany): wartość obserwowana walidacji jest wyliczana przez
  // builder analizy (obciążenie %, odchylenie %), a kontrakt `WalidacjaItem`
  // (jakosc/api.ts) NIE niesie śladu WHITE BOX per pozycja — kierowanie 2× kliku
  // do śladu innego przebiegu byłoby fałszywym dowodem, więc komórki pozostają
  // bez dowodRef aż backend dostarczy ślad pozycji (wpis GAP w raporcie K3).
  it('K3/C1: komórki walidacji bez dowodRef (kontrakt bez śladu per pozycja — zero fabrykacji)', () => {
    for (const w of wiersze) {
      expect(w.wartosc.dowodRef).toBeUndefined();
      expect(w.margines.dowodRef).toBeUndefined();
    }
  });
});

describe('K3/C1 — dowodRef adapterów migotania i Arc Flash', () => {
  it('migotanie: Sk" (wprost z przebiegu zwarciowego) niesie dowodRef = bus_ref; Pst/Plt/d bez ref (ślad na miejscu w ekranie)', () => {
    const wiersze = naWierszeMigotania(MIGOTANIE_FIXTURE.buses);
    expect(wiersze[0].sk.dowodRef).toBe('bus-oze-1');
    expect(wiersze[0].pst.dowodRef).toBeUndefined();
    expect(wiersze[0].plt.dowodRef).toBeUndefined();
    expect(wiersze[0].d.dowodRef).toBeUndefined();
  });

  it('Arc Flash: I_bf (wprost z przebiegu zwarciowego) niesie dowodRef = bus_ref; energia/granica bez ref (ślad IEEE 1584 na miejscu)', () => {
    const wynik: WynikArcFlash = {
      bus_ref: 'bus-af-1',
      status: 'COMPUTED_IEEE_1584_OPEN_SOURCE',
      status_label_pl: 'obliczony (IEEE 1584 open-source)',
      method: 'IEEE_1584_2018',
      electrode_config: 'VCB',
      i_bf_ka: 12.5,
      voltage_kv: 15.0,
      arc_time_s: 0.2,
      conductor_gap_mm: 152,
      working_distance_mm: 455,
      i_arc_ka: 11.8,
      incident_energy_cal_cm2: 8.42,
      incident_energy_joule_cm2: 35.2,
      arc_flash_boundary_mm: 1320,
      ppe_category: '2',
      ppe_table_provenance: null,
      provenance: null,
      provenance_caveat_pl: null,
      why_pl: 'Energia incydentu wyznaczona wg IEEE 1584-2018.',
      missing_data: [],
      white_box: [],
    };
    const [w] = naWierszeArcFlash([wynik]);
    expect(w.ibf.dowodRef).toBe('bus-af-1');
    expect(w.energia.dowodRef).toBeUndefined();
    expect(w.granica.dowodRef).toBeUndefined();
  });
});

describe('typElementuWalidacji — mapowanie rodzaju kontroli na typ elementu (F-E6.2)', () => {
  it('napięcie i bilans mocy biernej → węzeł (Bus)', () => {
    expect(typElementuWalidacji('VOLTAGE_DEVIATION')).toBe('Bus');
    expect(typElementuWalidacji('REACTIVE_BALANCE')).toBe('Bus');
  });

  it('obciążalność gałęzi → LineBranch, transformatora → TransformerBranch', () => {
    expect(typElementuWalidacji('BRANCH_LOADING')).toBe('LineBranch');
    expect(typElementuWalidacji('TRANSFORMER_LOADING')).toBe('TransformerBranch');
  });

  it('bilans strat (agregat systemowy target_id=network) → null (brak elementu, brak martwej akcji)', () => {
    expect(typElementuWalidacji('LOSS_BUDGET')).toBeNull();
  });
});

describe('rodzajPrzekroczeniaWalidacji — mapowanie check_type na rodzaj akcji naprawczej (K1 / F-E6.3)', () => {
  it('mapowanie 1:1 z realnych kodów backendu', () => {
    expect(rodzajPrzekroczeniaWalidacji('VOLTAGE_DEVIATION')).toBe('napiecie');
    expect(rodzajPrzekroczeniaWalidacji('BRANCH_LOADING')).toBe('obciazalnosc-galezi');
    expect(rodzajPrzekroczeniaWalidacji('TRANSFORMER_LOADING')).toBe('obciazalnosc-transformatora');
    expect(rodzajPrzekroczeniaWalidacji('REACTIVE_BALANCE')).toBe('bilans-biernej');
  });

  it('bilans strat → null (agregat systemowy — spójnie z typElementuWalidacji)', () => {
    expect(rodzajPrzekroczeniaWalidacji('LOSS_BUDGET')).toBeNull();
  });
});
