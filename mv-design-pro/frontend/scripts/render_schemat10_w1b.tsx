/**
 * SCHEMAT-10 W1b (RECENZJA_MACIERZ_WYPOSAZENIA_2026-07 uwagi 4/5/6/11-15) —
 * dowód wizualny SEMANTYKI TORU na L2. Renderuje macierz wariantów §20 (część
 * W1b) POGRUPOWANĄ funkcjonalnie (liniowe / transformatorowe, uwaga 15) z
 * REALNEGO potoku `buildSceneV3(fixtura, L2)`. W przeciwieństwie do renderu W1
 * (same glify) — W1b rysuje PEŁNĄ geometrię toru każdego pola z danych sceny:
 *  - oś toru głównego (ciągła, spina aparaty — uwaga 4/6),
 *  - GŁOWICĘ na styku kabla (kikut kablowy pod głowicą, uwaga 4),
 *  - ODCZEP boczny uziemnika/ogranicznika z JAWNYM WĘZŁEM na osi toru
 *    (kropka przyłączenia — uwaga 5), SA jako odgałęzienie DO ZIEMI które nie
 *    przerywa toru (uwaga 6),
 *  - STANY łączników (otwarty/zamknięty — glif, uwaga 13) i KROTNOŚCI
 *    (2×uziemnik, CT+VT — uwaga 14).
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   CANON_OUT=<dir> npx vite-node scripts/render_schemat10_w1b.tsx
 *   CANON_OUT=<dir> node scripts/rasterize.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';

import { buildSceneV3 } from '../src/ui/sld/v3/scene/buildScene';
import { SYMBOL_DEFS, type SymbolId } from '../src/ui/sld/v3/symbols/defs';
import { SYMBOL_GLYPHS } from '../src/ui/sld/v3/symbols/glyphs';
import {
  buildW1MatrixFixture,
  W1_VARIANTS,
  type W1Group,
  type W1Variant,
} from '../src/ui/sld/v3/scene/__tests__/fixtures/w1MatrixVariants';

const OUT = process.env.CANON_OUT ?? '/tmp/canon';
mkdirSync(OUT, { recursive: true });

const { enm, targets } = buildW1MatrixFixture();
const scene = buildSceneV3(enm, 2);

const LATERAL_SET = new Set<SymbolId>(['earthSwitch', 'voltageTransformer', 'surgeArrester']);

interface CellSym {
  readonly symbolId: SymbolId;
  readonly x: number;
  readonly y: number;
  readonly state?: 'closed' | 'open' | 'unknown';
}

function baySymbols(fieldRef: string): CellSym[] {
  return scene.symbols
    .filter((s) => s.meta?.ownerRef === fieldRef)
    .map((s) => ({
      symbolId: s.symbolId as SymbolId,
      x: s.x,
      y: s.y,
      state: s.state as CellSym['state'],
    }));
}

interface CellSeg {
  readonly points: readonly { readonly x: number; readonly y: number }[];
  readonly isLateral: boolean;
}

function baySegments(fieldRef: string): CellSeg[] {
  return (scene.segments as { points: { x: number; y: number }[]; meta?: { ownerRef?: unknown } }[])
    .filter((s) => String(s.meta?.ownerRef ?? '').startsWith(fieldRef + '#lateral-'))
    .map((s) => ({ points: s.points, isLateral: true }));
}

const CELL_W = 460;
const CELL_H = 520;
const COLS = 3;

/** Krótkie polskie nazwy aparatów do podpisu stosu (czytelność §13). */
const PL_NAME: Partial<Record<SymbolId, string>> = {
  loadBreakSwitch: 'rozłącznik',
  disconnector: 'odłącznik',
  breaker: 'wyłącznik',
  currentTransformer: 'CT',
  voltageTransformer: 'VT',
  fuseSwitch: 'bezpiecznik',
  cableHead: 'głowica',
  transformer2W: 'transformator',
  earthSwitch: 'uziemnik',
  surgeArrester: 'ogranicznik',
};

