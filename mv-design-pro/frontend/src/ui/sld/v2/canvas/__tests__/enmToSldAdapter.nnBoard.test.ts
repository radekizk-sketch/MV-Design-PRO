/**
 * P0.8 nN (H_PLAN_IMPLEMENTACJI_NN §P0.8, seam A8 §9.2.1) — wyrocznie
 * `buildNnBoardFeeders`/`buildNnBoardSections` (struktura per-szyna/per-odpływ
 * rozdzielnicy nN). Dane WYŁĄCZNIE z modelu ENM (zero fabrykacji elementów) —
 * każdy test buduje minimalny, syntetyczny snapshot i sprawdza WYPROWADZENIE,
 * nie geometrię (geometria: `compose/__tests__/station.nnBoard.test.ts`).
 */
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildNnBoardFeeders, buildNnBoardSections } from '../enmToSldAdapter';

function bus(id: string, voltageKv: number): Record<string, unknown> {
  return { id, ref_id: id, name: id, voltage_kv: voltageKv, phase_system: '3ph', tags: [], meta: {} };
}

function cable(ref: string, from: string, to: string): Record<string, unknown> {
  return { id: ref, ref_id: ref, name: ref, type: 'cable', from_bus_ref: from, to_bus_ref: to, status: 'closed', tags: [], meta: {} };
}

function switchBranch(
  ref: string,
  from: string,
  to: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: ref, ref_id: ref, name: ref, type: 'switch', from_bus_ref: from, to_bus_ref: to,
    status: 'closed', tags: [], meta: {}, ...extra,
  };
}

function fuseBranch(ref: string, from: string, to: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ref, ref_id: ref, name: ref, type: 'fuse', from_bus_ref: from, to_bus_ref: to,
    status: 'closed', tags: [], meta: {}, ...extra,
  };
}

function load(ref: string, busRef: string, name = ref): Record<string, unknown> {
  return { id: ref, ref_id: ref, name, bus_ref: busRef, p_mw: 0.01, q_mvar: 0.003, model: 'pq', tags: [], meta: {} };
}

function generator(ref: string, busRef: string, name = ref): Record<string, unknown> {
  return { id: ref, ref_id: ref, name, bus_ref: busRef, p_mw: 0.005, tags: [], meta: {} };
}

function board(ref: string, mainBusRef: string, name = ref): Record<string, unknown> {
  return {
    id: ref, ref_id: ref, name, station_type: 'rozdzielnica_nn',
    bus_refs: [mainBusRef], transformer_refs: [], tags: [], meta: {},
  };
}

function snapshot(overrides: Partial<EnergyNetworkModel>): EnergyNetworkModel {
  return {
    header: { schema_version: '1.0', project_id: 'test', snapshot_id: 'test', generated_at: '2026-01-01T00:00:00Z' } as never,
    buses: [], branches: [], transformers: [], sources: [], loads: [], generators: [],
    substations: [], bays: [], junctions: [], corridors: [], measurements: [],
    protection_assignments: [],
    ...overrides,
  } as unknown as EnergyNetworkModel;
}

