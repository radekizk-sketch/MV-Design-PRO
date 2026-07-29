/**
 * SCHEMAT-10 W5 (RECENZJA_L2_POLA_WYPOSAZENIE_2026-07 §12–15/§18/uwaga 7) —
 * dowód wizualny: (A) CT ≠ VT z REALNYCH glifów biblioteki IEC 60617 + wariant
 * CT z DANYCH (przekładnia + układ + przeznaczenie `Measurement.purpose`);
 * (B) podwarstwy L2-A/B/C/D on/off (grupowanie warstw renderu, widoczność bez
 * dryfu geometrii); (C) czytelność symboli. Glify i mapowanie podwarstw z
 * REALNYCH modułów (`symbols/glyphs`, `canvas/layers`, `compose/protectionMarking`)
 * — zero fabrykacji renderu.
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   CANON_OUT=<dir> npx vite-node scripts/render_schemat10_w5.tsx
 *   CANON_OUT=<dir> node scripts/rasterize.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';

import { SYMBOL_DEFS } from '../src/ui/sld/v3/symbols/defs';
import { SYMBOL_GLYPHS } from '../src/ui/sld/v3/symbols/glyphs';
import {
  CANVAS_LAYER_LABELS_PL,
  L2_SUBLAYER_IDS,
  L2_SUBLAYER_LABELS_PL,
  L2_SUBLAYER_MEMBERS,
} from '../src/ui/sld/v3/canvas/layers';
import { ctRatingLabelText } from '../src/ui/sld/v3/compose/protectionMarking';

const OUT = process.env.CANON_OUT ?? '/tmp/canon';
mkdirSync(OUT, { recursive: true });

const INK = '#E8EEF4';
const MUT = '#9FB3C8';
const DIM = '#7C93A8';
const ACC = '#7FE6AF';
const WIRE = '#5A7C97';
const PANEL = '#111C28';
const STROKE = '#25384A';

const WIDTH = 1180;
const HEIGHT = 900;

function glyph(id: 'currentTransformer' | 'voltageTransformer', x: number, y: number, scale: number): string {
  const G = SYMBOL_GLYPHS[id];
  return `<g transform="translate(${x},${y}) scale(${scale})">${renderToStaticMarkup(<G x={0} y={0} stroke={INK} />)}</g>`;
}

// --- Panel A: CT ≠ VT + wariant CT z danych --------------------------------
const ctRatio = ctRatingLabelText({ identifier: 'T1', ratioText: '300/5', arrangement: '3xCT' });
const ctW = SYMBOL_DEFS.currentTransformer.width;
const ctH = SYMBOL_DEFS.currentTransformer.height;
const vtW = SYMBOL_DEFS.voltageTransformer.width;
const vtH = SYMBOL_DEFS.voltageTransformer.height;
const S = 3.2;

const panelA =
  `<rect x="20" y="70" width="560" height="360" rx="10" fill="${PANEL}" stroke="${STROKE}"/>` +
  `<text x="40" y="100" font-family="Inter, sans-serif" font-size="15" font-weight="700" fill="${ACC}">A · CT ≠ VT (IEC 60617) + wariant CT z danych</text>` +
  // CT column (szeregowo w torze — 1 okrąg)
  `<text x="120" y="130" text-anchor="middle" font-family="Inter, sans-serif" font-size="13" font-weight="600" fill="${INK}">Przekładnik prądowy CT</text>` +
  `<text x="120" y="148" text-anchor="middle" font-family="Inter, sans-serif" font-size="11" fill="${MUT}">szeregowo w torze · 1 okrąg</text>` +
  `<line x1="120" y1="165" x2="120" y2="${165 + ctH * S}" stroke="${WIRE}" stroke-width="1.6"/>` +
  glyph('currentTransformer', 120 - (ctW * S) / 2, 165, S) +
  `<text x="120" y="${185 + ctH * S}" text-anchor="middle" font-family="ui-monospace, monospace" font-size="12" fill="${INK}">${ctRatio}</text>` +
  `<rect x="70" y="${196 + ctH * S}" width="100" height="20" rx="10" fill="#0E2018" stroke="${ACC}"/>` +
  `<text x="120" y="${210 + ctH * S}" text-anchor="middle" font-family="Inter, sans-serif" font-size="10.5" fill="${ACC}">purpose: protection</text>` +
  `<text x="120" y="${234 + ctH * S}" text-anchor="middle" font-family="Inter, sans-serif" font-size="10" fill="${DIM}">data-ct-purpose (audyt, bez geometrii)</text>` +
  // VT column (odgałęźnie — 2 okręgi)
  `<text x="400" y="130" text-anchor="middle" font-family="Inter, sans-serif" font-size="13" font-weight="600" fill="${INK}">Przekładnik napięciowy VT</text>` +
  `<text x="400" y="148" text-anchor="middle" font-family="Inter, sans-serif" font-size="11" fill="${MUT}">odgałęźnie (lateral) · 2 okręgi</text>` +
  `<line x1="330" y1="180" x2="400" y2="180" stroke="${WIRE}" stroke-width="1.6"/>` +
  `<line x1="400" y1="180" x2="400" y2="165" stroke="${WIRE}" stroke-width="1.6"/>` +
  glyph('voltageTransformer', 400 - (vtW * S) / 2, 165, S) +
  `<text x="400" y="${196 + vtH * S}" text-anchor="middle" font-family="Inter, sans-serif" font-size="10.5" fill="${DIM}">przekładnia/typ VT — rejestr braków</text>` +
  `<text x="400" y="${212 + vtH * S}" text-anchor="middle" font-family="Inter, sans-serif" font-size="10" fill="${DIM}">(wymaga danych ENM · uwaga 7)</text>`;

// --- Panel B: podwarstwy L2 on/off -----------------------------------------
let bRows = '';
let by = 130;
for (const id of L2_SUBLAYER_IDS) {
  const members = L2_SUBLAYER_MEMBERS[id].map((l) => CANVAS_LAYER_LABELS_PL[l]).join(' + ');
  bRows +=
    `<circle cx="620" cy="${by - 4}" r="6" fill="${ACC}"/>` +
    `<text x="636" y="${by}" font-family="Inter, sans-serif" font-size="13" font-weight="600" fill="${INK}">${L2_SUBLAYER_LABELS_PL[id]}</text>` +
    `<text x="636" y="${by + 17}" font-family="Inter, sans-serif" font-size="11" fill="${MUT}">→ ${members}</text>` +
    // on/off pill
    `<rect x="1080" y="${by - 14}" width="34" height="17" rx="8.5" fill="#0E2018" stroke="${ACC}"/>` +
    `<text x="1097" y="${by - 2}" text-anchor="middle" font-family="Inter, sans-serif" font-size="9.5" fill="${ACC}">on</text>` +
    `<rect x="1120" y="${by - 14}" width="40" height="17" rx="8.5" fill="#20140E" stroke="#E6C27F"/>` +
    `<text x="1140" y="${by - 2}" text-anchor="middle" font-family="Inter, sans-serif" font-size="9.5" fill="#E6C27F">off</text>`;
  by += 62;
}
const panelB =
  `<rect x="600" y="70" width="560" height="360" rx="10" fill="${PANEL}" stroke="${STROKE}"/>` +
  `<text x="620" y="100" font-family="Inter, sans-serif" font-size="15" font-weight="700" fill="${ACC}">B · Podwarstwy L2 przełączalne (§18)</text>` +
  `<text x="620" y="118" font-family="Inter, sans-serif" font-size="11" fill="${MUT}">widoczność, nie layout — geometria/kotwica stacji niezmienne w KAŻDYM stanie</text>` +
  bRows;

// --- Panel C: czytelność ----------------------------------------------------
const panelC =
  `<rect x="20" y="450" width="1140" height="410" rx="10" fill="${PANEL}" stroke="${STROKE}"/>` +
  `<text x="40" y="480" font-family="Inter, sans-serif" font-size="15" font-weight="700" fill="${ACC}">C · Czytelność symboli — punkty zrealizowane vs dług geometryczny</text>` +
  `<text x="40" y="510" font-family="Inter, sans-serif" font-size="12.5" fill="${INK}">✓ CT/VT jednoznacznie odróżnialne biblioteką (1 vs 2 okręgi, IEC 60617) — bez zmiany geometrii/kotwic.</text>` +
  `<text x="40" y="534" font-family="Inter, sans-serif" font-size="12.5" fill="${INK}">✓ CT szeregowo w torze / VT odgałęźnie (lateral) — semantyka toru z LATERAL_APPARATUS_SYMBOLS.</text>` +
  `<text x="40" y="558" font-family="Inter, sans-serif" font-size="12.5" fill="${INK}">✓ Wariant CT z DANYCH: przekładnia (F10.4) + układ 3×CT/Ferranti (F10.6) + przeznaczenie purpose (W5, data-ct-purpose).</text>` +
  `<text x="40" y="588" font-family="Inter, sans-serif" font-size="12.5" fill="${DIM}">Dług jawny (geometria — poza zakresem „bez dryfu", jak prefiks pola Z3/V12K-171):</text>` +
  `<text x="60" y="610" font-family="Inter, sans-serif" font-size="11.5" fill="${DIM}">• przekładnia/typ VT jako adnotacja (brak ścieżki adnotacji VT; wymaga rezerwacji szerokości = dryf).</text>` +
  `<text x="60" y="630" font-family="Inter, sans-serif" font-size="11.5" fill="${DIM}">• liczba rdzeni CT — brak pola w ENM (Measurement niesie ct_arrangement/accuracy_class, nie liczbę rdzeni).</text>` +
  `<text x="60" y="650" font-family="Inter, sans-serif" font-size="11.5" fill="${DIM}">• VT szynowy vs kablowy — brak pola w ENM (vt_arrangement to open_delta/star, inna oś). Decyzja danych.</text>` +
  `<text x="40" y="690" font-family="Inter, sans-serif" font-size="11.5" fill="${MUT}">Zasada W5 §0.2: wariant bez danych ⇒ symbol bazowy bez etykiety wariantu (uczciwy brak, rejestr braków) — zero domyślnych przekładni.</text>`;

const title =
  `<text x="20" y="34" font-family="Inter, sans-serif" font-size="22" font-weight="700" fill="${INK}">` +
  `W5 · Warianty CT/VT z danych + podwarstwy L2 + czytelność symboli</text>` +
  `<text x="20" y="58" font-family="Inter, sans-serif" font-size="13" fill="${MUT}">` +
  `RECENZJA_L2_POLA_WYPOSAZENIE §12–15/§18/uwaga 7 · geometria bez dryfu · zero fabrykacji</text>`;

const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">` +
  `<rect width="${WIDTH}" height="${HEIGHT}" fill="#0E1621"/>${title}${panelA}${panelB}${panelC}</svg>`;

writeFileSync(`${OUT}/w5-l2-ctvt-podwarstwy.svg`, svg);
console.log('wrote', `${OUT}/w5-l2-ctvt-podwarstwy.svg`);
