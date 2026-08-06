/**
 * S9-4 (TRAFIENIE I TOŻSAMOŚĆ ZAZNACZENIA, karta S9-4; audyt
 * `docs/sld/AUDYT_JAKOSCI_SLD_2026-08.md` §3.2, znaleziska P-1/P-2/P-3) —
 * DOWÓD WIZUALNY: dla każdego RODZAJU obiektu kanwy pokazuje, gdzie padł klik,
 * jak duży jest obszar trafienia tego obiektu i CO zostało wskazane.
 *
 * Co widać na zrzucie:
 *  - rysunek produkcyjnej kanwy v3 (ten sam komponent, co w aplikacji),
 *  - OBSZAR TRAFIENIA wskazanego obiektu (kreska przerywana) — czyli cel, w
 *    który wystarczy trafić, żeby zaznaczyć TEN obiekt,
 *  - krzyż w punkcie kliku,
 *  - stopka: rodzaj obiektu · rozmiar celu w px EKRANU · `ownerRef` wskazany
 *    inspektorowi (tożsamość zaznaczenia).
 *
 * Rozstrzygnięcie „co zostało wskazane" liczy `pickCanvasHitArea` na uchwytach
 * ODCZYTANYCH Z DRZEWA renderu (`hitAreasFromDom`) — ta sama droga, którą idzie
 * sonda odbioru w `scripts/sld_v3_acceptance.mjs`, nie osobna symulacja.
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   CANON_OUT=<dir> npx vite-node scripts/render_s9_4_trafienie.tsx
 *   CANON_OUT=<dir> node scripts/rasterize.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import type { EnergyNetworkModel } from '../src/types/enm';
import { buildSceneV3, sceneObstacleRects, type SceneLod } from '../src/ui/sld/v3/scene/buildScene';
import { planSceneLabels } from '../src/ui/sld/v3/canvas/labelLegibility';
import { SldCanvasV3, layoutResultLabels, scenePointToCameraWorld } from '../src/ui/sld/v3/canvas/SldCanvasV3';
import { buildResultLabelsFromScene } from '../src/ui/sld/v3/canvas/resultLabels';
import { orientedSegmentRefs } from '../src/ui/sld/v3/canvas/overlay';
import {
  MIN_HIT_SCREEN_PX,
  buildCanvasHitAreas,
  hitAreasFromDom,
  hitAreaScreenSize,
  hitShapeBbox,
  pickCanvasHitArea,
  pointInHitShape,
  type CanvasHitArea,
  type HitDomNode,
  type HitObjectClass,
} from '../src/ui/sld/v3/canvas/hitAreas';
import { useThemeModeStore } from '../src/ui2/theme/themeMode';
import { sldPaletteForTheme } from '../src/ui/sld/v3/theme/palette';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.CANON_OUT ?? '/tmp/canon';
mkdirSync(OUT, { recursive: true });

const enm = (
  JSON.parse(
    readFileSync(resolve(HERE, '../src/ui/sld/v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json'), 'utf8'),
  ) as { readonly enm: EnergyNetworkModel }
).enm;

/** Widok kamery dobrany tak, żeby skala wypadła ≈1 px ekranu na jednostkę
 *  świata — czyli warunki pracy na poziomie pełnego szczegółu. Kadr zrzutu jest
 *  WYCINKIEM tego widoku (podmiana `viewBox`), więc rozmiary obszarów trafienia
 *  na obrazku są DOKŁADNIE tymi, które policzyła kanwa. */
const KAMERA = { width: 10640, height: 5600 };
const KADR = { width: 1400, height: 900 };
const STOPKA = 76;

const MOTYWY = [
  { klucz: 'ciemny', mode: 'dark_scada' as const },
  { klucz: 'jasny', mode: 'light_technical' as const },
];

/** Rodzaje obiektów pokazywane na zrzutach + poziom, na którym występują. */
const PRZYPADKI: readonly { readonly klasa: HitObjectClass; readonly lod: SceneLod }[] = [
  { klasa: 'stacja', lod: 0 },
  { klasa: 'lacznik-wiersza', lod: 0 },
  { klasa: 'aparat', lod: 2 },
  { klasa: 'transformator', lod: 2 },
  { klasa: 'szyna', lod: 2 },
  { klasa: 'tor', lod: 2 },
  { klasa: 'etykieta', lod: 2 },
  { klasa: 'znacznik-wyniku', lod: 2 },
];

/**
 * Punkt kliku „nad obiektem" w rozumieniu sondy odbioru: leży na OBRYSIE tego
 * obiektu i obiekt jest tam malowany NAJWYŻEJ. Bez tego warunku środek szyny
 * wypadał pod symbolem stojącym na niej — klik należałby wtedy (poprawnie) do
 * symbolu, a zrzut sugerowałby chybienie tam, gdzie żadnego nie ma.
 * Wybór deterministyczny: PIERWSZY taki punkt siatki 1 j.św. w kolejności
 * wiersz-po-wierszu; `null` = obiekt cały przykryty (nie ma czego pokazać).
 */
