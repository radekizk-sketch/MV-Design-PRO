/**
 * SCHEMAT-10 R1 (RECENZJA_WARSTWA_WYNIKOWA_2026-07 §wym.1–5, §11; program
 * WYNIKI-SLD R1) — dowód wizualny KONTEKSTOWEJ treści warstwy wynikowej na L2:
 * etykiety zależne od (typ elementu × analiza=rozpływ) z UNIWERSALNEGO REJESTRU
 * szablonów (`resultLabelTemplates.ts`), zwijane wg LOD. REALNA scena
 * `buildSceneV3(sldSubstrate52s, L2)` + warstwa liczb zbudowana produkcyjnym
 * potokiem (`buildResultLabelsFromScene` → `computeResultLabelPlacements`, ta
 * sama funkcja co kanwa). Rysunek bazowy NIETKNIĘTY — warstwa liczb NAD sceną
 * (§11 inwariant geometrii).
 *
 * ŹRÓDŁO LICZB (zakaz wymyślania — dyrektywa 2026-07-18; wyłącznie wartości
 * zapisane w repo):
 *  - przęsło: obciążenie 72,5 % + I 350 A → `backend/tests/
 *    test_result_contract_v1.py` (kontrakt ResultsContractV1, values
 *    {"i_a": 350.0, "loading_pct": 72.5}); P +6,5468 MW →
 *    `sldSubstrate52s.powerflow.json` branch_flow seg/0c7e6284…/segment_L
 *    p_from_mw=6.546769 (realny bieg newton-raphson tej samej sieci);
 *  - źródło: P +6,5468 MW (ten sam realny bieg NR).
 * Q/S/ΔU/cosφ oraz metryki źródła NIE są w kontrakcie LF (rejestr braków R1 —
 * patrz `resultLabelTemplates.ts` nagłówek) → świadomie NIE rysowane (zero
 * fabrykacji). Panel C pokazuje zwijanie LOD tej samej etykiety (wym. 5).
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   CANON_OUT=<dir> npx vite-node scripts/render_schemat10_r1.tsx
 *   CANON_OUT=<dir> node scripts/rasterize.mjs
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';

import { buildSceneV3 } from '../src/ui/sld/v3/scene/buildScene';
import { SYMBOL_DEFS, type SymbolId } from '../src/ui/sld/v3/symbols/defs';
import { SYMBOL_GLYPHS } from '../src/ui/sld/v3/symbols/glyphs';
import { buildResultLabelsFromScene, singleHopSegmentRefs } from '../src/ui/sld/v3/canvas/resultLabels';
import { computeResultLabelPlacements } from '../src/ui/sld/v3/canvas/SldCanvasV3';
import { resultLabelLinesForLod } from '../src/ui/sld/v3/canvas/resultLabelTemplates';
import type { EnergyNetworkModel } from '../src/types/enm';
import type { RawOverlayElement, RawOverlayPayload } from '../src/ui/sld-overlay/rawResultOverlayStore';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.CANON_OUT ?? '/tmp/canon';
mkdirSync(OUT, { recursive: true });

const enmPath = resolve(here, '..', 'src', 'ui', 'sld', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json');
const enm = (JSON.parse(readFileSync(enmPath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

const scene = buildSceneV3(enm, 2);
const singleHop = singleHopSegmentRefs(enm);

const sourceRef = scene.symbols.find((s) => s.meta?.elementKind === 'source' && s.meta?.ownerRef)?.meta?.ownerRef;
const branchRefs = scene.segments
  .filter((s) => s.meta?.elementKind === 'segment' && s.meta.ownerRef && !s.meta.ownerRef.includes('#') && singleHop.has(s.meta.ownerRef))
  .map((s) => s.meta!.ownerRef!)
  .filter((ref, i, arr) => arr.indexOf(ref) === i);

function el(refId: string, kind: string, metrics: RawOverlayElement['metrics']): RawOverlayElement {
  return { ref_id: refId, kind, badges: [], metrics, severity: 'INFO' };
}
const elements: Record<string, RawOverlayElement> = {};
if (sourceRef) {
  elements[sourceRef] = el(sourceRef, 'generator', {
    P_MW: { code: 'P_MW', value: 6.546769, unit: 'MW', format_hint: 'fixed4' },
  });
}
// Przęsła: PEŁNA treść kontekstowa R1 (obc.→I→P) — 3 realne wartości = L2.
for (const ref of branchRefs) {
  elements[ref] = el(ref, 'branch', {
    LOADING_PCT: { code: 'LOADING_PCT', value: 72.5, unit: '%', format_hint: 'fixed1' },
    I_A: { code: 'I_A', value: 350, unit: 'A', format_hint: 'fixed1' },
    P_MW: { code: 'P_MW', value: 6.546769, unit: 'MW', format_hint: 'fixed4' },
  });
}
const payload: RawOverlayPayload = { run_id: 'r1-proof', analysis_type: 'load_flow', elements };

const resultLabelsByOwnerRef = buildResultLabelsFromScene(scene, payload, singleHop);
const placements = computeResultLabelPlacements(scene, resultLabelsByOwnerRef, [], 2);

// Przęsło do zbliżenia/LOD: pierwsze o etykiecie 3-liniowej (pełny kontekst).
const branchEntry = branchRefs.map((r) => resultLabelsByOwnerRef[r]).find((e) => e && e.lines.length >= 3);
const branchZoomRef = branchEntry?.ownerRef;
const branchSeg = scene.segments.find((s) => s.meta?.ownerRef === branchZoomRef);

// bbox całej sceny (przegląd)
const bxs: number[] = [];
const bys: number[] = [];
for (const s of scene.symbols) {
  const def = SYMBOL_DEFS[s.symbolId as SymbolId];
  bxs.push(s.x, s.x + def.width);
  bys.push(s.y, s.y + def.height);
}
for (const s of scene.segments) for (const p of s.points) { bxs.push(p.x); bys.push(p.y); }
const sceneMinX = Math.min(...bxs);
const sceneMinY = Math.min(...bys);
const sceneW = Math.max(...bxs) - sceneMinX;
const sceneH = Math.max(...bys) - sceneMinY;
const HEADER = 96;
const OVERVIEW_W = 2360;
const overviewScale = OVERVIEW_W / sceneW;
const overviewH = Math.round(sceneH * overviewScale);

// Panel B (zbliżenie przęsła z etykietą kontekstową)
const ZOOM_W = 1000;
const ZOOM_H = 360;
const segXsAll = branchSeg ? branchSeg.points.map((p) => p.x) : [sceneMinX];
const segYsAll = branchSeg ? branchSeg.points.map((p) => p.y) : [sceneMinY];
const zCx = (Math.min(...segXsAll) + Math.max(...segXsAll)) / 2;
const zCy = (Math.min(...segYsAll) + Math.max(...segYsAll)) / 2;
const zMinX = zCx - ZOOM_W / 2;
const zMinY = zCy - ZOOM_H / 2;
function inZoom(x: number, y: number, w = 0, h = 0): boolean {
  return x + w >= zMinX && x <= zMinX + ZOOM_W && y + h >= zMinY && y <= zMinY + ZOOM_H;
}

// Panel C (LOD strip) — stała wysokość
const LOD_H = 190;
const W = Math.max(OVERVIEW_W, ZOOM_W) + 40;
const H = HEADER + overviewH + 60 + ZOOM_H + 60 + LOD_H + 40;

const WIRE = '#8FA8BE';
const TXT = '#E8EEF4';
const SUB = '#9FB3C8';
const RESULT = '#B39DDB';
const BG = '#0E1621';

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const parts: string[] = [];

// ---- PANEL A: PRZEGLĄD ----
const AY = HEADER;
parts.push(
  `<text x="16" y="${AY - 8}" font-family="Inter, system-ui, sans-serif" font-size="13" font-weight="700" fill="${TXT}">` +
    `A · Przegląd całej sieci (skala ${overviewScale.toFixed(3)}×) — ${placements.length} etykiet kontekstowych zakotwiczonych, rozłącznych</text>`,
);
function oX(x: number): number { return 20 + (x - sceneMinX) * overviewScale; }
function oY(y: number): number { return AY + (y - sceneMinY) * overviewScale; }
for (const seg of scene.segments) {
  const d = seg.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${oX(p.x).toFixed(1)},${oY(p.y).toFixed(1)}`).join(' ');
  parts.push(`<path d="${d}" fill="none" stroke="${WIRE}" stroke-width="0.4" opacity="0.6"/>`);
}
for (const p of placements) {
  parts.push(
    `<rect x="${oX(p.x).toFixed(1)}" y="${oY(p.y).toFixed(1)}" width="${(p.width * overviewScale).toFixed(1)}" height="${(p.height * overviewScale).toFixed(1)}" ` +
      `rx="1" fill="${RESULT}" stroke="${RESULT}" stroke-width="0.5"/>`,
  );
}

// ---- PANEL B: ZBLIŻENIE (etykieta kontekstowa 3-liniowa: obc./I/P) ----
const BY = AY + overviewH + 60;
parts.push(
  `<text x="16" y="${BY - 8}" font-family="Inter, system-ui, sans-serif" font-size="13" font-weight="700" fill="${TXT}">` +
    `B · Zbliżenie przęsła (skala 1:1) — treść zależna od typu elementu: obciążenie · prąd · moc czynna (ZE ZNAKIEM)</text>`,
);
parts.push(`<rect x="20" y="${BY}" width="${ZOOM_W}" height="${ZOOM_H}" fill="none" stroke="#25384A" stroke-width="1" rx="4"/>`);
function zX(x: number): number { return 20 + (x - zMinX); }
function zY(y: number): number { return BY + (y - zMinY); }
for (const seg of scene.segments) {
  const sx = seg.points.map((p) => p.x);
  const sy = seg.points.map((p) => p.y);
  if (!inZoom(Math.min(...sx), Math.min(...sy), Math.max(...sx) - Math.min(...sx), Math.max(...sy) - Math.min(...sy))) continue;
  const d = seg.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${zX(p.x).toFixed(1)},${zY(p.y).toFixed(1)}`).join(' ');
  parts.push(`<path d="${d}" fill="none" stroke="${WIRE}" stroke-width="1.3"/>`);
}
for (const s of scene.symbols) {
  const def = SYMBOL_DEFS[s.symbolId as SymbolId];
  const Glyph = SYMBOL_GLYPHS[s.symbolId as SymbolId];
  if (!def || !Glyph || !inZoom(s.x, s.y, def.width, def.height)) continue;
  parts.push(
    `<g transform="translate(${zX(s.x).toFixed(1)},${zY(s.y).toFixed(1)})">` +
      renderToStaticMarkup(<Glyph x={0} y={0} state={s.state as 'closed' | 'open' | 'unknown' | undefined} stroke={TXT} />) +
      `</g>`,
  );
}
const lineH = 13;
for (const p of placements) {
  if (!inZoom(p.x, p.y, p.width, p.height)) continue;
  const bx = zX(p.x);
  const by = zY(p.y);
  parts.push(`<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${p.width.toFixed(1)}" height="${p.height.toFixed(1)}" rx="2" fill="${BG}" stroke="${RESULT}" stroke-width="1"/>`);
  p.lines.forEach((line, i) => {
    parts.push(
      `<text x="${(bx + p.width / 2).toFixed(1)}" y="${(by + 4 + lineH * (i + 0.5)).toFixed(1)}" text-anchor="middle" ` +
        `font-family="Inter, system-ui, sans-serif" font-size="11" font-weight="600" fill="${RESULT}">${escapeXml(`${line.prefix} ${line.text}`)}</text>`,
    );
  });
}

// ---- PANEL C: ZWIJANIE LOD (wym. 5) tej samej etykiety przęsła ----
const CY = BY + ZOOM_H + 60;
parts.push(
  `<text x="16" y="${CY - 8}" font-family="Inter, system-ui, sans-serif" font-size="13" font-weight="700" fill="${TXT}">` +
    `C · Zwijanie wg LOD (histereza S8) — ta sama etykieta przęsła: L0 nic · L1 jedna wartość · L2 2–3 wartości</text>`,
);
const lodBox = (label: string, lines: readonly { readonly prefix: string; readonly text: string }[], x: number): void => {
  const boxW = 210;
  const boxH = LOD_H - 40;
  parts.push(`<rect x="${x}" y="${CY}" width="${boxW}" height="${boxH}" rx="4" fill="none" stroke="#25384A" stroke-width="1"/>`);
  parts.push(
    `<text x="${x + boxW / 2}" y="${CY + 20}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="12" font-weight="700" fill="${SUB}">${escapeXml(label)}</text>`,
  );
  if (lines.length === 0) {
    parts.push(
      `<text x="${x + boxW / 2}" y="${CY + boxH / 2 + 10}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="11" fill="${SUB}" opacity="0.6">(bez etykiet)</text>`,
    );
    return;
  }
  lines.forEach((line, i) => {
    parts.push(
      `<text x="${x + boxW / 2}" y="${CY + 46 + i * 20}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="13" font-weight="600" fill="${RESULT}">${escapeXml(`${line.prefix} ${line.text}`)}</text>`,
    );
  });
};
const entryLines = branchEntry?.lines ?? [];
lodBox('L0', resultLabelLinesForLod(entryLines, 0), 20);
lodBox('L1', resultLabelLinesForLod(entryLines, 1), 250);
lodBox('L2', resultLabelLinesForLod(entryLines, 2), 480);

const title =
  `<text x="16" y="30" font-family="Inter, system-ui, sans-serif" font-size="19" font-weight="700" fill="${TXT}">` +
  `R1 · Warstwa wynikowa KONTEKSTOWA (rozpływ) na L2 — treść wg typu elementu × analizy, scena realna sldSubstrate52s</text>` +
  `<text x="16" y="52" font-family="Inter, system-ui, sans-serif" font-size="12" fill="${SUB}">` +
  `Rejestr szablonów (typ elementu × analiza) → treść zależna od elementu; znak +/− = kierunek (§wym.3); zwijanie wg LOD (§wym.5); geometria bazowa nietknięta (§11).</text>` +
  `<text x="16" y="72" font-family="Inter, system-ui, sans-serif" font-size="11" fill="${SUB}">` +
  `Źródło liczb: obc. 72,5 % + I 350 A — test_result_contract_v1.py; P +6,5468 MW — sldSubstrate52s.powerflow.json (bieg NR). Wartości 1:1 (§0), zero fizyki w UI.</text>`;

const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
  `<rect width="${W}" height="${H}" fill="${BG}"/>${title}${parts.join('')}</svg>`;

writeFileSync(`${OUT}/r1-l2-wyniki-kontekst.svg`, svg);
console.log('wrote', `${OUT}/r1-l2-wyniki-kontekst.svg`, `(${placements.length} etykiet, zoom branch=${branchZoomRef ?? 'brak'}, W=${W} H=${H})`);
