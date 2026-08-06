/**
 * S9-7/S9-8 (TYPOGRAFIA, RAMKA ARKUSZA I HIERARCHIA RYSUNKU; audyt
 * `docs/sld/AUDYT_JAKOSCI_SLD_2026-08.md` znaleziska C-4/C-6) — DOWÓD WIZUALNY:
 * produkcyjna kanwa v3 renderuje obie sieci pomiarowe na przeglądzie (L0) i
 * pełnym szczególe (L2), w OBU motywach, ze stopką POMIAROWĄ.
 *
 * Stopka niesie liczby, na których stoi odbiór karty (nie opis „wygląda
 * dobrze"): gęstość tuszu, proporcja arkusza, liczba kolumn/wierszy stref,
 * najmniejszy NARYSOWANY napis w px EKRANU, waga magistrali w px EKRANU.
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   CANON_OUT=<dir> npx vite-node scripts/render_s9_7_8_typografia.tsx
 *   CANON_OUT=<dir> node scripts/rasterize.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';

import type { EnergyNetworkModel } from '../src/types/enm';
import {
  buildSceneV3,
  sceneObstacleRects,
  sheetAspectRatio,
  sheetFillRatio,
  sheetRowBandsOf,
  SCENE_LOD_LABELS_PL,
  type SceneLod,
  type SceneV3,
} from '../src/ui/sld/v3/scene/buildScene';
import { planSceneLabels } from '../src/ui/sld/v3/canvas/labelLegibility';
import { appendUnitToTrunk, loadEnm } from '../src/ui/sld/v3/scene/__tests__/syntheticNetworks';
import { SldCanvasV3, contentBoundingBoxOf, sceneBoxToCameraWorld } from '../src/ui/sld/v3/canvas/SldCanvasV3';
import { boundingBoxOfRect, computeInitialCameraState } from '../src/ui/sld/v3/canvas/camera';
import { SLD_CANVAS_DOCK_INSETS } from '../src/ui/sld/v3/canvas/toolbarLayout';
import { segmentStrokeWidthForScale } from '../src/ui/sld/v3/compose/preview';
import { SHEET_WIDTH_QUANTUM } from '../src/ui/sld/v3/layout/sheetRows';
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

const WIDTH = 1800;
const HEIGHT = 1100;
const FOOTER = 76;

/** Skala kamery startowej TEJ kanwy (ścieżka produkcyjna: fit do treści w
 *  prostokącie bezpiecznym) — bez niej pomiar „px ekranu" byłby zmyślony. */
function skalaKamery(sceneByLod: Record<SceneLod, SceneV3>, lod: SceneLod): number {
  const lodBboxes = {
    0: boundingBoxOfRect(sceneByLod[0].bbox),
    1: boundingBoxOfRect(sceneByLod[1].bbox),
    2: boundingBoxOfRect(sceneByLod[2].bbox),
  } as const;
  const cel = sceneBoxToCameraWorld(contentBoundingBoxOf(sceneByLod[lod]) ?? lodBboxes[lod]);
  return computeInitialCameraState(cel, { width: WIDTH, height: HEIGHT }, lodBboxes, null, SLD_CANVAS_DOCK_INSETS)
    .transform.scale;
}

for (const siec of SIECI) {
  const sceneByLod: Record<SceneLod, SceneV3> = {
    0: buildSceneV3(siec.enm, 0),
    1: buildSceneV3(siec.enm, 1),
    2: buildSceneV3(siec.enm, 2),
  };
  for (const lod of [0, 2] as SceneLod[]) {
    const scene = sceneByLod[lod];
    const scale = skalaKamery(sceneByLod, lod);
    const plan = planSceneLabels(scene.labels, sceneObstacleRects(scene), scale);
    const najmniejszyNapis = plan.drawn.reduce((min, p) => Math.min(min, p.fontSize * scale), Infinity);
    const kolumnStref = Math.max(1, Math.ceil((scene.bbox.x + scene.bbox.width) / SHEET_WIDTH_QUANTUM));
    const wagaMagistrali = segmentStrokeWidthForScale('snTrunk', scale) * scale;
    const wagaOdgalezienia = segmentStrokeWidthForScale('sn', scale) * scale;
    const opis =
      `${SCENE_LOD_LABELS_PL[lod]} (L${lod}) · ${siec.klucz} · skala kamery=${scale.toFixed(3)} · ` +
      `gestosc tuszu=${(sheetFillRatio(scene) * 100).toFixed(2)}% · proporcja=${sheetAspectRatio(scene).toFixed(2)} : 1 · ` +
      `strefy=${kolumnStref} kol. x ${sheetRowBandsOf(scene).length} wierszy`;
    const opis2 =
      `najmniejszy narysowany napis=${Number.isFinite(najmniejszyNapis) ? najmniejszyNapis.toFixed(2) : 'n/d'} px ekranu ` +
      `(podloga odbioru 8 px) · narysowanych=${plan.drawn.length} ukrytych=${plan.hiddenDetail.length} ` +
      `porzuconych=${plan.droppedIdentity.length} · waga magistrali=${wagaMagistrali.toFixed(2)} px ekranu, ` +
      `odgalezienia=${wagaOdgalezienia.toFixed(2)} px`;
    for (const motyw of MOTYWY) {
      useThemeModeStore.setState({ mode: motyw.mode });
      const paleta = sldPaletteForTheme(motyw.mode);
      const inner = renderToStaticMarkup(
        <SldCanvasV3 snapshot={siec.enm} width={WIDTH} height={HEIGHT} lodOverride={lod} />,
      );
      const withNs = inner.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
      const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT + FOOTER}" ` +
        `viewBox="0 0 ${WIDTH} ${HEIGHT + FOOTER}">` +
        `<rect x="0" y="0" width="${WIDTH}" height="${HEIGHT + FOOTER}" fill="${paleta.canvasBackground}"/>` +
        `${withNs}` +
        `<text x="16" y="${HEIGHT + 28}" font-family="system-ui,sans-serif" font-size="15" ` +
        `fill="${paleta.baseStroke}">${opis}</text>` +
        `<text x="16" y="${HEIGHT + 54}" font-family="system-ui,sans-serif" font-size="15" ` +
        `fill="${paleta.baseStroke}">${opis2}</text>` +
        `</svg>`;
      const nazwa = `s9-7-8-${siec.klucz}-L${lod}-${motyw.klucz}.svg`;
      writeFileSync(resolve(OUT, nazwa), svg, 'utf8');
      console.log('svg', nazwa);
    }
  }
}
