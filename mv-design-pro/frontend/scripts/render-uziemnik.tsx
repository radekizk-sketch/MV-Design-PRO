/** Close-up of the EARTHING SWITCH (uziemnik) for visual audit — open + closed, beside the
 * disconnector ◯ and the cable head ▽ to confirm distinctness. Run: npx vite-node scripts/render-uziemnik.tsx */
import { mkdirSync, writeFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';

import { Glowica, Odlacznik, UziemnikIEC } from '../src/ui/sld/v2/station-rozdzielnia/canon/sldCanonKit';

const OUT = '/tmp/canon';
mkdirSync(OUT, { recursive: true });

// 4 cells, each scaled ~6× via a transform, with a bay-conductor stub above each switch.
const cell = (cx: number, label: string, el: JSX.Element, stub = true): string =>
  `<g transform="translate(${cx},120) scale(6)">` +
  (stub ? `<line x1="0" y1="-18" x2="0" y2="0" stroke="#1FA24A" stroke-width="1.4"/>` : '') +
  renderToStaticMarkup(el) +
  `</g><text x="${cx}" y="350" text-anchor="middle" fill="#CFE9FF" font-family="Inter" font-size="15" font-weight="700">${label}</text>`;

const inner =
  cell(150, 'uziemnik OTWARTY', <UziemnikIEC x={0} y={0} />) +
  cell(420, 'uziemnik ZAMKNIĘTY', <UziemnikIEC x={0} y={0} closed />) +
  cell(690, 'odłącznik ◯', <Odlacznik x={0} y={0} />, false) +
  cell(900, 'głowica ▽', <Glowica x={0} y={0} />, false);

const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1040 400" width="1040" height="400" font-family="Inter, system-ui, sans-serif">` +
  `<rect x="0" y="0" width="1040" height="400" fill="#0A1622"/>` +
  `<text x="520" y="40" text-anchor="middle" fill="#F4F6F8" font-size="20" font-weight="800">UZIEMNIK — IEC 60617 (close-up, ~6×)</text>` +
  inner +
  `</svg>`;
writeFileSync(`${OUT}/uziemnik-closeup.svg`, svg);
console.log('wrote', `${OUT}/uziemnik-closeup.svg`);
