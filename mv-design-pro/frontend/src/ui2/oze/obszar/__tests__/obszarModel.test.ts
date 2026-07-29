/*
 * Testy adapterów modelu okna „Obszar bezpiecznej pracy P–Q" (karta P30).
 * Weryfikują czyste odwzorowanie odpowiedzi pq-area na struktury prezentacji:
 * opis granic PL, wykrycie braku pasma, punkty wykresu (z nakładką producenta),
 * wiersze tabeli wzorcowej oraz zredukowany ślad WHITE BOX. Zero fizyki, zero
 * ocen lokalnych — wszystko z fixture 1:1 z backendem.
 */

import { describe, expect, it } from 'vitest';

import {
  brakPasma,
  elementGranicy,
  kolumnyTabeliObszaru,
  krokiSladuObszar,
  opisGranicy,
  progGranicy,
  punktyObszaru,
  rodzajGranicyPL,
  wartoscGranicy,
  wierszeTabeliObszaru,
} from '../obszarModel';
import {
  rekordyKonwerterowFixture,
  widokObszaruFixture,
  widokObszaruZerowePasmoFixture,
} from './fixtures';

describe('obszarModel — opis granic PL', () => {
  it('rodzajGranicyPL mapuje check_type na słownik PL „Jakość wyników"', () => {
    expect(rodzajGranicyPL({ kind: 'voltage', check_type: 'VOLTAGE_DEVIATION' })).toBe(
      'Odchylenie napięcia',
    );
    expect(rodzajGranicyPL({ kind: 'loading', check_type: 'BRANCH_LOADING' })).toBe(
      'Obciążenie gałęzi',
    );
  });

  it('rodzajGranicyPL zwraca opis stanu dla none / non_convergence', () => {
    expect(rodzajGranicyPL({ kind: 'none' })).toContain('Brak');
    expect(rodzajGranicyPL({ kind: 'non_convergence' })).toBe('Niezbieżność rozpływu');
  });

  it('elementGranicy preferuje nazwę elementu nad identyfikatorem', () => {
    expect(
      elementGranicy({ kind: 'loading', element_id: 'ln-1', element_name: 'Linia 1' }),
    ).toBe('Linia 1');
    expect(elementGranicy({ kind: 'none' })).toBeNull();
  });

  it('wartoscGranicy i progGranicy dokładają jednostkę z backendu (przecinek PL)', () => {
    const binding = { kind: 'voltage' as const, observed_value: 1.12, unit: 'pu', limit_fail: 1.1 };
    expect(wartoscGranicy(binding)).toBe('1,120 pu');
    expect(progGranicy(binding)).toBe('1,100 pu');
  });

  it('opisGranicy komponuje rodzaj · element · wartość / próg', () => {
    const opis = opisGranicy({
      kind: 'voltage',
      check_type: 'VOLTAGE_DEVIATION',
      element_id: 'bus-a',
      element_name: 'Szyna A',
      observed_value: 1.12,
      unit: 'pu',
      limit_fail: 1.1,
    });
    expect(opis).toContain('Odchylenie napięcia');
    expect(opis).toContain('Szyna A');
    expect(opis).toContain('1,120 pu');
    expect(opis).toContain('1,100 pu');
  });

  it('opisGranicy dla kind=none zwraca kreskę', () => {
    expect(opisGranicy({ kind: 'none' })).toBe('—');
  });
});

describe('obszarModel — brak pasma pracy', () => {
  it('wierzchołek niedopuszczalny (feasible=false) → brak pasma', () => {
    const widok = widokObszaruFixture();
    expect(brakPasma(widok.vertices[2])).toBe(true);
  });

  it('wierzchołek dopuszczalny z niezerowym pasmem → pasmo pracy', () => {
    const widok = widokObszaruFixture();
    expect(brakPasma(widok.vertices[0])).toBe(false);
  });

  it('pasmo zerowe (q_min = q_max) → brak pasma', () => {
    const widok = widokObszaruZerowePasmoFixture();
    expect(brakPasma(widok.vertices[0])).toBe(true);
  });
});

