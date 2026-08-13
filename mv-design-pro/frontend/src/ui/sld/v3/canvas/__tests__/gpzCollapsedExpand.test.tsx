/**
 * KD-5 — INTERAKCJA: klik w ZWINIĘTY blok GPZ rozwija go (zbliżenie do progu
 * LOD), reużywając ISTNIEJĄCEJ nawigacji kamery (akcje `'center'` + `'zoom'`).
 *
 * Dwie warstwy dowodu:
 *  1. CZYSTA MATEMATYKA progu (`zoomFactorToEnterNextLod`) — bez DOM: że
 *     współczynnik faktycznie przenosi `refScale` PONAD próg wejścia i że nigdy
 *     nie oddala.
 *  2. REALNA ŚCIEŻKA UŻYTKOWNIKA — render `SldCanvasV3` na sieci referencyjnej,
 *     NATYWNY klik w węzeł bloku (`fireEvent.click` na realnym elemencie DOM,
 *     bez wołania handlera wprost) i sprawdzenie, że kadr kamery (`viewBox`
 *     SVG — jedyne, co kamera zmienia) faktycznie się przybliżył i wycentrował
 *     na bloku. Zero syntetycznych skrótów: gdyby klik był „martwy" (jak
 *     precedens capture-on-pointerdown), ten test byłby czerwony.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { fireEvent, render } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3 } from '../../scene/buildScene';
import { SYMBOL_DEFS } from '../../symbols/defs';
import {
  DEFAULT_LOD_THRESHOLDS,
  LOD_HYSTERESIS_MARGIN,
  zoomFactorToEnterNextLod,
} from '../camera';
import { SldCanvasV3 } from '../SldCanvasV3';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json',
);
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

/** viewBox = „x y w h" — szerokość świata w kadrze; mniejsza = bliżej. */
function viewBoxOf(container: HTMLElement): readonly number[] {
  const svg = container.querySelector('[data-testid="sld-canvas-v3"]')!;
  return svg.getAttribute('viewBox')!.split(' ').map(Number);
}

describe('KD-5 — próg rozwinięcia (czysta matematyka, wspólne progi kamery)', () => {
  it('współczynnik przenosi refScale PONAD próg wejścia z L0 na L1', () => {
    const prog = DEFAULT_LOD_THRESHOLDS.l0Max * (1 + LOD_HYSTERESIS_MARGIN);
    for (const refScale of [0.05, 0.1203, 0.3, 0.5]) {
      const factor = zoomFactorToEnterNextLod(refScale, 0);
      expect(factor).toBeGreaterThan(1);
      expect(refScale * factor).toBeCloseTo(prog, 10);
      expect(refScale * factor).toBeGreaterThanOrEqual(prog);
    }
  });

  it('nigdy nie oddala: powyżej progu i na najwyższym poziomie zwraca 1', () => {
    expect(zoomFactorToEnterNextLod(5, 0)).toBe(1);
    expect(zoomFactorToEnterNextLod(0.1, 2)).toBe(1);
    expect(zoomFactorToEnterNextLod(0, 0)).toBe(1);
    expect(zoomFactorToEnterNextLod(Number.NaN, 0)).toBe(1);
  });

  it('próg L1→L2 czytany z TEJ SAMEJ tabeli (bez drugiego systemu progów)', () => {
    const refScale = 0.7;
    expect(refScale * zoomFactorToEnterNextLod(refScale, 1)).toBeCloseTo(
      DEFAULT_LOD_THRESHOLDS.l1Max * (1 + LOD_HYSTERESIS_MARGIN),
      10,
    );
  });
});

