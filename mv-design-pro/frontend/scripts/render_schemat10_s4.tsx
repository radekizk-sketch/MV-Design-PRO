/**
 * SCHEMAT-10 S4 (V12K-135/136) — dowód wizualny „motyw eksportu + kadr
 * fit-do-treści". Renderuje REALNĄ sieć referencyjną (fixtura
 * `sldSubstrate52s`, 53 stacje SN + GPZ) przez PRODUKCYJNĄ kanwę v3
 * (`SldCanvasV3`) na L1, DWA razy:
 *  - `s4-ekran-l1.svg` — render EKRANOWY (dark SCADA, kamera fit domyślny) —
 *    dowód R1 „kanwa na ekranie ZAWSZE SCADA-dark";
 *  - `s4-eksport-l1.svg` — DOKŁADNIE TA SAMA sieć/LOD, po torze eksportu
 *    (`applyContentFitFrame` + `toLightTechnicalExportSvg`, TA SAMA funkcja
 *    co `SldCanvasV3Workspace.handleExportSvg`) — dowód „jasny wariant w
 *    torze eksportu, kadr fit-do-treści".
 * Rasteryzacja do PNG: `rasterize_s4_host.mjs` (nested-svg host wrapper, jak
 * S3 — patrz `rasterize_s3_host.mjs` nagłówek).
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   CANON_OUT=<dir> npx vite-node scripts/render_schemat10_s4.tsx
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';

import type { EnergyNetworkModel } from '../src/types/enm';
import { buildSceneV3, SCENE_LOD_LABELS_PL, type SceneLod } from '../src/ui/sld/v3/scene/buildScene';
import { SldCanvasV3 } from '../src/ui/sld/v3/canvas/SldCanvasV3';
import { computeContentFitFrame } from '../src/ui/sld/v3/export/exportFrame';
import { toLightTechnicalExportSvg } from '../src/ui/sld/v3/export/exportPalette';
import { CANVAS_BACKGROUND } from '../src/ui/sld/v3/theme/colorTokens';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  HERE,
  '../src/ui/sld/v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json',
);
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

const OUT = process.env.CANON_OUT ?? '/tmp/canon';
mkdirSync(OUT, { recursive: true });

const LOD: SceneLod = 1;
const WIDTH = 1800;
const HEIGHT = 1100;
const FOOTER = 40; // pas stopki POD kanwą (Z4: baner poza bbox treści arkusza)

const scene = buildSceneV3(enm, LOD);

// --- Ekran (dark SCADA) --------------------------------------------------
// Z4 (audyt powykonawczy SLD 2026-07): pasek w STOPCE POD kanwą (poza bbox
// treści), wzorcem s7p6. `data-footer` informuje `rasterize_s4_host.mjs`, że
// skalę kadru liczyć z wysokości SCENY (bez stopki) — scena bez zmiany skali.
const ekranInner = renderToStaticMarkup(
  <SldCanvasV3 snapshot={enm} width={WIDTH} height={HEIGHT} lodOverride={LOD} />,
);
const ekranWithNs = ekranInner.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
const ekranLine = `Widok: ${SCENE_LOD_LABELS_PL[LOD]} (L${LOD}) · S4: ekran SCADA-dark`;
const ekranFooter =
  `<rect x="0" y="${HEIGHT}" width="${WIDTH}" height="${FOOTER}" fill="${CANVAS_BACKGROUND}" />` +
  `<text x="16" y="${HEIGHT + 26}" font-family="Inter, system-ui, sans-serif" font-size="20" ` +
  `font-weight="600" fill="#E8EEF4">${ekranLine}</text>`;
const ekranSvg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT + FOOTER}" ` +
  `viewBox="0 0 ${WIDTH} ${HEIGHT + FOOTER}" data-footer="${FOOTER}">` +
  `<rect width="${WIDTH}" height="${HEIGHT + FOOTER}" fill="${CANVAS_BACKGROUND}" />${ekranWithNs}${ekranFooter}</svg>`;
writeFileSync(`${OUT}/s4-ekran-l1.svg`, ekranSvg);

// --- Eksport (light_technical, kadr fit-do-treści) -----------------------
// TA SAMA funkcja co `SldCanvasV3Workspace.handleExportSvg` — kadr nadpisany
// PRZED substytucją palety (kolejność identyczna z torze produkcyjnym).
const frame = computeContentFitFrame(scene);
const exportRaw = ekranInner
  .replace(/viewBox="[^"]*"/, `viewBox="${frame.viewBox}"`)
  .replace(/^(<svg[^>]*\swidth=")[^"]*(")/, `$1${frame.width}$2`)
  .replace(/^(<svg[^>]*\sheight=")[^"]*(")/, `$1${frame.height}$2`);
const exportSvgBody = toLightTechnicalExportSvg(exportRaw);
const exportWithNs = exportSvgBody.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
const exportLine =
  `Widok: ${SCENE_LOD_LABELS_PL[LOD]} (L${LOD}) · S4: eksport light_technical · kadr fit-do-treści`;
// Stopka w palecie eksportu (jasne tło, czarny tekst), poza bbox kadru sceny.
const exportFooter =
  `<rect x="0" y="${frame.height}" width="${frame.width}" height="${FOOTER}" fill="#FFFFFF" />` +
  `<text x="16" y="${frame.height + 26}" font-family="Inter, system-ui, sans-serif" font-size="20" ` +
  `font-weight="600" fill="#000000">${exportLine}</text>`;
const exportSvg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${frame.width}" height="${frame.height + FOOTER}" ` +
  `viewBox="0 0 ${frame.width} ${frame.height + FOOTER}" data-footer="${FOOTER}">` +
  `<rect width="${frame.width}" height="${frame.height + FOOTER}" fill="#FFFFFF" />${exportWithNs}${exportFooter}</svg>`;
writeFileSync(`${OUT}/s4-eksport-l1.svg`, exportSvg);

console.log(
  'wrote',
  `${OUT}/s4-ekran-l1.svg`,
  'i',
  `${OUT}/s4-eksport-l1.svg`,
  `· stacje=${scene.meta.stationCount} · kadr eksportu=${frame.width}x${frame.height}`,
);
