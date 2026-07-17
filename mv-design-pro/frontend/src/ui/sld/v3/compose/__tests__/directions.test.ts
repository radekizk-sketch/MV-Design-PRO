/**
 * SLD V3 F5a — wyrocznia §9 nomenklatury kierunków (SLD_CAD_SPEC_V3 §9,
 * WIĄŻĄCA). Syntetyczny ciąg: GPZ → S01 → S02 → S03 → S04, z odgałęzieniem
 * S02 → S15. Guard-test: dokładne teksty ORAZ property „żaden podpis nie
 * zawiera surowego WE/WY/ODG".
 */
import { describe, expect, it } from 'vitest';

import { FIELD_ROLE, type FieldRole } from '../../../v2/domain/apparatusContracts';
import type { MiniBlockBayDescriptor } from '../../../v2/renderer/MiniBlockRmuRenderer';
import type { LineRunV1 } from '../../../../../types/enm';
import {
  bayDirectionCaption,
  classifyStationTopologicalType,
  fieldFunctionalDesignation,
  resolveStationDirectionContext,
  stationBayCaptions,
  type StationDirectionContext,
} from '../directions';

const FORBIDDEN_TOKEN = /\b(WE|WY|ODG)\b/;

function makeBay(fieldRole: FieldRole, index: number, designation = `Pole ${index}`): MiniBlockBayDescriptor {
  return { bayRef: `bay-${index}`, fieldRole, designation, hasMissingRequiredDevice: false };
}

// ---------------------------------------------------------------------------
// Syntetyk topologii: GPZ -> S01 -> S02 -> S03 -> S04, odgałęzienie S02->S15.
// ---------------------------------------------------------------------------

const STATION_CODES: Readonly<Record<string, string>> = {
  'sub-01': 'S01',
  'sub-02': 'S02',
  'sub-03': 'S03',
  'sub-04': 'S04',
  'sub-15': 'S15',
};

function stationCodeOf(ref: string): string | null {
  return STATION_CODES[ref] ?? null;
}

const MAIN_RUN: LineRunV1 = {
  id: 'run-main',
  run_kind: 'main_trunk',
  starting_bay_ref: 'bay-gpz-1',
  starting_port_ref: 'port-gpz-1',
  segments: [],
  stations: [
    { substation_ref: 'sub-01', order: 0 },
    { substation_ref: 'sub-02', order: 1 },
    { substation_ref: 'sub-03', order: 2 },
    { substation_ref: 'sub-04', order: 3 },
  ],
};

const BRANCH_RUN: LineRunV1 = {
  id: 'run-branch',
  run_kind: 'branch',
  starting_bay_ref: 'bay-s02-branch',
  starting_port_ref: 'port-s02-branch',
  segments: [],
  stations: [{ substation_ref: 'sub-15', order: 0 }],
  parent_run_ref: 'run-main',
  branch_origin_station_ref: 'sub-02',
};

const LINE_RUNS: readonly LineRunV1[] = [MAIN_RUN, BRANCH_RUN];

function contextFor(stationId: string): StationDirectionContext {
  return resolveStationDirectionContext({
    lineRuns: LINE_RUNS,
    stationId,
    gpzNodeCode: 'GPZ',
    stationCodeOf,
  });
}

