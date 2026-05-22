/**
 * SLD Layer Toggle State — P0.6 F3 foundation (13 layers per SLD_INDUSTRIAL_SPEC § 5.2).
 *
 * STATUS: PURE FUNCTIONS + immutable state (no React dependency)
 * Reference:
 * - docs/sld/SLD_INDUSTRIAL_SPEC_v1.md § 5.2 (13 warstw toggle'owalnych)
 * - docs/sld/SLD_VISUAL_ACCEPTANCE_CRITERIA.md AC-08 (LOD wzmacnia znaczenie)
 *
 * Pure module zarządzający stanem włączenia/wyłączenia 13 warstw SLD overlays
 * + ich domyślne wartości per LOD level.
 *
 * Per SLD_INDUSTRIAL_SPEC_v1 § 5.2:
 *   1. power, 2. control, 3. protection, 4. metering, 5. annotations,
 *   6. dimensions, 7. results-overlay, 8. fault-flow, 9. power-flow,
 *   10. grid, 11. ports (debug), 12. boundaries, 13. legend
 *
 * INVARIANTS:
 * - PURE functions (zero side effects, no DOM, no React)
 * - DETERMINISTIC (same input → identical output)
 * - IMMUTABLE state — każda zmiana zwraca NOWY LayerState
 */

import type { LodLevel } from './LodPolicy';

// ---------------------------------------------------------------------------
// Layer identifiers — 13 layers per SLD_INDUSTRIAL_SPEC § 5.2
// ---------------------------------------------------------------------------

export const LAYER_IDS = [
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
  'spine',
] as const;

export type LayerId = (typeof LAYER_IDS)[number];

/**
 * Polish display labels per warstwa.
 */
export const LAYER_LABELS_PL: Readonly<Record<LayerId, string>> = {
  power: 'Obwód mocy',
  control: 'Obwody pomocnicze',
  protection: 'Zabezpieczenia',
  metering: 'Pomiary',
  annotations: 'Etykiety',
  dimensions: 'Wymiary',
  'results-overlay': 'Wyniki obliczeń',
  'fault-flow': 'Prądy zwarcia',
  'power-flow': 'Przepływ mocy',
  grid: 'Siatka',
  ports: 'Porty (debug)',
  boundaries: 'Granice stref',
  legend: 'Legenda',
  spine: 'Ciąg SN (preview)',
};

/**
 * Default per-layer visibility per LOD level.
 *
 * Strategia:
 * - power, annotations, legend: ZAWSZE widoczne (critical layers)
 * - results-overlay, fault-flow, power-flow: widoczne od LOD-2 (standard+)
 * - control, dimensions, metering: widoczne od LOD-2
 * - protection: widoczne od LOD-2 (standard)
 * - boundaries: widoczne od LOD-3 (technical)
 * - grid: TYLKO LOD-4 (diagnostic — kontrastuje z render)
 * - ports (debug): TYLKO LOD-4 (diagnostic)
 */
const DEFAULT_LAYER_LOD: Readonly<Record<LayerId, LodLevel>> = {
  power: 0,
  control: 2,
  protection: 2,
  metering: 2,
  annotations: 0,
  dimensions: 2,
  'results-overlay': 2,
  'fault-flow': 2,
  'power-flow': 2,
  grid: 4,
  ports: 4,
  boundaries: 3,
  legend: 0,
  // Spine = opt-in preview overlay, domyślnie OFF (state.overrides = false)
  // ale gdy włączony, widoczny od LOD 0 (overview - schematyczne ciągi).
  spine: 0,
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/**
 * Immutable per-layer toggle state.
 *
 * `null` = use LOD-aware default (computed from LOD level)
 * `true` = explicitly visible (override LOD default)
 * `false` = explicitly hidden (override LOD default)
 */
export type LayerOverride = boolean | null;

export interface LayerState {
  /** Per-layer explicit overrides. `null` = use LOD default. */
  readonly overrides: Readonly<Record<LayerId, LayerOverride>>;
}

/**
 * Create initial state — większość warstw używa LOD defaults (null = no override).
 *
 * Wyjątek: spine (preview overlay) ma jawny explicit `false` - domyślnie OFF
 * niezależnie od LOD. Użytkownik musi go świadomie włączyć w LayerTogglePanel.
 */
export function createInitialLayerState(): LayerState {
  const overrides = {} as Record<LayerId, LayerOverride>;
  for (const id of LAYER_IDS) {
    overrides[id] = id === 'spine' ? false : null;
  }
  return { overrides };
}

/**
 * Toggle a single layer.
 *
 * Returns new state (immutable). If override is currently null (LOD default),
 * sets to opposite of current effective visibility at given LOD.
 */
export function toggleLayer(
  state: LayerState,
  layerId: LayerId,
  currentLod: LodLevel,
): LayerState {
  const currentOverride = state.overrides[layerId];
  // Determine current effective visibility
  const effective =
    currentOverride === null ? isLayerVisibleByDefault(layerId, currentLod) : currentOverride;
  // Flip explicit
  const newOverride: LayerOverride = !effective;
  return {
    overrides: { ...state.overrides, [layerId]: newOverride },
  };
}

/**
 * Set explicit visibility (overriding LOD default).
 */
export function setLayerVisibility(
  state: LayerState,
  layerId: LayerId,
  visible: boolean,
): LayerState {
  return {
    overrides: { ...state.overrides, [layerId]: visible },
  };
}

/**
 * Reset a layer to LOD default (clear explicit override).
 */
export function resetLayerToDefault(state: LayerState, layerId: LayerId): LayerState {
  return {
    overrides: { ...state.overrides, [layerId]: null },
  };
}

/**
 * Reset ALL layers to LOD defaults.
 */
export function resetAllLayers(): LayerState {
  return createInitialLayerState();
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Check whether a layer is visible by LOD default (no override considered).
 */
export function isLayerVisibleByDefault(layerId: LayerId, currentLod: LodLevel): boolean {
  return currentLod >= DEFAULT_LAYER_LOD[layerId];
}

/**
 * Compute effective visibility for a layer at given LOD (considering overrides).
 */
export function isLayerVisible(
  state: LayerState,
  layerId: LayerId,
  currentLod: LodLevel,
): boolean {
  const override = state.overrides[layerId];
  if (override !== null) return override;
  return isLayerVisibleByDefault(layerId, currentLod);
}

/**
 * List all layers and their effective visibility at given LOD.
 *
 * Useful for UI rendering of toggle panel.
 */
export function listLayersWithVisibility(
  state: LayerState,
  currentLod: LodLevel,
): Array<{ id: LayerId; label: string; visible: boolean; overridden: boolean }> {
  return LAYER_IDS.map((id) => ({
    id,
    label: LAYER_LABELS_PL[id],
    visible: isLayerVisible(state, id, currentLod),
    overridden: state.overrides[id] !== null,
  }));
}
