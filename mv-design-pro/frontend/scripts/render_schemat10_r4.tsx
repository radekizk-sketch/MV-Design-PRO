/**
 * SCHEMAT-10 R4 (RECENZJA_WARSTWA_WYNIKOWA_2026-07 §wym.10/13/15/18; program
 * WYNIKI-SLD R4) — dowód wizualny FINAŁU warstwy wynikowej na L2:
 *  A · WARSTWY ANALITYCZNE na WSPÓLNYM rejestrze (wym.13): ta sama szyna, ten
 *      sam builder — payload LF ⇒ „U/δ", payload SC ⇒ „Ik″/ip/Ith/Sk". Żadnych
 *      forków renderera; przełączenie analizy = przełączenie payloadu.
 *  B · TRYB PORÓWNAWCZY + MINI TREND (wym.10/15): etykieta z Δ (ze znakiem) lub
 *      „poprzednia → bieżąca" + strzałka ↑/↓/→ z progu martwej strefy.
 *  C · EKSPORT (wym.18): warstwa wynikowa wchodzi do eksportu przez TĘ SAMĄ
 *      serializację co ekran (klon żywego SVG) — te same pozycje etykiet.
 *
 * WSZYSTKO produkcyjnym potokiem (`buildResultLabelsFromScene` z/bez
 * `comparison`, `layoutResultLabels`) — te same funkcje co kanwa. Rysunek bazowy
 * NIETKNIĘTY (§6 inwariant geometrii). ŹRÓDŁO LICZB (zakaz wymyślania): metryki
 * bieżące 1:1 z repo (obc. 72,5 % — test_result_contract_v1.py; U 15,02 kV —
 * kontrakt; Ik″ 12,5 kA — test_result_contract_v1.py). Wartości POPRZEDNIEGO
 * biegu w panelu B są ILUSTRACYJNE (dowód mechanizmu Δ/trendu) i jawnie tak
 * oznaczone — jak cykl severity w R3.
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   CANON_OUT=<dir> npx vite-node scripts/render_schemat10_r4.tsx
 *   CANON_OUT=<dir> node scripts/rasterize.mjs
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { buildSceneV3 } from '../src/ui/sld/v3/scene/buildScene';
import {
  buildResultLabelsFromScene,
  singleHopSegmentRefs,
  type ResultLabelComparison,
} from '../src/ui/sld/v3/canvas/resultLabels';
import { layoutResultLabels } from '../src/ui/sld/v3/canvas/SldCanvasV3';
import { formatContractValue } from '../src/ui/workspace/analysisRunContract';
import type { EnergyNetworkModel } from '../src/types/enm';
import type { RawOverlayElement, RawOverlayPayload } from '../src/ui/sld-overlay/rawResultOverlayStore';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.CANON_OUT ?? '/tmp/canon';
mkdirSync(OUT, { recursive: true });

const enmPath = resolve(here, '..', 'src', 'ui', 'sld', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json');
const enm = (JSON.parse(readFileSync(enmPath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

const scene = buildSceneV3(enm, 2);
const singleHop = singleHopSegmentRefs(enm);

function el(refId: string, kind: string, metrics: RawOverlayElement['metrics']): RawOverlayElement {
  return { ref_id: refId, kind, badges: [], metrics, severity: 'INFO' };
}

// Realny bus (kotwica + kanoniczny ref) i realne przęsło jednokawałkowe.
const busSeg = scene.segments.find((s) => s.meta?.elementKind === 'bus' && s.meta?.ownerRef)!;
const busOwnerRef = busSeg.meta!.ownerRef!;
const busRef = busSeg.meta!.busResultRef ?? busOwnerRef;
const branchRef = scene.segments.find(
  (s) => s.meta?.elementKind === 'segment' && s.meta.ownerRef && !s.meta.ownerRef.includes('#') && singleHop.has(s.meta.ownerRef),
)!.meta!.ownerRef!;

// ---- PANEL A: WSPÓLNY REJESTR — LF vs SC na tej samej szynie ----
const lfPayload: RawOverlayPayload = {
  run_id: 'lf-2f8c14',
  analysis_type: 'load_flow',
  elements: {
    [busRef]: el(busRef, 'bus', {
      U_kV: { code: 'U_kV', value: 15.02, unit: 'kV', format_hint: 'fixed2' },
      ANGLE_DEG: { code: 'ANGLE_DEG', value: -1.4, unit: '°', format_hint: 'fixed2' },
    }),
  },
};
const scPayload: RawOverlayPayload = {
  run_id: 'sc-9a4c02',
  analysis_type: 'short_circuit_3f',
  elements: {
    [busRef]: el(busRef, 'bus', {
      IK_3F_A: { code: 'IK_3F_A', value: 12.5, unit: 'kA', format_hint: 'fixed2' },
      IP_A: { code: 'IP_A', value: 116_910, unit: 'A', format_hint: 'fixed0' },
      ITH_A: { code: 'ITH_A', value: 116_910, unit: 'A', format_hint: 'fixed0' },
      SK_MVA: { code: 'SK_MVA', value: 325.0, unit: 'MVA', format_hint: 'fixed2' },
    }),
  },
};
const lfBus = buildResultLabelsFromScene(scene, lfPayload, singleHop)[busOwnerRef];
const scBus = buildResultLabelsFromScene(scene, scPayload, singleHop)[busOwnerRef];

// ---- PANEL B: TRYB PORÓWNAWCZY + TREND ----
// Bieżący 1:1 z repo (72,5 %); poprzedni ILUSTRACYJNY (dowód mechanizmu).
const branchCurrent: RawOverlayPayload = {
  run_id: 'lf-r2',
  analysis_type: 'load_flow',
  elements: {
    [branchRef]: el(branchRef, 'branch', {
      LOADING_PCT: { code: 'LOADING_PCT', value: 72.5, unit: '%', format_hint: 'fixed1' },
      I_A: { code: 'I_A', value: 350, unit: 'A', format_hint: 'fixed1' },
    }),
  },
};
const branchPrevious: RawOverlayPayload = {
  run_id: 'lf-r1',
  analysis_type: 'load_flow',
  elements: {
    [branchRef]: el(branchRef, 'branch', {
      LOADING_PCT: { code: 'LOADING_PCT', value: 68.0, unit: '%', format_hint: 'fixed1' },
      I_A: { code: 'I_A', value: 331, unit: 'A', format_hint: 'fixed1' },
    }),
  },
};
const cmpDelta: ResultLabelComparison = { previousPayload: branchPrevious, mode: 'delta' };
const cmpPrev: ResultLabelComparison = { previousPayload: branchPrevious, mode: 'previous' };
const branchDelta = buildResultLabelsFromScene(scene, branchCurrent, singleHop, cmpDelta)[branchRef];
const branchPrev = buildResultLabelsFromScene(scene, branchCurrent, singleHop, cmpPrev)[branchRef];

// ---- PANEL C: EKSPORT — dowód, że warstwa jest w klonie sceny (te same pozycje) ----
const exportLayout = layoutResultLabels(scene, buildResultLabelsFromScene(scene, branchCurrent, singleHop), [], 2);
const exportPlacement = exportLayout.placements.find((p) => p.ownerRef === branchRef) ?? exportLayout.placements[0];

// ---------------------------------------------------------------------------
const TXT = '#E8EEF4';
const SUB = '#9FB3C8';
const RESULT = '#B39DDB';
const UP = '#2ECC71';
const DOWN = '#F5A623';
const BG = '#0E1621';
const PANEL = '#25384A';
const TREND_GLYPH: Record<string, string> = { up: '↑', down: '↓', flat: '→' };

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function lineText(line: { readonly prefix: string; readonly text: string; readonly trend?: string }): string {
  const glyph = line.trend ? ` ${TREND_GLYPH[line.trend]}` : '';
  return `${line.prefix} ${line.text}${glyph}`;
}
function trendColor(trend: string | undefined): string {
  if (trend === 'up') return UP;
  if (trend === 'down') return DOWN;
  return RESULT;
}

const W = 2400;
const HEADER = 96;
const A_H = 320;
const B_H = 340;
const C_H = 260;
const H = HEADER + A_H + 40 + B_H + 40 + C_H + 40;
const parts: string[] = [];
const lineH = 18;

/** Rysuje blok etykiety (ramka + linie). */
function drawLabelBlock(x: number, y: number, lines: readonly { prefix: string; text: string; trend?: string }[], w = 240): number {
  const h = lines.length * lineH + 12;
  parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${BG}" stroke="${RESULT}" stroke-width="1.2"/>`);
  lines.forEach((l, i) => {
    parts.push(
      `<text x="${x + w / 2}" y="${y + 8 + lineH * (i + 0.5)}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="13" font-weight="700" fill="${trendColor(l.trend)}">${escapeXml(lineText(l))}</text>`,
    );
  });
  return h;
}

