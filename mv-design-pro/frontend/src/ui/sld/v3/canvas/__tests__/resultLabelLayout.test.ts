/**
 * R2 (RECENZJA_WARSTWA_WYNIKOWA_2026-07 §wym.12/14/19; program WYNIKI-SLD R2) —
 * testy CZYSTEJ funkcji rozmieszczania warstwy wynikowej (`layoutResultLabels`,
 * `SldCanvasV3.tsx`): PRIORYTETY kolizji (klasa właściciela ze sceny),
 * AGREGACJA „+N wyniki" bliskich kotwic, METRYKI rozmieszczania i DETERMINIZM.
 *
 * Fixtura REALNA (`sldSubstrate52s`, ta sama co `resultLabels.test.ts`); WSZYSTKIE
 * `ownerRef` odczytane ze sceny (zero fabrykacji refów). Payload PEŁNY (metryki
 * na wszystkich źródłach/TR/szynach/przęsłach jednokawałkowych) — odwzorowuje
 * realny bieg rozpływu z wynikami na całej sieci (wartości 1:1, zero fizyki w UI).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import type { RawOverlayElement, RawOverlayPayload } from '../../../../sld-overlay/rawResultOverlayStore';
import { buildSceneV3 } from '../../scene/buildScene';
import { buildResultLabelsFromScene, resultRefForSegment, singleHopSegmentRefs } from '../resultLabels';
import { layoutResultLabels } from '../SldCanvasV3';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json');
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;
const singleHop = singleHopSegmentRefs(enm);

/** Priorytet klasy (mniejsza = wyższy) — musi być spójny z RESULT_LABEL_PRIORITY. */
const RANK: Record<string, number> = { source: 0, transformer: 1, branch: 2, bus: 3 };

function metricsForKind(kind: string): RawOverlayElement['metrics'] {
  if (kind === 'branch') {
    return {
      LOADING_PCT: { code: 'LOADING_PCT', value: 72.5, unit: '%', format_hint: 'fixed1' },
      I_A: { code: 'I_A', value: 350, unit: 'A', format_hint: 'fixed1' },
      P_MW: { code: 'P_MW', value: 6.546769, unit: 'MW', format_hint: 'fixed4' },
    };
  }
  if (kind === 'source') return { P_MW: { code: 'P_MW', value: 6.546769, unit: 'MW', format_hint: 'fixed4' } };
  if (kind === 'transformer') return { S_MVA: { code: 'S_MVA', value: 0.63, unit: 'MVA', format_hint: 'fixed2' } };
  return { U_kV: { code: 'U_kV', value: 15.02, unit: 'kV', format_hint: 'fixed2' } };
}

/** Buduje PEŁNY payload rozpływu z realnych refów sceny danego LOD. */
function fullPayload(lod: 0 | 1 | 2): { scene: ReturnType<typeof buildSceneV3>; payload: RawOverlayPayload } {
  const scene = buildSceneV3(enm, lod);
  const elements: Record<string, RawOverlayElement> = {};
  for (const s of scene.symbols) {
    const k = s.meta?.elementKind;
    const ref = s.meta?.ownerRef;
    if ((k === 'source' || k === 'transformer') && ref && !elements[ref]) {
      elements[ref] = { ref_id: ref, kind: k, badges: [], severity: 'INFO', metrics: metricsForKind(k) };
    }
  }
  for (const s of scene.segments) {
    const k = s.meta?.elementKind;
    const ref = s.meta?.ownerRef;
    if (k === 'bus') {
      // ADAPTER-BUSREF: payload backendu kluczowany KANONICZNYM Bus.ref_id —
      // szyny GPZ kompozytowe po `busResultRef`, szyny stacji po ownerRef.
      const busRef = resultRefForSegment(s.meta);
      if (busRef && !elements[busRef]) {
        elements[busRef] = { ref_id: busRef, kind: 'bus', badges: [], severity: 'INFO', metrics: metricsForKind('bus') };
      }
      continue;
    }
    if (k === 'segment' && ref && !ref.includes('#') && singleHop.has(ref) && !elements[ref]) {
      elements[ref] = { ref_id: ref, kind: 'branch', badges: [], severity: 'INFO', metrics: metricsForKind('branch') };
    }
  }
  return { scene, payload: { run_id: 'r2-layout', analysis_type: 'load_flow', elements } };
}

