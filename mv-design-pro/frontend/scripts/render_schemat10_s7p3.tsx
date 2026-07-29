/**
 * SCHEMAT-10 S7 etap 3 (V12K-137, GAP `S7_GAP_CROSSING_ZERO` §8) — dowód
 * wizualny rozdzielonych świateł §5 + fixu determinizmu DER. Renderuje REALNĄ
 * sieć referencyjną (`sldSubstrate52s`, 53 stacje SN + GPZ) PRODUKCYJNĄ kanwą v3
 * (`SldCanvasV3`) na L0/L1/L2 do SVG, z paskiem 18 metryk (crossing=0 utrzymany,
 * kompaktyzacja P1 bez regresu, kanoniczny porządek DER).
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   CANON_OUT=<dir> npx vite-node scripts/render_schemat10_s7p3.tsx
 * Rasteryzacja do PNG: CANON_OUT=<dir> node scripts/rasterize.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';

import type { EnergyNetworkModel } from '../src/types/enm';
import {
  buildSceneV3,
  layoutMetricsReport,
  SCENE_LOD_LABELS_PL,
  type SceneLod,
} from '../src/ui/sld/v3/scene/buildScene';
import { SldCanvasV3 } from '../src/ui/sld/v3/canvas/SldCanvasV3';
import { TOP_LEVEL_FIELD_CLEARANCE, MIN_SUBTREE_CLEARANCE } from '../src/ui/sld/v3/layout/clearances';
import { CANVAS_BACKGROUND } from '../src/ui/sld/v3/theme/colorTokens';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  HERE,
  '../src/ui/sld/v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json',
);
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

const OUT = process.env.CANON_OUT ?? '/tmp/canon';
mkdirSync(OUT, { recursive: true });

const WIDTH = 1800;
const HEIGHT = 1100;
const FOOTER = 56; // pas stopki POD kanwą (Z4: baner poza bbox treści arkusza)

for (const lod of [0, 1, 2] as SceneLod[]) {
  const scene = buildSceneV3(enm, lod);
  const m = layoutMetricsReport(scene);
  const inner = renderToStaticMarkup(
    <SldCanvasV3 snapshot={enm} width={WIDTH} height={HEIGHT} lodOverride={lod} />,
  );
  const line1 =
    `Widok: ${SCENE_LOD_LABELS_PL[lod]} (L${lod}) · S7 etap 3: rozdzielone swiatla §5 + determinizm DER (V12K-137)`;
  const line2 =
    `TOP_LEVEL_FIELD=${TOP_LEVEL_FIELD_CLEARANCE} SUBTREE=${MIN_SUBTREE_CLEARANCE} ` +
    `crossing=${m.crossingCount} piony=${m.verticalLength} poziomy=${m.horizontalLength} ` +
    `bbox=${m.contentBBoxWidth}x${m.contentBBoxHeight} inkDensity=${m.inkDensity.toFixed(4)} ` +
    `swiatlo=${m.minimumClearance} kolizje=${m.labelCollisionCount} ` +
    `M02=${m.subtreeIntersectionCount} nieortog=${m.nonOrthogonalSegmentCount} symbole=${m.symbolCount}`;
  // Z4 (audyt powykonawczy SLD 2026-07): baner metryczny w STOPCE POD kanwą
  // (poza bbox treści), wzorcem s7p6 — PNG do oceny nie sugeruje kolizji sceny.
  const withNs = inner.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
  const footer =
    `<rect x="0" y="${HEIGHT}" width="${WIDTH}" height="${FOOTER}" fill="${CANVAS_BACKGROUND}" />` +
    `<text x="16" y="${HEIGHT + 24}" font-family="Inter, system-ui, sans-serif" font-size="20" ` +
    `font-weight="600" fill="#E8EEF4">${line1}</text>` +
    `<text x="16" y="${HEIGHT + 46}" font-family="Inter, system-ui, sans-serif" font-size="14" ` +
    `fill="#9FB3C8">${line2}</text>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT + FOOTER}" ` +
    `viewBox="0 0 ${WIDTH} ${HEIGHT + FOOTER}"><rect width="${WIDTH}" height="${HEIGHT + FOOTER}" ` +
    `fill="${CANVAS_BACKGROUND}" />${withNs}${footer}</svg>`;
  writeFileSync(`${OUT}/s7p3-l${lod}.svg`, svg);
  console.log('wrote', `${OUT}/s7p3-l${lod}.svg`, `· stacje=${scene.meta.stationCount} symbole=${m.symbolCount}`);
}