describe('KD-5 — klik NATYWNY w zwinięty blok GPZ rozwija widok', () => {
  it('kadr przybliża się i centruje na bloku (kamera, nie osobny tryb)', () => {
    const scene = buildSceneV3(enm, 0);
    const blok = scene.symbols.find((s) => s.symbolId === 'gpzCollapsed')!;
    expect(blok, 'blok GPZ zwinięty obecny na scenie L0').toBeTruthy();

    const { container } = render(<SldCanvasV3 snapshot={enm} width={1800} height={1100} />);
    const przed = viewBoxOf(container);
    // Widok przeglądowy: cała sieć w kadrze (świat szerszy niż viewport).
    expect(przed[2]).toBeGreaterThan(scene.bbox.width * 0.9);

    // Karta S9-4: rysunek jest bierny, więc celem kliku jest UCHWYT obiektu
    // (`sld-v3-trafienia`) — dokładnie ten węzeł, który w przeglądarce łapie
    // zdarzenie. Intencja testu („klik natywny w blok rozwija widok") bez zmian;
    // gdyby uchwyt zniknął, test byłby czerwony, tak jak przy martwym kliku.
    const wezel = container.querySelector(`[data-hit-for="${blok.meta!.testId}"][data-hit-role="obrys"]`);
    expect(wezel, 'blok GPZ ma uchwyt trafienia z własnym testId').toBeTruthy();
    fireEvent.click(wezel!);

    const po = viewBoxOf(container);
    // (1) PRZYBLIŻENIE: kadr obejmuje mniej świata niż przed klikiem.
    expect(po[2]).toBeLessThan(przed[2]);
    // (2) WYCENTROWANIE: środek bloku leży w kadrze, blisko jego środka.
    const def = SYMBOL_DEFS.gpzCollapsed;
    const srodekBloku = { x: blok.x + def.width / 2, y: blok.y + def.height / 2 };
    const srodekKadru = { x: po[0] + po[2] / 2, y: po[1] + po[3] / 2 };
    expect(Math.abs(srodekKadru.x - srodekBloku.x)).toBeLessThan(po[2] / 10);
    expect(Math.abs(srodekKadru.y - srodekBloku.y)).toBeLessThan(po[3] / 10);
  });

  it('po rozwinięciu kanwa rysuje PEŁNĄ geometrię GPZ (blok zwinięty znika)', () => {
    const scene0 = buildSceneV3(enm, 0);
    const blok = scene0.symbols.find((s) => s.symbolId === 'gpzCollapsed')!;
    const { container } = render(<SldCanvasV3 snapshot={enm} width={1800} height={1100} />);
    expect(container.querySelector(`[data-testid="${blok.meta!.testId}"]`)).toBeTruthy();

    // Karta S9-4: klik w uchwyt trafienia bloku (patrz komentarz wyżej).
    fireEvent.click(container.querySelector(`[data-hit-for="${blok.meta!.testId}"][data-hit-role="obrys"]`)!);

    // Blok zwinięty zniknął — na jego miejscu jest rozwinięty układ GPZ
    // (symbol transformatora GPZ istnieje wyłącznie od L1).
    expect(container.querySelector(`[data-testid="${blok.meta!.testId}"]`)).toBeNull();
    const trGpz = buildSceneV3(enm, 1).symbols.find(
      (s) => s.symbolId === 'transformer2W' && (s.meta?.ownerRef ?? '').startsWith('gpz/'),
    )!;
    expect(container.querySelector(`[data-testid="${trGpz.meta!.testId}"]`)).toBeTruthy();
  });

  it('klik w blok NIE psuje selekcji: handler wołającego dostaje ten sam testId/ownerRef', () => {
    const scene = buildSceneV3(enm, 0);
    const blok = scene.symbols.find((s) => s.symbolId === 'gpzCollapsed')!;
    const kliki: Array<{ testId: string; ownerRef?: string }> = [];
    const { container } = render(
      <SldCanvasV3
        snapshot={enm}
        width={1800}
        height={1100}
        onElementClick={(testId, meta) => kliki.push({ testId, ownerRef: meta?.ownerRef })}
      />,
    );
    fireEvent.click(container.querySelector(`[data-hit-for="${blok.meta!.testId}"][data-hit-role="obrys"]`)!);
    expect(kliki).toEqual([{ testId: blok.meta!.testId, ownerRef: blok.meta!.ownerRef }]);
  });

  it('REGRESJA WSTRZYKNIĘTA: klik w zwykły symbol (stacja zbiorcza) NIE zmienia kadru — rozwijanie jest cechą bloku GPZ, nie każdego kliku', () => {
    const scene = buildSceneV3(enm, 0);
    const stacja = scene.symbols.find((s) => s.symbolId === 'stationCollapsed')!;
    const { container } = render(<SldCanvasV3 snapshot={enm} width={1800} height={1100} />);
    const przed = viewBoxOf(container).join(' ');
    fireEvent.click(container.querySelector(`[data-hit-for="${stacja.meta!.testId}"][data-hit-role="obrys"]`)!);
    expect(viewBoxOf(container).join(' ')).toBe(przed);
  });
});
