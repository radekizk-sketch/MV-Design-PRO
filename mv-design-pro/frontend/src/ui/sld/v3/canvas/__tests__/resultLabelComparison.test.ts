/**
 * R4 (RECENZJA_WARSTWA_WYNIKOWA_2026-07 §wym.10/15; program WYNIKI-SLD R4) —
 * testy TRYBU PORÓWNAWCZEGO + MINI TRENDU budowniczego etykiet
 * (`resultLabels.ts::buildResultLabelsFromScene` z `comparison`). Fixtura REALNA
 * (`sldSubstrate52s`), wszystkie `ownerRef` ze sceny — zero fabrykacji refów.
 * Zasada dowodu: porównanie WYŁĄCZNIE ref-do-ref i kod-do-kodu; element/kod bez
 * odpowiednika w poprzednim biegu ⇒ BEZ trendu (uczciwie); ta sama para
 * payloadów ⇒ te same delty/trendy (determinizm).
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
  resultRefForSegment,
  singleHopSegmentRefs,
  type ResultLabelComparison,
} from '../resultLabels';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json');
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

const scene = buildSceneV3(enm, 2);
const singleHop = singleHopSegmentRefs(enm);

/** Realny `ownerRef` przęsła jednokawałkowego (jak w resultLabels.test.ts). */
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

/** Realny bus: kotwica sceny + kanoniczny ref payloadu. */
const busSeg = scene.segments.find((s) => s.meta?.elementKind === 'bus' && s.meta?.ownerRef)!;
const busOwnerRef = busSeg.meta!.ownerRef!;
const busRef = resultRefForSegment(busSeg.meta)!;

function el(refId: string, kind: string, metrics: RawOverlayElement['metrics']): RawOverlayElement {
  return { ref_id: refId, kind, badges: [], metrics, severity: 'INFO' };
}
function payloadOf(
  elements: Record<string, RawOverlayElement>,
  analysisType = 'load_flow',
  runId = 'run-current',
): RawOverlayPayload {
  return { run_id: runId, analysis_type: analysisType, elements };
}
function loadingBranchPayload(value: number, runId: string): RawOverlayPayload {
  return payloadOf(
    { [branchRef]: el(branchRef, 'branch', { LOADING_PCT: { code: 'LOADING_PCT', value, unit: '%', format_hint: 'fixed1' } }) },
    'load_flow',
    runId,
  );
}

describe('resultLabels.ts — tryb porównawczy Δ / poprzednia→bieżąca (R4 wym. 10)', () => {
  it('Δ: etykieta pokazuje różnicę ze znakiem + trend wzrostu', () => {
    const current = loadingBranchPayload(72.5, 'run-2');
    const previous = loadingBranchPayload(68.0, 'run-1');
    const comparison: ResultLabelComparison = { previousPayload: previous, mode: 'delta' };
    const entries = buildResultLabelsFromScene(scene, current, singleHop, comparison);
    // 72,5 − 68,0 = +4,5 %; wzrost ⇒ trend up.
    expect(entries[branchRef].lines).toEqual([{ prefix: 'obc.', text: 'Δ +4,5 %', trend: 'up' }]);
  });

  it('Δ: spadek ⇒ znak „-" i trend down', () => {
    const current = loadingBranchPayload(64.0, 'run-2');
    const previous = loadingBranchPayload(72.5, 'run-1');
    const entries = buildResultLabelsFromScene(scene, current, singleHop, { previousPayload: previous, mode: 'delta' });
    expect(entries[branchRef].lines).toEqual([{ prefix: 'obc.', text: 'Δ -8,5 %', trend: 'down' }]);
  });

  it('poprzednia→bieżąca: obie wartości sformatowane, strzałka między nimi + trend', () => {
    const current = loadingBranchPayload(72.5, 'run-2');
    const previous = loadingBranchPayload(68.0, 'run-1');
    const entries = buildResultLabelsFromScene(scene, current, singleHop, { previousPayload: previous, mode: 'previous' });
    expect(entries[branchRef].lines).toEqual([{ prefix: 'obc.', text: '68,0 % → 72,5 %', trend: 'up' }]);
  });

  it('zmiana w martwej strefie ⇒ trend flat (→), Δ nadal liczona', () => {
    const current = loadingBranchPayload(72.5, 'run-2');
    const previous = loadingBranchPayload(72.4, 'run-1'); // 0,1/72,5 ≈ 0,0014 ≤ 0,005
    const entries = buildResultLabelsFromScene(scene, current, singleHop, { previousPayload: previous, mode: 'delta' });
    expect(entries[branchRef].lines).toEqual([{ prefix: 'obc.', text: 'Δ +0,1 %', trend: 'flat' }]);
  });
});

