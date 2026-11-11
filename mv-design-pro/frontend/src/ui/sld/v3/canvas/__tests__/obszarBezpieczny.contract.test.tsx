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
import { gabarytSymbolu } from '../../symbols/blokZabezpieczen';
import { MIN_SCALE } from '../../../v2/viewport/ViewportController';
import { SldCanvasV3, contentBoundingBoxOf, scenePointToCameraWorld } from '../SldCanvasV3';
import { SLD_CANVAS_DOCK_INSETS, stationInternalPanelWidthPx } from '../toolbarLayout';

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
    // Gabaryt z jedynego źródła geometrii symbolu: blok zabezpieczeń to cała
    // ramka (`gabarytSymbolu`), nie kwadrat definicji.
    const g = gabarytSymbolu(s);
    obejmij(g.x, g.y);
    obejmij(g.x + g.width, g.y + g.height);
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

function marginesy(
  lod: SceneLod,
  safeInsets?: { top: number; right: number; bottom: number; left: number },
  kanwa: { readonly width: number; readonly height: number } = CANVAS,
) {
  const { container } = render(
    <SldCanvasV3
      snapshot={enm}
      width={kanwa.width}
      height={kanwa.height}
      lodOverride={lod}
      safeInsets={safeInsets}
    />,
  );
  const viewBox = container.querySelector('[data-testid="sld-canvas-v3"]')!.getAttribute('viewBox')!;
  const [vx, vy, vw] = viewBox.split(' ').map(Number);
  const skala = kanwa.width / vw;
  const t = trescWSwiecieKamery(lod);
  return {
    lewo: (t.minX - vx) * skala,
    prawo: (vx + vw - t.maxX) * skala,
    gora: (t.minY - vy) * skala,
    dol: (vy + kanwa.height / skala - t.maxY) * skala,
    skala,
    vx,
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

  // Iloczyn: kanwa, na której fit MIEŚCI treść obok panelu (1920×1080: panel
  // 1200 px, kontekst 720 px) × kanwa, na której fit opiera się o PODŁOGĘ
  // skali `MIN_SCALE` (1200×800: kontekst SN_CONTEXT_MIN_WIDTH_PX = 440 px, a
  // fikstura 52 stacji ma po wpięciu bloku zabezpieczeń w każde pole stacji
  // ~9250 jednostek szerokości — pomiar 2026-11-05; potrzebna skala 0,039 <
  // 0,05). Na podłodze treść nie może się zmieścić w żadnym prostokącie, więc
  // orzeczeniem jest WYŚRODKOWANIE w prostokącie bezpiecznym (nadmiar dzielony
  // po równo), nie „nic pod panelem"; poza podłogą — „nic pod panelem".
  for (const kanwa of [CANVAS, { width: 1920, height: 1080 }] as const) {
    it(`ZASŁONA STANOWA wołającego (panel boczny) przesuwa kadr — inset nie jest stały (kanwa ${kanwa.width}×${kanwa.height})`, () => {
      const zPanelem = {
        ...SLD_CANVAS_DOCK_INSETS,
        right: SLD_CANVAS_DOCK_INSETS.right + stationInternalPanelWidthPx(kanwa.width),
      };
      const m = marginesy(1, zPanelem, kanwa);
      if (m.skala > MIN_SCALE + 1e-9) {
        // ORZECZENIE WŁAŚCIWE: treść nie wchodzi pod panel. Marginesu NIE mierzymy
        // jako „padding + pas" — przy bardzo wąskim prostokącie bezpiecznym o osi
        // ograniczającej decyduje proporcja treści, a nie sam pas; wymaganie
        // brzmi „nic pod panelem", nie „dokładnie tyle a tyle luzu".
        expect(kanwa.width, 'kanwa szeroka mieści treść bez podłogi skali').toBe(1920);
        expect(m.prawo).toBeGreaterThanOrEqual(zPanelem.right - 1e-6);
      } else {
        expect(kanwa.width, 'kanwa wąska opiera się o podłogę skali').toBe(CANVAS.width);
        expect(m.skala).toBeCloseTo(MIN_SCALE, 9);
        // Środek celu fitu (rezerwacje etykiet, `contentBoundingBoxOf`) leży na
        // środku prostokąta bezpiecznego — nadmiar ponad podłogą dzielony po równo.
        const cel = contentBoundingBoxOf(buildSceneV3(enm, 1))!;
        const a = scenePointToCameraWorld({ x: cel.minX, y: cel.minY });
        const b = scenePointToCameraWorld({ x: cel.maxX, y: cel.maxY });
        const srodekEkranu = ((a.x + b.x) / 2 - m.vx) * m.skala;
        const srodekBezpieczny = zPanelem.left + (kanwa.width - zPanelem.left - zPanelem.right) / 2;
        expect(srodekEkranu).toBeCloseTo(srodekBezpieczny, 3);
      }
      // Dowód, że to NIE jest to samo, co bez panelu: bez zasłony margines prawy
      // byłby mniejszy o szerokość panelu.
      cleanup();
      const bezPanelu = marginesy(1, undefined, kanwa);
      expect(m.prawo).toBeGreaterThan(bezPanelu.prawo);
    });
  }

  it('zerowe insety przywracają kadr sprzed karty (kompatybilność wsteczna wołających)', () => {
    const m = marginesy(1, { top: 0, right: 0, bottom: 0, left: 0 });
    expect(Math.min(m.lewo, m.prawo, m.gora, m.dol)).toBeCloseTo(FIT_PADDING_PX, 6);
  });
});
