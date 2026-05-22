/**
 * PR-5 — Testy LOD Policy + Layer visibility.
 *
 * Inwarianty (BINDING):
 * 1. LOD 0/1: brak masowych pomiarów, brak Q labels.
 * 2. LOD 3+: pełen detal aparatury.
 * 3. Selected obiekt może mieć LOD wyższy niż globalny.
 * 4. 13 warstw widoczności z polskimi etykietami.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LAYER_VISIBILITY,
  LAYER_LABELS_PL,
  LOD_ZOOM_THRESHOLDS,
  effectiveLodForElement,
  inferLodFromScale,
  isVisibleAtLod,
  type LodLevel,
  type SldLayerId,
} from '../lod/LodPolicy';

describe('LOD — inferLodFromScale (progi zoom)', () => {
  it('scale < 0.3 → LOD 0', () => {
    expect(inferLodFromScale(0.1)).toBe(0);
    expect(inferLodFromScale(0.2)).toBe(0);
    expect(inferLodFromScale(0.299)).toBe(0);
  });

  it('scale 0.3..0.7 → LOD 1', () => {
    expect(inferLodFromScale(0.3)).toBe(1);
    expect(inferLodFromScale(0.5)).toBe(1);
    expect(inferLodFromScale(0.69)).toBe(1);
  });

  it('scale 0.7..1.5 → LOD 2', () => {
    expect(inferLodFromScale(0.7)).toBe(2);
    expect(inferLodFromScale(1.0)).toBe(2);
    expect(inferLodFromScale(1.49)).toBe(2);
  });

  it('scale 1.5..3.0 → LOD 3', () => {
    expect(inferLodFromScale(1.5)).toBe(3);
    expect(inferLodFromScale(2.5)).toBe(3);
    expect(inferLodFromScale(2.99)).toBe(3);
  });

  it('scale ≥ 3.0 → LOD 4', () => {
    expect(inferLodFromScale(3.0)).toBe(4);
    expect(inferLodFromScale(5.0)).toBe(4);
  });
});

describe('LOD — isVisibleAtLod (BINDING — brief 1 §10)', () => {
  it('LOD 0/1: brak pomiarów ani Q labels', () => {
    expect(isVisibleAtLod('measurement', 0)).toBe(false);
    expect(isVisibleAtLod('measurement', 1)).toBe(false);
    expect(isVisibleAtLod('q_label', 0)).toBe(false);
    expect(isVisibleAtLod('q_label', 1)).toBe(false);
    expect(isVisibleAtLod('device_label', 0)).toBe(false);
    expect(isVisibleAtLod('device_label', 1)).toBe(false);
  });

  it('LOD 0: brak aparatów', () => {
    expect(isVisibleAtLod('device', 0)).toBe(false);
  });

  it('LOD 0/1: GPZ block i ciągi widoczne', () => {
    expect(isVisibleAtLod('gpz_block', 0)).toBe(true);
    expect(isVisibleAtLod('cable_run', 0)).toBe(true);
    expect(isVisibleAtLod('station_block', 0)).toBe(true);
  });

  it('LOD 2: pola SN i aparaty główne widoczne', () => {
    expect(isVisibleAtLod('bay_head', 2)).toBe(true);
    expect(isVisibleAtLod('device', 2)).toBe(true);
    expect(isVisibleAtLod('der_full', 2)).toBe(true);
  });

  it('LOD 3+: pełen detal techniczny + Q labels + pomiary', () => {
    expect(isVisibleAtLod('q_label', 3)).toBe(true);
    expect(isVisibleAtLod('device_label', 3)).toBe(true);
    expect(isVisibleAtLod('measurement', 3)).toBe(true);
    expect(isVisibleAtLod('station_internal', 3)).toBe(true);
  });

  it('alarm_marker widoczny od LOD 0 (zawsze)', () => {
    expect(isVisibleAtLod('alarm_marker', 0)).toBe(true);
    expect(isVisibleAtLod('alarm_marker', 4)).toBe(true);
  });

  it('missing_data_marker widoczny od LOD 1', () => {
    expect(isVisibleAtLod('missing_data_marker', 0)).toBe(false);
    expect(isVisibleAtLod('missing_data_marker', 1)).toBe(true);
  });
});

describe('LOD — effectiveLodForElement (selected override)', () => {
  it('selected obiekt na globalnym LOD 0 → effective LOD 3', () => {
    expect(effectiveLodForElement(0, true)).toBe(3);
  });

  it('selected obiekt na globalnym LOD 1 → effective LOD 3', () => {
    expect(effectiveLodForElement(1, true)).toBe(3);
  });

  it('selected obiekt na globalnym LOD 4 → pozostaje LOD 4', () => {
    expect(effectiveLodForElement(4, true)).toBe(4);
  });

  it('not selected obiekt zachowuje globalny LOD', () => {
    expect(effectiveLodForElement(2, false)).toBe(2);
    expect(effectiveLodForElement(0, false)).toBe(0);
  });
});

describe('Layer visibility — 14 warstw (13 z briefa + spine preview)', () => {
  it('Domyślne stany — krytyczne warstwy ON', () => {
    expect(DEFAULT_LAYER_VISIBILITY.equipment).toBe(true);
    expect(DEFAULT_LAYER_VISIBILITY.labels).toBe(true);
    expect(DEFAULT_LAYER_VISIBILITY.topology).toBe(true);
    expect(DEFAULT_LAYER_VISIBILITY.alarms).toBe(true);
    expect(DEFAULT_LAYER_VISIBILITY['missing-data']).toBe(true);
    expect(DEFAULT_LAYER_VISIBILITY.protection).toBe(true);
    expect(DEFAULT_LAYER_VISIBILITY.der).toBe(true);
  });

  it('Domyślne stany — pomiary i wyniki OFF', () => {
    expect(DEFAULT_LAYER_VISIBILITY.measurements).toBe(false);
    expect(DEFAULT_LAYER_VISIBILITY['results-pf']).toBe(false);
    expect(DEFAULT_LAYER_VISIBILITY['results-voltage']).toBe(false);
    expect(DEFAULT_LAYER_VISIBILITY['results-sc']).toBe(false);
    expect(DEFAULT_LAYER_VISIBILITY.stability).toBe(false);
  });

  it('14 warstw zdefiniowanych (13 z briefa + spine preview)', () => {
    const ids = Object.keys(DEFAULT_LAYER_VISIBILITY) as SldLayerId[];
    expect(ids.length).toBe(14);
  });

  it('Spine preview domyślnie OFF (opt-in overlay)', () => {
    expect(DEFAULT_LAYER_VISIBILITY.spine).toBe(false);
  });

  it('Każda warstwa ma polską etykietę', () => {
    const ids = Object.keys(DEFAULT_LAYER_VISIBILITY) as SldLayerId[];
    for (const id of ids) {
      expect(LAYER_LABELS_PL[id]).toBeTruthy();
      // Etykieta nie zawiera tokenów zakazanych z briefa §2
      expect(LAYER_LABELS_PL[id]).not.toMatch(/\b(?:branch|case|run|snapshot|wizard|legacy|fallback)\b/i);
    }
  });
});

describe('LOD — progi z briefa', () => {
  it('LOD_ZOOM_THRESHOLDS są monotonicznie rosnące', () => {
    expect(LOD_ZOOM_THRESHOLDS.LOD_0_MAX).toBeLessThan(LOD_ZOOM_THRESHOLDS.LOD_1_MAX);
    expect(LOD_ZOOM_THRESHOLDS.LOD_1_MAX).toBeLessThan(LOD_ZOOM_THRESHOLDS.LOD_2_MAX);
    expect(LOD_ZOOM_THRESHOLDS.LOD_2_MAX).toBeLessThan(LOD_ZOOM_THRESHOLDS.LOD_3_MAX);
  });
});

describe('LOD — fuzz inferLodFromScale wszystkich progów', () => {
  it('100 losowych skal mapuje się na 5 dyskretnych LOD-ów', () => {
    const lods = new Set<LodLevel>();
    for (let i = 0; i < 100; i++) {
      const scale = Math.random() * 5;
      lods.add(inferLodFromScale(scale));
    }
    // Powinniśmy zobaczyć większość 5 LOD-ów (przy 100 próbach)
    expect(lods.size).toBeGreaterThanOrEqual(3);
  });
});
