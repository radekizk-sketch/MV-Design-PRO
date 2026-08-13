/*
 * Test kolektora rejestru „Co wymaga uwagi" (karta A1 / V12K-098).
 * `przekroczeniaRozplywu` — czysta projekcja szyn z napięciem poza przedziałem
 * na znormalizowaną pozycję przekroczenia. Werdykt spójny z adapterem tabeli szyn.
 */
import { describe, it, expect } from 'vitest';

import { przekroczeniaRozplywu, przekroczeniaWerdyktu, przekroczeniaZbieznosci } from '../model';
import type { PozycjaWerdyktu, WerdyktResponse } from '../../werdykt/api';
import { CO_WYMAGA_UWAGI_STRINGS as T } from '../strings';
import { busResultFixture, powerFlowResultFixture } from '../../rozplyw/__tests__/fixtures';

describe('przekroczeniaRozplywu — konsolidacja przekroczeń napięć szyn', () => {
  it('null (brak wyniku) → pusta lista', () => {
    expect(przekroczeniaRozplywu(null)).toEqual([]);
  });

  it('wszystkie szyny w przedziale → brak przekroczeń', () => {
    const wynik = powerFlowResultFixture({
      bus_results: [busResultFixture({ v_pu: 1.0 }), busResultFixture({ bus_id: 'SZ-2', v_pu: 0.97 })],
    });
    expect(przekroczeniaRozplywu(wynik)).toEqual([]);
  });

  it('szyna poniżej 0,95 p.u. → przekroczenie „napięcie niskie", element Bus', () => {
    const wynik = powerFlowResultFixture({
      bus_results: [busResultFixture({ bus_id: 'SZ-ST2', v_pu: 0.941 })],
    });
    const [p] = przekroczeniaRozplywu(wynik);
    expect(p).toMatchObject({
      analizaPL: T.analizaRozplyw,
      elementRef: 'SZ-ST2',
      elementTyp: 'Bus',
      elementNazwa: 'SZ-ST2',
      opis: T.opisNapiecieNiskie,
      rodzaj: 'napiecie',
    });
    expect(p.wartosc).toContain('0,9410');
    expect(p.klucz).toBe('rozplyw::napiecie::SZ-ST2');
  });

  it('szyna powyżej 1,05 p.u. → przekroczenie „napięcie wysokie"', () => {
    const wynik = powerFlowResultFixture({
      bus_results: [busResultFixture({ bus_id: 'SZ-GEN', v_pu: 1.062 })],
    });
    const [p] = przekroczeniaRozplywu(wynik);
    expect(p.opis).toBe(T.opisNapiecieWysokie);
  });

  it('filtruje tylko szyny poza przedziałem, zachowując kolejność źródłową', () => {
    const wynik = powerFlowResultFixture({
      bus_results: [
        busResultFixture({ bus_id: 'A', v_pu: 1.0 }),
        busResultFixture({ bus_id: 'B', v_pu: 0.94 }),
        busResultFixture({ bus_id: 'C', v_pu: 1.06 }),
      ],
    });
    expect(przekroczeniaRozplywu(wynik).map((p) => p.elementRef)).toEqual(['B', 'C']);
  });

  it('jest deterministyczne: to samo wejście → identyczne wyjście', () => {
    const wynik = powerFlowResultFixture();
    expect(przekroczeniaRozplywu(wynik)).toEqual(przekroczeniaRozplywu(wynik));
  });
});

/*
 * K6 / H-5 pkt 5: rejestr zbiera także (a) zbieżność rozpływu — pole kontraktu
 * solvera, oraz (b) kryteria NARUSZONE werdyktu projektowego (obciążenia
 * gałęzi/transformatorów, wytrzymałość cieplna, wiarygodność zwarciowa, bilans
 * mocy biernej) — jedyne źródło zbierające biegi rozpływu i zwarć w jeden osąd.
 */
describe('przekroczeniaZbieznosci — brak zbieżności to przekroczenie (lit. d)', () => {
  it('wynik zbieżny → brak pozycji', () => {
    expect(przekroczeniaZbieznosci(powerFlowResultFixture({ converged: true }))).toEqual([]);
  });

  it('brak wyniku → brak pozycji', () => {
    expect(przekroczeniaZbieznosci(null)).toEqual([]);
  });

  it('wynik niezbieżny → pozycja bez elementu, z adresem okna „Zbieżność"', () => {
    const [p] = przekroczeniaZbieznosci(
      powerFlowResultFixture({ converged: false, iterations_count: 50 }),
    );
    expect(p).toMatchObject({
      klucz: 'rozplyw::zbieznosc',
      elementRef: null,
      elementTyp: null,
      zakladkaWynikow: 'zbieznosc',
    });
    expect(p.wartosc).toContain('50');
  });
});

