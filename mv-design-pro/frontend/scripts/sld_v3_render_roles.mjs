/**
 * SLD V3 F7 — render-odbiór per rola (PNG). Renderuje realny `SldCanvasV3`
 * (renderToStaticMarkup, jak wzorzec nadzorcy F6b-2) na fixturze
 * `sldSubstrate52s`, rasteryzuje Playwrightem do PNG. Dwa etapy w JEDNYM
 * procesie (vite-node): (1) policz kamerę/scenę WŁAŚNIE tak, jak robi to
 * `SldCanvasV3` (reużyte funkcje `buildSceneV3`/`computeInitialCameraState`,
 * zero duplikacji matematyki), (2) zapisz statyczny HTML + zrób zrzut
 * Playwrightem tej samej strony.
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   npx vite-node scripts/sld_v3_render_roles.mjs
 *
 * Wyjście: PNG w `mv-design-pro/docs/sld/renders/v3/` (patrz raport F7 —
 * decyzja o (nie)commitowaniu leży po stronie recenzenta/nadzorcy, ten skrypt
 * tylko zapisuje pliki). HTML pośrednie w scratchpadzie (NIE w repo).
 *
 * Karta SLD-SKALA-I-NAWIGACJA (R1, 2026-11): kanwa ma JEDNĄ scenę niezależną od
 * skali — dawne role per poziom szczegółu (operator L1, audytor L0) nie mają
 * przedmiotu. Kamera zrzutu jest odczytywana z `viewBox` wyrenderowanej kanwy
 * (`cameraTransformFor`), więc wycinki zoomu liczą się tą samą transformacją,
 * którą narysowała kanwa — bez drugiej implementacji dopasowania.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from '../node_modules/@playwright/test/index.mjs';
import { chromiumLaunchOptions } from './playwright-env.mjs';

import { SldCanvasV3, scenePointToCameraWorld } from '../src/ui/sld/v3/canvas/SldCanvasV3.tsx';
import { buildEnergizationOverlay } from '../src/ui/sld/v3/canvas/SldCanvasV3Workspace.tsx';
import { buildSceneV3 } from '../src/ui/sld/v3/scene/buildScene.ts';
import { worldToScreen } from '../src/ui/sld/v2/viewport/ViewportController.ts';
import { GRID } from '../src/ui/sld/v3/core/grid.ts';
import { SYMBOL_DEFS } from '../src/ui/sld/v3/symbols/defs.ts';

// Katalog dowodowy nie może zależeć od jednorazowej ścieżki kontenera autora.
const HTML_DIR = process.env.SLD_V3_RENDER_HTML_DIR ?? resolve(tmpdir(), 'mv-design-pro', 'sld-v3-render-roles');
const PNG_DIR = resolve(new URL('.', import.meta.url).pathname, '..', '..', 'docs', 'sld', 'renders', 'v3');
mkdirSync(HTML_DIR, { recursive: true });
mkdirSync(PNG_DIR, { recursive: true });

const fixturePath = resolve(
  new URL('.', import.meta.url).pathname,
  '..',
  'src',
  'ui',
  'sld',
  'v2',
  'geometry',
  '__tests__',
  'fixtures',
  'sldSubstrate52s.enm.json',
);
const enm = JSON.parse(readFileSync(fixturePath, 'utf8')).enm;

const FULL_W = 1920;
const FULL_H = 1080;

/** Transformacja kamery kanwy odczytana z `viewBox` wyrenderowanego SVG — ta
 *  sama, którą kanwa narysowała (zero drugiej implementacji dopasowania). */
function cameraTransformFor(viewportSize) {
  const markup = renderToStaticMarkup(
    React.createElement(SldCanvasV3, { snapshot: enm, width: viewportSize.width, height: viewportSize.height }),
  );
  const m = /viewBox="([-\d.e]+) ([-\d.e]+) ([-\d.e]+) ([-\d.e]+)"/.exec(markup);
  if (!m) throw new Error('Kanwa bez viewBox — nie da się odczytać kamery zrzutu.');
  const [vx, vy, vw] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const scale = viewportSize.width / vw;
  return { scale, translateX: -vx * scale, translateY: -vy * scale };
}

function unionWorldRect(rects) {
  const xs0 = rects.map((r) => r.x);
  const ys0 = rects.map((r) => r.y);
  const xs1 = rects.map((r) => r.x + r.width);
  const ys1 = rects.map((r) => r.y + r.height);
  return { minX: Math.min(...xs0), minY: Math.min(...ys0), maxX: Math.max(...xs1), maxY: Math.max(...ys1) };
}

