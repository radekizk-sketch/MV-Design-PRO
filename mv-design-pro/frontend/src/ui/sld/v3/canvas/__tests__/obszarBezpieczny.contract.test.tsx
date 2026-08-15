/**
 * S9-8 (audyt) — OBSZAR BEZPIECZNY POD DOKAMI UI: treść rysunku nie chowa się
 * pod panelami kanwy.
 *
 * DLACZEGO TEN TEST ISTNIEJE. Mechanizm `SafeInsets` istniał w kamerze od v2
 * (`v2/viewport/ViewportController.ts`, komentarz „treść nie chowa się pod
 * nakładkami toolbaru/paneli") i NIGDY nie był przez v3 zasilany — zdolność bez
 * dostawcy. Kadr liczył się do pełnego prostokąta kanwy, więc rysunek wpasowany
 * „na styk" wchodził pod pas narzędzi u góry i pas kontrolek u dołu. Objawem
 * tej samej wady była wcześniejsza łatka punktowa: komunikat „Ukryto N opisów"
 * dostał WŁASNE odsunięcie (`HIDDEN_LABELS_HINT_BOTTOM_PX`), bo chował się pod
 * przyciskiem „Warstwy" — jeden napis naprawiono, klasę zostawiono.
 *
 * ILOCZYN CECH: {poziom szczegółu} × {stan zasłony: same doki / doki + panel
 * boczny}. Sam przypadek „bez panelu" nie wykryłby regresji „inset stały,
 * ignoruje stan wołającego".
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3, type SceneLod } from '../../scene/buildScene';
import { SYMBOL_DEFS } from '../../symbols/defs';
import { SldCanvasV3, scenePointToCameraWorld } from '../SldCanvasV3';
import { SLD_CANVAS_DOCK_INSETS, STATION_INTERNAL_PANEL_MAX_WIDTH_PX } from '../toolbarLayout';

afterEach(() => cleanup());

const here = dirname(fileURLToPath(import.meta.url));
const enm = (
  JSON.parse(
    readFileSync(
      resolve(here, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json'),
      'utf8',
    ),
  ) as { readonly enm: EnergyNetworkModel }
).enm;

const CANVAS = { width: 1200, height: 800 } as const;
/** Padding fitu deklarowany przez kamerę (`ViewportController.fitToView`). */
const FIT_PADDING_PX = 40;

/** Ekstenty treści rysowanej (symbole, odcinki, prostokąty etykiet) w świecie
 *  kamery — liczone NIEZALEŻNIE od produkcji, żeby test nie sprawdzał
 *  produkcji samą sobą. */
function trescWSwiecieKamery(lod: SceneLod) {
  const scene = buildSceneV3(enm, lod);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const obejmij = (x: number, y: number): void => {
    const p = scenePointToCameraWorld({ x, y });
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  };
  for (const s of scene.symbols) {
    if (!s.meta?.ownerRef) continue;
    const def = SYMBOL_DEFS[s.symbolId];
    obejmij(s.x, s.y);
    obejmij(s.x + def.width, s.y + def.height);
  }
  for (const seg of scene.segments) {
    if (!seg.meta?.ownerRef) continue;
    for (const p of seg.points) obejmij(p.x, p.y);
  }
  for (const l of scene.labels) {
    obejmij(l.rect.x, l.rect.y);
    obejmij(l.rect.x + l.rect.width, l.rect.y + l.rect.height);
  }
  return { minX, minY, maxX, maxY };
}

function marginesy(lod: SceneLod, safeInsets?: { top: number; right: number; bottom: number; left: number }) {
  const { container } = render(
    <SldCanvasV3
      snapshot={enm}
      width={CANVAS.width}
      height={CANVAS.height}
      lodOverride={lod}
      safeInsets={safeInsets}
    />,
  );
  const viewBox = container.querySelector('[data-testid="sld-canvas-v3"]')!.getAttribute('viewBox')!;
  const [vx, vy, vw] = viewBox.split(' ').map(Number);
  const skala = CANVAS.width / vw;
  const t = trescWSwiecieKamery(lod);
  return {
    lewo: (t.minX - vx) * skala,
    prawo: (vx + vw - t.maxX) * skala,
    gora: (t.minY - vy) * skala,
    dol: (vy + CANVAS.height / skala - t.maxY) * skala,
  };
}

