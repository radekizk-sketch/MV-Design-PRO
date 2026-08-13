/**
 * SLOT-DRYF-PRZĘSŁA — DOWÓD WIZUALNY (dług nazwany przez kartę
 * BLOK-LATERAL-WLASNOSC: „podpis »S14 ↔ S15« stoi 888 j.św. od polilinii
 * odcinka, który opisuje").
 *
 * ŹRÓDŁO ZRZUTU. Produkcyjna kanwa `SldCanvasV3` renderowana statycznie
 * (`renderToStaticMarkup`) na FIXTURZE REFERENCYJNEJ `sldSubstrate52s.enm.json`
 * (53 stacje), poziom szczegółu L2. NIE jest to zrzut z żywego backendu.
 *
 * CZEGO TEN ZRZUT NIE DOWODZI (uczciwie):
 *  · niczego o ścieżce danych z backendu — geometria liczona z fixtury;
 *  · niczego o interakcji (klik, zaznaczenie, menu kontekstowe);
 *  · niczego o rasteryzacji w prawdziwej przeglądarce przy realnym DPI
 *    (rasteryzuje `scripts/rasterize.mjs`, nie silnik przeglądarki);
 *  · niczego o POZOSTAŁYCH 36 podpisach przęseł — pokazuje JEDEN kadr.
 *    Rozkład po wszystkich podpisach mierzy `scripts/pomiar_slotu.tsx`,
 *    a pilnują go wyrocznie `layout/__tests__/slotDryfPrzesla.test.ts`.
 *
 * KADR JEST PODANY KANWIE, NIE NAŁOŻONY NA JEJ WYNIK (ten sam rygor co
 * `render_blok_pusty.tsx`): kamera idzie do `SldCanvasV3` przez
 * `cameraOverride` jako gotowy `CameraState`, liczony raz z pozycji szyny SN
 * stacji kotwiczącej. Zero przycinania obrazu po fakcie.
 *
 * ADNOTACJE POMIAROWE (nie elementy rysunku):
 *  · prostokąt niebieski — `OwnedLabel.rect` podpisu przęsła ze sceny;
 *  · odcinek pomarańczowy pod nim — zakres X polilinii, którą ten podpis
 *    OPISUJE (ref właściciela + kawałki `#tee-N` tego samego kabla ENM);
 *  · pionowa kreska — środek tej polilinii; różnica między nią a środkiem
 *    prostokąta TO JEST mierzony dryf.
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   FAZA=przed CANON_OUT=<dir> npx vite-node scripts/render_slot_dryf.tsx
 *   CANON_OUT=<dir> node scripts/rasterize.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';

import type { EnergyNetworkModel } from '../src/types/enm';
import { buildSceneV3, type SceneLod, type SceneV3 } from '../src/ui/sld/v3/scene/buildScene';
import { SldCanvasV3, sceneBoxToCameraWorld } from '../src/ui/sld/v3/canvas/SldCanvasV3';
import type { CameraState } from '../src/ui/sld/v3/canvas/camera';
import { useThemeModeStore } from '../src/ui2/theme/themeMode';
import { sldPaletteForTheme } from '../src/ui/sld/v3/theme/palette';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.CANON_OUT ?? '/tmp/canon';
const FAZA = process.env.FAZA ?? 'po';
/** Para końców przęsła ze zgłoszenia — wybór PO TREŚCI podpisu, nie po
 *  pozycji, żeby kadr PRZED i PO pokazywał TEN SAM obiekt. */
const PARA = process.env.PARA ?? 'S14 ↔ S15';
const PREFIKS = process.env.PREFIKS ?? 'slot';
mkdirSync(OUT, { recursive: true });

const enm = (
  JSON.parse(
    readFileSync(resolve(HERE, '../src/ui/sld/v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json'), 'utf8'),
  ) as { readonly enm: EnergyNetworkModel }
).enm;

