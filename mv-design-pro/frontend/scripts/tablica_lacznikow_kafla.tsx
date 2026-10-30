/**
 * TABLICA ŁĄCZNIKÓW KAFLA — rodzaj aparatu × stan, w obu motywach, do oceny właściciela
 * (karta UX-04/POLE-LINIOWE-WZORZEC, decyzje właściciela 2026-10-30: znacznik rodzaju aparatu
 * przy styku stałym, symbol ziemi w dół; `docs/uiux/UX04_POLE_LINIOWE_WZORZEC.md` §11.13–§11.14).
 *
 * Rysuje PRODUKCYJNE glify kanwy (`SYMBOL_GLYPHS`) z paletą motywu (`palette.state` — kafle,
 * `palette.baseStroke`, `palette.canvasBackground`) i mnożnikiem kreski kanwy
 * `strokeScaleFactor(skala)` — tak jak `SldCanvasV3` — w trzech skalach: wejście w LOD1 (0,69),
 * dolna granica LOD2 (1,02) i podgląd ×3. Wiersze: wyłącznik (bez i z napędem M), odłącznik,
 * rozłącznik (sam i z bezpiecznikami), uziemnik, łącznik trójpołożeniowy (bez i z napędem).
 * Kolumny: zamknięty, otwarty, uziemiony, nieustalony, awaria, brak stanu w modelu. Człon wysuwny
 * nie ma wiersza — model go nie zna (luka opisana w §11.14).
 *
 * Wynik: `docs/uiux/zrzuty/ux04-pole-liniowe/tablica-lacznikow-rodzaj-x-stan-<motyw>.png`.
 * Determinizm: stała kolejność, stała czcionka schematu, `deviceScaleFactor` 1 (piksel CSS =
 * piksel zrzutu, więc rozmiary na tablicy LOD1/LOD2 to rozmiary ekranu kanwy).
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   npx vite-node scripts/tablica_lacznikow_kafla.tsx
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { renderToStaticMarkup } from 'react-dom/server';

import { QET_BOK_KAFLA_STANU } from '../src/ui/sld/v3/cad/qet/qetPoleSn';
import { DEFAULT_LOD_THRESHOLDS, LOD_HYSTERESIS_MARGIN } from '../src/ui/sld/v3/canvas/camera';
import { strokeScaleFactor } from '../src/ui/sld/v3/compose/preview';
import { SLD_FONT_FAMILY } from '../src/ui/sld/v3/core/text';
import { SYMBOL_GLYPHS, type SwitchState } from '../src/ui/sld/v3/symbols/glyphs';
import type { SymbolId } from '../src/ui/sld/v3/symbols/defs';
import { DARK_SCADA_SLD_PALETTE } from '../src/ui/sld/v3/theme/colorTokens';
import { LIGHT_TECHNICAL_SLD_PALETTE } from '../src/ui/sld/v3/theme/palette';
import { chromiumLaunchOptions } from './playwright-env.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const KATALOG = resolve(HERE, '..', '..', 'docs', 'uiux', 'zrzuty', 'ux04-pole-liniowe');

const WIERSZE: ReadonlyArray<readonly [string, SymbolId]> = [
  ['wyłącznik', 'qetBreaker'],
  ['wyłącznik z napędem M', 'qetBreakerZNapedem'],
  ['odłącznik', 'qetDisconnector'],
  ['rozłącznik', 'qetLoadBreakSwitch'],
  ['rozłącznik z bezpiecznikami', 'qetFuseSwitch'],
  ['uziemnik', 'qetEarthSwitch'],
  ['trójpołożeniowy', 'qetThreePositionSwitch'],
  ['trójpołożeniowy z napędem M', 'qetThreePositionSwitchZNapedem'],
];
const KOLUMNY: ReadonlyArray<readonly [string, SwitchState | undefined]> = [
  ['zamknięty', 'closed'],
  ['otwarty', 'open'],
  ['uziemiony', 'earthed'],
  ['nieustalony', 'unknown'],
  ['awaria', 'bad'],
  ['brak stanu', undefined],
];
const SKALE: ReadonlyArray<readonly [string, number]> = [
  ['LOD1 — wejście, skala 0,69 px/j.św.', DEFAULT_LOD_THRESHOLDS.l0Max * (1 + LOD_HYSTERESIS_MARGIN)],
  ['LOD2 — dolna granica, skala 1,02 px/j.św.', DEFAULT_LOD_THRESHOLDS.l1Max * (1 - LOD_HYSTERESIS_MARGIN)],
  ['podgląd ×3', 3],
];
const MOTYWY = [
  ['ciemny', DARK_SCADA_SLD_PALETTE],
  ['jasny', LIGHT_TECHNICAL_SLD_PALETTE],
] as const;

const OPIS_W = 190;
/** Najmniejszy krok kolumny [px] — nagłówki stanów nie nachodzą na siebie w bloku LOD1. */
const KOLUMNA_MIN = 84;
const NAGLOWEK_H = 22;
const TYTUL_H = 26;
const ODSTEP = 14;