describe('V3 compose/directions — resolveStationDirectionContext (spec §9)', () => {
  it('pierwsza stacja głównego ciągu: poprzednik = GPZ, następnik = S02, brak gałęzi', () => {
    const ctx = contextFor('sub-01');
    expect(ctx).toEqual({
      previousNodeCode: 'GPZ',
      nextNodeCode: 'S02',
      branchNodeCodes: [],
      runName: null,
      branchRunNames: [],
    });
  });

  it('stacja środkowa z odgałęzieniem: poprzednik = S01, następnik = S03, gałąź = [S15]', () => {
    const ctx = contextFor('sub-02');
    expect(ctx).toEqual({
      previousNodeCode: 'S01',
      nextNodeCode: 'S03',
      branchNodeCodes: ['S15'],
      runName: null,
      branchRunNames: [null],
    });
  });

  it('ostatnia stacja głównego ciągu: poprzednik = S03, następnik = null', () => {
    const ctx = contextFor('sub-04');
    expect(ctx).toEqual({
      previousNodeCode: 'S03',
      nextNodeCode: null,
      branchNodeCodes: [],
      runName: null,
      branchRunNames: [],
    });
  });

  it('pierwsza (jedyna) stacja gałęzi: poprzednik = stacja macierzysta gałęzi (S02), NIE GPZ', () => {
    const ctx = contextFor('sub-15');
    expect(ctx).toEqual({
      previousNodeCode: 'S02',
      nextNodeCode: null,
      branchNodeCodes: [],
      runName: null,
      branchRunNames: [],
    });
  });

  it('stacja nieobecna w żadnym line_run: wszystko null/puste (brak danych ciągu)', () => {
    const ctx = contextFor('sub-nieznana');
    expect(ctx).toEqual({
      previousNodeCode: null,
      nextNodeCode: null,
      branchNodeCodes: [],
      runName: null,
      branchRunNames: [],
    });
  });

  // F10.2 (spec §19.2, D2): `LineRunV1.name` niesiony do kontekstu —
  // ciąg NAZWANY (dane obecne) vs ciąg BEZ nazwy (`MAIN_RUN`/`BRANCH_RUN`
  // powyżej, `name` nieustawione ⇒ `runName: null`, sprawdzone wyżej).
  it('ciąg NAZWANY: runName niesie LineRunV1.name, to samo dla obu końców (poprzednik/następnik)', () => {
    const namedMain: LineRunV1 = { ...MAIN_RUN, name: 'L-01' };
    const ctx = resolveStationDirectionContext({
      lineRuns: [namedMain, BRANCH_RUN],
      stationId: 'sub-02',
      gpzNodeCode: 'GPZ',
      stationCodeOf,
    });
    expect(ctx.runName).toBe('L-01');
  });

  it('gałąź NAZWANA: branchRunNames niesie LineRunV1.name ciągu odgałęźnego, index-aligned do branchNodeCodes', () => {
    const namedBranch: LineRunV1 = { ...BRANCH_RUN, name: 'Odgałęzienie do S15' };
    const ctx = resolveStationDirectionContext({
      lineRuns: [MAIN_RUN, namedBranch],
      stationId: 'sub-02',
      gpzNodeCode: 'GPZ',
      stationCodeOf,
    });
    expect(ctx.branchNodeCodes).toEqual(['S15']);
    expect(ctx.branchRunNames).toEqual(['Odgałęzienie do S15']);
  });

  it('nazwa ciągu z samych białych znaków traktowana jak brak nazwy (trim ⇒ null)', () => {
    const blankNamedMain: LineRunV1 = { ...MAIN_RUN, name: '   ' };
    const ctx = resolveStationDirectionContext({
      lineRuns: [blankNamedMain, BRANCH_RUN],
      stationId: 'sub-01',
      gpzNodeCode: 'GPZ',
      stationCodeOf,
    });
    expect(ctx.runName).toBeNull();
  });
});

describe('V3 compose/directions — stationBayCaptions (spec §3/§4/§9)', () => {
  it('S01 (mv_lv_terminal: RMU_LINE, RMU_TRANSFORMER): ["kier. GPZ", null]', () => {
    const snBays = [makeBay(FIELD_ROLE.RMU_LINE, 0), makeBay(FIELD_ROLE.RMU_TRANSFORMER, 1)];
    const captions = stationBayCaptions(snBays, contextFor('sub-01'));
    expect(captions).toEqual(['kier. GPZ', null]);
  });

  it('S02 (mv_lv_branch: RMU_LINE×3, RMU_TRANSFORMER): ["kier. S01", "kier. S03", "odg. S15", null]', () => {
    const snBays = [
      makeBay(FIELD_ROLE.RMU_LINE, 0),
      makeBay(FIELD_ROLE.RMU_LINE, 1),
      makeBay(FIELD_ROLE.RMU_LINE, 2),
      makeBay(FIELD_ROLE.RMU_TRANSFORMER, 3),
    ];
    const captions = stationBayCaptions(snBays, contextFor('sub-02'));
    expect(captions).toEqual(['kier. S01', 'kier. S03', 'odg. S15', null]);
  });

  it('S04 (mv_lv_terminal, ostatnia stacja): ["kier. S03", null] — brak następnika, nie "kier. null"', () => {
    const snBays = [makeBay(FIELD_ROLE.RMU_LINE, 0), makeBay(FIELD_ROLE.RMU_TRANSFORMER, 1)];
    const captions = stationBayCaptions(snBays, contextFor('sub-04'));
    expect(captions).toEqual(['kier. S03', null]);
  });

  it('jawne role ENM (LINE_IN/LINE_OUT/LINE_BRANCH) nie zależą od pozycji — kolejność odwrócona daje ten sam wynik', () => {
    const snBays = [
      makeBay(FIELD_ROLE.LINE_BRANCH, 0),
      makeBay(FIELD_ROLE.LINE_OUT, 1),
      makeBay(FIELD_ROLE.LINE_IN, 2),
    ];
    const captions = stationBayCaptions(snBays, contextFor('sub-02'));
    expect(captions).toEqual(['odg. S15', 'kier. S03', 'kier. S01']);
  });

  it('COUPLER/MEASUREMENT/DER_* nie mają kierunku liniowego ⇒ null (fallback designation nieużyty, bo direction=null)', () => {
    const snBays = [
      makeBay(FIELD_ROLE.COUPLER, 0, 'sprzęgło'),
      makeBay(FIELD_ROLE.MEASUREMENT, 1, 'pomiar'),
      makeBay(FIELD_ROLE.DER_PV, 2, 'PV'),
    ];
    const captions = stationBayCaptions(snBays, contextFor('sub-01'));
    expect(captions).toEqual([null, null, null]);
  });

  it('fallback: brak danych ciągu, designation realny tekst (bez zakazanych tokenów) ⇒ zwrócony wprost', () => {
    const snBays = [makeBay(FIELD_ROLE.RMU_LINE, 0, 'Zasilanie rezerwowe')];
    const captions = stationBayCaptions(snBays, contextFor('sub-nieznana'));
    expect(captions).toEqual(['Zasilanie rezerwowe']);
  });

  it('fallback: brak danych ciągu, designation === "WE"/"WY"/"ODG" ⇒ null (NIGDY surowy token, spec §9)', () => {
    for (const raw of ['WE', 'WY', 'ODG']) {
      const snBays = [makeBay(FIELD_ROLE.RMU_LINE, 0, raw)];
      const captions = stationBayCaptions(snBays, contextFor('sub-nieznana'));
      expect(captions).toEqual([null]);
    }
  });

  it('fallback: designation pusty/whitespace ⇒ null', () => {
    const snBays = [makeBay(FIELD_ROLE.RMU_LINE, 0, '   ')];
    const captions = stationBayCaptions(snBays, contextFor('sub-nieznana'));
    expect(captions).toEqual([null]);
  });
});