const KADR = {
  width: Number(process.env.SZEROKOSC ?? '2400'),
  height: Number(process.env.WYSOKOSC ?? '700'),
} as const;
const STOPKA = 96;
const LOD: SceneLod = 2;
/** Skala kadru — STAŁA w obu fazach (kadr ma być ten sam, nie „dopasowany"). */
/** 0,9 px/j.św. to NAJMNIEJSZA skala, przy której warstwa czytelności
 *  (`canvas/labelLegibility.ts`) rysuje podpisy przęseł (0,8 ⇒ 0/37 rysowanych,
 *  0,9 ⇒ 37/37). Poniżej niej zrzut pokazywałby PUSTE prostokąty rezerwacji i
 *  nie dowodziłby niczego o napisie. */
const SKALA = Number(process.env.SKALA ?? '0.9');
const KOTWICA_Y = Number(process.env.KOTWICA_Y ?? '0.62');

const MOTYWY = [
  { klucz: 'ciemny', mode: 'dark_scada' as const },
  { klucz: 'jasny', mode: 'light_technical' as const },
];

const scene = buildSceneV3(enm, LOD);
const sceny: Readonly<Record<SceneLod, SceneV3>> = {
  0: buildSceneV3(enm, 0),
  1: buildSceneV3(enm, 1),
  2: scene,
};

const podpis = scene.labels.find((l) => l.ownerKind === 'segment-span' && l.text.startsWith(PARA));
if (!podpis) throw new Error(`brak podpisu przęsła „${PARA}" w scenie`);

/** Zakres polilinii NIOSĄCEJ ref podpisu — z kawałkami `#tee-N`, bo to ten sam
 *  kabel ENM za kropką węzła T (`resolveTeeJunctions`). */
