/**
 * SCHEMAT-10 S6 (V12K-137) — pomiar layoutu (KOMPLET 18 metryk wg
 * WARUNKI_ODBIORU_S6 §3 + §6) na REALNEJ fixturze referencyjnej (53 stacje),
 * per LOD. Deterministyczny, bez skutków ubocznych. Uruchomienie (cwd
 * frontend): npx vite-node scripts/s6_measure.mjs
 *
 * Służy do wypełnienia tabeli przed/po w raporcie karty S6 i do ustalenia
 * baseline bramek `sld_v3_acceptance.mjs`.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { buildSceneV3, layoutMetricsReport } from '../src/ui/sld/v3/scene/buildScene.ts';
import { COLUMN_GAP } from '../src/ui/sld/v3/layout/segments.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  HERE,
  '../src/ui/sld/v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json',
);
const enm = JSON.parse(readFileSync(fixturePath, 'utf8')).enm;

console.log(`COLUMN_GAP (światło pasa górnego, layout/segments.ts) = ${COLUMN_GAP}px`);
for (const lod of [0, 1, 2]) {
  const m = layoutMetricsReport(buildSceneV3(enm, lod));
  console.log(`\n=== LOD ${lod} ===`);
  console.log(`verticalLength        = ${m.verticalLength}`);
  console.log(`horizontalLength      = ${m.horizontalLength}`);
  console.log(`totalOrthogonalLength = ${m.totalOrthogonalLength}`);
  console.log(`bendCount             = ${m.bendCount}`);
  console.log(`contentBBox           = ${m.contentBBoxWidth} x ${m.contentBBoxHeight} (area=${m.contentBBoxArea})`);
  console.log(`widthUtilization      = ${m.widthUtilization.toFixed(4)}`);
  console.log(`heightUtilization     = ${m.heightUtilization.toFixed(4)}`);
  console.log(`bboxUtilization       = ${m.bboxUtilization.toFixed(6)}`);
  console.log(`inkDensity            = ${m.inkDensity.toFixed(6)}`);
  console.log(`minimumClearance      = ${m.minimumClearance}`);
  console.log(`labelCollisionCount   = ${m.labelCollisionCount}`);
  console.log(`subtreeIntersection   = ${m.subtreeIntersectionCount}`);
  console.log(`nonOrthogonalSegments = ${m.nonOrthogonalSegmentCount}`);
  console.log(`ambiguousConnections  = ${m.ambiguousConnectionCount}`);
  console.log(`crossingCount         = ${m.crossingCount}`);
  console.log(`symbolCount           = ${m.symbolCount}`);
}
