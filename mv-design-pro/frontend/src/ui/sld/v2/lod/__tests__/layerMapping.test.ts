/**
 * layerMapping testy — most między LayerId (UX) a SldLayerId (renderer).
 *
 * Pokrycie:
 * 1. LAYER_RENDER_MAPPING zawiera wszystkie LayerId
 * 2. Każdy render layer mapowany do user-controlled jest w USER_CONTROLLED_RENDER_LAYERS
 * 3. mapLayerStateToRenderVisibility: 1:1 mapping (power → equipment)
 * 4. mapLayerStateToRenderVisibility: 1:N mapping (results-overlay → 3 layers)
 * 5. OR logic: results-overlay LUB power-flow włącza results-pf
 * 6. Internal layers (alarms, der) nie są w wyniku
 * 7. spine: off domyślnie, włączany przez toggle
 */
import { describe, expect, it } from 'vitest';
import { LAYER_IDS, createInitialLayerState, setLayerVisibility, type LayerId } from '../layerToggle';
import {
  LAYER_RENDER_MAPPING,
  USER_CONTROLLED_RENDER_LAYERS,
  mapLayerStateToRenderVisibility,
} from '../layerMapping';
import type { LodLevel } from '../LodPolicy';

const LOD_2: LodLevel = 2;

describe('LAYER_RENDER_MAPPING — contract', () => {
  it('Każdy LayerId ma mapowanie w LAYER_RENDER_MAPPING', () => {
    for (const id of LAYER_IDS) {
      expect(LAYER_RENDER_MAPPING[id], `Brak mapowania dla ${id}`).toBeDefined();
      expect(LAYER_RENDER_MAPPING[id].length, `Puste mapowanie dla ${id}`).toBeGreaterThan(0);
    }
  });

  it('Spine mapuje 1:1 na warstwę renderera spine', () => {
    expect(LAYER_RENDER_MAPPING.spine).toEqual(['spine']);
  });

  it('Results-overlay mapuje 1:N na 4 warstwy renderera (3 results-* + stability)', () => {
    expect(LAYER_RENDER_MAPPING['results-overlay']).toEqual([
      'results-pf',
      'results-voltage',
      'results-sc',
      'stability',
    ]);
  });

  it('Power mapuje na equipment + der (DER są częścią obwodu mocy)', () => {
    expect(LAYER_RENDER_MAPPING.power).toEqual(['equipment', 'der']);
  });

  it('USER_CONTROLLED_RENDER_LAYERS zawiera wszystkie 14 warstw renderera', () => {
    const allRenderLayers: readonly string[] = [
      'equipment',
      'labels',
      'ports',
      'measurements',
      'results-pf',
      'results-voltage',
      'results-sc',
      'stability',
      'missing-data',
      'protection',
      'der',
      'topology',
      'alarms',
      'spine',
    ];
    expect(USER_CONTROLLED_RENDER_LAYERS.size).toBe(14);
    for (const layer of allRenderLayers) {
      expect(USER_CONTROLLED_RENDER_LAYERS.has(layer as never), `Missing: ${layer}`).toBe(true);
    }
  });
});

describe('mapLayerStateToRenderVisibility', () => {
  it('Initial state: power=ON → equipment=ON', () => {
    const state = createInitialLayerState();
    const vis = mapLayerStateToRenderVisibility(state, LOD_2);
    expect(vis.equipment).toBe(true);
  });

  it('Initial state: spine=OFF (opt-in) → spine=false', () => {
    const state = createInitialLayerState();
    const vis = mapLayerStateToRenderVisibility(state, LOD_2);
    expect(vis.spine).toBe(false);
  });

  it('Toggle spine ON → spine=true', () => {
    const state = setLayerVisibility(createInitialLayerState(), 'spine', true);
    const vis = mapLayerStateToRenderVisibility(state, LOD_2);
    expect(vis.spine).toBe(true);
  });

  it('Wynik zawiera tylko user-controlled warstwy', () => {
    const state = createInitialLayerState();
    const vis = mapLayerStateToRenderVisibility(state, LOD_2);
    const keys = Object.keys(vis);
    for (const key of keys) {
      expect(USER_CONTROLLED_RENDER_LAYERS.has(key as never)).toBe(true);
    }
  });

  it('Initial state LOD 2: power=ON → der=ON (DER mapowane przez power)', () => {
    const state = createInitialLayerState();
    const vis = mapLayerStateToRenderVisibility(state, LOD_2);
    expect(vis.der).toBe(true);
  });

  it('Initial state LOD 2: results-overlay=ON → stability=ON (mapowane przez results-overlay)', () => {
    const state = createInitialLayerState();
    const vis = mapLayerStateToRenderVisibility(state, LOD_2);
    expect(vis.stability).toBe(true);
  });

  it('annotations=ON → missing-data=ON', () => {
    const state = createInitialLayerState();
    const vis = mapLayerStateToRenderVisibility(state, LOD_2);
    expect(vis['missing-data']).toBe(true);
  });

  it('boundaries=ON → alarms=ON', () => {
    const state = setLayerVisibility(createInitialLayerState(), 'boundaries', true);
    const vis = mapLayerStateToRenderVisibility(state, LOD_2);
    expect(vis.alarms).toBe(true);
  });

  it('results-overlay=ON → wszystkie 3 results-* widoczne', () => {
    const state = setLayerVisibility(createInitialLayerState(), 'results-overlay', true);
    const vis = mapLayerStateToRenderVisibility(state, LOD_2);
    expect(vis['results-pf']).toBe(true);
    expect(vis['results-voltage']).toBe(true);
    expect(vis['results-sc']).toBe(true);
  });

  it('OR logic: power-flow=ON sam włącza results-pf nawet gdy results-overlay=OFF', () => {
    let state = setLayerVisibility(createInitialLayerState(), 'results-overlay', false);
    state = setLayerVisibility(state, 'power-flow', true);
    const vis = mapLayerStateToRenderVisibility(state, LOD_2);
    expect(vis['results-pf']).toBe(true);
  });

  it('AND-like negation: power-flow=OFF + results-overlay=OFF + fault-flow=OFF → wszystkie results-* niewidoczne', () => {
    let state = setLayerVisibility(createInitialLayerState(), 'results-overlay', false);
    state = setLayerVisibility(state, 'power-flow', false);
    state = setLayerVisibility(state, 'fault-flow', false);
    const vis = mapLayerStateToRenderVisibility(state, LOD_2);
    expect(vis['results-pf']).toBe(false);
    expect(vis['results-voltage']).toBe(false);
    expect(vis['results-sc']).toBe(false);
  });

  it('control=ON i power=OFF → equipment=ON (OR logic)', () => {
    let state = setLayerVisibility(createInitialLayerState(), 'power', false);
    state = setLayerVisibility(state, 'control', true);
    const vis = mapLayerStateToRenderVisibility(state, LOD_2);
    expect(vis.equipment).toBe(true);
  });
});
