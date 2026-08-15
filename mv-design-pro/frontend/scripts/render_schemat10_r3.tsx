/**
 * SCHEMAT-10 R3 (RECENZJA_WARSTWA_WYNIKOWA_2026-07 §wym.6/7/9/17; program
 * WYNIKI-SLD R3) — dowód wizualny czterech zdolności warstwy wynikowej na L2:
 *  A · INTERAKCJA + POCHODZENIE (wym.6/7): klik etykiety/członka agregatu →
 *      istniejący panel wyników elementu; popover agregatu z wierszem
 *      POCHODZENIA (moduł PL z analysis_type + przebieg run_id).
 *  B · FILTRY widoczności (wym.17): liczba etykiet przy filtrach — wszystko /
 *      tylko P / tylko przekroczenia — REALNIE z `applyResultLabelFilter`.
 *  C · PROGI KOLORYSTYCZNE (wym.9): severity backendu → istniejące tokeny
 *      statusów (żółty/bursztyn/czerwień) + znacznik „⚠” (kolor DODATKIEM).
 *
 * REALNA scena `buildSceneV3(sldSubstrate52s, L2)` + warstwa liczb zbudowana
 * PRODUKCYJNYM potokiem (`buildResultLabelsFromScene`/`applyResultLabelFilter`/
 * `layoutResultLabels`/`resultSeverityColor` — te same funkcje co kanwa).
 * Rysunek bazowy NIETKNIĘTY (§11 inwariant geometrii — filtr działa na warstwie
 * etykiet). Kolory progów 1:1 z kontraktu severity (ZERO progów w UI).
 *
 * ŹRÓDŁO LICZB (zakaz wymyślania): metryki 1:1 z repo (obc. 72,5 % + I 350 A —
 * test_result_contract_v1.py; P +6,5468 MW — sldSubstrate52s.powerflow.json;
 * U 15,02 kV — kontrakt). Severity = klasy KONTRAKTU backendu
 * (INFO/WARNING/IMPORTANT/CRITICAL), przypisane na kotwicach dla dowodu
 * mapowania koloru (nie fizyka, nie próg liczony w UI).
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   CANON_OUT=<dir> npx vite-node scripts/render_schemat10_r3.tsx
 *   CANON_OUT=<dir> node scripts/rasterize.mjs
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { buildSceneV3 } from '../src/ui/sld/v3/scene/buildScene';
import {
  applyResultLabelFilter,
  buildResultLabelsFromScene,
  DEFAULT_RESULT_LABEL_FILTER,
  resultLabelsHaveExceedances,
  orientedSegmentRefs,
  type ResultLabelFilter,
} from '../src/ui/sld/v3/canvas/resultLabels';
import { layoutResultLabels } from '../src/ui/sld/v3/canvas/SldCanvasV3';
import { resultSeverityColor } from '../src/ui/sld/v3/theme/colorTokens';
import { formatContractValue } from '../src/ui/workspace/analysisRunContract';
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

// Payload PEŁNY na realnych kotwicach + severity KONTRAKTOWE (co N-ty element
// dostaje przekroczenie dla dowodu mapowania koloru; INFO = poprawne).
const SEVERITY_CYCLE = ['INFO', 'INFO', 'WARNING', 'INFO', 'IMPORTANT', 'INFO', 'CRITICAL'] as const;
let sevIdx = 0;
function nextSeverity(): string {
  const s = SEVERITY_CYCLE[sevIdx % SEVERITY_CYCLE.length];
  sevIdx += 1;
  return s;
}
function el(refId: string, kind: string, metrics: RawOverlayElement['metrics'], severity: string): RawOverlayElement {
  return { ref_id: refId, kind, badges: [], metrics, severity };
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
  if (k === 'source' && ref && !elements[ref]) elements[ref] = el(ref, 'generator', { P_MW: { code: 'P_MW', value: 6.546769, unit: 'MW', format_hint: 'fixed4' } }, nextSeverity());
  if (k === 'transformer' && ref && !elements[ref]) elements[ref] = el(ref, 'transformer', { S_MVA: { code: 'S_MVA', value: 0.63, unit: 'MVA', format_hint: 'fixed2' } }, nextSeverity());
}
for (const s of scene.segments) {
  const k = s.meta?.elementKind;
  const ref = s.meta?.ownerRef;
  if (k === 'bus' && ref && !elements[ref]) elements[ref] = el(ref, 'bus', { U_kV: { code: 'U_kV', value: 15.02, unit: 'kV', format_hint: 'fixed2' } }, nextSeverity());
  if (k === 'segment' && ref && !ref.includes('#') && singleHop.has(ref) && !elements[ref]) elements[ref] = el(ref, 'branch', branchMetrics(), nextSeverity());
}
const payload: RawOverlayPayload = { run_id: 'run-2f8c14', analysis_type: 'load_flow', elements };
const byRef = buildResultLabelsFromScene(scene, payload, singleHop);
const layout = layoutResultLabels(scene, byRef, [], 2);

// Filtry (panel B) — liczone REALNIE z produkcyjnej funkcji.
const countLabels = (f: ResultLabelFilter): number => {
  const filtered = applyResultLabelFilter(byRef, f);
  const lay = layoutResultLabels(scene, filtered, [], 2);
  return lay.placements.length + lay.aggregates.reduce((s, a) => s + a.count, 0);
};
const onlyP: ResultLabelFilter = { ...DEFAULT_RESULT_LABEL_FILTER, quantities: { P: true, Q: false, S: false, I: false, U: false, loading: false } };
const onlyExc: ResultLabelFilter = { ...DEFAULT_RESULT_LABEL_FILTER, onlyExceedances: true };
const onlySources: ResultLabelFilter = { ...DEFAULT_RESULT_LABEL_FILTER, classes: { source: true, transformer: false, branch: false, bus: false } };
const cntAll = countLabels(DEFAULT_RESULT_LABEL_FILTER);
const cntP = countLabels(onlyP);
const cntExc = countLabels(onlyExc);
const cntSrc = countLabels(onlySources);
const hasExc = resultLabelsHaveExceedances(byRef);

// Pochodzenie (panel A) — moduł PL z analysis_type + przebieg (produkcyjny słownik).
const moduleLabel = formatContractValue(payload.analysis_type);
const provText = `Moduł: ${moduleLabel} · Przebieg: ${payload.run_id}`;

// Agregat do zbliżenia (panel A).
const agg = layout.aggregates[0];
const TXT = '#E8EEF4';
const SUB = '#9FB3C8';
const RESULT = '#B39DDB';
const BG = '#0E1621';
const PANEL = '#25384A';
const OK = '#2ECC71';

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const W = 2400;
const HEADER = 96;
const A_H = 360;
const B_H = 300;
const C_H = 300;
const H = HEADER + A_H + 40 + B_H + 40 + C_H + 40;
const parts: string[] = [];
const lineH = 14;

// ---- PANEL A: INTERAKCJA + POCHODZENIE ----
const AY = HEADER;
parts.push(
  `<text x="16" y="${AY - 8}" font-family="Inter, system-ui, sans-serif" font-size="13" font-weight="700" fill="${TXT}">` +
    `A · Interakcja (wym.6) + Pochodzenie (wym.7): klik etykiety/członka → istniejący panel wyników elementu (SldDetailDrawer); popover z modułem+przebiegiem</text>`,
);
// Popover agregatu (rozwinięty) z wierszem POCHODZENIA na górze.
const popX = 40;
const popY = AY + 24;
const rowH = lineH + 4;
if (agg) {
  const memberLines = agg.members.map((mem) => {
    const kindPl = { source: 'Źródło', transformer: 'Transformator', branch: 'Przęsło', bus: 'Szyna' }[mem.kind] ?? mem.kind;
    const mark = resultSeverityColor(mem.severity) ? '⚠ ' : '';
    return { text: `${mark}${kindPl}: ${mem.primaryText}`, color: resultSeverityColor(mem.severity) ?? RESULT };
  });
  const rows = [{ text: provText, color: SUB }, ...memberLines];
  const popW = 560;
  const popH = rows.length * rowH + 12;
  // Marker agregatu.
  parts.push(`<rect x="${popX}" y="${popY}" width="120" height="22" rx="2" fill="${BG}" stroke="${RESULT}" stroke-width="1.4"/>`);
  parts.push(`<text x="${popX + 60}" y="${popY + 15}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="12" font-weight="700" fill="${RESULT}">${escapeXml(`+${agg.count} wyniki`)}</text>`);
  // Popover.
  parts.push(`<rect x="${popX}" y="${popY + 28}" width="${popW}" height="${popH}" rx="3" fill="${BG}" stroke="${RESULT}" stroke-width="1"/>`);
  rows.forEach((r, i) => {
    const weight = i === 0 ? '500' : '600';
    parts.push(`<text x="${popX + 10}" y="${popY + 28 + 8 + rowH * (i + 0.5)}" font-family="Inter, system-ui, sans-serif" font-size="12" font-weight="${weight}" fill="${r.color}">${escapeXml(r.text)}</text>`);
  });
  parts.push(`<text x="${popX + popW + 24}" y="${popY + 48}" font-family="Inter, system-ui, sans-serif" font-size="12" fill="${SUB}">Wiersz 1 = POCHODZENIE (moduł+przebieg z payloadu);</text>`);
  parts.push(`<text x="${popX + popW + 24}" y="${popY + 68}" font-family="Inter, system-ui, sans-serif" font-size="12" fill="${SUB}">każdy wiersz członka jest KLIKALNY → panel wyników</text>`);
  parts.push(`<text x="${popX + popW + 24}" y="${popY + 88}" font-family="Inter, system-ui, sans-serif" font-size="12" fill="${SUB}">elementu (ta sama ścieżka co klik elementu na kanwie).</text>`);
  parts.push(`<text x="${popX + popW + 24}" y="${popY + 120}" font-family="Inter, system-ui, sans-serif" font-size="11" fill="${SUB}">DŁUG R3: deep-link do White Box/proof — brak działającej</text>`);
  parts.push(`<text x="${popX + popW + 24}" y="${popY + 136}" font-family="Inter, system-ui, sans-serif" font-size="11" fill="${SUB}">ścieżki z kanwy v3; timestamp — brak w RawOverlayPayload.</text>`);
} else {
  parts.push(`<text x="${popX}" y="${popY + 40}" font-family="Inter, system-ui, sans-serif" font-size="13" fill="${SUB}">(brak skupiska agregacji na tej fixturze)</text>`);
}

// ---- PANEL B: FILTRY ----
const BY = AY + A_H + 40;
parts.push(
  `<text x="16" y="${BY - 8}" font-family="Inter, system-ui, sans-serif" font-size="13" font-weight="700" fill="${TXT}">` +
    `B · Filtry widoczności (wym.17): liczba etykiet REALNIE z applyResultLabelFilter — filtr działa na warstwie etykiet, geometria sceny niezmienna (§11)</text>`,
);
const filterRows: Array<[string, number, string]> = [
  ['Wszystko widoczne (domyślnie)', cntAll, TXT],
  ['Tylko moc czynna P', cntP, TXT],
  ['Tylko źródła (klasa)', cntSrc, TXT],
  [`Tylko przekroczenia (aktywne: ${hasExc ? 'tak' : 'nie — wyszarzone'})`, cntExc, hasExc ? '#F5A623' : SUB],
];
const bColX = [40, 520];
parts.push(`<text x="${bColX[0]}" y="${BY + 24}" font-family="Inter, system-ui, sans-serif" font-size="12" font-weight="700" fill="${SUB}">Filtr</text>`);
parts.push(`<text x="${bColX[1]}" y="${BY + 24}" font-family="Inter, system-ui, sans-serif" font-size="12" font-weight="700" fill="${SUB}">Etykiety widoczne</text>`);
filterRows.forEach((r, i) => {
  const y = BY + 52 + i * 40;
  parts.push(`<rect x="32" y="${y - 18}" width="900" height="34" rx="3" fill="none" stroke="${PANEL}" stroke-width="1"/>`);
  parts.push(`<text x="${bColX[0]}" y="${y + 4}" font-family="Inter, system-ui, sans-serif" font-size="13" font-weight="600" fill="${r[2]}">${escapeXml(r[0])}</text>`);
  parts.push(`<text x="${bColX[1]}" y="${y + 4}" font-family="Inter, system-ui, sans-serif" font-size="13" fill="${r[2]}">${r[1]}</text>`);
});
parts.push(`<text x="980" y="${BY + 60}" font-family="Inter, system-ui, sans-serif" font-size="12" fill="${SUB}">„Tylko przekroczenia" AKTYWNE wyłącznie gdy payload niesie</text>`);
parts.push(`<text x="980" y="${BY + 80}" font-family="Inter, system-ui, sans-serif" font-size="12" fill="${SUB}">severity&gt;INFO (inaczej kontrolka wyszarzona — zero dead-click).</text>`);
parts.push(`<text x="980" y="${BY + 108}" font-family="Inter, system-ui, sans-serif" font-size="12" fill="${SUB}">Stan filtrów NIE zmienia sceny — inwariant bajtowy utrzymany.</text>`);

// ---- PANEL C: PROGI SEVERITY ----
const CY = BY + B_H + 40;
parts.push(
  `<text x="16" y="${CY - 8}" font-family="Inter, system-ui, sans-serif" font-size="13" font-weight="700" fill="${TXT}">` +
    `C · Progi kolorystyczne (wym.9): severity KONTRAKTU backendu → istniejące tokeny statusów + znacznik „⚠". ZERO progów liczonych w UI (mapowanie 1:1).</text>`,
);
const severityDemo: Array<[string, string]> = [
  ['INFO (poprawne)', 'INFO'],
  ['WARNING (zbliżanie do limitu)', 'WARNING'],
  ['IMPORTANT (istotne)', 'IMPORTANT'],
  ['CRITICAL (przekroczenie)', 'CRITICAL'],
];
severityDemo.forEach(([labelPl, sev], i) => {
  const x0 = 40 + i * 560;
  const y0 = CY + 24;
  const color = resultSeverityColor(sev) ?? RESULT;
  const exceeded = resultSeverityColor(sev) != null;
  // Etykieta demonstracyjna: obc. 72,5 % (realna wartość) w kolorze progu.
  parts.push(`<rect x="${x0}" y="${y0}" width="150" height="${2 * lineH + 12}" rx="2" fill="${BG}" stroke="${color}" stroke-width="1.4"/>`);
  parts.push(`<text x="${x0 + 75}" y="${y0 + 8 + lineH * 0.5}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="12" font-weight="700" fill="${color}">${escapeXml('obc. 72,5 %')}</text>`);
  parts.push(`<text x="${x0 + 75}" y="${y0 + 8 + lineH * 1.5}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="12" font-weight="700" fill="${color}">${escapeXml('I 350,0 A')}</text>`);
  if (exceeded) {
    parts.push(`<text x="${x0 + 150 - 6}" y="${y0 + 6}" text-anchor="end" font-family="Inter, system-ui, sans-serif" font-size="12" font-weight="700" fill="${color}">⚠</text>`);
  }
  parts.push(`<text x="${x0 + 170}" y="${y0 + 14}" font-family="Inter, system-ui, sans-serif" font-size="13" font-weight="600" fill="${color}">${escapeXml(labelPl)}</text>`);
  parts.push(`<text x="${x0 + 170}" y="${y0 + 34}" font-family="Inter, system-ui, sans-serif" font-size="11" fill="${SUB}">${escapeXml(exceeded ? `kolor ${color} + znacznik ⚠` : 'kolor bazowy warstwy, bez znacznika')}</text>`);
});
parts.push(`<rect x="40" y="${CY + 90}" width="14" height="14" rx="2" fill="none" stroke="${OK}" stroke-width="1.4"/>`);
parts.push(`<text x="62" y="${CY + 102}" font-family="Inter, system-ui, sans-serif" font-size="12" fill="${SUB}">Kolor jest DODATKIEM: znacznik „⚠" niesie przekroczenie także niekolorowo (dostępność).</text>`);

const title =
  `<text x="16" y="30" font-family="Inter, system-ui, sans-serif" font-size="19" font-weight="700" fill="${TXT}">` +
  `R3 · Warstwa wynikowa — interakcja + pochodzenie wyniku + filtry widoczności + progi z kontraktów severity (scena realna sldSubstrate52s, L2)</text>` +
  `<text x="16" y="52" font-family="Inter, system-ui, sans-serif" font-size="12" fill="${SUB}">` +
  `Klik etykiety → istniejący panel wyników (reuse, wym.6); pochodzenie z payloadu (moduł+przebieg, wym.7); filtry na warstwie etykiet (wym.17); progi z severity backendu (wym.9).</text>` +
  `<text x="16" y="72" font-family="Inter, system-ui, sans-serif" font-size="11" fill="${SUB}">` +
  `Wartości 1:1 (§0): obc. 72,5 % + I 350 A — test_result_contract_v1.py; P +6,5468 MW — sldSubstrate52s.powerflow.json; U 15,02 kV — kontrakt. ZERO fizyki/progów w UI. Geometria bazowa nietknięta (§11).</text>`;

const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
  `<rect width="${W}" height="${H}" fill="${BG}"/>${title}${parts.join('')}</svg>`;

writeFileSync(`${OUT}/r3-l2-interakcja-filtry.svg`, svg);
console.log('wrote', `${OUT}/r3-l2-interakcja-filtry.svg`, `(agg=${layout.aggregates.length}, all=${cntAll}, onlyP=${cntP}, onlyExc=${cntExc}, hasExc=${hasExc}, W=${W} H=${H})`);
