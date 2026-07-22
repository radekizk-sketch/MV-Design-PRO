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
  buildFaultFlowOverlayFromScene,
  buildFlowOverlayFromScene,
  buildOltcOverlayFromScene,
  faultFlowOverlayTracesToInput,
  flowOverlayValuesTraceToPayload,
  isFaultFlowOverlayEmpty,
  isFlowOverlayEmpty,
  isOltcOverlayEmpty,
  multiHopFaultFlowSegmentRefs,
  oltcOverlayTracesToPayload,
  singleHopSegmentRefs,
} from '../overlay';
import type {
  ShortCircuitBranchFlowV1,
  ShortCircuitFlowOverlayInput,
} from '../../../../sld-overlay/ShortCircuitFlowOverlayAdapter';

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

/** Realne `ownerRef` symboli transformatora (`elementKind==='transformer'`,
 *  `meta.ownerRef` = `transformerRef` = ENM `ref_id`) z PRAWDZIWEJ sceny —
 *  zero fabrykacji refów w danych testowych (wzorzec `realSegmentOwnerRefs`). */
const realTransformerOwnerRefs = Array.from(
  new Set(
    scene.symbols
      .filter((s) => s.meta?.elementKind === 'transformer' && s.meta.ownerRef)
      .map((s) => s.meta!.ownerRef!),
  ),
);

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

