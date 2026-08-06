/**
 * S9-1 (ŁAMANIE ARKUSZA, karta S9-1; audyt `docs/sld/AUDYT_JAKOSCI_SLD_2026-08.md`
 * znalezisko C-1) — DOWÓD WIZUALNY: produkcyjna kanwa v3 renderuje obie sieci
 * pomiarowe na L0/L1/L2, w OBU motywach.
 *
 * Sieci (te same, na których liczone są pomiary „przed/po" w meldunku):
 *  - `referencyjna`  — fixtura `sldSubstrate52s` (53 stacje, magistrala + 12 odgałęzień);
 *  - `dlugi-ciag`    — kształt z audytu: magistrala wydłużona do ≥51 stacji
 *                      jednostkowymi stacjami (deterministyczne łańcuchowanie,
 *                      `scene/__tests__/syntheticNetworks.ts` — ta sama
 *                      maszyneria, której używają testy skalowalności).
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   CANON_OUT=<dir> npx vite-node scripts/render_s9_1_lamanie.tsx
 *   CANON_OUT=<dir> node scripts/rasterize.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';

import type { EnergyNetworkModel } from '../src/types/enm';
import {
  buildSceneV3,
  sheetAspectRatio,
  sheetFillRatio,
  sheetRowStationIds,
  SCENE_LOD_LABELS_PL,
  type SceneLod,
} from '../src/ui/sld/v3/scene/buildScene';
import { appendUnitToTrunk, loadEnm } from '../src/ui/sld/v3/scene/__tests__/syntheticNetworks';
import { SldCanvasV3 } from '../src/ui/sld/v3/canvas/SldCanvasV3';
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
const FOOTER = 56;

for (const siec of SIECI) {
  for (const lod of [0, 1, 2] as SceneLod[]) {
    const scene = buildSceneV3(siec.enm, lod);
    const wiersze = sheetRowStationIds(scene).length;
    const opis =
      `${SCENE_LOD_LABELS_PL[lod]} (L${lod}) · ${siec.klucz} · wierszy arkusza=${wiersze} · ` +
      `bbox=${scene.bbox.width}x${scene.bbox.height} · proporcja=${sheetAspectRatio(scene).toFixed(2)} : 1 · ` +
      `gestosc tuszu=${(sheetFillRatio(scene) * 100).toFixed(2)}%`;
    for (const motyw of MOTYWY) {
      // Tryb podawany WPROST propem (naprawa u źródła, karta S9-4):
      // `renderToStaticMarkup` czyta ze store'a Zustand STAN POCZĄTKOWY
      // (kontrakt SSR `useSyncExternalStore`), więc samo `setState` nie
      // docierało do kanwy i zrzuty „jasny" wychodziły w palecie ciemnej.
      useThemeModeStore.setState({ mode: motyw.mode });
      const paleta = sldPaletteForTheme(motyw.mode);
      const inner = renderToStaticMarkup(
        <SldCanvasV3 snapshot={siec.enm} width={WIDTH} height={HEIGHT} lodOverride={lod} themeMode={motyw.mode} />,
      );
      const withNs = inner.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
      const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT + FOOTER}" ` +
        `viewBox="0 0 ${WIDTH} ${HEIGHT + FOOTER}">` +
        `<rect x="0" y="0" width="${WIDTH}" height="${HEIGHT + FOOTER}" fill="${paleta.canvasBackground}"/>` +
        `${withNs}` +
        `<text x="16" y="${HEIGHT + 34}" font-family="system-ui,sans-serif" font-size="16" ` +
        `fill="${paleta.baseStroke}">${opis}</text>` +
        `</svg>`;
      const nazwa = `s9-1-${siec.klucz}-L${lod}-${motyw.klucz}.svg`;
      writeFileSync(resolve(OUT, nazwa), svg, 'utf8');
      console.log('svg', nazwa);
    }
  }
}
