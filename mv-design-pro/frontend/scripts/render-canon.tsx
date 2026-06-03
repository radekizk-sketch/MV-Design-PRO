/**
 * Render the canonical OZE SLD presets to standalone SVG files (for visual review).
 * Uses the REAL preset components + the FROZEN-solver companion — the same render path
 * the app uses, wrapped in an <svg> with the app's dark canvas. Run:
 *   npx vite-node scripts/render-canon.tsx        (writes to /tmp/canon/*.svg)
 */
import { mkdirSync, writeFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';

import { OZE_ARCHETYPES_2A } from '../src/ui/sld/v2/station-rozdzielnia/companions/ozeArchetypes2a';
import { SldCanonPresetG1 } from '../src/ui/sld/v2/station-rozdzielnia/canon/SldCanonPresetG1';
import { SldCanonPresetG2 } from '../src/ui/sld/v2/station-rozdzielnia/canon/SldCanonPresetG2';
import { SldCanonPresetG3 } from '../src/ui/sld/v2/station-rozdzielnia/canon/SldCanonPresetG3';
import { SldCanonPresetG4 } from '../src/ui/sld/v2/station-rozdzielnia/canon/SldCanonPresetG4';
import { SldCanonPresetG5 } from '../src/ui/sld/v2/station-rozdzielnia/canon/SldCanonPresetG5';
import { SldCanonPresetG6 } from '../src/ui/sld/v2/station-rozdzielnia/canon/SldCanonPresetG6';
import { SldCanonPresetG7 } from '../src/ui/sld/v2/station-rozdzielnia/canon/SldCanonPresetG7';
import { SldCanonPresetG8 } from '../src/ui/sld/v2/station-rozdzielnia/canon/SldCanonPresetG8';
import { SldCanonPresetG9 } from '../src/ui/sld/v2/station-rozdzielnia/canon/SldCanonPresetG9';

const OUT = process.env.CANON_OUT ?? '/tmp/canon';
const W = 1640;
const H = 956;

mkdirSync(OUT, { recursive: true });

function emit(name: string, el: JSX.Element, w = W): void {
  const inner = renderToStaticMarkup(el);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${H}" width="${w}" height="${H}" ` +
    `font-family="Inter, system-ui, sans-serif">` +
    `<rect x="0" y="0" width="${w}" height="${H}" fill="#0A1622"/>${inner}</svg>`;
  writeFileSync(`${OUT}/${name}.svg`, svg);
  console.log('wrote', `${OUT}/${name}.svg`);
}
const WIND_W = 1860; // wind presets (collector + readouts) are wider than the PV/BESS canvas

emit('g1-pv-1mw', <SldCanonPresetG1 companion={OZE_ARCHETYPES_2A['G4-PVTR']} />);
emit('g2-pv-nn', <SldCanonPresetG2 companion={OZE_ARCHETYPES_2A['G1']} />);
emit('g3-bess', <SldCanonPresetG3 companion={OZE_ARCHETYPES_2A['G5-BESS']} />);
emit('g4-pvbess-bus', <SldCanonPresetG4 companion={OZE_ARCHETYPES_2A['G4-PVBESS-BUS']} />);
emit('g4-pvbess-ac', <SldCanonPresetG4 companion={OZE_ARCHETYPES_2A['G4-PVBESS-AC']} />);
emit('g5-wind', <SldCanonPresetG5 companion={OZE_ARCHETYPES_2A['G5-WIND-T4']} />, WIND_W);
emit('g6-wind-dfig', <SldCanonPresetG6 companion={OZE_ARCHETYPES_2A['G6-WIND-DFIG']} />, WIND_W);
emit('g7-wind-async', <SldCanonPresetG7 companion={OZE_ARCHETYPES_2A['G7-WIND-ASYNC']} />, WIND_W);
emit('g8-biogaz', <SldCanonPresetG8 companion={OZE_ARCHETYPES_2A['G8-BIOGAZ']} />, WIND_W);
emit('g9-gpo', <SldCanonPresetG9 companion={OZE_ARCHETYPES_2A['G9-GPO']} />, 1960);
