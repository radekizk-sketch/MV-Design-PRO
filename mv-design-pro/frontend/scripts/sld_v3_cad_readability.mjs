/**
 * Dowód PR CAD: porównanie tej SAMEJ sceny L2 przed/po fokusie stacji.
 * Bez mocków graficznych, bez drugiego rendereru i bez sztucznego ENM.
 *
 * Wejście: istniejąca kanoniczna fixtura sldSubstrate52s.
 * Wyjście: prawdziwe renderToStaticMarkup(SldCanvasV3) i PNG Playwright
 *          z manifestem rozmiarów, skali, referencji i wyniku.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from '@playwright/test';
import { SldCanvasV3, contentBoundingBoxOf, sceneBoxToCameraWorld } from '../src/ui/sld/v3/canvas/SldCanvasV3.tsx';
import { buildSceneV3 } from '../src/ui/sld/v3/scene/buildScene.ts';
import { cameraReducer, computeInitialCameraState, boundingBoxOfRect } from '../src/ui/sld/v3/canvas/camera.ts';
import { prostokatElementuWScenie } from '../src/ui/sld/v3/canvas/viewAnchor.ts';
import { LABEL_TYPOGRAPHY } from '../src/ui/sld/v3/core/text.ts';

const baseDir = resolve(new URL('.', import.meta.url).pathname, '..');
const fixture = resolve(baseDir, 'src/ui/sld/v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json');
const snapshot = JSON.parse(readFileSync(fixture, 'utf8')).enm;
const dir = process.env.SLD_CAD_EVIDENCE_DIR || resolve(tmpdir(), 'sld-v3-cad-readability');
mkdirSync(dir, { recursive: true });
const viewport = { width: 1920, height: 1080 };
const scenes = {
  0: buildSceneV3(snapshot, 0),
  1: buildSceneV3(snapshot, 1),
  2: buildSceneV3(snapshot, 2),
};
const lodBboxes = {
  0: boundingBoxOfRect(scenes[0].bbox),
  1: boundingBoxOfRect(scenes[1].bbox),
  2: boundingBoxOfRect(scenes[2].bbox),
};
const baseState = computeInitialCameraState(
  sceneBoxToCameraWorld(contentBoundingBoxOf(scenes[2]) || lodBboxes[2]),
  viewport,
  lodBboxes,
);
const stations = scenes[2].meta.mainTrunkStationIds;
if (stations.length < 3) throw new Error('Za mało stacji w kanonicznym modelu, aby przeprowadzić próbę CAD.');
const focusRef = stations[Math.floor(stations.length / 2)];
const focusBbox = prostokatElementuWScenie(scenes[2], focusRef);
if (!focusBbox) throw new Error('Nie znaleziono faktycznej geometrii L2: ' + focusRef);
const cadState = cameraReducer(baseState, {
  type: 'cadFocus',
  bbox: sceneBoxToCameraWorld(focusBbox),
  viewportSize: viewport,
});
const ratio = cadState.transform.scale / baseState.transform.scale;
const cadTextScreenPx = LABEL_TYPOGRAPHY.t2.fontSize * cadState.transform.scale;
if (!(ratio > 3) || cadState.lod !== 2 || cadTextScreenPx < 12) {
  throw new Error('Kadr CAD nie uzyskuje użytecznej skali na kanonicznym modelu: ' + ratio);
}
const manifest = {
  source: 'SldCanvasV3 — rzeczywista scenografia ENM i symbole z repozytorium',
  fixture: 'sldSubstrate52s.enm.json',
  snapshotHash: snapshot.header?.hash_sha256 ?? null,
  counts: {
    stations: snapshot.substations.length,
    branches: snapshot.branches.length,
    symbolsL2: scenes[2].symbols.length,
    segmentsL2: scenes[2].segments.length,
    labelsL2: scenes[2].labels.length,
  },
  focusRef,
  bbox: focusBbox,
  scaleBefore: baseState.transform.scale,
  scaleAfter: cadState.transform.scale,
  magnificationRatio: ratio,
  cadT2ScreenPx: cadTextScreenPx,
  minReadableDetailTextScreenPx: 12,
  sceneContentUnchanged: true,
  evidence: [],
};
const jobs = [];
const palettes = ['light_technical', 'dark_scada'];
for (const paletteMode of palettes) {
  jobs.push({ name: '00_calosc_sieci_L0_' + paletteMode, lodOverride: 0, paletteMode });
  jobs.push({ name: '01_calosc_sieci_L2_' + paletteMode, lodOverride: 2, paletteMode });
  jobs.push({ name: '02_CAD_stacja_L2_' + paletteMode, lodOverride: 2, paletteMode, cameraOverride: cadState });
}
for (const job of jobs) {
  const el = React.createElement(SldCanvasV3, {
    snapshot, width: viewport.width, height: viewport.height,
    lodOverride: job.lodOverride, paletteMode: job.paletteMode,
    cameraOverride: job.cameraOverride,
    animateLodTransitions: false,
  });
  const markup = renderToStaticMarkup(el);
  const htmlFile = resolve(dir, job.name + '.html');
  writeFileSync(htmlFile, '<!doctype html><html lang="pl"><meta charset="utf-8"><style>html,body{padding:0;margin:0}</style>' + markup + '</html>');
  job.html = htmlFile;
}
const browser = await chromium.launch({ args: ['--no-sandbox'] });
try {
  for (const job of jobs) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    await page.goto('file://' + job.html);
    const attrs = await page.locator('[data-testid="sld-canvas-v3"]').evaluate((node) => ({
      lod: node.getAttribute('data-scene-lod'),
      theme: node.getAttribute('data-theme-mode'),
    }));
    if (attrs.lod !== String(job.lodOverride) || attrs.theme !== job.paletteMode) {
      throw new Error('Nieprawdziwy render LOD / motywu: ' + job.name + ' ' + JSON.stringify(attrs));
    }
    const png = resolve(dir, job.name + '.png');
    await page.screenshot({ path: png });
    manifest.evidence.push({ file: job.name + '.png', lod: attrs.lod, theme: attrs.theme });
    await page.close();
    console.log('[CAD] ' + job.name + ': ' + png);
  }
} finally {
  await browser.close();
}
writeFileSync(resolve(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('[CAD] Ratio=' + ratio.toFixed(2) + 'x · station=' + focusRef + ' · PNG=' + manifest.evidence.length);
