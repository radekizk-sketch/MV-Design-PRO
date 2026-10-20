/**
 * SCHEMAT-10 W2c (POLECENIE_DER_SN_TOPOLOGIA_2026-07, reguły 1–7) — dowód
 * wizualny KOMPLETNEGO toru DER przyłączonego po stronie SN na L2. Trzy panele
 * z produkcyjnego `composeStation` (ten sam potok measure→bands→columns→compose
 * co scena):
 *  - Przypadek 2: PV z TR blokowym i polem źródłowym SN — pełny tor
 *    (pole SN → głowica → kabel SN → TR blokowy → szyna nN producenta → PV);
 *  - Przypadek 7: dwa DER różnych topologii (PV + BESS) na wspólnej szynie SN
 *    — DWA osobne tory, DWA różne TR blokowe;
 *  - Przypadek 8: DER-SN obok pola TR odbiorczego stacji — TR blokowy DER ≠
 *    TR stacji (osobne symbole/role).
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   CANON_OUT=<dir> npx vite-node scripts/render_schemat10_w2c.tsx
 *   CANON_OUT=<dir> node scripts/rasterize.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';

import { GRID } from '../src/ui/sld/v3/core/grid';
import { SYMBOL_DEFS } from '../src/ui/sld/v3/symbols/defs';
import { SYMBOL_GLYPHS } from '../src/ui/sld/v3/symbols/glyphs';
import { FIELD_ROLE } from '../src/ui/sld/v2/domain/apparatusContracts';
import type {
  BayPrimaryDeviceView,
  MiniBlockBayDescriptor,
} from '../src/ui/sld/v2/renderer/MiniBlockRmuRenderer';
import { stationBlockHeight, type StationMeasureInput } from '../src/ui/sld/v3/layout/measure';
import { resolveLabels } from '../src/ui/sld/v3/layout/labels';
import { planSceneLabels, plannedLabelCollisions, plannedLabelObstacleCollisions } from '../src/ui/sld/v3/canvas/labelLegibility';
import { LABEL_TYPOGRAPHY } from '../src/ui/sld/v3/core/text';
import { computeBands } from '../src/ui/sld/v3/layout/bands';
import { computeColumns, type ComputeColumnsInput } from '../src/ui/sld/v3/layout/columns';
import { colorSegmentLabelRows, computeSegmentLabelSlotX } from '../src/ui/sld/v3/layout/segments';
import type { StationDerSourceInput } from '../src/ui/sld/v3/compose/sourceKind';
import {
  composeStation,
  type ComposeStationInput,
  type StationComposition,
} from '../src/ui/sld/v3/compose/station';

const OUT = process.env.CANON_OUT ?? '/tmp/canon';
mkdirSync(OUT, { recursive: true });

/**
 * Aparat pola w kontrakcie WIDOKU (`BayPrimaryDeviceView`), a nie ENM
 * (`BayPrimaryDevice`) — `MiniBlockBayDescriptor.primaryDevices` przyjmuje
 * projekcję, którą w produkcji buduje `enmToSldAdapter.projectBayPrimaryDevices()`.
 * POPRAWKA 2026-08-08 (karta TYPY-POZA-BRAMKA): skrypt budował dotąd kształt ENM
 * (`device_ref`, `symbol_ref`, `is_controllable`, `render_variant`, `earthing_role`)
 * i podawał go tam, gdzie widok czyta `deviceRef` — czyli KAŻDY aparat na tym
 * artefakcie szedł do renderu z `deviceRef === undefined`, a pola spoza kontraktu
 * widoku były martwym balastem. Błąd żył poza bramką, bo `scripts/` nie był objęty
 * `tsconfig.json`.
 */
function dev(
  ref: string,
  kind: BayPrimaryDeviceView['kind'],
  placement: BayPrimaryDeviceView['placement'],
  extra: Partial<BayPrimaryDeviceView> = {},
): BayPrimaryDeviceView {
  return { deviceRef: ref, kind, placement, ...extra };
}

