/**
 * SCHEMAT-10 R2 (RECENZJA_WARSTWA_WYNIKOWA_2026-07 §wym.8/12/14/19; program
 * WYNIKI-SLD R2) — dowód wizualny trzech zdolności warstwy wynikowej na L2:
 *  A · PRIORYTETY przy kolizji (klasa właściciela ze sceny rozstrzyga — źródła/
 *      TR nigdy ustępują liniom/szynom; tabela ulokowane/ukryte per klasa),
 *  B · AGREGAT „+N wyniki" ROZWINIĘTY (skupisko bliskich kotwic → jeden marker;
 *      klik rozwija listę członków, 1:1 z payloadu),
 *  C · STAN NIEAKTUALNY (baner „⚠ wyniki nieaktualne" + etykiety wyszarzone —
 *      nie znikają; Case Immutability Rule).
 *
 * REALNA scena `buildSceneV3(sldSubstrate52s, L2)` + warstwa liczb zbudowana
 * PRODUKCYJNYM potokiem (`buildResultLabelsFromScene` → `layoutResultLabels`, ta
 * sama funkcja co kanwa). Rysunek bazowy NIETKNIĘTY — warstwa NAD sceną (§11
 * inwariant geometrii). Metryki panelu A = te same, które raportuje
 * `sld_v3_acceptance.mjs` (jeden potok).
 *
 * ŹRÓDŁO LICZB (zakaz wymyślania — dyrektywa 2026-07-18): wartości metryk 1:1 z
 * repo (obc. 72,5 % + I 350 A — test_result_contract_v1.py; P +6,5468 MW —
 * sldSubstrate52s.powerflow.json bieg NR; U 15,02 kV — kontrakt). Payload PEŁNY
 * na realnych kotwicach sceny (odwzorowanie biegu rozpływu na całej sieci).
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   CANON_OUT=<dir> npx vite-node scripts/render_schemat10_r2.tsx
 *   CANON_OUT=<dir> node scripts/rasterize.mjs
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';

import { buildSceneV3 } from '../src/ui/sld/v3/scene/buildScene';
import { SYMBOL_DEFS, type SymbolId } from '../src/ui/sld/v3/symbols/defs';
import { SYMBOL_GLYPHS } from '../src/ui/sld/v3/symbols/glyphs';
import { buildResultLabelsFromScene, orientedSegmentRefs } from '../src/ui/sld/v3/canvas/resultLabels';
import { layoutResultLabels } from '../src/ui/sld/v3/canvas/SldCanvasV3';
import type { EnergyNetworkModel } from '../src/types/enm';
import type { RawOverlayElement, RawOverlayPayload } from '../src/ui/sld-overlay/rawResultOverlayStore';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.CANON_OUT ?? '/tmp/canon';
mkdirSync(OUT, { recursive: true });

const enmPath = resolve(here, '..', 'src', 'ui', 'sld', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json');
const enm = (JSON.parse(readFileSync(enmPath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

const scene = buildSceneV3(enm, 2);
// Bramka przesel: KLUCZE mapy orientacji (`orientedSegmentRefs`) — dokumentowany
// zamiennik usunietej `singleHopSegmentRefs`, ta sama derywacja co produkcja
// (`SldCanvasV3Workspace.buildResultLabelsForSnapshot`).
const singleHop = new Set(orientedSegmentRefs(enm).keys());

function el(refId: string, kind: string, metrics: RawOverlayElement['metrics']): RawOverlayElement {
  return { ref_id: refId, kind, badges: [], metrics, severity: 'INFO' };
}
const branchMetrics = (): RawOverlayElement['metrics'] => ({
  LOADING_PCT: { code: 'LOADING_PCT', value: 72.5, unit: '%', format_hint: 'fixed1' },
  I_A: { code: 'I_A', value: 350, unit: 'A', format_hint: 'fixed1' },
  P_MW: { code: 'P_MW', value: 6.546769, unit: 'MW', format_hint: 'fixed4' },
});
const elements: Record<string, RawOverlayElement> = {};
for (const s of scene.symbols) {
  const k = s.meta?.elementKind;
  const ref = s.meta?.ownerRef;
  if (k === 'source' && ref && !elements[ref]) elements[ref] = el(ref, 'generator', { P_MW: { code: 'P_MW', value: 6.546769, unit: 'MW', format_hint: 'fixed4' } });
  if (k === 'transformer' && ref && !elements[ref]) elements[ref] = el(ref, 'transformer', { S_MVA: { code: 'S_MVA', value: 0.63, unit: 'MVA', format_hint: 'fixed2' } });
}
for (const s of scene.segments) {
  const k = s.meta?.elementKind;
  const ref = s.meta?.ownerRef;
  if (k === 'bus' && ref && !elements[ref]) elements[ref] = el(ref, 'bus', { U_kV: { code: 'U_kV', value: 15.02, unit: 'kV', format_hint: 'fixed2' } });
  if (k === 'segment' && ref && !ref.includes('#') && singleHop.has(ref) && !elements[ref]) elements[ref] = el(ref, 'branch', branchMetrics());
}
const payload: RawOverlayPayload = { run_id: 'r2-proof', analysis_type: 'load_flow', elements };
const byRef = buildResultLabelsFromScene(scene, payload, singleHop);
const layout = layoutResultLabels(scene, byRef, [], 2);
const m = layout.metrics;

// Per-klasa: ulokowane vs ukryte (dowód priorytetu — panel A).
const KINDS = ['source', 'transformer', 'branch', 'bus'] as const;
const KIND_PL: Record<string, string> = { source: 'Źródło/DER', transformer: 'Transformator', branch: 'Linia/kabel', bus: 'Szyna' };
const placedByKind: Record<string, number> = { source: 0, transformer: 0, branch: 0, bus: 0 };
const hiddenByKind: Record<string, number> = { source: 0, transformer: 0, branch: 0, bus: 0 };
for (const p of layout.placements) placedByKind[p.kind]++;
for (const r of layout.hiddenRefs) { const k = byRef[r]?.kind; if (k) hiddenByKind[k]++; }
// Członkowie agregatów też liczeni do „ulokowane" na potrzeby bilansu widoku.
for (const a of layout.aggregates) for (const mem of a.members) placedByKind[mem.kind]++;

// Agregat do zbliżenia (panel B).
const agg = layout.aggregates[0];
const aggSeg = agg ? scene.segments.find((s) => s.meta?.ownerRef === agg.anchorRef) : undefined;
const aggSym = agg ? scene.symbols.find((s) => s.meta?.ownerRef === agg.anchorRef) : undefined;
const aggCx = agg ? agg.x + agg.width / 2 : 0;
const aggCy = agg ? agg.y + agg.height / 2 : 0;

// Kilka etykiet do panelu C (stan nieaktualny) — pierwsze 4 ulokowane.
const staleSample = layout.placements.slice(0, 4);

const WIRE = '#8FA8BE';
const TXT = '#E8EEF4';
const SUB = '#9FB3C8';
const RESULT = '#B39DDB';
const STALE = '#7A6E8F';
const BG = '#0E1621';
const PANEL = '#25384A';

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const W = 2400;
const HEADER = 96;
const A_H = 300;
const B_H = 420;
const C_H = 260;
const H = HEADER + A_H + 40 + B_H + 40 + C_H + 40;
const parts: string[] = [];
const lineH = 13;

// ---- PANEL A: PRIORYTETY ----
const AY = HEADER;
parts.push(
  `<text x="16" y="${AY - 8}" font-family="Inter, system-ui, sans-serif" font-size="13" font-weight="700" fill="${TXT}">` +
    `A · Priorytety przy kolizji (klasa właściciela ze sceny: źródła/DER › transformatory › linie › szyny) — wyżej-priorytetowe NIGDY nie ustępują niżej</text>`,
);
// Tabela per klasa
const rowY = (i: number) => AY + 40 + i * 40;
const colX = [40, 360, 560, 760, 980];
const headers = ['Klasa (priorytet ↓)', 'Ulokowane', 'Ukryte (ustąpiły)', 'Priorytet'];
headers.forEach((h, i) => parts.push(`<text x="${colX[i]}" y="${AY + 24}" font-family="Inter, system-ui, sans-serif" font-size="12" font-weight="700" fill="${SUB}">${escapeXml(h)}</text>`));
KINDS.forEach((k, i) => {
  const y = rowY(i);
  parts.push(`<rect x="32" y="${y - 18}" width="1120" height="34" rx="3" fill="none" stroke="${PANEL}" stroke-width="1"/>`);
  parts.push(`<text x="${colX[0]}" y="${y + 4}" font-family="Inter, system-ui, sans-serif" font-size="13" font-weight="600" fill="${RESULT}">${escapeXml(KIND_PL[k])}</text>`);
  parts.push(`<text x="${colX[1]}" y="${y + 4}" font-family="Inter, system-ui, sans-serif" font-size="13" fill="${TXT}">${placedByKind[k]}</text>`);
  parts.push(`<text x="${colX[2]}" y="${y + 4}" font-family="Inter, system-ui, sans-serif" font-size="13" fill="${hiddenByKind[k] > 0 ? '#F5A623' : TXT}">${hiddenByKind[k]}</text>`);
  parts.push(`<text x="${colX[3]}" y="${y + 4}" font-family="Inter, system-ui, sans-serif" font-size="13" fill="${SUB}">${i + 1}</text>`);
});
// Metryki po prawej
const mx = 1240;
parts.push(`<text x="${mx}" y="${AY + 24}" font-family="Inter, system-ui, sans-serif" font-size="12" font-weight="700" fill="${SUB}">Metryki rozmieszczania (wym. 19) — L2</text>`);
const metricLines = [
  `etykiety: ${m.labelCount}   ulokowane: ${layout.placements.length}   agregaty: ${m.aggregateCount}   ukryte: ${m.hiddenCount}`,
  `callouty (przesunięte): ${m.calloutCount}`,
  `kolizje — wykryte: ${m.collisionsDetected}   rozwiązane: ${m.collisionsResolved}   KOŃCOWE: ${m.collisionsFinal}`,
  `odległość od kotwicy — średnia: ${m.avgAnchorDistance.toFixed(1)} px   maks.: ${m.maxAnchorDistance.toFixed(1)} px`,
];
metricLines.forEach((t, i) => parts.push(`<text x="${mx}" y="${AY + 52 + i * 26}" font-family="Inter, system-ui, sans-serif" font-size="13" fill="${TXT}">${escapeXml(t)}</text>`));
parts.push(`<text x="${mx}" y="${AY + 52 + 4 * 26}" font-family="Inter, system-ui, sans-serif" font-size="12" fill="${SUB}">Kolizje KOŃCOWE = 0 (warstwa nie renderuje nakładających się liczb); ukryte = kandydaci do agregacji.</text>`);

// ---- PANEL B: AGREGAT ROZWINIĘTY ----
const BY = AY + A_H + 40;
parts.push(
  `<text x="16" y="${BY - 8}" font-family="Inter, system-ui, sans-serif" font-size="13" font-weight="700" fill="${TXT}">` +
    `B · Agregat „+N wyniki" (skupisko bliskich kotwic ≤ 5·GRID) rozwinięty w listę członków (klik → popover) — treść 1:1 z payloadu</text>`,
);
const ZOOM_W = 1100;
const ZOOM_H = B_H - 20;
parts.push(`<rect x="20" y="${BY}" width="${ZOOM_W}" height="${ZOOM_H}" fill="none" stroke="${PANEL}" stroke-width="1" rx="4"/>`);
if (agg) {
  const anchorX = aggSeg ? (Math.min(...aggSeg.points.map((p) => p.x)) + Math.max(...aggSeg.points.map((p) => p.x))) / 2 : aggSym ? aggSym.x + SYMBOL_DEFS[aggSym.symbolId as SymbolId].width / 2 : aggCx;
  const anchorY = aggSeg ? (Math.min(...aggSeg.points.map((p) => p.y)) + Math.max(...aggSeg.points.map((p) => p.y))) / 2 : aggSym ? aggSym.y + SYMBOL_DEFS[aggSym.symbolId as SymbolId].height / 2 : aggCy;
  const zMinX = Math.min(anchorX, aggCx) - ZOOM_W / 2 + 100;
  const zMinY = Math.min(anchorY, aggCy) - ZOOM_H / 2 + 80;
  const zX = (x: number) => 20 + (x - zMinX);
  const zY = (y: number) => BY + (y - zMinY);
  const inZoom = (x: number, y: number, w = 0, h = 0) => x + w >= zMinX && x <= zMinX + ZOOM_W && y + h >= zMinY && y <= zMinY + ZOOM_H;
  for (const seg of scene.segments) {
    const sx = seg.points.map((p) => p.x); const sy = seg.points.map((p) => p.y);
    if (!inZoom(Math.min(...sx), Math.min(...sy), Math.max(...sx) - Math.min(...sx), Math.max(...sy) - Math.min(...sy))) continue;
    const d = seg.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${zX(p.x).toFixed(1)},${zY(p.y).toFixed(1)}`).join(' ');
    parts.push(`<path d="${d}" fill="none" stroke="${WIRE}" stroke-width="1.2"/>`);
  }
  for (const s of scene.symbols) {
    const def = SYMBOL_DEFS[s.symbolId as SymbolId];
    const Glyph = SYMBOL_GLYPHS[s.symbolId as SymbolId];
    if (!def || !Glyph || !inZoom(s.x, s.y, def.width, def.height)) continue;
    parts.push(`<g transform="translate(${zX(s.x).toFixed(1)},${zY(s.y).toFixed(1)})">` + renderToStaticMarkup(<Glyph x={0} y={0} state={s.state as 'closed' | 'open' | 'unknown' | undefined} stroke={TXT} />) + `</g>`);
  }
  // Marker agregatu
  const mBx = zX(agg.x); const mBy = zY(agg.y);
  parts.push(`<rect x="${mBx.toFixed(1)}" y="${mBy.toFixed(1)}" width="${agg.width.toFixed(1)}" height="${agg.height.toFixed(1)}" rx="2" fill="${BG}" stroke="${RESULT}" stroke-width="1.4"/>`);
  parts.push(`<text x="${(mBx + agg.width / 2).toFixed(1)}" y="${(mBy + 4 + lineH * 0.5).toFixed(1)}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="11" font-weight="700" fill="${RESULT}">${escapeXml(`+${agg.count} wyniki`)}</text>`);
  // Popover (rozwinięty)
  const popRowH = lineH + 2;
  const popW = Math.max(agg.width, ...agg.members.map((mem) => 12 + (KIND_PL[mem.kind]?.length ?? 8) * 6 + (mem.primaryText.length) * 6));
  const popY = mBy + agg.height + 3;
  parts.push(`<rect x="${mBx.toFixed(1)}" y="${popY.toFixed(1)}" width="${popW.toFixed(1)}" height="${(agg.members.length * popRowH + 4).toFixed(1)}" rx="2" fill="${BG}" stroke="${RESULT}" stroke-width="1"/>`);
  agg.members.forEach((mem, i) => {
    const label = mem.primaryText ? `${KIND_PL[mem.kind] ?? mem.kind}: ${mem.primaryText}` : (KIND_PL[mem.kind] ?? mem.kind);
    parts.push(`<text x="${(mBx + 5).toFixed(1)}" y="${(popY + 4 + popRowH * (i + 0.5)).toFixed(1)}" text-anchor="start" font-family="Inter, system-ui, sans-serif" font-size="11" font-weight="600" fill="${RESULT}">${escapeXml(label)}</text>`);
  });
} else {
  parts.push(`<text x="${20 + ZOOM_W / 2}" y="${BY + ZOOM_H / 2}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="13" fill="${SUB}">(brak skupiska agregacji na tej fixturze)</text>`);
}

// ---- PANEL C: STAN NIEAKTUALNY ----
const CY = BY + B_H + 40;
parts.push(
  `<text x="16" y="${CY - 8}" font-family="Inter, system-ui, sans-serif" font-size="13" font-weight="700" fill="${TXT}">` +
    `C · Stan nieaktualny (Case Immutability Rule) — baner „⚠ wyniki nieaktualne" + etykiety wyszarzone; NIE znikają (inżynier widzi, że wartości są stare)</text>`,
);
// Baner
const bannerText = '⚠ wyniki nieaktualne';
parts.push(`<rect x="40" y="${CY + 8}" width="200" height="26" rx="3" fill="${BG}" stroke="${STALE}" stroke-width="1" stroke-dasharray="3 2"/>`);
parts.push(`<text x="140" y="${CY + 25}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="12" font-weight="700" fill="${STALE}">${escapeXml(bannerText)}</text>`);
// Porównanie: aktualne (lawenda pełna) vs nieaktualne (wyszarzone)
parts.push(`<text x="40" y="${CY + 70}" font-family="Inter, system-ui, sans-serif" font-size="12" font-weight="700" fill="${SUB}">Aktualne (pełna widoczność)</text>`);
parts.push(`<text x="640" y="${CY + 70}" font-family="Inter, system-ui, sans-serif" font-size="12" font-weight="700" fill="${SUB}">Nieaktualne (wyszarzone, obramowanie przerywane)</text>`);
staleSample.forEach((p, i) => {
  const x0 = 40 + i * 150;
  const y0 = CY + 84;
  // aktualne
  parts.push(`<rect x="${x0}" y="${y0}" width="130" height="${p.lines.length * lineH + 8}" rx="2" fill="${BG}" stroke="${RESULT}" stroke-width="1"/>`);
  p.lines.forEach((ln, j) => parts.push(`<text x="${x0 + 65}" y="${y0 + 6 + lineH * (j + 0.5)}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="11" font-weight="600" fill="${RESULT}">${escapeXml(`${ln.prefix} ${ln.text}`)}</text>`));
  // nieaktualne
  const x1 = 640 + i * 150;
  parts.push(`<g opacity="0.5"><rect x="${x1}" y="${y0}" width="130" height="${p.lines.length * lineH + 8}" rx="2" fill="${BG}" stroke="${STALE}" stroke-width="1" stroke-dasharray="3 2"/>`);
  p.lines.forEach((ln, j) => parts.push(`<text x="${x1 + 65}" y="${y0 + 6 + lineH * (j + 0.5)}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="11" font-weight="600" fill="${STALE}">${escapeXml(`${ln.prefix} ${ln.text}`)}</text>`));
  parts.push(`</g>`);
});

const title =
  `<text x="16" y="30" font-family="Inter, system-ui, sans-serif" font-size="19" font-weight="700" fill="${TXT}">` +
  `R2 · Warstwa wynikowa — walidacja nieaktualnych wyników · priorytety kolizji · agregacja +N · metryki (scena realna sldSubstrate52s, L2)</text>` +
  `<text x="16" y="52" font-family="Inter, system-ui, sans-serif" font-size="12" fill="${SUB}">` +
  `Priorytet z DANYCH SCENY (klasa właściciela, wym.12); agregacja skupisk ≤ 5·GRID (wym.14); staleness z ISTNIEJĄCEGO statusu przypadku (wym.8); metryki (wym.19).</text>` +
  `<text x="16" y="72" font-family="Inter, system-ui, sans-serif" font-size="11" fill="${SUB}">` +
  `Wartości 1:1 (§0): obc. 72,5 % + I 350 A — test_result_contract_v1.py; P +6,5468 MW — sldSubstrate52s.powerflow.json; U 15,02 kV — kontrakt. Geometria bazowa nietknięta (§11).</text>`;

const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
  `<rect width="${W}" height="${H}" fill="${BG}"/>${title}${parts.join('')}</svg>`;

writeFileSync(`${OUT}/r2-l2-staleness-agregacja.svg`, svg);
console.log('wrote', `${OUT}/r2-l2-staleness-agregacja.svg`, `(agg=${layout.aggregates.length}, hidden=${m.hiddenCount}, placed=${layout.placements.length}, W=${W} H=${H})`);
