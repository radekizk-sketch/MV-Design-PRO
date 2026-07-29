/**
 * SCHEMAT-10 W1 (RECENZJA_L2 §1/§6/§12/§15/§20, V12K-145) — dowód wizualny
 * MACIERZY WYPOSAŻENIA POLA na L2. Renderuje 6 wariantów §20 (część W1) —
 * REALNE stosy aparatów z potoku produkcyjnego `buildSceneV3(fixtura, L2)`
 * (fixtura `w1MatrixVariants`, wstrzyknięte `primary_devices` w sieć
 * referencyjną), każdy powiększony ×3 z podpisem PL i znacznikiem źródła
 * „dane". Dowód: RÓŻNE konfiguracje ⇒ RÓŻNE stosy (koniec jednego szablonu),
 * głowica na styku kabla (§6), uziemnik/SA BOCZNIE od toru (§15/§18.1).
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   CANON_OUT=<dir> npx vite-node scripts/render_schemat10_w1.tsx
 *   CANON_OUT=<dir> node scripts/rasterize.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';

import { buildSceneV3 } from '../src/ui/sld/v3/scene/buildScene';
import { SYMBOL_DEFS, type SymbolId } from '../src/ui/sld/v3/symbols/defs';
import { SYMBOL_GLYPHS } from '../src/ui/sld/v3/symbols/glyphs';
import {
  buildW1MatrixFixture,
  type W1Variant,
} from '../src/ui/sld/v3/scene/__tests__/fixtures/w1MatrixVariants';

const OUT = process.env.CANON_OUT ?? '/tmp/canon';
mkdirSync(OUT, { recursive: true });

const { enm, targets } = buildW1MatrixFixture();
const scene = buildSceneV3(enm, 2);

interface CellSym {
  readonly symbolId: SymbolId;
  readonly x: number;
  readonly y: number;
  readonly state?: 'closed' | 'open' | 'unknown';
  readonly source: string;
}

function baySymbols(fieldRef: string): CellSym[] {
  return scene.symbols
    .filter((s) => s.meta?.ownerRef === fieldRef)
    .map((s) => ({
      symbolId: s.symbolId as SymbolId,
      x: s.x,
      y: s.y,
      state: s.state as CellSym['state'],
      source: String(s.meta?.apparatusSource ?? ''),
    }));
}

const CELL_W = 460;
const CELL_H = 500;
const COLS = 3;
const rows = Math.ceil(targets.length / COLS);
const WIDTH = COLS * CELL_W + 40;
const HEIGHT = rows * CELL_H + 130;

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

const STACK_TOP = 48; // rezerwa na tytuł komórki
const STACK_BOTTOM = 64; // rezerwa na podpis + badge

function renderCell(variant: W1Variant, fieldRef: string, cx: number, cy: number): string {
  const syms = baySymbols(fieldRef);
  const minX = Math.min(...syms.map((s) => s.x));
  const minY = Math.min(...syms.map((s) => s.y));
  const maxX = Math.max(...syms.map((s) => s.x + SYMBOL_DEFS[s.symbolId].width));
  const maxY = Math.max(...syms.map((s) => s.y + SYMBOL_DEFS[s.symbolId].height));
  const nativeW = maxX - minX;
  const nativeH = maxY - minY;
  const availW = CELL_W - 48;
  const availH = CELL_H - STACK_TOP - STACK_BOTTOM;
  // Fit-scale: cały stos (z lateralami) MIEŚCI się w komórce (cap ×3).
  const scale = Math.min(3, availW / nativeW, availH / nativeH);
  const stackW = nativeW * scale;
  const stackH = nativeH * scale;
  const gx = cx + (CELL_W - stackW) / 2;
  const gy = cy + STACK_TOP + (availH - stackH) / 2;
  const allData = syms.every((s) => s.source === 'dane');
  const badge = allData ? 'dane' : 'mieszane';
  const glyphs = syms
    .map((s) => {
      const Glyph = SYMBOL_GLYPHS[s.symbolId];
      return renderToStaticMarkup(
        <Glyph x={s.x - minX} y={s.y - minY} state={s.state} stroke="#E8EEF4" />,
      );
    })
    .join('');
  const stackSummary = syms.map((s) => PL_NAME[s.symbolId] ?? s.symbolId).join(' · ');
  return (
    `<rect x="${cx + 8}" y="${cy + 8}" width="${CELL_W - 16}" height="${CELL_H - 16}" rx="10" ` +
    `fill="#111C28" stroke="#25384A"/>` +
    `<text x="${cx + CELL_W / 2}" y="${cy + 30}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" ` +
    `font-size="17" font-weight="600" fill="#E8EEF4">${variant.label}</text>` +
    `<g transform="translate(${gx},${gy}) scale(${scale})">${glyphs}</g>` +
    `<text x="${cx + CELL_W / 2}" y="${cy + CELL_H - 44}" text-anchor="middle" ` +
    `font-family="Inter, system-ui, sans-serif" font-size="12" fill="#9FB3C8">${stackSummary}</text>` +
    `<rect x="${cx + CELL_W / 2 - 34}" y="${cy + CELL_H - 32}" width="68" height="22" rx="11" ` +
    `fill="#123524" stroke="#2E7D57"/>` +
    `<text x="${cx + CELL_W / 2}" y="${cy + CELL_H - 16}" text-anchor="middle" ` +
    `font-family="Inter, system-ui, sans-serif" font-size="12" fill="#7FE6AF">źródło: ${badge}</text>`
  );
}

const cells = targets
  .map((t, i) => {
    const cx = 20 + (i % COLS) * CELL_W;
    const cy = 80 + Math.floor(i / COLS) * CELL_H;
    return renderCell(t.variant, t.fieldRef, cx, cy);
  })
  .join('');

const title =
  `<text x="20" y="34" font-family="Inter, system-ui, sans-serif" font-size="24" font-weight="700" fill="#E8EEF4">` +
  `W1 · Macierz wyposażenia pola (L2) — schemat = odwzorowanie konfiguracji kreatora (RECENZJA_L2 §1/§20)</text>` +
  `<text x="20" y="62" font-family="Inter, system-ui, sans-serif" font-size="15" fill="#9FB3C8">` +
  `Realny potok buildSceneV3(L2): 4 pola liniowe + 2 transformatorowe — RÓŻNE konfiguracje ⇒ RÓŻNE stosy · ` +
  `głowica na styku kabla (§6) · uziemnik/ogranicznik bocznie (§15) · stan z danych per aparat</text>`;

const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">` +
  `<rect width="${WIDTH}" height="${HEIGHT}" fill="#0E1621"/>${title}${cells}</svg>`;

writeFileSync(`${OUT}/w1-l2-warianty.svg`, svg);
console.log('wrote', `${OUT}/w1-l2-warianty.svg`, `warianty=${targets.length}`);
