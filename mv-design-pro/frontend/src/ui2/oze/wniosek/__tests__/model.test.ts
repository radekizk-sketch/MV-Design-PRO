/**
 * Model okna „Wniosek OSD" na kontrakcie V2 (karta AB-1a Pakiet D2 §5): filtry rejestru
 * przebiegów, bramka kompletności (przypadek → operator → rozpływ → zwarcie → węzeł →
 * projekt) i ciało `WniosekOsdRequest` (bez biegu zgodności w ciele — zgodność z modelu przypadku).
 */

import { describe, expect, it } from 'vitest';

import {
  domyslnyPrzebieg,
  powodBlokadyWniosku,
  przebiegiRozplywu,
  przebiegiZwarciowe,
  zbudujZadanieWniosku,
} from '../model';
import { WNIOSEK_STRINGS, fmtLiczbaWniosku, fmtZJednostkaWniosku, nazwaPlikuWniosku } from '../strings';
import { przebiegFixture, przebiegiMagazynu } from './fixtures';

describe('filtry przebiegów', () => {
  const runs = [
    przebiegFixture('pf-1', 'LOAD_FLOW'),
    przebiegFixture('pf-2', 'LOAD_FLOW', 'RUNNING'),
    przebiegFixture('sc-1', 'SC_3F'),
    przebiegFixture('sc-2', 'SC_1F', 'FAILED'),
  ];
  it('przebiegiRozplywu: LOAD_FLOW/DONE; przebiegiZwarciowe: SC_*/DONE', () => {
    expect(przebiegiRozplywu(runs).map((r) => r.id)).toEqual(['pf-1']);
    expect(przebiegiZwarciowe(runs).map((r) => r.id)).toEqual(['sc-1']);
  });
  it('rejestr sceny (to_execution_dict backendu) daje dokładnie jeden rozpływ i jedno zwarcie', () => {
    expect(przebiegiRozplywu(przebiegiMagazynu())).toHaveLength(1);
    expect(przebiegiZwarciowe(przebiegiMagazynu())).toHaveLength(1);
  });
  it('domyslnyPrzebieg: aktywny › ostatni; pusta lista → null', () => {
    const kandydaci = [przebiegFixture('a', 'LOAD_FLOW'), przebiegFixture('b', 'LOAD_FLOW')];
    expect(domyslnyPrzebieg(kandydaci, 'a')).toBe('a');
    expect(domyslnyPrzebieg(kandydaci, 'x')).toBe('b');
    expect(domyslnyPrzebieg([], 'a')).toBeNull();
  });
});

describe('bramka kompletności — kolejność powodów', () => {
  const pelne = {
    caseId: 'case-demo',
    operatorId: 'enea',
    pfRunId: 'pf',
    scRunId: 'sc',
    busRef: 'szyna',
    nazwaProjektu: 'Projekt',
  };
  it.each([
    ['brak przypadku', { ...pelne, caseId: null, operatorId: null }, WNIOSEK_STRINGS.blokadaBrakPrzypadku],
    ['brak operatora', { ...pelne, operatorId: null, pfRunId: null }, WNIOSEK_STRINGS.blokadaBrakOperatora],
    ['brak rozpływu', { ...pelne, pfRunId: null, scRunId: null }, WNIOSEK_STRINGS.blokadaBrakRozplywu],
    ['brak zwarcia', { ...pelne, scRunId: null }, WNIOSEK_STRINGS.blokadaBrakZwarcia],
    ['węzeł z samych spacji', { ...pelne, busRef: '   ' }, WNIOSEK_STRINGS.blokadaBrakWezla],
    ['pusta nazwa projektu', { ...pelne, nazwaProjektu: ' ' }, WNIOSEK_STRINGS.blokadaBrakProjektu],
    ['formularz kompletny', pelne, null],
  ] as const)('%s', (_opis, wejscie, oczekiwane) => {
    expect(powodBlokadyWniosku(wejscie)).toBe(oczekiwane);
  });
});

describe('zbudujZadanieWniosku — pola WniosekOsdRequest', () => {
  it('przycina pola, puste opcjonalne → null, operator z argumentu, bez biegu zgodności w ciele', () => {
    const zadanie = zbudujZadanieWniosku({
      pfRunId: 'pf',
      scRunId: 'sc',
      busRef: ' szyna ',
      identyfikacja: { nazwaProjektu: ' Projekt ', nazwaPrzypadku: ' ', wnioskodawca: 'Inwestor', adres: '' },
      operatorId: 'enea',
    });
    expect(zadanie).toEqual({
      nazwa_projektu: 'Projekt',
      nazwa_przypadku: null,
      wnioskodawca: 'Inwestor',
      adres_przylaczenia: null,
      pf_run_id: 'pf',
      sc_run_id: 'sc',
      bus_ref: 'szyna',
      operator_id: 'enea',
    });
  });
});

describe('formatery i nazwa pliku', () => {
  it('nazwaPlikuWniosku: wniosek-osd-RRRR-MM-DD.<format>', () => {
    expect(nazwaPlikuWniosku(new Date(2026, 8, 3), 'docx')).toBe('wniosek-osd-2026-09-03.docx');
    expect(nazwaPlikuWniosku(new Date(2026, 8, 3), 'pdf')).toBe('wniosek-osd-2026-09-03.pdf');
  });
  it('liczby z przecinkiem PL; brak wartości → kreska', () => {
    expect(fmtLiczbaWniosku(9.6923, 2)).toBe('9,69');
    expect(fmtZJednostkaWniosku(null, 'kA')).toBe(WNIOSEK_STRINGS.kreska);
    expect(fmtZJednostkaWniosku(251.8, 'MVA', 1)).toBe('251,8 MVA');
  });
});
