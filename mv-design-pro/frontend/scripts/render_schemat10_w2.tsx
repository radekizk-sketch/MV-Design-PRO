/**
 * SCHEMAT-10 W2 (RECENZJA_L2 §3/§4; GS-4b / audyt Z2, V12K) — dowód wizualny
 * TORU DER wg REALNEJ strony przyłączenia na L2. Dwa panele stacji z
 * produkcyjnego `composeStation` (ten sam potok measure→bands→columns→compose
 * co scena):
 *  - WARIANT A (`connectionSide==='nn'`): źródło ZA TR na szynie nN — rząd nN
 *    (`#der-row-bus`/`#der-row-trunk`), obok strzałki odbioru; szyna nN pod TR;
 *  - WARIANT B (`connectionSide==='sn'`): POLE ŹRÓDŁOWE od szyny SN
 *    (`#sn-source-descent`) — odczep od szyny SN do symbolu źródła, ZERO
 *    renderu za TR (naprawa luki lustrzanej Z2).
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   CANON_OUT=<dir> npx vite-node scripts/render_schemat10_w2.tsx
 *   CANON_OUT=<dir> node scripts/rasterize.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';

import { GRID } from '../src/ui/sld/v3/core/grid';
import { SYMBOL_DEFS } from '../src/ui/sld/v3/symbols/defs';
import { SYMBOL_GLYPHS } from '../src/ui/sld/v3/symbols/glyphs';
import { FIELD_ROLE } from '../src/ui/sld/v2/domain/apparatusContracts';
import type { MiniBlockBayDescriptor } from '../src/ui/sld/v2/renderer/MiniBlockRmuRenderer';
import { stationBlockHeight, type StationMeasureInput } from '../src/ui/sld/v3/layout/measure';
import { computeBands } from '../src/ui/sld/v3/layout/bands';
import { computeColumns, type ComputeColumnsInput } from '../src/ui/sld/v3/layout/columns';
import { colorSegmentLabelRows, computeSegmentLabelSlotX } from '../src/ui/sld/v3/layout/segments';
import {
  composeStation,
  type ComposeStationInput,
  type StationComposition,
} from '../src/ui/sld/v3/compose/station';

const OUT = process.env.CANON_OUT ?? '/tmp/canon';
mkdirSync(OUT, { recursive: true });

function makeBay(fieldRole: MiniBlockBayDescriptor['fieldRole'], index: number): MiniBlockBayDescriptor {
  return { bayRef: `bay-${index}`, fieldRole, designation: `Pole ${index}`, hasMissingRequiredDevice: false };
}

function buildComposeInput(station: StationMeasureInput): ComposeStationInput {
  const rows = colorSegmentLabelRows(computeSegmentLabelSlotX([station], [null]));
  const bandsResult = computeBands(
    [{ incomingSegmentLabelText: null, portCaptionHeight: 0, stationBlockHeight: stationBlockHeight(station), nameBandHeight: 48 }],
    rows.rowCount,
  );
  const input: ComputeColumnsInput = {
    stations: [station],
    incomingSegmentLabelTexts: [null],
    nameSlotBand: bandsResult.bands.B5,
    segmentSlotBand: bandsResult.bands.B1,
  };
  const { columns } = computeColumns(input);
  const column = columns[0];
  return {
    station,
    column: { x: column.x, width: column.width, tapX: column.tapX },
    busAxisY: bandsResult.bands.B2.y,
    blockTopY: bandsResult.bands.B4.y,
    nameSlot: column.nameSlot,
    hasLvSection: true,
  };
}

const snBays = [makeBay(FIELD_ROLE.RMU_LINE, 0), makeBay(FIELD_ROLE.RMU_TRANSFORMER, 1)];

const stationA: StationMeasureInput = {
  id: 'w2-A', name: 'Stacja W2-A (DER na nN)', stationCode: 'S-A', transformerRatedKva: 630,
  stationTypeLabel: 'stacja przelotowa', snBays, nnVoltageKv: 0.4,
  aggregatedLvLoad: { pMw: 0.3, qMvar: 0.1, count: 3 },
  derSources: [{ id: 'gen-nn-1', kind: 'pv', ratedPower: 0.5, connectionSide: 'nn' }],
};

const stationB: StationMeasureInput = {
  id: 'w2-B', name: 'Stacja W2-B (DER na SN)', stationCode: 'S-B', transformerRatedKva: 630,
  stationTypeLabel: 'stacja przelotowa', snBays, nnVoltageKv: 0.4,
  aggregatedLvLoad: { pMw: 0.3, qMvar: 0.1, count: 3 },
  derSources: [{ id: 'gen-sn-1', kind: 'pv', ratedPower: 0.5, connectionSide: 'sn' }],
};

const compA = composeStation(buildComposeInput(stationA));
const compB = composeStation(buildComposeInput(stationB));

const PANEL_W = 760;
const PANEL_H = 620;

/** Kolor odcinka wg semantyki ownerRef (dowód: rozróżnialne szyny/pola). */
function segColor(ownerRef: string): string {
  if (ownerRef.endsWith('#sn-bus')) return '#4C9BE8'; // szyna SN
  if (ownerRef.endsWith('#lv-bus') || ownerRef.includes('#lv-drop') || ownerRef.includes('#lv-load')) return '#39C0A8'; // szyna/odczepy nN
  if (ownerRef.endsWith('#sn-source-descent')) return '#E8A94C'; // POLE ŹRÓDŁOWE SN (Z2)
  if (ownerRef.includes('#der-row')) return '#B48CE8'; // rząd nN DER
  return '#8FA8BE';
}

