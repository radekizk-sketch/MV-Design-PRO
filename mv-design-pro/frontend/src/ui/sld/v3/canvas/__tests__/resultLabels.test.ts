/**
 * W4 (RECENZJA_L2_POLA_WYPOSAZENIE_2026-07 §8/§16) — testy budowniczego CZYSTEGO
 * warstwy liczbowych etykiet wynikowych (`resultLabels.ts`). Fixtura REALNA
 * (`sldSubstrate52s`, ta sama co `overlay.test.ts`/`sldCanvasV3.test.tsx`);
 * WSZYSTKIE `ownerRef` odczytane ze sceny (`scene.symbols`/`scene.segments`
 * `.meta.ownerRef`) — zero wymyślonych refów.
 *
 * ŹRÓDŁO LICZB (zakaz wymyślania liczb, dyrektywa 2026-07-18): wartości metryk
 * przepisane z realnych źródeł w repo:
 *  - loading_pct=72.5, i_a=350, ikss_ka=12.5, ikss_a=116_910 →
 *    `backend/tests/test_result_contract_v1.py` (kontraktowe wartości
 *    ResultsContractV1);
 *  - p_from_mw=6.546769 → `frontend/src/ui/sld/v2/geometry/__tests__/fixtures/
 *    sldSubstrate52s.powerflow.json` (realny bieg newton-raphson, branch_flow
 *    seg/0c7e6284…/segment_L).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import type { RawOverlayElement, RawOverlayPayload } from '../../../../sld-overlay/rawResultOverlayStore';
import { buildSceneV3 } from '../../scene/buildScene';
import {
  buildResultLabelsFromScene,
  isResultLabelsEmpty,
  singleHopSegmentRefs,
} from '../resultLabels';

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
const singleHop = singleHopSegmentRefs(enm);

/** Realny `ownerRef` pierwszego symbolu danej klasy — zero fabrykacji. */
function firstSymbolOwnerRef(elementKind: string): string {
  const s = scene.symbols.find((sym) => sym.meta?.elementKind === elementKind && sym.meta?.ownerRef);
  if (!s?.meta?.ownerRef) throw new Error(`brak symbolu ${elementKind} w scenie testowej`);
  return s.meta.ownerRef;
}

/** Realny `ownerRef` przęsła jednokawałkowego (klasa 'segment', bez kompozytu,
 *  w bramce singleHop) — jedyne dopuszczone do etykiety obciążenia. */
const branchRef = (() => {
  const s = scene.segments.find(
    (seg) =>
      seg.meta?.elementKind === 'segment' &&
      seg.meta.ownerRef &&
      !seg.meta.ownerRef.includes('#') &&
      singleHop.has(seg.meta.ownerRef),
  );
  if (!s?.meta?.ownerRef) throw new Error('brak przęsła jednokawałkowego w scenie testowej');
  return s.meta.ownerRef;
})();

const trRef = firstSymbolOwnerRef('transformer');
const sourceRef = firstSymbolOwnerRef('source');

function el(refId: string, kind: string, metrics: RawOverlayElement['metrics']): RawOverlayElement {
  return { ref_id: refId, kind, badges: [], metrics, severity: 'INFO' };
}
function payloadOf(elements: Record<string, RawOverlayElement>, analysisType = 'load_flow'): RawOverlayPayload {
  return { run_id: 'run-w4', analysis_type: analysisType, elements };
}

