/**
 * SCHEMAT-10 S1 (V12K-135) — dowód wizualny „jedna gramatyka stacji i jedna
 * kotwica LOD". Renderuje REALNĄ sieć referencyjną (fixtura `sldSubstrate52s`,
 * 53 stacje SN + GPZ) przez PRODUKCYJNY tor v3 (`buildSceneV3` →
 * `CompositionPreview`) na L0/L1/L2 do SVG. Rasteryzacja do PNG: `rasterize.mjs`.
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   CANON_OUT=<dir> npx vite-node scripts/render_schemat10_s1.tsx
 *
 * Determinizm: to samo wejście ⇒ ten sam SVG (buildSceneV3 czyste, bez
 * Date.now/random). Na zrzutach L0/L1/L2 środek KAŻDEJ stacji i oś magistrali
 * są w TYCH SAMYCH współrzędnych świata (jedna kotwica) — różni się tylko
 * szczegół rysowany (L0 symbol zbiorczy · L1 aparaty główne · L2 pełna aparatura).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';

import type { EnergyNetworkModel } from '../src/types/enm';
import { buildSceneV3, SCENE_LOD_LABELS_PL, type SceneLod } from '../src/ui/sld/v3/scene/buildScene';
import { CompositionPreview } from '../src/ui/sld/v3/compose/preview';
import { CANVAS_BACKGROUND } from '../src/ui/sld/v3/theme/colorTokens';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  HERE,
  '../src/ui/sld/v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json',
);
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

const OUT = process.env.CANON_OUT ?? '/tmp/canon';
mkdirSync(OUT, { recursive: true });

const MARGIN = 48;
const FOOTER = 40; // pas stopki POD kanwą (Z4: baner poza bbox treści arkusza)

for (const lod of [0, 1, 2] as SceneLod[]) {
  const scene = buildSceneV3(enm, lod);
  const width = Math.ceil(scene.bbox.x + scene.bbox.width + MARGIN);
  const height = Math.ceil(scene.bbox.y + scene.bbox.height + MARGIN + 40);
  const inner = renderToStaticMarkup(
    <CompositionPreview composition={scene} width={width} height={height} />,
  );
  // Pasek statusu (nazwa poziomu z JEDNEGO słownika) — dowód „jednego słownika LOD".
  // Z4 (audyt powykonawczy SLD 2026-07): pasek w STOPCE POD kanwą (poza bbox
  // treści), wzorcem s7p6 — PNG do oceny nie sugeruje kolizji sceny.
  const line1 = `Widok: ${SCENE_LOD_LABELS_PL[lod]} (L${lod})`;
  const withNs = inner.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
  const footer =
    `<rect x="0" y="${height}" width="${width}" height="${FOOTER}" fill="${CANVAS_BACKGROUND}" />` +
    `<text x="16" y="${height + 26}" font-family="Inter, system-ui, sans-serif" font-size="20" ` +
    `font-weight="600" fill="#E8EEF4">${line1}</text>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height + FOOTER}" ` +
    `viewBox="0 0 ${width} ${height + FOOTER}"><rect width="${width}" height="${height + FOOTER}" ` +
    `fill="${CANVAS_BACKGROUND}" />${withNs}${footer}</svg>`;
  writeFileSync(`${OUT}/s1-l${lod}.svg`, svg);
  console.log('wrote', `${OUT}/s1-l${lod}.svg`, `· ${width}×${height} · stacje=${scene.meta.stationCount}`);
}
