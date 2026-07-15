import { describe, it, expect } from 'vitest';
import {
  mapujModel,
  mapujGotowosc,
  mapujOstatniPrzebieg,
  mapujSpojnosc,
  mapujPrzypadki,
} from '../pulpitAdapter';
import {
  snapshotFixture,
  readinessFixture,
  readinessZBlokadami,
  caseListItem,
  activeCaseFixture,
  runFixture,
} from './fixtures';

describe('pulpitAdapter — mapowania store → model kafli', () => {
  it('mapujModel: sumuje wszystkie tablice elementów, stacje = substations', () => {
    const model = mapujModel(snapshotFixture());
    // 20+18+15+1+40+2+14+10+5+3+0+0 = 128
    expect(model.elementow).toBe(128);
    expect(model.stacje).toBe(14);
  });

  it('mapujModel: „Źródła" = sources + generators (tabela terminologii)', () => {
    const model = mapujModel(snapshotFixture());
    expect(model.zrodla).toBe(3); // sources(1) + generators(2)
  });

  it('mapujModel: uwzględnia opcjonalne branch_points, gdy obecne', () => {
    const model = mapujModel(
      snapshotFixture({ branch_points: [{ ref_id: 'bp-1' }] as never }),
    );
    expect(model.elementow).toBe(129);
  });

  it('mapujGotowosc: gotowa + zerowe liczniki dla pustej gotowości', () => {
    const g = mapujGotowosc(readinessFixture());
    expect(g).toEqual({ gotowa: true, blokady: 0, ostrzezenia: 0 });
  });

  it('mapujGotowosc: liczy blokady i ostrzeżenia', () => {
    const g = mapujGotowosc(readinessZBlokadami());
    expect(g).toEqual({ gotowa: false, blokady: 1, ostrzezenia: 2 });
  });

  it('mapujGotowosc: null → niegotowa, zera (brak zgadywania)', () => {
    expect(mapujGotowosc(null)).toEqual({ gotowa: false, blokady: 0, ostrzezenia: 0 });
  });

  it('mapujOstatniPrzebieg: wybiera najświeższy po started_at (malejąco)', () => {
    const wynik = mapujOstatniPrzebieg([
      runFixture({ id: 'r1', started_at: '2026-07-14T10:00:00Z', status: 'DONE' }),
      runFixture({ id: 'r2', started_at: '2026-07-15T14:32:00Z', status: 'FAILED' }),
    ]);
    expect(wynik?.czasISO).toBe('2026-07-15T14:32:00Z');
    expect(wynik?.statusKod).toBe('FAILED');
    expect(wynik?.analizaPL).toBe('Zwarcie trójfazowe (3F)');
  });

  it('mapujOstatniPrzebieg: pusta lista → null', () => {
    expect(mapujOstatniPrzebieg([])).toBeNull();
  });

  it('mapujOstatniPrzebieg: remis czasu rozstrzygany malejąco po id (determinizm)', () => {
    const wynik = mapujOstatniPrzebieg([
      runFixture({ id: 'aaa', started_at: '2026-07-15T14:32:00Z' }),
      runFixture({ id: 'zzz', started_at: '2026-07-15T14:32:00Z' }),
    ]);
    expect(wynik?.czasISO).toBe('2026-07-15T14:32:00Z');
  });

  it('mapujSpojnosc: rewizja + odcisk z nagłówka; aktualne dla FRESH', () => {
    const s = mapujSpojnosc(snapshotFixture(), activeCaseFixture('FRESH'));
    expect(s.rewizjaModelu).toBe(7);
    expect(s.odcisk).toBe('a1b2c3d4e5f60718293a4b5c6d7e8f90');
    expect(s.aktualnosc).toBe('aktualne');
  });

  it('mapujSpojnosc: OUTDATED → nieaktualne; brak przypadku/NONE → brak', () => {
    expect(mapujSpojnosc(snapshotFixture(), activeCaseFixture('OUTDATED')).aktualnosc).toBe(
      'nieaktualne',
    );
    expect(mapujSpojnosc(snapshotFixture(), activeCaseFixture('NONE')).aktualnosc).toBe('brak');
    expect(mapujSpojnosc(snapshotFixture(), null).aktualnosc).toBe('brak');
  });

  it('mapujPrzypadki: mapuje pola; konfiguracja z description, „—" gdy pusta', () => {
    const wiersze = mapujPrzypadki([
      caseListItem('K1', 'Stan normalny', 'FRESH'),
      caseListItem('K4', 'Wariant awaryjny', 'NONE', { description: '   ' }),
    ]);
    expect(wiersze[0]).toMatchObject({
      id: 'K1',
      nazwa: 'Stan normalny',
      konfiguracja: 'Konfiguracja Stan normalny',
      statusWynikow: 'FRESH',
      ostatniPrzebiegISO: null,
    });
    expect(wiersze[1].konfiguracja).toBe('—');
  });

  it('mapujPrzypadki: wstrzykuje ostatni przebieg tylko dla wskazanego id', () => {
    const mapa = new Map([['K2', '2026-07-15T14:32:00Z']]);
    const wiersze = mapujPrzypadki(
      [caseListItem('K1', 'Stan normalny', 'FRESH'), caseListItem('K2', 'Zwarcia', 'OUTDATED', { is_active: true })],
      mapa,
    );
    expect(wiersze[0].ostatniPrzebiegISO).toBeNull();
    expect(wiersze[1].ostatniPrzebiegISO).toBe('2026-07-15T14:32:00Z');
    expect(wiersze[1].aktywny).toBe(true);
  });
});