// ---------------------------------------------------------------------------
// F10.2 (spec §19.2, D2, wyrocznia line_bay_caption_probe): podpis pola
// liniowego = numer/nazwa linii + kierunek topologiczny, format
// `⟨numer linii⟩ · kier. ⟨kod⟩` — degradacja do samego `kier./odg. ⟨kod⟩`
// gdy nazwa ciągu nieobecna (już pokryte wyżej, ciągi MAIN_RUN/BRANCH_RUN
// bez `name`).
// ---------------------------------------------------------------------------

describe('V3 compose/directions — bayDirectionCaption z nazwą linii (spec §19.2)', () => {
  it('poprzednik/następnik: nazwa ciągu ⇒ "⟨nazwa⟩ · kier. ⟨kod⟩"', () => {
    const ctx: StationDirectionContext = {
      previousNodeCode: 'S01',
      nextNodeCode: 'S03',
      branchNodeCodes: [],
      runName: 'L-01',
      branchRunNames: [],
    };
    expect(bayDirectionCaption({ direction: 'previous', context: ctx, branchIndex: -1 })).toBe('L-01 · kier. S01');
    expect(bayDirectionCaption({ direction: 'next', context: ctx, branchIndex: -1 })).toBe('L-01 · kier. S03');
  });

  it('odgałęzienie: nazwa ciągu odgałęźnego ⇒ "⟨nazwa⟩ · odg. ⟨kod⟩"', () => {
    const ctx: StationDirectionContext = {
      previousNodeCode: 'S01',
      nextNodeCode: 'S03',
      branchNodeCodes: ['S15'],
      runName: 'L-01',
      branchRunNames: ['Odgałęzienie do S15'],
    };
    expect(bayDirectionCaption({ direction: 'branch', context: ctx, branchIndex: 0 })).toBe(
      'Odgałęzienie do S15 · odg. S15',
    );
  });

  it('degradacja: brak nazwy ciągu ⇒ sam "kier./odg. ⟨kod⟩" (NIE błąd, spec §19.2)', () => {
    const ctx: StationDirectionContext = {
      previousNodeCode: 'S01',
      nextNodeCode: 'S03',
      branchNodeCodes: ['S15'],
      runName: null,
      branchRunNames: [null],
    };
    expect(bayDirectionCaption({ direction: 'previous', context: ctx, branchIndex: -1 })).toBe('kier. S01');
    expect(bayDirectionCaption({ direction: 'branch', context: ctx, branchIndex: 0 })).toBe('odg. S15');
  });
});

