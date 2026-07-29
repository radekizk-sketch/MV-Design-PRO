/*
 * Testy modelu okna „Wniosek OSD" (karta W-707): filtry przebiegów, domyślny
 * wybór, uczciwa bramka kompletności (każdy powód blokady) oraz budowa żądania
 * (przycięcie pól, opcjonalne → null). Czyste funkcje — bez DOM, bez API.
 */
import { describe, it, expect } from 'vitest';

import { WNIOSEK_STRINGS, nazwaPlikuWniosku, statusWalidacjiWniosekPL } from '../strings';
import {
  domyslnyPrzebieg,
  powodBlokadyWniosku,
  przebiegiRozplywu,
  przebiegiZwarciowe,
  zbudujZadanieWniosku,
} from '../model';
import { przebiegFixture, wejscieModuluFixture } from './fixtures';

describe('model wniosku — filtry przebiegów', () => {
  it('przebiegiRozplywu: tylko LOAD_FLOW/DONE, ignoruje zwarcia i niezakończone', () => {
    const runs = [
      przebiegFixture('lf-1', 'LOAD_FLOW'),
      przebiegFixture('lf-2', 'LOAD_FLOW', 'RUNNING'),
      przebiegFixture('sc-1', 'SC_3F'),
    ];
    expect(przebiegiRozplywu(runs).map((r) => r.id)).toEqual(['lf-1']);
  });

  it('przebiegiZwarciowe: tylko SC_*/DONE, ignoruje rozpływ i niezakończone', () => {
    const runs = [
      przebiegFixture('sc-1', 'SC_3F'),
      przebiegFixture('sc-2', 'SC_3F', 'FAILED'),
      przebiegFixture('lf-1', 'LOAD_FLOW'),
    ];
    expect(przebiegiZwarciowe(runs).map((r) => r.id)).toEqual(['sc-1']);
  });

  it('domyslnyPrzebieg: preferuje aktywny, inaczej ostatni z listy; null gdy pusto', () => {
    const runs = [przebiegFixture('a', 'LOAD_FLOW'), przebiegFixture('b', 'LOAD_FLOW')];
    expect(domyslnyPrzebieg(runs, 'a')).toBe('a');
    expect(domyslnyPrzebieg(runs, null)).toBe('b');
    expect(domyslnyPrzebieg([], null)).toBeNull();
  });
});

describe('model wniosku — bramka kompletności (powody blokady)', () => {
  const kompletne = {
    pfRunId: 'lf-1',
    scRunId: 'sc-1',
    busRef: 'bus-1',
    nazwaProjektu: 'Projekt A',
    maBiegNcRfg: true,
  };

  it('brak biegu NC RfG → powód o teście zgodności', () => {
    expect(powodBlokadyWniosku({ ...kompletne, maBiegNcRfg: false })).toBe(
      WNIOSEK_STRINGS.blokadaNcRfg,
    );
  });

  it('brak przebiegu rozpływu → powód o rozpływie', () => {
    expect(powodBlokadyWniosku({ ...kompletne, pfRunId: null })).toBe(
      WNIOSEK_STRINGS.blokadaBrakRozplywu,
    );
  });

  it('brak przebiegu zwarciowego → powód o zwarciu', () => {
    expect(powodBlokadyWniosku({ ...kompletne, scRunId: null })).toBe(
      WNIOSEK_STRINGS.blokadaBrakZwarcia,
    );
  });

  it('pusty węzeł (same spacje) → powód o węźle', () => {
    expect(powodBlokadyWniosku({ ...kompletne, busRef: '   ' })).toBe(
      WNIOSEK_STRINGS.blokadaBrakWezla,
    );
  });

  it('pusta nazwa projektu → powód o nazwie projektu', () => {
    expect(powodBlokadyWniosku({ ...kompletne, nazwaProjektu: '  ' })).toBe(
      WNIOSEK_STRINGS.blokadaBrakProjektu,
    );
  });

  it('formularz kompletny → brak blokady (null)', () => {
    expect(powodBlokadyWniosku(kompletne)).toBeNull();
  });
});

describe('model wniosku — budowa żądania', () => {
  it('zbudujZadanieWniosku: przycina pola, zamienia opcjonalne puste na null', () => {
    const zadanie = zbudujZadanieWniosku({
      pfRunId: 'lf-1',
      scRunId: 'sc-1',
      busRef: '  bus-1  ',
      identyfikacja: {
        nazwaProjektu: '  Projekt A  ',
        nazwaPrzypadku: '   ',
        wnioskodawca: 'Firma',
        adres: '',
      },
      modules: [wejscieModuluFixture()],
      procedureVersion: 'PTPiREE 2024',
    });
    expect(zadanie.nazwa_projektu).toBe('Projekt A');
    expect(zadanie.bus_ref).toBe('bus-1');
    expect(zadanie.nazwa_przypadku).toBeNull();
    expect(zadanie.wnioskodawca).toBe('Firma');
    expect(zadanie.adres_przylaczenia).toBeNull();
    expect(zadanie.pf_run_id).toBe('lf-1');
    expect(zadanie.sc_run_id).toBe('sc-1');
    expect(zadanie.run_request.modules).toHaveLength(1);
    expect(zadanie.run_request.procedure_version).toBe('PTPiREE 2024');
  });
});

describe('model wniosku — formatery i nazewnictwo', () => {
  it('nazwaPlikuWniosku: format wniosek-osd-RRRR-MM-DD.docx (data jako argument)', () => {
    expect(nazwaPlikuWniosku(new Date(2026, 6, 17))).toBe('wniosek-osd-2026-07-17.docx');
  });

  it('statusWalidacjiWniosekPL: mapuje kody backendu na etykiety PL', () => {
    expect(statusWalidacjiWniosekPL('PASS')).toBe('spełnia');
    expect(statusWalidacjiWniosekPL('FAIL')).toBe('nie spełnia');
    expect(statusWalidacjiWniosekPL('NIEZNANY')).toBe('NIEZNANY');
  });
});