/** Screen-space clip (px) dla Playwright `page.screenshot({ clip })`, z prostokąta
 *  SCENY + margines w jednostkach świata, przeliczony przez TĘ SAMĄ kamerę,
 *  którą renderuje kanwa (`cameraTransformFor`; punkt sceny → świat kamery przez
 *  `scenePointToCameraWorld`, czyli z marginesem ramki arkusza). */
function clipFor(worldRect, viewportSize, marginWorld = 4 * GRID) {
  const transform = cameraTransformFor(viewportSize);
  const lg = scenePointToCameraWorld({ x: worldRect.minX - marginWorld, y: worldRect.minY - marginWorld });
  const pd = scenePointToCameraWorld({ x: worldRect.maxX + marginWorld, y: worldRect.maxY + marginWorld });
  const topLeft = worldToScreen(lg, transform);
  const bottomRight = worldToScreen(pd, transform);
  return {
    x: Math.max(0, Math.round(topLeft.x)),
    y: Math.max(0, Math.round(topLeft.y)),
    width: Math.min(viewportSize.width, Math.round(bottomRight.x)) - Math.max(0, Math.round(topLeft.x)),
    height: Math.min(viewportSize.height, Math.round(bottomRight.y)) - Math.max(0, Math.round(topLeft.y)),
  };
}

function writeHtml(name, element, width, height, disclaimer = null) {
  const markup = renderToStaticMarkup(element);
  // Jedyny syntetyczny wariant nakładki musi być oznaczony NA OBRAZIE,
  // żeby zrzut nie mógł uchodzić za dowód stanów łączników w modelu.
  const stamp = disclaimer
    ? `<aside aria-label="Ostrzeżenie o danych symulowanych" style="position:fixed;z-index:9999;top:12px;right:12px;background:#3a2108;color:#ffffff;border:2px solid #ffad42;padding:10px 14px;font:700 14px/1.35 sans-serif">${disclaimer}</aside>`
    : '';
  const html = `<!DOCTYPE html><html lang="pl"><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#0B0F14;}</style></head><body>${markup}${stamp}</body></html>`;
  const path = `${HTML_DIR}/${name}.html`;
  writeFileSync(path, html);
  return path;
}

// ---------------------------------------------------------------------------
// 1. Sceny + rejony świata dla zoomów (policzone RAZ, przed renderem HTML).
// ---------------------------------------------------------------------------

const scena = buildSceneV3(enm);

/** Bbox symbolu (footprint z `SYMBOL_DEFS`, nie punkt 1×1) — inaczej glify
 *  szersze/wyższe niż origin (np. uziemnik, trafo) obcinają się na krawędzi
 *  clipu (znalezisko tej dostawy: pierwsza wersja liczyła tylko originy). */
function symbolRect(s) {
  const def = SYMBOL_DEFS[s.symbolId];
  return { x: s.x, y: s.y, width: def.width, height: def.height };
}

const gpzRects = [
  ...scena.symbols.filter((s) => s.meta?.testId?.includes('gpz')).map(symbolRect),
  ...scena.segments
    .filter((seg) => seg.meta?.testId?.includes('gpz'))
    .flatMap((seg) => seg.points.map((p) => ({ x: p.x, y: p.y, width: 1, height: 1 }))),
];
if (gpzRects.length === 0) throw new Error('Brak symboli/segmentów GPZ w scenie — fixtura bez GPZ?');
const gpzWorldRect = unionWorldRect(gpzRects);

const stationOfInterestId = scena.meta.mainTrunkStationIds[4] ?? scena.meta.mainTrunkStationIds[0];
function stationHash(stationId) {
  return stationId.split('/')[1] ?? stationId;
}
const stationHashOfInterest = stationHash(stationOfInterestId);
const stationRects = [
  ...scena.symbols.filter((s) => s.meta?.testId?.includes(stationHashOfInterest)).map(symbolRect),
  ...scena.labels.filter((l) => l.ownerRef.includes(stationHashOfInterest)).map((l) => l.rect),
];
if (stationRects.length === 0) throw new Error(`Brak symboli/etykiet stacji „${stationOfInterestId}" w scenie.`);
const stationWorldRect = unionWorldRect(stationRects);

