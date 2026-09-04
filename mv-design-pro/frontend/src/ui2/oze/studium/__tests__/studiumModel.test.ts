/*
 * Testy modelu i orkiestracji kreatora studium przyłączenia (karta P35, kryteria
 * §3). Weryfikują: filtrowanie/prefill typu wg rodzaju, DETERMINISTYCZNĄ kolejność
 * sekwencji analiz i ODPORNOŚĆ na błąd wariantu (błąd nie przerywa pozostałych),
 * reducer zdarzeń, odczyt wierzchołka najbliższego mocy typu (bez interpolacji),
 * pasmo Q / werdykt pokrycia oraz budowę wierszy przeglądu (kolejność wyboru,
 * wartości wyłącznie z odpowiedzi backendu). API niepotrzebne — klient wstrzykiwany.
 */

import { describe, expect, it } from 'vitest';

import type {
  ZapytanieObszaruPQ,
  ZapytaniePokryciaPQ,
  ZapytanieZdolnosci,
} from '../../api';
import {
  domyslnyKonwerter,
  kindKataloguDlaRodzaju,
  kolumnyStudium,
  konwerteryRodzaju,
  opcjeRodzajuStudium,
  pasmoQwPunkcie,
  przeprowadzStudium,
  stanPoczatkowyStudium,
  wariantWToku,
  werdyktPokryciaPL,
  wezelWariantu,
  wierszeStudium,
  wierzcholekNajblizszy,
  zastosujZdarzenieStudium,
  type KlientStudium,
  type KontekstWierszaStudium,
  type StanStudium,
  type ZdarzenieStudium,
} from '../studiumModel';
import {
  katalogStudiumFixture,
  rekordyStudiumFixture,
  widokObszaruFixture,
  widokPokryciaFixture,
  widokZdolnosciFixture,
} from './fixtures';

// ---------------------------------------------------------------------------
// Rodzaj źródła → katalog konwerterów
// ---------------------------------------------------------------------------