describe('resultLabels.ts — brak odpowiednika ⇒ BEZ trendu (R4 §0.4, uczciwie)', () => {
  it('element bez odpowiednika w poprzednim biegu ⇒ linia bazowa, brak pola trend', () => {
    const current = loadingBranchPayload(72.5, 'run-2');
    // Poprzedni bieg BEZ tego przęsła (inny, pusty element-set).
    const previous = payloadOf({}, 'load_flow', 'run-1');
    const entries = buildResultLabelsFromScene(scene, current, singleHop, { previousPayload: previous, mode: 'delta' });
    // Bazowa treść bieżąca, ZERO trendu (klucz nieobecny).
    expect(entries[branchRef].lines).toEqual([{ prefix: 'obc.', text: '72,5 %' }]);
    expect('trend' in entries[branchRef].lines[0]).toBe(false);
  });

  it('kod bez odpowiednika (poprzedni ma inną metrykę) ⇒ ta linia bez trendu', () => {
    const current = payloadOf(
      {
        [busRef]: el(busRef, 'bus', {
          U_kV: { code: 'U_kV', value: 15.4, unit: 'kV', format_hint: 'fixed2' },
          ANGLE_DEG: { code: 'ANGLE_DEG', value: -1.4, unit: '°', format_hint: 'fixed2' },
        }),
      },
      'load_flow',
      'run-2',
    );
    // Poprzedni ma U_kV, ale NIE ma kąta ⇒ U dostaje trend, δ nie.
    const previous = payloadOf(
      { [busRef]: el(busRef, 'bus', { U_kV: { code: 'U_kV', value: 15.02, unit: 'kV', format_hint: 'fixed2' } }) },
      'load_flow',
      'run-1',
    );
    const entries = buildResultLabelsFromScene(scene, current, singleHop, { previousPayload: previous, mode: 'delta' });
    const lines = entries[busOwnerRef].lines;
    expect(lines[0]).toEqual({ prefix: 'U', text: 'Δ +0,38 kV', trend: 'up' });
    expect(lines[1]).toEqual({ prefix: 'δ', text: '-1,40 °' }); // brak kąta w poprzednim ⇒ bez trendu
  });
});

describe('resultLabels.ts — determinizm porównania (R4 §6)', () => {
  it('ta sama para payloadów ⇒ identyczne delty/trendy', () => {
    const current = loadingBranchPayload(72.5, 'run-2');
    const previous = loadingBranchPayload(68.0, 'run-1');
    const comparison: ResultLabelComparison = { previousPayload: previous, mode: 'delta' };
    const a = buildResultLabelsFromScene(scene, current, singleHop, comparison);
    const b = buildResultLabelsFromScene(scene, current, singleHop, comparison);
    expect(a).toEqual(b);
  });

  it('bez comparison ⇒ warstwa BAZOWA (kontrakt {prefix,text}, zero trendu)', () => {
    const current = loadingBranchPayload(72.5, 'run-2');
    const entries = buildResultLabelsFromScene(scene, current, singleHop);
    expect(entries[branchRef].lines).toEqual([{ prefix: 'obc.', text: '72,5 %' }]);
  });
});
