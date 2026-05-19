/**
 * Phase 0A — Histereza LOD + debounce.
 *
 * Acceptance Invariant nr 6: LOD zmienia tylko szczegół wizualny — przejścia
 * między LOD muszą być stabilne (brak migotania na granicy progów).
 */

import { describe, expect, it } from 'vitest';

import {
  LOD_LEVEL_LABELS_PL,
  LOD_ZOOM_THRESHOLDS,
  createLodController,
  inferLodFromScale,
  isVisibleAtLod,
  type LodElementKind,
  type LodLevel,
} from '../LodPolicy';

const LOD_ELEMENT_KINDS: readonly LodElementKind[] = [
  'gpz_block',
  'section',
  'bay_head',
  'device',
  'device_label',
  'cable_run',
  'station_block',
  'station_internal',
  'der_marker',
  'der_full',
  'measurement',
  'q_label',
  'missing_data_marker',
  'alarm_marker',
  'nop_marker',
  'mini_block_overview',
  'mini_block_compact',
  'mini_block_detail',
  'gpz_switchgear',
  'der_sub_tree',
];

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
    const now = 1000;
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
    const _now = 1000;
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

  it('tryb kanwy projektowej przełącza LOD natychmiast po przekroczeniu progów', () => {
    const ctrl = createLodController({
      initialScale: 0.22,
      hysteresisMargin: 0,
      debounceMs: 0,
      nowProvider: () => 0,
    });

    expect(ctrl.update(0.22, 0)).toBe(0);
    expect(ctrl.update(0.297, 1)).toBe(0);
    expect(ctrl.update(0.401, 2)).toBe(1);
    expect(ctrl.update(0.72, 3)).toBe(2);
    expect(ctrl.update(1.6, 4)).toBe(3);
    expect(ctrl.update(3.2, 5)).toBe(4);
    expect(ctrl.update(0.2, 6)).toBe(0);
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

  it('duzy skok auto-fit z LOD 2 do LOD 0 synchronizuje LOD natychmiast', () => {
    const ctrl = createLodController({
      initialScale: 1.0,
      hysteresisMargin: 0.15,
      debounceMs: 250,
      nowProvider: () => 1000,
    });
    expect(ctrl.getLod()).toBe(2);
    expect(ctrl.update(0.2, 1000)).toBe(0);
    expect(ctrl.getLod()).toBe(0);
  });

  it('LodLevel typ przyjmuje 0..4', () => {
    const samples: LodLevel[] = [0, 1, 2, 3, 4];
    expect(samples.length).toBe(5);
  });

  it('etykiety LOD opisuja narastajacy zakres projektu', () => {
    expect(LOD_LEVEL_LABELS_PL).toEqual({
      0: 'Topologia sieci',
      1: 'Odcinki i kierunki zasilania',
      2: 'Stacje, długości i moce',
      3: 'Pola, aparatura i zabezpieczenia',
      4: 'Pomiary, nastawy i dowody',
    });
  });

  it('widocznosc elementow jest monotoniczna wraz z przyblizeniem', () => {
    const levels: readonly LodLevel[] = [0, 1, 2, 3, 4];
    for (const kind of LOD_ELEMENT_KINDS) {
      let wasVisible = false;
      for (const lod of levels) {
        const visible = isVisibleAtLod(kind, lod);
        if (wasVisible) {
          expect(visible, `${kind} must stay visible at LOD ${lod}`).toBe(true);
        }
        wasVisible = wasVisible || visible;
      }
    }
  });

  it('wnioskowanie LOD ze skali jest niemalejace', () => {
    const samples = [0.05, 0.1, 0.29, 0.3, 0.5, 0.69, 0.7, 1.0, 1.49, 1.5, 2.0, 2.99, 3.0, 5.0];
    const levels = samples.map(inferLodFromScale);
    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i]).toBeGreaterThanOrEqual(levels[i - 1]);
    }
  });
});
