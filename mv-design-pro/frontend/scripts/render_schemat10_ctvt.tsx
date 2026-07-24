/**
 * SCHEMAT-10 CTVT-RENDER (CTVT-MODEL/V12K-176, SLD_CAD_SPEC_V3 §18.3/§20.2) —
 * dowód wizualny L2 konsumenta-renderu pól `Measurement.ct_cores`/`vt_mounting`:
 *  - Panel A (Z DANYMI): pole z CT niosącym ct_cores=3 (+ układ 3×CT) i VT
 *    niosącym vt_mounting='cable' — etykieta CT „CT1 · 300/5 · 3×CT · 3 rdz."
 *    ORAZ nowa adnotacja montażu VT „V1 · kablowy" widoczne w kolumnie
 *    adnotacji tuż za torem głównym;
 *  - Panel B (BEZ DANYCH): TE SAME aparaty CT/VT ale BEZ ct_cores/vt_mounting
 *    (None) — ZERO adnotacji, ZERO rezerwacji (warunkowość §0.2: produkcja bez
 *    danych = brak zmiany wizualnej).
 * Oba panele z produkcyjnego `composeStation` (ten sam potok
 * measure→bands→columns→compose co scena).
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   CANON_OUT=<dir> npx vite-node scripts/render_schemat10_ctvt.tsx
 *   CANON_OUT=<dir> node scripts/rasterize.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';

import { SYMBOL_DEFS } from '../src/ui/sld/v3/symbols/defs';
import { SYMBOL_GLYPHS } from '../src/ui/sld/v3/symbols/glyphs';
import { FIELD_ROLE } from '../src/ui/sld/v2/domain/apparatusContracts';
import type { BayPrimaryDeviceView, MiniBlockBayDescriptor } from '../src/ui/sld/v2/renderer/MiniBlockRmuRenderer';
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

const MEAS_CT = 'meas-ct-1';
const MEAS_VT = 'meas-vt-1';

/** Aparaty pola: DS·CB·CT(linked)·DS·ES·VT(linked, boczny)·głowica. */
function primaryDevices(): readonly BayPrimaryDeviceView[] {
  return [
    { kind: 'DS', placement: 'UPSTREAM', deviceRef: 'ds-bus' },
    { kind: 'CB', placement: 'MIDSTREAM', deviceRef: 'cb-1' },
    { kind: 'CT', placement: 'MIDSTREAM', deviceRef: 'ct-1', linkedRef: MEAS_CT },
    { kind: 'DS', placement: 'MIDSTREAM', deviceRef: 'ds-line' },
    { kind: 'ES', placement: 'MIDSTREAM', deviceRef: 'es-1' },
    { kind: 'VT', placement: 'MIDSTREAM', deviceRef: 'vt-1', linkedRef: MEAS_VT },
    { kind: 'CABLE_HEAD', placement: 'DOWNSTREAM', deviceRef: 'head-1' },
  ];
}

function bayWithData(): MiniBlockBayDescriptor {
  return {
    bayRef: 'ctvt-with', fieldRole: FIELD_ROLE.LINE_IN, designation: 'L1', hasMissingRequiredDevice: false,
    primaryDevices: primaryDevices(),
    ctRatingAnnotations: [
      { measurementRef: MEAS_CT, identifier: 'CT1', ratioText: '300/5', arrangement: '3xCT', cores: 3 },
    ],
    vtMountingAnnotations: [{ measurementRef: MEAS_VT, identifier: 'V1', mounting: 'cable' }],
  };
}

function bayWithoutData(): MiniBlockBayDescriptor {
  return {
    bayRef: 'ctvt-without', fieldRole: FIELD_ROLE.LINE_IN, designation: 'L1', hasMissingRequiredDevice: false,
    primaryDevices: primaryDevices(),
  };
}

function station(id: string, name: string, bay: MiniBlockBayDescriptor): StationMeasureInput {
  return { id, name, stationCode: 'S01', transformerRatedKva: 630, stationTypeLabel: 'stacja przelotowa', snBays: [bay] };
}

function buildComposeInput(st: StationMeasureInput): ComposeStationInput {
  const rows = colorSegmentLabelRows(computeSegmentLabelSlotX([st], [null]));
  const bandsResult = computeBands(
    [{ incomingSegmentLabelText: null, portCaptionHeight: 0, stationBlockHeight: stationBlockHeight(st), nameBandHeight: 48 }],
    rows.rowCount,
  );
  const input: ComputeColumnsInput = {
    stations: [st], incomingSegmentLabelTexts: [null],
    nameSlotBand: bandsResult.bands.B5, segmentSlotBand: bandsResult.bands.B1,
  };
  const { columns } = computeColumns(input);
  const column = columns[0];
  return {
    station: st,
    column: { x: column.x, width: column.width, tapX: column.tapX },
    busAxisY: bandsResult.bands.B2.y,
    blockTopY: bandsResult.bands.B4.y,
    nameSlot: column.nameSlot,
    hasLvSection: false,
  };
}

const compWith = composeStation(buildComposeInput(station('ctvt-with', 'Pole Z DANYMI (ct_cores=3, vt_mounting=kablowy)', bayWithData())));
const compWithout = composeStation(buildComposeInput(station('ctvt-without', 'Pole BEZ DANYCH (ct_cores=None, vt_mounting=None)', bayWithoutData())));

