/**
 * SLD V3 F6b — testy `canvas/SldCanvasV3.tsx` (SLD_CAD_SPEC_V3 §6/§7;
 * REBUILD_PLAN_V3 F6b). Renderowane na REALNEJ fixturze `sldSubstrate52s`
 * (ta sama fixtura co `scene/__tests__/buildScene.test.ts`, F6a) — nie
 * syntetyki, zgodnie z zadaniem.
 *
 * Zakres (DoD zadania):
 *  A. Montaż: liczba symboli w DOM = `scene.symbols.length` dla danego LOD.
 *  B. Przełączenie LOD (`lodOverride`, escape hatch — patrz `SldCanvasV3Props`
 *     nagłówek) zmienia zawartość (L0 vs L2).
 *  C. Klik w symbol woła `onElementClick` z jego `testId`.
 *  D. Overlay energizacji zmienia WYŁĄCZNIE atrybuty koloru — geometria
 *     (x/y/width/height/d/points/transform) identyczna z i bez nakładki.
 *  E. Determinizm: dwa rendery tych samych propsów → identyczny innerHTML.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3 } from '../../scene/buildScene';
import { SldCanvasV3 } from '../SldCanvasV3';
import type { SldV3Overlay } from '../overlay';

afterEach(() => cleanup());

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here,
  '..',
  '..',
  '..',
  'v2',
  'geometry',
  '__tests__',
  'fixtures',
  'sldSubstrate52s.enm.json',
);
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 800;

/** Strip stroke/fill VALUES only (not the attribute presence) so we can
 *  diff markup for pure-color changes without a full attribute-by-attribute
 *  walk. Geometry attributes (x/y/width/height/d/points/transform) are
 *  untouched by overlay coloring (spec §6 P5) — this proves it structurally. */
function stripColorAttrs(html: string): string {
  return html.replace(/stroke="[^"]*"/g, 'stroke="_"').replace(/fill="[^"]*"/g, 'fill="_"');
}

describe('SldCanvasV3 — montaż na realnej fixturze (53 stacje)', () => {
  it('LOD 0: liczba symboli w DOM = scene.symbols.length', () => {
    const scene = buildSceneV3(enm, 0);
    const { container } = render(<SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={0} />);
    const symbolGroup = container.querySelector('[data-testid="sld-v3-symbols"]');
    expect(symbolGroup?.children.length).toBe(scene.symbols.length);
  });

  it('LOD 2: liczba symboli i etykiet w DOM = scene.symbols.length / scene.labels.length', () => {
    const scene = buildSceneV3(enm, 2);
    const { container } = render(<SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} />);
    const symbolGroup = container.querySelector('[data-testid="sld-v3-symbols"]');
    const labelGroup = container.querySelector('[data-testid="sld-v3-labels"]');
    expect(symbolGroup?.children.length).toBe(scene.symbols.length);
    expect(labelGroup?.children.length).toBe(scene.labels.length);
  });

  it('kanwa niesie ramkę arkusza (SheetFrame) i tło SCADA', () => {
    const { container } = render(<SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={0} />);
    expect(container.querySelector('[data-testid="sld-sheet-frame"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-sheet-border"]')).toBeTruthy();
  });
});

describe('SldCanvasV3 — LOD (spec §7): L0 vs L2 daje różną zawartość', () => {
  it('data-scene-lod odzwierciedla lodOverride; L2 ma więcej węzłów DOM niż L0 (specyfikacje/podpisy)', () => {
    const { container: c0 } = render(<SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={0} />);
    const { container: c2 } = render(<SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} />);
    expect(c0.querySelector('[data-testid="sld-canvas-v3"]')?.getAttribute('data-scene-lod')).toBe('0');
    expect(c2.querySelector('[data-testid="sld-canvas-v3"]')?.getAttribute('data-scene-lod')).toBe('2');

    const labels0 = c0.querySelector('[data-testid="sld-v3-labels"]')?.children.length ?? 0;
    const labels2 = c2.querySelector('[data-testid="sld-v3-labels"]')?.children.length ?? 0;
    expect(labels2).toBeGreaterThan(labels0);

    const symbols0 = c0.querySelector('[data-testid="sld-v3-symbols"]')?.children.length ?? 0;
    const symbols2 = c2.querySelector('[data-testid="sld-v3-symbols"]')?.children.length ?? 0;
    expect(symbols2).toBeGreaterThan(symbols0);
  });

  it('domyślnie (brak lodOverride) LOD wynika z kamery dopasowanej do sceny — startuje jako liczba 0|1|2 valid', () => {
    const { container } = render(<SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />);
    const lod = container.querySelector('[data-testid="sld-canvas-v3"]')?.getAttribute('data-scene-lod');
    expect(['0', '1', '2']).toContain(lod);
  });
});

