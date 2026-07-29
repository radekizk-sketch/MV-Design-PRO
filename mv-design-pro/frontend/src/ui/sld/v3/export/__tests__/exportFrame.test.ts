/**
 * SCHEMAT-10 S4 (V12K-135/136) — testy kadru fit-do-treści eksportu (D12
 * „reszta"). Dowodzi:
 *  (a) `computeContentFitFrame` = DOKŁADNIE `sheetSizeFor(scene) + 2×FRAME_MARGIN`
 *      (ta sama formuła co `SheetFrame` własny rozmiar — zero rozjazdu);
 *  (b) miara „martwych pól ≤20% kadru" (bbox treści / bbox kadru ≥ 0,8) na
 *      L0/L1 sieci referencyjnej 52+ stacji (audyt D12 — próg WYLICZONY, nie
 *      zaniżony cicho);
 *  (c) `applyContentFitFrame` nadpisuje `viewBox`/`width`/`height` węzła SVG
 *      atrybutami XML (nie CSS `style`).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3, type SceneV3 } from '../../scene/buildScene';
import { sheetSizeFor } from '../../canvas/SldCanvasV3';
import { FRAME_MARGIN } from '../../sheet/Frame';
import { applyContentFitFrame, computeContentFitFrame, contentFitRatio } from '../exportFrame';

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

function fakeScene(bbox: SceneV3['bbox']): SceneV3 {
  // Wyłącznie `bbox` jest czytane przez funkcje pod testem — reszta pól
  // sceny jest tu nieistotna (unia strukturalna wystarcza).
  return { bbox } as SceneV3;
}

describe('exportFrame — computeContentFitFrame (D12 reszta)', () => {
  it('= sheetSizeFor(scene) + 2×FRAME_MARGIN (TA SAMA formuła co SheetFrame)', () => {
    const scene = fakeScene({ x: 0, y: 0, width: 1000, height: 600 });
    const frame = computeContentFitFrame(scene);
    const sheetSize = sheetSizeFor(scene);
    expect(frame.width).toBe(sheetSize.width + FRAME_MARGIN * 2);
    expect(frame.height).toBe(sheetSize.height + FRAME_MARGIN * 2);
    expect(frame.viewBox).toBe(`0 0 ${frame.width} ${frame.height}`);
  });

  it('bbox zdegenerowany (0×0) ⇒ kadr = wyłącznie margines (bez NaN/ujemnych)', () => {
    const frame = computeContentFitFrame(fakeScene({ x: 0, y: 0, width: 0, height: 0 }));
    expect(frame.width).toBe(FRAME_MARGIN * 2);
    expect(frame.height).toBe(FRAME_MARGIN * 2);
  });
});

describe('exportFrame — contentFitRatio (D12: martwe pola ≤20% kadru ⇔ ratio ≥ 0,8)', () => {
  for (const lod of [0, 1] as const) {
    it(`LOD ${lod}: sieć referencyjna 52+ stacji — ratio ≥ 0,8`, () => {
      const scene = buildSceneV3(enm, lod);
      const ratio = contentFitRatio(scene);
      expect(ratio).toBeGreaterThanOrEqual(0.8);
    });
  }

  it('rośnie w kierunku 1 wraz z rozmiarem treści (margines jest stałą MAŁĄ)', () => {
    const small = contentFitRatio(fakeScene({ x: 0, y: 0, width: 100, height: 100 }));
    const large = contentFitRatio(fakeScene({ x: 0, y: 0, width: 5000, height: 3000 }));
    expect(large).toBeGreaterThan(small);
  });
});

describe('exportFrame — applyContentFitFrame (mutacja atrybutów XML)', () => {
  it('nadpisuje viewBox/width/height jako atrybuty XML (nie style)', () => {
    const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement;
    svgEl.setAttribute('viewBox', '999 999 1 1');
    svgEl.setAttribute('width', '1');
    svgEl.setAttribute('height', '1');
    const scene = fakeScene({ x: 0, y: 0, width: 1000, height: 600 });
    applyContentFitFrame(svgEl, scene);
    const frame = computeContentFitFrame(scene);
    expect(svgEl.getAttribute('viewBox')).toBe(frame.viewBox);
    expect(svgEl.getAttribute('width')).toBe(String(frame.width));
    expect(svgEl.getAttribute('height')).toBe(String(frame.height));
    // Zero wpływu na `style` (kadr eksportu nie jest CSS).
    expect(svgEl.getAttribute('style')).toBeNull();
  });
});
