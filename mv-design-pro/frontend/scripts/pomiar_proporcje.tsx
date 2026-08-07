/**
 * PROPORCJE — POMIAR STANU PRZED (karta PROPORCJE, zgłoszenie właściciela
 * 2026-08-07 „brak proporcji, grubości"; zrzut `docs/sld/audyt-2026-08/
 * b2-po-ciemny.png`, L2, skala 1,380 px/j.św.).
 *
 * CO MIERZY — na REALNEJ fixturze 53 stacji (`sldSubstrate52s`), tej samej,
 * na której stoi runner odbioru `sld_v3_acceptance.mjs`, przez PRODUKCYJNE
 * funkcje planu etykiet i wag kresek (zero drugiej implementacji):
 *   (a) wysokość glifu każdej klasy typografii [px EKRANU],
 *   (b) wysokość/szerokość symbolu aparatu [px EKRANU],
 *   (c) STOSUNEK napis:symbol (oznacznik aparatu do symbolu, który opisuje),
 *   (d) grubość kreski toru vs kreski aparatu [px EKRANU],
 *   (e) gęstość tuszu wewnątrz ramy stacji,
 *   (f) liczba wystąpień tożsamości stacji w jednym bloku,
 *   (g) liczba identycznych oznaczników w jednej rozdzielni,
 *   (h) liczba etykiet skróconych mimo wolnego miejsca.
 *
 * ILOCZYN CECH: {poziom szczegółu L0/L1/L2} × {skala kamery: dopasowanie,
 * skala zrzutu 1,380, dolny i górny kraniec}. Sam przykład ze zrzutu nie
 * wystarcza — defekt „proporcje pękają dopiero w reżimie powiększania pisma"
 * schowałby się w nim.
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   npx vite-node scripts/pomiar_proporcje.tsx
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import type { EnergyNetworkModel } from '../src/types/enm';
import { buildSceneV3, sceneObstacleRects, type SceneLod, type SceneV3 } from '../src/ui/sld/v3/scene/buildScene';
import {
  boundingBoxOfRect,
  computeInitialCameraState,
  MAX_SCALE,
  MIN_SCALE,
  type BoundingBox,
} from '../src/ui/sld/v3/canvas/camera';
import { SLD_CANVAS_DOCK_INSETS } from '../src/ui/sld/v3/canvas/toolbarLayout';
import { planSceneLabels } from '../src/ui/sld/v3/canvas/labelLegibility';
import { LABEL_TYPOGRAPHY, type LabelClass } from '../src/ui/sld/v3/core/text';
import {
  APPARATUS_STROKE_WIDTH,
  apparatusStrokeWidthForScale,
  SEGMENT_STROKE_WIDTH,
  segmentStrokeWidthForScale,
  type PreviewSegmentKind,
} from '../src/ui/sld/v3/compose/preview';
import { SYMBOL_DEFS } from '../src/ui/sld/v3/symbols/defs';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(HERE, '../src/ui/sld/v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json');
const enm = JSON.parse(readFileSync(fixturePath, 'utf8')).enm as EnergyNetworkModel;

const KADR = { width: 1400, height: 900 } as const;

const sceny: Readonly<Record<SceneLod, SceneV3>> = {
  0: buildSceneV3(enm, 0),
  1: buildSceneV3(enm, 1),
  2: buildSceneV3(enm, 2),
};
const bboxy: Readonly<Record<SceneLod, BoundingBox>> = {
  0: boundingBoxOfRect(sceny[0].bbox),
  1: boundingBoxOfRect(sceny[1].bbox),
  2: boundingBoxOfRect(sceny[2].bbox),
};

const f = (v: number, n = 2): string => v.toFixed(n);

console.log('=== PROPORCJE — POMIAR PRZED ===');
console.log(`fixtura: sldSubstrate52s · stacje: ${sceny[2].meta.stationCount} · kadr ${KADR.width}×${KADR.height}`);
console.log(`MIN_SCALE=${MIN_SCALE} MAX_SCALE=${MAX_SCALE}`);
console.log('');

// --------------------------------------------------------------------------
// Skale badane: dopasowanie per LOD + skala zrzutu właściciela + krańce.
// --------------------------------------------------------------------------
const skalaDopasowania: Record<SceneLod, number> = { 0: 0, 1: 0, 2: 0 };
for (const lod of [0, 1, 2] as const) {
  const stan = computeInitialCameraState(bboxy[lod], KADR, bboxy, null, SLD_CANVAS_DOCK_INSETS);
  skalaDopasowania[lod] = stan.transform.scale;
}
console.log('SKALE DOPASOWANIA (fit-to-content, kadr roboczy):');
for (const lod of [0, 1, 2] as const) console.log(`  L${lod}: ${f(skalaDopasowania[lod], 4)} px/j.św.`);
console.log('');

const SKALE: readonly { readonly nazwa: string; readonly v: number }[] = [
  { nazwa: 'MIN', v: MIN_SCALE },
  { nazwa: 'fit-L0', v: skalaDopasowania[0] },
  { nazwa: 'fit-L2', v: skalaDopasowania[2] },
  { nazwa: 'zrzut-1,380', v: 1.38 },
  { nazwa: 'praca-1,0', v: 1 },
  { nazwa: 'blisko-4,0', v: 4 },
  { nazwa: 'MAX', v: MAX_SCALE },
];

// --------------------------------------------------------------------------
// (d) GRUBOŚCI: tor vs aparat — NA EKRANIE.
// --------------------------------------------------------------------------
console.log('(d) GRUBOŚĆ KRESKI NA EKRANIE [px] — tor vs aparat');
console.log('skala    | busGpz |  bus  |snTrunk|  sn   |  lv   | APARAT | bus:aparat | snTrunk:aparat');
const RANGI: readonly PreviewSegmentKind[] = ['busGpz', 'bus', 'snTrunk', 'sn', 'lv'];
for (const s of SKALE) {
  const tor = RANGI.map((k) => segmentStrokeWidthForScale(k, s.v) * s.v);
  // Aparat: waga PRODUKCYJNA z tej samej tabeli rang co tory.
  const aparat = apparatusStrokeWidthForScale(s.v) * s.v;
  console.log(
    `${s.nazwa.padEnd(12)} @${f(s.v, 3).padStart(6)} | ` +
      tor.map((t) => f(t, 3).padStart(6)).join(' | ') +
      ` | ${f(aparat, 3).padStart(6)} | ${f(tor[1] / aparat, 2).padStart(6)}× | ${f(tor[2] / aparat, 2).padStart(6)}×`,
  );
}
console.log('');

// --------------------------------------------------------------------------
// (a)(b)(c) TYPOGRAFIA vs SYMBOL — z PLANU produkcyjnego.
// --------------------------------------------------------------------------
interface WierszPomiaru {
  readonly lod: SceneLod;
  readonly skala: string;
  readonly v: number;
}

/** Wysokość symbolu APARATU [j.św.] — mediana po symbolach aparatury sceny. */
const APARATURA_SYMBOLE = new Set([
  'breaker', 'disconnector', 'earthSwitch', 'fuseSwitch', 'loadBreakSwitch',
  'currentTransformer', 'voltageTransformer', 'surgeArrester', 'cableHead',
]);

