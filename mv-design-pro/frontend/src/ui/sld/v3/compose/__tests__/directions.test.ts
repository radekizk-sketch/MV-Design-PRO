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
    expect(ctx).toEqual({ previousNodeCode: 'GPZ', nextNodeCode: 'S02', branchNodeCodes: [] });
  });

  it('stacja środkowa z odgałęzieniem: poprzednik = S01, następnik = S03, gałąź = [S15]', () => {
    const ctx = contextFor('sub-02');
    expect(ctx).toEqual({ previousNodeCode: 'S01', nextNodeCode: 'S03', branchNodeCodes: ['S15'] });
  });

  it('ostatnia stacja głównego ciągu: poprzednik = S03, następnik = null', () => {
    const ctx = contextFor('sub-04');
    expect(ctx).toEqual({ previousNodeCode: 'S03', nextNodeCode: null, branchNodeCodes: [] });
  });

  it('pierwsza (jedyna) stacja gałęzi: poprzednik = stacja macierzysta gałęzi (S02), NIE GPZ', () => {
    const ctx = contextFor('sub-15');
    expect(ctx).toEqual({ previousNodeCode: 'S02', nextNodeCode: null, branchNodeCodes: [] });
  });

  it('stacja nieobecna w żadnym line_run: wszystko null/puste (brak danych ciągu)', () => {
    const ctx = contextFor('sub-nieznana');
    expect(ctx).toEqual({ previousNodeCode: null, nextNodeCode: null, branchNodeCodes: [] });
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
    const ctx: StationDirectionContext = { previousNodeCode: 'S99', nextNodeCode: 'S98', branchNodeCodes: ['S97'] };
    expect(bayDirectionCaption({ direction: null, context: ctx, branchIndex: 0, designationFallback: 'TR' })).toBeNull();
  });
});
