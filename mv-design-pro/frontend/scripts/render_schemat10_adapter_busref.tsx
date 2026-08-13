/**
 * ADAPTER-BUSREF (dług W4/R2/V12K-163) — dowód wizualny L2: szyny GPZ o refie
 * KOMPOZYTOWYM dostają wyniki U/δ dopiero po powiązaniu z KANONICZNYM `Bus.ref_id`
 * ze snapshotu ENM (metadana addytywna `busResultRef`).
 *
 * Dwa panele na REALNEJ scenie `buildSceneV3(sldSubstrate52s, L2)` z payloadem
 * kluczowanym KANONICZNIE (jak backend — po `Bus.ref_id`):
 *   PRZED — warstwa wynikowa dopasowuje po `ownerRef` (kompozyt sceny);
 *           szyny GPZ (`#bus-primary`/`#hv-bus`) NIE mapują ⇒ węzły bez U/δ.
 *   PO    — warstwa dopasowuje po `busResultRef` (kanoniczny ref, `resultRefForSegment`);
 *           szyny GPZ dostają U/δ. Rysunek bazowy (geometria) IDENTYCZNY.
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   CANON_OUT=<dir> npx vite-node scripts/render_schemat10_adapter_busref.tsx
 *   CANON_OUT=<dir> node scripts/rasterize.mjs
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { buildSceneV3, type SceneV3 } from '../src/ui/sld/v3/scene/buildScene';
import { buildResultLabelsFromScene, orientedSegmentRefs } from '../src/ui/sld/v3/canvas/resultLabels';
import { layoutResultLabels } from '../src/ui/sld/v3/canvas/SldCanvasV3';
import { SYMBOL_DEFS } from '../src/ui/sld/v3/symbols/defs';
import type { EnergyNetworkModel } from '../src/types/enm';
import type { RawOverlayElement, RawOverlayPayload } from '../src/ui/sld-overlay/rawResultOverlayStore';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.CANON_OUT ?? '/tmp/canon';
mkdirSync(OUT, { recursive: true });

const enmPath = resolve(here, '..', 'src', 'ui', 'sld', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json');
const enm = (JSON.parse(readFileSync(enmPath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;
const GPZ_PREFIX = 'gpz/1021aa18ea28ab398f1166359a58215a';

const scene = buildSceneV3(enm, 2);
// Bramka przesel: KLUCZE mapy orientacji (`orientedSegmentRefs`) — dokumentowany
// zamiennik usunietej `singleHopSegmentRefs`, ta sama derywacja co produkcja
// (`SldCanvasV3Workspace.buildResultLabelsForSnapshot`).
const singleHop = new Set(orientedSegmentRefs(enm).keys());

function el(refId: string, kind: string, metrics: RawOverlayElement['metrics'], severity = 'INFO'): RawOverlayElement {
  return { ref_id: refId, kind, badges: [], metrics, severity };
}

// Payload KANONICZNY (jak backend): szyny kluczowane po realnym Bus.ref_id
// (`busResultRef` dla GPZ, `ownerRef` dla stacji), TR/źródła po ownerRef.
const elements: Record<string, RawOverlayElement> = {};
for (const s of scene.symbols) {
  const k = s.meta?.elementKind;
  const ref = s.meta?.ownerRef;
  if (k === 'transformer' && ref && !elements[ref]) elements[ref] = el(ref, 'transformer', { S_MVA: { code: 'S_MVA', value: 0.63, unit: 'MVA', format_hint: 'fixed2' } });
  if (k === 'source' && ref && !elements[ref]) elements[ref] = el(ref, 'generator', { P_MW: { code: 'P_MW', value: 6.546769, unit: 'MW', format_hint: 'fixed4' } });
}
for (const s of scene.segments) {
  const k = s.meta?.elementKind;
  if (k === 'bus') {
    const busRef = s.meta?.busResultRef ?? s.meta?.ownerRef;
    if (busRef && !elements[busRef]) {
      elements[busRef] = el(busRef, 'bus', {
        U_kV: { code: 'U_kV', value: 15.31, unit: 'kV', format_hint: 'fixed2' },
        ANGLE_DEG: { code: 'ANGLE_DEG', value: -0.8, unit: '°', format_hint: 'fixed2' },
      });
    }
  }
}
const payload: RawOverlayPayload = { run_id: 'run-busref', analysis_type: 'load_flow', elements };

// PO — potok produkcyjny (dopasowanie po busResultRef).
const labelsAfter = buildResultLabelsFromScene(scene, payload, singleHop);

// PRZED — scena z USUNIĘTYM `busResultRef` na szynach (odtworzenie luki: warstwa
// dopasowuje po ownerRef kompozytowym, payload kanoniczny nie pasuje).
const sceneBefore: SceneV3 = {
  ...scene,
  segments: scene.segments.map((s) =>
    s.meta?.busResultRef ? { ...s, meta: { ...s.meta, busResultRef: undefined } } : s,
  ),
};
const labelsBefore = buildResultLabelsFromScene(sceneBefore, payload, singleHop);
type LabelMap = typeof labelsAfter;
void layoutResultLabels; // potok layoutu istnieje w produkcji; tu rysujemy wpisy wprost dla czytelnego dowodu

// -- Krop do regionu GPZ (elementy o ref z prefiksem GPZ). -------------------
const inGpz = (ref?: string): boolean => !!ref && ref.startsWith(GPZ_PREFIX);
// `PreviewElementMeta.bayRef` nie istnieje od przebudowy meta sceny; klauzula byla
// martwa (JS milczaco czytal `undefined`). POMIAR na sieci referencyjnej L2:
// 16 symboli ma `ownerRef` z prefiksem GPZ i DOKLADNIE 16 ma prefiks GPZ w
// jakimkolwiek polu `meta` — roznica ZERO, wiec `ownerRef` pokrywa caly zbior.
const gpzSyms = scene.symbols.filter((s) => inGpz(s.meta?.ownerRef));
const gpzSegs = scene.segments.filter((s) => inGpz(s.meta?.ownerRef));
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
for (const s of gpzSyms) {
  const def = SYMBOL_DEFS[s.symbolId];
  minX = Math.min(minX, s.x); minY = Math.min(minY, s.y);
  maxX = Math.max(maxX, s.x + def.width); maxY = Math.max(maxY, s.y + def.height);
}
for (const s of gpzSegs) for (const p of s.points) {
  minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
  maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
}
const PAD = 90; // miejsce na etykiety wynikowe (callouty)
minX -= PAD; minY -= PAD; maxX += PAD; maxY += PAD;
const cropW = maxX - minX, cropH = maxY - minY;

// -- Style ------------------------------------------------------------------
const BG = '#0E1621', PANEL_BG = '#12202E', WIRE = '#8FA8BE', BUS = '#5FA8D3';
const TXT = '#E8EEF4', SUB = '#9FB3C8', MISS = '#5A6B7A', HL = '#F2C14E';
function esc(s: string): string { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

const gpzBusOwnerRefs = new Set(gpzSegs.filter((s) => s.meta?.elementKind === 'bus').map((s) => s.meta!.ownerRef!));

function renderPanel(
  ox: number,
  oy: number,
  title: string,
  subtitle: string,
  labels: LabelMap,
  showGpzResult: boolean,
): string {
  const p: string[] = [];
  p.push(`<rect x="${ox}" y="${oy}" width="${cropW}" height="${cropH + 56}" rx="10" fill="${PANEL_BG}" stroke="#26384A"/>`);
  p.push(`<text x="${ox + 16}" y="${oy + 26}" font-family="Inter, system-ui, sans-serif" font-size="15" font-weight="700" fill="${TXT}">${esc(title)}</text>`);
  p.push(`<text x="${ox + 16}" y="${oy + 44}" font-family="Inter, system-ui, sans-serif" font-size="11" fill="${SUB}">${esc(subtitle)}</text>`);
  const tx = ox - minX, ty = oy + 56 - minY;
  p.push(`<g transform="translate(${tx},${ty})">`);
  // Segmenty (szyny grubsze/podświetlone).
  for (const s of gpzSegs) {
    const isBus = s.meta?.elementKind === 'bus';
    const d = s.points.map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt.x},${pt.y}`).join(' ');
    p.push(`<path d="${d}" fill="none" stroke="${isBus ? BUS : WIRE}" stroke-width="${isBus ? 4 : 1.4}" stroke-linecap="round"/>`);
  }
  // Symbole (proste prostokąty gabarytowe).
  for (const s of gpzSyms) {
    const def = SYMBOL_DEFS[s.symbolId];
    p.push(`<rect x="${s.x}" y="${s.y}" width="${def.width}" height="${def.height}" rx="2" fill="none" stroke="${WIRE}" stroke-width="1.1"/>`);
  }
  // Szyny GPZ: etykieta U/δ 1:1 z warstwy wynikowej (wpis mapy), gdy powiązana;
  // inaczej marker „brak U/δ" (odtworzenie luki dziedziczonej).
  for (const s of gpzSegs) {
    if (s.meta?.elementKind !== 'bus') continue;
    const ownerRef = s.meta!.ownerRef!;
    const mid = s.points[Math.floor(s.points.length / 2)] ?? s.points[0];
    const entry = labels[ownerRef];
    if (entry) {
      p.push(`<circle cx="${mid.x}" cy="${mid.y}" r="5" fill="none" stroke="${HL}" stroke-width="1.6"/>`);
      const lines = entry.lines.map((l) => `${l.prefix} ${l.text}`);
      lines.forEach((ln, i) => {
        p.push(`<text x="${mid.x + 10}" y="${mid.y - 8 + i * 13}" font-family="Inter, system-ui, sans-serif" font-size="12" font-weight="700" fill="${HL}">${esc(ln)}</text>`);
      });
    } else {
      p.push(`<circle cx="${mid.x}" cy="${mid.y}" r="5" fill="none" stroke="${MISS}" stroke-width="1.4" stroke-dasharray="3 3"/>`);
      p.push(`<text x="${mid.x + 10}" y="${mid.y - 8}" font-family="Inter, system-ui, sans-serif" font-size="11" fill="${MISS}">brak U/δ</text>`);
    }
  }
  void showGpzResult;
  p.push('</g>');
  return p.join('\n');
}

const GAP = 40, MARGIN = 24, HEADER = 64;
const panelW = cropW, panelH = cropH + 56;
const W = MARGIN * 2 + panelW * 2 + GAP;
const H = HEADER + panelH + MARGIN;

const parts: string[] = [];
parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(W)}" height="${Math.ceil(H)}" viewBox="0 0 ${Math.ceil(W)} ${Math.ceil(H)}">`);
parts.push(`<rect width="${Math.ceil(W)}" height="${Math.ceil(H)}" fill="${BG}"/>`);
parts.push(`<text x="${MARGIN}" y="30" font-family="Inter, system-ui, sans-serif" font-size="18" font-weight="800" fill="${TXT}">ADAPTER-BUSREF · szyny GPZ kompozytowe powiązane z wynikami (L2)</text>`);
parts.push(`<text x="${MARGIN}" y="50" font-family="Inter, system-ui, sans-serif" font-size="12" fill="${SUB}">Payload kluczowany kanonicznie (Bus.ref_id). Geometria bazowa identyczna — różni się WYŁĄCZNIE warstwa etykiet.</text>`);
parts.push(renderPanel(MARGIN, HEADER, 'PRZED — mapowanie po ownerRef', 'szyny GPZ: brak U/δ (ref #bus-primary/#hv-bus ≠ klucz payloadu)', labelsBefore, false));
parts.push(renderPanel(MARGIN + panelW + GAP, HEADER, 'PO — mapowanie po busResultRef', 'szyny GPZ: U 15,31 kV · δ -0,80° z payloadu (Bus.ref_id ze snapshotu)', labelsAfter, true));
parts.push('</svg>');

writeFileSync(resolve(OUT, 'adapter-busref-l2.svg'), parts.join('\n'), 'utf8');
const gpzBusEntriesBefore = [...gpzBusOwnerRefs].filter((r) => labelsBefore[r]).length;
const gpzBusEntriesAfter = [...gpzBusOwnerRefs].filter((r) => labelsAfter[r]).length;
console.log('render adapter-busref-l2.svg', {
  gpzBusCount: gpzBusOwnerRefs.size,
  gpzBusEntriesBefore,
  gpzBusEntriesAfter,
  crop: { minX, minY, cropW, cropH },
});