/** Pole źródłowe SN (bay_role OZE) — stos [DS,CB,CT,VT,DS,ES,SA,CABLE_HEAD]. */
function ozeBay(id: string, kind: 'pv' | 'bess' = 'pv'): MiniBlockBayDescriptor {
  return {
    bayRef: id,
    fieldRole: kind === 'bess' ? FIELD_ROLE.DER_BESS : FIELD_ROLE.DER_PV,
    designation: 'PV',
    hasMissingRequiredDevice: false,
    primaryDevices: [
      dev(`${id}/ds1`, 'DS', 'UPSTREAM', { designation: 'Q1' }),
      dev(`${id}/cb`, 'CB', 'MIDSTREAM', { designation: 'Q0' }),
      dev(`${id}/ct`, 'CT', 'MIDSTREAM'),
      dev(`${id}/vt`, 'VT', 'OFF_PATH'),
      dev(`${id}/ds2`, 'DS', 'MIDSTREAM', { designation: 'Q9' }),
      dev(`${id}/es`, 'ES', 'GROUND_BRANCH', { designation: 'QE1' }),
      dev(`${id}/sa`, 'SURGE_ARRESTER', 'GROUND_BRANCH'),
      dev(`${id}/head`, 'CABLE_HEAD', 'DOWNSTREAM'),
    ],
  };
}

function lineBay(index: number): MiniBlockBayDescriptor {
  return { bayRef: `line-${index}`, fieldRole: FIELD_ROLE.RMU_LINE, designation: `L${index}`, hasMissingRequiredDevice: false };
}
function trBay(): MiniBlockBayDescriptor {
  return { bayRef: 'tr-station', fieldRole: FIELD_ROLE.RMU_TRANSFORMER, designation: 'TR', hasMissingRequiredDevice: false };
}

function chainSource(
  id: string,
  kind: StationDerSourceInput['kind'],
  fieldRef: string,
  blockTrRef: string,
  producerBusRef: string,
  variant = 'multi-feeder',
  unitCount?: number,
): StationDerSourceInput {
  return {
    id,
    kind,
    ratedPower: 1.0,
    connectionSide: 'sn',
    chain: {
      mvFieldRef: fieldRef,
      blockTransformer: { ref: blockTrRef, role: 'TRANSFORMATOR_BLOKOWY_DER', primaryVoltageKv: 15, secondaryVoltageKv: 0.4 },
      producerLvBus: { ref: producerBusRef, voltageKv: 0.4, lvSwitchgearVariant: variant },
      cableRef: `${id}/mv_cable`,
      unitCount,
    },
  };
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
    hasLvSection: false,
  };
}

// Przypadek 2: PV + TR blokowy + pole SN.
const station2: StationMeasureInput = {
  id: 'w2c-2', name: 'Stacja W2c-2 (PV + TR blokowy)', stationCode: 'S-2', transformerRatedKva: null,
  stationTypeLabel: 'stacja źródłowa SN', snBays: [lineBay(0), ozeBay('w2c-2/der/field')],
  derSources: [chainSource('w2c-2/der/converter', 'pv', 'w2c-2/der/field', 'w2c-2/der/block_tr', 'w2c-2/der/lv_bus')],
};

// Przypadek 7: dwa DER (PV + BESS) różnych topologii na wspólnej szynie SN.
const station7: StationMeasureInput = {
  id: 'w2c-7', name: 'Stacja W2c-7 (PV + BESS, wspólna szyna SN)', stationCode: 'S-7', transformerRatedKva: null,
  stationTypeLabel: 'stacja źródłowa SN', snBays: [ozeBay('w2c-7/a/field', 'pv'), ozeBay('w2c-7/b/field', 'bess')],
  derSources: [
    chainSource('w2c-7/a/converter', 'pv', 'w2c-7/a/field', 'w2c-7/a/block_tr', 'w2c-7/a/lv_bus', 'multi-feeder'),
    chainSource('w2c-7/b/converter', 'bess', 'w2c-7/b/field', 'w2c-7/b/block_tr', 'w2c-7/b/lv_bus', 'single-bus'),
  ],
};

// Przypadek 8: DER-SN obok pola TR odbiorczego stacji.
const station8: StationMeasureInput = {
  id: 'w2c-8', name: 'Stacja W2c-8 (DER-SN obok TR stacji)', stationCode: 'S-8', transformerRatedKva: 630,
  stationTypeLabel: 'stacja SN/nN', snBays: [trBay(), ozeBay('w2c-8/der/field')],
  derSources: [chainSource('w2c-8/der/converter', 'pv', 'w2c-8/der/field', 'w2c-8/der/block_tr', 'w2c-8/der/lv_bus')],
};

const comp2 = composeStation(buildComposeInput(station2));
const comp7 = composeStation(buildComposeInput(station7));
const comp8 = composeStation(buildComposeInput(station8));

