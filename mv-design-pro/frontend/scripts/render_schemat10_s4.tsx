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

const scene = buildSceneV3(enm, LOD);

// --- Ekran (dark SCADA) --------------------------------------------------
const ekranInner = renderToStaticMarkup(
  <SldCanvasV3 snapshot={enm} width={WIDTH} height={HEIGHT} lodOverride={LOD} />,
);
const ekranBanner =
  `<text x="16" y="${HEIGHT - 16}" font-family="Inter, system-ui, sans-serif" font-size="22" ` +
  `font-weight="600" fill="#E8EEF4">Widok: ${SCENE_LOD_LABELS_PL[LOD]} (L${LOD}) · S4: ekran SCADA-dark</text>`;
const ekranSvg = ekranInner.replace('</svg>', `${ekranBanner}</svg>`);
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
const exportBanner =
  `<text x="16" y="${frame.height - 16}" font-family="Inter, system-ui, sans-serif" font-size="22" ` +
  `font-weight="600" fill="#000000">Widok: ${SCENE_LOD_LABELS_PL[LOD]} (L${LOD}) · S4: eksport light_technical` +
  ` · kadr fit-do-treści</text>`;
const exportSvg = exportSvgBody.replace('</svg>', `${exportBanner}</svg>`);
writeFileSync(`${OUT}/s4-eksport-l1.svg`, exportSvg);

console.log(
  'wrote',
  `${OUT}/s4-ekran-l1.svg`,
  'i',
  `${OUT}/s4-eksport-l1.svg`,
  `· stacje=${scene.meta.stationCount} · kadr eksportu=${frame.width}x${frame.height}`,
);
