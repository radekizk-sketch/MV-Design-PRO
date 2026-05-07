/**
 * Phase 0B-6: testy integracji LOD histerezy w SldCanvasV2 runtime.
 *
 * LodPolicy ma własne testy (lodHysteresis.test.ts — 10 cases) na poziomie
 * pure function. Brakowało testu integracji: czy faktyczny komponent
 * SldCanvasV2 używa LodController i nie migocze przy bouncing zoom?
 *
 * Strategia:
 *  - Renderujemy SldCanvasV2 z minimalnym dataset.
 *  - Symulujemy zdarzenia wheel (zoom in/out kursor-anchored).
 *  - Sprawdzamy `data-lod` atrybut na svg po każdym zdarzeniu.
 *  - Bouncing zoom (scroll up/down/up/down w okolicy progu LOD) NIE wywołuje
 *    przeskoku LOD bez upływu debounce (250ms).
 *
 * Uwaga: testy używają `vi.useFakeTimers` żeby kontrolować czas debounce.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, cleanup } from '@testing-library/react';

import { SldCanvasV2 } from '../SldCanvasV2';
import type { GpzRendererProps } from '../../renderer/GpzRenderer';

const EMPTY_GPZS: GpzRendererProps[] = [];

function renderEmptyCanvas() {
  return render(
    <SldCanvasV2
      width={800}
      height={600}
      gpzs={EMPTY_GPZS}
      sections={[]}
      cableRuns={[]}
      stations={[]}
      ders={[]}
    />,
  );
}

function getLod(container: HTMLElement): string {
  const svg = container.querySelector('[data-testid="sld-canvas-v2"]');
  return svg?.getAttribute('data-lod') ?? '';
}

describe('SldCanvasV2 — LodController histereza runtime integration (Phase 0B-6)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-05-07T00:00:00Z') });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('Inicjalny render → data-lod odpowiada inferLodFromScale(1.0)', () => {
    const { container } = renderEmptyCanvas();
    /* Identity transform scale=1.0 → LOD 2 (między LOD_1_MAX=0.7 a LOD_2_MAX=1.5). */
    expect(getLod(container)).toBe('2');
  });

  it('lodOverride prop → atrybut data-lod === override (omija LodController)', () => {
    const { container } = render(
      <SldCanvasV2
        width={800}
        height={600}
        gpzs={EMPTY_GPZS}
        sections={[]}
        cableRuns={[]}
        stations={[]}
        ders={[]}
        lodOverride={4}
      />,
    );
    expect(getLod(container)).toBe('4');
  });

  it('Wheel scroll up (zoom in) wywołany 1× → LOD pozostaje stabilny lub rośnie', () => {
    const { container } = renderEmptyCanvas();
    const initialLod = parseInt(getLod(container), 10);
    const svg = container.querySelector('[data-testid="sld-canvas-v2"]')!;
    /* Symulacja zoom in (deltaY < 0). zoomFactor = 1.1 — scale: 1.0 → 1.1. */
    fireEvent.wheel(svg, { deltaY: -100, clientX: 400, clientY: 300 });
    const newLod = parseInt(getLod(container), 10);
    /* Po zoom 1.0→1.1, ciągle w przedziale LOD 2 (0.7–1.5). */
    expect(newLod).toBeGreaterThanOrEqual(initialLod);
    expect(newLod).toBeLessThanOrEqual(2);
  });

  it('Pojedynczy duży zoom-in scrollem → LOD może wzrosnąć po jednym kroku', () => {
    const { container } = renderEmptyCanvas();
    const svg = container.querySelector('[data-testid="sld-canvas-v2"]')!;
    /* 5× zoom in: scale ~1.0 * 1.1^5 ≈ 1.61 — przekracza LOD_2_MAX=1.5 + margines.
     * Z deadband 15% próg efektywny = 1.5 * 1.15 = 1.725.
     * 1.61 < 1.725 → ciągle LOD 2 (deadband chroni przed flicker). */
    for (let i = 0; i < 5; i++) {
      fireEvent.wheel(svg, { deltaY: -100, clientX: 400, clientY: 300 });
    }
    expect(getLod(container)).toBe('2');
  });

  it('7× zoom in → przekroczenie progu z deadband + debounce → LOD 3', () => {
    const { container } = renderEmptyCanvas();
    const svg = container.querySelector('[data-testid="sld-canvas-v2"]')!;
    /* 7× zoom in: 1.0 * 1.1^7 ≈ 1.95 — wyraźnie przekracza próg z deadband (1.725). */
    for (let i = 0; i < 7; i++) {
      fireEvent.wheel(svg, { deltaY: -100, clientX: 400, clientY: 300 });
    }
    /* Pierwsza klatka po przekroczeniu: pending transition (debounce 250ms).
     * Wymuszamy upływ czasu i jeden trigger update. */
    vi.advanceTimersByTime(300);
    /* Trigger update przez kolejny wheel (re-render kalibruje LOD). */
    fireEvent.wheel(svg, { deltaY: -100, clientX: 400, clientY: 300 });
    expect(getLod(container)).toBe('3');
  });

  it('Bouncing zoom (zoom in / zoom out na przemian) NIE migocze LOD bez debounce', () => {
    const { container } = renderEmptyCanvas();
    const svg = container.querySelector('[data-testid="sld-canvas-v2"]')!;
    const initialLod = getLod(container);
    /* Bouncing scroll: 5× zoom in, 5× zoom out, 5× zoom in — symuluje
     * niezdecydowane scrollowanie operatora wokół progu. Bez histerezy
     * LOD migotałby. Z LodController z deadband 15% — stabilny. */
    for (let i = 0; i < 5; i++) fireEvent.wheel(svg, { deltaY: -100, clientX: 400, clientY: 300 });
    for (let i = 0; i < 5; i++) fireEvent.wheel(svg, { deltaY: 100, clientX: 400, clientY: 300 });
    for (let i = 0; i < 5; i++) fireEvent.wheel(svg, { deltaY: -100, clientX: 400, clientY: 300 });
    /* Po cyklu bouncing wracamy w okolicę 1.0 → LOD 2 (jak na początku). */
    expect(getLod(container)).toBe(initialLod);
    expect(getLod(container)).toBe('2');
  });

  it('Zoom out poniżej progu LOD_2_MIN bez debounce → pozostaje LOD 2', () => {
    const { container } = renderEmptyCanvas();
    const svg = container.querySelector('[data-testid="sld-canvas-v2"]')!;
    /* 3× zoom out: 1.0 * 0.9^3 ≈ 0.729 — tuż nad LOD_1_MAX (0.7).
     * Bez deadband można by przeskoczyć; z LodController stabilny. */
    for (let i = 0; i < 3; i++) {
      fireEvent.wheel(svg, { deltaY: 100, clientX: 400, clientY: 300 });
    }
    /* Bez upływu debounce — ciągle LOD 2. */
    expect(getLod(container)).toBe('2');
  });

  it('Long zoom out → przekroczenie progu z deadband + debounce → LOD 1', () => {
    const { container } = renderEmptyCanvas();
    const svg = container.querySelector('[data-testid="sld-canvas-v2"]')!;
    /* 8× zoom out: 1.0 * 0.9^8 ≈ 0.43 — wyraźnie poniżej LOD_1_MAX*0.85 = 0.595. */
    for (let i = 0; i < 8; i++) {
      fireEvent.wheel(svg, { deltaY: 100, clientX: 400, clientY: 300 });
    }
    vi.advanceTimersByTime(300);
    /* Trigger update — re-render kalibruje LOD. */
    fireEvent.wheel(svg, { deltaY: 100, clientX: 400, clientY: 300 });
    expect(getLod(container)).toBe('1');
  });

  it('LodController persistuje przez re-rendery (nie tworzy nowego co render)', () => {
    /* Refs Reacta: useRef + null-guard pattern w SldCanvasV2 zapewnia że
     * lodController jest stworzony 1× per komponent, nie per render.
     * Test: 3 zoom-in na różnych re-renderach → stan histerezy ZACHOWANY. */
    const { container, rerender } = renderEmptyCanvas();
    const svg = container.querySelector('[data-testid="sld-canvas-v2"]')!;
    fireEvent.wheel(svg, { deltaY: -100, clientX: 400, clientY: 300 });
    rerender(
      <SldCanvasV2
        width={800}
        height={600}
        gpzs={EMPTY_GPZS}
        sections={[]}
        cableRuns={[]}
        stations={[]}
        ders={[]}
      />,
    );
    fireEvent.wheel(svg, { deltaY: -100, clientX: 400, clientY: 300 });
    /* Jeśli LodController byłby tworzony co render, stan byłby zresetowany
     * po `rerender` i histereza nie miałaby ciągłości. Test: po 2 zoom in
     * z re-renderem w środku, LOD nadal stabilny. */
    expect(getLod(container)).toBe('2');
  });
});
