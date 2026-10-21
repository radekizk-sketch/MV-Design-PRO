/**
 * SCHEMAT-10 W2c (POLECENIE_DER_SN_TOPOLOGIA_2026-07, reguły 1–7) — bramka
 * dowodowa PLANU ETYKIET toru DER przyłączonego po stronie SN oraz dowód
 * wizualny tego toru na L2.
 *
 * ŚCIEŻKA PRODUKCYJNA OD POCZĄTKU DO KOŃCA (karta W2C-PLAN-ETYKIET). Do tej
 * karty skrypt budował scenę WŁASNYM potokiem, który rozjeżdżał się z kanwą w
 * trzech miejscach, a każdy rozjazd dawał FAIL, którego produkt nie ma:
 *  (1) deskryptory pól pisane ręcznie, z pominięciem projekcji adaptera
 *      (`projectBayPrimaryDevices`) — aparaty boczne w kolejności surowej
 *      backendu, czyli na RÓŻNYCH kotwicach toru we wspólnej kolumnie
 *      („TV1" spod przekładnika na symbolu uziemnika);
 *  (2) pasma liczone bez wiersza etykiety szyny i z osią szyny na STROPIE
 *      pasma B2 — podpis „Sekcja 1" nad szyną wypadał nad arkusz (y < 0);
 *  (3) obrys arkusza, przeszkody i skala planu wymyślone lokalnie (skala
 *      dopasowania panelu, niezwiązana z żadnym poziomem szczegółu).
 * Teraz: fixtura ENM toru DER-SN (`w2cDerSnFixtures.ts`, lustro kształtu
 * snapshotu backendu) → `buildSceneV3` (adapter + kompozycja + resolver
 * etykiet produkcji) → `sceneObstacleRects` + `sheetSizeFor` (to samo, co
 * podaje `SldCanvasV3`) → `planSceneLabels` przy KAŻDEJ skali, przy której
 * dany LOD jest aktywny w kamerze (`LABEL_PLAN_PRODUCTION_SCALES`, ta sama
 * tabela co `accept:sld-v3`).
 *
 * FAIL (kod wyjścia 1), gdy dla któregokolwiek przypadku × LOD × skali:
 * kolizja etykieta↔etykieta, etykieta↔rysunek (symbol/tor), porzucona
 * tożsamość, napis poza obrysem arkusza, identyfikator aparatu narysowany w
 * postaci skróconej (np. „TV1" → „T…"), albo gdy na L2 pole źródłowe nie niesie
 * narysowanego identyfikatora każdego aparatu bocznego (bramka nie może przejść
 * „na pusto").
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   CANON_OUT=<dir> npx vite-node scripts/render_schemat10_w2c.tsx
 *   CANON_OUT=<dir> node scripts/rasterize.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';

import { LABEL_PLAN_PRODUCTION_SCALES } from '../src/ui/sld/v3/canvas/camera';
import {
  planSceneLabels,
  plannedLabelCollisions,
  plannedLabelObstacleCollisions,
  plannedLabelsOutsideSheet,
  type LabelRenderPlan,
} from '../src/ui/sld/v3/canvas/labelLegibility';
import { LABEL_TYPOGRAPHY } from '../src/ui/sld/v3/core/text';
import { buildSceneV3, sceneObstacleRects, type SceneLod, type SceneV3 } from '../src/ui/sld/v3/scene/buildScene';
import {
  buildDerSnFixture,
  type DerSnInjectOptions,
  type InjectedDer,
} from '../src/ui/sld/v3/scene/__tests__/fixtures/w2cDerSnFixtures';
import { sheetSizeFor } from '../src/ui/sld/v3/sheet/outline';
import { SYMBOL_DEFS } from '../src/ui/sld/v3/symbols/defs';
import { SYMBOL_GLYPHS } from '../src/ui/sld/v3/symbols/glyphs';

const OUT = process.env.CANON_OUT ?? '/tmp/canon';
mkdirSync(OUT, { recursive: true });

interface W2cCase {
  readonly id: string;
  readonly injections: readonly DerSnInjectOptions[];
  /** Panel dowodu wizualnego (tytuł, podtytuł) — `null` = przypadek tylko w bramce. */
  readonly panel: { readonly title: string; readonly subtitle: string } | null;
}

