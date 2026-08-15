/**
 * B-2 — POMIAR KAMERY po operacji zmieniającej model (karta B-2, audyt
 * `docs/sld/AUDYT_JAKOSCI_SLD_2026-08.md` §4.2/§4.3).
 *
 * Odtwarza scenariusz audytu na REALNEJ parze migawek z żywego backendu
 * (sieć N stacji → wstawienie stacji na ŚRODKOWYM odcinku magistrali) i
 * porównuje DWA zachowania kamery na tym samym wejściu:
 *   · PRZED (`'refit'`)   — bezwarunkowe dopasowanie do całej sieci,
 *   · PO    (`'kotwicz'`) — kotwiczenie na obiekcie wskazanym przez operację.
 * Liczby: skala, poziom szczegółu, przesunięcie miejsca edycji pod kadrem oraz
 * rozmiar wstawionego obiektu na ekranie.
 *
 * Wejście (katalog `B2_DIR`, pliki wytwarza `scripts/b2_zbuduj_pare.mjs`):
 *   b2-przed.enm.json · b2-po.enm.json · b2-odpowiedz.json
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   B2_DIR=<katalog> npx vite-node scripts/pomiar_b2_kamera.tsx
 */
import { readFileSync } from 'node:fs';

import type { EnergyNetworkModel } from '../src/types/enm';
import { buildSceneV3, type SceneLod, type SceneV3 } from '../src/ui/sld/v3/scene/buildScene';
import {
  boundingBoxOfRect,
  cameraReducer,
  cameraViewBox,
  computeInitialCameraState,
  refScaleFor,
  zoomFactorToEnterNextLod,
  type BoundingBox,
  type CameraState,
} from '../src/ui/sld/v3/canvas/camera';
import { contentBoundingBoxOf, sceneBoxToCameraWorld } from '../src/ui/sld/v3/canvas/SldCanvasV3';
import { SLD_CANVAS_DOCK_INSETS } from '../src/ui/sld/v3/canvas/toolbarLayout';
import { kotwicaWidoku, prostokatElementuWScenie } from '../src/ui/sld/v3/canvas/viewAnchor';
import { wskazanieOperacji } from '../src/ui/topology/wskazanieOperacji';

const DIR = process.env.B2_DIR ?? '/tmp/b2';
const wczytaj = (p: string): unknown => JSON.parse(readFileSync(p, 'utf8'));

const przed = (wczytaj(`${DIR}/b2-przed.enm.json`) as { enm: EnergyNetworkModel }).enm;
const po = (wczytaj(`${DIR}/b2-po.enm.json`) as { enm: EnergyNetworkModel }).enm;
const odpowiedz = wczytaj(`${DIR}/b2-odpowiedz.json`) as {
  selection_hint: { element_id: string; element_type: string; zoom_to: boolean } | null;
  changes: { created_element_ids: string[] } | null;
  segment_srodkowy?: string;
};

const VIEWPORT = { width: 1600, height: 1000 };

function sceny(enm: EnergyNetworkModel): Readonly<Record<SceneLod, SceneV3>> {
  return { 0: buildSceneV3(enm, 0), 1: buildSceneV3(enm, 1), 2: buildSceneV3(enm, 2) };
}
function bboxy(s: Readonly<Record<SceneLod, SceneV3>>): Readonly<Record<SceneLod, BoundingBox>> {
  return {
    0: boundingBoxOfRect(s[0].bbox),
    1: boundingBoxOfRect(s[1].bbox),
    2: boundingBoxOfRect(s[2].bbox),
  };
}
function celFitu(s: Readonly<Record<SceneLod, SceneV3>>, lod: SceneLod): BoundingBox {
  return sceneBoxToCameraWorld(contentBoundingBoxOf(s[lod]) ?? boundingBoxOfRect(s[lod].bbox));
}
function prostokatWSwiecieKamery(scene: SceneV3, ref: string): BoundingBox | null {
  const box = prostokatElementuWScenie(scene, ref);
  return box ? sceneBoxToCameraWorld(box) : null;
}
function kadr(state: CameraState): { x: number; y: number; width: number; height: number } {
  const [x, y, width, height] = cameraViewBox(state.transform, VIEWPORT).split(' ').map(Number);
  return { x, y, width, height };
}
function widocznosc(
  k: { x: number; y: number; width: number; height: number },
  r: BoundingBox,
): { ulamek: number; caly: boolean } {
  const przecX = Math.max(0, Math.min(k.x + k.width, r.maxX) - Math.max(k.x, r.minX));
  const przecY = Math.max(0, Math.min(k.y + k.height, r.maxY) - Math.max(k.y, r.minY));
  const pole = Math.max(1e-9, (r.maxX - r.minX) * (r.maxY - r.minY));
  return {
    ulamek: (przecX * przecY) / pole,
    caly: r.minX >= k.x && r.maxX <= k.x + k.width && r.minY >= k.y && r.maxY <= k.y + k.height,
  };
}

/** Praca projektanta: przybliżenie do zadanego poziomu szczegółu i wycentrowanie
 *  na miejscu edycji — REALNYMI akcjami kamery ('zoom' + 'center'). */
function stanRoboczy(
  fit: BoundingBox,
  bbox: Readonly<Record<SceneLod, BoundingBox>>,
  celLod: SceneLod,
  punkt: { x: number; y: number },
): CameraState {
  let stan = computeInitialCameraState(fit, VIEWPORT, bbox, null, SLD_CANVAS_DOCK_INSETS);
  for (let i = 0; i < 60 && stan.lod < celLod; i += 1) {
    const wspolczynnik = zoomFactorToEnterNextLod(
      refScaleFor(stan.transform.scale, stan.lod, stan.lodBboxes),
      stan.lod,
    );
    if (wspolczynnik <= 1) break;
    stan = cameraReducer(stan, {
      type: 'zoom',
      cursor: { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 },
      factor: wspolczynnik,
    });
  }
  return cameraReducer(stan, { type: 'center', worldPoint: punkt });
}

