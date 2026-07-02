/**
 * Render the E2 AUTO-LAYOUT of canon presets FROM THE MODEL (not the hand-coded presets):
 * companion → StationModel → layoutStation → StationAutoRenderer. Proves model→geometry→render.
 * Run: npx vite-node scripts/render-autolayout.tsx   (writes /tmp/canon/auto-*.svg)
 */
import { mkdirSync, writeFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';

import { companionToStationModel } from '../src/ui/sld/v2/station-rozdzielnia/autolayout/layoutModel';
import { StationAutoRenderer } from '../src/ui/sld/v2/station-rozdzielnia/autolayout/StationAutoRenderer';
import { layoutStation } from '../src/ui/sld/v2/station-rozdzielnia/autolayout/stationLayout';
import { OZE_ARCHETYPES_2A } from '../src/ui/sld/v2/station-rozdzielnia/companions/ozeArchetypes2a';

const OUT = process.env.CANON_OUT ?? '/tmp/canon';
mkdirSync(OUT, { recursive: true });

function emit(name: string, key: string): void {
  const companion = OZE_ARCHETYPES_2A[key];
  const layout = layoutStation(companionToStationModel(companion));
  const inner = renderToStaticMarkup(<StationAutoRenderer layout={layout} companion={companion} />);
  const { x, y, height } = layout.bbox;
  const w = layout.bbox.width + 300; // room for the right-hand readouts
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${height}" width="${w}" height="${height}" ` +
    `font-family="Inter, system-ui, sans-serif">` +
    `<rect x="${x}" y="${y}" width="${w}" height="${height}" fill="#0A1622"/>${inner}</svg>`;
  writeFileSync(`${OUT}/${name}.svg`, svg);
  console.log('wrote', `${OUT}/${name}.svg`, '· hash', layout.hash);
}

emit('auto-g1', 'G4-PVTR'); // 2 tiers (15,75 + 0,8) — one transformer
emit('auto-g8', 'G8-BIOGAZ'); // 1 tier (15) — no transformer
emit('auto-g9', 'G9-GPO'); // 3 tiers (15 + 0,69 + 0,4) — multi-transformer (validation target)