describe('S9-8 — obszar bezpieczny pod dokami UI', () => {
  it('kontrakt insetów jest WYPROWADZONY ze stałych doków, nie wpisany ręcznie', () => {
    // Pas narzędzi: `top-3` (12 px) + rząd `h-7` (28 px). Ten sam rachunek u
    // dołu (`bottom-3` + rząd kontrolek). Gdyby ktoś zmienił margines doku,
    // ta asercja pęknie razem z kadrem — o to chodzi.
    expect(SLD_CANVAS_DOCK_INSETS.top).toBe(SLD_CANVAS_DOCK_INSETS.bottom);
    expect(SLD_CANVAS_DOCK_INSETS.top).toBeGreaterThan(0);
    // Pasy boczne zerowe: doki narożne leżą W PASIE DOLNYM (są już pokryte),
    // a odjęcie ich szerokości na pełnej wysokości zabrałoby rysunkowi miejsce.
    expect(SLD_CANVAS_DOCK_INSETS.left).toBe(0);
    expect(SLD_CANVAS_DOCK_INSETS.right).toBe(0);
  });

  for (const lod of [0, 1, 2] as const) {
    it(`LOD ${lod}: treść trzyma się POZA pasem doków (góra i dół ≥ padding + pas doku)`, () => {
      const m = marginesy(lod);
      expect(m.gora).toBeGreaterThanOrEqual(FIT_PADDING_PX + SLD_CANVAS_DOCK_INSETS.top - 1e-6);
      expect(m.dol).toBeGreaterThanOrEqual(FIT_PADDING_PX + SLD_CANVAS_DOCK_INSETS.bottom - 1e-6);
      expect(m.lewo).toBeGreaterThanOrEqual(FIT_PADDING_PX - 1e-6);
      expect(m.prawo).toBeGreaterThanOrEqual(FIT_PADDING_PX - 1e-6);
    });
  }

  it('ZASŁONA STANOWA wołającego (panel boczny) przesuwa kadr — inset nie jest stały', () => {
    const zPanelem = {
      ...SLD_CANVAS_DOCK_INSETS,
      right: SLD_CANVAS_DOCK_INSETS.right + Math.min(STATION_INTERNAL_PANEL_MAX_WIDTH_PX, CANVAS.width - 24),
    };
    const m = marginesy(1, zPanelem);
    // ORZECZENIE WŁAŚCIWE: treść nie wchodzi pod panel. Marginesu NIE mierzymy
    // jako „padding + pas" — przy bardzo wąskim prostokącie bezpiecznym o osi
    // ograniczającej decyduje proporcja treści, a nie sam pas; wymaganie
    // brzmi „nic pod panelem", nie „dokładnie tyle a tyle luzu".
    expect(m.prawo).toBeGreaterThanOrEqual(zPanelem.right - 1e-6);
    // Dowód, że to NIE jest to samo, co bez panelu: bez zasłony margines prawy
    // byłby mniejszy o szerokość panelu.
    cleanup();
    const bezPanelu = marginesy(1);
    expect(m.prawo).toBeGreaterThan(bezPanelu.prawo);
  });

  it('zerowe insety przywracają kadr sprzed karty (kompatybilność wsteczna wołających)', () => {
    const m = marginesy(1, { top: 0, right: 0, bottom: 0, left: 0 });
    expect(Math.min(m.lewo, m.prawo, m.gora, m.dol)).toBeCloseTo(FIT_PADDING_PX, 6);
  });
});
