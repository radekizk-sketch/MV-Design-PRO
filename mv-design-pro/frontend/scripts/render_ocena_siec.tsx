/**
 * OCENA SIECI (2026-07-24) — zrzuty żywej aplikacji do oceny właściciela po
 * scaleniu programów WYNIKI-SLD, DOBOR-OZE, MODEL SOLVERA TR, CT/VT, KROPKA.
 * Sieć referencyjna: `sldSubstrate52s` (53 stacje) — realny model + realny
 * bieg Newton-Raphson (`sldSubstrate52s.powerflow.json`, p_from_mw 1:1).
 * Zrzuty:
 *  - ocena-l0/l1/l2 : PEŁNA sieć na L0/L1/L2 produkcyjną kanwą SldCanvasV3
 *    (histereza LOD S8; sylwetka/rozdzielnia/tor mocy) — „wszystko LOD".
 *  - ocena-gpz      : DETAL GPZ (źródło + rozdzielnia sieciowa) w powiększeniu.
 *  - ocena-wyniki   : PEŁNA sieć L2 z WARSTWĄ WYNIKOWĄ (R1–R4) — realne moce
 *    czynne przęseł z biegu NR, znak +/− = kierunek, priorytety/agregacja R2.
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   CANON_OUT=<dir> npx vite-node scripts/render_ocena_siec.tsx
 *   CANON_OUT=<dir> node scripts/rasterize.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderToStaticMarkup } from 'react-dom/server';

import type { EnergyNetworkModel } from '../src/types/enm';
import { buildSceneV3, SCENE_LOD_LABELS_PL } from '../src/ui/sld/v3/scene/buildScene';
import { SldCanvasV3 } from '../src/ui/sld/v3/canvas/SldCanvasV3';
import { SYMBOL_DEFS, type SymbolId } from '../src/ui/sld/v3/symbols/defs';
import { SYMBOL_GLYPHS } from '../src/ui/sld/v3/symbols/glyphs';
import { buildResultLabelsFromScene, singleHopSegmentRefs } from '../src/ui/sld/v3/canvas/resultLabels';
import { computeResultLabelPlacements } from '../src/ui/sld/v3/canvas/SldCanvasV3';
import { CANVAS_BACKGROUND } from '../src/ui/sld/v3/theme/colorTokens';
import type { RawOverlayElement, RawOverlayPayload } from '../src/ui/sld-overlay/rawResultOverlayStore';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.CANON_OUT ?? '/tmp/canon';
mkdirSync(OUT, { recursive: true });

const enmPath = resolve(HERE, '../src/ui/sld/v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json');
const enm = (JSON.parse(readFileSync(enmPath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;
const pfPath = resolve(HERE, '../src/ui/sld/v2/geometry/__tests__/fixtures/sldSubstrate52s.powerflow.json');
const pf = JSON.parse(readFileSync(pfPath, 'utf8')) as {
  readonly branch_flow: Record<string, { readonly direction: string; readonly p_from_mw?: number }>;
  readonly solver_method: string;
  readonly case_label: string;
};

const TXT = '#E8EEF4';
const SUB = '#9FB3C8';
const RESULT = '#B39DDB';
const WIRE = '#8FA8BE';
const FOOTER = 64;

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Produkcyjna kanwa SldCanvasV3 na wskazanym LOD + pas stopki z opisem opcji. */
function renderCanvasLod(lod: 0 | 1 | 2, opcje: string, file: string): void {
  const W = 2000;
  const H = 1180;
  const scene = buildSceneV3(enm, lod);
  const inner = renderToStaticMarkup(
    <SldCanvasV3 snapshot={enm} width={W} height={H} lodOverride={lod} />,
  ).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
  const line1 = `Widok: ${SCENE_LOD_LABELS_PL[lod]} (L${lod}) · sieć terenowa ${scene.meta.stationCount} stacji · produkcyjna kanwa SLD v3`;
  const footer =
    `<rect x="0" y="${H}" width="${W}" height="${FOOTER}" fill="${CANVAS_BACKGROUND}" />` +
    `<text x="18" y="${H + 26}" font-family="Inter, system-ui, sans-serif" font-size="21" font-weight="600" fill="${TXT}">${escapeXml(line1)}</text>` +
    `<text x="18" y="${H + 50}" font-family="Inter, system-ui, sans-serif" font-size="14" fill="${SUB}">Opcje: ${escapeXml(opcje)}</text>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H + FOOTER}" viewBox="0 0 ${W} ${H + FOOTER}">` +
    `<rect width="${W}" height="${H + FOOTER}" fill="${CANVAS_BACKGROUND}"/>${inner}${footer}</svg>`;
  writeFileSync(`${OUT}/${file}.svg`, svg);
  console.log('wrote', `${file}.svg`, `stacje=${scene.meta.stationCount}`);
}

