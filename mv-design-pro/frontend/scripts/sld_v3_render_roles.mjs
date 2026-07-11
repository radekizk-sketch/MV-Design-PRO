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
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from '../node_modules/@playwright/test/index.mjs';

import { SldCanvasV3 } from '../src/ui/sld/v3/canvas/SldCanvasV3.tsx';
import { buildSceneV3 } from '../src/ui/sld/v3/scene/buildScene.ts';
import { boundingBoxOfRect, computeInitialCameraState } from '../src/ui/sld/v3/canvas/camera.ts';
import { worldToScreen } from '../src/ui/sld/v2/viewport/ViewportController.ts';
import { GRID } from '../src/ui/sld/v3/core/grid.ts';
import { SYMBOL_DEFS } from '../src/ui/sld/v3/symbols/defs.ts';

const HTML_DIR = '/tmp/claude-0/-home-user-MV-Design-PRO/78af74df-082c-537d-9203-0850d59fe759/scratchpad/f7_render';
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

/** Ten sam obliczenie kamery, co `SldCanvasV3` wykonuje WEWNĘTRZNIE przy
 *  mount (`fitBbox` zawsze z LOD 2 — patrz `canvas/SldCanvasV3.tsx`
 *  `useMemo(() => boundingBoxOfRect(buildSceneV3(snapshot, 2).bbox), ...)`),
 *  reużyte tu 1:1, żeby przeliczyć world→screen dla obszarów zoomu BEZ
 *  duplikowania/zgadywania liczb pikseli (k4, REBUILD_PLAN_V3 F6b-2 —
 *  kamera fituje WYŁĄCZNIE do bboxa LOD 2, niezależnie od `lodOverride`). */
function cameraTransformFor(viewportSize) {
  const fitBbox = boundingBoxOfRect(buildSceneV3(enm, 2).bbox);
  return computeInitialCameraState(fitBbox, viewportSize).transform;
}

function unionWorldRect(rects) {
  const xs0 = rects.map((r) => r.x);
  const ys0 = rects.map((r) => r.y);
  const xs1 = rects.map((r) => r.x + r.width);
  const ys1 = rects.map((r) => r.y + r.height);
  return { minX: Math.min(...xs0), minY: Math.min(...ys0), maxX: Math.max(...xs1), maxY: Math.max(...ys1) };
}

/** Screen-space clip (px) dla Playwright `page.screenshot({ clip })`, z world
 *  rect + margines w jednostkach świata, przeliczony przez TĘ SAMĄ kamerę,
 *  którą renderuje kanwa (`cameraTransformFor`). */
function clipFor(worldRect, viewportSize, marginWorld = 4 * GRID) {
  const transform = cameraTransformFor(viewportSize);
  const topLeft = worldToScreen({ x: worldRect.minX - marginWorld, y: worldRect.minY - marginWorld }, transform);
  const bottomRight = worldToScreen({ x: worldRect.maxX + marginWorld, y: worldRect.maxY + marginWorld }, transform);
  return {
    x: Math.max(0, Math.round(topLeft.x)),
    y: Math.max(0, Math.round(topLeft.y)),
    width: Math.min(viewportSize.width, Math.round(bottomRight.x)) - Math.max(0, Math.round(topLeft.x)),
    height: Math.min(viewportSize.height, Math.round(bottomRight.y)) - Math.max(0, Math.round(topLeft.y)),
  };
}

function writeHtml(name, element, width, height) {
  const markup = renderToStaticMarkup(element);
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#0B0F14;}</style></head><body>${markup}</body></html>`;
  const path = `${HTML_DIR}/${name}.html`;
  writeFileSync(path, html);
  return path;
}

// ---------------------------------------------------------------------------
// 1. Sceny + rejony świata dla zoomów (policzone RAZ, przed renderem HTML).
// ---------------------------------------------------------------------------

const sceneL2 = buildSceneV3(enm, 2);

/** Bbox symbolu (footprint z `SYMBOL_DEFS`, nie punkt 1×1) — inaczej glify
 *  szersze/wyższe niż origin (np. uziemnik, trafo) obcinają się na krawędzi
 *  clipu (znalezisko tej dostawy: pierwsza wersja liczyła tylko originy). */
function symbolRect(s) {
  const def = SYMBOL_DEFS[s.symbolId];
  return { x: s.x, y: s.y, width: def.width, height: def.height };
}

const gpzRects = [
  ...sceneL2.symbols.filter((s) => s.meta?.testId?.includes('gpz')).map(symbolRect),
  ...sceneL2.segments
    .filter((seg) => seg.meta?.testId?.includes('gpz'))
    .flatMap((seg) => seg.points.map((p) => ({ x: p.x, y: p.y, width: 1, height: 1 }))),
];
if (gpzRects.length === 0) throw new Error('Brak symboli/segmentów GPZ w scenie L2 — fixtura bez GPZ?');
const gpzWorldRect = unionWorldRect(gpzRects);

const stationOfInterestId = sceneL2.meta.mainTrunkStationIds[4] ?? sceneL2.meta.mainTrunkStationIds[0];
function stationHash(stationId) {
  return stationId.split('/')[1] ?? stationId;
}
const stationHashOfInterest = stationHash(stationOfInterestId);
const stationRects = [
  ...sceneL2.symbols.filter((s) => s.meta?.testId?.includes(stationHashOfInterest)).map(symbolRect),
  ...sceneL2.labels.filter((l) => l.ownerRef.includes(stationHashOfInterest)).map((l) => l.rect),
];
if (stationRects.length === 0) throw new Error(`Brak symboli/etykiet stacji „${stationOfInterestId}" w scenie L2.`);
const stationWorldRect = unionWorldRect(stationRects);

