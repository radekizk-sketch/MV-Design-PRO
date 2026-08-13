/**
 * RAMKA-TNIE-PODPISY — POMIAR STANU (odtworzenie pomiarow nadzorcy + inwentarz klasy).
 * Uruchomienie (cwd: mv-design-pro/frontend): npx vite-node scripts/pomiar_ramka.tsx
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import type { EnergyNetworkModel } from '../src/types/enm';
import { buildSceneV3, sceneObstacleRects, type SceneLod, type SceneV3 } from '../src/ui/sld/v3/scene/buildScene';
import { appendUnitToTrunk, loadEnm } from '../src/ui/sld/v3/scene/__tests__/syntheticNetworks';
import {
  boundingBoxOfRect,
  computeInitialCameraState,
  MAX_SCALE,
  MIN_SCALE,
  type BoundingBox,
} from '../src/ui/sld/v3/canvas/camera';
import { SLD_CANVAS_DOCK_INSETS } from '../src/ui/sld/v3/canvas/toolbarLayout';
import { planSceneLabels, type PlannedLabel } from '../src/ui/sld/v3/canvas/labelLegibility';
import { contentBoundingBoxOf, sceneBoxToCameraWorld } from '../src/ui/sld/v3/canvas/SldCanvasV3';
import { sheetSizeFor } from '../src/ui/sld/v3/sheet/outline';
import { labelReservationRect } from '../src/ui/sld/v3/layout/labels';
import { LABEL_TYPOGRAPHY, MIN_READABLE_LABEL_SCREEN_PX, MIN_TEXT_SCREEN_PX, measureTextWidth } from '../src/ui/sld/v3/core/text';

const HERE = dirname(fileURLToPath(import.meta.url));
const referencyjna = JSON.parse(
  readFileSync(resolve(HERE, '../src/ui/sld/v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json'), 'utf8'),
).enm as EnergyNetworkModel;
const jednostka = loadEnm(resolve(HERE, '../src/ui/sld/v3/scene/__tests__/fixtures/openTrunkChain.enm.json'));
const dlugiCiag: EnergyNetworkModel = (() => {
  let enm = referencyjna;
  for (let i = 0; i < 40; i++) enm = appendUnitToTrunk(enm, jednostka, `s91r${String(i).padStart(2, '0')}`);
  return enm;
})();

const KADR = { width: 1800, height: 1100 } as const;
const f = (v: number, n = 2): string => (Number.isFinite(v) ? v.toFixed(n) : '  n/d');

/** TUSZ malowanego napisu — dokladnie jak rysuje `SceneLabelNode`:
 *  <text x=cx y=cy textAnchor=middle dominantBaseline=middle rotate(-90,cx,cy) gdy rotated>. */
function tuszMalowany(p: PlannedLabel) {
  const cx = p.rect.x + p.rect.width / 2;
  const cy = p.rect.y + p.rect.height / 2;
  const dlugosc = measureTextWidth(p.text, p.fontSize);
  const wysokosc = p.fontSize + 6;
  const w = p.label.rotated ? wysokosc : dlugosc;
  const h = p.label.rotated ? dlugosc : wysokosc;
  return { x: cx - w / 2, y: cy - h / 2, width: w, height: h };
}

interface Wiersz {
  readonly siec: string;
  readonly lod: SceneLod;
  readonly skala: string;
  readonly v: number;
  readonly gora: number; readonly dol: number; readonly lewo: number; readonly prawo: number;
  readonly winowajca: Record<string, string>;
  readonly pow: number; readonly porz: number; readonly rys: number;
}