describe('overlay.ts — buildOltcOverlayFromScene (V12K-092, badge wynikowy OLTC, spec §14.2/§3.5)', () => {
  it('fixtura zawiera ≥1 symbol transformatora (bramka testu nie jest martwa)', () => {
    expect(realTransformerOwnerRefs.length).toBeGreaterThan(0);
  });

  it('§14.2 „overlay wyłączony bez wyniku": payload=null ⇒ badge pusty', () => {
    expect(isOltcOverlayEmpty(buildOltcOverlayFromScene(scene, null))).toBe(true);
  });

  it('TAP_POSITION + TAP_SWITCH_COUNT w wyniku ⇒ badge z pozycją i liczbą przełączeń (wartości BAJT-RÓWNE)', () => {
    const ref = realTransformerOwnerRefs[0];
    const payload = payloadOf({
      [ref]: elementWithMetrics(ref, {
        TAP_POSITION: { code: 'TAP_POSITION', value: 3, unit: '' },
        TAP_SWITCH_COUNT: { code: 'TAP_SWITCH_COUNT', value: 4, unit: '' },
      }),
    });
    const overlay = buildOltcOverlayFromScene(scene, payload);
    expect(overlay[ref]).toEqual({ ownerRef: ref, tapPosition: 3, switchCount: 4 });
    expect(oltcOverlayTracesToPayload(overlay, payload)).toBe(true);
  });

  it('pozycja ujemna, brak TAP_SWITCH_COUNT ⇒ badge tylko z pozycją (bez fabrykacji 0)', () => {
    const ref = realTransformerOwnerRefs[0];
    const payload = payloadOf({
      [ref]: elementWithMetrics(ref, { TAP_POSITION: { code: 'TAP_POSITION', value: -2, unit: '' } }),
    });
    const overlay = buildOltcOverlayFromScene(scene, payload);
    expect(overlay[ref]).toEqual({ ownerRef: ref, tapPosition: -2 });
    expect('switchCount' in overlay[ref]).toBe(false);
  });

  it('transformator bez TAP_POSITION (brak regulacji, resultset addytywny) ⇒ brak badge (nie 0)', () => {
    const ref = realTransformerOwnerRefs[0];
    const payload = payloadOf({
      [ref]: elementWithMetrics(ref, { P_MW: { code: 'P_MW', value: 5, unit: 'MW' } }),
    });
    expect(isOltcOverlayEmpty(buildOltcOverlayFromScene(scene, payload))).toBe(true);
  });

  it('przebieg NIE-rozpływowy (short_circuit) ⇒ badge pusty (allowlista LOAD_FLOW)', () => {
    const ref = realTransformerOwnerRefs[0];
    const payload = payloadOf(
      { [ref]: elementWithMetrics(ref, { TAP_POSITION: { code: 'TAP_POSITION', value: 1, unit: '' } }) },
      'short_circuit_sn',
    );
    expect(isOltcOverlayEmpty(buildOltcOverlayFromScene(scene, payload))).toBe(true);
  });

  it('determinizm: to samo wejście dwukrotnie ⇒ identyczny JSON.stringify', () => {
    const ref = realTransformerOwnerRefs[0];
    const payload = payloadOf({
      [ref]: elementWithMetrics(ref, {
        TAP_POSITION: { code: 'TAP_POSITION', value: 2, unit: '' },
        TAP_SWITCH_COUNT: { code: 'TAP_SWITCH_COUNT', value: 1, unit: '' },
      }),
    });
    expect(JSON.stringify(buildOltcOverlayFromScene(scene, payload))).toBe(
      JSON.stringify(buildOltcOverlayFromScene(scene, payload)),
    );
  });

  it('TEST NEGATYWNY (wyrocznia gryzie): wartość badge NIE zgadzająca się z payload ⇒ FAIL', () => {
    const ref = realTransformerOwnerRefs[0];
    const payload = payloadOf({
      [ref]: elementWithMetrics(ref, { TAP_POSITION: { code: 'TAP_POSITION', value: 3, unit: '' } }),
    });
    const fabricated = { [ref]: { ownerRef: ref, tapPosition: 99 } };
    expect(oltcOverlayTracesToPayload(fabricated, payload)).toBe(false);
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

  it('fixtura ZAWIERA przęsła wielokawałkowe (43/88) — bramka F-1 ma realny skutek, nie jest martwa', () => {
    // §16-v3 (2026-07-17): scena niesie TERAZ tożsamość ŁAŃCUCHA (kawałek
    // per człon ENM) + 13 otwartych ogonów (pomiar: 53→88 kawałków `seg/`).
    // Kawałki-poprzedniki i ogony mają terminal bez właściciela ⇒ POZA
    // bramką singleHop (bez strzałki — uczciwe „nie wiem", pomiar: 8→43).
    // Bramka F-1 dalej NIE jest martwa: wyklucza niezerowy podzbiór.
    const scene2Bare = scene.segments.filter(
      (s) => s.meta?.elementKind === 'segment' && s.meta.ownerRef && !s.meta.ownerRef.includes('#'),
    );
    const excluded = scene2Bare.filter((s) => !singleHop.has(s.meta!.ownerRef!));
    expect(scene2Bare.length).toBe(88);
    expect(excluded.length).toBe(43);
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

// ---------------------------------------------------------------------------
// Karta S-B (ZWARCIA-PRO pkt 7) — budowniczy strzałek kierunku rozpływu prądu
// zwarciowego + wyrocznia. Realne `ownerRef` ze sceny (wzorzec F9.5 wyżej).
// ---------------------------------------------------------------------------

/** Unikalne refy jednokawałkowe (deduplikacja — ten sam ownerRef może nieść
 *  wiele odcinków sceny; budowniczy i tak emituje jeden wpis per ref). */
const uniqueSingleHopRefs = Array.from(new Set(realSegmentOwnerRefs));

function faultEntry(
  over: Partial<ShortCircuitBranchFlowV1> & { branch_id: string },
): ShortCircuitBranchFlowV1 {
  return {
    branch_name: 'Odcinek testowy',
    source_id: 'ZR-1',
    from_node_id: 'W-A',
    from_node_name: 'Węzeł A',
    to_node_id: 'W-B',
    to_node_name: 'Węzeł B',
    i_ka: 0.245,
    direction: 'from_to',
    ...over,
  };
}

function faultInputOf(flows: readonly ShortCircuitBranchFlowV1[]): ShortCircuitFlowOverlayInput {
  return { run_id: 'run-sc-test', fault_type: '3F', fault_element_ref: 'EL-ZWARCIE', flows };
}

/** Głęboki klon (mutacje testowe poniżej nie mogą dotknąć fixtury bazowej). */
function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('overlay.ts — buildFaultFlowOverlayFromScene (karta S-B, strzałki rozpływu zwarciowego)', () => {
  it('input=null ⇒ nakładka pusta (strzałki wyłączone bez kanału kierunku, zero atrap)', () => {
    const overlay = buildFaultFlowOverlayFromScene(scene, null, singleHop);
    expect(isFaultFlowOverlayEmpty(overlay)).toBe(true);
  });

  it('pusta lista wpisów (policzono, brak wkładów falownikowych) ⇒ nakładka pusta', () => {
    const overlay = buildFaultFlowOverlayFromScene(scene, faultInputOf([]), singleHop);
    expect(isFaultFlowOverlayEmpty(overlay)).toBe(true);
  });

  it('direction="from_to" ⇒ forward=true; iKa = największy wkład gałęzi; jedna gałąź ⇒ waga 1 ⇒ token critical', () => {
    const ref = uniqueSingleHopRefs[0];
    const input = faultInputOf([
      faultEntry({ branch_id: ref, source_id: 'ZR-1', i_ka: 0.1, direction: 'from_to' }),
      faultEntry({ branch_id: ref, source_id: 'ZR-2', i_ka: 0.245, direction: 'from_to' }),
    ]);
    const overlay = buildFaultFlowOverlayFromScene(scene, input, singleHop);
    expect(overlay[ref]).toEqual({
      ownerRef: ref,
      forward: true,
      iKa: 0.245,
      payloadMaxKa: 0.245,
      colorToken: 'critical',
    });
    expect(faultFlowOverlayTracesToInput(overlay, input)).toBe(true);
  });

  it('direction="to_from" ⇒ forward=false — zwrot WPROST z tokenu solvera, nie z heurystyki', () => {
    const ref = uniqueSingleHopRefs[0];
    const input = faultInputOf([faultEntry({ branch_id: ref, direction: 'to_from' })]);
    const overlay = buildFaultFlowOverlayFromScene(scene, input, singleHop);
    expect(overlay[ref]?.forward).toBe(false);
    expect(faultFlowOverlayTracesToInput(overlay, input)).toBe(true);
  });

  it('MIESZANE kierunki na tej samej gałęzi ⇒ brak wpisu (uczciwe „nie wiem" zamiast fabrykacji wypadkowej)', () => {
    const ref = uniqueSingleHopRefs[0];
    const input = faultInputOf([
      faultEntry({ branch_id: ref, source_id: 'ZR-1', direction: 'from_to' }),
      faultEntry({ branch_id: ref, source_id: 'ZR-2', direction: 'to_from' }),
    ]);
    const overlay = buildFaultFlowOverlayFromScene(scene, input, singleHop);
    expect(overlay[ref]).toBeUndefined();
    expect(isFaultFlowOverlayEmpty(overlay)).toBe(true);
  });

  it('wpisy bez podstawy strzałki (i_ka null/0, nieznany token kierunku) ⇒ brak wpisu', () => {
    const ref = uniqueSingleHopRefs[0];
    const input = faultInputOf([
      faultEntry({ branch_id: ref, i_ka: null }),
      faultEntry({ branch_id: ref, i_ka: 0 }),
      faultEntry({ branch_id: ref, direction: 'nieznany' }),
    ]);
    const overlay = buildFaultFlowOverlayFromScene(scene, input, singleHop);
    expect(isFaultFlowOverlayEmpty(overlay)).toBe(true);
  });

  it('bramka F-1: ref POZA zbiorem singleHop ⇒ ZERO wpisu (kierunek geometrycznie nieudowodniony)', () => {
    const ref = uniqueSingleHopRefs[0];
    const input = faultInputOf([faultEntry({ branch_id: ref })]);
    const overlay = buildFaultFlowOverlayFromScene(scene, input, new Set<string>());
    expect(isFaultFlowOverlayEmpty(overlay)).toBe(true);
  });

  it('tercyle skali względnej SPÓJNE z adapterem W-C: waga 1 ⇒ critical, 0,4 ⇒ warning, 0,1 ⇒ ok', () => {
    expect(uniqueSingleHopRefs.length).toBeGreaterThanOrEqual(3);
    const [refA, refB, refC] = uniqueSingleHopRefs;
    const input = faultInputOf([
      faultEntry({ branch_id: refA, i_ka: 3.0 }),
      faultEntry({ branch_id: refB, i_ka: 1.2 }),
      faultEntry({ branch_id: refC, i_ka: 0.3 }),
    ]);
    const overlay = buildFaultFlowOverlayFromScene(scene, input, singleHop);
    expect(overlay[refA]?.colorToken).toBe('critical');
    expect(overlay[refB]?.colorToken).toBe('warning');
    expect(overlay[refC]?.colorToken).toBe('ok');
    // Baza skali wspólna dla całego payloadu (największy wkład wejścia).
    expect(overlay[refB]?.payloadMaxKa).toBe(3.0);
  });

  it('determinizm: to samo wejście dwukrotnie ⇒ identyczny JSON.stringify (zero Date/losowości)', () => {
    const input = faultInputOf([
      faultEntry({ branch_id: uniqueSingleHopRefs[0], i_ka: 1.5 }),
      faultEntry({ branch_id: uniqueSingleHopRefs[1], i_ka: 0.5, direction: 'to_from' }),
    ]);
    const a = buildFaultFlowOverlayFromScene(scene, input, singleHop);
    const b = buildFaultFlowOverlayFromScene(scene, input, singleHop);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('overlay.ts — faultFlowOverlayTracesToInput (wyrocznia, karta S-B)', () => {
  it('nakładka pusta (undefined) ⇒ wyrocznia PASS trywialnie', () => {
    expect(faultFlowOverlayTracesToInput(undefined, null)).toBe(true);
  });

  it('TEST NEGATYWNY (wyrocznia gryzie): iKa niezgodne z największym wkładem gałęzi ⇒ FAIL', () => {
    const ref = uniqueSingleHopRefs[0];
    const input = faultInputOf([faultEntry({ branch_id: ref, i_ka: 0.245 })]);
    const overlay = buildFaultFlowOverlayFromScene(scene, input, singleHop);
    const sfalszowana = { [ref]: { ...overlay[ref], iKa: 9.99 } };
    expect(faultFlowOverlayTracesToInput(sfalszowana, input)).toBe(false);
  });

  it('TEST NEGATYWNY: forward przeciwny do tokenu kierunku wejścia ⇒ FAIL', () => {
    const ref = uniqueSingleHopRefs[0];
    const input = faultInputOf([faultEntry({ branch_id: ref, direction: 'from_to' })]);
    const overlay = buildFaultFlowOverlayFromScene(scene, input, singleHop);
    const odwrocona = { [ref]: { ...overlay[ref], forward: false } };
    expect(faultFlowOverlayTracesToInput(odwrocona, input)).toBe(false);
  });

  it('TEST NEGATYWNY: wpis nakładki bez ODPOWIADAJĄCYCH mierzalnych wpisów wejścia ⇒ FAIL (nakładka nieaktualna)', () => {
    const ref = uniqueSingleHopRefs[0];
    const input = faultInputOf([faultEntry({ branch_id: ref })]);
    const overlay = buildFaultFlowOverlayFromScene(scene, input, singleHop);
    expect(faultFlowOverlayTracesToInput(overlay, faultInputOf([]))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GAP V12K-121 (karta SLD-W): rozszerzenie bramki F-1 o przęsła WIELOKAWAŁKOWE
// (`multiHopFaultFlowSegmentRefs`) — WYŁĄCZNIE dla strzałek zwarciowych.
// Fixtura `openTrunkChain.enm.json` (§16-v3, ta sama co
// `buildScene.openTerminal.test.ts`): GPZ→S0 przęsło 2-członowe (F2 +
// segment_L, złączone mufą `bus/2eb90.../downstream`) — REALNY łańcuch
// wielokawałkowy, zero fabrykacji. Mutacje niżej (branching/reversed) są
// głębokimi klonami TEJ SAMEJ realnej fixtury ze strukturalnie poprawną,
// minimalną zmianą (ten sam wzorzec obiektu gałęzi/szyny co istniejące
// odcinki) — precyzyjna kontrola przypadków odmowy bez fabrykowania sieci
// od zera.
// ---------------------------------------------------------------------------

describe('overlay.ts — multiHopFaultFlowSegmentRefs (GAP V12K-121, karta SLD-W)', () => {
  const chainFixturePath = resolve(here, '..', '..', 'scene', '__tests__', 'fixtures', 'openTrunkChain.enm.json');
  const chainEnm = (JSON.parse(readFileSync(chainFixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;
  const F2 = 'seg/2eb903289ceccfe33d015b843cc0a839/segment';
  const SEGMENT_L = 'seg/fffe06fde7d5aca09fa6e904e942ad63/segment_L';
  const SEGMENT_R = 'seg/fffe06fde7d5aca09fa6e904e942ad63/segment_R';
  const SPLICE_BUS = 'bus/2eb903289ceccfe33d015b843cc0a839/downstream';
  const LODS = [0, 1, 2] as const;

  it('kontrola wejścia: przęsło GPZ→S0 tej fixtury jest wielokawałkowe (poza singleHop)', () => {
    expect(singleHopSegmentRefs(chainEnm).size).toBe(0);
  });

  it('łańcuch prosty 2 kawałki: przedstawicielem zostaje JEDEN człon (F2) — nie CAŁA grupa (jedna strzałka, nie jedna na kawałek)', () => {
    for (const lod of LODS) {
      const refs = multiHopFaultFlowSegmentRefs(buildSceneV3(chainEnm, lod), chainEnm);
      expect(refs.size).toBe(1);
      expect(refs.has(F2)).toBe(true);
      expect(refs.has(SEGMENT_L)).toBe(false);
    }
  });

  it('przedstawiciel dostaje strzałkę: direction="from_to" ⇒ forward=true, wartości WPROST z wejścia', () => {
    const chainScene = buildSceneV3(chainEnm, 2);
    const trusted = new Set([...singleHopSegmentRefs(chainEnm), ...multiHopFaultFlowSegmentRefs(chainScene, chainEnm)]);
    const input = faultInputOf([faultEntry({ branch_id: F2, direction: 'from_to', i_ka: 1.2 })]);
    const overlay = buildFaultFlowOverlayFromScene(chainScene, input, trusted);
    expect(overlay[F2]).toEqual({ ownerRef: F2, forward: true, iKa: 1.2, payloadMaxKa: 1.2, colorToken: 'critical' });
    expect(faultFlowOverlayTracesToInput(overlay, input)).toBe(true);
  });

  it('orientacja odwrotna: direction="to_from" ⇒ forward=false (oba kierunki poprawne, zwrot WPROST z tokenu solvera)', () => {
    const chainScene = buildSceneV3(chainEnm, 2);
    const trusted = new Set([...singleHopSegmentRefs(chainEnm), ...multiHopFaultFlowSegmentRefs(chainScene, chainEnm)]);
    const input = faultInputOf([faultEntry({ branch_id: F2, direction: 'to_from', i_ka: 0.8 })]);
    const overlay = buildFaultFlowOverlayFromScene(chainScene, input, trusted);
    expect(overlay[F2]?.forward).toBe(false);
    expect(faultFlowOverlayTracesToInput(overlay, input)).toBe(true);
  });

  it('człon NIEWYBRANY łańcucha (segment_L) NIE dostaje własnego wpisu, mimo mierzalnych danych pod jego branch_id — jedna strzałka na przęsło, nie jedna na każdy realny człon', () => {
    const chainScene = buildSceneV3(chainEnm, 2);
    const trusted = new Set([...singleHopSegmentRefs(chainEnm), ...multiHopFaultFlowSegmentRefs(chainScene, chainEnm)]);
    const input = faultInputOf([
      faultEntry({ branch_id: F2, direction: 'from_to', i_ka: 1.2 }),
      faultEntry({ branch_id: SEGMENT_L, direction: 'from_to', i_ka: 1.2 }),
    ]);
    const overlay = buildFaultFlowOverlayFromScene(chainScene, input, trusted);
    expect(overlay[F2]).toBeDefined();
    expect(overlay[SEGMENT_L]).toBeUndefined();
  });

  it('NEGATYW — łańcuch ROZGAŁĘZIONY (T-węzeł): trzeci odcinek (segment_R) dołączony do TEJ SAMEJ mufy ⇒ grupa odrzucona całkowicie (zero przedstawiciela, uczciwe „nie wiem")', () => {
    const branched = deepClone(chainEnm);
    const segR = (branched.branches as Array<{ ref_id: string; from_bus_ref: string }>).find(
      (b) => b.ref_id === SEGMENT_R,
    );
    if (!segR) throw new Error('kontrola pomiaru: fixtura musi nieść segment_R');
    segR.from_bus_ref = SPLICE_BUS; // rozgałęzienie: 3 odcinki dotykają tej samej mufy
    for (const lod of LODS) {
      expect(multiHopFaultFlowSegmentRefs(buildSceneV3(branched, lod), branched).size).toBe(0);
    }
  });

  it('NEGATYW — kierunki MIESZANE (człon zadeklarowany odwrotnie): segment_L z zamienionymi from/to ⇒ dopasowanie końców się nie zgadza, grupa odrzucona', () => {
    const reversed = deepClone(chainEnm);
    const segL = (reversed.branches as Array<{ ref_id: string; from_bus_ref: string; to_bus_ref: string }>).find(
      (b) => b.ref_id === SEGMENT_L,
    );
    if (!segL) throw new Error('kontrola pomiaru: fixtura musi nieść segment_L');
    const tmp = segL.from_bus_ref;
    segL.from_bus_ref = segL.to_bus_ref;
    segL.to_bus_ref = tmp;
    for (const lod of LODS) {
      expect(multiHopFaultFlowSegmentRefs(buildSceneV3(reversed, lod), reversed).size).toBe(0);
    }
  });

  it('determinizm: dwa wywołania na tej samej scenie ⇒ identyczny zbiór przedstawicieli', () => {
    const chainScene = buildSceneV3(chainEnm, 2);
    const a = multiHopFaultFlowSegmentRefs(chainScene, chainEnm);
    const b = multiHopFaultFlowSegmentRefs(chainScene, chainEnm);
    expect([...a].sort()).toEqual([...b].sort());
  });
});

describe('overlay.ts — łańcuch 4-członowy na realnej fixturze substrate (GAP V12K-121, generalizacja poza 2 kawałki)', () => {
  // Grupa 4-członowa NIEZALEŻNIE potwierdzona sondą na fixturze `sldSubstrate52s`:
  // dwa środkowe człony ('segment'/'segment') mają OBIE strony bez właściciela
  // (mufa-mufa) — prawdziwy dowód, że bramka generalizuje się poza 2 kawałki,
  // nie tylko na parę granica-mufa.
  const GROUP = [
    'seg/3ccf71246d63661d1ff5562f39064f98/segment_R',
    'seg/8a7bb2f6ec9bf783133b1817611a5bf2/segment',
    'seg/5fb7f3221c666db9aa8925d6f3e7c4ca/segment',
    'seg/2ef31c8e5a13ad9a42afd95f4ec41763/segment_L_L',
  ] as const;

  it('kontrola wejścia: WSZYSTKIE 4 człony grupy są poza singleHop (prawdziwe wielokawałkowe)', () => {
    for (const ref of GROUP) expect(singleHop.has(ref)).toBe(false);
  });

  it('DOKŁADNIE jeden przedstawiciel z tej grupy 4-członowej trafia do zbioru, na każdym LOD', () => {
    for (const lod of [0, 1, 2] as const) {
      const refs = multiHopFaultFlowSegmentRefs(buildSceneV3(enm, lod), enm);
      const chosenFromGroup = GROUP.filter((ref) => refs.has(ref));
      expect(chosenFromGroup.length).toBe(1);
    }
  });

  it('przedstawiciel grupy 4-członowej dostaje strzałkę spójną z direction="from_to"; pozostałe 3 człony — zero wpisu', () => {
    const sceneLod2 = buildSceneV3(enm, 2);
    const refs = multiHopFaultFlowSegmentRefs(sceneLod2, enm);
    const chosen = GROUP.find((ref) => refs.has(ref));
    expect(chosen).toBeDefined();
    const trusted = new Set([...singleHop, ...refs]);
    const input = faultInputOf(GROUP.map((ref) => faultEntry({ branch_id: ref, direction: 'from_to', i_ka: 0.9 })));
    const overlay = buildFaultFlowOverlayFromScene(sceneLod2, input, trusted);
    expect(overlay[chosen!]).toBeDefined();
    expect(overlay[chosen!]?.forward).toBe(true);
    for (const ref of GROUP) {
      if (ref !== chosen) expect(overlay[ref]).toBeUndefined();
    }
  });
});

describe('overlay.ts — GAP V12K-121 nie zmienia bramkę F-1 jednoprzeskokową (regresja)', () => {
  it('singleHopSegmentRefs(52s) niezmienione: 45 (ta sama liczba co przed rozszerzeniem)', () => {
    expect(singleHop.size).toBe(45);
  });

  it('buildFlowOverlayFromScene (przepływ MOCY) niezmieniony: dalej działa WYŁĄCZNIE z bramką singleHop, GAP V12K-121 dotyczy tylko strzałek zwarciowych (buildFaultFlowOverlayForSnapshot, funkcja ta nie jest przez ten GAP wołana z inną bramką)', () => {
    const ref = uniqueSingleHopRefs[0];
    const payload = payloadOf({
      [ref]: elementWithMetrics(ref, { P_MW: { code: 'P_MW', value: 3, unit: 'MW' } }),
    });
    const overlay = buildFlowOverlayFromScene(scene, payload, singleHop);
    expect(overlay[ref]).toEqual({ ownerRef: ref, forward: true, p: { value: 3, unit: 'MW' } });
  });

  it('strzałka zwarciowa na przęśle jednokawałkowym: zachowanie identyczne jak przed GAP V12K-121 (regresja)', () => {
    const ref = uniqueSingleHopRefs[0];
    const input = faultInputOf([faultEntry({ branch_id: ref, direction: 'from_to', i_ka: 0.5 })]);
    const overlay = buildFaultFlowOverlayFromScene(scene, input, singleHop);
    expect(overlay[ref]).toEqual({ ownerRef: ref, forward: true, iKa: 0.5, payloadMaxKa: 0.5, colorToken: 'critical' });
  });
});
