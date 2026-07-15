import { describe, it, expect } from 'vitest';
import { mapowanieTopologiiDoDrzewa } from '../adapters/topologyTreeAdapter';
import { mapowaniePrzypadkowDoDrzewa } from '../adapters/casesTreeAdapter';
import { mapowaniePrzebiegowDoDrzewa } from '../adapters/runsTreeAdapter';
import type { TopologyGraphSummary } from '../../../types/enm';
import type { ReadinessIssue } from '../../../ui/types';
import type { StudyCaseListItem } from '../../../ui/study-cases/types';
import type { ExecutionRun } from '../../../ui/study-cases/types';

// ---------------------------------------------------------------------------
// topologyTreeAdapter — fixture o kształcie GET /enm/topology/summary
// (frontend/src/types/enm.ts: TopologyGraphSummary / SpineNode / AdjacencyEntry)
// ---------------------------------------------------------------------------

function topologySummaryFixture(): TopologyGraphSummary {
  return {
    case_id: 'case-1',
    enm_revision: 3,
    bus_count: 5,
    branch_count: 4,
    transformer_count: 1,
    source_count: 1,
    load_count: 2,
    generator_count: 0,
    measurement_count: 0,
    protection_count: 0,
    is_radial: true,
    has_cycles: false,
    adjacency: [
      { bus_ref: 'GPZ', neighbor_ref: 'ST-1', via_ref: 'L-1', via_type: 'line' },
      { bus_ref: 'ST-1', neighbor_ref: 'ST-2', via_ref: 'L-2', via_type: 'line' },
      { bus_ref: 'ST-1', neighbor_ref: 'LAT-1', via_ref: 'L-3', via_type: 'line' },
      { bus_ref: 'ISO-1', neighbor_ref: 'ISO-2', via_ref: 'L-4', via_type: 'line' },
    ],
    spine: [
      { bus_ref: 'GPZ', depth: 0, is_source: true, children_refs: ['ST-1'] },
      { bus_ref: 'ST-1', depth: 1, is_source: false, children_refs: ['ST-2'] },
      { bus_ref: 'ST-2', depth: 2, is_source: false, children_refs: [] },
    ],
    lateral_roots: ['LAT-1'],
  };
}

function readinessIssuesFixture(): ReadinessIssue[] {
  return [
    {
      code: 'E010',
      severity: 'BLOCKER',
      element_ref: 'ST-2',
      element_refs: [],
      message_pl: 'Brak katalogu transformatora',
      wizard_step_hint: null,
      suggested_fix: null,
      fix_action: null,
    },
    {
      code: 'W020',
      severity: 'IMPORTANT',
      element_ref: null,
      element_refs: ['LAT-1'],
      message_pl: 'Brak zabezpieczenia pola',
      wizard_step_hint: null,
      suggested_fix: null,
      fix_action: null,
    },
    {
      code: 'I001',
      severity: 'INFO',
      element_ref: 'GPZ',
      element_refs: [],
      message_pl: 'Informacja pomijana w licznikach',
      wizard_step_hint: null,
      suggested_fix: null,
      fix_action: null,
    },
  ];
}