describe('layoutResultLabels — R2 priorytety / agregacja / metryki', () => {
  it('brak payloadu ⇒ layout pusty (placements/aggregates/hidden puste, metryki zerowe)', () => {
    const scene = buildSceneV3(enm, 2);
    const layout = layoutResultLabels(scene, undefined, [], 2);
    expect(layout.placements).toEqual([]);
    expect(layout.aggregates).toEqual([]);
    expect(layout.hiddenRefs).toEqual([]);
    expect(layout.metrics.labelCount).toBe(0);
    expect(layout.metrics.collisionsFinal).toBe(0);
  });

  it('L0 (zwinięte etykiety) ⇒ zero etykiet w warstwie', () => {
    const { scene, payload } = fullPayload(0);
    const byRef = buildResultLabelsFromScene(scene, payload, singleHop);
    const layout = layoutResultLabels(scene, byRef, [], 0);
    expect(layout.placements.length).toBe(0);
    expect(layout.aggregates.length).toBe(0);
    expect(layout.metrics.labelCount).toBe(0);
  });

  it('wym.19: kolizje KOŃCOWE = 0 (warstwa nie renderuje nakładających się liczb) na L1 i L2', () => {
    for (const lod of [1, 2] as const) {
      const { scene, payload } = fullPayload(lod);
      const byRef = buildResultLabelsFromScene(scene, payload, singleHop);
      const layout = layoutResultLabels(scene, byRef, [], lod);
      expect(layout.metrics.collisionsFinal).toBe(0);
    }
  });

  it('wym.19: bilans metryk labelCount = placements + hidden + Σ członków agregatów', () => {
    for (const lod of [1, 2] as const) {
      const { scene, payload } = fullPayload(lod);
      const byRef = buildResultLabelsFromScene(scene, payload, singleHop);
      const layout = layoutResultLabels(scene, byRef, [], lod);
      const aggMembers = layout.aggregates.reduce((s, a) => s + a.count, 0);
      expect(layout.placements.length + layout.hiddenRefs.length + aggMembers).toBe(layout.metrics.labelCount);
      // avg ≤ max, obie skończone i nieujemne
      expect(layout.metrics.avgAnchorDistance).toBeGreaterThanOrEqual(0);
      expect(layout.metrics.maxAnchorDistance).toBeGreaterThanOrEqual(layout.metrics.avgAnchorDistance);
      expect(Number.isFinite(layout.metrics.maxAnchorDistance)).toBe(true);
    }
  });

  it('wym.12 priorytety: źródła i transformatory NIGDY ukryte; ukryte wyłącznie klasy niżej-priorytetowe (linie/szyny)', () => {
    const { scene, payload } = fullPayload(2);
    const byRef = buildResultLabelsFromScene(scene, payload, singleHop);
    const layout = layoutResultLabels(scene, byRef, [], 2);
    const hiddenKinds = new Set(layout.hiddenRefs.map((r) => byRef[r]?.kind));
    // Zero źródeł/transformatorów ukrytych.
    expect(hiddenKinds.has('source')).toBe(false);
    expect(hiddenKinds.has('transformer')).toBe(false);
    // Każdy ukryty ref jest klasą o RANDZE niższej (liczba większa) niż źródło/TR.
    for (const ref of layout.hiddenRefs) {
      const kind = byRef[ref]?.kind ?? 'branch';
      expect(RANK[kind]).toBeGreaterThan(RANK.transformer);
    }
  });

  it('wym.12 priorytety: etykiety pojedyncze plasowane w kolejności rangi (monotonicznie niemalejąco)', () => {
    const { scene, payload } = fullPayload(2);
    const byRef = buildResultLabelsFromScene(scene, payload, singleHop);
    const layout = layoutResultLabels(scene, byRef, [], 2);
    for (let i = 1; i < layout.placements.length; i++) {
      expect(RANK[layout.placements[i].kind]).toBeGreaterThanOrEqual(RANK[layout.placements[i - 1].kind]);
    }
  });

  it('wym.14 agregacja: skupisko bliskich kotwic → marker „+N wyniki"; członkowie posortowani po (ranga, ref) i NIEobecni w placements', () => {
    const { scene, payload } = fullPayload(2);
    const byRef = buildResultLabelsFromScene(scene, payload, singleHop);
    const layout = layoutResultLabels(scene, byRef, [], 2);
    // Fixtura referencyjna zawiera ≥1 skupisko (bramka: agregacja ma realny skutek).
    expect(layout.aggregates.length).toBeGreaterThan(0);
    const placedRefs = new Set(layout.placements.map((p) => p.ownerRef));
    for (const agg of layout.aggregates) {
      expect(agg.count).toBe(agg.members.length);
      expect(agg.count).toBeGreaterThanOrEqual(2);
      // Członkowie posortowani po (ranga, ownerRef).
      for (let i = 1; i < agg.members.length; i++) {
        const a = agg.members[i - 1];
        const b = agg.members[i];
        const rankCmp = RANK[a.kind] - RANK[b.kind];
        expect(rankCmp <= 0).toBe(true);
        if (rankCmp === 0) expect(a.ownerRef <= b.ownerRef).toBe(true);
      }
      // Kotwica agregatu = ref członka o najwyższym priorytecie (pierwszy po sortowaniu).
      expect(agg.anchorRef).toBe(agg.members[0].ownerRef);
      // Żaden zagregowany członek nie jest jednocześnie osobną etykietą.
      for (const m of agg.members) expect(placedRefs.has(m.ownerRef)).toBe(false);
    }
  });

  it('determinizm: dwa layouty identycznego wejścia ⇒ identyczny JSON (placements+agregaty+ukryte+metryki)', () => {
    for (const lod of [1, 2] as const) {
      const { scene, payload } = fullPayload(lod);
      const byRef = buildResultLabelsFromScene(scene, payload, singleHop);
      const a = layoutResultLabels(scene, byRef, [], lod);
      const b = layoutResultLabels(scene, byRef, [], lod);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });
});
