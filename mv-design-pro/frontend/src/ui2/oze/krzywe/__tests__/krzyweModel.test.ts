/*
 * Testy czystych adapterów okna „Krzywe zdolności P–Q" (karta P41). Weryfikują
 * odwzorowanie odpowiedzi backendu na struktury prezentacji (opcje doboru, punkty
 * wykresu, kolumny/wiersze wzorca tabeli, kroki śladu WHITE BOX, istotność
 * werdyktu) — bez ocen lokalnych, deterministycznie, z formaterem PL (przecinek).
 */

import { describe, expect, it } from 'vitest';

import {
  istotnoscWerdyktuPQ,
  kolumnyTabeliPQ,
  krokiSladuPQ,
  opcjeOperatorowPQ,
  opcjeTypowPQ,
  punktyWykresuPQ,
  typMaKrzywaPQ,
  wierszeTabeliPQ,
} from '../krzyweModel';
import {
  katalogNcRfgFixture,
  rekordyKonwerterowFixture,
  widokPokryciaFixture,
  widokPokryteFixture,
} from './fixtures';

describe('typMaKrzywaPQ / opcjeTypowPQ', () => {
  it('rozpoznaje obecność krzywej producenta po polu pq_curve', () => {
    const [zKrzywa, bezKrzywej] = rekordyKonwerterowFixture();
    expect(typMaKrzywaPQ(zKrzywa)).toBe(true);
    expect(typMaKrzywaPQ(bezKrzywej)).toBe(false);
  });

  it('opcje typów: typy bez krzywej dostają adnotację „brak krzywej producenta"', () => {
    const opcje = opcjeTypowPQ(rekordyKonwerterowFixture());
    expect(opcje[0].maKrzywa).toBe(true);
    expect(opcje[0].etykieta).not.toContain('brak krzywej producenta');
    expect(opcje[1].maKrzywa).toBe(false);
    expect(opcje[1].etykieta).toContain('brak krzywej producenta');
  });

  it('traktuje pustą krzywą jako brak krzywej producenta', () => {
    const [zKrzywa] = rekordyKonwerterowFixture();
    expect(typMaKrzywaPQ({ ...zKrzywa, pq_curve: [] })).toBe(false);
  });
});

describe('opcjeOperatorowPQ', () => {
  it('mapuje operatorów na opcje z nazwą PL na pierwszym planie', () => {
    const opcje = opcjeOperatorowPQ(katalogNcRfgFixture().operators);
    expect(opcje).toEqual([
      { id: 'pse', etykieta: 'PSE — Polskie Sieci Elektroenergetyczne' },
      { id: 'pge', etykieta: 'PGE Dystrybucja' },
    ]);
  });
});

describe('punktyWykresuPQ', () => {
  it('odwzorowuje pasmo producenta (q_min/q_max) w kolejności źródłowej (rosnące P)', () => {
    const punkty = punktyWykresuPQ(widokPokryciaFixture());
    expect(punkty).toHaveLength(4);
    expect(punkty[0]).toEqual({ p: 0.0, qMin: -1.89, qMax: 1.89 });
    expect(punkty[3]).toEqual({ p: 3.15, qMin: -0.63, qMax: 0.63 });
  });
});

describe('kolumnyTabeliPQ / wierszeTabeliPQ', () => {
  it('kolumny wzorca mają jednostki i klucze zgodne z kartą', () => {
    const klucze = kolumnyTabeliPQ().map((k) => k.klucz);
    expect(klucze).toEqual(['moc', 'pasmo', 'wymaganie', 'margines', 'status']);
    const margines = kolumnyTabeliPQ().find((k) => k.klucz === 'margines');
    expect(margines?.jednostka).toBe('Mvar');
  });

  it('wiersz punktu pokrytego: margines bez tagu, status „Pokryty"', () => {
    const wiersze = wierszeTabeliPQ(widokPokryciaFixture());
    expect(wiersze[0].moc.wartosc).toBe('0,000');
    expect(wiersze[0].pasmo.wartosc).toBe('-1,890 … 1,890');
    expect(wiersze[0].wymaganie.wartosc).toBe('-1,040 … 1,040');
    expect(wiersze[0].margines.sortKey).toBe(0.8505);
    expect(wiersze[0].status.wartosc).toBe('Pokryty');
    expect(wiersze[0].status.ostrzezenie).toBe(false);
  });

  it('wiersz punktu niepokrytego: tag ostrzeżenia z flagi backendu (bez oceny lokalnej)', () => {
    const wiersze = wierszeTabeliPQ(widokPokryciaFixture());
    const ostatni = wiersze[3];
    expect(ostatni.status.wartosc).toBe('Niepokryty');
    expect(ostatni.status.ostrzezenie).toBe(true);
    expect(ostatni.margines.wartosc).toBe('-0,409');
    expect(ostatni.margines.sortKey).toBe(-0.4095);
  });
});

describe('krokiSladuPQ (adapter do SladAnalizy)', () => {
  it('buduje dwa kroki: wyznaczenie wymagania i porównanie pasm', () => {
    const kroki = krokiSladuPQ(widokPokryciaFixture());
    expect(kroki).toHaveLength(2);
    expect(kroki[0].symbol).toBe('wymaganie');
    expect(kroki[0].result_pl).toContain('Mvar');
    expect(kroki[1].symbol).toBe('pokrycie');
    // formuła i wynik przenoszone dosłownie z backendu
    expect(kroki[1].formula_latex).toContain('punkt pokryty');
    expect(kroki[1].result_pl).toBe('NIEPOKRYTE: 3/4 punktow.');
    // podstawienie łączy wszystkie punkty (ślad audytu)
    expect(kroki[1].substitution_pl).toContain('p=3.15 MW');
  });
});

describe('istotnoscWerdyktuPQ', () => {
  it('niepokryte → err, pokryte → ok (czyta flagę backendu)', () => {
    expect(istotnoscWerdyktuPQ(widokPokryciaFixture())).toBe('err');
    expect(istotnoscWerdyktuPQ(widokPokryteFixture())).toBe('ok');
  });
});
