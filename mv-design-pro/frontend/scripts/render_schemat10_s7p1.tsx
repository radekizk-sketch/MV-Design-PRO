/**
 * SCHEMAT-10 S7 etap 1 (V12K-137, GAP `S7_GAP_CROSSING_ZERO` §S7-P1) — dowód
 * wizualny kompaktyzacji Rodziny B (pakowanie interwałowe + piony
 * proporcjonalne). Renderuje REALNĄ sieć referencyjną (`sldSubstrate52s`, 53
 * stacje SN + GPZ) PRODUKCYJNĄ kanwą v3 (`SldCanvasV3`) na L0/L1/L2 do SVG, z
 * paskiem metryk PRZED/PO (piony 50264/67208/67208 → 28072/45016/45016).
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   CANON_OUT=<dir> npx vite-node scripts/render_schemat10_s7p1.tsx
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
const VERTICAL_BEFORE: Record<number, number> = { 0: 50264, 1: 67208, 2: 67208 };

for (const lod of [0, 1, 2] as SceneLod[]) {
  const scene = buildSceneV3(enm, lod);
  const m = layoutMetricsReport(scene);
  const inner = renderToStaticMarkup(
    <SldCanvasV3 snapshot={enm} width={WIDTH} height={HEIGHT} lodOverride={lod} />,
  );
  const line1 =
    `Widok: ${SCENE_LOD_LABELS_PL[lod]} (L${lod}) · S7 etap 1: kompaktyzacja pionowa (V12K-137)`;
  const line2 =
    `piony ${VERTICAL_BEFORE[lod]}→${m.verticalLength} poziomy=${m.horizontalLength} ` +
    `bbox=${m.contentBBoxWidth}x${m.contentBBoxHeight} inkDensity=${m.inkDensity.toFixed(4)} ` +
    `przeciecia=${m.crossingCount} swiatlo=${m.minimumClearance} kolizje=${m.labelCollisionCount} ` +
    `M02=${m.subtreeIntersectionCount} nieortog=${m.nonOrthogonalSegmentCount}`;
  const banner =
    `<text x="16" y="${HEIGHT - 40}" font-family="Inter, system-ui, sans-serif" font-size="22" ` +
    `font-weight="600" fill="#E8EEF4">${line1}</text>` +
    `<text x="16" y="${HEIGHT - 14}" font-family="Inter, system-ui, sans-serif" font-size="16" ` +
    `fill="#9FB3C8">${line2}</text>`;
  // Rasteryzacja (rasterize.mjs → Chromium file://) wymaga deklaracji przestrzeni
  // nazw na korzeniu, inaczej przeglądarka pokazuje drzewo XML zamiast pikseli.
  const withNs = inner.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
  const svg = withNs.replace('</svg>', `${banner}</svg>`);
  writeFileSync(`${OUT}/s7p1-l${lod}.svg`, svg);
  console.log('wrote', `${OUT}/s7p1-l${lod}.svg`, `· stacje=${scene.meta.stationCount}`);
}
