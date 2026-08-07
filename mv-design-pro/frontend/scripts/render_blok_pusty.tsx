/**
 * BLOK-PUSTY — DOWÓD WIZUALNY (zgłoszenie właściciela 2026-08-07 pkt 6:
 * „wnętrze ramy stacji w większości puste").
 *
 * ŹRÓDŁO ZRZUTU — nazwane wprost, żeby nie było wątpliwości, czego dowodzi:
 * produkcyjna kanwa `SldCanvasV3` renderowana statycznie (`renderToStaticMarkup`)
 * na FIXTURZE REFERENCYJNEJ `sldSubstrate52s.enm.json` (53 stacje), NIE na
 * migawce z żywego backendu. Zrzut dowodzi więc GEOMETRII rysunku (rama bloku,
 * położenie napisów, udział pustego tuszu) i NIE dowodzi niczego o ścieżce
 * danych z backendu, o interakcji (zaznaczenie, menu) ani o rasteryzacji w
 * prawdziwej przeglądarce przy realnym DPI.
 *
 * KADR JEST PODANY KANWIE, NIE NAŁOŻONY NA JEJ WYNIK. Kamera idzie do
 * `SldCanvasV3` przez `cameraOverride` jako gotowy `CameraState` — ta sama
 * transformacja co do bitu w kadrze PRZED i PO (liczona raz, niżej, z pozycji
 * szyny SN wybranej stacji). Wcześniejsza sonda audytu przycinała gotowy obraz
 * po fakcie i zafałszowała zgłoszenie o ~7,4× — tu tej drogi nie ma.
 *
 * OBWÓDKA RAMY jest ADNOTACJĄ POMIAROWĄ (nie elementem rysunku): prostokąt
 * zwracany przez PRODUKCYJNĄ `canvas/viewAnchor.ts` `prostokatElementuWScenie`
 * dla refu bloku, przeliczony do pikseli TĄ SAMĄ transformacją, którą dostała
 * kanwa. Bez niej „rama" byłaby pojęciem z opisu, a nie rzeczą na obrazku.
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   FAZA=po CANON_OUT=<dir> npx vite-node scripts/render_blok_pusty.tsx
 *   CANON_OUT=<dir> node scripts/rasterize.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';

import type { EnergyNetworkModel } from '../src/types/enm';
import { buildSceneV3, type SceneLod, type SceneV3 } from '../src/ui/sld/v3/scene/buildScene';
import { SldCanvasV3, sceneBoxToCameraWorld } from '../src/ui/sld/v3/canvas/SldCanvasV3';
import { prostokatElementuWScenie } from '../src/ui/sld/v3/canvas/viewAnchor';
import type { CameraState } from '../src/ui/sld/v3/canvas/camera';
import { SYMBOL_DEFS } from '../src/ui/sld/v3/symbols/defs';
import { SEGMENT_STROKE_WIDTH, type PreviewSegmentKind } from '../src/ui/sld/v3/compose/preview';
import { measureLabelWidth } from '../src/ui/sld/v3/core/text';
import { useThemeModeStore } from '../src/ui2/theme/themeMode';
import { sldPaletteForTheme } from '../src/ui/sld/v3/theme/palette';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.CANON_OUT ?? '/tmp/canon';
const FAZA = process.env.FAZA ?? 'po';
/** Stacja pokazowa — wybrana PO NAZWIE, nie po pozycji, żeby kadr PRZED i PO
 *  pokazywał ten sam obiekt niezależnie od kolejności w scenie. */
const STACJA = process.env.STACJA ?? 'Stacja L9-2';
mkdirSync(OUT, { recursive: true });

const enm = (
  JSON.parse(
    readFileSync(resolve(HERE, '../src/ui/sld/v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json'), 'utf8'),
  ) as { readonly enm: EnergyNetworkModel }
).enm;

const KADR = { width: 1500, height: 820 } as const;
const STOPKA = 92;
const LOD: SceneLod = 2;
/** Skala kadru — STAŁA w obu fazach (kadr ma być ten sam, nie „dopasowany”). */
const SKALA = 1.4;

const MOTYWY = [
  { klucz: 'ciemny', mode: 'dark_scada' as const },
  { klucz: 'jasny', mode: 'light_technical' as const },
];

interface Prostokat { x: number; y: number; width: number; height: number }

/** Tusz sceny — identycznie jak w `scripts/pomiar_bloku.tsx` (jedna metoda dla
 *  pomiaru i dla stopki zrzutu, żeby obraz i liczba nie mogły się rozjechać). */
