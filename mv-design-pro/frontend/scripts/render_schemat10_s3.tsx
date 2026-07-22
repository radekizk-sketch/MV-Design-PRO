/**
 * SCHEMAT-10 S3 (V12K-135) — dowód wizualny „tokeny semantyki koloru +
 * sekcje/NOP per LOD + GPZ w gramatyce stacji". Renderuje REALNĄ sieć
 * referencyjną (fixtura `sldSubstrate52s`, 53 stacje SN + GPZ) przez
 * PRODUKCYJNĄ kanwę v3 (`SldCanvasV3`, NIE `CompositionPreview` — harness
 * debug świadomie zostaje „mono base", patrz `theme/colorTokens.ts`) na
 * L0/L1/L2 do SVG. Rasteryzacja do PNG: `rasterize.mjs`.
 *
 * Fixtura bazowa nie niesie żadnego NOP (`line_runs[].nop_station_ref`
 * zawsze `null` — patrz `buildScene.test.ts` `enmWithSyntheticNop`, GAP
 * udokumentowany w raporcie karty S3) — ten skrypt syntetyzuje JEDEN NOP
 * (pierwsza stacja ciągu głównego) identycznie jak testy, żeby dowód
 * wizualny faktycznie pokazywał znacznik NOP, nie pusty zbiór.
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   CANON_OUT=<dir> npx vite-node scripts/render_schemat10_s3.tsx
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';

import type { EnergyNetworkModel } from '../src/types/enm';
import { buildSceneV3, SCENE_LOD_LABELS_PL, type SceneLod } from '../src/ui/sld/v3/scene/buildScene';
import { SldCanvasV3 } from '../src/ui/sld/v3/canvas/SldCanvasV3';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  HERE,
  '../src/ui/sld/v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json',
);
const baseEnm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

// Syntetyzuj JEDEN NOP (patrz nagłówek pliku) — TA SAMA konstrukcja co
// `buildScene.test.ts` `enmWithSyntheticNop`/`sldCanvasV3.test.tsx`.
const baseline = buildSceneV3(baseEnm, 2);
const targetStationRef = baseline.meta.mainTrunkStationIds[0];
const enm = structuredClone(baseEnm);
const mainRun = enm.line_runs?.find((r) => r.run_kind === 'main_trunk');
if (!mainRun) throw new Error('fixtura bez ciągu main_trunk w line_runs — dowód S3 wymaga go do NOP');
(mainRun as { nop_station_ref: string | null }).nop_station_ref = targetStationRef;

const OUT = process.env.CANON_OUT ?? '/tmp/canon';
mkdirSync(OUT, { recursive: true });

const WIDTH = 1800;
const HEIGHT = 1100;

for (const lod of [0, 1, 2] as SceneLod[]) {
  const scene = buildSceneV3(enm, lod);
  const inner = renderToStaticMarkup(
    <SldCanvasV3 snapshot={enm} width={WIDTH} height={HEIGHT} lodOverride={lod} />,
  );
  // Pasek statusu (nazwa poziomu z JEDNEGO słownika, jak S1) — dowód że
  // widok wciąż mówi to samo co pasek statusu aplikacji.
  const banner =
    `<text x="16" y="${HEIGHT - 16}" font-family="Inter, system-ui, sans-serif" font-size="22" ` +
    `font-weight="600" fill="#E8EEF4">Widok: ${SCENE_LOD_LABELS_PL[lod]} (L${lod}) · S3: tokeny koloru + NOP + GPZ</text>`;
  const svg = inner.replace('</svg>', `${banner}</svg>`);
  writeFileSync(`${OUT}/s3-l${lod}.svg`, svg);
  console.log(
    'wrote',
    `${OUT}/s3-l${lod}.svg`,
    `· ${WIDTH}×${HEIGHT} · stacje=${scene.meta.stationCount} · nopSymbols=${scene.symbols.filter((s) => s.symbolId === 'noPoint').length}`,
  );
}
