/*
 * Testy czystych adapterów okna „Krzywe zdolności P–Q" (karta P41). Weryfikują
 * odwzorowanie odpowiedzi backendu na struktury prezentacji (opcje doboru, punkty
 * wykresu, kolumny/wiersze wzorca tabeli, kroki śladu WHITE BOX) — bez ocen lokalnych
 * (punkt nie ma statusu; ocenę niesie rekord `ocena` backendu), deterministycznie, z
 * formaterem PL (przecinek). Dane: fixtury policzone backendem.
 */

import { describe, expect, it } from 'vitest';

import {
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
  widokBezKrzywejFixture,
  widokPokryciaFixture,
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
  it('kolumny wzorca: liczby z jednostkami, bez kolumny statusu punktu', () => {
    const klucze = kolumnyTabeliPQ().map((k) => k.klucz);
    expect(klucze).toEqual(['moc', 'pasmo', 'wymaganie', 'zapasDolny', 'zapasGorny', 'margines']);
    for (const klucz of ['zapasDolny', 'zapasGorny', 'margines']) {
      expect(kolumnyTabeliPQ().find((k) => k.klucz === klucz)?.jednostka).toBe('Mvar');
    }
  });

  it('wiersz punktu = liczby backendu (zapasy dolny/górny i zapas punktu), bez statusu i tagu', () => {
    const widok = widokPokryciaFixture();
    const wiersze = wierszeTabeliPQ(widok);
    expect(wiersze).toHaveLength(widok.punkty.length);
    widok.punkty.forEach((pt, i) => {
      expect(wiersze[i].margines.sortKey).toBe(pt.margines_mvar);
      expect(wiersze[i].zapasDolny.sortKey).toBe(pt.zapas_dolny_mvar);
      expect(wiersze[i].zapasGorny.sortKey).toBe(pt.zapas_gorny_mvar);
      expect(Object.keys(wiersze[i])).not.toContain('status');
      expect(Object.values(wiersze[i]).some((k) => 'ostrzezenie' in k)).toBe(false);
    });
    expect(wiersze[0].moc.wartosc).toBe('0,000');
    expect(wiersze[0].pasmo.wartosc).toBe('-1,890 … 1,890');
    expect(wiersze[0].wymaganie.wartosc).toBe('-1,040 … 1,040');
    expect(wiersze[3].margines.wartosc).toBe('-0,409');
  });

  it('typ bez krzywej producenta: zero wierszy (brak nazywa rekord oceny)', () => {
    expect(wierszeTabeliPQ(widokBezKrzywejFixture())).toEqual([]);
    expect(widokBezKrzywejFixture().ocena.wyjasnienie.czego_brakuje.join(' ')).toContain('pq_curve');
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
    const slad = widokPokryciaFixture().slad_whitebox;
    expect(kroki[1].formula_latex).toBe(slad.wzor);
    expect(kroki[1].result_pl).toBe(slad.wynik);
    // podstawienie łączy wszystkie punkty (ślad audytu)
    expect(kroki[1].substitution_pl).toContain('p=3.15 MW');
  });
});