/** Przypadki kanonu W2c (numeracja z `buildScene.w2cDerSnTopology.test.ts`).
 *  Przypadek 8 (DER-SN obok pola TR odbiorczego stacji) jest spełniony w
 *  KAŻDYM przypadku: stacja fixtury ma własne pole TR. */
const CASES: readonly W2cCase[] = [
  {
    id: 'w2c-2',
    injections: [{ technology: 'PV' }],
    panel: {
      title: 'Przypadki 2 i 8 — PV + TR blokowy obok pola TR stacji',
      subtitle: 'pole SN → kabel → TR blokowy → szyna nN producenta → PV',
    },
  },
  {
    id: 'w2c-3',
    injections: [{ technology: 'BESS', lvSwitchgearVariant: 'single-bus' }],
    panel: {
      title: 'Przypadek 3 — BESS + rozdzielnica nN + TR blokowy',
      subtitle: 'pole źródłowe SN z TV/QE/F po stronie kablowej',
    },
  },
  {
    id: 'w2c-7',
    injections: [
      { technology: 'PV', suffix: 'a' },
      { technology: 'BESS', suffix: 'b', lvSwitchgearVariant: 'single-bus' },
    ],
    panel: {
      title: 'Przypadek 7 — PV + BESS na wspólnej szynie SN',
      subtitle: 'dwa tory, dwa różne TR blokowe',
    },
  },
  { id: 'w2c-5', injections: [{ technology: 'PV', quantity: 3 }], panel: null },
  { id: 'w2c-6', injections: [{ technology: 'PV', lvSwitchgearVariant: 'integrated-skid' }], panel: null },
];

const LODS: readonly SceneLod[] = [0, 1, 2];
/** Skala panelu dowodu wizualnego: NAJMNIEJSZA skala, przy której L2 jest
 *  aktywny w kamerze (najciaśniejszy przypadek planu etykiet na L2). */
const PANEL_SCALE = LABEL_PLAN_PRODUCTION_SCALES[2][0];

const rejections: string[] = [];
const report: string[] = [];

/** Etykiety identyfikatorów aparatów BOCZNYCH pola źródłowego w scenie. */
function lateralIdLabels(scene: SceneV3, injected: readonly InjectedDer[]): readonly string[] {
  return scene.labels
    .filter((l) => injected.some((d) => l.ownerRef.startsWith(`${d.ozeFieldRef}#apparatus-id-`)) && l.ownerRef.includes('-lateral-'))
    .map((l) => l.ownerRef);
}

function gate(testCase: W2cCase): void {
  const { enm, injected } = buildDerSnFixture(testCase.injections);
  for (const lod of LODS) {
    const scene = buildSceneV3(enm, lod);
    const obstacles = sceneObstacleRects(scene);
    const sheet = sheetSizeFor(scene);
    const lateralIds = lateralIdLabels(scene, injected);
    for (const scale of LABEL_PLAN_PRODUCTION_SCALES[lod]) {
      const plan = planSceneLabels(scene.labels, obstacles, scale, sheet);
      const collisions = plannedLabelCollisions(plan);
      const onDrawing = plannedLabelObstacleCollisions(plan, obstacles);
      const outside = plannedLabelsOutsideSheet(plan, sheet);
      const drawnRefs = new Set(plan.drawn.map((p) => p.label.ownerRef));
      const lateralMissing = lod === 2 ? lateralIds.filter((ref) => !drawnRefs.has(ref)) : [];
      const vacuous = lod === 2 && lateralIds.length === 0;
      // Identyfikator aparatu (Q1/QE1/TV1/F1) nie ma członu, który dałoby się
      // odciąć: skrót „T…" z „TV1" czyta się jak transformator.
      const truncatedIds = plan.drawn
        .filter((p) => p.label.ownerRef.includes('#apparatus-id-') && p.text !== p.label.text)
        .map((p) => `${p.label.text}→${p.text}`);
      const line =
        `W2c ${testCase.id} L${lod} @${scale}: etykiety=${scene.labels.length}` +
        ` narysowane=${plan.drawn.length} ukryte-dane=${plan.hiddenDetail.length}` +
        `, etykiety-kolizje=${collisions.length}` +
        `, etykiety-symbole=${onDrawing.length}${onDrawing.length ? ` [${onDrawing.join(', ')}]` : ''}` +
        `, utracone-tożsamości=${plan.droppedIdentity.length}` +
        `${plan.droppedIdentity.length ? ` [${plan.droppedIdentity.map((l) => l.ownerRef).join(', ')}]` : ''}` +
        `, poza-arkuszem=${outside.length}` +
        `, skrócone-identyfikatory=${truncatedIds.length}${truncatedIds.length ? ` [${truncatedIds.join(', ')}]` : ''}` +
        (lod === 2 ? `, identyfikatory-boczne=${lateralIds.length - lateralMissing.length}/${lateralIds.length}` : '');
      const failed =
        collisions.length > 0 ||
        onDrawing.length > 0 ||
        plan.droppedIdentity.length > 0 ||
        outside.length > 0 ||
        truncatedIds.length > 0 ||
        lateralMissing.length > 0 ||
        vacuous;
      report.push(`[${failed ? 'FAIL' : 'OK'}] ${line}`);
      if (failed) rejections.push(line);
    }
  }
}

