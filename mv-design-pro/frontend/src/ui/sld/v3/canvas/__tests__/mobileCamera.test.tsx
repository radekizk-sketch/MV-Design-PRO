/**
 * F12-C (E15/E16 parytet z v2, spec §10 „kamera mobilna (portrait focus na
 * GPZ)" + §10.1 ARCH-4) — kamera startowa v3 na PIONOWYM (mobilnym)
 * viewportcie nie letterboxuje szeroko-niskiej sieci w mikroskopijny pasek:
 * gdy fit spadłby poniżej `MOBILE_PORTRAIT_READABLE_MIN_SCALE`, kamera
 * startuje wycentrowana na bloku GPZ w skali czytelnej (współdzielona
 * `initialCameraForNetwork`, `v2/viewport/ViewportController.ts` — TA SAMA
 * matematyka co kamera v2, zero duplikacji). Desktop/landscape: zachowanie
 * IDENTYCZNE jak przed F12-C (dowodzą tego też istniejące testy F8a k4.1 w
 * `sldCanvasV3.test.tsx`, które przechodzą bez modyfikacji).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3 } from '../../scene/buildScene';
import {
  MOBILE_PORTRAIT_READABLE_MIN_SCALE,
  boundingBoxOfRect,
  cameraViewBox,
  computeInitialCameraState,
} from '../camera';
import { fitToView } from '../../../v2/viewport/ViewportController';
import { SldCanvasV3, contentBoundingBoxOf } from '../SldCanvasV3';

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

// Pionowy telefon — fixtura 53 stacje jest szeroko-niska (świat ~24k×~2k px),
// fit do 390×844 daje skalę «0.5 ⇒ tryb „focus" MUSI się włączyć.
const PORTRAIT = { width: 390, height: 844 };
const DESKTOP = { width: 1200, height: 800 };

function viewBoxOf(container: HTMLElement): string {
  const svg = container.querySelector('[data-testid="sld-canvas-v3"]');
  return svg?.getAttribute('viewBox') ?? '';
}

describe('SldCanvasV3 — F12-C kamera mobilna (E15/E16 parytet v2)', () => {
  it('portret: fit poniżej progu czytelności ⇒ kamera startowa w trybie focus (skala = próg, NIE skala fitu)', () => {
    const bbox2 = boundingBoxOfRect(buildSceneV3(enm, 2).bbox);
    const pureFit = fitToView(bbox2, PORTRAIT);
    // Warunek wstępny scenariusza E15 (bez niego test nic nie dowodzi):
    expect(pureFit.scale).toBeLessThan(MOBILE_PORTRAIT_READABLE_MIN_SCALE);

    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={PORTRAIT.width} height={PORTRAIT.height} />,
    );
    const actual = viewBoxOf(container);
    const wrongLetterbox = cameraViewBox(pureFit, PORTRAIT);
    expect(actual).not.toBe(wrongLetterbox);

    // Skala focus = próg czytelności ⇒ szerokość świata w viewBox = width/próg.
    const worldWidth = Number(actual.split(' ')[2]);
    expect(worldWidth).toBeCloseTo(PORTRAIT.width / MOBILE_PORTRAIT_READABLE_MIN_SCALE, 3);
  });

  it('portret: viewBox jest wycentrowany na bloku GPZ (środek bloku w kadrze, blisko środka viewportu)', () => {
    const scene = buildSceneV3(enm, 2);
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={PORTRAIT.width} height={PORTRAIT.height} />,
    );
    const [vx, vy, vw, vh] = viewBoxOf(container).split(' ').map(Number);

    // Środek bloku GPZ tą samą konwencją co kanwa (testId `gpz-canonical-`).
    const gpzSymbols = scene.symbols.filter((s) => s.meta?.testId?.startsWith('gpz-canonical-'));
    expect(gpzSymbols.length).toBeGreaterThan(0);
    const xs = gpzSymbols.map((s) => s.x);
    const ys = gpzSymbols.map((s) => s.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;

    // Środek GPZ w OKOLICY środka kadru (tolerancja połowy kadru — dokładne
    // centrum zależy od gabarytów symboli; kluczowe: GPZ w kadrze, nie poza).
    expect(Math.abs(vx + vw / 2 - cx)).toBeLessThan(vw / 2);
    expect(Math.abs(vy + vh / 2 - cy)).toBeLessThan(vh / 2);
  });

  it('desktop/landscape: kamera startowa = czysty fit do TREŚCI (tryb focus nie włącza się)', () => {
    // K11-A: cel fitu = bbox treści sieci (contentBoundingBoxOf), nie pełny
    // bbox sceny z meblami arkusza. INTENCJA testu bez zmian: desktop NIE
    // wchodzi w tryb focus — kamera to zwykły fit.
    const scena2 = buildSceneV3(enm, 2);
    const bbox2 = contentBoundingBoxOf(scena2) ?? boundingBoxOfRect(scena2.bbox);
    const expectedFit = cameraViewBox(
      computeInitialCameraState(bbox2, DESKTOP).transform,
      DESKTOP,
    );
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={DESKTOP.width} height={DESKTOP.height} />,
    );
    expect(viewBoxOf(container)).toBe(expectedFit);
  });

  it('computeInitialCameraState bez focusPoint zachowuje się jak dawny fit (kompatybilność wsteczna — F8a k4.1)', () => {
    const bbox2 = boundingBoxOfRect(buildSceneV3(enm, 2).bbox);
    const legacy = fitToView(bbox2, PORTRAIT);
    const current = computeInitialCameraState(bbox2, PORTRAIT).transform;
    expect(current).toEqual(legacy);
  });
});
