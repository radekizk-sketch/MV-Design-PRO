/**
 * SldCanvasV2 — DOWÓD GĘSTOŚCI na poziomie kanwy (M-08).
 *
 * Renderuje kanwę z wieloma stacjami na L0 (przegląd) vs L2 (szczegół) i liczy
 * faktycznie wyrenderowane elementy detalu w DOM. Na L0 stacje to czytelne BLOKI
 * (nazwa + status), więc liczba markerów aparatury/mini-RMU ≪ niż na L2.
 *
 * To weryfikuje STRUKTURALNY fix gęstości: detal niższego poziomu nie istnieje w
 * DOM na L0 (nie jest tylko ukrywany przez collision-avoidance).
 *
 * @see docs/sld/SLD_GEOMETRY_CONTRACT_V1.md §7
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import { SldCanvasV2 } from '../SldCanvasV2';
import type { StationOnRunRendererProps } from '../../renderer/StationOnRunRenderer';

afterEach(() => cleanup());

/** Zbuduj N stacji rozłożonych w poziomie (każda z aparaturą/polami). */
function buildStations(n: number): StationOnRunRendererProps[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `st-${i}`,
    x: 120 + i * 160,
    y: 300,
    name: `Stacja ${i}`,
    topologicalType: 'przelotowa' as const,
    stationCode: `S${String(i).padStart(2, '0')}`,
    snBays: [
      { bayRef: `st-${i}/we`, fieldRole: 'LINE_IN' as const, designation: 'WE', hasMissingRequiredDevice: false },
      { bayRef: `st-${i}/wy`, fieldRole: 'LINE_OUT' as const, designation: 'WY', hasMissingRequiredDevice: false },
      { bayRef: `st-${i}/tr`, fieldRole: 'TRANSFORMER' as const, designation: 'TR', hasMissingRequiredDevice: false },
    ],
    hasTransformer: true,
    transformerRatedKva: 630,
    nnFeedersCount: 2,
    derBadges: [],
  }));
}

const STATION_COUNT = 30;
const BASE_PROPS = {
  width: 1600,
  height: 900,
  gpzs: [],
  sections: [],
  cableRuns: [],
  ders: [],
} as const;

/** Liczba markerów detalu stacji (mini-RMU + symbole aparatury) w DOM. */
function detailMarkerCount(container: HTMLElement): number {
  return (
    container.querySelectorAll('[data-testid^="sld-v2-mini-rmu-"]').length +
    container.querySelectorAll('[data-testid^="sld-symbol-transformer-"]').length +
    container.querySelectorAll('[data-lod-variant="compact"]').length
  );
}

/** Liczba bloków przeglądowych (L0). */
function overviewBlockCount(container: HTMLElement): number {
  return container.querySelectorAll('[data-testid^="sld-v2-station-overview-block-"]').length;
}

describe('SldCanvasV2 — density: L0 render-count ≪ L2 (M-08)', () => {
  it('L0 renderuje stacje jako BLOKI, bez mini-RMU/aparatury', () => {
    const stations = buildStations(STATION_COUNT);
    const { container } = render(
      <SldCanvasV2 {...BASE_PROPS} stations={stations} lodOverride={0} />,
    );
    // Wszystkie stacje jako bloki…
    expect(overviewBlockCount(container)).toBe(STATION_COUNT);
    // …i ZERO markerów detalu (mini-RMU/transformatory) — to fix gęstości.
    expect(detailMarkerCount(container)).toBe(0);
  });

  it('L2 renderuje pełny detal stacji (mini-RMU/aparatura), bez bloków przeglądowych', () => {
    const stations = buildStations(STATION_COUNT);
    const { container } = render(
      <SldCanvasV2 {...BASE_PROPS} stations={stations} lodOverride={3} />,
    );
    expect(overviewBlockCount(container)).toBe(0);
    // Pełny detal: po jednym mini-RMU na stację (co najmniej).
    expect(detailMarkerCount(container)).toBeGreaterThanOrEqual(STATION_COUNT);
  });

  it('drastyczny spadek gęstości: detal na L0 ≪ detal na L2', () => {
    const stations = buildStations(STATION_COUNT);
    const l0 = render(<SldCanvasV2 {...BASE_PROPS} stations={stations} lodOverride={0} />);
    const l0Detail = detailMarkerCount(l0.container);
    cleanup();
    const l2 = render(<SldCanvasV2 {...BASE_PROPS} stations={stations} lodOverride={3} />);
    const l2Detail = detailMarkerCount(l2.container);

    expect(l0Detail).toBe(0);
    expect(l2Detail).toBeGreaterThan(0);
    // L0 to ułamek L2 (tutaj: zero) — gęstość spada strukturalnie.
    expect(l0Detail).toBeLessThan(l2Detail);
  });

  it('zaznaczona stacja na L0 pokazuje detal (override poziomu, §7)', () => {
    const stations = buildStations(STATION_COUNT);
    const { container } = render(
      <SldCanvasV2 {...BASE_PROPS} stations={stations} selectedId="st-5" lodOverride={0} />,
    );
    // Zaznaczona stacja NIE jest blokiem…
    expect(container.querySelector('[data-testid="sld-v2-station-overview-block-st-5"]')).toBeNull();
    // …a pozostałe wciąż są blokami (gęstość utrzymana).
    expect(overviewBlockCount(container)).toBe(STATION_COUNT - 1);
  });
});
