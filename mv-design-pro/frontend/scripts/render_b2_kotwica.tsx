/**
 * B-2 (KOTWICZENIE KAMERY NA ZMIANIE, karta B-2; audyt
 * `docs/sld/AUDYT_JAKOSCI_SLD_2026-08.md` §4.2/§4.3) — DOWÓD WIZUALNY tego,
 * co widzi projektant po wstawieniu stacji na odcinku magistrali.
 *
 * Cztery kadry (× dwa motywy), wszystkie z TEJ SAMEJ produkcyjnej kanwy v3 i
 * TEJ SAMEJ pary migawek z żywego backendu:
 *   b2-praca-*   — stan roboczy PRZED operacją (projektant przybliżony na
 *                  odcinku, na którym zaraz wstawi stację),
 *   b2-przed-*   — kadr PO operacji przy zachowaniu sprzed karty
 *                  (bezwarunkowy `'refit'` — widok całej sieci),
 *   b2-po-*      — kadr PO operacji przy kotwiczeniu (`'kotwicz'`).
 * Stopka każdego zrzutu niesie liczby (skala, poziom szczegółu, rozmiar
 * wstawionej stacji na ekranie), więc obraz i pomiar nie mogą się rozjechać.
 *
 * Wejście: para migawek z `scripts/b2_zbuduj_pare.mjs` (katalog `B2_DIR`).
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   B2_DIR=<katalog> CANON_OUT=<dir> npx vite-node scripts/render_b2_kotwica.tsx
 *   CANON_OUT=<dir> node scripts/rasterize.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

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
import { SldCanvasV3, contentBoundingBoxOf, sceneBoxToCameraWorld } from '../src/ui/sld/v3/canvas/SldCanvasV3';
import { SLD_CANVAS_DOCK_INSETS } from '../src/ui/sld/v3/canvas/toolbarLayout';
import { kotwicaWidoku, prostokatElementuWScenie } from '../src/ui/sld/v3/canvas/viewAnchor';
import { wskazanieOperacji } from '../src/ui/topology/wskazanieOperacji';
import { sldPaletteForTheme } from '../src/ui/sld/v3/theme/palette';
import { useThemeModeStore } from '../src/ui2/theme/themeMode';

const DIR = process.env.B2_DIR ?? '/tmp/b2';
const OUT = process.env.CANON_OUT ?? '/tmp/canon';
mkdirSync(OUT, { recursive: true });

const wczytaj = (p: string): unknown => JSON.parse(readFileSync(p, 'utf8'));
const przed = (wczytaj(`${DIR}/b2-przed.enm.json`) as { enm: EnergyNetworkModel }).enm;
const po = (wczytaj(`${DIR}/b2-po.enm.json`) as { enm: EnergyNetworkModel }).enm;
const odpowiedz = wczytaj(`${DIR}/b2-odpowiedz.json`) as {
  selection_hint: { element_id: string; element_type: string; zoom_to: boolean } | null;
  changes: { created_element_ids: string[] } | null;
  segment_srodkowy?: string;
};

/** Kadr zrzutu = realny viewport pracy projektanta. */
const KADR = { width: 1400, height: 900 } as const;
const STOPKA = 76;
const LOD_ROBOCZY: SceneLod = 2;

const MOTYWY = [
  { klucz: 'ciemny', mode: 'dark_scada' as const },
  { klucz: 'jasny', mode: 'light_technical' as const },
];

function sceny(enm: EnergyNetworkModel): Readonly<Record<SceneLod, SceneV3>> {
  return { 0: buildSceneV3(enm, 0), 1: buildSceneV3(enm, 1), 2: buildSceneV3(enm, 2) };
}
function bboxy(s: Readonly<Record<SceneLod, SceneV3>>): Readonly<Record<SceneLod, BoundingBox>> {
  return { 0: boundingBoxOfRect(s[0].bbox), 1: boundingBoxOfRect(s[1].bbox), 2: boundingBoxOfRect(s[2].bbox) };
}
function celFitu(s: Readonly<Record<SceneLod, SceneV3>>, lod: SceneLod): BoundingBox {
  return sceneBoxToCameraWorld(contentBoundingBoxOf(s[lod]) ?? boundingBoxOfRect(s[lod].bbox));
}

const sPrzed = sceny(przed);
const sPo = sceny(po);
const bPrzed = bboxy(sPrzed);
const bPo = bboxy(sPo);
const wskazanie = wskazanieOperacji(odpowiedz.selection_hint, odpowiedz.changes);
const kotwica = wskazanie ? kotwicaWidoku(sPo, wskazanie.kandydaci, sceneBoxToCameraWorld) : null;
if (!kotwica) throw new Error('Brak kotwicy — operacja nie wskazała obiektu narysowanego na wszystkich poziomach');

const boxOdcinka = prostokatElementuWScenie(sPrzed[LOD_ROBOCZY], String(odpowiedz.segment_srodkowy ?? ''));
if (!boxOdcinka) throw new Error('Nie znaleziono dzielonego odcinka na rysunku');
const srodekOdcinka = sceneBoxToCameraWorld(boxOdcinka);
const punktPracy = {
  x: (srodekOdcinka.minX + srodekOdcinka.maxX) / 2,
  y: (srodekOdcinka.minY + srodekOdcinka.maxY) / 2,
};

/** Praca projektanta: przybliżenie realnymi akcjami kamery + wycentrowanie na
 *  miejscu, w którym zaraz stanie nowa stacja. */
