/**
 * layerToggle tests — P0.6 F3 foundation (13 layer toggle).
 */

import { describe, expect, it } from 'vitest';

import type { LodLevel } from '../LodPolicy';
import {
  LAYER_IDS,
  LAYER_LABELS_PL,
  createInitialLayerState,
  isLayerVisible,
  isLayerVisibleByDefault,
  listLayersWithVisibility,
  resetAllLayers,
  resetLayerToDefault,
  setLayerVisibility,
  toggleLayer,
} from '../layerToggle';

const LOD_0: LodLevel = 0;
const LOD_2: LodLevel = 2;
const LOD_3: LodLevel = 3;
const LOD_4: LodLevel = 4;

describe('LAYER_IDS — contract', () => {
  it('exposes exactly 13 layers per SLD_INDUSTRIAL_SPEC § 5.2', () => {
    expect(LAYER_IDS.length).toBe(13);
  });

  it('all required layers present', () => {
    const required = [
      'power',
      'control',
      'protection',
      'metering',
      'annotations',
      'dimensions',
      'results-overlay',
      'fault-flow',
      'power-flow',
      'grid',
      'ports',
      'boundaries',
      'legend',
    ];
    for (const layer of required) {
      expect(LAYER_IDS).toContain(layer);
    }
  });

  it('all layers have polish labels', () => {
    for (const id of LAYER_IDS) {
      expect(LAYER_LABELS_PL[id]).toBeTruthy();
      // Polish characters present in at least some labels
    }
    expect(LAYER_LABELS_PL.power).toBe('Obwód mocy');
    expect(LAYER_LABELS_PL.protection).toBe('Zabezpieczenia');
  });
});

describe('createInitialLayerState', () => {
  it('all overrides set to null (use LOD defaults)', () => {
    const state = createInitialLayerState();
    for (const id of LAYER_IDS) {
      expect(state.overrides[id]).toBeNull();
    }
  });
});

describe('isLayerVisibleByDefault — LOD thresholds', () => {
  it('power visible at all LODs (critical)', () => {
    for (const lod of [LOD_0, LOD_2, LOD_3, LOD_4] as LodLevel[]) {
      expect(isLayerVisibleByDefault('power', lod)).toBe(true);
    }
  });

  it('annotations visible at all LODs', () => {
    expect(isLayerVisibleByDefault('annotations', LOD_0)).toBe(true);
  });

  it('legend visible at all LODs', () => {
    expect(isLayerVisibleByDefault('legend', LOD_0)).toBe(true);
  });

  it('protection visible from LOD-2', () => {
    expect(isLayerVisibleByDefault('protection', LOD_0)).toBe(false);
    expect(isLayerVisibleByDefault('protection', LOD_2)).toBe(true);
  });

  it('results-overlay visible from LOD-2', () => {
    expect(isLayerVisibleByDefault('results-overlay', LOD_0)).toBe(false);
    expect(isLayerVisibleByDefault('results-overlay', LOD_2)).toBe(true);
  });

  it('boundaries visible from LOD-3', () => {
    expect(isLayerVisibleByDefault('boundaries', LOD_2)).toBe(false);
    expect(isLayerVisibleByDefault('boundaries', LOD_3)).toBe(true);
  });

  it('grid only at LOD-4 (diagnostic)', () => {
    expect(isLayerVisibleByDefault('grid', LOD_3)).toBe(false);
    expect(isLayerVisibleByDefault('grid', LOD_4)).toBe(true);
  });

  it('ports debug only at LOD-4', () => {
    expect(isLayerVisibleByDefault('ports', LOD_3)).toBe(false);
    expect(isLayerVisibleByDefault('ports', LOD_4)).toBe(true);
  });
});

describe('toggleLayer + isLayerVisible', () => {
  it('toggles power layer off (originally on)', () => {
    const initial = createInitialLayerState();
    expect(isLayerVisible(initial, 'power', LOD_2)).toBe(true);
    const next = toggleLayer(initial, 'power', LOD_2);
    expect(isLayerVisible(next, 'power', LOD_2)).toBe(false);
  });

  it('toggles grid layer on at LOD-2 (originally off)', () => {
    const initial = createInitialLayerState();
    expect(isLayerVisible(initial, 'grid', LOD_2)).toBe(false);
    const next = toggleLayer(initial, 'grid', LOD_2);
    expect(isLayerVisible(next, 'grid', LOD_2)).toBe(true);
  });

  it('toggle preserves immutability', () => {
    const initial = createInitialLayerState();
    const next = toggleLayer(initial, 'power', LOD_2);
    // Initial state unchanged
    expect(initial.overrides.power).toBeNull();
    // Next state has explicit override
    expect(next.overrides.power).toBe(false);
  });

  it('double toggle returns to default behavior', () => {
    const initial = createInitialLayerState();
    const once = toggleLayer(initial, 'power', LOD_2);
    const twice = toggleLayer(once, 'power', LOD_2);
    // After 2 toggles: explicit value flipped twice → back to true
    // Note: override is true (not null) — explicit override persisted
    expect(isLayerVisible(twice, 'power', LOD_2)).toBe(true);
  });
});