const xml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Kolor odcinka wg semantyki ownerRef (rozróżnialność toru DER). */
function segColor(ownerRef: string): string {
  if (ownerRef.includes('mv_cable')) return '#E86F4C'; // kabel SN toru DER
  if (ownerRef.includes('producer_lv_bus') || ownerRef.endsWith('#lv-bus')) return '#39C0A8'; // szyna nN producenta
  if (ownerRef.endsWith('#der-source-descent')) return '#E8A94C'; // zejście do źródła
  if (ownerRef.endsWith('#sn-bus')) return '#4C9BE8'; // szyna SN stacji
  return '#8FA8BE';
}

interface Panel {
  readonly width: number;
  readonly height: number;
  readonly svg: string;
}

/**
 * Panel = wycinek SCENY PRODUKCYJNEJ L2 obejmujący stację z torem DER, w skali
 * `PANEL_SCALE` (1 j.św. = `PANEL_SCALE` px), z etykietami WEDŁUG PLANU tej
 * skali — dokładnie to, co rysuje `SldCanvasV3` przy tym powiększeniu.
 */
function renderPanel(testCase: W2cCase): Panel {
  const { enm, stationRef } = buildDerSnFixture(testCase.injections);
  const scene = buildSceneV3(enm, 2);
  const plan: LabelRenderPlan = planSceneLabels(scene.labels, sceneObstacleRects(scene), PANEL_SCALE, sheetSizeFor(scene));
  const prefix = `${stationRef.replace(/\/station$/, '')}/`;
  const owned = (ref: unknown): boolean => typeof ref === 'string' && ref.startsWith(prefix);
  const symbols = scene.symbols.filter((s) => owned(s.meta?.ownerRef));
  const segments = scene.segments.filter((s) => owned(s.meta?.ownerRef));
  const labels = plan.drawn.filter((p) => owned(p.label.ownerRef));
  const xs = [
    ...symbols.flatMap((s) => [s.x, s.x + SYMBOL_DEFS[s.symbolId].width]),
    ...segments.flatMap((s) => s.points.map((p) => p.x)),
    ...labels.flatMap((p) => [p.rect.x, p.rect.x + p.rect.width]),
  ];
  const ys = [
    ...symbols.flatMap((s) => [s.y, s.y + SYMBOL_DEFS[s.symbolId].height]),
    ...segments.flatMap((s) => s.points.map((p) => p.y)),
    ...labels.flatMap((p) => [p.rect.y, p.rect.y + p.rect.height]),
  ];
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const pad = 24;
  const head = 76;
  const width = Math.ceil((Math.max(...xs) - minX) * PANEL_SCALE + 2 * pad);
  const height = Math.ceil((Math.max(...ys) - minY) * PANEL_SCALE + 2 * pad + head);
  const k = PANEL_SCALE;
  const tx = pad - minX * k;
  const ty = pad + head - minY * k;
  const segs = segments
    .map((seg) => {
      const ref = String(seg.meta?.ownerRef ?? '');
      const points = seg.points.map((p) => `${p.x * k},${p.y * k}`).join(' ');
      return `<polyline points="${points}" fill="none" stroke="${segColor(ref)}" stroke-width="2"/>`;
    })
    .join('');
  const glyphs = symbols
    .map((symbol) => {
      const Glyph = SYMBOL_GLYPHS[symbol.symbolId];
      const svg = renderToStaticMarkup(
        <Glyph x={0} y={0} state={symbol.state as 'closed' | 'open' | 'unknown' | undefined} stroke="#E8EEF4" />,
      );
      return `<g transform="translate(${symbol.x * k},${symbol.y * k}) scale(${k})">${svg}</g>`;
    })
    .join('');
  const captions = labels
    .map((planned) => {
      const x = planned.rect.x + planned.rect.width / 2;
      const y = planned.rect.y + planned.rect.height / 2;
      const kind = planned.label.ownerKind;
      const color = kind === 'der' ? '#E8A94C' : kind === 'busbar-voltage' ? '#39C0A8' : '#C0D0DE';
      const rotate = planned.label.rotated ? ` transform="rotate(-90 ${x * k} ${y * k})"` : '';
      return (
        `<text data-owner-ref="${xml(planned.label.ownerRef)}" x="${x * k}" y="${y * k}"` +
        ` text-anchor="middle" dominant-baseline="middle" font-family="sans-serif"` +
        ` font-size="${planned.fontSize * k}" font-weight="${LABEL_TYPOGRAPHY[planned.label.labelClass].fontWeight}"` +
        ` fill="${color}"${rotate}>${xml(planned.text)}</text>`
      );
    })
    .join('');
  const panel = testCase.panel!;
  const svg =
    `<rect x="4" y="4" width="${width - 8}" height="${height - 8}" rx="12" fill="#111C28" stroke="#25384A"/>` +
    `<text x="${width / 2}" y="34" text-anchor="middle" font-family="sans-serif" font-size="17" font-weight="700" fill="#E8EEF4">${xml(panel.title)}</text>` +
    `<text x="${width / 2}" y="58" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#9FB3C8">${xml(panel.subtitle)} · L2 @${PANEL_SCALE}</text>` +
    `<g transform="translate(${tx},${ty})">${segs}${glyphs}${captions}</g>`;
  return { width, height, svg };
}