// --- (1) Wszystkie LOD pełnej sieci -----------------------------------------
renderCanvasLod(0, 'histereza LOD (S8) · sylwetka stacji mini-RMU · rozdzielnia sieciowa/GPZ · tor mocy z wagą', 'ocena-l0');
renderCanvasLod(1, 'histereza LOD · rozwinięcie pól/aparatów · kropki połączeń węzłowych (IEC 60617)', 'ocena-l1');
renderCanvasLod(2, 'pełne pola i aparaty · oznaczenia z danych · CT/VT · podwarstwy L2-A/B/C/D', 'ocena-l2');

// --- (2) Detal GPZ (źródło + rozdzielnia) -----------------------------------
{
  const scene = buildSceneV3(enm, 2);
  // GPZ = symbol źródła; okno detalu wokół niego.
  const src = scene.symbols.find((s) => s.meta?.elementKind === 'source');
  const cx = src ? src.x + (SYMBOL_DEFS[src.symbolId as SymbolId]?.width ?? 0) / 2 : 0;
  const cy = src ? src.y + (SYMBOL_DEFS[src.symbolId as SymbolId]?.height ?? 0) / 2 : 0;
  const WIN_W = 1500;
  const WIN_H = 900;
  const SCALE = 1.6; // powiększenie detalu GPZ
  const minX = cx - WIN_W / (2 * SCALE);
  const minY = cy - WIN_H / (2 * SCALE);
  const inWin = (x: number, y: number, w = 0, h = 0): boolean =>
    x + w >= minX && x <= minX + WIN_W / SCALE && y + h >= minY && y <= minY + WIN_H / SCALE;
  const tx = (x: number): number => (x - minX) * SCALE;
  const ty = (y: number): number => (y - minY) * SCALE;
  const HEADER = 78;
  const parts: string[] = [];
  for (const seg of scene.segments) {
    const xs = seg.points.map((p) => p.x);
    const ys = seg.points.map((p) => p.y);
    if (!inWin(Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))) continue;
    const d = seg.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${tx(p.x).toFixed(1)},${(ty(p.y) + HEADER).toFixed(1)}`).join(' ');
    parts.push(`<path d="${d}" fill="none" stroke="${WIRE}" stroke-width="1.6"/>`);
  }
  for (const s of scene.symbols) {
    const def = SYMBOL_DEFS[s.symbolId as SymbolId];
    const Glyph = SYMBOL_GLYPHS[s.symbolId as SymbolId];
    if (!def || !Glyph || !inWin(s.x, s.y, def.width, def.height)) continue;
    parts.push(
      `<g transform="translate(${tx(s.x).toFixed(1)},${(ty(s.y) + HEADER).toFixed(1)}) scale(${SCALE})">` +
        renderToStaticMarkup(<Glyph x={0} y={0} state={s.state as 'closed' | 'open' | 'unknown' | undefined} stroke={TXT} />) +
        `</g>`,
    );
  }
  for (const lab of scene.labels) {
    if (!inWin(lab.x, lab.y)) continue;
    parts.push(
      `<text x="${tx(lab.x).toFixed(1)}" y="${(ty(lab.y) + HEADER).toFixed(1)}" font-family="Inter, system-ui, sans-serif" ` +
        `font-size="${Math.max(9, (lab.fontSize ?? 11) * SCALE * 0.5).toFixed(0)}" fill="${SUB}">${escapeXml(lab.text)}</text>`,
    );
  }
  const title =
    `<text x="18" y="32" font-family="Inter, system-ui, sans-serif" font-size="21" font-weight="700" fill="${TXT}">` +
    `Detal GPZ — źródło sieciowe + rozdzielnia (L2, ×${SCALE})</text>` +
    `<text x="18" y="56" font-family="Inter, system-ui, sans-serif" font-size="14" fill="${SUB}">` +
    `Opcje: pola liniowe/transformatorowe · OLTC (przesunięcie fazowe grupy SM-2 w PF) · aparaty z oznaczeniami z danych · kropki węzłów</text>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIN_W}" height="${WIN_H + HEADER}" viewBox="0 0 ${WIN_W} ${WIN_H + HEADER}">` +
    `<rect width="${WIN_W}" height="${WIN_H + HEADER}" fill="${CANVAS_BACKGROUND}"/>${title}${parts.join('')}</svg>`;
  writeFileSync(`${OUT}/ocena-gpz.svg`, svg);
  console.log('wrote', 'ocena-gpz.svg', src ? `src=${src.meta?.ownerRef}` : 'brak src');
}

