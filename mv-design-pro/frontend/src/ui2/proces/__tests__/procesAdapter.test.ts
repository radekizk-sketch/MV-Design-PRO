/*
 * Testy adaptera procesu — odwzorowanie store'ów na sygnały reguły NBA.
 * Sprawdzają, że adapter nie „poprawia" kontraktu: brak wyników zostaje brakiem
 * danej, a nie fałszem; zakończony przebieg rozpoznaje się po statusie, nie po
 * samej obecności przebiegu na liście.
 */

import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { aktualnoscWynikow, czyJestZakonczonyPrzebieg, useNastepnaAkcja } from '../adapters/procesAdapter';
import type { ExecutionRun, StudyCase } from '../../../ui/study-cases/types';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { useStudyCasesStore } from '../../../ui/study-cases/store';
import type { EnergyNetworkModel } from '../../../types/enm';

function przebieg(over: Partial<ExecutionRun> = {}): ExecutionRun {
  return {
    id: 'run-1',
    study_case_id: 'case-1',
    analysis_type: 'SC_3F',
    solver_input_hash: 'h',
    status: 'DONE',
    started_at: '2026-01-01T10:00:00Z',
    finished_at: '2026-01-01T10:01:00Z',
    error_message: null,
    ...over,
  };
}

function przypadek(over: Partial<StudyCase> = {}): StudyCase {
  return {
    id: 'case-1',
    name: 'Wariant podstawowy',
    result_status: 'FRESH',
    results_valid: true,
    ...over,
  } as StudyCase;
}

describe('czyJestZakonczonyPrzebieg — status z kontraktu, nie obecność wiersza', () => {
  it('pusta lista → fałsz', () => {
    expect(czyJestZakonczonyPrzebieg([])).toBe(false);
  });

  it('przebiegi w toku / oczekujące / błędne NIE liczą się jako zakończone', () => {
    expect(
      czyJestZakonczonyPrzebieg([
        przebieg({ id: 'a', status: 'PENDING' }),
        przebieg({ id: 'b', status: 'RUNNING' }),
        przebieg({ id: 'c', status: 'FAILED' }),
      ]),
    ).toBe(false);
  });

  it('choć jeden zakończony → prawda', () => {
    expect(
      czyJestZakonczonyPrzebieg([przebieg({ id: 'a', status: 'FAILED' }), przebieg({ id: 'b' })]),
    ).toBe(true);
  });
});

describe('aktualnoscWynikow — brak danej pozostaje brakiem danej', () => {
  it('brak aktywnego przypadku → null', () => {
    expect(aktualnoscWynikow(null)).toBeNull();
  });

  it('przypadek bez wyników → null (a nie „nieaktualne")', () => {
    expect(aktualnoscWynikow(przypadek({ result_status: 'NONE', results_valid: false }))).toBeNull();
  });

  it('wyniki aktualne → prawda; wyniki unieważnione → fałsz', () => {
    expect(aktualnoscWynikow(przypadek({ result_status: 'FRESH', results_valid: true }))).toBe(true);
    expect(
      aktualnoscWynikow(przypadek({ result_status: 'OUTDATED', results_valid: false })),
    ).toBe(false);
  });
});

describe('useNastepnaAkcja — spięcie ze store\'ami read-only', () => {
  function snapshotFixture(): EnergyNetworkModel {
    return {
      header: {
        enm_version: '1.0',
        name: 'test',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        revision: 1,
        hash_sha256: 'hash-1',
        defaults: { frequency_hz: 50, unit_system: 'SI' },
      },
    } as unknown as EnergyNetworkModel;
  }

  it('model bez policzonej gotowości → akcja „ustal gotowość", nie „uruchom obliczenia"', () => {
    // Predykat pochodzi z `czyGotowoscUstalona` adaptera gotowości — pilnujemy,
    // że adapter procesu czyta TEN SAM warunek, a nie własną kopię.
    useSnapshotStore.setState({ snapshot: snapshotFixture(), readiness: null, fixActions: [] });
    useExecutionRunsStore.setState({ runs: [] });
    useStudyCasesStore.setState({ activeCase: null });
    const { result } = renderHook(() => useNastepnaAkcja());
    expect(result.current.rodzaj).toBe('ustal-gotowosc');
    expect(result.current.etap).toBe('E3');
  });

  it('bez modelu w store → akcja „otwórz projekt"', () => {
    useSnapshotStore.setState({ snapshot: null, readiness: null, fixActions: [] });
    useExecutionRunsStore.setState({ runs: [] });
    const { result } = renderHook(() => useNastepnaAkcja());
    expect(result.current.rodzaj).toBe('otworz-projekt');
  });

  it('model z blokadą → akcja naprawcza niesie zgłoszenie z kontraktu', () => {
    useSnapshotStore.setState({
      snapshot: snapshotFixture(),
      readiness: {
        ready: false,
        blockers: [
          {
            code: 'source.grid_supply_missing',
            message_pl: 'Brak źródła zasilania sieciowego (GPZ).',
            element_ref: 'GPZ-1',
            severity: 'BLOKUJACE',
            canonical_priority: 1,
          },
        ],
        warnings: [],
      },
      fixActions: [],
    });
    useExecutionRunsStore.setState({ runs: [] });
    const { result } = renderHook(() => useNastepnaAkcja());
    expect(result.current.rodzaj).toBe('usun-blokade');
    expect(result.current.problem?.code).toBe('source.grid_supply_missing');
    expect(result.current.problem?.priorytetKanoniczny).toBe(1);
  });

  it('model bez blokad i z zakończonym przebiegiem → prowadzi do wyników', () => {
    useSnapshotStore.setState({
      snapshot: snapshotFixture(),
      readiness: { ready: true, blockers: [], warnings: [] },
      fixActions: [],
    });
    useExecutionRunsStore.setState({ runs: [przebieg()] });
    useStudyCasesStore.setState({ activeCase: przypadek() });
    const { result } = renderHook(() => useNastepnaAkcja());
    expect(result.current.rodzaj).toBe('odczytaj-wyniki');
    expect(result.current.etap).toBe('E5');
  });
});