describe('P0.8 nN — buildNnBoardFeeders (rozpoznanie aparatu + chodzenie po torze)', () => {
  it('MCB (namespace APARAT_NN_MCB): rozpoznany, etykieta z curve_class+in_a', () => {
    const enm = snapshot({
      buses: [bus('bus/main', 0.4), bus('bus/load1', 0.4)],
      branches: [
        switchBranch('brc/mcb1', 'bus/main', 'bus/load1', {
          catalog_namespace: 'APARAT_NN_MCB',
          materialized_params: { curve_class: 'B', in_a: 16 },
        }),
      ],
      loads: [load('ld/1', 'bus/load1', 'Mieszkanie 1')],
    });
    const feeders = buildNnBoardFeeders(enm, 'bus/main', new Set());
    expect(feeders).toHaveLength(1);
    expect(feeders[0].apparatusKind).toBe('MCB');
    expect(feeders[0].apparatusLabel).toBe('MCB B16');
    expect(feeders[0].apparatusRef).toBe('brc/mcb1');
    expect(feeders[0].branchRef).toBe('brc/mcb1');
    expect(feeders[0].destinationKind).toBe('load');
    expect(feeders[0].destinationRef).toBe('ld/1');
    expect(feeders[0].destinationLabel).toBe('Mieszkanie 1');
  });

  it('rozłącznik bezpiecznikowy nN (branch.type=fuse): rozpoznany z fuse_class+size', () => {
    const enm = snapshot({
      buses: [bus('bus/main', 0.4), bus('bus/sub', 0.4)],
      branches: [
        fuseBranch('brc/fuse1', 'bus/main', 'bus/sub', {
          materialized_params: { fuse_class: 'gG', size: 'NH00' },
        }),
      ],
      loads: [load('ld/2', 'bus/sub')],
    });
    const feeders = buildNnBoardFeeders(enm, 'bus/main', new Set());
    expect(feeders[0].apparatusKind).toBe('FUSE_SWITCH');
    expect(feeders[0].apparatusLabel).toBe('gG NH00');
  });

  it('APARAT_NN generyczny device_kind=WYLACZNIK_ODPLYWOWY: mapuje na MCB (wspólny glif)', () => {
    const enm = snapshot({
      buses: [bus('bus/main', 0.4), bus('bus/sub', 0.4)],
      branches: [
        switchBranch('brc/gen1', 'bus/main', 'bus/sub', {
          catalog_namespace: 'APARAT_NN',
          materialized_params: { device_kind: 'WYLACZNIK_ODPLYWOWY' },
        }),
      ],
      loads: [load('ld/3', 'bus/sub')],
    });
    const feeders = buildNnBoardFeeders(enm, 'bus/main', new Set());
    expect(feeders[0].apparatusKind).toBe('MCB');
  });

  it('APARAT_NN generyczny device_kind=ROZLACZNIK_BEZPIECZNIKOWY: mapuje na FUSE_SWITCH', () => {
    const enm = snapshot({
      buses: [bus('bus/main', 0.4), bus('bus/sub', 0.4)],
      branches: [
        switchBranch('brc/gen2', 'bus/main', 'bus/sub', {
          catalog_namespace: 'APARAT_NN',
          materialized_params: { device_kind: 'ROZLACZNIK_BEZPIECZNIKOWY' },
        }),
      ],
      loads: [load('ld/4', 'bus/sub')],
    });
    const feeders = buildNnBoardFeeders(enm, 'bus/main', new Set());
    expect(feeders[0].apparatusKind).toBe('FUSE_SWITCH');
  });

  it('aparat NIEROZPOZNANY (switch bez namespace/device_kind rozpoznawalnego): UNRESOLVED, komunikat błędu — ZERO domyślnego wyłącznika', () => {
    const enm = snapshot({
      buses: [bus('bus/main', 0.4), bus('bus/sub', 0.4)],
      branches: [switchBranch('brc/unk', 'bus/main', 'bus/sub', { materialized_params: {} })],
      loads: [load('ld/5', 'bus/sub')],
    });
    const feeders = buildNnBoardFeeders(enm, 'bus/main', new Set());
    expect(feeders[0].apparatusKind).toBe('UNRESOLVED');
    expect(feeders[0].apparatusLabel).toBe('Aparat nierozpoznany');
  });

  it('goły kabel (bez aparatu) — apparatusKind=null, NIE błąd (przypadek oczekiwany)', () => {
    const enm = snapshot({
      buses: [bus('bus/main', 0.4), bus('bus/sub', 0.4)],
      branches: [cable('cbl/bare', 'bus/main', 'bus/sub')],
      loads: [load('ld/6', 'bus/sub')],
    });
    const feeders = buildNnBoardFeeders(enm, 'bus/main', new Set());
    expect(feeders[0].apparatusKind).toBeNull();
    expect(feeders[0].apparatusRef).toBeNull();
    expect(feeders[0].apparatusLabel).toBeNull();
  });

  it('odbiorca DER: destinationKind=der, ref/label z Generator', () => {
    const enm = snapshot({
      buses: [bus('bus/main', 0.4), bus('bus/pv', 0.4)],
      branches: [switchBranch('brc/pv1', 'bus/main', 'bus/pv', { catalog_namespace: 'APARAT_NN_MCB', materialized_params: {} })],
      generators: [generator('gen/1', 'bus/pv', 'PV dachowe')],
    });
    const feeders = buildNnBoardFeeders(enm, 'bus/main', new Set());
    expect(feeders[0].destinationKind).toBe('der');
    expect(feeders[0].destinationRef).toBe('gen/1');
    expect(feeders[0].destinationLabel).toBe('PV dachowe');
  });

  it('odbiorca rozdzielnica nN (podrozdzielnica): destinationKind=board, ref/label z Substation', () => {
    const enm = snapshot({
      buses: [bus('bus/main', 0.4), bus('bus/sub-board', 0.4)],
      branches: [switchBranch('brc/sub1', 'bus/main', 'bus/sub-board', { catalog_namespace: 'APARAT_NN_MCB', materialized_params: {} })],
      substations: [board('stn/rgnn2', 'bus/sub-board', 'RGnN-2 Piwnica')],
    });
    const feeders = buildNnBoardFeeders(enm, 'bus/main', new Set());
    expect(feeders[0].destinationKind).toBe('board');
    expect(feeders[0].destinationRef).toBe('stn/rgnn2');
    expect(feeders[0].destinationLabel).toBe('RGnN-2 Piwnica');
  });

  it('koniec toru bez odbiorcy (uczciwa granica modelu): destinationKind=unknown, ref=null', () => {
    const enm = snapshot({
      buses: [bus('bus/main', 0.4), bus('bus/dead-end', 0.4)],
      branches: [cable('cbl/dead', 'bus/main', 'bus/dead-end')],
    });
    const feeders = buildNnBoardFeeders(enm, 'bus/main', new Set());
    expect(feeders[0].destinationKind).toBe('unknown');
    expect(feeders[0].destinationRef).toBeNull();
  });

  it('chodzenie po ŁAŃCUCHU kabli (aparat → mufa → mufa → odbiorca) — dowód ciągłości toru', () => {
    const enm = snapshot({
      buses: [bus('bus/main', 0.4), bus('bus/a', 0.4), bus('bus/b', 0.4), bus('bus/c', 0.4)],
      branches: [
        switchBranch('brc/head', 'bus/main', 'bus/a', { catalog_namespace: 'APARAT_NN_MCB', materialized_params: {} }),
        cable('cbl/1', 'bus/a', 'bus/b'),
        cable('cbl/2', 'bus/b', 'bus/c'),
      ],
      loads: [load('ld/end', 'bus/c', 'Odbiór końcowy')],
    });
    const feeders = buildNnBoardFeeders(enm, 'bus/main', new Set());
    expect(feeders[0].destinationKind).toBe('load');
    expect(feeders[0].destinationRef).toBe('ld/end');
  });

  it('węzeł ROZGAŁĘZIONY w środku toru (2 kable z tej samej mufy) — chodzenie ODMAWIA, unknown (zero zgadywania którą gałąź wybrać)', () => {
    const enm = snapshot({
      buses: [bus('bus/main', 0.4), bus('bus/a', 0.4), bus('bus/b1', 0.4), bus('bus/b2', 0.4)],
      branches: [
        switchBranch('brc/head', 'bus/main', 'bus/a', { catalog_namespace: 'APARAT_NN_MCB', materialized_params: {} }),
        cable('cbl/left', 'bus/a', 'bus/b1'),
        cable('cbl/right', 'bus/a', 'bus/b2'),
      ],
      loads: [load('ld/b1', 'bus/b1'), load('ld/b2', 'bus/b2')],
    });
    const feeders = buildNnBoardFeeders(enm, 'bus/main', new Set());
    expect(feeders[0].destinationKind).toBe('unknown');
  });

  it('excludeBranchRefs (NnSection.incoming_refs/coupler_ref): wyklucza gałęzie zasilające — NIE stają się odpływami', () => {
    const enm = snapshot({
      buses: [bus('bus/main', 0.4), bus('bus/upstream', 0.4), bus('bus/feeder1', 0.4)],
      branches: [
        cable('cbl/incoming', 'bus/upstream', 'bus/main'),
        switchBranch('brc/feeder1', 'bus/main', 'bus/feeder1', { catalog_namespace: 'APARAT_NN_MCB', materialized_params: {} }),
      ],
      loads: [load('ld/f1', 'bus/feeder1')],
    });
    const feeders = buildNnBoardFeeders(enm, 'bus/main', new Set(['cbl/incoming']));
    expect(feeders).toHaveLength(1);
    expect(feeders[0].branchRef).toBe('brc/feeder1');
  });

  it('deterministyczna kolejność odpływów (sort po ref_id) — dwa biegi identyczne', () => {
    const enm = snapshot({
      buses: [bus('bus/main', 0.4), bus('bus/z', 0.4), bus('bus/a', 0.4)],
      branches: [
        switchBranch('brc/zzz', 'bus/main', 'bus/z', { catalog_namespace: 'APARAT_NN_MCB', materialized_params: {} }),
        switchBranch('brc/aaa', 'bus/main', 'bus/a', { catalog_namespace: 'APARAT_NN_MCB', materialized_params: {} }),
      ],
      loads: [load('ld/z', 'bus/z'), load('ld/a', 'bus/a')],
    });
    const first = buildNnBoardFeeders(enm, 'bus/main', new Set());
    const second = buildNnBoardFeeders(enm, 'bus/main', new Set());
    expect(first.map((f) => f.branchRef)).toEqual(['brc/aaa', 'brc/zzz']);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});

describe('P0.8 nN — buildNnBoardSections (sekcje jawne vs fallback domyślny)', () => {
  it('brak nn_sections (stacja bez rejestru) — fallback: JEDNA sekcja domyślna zakotwiczona na nnBusRef', () => {
    const enm = snapshot({
      buses: [bus('bus/main', 0.4), bus('bus/load1', 0.4)],
      branches: [switchBranch('brc/1', 'bus/main', 'bus/load1', { catalog_namespace: 'APARAT_NN_MCB', materialized_params: {} })],
      loads: [load('ld/1', 'bus/load1')],
      substations: [{ id: 'stn/1', ref_id: 'stn/1', name: 'Stacja 1', station_type: 'mv_lv', bus_refs: ['bus/main'], transformer_refs: [], tags: [], meta: {} } as unknown as Record<string, unknown>],
    });
    const station = enm.substations[0];
    const sections = buildNnBoardSections(enm, station, 'bus/main');
    expect(sections).toHaveLength(1);
    expect(sections[0].busRef).toBe('bus/main');
    expect(sections[0].feeders).toHaveLength(1);
  });

  it('nnBusRef===null (brak szyny nN / remis) — [] (uczciwy brak, zero fabrykacji sekcji)', () => {
    const enm = snapshot({
      substations: [{ id: 'stn/1', ref_id: 'stn/1', name: 'Stacja 1', station_type: 'mv_lv', bus_refs: [], transformer_refs: [], tags: [], meta: {} } as unknown as Record<string, unknown>],
    });
    const station = enm.substations[0];
    expect(buildNnBoardSections(enm, station, null)).toEqual([]);
  });

  it('nn_sections JAWNE (RGnN wielosekcyjna): każda sekcja wyklucza WŁASNE incoming_refs/coupler_ref, uporządkowane po order', () => {
    const enm = snapshot({
      buses: [bus('bus/sec1', 0.4), bus('bus/sec2', 0.4), bus('bus/f1', 0.4), bus('bus/f2', 0.4)],
      branches: [
        cable('cbl/supply1', 'bus/upstream1', 'bus/sec1'),
        switchBranch('brc/coupler', 'bus/sec1', 'bus/sec2', { catalog_namespace: 'APARAT_NN_MCB', materialized_params: {} }),
        switchBranch('brc/f1', 'bus/sec1', 'bus/f1', { catalog_namespace: 'APARAT_NN_MCB', materialized_params: {} }),
        switchBranch('brc/f2', 'bus/sec2', 'bus/f2', { catalog_namespace: 'APARAT_NN_MCB', materialized_params: {} }),
      ],
      loads: [load('ld/f1', 'bus/f1'), load('ld/f2', 'bus/f2')],
      substations: [
        {
          id: 'stn/rgnn', ref_id: 'stn/rgnn', name: 'RGnN', station_type: 'rozdzielnica_nn',
          bus_refs: ['bus/sec1', 'bus/sec2'], transformer_refs: [], tags: [], meta: {},
          nn_sections: [
            { section_id: 'sec2', order: 2, bus_ref: 'bus/sec2', coupler_ref: 'brc/coupler', incoming_refs: [] },
            { section_id: 'sec1', order: 1, bus_ref: 'bus/sec1', coupler_ref: 'brc/coupler', incoming_refs: ['cbl/supply1'] },
          ],
        } as unknown as Record<string, unknown>,
      ],
    });
    const station = enm.substations[0];
    const sections = buildNnBoardSections(enm, station, 'bus/sec1');
    // Uporządkowane po `order` (1, potem 2) — NIE po kolejności w tablicy wejściowej.
    expect(sections.map((s) => s.sectionId)).toEqual(['sec1', 'sec2']);
    // Sekcja 1: wyklucza supply (incoming) i coupler — tylko odpływ f1.
    expect(sections[0].feeders.map((f) => f.branchRef)).toEqual(['brc/f1']);
    // Sekcja 2: wyklucza coupler (nie ma incoming) — tylko odpływ f2.
    expect(sections[1].feeders.map((f) => f.branchRef)).toEqual(['brc/f2']);
  });
});
