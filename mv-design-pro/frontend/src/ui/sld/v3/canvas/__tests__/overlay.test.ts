/**
 * F9.5 — testy kontraktu/budowniczego/wyroczni nakładki przepływu mocy
 * (`overlay.ts`, spec §14.2 „Wizualizacja przepływu mocy"). Fixtura REALNA
 * (`sldSubstrate52s`, ta sama co `sldCanvasV3Workspace.test.tsx`/
 * `scripts/sld_v3_acceptance.mjs`) — `ownerRef` użyte w testach to PRAWDZIWE
 * `segmentRef` odczytane ze sceny (`scene.segments[...].meta.ownerRef`), nie
 * wymyślone stringi — zero fabrykacji nawet w danych testowych.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import type { RawOverlayElement, RawOverlayPayload } from '../../../../sld-overlay/rawResultOverlayStore';
import { buildSldDataFromSnapshot } from '../../../v2/canvas/enmToSldAdapter';
import { buildSceneV3 } from '../../scene/buildScene';
import {
  buildFlowOverlayFromScene,
  flowOverlayValuesTraceToPayload,
  isFlowOverlayEmpty,
  singleHopSegmentRefs,
} from '../overlay';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here,
  '..',
  '..',
  '..',
  'v2',
  'geometry',
  '__tests__',
  'fixtures',
  'sldSubstrate52s.enm.json',
);
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

const scene = buildSceneV3(enm, 2);

/** F-1 (recenzja Opusa): zbiór refów jednokawałkowych — jedyne z udowodnionym
 *  kierunkiem, jedyne dopuszczone przez budowniczego do wpisu strzałki. */
const singleHop = singleHopSegmentRefs(enm);

/** Realne `ownerRef` odcinków klasy `elementKind==='segment'` z PRAWDZIWYM
 *  `segmentRef` (bez kompozytu `#...`), OGRANICZONE do jednokawałkowych —
 *  tylko te przechodzą przez bramkę F-1 budowniczego. */
const realSegmentOwnerRefs = scene.segments
  .filter(
    (s) =>
      s.meta?.elementKind === 'segment' &&
      s.meta.ownerRef &&
      !s.meta.ownerRef.includes('#') &&
      singleHop.has(s.meta.ownerRef),
  )
  .map((s) => s.meta!.ownerRef!);

function elementWithMetrics(refId: string, metrics: RawOverlayElement['metrics']): RawOverlayElement {
  return { ref_id: refId, kind: 'branch', badges: [], metrics, severity: 'INFO' };
}

function payloadOf(elements: Record<string, RawOverlayElement>, analysisType = 'load_flow'): RawOverlayPayload {
  return { run_id: 'run-test', analysis_type: analysisType, elements };
}