function tuszSceny(scene: SceneV3): readonly Prostokat[] {
  const out: Prostokat[] = [];
  for (const s of scene.symbols) {
    const def = SYMBOL_DEFS[s.symbolId];
    out.push({ x: s.x, y: s.y, width: def.width, height: def.height });
  }
  for (const g of scene.segments) {
    const kind = g.meta?.kind as PreviewSegmentKind | undefined;
    const w = kind && kind in SEGMENT_STROKE_WIDTH ? SEGMENT_STROKE_WIDTH[kind] : 0.8;
    for (let i = 1; i < g.points.length; i += 1) {
      const a = g.points[i - 1];
      const b = g.points[i];
      out.push({
        x: Math.min(a.x, b.x) - w / 2,
        y: Math.min(a.y, b.y) - w / 2,
        width: Math.abs(b.x - a.x) + w,
        height: Math.abs(b.y - a.y) + w,
      });
    }
  }
  for (const l of scene.labels) {
    const szer = Math.min(l.rect.width, measureLabelWidth(l.text, l.labelClass));
    out.push({ x: l.rect.x, y: l.rect.y, width: szer, height: l.rect.height });
  }
  return out;
}

/** Udział pustego tuszu w prostokącie — raster 2 j.św., jak w pomiarze. */
function udzialPustki(rama: Prostokat, tusz: readonly Prostokat[]): number {
  const K = 2;
  const kol = Math.max(1, Math.ceil(rama.width / K));
  const wier = Math.max(1, Math.ceil(rama.height / K));
  const zajete = new Uint8Array(kol * wier);
  for (const r of tusz) {
    if (r.x + r.width < rama.x || r.x > rama.x + rama.width) continue;
    if (r.y + r.height < rama.y || r.y > rama.y + rama.height) continue;
    const i0 = Math.max(0, Math.floor((r.x - rama.x) / K));
    const i1 = Math.min(kol - 1, Math.ceil((r.x + r.width - rama.x) / K) - 1);
    const j0 = Math.max(0, Math.floor((r.y - rama.y) / K));
    const j1 = Math.min(wier - 1, Math.ceil((r.y + r.height - rama.y) / K) - 1);
    for (let j = j0; j <= j1; j += 1) for (let i = i0; i <= i1; i += 1) zajete[j * kol + i] = 1;
  }
  let n = 0;
  for (let k = 0; k < zajete.length; k += 1) n += zajete[k];
  return 1 - n / (kol * wier);
}

const scene = buildSceneV3(enm, LOD);
const sceny: Readonly<Record<SceneLod, SceneV3>> = {
  0: buildSceneV3(enm, 0),
  1: buildSceneV3(enm, 1),
  2: scene,
};

const wierszNazwy = scene.labels.find((l) => l.ownerKind === 'station-name' && l.text === STACJA);
if (!wierszNazwy) throw new Error(`brak stacji „${STACJA}" w scenie`);
const refBloku = `${wierszNazwy.ownerRef.split('#')[0]}`;
const ramaSceny = prostokatElementuWScenie(scene, refBloku);
if (!ramaSceny) throw new Error(`blok ${refBloku} nie jest narysowany`);

// Punkt kotwiczenia kadru: ŚRODEK szyny SN bloku — element obecny w obu fazach
// i nieruszony przez tę kartę (rezerwacja etykiet nie wpływa na oś szyny).
const szyna = scene.segments.find((s) => String(s.meta?.ownerRef ?? '') === `${refBloku}#sn-bus`);
if (!szyna) throw new Error(`blok ${refBloku} bez szyny SN`);
const srodekSceny = {
  x: (Math.min(...szyna.points.map((p) => p.x)) + Math.max(...szyna.points.map((p) => p.x))) / 2,
  y: szyna.points[0].y,
};
const srodek = {
  x: srodekSceny.x + (sceneBoxToCameraWorld({ minX: 0, minY: 0, maxX: 0, maxY: 0 }).minX),
  y: srodekSceny.y + (sceneBoxToCameraWorld({ minX: 0, minY: 0, maxX: 0, maxY: 0 }).minY),
};

const transform = {
  scale: SKALA,
  translateX: KADR.width / 2 - srodek.x * SKALA,
  // Szyna SN stoi w 1/4 wysokości kadru, nie w połowie: blok zwisa POD nią,
  // więc kadr wyśrodkowany na szynie zostawiałby górną połowę pustą (co byłoby
  // pustką KADRU, nie pustką ramy — dokładnie ten błąd zafałszował sondę).
  translateY: KADR.height * 0.3 - srodek.y * SKALA,
};
const bboxKamery = (s: SceneV3) =>
  sceneBoxToCameraWorld({ minX: s.bbox.x, minY: s.bbox.y, maxX: s.bbox.x + s.bbox.width, maxY: s.bbox.y + s.bbox.height });