// --- (3) Pełna sieć L2 z warstwą wynikową (realne P z biegu NR) --------------
{
  const scene = buildSceneV3(enm, 2);
  const singleHop = singleHopSegmentRefs(enm);
  // Payload wyników: realne p_from_mw per przęsło z biegu NR (zero fabrykacji).
  const elements: Record<string, RawOverlayElement> = {};
  let nWyniki = 0;
  for (const seg of scene.segments) {
    const ref = seg.meta?.ownerRef;
    if (!ref || ref.includes('#')) continue;
    // dopasowanie po prefiksie ref w kluczach branch_flow (seg/HASH/...)
    const flowKey = Object.keys(pf.branch_flow).find((k) => k === ref || k.startsWith(ref + '/') || ref.startsWith(k));
    const p = flowKey ? pf.branch_flow[flowKey]?.p_from_mw : undefined;
    if (p == null || elements[ref]) continue;
    elements[ref] = {
      ref_id: ref,
      kind: 'branch',
      badges: [],
      metrics: { P_MW: { code: 'P_MW', value: p, unit: 'MW', format_hint: 'fixed3' } },
      severity: 'INFO',
    };
    nWyniki += 1;
  }
  const payload: RawOverlayPayload = {
    run_id: 'ocena-nr',
    analysis_type: 'load_flow',
    elements,
  };
  const resultLabels = buildResultLabelsFromScene(scene, payload, singleHop);
  const placements = computeResultLabelPlacements(scene, resultLabels, [], 2);

  // bbox sceny
  const bxs: number[] = [];
  const bys: number[] = [];
  for (const s of scene.symbols) {
    const def = SYMBOL_DEFS[s.symbolId as SymbolId];
    bxs.push(s.x, s.x + (def?.width ?? 0));
    bys.push(s.y, s.y + (def?.height ?? 0));
  }
  for (const s of scene.segments) for (const p of s.points) { bxs.push(p.x); bys.push(p.y); }
  const minX = Math.min(...bxs);
  const minY = Math.min(...bys);
  const sceneW = Math.max(...bxs) - minX;
  const sceneH = Math.max(...bys) - minY;
  const HEADER = 88;
  const CW = 2800;
  const scale = CW / sceneW;
  const CH = Math.round(sceneH * scale) + HEADER + 20;
  const tx = (x: number): number => 20 + (x - minX) * scale;
  const ty = (y: number): number => HEADER + (y - minY) * scale;

  const parts: string[] = [];
  for (const seg of scene.segments) {
    const d = seg.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${tx(p.x).toFixed(1)},${ty(p.y).toFixed(1)}`).join(' ');
    parts.push(`<path d="${d}" fill="none" stroke="${WIRE}" stroke-width="0.8" opacity="0.75"/>`);
  }
  for (const s of scene.symbols) {
    const def = SYMBOL_DEFS[s.symbolId as SymbolId];
    const Glyph = SYMBOL_GLYPHS[s.symbolId as SymbolId];
    if (!def || !Glyph) continue;
    parts.push(
      `<g transform="translate(${tx(s.x).toFixed(1)},${ty(s.y).toFixed(1)}) scale(${scale})">` +
        renderToStaticMarkup(<Glyph x={0} y={0} state={s.state as 'closed' | 'open' | 'unknown' | undefined} stroke={TXT} />) +
        `</g>`,
    );
  }
  // Warstwa wynikowa: etykiety P na przęsłach (placements produkcyjne).
  const lineH = 5.6;
  for (const p of placements) {
    parts.push(
      `<rect x="${tx(minX + (p.x - minX)).toFixed(1)}" y="${ty(minY + (p.y - minY)).toFixed(1)}" ` +
        `width="${(p.width * scale).toFixed(1)}" height="${(p.height * scale).toFixed(1)}" rx="1.5" ` +
        `fill="${CANVAS_BACKGROUND}" stroke="${RESULT}" stroke-width="0.6"/>`,
    );
    p.lines.forEach((line, i) => {
      parts.push(
        `<text x="${(tx(minX + (p.x - minX)) + (p.width * scale) / 2).toFixed(1)}" ` +
          `y="${(ty(minY + (p.y - minY)) + lineH * (i + 1)).toFixed(1)}" text-anchor="middle" ` +
          `font-family="Inter, system-ui, sans-serif" font-size="5.2" font-weight="600" fill="${RESULT}">${escapeXml(`${line.prefix} ${line.text}`)}</text>`,
      );
    });
  }
  const title =
    `<text x="18" y="32" font-family="Inter, system-ui, sans-serif" font-size="22" font-weight="700" fill="${TXT}">` +
    `Sieć terenowa L2 z WARSTWĄ WYNIKOWĄ — rozpływ mocy (Newton-Raphson), ${nWyniki} przęseł z realną mocą czynną</text>` +
    `<text x="18" y="58" font-family="Inter, system-ui, sans-serif" font-size="14" fill="${SUB}">` +
    `Wartości 1:1 z biegu NR (sldSubstrate52s.powerflow.json) · znak +/− = kierunek · ${placements.length} etykiet po deklutterze (priorytety/agregacja R2) · zero fizyki w UI</text>` +
    `<text x="18" y="78" font-family="Inter, system-ui, sans-serif" font-size="13" fill="${SUB}">` +
    `Opcje warstwy: filtry (P/Q/I/U/przeciążenia) · progi severity · klik→panel/White Box · pochodzenie (moduł+czas) · tryb porównawczy · eksport SVG/PNG/PDF</text>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CW + 40}" height="${CH}" viewBox="0 0 ${CW + 40} ${CH}">` +
    `<rect width="${CW + 40}" height="${CH}" fill="${CANVAS_BACKGROUND}"/>${title}${parts.join('')}</svg>`;
  writeFileSync(`${OUT}/ocena-wyniki-l2.svg`, svg);
  console.log('wrote', 'ocena-wyniki-l2.svg', `wyniki=${nWyniki} etykiet=${placements.length}`);
}
