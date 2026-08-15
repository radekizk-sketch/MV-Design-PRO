/**
 * Testy adaptera okna „Serie przebiegów" (karta BATCH-ROUTER).
 *
 * INTENCJA: projekcje czyste (serie → wiersze PL, scenariusze → pozycje
 * wyboru) i JEDEN werdykt stanu okna (predykaty parami — stan nie jest
 * liczony w komponencie). Status biegu w wierszu serii pochodzi WYŁĄCZNIE
 * z listy biegów (`runStore`) — brak rekordu biegu = uczciwy null, nigdy
 * zgadywany status (reguła S9-11 „nie licz stanu osobno").
 */

import { describe, expect, it } from 'vitest';

import type { BatchJob, ExecutionRun } from '../../../../../ui/study-cases/types';
import type { FaultScenario } from '../../../../../ui/fault-scenarios/types';
import { mapujScenariusze, mapujSerie } from '../adapters/serieAdapter';

function seria(id: string, nadpisz: Partial<BatchJob> = {}): BatchJob {
  return {
    batch_id: id,
    study_case_id: 'case-1',
    analysis_type: 'SC_3F',
    scenario_ids: ['s1', 's2'],
    created_at: '2026-08-07T10:30:00Z',
    status: 'DONE',
    batch_input_hash: 'a'.repeat(64),
    run_ids: ['run-1', 'run-2'],
    result_set_ids: ['run-1', 'run-2'],
    errors: [],
    ...nadpisz,
  };
}

function bieg(id: string, status: ExecutionRun['status']): ExecutionRun {
  return {
    id,
    study_case_id: 'case-1',
    analysis_type: 'SC_3F',
    solver_input_hash: 'b'.repeat(64),
    status,
    started_at: '2026-08-07T10:30:01Z',
    finished_at: status === 'DONE' ? '2026-08-07T10:30:02Z' : null,
    error_message: null,
  };
}

function scenariusz(id: string, nazwa: string): FaultScenario {
  return {
    scenario_id: id,
    study_case_id: 'case-1',
    name: nazwa,
    analysis_type: 'SHORT_CIRCUIT',
    fault_type: 'SC_3F',
    location: { element_ref: 'bus-7', location_type: 'BUS', position: null },
    config: { c_factor: 1.1, thermal_time_seconds: 1, include_branch_contributions: false },
    fault_impedance_type: 'METALLIC',
    fault_mode: 'METALLIC',
    fault_impedance: null,
    arc_params: null,
    z0_bus_data: null,
    created_at: '2026-08-07T10:00:00Z',
    updated_at: '2026-08-07T10:00:00Z',
    content_hash: 'h',
  };
}

describe('mapujSerie — projekcja serii na wiersze PL', () => {
  it('mapuje status, etykiety i liczbę scenariuszy', () => {
    const [wiersz] = mapujSerie([seria('b1')], [bieg('run-1', 'DONE'), bieg('run-2', 'DONE')]);
    expect(wiersz.id).toBe('b1');
    expect(wiersz.statusEtykieta).toBe('Zakończona');
    expect(wiersz.liczbaScenariuszy).toBe(2);
    expect(wiersz.rodzajEtykieta.length).toBeGreaterThan(0);
    expect(wiersz.biegi).toHaveLength(2);
    expect(wiersz.biegi[0].bieg?.status).toBe('DONE');
  });

  it('status biegu WYŁĄCZNIE z listy biegów — brak rekordu = null (bez zgadywania)', () => {
    const [wiersz] = mapujSerie([seria('b1')], [bieg('run-1', 'DONE')]);
    expect(wiersz.biegi[0].bieg).not.toBeNull();
    expect(wiersz.biegi[1].bieg).toBeNull();
  });

  it('błędy serii przechodzą bez zmian (uczciwy komunikat backendu)', () => {
    const [wiersz] = mapujSerie(
      [seria('b1', { status: 'FAILED', errors: ['Scenariusz s2: Analiza zablokowana'] })],
      [],
    );
    expect(wiersz.status).toBe('FAILED');
    expect(wiersz.statusEtykieta).toBe('Błąd');
    expect(wiersz.bledy).toEqual(['Scenariusz s2: Analiza zablokowana']);
  });
});

describe('mapujScenariusze — pozycje wyboru serii', () => {
  it('mapuje nazwę, etykietę rodzaju i miejsce z kontraktu scenariusza', () => {
    const [pozycja] = mapujScenariusze([scenariusz('s1', 'Zwarcie w GPZ')]);
    expect(pozycja.id).toBe('s1');
    expect(pozycja.nazwa).toBe('Zwarcie w GPZ');
    expect(pozycja.miejsce).toBe('bus-7');
    expect(pozycja.rodzajEtykieta.length).toBeGreaterThan(0);
  });
});