const STACK_TOP = 48;
const STACK_BOTTOM = 74;
const CABLE_STUB = 18; // kikut kablowy pod głowicą (dowód „styk kabla", uwaga 4)

function renderCell(variant: W1Variant, fieldRef: string, cx: number, cy: number): string {
  const syms = baySymbols(fieldRef);
  const segs = baySegments(fieldRef);
  const main = syms.filter((s) => !LATERAL_SET.has(s.symbolId));
  const head = main.find((s) => s.symbolId === 'cableHead');
  const axisX = main[0].x + SYMBOL_DEFS[main[0].symbolId].width / 2;
  const mainTopY = main[0].y;
  const mainBottomY = Math.max(...main.map((s) => s.y + SYMBOL_DEFS[s.symbolId].height));

  // Crop obejmuje symbole, odczepy i kikut kablowy.
  const segPts = segs.flatMap((s) => s.points);
  const xs = [...syms.map((s) => s.x), ...syms.map((s) => s.x + SYMBOL_DEFS[s.symbolId].width), ...segPts.map((p) => p.x)];
  const ys = [
    ...syms.map((s) => s.y),
    ...syms.map((s) => s.y + SYMBOL_DEFS[s.symbolId].height),
    ...segPts.map((p) => p.y),
    mainBottomY + (head ? CABLE_STUB : 0),
  ];
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const nativeW = Math.max(...xs) - minX;
  const nativeH = Math.max(...ys) - minY;
  const availW = CELL_W - 48;
  const availH = CELL_H - STACK_TOP - STACK_BOTTOM;
  const scale = Math.min(3, availW / nativeW, availH / nativeH);
  const stackW = nativeW * scale;
  const stackH = nativeH * scale;
  const gx = cx + (CELL_W - stackW) / 2;
  const gy = cy + STACK_TOP + (availH - stackH) / 2;

  const ACCENT = '#7FE6AF';
  const WIRE = '#5A7C97';
  const parts: string[] = [];

  // 1) Oś toru głównego (ciągła) — spina aparaty od góry do portu kablowego
  //    głowicy (uwaga 4/6: tor jest ciągły, aparaty boczne go nie przerywają).
  parts.push(
    `<line x1="${axisX - minX}" y1="${mainTopY - minY}" x2="${axisX - minX}" y2="${mainBottomY - minY}" ` +
      `stroke="${WIRE}" stroke-width="1.4"/>`,
  );

  // 2) Kikut kablowy pod głowicą (dowód „głowica = zakończenie kabla", uwaga 4).
  if (head) {
    const hy = head.y + SYMBOL_DEFS.cableHead.height - minY;
    parts.push(
      `<line x1="${axisX - minX}" y1="${hy}" x2="${axisX - minX}" y2="${hy + CABLE_STUB}" ` +
        `stroke="${ACCENT}" stroke-width="1.8" stroke-dasharray="4 3"/>`,
    );
  }

  // 3) Odczepy boczne (uziemnik/ogranicznik) + JAWNY WĘZEŁ na osi toru
  //    (kropka przyłączenia — uwaga 5; SA do ziemi, uwaga 6).
  for (const seg of segs) {
    const p0 = seg.points[0];
    const p1 = seg.points[seg.points.length - 1];
    parts.push(
      `<line x1="${p0.x - minX}" y1="${p0.y - minY}" x2="${p1.x - minX}" y2="${p1.y - minY}" ` +
        `stroke="${WIRE}" stroke-width="1.4"/>`,
    );
    // Węzeł = kropka przyłączenia na osi toru (start odczepu).
    parts.push(`<circle cx="${p0.x - minX}" cy="${p0.y - minY}" r="2.6" fill="${ACCENT}"/>`);
  }

  // 4) Glify aparatów (na wierzchu geometrii).
  for (const s of syms) {
    const Glyph = SYMBOL_GLYPHS[s.symbolId];
    parts.push(renderToStaticMarkup(<Glyph x={s.x - minX} y={s.y - minY} state={s.state} stroke="#E8EEF4" />));
  }

  const stackSummary = syms.map((s) => PL_NAME[s.symbolId] ?? s.symbolId).join(' · ');
  return (
    `<rect x="${cx + 8}" y="${cy + 8}" width="${CELL_W - 16}" height="${CELL_H - 16}" rx="10" ` +
    `fill="#111C28" stroke="#25384A"/>` +
    `<text x="${cx + CELL_W / 2}" y="${cy + 30}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" ` +
    `font-size="16" font-weight="600" fill="#E8EEF4">${variant.label}</text>` +
    `<g transform="translate(${gx},${gy}) scale(${scale})">${parts.join('')}</g>` +
    `<text x="${cx + CELL_W / 2}" y="${cy + CELL_H - 50}" text-anchor="middle" ` +
    `font-family="Inter, system-ui, sans-serif" font-size="12" fill="#9FB3C8">${stackSummary}</text>` +
    `<rect x="${cx + CELL_W / 2 - 40}" y="${cy + CELL_H - 38}" width="80" height="22" rx="11" ` +
    `fill="#123524" stroke="#2E7D57"/>` +
    `<text x="${cx + CELL_W / 2}" y="${cy + CELL_H - 22}" text-anchor="middle" ` +
    `font-family="Inter, system-ui, sans-serif" font-size="12" fill="#7FE6AF">źródło: dane</text>`
  );
}