describe('topologyTreeAdapter — mapowanieTopologiiDoDrzewa', () => {
  it('zwraca [] gdy summary === null (stan „brak danych" — karta §3)', () => {
    expect(mapowanieTopologiiDoDrzewa(null, [], 'zasilania')).toEqual([]);
  });

  it('tryb "zasilania": buduje hierarchię magistrali wg children_refs + dopina odgałęzienia', () => {
    const wynik = mapowanieTopologiiDoDrzewa(topologySummaryFixture(), readinessIssuesFixture(), 'zasilania');
    const magistrala = wynik.find((g) => g.id === 'magistrala');
    expect(magistrala).toBeDefined();
    expect(magistrala!.dzieci).toHaveLength(1);
    expect(magistrala!.dzieci[0].id).toBe('GPZ');
    expect(magistrala!.dzieci[0].ikona).toBe('zrodlo');

    const st1 = magistrala!.dzieci[0].dzieci[0];
    expect(st1.id).toBe('ST-1');
    // odgałęzienie LAT-1 dopięte pod ST-1 (najbliższy węzeł magistrali)
    expect(st1.dzieci.map((d) => d.id)).toContain('LAT-1');

    const st2 = st1.dzieci.find((d) => d.id === 'ST-2')!;
    expect(st2.liczniki).toEqual({ blokady: 1, ostrzezenia: 0 });
  });

  it('liczniki: BLOCKER→blokady, IMPORTANT→ostrzeżenia, INFO pomijane (element_ref i element_refs)', () => {
    const wynik = mapowanieTopologiiDoDrzewa(topologySummaryFixture(), readinessIssuesFixture(), 'zasilania');
    const magistrala = wynik.find((g) => g.id === 'magistrala')!;
    const gpz = magistrala.dzieci[0];
    expect(gpz.liczniki).toEqual({ blokady: 0, ostrzezenia: 0 }); // INFO pominięte
    const lat1 = magistrala.dzieci[0].dzieci[0].dzieci.find((d) => d.id === 'LAT-1')!;
    expect(lat1.liczniki).toEqual({ blokady: 0, ostrzezenia: 1 });
  });

  it('węzły izolowane trafiają do osobnej grupy', () => {
    const wynik = mapowanieTopologiiDoDrzewa(topologySummaryFixture(), [], 'zasilania');
    const izolowane = wynik.find((g) => g.id === 'izolowane');
    expect(izolowane).toBeDefined();
    expect(izolowane!.dzieci.map((d) => d.id).sort()).toEqual(['ISO-1', 'ISO-2']);
  });

  it('tryby "administracyjny"/"obwodowy" — adapter-szkielet TODO-KARTA (brak jednoznacznego źródła)', () => {
    expect(mapowanieTopologiiDoDrzewa(topologySummaryFixture(), [], 'administracyjny')).toEqual([]);
    expect(mapowanieTopologiiDoDrzewa(topologySummaryFixture(), [], 'obwodowy')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// casesTreeAdapter — fixture o kształcie StudyCaseListItem (ui/study-cases/types.ts)
// ---------------------------------------------------------------------------

function studyCaseFixture(overrides: Partial<StudyCaseListItem> = {}): StudyCaseListItem {
  return {
    id: 'case-a',
    name: 'Zwarcia maks.',
    description: '',
    result_status: 'FRESH',
    results_valid: true,
    is_active: true,
    updated_at: '2026-07-14T10:00:00Z',
    ...overrides,
  };
}

describe('casesTreeAdapter — mapowaniePrzypadkowDoDrzewa', () => {
  it('mapuje listę przypadków na płaskie węzły (bez zagnieżdżenia — §1.1 lista przypadków)', () => {
    const wynik = mapowaniePrzypadkowDoDrzewa([
      studyCaseFixture({ id: 'case-a', name: 'Zwarcia maks.' }),
      studyCaseFixture({ id: 'case-b', name: 'Rozpływ PV 100%' }),
    ]);
    expect(wynik).toHaveLength(2);
    expect(wynik[0]).toMatchObject({ id: 'case-a', etykietaPL: 'Zwarcia maks.', ikona: 'przypadek', dzieci: [] });
    expect(wynik.every((w) => w.dzieci.length === 0)).toBe(true);
  });

  it('zwraca [] dla pustej listy przypadków (stan „pusty")', () => {
    expect(mapowaniePrzypadkowDoDrzewa([])).toEqual([]);
  });

  it('liczniki są zawsze zerowe (gotowość dotyczy modelu, nie pojedynczego przypadku)', () => {
    const wynik = mapowaniePrzypadkowDoDrzewa([studyCaseFixture()]);
    expect(wynik[0].liczniki).toEqual({ blokady: 0, ostrzezenia: 0 });
  });
});

// ---------------------------------------------------------------------------
// runsTreeAdapter — fixture o kształcie ExecutionRun (ui/study-cases/types.ts)
// ---------------------------------------------------------------------------

function runFixture(overrides: Partial<ExecutionRun> = {}): ExecutionRun {
  return {
    id: 'run-1',
    study_case_id: 'case-a',
    analysis_type: 'SC_3F',
    solver_input_hash: 'hash-1',
    status: 'DONE',
    started_at: '2026-07-14T09:00:00Z',
    finished_at: '2026-07-14T09:01:00Z',
    error_message: null,
    ...overrides,
  };
}

describe('runsTreeAdapter — mapowaniePrzebiegowDoDrzewa', () => {
  it('grupuje przebiegi po study_case_id w hierarchię przypadek→przebiegi (§1.1)', () => {
    const runs = [
      runFixture({ id: 'run-1', study_case_id: 'case-a' }),
      runFixture({ id: 'run-2', study_case_id: 'case-a', started_at: '2026-07-14T10:00:00Z' }),
      runFixture({ id: 'run-3', study_case_id: 'case-b' }),
    ];
    const nazwy = new Map([
      ['case-a', 'Zwarcia maks.'],
      ['case-b', 'Rozpływ PV 100%'],
    ]);
    const wynik = mapowaniePrzebiegowDoDrzewa(runs, nazwy);
    expect(wynik.map((w) => w.etykietaPL)).toEqual(['Rozpływ PV 100%', 'Zwarcia maks.']);
    const grupaA = wynik.find((w) => w.id === 'case-a')!;
    expect(grupaA.dzieci.map((d) => d.id)).toEqual(['run-1', 'run-2']); // posortowane wg started_at
  });

  it('grupa bez rozpoznanej nazwy przypadku pokazuje surowe id (fallback udokumentowany)', () => {
    const wynik = mapowaniePrzebiegowDoDrzewa([runFixture({ study_case_id: 'case-x' })], new Map());
    expect(wynik[0].etykietaPL).toBe('case-x');
  });

  it('przebieg FAILED ustawia liczniki.blokady = 1 (jedyny jednoznaczny sygnał problemu)', () => {
    const wynik = mapowaniePrzebiegowDoDrzewa(
      [runFixture({ id: 'run-failed', status: 'FAILED' })],
      new Map([['case-a', 'Zwarcia maks.']]),
    );
    expect(wynik[0].dzieci[0].liczniki).toEqual({ blokady: 1, ostrzezenia: 0 });
  });

  it('przebieg DONE/PENDING/RUNNING ma liczniki zerowe', () => {
    const wynik = mapowaniePrzebiegowDoDrzewa(
      [runFixture({ id: 'run-ok', status: 'DONE' })],
      new Map([['case-a', 'A']]),
    );
    expect(wynik[0].dzieci[0].liczniki).toEqual({ blokady: 0, ostrzezenia: 0 });
  });

  it('zwraca [] dla pustej listy przebiegów', () => {
    expect(mapowaniePrzebiegowDoDrzewa([], new Map())).toEqual([]);
  });
});
