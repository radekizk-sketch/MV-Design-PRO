/**
 * POMIAR-ODGAŁĘZIENIE — dowód wizualny „przed/po" na produkcyjnej kanwie v3.
 *
 * Sieć pokazowa (`seed.py`): magistrala OSD z dwiema stacjami dystrybucyjnymi
 * + dwóch klientów SN z układem pomiarowo-rozliczeniowym.
 *  - `przed` — stan sprzed karty: klienci WCIĘCI PRZELOTOWO w magistralę, więc
 *    tranzyt OSD idzie przez rozdzielnicę abonenta (zakaz §1 kontraktu
 *    `docs/domain/POMIAR_ROZLICZENIOWY_SN_V1.md`);
 *  - `po`    — stan po karcie: klienci wiszą na ODGAŁĘZIENIACH od punktów ZKSN,
 *    magistrala biegnie wyłącznie przez stacje OSD.
 *
 * ODG-RYSUNEK (etap 3 kontraktu, WDROŻONY): scena rysuje już punkty odgałęźne
 * (ZKSN / słup rozgałęźny) i całe ciągi za nimi, więc wariant `po` pokazuje
 * KOMPLETNĄ sieć. Stopka zrzutu podaje POMIAR pokrycia wprost ze sceny (stacje
 * narysowane, punkty odgałęźne, ciągi pominięte) — zrzut nie zapewnia, tylko
 * melduje liczby.
 *
 * Zrzuty powstają dla DWÓCH poziomów szczegółu (L0 przegląd i L2 stacje
 * i aparatura) w OBU motywach — kotwica L0/L2 jest wspólna (kanon „jedna
 * kotwica"), więc para zrzutów jest też dowodem, że punkt odgałęźny nie
 * przemeblowuje rysunku przy zoomie.
 *
 * Uruchomienie (cwd: mv-design-pro/frontend; modele z `seed.py --enm <plik>`):
 *   POMIAR_ODG_PRZED=<plik> POMIAR_ODG_PO=<plik> CANON_OUT=<dir> \
 *     npx vite-node scripts/demo-siec-pokazowa/render.tsx
 *   CANON_OUT=<dir> node scripts/rasterize.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';

import type { EnergyNetworkModel } from '../../src/types/enm';
import { buildSceneV3, SCENE_LOD_LABELS_PL, type SceneLod } from '../../src/ui/sld/v3/scene/buildScene';
import { SldCanvasV3 } from '../../src/ui/sld/v3/canvas/SldCanvasV3';
import { useThemeModeStore } from '../../src/ui2/theme/themeMode';
import { sldPaletteForTheme } from '../../src/ui/sld/v3/theme/palette';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.CANON_OUT ?? '/tmp/canon';
mkdirSync(OUT, { recursive: true });

function wczytaj(sciezka: string): EnergyNetworkModel {
  const surowe = JSON.parse(readFileSync(sciezka, 'utf8')) as
    | { readonly enm: EnergyNetworkModel }
    | EnergyNetworkModel;
  return 'enm' in surowe ? surowe.enm : surowe;
}

const DOMYSLNA_PO = resolve(
  HERE,
  '../../src/ui/sld/v3/scene/__tests__/fixtures/pomiarOdgalezienie.enm.json',
);

const WARIANTY = [
  {
    klucz: 'przed',
    plik: process.env.POMIAR_ODG_PRZED ?? '',
    opis: 'PRZED — klienci wcięci przelotowo: tranzyt magistrali przez rozdzielnicę abonenta',
  },
  {
    klucz: 'po',
    plik: process.env.POMIAR_ODG_PO ?? DOMYSLNA_PO,
    opis: 'PO — klienci w odgałęzieniach (ZKSN); magistrala wyłącznie przez stacje OSD',
  },
].filter((w) => w.plik.length > 0);

const MOTYWY = [
  { klucz: 'ciemny', mode: 'dark_scada' as const },
  { klucz: 'jasny', mode: 'light_technical' as const },
];

/** Kadr DOPASOWANY do arkusza sceny (margines + limity) — zrzut ma być czytelny
 *  w skali ~1:1, a nie zmniejszony tak, że symbol punktu odgałęźnego (16 px
 *  świata) schodzi poniżej progu rozpoznawalności. */
function kadr(bbox: { readonly width: number; readonly height: number }) {
  const margines = 80;
  return {
    width: Math.min(2400, Math.max(1200, Math.ceil(bbox.width) + 2 * margines)),
    height: Math.min(3600, Math.max(800, Math.ceil(bbox.height) + 2 * margines)),
  };
}
const FOOTER = 78;
/** L0 = przegląd sieci, L2 = stacje i aparatura (kanon „jedna kotwica"). */
const LODY: readonly SceneLod[] = [0, 2];
/** Przedrostek nazw plików; `pomiar-odg` zostaje dla porównania „przed/po"
 *  etapu 2, `odg-rysunek` to odbiór etapu 3 (rysowanie punktów odgałęźnych). */
const PREFIKS = process.env.POMIAR_ODG_PREFIKS ?? 'odg-rysunek';

for (const wariant of WARIANTY) {
  const enm = wczytaj(wariant.plik);
  for (const LOD of LODY) {
  const scene = buildSceneV3(enm, LOD);
  const pominiete = scene.meta.stopNotes.filter((n) => n.includes('ciąg pominięty')).length;
  const punkty = (enm.branch_points ?? []).length;
  const wiersz1 =
    `${SCENE_LOD_LABELS_PL[LOD]} (L${LOD}) · ${wariant.opis}` +
    ` · stacji w ciągu głównym=${scene.meta.mainTrunkStationIds.length}` +
    ` · stacji narysowanych=${scene.meta.drawnStationIds.length}`;
  const wiersz2 =
    pominiete > 0
      ? `LUKA RYSUNKU: ${pominiete} odgałęzień pominiętych — stacje za punktem odgałęźnym nie są rysowane`
      : `Punkty odgałęźne narysowane: ${scene.meta.drawnBranchPointRefs.length} z ${punkty} w modelu` +
        ` · odgałęzienia narysowane: ${scene.meta.lateralRunIds.length} · ciągi pominięte: 0`;

  const { width: WIDTH, height: HEIGHT } = kadr(scene.bbox);

  for (const motyw of MOTYWY) {
    useThemeModeStore.setState({ mode: motyw.mode });
    const paleta = sldPaletteForTheme(motyw.mode);
    const inner = renderToStaticMarkup(
      <SldCanvasV3
        snapshot={enm}
        width={WIDTH}
        height={HEIGHT}
        lodOverride={LOD}
        paletteMode={motyw.mode}
      />,
    );
    const withNs = inner.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT + FOOTER}" ` +
      `viewBox="0 0 ${WIDTH} ${HEIGHT + FOOTER}">` +
      `<rect x="0" y="0" width="${WIDTH}" height="${HEIGHT + FOOTER}" fill="${paleta.canvasBackground}"/>` +
      `${withNs}` +
      `<text x="16" y="${HEIGHT + 30}" font-family="system-ui,sans-serif" font-size="16" ` +
      `fill="${paleta.baseStroke}">${wiersz1}</text>` +
      `<text x="16" y="${HEIGHT + 56}" font-family="system-ui,sans-serif" font-size="15" ` +
      `fill="${paleta.baseStroke}">${wiersz2}</text>` +
      `</svg>`;
    const nazwa = `${PREFIKS}-${wariant.klucz}-l${LOD}-${motyw.klucz}.svg`;
    writeFileSync(resolve(OUT, nazwa), svg, 'utf8');
    console.log('svg', nazwa);
  }
  }
}