const GROUP_LABEL: Record<W1Group, string> = {
  liniowe: 'Pola liniowe',
  transformatorowe: 'Pola transformatorowe',
};
const GROUP_ORDER: readonly W1Group[] = ['liniowe', 'transformatorowe'];

const targetByVariant = new Map(targets.map((t) => [t.variant.id, t]));

let y = 96;
let body = '';
for (const group of GROUP_ORDER) {
  const variants = W1_VARIANTS.filter((v) => v.group === group);
  if (variants.length === 0) continue;
  body +=
    `<text x="20" y="${y}" font-family="Inter, system-ui, sans-serif" font-size="18" font-weight="700" ` +
    `fill="#7FE6AF">${GROUP_LABEL[group]} · ${variants.length}</text>`;
  const sectionTop = y + 18;
  variants.forEach((v, i) => {
    const target = targetByVariant.get(v.id);
    if (!target) return;
    const cx = 20 + (i % COLS) * CELL_W;
    const cy = sectionTop + Math.floor(i / COLS) * CELL_H;
    body += renderCell(v, target.fieldRef, cx, cy);
  });
  const rows = Math.ceil(variants.length / COLS);
  y = sectionTop + rows * CELL_H + 40;
}

const WIDTH = COLS * CELL_W + 40;
const HEIGHT = y + 20;

const title =
  `<text x="20" y="34" font-family="Inter, system-ui, sans-serif" font-size="24" font-weight="700" fill="#E8EEF4">` +
  `W1b · Semantyka toru pola (L2) — głowica na kablu · węzeł uziemnika · ogranicznik do ziemi (RECENZJA_MACIERZ §4/5/6)</text>` +
  `<text x="20" y="62" font-family="Inter, system-ui, sans-serif" font-size="15" fill="#9FB3C8">` +
  `Realny potok buildSceneV3(L2) · raster kontraktowy (uwaga 11-12) · ciągła oś toru · głowica = zakończenie kabla (kikut) · ` +
  `odczep z JAWNYM WĘZŁEM na torze (kropka) · SA do ziemi bez przerwania toru · stany i krotności z danych (uwaga 13-14)</text>`;

const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">` +
  `<rect width="${WIDTH}" height="${HEIGHT}" fill="#0E1621"/>${title}${body}</svg>`;

writeFileSync(`${OUT}/w1b-l2-macierz.svg`, svg);
console.log('wrote', `${OUT}/w1b-l2-macierz.svg`, `warianty=${targets.length}`);