const PANEL_W = 620;
const PANEL_H = 720;

function renderComposition(comp: StationComposition, cx: number, cy: number, title: string, subtitle: string): string {
  const labelXs = comp.labels.protection.flatMap((l) => [l.anchor.x, l.anchor.x + 160]);
  const xs = [
    ...comp.symbols.flatMap((s) => [s.x, s.x + SYMBOL_DEFS[s.symbolId].width]),
    ...comp.segments.flatMap((s) => s.points.map((p) => p.x)),
    ...labelXs,
  ];
  const ys = [
    ...comp.symbols.flatMap((s) => [s.y, s.y + SYMBOL_DEFS[s.symbolId].height]),
    ...comp.segments.flatMap((s) => s.points.map((p) => p.y)),
  ];
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const nativeW = Math.max(...xs) - minX;
  const nativeH = Math.max(...ys) - minY;
  const availW = PANEL_W - 60;
  const availH = PANEL_H - 200;
  const SCALE = Math.min(3, availW / nativeW, availH / nativeH);
  const gx = cx + 40 - minX * SCALE;
  const gy = cy + 110 - minY * SCALE;

  const segs = comp.segments
    .map((seg) => {
      const pts = seg.points.map((p) => `${p.x * SCALE},${p.y * SCALE}`).join(' ');
      return `<polyline points="${pts}" fill="none" stroke="#8FA8BE" stroke-width="2"/>`;
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

  // Adnotacje CT (rdzenie) i VT (montaż) — kolor rozróżnia oś danych.
  const protLabels = comp.labels.protection
    .map((l) => {
      const isVt = l.ownerRef.includes('#vt-mounting-');
      const isCt = l.ownerRef.includes('#ct-rating-');
      const color = isVt ? '#39C0A8' : isCt ? '#E8A94C' : '#9FB3C8';
      return (
        `<text x="${l.anchor.x * SCALE + 6}" y="${l.anchor.y * SCALE + 4}" text-anchor="start" ` +
        `font-family="Inter, system-ui, sans-serif" font-size="12" font-weight="600" fill="${color}">${l.text}</text>`
      );
    })
    .join('');

  const emptyNote = comp.labels.protection.length === 0
    ? `<text x="${cx + PANEL_W * 0.66}" y="${cy + PANEL_H * 0.5}" text-anchor="middle" ` +
      `font-family="Inter, system-ui, sans-serif" font-size="13" fill="#6B7F93">— brak adnotacji (dane None) —</text>`
    : '';

  const bandRows = comp.labels.stationName.rows
    .map(
      (r, i) =>
        `<text x="${cx + PANEL_W / 2}" y="${cy + PANEL_H - 84 + i * 18}" text-anchor="middle" ` +
        `font-family="Inter, system-ui, sans-serif" font-size="12" fill="#9FB3C8">${r.text}</text>`,
    )
    .join('');

  return (
    `<rect x="${cx + 8}" y="${cy + 8}" width="${PANEL_W - 16}" height="${PANEL_H - 16}" rx="12" fill="#111C28" stroke="#25384A"/>` +
    `<text x="${cx + PANEL_W / 2}" y="${cy + 38}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="17" font-weight="700" fill="#E8EEF4">${title}</text>` +
    `<text x="${cx + PANEL_W / 2}" y="${cy + 62}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="12" fill="#9FB3C8">${subtitle}</text>` +
    `<g transform="translate(${gx},${gy})">${segs}${syms}${protLabels}</g>` +
    emptyNote +
    bandRows
  );
}

const WIDTH = PANEL_W * 2 + 60;
const HEIGHT = PANEL_H + 100;

const title =
  `<text x="20" y="34" font-family="Inter, system-ui, sans-serif" font-size="23" font-weight="700" fill="#E8EEF4">` +
  `CTVT-RENDER · Adnotacja liczby rdzeni CT i montażu VT (L2) — V12K-176 konsument</text>` +
  `<text x="20" y="60" font-family="Inter, system-ui, sans-serif" font-size="13" fill="#9FB3C8">` +
  `Rdzenie CT (pomarańczowy) doklejone do etykiety przekładni; montaż VT szynowy/kablowy (turkus) jako nowa adnotacja. ` +
  `Warunkowo: obecne WYŁĄCZNIE gdy Measurement niesie ct_cores/vt_mounting — None ⇒ zero adnotacji, zero zmiany geometrii.</text>`;

const panels =
  renderComposition(compWith, 20, 84, 'Z DANYMI — ct_cores=3, vt_mounting=kablowy', 'etykieta CT „CT1 · 300/5 · 3×CT · 3 rdz." + adnotacja VT „V1 · kablowy"') +
  renderComposition(compWithout, 40 + PANEL_W, 84, 'BEZ DANYCH — ct_cores=None, vt_mounting=None', 'te same aparaty CT/VT, ZERO adnotacji (warunkowość §0.2)');

const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">` +
  `<rect width="${WIDTH}" height="${HEIGHT}" fill="#0E1621"/>${title}${panels}</svg>`;

writeFileSync(`${OUT}/ctvt-render-l2.svg`, svg);
console.log('wrote', `${OUT}/ctvt-render-l2.svg`);