function blok(skala: number, tytul: string, paleta: (typeof MOTYWY)[number][1], y0: number): { el: JSX.Element; h: number; w: number } {
  const wiersz = QET_BOK_KAFLA_STANU * skala + ODSTEP;
  const kom = Math.max(wiersz, KOLUMNA_MIN);
  const w = OPIS_W + KOLUMNY.length * kom;
  const h = TYTUL_H + NAGLOWEK_H + WIERSZE.length * wiersz;
  const tekst = { fontFamily: SLD_FONT_FAMILY, fill: paleta.baseStroke } as const;
  const el = (
    <g key={tytul} transform={`translate(0 ${y0})`}>
      <text x={8} y={18} fontSize={14} fontWeight={700} {...tekst}>{tytul}</text>
      {KOLUMNY.map(([nazwa], c) => (
        <text key={nazwa} x={OPIS_W + c * kom} y={TYTUL_H + 14} fontSize={12} {...tekst}>{nazwa}</text>
      ))}
      {WIERSZE.map(([nazwa, id], r) => {
        const Glyph = SYMBOL_GLYPHS[id];
        const y = TYTUL_H + NAGLOWEK_H + r * wiersz;
        return (
          <g key={id}>
            <text x={8} y={y + (QET_BOK_KAFLA_STANU * skala) / 2 + 4} fontSize={12} {...tekst}>{nazwa}</text>
            {KOLUMNY.map(([kol, stan], c) => (
              <g key={kol} transform={`translate(${OPIS_W + c * kom} ${y}) scale(${skala})`}>
                <Glyph x={0} y={0} state={stan} stroke={paleta.baseStroke} kafleStanu={paleta.state} strokeScale={strokeScaleFactor(skala)} />
              </g>
            ))}
          </g>
        );
      })}
    </g>
  );
  return { el, h, w };
}

mkdirSync(KATALOG, { recursive: true });
const przegladarka = await chromium.launch(chromiumLaunchOptions());
try {
  for (const [motyw, paleta] of MOTYWY) {
    let y = 8;
    let szer = 0;
    const bloki: JSX.Element[] = [];
    for (const [tytul, skala] of SKALE) {
      const b = blok(skala, tytul, paleta, y);
      bloki.push(b.el);
      y += b.h + 16;
      szer = Math.max(szer, b.w);
    }
    const w = Math.ceil(szer + 8);
    const h = Math.ceil(y);
    const svg = renderToStaticMarkup(
      <svg xmlns="http://www.w3.org/2000/svg" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <rect x={0} y={0} width={w} height={h} fill={paleta.canvasBackground} />
        {bloki}
      </svg>,
    );
    const strona = await przegladarka.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await strona.setContent(`<!doctype html><html><body style="margin:0">${svg}</body></html>`);
    const sciezka = resolve(KATALOG, `tablica-lacznikow-rodzaj-x-stan-${motyw}.png`);
    await strona.screenshot({ path: sciezka, clip: { x: 0, y: 0, width: w, height: h } });
    await strona.close();
    writeFileSync(1, `zrzut ${sciezka} (${w}×${h})\n`);
  }
} finally {
  await przegladarka.close();
}
