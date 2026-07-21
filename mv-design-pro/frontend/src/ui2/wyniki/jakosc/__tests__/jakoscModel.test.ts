import { describe, expect, it } from 'vitest';
import {
  KLUCZ_WIARYGODNOSCI_WEZEL,
  KLUCZ_WIERSZA_WALIDACJI,
  KOLUMNY_WALIDACJI,
  KOLUMNY_WIARYGODNOSCI,
  jestPrzebiegiemZwarciowym,
  kluczWalidacji,
  naWierszeWalidacji,
  naWierszeWiarygodnosci,
  naZalozeniaWalidacji,
  naZalozeniaWiarygodnosci,
  przebiegRozplywu,
  przebiegZwarciowy,
  typElementuWalidacji,
} from '../jakoscModel';
import { WALIDACJA_FIXTURE, WIARYGODNOSC_FIXTURE, przebiegTestowy } from './fixtures';

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
