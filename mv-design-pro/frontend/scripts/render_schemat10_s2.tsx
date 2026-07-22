/**
 * SCHEMAT-10 S2 (V12K-135) — dowód wizualny „silnik etykiet z wyrocznią
 * zero-kolizji". Renderuje REALNĄ sieć referencyjną (fixtura `sldSubstrate52s`,
 * 53 stacje SN + GPZ) przez PRODUKCYJNY tor v3 (`buildSceneV3` →
 * `CompositionPreview`) na L0/L1/L2 do SVG. Rasteryzacja do PNG: `rasterize.mjs`
 * (playwright chromium). Sceny są PO declutterze (silnik etykiet), więc render
 * pokazuje DOKŁADNIE to, co waliduje wyrocznia `noLabelCollisions` — zero
 * kolizji tekst↔tekst i tekst↔symbol.
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   CANON_OUT=<dir> npx vite-node scripts/render_schemat10_s2.tsx
 *
 * Determinizm: to samo wejście ⇒ ten sam SVG (buildSceneV3 + declutterLabels
 * czyste, bez Date.now/random).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';

import type { EnergyNetworkModel } from '../src/types/enm';
import {
  buildSceneV3,
  labelCollisions,
  SCENE_LOD_LABELS_PL,
  type SceneLod,
} from '../src/ui/sld/v3/scene/buildScene';
import { CompositionPreview } from '../src/ui/sld/v3/compose/preview';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  HERE,
  '../src/ui/sld/v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json',
);
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

const OUT = process.env.CANON_OUT ?? '/tmp/canon';
mkdirSync(OUT, { recursive: true });

const MARGIN = 48;

for (const lod of [0, 1, 2] as SceneLod[]) {
  const scene = buildSceneV3(enm, lod);
  const collisions = labelCollisions(scene).length;
  if (collisions !== 0) {
    throw new Error(`SCHEMAT-10 S2: LOD ${lod} ma ${collisions} kolizji — wyrocznia zero-kolizji naruszona, render wstrzymany.`);
  }
  const width = Math.ceil(scene.bbox.x + scene.bbox.width + MARGIN);
  const height = Math.ceil(scene.bbox.y + scene.bbox.height + MARGIN + 40);
  const inner = renderToStaticMarkup(
    <CompositionPreview composition={scene} width={width} height={height} />,
  );
  const banner =
    `<text x="16" y="${height - 16}" font-family="Inter, system-ui, sans-serif" font-size="22" ` +
    `font-weight="600" fill="#E8EEF4">Widok: ${SCENE_LOD_LABELS_PL[lod]} (L${lod}) · 0 kolizji (wyrocznia)</text>`;
  const withBanner = inner.replace('</svg>', `${banner}</svg>`);
  // Sieć 53 stacji jest szeroka (~14 tys. px świata). Do rasteryzacji do
  // sensownego PNG (przegląd właściciela, jak S1) capujemy SZEROKOŚĆ
  // WYŚWIETLANIA do 2600 px i przenosimy pełne współrzędne świata do viewBox
  // (zachowanie proporcji) — treść skaluje się, geometria bez zmian.
  const CAP = 2600;
  const scale = Math.min(1, CAP / width);
  const dispW = Math.round(width * scale);
  const dispH = Math.round(height * scale);
  const svg = withBanner.replace(
    /<svg\b[^>]*>/,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${dispW}" height="${dispH}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMinYMin meet">`,
  );
  writeFileSync(`${OUT}/s2-l${lod}.svg`, svg);
  console.log('wrote', `${OUT}/s2-l${lod}.svg`, `· ${width}×${height} · stacje=${scene.meta.stationCount} · kolizje=${collisions}`);
}