describe('overlay.ts — buildFlowOverlayFromScene (F9.5, spec §14.2)', () => {
  it('§14.2 „overlay wyłączony bez wyniku": payload=null ⇒ nakładka pusta (zero atrap)', () => {
    const overlay = buildFlowOverlayFromScene(scene, null, singleHop);
    expect(isFlowOverlayEmpty(overlay)).toBe(true);
  });

  it('payload obecny, ale bez P_MW dla żadnego odcinka sceny ⇒ nakładka pusta (brak podstawy kierunku)', () => {
    expect(realSegmentOwnerRefs.length).toBeGreaterThan(0);
    const payload = payloadOf({
      [realSegmentOwnerRefs[0]]: elementWithMetrics(realSegmentOwnerRefs[0], {
        // Q/I bez P — §14.2 „kierunek/wartość pochodzi z wyniku power-flow",
        // zrealizowane odczytem znaku P_MW (r2, F9.7): wpis bez P musi być
        // pominięty w CAŁOŚCI (Q/I same nie niosą kierunku).
        Q_Mvar: { code: 'Q_Mvar', value: 1.2, unit: 'Mvar' },
        I_A: { code: 'I_A', value: 50, unit: 'A' },
      }),
    });
    const overlay = buildFlowOverlayFromScene(scene, payload, singleHop);
    expect(isFlowOverlayEmpty(overlay)).toBe(true);
  });

  it('§14.2: P_MW dodatnie ⇒ forward=true, wartości BAJT-RÓWNE wynikowi (zero fikcji)', () => {
    const ref = realSegmentOwnerRefs[0];
    const payload = payloadOf({
      [ref]: elementWithMetrics(ref, {
        P_MW: { code: 'P_MW', value: 2.5, unit: 'MW' },
        Q_Mvar: { code: 'Q_Mvar', value: 0.8, unit: 'Mvar' },
        I_A: { code: 'I_A', value: 120, unit: 'A' },
      }),
    });
    const overlay = buildFlowOverlayFromScene(scene, payload, singleHop);
    expect(overlay[ref]).toEqual({
      ownerRef: ref,
      forward: true,
      p: { value: 2.5, unit: 'MW' },
      q: { value: 0.8, unit: 'Mvar' },
      i: { value: 120, unit: 'A' },
    });
    expect(flowOverlayValuesTraceToPayload(overlay, payload)).toBe(true);
  });

  it('§14.2: P_MW ujemne ⇒ forward=false — kierunek WPROST ze znaku wyniku, nie z heurystyki geometrii', () => {
    const ref = realSegmentOwnerRefs[1];
    const payload = payloadOf({
      [ref]: elementWithMetrics(ref, { P_MW: { code: 'P_MW', value: -1.1, unit: 'MW' } }),
    });
    const overlay = buildFlowOverlayFromScene(scene, payload, singleHop);
    expect(overlay[ref].forward).toBe(false);
    expect(overlay[ref].p).toEqual({ value: -1.1, unit: 'MW' });
    // Q/I nieobecne w wyniku ⇒ nieobecne w nakładce (nie fabrykowane jako 0).
    expect(overlay[ref].q).toBeUndefined();
    expect(overlay[ref].i).toBeUndefined();
  });

  it('przebieg zwarciowy (analysis_type short_circuit) ⇒ nakładka pusta (P/Q/I nie mają sensu dla SC_3F, spec §14.2 tylko LOAD_FLOW)', () => {
    const ref = realSegmentOwnerRefs[0];
    const payload = payloadOf(
      { [ref]: elementWithMetrics(ref, { P_MW: { code: 'P_MW', value: 3, unit: 'MW' } }) },
      'short_circuit_sn',
    );
    const overlay = buildFlowOverlayFromScene(scene, payload, singleHop);
    expect(isFlowOverlayEmpty(overlay)).toBe(true);
  });

  it('element sceny bez dopasowania w payload.elements ⇒ pominięty, zero wpisu (nie null/0)', () => {
    const payload = payloadOf({
      'nieznany-ref-spoza-sceny': elementWithMetrics('nieznany-ref-spoza-sceny', {
        P_MW: { code: 'P_MW', value: 9, unit: 'MW' },
      }),
    });
    const overlay = buildFlowOverlayFromScene(scene, payload, singleHop);
    expect(isFlowOverlayEmpty(overlay)).toBe(true);
  });

  it('determinizm: to samo wejście (scena, payload) wywołane dwukrotnie ⇒ identyczny JSON.stringify (zero Date/losowości)', () => {
    const ref = realSegmentOwnerRefs[2];
    const payload = payloadOf({
      [ref]: elementWithMetrics(ref, {
        P_MW: { code: 'P_MW', value: 0.42, unit: 'MW' },
        Q_Mvar: { code: 'Q_Mvar', value: -0.1, unit: 'Mvar' },
      }),
    });
    const first = buildFlowOverlayFromScene(scene, payload, singleHop);
    const second = buildFlowOverlayFromScene(scene, payload, singleHop);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});

describe('overlay.ts — flowOverlayValuesTraceToPayload (wyrocznia flow_overlay_probe, spec §11.13)', () => {
  it('nakładka pusta (undefined) ⇒ wyrocznia PASS trywialnie (nic do udowodnienia)', () => {
    expect(flowOverlayValuesTraceToPayload(undefined, null)).toBe(true);
  });

  it('KAŻDA wartość nakładki zbudowanej przez buildFlowOverlayFromScene wywodzi się z payload (dowód pozytywny na realnej scenie)', () => {
    const ref = realSegmentOwnerRefs[3];
    const payload = payloadOf({
      [ref]: elementWithMetrics(ref, {
        P_MW: { code: 'P_MW', value: 1.75, unit: 'MW' },
        I_A: { code: 'I_A', value: 88, unit: 'A' },
      }),
    });
    const overlay = buildFlowOverlayFromScene(scene, payload, singleHop);
    expect(flowOverlayValuesTraceToPayload(overlay, payload)).toBe(true);
  });

  it('TEST NEGATYWNY (dowód, że wyrocznia gryzie): wartość nakładki NIE zgadzająca się z payload ⇒ FAIL', () => {
    const ref = realSegmentOwnerRefs[0];
    const payload = payloadOf({
      [ref]: elementWithMetrics(ref, { P_MW: { code: 'P_MW', value: 5, unit: 'MW' } }),
    });
    // Wpis SFABRYKOWANY ręcznie (wartość 999 nigdy nie pochodzi z payload) —
    // symuluje regres, w którym budowniczy wpisałby coś od siebie.
    const fabricatedOverlay = {
      [ref]: { ownerRef: ref, forward: true, p: { value: 999, unit: 'MW' } },
    };
    expect(flowOverlayValuesTraceToPayload(fabricatedOverlay, payload)).toBe(false);
  });

  it('TEST NEGATYWNY: kierunek (`forward`) niezgodny ze znakiem `p.value` niesionym w TYM SAMYM wpisie ⇒ FAIL', () => {
    const ref = realSegmentOwnerRefs[0];
    const payload = payloadOf({
      [ref]: elementWithMetrics(ref, { P_MW: { code: 'P_MW', value: 5, unit: 'MW' } }),
    });
    const fabricatedOverlay = {
      // P dodatnie (5), ale forward=false — sprzeczność z zasadą „kierunek =
      // znak P z wyniku".
      [ref]: { ownerRef: ref, forward: false, p: { value: 5, unit: 'MW' } },
    };
    expect(flowOverlayValuesTraceToPayload(fabricatedOverlay, payload)).toBe(false);
  });

  it('TEST NEGATYWNY: ownerRef nakładki bez ODPOWIADAJĄCEGO elementu w payload ⇒ FAIL (element „zniknął" z wyniku, nakładka nieaktualna)', () => {
    const ref = realSegmentOwnerRefs[0];
    const emptyPayload = payloadOf({});
    const staleOverlay = {
      [ref]: { ownerRef: ref, forward: true, p: { value: 1, unit: 'MW' } },
    };
    expect(flowOverlayValuesTraceToPayload(staleOverlay, emptyPayload)).toBe(false);
  });
});

describe('overlay.ts — isFlowOverlayEmpty', () => {
  it('undefined ⇒ pusta', () => expect(isFlowOverlayEmpty(undefined)).toBe(true));
  it('{} ⇒ pusta', () => expect(isFlowOverlayEmpty({})).toBe(true));
  it('≥1 wpis ⇒ NIE pusta', () => {
    const ref = realSegmentOwnerRefs[0];
    expect(isFlowOverlayEmpty({ [ref]: { ownerRef: ref, forward: true } })).toBe(false);
  });
});

describe('overlay.ts — F-3 (recenzja Opusa): allowlista analysis_type', () => {
  it('payload typu NIEZNANEGO (nie-LOAD_FLOW) z poprawnym P_MW ⇒ nakładka pusta (uczciwe nic zamiast czytania P z niewiadomego przebiegu)', () => {
    const ref = realSegmentOwnerRefs[0];
    for (const unknownType of ['PHASE_STATE_SN', 'DYNAMIC_STABILITY', 'SOURCE_COMPLIANCE', 'przyszly_typ_x', '']) {
      const payload = payloadOf(
        { [ref]: elementWithMetrics(ref, { P_MW: { code: 'P_MW', value: 3, unit: 'MW' } }) },
        unknownType,
      );
      expect(isFlowOverlayEmpty(buildFlowOverlayFromScene(scene, payload, singleHop))).toBe(true);
    }
  });

  it('payload "LOAD_FLOW" (dokładna wartość emitowana przez backend, canonical_analysis.py _execution_analysis_type_for_run) ⇒ nakładka budowana', () => {
    const ref = realSegmentOwnerRefs[0];
    const payload = payloadOf(
      { [ref]: elementWithMetrics(ref, { P_MW: { code: 'P_MW', value: 3, unit: 'MW' } }) },
      'LOAD_FLOW',
    );
    expect(isFlowOverlayEmpty(buildFlowOverlayFromScene(scene, payload, singleHop))).toBe(false);
  });
});

describe('overlay.ts — F-1 (recenzja Opusa): kontrakt kierunku forward ↔ geometria', () => {
  it('KONTRAKT (przypadek jednokawałkowy, realna scena): dla KAŻDEGO konektora z bramki singleHop strona points[0] geometrii == strona fromTerminal gałęzi (znak p_from_mw mapuje się na zwrot wprost)', () => {
    // Adapter — TA SAMA ścieżka danych co buildSceneV3/singleHopSegmentRefs.
    const sldData = buildSldDataFromSnapshot(enm, enm.logical_views ?? null, null);
    const terminalsByRef = new Map<string, { readonly fromRef: string; readonly toRef: string }>();
    for (const run of sldData.cableRuns ?? []) {
      for (const sp of run.segmentPaths ?? []) {
        if (sp.fromTerminal?.ownerRef && sp.toTerminal?.ownerRef) {
          terminalsByRef.set(sp.segmentRef, { fromRef: sp.fromTerminal.ownerRef, toRef: sp.toTerminal.ownerRef });
        }
      }
    }
    // Geometria stacji: na L0 KAŻDA stacja ma dokładnie jeden symbol
    // `stationCollapsed` z `ownerRef = station id` — kotwica pozycji X.
    const scene0 = buildSceneV3(enm, 0);
    const stationX = new Map<string, number>();
    for (const s of scene0.symbols) {
      if (s.symbolId === 'stationCollapsed' && s.meta?.ownerRef) stationX.set(s.meta.ownerRef, s.x);
    }
    let checked = 0;
    for (const seg of scene0.segments) {
      const ref = seg.meta?.ownerRef;
      if (!ref || seg.meta?.elementKind !== 'segment' || ref.includes('#')) continue;
      const terminals = terminalsByRef.get(ref);
      if (!terminals) continue; // wielokawałkowe — poza bramką, bez strzałki
      const fromX = stationX.get(terminals.fromRef);
      const toX = stationX.get(terminals.toRef);
      if (fromX === undefined || toX === undefined) continue; // GPZ (brak stationCollapsed)
      const p0 = seg.points[0];
      const pLast = seg.points[seg.points.length - 1];
      // points[0] leży BLIŻEJ stacji fromTerminal niż stacji toTerminal —
      // dokładnie to wiązanie czyni znak p_from_mw (dodatni = od from ku to)
      // poprawnym zwrotem strzałki points[0]→points[last].
      expect(Math.abs(p0.x - fromX)).toBeLessThan(Math.abs(p0.x - toX));
      expect(Math.abs(pLast.x - toX)).toBeLessThan(Math.abs(pLast.x - fromX));
      checked += 1;
    }
    // Kontrola mocy dowodu: kontrakt sprawdzony na niezerowej liczbie przęseł.
    expect(checked).toBeGreaterThan(30);
  });

  it('fixtura ZAWIERA przęsła wielokawałkowe (8/53) — bramka F-1 ma realny skutek, nie jest martwa', () => {
    const scene2Bare = scene.segments.filter(
      (s) => s.meta?.elementKind === 'segment' && s.meta.ownerRef && !s.meta.ownerRef.includes('#'),
    );
    const excluded = scene2Bare.filter((s) => !singleHop.has(s.meta!.ownerRef!));
    expect(scene2Bare.length).toBe(53);
    expect(excluded.length).toBe(8);
  });

  it('TEST NEGATYWNY (bramka gryzie): ref POZA zbiorem singleHop z poprawnym P_MW w payload ⇒ ZERO wpisu (uczciwe „nie wiem" zamiast potencjalnie błędnej strzałki)', () => {
    const multiHopRef = scene.segments.find(
      (s) =>
        s.meta?.elementKind === 'segment' &&
        s.meta.ownerRef &&
        !s.meta.ownerRef.includes('#') &&
        !singleHop.has(s.meta.ownerRef),
    )?.meta?.ownerRef;
    expect(multiHopRef).toBeTruthy();
    const payload = payloadOf({
      [multiHopRef!]: elementWithMetrics(multiHopRef!, { P_MW: { code: 'P_MW', value: 7, unit: 'MW' } }),
    });
    const overlay = buildFlowOverlayFromScene(scene, payload, singleHop);
    expect(overlay[multiHopRef!]).toBeUndefined();
    expect(isFlowOverlayEmpty(overlay)).toBe(true);
  });
});
