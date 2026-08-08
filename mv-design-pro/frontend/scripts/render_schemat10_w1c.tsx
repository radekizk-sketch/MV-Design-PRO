/**
 * SCHEMAT-10 W1c (RECENZJA_MACIERZ_WYPOSAZENIA_2026-07 uwagi 1/2/3/9/10/15/16/17/18)
 * — dowód wizualny MACIERZY GENERATYWNEJ na L2. W przeciwieństwie do W1b (ręczna
 * lista 9 wariantów) macierz jest WYGENEROWANA z ENUMERACJI KATALOGU
 * (`fieldConfigurationsCatalog.json`, backend `enumerate_field_configurations`):
 * KAŻDY renderowalny przypadek (kanoniczny szablon + celka producencka) × wariant
 * stanu aparatu głównego staje się komórką macierzy. Komórki POGRUPOWANE
 * funkcjonalnie (uwaga 15), podpisane `config_id` (uwaga 10). Cała geometria z
 * REALNEGO potoku `buildSceneV3(fixtura, L2)` — zero fabrykacji renderu.
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   CANON_OUT=<dir> npx vite-node scripts/render_schemat10_w1c.tsx
 *   CANON_OUT=<dir> node scripts/rasterize.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';

import { buildSceneV3 } from '../src/ui/sld/v3/scene/buildScene';
import {
  buildW1cMatrixFixture,
  loadCatalog,
  type W1cCase,
} from '../src/ui/sld/v3/scene/__tests__/fixtures/w1cMatrixCatalog';
import { SYMBOL_DEFS, type SymbolId } from '../src/ui/sld/v3/symbols/defs';
import { SYMBOL_GLYPHS } from '../src/ui/sld/v3/symbols/glyphs';

const OUT = process.env.CANON_OUT ?? '/tmp/canon';
mkdirSync(OUT, { recursive: true });

const { enm, targets } = buildW1cMatrixFixture();
const scene = buildSceneV3(enm, 2);
const catalog = loadCatalog();

const LATERAL_SET = new Set<SymbolId>(['earthSwitch', 'voltageTransformer', 'surgeArrester']);

interface CellSym {
  readonly symbolId: SymbolId;
  readonly x: number;
  readonly y: number;
  readonly state?: 'closed' | 'open' | 'unknown';
}

function baySymbols(fieldRef: string): CellSym[] {
  return (scene.symbols as { symbolId: string; x: number; y: number; state?: string; meta?: { ownerRef?: unknown; apparatusSource?: unknown } }[])
    .filter((s) => s.meta?.ownerRef === fieldRef && s.meta?.apparatusSource != null)
    .map((s) => ({ symbolId: s.symbolId as SymbolId, x: s.x, y: s.y, state: s.state as CellSym['state'] }));
}

const CELL_W = 320;
const CELL_H = 360;
const COLS = 5;

function renderCell(testCase: W1cCase, fieldRef: string, cx: number, cy: number): string {
  const syms = baySymbols(fieldRef);
  const main = syms.filter((s) => !LATERAL_SET.has(s.symbolId));
  const axisX = main.length ? main[0].x + SYMBOL_DEFS[main[0].symbolId].width / 2 : 0;
  const mainTopY = main.length ? main[0].y : 0;
  const mainBottomY = main.length ? Math.max(...main.map((s) => s.y + SYMBOL_DEFS[s.symbolId].height)) : 0;

  const xs = [...syms.map((s) => s.x), ...syms.map((s) => s.x + SYMBOL_DEFS[s.symbolId].width)];
  const ys = [...syms.map((s) => s.y), ...syms.map((s) => s.y + SYMBOL_DEFS[s.symbolId].height)];
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const nativeW = Math.max(...xs) - minX || 1;
  const nativeH = Math.max(...ys) - minY || 1;
  const availW = CELL_W - 40;
  const availH = CELL_H - 132;
  const scale = Math.min(2.4, availW / nativeW, availH / nativeH);
  const stackW = nativeW * scale;
  const stackH = nativeH * scale;
  const gx = cx + (CELL_W - stackW) / 2;
  const gy = cy + 78 + (availH - stackH) / 2;

  const WIRE = '#5A7C97';
  const parts: string[] = [];
  if (main.length) {
    parts.push(
      `<line x1="${axisX - minX}" y1="${mainTopY - minY}" x2="${axisX - minX}" y2="${mainBottomY - minY}" ` +
        `stroke="${WIRE}" stroke-width="1.4"/>`,
    );
  }
  for (const s of syms) {
    const Glyph = SYMBOL_GLYPHS[s.symbolId];
    parts.push(renderToStaticMarkup(<Glyph x={s.x - minX} y={s.y - minY} state={s.state} stroke="#E8EEF4" />));
  }

  const sourceColor = testCase.source === 'kanoniczny' ? '#7FE6AF' : '#E6C27F';
  const sourceLabel = testCase.source === 'kanoniczny' ? 'kanon' : 'producent';
  const stateLabel = testCase.state ? (testCase.state === 'zamkniety' ? 'zamknięty' : 'otwarty') : 'stały';
  const shortName = testCase.name.length > 44 ? testCase.name.slice(0, 42) + '…' : testCase.name;
  const cfg = testCase.configId.length > 40 ? testCase.configId.slice(0, 38) + '…' : testCase.configId;

  return (
    `<rect x="${cx + 6}" y="${cy + 6}" width="${CELL_W - 12}" height="${CELL_H - 12}" rx="9" fill="#111C28" stroke="#25384A"/>` +
    `<text x="${cx + CELL_W / 2}" y="${cy + 26}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="12.5" font-weight="600" fill="#E8EEF4">${shortName}</text>` +
    `<text x="${cx + CELL_W / 2}" y="${cy + 44}" text-anchor="middle" font-family="ui-monospace, monospace" font-size="10" fill="#7C93A8">${cfg}</text>` +
    `<text x="${cx + CELL_W / 2}" y="${cy + 60}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="10.5" fill="#9FB3C8">stan: ${stateLabel}</text>` +
    `<g transform="translate(${gx},${gy}) scale(${scale})">${parts.join('')}</g>` +
    `<rect x="${cx + CELL_W / 2 - 44}" y="${cy + CELL_H - 34}" width="88" height="20" rx="10" fill="#0E2018" stroke="${sourceColor}"/>` +
    `<text x="${cx + CELL_W / 2}" y="${cy + CELL_H - 20}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="11" fill="${sourceColor}">${sourceLabel} · dane</text>`
  );
}

const GROUP_LABEL: Record<string, string> = {
  liniowe: 'Pola liniowe',
  transformatorowe: 'Pola transformatorowe',
  OZE: 'Pola źródłowe OZE',
  sprzeglowe: 'Pola sprzęgłowe',
  pomiarowe: 'Pola pomiarowe',
  specjalne: 'Pola specjalne (rezerwowe / potrzeb własnych)',
};
const GROUP_ORDER: readonly string[] = [
  'liniowe',
  'transformatorowe',
  'OZE',
  'sprzeglowe',
  'pomiarowe',
  'specjalne',
];

let y = 108;
let body = '';
for (const group of GROUP_ORDER) {
  const groupTargets = targets.filter((t) => t.case.group === group);
  if (groupTargets.length === 0) continue;
  body +=
    `<text x="20" y="${y}" font-family="Inter, system-ui, sans-serif" font-size="17" font-weight="700" fill="#7FE6AF">` +
    `${GROUP_LABEL[group]} · ${groupTargets.length}</text>`;
  const sectionTop = y + 16;
  groupTargets.forEach((t, i) => {
    const cx = 20 + (i % COLS) * CELL_W;
    const cy = sectionTop + Math.floor(i / COLS) * CELL_H;
    body += renderCell(t.case, t.fieldRef, cx, cy);
  });
  const rows = Math.ceil(groupTargets.length / COLS);
  y = sectionTop + rows * CELL_H + 34;
}

const WIDTH = COLS * CELL_W + 40;
const HEIGHT = y + 20;

const gaps = catalog.gaps;
const gapLine =
  `packi bez celek: ${gaps.manufacturer_packs_without_cell_configurations.length} · ` +
  `typy pól bez szablonu: ${gaps.field_types_without_template.length} · ` +
  `celki nie-renderowalne: ${gaps.producer_non_renderable_cells.length}`;

const title =
  `<text x="20" y="34" font-family="Inter, system-ui, sans-serif" font-size="23" font-weight="700" fill="#E8EEF4">` +
  `W1c · Macierz generatywna wyposażenia pól (L2) — z KATALOGU konfiguracji (RECENZJA_MACIERZ §16/17)</text>` +
  `<text x="20" y="60" font-family="Inter, system-ui, sans-serif" font-size="14" fill="#9FB3C8">` +
  `${targets.length} przypadków wygenerowanych z enumeracji (kanoniczne szablony + celki producenckie) · grupy funkcjonalne (§15) · ` +
  `podpis = config_id (§10) · realny potok buildSceneV3(L2)</text>` +
  `<text x="20" y="82" font-family="Inter, system-ui, sans-serif" font-size="12.5" fill="#7C93A8">` +
  `Rejestr braków katalogu — ${gapLine}</text>`;

const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">` +
  `<rect width="${WIDTH}" height="${HEIGHT}" fill="#0E1621"/>${title}${body}</svg>`;

writeFileSync(`${OUT}/w1c-l2-macierz-gen.svg`, svg);
console.log('wrote', `${OUT}/w1c-l2-macierz-gen.svg`, `przypadki=${targets.length}`);