function punktKliku(area: CanvasHitArea, wszystkie: readonly CanvasHitArea[]): { x: number; y: number } | null {
  const bbox = hitShapeBbox(area.obrys);
  const kandydaci: { x: number; y: number }[] = [];
  for (let y = Math.ceil(bbox.y); y <= bbox.y + bbox.height; y += 1) {
    for (let x = Math.ceil(bbox.x); x <= bbox.x + bbox.width; x += 1) {
      if (pointInHitShape(area.obrys, x, y)) kandydaci.push({ x, y });
    }
  }
  // Preferuj ŚRODEK obrysu (czytelniejszy zrzut), ale tylko gdy obiekt jest tam
  // widoczny; w przeciwnym razie pierwszy punkt spełniający warunek.
  const uporzadkowani = kandydaci.length > 0
    ? [kandydaci[Math.floor(kandydaci.length / 2)], ...kandydaci]
    : [];
  for (const punkt of uporzadkowani) {
    let najwyzszy = area;
    for (const inny of wszystkie) {
      if (inny.z > najwyzszy.z && pointInHitShape(inny.obrys, punkt.x, punkt.y)) najwyzszy = inny;
    }
    if (najwyzszy.testId === area.testId) return punkt;
  }
  return null;
}

function ksztaltDoSvg(area: CanvasHitArea, kolor: string): string {
  const przesun = (x: number, y: number) => scenePointToCameraWorld({ x, y });
  if (area.obszar.ksztalt === 'prostokat') {
    const p = przesun(area.obszar.x, area.obszar.y);
    return `<rect x="${p.x}" y="${p.y}" width="${area.obszar.width}" height="${area.obszar.height}" `
      + `fill="none" stroke="${kolor}" stroke-width="2" stroke-dasharray="6 4"/>`;
  }
  const d = area.obszar.points
    .map((v, i) => {
      const p = przesun(v.x, v.y);
      return `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`;
    })
    .join(' ');
  return `<path d="${d}" fill="none" stroke="${kolor}" stroke-width="${2 * area.obszar.halfWidth}" `
    + `stroke-opacity="0.25"/><path d="${d}" fill="none" stroke="${kolor}" stroke-width="1.5" stroke-dasharray="6 4"/>`;
}

const orientedRefs = orientedSegmentRefs(enm);

