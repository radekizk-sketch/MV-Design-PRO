/**
 * SCHEMAT-10 Z3 (AUDYT_POWYKONAWCZY_SLD §Z3 + dług W1c) — dowód wizualny
 * „oznaczenia aparatów L2 z REALNYCH danych pól" (prymat danych §12.1, fallback
 * konwencji §19.1). Jedna TA SAMA stacja referencyjna renderowana produkcyjną
 * kanwą `SldCanvasV3` w DWÓCH wariantach, obok siebie:
 *   - LEWO „POLE Z DANYMI": snapshot macierzy W1c — pole niesie
 *     `Bay.primary_devices[].designation` z packa/szablonu (Q0/Q1/Q2/Q9/„F1"/
 *     „TR" — realne oznaczenia producenckie), więc etykiety aparatów pochodzą Z
 *     DANYCH (`designationSource='dane'`);
 *   - PRAWO „FALLBACK KONWENCJI": TEN SAM snapshot bazowy BEZ `primary_devices`
 *     — etykiety z konwencji §19.1 (Q1/QE1/T1).
 * Geometria/kotwice IDENTYCZNE w obu panelach (Z3 inwariant: zmienia się
 * WYŁĄCZNIE treść etykiet) — okno świata wyprowadzone z bbox tej samej stacji,
 * ten sam kadr na obu panelach; różni się tylko TEKST oznaczeń aparatów.
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   CANON_OUT=<dir> npx vite-node scripts/render_schemat10_z3.tsx
 *   CANON_OUT=<dir> node scripts/rasterize.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';

import type { EnergyNetworkModel } from '../src/types/enm';
import { SldCanvasV3 } from '../src/ui/sld/v3/canvas/SldCanvasV3';
import { buildSceneV3 } from '../src/ui/sld/v3/scene/buildScene';
import type { SceneLod } from '../src/ui/sld/v3/scene/buildScene';
import { CANVAS_BACKGROUND } from '../src/ui/sld/v3/theme/colorTokens';
import { buildW1cMatrixFixture } from '../src/ui/sld/v3/scene/__tests__/fixtures/w1cMatrixCatalog';

const OUT = process.env.CANON_OUT ?? '/tmp/canon';
mkdirSync(OUT, { recursive: true });

const LOD: SceneLod = 2;
const CONVENTION = /^(Q\d+|QE\d+|T\d+)(·\d+)?$/;

const { enm: enmData, baseEnm: enmConv, targets } = buildW1cMatrixFixture();

// Cel: stacja z polem niosącym oznaczenie producenckie SPOZA wzorca §19.1
// (FUSE→„F1" albo TRANSFORMER_DEVICE→„TR") — najmocniejszy dowód prymatu danych.
const dataScene = buildSceneV3(enmData, LOD);
function pickTarget(): { stationRef: string; fieldRef: string; texts: string[] } {
  for (const t of targets) {
    const hasNonConv = t.case.devices.some((d) => d.kind === 'FUSE' || d.kind === 'TRANSFORMER_DEVICE');
    if (!hasNonConv) continue;
    const labels = dataScene.labels.filter(
      (l) => l.ownerKind === 'apparatus' && l.ownerRef.startsWith(`${t.fieldRef}#apparatus-id-`),
    );
    const nonConv = labels.filter((l) => !CONVENTION.test(l.text));
    const allDane = nonConv.every((l) => l.designationSource === 'dane');
    if (nonConv.length > 0 && allDane) {
      return { stationRef: t.stationRef, fieldRef: t.fieldRef, texts: labels.map((l) => l.text) };
    }
  }
  throw new Error('Z3: brak pola z oznaczeniem producenckim spoza wzorca konwencji na macierzy');
}
const target = pickTarget();
const stationHash = target.stationRef.split('/')[1];

// Kotwica stacji (station-name #name-row-0). UWAGA: pozycja ABSOLUTNA stacji
// różni się między snapshotem macierzy (dane) a bazowym (konwencja), bo
// wstrzyknięcie `primary_devices` zmienia footprinty pól w CAŁEJ sieci (to
// zachowanie fixtury, nie zmiana Z3 — Z3 zmienia wyłącznie TREŚĆ etykiet).
// Dlatego KAŻDY panel kadrujemy do WŁASNEJ kotwicy tej samej stacji w jego
// scenie (kontrast: TO SAMO pole, dane vs konwencja).
function anchorRect(scene: ReturnType<typeof buildSceneV3>): { x: number; y: number; width: number; height: number } {
  for (const l of scene.labels) {
    if (l.ownerKind === 'station-name' && l.ownerRef === `${target.stationRef}#name-row-0`) return l.rect;
  }
  throw new Error(`Z3: kotwica stacji ${target.stationRef} nieobecna`);
}
const convScene = buildSceneV3(enmConv, LOD);
const aData = anchorRect(dataScene);
const aConv = anchorRect(convScene);
const key = (r: { x: number; y: number; width: number }) => `${r.x},${r.y},${r.width}`;

// Dowód treści: na scenie DANYCH pole-cel ma oznaczenia „dane" (min. jedno spoza
// wzorca konwencji); na scenie BAZOWEJ te same pola są konwencją (Q\d+/QE\d+/T\d+).
const convLabels = convScene.labels.filter(
  (l) => l.ownerKind === 'apparatus' && l.ownerRef.startsWith(`${target.fieldRef}#apparatus-id-`),
);
const convAllConvention = convLabels.every(
  (l) => CONVENTION.test(l.text) && (l.designationSource === 'konwencja' || l.designationSource === undefined),
);
if (convLabels.length > 0 && !convAllConvention) {
  throw new Error('Z3: panel FALLBACK KONWENCJI zawiera etykietę spoza wzorca konwencji');
}

const PANEL_W = 900;
const PANEL_H = 1040;
const BANNER = 176;
const GAP = 24;
const ASPECT = PANEL_W / PANEL_H;
const MARGIN = 1.9;

// bbox POLA-CELU (aparaty pola + ich etykiety identyfikatora) W DANEJ SCENIE —
// baza okna świata tego panelu; ciasny kadr na to samo pole w obu wariantach.
// Fallback do kotwicy stacji, gdyby pole nie miało symboli w danej scenie.
function windowFor(
  scene: ReturnType<typeof buildSceneV3>,
  anchor: { x: number; y: number; width: number; height: number },
): { wx: number; wy: number; ww: number; wh: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const s of scene.symbols) {
    if ((s.meta?.ownerRef as string) === target.fieldRef) {
      xs.push(s.x, s.x + 48);
      ys.push(s.y, s.y + 48);
    }
  }
  for (const l of scene.labels) {
    if (l.ownerKind === 'apparatus' && l.ownerRef.startsWith(`${target.fieldRef}#apparatus-id-`)) {
      xs.push(l.rect.x, l.rect.x + l.rect.width);
      ys.push(l.rect.y, l.rect.y + l.rect.height);
    }
  }
  if (xs.length === 0) {
    xs.push(anchor.x, anchor.x + anchor.width);
    ys.push(anchor.y, anchor.y + anchor.height);
  }
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const ww = Math.max(maxX - minX, (maxY - minY) * ASPECT) * MARGIN;
  const wh = ww / ASPECT;
  return { wx: cx - ww / 2, wy: cy - wh / 2, ww, wh };
}

function panel(
  snapshot: EnergyNetworkModel,
  scene: ReturnType<typeof buildSceneV3>,
  anchor: { x: number; y: number; width: number; height: number },
  xOffset: number,
  title: string,
  subtitle: string,
  accent: string,
): string {
  const win = windowFor(scene, anchor);
  const inner = renderToStaticMarkup(
    <SldCanvasV3 snapshot={snapshot} width={PANEL_W} height={PANEL_H} lodOverride={LOD} />,
  );
  const openTag = inner.match(/^<svg\b[^>]*>/)?.[0];
  if (!openTag) throw new Error('Z3: brak root <svg> w renderze kanwy');
  const children = inner.slice(openTag.length); // treść + zamykające </svg> renderu kanwy
  const nested =
    `<svg x="${xOffset}" y="${BANNER}" width="${PANEL_W}" height="${PANEL_H}" ` +
    `viewBox="${win.wx} ${win.wy} ${win.ww} ${win.wh}" preserveAspectRatio="xMidYMid meet" ` +
    `style="background:${CANVAS_BACKGROUND}">${children}`;
  const head =
    `<rect x="${xOffset}" y="${BANNER - 44}" width="${PANEL_W}" height="44" fill="#0E1621"/>` +
    `<rect x="${xOffset}" y="${BANNER - 44}" width="6" height="44" fill="${accent}"/>` +
    `<text x="${xOffset + 20}" y="${BANNER - 26}" font-family="Inter, system-ui, sans-serif" font-size="18" font-weight="700" fill="#E8EEF4">${title}</text>` +
    `<text x="${xOffset + 20}" y="${BANNER - 8}" font-family="Inter, system-ui, sans-serif" font-size="13" fill="#9FB3C8">${subtitle}</text>`;
  return head + nested;
}

const W = PANEL_W * 2 + GAP;
const H = PANEL_H + BANNER;
const dataDesigs = target.texts.filter((t) => !CONVENTION.test(t));
const convText = convLabels.map((l) => l.text).slice(0, 8).join(' · ') || '(pole bez aparatów identyfikowalnych)';

const banner =
  `<text x="24" y="40" font-family="Inter, system-ui, sans-serif" font-size="22" font-weight="700" fill="#E8EEF4">` +
  `SCHEMAT-10 Z3 — oznaczenia aparatów L2 z realnych danych pól (prymat danych §12.1, fallback konwencji §19.1)</text>` +
  `<text x="24" y="66" font-family="Inter, system-ui, sans-serif" font-size="14" fill="#9FB3C8">` +
  `Ta sama stacja ${target.stationRef} · to samo pole ${target.fieldRef} · Z3 zmienia WYŁĄCZNIE treść etykiet aparatów (nie geometrię)</text>` +
  `<text x="24" y="90" font-family="Inter, system-ui, sans-serif" font-size="13" fill="#7FB8E8">` +
  `POLE Z DANYMI (producenckie/kreator): ${target.texts.join(' · ')}  —  spoza wzorca konwencji (DANE): ${dataDesigs.join(' · ') || '—'}</text>` +
  `<text x="24" y="110" font-family="Inter, system-ui, sans-serif" font-size="13" fill="#C9A26B">` +
  `TO SAMO POLE, FALLBACK KONWENCJI (§19.1): ${convText}</text>`;

const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
  `<rect width="${W}" height="${H}" fill="${CANVAS_BACKGROUND}"/>` +
  `<rect width="${W}" height="${BANNER}" fill="#0B1220"/>` +
  banner +
  panel(enmData, dataScene, aData, 0, 'POLE Z DANYMI — designation z packa/szablonu', 'BayPrimaryDevice.designation → etykieta aparatu (data-designation-source="dane")', '#3B82F6') +
  panel(enmConv, convScene, aConv, PANEL_W + GAP, 'FALLBACK KONWENCJI §19.1', 'brak primary_devices → numeracja Q/QE/T (data-designation-source="konwencja")', '#C9A26B') +
  `</svg>`;

writeFileSync(`${OUT}/z3-l2-oznaczenia.svg`, svg);
console.log(
  'Z3 OK — stacja=' + target.stationRef +
    ' pole=' + target.fieldRef +
    ' DANE=' + JSON.stringify(target.texts) +
    ' KONWENCJA=' + JSON.stringify(convLabels.map((l) => l.text)) +
    ' kotwica=' + key(aData),
);
