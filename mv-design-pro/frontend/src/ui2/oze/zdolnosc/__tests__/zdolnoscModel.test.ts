/*
 * Testy czystych adapterów okna „Zdolność przyłączeniowa" (karta P2). Weryfikują:
 * dobór przebiegu rozpływu (LOAD_FLOW/DONE), etykiety węzłów (nazwa pierwszoplanowo),
 * opis kryterium wiążącego PL (rodzaj + element + wartość + próg z backendu),
 * słupki wykresu i status scenariusza. Zero fizyki, zero ocen lokalnych.
 */

import { describe, expect, it } from 'vitest';

import {
  elementKryterium,
  etykietaWezla,
  istotnoscScenariusza,
  progKryterium,
  rodzajKryteriumPL,
  slupkiZdolnosci,
  statusScenariuszaPL,
  wartoscKryterium,
  wybierzPrzebiegRozplywu,
} from '../zdolnoscModel';
import { fmtMW } from '../strings';
import { przebiegFixture, widokZdolnosciFixture } from './fixtures';

describe('wybierzPrzebiegRozplywu — dobór przebiegu (LOAD_FLOW/DONE)', () => {
  it('bez zakończonego rozpływu zwraca null', () => {
    const runs = [przebiegFixture({ id: 'sc', analysis_type: 'SC_3F', status: 'DONE' })];
    expect(wybierzPrzebiegRozplywu(runs, null)).toBeNull();
  });

  it('preferuje aktywny przebieg, gdy jest zakończonym rozpływem', () => {
    const runs = [
      przebiegFixture({ id: 'lf-1', analysis_type: 'LOAD_FLOW', status: 'DONE' }),
      przebiegFixture({ id: 'lf-2', analysis_type: 'LOAD_FLOW', status: 'DONE' }),
    ];
    expect(wybierzPrzebiegRozplywu(runs, 'lf-1')).toBe('lf-1');
  });

  it('bez pasującego aktywnego wybiera ostatni zakończony rozpływ', () => {
    const runs = [
      przebiegFixture({ id: 'lf-1', analysis_type: 'LOAD_FLOW', status: 'DONE' }),
      przebiegFixture({ id: 'lf-2', analysis_type: 'LOAD_FLOW', status: 'DONE' }),
    ];
    expect(wybierzPrzebiegRozplywu(runs, 'sc-x')).toBe('lf-2');
  });

  it('ignoruje przebiegi niezakończone i innego rodzaju', () => {
    const runs = [
      przebiegFixture({ id: 'lf-run', analysis_type: 'LOAD_FLOW', status: 'RUNNING' }),
      przebiegFixture({ id: 'sc-run', analysis_type: 'SC_3F', status: 'DONE' }),
    ];
    expect(wybierzPrzebiegRozplywu(runs, null)).toBeNull();
  });
});

describe('etykietaWezla — nazwa na pierwszym planie', () => {
  const [a, b] = widokZdolnosciFixture().nodes;

  it('zwraca nazwę węzła, gdy jest dostępna', () => {
    expect(etykietaWezla(a)).toBe('Szyna A');
  });

  it('spada do identyfikatora, gdy nazwy brak', () => {
    expect(etykietaWezla(b)).toBe('bus-b');
  });
});

describe('rodzajKryteriumPL — opis kryterium wiążącego (słownik z „Jakość wyników")', () => {
  it('kryterium none → informacja o nieosiągnięciu granicy', () => {
    expect(rodzajKryteriumPL({ kind: 'none' })).toContain('Brak');
  });

  it('kryterium non_convergence → niezbieżność rozpływu', () => {
    expect(rodzajKryteriumPL({ kind: 'non_convergence' })).toBe('Niezbieżność rozpływu');
  });

  it('kryterium napięciowe → polska nazwa rodzaju kontroli', () => {
    expect(
      rodzajKryteriumPL({ kind: 'voltage', check_type: 'VOLTAGE_DEVIATION' }),
    ).toBe('Odchylenie napięcia');
  });

  it('kryterium obciążeniowe → polska nazwa rodzaju kontroli', () => {
    expect(
      rodzajKryteriumPL({ kind: 'loading', check_type: 'BRANCH_LOADING' }),
    ).toBe('Obciążenie gałęzi');
  });
});

describe('element/wartość/próg kryterium — wyłącznie z backendu', () => {
  const [a, b] = widokZdolnosciFixture().nodes;

  it('element wiążący = nazwa elementu (ref jako rezerwa)', () => {
    expect(elementKryterium(a.binding_criterion)).toBe('Szyna A');
  });

  it('kryterium none nie ma elementu', () => {
    expect(elementKryterium(b.binding_criterion)).toBeNull();
  });

  it('wartość obserwowana z jednostką z backendu', () => {
    expect(wartoscKryterium(a.binding_criterion)).toBe('1,120 pu');
  });

  it('próg naruszenia z jednostką z backendu', () => {
    expect(progKryterium(a.binding_criterion)).toBe('1,100 pu');
  });

  it('brak wartości/progu → null (kryterium none)', () => {
    expect(wartoscKryterium(b.binding_criterion)).toBeNull();
    expect(progKryterium(b.binding_criterion)).toBeNull();
  });
});

describe('slupkiZdolnosci — dane wykresu (kolejność źródłowa)', () => {
  it('mapuje etykietę (nazwa) i moc przyłączalną per węzeł', () => {
    const slupki = slupkiZdolnosci(widokZdolnosciFixture().nodes);
    expect(slupki).toEqual([
      { bus_ref: 'bus-a', etykieta: 'Szyna A', moc: 1.5 },
      { bus_ref: 'bus-b', etykieta: 'bus-b', moc: 20.0 },
    ]);
  });
});

describe('statusScenariuszaPL / istotnoscScenariusza', () => {
  it('dopuszczalny → etykieta i istotność ok', () => {
    const sc = { added_power_mw: 0, converged: true, acceptable: true, binding: { kind: 'none' as const } };
    expect(statusScenariuszaPL(sc)).toBe('Dopuszczalny');
    expect(istotnoscScenariusza(sc)).toBe('ok');
  });

  it('niedopuszczalny zbieżny → etykieta i istotność err', () => {
    const sc = {
      added_power_mw: 2,
      converged: true,
      acceptable: false,
      binding: { kind: 'voltage' as const },
    };
    expect(statusScenariuszaPL(sc)).toBe('Niedopuszczalny');
    expect(istotnoscScenariusza(sc)).toBe('err');
  });

  it('niezbieżny → etykieta niezbieżny', () => {
    const sc = {
      added_power_mw: 5,
      converged: false,
      acceptable: false,
      binding: { kind: 'non_convergence' as const },
    };
    expect(statusScenariuszaPL(sc)).toBe('Niezbieżny');
  });
});

describe('formater PL', () => {
  it('fmtMW używa przecinka dziesiętnego i 3 miejsc', () => {
    expect(fmtMW(1.5)).toBe('1,500');
  });
});