for (const przypadek of PRZYPADKI) {
  const scene = buildSceneV3(enm, przypadek.lod);
  const rlByRef = buildResultLabelsFromScene(
    scene,
    // Payload odwzorowujący bieg rozpływowy na REALNYCH refach sceny — ta sama
    // konstrukcja co w skrypcie odbioru (warstwa wynikowa musi mieć co rysować,
    // inaczej rodzaj „znacznik wyniku" nie miałby reprezentanta).
    {
      run_id: 's9-4-zrzuty',
      analysis_type: 'LOAD_FLOW',
      elements: Object.fromEntries(
        scene.segments
          .filter((s) => s.meta?.elementKind === 'bus' && (s.meta?.busResultRef ?? s.meta?.ownerRef))
          .map((s) => {
            const ref = s.meta!.busResultRef ?? s.meta!.ownerRef!;
            return [ref, {
              ref_id: ref,
              kind: 'bus',
              badges: [],
              severity: 'INFO',
              metrics: { U_kV: { code: 'U_kV', value: 15.02, unit: 'kV', format_hint: 'fixed2' } },
            }];
          }),
      ),
    } as never,
    new Set(orientedRefs.keys()),
  );
  const overlay = { energizedByTestId: {}, resultLabelsByOwnerRef: rlByRef };

  for (const motyw of MOTYWY) {
    // Tryb podawany WPROST propem: `renderToStaticMarkup` czyta ze store'a
    // Zustand STAN POCZĄTKOWY (kontrakt SSR `useSyncExternalStore`), więc samo
    // `setState` dawało dwa zrzuty tego samego motywu. `setState` zostaje dla
    // spójności ewentualnych konsumentów store'a poza kanwą.
    useThemeModeStore.setState({ mode: motyw.mode });
    const paleta = sldPaletteForTheme(motyw.mode);
    const inner = renderToStaticMarkup(
      <SldCanvasV3
        snapshot={enm}
        width={KAMERA.width}
        height={KAMERA.height}
        lodOverride={przypadek.lod}
        paletteMode={motyw.mode}
        overlay={overlay}
        onElementClick={() => {}}
        onResultLabelActivate={() => {}}
        animateLodTransitions={false}
      />,
    );
    const dom = new JSDOM(`<body>${inner}</body>`);
    const svgEl = dom.window.document.querySelector('[data-testid="sld-canvas-v3"]')!;
    const viewBox = svgEl.getAttribute('viewBox')!.split(' ').map(Number);
    const scale = KAMERA.width / viewBox[2];

    const labelPlan = planSceneLabels(scene.labels, sceneObstacleRects(scene), scale);
    const layoutWynikow = layoutResultLabels(scene, rlByRef, [], przypadek.lod);
    const oczekiwane = buildCanvasHitAreas({
      symbols: scene.symbols,
      segments: scene.segments,
      labels: labelPlan.drawn,
      resultMarkers: layoutWynikow.placements.map((p, i) => ({
        testId: `sld-v3-result-label-${i}`, ownerRef: p.ownerRef, x: p.x, y: p.y, width: p.width, height: p.height,
      })),
      scale,
    });
    const zDrzewa = hitAreasFromDom(svgEl as unknown as HitDomNode);

    // Reprezentant rodzaju: PIERWSZY obiekt tej klasy w kolejności sceny —
    // wybór deterministyczny, bez „ładniejszego" przykładu.
    const cel = oczekiwane.find((a) => a.klasa === przypadek.klasa);
    if (!cel) {
      console.log(`pominięto ${przypadek.klasa} (brak obiektu tej klasy na L${przypadek.lod})`);
      continue;
    }
    const punkt = punktKliku(cel, oczekiwane);
    if (!punkt) {
      console.log(`pominięto ${przypadek.klasa} (obrys w całości przykryty innym rysunkiem)`);
      continue;
    }
    const wskazany = pickCanvasHitArea(zDrzewa, punkt.x, punkt.y);
    const trafione = wskazany?.testId === cel.testId;
    const rozmiarPx = wskazany ? hitAreaScreenSize(wskazany, scale) : 0;

    // Kadr wokół punktu kliku — w świecie KAMERY (scena + margines arkusza).
    const srodek = scenePointToCameraWorld(punkt);
    const kadrW = KADR.width / scale;
    const kadrH = KADR.height / scale;
    svgEl.setAttribute('viewBox', `${srodek.x - kadrW / 2} ${srodek.y - kadrH / 2} ${kadrW} ${kadrH}`);
    svgEl.setAttribute('width', String(KADR.width));
    svgEl.setAttribute('height', String(KADR.height));

    const kolor = paleta.highlight.selection;
    const krzyz = 10 / scale;
    const naklad =
      ksztaltDoSvg(cel, kolor)
      + `<line x1="${srodek.x - krzyz}" y1="${srodek.y}" x2="${srodek.x + krzyz}" y2="${srodek.y}" `
      + `stroke="${paleta.highlight.fault}" stroke-width="${1.5 / scale}"/>`
      + `<line x1="${srodek.x}" y1="${srodek.y - krzyz}" x2="${srodek.x}" y2="${srodek.y + krzyz}" `
      + `stroke="${paleta.highlight.fault}" stroke-width="${1.5 / scale}"/>`;
    const canvasSvg = svgEl.outerHTML.replace(/<\/svg>$/, `${naklad}</svg>`)
      .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');

    const wiersz1 =
      `Rodzaj: ${przypadek.klasa} · poziom L${przypadek.lod} · skala kamery ${scale.toFixed(2)} px/j.św. · `
      + `obszar trafienia ${rozmiarPx.toFixed(1)} px ekranu (minimum ${MIN_HIT_SCREEN_PX} px)`;
    const wiersz2 =
      `Klik w punkt (${punkt.x.toFixed(0)}, ${punkt.y.toFixed(0)}) → wskazano: `
      + `${trafione ? 'TEN obiekt' : `INNY obiekt (${wskazany?.testId ?? 'tło'})`} · `
      + `ownerRef = ${wskazany?.ownerRef ?? '(obiekt rysunkowy bez refu modelu)'}`;

    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${KADR.width}" height="${KADR.height + STOPKA}" `
      + `viewBox="0 0 ${KADR.width} ${KADR.height + STOPKA}">`
      + `<rect x="0" y="0" width="${KADR.width}" height="${KADR.height + STOPKA}" fill="${paleta.canvasBackground}"/>`
      + canvasSvg
      + `<text x="16" y="${KADR.height + 28}" font-family="system-ui,sans-serif" font-size="15" fill="${paleta.baseStroke}">${wiersz1}</text>`
      + `<text x="16" y="${KADR.height + 54}" font-family="system-ui,sans-serif" font-size="15" fill="${kolor}">${wiersz2.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`
      + `</svg>`;
    const nazwa = `s9-4-${przypadek.klasa}-${motyw.klucz}.svg`;
    writeFileSync(resolve(OUT, nazwa), svg, 'utf8');
    console.log('svg', nazwa, trafione ? 'TRAFIONE' : 'CHYBIONE', `${rozmiarPx.toFixed(1)}px`);
  }
}

// Zestawienie obwiedni obszarów trafienia — sanity dla czytającego zrzuty.
console.log('minimum ekranowe [px]:', MIN_HIT_SCREEN_PX, '· kadr:', KADR);