describe('studiumModel — rodzaj źródła i prefill typu', () => {
  it('FW mapuje na katalogowy rodzaj WIND; PV/BESS bez zmiany', () => {
    expect(kindKataloguDlaRodzaju('FW')).toBe('WIND');
    expect(kindKataloguDlaRodzaju('PV')).toBe('PV');
    expect(kindKataloguDlaRodzaju('BESS')).toBe('BESS');
  });

  it('opcje rodzaju mają trzy pozycje w stałej kolejności', () => {
    const opcje = opcjeRodzajuStudium();
    expect(opcje.map((o) => o.rodzaj)).toEqual(['PV', 'BESS', 'FW']);
  });

  it('filtruje rekordy po rodzaju (WIND) i prefill = pierwszy pasujący', () => {
    const rekordy = rekordyStudiumFixture();
    expect(konwerteryRodzaju(rekordy, 'PV').map((r) => r.id)).toEqual([
      'conv-pv-2mw',
      'conv-pv-1mw',
    ]);
    expect(konwerteryRodzaju(rekordy, 'FW').map((r) => r.id)).toEqual(['conv-wind-3mw']);
    expect(domyslnyKonwerter(rekordy, 'PV')?.id).toBe('conv-pv-2mw');
    expect(domyslnyKonwerter(rekordy, 'BESS')?.id).toBe('conv-bess-1mw');
  });

  it('brak rekordu dla rodzaju → domyślny null', () => {
    expect(domyslnyKonwerter([], 'PV')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Orkiestracja sekwencyjna — kolejność deterministyczna + odporność na błąd
// ---------------------------------------------------------------------------

function klientOk(log: string[]): KlientStudium {
  return {
    zdolnosc: (z: ZapytanieZdolnosci) => {
      log.push(`zdolnosc:${z.candidateBusRefs?.[0]}`);
      return Promise.resolve(widokZdolnosciFixture());
    },
    obszar: (z: ZapytanieObszaruPQ) => {
      log.push(`obszar:${z.busRef}`);
      return Promise.resolve(widokObszaruFixture());
    },
    pokrycie: (_z: ZapytaniePokryciaPQ) => {
      log.push('pokrycie');
      return Promise.resolve(widokPokryciaFixture());
    },
  };
}

describe('studiumModel — orkiestracja sekwencyjna', () => {
  it('woła fazy w deterministycznej kolejności: wariant po wariancie, faza po fazie', async () => {
    const log: string[] = [];
    await przeprowadzStudium(
      { runId: 'lf-1', warianty: ['bus-a', 'bus-b'], catalogItemId: 'conv-pv-2mw', operatorId: 'pse' },
      klientOk(log),
      () => undefined,
    );
    expect(log).toEqual([
      'zdolnosc:bus-a',
      'obszar:bus-a',
      'pokrycie',
      'zdolnosc:bus-b',
      'obszar:bus-b',
      'pokrycie',
    ]);
  });

  it('emituje start→sukces dla każdej fazy w kolejności', async () => {
    const zdarzenia: string[] = [];
    await przeprowadzStudium(
      { runId: 'lf-1', warianty: ['bus-a'], catalogItemId: 'conv-pv-2mw', operatorId: 'pse' },
      klientOk([]),
      (z) => zdarzenia.push(`${z.typ}:${z.faza}`),
    );
    expect(zdarzenia).toEqual([
      'start:zdolnosc',
      'sukces:zdolnosc',
      'start:obszar',
      'sukces:obszar',
      'start:pokrycie',
      'sukces:pokrycie',
    ]);
  });

  it('błąd jednej fazy wariantu NIE przerywa pozostałych faz ani wariantów', async () => {
    const wywolania: string[] = [];
    const klient: KlientStudium = {
      zdolnosc: (z) => {
        wywolania.push(`zdolnosc:${z.candidateBusRefs?.[0]}`);
        return Promise.resolve(widokZdolnosciFixture());
      },
      obszar: (z) => {
        wywolania.push(`obszar:${z.busRef}`);
        // Obszar zawodzi tylko dla pierwszego wariantu.
        return z.busRef === 'bus-a'
          ? Promise.reject(new Error('Błąd siatki P–Q'))
          : Promise.resolve(widokObszaruFixture());
      },
      pokrycie: () => {
        wywolania.push('pokrycie');
        return Promise.resolve(widokPokryciaFixture());
      },
    };
    const zdarzenia: ZdarzenieStudium[] = [];
    await expect(
      przeprowadzStudium(
        { runId: 'lf-1', warianty: ['bus-a', 'bus-b'], catalogItemId: 'conv-pv-2mw', operatorId: 'pse' },
        klient,
        (z) => zdarzenia.push(z),
      ),
    ).resolves.toBeUndefined();

    // Wszystkie fazy nadal zostały wywołane (bez wczesnego przerwania).
    expect(wywolania).toEqual([
      'zdolnosc:bus-a',
      'obszar:bus-a',
      'pokrycie',
      'zdolnosc:bus-b',
      'obszar:bus-b',
      'pokrycie',
    ]);
    // Faza obszaru bus-a to błąd z komunikatem końcówki.
    const bladObszaru = zdarzenia.find(
      (z) => z.typ === 'blad' && z.busRef === 'bus-a' && z.faza === 'obszar',
    );
    expect(bladObszaru).toBeDefined();
    expect(bladObszaru && bladObszaru.typ === 'blad' ? bladObszaru.komunikat : '').toBe(
      'Błąd siatki P–Q',
    );
    // bus-b w pełni gotowy mimo błędu bus-a.
    const sukcesObszarB = zdarzenia.find(
      (z) => z.typ === 'sukces' && z.busRef === 'bus-b' && z.faza === 'obszar',
    );
    expect(sukcesObszarB).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Reducer zdarzeń
// ---------------------------------------------------------------------------

describe('studiumModel — stan i reducer zdarzeń', () => {
  it('stan początkowy: warianty w kolejności wyboru, wszystkie fazy „oczekuje"', () => {
    const stan = stanPoczatkowyStudium(['bus-b', 'bus-a']);
    expect([...stan.keys()]).toEqual(['bus-b', 'bus-a']);
    const wariant = stan.get('bus-b')!;
    expect(wariant.zdolnosc.status).toBe('oczekuje');
    expect(wariant.obszar.status).toBe('oczekuje');
    expect(wariant.pokrycie.status).toBe('oczekuje');
  });

  it('zdarzenie sukcesu aktualizuje właściwą fazę i zapisuje dane (immutable)', () => {
    const stan = stanPoczatkowyStudium(['bus-a']);
    const nowy = zastosujZdarzenieStudium(stan, {
      typ: 'sukces',
      busRef: 'bus-a',
      faza: 'zdolnosc',
      dane: widokZdolnosciFixture(),
    });
    expect(nowy).not.toBe(stan);
    expect(stan.get('bus-a')!.zdolnosc.status).toBe('oczekuje'); // wejście nietknięte
    expect(nowy.get('bus-a')!.zdolnosc.status).toBe('gotowe');
    expect(nowy.get('bus-a')!.zdolnosc.dane).not.toBeNull();
    expect(nowy.get('bus-a')!.obszar.status).toBe('oczekuje'); // inne fazy bez zmian
  });

  it('zdarzenie błędu ustawia status „blad" i komunikat', () => {
    const stan = stanPoczatkowyStudium(['bus-a']);
    const nowy = zastosujZdarzenieStudium(stan, {
      typ: 'blad',
      busRef: 'bus-a',
      faza: 'pokrycie',
      komunikat: 'Typ nie ma krzywej producenta',
    });
    expect(nowy.get('bus-a')!.pokrycie.status).toBe('blad');
    expect(nowy.get('bus-a')!.pokrycie.komunikat).toBe('Typ nie ma krzywej producenta');
  });

  it('zdarzenie dla nieznanego wariantu zwraca stan bez zmian', () => {
    const stan = stanPoczatkowyStudium(['bus-a']);
    const nowy = zastosujZdarzenieStudium(stan, { typ: 'start', busRef: 'bus-x', faza: 'obszar' });
    expect(nowy).toBe(stan);
  });

  it('wariantWToku wykrywa fazę w toku', () => {
    let stan = stanPoczatkowyStudium(['bus-a']);
    expect(wariantWToku(stan.get('bus-a')!)).toBe(false);
    stan = zastosujZdarzenieStudium(stan, { typ: 'start', busRef: 'bus-a', faza: 'obszar' });
    expect(wariantWToku(stan.get('bus-a')!)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Odczyty pomocnicze
// ---------------------------------------------------------------------------

describe('studiumModel — odczyty (wierzchołek najbliższy, pasmo Q, werdykt)', () => {
  it('wierzcholekNajblizszy dobiera istniejący p_mw najbliższy celowi; remis → niższy indeks', () => {
    const widok = widokObszaruFixture(); // p_mw: 0.0, 0.5, 1.0
    expect(wierzcholekNajblizszy(widok.vertices, 0.6)?.p_mw).toBe(0.5);
    expect(wierzcholekNajblizszy(widok.vertices, 5.0)?.p_mw).toBe(1.0);
    // Remis: cel 0.25 równoodległy od 0.0 i 0.5 → niższy indeks (0.0).
    expect(wierzcholekNajblizszy(widok.vertices, 0.25)?.p_mw).toBe(0.0);
    expect(wierzcholekNajblizszy([], 1.0)).toBeNull();
  });

  it('pasmoQwPunkcie zwraca pasmo dopuszczalne z wierzchołka najbliższego mocy typu', () => {
    const widok = widokObszaruFixture();
    // Moc typu ~0.5 → wierzchołek p=0.5, pasmo [-0.75, 0.75].
    expect(pasmoQwPunkcie(widok, 0.5)).toContain('0,750');
  });

  it('pasmoQwPunkcie sygnalizuje brak pasma dla wierzchołka niedopuszczalnego', () => {
    const widok = widokObszaruFixture();
    // Moc typu ~1.0 → wierzchołek p=1.0 feasible=false → „Brak pasma".
    expect(pasmoQwPunkcie(widok, 1.0)).toBe('Brak pasma');
    expect(pasmoQwPunkcie(null, 1.0)).toBe('—');
  });

  it('werdyktPokryciaPL czyta wyłącznie flagę werdyktu', () => {
    expect(werdyktPokryciaPL(widokPokryciaFixture())).toBe('Niepokryte');
    expect(werdyktPokryciaPL(null)).toBe('—');
  });

  it('wezelWariantu odnajduje węzeł po bus_ref', () => {
    const widok = widokZdolnosciFixture();
    expect(wezelWariantu(widok, 'bus-a')?.bus_ref).toBe('bus-a');
    expect(wezelWariantu(widok, 'bus-x')).toBeNull();
    expect(wezelWariantu(null, 'bus-a')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tabela przeglądu zbiorczego
// ---------------------------------------------------------------------------

function stanZWynikami(): StanStudium {
  let stan = stanPoczatkowyStudium(['bus-a', 'bus-b']);
  const zdarzenia: ZdarzenieStudium[] = [
    { typ: 'sukces', busRef: 'bus-a', faza: 'zdolnosc', dane: widokZdolnosciFixture() },
    { typ: 'sukces', busRef: 'bus-a', faza: 'obszar', dane: widokObszaruFixture() },
    { typ: 'sukces', busRef: 'bus-a', faza: 'pokrycie', dane: widokPokryciaFixture() },
  ];
  for (const z of zdarzenia) stan = zastosujZdarzenieStudium(stan, z);
  return stan;
}

const kontekst: KontekstWierszaStudium = {
  nazwaWezla: (busRef) => (busRef === 'bus-a' ? 'Szyna A' : 'Szyna B'),
  napiecieWezla: () => 15,
  klasy: katalogStudiumFixture().operators[0].module_types,
  mocZrodlaMW: 2.0,
};

describe('studiumModel — tabela przeglądu', () => {
  it('kolumny obejmują moc, straty, klasę, pokrycie i pasmo Q; identyfikator ekspercki', () => {
    const kolumny = kolumnyStudium();
    const klucze = kolumny.map((k) => k.klucz);
    expect(klucze).toEqual([
      'wariant',
      'identyfikator',
      'moc',
      'straty',
      'klasa',
      'pokrycie',
      'pasmoQ',
    ]);
    expect(kolumny.find((k) => k.klucz === 'identyfikator')?.tylkoEkspercki).toBe(true);
  });

  it('wiersze w kolejności wyboru; wartości wyłącznie z odpowiedzi backendu', () => {
    const wiersze = wierszeStudium(stanZWynikami(), kontekst);
    expect(wiersze).toHaveLength(2);
    // bus-a: moc 1,5 MW; klasa C (1500 kW ∈ [1000, 50000)); werdykt Niepokryte.
    expect(wiersze[0].wariant.wartosc).toBe('Szyna A');
    expect(wiersze[0].moc.wartosc).toBe('1,500');
    expect(wiersze[0].klasa.wartosc).toBe('C');
    expect(wiersze[0].pokrycie.wartosc).toBe('Niepokryte');
    // Pasmo Q w punkcie mocy typu (2,0 MW → wierzchołek 1,0 niedopuszczalny) → Brak pasma.
    expect(wiersze[0].pasmoQ.wartosc).toBe('Brak pasma');
  });

  it('wiersz bez ukończonych analiz pokazuje „—" (bez ocen lokalnych)', () => {
    const wiersze = wierszeStudium(stanZWynikami(), kontekst);
    // bus-b nie ma danych żadnej fazy.
    expect(wiersze[1].wariant.wartosc).toBe('Szyna B');
    expect(wiersze[1].moc.wartosc).toBe('—');
    expect(wiersze[1].klasa.wartosc).toBe('—');
    expect(wiersze[1].pokrycie.wartosc).toBe('—');
    expect(wiersze[1].pasmoQ.wartosc).toBe('—');
  });
});