describe('resultLabels.ts — buildResultLabelsFromScene (W4 §8)', () => {
  it('§8 „gdy wyniki są": payload=null ⇒ mapa pusta (zero atrap)', () => {
    expect(isResultLabelsEmpty(buildResultLabelsFromScene(scene, null, singleHop))).toBe(true);
  });

  it('element bez pasujących metryk ⇒ brak wpisu (zero placeholderów)', () => {
    const payload = payloadOf({ [trRef]: el(trRef, 'transformer', {}) });
    expect(isResultLabelsEmpty(buildResultLabelsFromScene(scene, payload, singleHop))).toBe(true);
  });

  it('ref spoza sceny ⇒ ignorowany (nie fabrykuje kotwicy)', () => {
    const payload = payloadOf({
      'nieznany-ref': el('nieznany-ref', 'bus', { U_kV: { code: 'U_kV', value: 15, unit: 'kV', format_hint: 'fixed2' } }),
    });
    expect(isResultLabelsEmpty(buildResultLabelsFromScene(scene, payload, singleHop))).toBe(true);
  });

  it('§8 obciążenie przęsła: LOADING_PCT 1:1 (72,5 %) — źródło test_result_contract_v1.py', () => {
    const payload = payloadOf({
      [branchRef]: el(branchRef, 'branch', {
        LOADING_PCT: { code: 'LOADING_PCT', value: 72.5, unit: '%', format_hint: 'fixed1' },
      }),
    });
    const entries = buildResultLabelsFromScene(scene, payload, singleHop);
    expect(entries[branchRef]).toEqual({
      ownerRef: branchRef,
      kind: 'branch',
      lines: [{ prefix: 'obc.', text: '72,5 %' }],
    });
  });

  it('§8 transformator: S_MVA + ΔP strat 1:1, w kolejności specyfikacji', () => {
    const payload = payloadOf({
      [trRef]: el(trRef, 'transformer', {
        S_MVA: { code: 'S_MVA', value: 0.63, unit: 'MVA', format_hint: 'fixed2' },
        LOSSES_P_MW: { code: 'LOSSES_P_MW', value: 0.012, unit: 'MW', format_hint: 'fixed4' },
      }),
    });
    const entries = buildResultLabelsFromScene(scene, payload, singleHop);
    expect(entries[trRef]).toEqual({
      ownerRef: trRef,
      kind: 'transformer',
      lines: [
        { prefix: 'S', text: '0,63 MVA' },
        { prefix: 'ΔP', text: '0,0120 MW' },
      ],
    });
  });

  it('§16 źródło: P/Q generacji ZE ZNAKIEM — dodatnie „+", ujemne „-" (kierunek, nie kolor)', () => {
    // Wtłaczanie (generacja): P>0 ⇒ „+"; pobór: P<0 ⇒ „-" (własny minus liczby).
    // Wartość P źródłowa 6,546769 MW przepisana z realnego biegu NR
    // (sldSubstrate52s.powerflow.json branch_flow seg/0c7e6284…/segment_L).
    const inject = payloadOf({
      [sourceRef]: el(sourceRef, 'generator', {
        P_MW: { code: 'P_MW', value: 6.546769, unit: 'MW', format_hint: 'fixed4' },
        Q_Mvar: { code: 'Q_Mvar', value: -0.3, unit: 'Mvar', format_hint: 'fixed4' },
      }),
    });
    const entries = buildResultLabelsFromScene(scene, inject, singleHop);
    expect(entries[sourceRef]).toEqual({
      ownerRef: sourceRef,
      kind: 'source',
      lines: [
        { prefix: 'P', text: '+6,5468 MW' },
        { prefix: 'Q', text: '-0,3000 Mvar' },
      ],
    });
  });

  it('§8 węzeł (SC): Ik″/Ith przez formatMagnitudeKa — kA i A (<0,1 kA ⇒ ampery)', () => {
    // Węzeł-szyna: ownerRef z realnego segmentu bus sceny.
    const busSeg = scene.segments.find((s) => s.meta?.elementKind === 'bus' && s.meta?.ownerRef);
    if (!busSeg?.meta?.ownerRef) throw new Error('brak szyny w scenie');
    const busRef = busSeg.meta.ownerRef;
    // ikss_ka=12.5 (kA) i ith_a=116910 (A) — źródło test_result_contract_v1.py.
    const payload = payloadOf(
      {
        [busRef]: el(busRef, 'bus', {
          IK_3F_A: { code: 'IK_3F_A', value: 12.5, unit: 'kA', format_hint: 'fixed2' },
          ITH_A: { code: 'ITH_A', value: 116_910, unit: 'A', format_hint: 'fixed0' },
        }),
      },
      'sc_3f',
    );
    const entries = buildResultLabelsFromScene(scene, payload, singleHop);
    // 12.5 kA → „12,5 kA"; 116910 A = 116,91 kA → „116,9 kA".
    expect(entries[busRef]).toEqual({
      ownerRef: busRef,
      kind: 'bus',
      lines: [
        { prefix: 'Ik″', text: '12,5 kA' },
        { prefix: 'Ith', text: '116,9 kA' },
      ],
    });
  });

  it('§8 węzeł (SC) wkład <0,1 kA prezentowany w amperach (nie „0,0 kA")', () => {
    const busSeg = scene.segments.find((s) => s.meta?.elementKind === 'bus' && s.meta?.ownerRef);
    const busRef = busSeg!.meta!.ownerRef!;
    const payload = payloadOf(
      { [busRef]: el(busRef, 'bus', { IK_3F_A: { code: 'IK_3F_A', value: 24, unit: 'A', format_hint: 'fixed0' } }) },
      'sc_3f',
    );
    const entries = buildResultLabelsFromScene(scene, payload, singleHop);
    expect(entries[busRef]?.lines).toEqual([{ prefix: 'Ik″', text: '24 A' }]);
  });

  it('węzeł (LF): U_kV wygrywa nad V_PU (jedna linia napięcia); kąt δ osobno', () => {
    const busSeg = scene.segments.find((s) => s.meta?.elementKind === 'bus' && s.meta?.ownerRef);
    const busRef = busSeg!.meta!.ownerRef!;
    const payload = payloadOf({
      [busRef]: el(busRef, 'bus', {
        U_kV: { code: 'U_kV', value: 15.02, unit: 'kV', format_hint: 'fixed2' },
        V_PU: { code: 'V_PU', value: 1.0013, unit: 'p.u.', format_hint: 'fixed4' },
        ANGLE_DEG: { code: 'ANGLE_DEG', value: -1.4, unit: '°', format_hint: 'fixed2' },
      }),
    });
    const entries = buildResultLabelsFromScene(scene, payload, singleHop);
    // U_kV present ⇒ V_PU pominięte (skipIfAnyPresent), kąt jako druga linia.
    expect(entries[busRef]?.lines).toEqual([
      { prefix: 'U', text: '15,02 kV' },
      { prefix: 'δ', text: '-1,40 °' },
    ]);
  });

  it('R1 §wym.1–2 linia/kabel: pełna treść obc.→I→P(+)→Q z payloadu rozpływu', () => {
    const payload = payloadOf({
      [branchRef]: el(branchRef, 'branch', {
        LOADING_PCT: { code: 'LOADING_PCT', value: 68, unit: '%', format_hint: 'fixed1' },
        I_A: { code: 'I_A', value: 182, unit: 'A', format_hint: 'fixed1' },
        P_MW: { code: 'P_MW', value: 5.648, unit: 'MW', format_hint: 'fixed4' },
        Q_Mvar: { code: 'Q_Mvar', value: 0.92, unit: 'Mvar', format_hint: 'fixed4' },
      }),
    });
    const entries = buildResultLabelsFromScene(scene, payload, singleHop);
    expect(entries[branchRef]).toEqual({
      ownerRef: branchRef,
      kind: 'branch',
      lines: [
        { prefix: 'obc.', text: '68,0 %' },
        { prefix: 'I', text: '182,0 A' },
        { prefix: 'P', text: '+5,6480 MW' },
        { prefix: 'Q', text: '+0,9200 Mvar' },
      ],
    });
  });

  it('R1 §wym.1–4 źródło: P(+)→Q→S — moc bierna i pozorna obecne, gdy w payloadzie', () => {
    const payload = payloadOf({
      [sourceRef]: el(sourceRef, 'generator', {
        P_MW: { code: 'P_MW', value: 5.648, unit: 'MW', format_hint: 'fixed4' },
        Q_Mvar: { code: 'Q_Mvar', value: 0.92, unit: 'Mvar', format_hint: 'fixed4' },
        S_MVA: { code: 'S_MVA', value: 5.72, unit: 'MVA', format_hint: 'fixed2' },
      }),
    });
    const entries = buildResultLabelsFromScene(scene, payload, singleHop);
    expect(entries[sourceRef]?.lines).toEqual([
      { prefix: 'P', text: '+5,6480 MW' },
      { prefix: 'Q', text: '+0,9200 Mvar' },
      { prefix: 'S', text: '5,72 MVA' },
    ]);
  });

  it('R1 §wym.1–2 transformator: obc.→S→ΔP (kolejność priorytetu), gdy w payloadzie', () => {
    const payload = payloadOf({
      [trRef]: el(trRef, 'transformer', {
        LOADING_PCT: { code: 'LOADING_PCT', value: 73, unit: '%', format_hint: 'fixed1' },
        S_MVA: { code: 'S_MVA', value: 1.84, unit: 'MVA', format_hint: 'fixed2' },
      }),
    });
    const entries = buildResultLabelsFromScene(scene, payload, singleHop);
    expect(entries[trRef]?.lines).toEqual([
      { prefix: 'obc.', text: '73,0 %' },
      { prefix: 'S', text: '1,84 MVA' },
    ]);
  });

  it('R1 bramka analizy: kod spoza szablonu danej analizy ⇒ linia NIE renderowana', () => {
    // U_kV nie należy do szablonu ZWARCIOWEGO szyny ⇒ pod analysis_type=sc_3f
    // szyna nie dostaje etykiety napięcia (rejestr rozdziela treść per analiza).
    const busSeg = scene.segments.find((s) => s.meta?.elementKind === 'bus' && s.meta?.ownerRef);
    const busRef = busSeg!.meta!.ownerRef!;
    const payload = payloadOf(
      { [busRef]: el(busRef, 'bus', { U_kV: { code: 'U_kV', value: 15, unit: 'kV', format_hint: 'fixed2' } }) },
      'sc_3f',
    );
    expect(isResultLabelsEmpty(buildResultLabelsFromScene(scene, payload, singleHop))).toBe(true);
  });

  it('R1 bramka analizy: analiza nierozpoznana ⇒ mapa pusta (zero fabrykacji)', () => {
    const payload = payloadOf(
      { [branchRef]: el(branchRef, 'branch', { LOADING_PCT: { code: 'LOADING_PCT', value: 72.5, unit: '%', format_hint: 'fixed1' } }) },
      'thermal',
    );
    expect(isResultLabelsEmpty(buildResultLabelsFromScene(scene, payload, singleHop))).toBe(true);
  });

  it('determinizm: dwa buildy identycznego wejścia ⇒ identyczny wynik (JSON)', () => {
    const payload = payloadOf({
      [trRef]: el(trRef, 'transformer', { S_MVA: { code: 'S_MVA', value: 0.63, unit: 'MVA', format_hint: 'fixed2' } }),
      [branchRef]: el(branchRef, 'branch', { LOADING_PCT: { code: 'LOADING_PCT', value: 72.5, unit: '%', format_hint: 'fixed1' } }),
    });
    const a = buildResultLabelsFromScene(scene, payload, singleHop);
    const b = buildResultLabelsFromScene(scene, payload, singleHop);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