function renderComposition(comp: StationComposition, cx: number, cy: number, title: string, subtitle: string): string {
  const xs = [...comp.symbols.flatMap((s) => [s.x, s.x + SYMBOL_DEFS[s.symbolId].width]), ...comp.segments.flatMap((s) => s.points.map((p) => p.x))];
  const ys = [...comp.symbols.flatMap((s) => [s.y, s.y + SYMBOL_DEFS[s.symbolId].height]), ...comp.segments.flatMap((s) => s.points.map((p) => p.y))];
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const nativeW = Math.max(...xs) - minX;
  const nativeH = Math.max(...ys) - minY;
  const availW = PANEL_W - 80;
  const availH = PANEL_H - 220; // rezerwa: tytuł u góry + pasmo nazw u dołu
  const SCALE = Math.min(3, availW / nativeW, availH / nativeH);
  const gx = cx + (PANEL_W - nativeW * SCALE) / 2 - minX * SCALE;
  const gy = cy + 84 - minY * SCALE;

  const segs = comp.segments
    .map((seg) => {
      const pts = seg.points.map((p) => `${p.x * SCALE},${p.y * SCALE}`).join(' ');
      const w = seg.ownerRef.endsWith('#sn-source-descent') ? 3.2 : seg.ownerRef.endsWith('#sn-bus') || seg.ownerRef.endsWith('#lv-bus') ? 3 : 2;
      return `<polyline points="${pts}" fill="none" stroke="${segColor(seg.ownerRef)}" stroke-width="${w}"/>`;
    })
    .join('');

  const syms = comp.symbols
    .map((s) => {
      const Glyph = SYMBOL_GLYPHS[s.symbolId];
      return `<g transform="translate(${s.x * SCALE},${s.y * SCALE}) scale(${SCALE})">${renderToStaticMarkup(
        <Glyph x={0} y={0} state={s.state as 'closed' | 'open' | 'unknown' | undefined} stroke="#E8EEF4" />,
      )}</g>`;
    })
    .join('');

  const derLabels = comp.labels.der
    .map(
      (l) =>
        `<text x="${l.anchor.x * SCALE}" y="${(l.anchor.y + GRID) * SCALE + 12}" text-anchor="middle" ` +
        `font-family="Inter, system-ui, sans-serif" font-size="13" font-weight="600" fill="#E8A94C">${l.text}</text>`,
    )
    .join('');

  const bandRows = comp.labels.stationName.rows
    .map(
      (r, i) =>
        `<text x="${cx + PANEL_W / 2}" y="${cy + PANEL_H - 96 + i * 18}" text-anchor="middle" ` +
        `font-family="Inter, system-ui, sans-serif" font-size="12" fill="#9FB3C8">${r.text}</text>`,
    )
    .join('');

  return (
    `<rect x="${cx + 8}" y="${cy + 8}" width="${PANEL_W - 16}" height="${PANEL_H - 16}" rx="12" fill="#111C28" stroke="#25384A"/>` +
    `<text x="${cx + PANEL_W / 2}" y="${cy + 36}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="18" font-weight="700" fill="#E8EEF4">${title}</text>` +
    `<text x="${cx + PANEL_W / 2}" y="${cy + 60}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="13" fill="#9FB3C8">${subtitle}</text>` +
    `<g transform="translate(${gx},${gy})">${segs}${syms}${derLabels}</g>` +
    bandRows
  );
}

const WIDTH = PANEL_W * 2 + 60;
const HEIGHT = PANEL_H + 100;

const title =
  `<text x="20" y="34" font-family="Inter, system-ui, sans-serif" font-size="24" font-weight="700" fill="#E8EEF4">` +
  `W2 · Tor DER wg REALNEJ strony przyłączenia (L2) — GS-4b / audyt Z2</text>` +
  `<text x="20" y="62" font-family="Inter, system-ui, sans-serif" font-size="14" fill="#9FB3C8">` +
  `Szyna SN (niebieska) · szyna/odczepy nN (turkus) · POLE ŹRÓDŁOWE SN (bursztyn, Z2) · rząd nN DER (fiolet) — ` +
  `to samo źródło PV, DWIE topologie ⇒ DWA różne tory (koniec „każdy DER za TR")</text>`;

const panels =
  renderComposition(compA, 20, 84, 'Wariant A — DER na nN (za TR)', 'connectionSide=nn ⇒ rząd nN na szynie nN, obok odbioru') +
  renderComposition(compB, 40 + PANEL_W, 84, 'Wariant B — DER na SN (pole źródłowe)', 'connectionSide=sn ⇒ odczep od szyny SN, ZERO renderu za TR');

const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">` +
  `<rect width="${WIDTH}" height="${HEIGHT}" fill="#0E1621"/>${title}${panels}</svg>`;

writeFileSync(`${OUT}/w2-l2-tor-der.svg`, svg);
console.log('wrote', `${OUT}/w2-l2-tor-der.svg`);
