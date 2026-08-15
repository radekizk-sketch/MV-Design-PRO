/**
 * S9-2 (AUDYT_JAKOSCI_SLD_2026-08, W-1 „wyniki NIE pojawiają się na schemacie") —
 * TEST INTEGRACYJNY POKRYCIA: liczba etykiet wynikowych vs liczba punktów wyniku
 * z backendu.
 *
 * FIXTURY POCHODZĄ Z ŻYWEGO BIEGU (zero fabrykacji): sieć zbudowana realnymi
 * operacjami domenowymi API (`add_grid_source_sn` → 2× `continue_trunk_segment_sn`
 * → `station-templates/tpl_sn_nn_1000kva/apply`), a nakładki to odpowiedzi
 * `GET /api/execution/runs/{run}/results/v1` po biegu zwarciowym
 * (`POST /api/cases/{case}/runs/short-circuit`) i rozpływowym
 * (`POST /api/cases/{case}/runs/power-flow`) na TEJ SIECI.
 *   * `s92Bieg.enm.json`         — migawka ENM (`GET /api/cases/{case}/enm`);
 *   * `s92Zwarcie.overlay.json`  — `overlay_payload` biegu zwarciowego (3 punkty);
 *   * `s92Rozplyw.overlay.json`  — `overlay_payload` biegu rozpływowego (16 punktów).
 *
 * ODBIÓR KARTY: „liczba etykiet wynikowych > 0 i RÓWNA liczbie punktów wyniku
 * z backendu". Dla biegu ZWARCIOWEGO równość jest dosłowna (3 punkty = 3
 * etykiety). Dla biegu ROZPŁYWOWEGO część punktów to węzły, których MODEL sam
 * nie rysuje (`Bus.meta.render_on_sld === false`: mufy ciągu `INLINE_TERMINAL`,
 * zaciski pól `FIELD_TERMINAL`) — dla nich etykieta nie może powstać, bo nie ma
 * elementu rysunku. Równość jest więc egzekwowana jako INWARIANT SUMY czterech
 * ROZŁĄCZNYCH kategorii (`summarizeResultPointCoverage`), z twardym wymogiem
 * `withoutAnchor === 0`: żaden punkt rysowalny nie ginie po cichu.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildResultLabelsForSnapshot, buildFlowOverlayForSnapshot } from '../SldCanvasV3Workspace';
import { summarizeResultPointCoverage } from '../resultLabels';
import { resultPointsHiddenByModel } from '../resultRefBridge';
import type { EnergyNetworkModel } from '../../../../../types/enm';
import type { RawOverlayPayload } from '../../../../sld-overlay/rawResultOverlayStore';

const here = dirname(fileURLToPath(import.meta.url));
const readFixture = <T,>(name: string): T =>
  JSON.parse(readFileSync(resolve(here, 'fixtures', name), 'utf8')) as T;

const enm = readFixture<EnergyNetworkModel>('s92Bieg.enm.json');
const zwarcie = readFixture<RawOverlayPayload>('s92Zwarcie.overlay.json');
const rozplyw = readFixture<RawOverlayPayload>('s92Rozplyw.overlay.json');

/** Punkty wyniku pokryte etykietą — po refie PUNKTU, nie po refie rysunku
 *  (ten sam punkt bywa zakotwiczony dwoma elementami: blok stacji na poziomie
 *  przeglądu i odcinek szyny na poziomach szczegółu). */
function pokrytePunkty(entries: Readonly<Record<string, { readonly resultRef: string }>>): ReadonlySet<string> {
  return new Set(Object.values(entries).map((entry) => entry.resultRef));
}

describe('S9-2 — pokrycie punktów wyniku etykietami (bieg zwarciowy)', () => {
  const entries = buildResultLabelsForSnapshot(enm, zwarcie);

  it('kontrola wejścia: nakładka biegu niesie 3 punkty zwarcia, wszystkie klasy „bus"', () => {
    expect(Object.keys(zwarcie.elements)).toHaveLength(3);
    expect(Object.values(zwarcie.elements).every((element) => element.kind === 'bus')).toBe(true);
  });

  it('ODBIÓR: liczba etykiet > 0 i RÓWNA liczbie punktów wyniku (3 = 3)', () => {
    const pokryte = pokrytePunkty(entries);
    expect(pokryte.size).toBeGreaterThan(0);
    expect(pokryte.size).toBe(Object.keys(zwarcie.elements).length);
    expect([...pokryte].sort()).toEqual(Object.keys(zwarcie.elements).sort());
  });

  it('rachunek pokrycia: wszystko oznakowane, zero punktów bez elementu rysunku', () => {
    const coverage = summarizeResultPointCoverage(zwarcie, entries, resultPointsHiddenByModel(enm));
    expect(coverage).toEqual({
      total: 3,
      labelled: 3,
      hiddenByModel: 0,
      withoutTemplate: 0,
      withoutAnchor: 0,
      withoutAnchorRefs: [],
    });
  });

  it('WARTOŚCI z danych: każda etykieta niesie Ik″/ip/Ith TEGO punktu, sformatowane z wartości backendu', () => {
    for (const [ref, element] of Object.entries(zwarcie.elements)) {
      const entry = Object.values(entries).find((candidate) => candidate.resultRef === ref);
      expect(entry, ref).toBeDefined();
      const prefixy = entry!.lines.map((line) => line.prefix);
      expect(prefixy.slice(0, 3)).toEqual(['Ik″', 'ip', 'Ith']);
      // Kontrola „1:1 z danych": liczba w etykiecie == wartość metryki
      // znormalizowana do kA wg JEDNOSTKI metryki (ścieżka zwarciowa emituje
      // `ikss_ka` w kA — patrz `result_builder_v1._METRIC_MAP`). Formatowanie
      // wolno, arytmetyka wielkości nie.
      const ikss = element.metrics.IK_3F_A;
      const ka = ikss.unit === 'A' ? (ikss.value as number) / 1000 : (ikss.value as number);
      expect(entry!.lines[0].text).toBe(`${ka.toFixed(1).replace('.', ',')} kA`);
    }
  });
});

