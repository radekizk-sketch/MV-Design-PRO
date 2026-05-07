/**
 * Phase 0A — Histereza LOD + debounce.
 *
 * Acceptance Invariant nr 6: LOD zmienia tylko szczegół wizualny — przejścia
 * między LOD muszą być stabilne (brak migotania na granicy progów).
 */

import { describe, expect, it } from 'vitest';

import {
  LOD_ZOOM_THRESHOLDS,
  createLodController,
  inferLodFromScale,
  type LodLevel,
} from '../LodPolicy';

describe('createLodController — histereza zapobiega migotaniu', () => {
  it('bouncing zoom między 0.68 a 0.72 (próg 0.7 dla LOD 1↔2) → brak zmiany LOD', () => {
    const ctrl = createLodController({
      initialScale: 0.68,
      hysteresisMargin: 0.15,
      debounceMs: 0,
      nowProvider: () => 0,
    });
    const sequence = [0.68, 0.72, 0.68, 0.72, 0.68, 0.72, 0.68, 0.72, 0.68, 0.72];
    const initialLod = ctrl.getLod();
    for (const scale of sequence) {
      ctrl.update(scale);
    }
    expect(ctrl.getLod()).toBe(initialLod);
  });

  it('przekroczenie progu z marginesem 15% wymusza zmianę LOD', () => {
    const ctrl = createLodController({
      initialScale: 0.5,
      hysteresisMargin: 0.15,
      debounceMs: 0,
      nowProvider: () => 0,
    });
    expect(ctrl.getLod()).toBe(1);
    // Próg LOD 1 → LOD 2 to 0.7. Z marginesem 15% = 0.805.
    ctrl.update(0.81);
    expect(ctrl.getLod()).toBe(2);
  });

  it('debounce 250ms blokuje zmianę przed upływem czasu', () => {
    let now = 1000;
    const ctrl = createLodController({
      initialScale: 0.5,
      hysteresisMargin: 0.15,
      debounceMs: 250,
      nowProvider: () => now,
    });
    expect(ctrl.getLod()).toBe(1);
    // Skok do scale wymuszającego LOD 2 (0.81 > 0.7 * 1.15 = 0.805).
    ctrl.update(0.81, 1000);
    expect(ctrl.getLod()).toBe(1); // jeszcze przed debounce
    ctrl.update(0.81, 1100);
    expect(ctrl.getLod()).toBe(1); // 100ms < 250ms
    ctrl.update(0.81, 1300);
    expect(ctrl.getLod()).toBe(2); // 300ms ≥ 250ms
  });

  it('powrót przed upływem debounce anuluje przejście', () => {
    let _now = 1000;
    const ctrl = createLodController({
      initialScale: 0.5,
      hysteresisMargin: 0.15,
      debounceMs: 250,
      nowProvider: () => _now,
    });
    expect(ctrl.getLod()).toBe(1);
    ctrl.update(0.81, 1000); // pending → LOD 2
    ctrl.update(0.6, 1100); // anuluje pending — wraca do LOD 1
    ctrl.update(0.6, 2000); // długi czas, ale LOD nie powinien się zmienić bo scale w LOD 1
    expect(ctrl.getLod()).toBe(1);
  });

  it('reset usuwa pending i ustawia LOD na nowy scale', () => {
    const ctrl = createLodController({
      initialScale: 0.5,
      hysteresisMargin: 0.15,
      debounceMs: 250,
      nowProvider: () => 0,
    });
    ctrl.update(2.0, 0);
    expect(ctrl.getLod()).toBe(1); // pending, ale debounce nie minął
    ctrl.reset(2.0);
    expect(ctrl.getLod()).toBe(3); // 2.0 mieści się w LOD 3 (próg LOD_2_MAX=1.5, LOD_3_MAX=3.0)
  });

  it('inferLodFromScale spójny z thresholds', () => {
    expect(inferLodFromScale(0.1)).toBe(0);
    expect(inferLodFromScale(0.5)).toBe(1);
    expect(inferLodFromScale(1.0)).toBe(2);
    expect(inferLodFromScale(2.0)).toBe(3);
    expect(inferLodFromScale(5.0)).toBe(4);
  });

  it('LOD_ZOOM_THRESHOLDS są monotoniczne', () => {
    expect(LOD_ZOOM_THRESHOLDS.LOD_0_MAX).toBeLessThan(LOD_ZOOM_THRESHOLDS.LOD_1_MAX);
    expect(LOD_ZOOM_THRESHOLDS.LOD_1_MAX).toBeLessThan(LOD_ZOOM_THRESHOLDS.LOD_2_MAX);
    expect(LOD_ZOOM_THRESHOLDS.LOD_2_MAX).toBeLessThan(LOD_ZOOM_THRESHOLDS.LOD_3_MAX);
  });

  it('controller getter API zwraca zgodne dane', () => {
    const ctrl = createLodController({ initialScale: 1.2 });
    expect(ctrl.getScale()).toBe(1.2);
    expect(ctrl.getLod()).toBe(2);
    ctrl.update(0.4, 0);
    expect(ctrl.getScale()).toBe(0.4);
  });

  it('histereza jest symetryczna — przy spadku scale z LOD 2 do LOD 1', () => {
    const ctrl = createLodController({
      initialScale: 1.0,
      hysteresisMargin: 0.15,
      debounceMs: 0,
      nowProvider: () => 0,
    });
    expect(ctrl.getLod()).toBe(2);
    // Próg dolny dla LOD 2 = LOD_1_MAX = 0.7. Z marginesem 15% = 0.595.
    ctrl.update(0.6); // > 0.595 — nie spada
    expect(ctrl.getLod()).toBe(2);
    ctrl.update(0.59); // < 0.595 — spada
    expect(ctrl.getLod()).toBe(1);
  });

  it('LodLevel typ przyjmuje 0..4', () => {
    const samples: LodLevel[] = [0, 1, 2, 3, 4];
    expect(samples.length).toBe(5);
  });
});