// ---- PANEL A ----
const AY = HEADER;
parts.push(
  `<text x="16" y="${AY - 8}" font-family="Inter, system-ui, sans-serif" font-size="13" font-weight="700" fill="${TXT}">` +
    `A · Warstwy analityczne na WSPÓLNYM rejestrze (wym.13): ta sama szyna, ten sam builder — payload LF ⇒ U/δ, payload SC ⇒ Ik″/ip/Ith/Sk (bez forków renderera)</text>`,
);
parts.push(`<text x="40" y="${AY + 24}" font-family="Inter, system-ui, sans-serif" font-size="12" font-weight="600" fill="${SUB}">Analiza ROZPŁYW (load_flow)</text>`);
drawLabelBlock(40, AY + 34, lfBus.lines);
parts.push(`<text x="40" y="${AY + 34 + lfBus.lines.length * lineH + 34}" font-family="Inter, system-ui, sans-serif" font-size="11" fill="${SUB}">buildResultLabelsFromScene(payload LF) — kotwica ${escapeXml(busOwnerRef.slice(0, 22))}…</text>`);

parts.push(`<text x="360" y="${AY + 24}" font-family="Inter, system-ui, sans-serif" font-size="12" font-weight="600" fill="${SUB}">Analiza ZWARCIE (short_circuit_3f)</text>`);
drawLabelBlock(360, AY + 34, scBus.lines);
parts.push(`<text x="360" y="${AY + 34 + scBus.lines.length * lineH + 34}" font-family="Inter, system-ui, sans-serif" font-size="11" fill="${SUB}">TEN SAM builder + kotwica; slot SC domknięty mocą zwarciową Sk (R4).</text>`);