describe('S9-2 — pokrycie punktów wyniku etykietami (bieg rozpływowy)', () => {
  const entries = buildResultLabelsForSnapshot(enm, rozplyw);
  const hidden = resultPointsHiddenByModel(enm);

  it('kontrola wejścia: nakładka biegu niesie 16 punktów (szyny, gałęzie, transformatory, źródło)', () => {
    expect(Object.keys(rozplyw.elements)).toHaveLength(16);
    expect(new Set(Object.values(rozplyw.elements).map((element) => element.kind))).toEqual(
      new Set(['bus', 'branch', 'generator']),
    );
  });

  it('model DEKLARUJE 6 punktów jako nierysowane (mufy ciągu + zaciski pól) — to nie jest brak warstwy', () => {
    const nierysowane = Object.keys(rozplyw.elements).filter((ref) => hidden.has(ref));
    expect(nierysowane).toHaveLength(6);
    expect(nierysowane.filter((ref) => ref.endsWith('/downstream'))).toHaveLength(2);
    expect(nierysowane.filter((ref) => ref.includes('/sn_field_terminal/'))).toHaveLength(4);
  });

  it('ODBIÓR: INWARIANT SUMY — labelled + hiddenByModel + withoutTemplate + withoutAnchor === total, przy withoutAnchor = 0', () => {
    const coverage = summarizeResultPointCoverage(rozplyw, entries, hidden);
    expect(coverage.total).toBe(16);
    expect(coverage.labelled).toBeGreaterThan(0);
    expect(coverage.labelled + coverage.hiddenByModel + coverage.withoutTemplate + coverage.withoutAnchor).toBe(
      coverage.total,
    );
    expect(coverage.withoutAnchorRefs).toEqual([]);
    expect(coverage.labelled).toBe(10);
    expect(coverage.hiddenByModel).toBe(6);
  });

  it('KLASY pokryte: szyna stacji SN i nN, blok stacji (przegląd), transformator stacji, gałęzie ciągu, źródło', () => {
    const pokryte = pokrytePunkty(entries);
    expect(pokryte.has('stn/6db7ec2086af7dc462ff4bbb91f42b90/sn_bus')).toBe(true);
    expect(pokryte.has('stn/6db7ec2086af7dc462ff4bbb91f42b90/nn_bus')).toBe(true);
    expect(pokryte.has('stn/6db7ec2086af7dc462ff4bbb91f42b90/transformer')).toBe(true);
    expect(pokryte.has('seg/579ff99a3d0449ee89eb53b41d3f1bca/segment')).toBe(true);
    expect(pokryte.has('seg/6c5b18bc2f5e6f912c3927fe6458bb3b/segment_L')).toBe(true);
    expect(pokryte.has('seg/6c5b18bc2f5e6f912c3927fe6458bb3b/segment_R')).toBe(true);
    expect(pokryte.has('gpz/a6b30c58f8be3a034fd29c5254ae4326/source/main')).toBe(true);
  });

  it('KIERUNEK ze znaku danych: strzałka rozpływu na KAŻDEJ gałęzi ciągu, zwrot zgodny ze znakiem P i orientacją gałęzi', () => {
    const flow = buildFlowOverlayForSnapshot(enm, rozplyw);
    const galezie = Object.keys(rozplyw.elements).filter((ref) => rozplyw.elements[ref].kind === 'branch');
    const zeStrzalka = galezie.filter((ref) => flow[ref]);
    expect(zeStrzalka.length).toBeGreaterThan(0);
    for (const ref of zeStrzalka) {
      const p = rozplyw.elements[ref].metrics.P_MW?.value;
      expect(typeof p).toBe('number');
      // Wszystkie gałęzie tej fixtury są zadeklarowane zgodnie z kierunkiem
      // trasy (`orientedSegmentRefs` = true), więc znak P mapuje się na zwrot
      // wprost — a `forward` bierze się ze ZŁOŻENIA znaku z orientacją, nie z
      // geometrii (dowód reguły: `overlay.test.ts`).
      expect(flow[ref].forward).toBe((p as number) >= 0);
      expect(flow[ref].p?.value).toBe(p);
    }
  });
});

describe('S9-2 — stan zerowy (uczciwy brak)', () => {
  it('bieg bez punktów wyniku ⇒ zero etykiet i rachunek pokrycia „0 z 0" (zero atrap)', () => {
    const pusty: RawOverlayPayload = { run_id: 'run-pusty', analysis_type: 'SC_3F', elements: {} };
    const entries = buildResultLabelsForSnapshot(enm, pusty);
    expect(Object.keys(entries)).toHaveLength(0);
    expect(summarizeResultPointCoverage(pusty, entries, resultPointsHiddenByModel(enm)).total).toBe(0);
  });

  it('brak biegu (payload=null) ⇒ zero etykiet, zero strzałek', () => {
    expect(buildResultLabelsForSnapshot(enm, null)).toEqual({});
    expect(buildFlowOverlayForSnapshot(enm, null)).toEqual({});
  });

  it('analiza NIEZNANEJ rodziny ⇒ zero etykiet (zero fabrykacji podpisów)', () => {
    const obcy: RawOverlayPayload = { ...zwarcie, analysis_type: 'DYNAMIC_STABILITY' };
    expect(buildResultLabelsForSnapshot(enm, obcy)).toEqual({});
  });
});
