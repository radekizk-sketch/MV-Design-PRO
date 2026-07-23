/**
 * SCHEMAT-10 GS-2 (V12K-137) — dowód wizualny sylwetki mini-RMU po doprowadzeniu
 * do zgodności z 19 regułami `GRAMATYKA_MINI_RMU_2026-07.md`. Dwa zrzuty:
 *  - `gs2-l0.svg`: REALNA sieć referencyjna (`sldSubstrate52s`, 53 stacje) na L0
 *    produkcyjną kanwą `SldCanvasV3` — dowód CZYTELNOŚCI na kadrze CAŁOŚCI z
 *    torem mocy PRZEZ sylwetki (szyna na wylot), typ/TR/DER/NO rozpoznawalne;
 *  - `gs2-l0-detal.svg`: LEGENDA gramatyki — glify `StationCollapsedGlyph` w
 *    powiększeniu (×4), pełen zestaw cech (typ · TR · DER PV/BESS/FW/generator ·
 *    NO), z podpisami PL — dowód kotwic markerów i toru na wylot.
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   CANON_OUT=<dir> npx vite-node scripts/render_schemat10_gs2.tsx
 *   CANON_OUT=<dir> node scripts/rasterize.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderToStaticMarkup } from 'react-dom/server';

import type { EnergyNetworkModel } from '../src/types/enm';
import { buildSceneV3, layoutMetricsReport, SCENE_LOD_LABELS_PL } from '../src/ui/sld/v3/scene/buildScene';
import { SldCanvasV3 } from '../src/ui/sld/v3/canvas/SldCanvasV3';
import { StationCollapsedGlyph, type StationDerGlyphKind } from '../src/ui/sld/v3/symbols/glyphs';
import { MINI_RMU } from '../src/ui/sld/v3/symbols/miniRmuGrammar';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(HERE, '../src/ui/sld/v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json');
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

const OUT = process.env.CANON_OUT ?? '/tmp/canon';
mkdirSync(OUT, { recursive: true });

const WIDTH = 1800;
const HEIGHT = 1100;

// --- (1) Pełna sieć na L0 (dowód czytelności kadru całości) -----------------
{
  const scene = buildSceneV3(enm, 0);
  const m = layoutMetricsReport(scene);
  const inner = renderToStaticMarkup(<SldCanvasV3 snapshot={enm} width={WIDTH} height={HEIGHT} lodOverride={0} />);
  const line1 = `Widok: ${SCENE_LOD_LABELS_PL[0]} (L0) · GS-2: mini-RMU zgodne z 19 regułami gramatyki (V12K-137)`;
  const line2 =
    `stacje=${scene.meta.stationCount} symbole=${m.symbolCount} crossing=${m.crossingCount} ` +
    `kolizje=${m.labelCollisionCount} bbox=${m.contentBBoxWidth}x${m.contentBBoxHeight} ` +
    `sylwetka=${MINI_RMU.bbox.width}x${MINI_RMU.bbox.height}px · szyna na wylot (tor przez glif)`;
  const banner =
    `<text x="16" y="${HEIGHT - 40}" font-family="Inter, system-ui, sans-serif" font-size="22" font-weight="600" fill="#E8EEF4">${line1}</text>` +
    `<text x="16" y="${HEIGHT - 14}" font-family="Inter, system-ui, sans-serif" font-size="16" fill="#9FB3C8">${line2}</text>`;
  const withNs = inner.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
  const svg = withNs.replace('</svg>', `${banner}</svg>`);
  writeFileSync(`${OUT}/gs2-l0.svg`, svg);
  console.log('wrote', `${OUT}/gs2-l0.svg`, `stacje=${scene.meta.stationCount}`);
}

// --- (2) Legenda gramatyki (glify ×4, podpisy PL, pełen zestaw cech) ---------
{
  const S = 4; // powiększenie (48px → 192px)
  const CELL_W = 260;
  const CELL_H = 300;
  const cases: ReadonlyArray<{
    readonly title: string;
    readonly p: {
      stationSectioned?: boolean;
      stationHasTransformer?: boolean;
      stationDerOnMv?: StationDerGlyphKind | null;
      stationDerBehindTr?: StationDerGlyphKind | null;
      stationNoOpen?: boolean;
    };
  }> = [
    // GS-4: skrypt historyczny GS-2 zaktualizowany do kontraktu per strona
    // (usunięty prop `stationDer` — bez tego render gubiłby markery DER).
    { title: 'Rozdzielnia sieciowa', p: {} },
    { title: 'Stacja SN/nN (TR)', p: { stationHasTransformer: true } },
    { title: 'Stacja sekcyjna', p: { stationSectioned: true } },
    { title: 'PV za TR (nN)', p: { stationHasTransformer: true, stationDerBehindTr: 'pv' } },
    { title: 'BESS za TR (nN)', p: { stationHasTransformer: true, stationDerBehindTr: 'bess' } },
    { title: 'Farma wiatr. za TR (nN)', p: { stationHasTransformer: true, stationDerBehindTr: 'wind' } },
    { title: 'Generator na SN', p: { stationHasTransformer: true, stationDerOnMv: 'generator' } },
    { title: 'Punkt NO (otwarty)', p: { stationHasTransformer: true, stationNoOpen: true } },
    { title: 'Sekcyjna + TR + PV za TR + NO', p: { stationSectioned: true, stationHasTransformer: true, stationDerBehindTr: 'pv', stationNoOpen: true } },
  ];
  const cols = 4;
  const gridW = cols * CELL_W + 40;
  const rows = Math.ceil(cases.length / cols);
  const gridH = rows * CELL_H + 80;
  const cells = cases
    .map((c, i) => {
      const cx = 20 + (i % cols) * CELL_W;
      const cy = 60 + Math.floor(i / cols) * CELL_H;
      const glyph = renderToStaticMarkup(<StationCollapsedGlyph x={0} y={0} {...c.p} />);
      const gx = cx + (CELL_W - 48 * S) / 2;
      const gy = cy;
      return (
        `<g transform="translate(${gx},${gy}) scale(${S})">${glyph.replace('<g ', '<g stroke="#E8EEF4" ')}</g>` +
        `<text x="${cx + CELL_W / 2}" y="${cy + 48 * S + 26}" text-anchor="middle" ` +
        `font-family="Inter, system-ui, sans-serif" font-size="15" fill="#C9D6E2">${c.title}</text>`
      );
    })
    .join('');
  const title =
    `<text x="20" y="34" font-family="Inter, system-ui, sans-serif" font-size="22" font-weight="600" fill="#E8EEF4">` +
    `GS-2 · Gramatyka sylwetki stacji na L0 (mini-RMU, ×4) — tor mocy na wylot · kotwice typ/TR/DER/NO (V12K-137)</text>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${gridW}" height="${gridH}" viewBox="0 0 ${gridW} ${gridH}">` +
    `<rect width="${gridW}" height="${gridH}" fill="#0E1621"/>${title}${cells}</svg>`;
  writeFileSync(`${OUT}/gs2-l0-detal.svg`, svg);
  console.log('wrote', `${OUT}/gs2-l0-detal.svg`, `${cases.length} przypadkow`);
}