const kamera: CameraState = {
  transform,
  lod: LOD,
  viewportSize: KADR,
  lodBboxes: { 0: bboxKamery(sceny[0]), 1: bboxKamery(sceny[1]), 2: bboxKamery(sceny[2]) },
};

const pustka = udzialPustki(
  { x: ramaSceny.minX, y: ramaSceny.minY, width: ramaSceny.maxX - ramaSceny.minX, height: ramaSceny.maxY - ramaSceny.minY },
  tuszSceny(scene),
);

/** Świat kamery → piksel kadru (ta sama transformacja, którą dostała kanwa). */
const doPiksela = (x: number, y: number) => ({
  x: x * transform.scale + transform.translateX,
  y: y * transform.scale + transform.translateY,
});
const ramaSwiat = sceneBoxToCameraWorld(ramaSceny);
const p0 = doPiksela(ramaSwiat.minX, ramaSwiat.minY);
const p1 = doPiksela(ramaSwiat.maxX, ramaSwiat.maxY);

const stopka =
  `${FAZA === 'przed' ? 'PRZED' : 'PO'} · fixtura referencyjna sldSubstrate52s (53 stacje) · poziom szczegółu L2 · ` +
  `skala ${SKALA.toFixed(3)} px/j.św. (kadr podany kanwie przez cameraOverride) · blok „${STACJA}"`;
const stopka2 =
  `rama bloku ${Math.round(ramaSceny.maxX - ramaSceny.minX)}×${Math.round(ramaSceny.maxY - ramaSceny.minY)} j.św. · ` +
  `UDZIAŁ PUSTEGO TUSZU ${(pustka * 100).toFixed(1)}% (raster 2 j.św., ta sama metoda co scripts/pomiar_bloku.tsx) · ` +
  `obwódka = prostokąt z produkcyjnej viewAnchor.prostokatElementuWScenie, adnotacja pomiarowa`;
// Kadr jest zakotwiczony na szynie SN TEGO bloku, nie na stałym punkcie
// arkusza: naprawa skraca bloki NAD nim, więc ten sam blok leży w świecie
// niżej/wyżej niż przed kartą. Kotwiczenie na bloku daje porównanie TEGO
// SAMEGO obiektu w tym samym miejscu ekranu; różnica translacji jest wypisana,
// żeby nikt nie wziął jej za dryf rysunku.
const stopka3 =
  `kotwica kadru: szyna SN bloku w świecie (${srodek.x.toFixed(0)}, ${srodek.y.toFixed(0)}) → 30% wysokości kadru; ` +
  `obie fazy tą samą skalą i tym samym punktem zaczepu`;

console.log(`${FAZA}: rama ${Math.round(ramaSceny.maxX - ramaSceny.minX)}x${Math.round(ramaSceny.maxY - ramaSceny.minY)} pustka ${(pustka * 100).toFixed(1)}% srodek=${srodek.x},${srodek.y}`);

for (const motyw of MOTYWY) {
  useThemeModeStore.setState({ mode: motyw.mode });
  const paleta = sldPaletteForTheme(motyw.mode);
  const inner = renderToStaticMarkup(
    <SldCanvasV3
      snapshot={enm}
      width={KADR.width}
      height={KADR.height}
      lodOverride={LOD}
      paletteMode={motyw.mode}
      cameraOverride={kamera}
    />,
  );
  const withNs = inner.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
  const H = KADR.height + STOPKA;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${KADR.width}" height="${H}" viewBox="0 0 ${KADR.width} ${H}">` +
    `<rect x="0" y="0" width="${KADR.width}" height="${H}" fill="${paleta.canvasBackground}"/>` +
    `${withNs}` +
    `<rect x="${p0.x.toFixed(1)}" y="${p0.y.toFixed(1)}" width="${(p1.x - p0.x).toFixed(1)}" height="${(p1.y - p0.y).toFixed(1)}" ` +
    `fill="none" stroke="#3fa9f5" stroke-width="2" stroke-dasharray="8 6"/>` +
    `<text x="16" y="${KADR.height + 28}" font-family="system-ui,sans-serif" font-size="15" fill="${paleta.baseStroke}">${stopka}</text>` +
    `<text x="16" y="${KADR.height + 50}" font-family="system-ui,sans-serif" font-size="14" fill="${paleta.baseStroke}">${stopka2}</text>` +
    `<text x="16" y="${KADR.height + 70}" font-family="system-ui,sans-serif" font-size="14" fill="${paleta.baseStroke}">${stopka3}</text>` +
    `</svg>`;
  const nazwa = `blok-${FAZA}-${motyw.klucz}.svg`;
  writeFileSync(resolve(OUT, nazwa), svg, 'utf8');
  console.log('svg', nazwa);
}