const refKabla = podpis.ownerRef.replace(/#segment-label$/, '');
let kMinX = Infinity;
let kMaxX = -Infinity;
let kY = 0;
for (const g of scene.segments) {
  if (g.meta?.ownerRef?.replace(/#tee-\d+$/, '') !== refKabla) continue;
  for (const p of g.points) {
    if (p.x < kMinX) {
      kMinX = p.x;
      kY = p.y;
    }
    kMaxX = Math.max(kMaxX, p.x);
  }
}
if (!Number.isFinite(kMinX)) throw new Error(`kabel ${refKabla} nie jest narysowany`);

/** Kotwica kadru: ŚRODEK opisywanego kabla — obiekt obecny w obu fazach.
 *  Kabel bywa przesunięty między fazami (karta zmienia wstawianie kanałów),
 *  więc translacja kamery też — jest wypisana w stopce, żeby nikt nie wziął
 *  jej za dryf rysunku. */
const srodekKabla = { x: (kMinX + kMaxX) / 2, y: kY };
const zero = sceneBoxToCameraWorld({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
const srodek = { x: srodekKabla.x + zero.minX, y: srodekKabla.y + zero.minY };

const transform = {
  scale: SKALA,
  translateX: KADR.width / 2 - srodek.x * SKALA,
  translateY: KADR.height * KOTWICA_Y - srodek.y * SKALA,
};
const bboxKamery = (s: SceneV3) =>
  sceneBoxToCameraWorld({
    minX: s.bbox.x,
    minY: s.bbox.y,
    maxX: s.bbox.x + s.bbox.width,
    maxY: s.bbox.y + s.bbox.height,
  });
const kamera: CameraState = {
  transform,
  lod: LOD,
  viewportSize: KADR,
  lodBboxes: { 0: bboxKamery(sceny[0]), 1: bboxKamery(sceny[1]), 2: bboxKamery(sceny[2]) },
};

const doPiksela = (x: number, y: number) => ({
  x: x * transform.scale + transform.translateX,
  y: y * transform.scale + transform.translateY,
});
const swiat = (x: number, y: number) => {
  const w = sceneBoxToCameraWorld({ minX: x, minY: y, maxX: x, maxY: y });
  return doPiksela(w.minX, w.minY);
};

const pr0 = swiat(podpis.rect.x, podpis.rect.y);
const pr1 = swiat(podpis.rect.x + podpis.rect.width, podpis.rect.y + podpis.rect.height);
const ka = swiat(kMinX, kY);
const kb = swiat(kMaxX, kY);
const srodekPodpisuX = podpis.rect.x + podpis.rect.width / 2;
const srodekKablaX = (kMinX + kMaxX) / 2;
const dryf = Math.abs(srodekPodpisuX - srodekKablaX);
const dlugosc = kMaxX - kMinX;
const srPodpis = swiat(srodekPodpisuX, podpis.rect.y);
const srKabel = swiat(srodekKablaX, kY);

const stopka =
  `${FAZA === 'przed' ? 'PRZED' : 'PO'} · fixtura referencyjna sldSubstrate52s (53 stacje) · poziom szczegółu L2 · ` +
  `skala ${SKALA.toFixed(3)} px/j.św. (kadr PODANY kanwie przez cameraOverride) · podpis „${PARA}"`;
const stopka2 =
  `podpis [${podpis.rect.x}..${podpis.rect.x + podpis.rect.width}] · opisywany kabel [${kMinX}..${kMaxX}] (dł. ${dlugosc} j.św.) · ` +
  `DRYF ŚRODKÓW ${dryf.toFixed(0)} j.św. = ${dlugosc > 0 ? ((dryf / dlugosc) * 100).toFixed(0) : '—'}% długości opisywanego kabla`;
const stopka3 =
  `niebieski prostokąt = OwnedLabel.rect ze sceny · pomarańczowy odcinek = zakres X polilinii właściciela (ref + kawałki #tee-N) · ` +
  `kreski pionowe = oba środki. Adnotacje POMIAROWE, nie elementy rysunku.`;
const stopka4 =
  `kotwica kadru: środek opisywanego kabla w świecie (${srodek.x.toFixed(0)}, ${srodek.y.toFixed(0)}) → ` +
  `${(KOTWICA_Y * 100).toFixed(0)}% wysokości kadru; obie fazy tą samą skalą i tym samym punktem zaczepu`;

console.log(
  `${FAZA}: podpis ${podpis.rect.x}..${podpis.rect.x + podpis.rect.width} kabel ${kMinX}..${kMaxX} dryf ${dryf.toFixed(0)} (${dlugosc > 0 ? ((dryf / dlugosc) * 100).toFixed(0) : '-'}%)`,
);

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
    `<rect x="${pr0.x.toFixed(1)}" y="${pr0.y.toFixed(1)}" width="${(pr1.x - pr0.x).toFixed(1)}" height="${(pr1.y - pr0.y).toFixed(1)}" ` +
    `fill="none" stroke="#3fa9f5" stroke-width="2" stroke-dasharray="8 6"/>` +
    `<line x1="${ka.x.toFixed(1)}" y1="${(ka.y + 10).toFixed(1)}" x2="${kb.x.toFixed(1)}" y2="${(kb.y + 10).toFixed(1)}" ` +
    `stroke="#ff9f43" stroke-width="3"/>` +
    `<line x1="${srPodpis.x.toFixed(1)}" y1="${(pr0.y - 10).toFixed(1)}" x2="${srPodpis.x.toFixed(1)}" y2="${(pr1.y + 6).toFixed(1)}" stroke="#3fa9f5" stroke-width="2"/>` +
    `<line x1="${srKabel.x.toFixed(1)}" y1="${(srKabel.y - 6).toFixed(1)}" x2="${srKabel.x.toFixed(1)}" y2="${(srKabel.y + 26).toFixed(1)}" stroke="#ff9f43" stroke-width="2"/>` +
    `<text x="16" y="${KADR.height + 26}" font-family="system-ui,sans-serif" font-size="15" fill="${paleta.baseStroke}">${stopka}</text>` +
    `<text x="16" y="${KADR.height + 46}" font-family="system-ui,sans-serif" font-size="14" fill="${paleta.baseStroke}">${stopka2}</text>` +
    `<text x="16" y="${KADR.height + 66}" font-family="system-ui,sans-serif" font-size="14" fill="${paleta.baseStroke}">${stopka3}</text>` +
    `<text x="16" y="${KADR.height + 86}" font-family="system-ui,sans-serif" font-size="14" fill="${paleta.baseStroke}">${stopka4}</text>` +
    `</svg>`;
  const nazwa = `${PREFIKS}-${FAZA}-${motyw.klucz}.svg`;
  writeFileSync(resolve(OUT, nazwa), svg, 'utf8');
  console.log('svg', nazwa);
}
