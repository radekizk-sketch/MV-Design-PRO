/**
 * SCHEMAT-10 S5 (FINAŁ, V12K-135 „zoom bez zmiany tożsamości stacji") — dowód
 * wizualny SEKWENCJI ZOOM na TĘ SAMĄ stację. Sześć kadrów kanwą produkcyjną
 * `SldCanvasV3` (zero drugiego renderera), na REALNEJ sieci referencyjnej
 * `sldSubstrate52s` (53 stacje):
 *   - zoom-in  (s5-zoom-1..3): L0 „Przegląd sieci" → L1 „Widok operatorski" →
 *     L2 „Stacje i aparatura" — okno kadru ZACIEŚNIA się wokół stacji-celu,
 *     szczegół ROŚNIE (sylwetka mini-RMU → aparaty → aparaty+szyna+podpisy);
 *   - zoom-out (s5-zoom-4..6): L2 → L1 → L0 — powrót, okno się ROZSZERZA.
 * Cel = pierwsza stacja magistrali z TR i DER ZA TR (PV na szynie nN) — realny
 * przypadek „TR+DER za TR" (nie syntetyk).
 *
 * DOWÓD TOŻSAMOŚCI (asercje TREŚCI przed zapisem, liczbowo — nie „na oko"):
 *   (1) kotwica stacji (etykieta `station-name` `#name-row-0`, „JEDNA KOTWICA",
 *       spec §S1/V12K-135) ma IDENTYCZNY rect (x,y,width) na L0/L1/L2 —
 *       porównanie łańcuchów, twardy throw przy dryfie;
 *   (2) `ownerRef` stacji-celu obecny w scenie KAŻDEGO kadru (ta sama stacja);
 *   (3) okno kadru ZAWIERA punkt kotwicy (środek rect) — liczbowo;
 *   (4) `data-scene-lod` w wyrenderowanym SVG == deklarowany LOD kadru.
 * Środek i rozmiar bazowy okna WYPROWADZONE z realnego bbox treści stacji-celu
 * (symbole+kotwica, unia po LOD) — zero magicznych współrzędnych; kadry różnią
 * się wyłącznie bezwymiarowym mnożnikiem zoomu.
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   CANON_OUT=<dir> npx vite-node scripts/render_schemat10_s5.tsx
 *   CANON_OUT=<dir> node scripts/rasterize.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderToStaticMarkup } from 'react-dom/server';

import type { EnergyNetworkModel } from '../src/types/enm';
import { buildSceneV3, SCENE_LOD_LABELS_PL } from '../src/ui/sld/v3/scene/buildScene';
import type { SceneLod } from '../src/ui/sld/v3/scene/buildScene';
import { SldCanvasV3 } from '../src/ui/sld/v3/canvas/SldCanvasV3';
import { CANVAS_BACKGROUND } from '../src/ui/sld/v3/theme/colorTokens';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  HERE,
  '../src/ui/sld/v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json',
);
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

const OUT = process.env.CANON_OUT ?? '/tmp/canon';
mkdirSync(OUT, { recursive: true });

const W = 1800;
const H = 1080;
const BANNER = 108;
const ASPECT = W / H;

// Cel: pierwsza stacja magistrali z TR + DER za TR (PV na szynie nN) —
// wyznaczona z danych: stacja z `stationGlyph.hasTransformer && derBehindTr`.
const TARGET = pickTargetStation();

function pickTargetStation(): string {
  const scene = buildSceneV3(enm, 0);
  const trunk = scene.meta.mainTrunkStationIds;
  const trunkSet = new Set(trunk);
  const eligible = scene.symbols.filter((s) => {
    if (s.symbolId !== 'stationCollapsed') return false;
    const g = (s.meta as { stationGlyph?: { hasTransformer?: boolean; derBehindTr?: string | null } } | undefined)?.stationGlyph;
    return Boolean(g?.hasTransformer) && g?.derBehindTr != null && trunkSet.has(s.meta?.ownerRef as string);
  });
  if (eligible.length === 0) throw new Error('S5: brak stacji magistrali z TR + DER za TR na fixturze referencyjnej');
  // Pierwsza w kolejności ciągu głównego (deterministycznie).
  const order = new Map(trunk.map((id, i) => [id, i] as const));
  eligible.sort((a, b) => (order.get(a.meta?.ownerRef as string) ?? 0) - (order.get(b.meta?.ownerRef as string) ?? 0));
  return eligible[0].meta?.ownerRef as string;
}

function anchorRect(lod: SceneLod): { x: number; y: number; width: number; height: number } {
  const scene = buildSceneV3(enm, lod);
  for (const l of scene.labels) {
    if (l.ownerKind === 'station-name' && l.ownerRef === `${TARGET}#name-row-0`) return l.rect;
  }
  throw new Error(`S5: kotwica (station-name #name-row-0) stacji ${TARGET} nieobecna na L${lod}`);
}

// (1) KOTWICA IDENTYCZNA na L0/L1/L2 — dowód liczbowy „JEDNA KOTWICA".
const a0 = anchorRect(0);
const a1 = anchorRect(1);
const a2 = anchorRect(2);
const anchorKey = (r: { x: number; y: number; width: number }) => `${r.x},${r.y},${r.width}`;
if (!(anchorKey(a0) === anchorKey(a1) && anchorKey(a1) === anchorKey(a2))) {
  throw new Error(`S5: KOTWICA dryfuje między LOD — L0=${anchorKey(a0)} L1=${anchorKey(a1)} L2=${anchorKey(a2)}`);
}
const ANCHOR = a0;
const anchorCx = ANCHOR.x + ANCHOR.width / 2;
const anchorCy = ANCHOR.y + ANCHOR.height / 2;

// bbox treści stacji-celu (symbole pola + kotwica), unia po L0/L1/L2 — baza okna.
const hash = TARGET.split('/')[1];
function targetBBox(): { minX: number; maxX: number; minY: number; maxY: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const lod of [0, 1, 2] as const) {
    const scene = buildSceneV3(enm, lod);
    for (const s of scene.symbols) {
      const testId = (s.meta as { testId?: string } | undefined)?.testId ?? '';
      const ownerRef = (s.meta?.ownerRef as string) ?? '';
      if (testId.includes(hash) || ownerRef.includes(hash)) {
        xs.push(s.x, s.x + 48);
        ys.push(s.y, s.y + 48);
      }
    }
    const r = anchorRect(lod);
    xs.push(r.x, r.x + r.width);
    ys.push(r.y, r.y + r.height);
  }
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}
const box = targetBBox();
const Cx = (box.minX + box.maxX) / 2;
const Cy = (box.minY + box.maxY) / 2;
// Okno bazowe (najciaśniejsze, L2): obejmuje bbox celu z marginesem, aspekt W:H.
const boxW = box.maxX - box.minX;
const boxH = box.maxY - box.minY;
const MARGIN = 1.35;
const baseW = Math.max(boxW, boxH * ASPECT) * MARGIN;

// Bezwymiarowe mnożniki zoomu (kadr tym szerszy im niższy LOD).
const ZOOM: Readonly<Record<SceneLod, number>> = { 2: 1, 1: 2.1, 0: 4.6 };

function windowFor(lod: SceneLod): { wx: number; wy: number; ww: number; wh: number } {
  const ww = baseW * ZOOM[lod];
  const wh = ww / ASPECT;
  return { wx: Cx - ww / 2, wy: Cy - wh / 2, ww, wh };
}

function frame(
  step: number,
  direction: 'zoom-in' | 'zoom-out',
  lod: SceneLod,
  fileName: string,
): void {
  const win = windowFor(lod);
  // (3) okno ZAWIERA kotwicę (liczbowo).
  const contains =
    anchorCx >= win.wx && anchorCx <= win.wx + win.ww && anchorCy >= win.wy && anchorCy <= win.wy + win.wh;
  if (!contains) {
    throw new Error(
      `S5: okno kadru ${fileName} nie zawiera kotwicy stacji (kotwica=${anchorCx},${anchorCy}; okno=${win.wx},${win.wy},${win.ww},${win.wh})`,
    );
  }
  // (2) ownerRef stacji-celu obecny w scenie tego LOD.
  const scene = buildSceneV3(enm, lod);
  const present = scene.symbols.some((s) => {
    const testId = (s.meta as { testId?: string } | undefined)?.testId ?? '';
    const ownerRef = (s.meta?.ownerRef as string) ?? '';
    return testId.includes(hash) || ownerRef.includes(hash);
  });
  if (!present) throw new Error(`S5: stacja-cel ${TARGET} nieobecna w scenie L${lod} (${fileName})`);

  const inner = renderToStaticMarkup(<SldCanvasV3 snapshot={enm} width={W} height={H} lodOverride={lod} />);
  // (4) LOD w SVG == deklarowany.
  const lodInSvg = inner.match(/data-scene-lod="(\d)"/)?.[1];
  if (lodInSvg !== String(lod)) {
    throw new Error(`S5: data-scene-lod=${lodInSvg} != ${lod} (${fileName})`);
  }

  // Zagnieżdżenie: root <svg> kanwy → nested svg z MOIM oknem świata (kadr+clip).
  const openTag = inner.match(/^<svg\b[^>]*>/)?.[0];
  if (!openTag) throw new Error(`S5: nie znaleziono root <svg> w renderze (${fileName})`);
  const children = inner.slice(openTag.length); // treść + zamykające </svg>
  const nested =
    `<svg x="0" y="${BANNER}" width="${W}" height="${H}" ` +
    `viewBox="${win.wx} ${win.wy} ${win.ww} ${win.wh}" preserveAspectRatio="xMidYMid meet" ` +
    `style="background:${CANVAS_BACKGROUND}">${children}`;

  const lodLabel = SCENE_LOD_LABELS_PL[lod];
  const arrow = direction === 'zoom-in' ? '▸ ZBLIŻANIE' : '◂ ODDALANIE';
  const badge =
    `<rect x="16" y="20" width="64" height="64" rx="10" fill="#132030" stroke="#3B82F6" stroke-width="2"/>` +
    `<text x="48" y="52" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="30" font-weight="700" fill="#E8EEF4">L${lod}</text>` +
    `<text x="48" y="74" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="12" fill="#9FB3C8">LOD</text>`;
  const line1 =
    `${arrow} · krok ${step}/3 · ${lodLabel} (L${lod}) · SCHEMAT-10 S5 (V12K-135: zoom bez zmiany tożsamości stacji)`;
  const line2 =
    `stacja-cel=${TARGET} · TR + DER za TR (PV nN) · KOTWICA STAŁA rect=${anchorKey(ANCHOR)} (L0=L1=L2) · ` +
    `okno świata=${Math.round(win.ww)}×${Math.round(win.wh)} px`;
  const banner =
    badge +
    `<text x="96" y="46" font-family="Inter, system-ui, sans-serif" font-size="20" font-weight="600" fill="#E8EEF4">${line1}</text>` +
    `<text x="96" y="74" font-family="Inter, system-ui, sans-serif" font-size="15" fill="#9FB3C8">${line2}</text>`;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H + BANNER}" viewBox="0 0 ${W} ${H + BANNER}">` +
    `<rect width="${W}" height="${H + BANNER}" fill="${CANVAS_BACKGROUND}"/>` +
    `<rect width="${W}" height="${BANNER}" fill="#0E1621"/>` +
    banner +
    nested +
    `</svg>`;
  writeFileSync(`${OUT}/${fileName}`, svg);
  console.log('wrote', `${OUT}/${fileName}`, `L${lod}`, `${direction}`, `okno=${Math.round(win.ww)}x${Math.round(win.wh)}`);
}

// zoom-in: L0 → L1 → L2 (okno zacieśnia się)
frame(1, 'zoom-in', 0, 's5-zoom-1.svg');
frame(2, 'zoom-in', 1, 's5-zoom-2.svg');
frame(3, 'zoom-in', 2, 's5-zoom-3.svg');
// zoom-out: L2 → L1 → L0 (okno rozszerza się)
frame(1, 'zoom-out', 2, 's5-zoom-4.svg');
frame(2, 'zoom-out', 1, 's5-zoom-5.svg');
frame(3, 'zoom-out', 0, 's5-zoom-6.svg');

console.log(
  'S5 OK — cel=' + TARGET + ' kotwica=' + anchorKey(ANCHOR) + ' (L0=L1=L2) box=' +
    JSON.stringify(box) + ' baza_okna=' + Math.round(baseW),
);