function pozycjaWerdyktu(over: Partial<PozycjaWerdyktu> = {}): PozycjaWerdyktu {
  return {
    kryterium_id: 'galaz.obciazenie_dlugotrwale',
    etap: 'E5',
    nazwa_pl: 'Obciążenie długotrwałe gałęzi',
    warunek_pl: 'I ≤ Idd',
    norma_pl: 'PN-EN 50160',
    zrodlo: 'PF',
    element_rodzaj: 'galaz_liniowa',
    stan: 'NARUSZONE',
    liczba_ocenionych: 12,
    liczba_naruszen: 2,
    liczba_niesprawdzonych: 0,
    liczba_ostrzezen: 1,
    wiodacy_element_id: 'L-07',
    wiodacy_opis_pl: 'Gałąź L-07 obciążona w 118%',
    powod_kod: null,
    powod_pl: null,
    run_id: 'run-1',
    ...over,
  };
}

function werdyktFixture(pozycje: PozycjaWerdyktu[]): WerdyktResponse {
  return {
    werdykt: 'NARUSZONE',
    case_id: 'case-1',
    model_hash: 'hash',
    pozycje,
    zrodla: [],
    podsumowanie: { spelnione: 0, naruszone: pozycje.length, niesprawdzone: 0, nie_dotyczy: 0, razem: pozycje.length },
    zakres_poza_automatem: [],
  };
}

describe('przekroczeniaWerdyktu — kryteria projektowe backendu (lit. a-c)', () => {
  it('brak werdyktu → brak pozycji', () => {
    expect(przekroczeniaWerdyktu(null, false)).toEqual([]);
  });

  it('odpowiedź niezgodna z kontraktem (brak tablicy pozycji) → brak pozycji, bez awarii', () => {
    expect(przekroczeniaWerdyktu({} as WerdyktResponse, false)).toEqual([]);
  });

  it('bierze WYŁĄCZNIE kryteria NARUSZONE (spełnione/niesprawdzone pomijane)', () => {
    const werdykt = werdyktFixture([
      pozycjaWerdyktu({ kryterium_id: 'a', stan: 'NARUSZONE' }),
      pozycjaWerdyktu({ kryterium_id: 'b', stan: 'SPELNIONE' }),
      pozycjaWerdyktu({ kryterium_id: 'c', stan: 'NIESPRAWDZONE' }),
    ]);
    expect(przekroczeniaWerdyktu(werdykt, false).map((p) => p.klucz)).toEqual(['werdykt::a']);
  });

  it('mapuje element wiodący na typ UI i rodzaj akcji naprawczej', () => {
    const [p] = przekroczeniaWerdyktu(werdyktFixture([pozycjaWerdyktu()]), false);
    expect(p).toMatchObject({
      elementRef: 'L-07',
      elementTyp: 'LineBranch',
      rodzaj: 'obciazalnosc-galezi',
      opis: 'Gałąź L-07 obciążona w 118%',
    });
    expect(p.wartosc).toContain('2');
  });

  it('kryterium bez elementu modelu → pozycja bez adresu elementowego (zero zgadywania)', () => {
    const [p] = przekroczeniaWerdyktu(
      werdyktFixture([
        pozycjaWerdyktu({
          kryterium_id: 'straty.budzet',
          element_rodzaj: null,
          wiodacy_element_id: null,
        }),
      ]),
      false,
    );
    expect(p.elementRef).toBeNull();
    expect(p.elementTyp).toBeNull();
  });

  it('deduplikacja: kryterium napięciowe pomijane, gdy rejestr ma już szyny z rozpływu', () => {
    const werdykt = werdyktFixture([
      pozycjaWerdyktu({ kryterium_id: 'napiecie.odchylenie', element_rodzaj: 'szyna', wiodacy_element_id: 'SZ-1' }),
      pozycjaWerdyktu({ kryterium_id: 'galaz.obciazenie_dlugotrwale' }),
    ]);
    expect(przekroczeniaWerdyktu(werdykt, true).map((p) => p.klucz)).toEqual([
      'werdykt::galaz.obciazenie_dlugotrwale',
    ]);
    expect(przekroczeniaWerdyktu(werdykt, false)).toHaveLength(2);
  });
});
