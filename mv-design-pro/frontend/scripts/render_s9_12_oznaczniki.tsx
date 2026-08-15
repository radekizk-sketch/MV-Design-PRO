/**
 * S9-12 (OPISY I HIERARCHIA RYSUNKU; rejestr V12K-335 pkt 3) — DOWÓD WIZUALNY:
 * produkcyjna kanwa v3 na pełnym szczególe (L2), OBA motywy, dwie sceny:
 *
 *  1. `pokazowa` — sieć pokazowa pomiaru rozliczeniowego
 *     (`demo-siec-pokazowa`, fixtura `pomiarOdgalezienie.enm.json`): stan po
 *     kartach S9-7/8 + S9-12 — opisy sekcji z identyfikatorem stacji (C-8),
 *     oznacznik `Un=` na przęsłach (C-9), oznaczniki aparatów Q/QE/T/TV.
 *  2. `oznacznik-f` — fixtura DER-SN (`w2cDerSnFixtures`, lustro kontraktu
 *     backendu): pole źródłowe SN z ogranicznikiem przepięć BEZ `designation`
 *     ⇒ konwencyjne „F1" wg PN-EN 81346-2 (decyzja właściciela 2026-08-07,
 *     V12K-335 pkt 3) + szyna nN producenta opisana gramatyką nN (klasa C-8).
 *
 * Stopka niesie POMIAR (liczby ze sceny), nie ocenę.
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   CANON_OUT=<dir> npx vite-node scripts/render_s9_12_oznaczniki.tsx
 *   CANON_OUT=<dir> node scripts/rasterize.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';

import type { EnergyNetworkModel } from '../src/types/enm';
import { buildSceneV3 } from '../src/ui/sld/v3/scene/buildScene';
import { buildDerSnFixture } from '../src/ui/sld/v3/scene/__tests__/fixtures/w2cDerSnFixtures';
import { SldCanvasV3 } from '../src/ui/sld/v3/canvas/SldCanvasV3';
import { useThemeModeStore } from '../src/ui2/theme/themeMode';
import { sldPaletteForTheme } from '../src/ui/sld/v3/theme/palette';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.CANON_OUT ?? '/tmp/canon';
mkdirSync(OUT, { recursive: true });

const pokazowa = (
  JSON.parse(
    readFileSync(resolve(HERE, '../src/ui/sld/v3/scene/__tests__/fixtures/pomiarOdgalezienie.enm.json'), 'utf8'),
  ) as { readonly enm: EnergyNetworkModel }
).enm;

const derZOgranicznikiem = buildDerSnFixture([{ technology: 'PV', withSa: true }]).enm;

const SCENY = [
  { klucz: 'pokazowa', enm: pokazowa, opis: 'sieć pokazowa — opisy sekcji z kodem stacji (C-8), Un= na przęsłach (C-9), oznaczniki Q/QE/T/TV' },
  { klucz: 'oznacznik-f', enm: derZOgranicznikiem, opis: 'tor DER-SN — ogranicznik przepięć z konwencyjnym „F1" wg PN-EN 81346-2 (V12K-335 pkt 3)' },
] as const;

const MOTYWY = [
  { klucz: 'ciemny', mode: 'dark_scada' as const },
  { klucz: 'jasny', mode: 'light_technical' as const },
];

const FOOTER = 56;

function kadr(bbox: { readonly width: number; readonly height: number }) {
  const margines = 80;
  return {
    width: Math.min(2400, Math.max(1200, Math.ceil(bbox.width) + 2 * margines)),
    height: Math.min(3600, Math.max(800, Math.ceil(bbox.height) + 2 * margines)),
  };
}

for (const scena of SCENY) {
  const scene = buildSceneV3(scena.enm, 2);
  const idApar = scene.labels.filter((l) => l.ownerKind === 'apparatus' && l.ownerRef.includes('#apparatus-id-'));
  const idF = idApar.filter((l) => /^F\d+(·\d+)?$/.test(l.text));
  const sekcje = scene.labels.filter((l) => l.ownerKind === 'busbar-voltage');
  const stopka =
    `Pełny szczegół (L2) · ${scena.opis} · etykiet identyfikatora aparatu=${idApar.length}` +
    ` (w tym F=${idF.length}) · etykiet szyn/sekcji=${sekcje.length}`;
  const { width: WIDTH, height: HEIGHT } = kadr(scene.bbox);
  for (const motyw of MOTYWY) {
    useThemeModeStore.setState({ mode: motyw.mode });
    const paleta = sldPaletteForTheme(motyw.mode);
    const inner = renderToStaticMarkup(
      // Motyw podany WPROST (`paletteMode`): render statyczny nie widzi stanu
      // sklepu motywu (lekcja S9-7/8 — zrzut „jasny" bez propa rysował się
      // tuszem palety ciemnej).
      <SldCanvasV3
        snapshot={scena.enm}
        width={WIDTH}
        height={HEIGHT}
        lodOverride={2}
        paletteMode={motyw.mode}
      />,
    );
    const withNs = inner.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT + FOOTER}" ` +
      `viewBox="0 0 ${WIDTH} ${HEIGHT + FOOTER}">` +
      `<rect x="0" y="0" width="${WIDTH}" height="${HEIGHT + FOOTER}" fill="${paleta.canvasBackground}"/>` +
      `${withNs}` +
      `<text x="16" y="${HEIGHT + 34}" font-family="system-ui,sans-serif" font-size="15" ` +
      `fill="${paleta.baseStroke}">${stopka}</text>` +
      `</svg>`;
    const nazwa = `s9-12-${scena.klucz}-L2-${motyw.klucz}.svg`;
    writeFileSync(resolve(OUT, nazwa), svg, 'utf8');
    console.log('svg', nazwa);
  }
}