let stanRoboczy = computeInitialCameraState(celFitu(sPrzed, LOD_ROBOCZY), KADR, bPrzed, null, SLD_CANVAS_DOCK_INSETS);
for (let i = 0; i < 60 && stanRoboczy.lod < LOD_ROBOCZY; i += 1) {
  const wspolczynnik = zoomFactorToEnterNextLod(
    refScaleFor(stanRoboczy.transform.scale, stanRoboczy.lod, stanRoboczy.lodBboxes),
    stanRoboczy.lod,
  );
  if (wspolczynnik <= 1) break;
  stanRoboczy = cameraReducer(stanRoboczy, {
    type: 'zoom', cursor: { x: KADR.width / 2, y: KADR.height / 2 }, factor: wspolczynnik,
  });
}
stanRoboczy = cameraReducer(stanRoboczy, { type: 'center', worldPoint: punktPracy });

const stanRefit = cameraReducer(stanRoboczy, {
  type: 'refit', bbox: celFitu(sPo, LOD_ROBOCZY), lodBboxes: bPo,
  viewportSize: KADR, focusPoint: null, safeInsets: SLD_CANVAS_DOCK_INSETS,
});
const stanKotwica = cameraReducer(stanRoboczy, {
  type: 'kotwicz', anchorByLod: kotwica.boxByLod, lodBboxes: bPo,
  viewportSize: KADR, safeInsets: SLD_CANVAS_DOCK_INSETS,
});

interface Kadr {
  readonly nazwa: string;
  readonly enm: EnergyNetworkModel;
  readonly stan: CameraState;
  readonly opis: string;
}
const KADRY: readonly Kadr[] = [
  { nazwa: 'b2-praca', enm: przed, stan: stanRoboczy, opis: 'PRZED operacją — projektant przy miejscu edycji' },
  { nazwa: 'b2-przed', enm: po, stan: stanRefit, opis: 'PO operacji, zachowanie sprzed karty (pełne dopasowanie widoku)' },
  { nazwa: 'b2-po', enm: po, stan: stanKotwica, opis: 'PO operacji, kotwiczenie na wstawionej stacji' },
];

const escXml = (t: string): string => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

for (const kadr of KADRY) {
  for (const motyw of MOTYWY) {
    useThemeModeStore.setState({ mode: motyw.mode });
    const paleta = sldPaletteForTheme(motyw.mode);
    const inner = renderToStaticMarkup(
      <SldCanvasV3
        snapshot={kadr.enm}
        width={KADR.width}
        height={KADR.height}
        lodOverride={kadr.stan.lod}
        paletteMode={motyw.mode}
        animateLodTransitions={false}
      />,
    );
    const dom = new JSDOM(`<body>${inner}</body>`);
    const svgEl = dom.window.document.querySelector('[data-testid="sld-canvas-v3"]')!;
    // Kadr WPROST z transformu kamery zbudowanego wyżej (ta sama funkcja, którą
    // kanwa rysuje siebie) — zrzut pokazuje dokładnie to, co zobaczyłby
    // projektant, nie osobne kadrowanie „na ładnie".
    svgEl.setAttribute('viewBox', cameraViewBox(kadr.stan.transform, KADR));
    svgEl.setAttribute('width', String(KADR.width));
    svgEl.setAttribute('height', String(KADR.height));

    const skala = kadr.stan.transform.scale;
    const boxKotwicy = kotwica.boxByLod[kadr.stan.lod];
    const rozmiarPx = {
      w: (boxKotwicy.maxX - boxKotwicy.minX) * skala,
      h: (boxKotwicy.maxY - boxKotwicy.minY) * skala,
    };
    // Obwódka wstawionej stacji — żeby czytający zrzut wiedział, GDZIE ona jest
    // (na kadrze „przed" bywa plamką kilkudziesięciu pikseli).
    const naklad = kadr.nazwa === 'b2-praca'
      ? ''
      : `<rect x="${boxKotwicy.minX}" y="${boxKotwicy.minY}" `
        + `width="${boxKotwicy.maxX - boxKotwicy.minX}" height="${boxKotwicy.maxY - boxKotwicy.minY}" `
        + `fill="none" stroke="${paleta.highlight.selection}" stroke-width="${2 / skala}" stroke-dasharray="${8 / skala} ${5 / skala}"/>`;
    const canvasSvg = svgEl.outerHTML.replace(/<\/svg>$/, `${naklad}</svg>`)
      .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');

    const wiersz1 = `${kadr.opis} · sieć ${(przed.substations ?? []).length} → ${(po.substations ?? []).length} stacji`;
    const wiersz2 =
      `skala ${skala.toFixed(3)} px/j.św. · poziom szczegółu L${kadr.stan.lod} · `
      + `wstawiona stacja na ekranie ${rozmiarPx.w.toFixed(0)} × ${rozmiarPx.h.toFixed(0)} px`;

    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${KADR.width}" height="${KADR.height + STOPKA}" `
      + `viewBox="0 0 ${KADR.width} ${KADR.height + STOPKA}">`
      + `<rect x="0" y="0" width="${KADR.width}" height="${KADR.height + STOPKA}" fill="${paleta.canvasBackground}"/>`
      + canvasSvg
      + `<text x="16" y="${KADR.height + 28}" font-family="system-ui,sans-serif" font-size="15" fill="${paleta.baseStroke}">${escXml(wiersz1)}</text>`
      + `<text x="16" y="${KADR.height + 54}" font-family="system-ui,sans-serif" font-size="15" fill="${paleta.highlight.selection}">${escXml(wiersz2)}</text>`
      + `</svg>`;
    const nazwa = `${kadr.nazwa}-${motyw.klucz}.svg`;
    writeFileSync(resolve(OUT, nazwa), svg, 'utf8');
    console.log('svg', nazwa, `skala=${skala.toFixed(3)}`, `L${kadr.stan.lod}`, `stacja=${rozmiarPx.w.toFixed(0)}x${rozmiarPx.h.toFixed(0)}px`);
  }
}
