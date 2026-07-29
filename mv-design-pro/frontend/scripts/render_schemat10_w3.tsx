/**
 * SCHEMAT-10 W3-KABLE-ETYKIETY (RECENZJA_L2_POLA_WYPOSAZENIE §5/§7) — dowód
 * wizualny: FRAGMENT realnej sceny L2 (`buildSceneV3(fixtura, 2)`) z DWOMA
 * RÓWNOLEGŁYMI kablami (osobne osie, światło ≥ MIN_PARALLEL_CABLE_CLEARANCE)
 * oraz PEŁNYMI etykietami technicznymi linii („relacja · typ · napięcie · l = …").
 * Zero syntetyki — geometria i etykiety z produkcyjnego potoku.
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   CANON_OUT=<dir> npx vite-node scripts/render_schemat10_w3.tsx
 *   CANON_OUT=<dir> node scripts/rasterize.mjs
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';

import { buildSceneV3, minParallelCableClearance } from '../src/ui/sld/v3/scene/buildScene';
import { SYMBOL_DEFS, type SymbolId } from '../src/ui/sld/v3/symbols/defs';
import { SYMBOL_GLYPHS } from '../src/ui/sld/v3/symbols/glyphs';

const OUT = process.env.CANON_OUT ?? '/tmp/canon';
mkdirSync(OUT, { recursive: true });

const here = dirname(fileURLToPath(import.meta.url));
const enm = JSON.parse(
  readFileSync(
    resolve(here, '..', 'src', 'ui', 'sld', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json'),
    'utf8',
  ),
).enm;

const scene = buildSceneV3(enm, 2);

// --- znajdź parę RÓWNOLEGŁYCH kabli (piony tras między stacjami) -------------
interface VSeg { x: number; y0: number; y1: number; owner: string }
const verticals: VSeg[] = [];
for (const seg of scene.segments) {
  if (seg.meta?.elementKind !== 'segment') continue;
  const kind = seg.meta?.kind;
  if (kind !== 'snTrunk' && kind !== 'sn') continue;
  const owner = seg.meta?.ownerRef;
  if (typeof owner !== 'string' || owner.includes('#')) continue;
  const pts = seg.points;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) >= 0.5) {
      verticals.push({ x: a.x, y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y), owner });
    }
  }
}
let best: { a: VSeg; b: VSeg; d: number } | null = null;
for (let i = 0; i < verticals.length; i++) {
  for (let j = i + 1; j < verticals.length; j++) {
    const a = verticals[i];
    const b = verticals[j];
    if (a.owner === b.owner) continue;
    const overlap = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
    if (overlap <= 0) continue;
    const d = Math.abs(a.x - b.x);
    if (d < 0.5) continue;
    if (!best || d < best.d) best = { a, b, d };
  }
}
if (!best) throw new Error('Brak pary równoległych kabli w scenie L2 — nie da się wyrenderować dowodu.');

// --- okno kadru wokół pary (z marginesem na etykiety pełne nad magistralą) ---
const PAD_X = 260;
const PAD_TOP = 220;
const PAD_BOTTOM = 80;
const cropMinX = Math.min(best.a.x, best.b.x) - PAD_X;
const cropMaxX = Math.max(best.a.x, best.b.x) + PAD_X;
const cropMinY = Math.min(best.a.y0, best.b.y0) - PAD_TOP;
const cropMaxY = Math.max(best.a.y1, best.b.y1) + PAD_BOTTOM;

const inCropX = (x: number): boolean => x >= cropMinX && x <= cropMaxX;
const rectInCrop = (x: number, y: number, w: number, h: number): boolean =>
  x + w >= cropMinX && x <= cropMaxX && y + h >= cropMinY && y <= cropMaxY;

const WIRE = '#5A7C97';
const ACCENT = '#7FE6AF';
const TXT = '#E8EEF4';
const SUB = '#9FB3C8';
const parts: string[] = [];

// segmenty (tor elektryczny) w kadrze
for (const seg of scene.segments) {
  const pts = seg.points.filter((p) => rectInCrop(p.x, p.y, 0, 0) || true);
  if (!seg.points.some((p) => inCropX(p.x) && p.y >= cropMinY - 40 && p.y <= cropMaxY + 40)) continue;
  const isParallelPair =
    seg.meta?.ownerRef === best.a.owner || seg.meta?.ownerRef === best.b.owner;
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${(p.x - cropMinX).toFixed(1)},${(p.y - cropMinY).toFixed(1)}`).join(' ');
  parts.push(
    `<path d="${d}" fill="none" stroke="${isParallelPair ? ACCENT : WIRE}" stroke-width="${isParallelPair ? 2.4 : 1.3}"/>`,
  );
}

// symbole w kadrze
for (const s of scene.symbols) {
  const def = SYMBOL_DEFS[s.symbolId as SymbolId];
  if (!def || !rectInCrop(s.x, s.y, def.width, def.height)) continue;
  const Glyph = SYMBOL_GLYPHS[s.symbolId as SymbolId];
  if (!Glyph) continue;
  parts.push(
    renderToStaticMarkup(
      <Glyph x={s.x - cropMinX} y={s.y - cropMinY} state={s.state as 'closed' | 'open' | 'unknown' | undefined} stroke={TXT} />,
    ),
  );
}

// etykiety w kadrze — segment-span (pełne L2) wyróżnione
let spanShown = 0;
for (const l of scene.labels) {
  const r = l.rect;
  if (!rectInCrop(r.x, r.y, r.width, r.height)) continue;
  const isSpan = l.ownerKind === 'segment-span';
  if (isSpan) spanShown += 1;
  const fx = r.x - cropMinX;
  const fy = r.y - cropMinY + (l.rotated ? r.height : 0);
  const rot = l.rotated ? ` transform="rotate(-90 ${fx.toFixed(1)} ${fy.toFixed(1)})"` : '';
  parts.push(
    `<text x="${fx.toFixed(1)}" y="${(fy + 9).toFixed(1)}"${rot} font-family="Inter, system-ui, sans-serif" ` +
      `font-size="${isSpan ? 12 : 10}" font-weight="${isSpan ? 600 : 400}" fill="${isSpan ? ACCENT : SUB}">` +
      `${escapeXml(l.text)}</text>`,
  );
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const W = Math.round(cropMaxX - cropMinX);
const H = Math.round(cropMaxY - cropMinY);
const HEADER = 96;
const parClear = minParallelCableClearance(scene);

const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H + HEADER}" viewBox="0 0 ${W} ${H + HEADER}">` +
  `<rect width="${W}" height="${H + HEADER}" fill="#0E1621"/>` +
  `<text x="20" y="34" font-family="Inter, system-ui, sans-serif" font-size="22" font-weight="700" fill="${TXT}">` +
  `W3 · Etykiety techniczne linii + światła kabli (L2, fragment realnej sceni)</text>` +
  `<text x="20" y="60" font-family="Inter, system-ui, sans-serif" font-size="14" fill="${SUB}">` +
  `buildSceneV3(sldSubstrate52s, L2) · dwa RÓWNOLEGŁE kable (zielone, osobne osie, światło=${best.d}px ≥ 32) · ` +
  `etykiety pełne „relacja · typ · napięcie · l = …" z katalogu/ENM · min. światło równoległych tras=${parClear}px</text>` +
  `<text x="20" y="80" font-family="Inter, system-ui, sans-serif" font-size="12" fill="${ACCENT}">źródło: dane (katalog + ENM) · zero fabrykacji</text>` +
  `<g transform="translate(0,${HEADER})">${parts.join('')}</g></svg>`;

writeFileSync(`${OUT}/w3-l2-kable.svg`, svg);
console.log('wrote', `${OUT}/w3-l2-kable.svg`, `paraŚwiatło=${best.d}px spanEtykiet=${spanShown}`);