for (const testCase of CASES) gate(testCase);

const panels = CASES.filter((c) => c.panel !== null).map(renderPanel);
const GAP = 20;
const TOP = 84;
const WIDTH = panels.reduce((sum, p) => sum + p.width + GAP, GAP);
const HEIGHT = TOP + Math.max(...panels.map((p) => p.height)) + GAP;
let cursor = GAP;
const placed = panels
  .map((p) => {
    const g = `<g transform="translate(${cursor},${TOP})">${p.svg}</g>`;
    cursor += p.width + GAP;
    return g;
  })
  .join('');
const verdictLine = rejections.length > 0
  ? `NIEZGODNE: ${rejections.length} kontroli planu etykiet nie przeszło — patrz raport CI`
  : `Plan etykiet: ${report.length} kontroli (przypadek × LOD × skala aktywna w kamerze) bez kolizji i bez utraconych tożsamości`;
const title =
  `<text x="20" y="34" font-family="Inter, system-ui, sans-serif" font-size="23" font-weight="700" fill="#E8EEF4">` +
  `W2c · Tor DER przyłączony po stronie SN — scena produkcyjna L2, plan etykiet kanwy</text>` +
  `<text x="20" y="60" font-family="Inter, system-ui, sans-serif" font-size="13" fill="${rejections.length > 0 ? '#FF5E5E' : '#9FB3C8'}">` +
  `${xml(verdictLine)}</text>`;
const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">` +
  `<rect width="${WIDTH}" height="${HEIGHT}" fill="#0E1621"/>${title}${placed}</svg>`;

writeFileSync(`${OUT}/w2c-l2-tor-sn.svg`, svg);
writeFileSync(`${OUT}/w2c-plan-etykiet.txt`, `${report.join('\n')}\n`);
for (const line of report) console.log(line);
console.log('wrote', `${OUT}/w2c-l2-tor-sn.svg`);
if (rejections.length > 0) {
  for (const issue of rejections) console.error('[FAIL]', issue);
  process.exitCode = 1; // SVG diagnostyczny istnieje, ale NIGDY nie otrzymuje PASS.
}
