/**
 * Render the E3 NETWORK auto-layout of the 53-station MV network FROM THE MODEL:
 *   sldNetwork53 (distilled ENM) → layoutNetwork → NetworkAutoRenderer.
 * Also emits one station's E2 SLD (the zoom-in detail the network composes).
 * Run: npx vite-node scripts/render-network.tsx   (writes /tmp/canon/network-*.svg)
 */
import { mkdirSync, writeFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';

import { companionToStationModel } from '../src/ui/sld/v2/station-rozdzielnia/autolayout/layoutModel';
import { NetworkAutoRenderer } from '../src/ui/sld/v2/station-rozdzielnia/autolayout/network/NetworkAutoRenderer';
import { layoutNetwork } from '../src/ui/sld/v2/station-rozdzielnia/autolayout/network/networkLayout';
import { SLD_NETWORK_53 } from '../src/ui/sld/v2/station-rozdzielnia/autolayout/network/sldNetwork53';
import { StationAutoRenderer } from '../src/ui/sld/v2/station-rozdzielnia/autolayout/StationAutoRenderer';
import { layoutStation } from '../src/ui/sld/v2/station-rozdzielnia/autolayout/stationLayout';
import { OZE_ARCHETYPES_2A } from '../src/ui/sld/v2/station-rozdzielnia/companions/ozeArchetypes2a';

const OUT = process.env.CANON_OUT ?? '/tmp/canon';
mkdirSync(OUT, { recursive: true });

// ── whole network ──
{
  const layout = layoutNetwork(SLD_NETWORK_53);
  const inner = renderToStaticMarkup(<NetworkAutoRenderer layout={layout} model={SLD_NETWORK_53} />);
  const { x, y, width, height } = layout.bbox;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}" width="${width}" height="${height}" ` +
    `font-family="Inter, system-ui, sans-serif"><rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#0A1622"/>${inner}</svg>`;
  writeFileSync(`${OUT}/network-53.svg`, svg);
  console.log('wrote', `${OUT}/network-53.svg`, '· hash', layout.hash, '· stations', layout.stations.length);
}

// ── zoom-in: one station drawn by the SAME E2 engine the network composes ──
{
  const companion = OZE_ARCHETYPES_2A['G4-PVTR']; // a PV+TR distribution station (== network PV stations)
  const layout = layoutStation(companionToStationModel(companion));
  const inner = renderToStaticMarkup(<StationAutoRenderer layout={layout} companion={companion} />);
  const { x, y, height } = layout.bbox;
  const w = layout.bbox.width + 300;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${height}" width="${w}" height="${height}" ` +
    `font-family="Inter, system-ui, sans-serif"><rect x="${x}" y="${y}" width="${w}" height="${height}" fill="#0A1622"/>${inner}</svg>`;
  writeFileSync(`${OUT}/network-zoom-station.svg`, svg);
  console.log('wrote', `${OUT}/network-zoom-station.svg`, '· (E2 station SLD)');
}