describe('V3 compose/directions — property: żaden podpis nie zawiera surowego WE/WY/ODG (spec §9)', () => {
  const scenarios: ReadonlyArray<{ readonly stationId: string; readonly snBays: readonly MiniBlockBayDescriptor[] }> = [
    {
      stationId: 'sub-01',
      snBays: [makeBay(FIELD_ROLE.RMU_LINE, 0), makeBay(FIELD_ROLE.RMU_TRANSFORMER, 1)],
    },
    {
      stationId: 'sub-02',
      snBays: [
        makeBay(FIELD_ROLE.RMU_LINE, 0),
        makeBay(FIELD_ROLE.RMU_LINE, 1),
        makeBay(FIELD_ROLE.RMU_LINE, 2),
        makeBay(FIELD_ROLE.RMU_TRANSFORMER, 3),
      ],
    },
    {
      stationId: 'sub-04',
      snBays: [makeBay(FIELD_ROLE.RMU_LINE, 0), makeBay(FIELD_ROLE.RMU_TRANSFORMER, 1)],
    },
    {
      stationId: 'sub-15',
      snBays: [makeBay(FIELD_ROLE.RMU_LINE, 0), makeBay(FIELD_ROLE.RMU_TRANSFORMER, 1)],
    },
    // Fallback z zakazanymi tokenami w designation — property MUSI trzymać
    // się nawet gdy dane wejściowe (ENM) są "brudne".
    {
      stationId: 'sub-nieznana',
      snBays: [
        makeBay(FIELD_ROLE.RMU_LINE, 0, 'WE'),
        makeBay(FIELD_ROLE.RMU_LINE, 1, 'WY'),
        makeBay(FIELD_ROLE.LINE_BRANCH, 2, 'ODG'),
      ],
    },
  ];

  for (const scenario of scenarios) {
    it(`stacja ${scenario.stationId}: brak surowych tokenów WE/WY/ODG w żadnym podpisie`, () => {
      const captions = stationBayCaptions(scenario.snBays, contextFor(scenario.stationId));
      for (const caption of captions) {
        if (caption == null) continue;
        expect(caption).not.toMatch(FORBIDDEN_TOKEN);
      }
    });
  }

  it('bayDirectionCaption zwraca null dla direction=null niezależnie od kontekstu/fallbacku', () => {
    const ctx: StationDirectionContext = {
      previousNodeCode: 'S99',
      nextNodeCode: 'S98',
      branchNodeCodes: ['S97'],
      runName: 'L-99',
      branchRunNames: ['Odgałęzienie 97'],
    };
    expect(bayDirectionCaption({ direction: null, context: ctx, branchIndex: 0, designationFallback: 'TR' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// F10.2 (spec §19.1, V12K-035): `fieldFunctionalDesignation` — oznaczenie
// FUNKCYJNE pola (liniowe/transformatorowe/sprzęgłowe/pomiarowe/
// generatorowe), zastępuje dawny `bayApparatusDesignation` (Q/T jako etykieta
// CAŁEGO pola — USUNIĘTY, przeniesiony na identyfikator PER-APARAT,
// `compose/apparatusSequence.ts` `apparatusIdentifiers`).
// ---------------------------------------------------------------------------

describe('fieldFunctionalDesignation (spec §19.1 — oznaczenie funkcyjne pola, NIE identyfikator aparatu)', () => {
  it('role liniowe (LINE_IN/LINE_OUT/LINE_BRANCH/RMU_LINE/GPZ_LINE_BAY) ⇒ "pole liniowe"', () => {
    for (const role of [
      FIELD_ROLE.LINE_IN,
      FIELD_ROLE.LINE_OUT,
      FIELD_ROLE.LINE_BRANCH,
      FIELD_ROLE.RMU_LINE,
      FIELD_ROLE.GPZ_LINE_BAY,
    ]) {
      expect(fieldFunctionalDesignation(role)).toBe('pole liniowe');
    }
  });

  it('role transformatorowe (TRANSFORMER/RMU_TRANSFORMER) ⇒ "pole transformatorowe"', () => {
    expect(fieldFunctionalDesignation(FIELD_ROLE.TRANSFORMER)).toBe('pole transformatorowe');
    expect(fieldFunctionalDesignation(FIELD_ROLE.RMU_TRANSFORMER)).toBe('pole transformatorowe');
  });

  it('COUPLER ⇒ "pole sprzęgłowe"; MEASUREMENT ⇒ "pole pomiarowe"', () => {
    expect(fieldFunctionalDesignation(FIELD_ROLE.COUPLER)).toBe('pole sprzęgłowe');
    expect(fieldFunctionalDesignation(FIELD_ROLE.MEASUREMENT)).toBe('pole pomiarowe');
  });

  it('DER_PV/DER_BESS/DER_FW ⇒ "pole generatorowe"', () => {
    expect(fieldFunctionalDesignation(FIELD_ROLE.DER_PV)).toBe('pole generatorowe');
    expect(fieldFunctionalDesignation(FIELD_ROLE.DER_BESS)).toBe('pole generatorowe');
    expect(fieldFunctionalDesignation(FIELD_ROLE.DER_FW)).toBe('pole generatorowe');
  });

  it('zero surowych "Q\\d+"/"T\\d+" (zakaz §19.1) — oznaczenie jest ZAWSZE tekstem funkcyjnym', () => {
    const RAW_Q_OR_T = /^Q\d+$|^T\d+$/;
    for (const role of Object.values(FIELD_ROLE)) {
      expect(fieldFunctionalDesignation(role)).not.toMatch(RAW_Q_OR_T);
    }
  });

  it('deterministyczne: czysta funkcja roli, zero zależności od danych pola', () => {
    expect(fieldFunctionalDesignation(FIELD_ROLE.RMU_LINE)).toBe(fieldFunctionalDesignation(FIELD_ROLE.RMU_LINE));
  });
});

// ---------------------------------------------------------------------------
// F10.2 (spec §19.3, V12K-034, wyrocznia station_type_topology_probe):
// `classifyStationTopologicalType` — typ stacji WYPROWADZONY z topologii
// (`snBays`), NIE z ręcznej danej `station_type`.
// ---------------------------------------------------------------------------

describe('classifyStationTopologicalType (spec §19.3 — typ stacji z topologii)', () => {
  it('1 pole liniowe (+ TR) ⇒ "końcowa"', () => {
    const snBays = [makeBay(FIELD_ROLE.RMU_LINE, 0), makeBay(FIELD_ROLE.RMU_TRANSFORMER, 1)];
    expect(classifyStationTopologicalType(snBays)).toBe('końcowa');
  });

  it('0 pól liniowych (samo TR) ⇒ "końcowa" (degradacja bezpieczna)', () => {
    expect(classifyStationTopologicalType([makeBay(FIELD_ROLE.RMU_TRANSFORMER, 0)])).toBe('końcowa');
  });

  it('2 pola liniowe równorzędne ⇒ "przelotowa"', () => {
    const snBays = [
      makeBay(FIELD_ROLE.RMU_LINE, 0),
      makeBay(FIELD_ROLE.RMU_LINE, 1),
      makeBay(FIELD_ROLE.RMU_TRANSFORMER, 2),
    ];
    expect(classifyStationTopologicalType(snBays)).toBe('przelotowa');
  });

  it('3 pola liniowe ⇒ "odgałęźna" (wyrocznia station_type_topology_probe (c))', () => {
    const snBays = [
      makeBay(FIELD_ROLE.RMU_LINE, 0),
      makeBay(FIELD_ROLE.RMU_LINE, 1),
      makeBay(FIELD_ROLE.RMU_LINE, 2),
      makeBay(FIELD_ROLE.RMU_TRANSFORMER, 3),
    ];
    expect(classifyStationTopologicalType(snBays)).toBe('odgałęźna');
  });

  it('obecność sprzęgła (COUPLER) ⇒ "sekcyjna", NAWET z tylko 2 polami liniowymi (mv_lv_sectional)', () => {
    const snBays = [
      makeBay(FIELD_ROLE.RMU_LINE, 0),
      makeBay(FIELD_ROLE.RMU_TRANSFORMER, 1),
      makeBay(FIELD_ROLE.COUPLER, 2),
      makeBay(FIELD_ROLE.RMU_LINE, 3),
      makeBay(FIELD_ROLE.RMU_TRANSFORMER, 4),
    ];
    expect(classifyStationTopologicalType(snBays)).toBe('sekcyjna');
  });

  it('czysta funkcja `snBays` — kolejność pól nie wpływa na wynik (liczność, nie pozycja)', () => {
    const a = [makeBay(FIELD_ROLE.RMU_TRANSFORMER, 0), makeBay(FIELD_ROLE.RMU_LINE, 1), makeBay(FIELD_ROLE.RMU_LINE, 2)];
    const b = [makeBay(FIELD_ROLE.RMU_LINE, 0), makeBay(FIELD_ROLE.RMU_LINE, 1), makeBay(FIELD_ROLE.RMU_TRANSFORMER, 2)];
    expect(classifyStationTopologicalType(a)).toBe(classifyStationTopologicalType(b));
  });
});
