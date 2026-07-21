import { describe, it, expect } from 'vitest';
import type { EnergyNetworkModel } from '../../../../types/enm';
import {
  mapujModel,
  mapujGotowosc,
  mapujOstatniPrzebieg,
  mapujPrzylaczenie,
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

/** Snapshot z realnymi polami przyłączenia (źródła/szyny/generacja/odbiory). */
function snapshotPrzylaczenie(over: Partial<EnergyNetworkModel> = {}): EnergyNetworkModel {
  return snapshotFixture({
    buses: [
      { ref_id: 'B-GPZ', id: 'B-GPZ', voltage_kv: 15 },
      { ref_id: 'B-2', id: 'B-2', voltage_kv: 15 },
    ] as never,
    sources: [
      { ref_id: 'S-GPZ', id: 'S-GPZ', name: 'GPZ 110/15', bus_ref: 'B-GPZ', sk3_mva: 250, ik3_ka: 9.6 },
    ] as never,
    generators: [
      { ref_id: 'G-1', id: 'G-1', bus_ref: 'B-2', p_mw: 2.5 },
      { ref_id: 'G-2', id: 'G-2', bus_ref: 'B-2', p_mw: 1.2 },
    ] as never,
    loads: [
      { ref_id: 'L-1', id: 'L-1', bus_ref: 'B-2', p_mw: 0.8 },
      { ref_id: 'L-2', id: 'L-2', bus_ref: 'B-2', p_mw: 1.5 },
    ] as never,
    ...over,
  });
}

describe('mapujPrzylaczenie — warunki przyłączenia + bilans mocy (E1, B1/B2)', () => {
  it('źródło sieciowe: napięcie z połączonej szyny, Sk″/Ik″ z pól źródła', () => {
    const p = mapujPrzylaczenie(snapshotPrzylaczenie());
    expect(p.zrodlaSieciowe).toHaveLength(1);
    expect(p.zrodlaSieciowe[0]).toEqual({
      nazwa: 'GPZ 110/15',
      napiecieKv: 15,
      sk3Mva: 250,
      ik3Ka: 9.6,
    });
  });

  it('bilans mocy: suma znamionowa p_mw generatorów i odbiorów + netto', () => {
    const p = mapujPrzylaczenie(snapshotPrzylaczenie());
    expect(p.generacjaMw).toBeCloseTo(3.7, 6); // 2,5 + 1,2
    expect(p.odbioryMw).toBeCloseTo(2.3, 6); // 0,8 + 1,5
    expect(p.nettoMw).toBeCloseTo(1.4, 6); // 3,7 − 2,3
    expect(p.liczbaGeneratorow).toBe(2);
    expect(p.liczbaOdbiorow).toBe(2);
  });

  it('brak źródła sieciowego → pusta lista (uczciwy stan zerowy, bez zgadywania)', () => {
    const p = mapujPrzylaczenie(snapshotPrzylaczenie({ sources: [] as never }));
    expect(p.zrodlaSieciowe).toEqual([]);
  });

  it('brak Sk″/Ik″ w źródle → null (nie fabrykujemy wartości)', () => {
    const p = mapujPrzylaczenie(
      snapshotPrzylaczenie({
        sources: [{ ref_id: 'S', id: 'S', name: 'Sieć', bus_ref: 'B-GPZ' }] as never,
      }),
    );
    expect(p.zrodlaSieciowe[0]).toMatchObject({ sk3Mva: null, ik3Ka: null, napiecieKv: 15 });
  });

  it('szyna źródła nieznana → napięcie null (brak dopasowania bus_ref)', () => {
    const p = mapujPrzylaczenie(
      snapshotPrzylaczenie({
        sources: [{ ref_id: 'S', id: 'S', name: 'Sieć', bus_ref: 'B-NIEZNANA', sk3_mva: 100 }] as never,
      }),
    );
    expect(p.zrodlaSieciowe[0].napiecieKv).toBeNull();
  });

  it('jest deterministyczne i czyste: to samo wejście → identyczny wynik', () => {
    const snap = snapshotPrzylaczenie();
    expect(mapujPrzylaczenie(snap)).toEqual(mapujPrzylaczenie(snap));
  });
});