describe('SldCanvasV3 — klik w symbol', () => {
  it('klik w pierwszy symbol woła onElementClick z jego testId', () => {
    const scene = buildSceneV3(enm, 0);
    const onElementClick = vi.fn();
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={0} onElementClick={onElementClick} />,
    );
    const firstSymbolGroup = container.querySelector('[data-testid="sld-v3-symbols"]')?.firstElementChild;
    expect(firstSymbolGroup).toBeTruthy();
    const expectedTestId = firstSymbolGroup!.getAttribute('data-testid');
    expect(expectedTestId).toBe(scene.symbols[0].meta?.testId ?? 'sld-v3-symbol-0');

    fireEvent.click(firstSymbolGroup!);
    expect(onElementClick).toHaveBeenCalledTimes(1);
    expect(onElementClick).toHaveBeenCalledWith(expectedTestId);
  });

  it('bez onElementClick klik nie rzuca (brak handlera to no-op bezpieczny)', () => {
    const { container } = render(<SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={0} />);
    const firstSymbolGroup = container.querySelector('[data-testid="sld-v3-symbols"]')?.firstElementChild;
    expect(() => fireEvent.click(firstSymbolGroup!)).not.toThrow();
  });
});

describe('SldCanvasV3 — nakładka energizacji (spec §6: KOLOR, nie geometria)', () => {
  it('overlay zmienia WYŁĄCZNIE atrybuty koloru (stroke/fill) — geometria identyczna', () => {
    const scene = buildSceneV3(enm, 0);
    const testId = scene.symbols[0].meta?.testId ?? 'sld-v3-symbol-0';
    const overlay: SldV3Overlay = { energizedByTestId: { [testId]: true } };

    const { container: without } = render(<SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={0} />);
    const { container: withOverlay } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={0} overlay={overlay} />,
    );

    const symbolsWithout = without.querySelector('[data-testid="sld-v3-symbols"]')!;
    const symbolsWith = withOverlay.querySelector('[data-testid="sld-v3-symbols"]')!;

    // Geometria (kolejność i atrybuty pozycyjne) identyczna po usunięciu
    // WARTOŚCI stroke/fill — dowód strukturalny, nie tylko dla jednego symbolu.
    expect(stripColorAttrs(symbolsWith.innerHTML)).toBe(stripColorAttrs(symbolsWithout.innerHTML));

    // A kolor FAKTYCZNIE się różni na oznaczonym symbolu (nakładka działa).
    const targetWithout = without.querySelector(`[data-testid="${testId}"]`)!;
    const targetWith = withOverlay.querySelector(`[data-testid="${testId}"]`)!;
    // `children[0]` = hit-rect (transparentny, bez stroke); `children[1]` =
    // `<g>` glifu — pierwszy descendant ze `stroke` tam to rysunek glifu.
    const glyphStrokeOf = (el: Element) => el.children[1]?.querySelector('[stroke]')?.getAttribute('stroke');
    expect(glyphStrokeOf(targetWith)).not.toBe(glyphStrokeOf(targetWithout));
  });

  it('bez overlay (undefined) rysunek jest bazowy mono (brak nakładki) — brak wpisu = brak zmiany koloru', () => {
    const { container: a } = render(<SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={0} />);
    const { container: b } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={0} overlay={{ energizedByTestId: {} }} />,
    );
    expect(a.querySelector('[data-testid="sld-v3-symbols"]')!.innerHTML).toBe(
      b.querySelector('[data-testid="sld-v3-symbols"]')!.innerHTML,
    );
  });
});

describe('SldCanvasV3 — determinizm', () => {
  it('dwa rendery tych samych propsów dają identyczny innerHTML', () => {
    const { container: a } = render(<SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} />);
    const { container: b } = render(<SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} />);
    expect(a.innerHTML).toBe(b.innerHTML);
  });
});
