import { describe, it, expect } from 'vitest';
import { mapowanieTopologiiDoDrzewa } from '../adapters/topologyTreeAdapter';
import { mapowaniePrzypadkowDoDrzewa } from '../adapters/casesTreeAdapter';
import { mapowaniePrzebiegowDoDrzewa } from '../adapters/runsTreeAdapter';
import type { Bay, Substation, TopologyGraphSummary } from '../../../types/enm';
import type { TopologyStructure } from '../../../ui/topology/api';
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

/** Element ENM minimalny (pola bazowe `ENMElement`) — pomocnik fixture'ów struktury. */
function bazowyElement(id: string, extra: Record<string, unknown>): Record<string, unknown> {
  return { id, ref_id: id, name: id, tags: [], meta: {}, ...extra };
}

/**
 * Fixture o kształcie `GET .../enm/topology` (`TopologyStructure`) — SPÓJNA z
 * `topologySummaryFixture()` powyżej: GPZ i ST-1 mają pola (więc trafiają do
 * stacji), ST-2 NIE ma pola (trafia do „Poza stacją" — testuje uczciwy stan
 * zerowy zamiast milczącego gubienia).
 */
function topologyStructureFixture(): TopologyStructure {
  const substations: Substation[] = [
    bazowyElement('SUB-GPZ', { station_type: 'gpz', bus_refs: ['GPZ'], transformer_refs: [] }) as unknown as Substation,
    { ...bazowyElement('SUB-ST1', { station_type: 'mv_lv', bus_refs: ['ST-1'], transformer_refs: [] }), name: 'Stacja Kowalska' } as unknown as Substation,
  ];
  const bays: Bay[] = [
    bazowyElement('BAY-GPZ-1', {
      bay_role: 'OUT',
      substation_ref: 'SUB-GPZ',
      bus_ref: 'GPZ',
      equipment_refs: [],
    }) as unknown as Bay,
    bazowyElement('BAY-ST1-1', {
      bay_role: 'IN',
      substation_ref: 'SUB-ST1',
      bus_ref: 'ST-1',
      equipment_refs: [],
    }) as unknown as Bay,
  ];
  return {
    case_id: 'case-1',
    substations,
    bays,
    junctions: [],
    corridors: [],
    bus_count: 5,
    branch_count: 4,
    transformer_count: 1,
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

  it('tryb "administracyjny" bez struktury (jeszcze nie pobrana) = uczciwy stan zerowy', () => {
    expect(mapowanieTopologiiDoDrzewa(topologySummaryFixture(), [], 'administracyjny')).toEqual([]);
  });

  it('tryb "administracyjny": grupuje szyny po Bay.substation_ref + nazwa stacji ze struktury', () => {
    const wynik = mapowanieTopologiiDoDrzewa(
      topologySummaryFixture(),
      [],
      'administracyjny',
      topologyStructureFixture(),
    );
    const gpz = wynik.find((g) => g.id === 'SUB-GPZ')!;
    expect(gpz).toBeDefined();
    expect(gpz.etykietaPL).toBe('SUB-GPZ'); // brak `name` w fixture -> fallback do ref
    expect(gpz.dzieci.map((d) => d.id)).toEqual(['GPZ']);

    const st1 = wynik.find((g) => g.id === 'SUB-ST1')!;
    expect(st1.etykietaPL).toBe('Stacja Kowalska');
    expect(st1.dzieci.map((d) => d.id)).toEqual(['ST-1']);
  });

  it('tryb "administracyjny": szyna bez pola (ST-2, LAT-1, ISO-1/2) trafia do grupy „Poza stacją" (zero gubienia)', () => {
    const wynik = mapowanieTopologiiDoDrzewa(
      topologySummaryFixture(),
      [],
      'administracyjny',
      topologyStructureFixture(),
    );
    const bezStacji = wynik.find((g) => g.id === 'poza-stacja')!;
    expect(bezStacji).toBeDefined();
    expect(bezStacji.dzieci.map((d) => d.id).sort()).toEqual(['ISO-1', 'ISO-2', 'LAT-1', 'ST-2']);
  });

  it('tryb "administracyjny": liczniki gotowości przenoszą się na liście szyn stacji', () => {
    const wynik = mapowanieTopologiiDoDrzewa(
      topologySummaryFixture(),
      readinessIssuesFixture(),
      'administracyjny',
      topologyStructureFixture(),
    );
    const bezStacji = wynik.find((g) => g.id === 'poza-stacja')!;
    const st2 = bezStacji.dzieci.find((d) => d.id === 'ST-2')!;
    expect(st2.liczniki).toEqual({ blokady: 1, ostrzezenia: 0 });
  });

  it('tryb "obwodowy": jedno odejście na dziecko szyny źródłowej — poddrzewo IDENTYCZNE z gałęzią "zasilania"', () => {
    const zasilania = mapowanieTopologiiDoDrzewa(topologySummaryFixture(), readinessIssuesFixture(), 'zasilania');
    const galazZasilania = zasilania.find((g) => g.id === 'magistrala')!.dzieci[0].dzieci[0];
    expect(galazZasilania.id).toBe('ST-1');

    const obwodowy = mapowanieTopologiiDoDrzewa(topologySummaryFixture(), readinessIssuesFixture(), 'obwodowy');
    const odejscie = obwodowy.find((g) => g.id === 'ST-1')!;
    expect(odejscie).toBeDefined();
    expect(odejscie).toEqual(galazZasilania);
    // Poddrzewo odejścia niesie CAŁY dalszy ciąg (ST-2) i dopięte odgałęzienie (LAT-1).
    expect(odejscie.dzieci.map((d) => d.id).sort()).toEqual(['LAT-1', 'ST-2']);
  });

  it('tryb "obwodowy": węzły izolowane i sieroty trafiają do tych samych grup co "zasilania"', () => {
    const obwodowy = mapowanieTopologiiDoDrzewa(topologySummaryFixture(), [], 'obwodowy');
    const izolowane = obwodowy.find((g) => g.id === 'izolowane');
    expect(izolowane?.dzieci.map((d) => d.id).sort()).toEqual(['ISO-1', 'ISO-2']);
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
    result_status_reason: 'model-niezmieniony',
    result_status_reason_pl: 'Model nie zmienił się od chwili obliczenia.',
    rewizja_biegu: 4,
    rewizja_biezaca: 4,
    zmiany_od_biegu: [],
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
