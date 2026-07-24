/**
 * SCHEMAT-10 KROPKA-WEZLOWA (V12K-150, spec §22.1 / IEC 60617) — dowód
 * wizualny, że kropka węzłowa odczepu lateralnego (ES/VT/SA) jest RENDEROWANA
 * w SCENIE PRODUKCYJNEJ (`buildSceneV3`), nie tylko w zrzucie W1b. Renderuje
 * ZBLIŻENIE pól z odczepem uziemnika (ES), ogranicznika (SA) i przekładnika
 * napięciowego (VT) z realnego potoku `buildSceneV3(macierz, L2)`. Kropki to
 * symbole `junction` sceny (glif `SYMBOL_GLYPHS.junction`) w porcie odczepu.
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   CANON_OUT=<dir> npx vite-node scripts/render_schemat10_kropka.tsx
 *   CANON_OUT=<dir> node scripts/rasterize.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';

import { buildSceneV3 } from '../src/ui/sld/v3/scene/buildScene';
import { SYMBOL_DEFS, type SymbolId } from '../src/ui/sld/v3/symbols/defs';
import { SYMBOL_GLYPHS } from '../src/ui/sld/v3/symbols/glyphs';
import { buildW1MatrixFixture } from '../src/ui/sld/v3/scene/__tests__/fixtures/w1MatrixVariants';

const OUT = process.env.CANON_OUT ?? '/tmp/canon';
mkdirSync(OUT, { recursive: true });

const { enm, targets } = buildW1MatrixFixture();
const scene = buildSceneV3(enm, 2);

const CELLS: readonly { readonly variantId: string; readonly title: string }[] = [
  { variantId: 'linia-cb-ct-es', title: 'Pole liniowe · odczep UZIEMNIKA (ES)' },
  { variantId: 'linia-cb-ct-sa', title: 'Pole liniowe · odczep OGRANICZNIKA (SA → ziemia)' },
  { variantId: 'linia-ct-vt', title: 'Pole liniowe · odczep VT + uziemnik (2 węzły)' },
];

const CELL_W = 520;
const CELL_H = 560;
const JDEF = SYMBOL_DEFS.junction;

interface SceneSym {
  readonly symbolId: SymbolId;
  readonly x: number;
  readonly y: number;
  readonly state?: 'closed' | 'open' | 'unknown';
  readonly meta?: { readonly ownerRef?: unknown; readonly testId?: unknown };
}

function fieldSymbols(fieldRef: string): SceneSym[] {
  // symbole pola (ownerRef == fieldRef) + kropki lateralne tego pola (testId
  // niesie współrzędną węzła; przypisujemy je po współrzędnej odczepu).
  const own = scene.symbols.filter((s) => (s.meta as { ownerRef?: unknown })?.ownerRef === fieldRef) as SceneSym[];
  const lateralSegs = scene.segments.filter((s) => String((s.meta as { ownerRef?: unknown })?.ownerRef ?? '').startsWith(fieldRef + '#lateral-'));
  const tapKeys = new Set(lateralSegs.map((s) => `${s.points[0].x},${s.points[0].y}`));
  const dots = (scene.symbols as SceneSym[]).filter(
    (s) => s.symbolId === 'junction' && tapKeys.has(`${s.x + JDEF.width / 2},${s.y + JDEF.height / 2}`),
  );
  return [...own, ...dots];
}

function fieldSegments(fieldRef: string): { points: readonly { x: number; y: number }[] }[] {
  return (scene.segments as { points: { x: number; y: number }[]; meta?: { ownerRef?: unknown } }[])
    .filter((s) => String(s.meta?.ownerRef ?? '').startsWith(fieldRef + '#'))
    .map((s) => ({ points: s.points }));
}

function renderCell(title: string, fieldRef: string, cx: number, cy: number): string {
  const syms = fieldSymbols(fieldRef);
  const segs = fieldSegments(fieldRef);
  const allPts = [
    ...syms.flatMap((s) => [{ x: s.x, y: s.y }, { x: s.x + SYMBOL_DEFS[s.symbolId].width, y: s.y + SYMBOL_DEFS[s.symbolId].height }]),
    ...segs.flatMap((s) => s.points),
  ];
  const minX = Math.min(...allPts.map((p) => p.x));
  const minY = Math.min(...allPts.map((p) => p.y));
  const nativeW = Math.max(...allPts.map((p) => p.x)) - minX;
  const nativeH = Math.max(...allPts.map((p) => p.y)) - minY;
  const availW = CELL_W - 60;
  const availH = CELL_H - 120;
  const scale = Math.min(4, availW / nativeW, availH / nativeH);
  const gx = cx + (CELL_W - nativeW * scale) / 2;
  const gy = cy + 70;

  const WIRE = '#5A7C97';
  const parts: string[] = [];
  // Przewody pola (tor + odczepy).
  for (const seg of segs) {
    const d = seg.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x - minX} ${p.y - minY}`).join(' ');
    parts.push(`<path d="${d}" fill="none" stroke="${WIRE}" stroke-width="1.4"/>`);
  }
  // Glify: aparaty + kropki `junction` (z realnej sceny, na wierzchu przewodu).
  for (const s of syms) {
    const Glyph = SYMBOL_GLYPHS[s.symbolId];
    const stroke = s.symbolId === 'junction' ? '#7FE6AF' : '#E8EEF4';
    parts.push(renderToStaticMarkup(<Glyph x={s.x - minX} y={s.y - minY} state={s.state} stroke={stroke} />));
  }
  return (
    `<rect x="${cx + 8}" y="${cy + 8}" width="${CELL_W - 16}" height="${CELL_H - 16}" rx="10" fill="#111C28" stroke="#25384A"/>` +
    `<text x="${cx + CELL_W / 2}" y="${cy + 34}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="15" font-weight="600" fill="#E8EEF4">${title}</text>` +
    `<text x="${cx + CELL_W / 2}" y="${cy + 54}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="12" fill="#7FE6AF">kropka węzłowa = odgałęzienie od toru (IEC 60617)</text>` +
    `<g transform="translate(${gx},${gy}) scale(${scale})">${parts.join('')}</g>`
  );
}

const targetByVariant = new Map(targets.map((t) => [t.variant.id, t]));
let body = '';
CELLS.forEach((cell, i) => {
  const target = targetByVariant.get(cell.variantId);
  if (!target) return;
  body += renderCell(cell.title, target.fieldRef, 20 + i * CELL_W, 90);
});

const WIDTH = CELLS.length * CELL_W + 40;
const HEIGHT = 90 + CELL_H + 20;
const title =
  `<text x="20" y="38" font-family="Inter, system-ui, sans-serif" font-size="24" font-weight="700" fill="#E8EEF4">` +
  `KROPKA-WĘZŁOWA · odczepy pól (ES/SA/VT) na L2 — scena produkcyjna buildSceneV3 (V12K-150)</text>` +
  `<text x="20" y="66" font-family="Inter, system-ui, sans-serif" font-size="15" fill="#9FB3C8">` +
  `Każde elektryczne odgałęzienie od osi toru renderuje KROPKĘ WĘZŁOWĄ (IEC 60617); skrzyżowanie bez połączenia — bez kropki. ` +
  `Węzeł z DANYCH odczepu (points[0] na osi), nie z heurystyki przecięć.</text>`;
const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">` +
  `<rect width="${WIDTH}" height="${HEIGHT}" fill="#0E1621"/>${title}${body}</svg>`;

writeFileSync(`${OUT}/kropka-l2-wezly.svg`, svg);
console.log('wrote', `${OUT}/kropka-l2-wezly.svg`, `pola=${CELLS.length}`);