describe('obszarModel — punkty wykresu', () => {
  it('tylko wierzchołki dopuszczalne dają pasmo Q (niedopuszczalny pominięty)', () => {
    const punkty = punktyObszaru(widokObszaruFixture().vertices);
    expect(punkty).toHaveLength(2);
    expect(punkty[0]).toMatchObject({ p: 0.0, qMin: -1.0, qMax: 1.0 });
    expect(punkty[1]).toMatchObject({ p: 0.5, qMin: -0.75, qMax: 0.75 });
    expect(punkty.some((pt) => pt.p === 1.0)).toBe(false);
  });

  it('nakładka krzywej producenta łączy się po unii P, rosnąco', () => {
    const curve = rekordyKonwerterowFixture()[0].pq_curve!;
    const punkty = punktyObszaru(widokObszaruFixture().vertices, curve);
    // Unia P: 0.0, 0.5 (sieć+producent) oraz 1.0 (tylko producent).
    expect(punkty.map((pt) => pt.p)).toEqual([0.0, 0.5, 1.0]);
    expect(punkty[0]).toMatchObject({ qMin: -1.0, qMax: 1.0, prodMin: -1.89, prodMax: 1.89 });
    expect(punkty[2]).toMatchObject({ prodMin: -1.5, prodMax: 1.5 });
    expect(punkty[2].qMin).toBeUndefined();
  });
});

describe('obszarModel — tabela wierzchołków (wzorzec TabelaWynikow)', () => {
  it('kolumny obejmują moc, Q dop. min/max, granice i status', () => {
    const klucze = kolumnyTabeliObszaru().map((k) => k.klucz);
    expect(klucze).toEqual(['moc', 'qMin', 'qMax', 'granicaDol', 'granicaGor', 'status']);
  });

  it('wiersz dopuszczalny pokazuje wartości Q, granice PL i tag „Pasmo pracy"', () => {
    const wiersze = wierszeTabeliObszaru(widokObszaruFixture());
    const w0 = wiersze[0];
    expect(w0.qMin.wartosc).toBe('-1,000');
    expect(w0.qMax.wartosc).toBe('1,000');
    expect(String(w0.granicaDol.wartosc)).toContain('Odchylenie napięcia');
    expect(String(w0.granicaGor.wartosc)).toContain('Obciążenie gałęzi');
    expect(w0.status.wartosc).toBe('Pasmo pracy');
    expect(w0.status.ostrzezenie).toBe(false);
  });

  it('wiersz niedopuszczalny pokazuje kreski, kryterium środkowe i tag ostrzegawczy', () => {
    const wiersze = wierszeTabeliObszaru(widokObszaruFixture());
    const w2 = wiersze[2];
    expect(w2.qMin.wartosc).toBe('—');
    expect(w2.qMax.wartosc).toBe('—');
    expect(String(w2.granicaDol.wartosc)).toContain('Odchylenie napięcia');
    expect(w2.granicaGor.wartosc).toBe('—');
    expect(w2.status.wartosc).toBe('Brak pasma');
    expect(w2.status.ostrzezenie).toBe(true);
  });
});

describe('obszarModel — zredukowany ślad WHITE BOX', () => {
  it('pierwszy krok podsumowuje siatkę (biegi wykonane / górny limit)', () => {
    const kroki = krokiSladuObszar(widokObszaruFixture());
    expect(kroki[0].symbol).toBe('siatka');
    expect(kroki[0].result_pl).toBe('15 / 693');
  });

  it('kroki wierzchołków niosą pasmo Q lub adnotację braku pasma', () => {
    const kroki = krokiSladuObszar(widokObszaruFixture());
    // 1 krok siatki + 3 wierzchołki.
    expect(kroki).toHaveLength(4);
    expect(kroki[1].result_pl).toContain('pasmo Q');
    expect(kroki[3].result_pl).toContain('brak pasma pracy');
    // Symbole unikalne (klucz React w SladAnalizy).
    const symbole = kroki.map((k) => k.symbol);
    expect(new Set(symbole).size).toBe(symbole.length);
  });
});