// ---------------------------------------------------------------------------
// 2. Nakładka operatora (LOD 1): energizacja WYŁĄCZNIE kolorem (spec §6 P5).
//    Podział deterministyczny (parzystość indeksu symbolu w scenie) — czysta
//    demonstracja, że kolor faktycznie reaguje na dane (znane ograniczenie
//    k1: odcinki poza GPZ nie niosą testId, patrz `canvas/overlay.ts`
//    nagłówek — nakładka koloruje tu WYŁĄCZNIE symbole, nie przewody stacji).
// ---------------------------------------------------------------------------

/** k4 (REBUILD_PLAN_V3 F6b-2, STOP-notatka ZNALEZISKO — patrz nagłówek
 *  `canvas/SldCanvasV3.tsx`: `fitBbox` liczony ZAWSZE z `buildSceneV3(snapshot, 2)`,
 *  NIEZALEŻNIE od `lodOverride`): przy `lodOverride=0`/`1` kamera fituje do
 *  WIĘKSZEGO bboxa L2, więc mniejsza faktyczna scena L0/L1 renderuje się
 *  MAŁA, w rogu viewportu — potwierdzone empirycznie (`audytor_L0_plan`
 *  bez tej korekty: rysunek ~220×300 CSS px w rogu 1920×1080 płótna, patrz
 *  raport F7). Harness NIE naprawia produkcyjnej kamery (poza zakresem —
 *  kod v3 zamrożony) — kadruje/supersamplinguje clipem do WŁASNEGO bboxa
 *  danego LOD, tą samą techniką co zoomy projektanta wyżej (treść wektorowa,
 *  zero utraty jakości). */
function toWorldRect(rect) {
  return { minX: rect.x, minY: rect.y, maxX: rect.x + rect.width, maxY: rect.y + rect.height };
}

const sceneL1 = buildSceneV3(enm, 1);
function symbolTestId(symbol, index) {
  return symbol.meta?.testId ?? `sld-v3-symbol-${index}`;
}
const energizedByTestId = {};
sceneL1.symbols.forEach((symbol, index) => {
  energizedByTestId[symbolTestId(symbol, index)] = index % 2 === 0;
});
const operatorOverlay = { energizedByTestId };

// ---------------------------------------------------------------------------
// 3. Renderuj HTML (renderToStaticMarkup) dla każdego wymaganego PNG.
// ---------------------------------------------------------------------------

const jobs = [];

jobs.push({
  name: 'projektant_L2_full',
  html: writeHtml('projektant_L2_full', React.createElement(SldCanvasV3, { snapshot: enm, width: FULL_W, height: FULL_H, lodOverride: 2 }), FULL_W, FULL_H),
  viewport: { width: FULL_W, height: FULL_H },
  clip: null,
});

jobs.push({
  name: 'projektant_L2_zoom_gpz',
  html: writeHtml('projektant_L2_zoom_gpz', React.createElement(SldCanvasV3, { snapshot: enm, width: FULL_W, height: FULL_H, lodOverride: 2 }), FULL_W, FULL_H),
  viewport: { width: FULL_W, height: FULL_H },
  clip: clipFor(gpzWorldRect, { width: FULL_W, height: FULL_H }),
});

jobs.push({
  name: 'projektant_L2_zoom_stacja',
  html: writeHtml('projektant_L2_zoom_stacja', React.createElement(SldCanvasV3, { snapshot: enm, width: FULL_W, height: FULL_H, lodOverride: 2 }), FULL_W, FULL_H),
  viewport: { width: FULL_W, height: FULL_H },
  clip: clipFor(stationWorldRect, { width: FULL_W, height: FULL_H }),
});

jobs.push({
  name: 'operator_L1_overlay',
  html: writeHtml(
    'operator_L1_overlay',
    React.createElement(SldCanvasV3, { snapshot: enm, width: FULL_W, height: FULL_H, lodOverride: 1, overlay: operatorOverlay }),
    FULL_W,
    FULL_H,
  ),
  viewport: { width: FULL_W, height: FULL_H },
  // k4: kadr do WŁASNEGO bboxa L1 (patrz komentarz `toWorldRect` wyżej) —
  // kamera produkcyjna fituje ZAWSZE do bboxa L2, więc L1 bez tej korekty
  // byłby mały w rogu 1920×1080 (empirycznie potwierdzone, patrz raport F7).
  clip: clipFor(toWorldRect(sceneL1.bbox), { width: FULL_W, height: FULL_H }, 6 * GRID),
});

jobs.push({
  name: 'audytor_L0_plan',
  html: writeHtml('audytor_L0_plan', React.createElement(SldCanvasV3, { snapshot: enm, width: FULL_W, height: FULL_H, lodOverride: 0 }), FULL_W, FULL_H),
  viewport: { width: FULL_W, height: FULL_H },
  // k4: kadr do WŁASNEGO bboxa L0 (jak wyżej).
  clip: clipFor(toWorldRect(buildSceneV3(enm, 0).bbox), { width: FULL_W, height: FULL_H }, 6 * GRID),
});

// ---------------------------------------------------------------------------
// 4. Rasteryzacja (Playwright, chromium lokalny — patrz QUALITY_PLAN §3).
// ---------------------------------------------------------------------------

/** Zoomy (`clip`) na sieci 4280×6125 world (LOD 2) zmieszczonej w 1920×1080
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

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
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