const PANEL_W = 620;
const PANEL_H = 700;

/** Kolor odcinka wg semantyki ownerRef (dowód rozróżnialności toru). */
function segColor(ownerRef: string): string {
  if (ownerRef.endsWith('#sn-bus')) return '#4C9BE8'; // szyna SN stacji
  if (ownerRef.endsWith('#lv-bus')) return '#39C0A8'; // szyna nN producenta
  if (ownerRef.endsWith('#der-source-descent')) return '#E8A94C'; // zejście do źródła
  if (ownerRef.includes('mv_cable')) return '#E86F4C'; // kabel SN toru
  if (ownerRef.endsWith('#descent')) return '#8FA8BE'; // zejście pola z szyny SN
  return '#8FA8BE';
}


/** W2c: etykiety i pasmo nazw z tego samego kontraktu co kanwa SLD v3.
 * Poprzednio DER miał współrzędne świata, a opis stacji stałą Y panelu;
 * dwie niezależne geometrie nakładały teksty i maskowały błąd w dowodzie.
 * Utrata etykiety tożsamości albo kolizja powoduje FAIL, nie obraz PASS.
 */
function renderComposition(comp: StationComposition, cx: number, cy: number, title: string, subtitle: string): string {
  const labels = resolveLabels({
    stationNameBands: [comp.labels.stationName],
    portCaptions: comp.labels.portCaptions,
    simpleAnchored: [...comp.labels.apparatus, ...comp.labels.der, ...comp.labels.busbar, ...comp.labels.protection],
  });
  const symbols = comp.symbols.map((element) => {
    const def = SYMBOL_DEFS[element.symbolId];
    return { x: element.x, y: element.y, width: def.width, height: def.height };
  });
  // Wyrocznia uwzględnia nie tylko symbol, ale też każdy rzeczywisty odcinek toru.
  const wireRects = comp.segments.flatMap((segment) => segment.points.slice(1).map((end, index) => {
    const start = segment.points[index];
    const tolerance = 1;
    return {
      x: Math.min(start.x, end.x) - tolerance,
      y: Math.min(start.y, end.y) - tolerance,
      width: Math.abs(end.x - start.x) + 2 * tolerance,
      height: Math.abs(end.y - start.y) + 2 * tolerance,
    };
  }));
  const obstacles = [...symbols, ...wireRects];
  const xs = [
    ...symbols.flatMap((rect) => [rect.x, rect.x + rect.width]),
    ...comp.segments.flatMap((seg) => seg.points.map((point) => point.x)),
    ...labels.flatMap((label) => [label.rect.x, label.rect.x + label.rect.width]),
  ];
  const ys = [
    ...symbols.flatMap((rect) => [rect.y, rect.y + rect.height]),
    ...comp.segments.flatMap((seg) => seg.points.map((point) => point.y)),
    ...labels.flatMap((label) => [label.rect.y, label.rect.y + label.rect.height]),
  ];
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const nativeW = Math.max(...xs) - minX;
  const nativeH = Math.max(...ys) - minY;
  const availW = PANEL_W - 60;
  const availH = PANEL_H - 200;
  const SCALE = Math.min(3, availW / nativeW, availH / nativeH);
  const gx = cx + (PANEL_W - nativeW * SCALE) / 2 - minX * SCALE;
  const gy = cy + 92 - minY * SCALE;
  const labelPlan = planSceneLabels(
    labels, obstacles, SCALE,
    { width: Math.ceil(Math.max(...xs) + GRID), height: Math.ceil(Math.max(...ys) + GRID) },
  );
  const collisions = plannedLabelCollisions(labelPlan);
  const symbolCollisions = plannedLabelObstacleCollisions(labelPlan, obstacles);
  if (collisions.length || symbolCollisions.length || labelPlan.droppedIdentity.length) {
    throw new Error('W2c ' + comp.stationId + ': etykiety-kolizje=' + collisions.length +
      ', etykiety-symbole=' + symbolCollisions.length +
      ', utracone-tożsamości=' + labelPlan.droppedIdentity.length +
      '. Zabronione zapisanie zrzutu dowodowego.');
  }
  const xml = (value: string): string => value.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const segs = comp.segments.map((seg) => {
    const points = seg.points.map((p) => (p.x * SCALE) + ',' + (p.y * SCALE)).join(' ');
    const trunk = seg.ownerRef.endsWith('#sn-bus') || seg.ownerRef.endsWith('#lv-bus') || seg.ownerRef.includes('mv_cable');
    return '<polyline points="' + points + '" fill="none" stroke="' + segColor(seg.ownerRef) +
      '" stroke-width="' + (trunk ? 3 : 2) + '"/>';
  }).join('');
  const glyphs = comp.symbols.map((symbol) => {
    const Glyph = SYMBOL_GLYPHS[symbol.symbolId];
    const svg = renderToStaticMarkup(
      <Glyph x={0} y={0} state={symbol.state as 'closed' | 'open' | 'unknown' | undefined} stroke="#E8EEF4" />,
    );
    return '<g transform="translate(' + (symbol.x * SCALE) + ',' + (symbol.y * SCALE) +
      ') scale(' + SCALE + ')">' + svg + '</g>';
  }).join('');
  const captions = labelPlan.drawn.map((planned) => {
    const x = planned.rect.x + planned.rect.width / 2;
    const y = planned.rect.y + planned.rect.height / 2;
    const kind = planned.label.ownerKind;
    const color = kind === 'der' ? '#E8A94C' : kind === 'busbar-voltage' ? '#39C0A8' : '#C0D0DE';
    const transform = planned.label.rotated
      ? ' transform="rotate(-90 ' + (x * SCALE) + ' ' + (y * SCALE) + ')"' : '';
    return '<text data-owner-ref="' + xml(planned.label.ownerRef) +
      '" x="' + (x * SCALE) + '" y="' + (y * SCALE) +
      '" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif"' +
      ' font-size="' + (planned.fontSize * SCALE) +
      '" font-weight="' + LABEL_TYPOGRAPHY[planned.label.labelClass].fontWeight +
      '" fill="' + color + '"' + transform + '>' + xml(planned.text) + '</text>';
  }).join('');
  return '<rect x="' + (cx + 8) + '" y="' + (cy + 8) +
    '" width="' + (PANEL_W - 16) + '" height="' + (PANEL_H - 16) +
    '" rx="12" fill="#111C28" stroke="#25384A"/>' +
    '<text x="' + (cx + PANEL_W / 2) + '" y="' + (cy + 38) +
    '" text-anchor="middle" font-family="sans-serif" font-size="17" font-weight="700" fill="#E8EEF4">' +
    xml(title) + '</text>' +
    '<text x="' + (cx + PANEL_W / 2) + '" y="' + (cy + 62) +
    '" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#9FB3C8">' +
    xml(subtitle) + '</text>' +
    '<g transform="translate(' + gx + ',' + gy + ')">' + segs + glyphs + captions + '</g>';
}