describe('setLayerVisibility + resetLayerToDefault', () => {
  it('explicit set overrides LOD default', () => {
    const state = setLayerVisibility(createInitialLayerState(), 'grid', true);
    expect(isLayerVisible(state, 'grid', LOD_0)).toBe(true);
    expect(isLayerVisible(state, 'grid', LOD_4)).toBe(true);
  });

  it('explicit false hides layer that would be visible by default', () => {
    const state = setLayerVisibility(createInitialLayerState(), 'power', false);
    expect(isLayerVisible(state, 'power', LOD_2)).toBe(false);
  });

  it('reset clears override', () => {
    let state = setLayerVisibility(createInitialLayerState(), 'power', false);
    expect(state.overrides.power).toBe(false);
    state = resetLayerToDefault(state, 'power');
    expect(state.overrides.power).toBeNull();
    expect(isLayerVisible(state, 'power', LOD_2)).toBe(true);
  });
});

describe('resetAllLayers', () => {
  it('clears all overrides back to null', () => {
    let state = setLayerVisibility(createInitialLayerState(), 'power', false);
    state = setLayerVisibility(state, 'grid', true);
    state = setLayerVisibility(state, 'ports', true);
    // 3 overrides set
    expect(state.overrides.power).toBe(false);
    expect(state.overrides.grid).toBe(true);
    expect(state.overrides.ports).toBe(true);
    const reset = resetAllLayers();
    for (const id of LAYER_IDS) {
      expect(reset.overrides[id]).toBeNull();
    }
  });
});

describe('listLayersWithVisibility', () => {
  it('returns all 13 layers with visibility', () => {
    const state = createInitialLayerState();
    const list = listLayersWithVisibility(state, LOD_2);
    expect(list).toHaveLength(13);
    for (const item of list) {
      expect(item.id).toBeTruthy();
      expect(item.label).toBeTruthy();
      expect(typeof item.visible).toBe('boolean');
      expect(typeof item.overridden).toBe('boolean');
    }
  });

  it('overridden flag set after explicit toggle', () => {
    let state = createInitialLayerState();
    state = setLayerVisibility(state, 'protection', false);
    const list = listLayersWithVisibility(state, LOD_2);
    const protection = list.find((l) => l.id === 'protection')!;
    expect(protection.overridden).toBe(true);
    expect(protection.visible).toBe(false);

    const power = list.find((l) => l.id === 'power')!;
    expect(power.overridden).toBe(false);
    expect(power.visible).toBe(true);
  });

  it('list order matches LAYER_IDS', () => {
    const state = createInitialLayerState();
    const list = listLayersWithVisibility(state, LOD_2);
    expect(list.map((l) => l.id)).toEqual([...LAYER_IDS]);
  });

  it('visibility reflects current LOD', () => {
    const state = createInitialLayerState();
    const lod0List = listLayersWithVisibility(state, LOD_0);
    const lod4List = listLayersWithVisibility(state, LOD_4);
    // LOD-0: minimal layers visible
    expect(lod0List.find((l) => l.id === 'grid')!.visible).toBe(false);
    expect(lod0List.find((l) => l.id === 'protection')!.visible).toBe(false);
    expect(lod0List.find((l) => l.id === 'power')!.visible).toBe(true);
    // LOD-4: everything visible (diagnostic mode)
    expect(lod4List.find((l) => l.id === 'grid')!.visible).toBe(true);
    expect(lod4List.find((l) => l.id === 'ports')!.visible).toBe(true);
    expect(lod4List.find((l) => l.id === 'boundaries')!.visible).toBe(true);
  });
});

describe('Determinism', () => {
  it('same operations sequence → identical state', () => {
    const seq = (start: ReturnType<typeof createInitialLayerState>) => {
      let s = start;
      s = toggleLayer(s, 'power', LOD_2);
      s = setLayerVisibility(s, 'grid', true);
      s = resetLayerToDefault(s, 'protection');
      return s;
    };
    const a = seq(createInitialLayerState());
    const b = seq(createInitialLayerState());
    expect(a).toEqual(b);
  });

  it('listLayersWithVisibility deterministic', () => {
    const state = setLayerVisibility(createInitialLayerState(), 'grid', true);
    const a = listLayersWithVisibility(state, LOD_2);
    const b = listLayersWithVisibility(state, LOD_2);
    expect(a).toEqual(b);
  });
});