function zmierz(nazwaSieci: string, enm: EnergyNetworkModel): Wiersz[] {
  const sceny: Record<SceneLod, SceneV3> = { 0: buildSceneV3(enm, 0), 1: buildSceneV3(enm, 1), 2: buildSceneV3(enm, 2) };
  const bboxy: Record<SceneLod, BoundingBox> = {
    0: boundingBoxOfRect(sceny[0].bbox), 1: boundingBoxOfRect(sceny[1].bbox), 2: boundingBoxOfRect(sceny[2].bbox),
  };
  const out: Wiersz[] = [];
  for (const lod of [0, 1, 2] as const) {
    const scene = sceny[lod];
    const cel = sceneBoxToCameraWorld(contentBoundingBoxOf(scene) ?? bboxy[lod]);
    const fit = computeInitialCameraState(cel, KADR, bboxy, null, SLD_CANVAS_DOCK_INSETS).transform.scale;
    const przeszkody = sceneObstacleRects(scene);
    const sheet = sheetSizeFor(scene);
    const SKALE = [
      { nazwa: 'MIN', v: MIN_SCALE },
      { nazwa: `fit=${f(fit, 3)}`, v: fit },
      { nazwa: '0,30', v: 0.3 },
      { nazwa: '0,50', v: 0.5 },
      { nazwa: '0,69', v: 0.69 },
      { nazwa: '1,00', v: 1 },
      { nazwa: '2,00', v: 2 },
      { nazwa: 'MAX', v: MAX_SCALE },
    ];
    for (const s of SKALE) {
      const plan = planSceneLabels(scene.labels, przeszkody, s.v, sheet);
      let gora = Infinity, dol = Infinity, lewo = Infinity, prawo = Infinity;
      const winowajca: Record<string, string> = {};
      for (const p of plan.drawn) {
        const r = tuszMalowany(p);
        if (r.y < gora) { gora = r.y; winowajca.gora = `${p.label.ownerKind}"${p.text}"`; }
        if (r.x < lewo) { lewo = r.x; winowajca.lewo = `${p.label.ownerKind}"${p.text}"`; }
        if (sheet.height - (r.y + r.height) < dol) { dol = sheet.height - (r.y + r.height); winowajca.dol = `${p.label.ownerKind}"${p.text}"`; }
        if (sheet.width - (r.x + r.width) < prawo) { prawo = sheet.width - (r.x + r.width); winowajca.prawo = `${p.label.ownerKind}"${p.text}"`; }
      }
      out.push({
        siec: nazwaSieci, lod, skala: s.nazwa, v: s.v, gora, dol, lewo, prawo, winowajca,
        pow: plan.drawn.filter((p) => p.enlarged).length, porz: plan.droppedIdentity.length, rys: plan.drawn.length,
      });
    }
  }
  return out;
}

console.log('=== RAMKA — POMIAR PRZED ===');
for (const [nazwa, enm] of [['referencyjna', referencyjna], ['dlugi-ciag', dlugiCiag]] as const) {
  for (const lod of [0, 1, 2] as const) {
    const s = buildSceneV3(enm, lod);
    console.log(`${nazwa} L${lod}: bbox=${s.bbox.x},${s.bbox.y} ${s.bbox.width}x${s.bbox.height} sheet=${JSON.stringify(sheetSizeFor(s))} stacje=${s.meta.stationCount} etykiet=${s.labels.length}`);
  }
}
console.log('');
{
  const s = buildSceneV3(referencyjna, 0);
  for (const kod of ['S51', 'S52', 'S53']) {
    for (const l of s.labels.filter((x) => x.text.includes(kod))) {
      const rez = labelReservationRect(l);
      console.log(`L0 "${l.text}" kind=${l.ownerKind} cls=${l.labelClass} placement=${l.placement} rect=(${l.rect.x},${l.rect.y},${l.rect.width}x${l.rect.height}) rez dol=${rez.y + rez.height}`);
    }
  }
}
console.log('');
console.log('(2) LUZ MALOWANEGO TUSZU DO KRAWEDZI ARKUSZA [j.sw.] (ujemny = poza arkuszem)');
console.log('siec         LOD skala      |    gora |     dol |    lewo |   prawo | rys | pow | porz');
const wszystkie = [...zmierz('referencyjna', referencyjna), ...zmierz('dlugi-ciag', dlugiCiag)];
for (const w of wszystkie) {
  console.log(
    `${w.siec.padEnd(12)} L${w.lod} ${w.skala.padEnd(10)} | ${f(w.gora,1).padStart(7)} | ${f(w.dol,1).padStart(7)} | ${f(w.lewo,1).padStart(7)} | ${f(w.prawo,1).padStart(7)} | ${String(w.rys).padStart(4)} | ${String(w.pow).padStart(3)} | ${String(w.porz).padStart(4)}`,
  );
}
console.log('');
console.log('WINOWAJCY dla wierszy z luzem ujemnym:');
for (const w of wszystkie) {
  const zle: string[] = [];
  if (w.gora < 0) zle.push(`gora ${f(w.gora,1)} ${w.winowajca.gora}`);
  if (w.dol < 0) zle.push(`dol ${f(w.dol,1)} ${w.winowajca.dol}`);
  if (w.lewo < 0) zle.push(`lewo ${f(w.lewo,1)} ${w.winowajca.lewo}`);
  if (w.prawo < 0) zle.push(`prawo ${f(w.prawo,1)} ${w.winowajca.prawo}`);
  if (zle.length) console.log(`  ${w.siec} L${w.lod} @${w.skala}: ${zle.join(' | ')}`);
}
console.log('');
console.log(`MIN_READABLE=${MIN_READABLE_LABEL_SCREEN_PX} MIN_TEXT=${MIN_TEXT_SCREEN_PX} t1 prog powiekszenia=${f(MIN_READABLE_LABEL_SCREEN_PX / LABEL_TYPOGRAPHY.t1.fontSize, 4)}`);