// ---------------------------------------------------------------------------
// 2. Nakładka operatora: TEN SAM buildEnergizationOverlay co produkcja.
//    Źródłem jest topologia ENM ze stanami łączników, nie indeks elementu.
//    Nie oznacza to obliczonego napięcia ani wyniku rozpływu.
// ---------------------------------------------------------------------------
const operatorOverlay = buildEnergizationOverlay(enm);

// ---------------------------------------------------------------------------
// 3. Renderuj HTML (renderToStaticMarkup) dla każdego wymaganego PNG.
// ---------------------------------------------------------------------------

const jobs = [];

jobs.push({
  name: 'projektant_pelny',
  html: writeHtml('projektant_pelny', React.createElement(SldCanvasV3, { snapshot: enm, width: FULL_W, height: FULL_H }), FULL_W, FULL_H),
  viewport: { width: FULL_W, height: FULL_H },
  clip: null,
});

jobs.push({
  name: 'projektant_zoom_gpz',
  html: writeHtml('projektant_zoom_gpz', React.createElement(SldCanvasV3, { snapshot: enm, width: FULL_W, height: FULL_H }), FULL_W, FULL_H),
  viewport: { width: FULL_W, height: FULL_H },
  clip: clipFor(gpzWorldRect, { width: FULL_W, height: FULL_H }),
});

jobs.push({
  name: 'projektant_zoom_stacja',
  html: writeHtml('projektant_zoom_stacja', React.createElement(SldCanvasV3, { snapshot: enm, width: FULL_W, height: FULL_H }), FULL_W, FULL_H),
  viewport: { width: FULL_W, height: FULL_H },
  clip: clipFor(stationWorldRect, { width: FULL_W, height: FULL_H }),
});

jobs.push({
  name: 'operator_nakladka',
  html: writeHtml(
    'operator_nakladka',
    React.createElement(SldCanvasV3, { snapshot: enm, width: FULL_W, height: FULL_H, overlay: operatorOverlay }),
    FULL_W,
    FULL_H,
    'NAKŁADKA TOPOLOGICZNA ENM — NIE WYNIK ROZPŁYWU ANI POMIAR NAPIĘCIA',
  ),
  viewport: { width: FULL_W, height: FULL_H },
  clip: null,
});

// ---------------------------------------------------------------------------
// 4. Rasteryzacja (Playwright, chromium lokalny — patrz QUALITY_PLAN §3).
// ---------------------------------------------------------------------------

/** Zoomy (`clip`) na sieci 4280×6125 world zmieszczonej w 1920×1080
 *  wypadają geometrycznie MAŁE w CSS px (scale fit ~0.16, przewidziany
 *  wynikiem `fitToView` — świat jest wysoki, bo grzebień 12 lateroli w dół).
 *  Zawartość jest wektorowa (SVG) — supersampling `deviceScaleFactor`
 *  (Chromium rasteryzuje viewBox w wyższej rozdzielczości, tekst pozostaje
 *  ostry, brak utraty jakości jak przy rastrze) podnosi PNG do czytelnego
 *  rozmiaru bez zmiany geometrii/kamery. Cel: krótszy wymiar clipu × dsf
 *  ≥ ~900px. */
function dsfFor(clip) {
  if (!clip) return 1;
  const shortest = Math.max(1, Math.min(clip.width, clip.height));
  return Math.min(12, Math.max(2, Math.ceil(900 / shortest)));
}

// W CI ścieżka przeglądarki może być jawna; lokalnie używamy przeglądarki Playwright.
const chromiumPath = process.env.SLD_V3_CHROMIUM_PATH;
const browser = await chromium.launch(
  chromiumPath
    ? { executablePath: chromiumPath, args: ['--no-sandbox'] }
    : chromiumLaunchOptions({ args: ['--no-sandbox'] }),
);
for (const job of jobs) {
  const dsf = dsfFor(job.clip);
  const page = await browser.newPage({ viewport: job.viewport, deviceScaleFactor: dsf });
  await page.goto(`file://${job.html}`);
  await page.waitForTimeout(300);
  const outPath = `${PNG_DIR}/${job.name}.png`;
  if (job.clip) {
    await page.screenshot({ path: outPath, clip: job.clip });
  } else {
    await page.screenshot({ path: outPath });
  }
  console.log(`${job.name}: ${outPath}${job.clip ? ` (clip ${JSON.stringify(job.clip)}, dsf=${dsf})` : ''}`);
  await page.close();
}
await browser.close();
console.log('done');