const sPrzed = sceny(przed);
const sPo = sceny(po);
const bPrzed = bboxy(sPrzed);
const bPo = bboxy(sPo);
const wskazanie = wskazanieOperacji(odpowiedz.selection_hint, odpowiedz.changes);
const kotwica = wskazanie ? kotwicaWidoku(sPo, wskazanie.kandydaci, sceneBoxToCameraWorld) : null;
const segmentDzielony = String(odpowiedz.segment_srodkowy ?? '');

const wynik: Record<string, unknown> = {
  siec: {
    stacje_przed: (przed.substations ?? []).length,
    stacje_po: (po.substations ?? []).length,
    kandydaci_wskazania: wskazanie?.kandydaci.length ?? 0,
    ref_kotwicy: kotwica?.ref ?? null,
  },
};

const porownanie: Record<string, unknown> = {};
for (const lodRoboczy of [1, 2] as const) {
  const boxOdcinka = prostokatWSwiecieKamery(sPrzed[lodRoboczy], segmentDzielony);
  if (!boxOdcinka) {
    porownanie[`praca_na_L${lodRoboczy}`] = { blad: `nie znaleziono odcinka ${segmentDzielony}` };
    continue;
  }
  const srodekOdcinka = {
    x: (boxOdcinka.minX + boxOdcinka.maxX) / 2,
    y: (boxOdcinka.minY + boxOdcinka.maxY) / 2,
  };
  const stanRob = stanRoboczy(celFitu(sPrzed, lodRoboczy), bPrzed, lodRoboczy, srodekOdcinka);

  const stanRefit = cameraReducer(stanRob, {
    type: 'refit',
    bbox: celFitu(sPo, lodRoboczy),
    lodBboxes: bPo,
    viewportSize: VIEWPORT,
    focusPoint: null,
    safeInsets: SLD_CANVAS_DOCK_INSETS,
  });
  const stanKotwica = kotwica
    ? cameraReducer(stanRob, {
      type: 'kotwicz',
      anchorByLod: kotwica.boxByLod,
      lodBboxes: bPo,
      viewportSize: VIEWPORT,
      safeInsets: SLD_CANVAS_DOCK_INSETS,
    })
    : null;

  const opisz = (stan: CameraState): Record<string, unknown> => {
    const k = kadr(stan);
    const boxWstawionego = kotwica ? kotwica.boxByLod[stan.lod] : null;
    const w = boxWstawionego ? widocznosc(k, boxWstawionego) : null;
    const ekranRob = {
      x: srodekOdcinka.x * stanRob.transform.scale + stanRob.transform.translateX,
      y: srodekOdcinka.y * stanRob.transform.scale + stanRob.transform.translateY,
    };
    const ekranPo = {
      x: srodekOdcinka.x * stan.transform.scale + stan.transform.translateX,
      y: srodekOdcinka.y * stan.transform.scale + stan.transform.translateY,
    };
    // Jak daleko od ŚRODKA kadru wypadł wstawiony obiekt (0 = kamera celuje
    // w miejsce edycji).
    const srodekWstawionego = boxWstawionego
      ? {
        x: (boxWstawionego.minX + boxWstawionego.maxX) / 2,
        y: (boxWstawionego.minY + boxWstawionego.maxY) / 2,
      }
      : null;
    const odsuniecie = srodekWstawionego
      ? {
        x: Math.round(srodekWstawionego.x * stan.transform.scale + stan.transform.translateX - VIEWPORT.width / 2),
        y: Math.round(srodekWstawionego.y * stan.transform.scale + stan.transform.translateY - VIEWPORT.height / 2),
      }
      : null;
    return {
      skala: Number(stan.transform.scale.toFixed(5)),
      poziom_szczegolu: stan.lod,
      krotnosc_oddalenia: Number((stanRob.transform.scale / stan.transform.scale).toFixed(2)),
      kadr_j_sw: { w: Math.round(k.width), h: Math.round(k.height) },
      odsuniecie_wstawionego_od_srodka_kadru_px: odsuniecie,
      przesuniecie_miejsca_edycji_px: {
        x: Math.round(ekranPo.x - ekranRob.x),
        y: Math.round(ekranPo.y - ekranRob.y),
      },
      wstawiony_widoczny_ulamek: w ? Number(w.ulamek.toFixed(4)) : null,
      wstawiony_caly_w_kadrze: w?.caly ?? null,
      wstawiony_rozmiar_px: boxWstawionego
        ? {
          w: Number(((boxWstawionego.maxX - boxWstawionego.minX) * stan.transform.scale).toFixed(1)),
          h: Number(((boxWstawionego.maxY - boxWstawionego.minY) * stan.transform.scale).toFixed(1)),
        }
        : null,
    };
  };

  porownanie[`praca_na_L${lodRoboczy}`] = {
    stan_roboczy: {
      skala: Number(stanRob.transform.scale.toFixed(5)),
      poziom_szczegolu: stanRob.lod,
      kadr_j_sw: { w: Math.round(kadr(stanRob).width), h: Math.round(kadr(stanRob).height) },
    },
    przed_refit: opisz(stanRefit),
    po_kotwiczenie: stanKotwica ? opisz(stanKotwica) : null,
  };
}
wynik.porownanie = porownanie;

console.log(JSON.stringify(wynik, null, 2));
