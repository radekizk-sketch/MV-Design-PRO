/**
 * SLD AUTO-LAYOUT — Constants
 *
 * Stałe konfiguracyjne dla deterministycznego auto-layoutu wyprowadzeń z szyny.
 *
 * DETERMINIZM: Wszystkie stałe są deterministyczne i niezmienne w runtime.
 *
 * PARAMETRY (łatwe do strojenia):
 * - M: margines od krawędzi szyny (minimum clearance)
 * - Smin: minimalny odstęp między anchorami
 * - stubLen: długość odcinka prostopadłego (stub)
 * - lanePitch: odstęp między równoległymi lane'ami
 * - gapElbow: minimalny odstęp przy łuku (elbow)
 *
 * CANONICAL ALIGNMENT:
 * - sldCanonicalStyle.ts: CANONICAL_GEOMETRY tokens
 * - CANONICAL software visual standards
 */

import { CANONICAL_GEOMETRY } from '../sldCanonicalStyle';

// =============================================================================
// ANCHOR LAYOUT CONSTANTS
// =============================================================================

/**
 * Calculate margin M based on busbar thickness.
 * M = max(12, 2 * thickness)
 *
 * Margines zapewnia, że anchory nie są zbyt blisko krawędzi szyny.
 *
 * @param thickness - Busbar thickness in pixels
 * @returns Margin M in pixels
 */
export function calculateMargin(thickness: number): number {
  return Math.max(12, 2 * thickness);
}

/**
 * Calculate minimum spacing Smin based on busbar thickness.
 * Smin = max(18, 3 * thickness)
 *
 * Minimalny odstęp zapewnia czytelność i unika nakładania się linii.
 *
 * @param thickness - Busbar thickness in pixels
 * @returns Minimum spacing Smin in pixels
 */
export function calculateMinSpacing(thickness: number): number {
  return Math.max(18, 3 * thickness);
}

/**
 * Calculate stub length based on busbar thickness.
 * stubLen = max(10, 2 * thickness)
 *
 * Stub to odcinek prostopadły do szyny, wychodzący z anchora.
 *
 * @param thickness - Busbar thickness in pixels
 * @returns Stub length in pixels
 */
export function calculateStubLength(thickness: number): number {
  return Math.max(10, 2 * thickness);
}

// =============================================================================
// LANE ROUTING CONSTANTS
// =============================================================================

/**
 * Default lane pitch (spacing between parallel lanes).
 * Wartość domyślna: 16px
 *
 * Lane pitch może być dostrojony w zależności od gęstości połączeń.
 */
export const DEFAULT_LANE_PITCH = 16;

/**
 * Calculate lane pitch based on busbar thickness (alternative formula).
 * lanePitch = max(16, 3 * thickness)
 *
 * @param thickness - Busbar thickness in pixels
 * @returns Lane pitch in pixels
 */
export function calculateLanePitch(thickness: number): number {
  return Math.max(DEFAULT_LANE_PITCH, 3 * thickness);
}

/**
 * Gap at elbow (minimum clearance at 90° turn).
 * Wartość stała: 4px
 */
export const GAP_ELBOW = 4;

// =============================================================================
// GRID SNAPPING
// =============================================================================

/**
 * Grid size for snapping (from CANONICAL_GEOMETRY).
 * All positions should snap to this grid for consistency.
 */
export const GRID_SIZE = CANONICAL_GEOMETRY.layout.gridSize;

/**
 * Snap a value to grid.
 *
 * @param value - Value to snap
 * @param gridSize - Grid size (default: GRID_SIZE)
 * @returns Snapped value
 */
export function snapToGrid(value: number, gridSize: number = GRID_SIZE): number {
  return Math.round(value / gridSize) * gridSize;
}

// =============================================================================
// DIRECTION MULTIPLIERS
// =============================================================================

/**
 * Direction multiplier for feeder exit side.
 *
 * TOP/LEFT: -1 (negative direction)
 * BOTTOM/RIGHT: +1 (positive direction)
 */
export const SIDE_DIRECTION: Record<'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT', -1 | 1> = {
  TOP: -1,
  BOTTOM: 1,
  LEFT: -1,
  RIGHT: 1,
} as const;

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

/**
 * Default auto-layout configuration.
 *
 * Te wartości są używane gdy brak overrides w opcjach.
 * Oparte na CANONICAL_GEOMETRY tokens.
 */
export const DEFAULT_AUTO_LAYOUT_CONFIG = {
  /**
   * Default busbar thickness (używany do obliczeń M, Smin, stubLen).
   * Wartość z CANONICAL_GEOMETRY.busbar.height.
   */
  defaultThickness: CANONICAL_GEOMETRY.busbar.height,

  /**
   * Default margin M (calculated from default thickness).
   */
  defaultMargin: calculateMargin(CANONICAL_GEOMETRY.busbar.height),

  /**
   * Default minimum spacing Smin (calculated from default thickness).
   */
  defaultMinSpacing: calculateMinSpacing(CANONICAL_GEOMETRY.busbar.height),

  /**
   * Default stub length (calculated from default thickness).
   */
  defaultStubLength: calculateStubLength(CANONICAL_GEOMETRY.busbar.height),

  /**
   * Default lane pitch.
   */
  defaultLanePitch: DEFAULT_LANE_PITCH,

  /**
   * Grid size for snapping.
   */
  gridSize: GRID_SIZE,

  /**
   * Gap at elbow.
   */
  gapElbow: GAP_ELBOW,
} as const;

// =============================================================================
// FEATURE FLAG — REMOVED (SLD_AUTOLAYOUT_AUDIT_I_NAPRAWA.md)
// =============================================================================

/**
 * Auto-layout V1 is ALWAYS ON.
 *
 * Per SLD_AUTOLAYOUT_AUDIT_I_NAPRAWA.md:
 * - Feature flag V1 → REMOVED, routing ALWAYS ON
 * - Busbar feeder paths are ALWAYS computed (no feature flag check)
 *
 * These functions are kept for backward compatibility but always return true/no-op.
 */

/**
 * Always returns true — auto-layout V1 is permanently enabled.
 * @deprecated Feature flag removed. Auto-layout is always on.
 */
export function isAutoLayoutV1Enabled(): boolean {
  return true;
}

/**
 * No-op — auto-layout V1 is permanently enabled.
 * @deprecated Feature flag removed. Auto-layout is always on.
 */
export function enableAutoLayoutV1(): void {
  // No-op: always enabled
}

/**
 * No-op — auto-layout V1 is permanently enabled.
 * @deprecated Feature flag removed. Auto-layout is always on.
 */
export function disableAutoLayoutV1(): void {
  // No-op: always enabled
}

// =============================================================================
// VALIDATION LIMITS
// =============================================================================

/**
 * Maximum number of feeders per busbar for layout.
 * Beyond this limit, layout may degrade but will still work.
 */
export const MAX_FEEDERS_PER_BUSBAR = 100;

/**
 * Minimum busbar length for layout (pixels).
 * Below this, layout is not meaningful.
 */
export const MIN_BUSBAR_LENGTH = 20;

/**
 * Compression threshold.
 * If available space / required space < threshold, compression is needed.
 */
export const COMPRESSION_THRESHOLD = 1.0;