parts.push(`<text x="760" y="${AY + 40}" font-family="Inter, system-ui, sans-serif" font-size="12" fill="${SUB}">Przełączenie analizy = przełączenie payloadu w useRawResultOverlayStore.</text>`);
parts.push(`<text x="760" y="${AY + 60}" font-family="Inter, system-ui, sans-serif" font-size="12" fill="${SUB}">Rejestr resultLabelTemplates.ts kluczuje (analiza × klasa) — jedna</text>`);
parts.push(`<text x="760" y="${AY + 80}" font-family="Inter, system-ui, sans-serif" font-size="12" fill="${SUB}">architektura prezentacji dla WSZYSTKICH modułów (uwaga strategiczna kanonu).</text>`);
parts.push(`<text x="760" y="${AY + 112}" font-family="Inter, system-ui, sans-serif" font-size="11" fill="${SUB}">Rejestr braków R4: rozkład wkładu system/DER/total jest w payloadzie, ale</text>`);
parts.push(`<text x="760" y="${AY + 128}" font-family="Inter, system-ui, sans-serif" font-size="11" fill="${SUB}">wizualizowany strzałkami wkładu (FaultContributionArrow) — nie dublujemy tekstem.</text>`);

// ---- PANEL B ----
const BY = AY + A_H + 40;
parts.push(
  `<text x="16" y="${BY - 8}" font-family="Inter, system-ui, sans-serif" font-size="13" font-weight="700" fill="${TXT}">` +
    `B · Tryb porównawczy (wym.10) + mini trend (wym.15): Δ ze znakiem lub „poprzednia → bieżąca" + strzałka ↑/↓/→ (próg martwej strefy 0,5 %)</text>`,
);
parts.push(`<text x="40" y="${BY + 24}" font-family="Inter, system-ui, sans-serif" font-size="12" font-weight="600" fill="${SUB}">Tryb: Różnica Δ</text>`);
drawLabelBlock(40, BY + 34, branchDelta.lines, 200);
parts.push(`<text x="300" y="${BY + 24}" font-family="Inter, system-ui, sans-serif" font-size="12" font-weight="600" fill="${SUB}">Tryb: Poprzednia → bieżąca</text>`);
drawLabelBlock(300, BY + 34, branchPrev.lines, 280);
parts.push(`<text x="640" y="${BY + 40}" font-family="Inter, system-ui, sans-serif" font-size="12" fill="${SUB}">Δ i trend = CZYSTA arytmetyka porównania dwóch wyników backendu</text>`);
parts.push(`<text x="640" y="${BY + 60}" font-family="Inter, system-ui, sans-serif" font-size="12" fill="${SUB}">(bieżący − poprzedni) — to NIE fizyka. Porównanie ref-do-ref i kod-do-kodu;</text>`);
parts.push(`<text x="640" y="${BY + 80}" font-family="Inter, system-ui, sans-serif" font-size="12" fill="${SUB}">element bez odpowiednika ⇒ bez trendu. OUTDATED ⇒ tryb zablokowany.</text>`);
parts.push(`<text x="640" y="${BY + 108}" font-family="Inter, system-ui, sans-serif" font-size="11" fill="${SUB}">Bieżący 1:1 z repo (obc. 72,5 % — test_result_contract_v1.py); poprzedni</text>`);
parts.push(`<text x="640" y="${BY + 124}" font-family="Inter, system-ui, sans-serif" font-size="11" fill="${SUB}">bieg ILUSTRACYJNY (obc. 68,0 %) — dowód mechanizmu Δ/trendu, jak cykl severity w R3.</text>`);
parts.push(`<rect x="40" y="${BY + 150}" width="14" height="14" rx="2" fill="none" stroke="${UP}" stroke-width="1.4"/>`);
parts.push(`<text x="62" y="${BY + 162}" font-family="Inter, system-ui, sans-serif" font-size="12" fill="${SUB}">↑ wzrost   ↓ spadek   → w martwej strefie — kolor DODATKIEM, glif niesie kierunek także niekolorowo.</text>`);

