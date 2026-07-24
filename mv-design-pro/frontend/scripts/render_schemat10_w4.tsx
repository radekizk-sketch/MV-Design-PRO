/**
 * SCHEMAT-10 W4 (RECENZJA_L2_POLA_WYPOSAZENIE_2026-07 §8/§9/§16) — dowód
 * wizualny warstwy LICZBOWYCH etykiet wynikowych §8 na L2. REALNA scena
 * `buildSceneV3(sldSubstrate52s, L2)` + warstwa liczb zbudowana produkcyjnym
 * potokiem: `buildResultLabelsFromScene` (kanał `overlay.resultLabelsByOwnerRef`)
 * → `computeResultLabelPlacements` (declutter, ta sama funkcja co kanwa). Rysunek
 * bazowy (segmenty/symbole/etykiety) NIETKNIĘTY — warstwa liczb NAD sceną (§9
 * zero zmiany geometrii). Etykiety zakotwiczone do właściciela (§17): źródło pod
 * symbolem; przęsła przy środku biegu; declutter → brak kolizji (§8).
 *
 * ŹRÓDŁO LICZB (zakaz wymyślania — dyrektywa 2026-07-18; wartości z realnych
 * biegów/kontraktów zapisanych w repo):
 *  - P źródła +6,5468 MW: `src/ui/sld/v2/geometry/__tests__/fixtures/
 *    sldSubstrate52s.powerflow.json` branch_flow seg/0c7e6284…/segment_L
 *    p_from_mw=6.546769 (realny bieg newton-raphson tej samej sieci);
 *  - obciążenie przęseł 72,5 %: `backend/tests/test_result_contract_v1.py`
 *    (kontraktowa wartość ResultsContractV1 loading_pct=72.5).
 * Payload zakluczowany REALNYMI `ownerRef` odczytanymi ze sceny (zero
 * wymyślonych refów). Uwaga produkcyjna: szyny GPZ o refie kompozytowym
 * (`#bus-primary`) nie mapują na klucz payloadu (znana luka adaptera, ta sama
 * co energizacja/flow) — dlatego dowód pokazuje źródło (symbol) i przęsła
 * (realny segmentRef), gdzie mapowanie jest udowodnione; U/Ik″ węzła pokryte
 * testami jednostkowymi (`resultLabels.test.ts`).
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   CANON_OUT=<dir> npx vite-node scripts/render_schemat10_w4.tsx
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
import type { EnergyNetworkModel } from '../src/types/enm';
import type { RawOverlayElement, RawOverlayPayload } from '../src/ui/sld-overlay/rawResultOverlayStore';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.CANON_OUT ?? '/tmp/canon';
mkdirSync(OUT, { recursive: true });

const enmPath = resolve(here, '..', 'src', 'ui', 'sld', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json');
const enm = (JSON.parse(readFileSync(enmPath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

const scene = buildSceneV3(enm, 2);
const singleHop = singleHopSegmentRefs(enm);

// Payload REALNIE zakluczowany: źródło + wybrane przęsła jednokawałkowe sceny.
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
for (const ref of branchRefs) {
  elements[ref] = el(ref, 'branch', { LOADING_PCT: { code: 'LOADING_PCT', value: 72.5, unit: '%', format_hint: 'fixed1' } });
}
const payload: RawOverlayPayload = { run_id: 'w4-proof', analysis_type: 'load_flow', elements };

const resultLabelsByOwnerRef = buildResultLabelsFromScene(scene, payload, singleHop);
const allPlacements = computeResultLabelPlacements(scene, resultLabelsByOwnerRef);

// DWA panele: (A) PRZEGLĄD całej sceny skalowany — dowód rozkładu warstwy
// (każda etykieta zakotwiczona do realnego elementu, rozłączne, brak dryfu);
// (B) ZBLIŻENIE wokół źródła — jedna etykieta czytelna (P ze znakiem, §16).
// Pełna scena jest szeroka (~14 000 px), stąd skalowanie w panelu przeglądu.
const placements = allPlacements;
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
// Panel A skala
const OVERVIEW_W = 2360;
const overviewScale = OVERVIEW_W / sceneW;
const overviewH = Math.round(sceneH * overviewScale);
// Panel B (zbliżenie źródła)
const srcSym = scene.symbols.find((s) => s.meta?.ownerRef === sourceRef);
const ZOOM_W = 1000;
const ZOOM_H = 360;
const zCx = srcSym ? srcSym.x + SYMBOL_DEFS[srcSym.symbolId as SymbolId].width / 2 : sceneMinX;
const zCy = srcSym ? srcSym.y + SYMBOL_DEFS[srcSym.symbolId as SymbolId].height / 2 : sceneMinY;
const zMinX = zCx - 160;
const zMinY = zCy - ZOOM_H / 2;
function inZoom(x: number, y: number, w = 0, h = 0): boolean {
  return x + w >= zMinX && x <= zMinX + ZOOM_W && y + h >= zMinY && y <= zMinY + ZOOM_H;
}
const W = Math.max(OVERVIEW_W, ZOOM_W) + 40;
const H = HEADER + overviewH + 60 + ZOOM_H + 60;

const WIRE = '#8FA8BE';
const TXT = '#E8EEF4';
const SUB = '#9FB3C8';
const RESULT = '#B39DDB';
const BG = '#0E1621';

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const parts: string[] = [];

// ---- PANEL A: PRZEGLĄD całej sceny (skalowany) ----
const AY = HEADER; // górny y panelu A
parts.push(
  `<text x="16" y="${AY - 8}" font-family="Inter, system-ui, sans-serif" font-size="13" font-weight="700" fill="${TXT}">` +
    `A · Przegląd całej sieci (skala ${overviewScale.toFixed(3)}×) — rozkład warstwy liczb: ${placements.length} etykiet zakotwiczonych, rozłącznych</text>`,
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

// ---- PANEL B: ZBLIŻENIE wokół źródła (skala 1:1, czytelne) ----
const BY = AY + overviewH + 60;
parts.push(
  `<text x="16" y="${BY - 8}" font-family="Inter, system-ui, sans-serif" font-size="13" font-weight="700" fill="${TXT}">` +
    `B · Zbliżenie źródła (skala 1:1) — etykieta P generacji ZE ZNAKIEM (§16), 1:1 z wyniku (§0)</text>`,
);
parts.push(`<rect x="20" y="${BY}" width="${ZOOM_W}" height="${ZOOM_H}" fill="none" stroke="#25384A" stroke-width="1" rx="4"/>`);
function zX(x: number): number { return 20 + (x - zMinX); }
function zY(y: number): number { return BY + (y - zMinY); }
for (const seg of scene.segments) {
  const segXs = seg.points.map((p) => p.x);
  const segYs = seg.points.map((p) => p.y);
  if (!inZoom(Math.min(...segXs), Math.min(...segYs), Math.max(...segXs) - Math.min(...segXs), Math.max(...segYs) - Math.min(...segYs))) continue;
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
for (const l of scene.labels) {
  const r = l.rect;
  if (!inZoom(r.x, r.y, r.width, r.height)) continue;
  const fx = zX(r.x + r.width / 2);
  const fy = zY(r.y + r.height / 2);
  const rot = l.rotated ? ` transform="rotate(-90 ${fx.toFixed(1)} ${fy.toFixed(1)})"` : '';
  parts.push(
    `<text x="${fx.toFixed(1)}" y="${(fy + 3).toFixed(1)}"${rot} text-anchor="middle" font-family="Inter, system-ui, sans-serif" ` +
      `font-size="9" fill="${SUB}" opacity="0.55">${escapeXml(l.text)}</text>`,
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

const title =
  `<text x="16" y="30" font-family="Inter, system-ui, sans-serif" font-size="19" font-weight="700" fill="${TXT}">` +
  `W4 · Warstwa liczbowych etykiet wynikowych §8 na L2 (rozpływ) — scena realna sldSubstrate52s</text>` +
  `<text x="16" y="52" font-family="Inter, system-ui, sans-serif" font-size="12" fill="${SUB}">` +
  `Liczby (lawenda) NAD rysunkiem bazowym, zakotwiczone do właściciela (§17), declutter → brak kolizji (§8); geometria bazowa nietknięta (§9).</text>` +
  `<text x="16" y="72" font-family="Inter, system-ui, sans-serif" font-size="11" fill="${SUB}">` +
  `Źródło liczb: P +6,5468 MW — sldSubstrate52s.powerflow.json (bieg NR); obc. 72,5 % — test_result_contract_v1.py. Wartości 1:1 (§0), zero fizyki w UI.</text>`;

const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
  `<rect width="${W}" height="${H}" fill="${BG}"/>${title}${parts.join('')}</svg>`;

writeFileSync(`${OUT}/w4-l2-wyniki.svg`, svg);
console.log('wrote', `${OUT}/w4-l2-wyniki.svg`, `(${placements.length} etykiet wyników, W=${W} H=${H})`);