const WIDTH = PANEL_W * 3 + 80;
const HEIGHT = PANEL_H + 100;

const title =
  `<text x="20" y="34" font-family="Inter, system-ui, sans-serif" font-size="23" font-weight="700" fill="#E8EEF4">` +
  `W2c · Kompletny tor DER przyłączonego po stronie SN (L2) — reguły 1–7</text>` +
  `<text x="20" y="60" font-family="Inter, system-ui, sans-serif" font-size="13" fill="#9FB3C8">` +
  `Pole źródłowe SN (stos z danych) → głowica → kabel SN (ceglasty) → TR blokowy (transformer2W) → szyna nN producenta (turkus, „0,4 kV") → symbol źródła. ` +
  `Symbol PV/BESS NIGDY bezpośrednio na szynie SN (reguła 7); TR blokowy ≠ TR stacji (reguła 5).</text>`;

const panels =
  renderComposition(comp2, 20, 84, 'Przypadek 2 — PV + TR blokowy + pole SN', 'pełny tor: pole SN → kabel → TR blokowy → nN prod. → PV') +
  renderComposition(comp7, 40 + PANEL_W, 84, 'Przypadek 7 — dwa DER na wspólnej szynie SN', 'PV (multi-feeder) + BESS (single-bus) — dwa RÓŻNE TR blokowe') +
  renderComposition(comp8, 60 + PANEL_W * 2, 84, 'Przypadek 8 — DER-SN obok TR stacji', 'TR blokowy DER (górny) ≠ TR odbiorczy stacji (pole TR)');

const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">` +
  `<rect width="${WIDTH}" height="${HEIGHT}" fill="#0E1621"/>${title}${panels}</svg>`;

writeFileSync(`${OUT}/w2c-l2-tor-sn.svg`, svg);
console.log('wrote', `${OUT}/w2c-l2-tor-sn.svg`);