// ---- PANEL C ----
const CY = BY + B_H + 40;
parts.push(
  `<text x="16" y="${CY - 8}" font-family="Inter, system-ui, sans-serif" font-size="13" font-weight="700" fill="${TXT}">` +
    `C · Eksport (wym.18): warstwa wynikowa wchodzi do eksportu przez TĘ SAMĄ serializację co ekran (klon żywego SVG) — te same pozycje etykiet, eksport NIE jest drugim rendererem</text>`,
);
if (exportPlacement) {
  drawLabelBlock(40, CY + 24, exportPlacement.lines, 200);
  parts.push(`<text x="40" y="${CY + 24 + exportPlacement.lines.length * lineH + 34}" font-family="Inter, system-ui, sans-serif" font-size="12" fill="${SUB}">Pozycja etykiety (świat sceny): x=${Math.round(exportPlacement.x)}, y=${Math.round(exportPlacement.y)}</text>`);
}
parts.push(`<text x="360" y="${CY + 40}" font-family="Inter, system-ui, sans-serif" font-size="12" fill="${SUB}">handleExportSvg: klon svg[data-testid=sld-canvas-v3] → applyContentFitFrame →</text>`);
parts.push(`<text x="360" y="${CY + 60}" font-family="Inter, system-ui, sans-serif" font-size="12" fill="${SUB}">serializeToString → toLightTechnicalExportSvg. Warstwa sld-v3-result-labels jest</text>`);
parts.push(`<text x="360" y="${CY + 80}" font-family="Inter, system-ui, sans-serif" font-size="12" fill="${SUB}">DESCENDANTEM klonowanego węzła ⇒ etykiety + callouty + trend w eksporcie na</text>`);
parts.push(`<text x="360" y="${CY + 100}" font-family="Inter, system-ui, sans-serif" font-size="12" fill="${SUB}">POZYCJACH EKRANOWYCH (dowód: test resultLabelR4 — x/y ekranu obecne w markupie eksportu).</text>`);
parts.push(`<text x="360" y="${CY + 128}" font-family="Inter, system-ui, sans-serif" font-size="11" fill="${SUB}">DXF v3: stub (generateDxf z pustą geometrią) — brak realnej serializacji sceny, więc</text>`);
parts.push(`<text x="360" y="${CY + 144}" font-family="Inter, system-ui, sans-serif" font-size="11" fill="${SUB}">brak pozycji etykiet do utraty; kanon „bez utraty pozycji" dotyczy SVG/PNG/PDF (rejestr braków R4).</text>`);

const title =
  `<text x="16" y="30" font-family="Inter, system-ui, sans-serif" font-size="19" font-weight="700" fill="${TXT}">` +
  `R4 · Warstwa wynikowa FINAŁ — warstwy analityczne na wspólnym rejestrze + tryb porównawczy z trendem + eksport bez utraty pozycji (scena realna sldSubstrate52s, L2)</text>` +
  `<text x="16" y="52" font-family="Inter, system-ui, sans-serif" font-size="12" fill="${SUB}">` +
  `Jeden builder/rejestr dla LF i SC (wym.13); Δ/poprzednia→bieżąca + trend ↑/↓/→ (wym.10/15); eksport tą samą serializacją co ekran (wym.18). ZERO fizyki w UI; geometria bazowa nietknięta (§6).</text>` +
  `<text x="16" y="72" font-family="Inter, system-ui, sans-serif" font-size="11" fill="${SUB}">` +
  `Wartości bieżące 1:1: obc. 72,5 % — test_result_contract_v1.py; U 15,02 kV — kontrakt; Ik″ 12,5 kA — test_result_contract_v1.py. Poprzedni bieg (panel B) ilustracyjny (dowód mechanizmu, jak severity w R3).</text>`;

const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
  `<rect width="${W}" height="${H}" fill="${BG}"/>${title}${parts.join('')}</svg>`;

writeFileSync(`${OUT}/r4-l2-warstwy-porownanie.svg`, svg);
console.log(
  'wrote',
  `${OUT}/r4-l2-warstwy-porownanie.svg`,
  `(lfBus=${lfBus.lines.length} sc=${scBus.lines.length} delta="${branchDelta.lines.map(lineText).join(' | ')}" prev="${branchPrev.lines.map(lineText).join(' | ')}" W=${W} H=${H})`,
);