function symboleAparatury(scene: SceneV3): readonly { readonly id: string; readonly w: number; readonly h: number; readonly x: number; readonly y: number }[] {
  const out: { id: string; w: number; h: number; x: number; y: number }[] = [];
  for (const sym of scene.symbols) {
    if (!APARATURA_SYMBOLE.has(sym.symbolId)) continue;
    const def = SYMBOL_DEFS[sym.symbolId];
    out.push({ id: sym.symbolId, w: def.width, h: def.height, x: sym.x, y: sym.y });
  }
  return out;
}

function mediana(xs: readonly number[]): number {
  if (xs.length === 0) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

console.log('(a)(b)(c) TYPOGRAFIA NA EKRANIE vs SYMBOL APARATU');
console.log('LOD skala        | t1 px | t2 px | t3 px | t4 px | symbol h px | oznacznik:symbol | powiększonych');
for (const lod of [0, 1, 2] as const) {
  const scene = sceny[lod];
  const przeszkody = sceneObstacleRects(scene);
  const aparaty = symboleAparatury(scene);
  const medianaH = mediana(aparaty.map((a) => a.h));
  for (const s of SKALE) {
    const plan = planSceneLabels(scene.labels, przeszkody, s.v);
    const perKlasa: Record<LabelClass, number[]> = { t1: [], t2: [], t3: [], t4: [] };
    for (const p of plan.drawn) perKlasa[p.label.labelClass].push(p.fontSize * s.v);
    const powiekszonych = plan.drawn.filter((p) => p.enlarged).length;
    // (c) oznacznik aparatu (ownerKind 'apparatus') vs wysokość symbolu, który opisuje.
    const oznaczniki = plan.drawn.filter((p) => p.label.ownerKind === 'apparatus');
    const stosunki = oznaczniki.map((p) => (p.fontSize * s.v) / (medianaH * s.v));
    const kol = (['t1', 't2', 't3', 't4'] as const).map((c) =>
      perKlasa[c].length ? f(mediana(perKlasa[c]), 1).padStart(5) : '    —',
    );
    console.log(
      `L${lod} ${s.nazwa.padEnd(12)} | ${kol.join(' | ')} | ${f(medianaH * s.v, 1).padStart(11)} | ` +
        `${(stosunki.length ? f(mediana(stosunki), 2) : '—').padStart(16)} | ${String(powiekszonych).padStart(13)}`,
    );
  }
}
console.log('');

// --------------------------------------------------------------------------
// (e) GĘSTOŚĆ TUSZU / (f) TOŻSAMOŚĆ / (g) OZNACZNIKI — per BLOK STACJI.
// --------------------------------------------------------------------------
const REF_STACJI = /^(stn\/[0-9a-f]+|gpz\/[0-9a-f]+)/;

for (const lod of [1, 2] as const) {
  const scene = sceny[lod];
  // Blok = bbox symboli jednej stacji; tusz = suma pól bboxów symboli.
  const bloki = new Map<string, { x0: number; y0: number; x1: number; y1: number; tusz: number }>();
  for (const sym of scene.symbols) {
    const m = REF_STACJI.exec(sym.meta?.ownerRef ?? '');
    if (!m) continue;
    const d = SYMBOL_DEFS[sym.symbolId];
    const b = bloki.get(m[1]) ?? { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, tusz: 0 };
    b.x0 = Math.min(b.x0, sym.x); b.y0 = Math.min(b.y0, sym.y);
    b.x1 = Math.max(b.x1, sym.x + d.width); b.y1 = Math.max(b.y1, sym.y + d.height);
    b.tusz += d.width * d.height;
    bloki.set(m[1], b);
  }
  const gest: number[] = [];
  for (const b of bloki.values()) {
    const pole = (b.x1 - b.x0) * (b.y1 - b.y0);
    if (pole > 0) gest.push(b.tusz / pole);
  }
  console.log(`(e) L${lod}: bloków ${bloki.size} · mediana pokrycia bloku symbolami: ${f(mediana(gest) * 100, 1)}%`);

  // (f) kod stacji w etykietach jednego bloku.
  const kodBloku = new Map<string, string>();
  for (const l of scene.labels) {
    const m = REF_STACJI.exec(l.ownerRef);
    if (!m) continue;
    const kod = /(^|\s)(S\d+)(\s|$|\s·)/.exec(l.text)?.[2] ?? (/^S\d+$/.test(l.text.trim()) ? l.text.trim() : null);
    if (kod && !kodBloku.has(m[1])) kodBloku.set(m[1], kod);
  }
  const wystapienia: number[] = [];
  let przyklad = '';
  for (const [ref, kod] of kodBloku) {
    const trafienia = scene.labels.filter((l) => REF_STACJI.exec(l.ownerRef)?.[1] === ref && l.text.includes(kod));
    wystapienia.push(trafienia.length);
    if (!przyklad && trafienia.length > 1) przyklad = `${kod}: ` + trafienia.map((l) => `${l.ownerKind}"${l.text}"`).join(' + ');
  }
  console.log(`(f) L${lod}: bloków z kodem ${kodBloku.size} · mediana wystąpień kodu w bloku: ${mediana(wystapienia)} · max ${Math.max(...wystapienia, 0)}`);
  if (przyklad) console.log(`    przykład: ${przyklad}`);

  // (g) identyczne oznaczniki aparatu w jednej rozdzielni.
  const perBlok = new Map<string, Map<string, number>>();
  for (const l of scene.labels) {
    if (l.ownerKind !== 'apparatus') continue;
    const m = REF_STACJI.exec(l.ownerRef);
    if (!m) continue;
    const mapa = perBlok.get(m[1]) ?? new Map<string, number>();
    mapa.set(l.text, (mapa.get(l.text) ?? 0) + 1);
    perBlok.set(m[1], mapa);
  }
  let maxPowt = 0; let zDuplikatem = 0;
  for (const mapa of perBlok.values()) {
    const lok = Math.max(...mapa.values(), 0);
    if (lok > 1) zDuplikatem += 1;
    if (lok > maxPowt) maxPowt = lok;
  }
  console.log(`(g) L${lod}: rozdzielni ${perBlok.size} · z powtórzonym oznacznikiem ${zDuplikatem} · rekord powtórzeń ${maxPowt}`);

  // (f2) rozróżnialność opisu pola w jednej rozdzielni (kontekst oznacznika).
  const perBlokPola = new Map<string, string[]>();
  for (const l of scene.labels) {
    if (l.ownerKind !== 'field-role') continue;
    const m = REF_STACJI.exec(l.ownerRef);
    if (!m) continue;
    const lista = perBlokPola.get(m[1]) ?? [];
    lista.push(l.text);
    perBlokPola.set(m[1], lista);
  }
  let blokiZNierozroznialnymiPolami = 0;
  for (const lista of perBlokPola.values()) {
    if (new Set(lista).size < lista.length) blokiZNierozroznialnymiPolami += 1;
  }
  console.log(`(g2) L${lod}: bloków z NIEROZRÓŻNIALNYMI opisami pól: ${blokiZNierozroznialnymiPolami}/${perBlokPola.size}`);
}
console.log('');

// --------------------------------------------------------------------------
// (h) SKRACANIE MIMO WOLNEGO MIEJSCA.
// --------------------------------------------------------------------------
console.log('(h) ETYKIETY SKRÓCONE (tekst planu ≠ tekst sceny) — per LOD × skala');
console.log('LOD skala        | skróconych | porzuconych tożsamości | ukrytych danych');
for (const lod of [0, 1, 2] as const) {
  const scene = sceny[lod];
  const przeszkody = sceneObstacleRects(scene);
  for (const s of SKALE) {
    const plan = planSceneLabels(scene.labels, przeszkody, s.v);
    const skrocone = plan.drawn.filter((p) => p.text !== p.label.text).length;
    console.log(
      `L${lod} ${s.nazwa.padEnd(12)} | ${String(skrocone).padStart(10)} | ${String(plan.droppedIdentity.length).padStart(22)} | ${String(plan.hiddenDetail.length).padStart(15)}`,
    );
  }
}
console.log('');
console.log('KANON ŚWIATA (bez kamery): ' +
  RANGI.map((k) => `${k}=${SEGMENT_STROKE_WIDTH[k]}`).join(' · ') +
  ` · aparat=${APPARATUS_STROKE_WIDTH}`);
console.log('TYPOGRAFIA ŚWIATA: ' +
  (['t1', 't2', 't3', 't4'] as const).map((c) => `${c}=${LABEL_TYPOGRAPHY[c].fontSize}`).join(' · '));
