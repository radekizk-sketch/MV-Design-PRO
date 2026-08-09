/**
 * RAMKA-TNIE-PODPISY — DOWÓD WIZUALNY: produkcyjna kanwa `SldCanvasV3` na
 * obu sieciach pomiarowych, na przeglądzie (L0) i pełnym szczególe (L2),
 * w obu motywach, przy KADRZE DOPASOWANIA (tam, gdzie defekt jest widoczny).
 *
 * KADR WYCHODZI Z KANWY, NIE JEST NA NIĄ NAKŁADANY: kamera liczona
 * PRODUKCYJNĄ ścieżką (`computeInitialCameraState` na `contentBoundingBoxOf`
 * w prostokącie bezpiecznym doków) i podawana kanwie przez `cameraOverride`.
 * Podmiana `viewBox` po fakcie jest zakazana — sonda, która zniekształca
 * mierzony obiekt, jest defektem tej samej wagi co defekt produktu (pułapka
 * opisana przy karcie PROPORCJE).
 *
 * Stopka niesie LICZBY odbioru: najmniejszy luz malowanego tuszu do każdej z
 * czterech krawędzi arkusza (ujemny = napis pod ramką) oraz liczbę kolizji w
 * dolnym pasie chromu.
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   CANON_OUT=<dir> npx vite-node scripts/render_ramka.tsx
 *   CANON_OUT=<dir> node scripts/rasterize.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderToStaticMarkup } from 'react-dom/server';

import type { EnergyNetworkModel } from '../src/types/enm';
import {
  buildSceneV3,
  sceneObstacleRects,
  SCENE_LOD_LABELS_PL,
  type SceneLod,
  type SceneV3,
} from '../src/ui/sld/v3/scene/buildScene';
import { appendUnitToTrunk, loadEnm } from '../src/ui/sld/v3/scene/__tests__/syntheticNetworks';
import { SldCanvasV3, contentBoundingBoxOf, sceneBoxToCameraWorld } from '../src/ui/sld/v3/canvas/SldCanvasV3';
import {
  boundingBoxOfRect,
  computeInitialCameraState,
  type BoundingBox,
  type CameraState,
} from '../src/ui/sld/v3/canvas/camera';
import { SLD_CANVAS_DOCK_INSETS } from '../src/ui/sld/v3/canvas/toolbarLayout';
import { planSceneLabels } from '../src/ui/sld/v3/canvas/labelLegibility';
import {
  chromeCaptionCollisions,
  hiddenLabelsHintScreenRect,
  hiddenLabelsHintText,
  sheetCaptionScreenRects,
} from '../src/ui/sld/v3/canvas/chromeLayout';
import { sheetSizeFor } from '../src/ui/sld/v3/sheet/outline';
import { FRAME_MARGIN } from '../src/ui/sld/v3/sheet/Frame';
import { measureTextWidth, screenFixedFontSize } from '../src/ui/sld/v3/core/text';
import { useThemeModeStore } from '../src/ui2/theme/themeMode';
import { sldPaletteForTheme } from '../src/ui/sld/v3/theme/palette';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.CANON_OUT ?? '/tmp/canon';
mkdirSync(OUT, { recursive: true });

const referencyjna = (
  JSON.parse(
    readFileSync(resolve(HERE, '../src/ui/sld/v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json'), 'utf8'),
  ) as { readonly enm: EnergyNetworkModel }
).enm;
const jednostka = loadEnm(resolve(HERE, '../src/ui/sld/v3/scene/__tests__/fixtures/openTrunkChain.enm.json'));
const dlugiCiag: EnergyNetworkModel = (() => {
  let enm = referencyjna;
  for (let i = 0; i < 40; i++) enm = appendUnitToTrunk(enm, jednostka, `s91r${String(i).padStart(2, '0')}`);
  return enm;
})();

const SIECI = [
  { klucz: 'referencyjna', enm: referencyjna },
  { klucz: 'dlugi-ciag', enm: dlugiCiag },
] as const;
const MOTYWY = [
  { klucz: 'ciemny', mode: 'dark_scada' as const },
  { klucz: 'jasny', mode: 'light_technical' as const },
];
const FAZA = process.env.RAMKA_FAZA ?? 'po';
const WIDTH = 1800;
const HEIGHT = 1100;
const FOOTER = 76;
const METRYKA = { measure: measureTextWidth };

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

for (const siec of SIECI) {
  const sceneByLod: Record<SceneLod, SceneV3> = {
    0: buildSceneV3(siec.enm, 0),
    1: buildSceneV3(siec.enm, 1),
    2: buildSceneV3(siec.enm, 2),
  };
  const lodBboxes: Record<SceneLod, BoundingBox> = {
    0: boundingBoxOfRect(sceneByLod[0].bbox),
    1: boundingBoxOfRect(sceneByLod[1].bbox),
    2: boundingBoxOfRect(sceneByLod[2].bbox),
  };
  for (const lod of [0, 2] as SceneLod[]) {
    const scene = sceneByLod[lod];
    const sheet = sheetSizeFor(scene);
    const cel = sceneBoxToCameraWorld(contentBoundingBoxOf(scene) ?? lodBboxes[lod]);
    const stan = computeInitialCameraState(cel, { width: WIDTH, height: HEIGHT }, lodBboxes, null, SLD_CANVAS_DOCK_INSETS);
    // Kamera PRODUKCYJNA podana kanwie wprost — zero podmiany viewBoxu po fakcie.
    const kamera: CameraState = { ...stan, lod, viewportSize: { width: WIDTH, height: HEIGHT }, lodBboxes };
    const scale = kamera.transform.scale;

    const plan = planSceneLabels(scene.labels, sceneObstacleRects(scene), scale, sheet);
    const luzy = { gora: Infinity, dol: Infinity, lewo: Infinity, prawo: Infinity };
    for (const p of plan.drawn) {
      luzy.gora = Math.min(luzy.gora, p.rect.y);
      luzy.lewo = Math.min(luzy.lewo, p.rect.x);
      luzy.dol = Math.min(luzy.dol, sheet.height - (p.rect.y + p.rect.height));
      luzy.prawo = Math.min(luzy.prawo, sheet.width - (p.rect.x + p.rect.width));
    }
    const niewidoczne = plan.hiddenDetail.length + plan.droppedIdentity.length;
    const captions = sheetCaptionScreenRects(
      {
        sheet,
        frameMargin: FRAME_MARGIN,
        camera: kamera.transform,
        captionFontPx: screenFixedFontSize('t2', scale) * scale,
        scaleLabel: 'wg kamery',
        lodLabel: SCENE_LOD_LABELS_PL[lod],
      },
      METRYKA,
    );
    const hint = hiddenLabelsHintScreenRect(
      { width: WIDTH, height: HEIGHT },
      hiddenLabelsHintText(Math.max(1, niewidoczne)),
      captions,
      METRYKA,
    );
    const kolizjeChromu = chromeCaptionCollisions([...captions, { id: 'ukryto', ...hint }]);

    const f = (v: number): string => (Number.isFinite(v) ? v.toFixed(1) : 'n/d');
    const opis =
      `${SCENE_LOD_LABELS_PL[lod]} (L${lod}) · ${siec.klucz} · ${scene.meta.stationCount} stacji · ` +
      `arkusz ${sheet.width}×${sheet.height} j.św. · skala kamery ${scale.toFixed(3)} (kadr dopasowania) · faza ${FAZA.toUpperCase()}`;
    const opis2 =
      `LUZ MALOWANEGO TUSZU DO KRAWĘDZI ARKUSZA [j.św.] (ujemny = napis pod ramką): ` +
      `góra ${f(luzy.gora)} · dół ${f(luzy.dol)} · lewo ${f(luzy.lewo)} · prawo ${f(luzy.prawo)} · ` +
      `narysowanych ${plan.drawn.length}, porzuconych tożsamości ${plan.droppedIdentity.length} · ` +
      `kolizji napisów chromu ${kolizjeChromu.length}`;

    for (const motyw of MOTYWY) {
      useThemeModeStore.setState({ mode: motyw.mode });
      const paleta = sldPaletteForTheme(motyw.mode);
      const inner = renderToStaticMarkup(
        <SldCanvasV3
          snapshot={siec.enm}
          width={WIDTH}
          height={HEIGHT}
          lodOverride={lod}
          cameraOverride={kamera}
          paletteMode={motyw.mode}
        />,
      ).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
      const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT + FOOTER}" ` +
        `viewBox="0 0 ${WIDTH} ${HEIGHT + FOOTER}">` +
        `<rect x="0" y="0" width="${WIDTH}" height="${HEIGHT + FOOTER}" fill="${paleta.canvasBackground}"/>` +
        `${inner}` +
        `<text x="16" y="${HEIGHT + 28}" font-family="system-ui,sans-serif" font-size="15" ` +
        `fill="${paleta.baseStroke}">${escapeXml(opis)}</text>` +
        `<text x="16" y="${HEIGHT + 54}" font-family="system-ui,sans-serif" font-size="15" ` +
        `fill="${paleta.baseStroke}">${escapeXml(opis2)}</text>` +
        `</svg>`;
      const nazwa = `ramka-${FAZA}-${siec.klucz}-L${lod}-${motyw.klucz}.svg`;
      writeFileSync(resolve(OUT, nazwa), svg, 'utf8');
      console.log('svg', nazwa, `luzy dół=${f(luzy.dol)} lewo=${f(luzy.lewo)} prawo=${f(luzy.prawo)} kolizjeChromu=${kolizjeChromu.length}`);
    }
  }
}
